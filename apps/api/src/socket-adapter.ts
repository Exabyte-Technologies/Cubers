import { IoAdapter } from "@nestjs/platform-socket.io";
import type { INestApplicationContext } from "@nestjs/common";
import type { Server, ServerOptions } from "socket.io";
import { Infrastructure } from "./services";
import { allowedOrigin, clientIp } from "./network-security";
import { CommunityRegion } from "./community-region";
import { hash } from "./crypto";

export class ProtectedSocketAdapter extends IoAdapter {
  private pendingTransports = 0;
  constructor(
    app: INestApplicationContext,
    private infra: Infrastructure,
    private communityRegion: CommunityRegion = new CommunityRegion(
      infra.config,
    ),
  ) {
    super(app);
  }
  createIOServer(port: number, options?: ServerOptions): Server {
    let server: Server;
    const c = this.infra.config;
    server = super.createIOServer(port, {
      ...options,
      // This runs before the Engine.IO transport is allocated, including for
      // clients that never attempt an authenticated Socket.IO namespace join.
      allowRequest: (
        request: import("node:http").IncomingMessage,
        done: (message: string | null, success: boolean) => void,
      ) => {
        if (
          !allowedOrigin(request.headers.origin, [
            c.APP_ORIGIN,
            c.ADMIN_ORIGIN,
          ]) ||
          (server?.engine?.clientsCount || 0) + this.pendingTransports >= 2000
        )
          return done("Connection not allowed", false);
        let ip: string;
        try {
          ip = clientIp(request, c.TRUSTED_PROXY_CIDRS);
        } catch {
          return done("Connection not allowed", false);
        }
        this.pendingTransports++;
        let completed = false;
        const complete = (message: string | null, ok: boolean) => {
          if (completed) return;
          completed = true;
          try {
            done(message, ok);
          } finally {
            setImmediate(() => this.pendingTransports--);
          }
        };
        void this.infra
          .limit(`ws-transport:${hash(ip)}`, 1000, 60)
          .then(async (ok) => {
            if (ok) await this.communityRegion.requireMatchingConnection(ip);
            complete(ok ? null : "Connection limit exceeded", ok);
          })
          .catch(() => complete("Connection unavailable", false));
      },
    });
    return server;
  }
}
