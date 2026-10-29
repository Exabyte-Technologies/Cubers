import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PlayController } from "../apps/api/src/play.controller";
import type { Db, Infrastructure } from "../apps/api/src/services";
import type { Competitions } from "../apps/api/src/competitions";
import type { SmartPlayAccess } from "../apps/api/src/smart-play-access";
import type { Authed } from "../apps/api/src/security";

test("verification primitives cannot activate production ranking for any input or community", async () => {
  let databaseCalls = 0;
  const db = new Proxy(
    {},
    {
      get() {
        databaseCalls++;
        throw new Error("Ranking reached persistence before acceptance");
      },
    },
  ) as Db;
  for (const region of ["INTL", "CN"] as const) {
    const infra = {
      config: {
        NODE_ENV: "production",
        REGION: region,
        CN_GAMES_APPROVED: "true",
      },
    } as Infrastructure;
    const actor = {
      user: { id: "synthetic-actor" },
      policy: {
        region,
        age: 30,
        guardianVerified: true,
        postingConsent: true,
        recordingConsent: true,
        adultVerified: true,
        identityVerified: true,
      },
    } as Authed;
    const controller = new PlayController(
      db,
      infra,
      {} as Competitions,
      { room() {} } as SmartPlayAccess,
    );
    for (const input of ["virtual", "scan", "smart"])
      await assert.rejects(
        () =>
          controller.create(actor, {
            puzzle: "3x3",
            input,
            mode: "race",
            ranked: true,
            private: true,
          }),
        (e: any) => e.getStatus?.() === 403 && /attestation/.test(e.message),
      );
  }
  assert.equal(databaseCalls, 0);
});
