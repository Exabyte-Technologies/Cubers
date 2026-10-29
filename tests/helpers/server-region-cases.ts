import { test } from "node:test";
import assert from "node:assert/strict";
import { Controller, Get, Post, Inject, Req, Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { io } from "socket.io-client";
import { AuthController } from "../../apps/api/src/auth.controller";
import { Connections } from "../../apps/api/src/connections";
import { Profiles } from "../../apps/api/src/profiles";
import { CommunityRegion } from "../../apps/api/src/community-region";
import { Db, Infrastructure } from "../../apps/api/src/services";
import { Security, Public, type Authed } from "../../apps/api/src/security";
import { proxyTrust } from "../../apps/api/src/network-security";
import { ProtectedSocketAdapter } from "../../apps/api/src/socket-adapter";
import { PlayGateway } from "../../apps/api/src/gateway";
import { PlayController } from "../../apps/api/src/play.controller";
let accountHandlers = 0;
class RegionProbe {
  constructor(private region: CommunityRegion) {}
  detect(req: Authed) {
    return this.region.detect(req.ip);
  }
  health() {
    return { ok: true };
  }
  privacy() {
    return { public: true };
  }
  courses() {
    accountHandlers++;
    return [];
  }
  admin() {
    accountHandlers++;
    return { unexpected: true };
  }
}
Controller("v1")(RegionProbe);
Inject(CommunityRegion)(RegionProbe, undefined, 0);
for (const [name, path, verb, isPublic] of [
  ["detect", "community-region", "GET", true],
  ["health", "health", "GET", true],
  ["privacy", "legal/privacy", "GET", true],
  ["courses", "courses", "GET", false],
  ["admin", "admin/probe", "GET", false],
] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(
    RegionProbe.prototype,
    name,
  )!;
  (verb === "GET" ? Get(path) : Post(path))(
    RegionProbe.prototype,
    name,
    descriptor,
  );
  if (isPublic) Public()(RegionProbe.prototype, name, descriptor);
}
Req()(RegionProbe.prototype, "detect", 0);

type Harness = {
  db: Db;
  fixture: (
    name: string,
    birthDate: string,
  ) => Promise<{ u: { id: string }; token: string }>;
  infrastructure: () => Infrastructure;
};
export function registerServerRegionCases(h: Harness) {
  test("production HTTP and realtime enforce server-observed country for both regions before account handlers, including restored sessions", async () => {
    for (const region of ["INTL", "CN"] as const) {
      const owner = await h.fixture(
        "region-enforcement-" + region.toLowerCase(),
        "1990-01-01",
      );
      if (region === "CN")
        await h.db.user.update({ where: { id: owner.u.id }, data: { region } });
      let changed = false;
      const config = {
        ...h.infrastructure().config,
        NODE_ENV: "production" as const,
        REGION: region,
        TRUSTED_PROXY_CIDRS: "127.0.0.1/32,::1/128",
      };
      const service = new CommunityRegion(config, {
        country: async (ip) => {
          if (ip === "1.1.1.1") throw Error("vendor unavailable");
          return changed
            ? "CN"
            : ip.startsWith("114.") || ip.includes(":")
              ? "CN"
              : "US";
        },
      });
      const infra = Object.assign(Object.create(h.infrastructure()), {
        config: { ...config, NODE_ENV: "test" },
        onApplicationShutdown: async () => {},
      });
      const metadata = {
        controllers: [RegionProbe, AuthController],
        providers: [
          { provide: Db, useValue: h.db },
          { provide: Infrastructure, useValue: infra },
          { provide: CommunityRegion, useValue: service },
          { provide: APP_GUARD, useClass: Security },
          {
            provide: PlayController,
            useValue: { room: async () => ({}), disconnect: async () => {} },
          },
          PlayGateway,
          Connections,
          Profiles,
        ],
      };
      class ProbeModule {}
      Module(metadata)(ProbeModule);
      const app = await NestFactory.create<NestExpressApplication>(
        ProbeModule,
        { logger: false },
      );
      const sockets: ReturnType<typeof io>[] = [];
      try {
        app.set("trust proxy", proxyTrust(config.TRUSTED_PROXY_CIDRS));
        app.useWebSocketAdapter(
          new ProtectedSocketAdapter(app, infra, service),
        );
        app.use((_r: any, res: any, next: any) => {
          res.setHeader("Cache-Control", "private, no-store");
          next();
        });
        await app.listen(0, "127.0.0.1");
        const base = await app.getUrl();
        const ownIp = region === "CN" ? "114.114.114.114" : "8.8.8.8",
          foreignIp = region === "CN" ? "8.8.8.8" : "114.114.114.114";
        for (const ip of [
          "114.114.114.114",
          "2400:3200::1",
          "::ffff:114.114.114.114",
          "8.8.8.8",
        ]) {
          const res = await fetch(base + "/v1/community-region?country=CN", {
            headers: {
              "X-Forwarded-For": ip,
              "CF-IPCountry": "US",
              "X-Country": "US",
            },
          });
          const body = await res.json();
          assert.equal(res.status, 200);
          assert.equal(body.region, ip === "8.8.8.8" ? "INTL" : "CN");
          assert.equal(body.provider, "FreeIPAPI");
          assert.equal(JSON.stringify(body).includes(ip), false);
          assert.match(res.headers.get("cache-control") || "", /no-store/);
        }
        const headers = {
          Authorization: "Bearer " + owner.token,
          "X-Forwarded-For": ownIp,
        };
        assert.equal((await fetch(base + "/v1/me", { headers })).status, 200);
        const before = accountHandlers;
        for (const [method, path] of [
          ["GET", "me"],
          ["GET", "courses"],
          ["GET", "admin/probe"],
          ["POST", "auth/register"],
          ["POST", "auth/login"],
        ]) {
          const res = await fetch(base + "/v1/" + path, {
            method,
            headers: {
              ...headers,
              "X-Forwarded-For": foreignIp,
              "CF-IPCountry": region === "CN" ? "CN" : "US",
              "X-Region": region,
              "Content-Type": "application/json",
            },
            ...(method === "POST" ? { body: JSON.stringify({ region }) } : {}),
          });
          assert.equal(res.status, 409, path);
          assert.equal((await res.json()).code, "COMMUNITY_CHANGED");
        }
        assert.equal(
          accountHandlers,
          before,
          "wrong-region requests reached account handlers",
        );
        assert.equal(
          (
            await fetch(base + "/v1/me", {
              headers: { ...headers, "X-Forwarded-For": "1.1.1.1" },
            })
          ).status,
          503,
        );
        assert.equal(
          (
            await fetch(base + "/v1/me", {
              headers: { ...headers, "X-Forwarded-For": "127.0.0.1" },
            })
          ).status,
          503,
        );
        for (const path of ["health", "legal/privacy"])
          assert.equal(
            (
              await fetch(base + "/v1/" + path, {
                headers: { "X-Forwarded-For": foreignIp },
              })
            ).status,
            200,
          );
        function socket(ip: string) {
          const s = io(base + "/play", {
            transports: ["websocket"],
            auth: { token: owner.token },
            extraHeaders: { "X-Forwarded-For": ip },
            reconnection: false,
            timeout: 3000,
          });
          sockets.push(s);
          return s;
        }
        const foreign = socket(foreignIp);
        const denied = await new Promise<boolean>((resolve) => {
          foreign.once("connect", () => resolve(false));
          foreign.once("connect_error", () => resolve(true));
        });
        assert.equal(denied, true);
        foreign.disconnect();
        const own = socket(ownIp);
        await new Promise<void>((resolve, reject) => {
          own.once("connect", resolve);
          own.once("connect_error", reject);
        });
        // The international socket loses access if its connection classification changes.
        if (region === "INTL") {
          changed = true;
          const ack = await new Promise<any>((resolve, reject) =>
            own
              .timeout(3000)
              .emit(
                "room.join",
                { roomId: "00000000-0000-4000-8000-000000000001" },
                (err: any, result: any) =>
                  err ? reject(err) : resolve(result),
              ),
          );
          assert.equal(ack.ok, false);
        }
        own.disconnect();
        // Removing trust means a direct caller cannot choose an IP with forwarded headers.
        changed = false;
        app.set("trust proxy", false);
        assert.equal((await fetch(base + "/v1/me", { headers })).status, 503);
        app.set("trust proxy", proxyTrust(config.TRUSTED_PROXY_CIDRS));
        const deletion = await fetch(base + "/v1/auth/deletion-login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": foreignIp,
          },
          body: JSON.stringify({
            email: (
              await h.db.user.findUniqueOrThrow({ where: { id: owner.u.id } })
            ).email,
            password: "test-password-not-production",
          }),
        });
        assert.equal(
          deletion.status,
          201,
          JSON.stringify({ region, body: await deletion.clone().json() }),
        );
        const restricted = await deletion.json();
        const erasureHeaders = {
          "Content-Type": "application/json",
          "X-Forwarded-For": foreignIp,
          Authorization: "Bearer " + restricted.token,
        };
        assert.equal(
          (await fetch(base + "/v1/me/export", { headers: erasureHeaders }))
            .status,
          403,
        );
        assert.equal(
          (
            await fetch(base + "/v1/me", {
              method: "DELETE",
              headers: erasureHeaders,
              body: JSON.stringify({ confirmation: "DELETE" }),
            })
          ).status,
          200,
        );
      } finally {
        for (const s of sockets) s.disconnect();
        await app.close();
      }
    }
  });
}
