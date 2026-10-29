import { Inject, Optional, OnModuleDestroy } from "@nestjs/common";
import {
  WebSocketGateway,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  WebSocketServer,
  OnGatewayDisconnect,
  OnGatewayInit,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { Db, Infrastructure } from "./services";
import { CommunityRegion } from "./community-region";
import { sessionUser, accountPolicy, type Authed } from "./security";
import { PlayController } from "./play.controller";
import { allowedOrigin, clientIp } from "./network-security";
import { hash } from "./crypto";
@WebSocketGateway({
  namespace: "/play",
  cors: { origin: false },
  maxHttpBufferSize: 65536,
  connectTimeout: 10000,
  pingTimeout: 10000,
  perMessageDeflate: false,
  httpCompression: false,
})
export class PlayGateway
  implements OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy
{
  @WebSocketServer() server!: Server;
  private stopping = false;
  private pending = new Set<Promise<unknown>>();
  private sockets = new Set<Socket>();
  private track<T>(promise: Promise<T>) {
    this.pending.add(promise);
    void promise.then(
      () => this.pending.delete(promise),
      () => this.pending.delete(promise),
    );
    return promise;
  }
  private work<T>(
    action: () => Promise<T>,
  ): Promise<T | { ok: false; error: string }> {
    if (this.stopping)
      return Promise.resolve({ ok: false, error: "Play is stopping" });
    return this.track(action());
  }
  async onModuleDestroy() {
    this.stopping = true;
    this.infra.playIntegrityUnavailable = true;
    for (const socket of this.sockets) clearInterval(socket.data.leaseTimer);
    this.server?.disconnectSockets(true);
    // Socket disconnect handlers persist interruption and release leases. Drain
    // them while PostgreSQL/Redis are still available; those close in the later
    // onApplicationShutdown phase, after Nest has stopped accepting connections.
    await new Promise<void>((resolve) => setImmediate(resolve));
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(PlayController) private play: PlayController,
    @Optional()
    @Inject(CommunityRegion)
    private communityRegion: CommunityRegion = new CommunityRegion(
      infra.config,
    ),
  ) {}
  afterInit(server: Server) {
    server.use((socket, next) => {
      void this.track(
        (async () => {
          try {
            if (
              !allowedOrigin(socket.handshake.headers.origin, [
                this.infra.config.APP_ORIGIN,
                this.infra.config.ADMIN_ORIGIN,
              ])
            )
              throw new Error();
            socket.data.clientIp = clientIp(
              socket.request,
              this.infra.config.TRUSTED_PROXY_CIDRS,
            );
            if (
              !(await this.infra.limit(
                `ws-connect:${hash(socket.data.clientIp)}`,
                600,
                60,
              ))
            )
              throw new Error();
            const r = await this.context(socket);
            // Redis leases bound sockets per account across API processes. Failed
            // handshakes expire automatically; disconnect removes its own lease.
            const lease = `ws-connections:${r.user.id}`;
            const now = Date.now();
            const accepted = await this.infra.redis.eval(
              `
          redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
          if redis.call('ZCARD', KEYS[1]) >= 4 then return 0 end
          redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
          redis.call('EXPIRE', KEYS[1], 100)
          return 1`,
              1,
              lease,
              now,
              now + 90000,
              socket.id,
            );
            if (accepted !== 1) throw new Error();
            socket.data.connectionLease = lease;
            socket.data.leaseTimer = setInterval(() => {
              if (this.stopping) return;
              void this.track(
                sessionUser(this.db, socket.handshake.auth.token)
                  .then(async () => {
                    await this.communityRegion.requireMatchingConnection(
                      socket.data.clientIp,
                    );
                    if (this.stopping || socket.conn.readyState !== "open")
                      return;
                    return this.infra.redis
                      .multi()
                      .zadd(lease, Date.now() + 90000, socket.id)
                      .expire(lease, 100)
                      .exec();
                  })
                  .catch(() => socket.disconnect(true)),
              );
            }, 30000);
            socket.conn.once("close", () => {
              clearInterval(socket.data.leaseTimer);
              this.sockets.delete(socket);
              void this.track(
                this.infra.redis.zrem(lease, socket.id).catch(() => {}),
              );
            });
            if (socket.conn.readyState !== "open" || this.stopping)
              throw new Error();
            socket.data.userId = r.user.id;
            this.sockets.add(socket);
            next();
          } catch {
            clearInterval(socket.data.leaseTimer);
            this.sockets.delete(socket);
            if (socket.data.connectionLease)
              await this.infra.redis
                .zrem(socket.data.connectionLease, socket.id)
                .catch(() => {});
            next(new Error("Connection not authorized"));
          }
        })(),
      );
    });
  }
  private async context(socket: Socket) {
    await this.communityRegion.requireMatchingConnection(
      socket.data.clientIp || socket.handshake.address,
    );
    if (this.stopping) throw new Error("Play is stopping");
    if (
      !(await this.infra.limit(
        `ws-ip:${hash(socket.data.clientIp || socket.handshake.address)}`,
        60000,
        60,
      ))
    )
      throw new Error("Realtime rate limit exceeded");
    const session = await sessionUser(this.db, socket.handshake.auth.token);
    if (!(await this.infra.limit(`ws-user:${session.user.id}`, 1200, 60)))
      throw new Error("Realtime rate limit exceeded");
    if (session.user.region !== this.infra.config.REGION)
      throw new Error("Wrong region");
    const policy = await accountPolicy(this.db, session.user);
    if (this.stopping) throw new Error("Play is stopping");
    return {
      user: session.user,
      sessionId: session.id,
      policy,
    } as Authed;
  }
  @SubscribeMessage("room.join") async join(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ) {
    return this.work(async () => {
      try {
        const { roomId } = z.object({ roomId: z.string().uuid() }).parse(body),
          r = await this.context(socket);
        await this.play.room(r, roomId);
        await socket.join(roomId);
        socket.data.userId = r.user.id;
        socket.data.roomId = roomId;
        socket.emit("room.state", await this.play.room(r, roomId));
        return { ok: true };
      } catch {
        return { ok: false, error: "Unauthorized room subscription" };
      }
    });
  }
  @SubscribeMessage("room.refresh") async refresh(
    @ConnectedSocket() socket: Socket,
  ) {
    return this.work(async () => {
      try {
        const r = await this.context(socket);
        const roomId = socket.data.roomId;
        if (!roomId) throw new Error();
        const state = await this.play.room(r, roomId);
        // Revalidate every delivery; a logged-out socket must not receive peer refreshes.
        socket.emit("room.state", state);
        return { ok: true };
      } catch {
        return { ok: false, error: "Session or membership expired" };
      }
    });
  }
  @SubscribeMessage("attempt.moves") async moves(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ) {
    return this.work(async () => {
      try {
        const b = z
          .object({
            attemptId: z.string().uuid(),
            nonce: z.string(),
            events: z.array(z.unknown()).min(1).max(100),
          })
          .parse(body);
        const r = await this.context(socket);
        const result = await this.play.moves(r, b.attemptId, {
          nonce: b.nonce,
          events: b.events,
        });
        return { ok: true, ...result };
      } catch {
        return { ok: false, error: "Move stream rejected" };
      }
    });
  }
  async handleDisconnect(socket: Socket) {
    return this.track(
      (async () => {
        clearInterval(socket.data.leaseTimer);
        this.sockets.delete(socket);
        if (socket.data.connectionLease)
          await this.infra.redis
            .zrem(socket.data.connectionLease, socket.id)
            .catch(() => {});
        if (socket.data.userId && socket.data.roomId)
          await this.play
            .disconnect(socket.data.userId, socket.data.roomId)
            .catch(() => {
              this.infra.playIntegrityUnavailable = true;
              console.error(
                "Play paused: interruption persistence failed; restart reconciliation is required",
              );
            });
      })(),
    );
  }
}
