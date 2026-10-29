import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { withAppAttestationHttp } from "./app-attestation-http";
import { Db, Infrastructure } from "../../apps/api/src/services";
import type { Authed } from "../../apps/api/src/security";
import { hash, opaque } from "../../apps/api/src/crypto";
import { learningWrite } from "../../apps/api/src/learning-authority";
import { Background } from "../../apps/api/src/worker";
import { applyMoves, solvedCube, facelets } from "@cubers/core";
import { AppVerificationClient } from "../../apps/mobile/src/verification/client";
import { PlayVerificationClient } from "../../apps/mobile/src/verification/play-client";

type HttpFixture = Parameters<Parameters<typeof withAppAttestationHttp>[2]>[0];
type Person = { u: { id: string }; token: string };
export type Harness = {
  db: PrismaClient;
  cnDb: PrismaClient;
  infra: () => Infrastructure;
  fixture: (
    name: string,
    birthDate: string,
    role?: "USER" | "ADMIN",
    verified?: boolean,
  ) => Promise<Person>;
  actor: (person: any) => Promise<Authed>;
  call: (
    path: string,
    body?: unknown,
    token?: string,
    method?: string,
    base?: string,
  ) => Promise<{ status: number; body: any }>;
  lockDelay: (
    table: "Room" | "Attempt",
    id: string,
    deadline: number,
    action: () => Promise<unknown>,
  ) => Promise<{ error: any; value: any }>;
};
export async function enroll(f: HttpFixture, person: Person) {
  const challenge = await f.call(
    "/challenges",
    { kind: "enroll", provider: "apple-app-attest", keyId: f.native.keyId },
    person.token,
  );
  assert.equal(challenge.status, 201);
  const proof = f.proof(challenge.body);
  const result = await f.call("/verify", proof, person.token);
  assert.equal(result.status, 201, JSON.stringify(f.errors));
  assert.equal(result.body.rankingEligible, false);
  return { key: result.body.key, challenge: challenge.body, proof };
}
async function attempt(db: PrismaClient, person: Person, input = "virtual") {
  const room = await db.room.create({
    data: {
      code: randomUUID().slice(0, 8),
      ownerId: person.u.id,
      puzzle: "3x3",
      input,
      mode: "race",
      ranked: false,
      private: true,
      status: "ACTIVE",
    },
  });
  await db.roomMember.create({
    data: { roomId: room.id, userId: person.u.id },
  });
  return db.attempt.create({
    data: {
      roomId: room.id,
      userId: person.u.id,
      nonce: opaque(),
      scramble: ["R", "U"],
    },
  });
}
async function actionChallenge(
  f: HttpFixture,
  person: Person,
  keyId: string,
  a: { id: string; nonce: string },
  operation = "inspect",
  body: unknown = { nonce: a.nonce },
) {
  const result = await f.call(
    "/challenges",
    {
      kind: "action",
      provider: "apple-app-attest",
      keyId,
      attemptId: a.id,
      operation,
      body,
    },
    person.token,
  );
  assert.equal(result.status, 201, JSON.stringify(result));
  return result.body;
}
function consume(
  h: Harness,
  f: HttpFixture,
  actor: Authed,
  grantId: string,
  a: { id: string; nonce: string },
  operation = "inspect",
  body: unknown = { nonce: a.nonce },
  rollback = false,
) {
  return learningWrite(
    h.db as Db,
    f.config,
    actor,
    async (tx, until, current) => {
      await f.service.consume(
        tx,
        actor,
        current,
        until,
        grantId,
        a.id,
        operation,
        body,
      );
      if (rollback) throw new Error("Synthetic action failure");
    },
  );
}
const refuses = (work: () => Promise<unknown>, status: number) =>
  assert.rejects(work, (e: any) => e.getStatus?.() === status);

export function registerAppAttestationCases(h: Harness) {
  test("app attestation native client completes enrollment and proof-bound solve routes through authenticated HTTP", async () => {
    const p = await h.fixture("attest-native-http", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const stored = new Map<string, string>();
      let counter = 0;
      const client = new AppVerificationClient(
        {
          supported: () => true,
          generate: async () => f.native.keyId,
          attest: async (_key, clientData) =>
            f.proof({ id: randomUUID(), clientData }).attestation,
          assert: async (_key, clientData) =>
            f.native.assertion(++counter, {
              signingChallenge: Buffer.from(clientData, "utf8"),
            }),
        },
        {
          read: async (k) => stored.get(k) ?? null,
          write: async (k, v) => {
            if (v === null) stored.delete(k);
            else stored.set(k, v);
          },
        },
      );
      client.setContext({
        ownerId: p.u.id,
        region: "INTL",
        token: p.token,
        canLearn: true,
        api: async (path, body, method) => {
          const r = path.startsWith("me/app-attestation")
            ? await f.call(
                path.slice("me/app-attestation".length),
                body,
                p.token,
                method,
              )
            : await f.game(path, body, p.token);
          if (r.status >= 400)
            throw Object.assign(Error("Synthetic HTTP request refused"), {
              status: r.status,
            });
          return r.body;
        },
      });
      const id = await client.enroll(),
        a = await attempt(h.db, p);
      await client.perform(a.id, "inspect", { nonce: a.nonce });
      await client.perform(a.id, "start", { nonce: a.nonce });
      assert.equal(
        (
          await f.game(
            `attempts/${a.id}/moves`,
            {
              nonce: a.nonce,
              events: [
                { move: "U'", sequence: 0, elapsedMs: 0 },
                { move: "R'", sequence: 1, elapsedMs: 1 },
              ],
            },
            p.token,
          )
        ).status,
        201,
      );
      await new Promise((r) => setTimeout(r, 320));
      assert.equal(
        (await client.perform(a.id, "finish", { nonce: a.nonce })).status,
        "APPROVED",
      );
      assert.equal(
        (await h.db.appAttestationKey.findUniqueOrThrow({ where: { id } }))
          .counter,
        3n,
      );
      assert.equal(
        await h.db.appAttestationGrant.count({
          where: { attemptId: a.id, consumedAt: { not: null } },
        }),
        3,
      );
      const saved = [...stored.values()].join("");
      assert.equal(saved.includes("attestation"), false);
      assert.equal(saved.includes("receipt"), false);
      assert.equal(saved.includes(p.token), false);
      await client.revoke(id, 3);
      assert.equal(stored.size, 0);
      assert.equal(
        (await h.db.appAttestationKey.findUniqueOrThrow({ where: { id } }))
          .receiptCiphertext,
        null,
      );
      assert.deepEqual(f.errors, []);
    });
  });
  test("app attestation grants drive real virtual inspection, start and solved finish routes", async () => {
    const p = await h.fixture("attest-virtual-routes", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p),
        a = await attempt(h.db, p);
      let counter = 0;
      const proof = async (
        operation: string,
        body: Record<string, unknown> = { nonce: a.nonce },
      ) => {
        const c = await actionChallenge(f, p, key.id, a, operation, body),
          result = await f.call("/verify", f.assertion(c, ++counter), p.token);
        assert.equal(result.status, 201, JSON.stringify(f.errors));
        return result.body.grantId as string;
      };
      const inspectId = await proof("inspect");
      assert.equal(
        (
          await f.game(
            `attempts/${a.id}/inspect`,
            { nonce: a.nonce, appProofId: randomUUID() },
            p.token,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await f.game(
            `attempts/${a.id}/inspect`,
            { nonce: a.nonce, appProofId: inspectId },
            p.token,
          )
        ).status,
        201,
      );
      assert.ok(
        (
          await h.db.appAttestationGrant.findUniqueOrThrow({
            where: { id: inspectId },
          })
        ).consumedAt,
      );
      const startBody = { nonce: a.nonce, recordingStarted: false },
        startId = await proof("start", startBody);
      assert.equal(
        (
          await f.game(
            `attempts/${a.id}/start`,
            { nonce: a.nonce, appProofId: startId },
            p.token,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await h.db.appAttestationGrant.findUniqueOrThrow({
            where: { id: startId },
          })
        ).consumedAt,
        null,
      );
      assert.equal(
        (
          await f.game(
            `attempts/${a.id}/start`,
            { ...startBody, appProofId: startId },
            p.token,
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await f.game(
            `attempts/${a.id}/moves`,
            {
              nonce: a.nonce,
              events: [
                { move: "U'", sequence: 0, elapsedMs: 0 },
                { move: "R'", sequence: 1, elapsedMs: 1 },
              ],
            },
            p.token,
          )
        ).status,
        201,
      );
      await new Promise((r) => setTimeout(r, 320));
      const finishId = await proof("finish");
      const result = await f.game(
        `attempts/${a.id}/finish`,
        { nonce: a.nonce, appProofId: finishId },
        p.token,
      );
      assert.equal(result.status, 201, JSON.stringify(f.errors));
      assert.equal(result.body.status, "APPROVED");
      const saved = await h.db.attempt.findUniqueOrThrow({
        where: { id: a.id },
      });
      assert.equal(saved.status, "APPROVED");
      assert.equal((saved.moves as any[]).length, 2);
      assert.equal(
        await h.db.appAttestationGrant.count({
          where: { attemptId: a.id, consumedAt: { not: null } },
        }),
        3,
      );
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation physical routes bind recordings and evidence and roll back grants when recording is already started", async () => {
    const p = await h.fixture("attest-physical-routes", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p),
        a = await attempt(h.db, p, "scan");
      await h.db.room.update({
        where: { id: a.roomId },
        data: { ranked: true },
      });
      let counter = 0;
      const proof = async (
        operation: string,
        body: Record<string, unknown> = { nonce: a.nonce },
      ) => {
        const c = await actionChallenge(f, p, key.id, a, operation, body),
          r = await f.call("/verify", f.assertion(c, ++counter), p.token);
        assert.equal(r.status, 201, JSON.stringify(f.errors));
        return r.body.grantId as string;
      };
      const recordId = await proof("record");
      assert.equal(
        (
          await f.game(
            `attempts/${a.id}/record`,
            { nonce: a.nonce, appProofId: recordId },
            p.token,
          )
        ).status,
        201,
      );
      const duplicateRecord = await proof("record");
      assert.equal(
        (
          await f.game(
            `attempts/${a.id}/record`,
            { nonce: a.nonce, appProofId: duplicateRecord },
            p.token,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await h.db.appAttestationGrant.findUniqueOrThrow({
            where: { id: duplicateRecord },
          })
        ).consumedAt,
        null,
      );
      assert.equal(
        (
          await f.game(
            `attempts/${a.id}/checkpoint`,
            {
              nonce: a.nonce,
              stage: "scramble",
              faces: facelets(applyMoves(solvedCube(), a.scramble)),
            },
            p.token,
          )
        ).status,
        201,
      );
      for (const op of ["inspect", "start"]) {
        const id = await proof(op);
        assert.equal(
          (
            await f.game(
              `attempts/${a.id}/${op}`,
              { nonce: a.nonce, appProofId: id },
              p.token,
            )
          ).status,
          201,
        );
      }
      await new Promise((r) => setTimeout(r, 320));
      const finishId = await proof("finish"),
        finished = await f.game(
          `attempts/${a.id}/finish`,
          { nonce: a.nonce, appProofId: finishId },
          p.token,
        );
      assert.equal(finished.status, 201);
      assert.equal(finished.body.status, "AWAITING_EVIDENCE");
      assert.equal(
        (
          await f.game(
            `attempts/${a.id}/checkpoint`,
            { nonce: a.nonce, stage: "final", faces: facelets(solvedCube()) },
            p.token,
          )
        ).status,
        201,
      );
      const evidence = await h.db.media.create({
        data: {
          userId: p.u.id,
          attemptId: a.id,
          key: `INTL/synthetic-attest/${randomUUID()}`,
          type: "video/mp4",
          purpose: "evidence",
          size: 32,
          status: "READY",
          durationMs: 60000,
        },
      });
      const other = await h.db.media.create({
        data: {
          userId: p.u.id,
          attemptId: a.id,
          key: `INTL/synthetic-attest/${randomUUID()}`,
          type: "video/mp4",
          purpose: "evidence",
          size: 32,
          status: "READY",
          durationMs: 60000,
        },
      });
      const evidenceId = await proof("evidence", {
        nonce: a.nonce,
        evidenceId: evidence.id,
      });
      assert.equal(
        (
          await f.game(
            `attempts/${a.id}/evidence`,
            { nonce: a.nonce, evidenceId: other.id, appProofId: evidenceId },
            p.token,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await h.db.appAttestationGrant.findUniqueOrThrow({
            where: { id: evidenceId },
          })
        ).consumedAt,
        null,
      );
      const accepted = await f.game(
        `attempts/${a.id}/evidence`,
        { nonce: a.nonce, evidenceId: evidence.id, appProofId: evidenceId },
        p.token,
      );
      assert.equal(accepted.status, 201, JSON.stringify(f.errors));
      assert.equal(accepted.body.status, "PROVISIONAL");
      const saved = await h.db.attempt.findUniqueOrThrow({
        where: { id: a.id },
      });
      assert.equal(saved.status, "PROVISIONAL");
      assert.equal(saved.evidenceId, evidence.id);
      assert.equal(
        await h.db.appAttestationGrant.count({
          where: { attemptId: a.id, consumedAt: { not: null } },
        }),
        5,
      );
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation evidence remains submittable after a scheduled round closes without permitting a late solve", async () => {
    const p = await h.fixture("attest-closed-round", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p),
        now = Date.now(),
        event = await h.db.competition.create({
          data: {
            creatorId: p.u.id,
            title: { en: "Synthetic finished round", zh: "合成已结束轮次" },
            description: { en: "Private proof test", zh: "私密证明测试" },
            puzzle: "3x3",
            input: "scan",
            ranked: false,
            capacity: 1,
            status: "PUBLISHED",
            registrationOpensAt: new Date(now - 180000),
            registrationClosesAt: new Date(now - 120000),
            startsAt: new Date(now - 60000),
            endsAt: new Date(now - 1000),
            expiresAt: new Date(now + 86400000),
            rounds: {
              create: [
                {
                  ordinal: 0,
                  title: { en: "Round", zh: "轮次" },
                  format: "BEST3",
                  opensAt: new Date(now - 60000),
                  closesAt: new Date(now - 1000),
                  scrambles: [
                    ["R", "U"],
                    ["R", "U"],
                    ["R", "U"],
                  ],
                },
              ],
            },
          },
          include: { rounds: true },
        }),
        entry = await h.db.competitionEntry.create({
          data: { competitionId: event.id, userId: p.u.id, number: 1 },
        });
      const room = await h.db.room.create({
        data: {
          code: randomUUID(),
          ownerId: p.u.id,
          puzzle: "3x3",
          input: "scan",
          mode: "race",
          ranked: false,
          private: true,
          status: "CLOSED",
          competitionAttempt: true,
          competitionEntryId: entry.id,
          competitionRoundId: event.rounds[0].id,
          competitionIndex: 0,
        },
      });
      await h.db.roomMember.create({
        data: { roomId: room.id, userId: p.u.id },
      });
      const a = await h.db.attempt.create({
        data: {
          roomId: room.id,
          userId: p.u.id,
          nonce: opaque(),
          scramble: ["R", "U"],
          createdAt: new Date(now - 30000),
          status: "AWAITING_EVIDENCE",
          recordingAt: new Date(now - 20000),
          inspectionAt: new Date(now - 15000),
          startedAt: new Date(now - 10000),
          finishedAt: new Date(now - 2000),
          finalScanVerifiedAt: new Date(now - 1500),
          durationMs: 8000,
        },
      });
      const media = await h.db.media.create({
        data: {
          userId: p.u.id,
          attemptId: a.id,
          key: `INTL/synthetic-attest/${randomUUID()}`,
          type: "video/mp4",
          purpose: "evidence",
          size: 32,
          status: "READY",
          durationMs: 20000,
        },
      });
      const c = await actionChallenge(f, p, key.id, a, "evidence", {
          nonce: a.nonce,
          evidenceId: media.id,
        }),
        verified = await f.call("/verify", f.assertion(c, 1), p.token);
      assert.equal(verified.status, 201, JSON.stringify(f.errors));
      assert.equal(
        (
          await f.game(
            `attempts/${a.id}/evidence`,
            {
              nonce: a.nonce,
              evidenceId: media.id,
              appProofId: verified.body.grantId,
            },
            p.token,
          )
        ).status,
        201,
      );
      assert.equal(
        (await h.db.attempt.findUniqueOrThrow({ where: { id: a.id } })).status,
        "PROVISIONAL",
      );
      // An unfinished slot cannot obtain a new solve proof after the round deadline.
      const anotherRoom = await h.db.room.create({
        data: {
          code: randomUUID(),
          ownerId: p.u.id,
          puzzle: "3x3",
          input: "scan",
          mode: "race",
          ranked: false,
          private: true,
          status: "ACTIVE",
          competitionAttempt: true,
          competitionEntryId: entry.id,
          competitionRoundId: event.rounds[0].id,
          competitionIndex: 1,
        },
      });
      await h.db.roomMember.create({
        data: { roomId: anotherRoom.id, userId: p.u.id },
      });
      const late = await h.db.attempt.create({
        data: {
          roomId: anotherRoom.id,
          userId: p.u.id,
          nonce: opaque(),
          scramble: ["R", "U"],
          status: "SOLVING",
          startedAt: new Date(now - 10000),
        },
      });
      assert.equal(
        (
          await f.call(
            "/challenges",
            {
              kind: "action",
              provider: "apple-app-attest",
              keyId: key.id,
              attemptId: late.id,
              operation: "finish",
              body: { nonce: late.nonce },
            },
            p.token,
          )
        ).status,
        409,
      );
      assert.deepEqual(f.errors, []);
    });
  });
  test("app attestation concurrent enrollments create one key and return a safe conflict for the duplicate", async () => {
    const p = await h.fixture("attest-duplicate", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const c1 = await f.call(
        "/challenges",
        { kind: "enroll", provider: "apple-app-attest", keyId: f.native.keyId },
        p.token,
      );
      const c2 = await f.call(
        "/challenges",
        { kind: "enroll", provider: "apple-app-attest", keyId: f.native.keyId },
        p.token,
      );
      const p1 = f.proof(c1.body),
        p2 = f.proof(c2.body);
      const results = await Promise.all([
        f.call("/verify", p1, p.token),
        f.call("/verify", p2, p.token),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      assert.equal(
        await h.db.appAttestationKey.count({ where: { userId: p.u.id } }),
        1,
      );
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation cleanup expires encrypted keys, deletes old terminal metadata and prunes challenge history", async () => {
    const p = await h.fixture("attest-retention", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p),
        original = await h.db.appAttestationKey.findUniqueOrThrow({
          where: { id: key.id },
        });
      const { id, counter, version, ...copy } = original;
      const expired = await h.db.appAttestationKey.create({
        data: {
          ...copy,
          id: randomUUID(),
          keyIdHash: hash(randomUUID()),
          publicKeyHash: hash(randomUUID()),
          receiptExpiresAt: new Date(Date.now() - 1),
        },
      });
      const old = await h.db.appAttestationKey.create({
        data: {
          ...copy,
          id: randomUUID(),
          keyIdHash: hash(randomUUID()),
          publicKeyHash: hash(randomUUID()),
        },
      });
      await h.db.appAttestationKey.update({
        where: { id: old.id },
        data: {
          status: "REVOKED",
          publicKeyPem: null,
          receiptCiphertext: null,
          version: { increment: 1 },
          updatedAt: new Date(Date.now() - 31 * 86400000),
        },
      });
      const actor = await h.actor(p),
        createdAt = new Date(Date.now() - 3 * 86400000);
      const history = await h.db.appAttestationChallenge.create({
        data: {
          userId: p.u.id,
          sessionId: actor.sessionId,
          provider: "apple-app-attest",
          region: "INTL",
          purpose: "ENROLL",
          keyIdHash: hash(randomUUID()),
          policyDigest: f.crypto.policyDigest(),
          contextDigest: hash(randomUUID()),
          challengeHash: hash(randomUUID()),
          createdAt,
          expiresAt: new Date(createdAt.getTime() + 120000),
        },
      });
      await new Background(h.db as Db, h.infra()).maintenance();
      const cleared = await h.db.appAttestationKey.findUniqueOrThrow({
        where: { id: expired.id },
      });
      assert.equal(cleared.status, "EXPIRED");
      assert.equal(cleared.publicKeyPem, null);
      assert.equal(cleared.receiptCiphertext, null);
      assert.equal(
        await h.db.appAttestationKey.findUnique({ where: { id: old.id } }),
        null,
      );
      assert.equal(
        await h.db.appAttestationChallenge.findUnique({
          where: { id: history.id },
        }),
        null,
      );
      assert.equal(
        (await h.db.appAttestationKey.findUniqueOrThrow({ where: { id } }))
          .status,
        "ACTIVE",
      );
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation refuses removed room members and rejects grants after an attempt changes", async () => {
    const p = await h.fixture("attest-membership", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p),
        a = await attempt(h.db, p);
      const c = await actionChallenge(f, p, key.id, a);
      await h.db.roomMember.deleteMany({
        where: { roomId: a.roomId, userId: p.u.id },
      });
      assert.equal(
        (await f.call("/verify", f.assertion(c, 1), p.token)).status,
        409,
      );
      assert.equal(
        (
          await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          })
        ).counter,
        0n,
      );
      await h.db.roomMember.create({
        data: { roomId: a.roomId, userId: p.u.id },
      });
      const next = await actionChallenge(f, p, key.id, a),
        result = await f.call("/verify", f.assertion(next, 2), p.token);
      assert.equal(result.status, 201);
      const actor = await h.actor(p);
      await h.db.attempt.update({
        where: { id: a.id },
        data: {
          status: "INSPECTION",
          inspectionAt: new Date(),
          version: { increment: 1 },
        },
      });
      await refuses(() => consume(h, f, actor, result.body.grantId, a), 409);
      assert.equal(
        (
          await h.db.appAttestationGrant.findUniqueOrThrow({
            where: { id: result.body.grantId },
          })
        ).consumedAt,
        null,
      );
      assert.deepEqual(f.errors, []);
    });
  });
  test("app attestation stays unavailable by default and cannot create proof rows in either community", async () => {
    const cnUser = await h.cnDb.user.create({
      data: {
        email: `attest-cn-${randomUUID()}@cubers.test`,
        displayName: "Synthetic attestation gate",
        birthDate: "1990-01-01",
        passwordHash: "!synthetic-no-login",
        region: "CN",
        emailVerified: true,
        adultVerified: true,
      },
    });
    const cnToken = opaque();
    await h.cnDb.session.create({
      data: {
        userId: cnUser.id,
        tokenHash: hash(cnToken),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    for (const [base, token] of [
      [
        "http://127.0.0.1:3101",
        (await h.fixture("attest-default", "1990-01-01")).token,
      ],
      ["http://127.0.0.1:3102", cnToken],
    ]) {
      const list = await h.call(
        "me/app-attestation",
        undefined,
        token,
        undefined,
        base,
      );
      assert.equal(list.status, 200);
      assert.equal(list.body.rankingEnabled, false);
      assert.equal(
        list.body.providers.every((p: any) => !p.available),
        true,
      );
      for (const provider of ["apple-app-attest", "google-play"])
        assert.equal(
          (
            await h.call(
              "me/app-attestation/challenges",
              {
                kind: "enroll",
                provider,
                keyId: Buffer.alloc(32).toString("base64"),
              },
              token,
              undefined,
              base,
            )
          ).status,
          403,
        );
    }
  });

  test("app attestation persists encrypted enrollment, isolates sessions and refuses challenge replay", async () => {
    const p = await h.fixture("attest-enroll", "1990-01-01"),
      other = await h.fixture("attest-other", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      assert.equal((await f.call("")).status, 401);
      const c = await f.call(
        "/challenges",
        { kind: "enroll", provider: "apple-app-attest", keyId: f.native.keyId },
        p.token,
      );
      const proof = f.proof(c.body);
      assert.equal((await f.call("/verify", proof, other.token)).status, 404);
      const second = opaque();
      await h.db.session.create({
        data: {
          userId: p.u.id,
          tokenHash: hash(second),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      assert.equal((await f.call("/verify", proof, second)).status, 404);
      assert.equal(
        (
          await f.call(
            "/verify",
            {
              ...proof,
              clientData: "b".repeat(43) + proof.clientData.slice(43),
            },
            p.token,
          )
        ).status,
        409,
      );
      const verified = await f.call("/verify", proof, p.token);
      assert.equal(verified.status, 201, JSON.stringify(f.errors));
      const stored = await h.db.appAttestationKey.findUniqueOrThrow({
        where: { id: verified.body.key.id },
      });
      assert.equal(stored.counter, 0n);
      assert.equal(
        stored.receiptCiphertext?.includes("synthetic-receipt-token"),
        false,
      );
      assert.equal(
        stored.receiptCiphertext?.includes(stored.publicKeyPem!),
        false,
      );
      assert.equal((await f.call("/verify", proof, p.token)).status, 409);
      assert.equal(
        (
          await h.db.appAttestationChallenge.findUniqueOrThrow({
            where: { id: c.body.id },
          })
        ).status,
        "USED",
      );
      const listed = await f.call("", undefined, p.token);
      assert.equal(listed.body.keys.length, 1);
      for (const field of [
        "receiptCiphertext",
        "publicKeyPem",
        "keyIdHash",
        "publicKeyHash",
        "counter",
      ])
        assert.equal(field in listed.body.keys[0], false);
      assert.deepEqual(
        (await f.call("", undefined, other.token)).body.keys,
        [],
      );
      const retried = await f.call(
        "/challenges",
        { kind: "enroll", provider: "apple-app-attest", keyId: f.native.keyId },
        p.token,
      );
      assert.equal(retried.body.alreadyEnrolled.id, stored.id);
      assert.equal(
        (
          await f.call(
            "/challenges",
            {
              kind: "enroll",
              provider: "apple-app-attest",
              keyId: f.native.keyId,
            },
            other.token,
          )
        ).status,
        409,
      );
      const exported = await h.call("me/export", undefined, p.token);
      assert.equal(exported.status, 200);
      assert.equal(exported.body.appVerificationKeys[0].id, stored.id);
      assert.equal(
        JSON.stringify(exported.body).includes(stored.receiptCiphertext!),
        false,
      );
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation action grants bind the exact attempt and action, consume once and roll back with failed actions", async () => {
    const p = await h.fixture("attest-action", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p),
        a = await attempt(h.db, p),
        actor = await h.actor(p);
      const c = await actionChallenge(f, p, key.id, a),
        proof = f.assertion(c, 1);
      const verified = await f.call("/verify", proof, p.token);
      assert.equal(verified.status, 201, JSON.stringify(f.errors));
      const grant = await h.db.appAttestationGrant.findUniqueOrThrow({
        where: { id: verified.body.grantId },
      });
      assert.ok(grant.expiresAt.getTime() - grant.createdAt.getTime() <= 30000);
      assert.equal(
        (
          await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          })
        ).counter,
        1n,
      );
      assert.equal((await f.call("/verify", proof, p.token)).status, 409);
      await refuses(
        () => consume(h, f, actor, grant.id, a, "inspect", { nonce: "wrong" }),
        403,
      );
      await refuses(() => consume(h, f, actor, grant.id, a, "finish"), 403);
      const wrongAttempt = await attempt(h.db, p);
      await refuses(() => consume(h, f, actor, grant.id, wrongAttempt), 403);
      const token2 = opaque(),
        s2 = await h.db.session.create({
          data: {
            userId: p.u.id,
            tokenHash: hash(token2),
            expiresAt: new Date(Date.now() + 60000),
          },
        });
      await refuses(
        () => consume(h, f, { ...actor, sessionId: s2.id }, grant.id, a),
        403,
      );
      await assert.rejects(
        () =>
          consume(
            h,
            f,
            actor,
            grant.id,
            a,
            "inspect",
            { nonce: a.nonce },
            true,
          ),
        /Synthetic action failure/,
      );
      assert.equal(
        (
          await h.db.appAttestationGrant.findUniqueOrThrow({
            where: { id: grant.id },
          })
        ).consumedAt,
        null,
      );
      const both = await Promise.allSettled([
        consume(h, f, actor, grant.id, a),
        consume(h, f, actor, grant.id, a),
      ]);
      assert.equal(both.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        both.filter(
          (r) => r.status === "rejected" && r.reason.getStatus?.() === 409,
        ).length,
        1,
      );
      assert.equal(
        (await h.db.attempt.findUniqueOrThrow({ where: { id: a.id } })).status,
        "CREATED",
      );
      assert.equal(verified.body.rankingEligible, false);
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation rejects invalid signatures, changed attempts and stale counters without issuing grants", async () => {
    const p = await h.fixture("attest-stale", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p),
        a = await attempt(h.db, p);
      const bad = await actionChallenge(f, p, key.id, a);
      assert.equal(
        (
          await f.call(
            "/verify",
            { ...f.assertion(bad, 1), assertion: f.native.assertion(1) },
            p.token,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await h.db.appAttestationChallenge.findUniqueOrThrow({
            where: { id: bad.id },
          })
        ).status,
        "FAILED",
      );
      const changed = await actionChallenge(f, p, key.id, a);
      await h.db.attempt.update({
        where: { id: a.id },
        data: { version: { increment: 1 } },
      });
      assert.equal(
        (await f.call("/verify", f.assertion(changed, 1), p.token)).status,
        409,
      );
      const low = await actionChallenge(f, p, key.id, a),
        high = await actionChallenge(f, p, key.id, a);
      const results = await Promise.all([
        f.call("/verify", f.assertion(low, 5), p.token),
        f.call("/verify", f.assertion(high, 6), p.token),
      ]);
      assert.equal(results[1].status, 201, JSON.stringify(f.errors));
      assert.ok([201, 409, 400].includes(results[0].status));
      assert.equal(
        (
          await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          })
        ).counter,
        6n,
      );
      const stale = await actionChallenge(f, p, key.id, a);
      assert.equal(
        (await f.call("/verify", f.assertion(stale, 6), p.token)).status,
        400,
      );
      assert.equal(
        await h.db.appAttestationGrant.count({
          where: { challengeId: { in: [bad.id, changed.id, stale.id] } },
        }),
        0,
      );
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation build policy invalidates pending proofs while preserving an enrolled key across approved upgrades", async () => {
    const p = await h.fixture("attest-build", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p),
        a = await attempt(h.db, p);
      const c = await actionChallenge(f, p, key.id, a),
        scope = f.crypto.keyPolicyDigest();
      f.config.APP_ATTESTATION_APPLE_BUILDS = "2";
      assert.equal(f.crypto.keyPolicyDigest(), scope);
      assert.equal(
        (await f.call("/verify", f.assertion(c, 1), p.token)).status,
        409,
      );
      const c2 = await actionChallenge(f, p, key.id, a);
      assert.equal(
        (await f.call("/verify", f.assertion(c2, 1, "1"), p.token)).status,
        400,
      );
      const c3 = await actionChallenge(f, p, key.id, a);
      const result = await f.call("/verify", f.assertion(c3, 2, "2"), p.token);
      assert.equal(result.status, 201, JSON.stringify(f.errors));
      const updated = await h.db.appAttestationKey.findUniqueOrThrow({
        where: { id: key.id },
      });
      assert.equal(updated.enrolledBundleVersion, "1");
      assert.equal(updated.bundleVersion, "2");
      f.config.APP_ATTESTATION_APPLE_BUILDS = "2,3";
      const actor = await h.actor(p);
      await refuses(() => consume(h, f, actor, result.body.grantId, a), 409);
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation revocation erases keys and receipts and cancels outstanding proofs", async () => {
    const p = await h.fixture("attest-revoke", "1990-01-01"),
      other = await h.fixture("attest-revoke-other", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p),
        a = await attempt(h.db, p);
      const c = await actionChallenge(f, p, key.id, a),
        checked = await f.call("/verify", f.assertion(c, 1), p.token);
      assert.equal(checked.status, 201);
      const pending = await actionChallenge(f, p, key.id, a);
      assert.equal(
        (
          await f.call(
            `/keys/${key.id}`,
            { expectedVersion: 1 },
            other.token,
            "DELETE",
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await f.call(
            `/keys/${key.id}`,
            { expectedVersion: 0 },
            p.token,
            "DELETE",
          )
        ).status,
        409,
      );
      const revoked = await f.call(
        `/keys/${key.id}`,
        { expectedVersion: 1 },
        p.token,
        "DELETE",
      );
      assert.equal(revoked.status, 200);
      assert.equal(revoked.body.status, "REVOKED");
      const stored = await h.db.appAttestationKey.findUniqueOrThrow({
        where: { id: key.id },
      });
      assert.equal(stored.publicKeyPem, null);
      assert.equal(stored.receiptCiphertext, null);
      assert.equal(stored.counter, 1n);
      assert.equal(stored.version, 2);
      assert.equal(
        await h.db.appAttestationGrant.count({ where: { keyId: key.id } }),
        0,
      );
      assert.equal(
        (
          await h.db.appAttestationChallenge.findUniqueOrThrow({
            where: { id: pending.id },
          })
        ).status,
        "FAILED",
      );
      assert.equal(
        (await f.call("/verify", f.assertion(pending, 2), p.token)).status,
        409,
      );
      assert.equal(
        (
          await f.call(
            `/keys/${key.id}`,
            { expectedVersion: 0 },
            p.token,
            "DELETE",
          )
        ).status,
        200,
      );
      await assert.rejects(() =>
        h.db.appAttestationKey.update({
          where: { id: key.id },
          data: { status: "ACTIVE", version: { increment: 1 } },
        }),
      );
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation permits child key removal after consent withdrawal while refusing new learning proofs", async () => {
    const guardian = await h.fixture("attest-guardian", "1990-01-01"),
      child = await h.fixture(
        "attest-consent-child",
        "2018-01-01",
        "USER",
        false,
      );
    const document = await h.db.media.create({
      data: {
        userId: guardian.u.id,
        key: `INTL/attest-consent/${randomUUID()}`,
        type: "application/pdf",
        size: 32,
        purpose: "consent",
        status: "READY",
      },
    });
    const consent = await h.db.consent.create({
      data: {
        childId: child.u.id,
        guardianId: guardian.u.id,
        documentId: document.id,
        status: "APPROVED",
        publicPosting: false,
        recording: false,
      },
    });
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, child);
      await h.db.consent.update({
        where: { id: consent.id },
        data: { status: "REVOKED" },
      });
      assert.equal(
        (await f.call("", undefined, child.token)).body.keys[0].id,
        key.id,
      );
      const a = await attempt(h.db, child);
      assert.equal(
        (
          await f.call(
            "/challenges",
            {
              kind: "action",
              provider: "apple-app-attest",
              keyId: key.id,
              attemptId: a.id,
              operation: "inspect",
              body: { nonce: a.nonce },
            },
            child.token,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await f.call(
            `/keys/${key.id}`,
            { expectedVersion: 0 },
            child.token,
            "DELETE",
          )
        ).status,
        200,
      );
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation enrollment rechecks revoked sessions after cryptographic verification and leaves busy challenges retryable", async () => {
    const p = await h.fixture("attest-enroll-race", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const c = await f.call(
          "/challenges",
          {
            kind: "enroll",
            provider: "apple-app-attest",
            keyId: f.native.keyId,
          },
          p.token,
        ),
        proof = f.proof(c.body);
      const r1 = f.crypto.reserveEnrollment(),
        r2 = f.crypto.reserveEnrollment();
      try {
        assert.equal((await f.call("/verify", proof, p.token)).status, 503);
        assert.equal(
          (
            await h.db.appAttestationChallenge.findUniqueOrThrow({
              where: { id: c.body.id },
            })
          ).status,
          "PENDING",
        );
      } finally {
        r1();
        r1();
        r2();
      }
      let reached!: () => void, release!: () => void;
      const arrived = new Promise<void>((r) => {
          reached = r;
        }),
        gate = new Promise<void>((r) => {
          release = r;
        });
      f.pause(async () => {
        reached();
        await gate;
      });
      const result = f.call("/verify", proof, p.token);
      try {
        await Promise.race([
          arrived,
          result.then(() => {
            throw new Error(
              "Verification did not reach final authority recheck",
            );
          }),
        ]);
        await h.db.session.update({
          where: { tokenHash: hash(p.token) },
          data: { scope: "DELETION" },
        });
      } finally {
        release();
      }
      assert.equal((await result).status, 403);
      assert.equal(
        await h.db.appAttestationKey.count({ where: { userId: p.u.id } }),
        0,
      );
      assert.equal(
        (
          await h.db.appAttestationChallenge.findUniqueOrThrow({
            where: { id: c.body.id },
          })
        ).status,
        "FAILED",
      );
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation grants roll back when sessions expire during real attempt row lock waits", async () => {
    const p = await h.fixture("attest-lock-expiry", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p),
        a = await attempt(h.db, p);
      const c = await actionChallenge(f, p, key.id, a),
        checked = await f.call("/verify", f.assertion(c, 1), p.token);
      assert.equal(checked.status, 201);
      const actor = await h.actor(p),
        deadline = Date.now() + 1200;
      await h.db.session.update({
        where: { id: actor.sessionId },
        data: { expiresAt: new Date(deadline) },
      });
      const result = await h.lockDelay("Attempt", a.id, deadline, () =>
        consume(h, f, actor, checked.body.grantId, a),
      );
      assert.ok([403, 409].includes(result.error?.getStatus?.()));
      assert.equal(
        (
          await h.db.appAttestationGrant.findUniqueOrThrow({
            where: { id: checked.body.grantId },
          })
        ).consumedAt,
        null,
      );
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation unavailable certificate status prevents challenges and recovers without granting authority", async () => {
    const p = await h.fixture("attest-status-unavailable", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p),
        a = await attempt(h.db, p);
      f.certificateStatus({ unavailable: true });
      const blocked = await f.call(
        "/challenges",
        {
          kind: "action",
          provider: "apple-app-attest",
          keyId: key.id,
          attemptId: a.id,
          operation: "inspect",
          body: { nonce: a.nonce },
        },
        p.token,
      );
      assert.equal(blocked.status, 503);
      assert.equal(
        await h.db.appAttestationChallenge.count({
          where: { userId: p.u.id, purpose: "ACTION" },
        }),
        0,
      );
      assert.equal(
        await h.db.appAttestationGrant.count({ where: { userId: p.u.id } }),
        0,
      );
      f.certificateStatus({});
      await actionChallenge(f, p, key.id, a);
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation certificate status expiry rolls back grants after real attempt row lock waits", async () => {
    const p = await h.fixture("attest-status-expiry", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p),
        a = await attempt(h.db, p);
      const c = await actionChallenge(f, p, key.id, a);
      const checked = await f.call("/verify", f.assertion(c, 1), p.token);
      assert.equal(checked.status, 201);
      const actor = await h.actor(p),
        deadline = Date.now() + 1200;
      f.certificateStatus({ until: deadline });
      const result = await h.lockDelay("Attempt", a.id, deadline, () =>
        consume(h, f, actor, checked.body.grantId, a),
      );
      assert.ok([403, 409].includes(result.error?.getStatus?.()));
      assert.equal(
        (
          await h.db.appAttestationGrant.findUniqueOrThrow({
            where: { id: checked.body.grantId },
          })
        ).consumedAt,
        null,
      );
      assert.equal(
        (await h.db.attempt.findUniqueOrThrow({ where: { id: a.id } })).status,
        "CREATED",
      );
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation certificate lookup runs outside authority locks and rechecks revoked sessions", async () => {
    const p = await h.fixture("attest-status-session", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p),
        a = await attempt(h.db, p);
      let reached!: () => void, release!: () => void;
      const arrived = new Promise<void>((r) => {
        reached = r;
      });
      const gate = new Promise<void>((r) => {
        release = r;
      });
      f.pauseCertificateStatus(async () => {
        reached();
        await gate;
      });
      const result = f.call(
        "/challenges",
        {
          kind: "action",
          provider: "apple-app-attest",
          keyId: key.id,
          attemptId: a.id,
          operation: "inspect",
          body: { nonce: a.nonce },
        },
        p.token,
      );
      try {
        await Promise.race([
          arrived,
          result.then(() => {
            throw Error("Status lookup was not reached");
          }),
        ]);
        await h.db.session.update({
          where: { tokenHash: hash(p.token) },
          data: { scope: "DELETION" },
        });
      } finally {
        release();
      }
      assert.equal((await result).status, 403);
      assert.equal(
        await h.db.appAttestationChallenge.count({
          where: { userId: p.u.id, purpose: "ACTION" },
        }),
        0,
      );
      assert.equal(
        await h.db.appAttestationGrant.count({ where: { userId: p.u.id } }),
        0,
      );
      assert.deepEqual(f.errors, []);
    });
  });

  test("app attestation account deletion revokes stored material and cascades session challenges and grants", async () => {
    const p = await h.fixture("attest-delete", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p),
        a = await attempt(h.db, p);
      const c = await actionChallenge(f, p, key.id, a);
      assert.equal(
        (await f.call("/verify", f.assertion(c, 1), p.token)).status,
        201,
      );
      assert.equal(
        (await h.call("me", { confirmation: "DELETE" }, p.token, "DELETE"))
          .status,
        200,
      );
      const stored = await h.db.appAttestationKey.findUniqueOrThrow({
        where: { id: key.id },
      });
      assert.equal(stored.status, "REVOKED");
      assert.equal(stored.publicKeyPem, null);
      assert.equal(stored.receiptCiphertext, null);
      assert.equal(
        await h.db.appAttestationChallenge.count({ where: { userId: p.u.id } }),
        0,
      );
      assert.equal(
        await h.db.appAttestationGrant.count({ where: { userId: p.u.id } }),
        0,
      );
      assert.equal((await f.call("", undefined, p.token)).status, 401);
      assert.deepEqual(f.errors, []);
    });
  });
}

export function registerPlayIntegrityCases(h: Harness) {
  const challenge = async (
    f: HttpFixture,
    p: Person,
    a: { id: string; nonce: string },
    operation = "inspect",
    body: unknown = { nonce: a.nonce },
  ) => {
    const result = await f.call(
      "/challenges",
      {
        kind: "play-action",
        provider: "google-play",
        attemptId: a.id,
        operation,
        body,
      },
      p.token,
    );
    assert.equal(result.status, 201, JSON.stringify(f.errors));
    assert.equal(
      result.body.requestHash,
      createHash("sha256")
        .update(result.body.clientData, "utf8")
        .digest("base64url"),
    );
    return result.body;
  };
  const proof = (f: HttpFixture, c: any) => ({
    kind: "play-action",
    challengeId: c.id,
    clientData: c.clientData,
    integrityToken: f.playToken(c),
  });

  test("Play Integrity native client completes an authenticated virtual solve with keyless one-use grants", async () => {
    const p = await h.fixture("play-native-routes", "1990-01-01"),
      a = await attempt(h.db, p);
    await withAppAttestationHttp(
      h.db as Db,
      h.infra(),
      async (f) => {
        let last: any,
          preparations = 0;
        const tokens: string[] = [];
        const client = new PlayVerificationClient({
          supported: () => true,
          prepare: async (project) => {
            assert.equal(project, "123456789012");
            preparations++;
          },
          hash: async (input) =>
            createHash("sha256").update(input).digest("base64url"),
          request: async (hash) => {
            assert.equal(hash, last.requestHash);
            const token = f.playToken(last);
            tokens.push(token);
            return token;
          },
        });
        client.setContext({
          ownerId: p.u.id,
          region: "INTL",
          token: p.token,
          canLearn: true,
          api: async (path, body, method) => {
            const result = path.startsWith("me/app-attestation")
              ? await f.call(
                  path.slice("me/app-attestation".length),
                  body,
                  p.token,
                  method,
                )
              : await f.game(path, body, p.token);
            if (result.status >= 400)
              throw Object.assign(Error("Request refused"), {
                status: result.status,
              });
            if (path.endsWith("/challenges")) last = result.body;
            return result.body;
          },
        });
        await assert.rejects(
          client.perform(a.id, "inspect", { nonce: a.nonce }),
          /Device verification/,
        );
        await client.enroll();
        assert.equal(f.googleCalls(), 0);
        await client.perform(a.id, "inspect", { nonce: a.nonce });
        await client.perform(a.id, "start", { nonce: a.nonce });
        assert.equal(
          (
            await f.game(
              `attempts/${a.id}/moves`,
              {
                nonce: a.nonce,
                events: [
                  { move: "U'", sequence: 0, elapsedMs: 0 },
                  { move: "R'", sequence: 1, elapsedMs: 1 },
                ],
              },
              p.token,
            )
          ).status,
          201,
        );
        await new Promise((resolve) => setTimeout(resolve, 320));
        const finished = await client.perform(a.id, "finish", {
          nonce: a.nonce,
        });
        assert.equal(finished.status, "APPROVED");
        assert.equal(preparations, 1);
        const grants = await h.db.appAttestationGrant.findMany({
          where: { attemptId: a.id },
        });
        assert.equal(grants.length, 3);
        assert.ok(
          grants.every(
            (g) =>
              g.provider === "google-play" &&
              g.keyId === null &&
              g.keyVersion === null &&
              g.consumedAt,
          ),
        );
        assert.equal(
          await h.db.appAttestationKey.count({ where: { userId: p.u.id } }),
          0,
        );
        const stored = JSON.stringify(
          await h.db.appAttestationChallenge.findMany({
            where: { userId: p.u.id },
          }),
        );
        for (const token of tokens) assert.ok(!stored.includes(token));
        assert.deepEqual(f.errors, []);
      },
      { play: true },
    );
  });

  test("Play Integrity binds sessions and exact action bodies, rejects method substitution and cannot replay a grant", async () => {
    const p = await h.fixture("play-action-binding", "1990-01-01"),
      other = await h.fixture("play-other", "1990-01-01"),
      a = await attempt(h.db, p);
    await withAppAttestationHttp(
      h.db as Db,
      h.infra(),
      async (f) => {
        const c = await challenge(f, p, a),
          b = proof(f, c);
        const otherSession = opaque();
        const separate = await h.db.session.create({
          data: {
            userId: p.u.id,
            tokenHash: hash(otherSession),
            expiresAt: new Date(Date.now() + 60000),
          },
        });
        try {
          assert.equal((await f.call("/verify", b, otherSession)).status, 404);
        } finally {
          await h.db.session.delete({ where: { id: separate.id } });
        }
        assert.equal((await f.call("/verify", b, other.token)).status, 404);
        assert.equal(
          (
            await f.call(
              "/verify",
              {
                kind: "action",
                challengeId: c.id,
                clientData: c.clientData,
                assertion: "wrong-provider",
              },
              p.token,
            )
          ).status,
          409,
        );
        assert.equal(f.googleCalls(), 0);
        const checked = await f.call("/verify", b, p.token);
        assert.equal(checked.status, 201, JSON.stringify(f.errors));
        assert.equal((await f.call("/verify", b, p.token)).status, 409);
        assert.equal(f.googleCalls(), 1);
        const grantId = checked.body.grantId;
        assert.equal(
          (
            await f.game(
              `attempts/${a.id}/inspect`,
              { nonce: "wrong", appProofId: grantId },
              p.token,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await h.db.appAttestationGrant.findUniqueOrThrow({
              where: { id: grantId },
            })
          ).consumedAt,
          null,
        );
        assert.equal(
          (
            await f.game(
              `attempts/${a.id}/inspect`,
              { nonce: a.nonce, appProofId: grantId },
              p.token,
            )
          ).status,
          201,
        );
        assert.ok(
          (
            await h.db.appAttestationGrant.findUniqueOrThrow({
              where: { id: grantId },
            })
          ).consumedAt,
        );
        assert.notEqual(
          (
            await f.game(
              `attempts/${a.id}/inspect`,
              { nonce: a.nonce, appProofId: grantId },
              p.token,
            )
          ).status,
          201,
        );
        assert.deepEqual(f.errors, []);
      },
      { play: true },
    );
  });

  test("Play Integrity wrong request hashes and unlicensed verdicts cannot create grants", async () => {
    const p = await h.fixture("play-verdict-refusal", "1990-01-01"),
      a = await attempt(h.db, p);
    await withAppAttestationHttp(
      h.db as Db,
      h.infra(),
      async (f) => {
        for (const modify of [
          (payload: any) => {
            payload.tokenPayloadExternal.requestDetails.requestHash =
              Buffer.alloc(32).toString("base64url");
          },
          (payload: any) => {
            payload.tokenPayloadExternal.accountDetails.appLicensingVerdict =
              "UNLICENSED";
          },
        ]) {
          const c = await challenge(f, p, a),
            token = f.playToken(c, modify);
          const result = await f.call(
            "/verify",
            {
              kind: "play-action",
              challengeId: c.id,
              clientData: c.clientData,
              integrityToken: token,
            },
            p.token,
          );
          assert.equal(result.status, 400);
          assert.ok(!JSON.stringify(result.body).includes(token));
          assert.equal(
            (
              await h.db.appAttestationChallenge.findUniqueOrThrow({
                where: { id: c.id },
              })
            ).status,
            "FAILED",
          );
        }
        assert.equal(
          await h.db.appAttestationGrant.count({ where: { attemptId: a.id } }),
          0,
        );
        assert.deepEqual(f.errors, []);
      },
      { play: true },
    );
  });

  test("Play Integrity concurrent verification decodes once and cancellation invalidates pending and verified proofs", async () => {
    const p = await h.fixture("play-concurrent-cancel", "1990-01-01"),
      a = await attempt(h.db, p);
    await withAppAttestationHttp(
      h.db as Db,
      h.infra(),
      async (f) => {
        const c = await challenge(f, p, a),
          b = proof(f, c);
        const results = await Promise.all([
          f.call("/verify", b, p.token),
          f.call("/verify", b, p.token),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        assert.equal(f.googleCalls(), 1);
        const pending = await challenge(f, p, a);
        assert.equal(
          (await f.call("/play", {}, p.token, "DELETE")).status,
          200,
        );
        assert.equal(
          await h.db.appAttestationGrant.count({ where: { attemptId: a.id } }),
          0,
        );
        assert.equal(
          (await f.call("/verify", proof(f, pending), p.token)).status,
          409,
        );
        const next = await challenge(f, p, a);
        f.pause(async () => {
          assert.equal(
            (await f.call("/play", {}, p.token, "DELETE")).status,
            200,
          );
        });
        assert.equal(
          (await f.call("/verify", proof(f, next), p.token)).status,
          409,
        );
        assert.equal(
          await h.db.appAttestationGrant.count({ where: { attemptId: a.id } }),
          0,
        );
        assert.deepEqual(f.errors, []);
      },
      { play: true },
    );
  });

  test("Play Integrity rechecks current session after provider work and cannot finish a stale attempt snapshot", async () => {
    const p = await h.fixture("play-stale-session", "1990-01-01"),
      a = await attempt(h.db, p);
    await withAppAttestationHttp(
      h.db as Db,
      h.infra(),
      async (f) => {
        let c = await challenge(f, p, a);
        f.pause(async () => {
          await h.db.attempt.update({
            where: { id: a.id },
            data: { version: { increment: 1 } },
          });
        });
        assert.equal(
          (await f.call("/verify", proof(f, c), p.token)).status,
          409,
        );
        f.pause();
        c = await challenge(f, p, a);
        f.pause(async () => {
          await h.db.session.updateMany({
            where: { tokenHash: hash(p.token) },
            data: { expiresAt: new Date(Date.now() - 1000) },
          });
        });
        assert.equal(
          (await f.call("/verify", proof(f, c), p.token)).status,
          403,
        );
        assert.equal(
          await h.db.appAttestationGrant.count({ where: { attemptId: a.id } }),
          0,
        );
        assert.deepEqual(f.errors, []);
      },
      { play: true },
    );
  });

  test("Play Integrity physical recording and evidence routes consume proofs transactionally and remain provisional", async () => {
    const p = await h.fixture("play-physical-routes", "1990-01-01"),
      a = await attempt(h.db, p, "scan");
    await h.db.room.update({ where: { id: a.roomId }, data: { ranked: true } });
    await withAppAttestationHttp(
      h.db as Db,
      h.infra(),
      async (f) => {
        const checked = async (
          operation: string,
          body: any = { nonce: a.nonce },
        ) => {
          const c = await challenge(f, p, a, operation, body);
          const result = await f.call("/verify", proof(f, c), p.token);
          assert.equal(result.status, 201, JSON.stringify(f.errors));
          return result.body.grantId;
        };
        const record = await checked("record");
        assert.equal(
          (
            await f.game(
              `attempts/${a.id}/record`,
              { nonce: a.nonce, appProofId: record },
              p.token,
            )
          ).status,
          201,
        );
        const duplicate = await checked("record");
        assert.equal(
          (
            await f.game(
              `attempts/${a.id}/record`,
              { nonce: a.nonce, appProofId: duplicate },
              p.token,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await h.db.appAttestationGrant.findUniqueOrThrow({
              where: { id: duplicate },
            })
          ).consumedAt,
          null,
        );
        assert.equal(
          (
            await f.game(
              `attempts/${a.id}/checkpoint`,
              {
                nonce: a.nonce,
                stage: "scramble",
                faces: facelets(applyMoves(solvedCube(), a.scramble)),
              },
              p.token,
            )
          ).status,
          201,
        );
        for (const operation of ["inspect", "start"]) {
          const id = await checked(operation);
          assert.equal(
            (
              await f.game(
                `attempts/${a.id}/${operation}`,
                { nonce: a.nonce, appProofId: id },
                p.token,
              )
            ).status,
            201,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 320));
        const finish = await checked("finish");
        assert.equal(
          (
            await f.game(
              `attempts/${a.id}/finish`,
              { nonce: a.nonce, appProofId: finish },
              p.token,
            )
          ).body.status,
          "AWAITING_EVIDENCE",
        );
        assert.equal(
          (
            await f.game(
              `attempts/${a.id}/checkpoint`,
              { nonce: a.nonce, stage: "final", faces: facelets(solvedCube()) },
              p.token,
            )
          ).status,
          201,
        );
        const media = await h.db.media.create({
          data: {
            userId: p.u.id,
            attemptId: a.id,
            key: `INTL/synthetic-play/${randomUUID()}`,
            type: "video/mp4",
            purpose: "evidence",
            size: 32,
            status: "READY",
            durationMs: 60000,
          },
        });
        const alternate = await h.db.media.create({
          data: {
            userId: p.u.id,
            attemptId: a.id,
            key: `INTL/synthetic-play/${randomUUID()}`,
            type: "video/mp4",
            purpose: "evidence",
            size: 32,
            status: "READY",
            durationMs: 60000,
          },
        });
        const evidence = await checked("evidence", {
          nonce: a.nonce,
          evidenceId: media.id,
        });
        assert.equal(
          (
            await f.game(
              `attempts/${a.id}/evidence`,
              {
                nonce: a.nonce,
                evidenceId: alternate.id,
                appProofId: evidence,
              },
              p.token,
            )
          ).status,
          403,
        );
        const result = await f.game(
          `attempts/${a.id}/evidence`,
          { nonce: a.nonce, evidenceId: media.id, appProofId: evidence },
          p.token,
        );
        assert.equal(result.status, 201, JSON.stringify(f.errors));
        assert.equal(result.body.status, "PROVISIONAL");
        assert.equal(
          await h.db.appAttestationGrant.count({
            where: {
              attemptId: a.id,
              consumedAt: { not: null },
              provider: "google-play",
            },
          }),
          5,
        );
        assert.deepEqual(f.errors, []);
      },
      { play: true },
    );
  });
}

export function registerAppleReceiptRefreshCases(h: Harness) {
  test("Apple receipt refresh cannot outlive a child's guardian learning consent", async () => {
    const guardian = await h.fixture("apple-refresh-guardian", "1990-01-01"),
      child = await h.fixture(
        "apple-refresh-child",
        "2018-01-01",
        "USER",
        false,
      );
    const document = await h.db.media.create({
      data: {
        userId: guardian.u.id,
        key: `INTL/receipt-consent/${randomUUID()}`,
        type: "application/pdf",
        size: 32,
        purpose: "consent",
        status: "READY",
      },
    });
    const consent = await h.db.consent.create({
      data: {
        childId: child.u.id,
        guardianId: guardian.u.id,
        documentId: document.id,
        status: "APPROVED",
        publicPosting: false,
        recording: false,
      },
    });
    await withAppAttestationHttp(
      h.db as Db,
      h.infra(),
      async (f) => {
        const { key } = await enroll(f, child),
          before = await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          });
        f.pause(async () => {
          await h.db.consent.update({
            where: { id: consent.id },
            data: { status: "REVOKED" },
          });
        });
        assert.equal(
          (
            await f.call(
              `/keys/${key.id}/refresh`,
              { expectedVersion: 0 },
              child.token,
            )
          ).status,
          403,
        );
        assert.deepEqual(
          await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          }),
          before,
        );
        assert.equal(f.appleCalls(), 1);
        assert.deepEqual(f.errors, []);
      },
      { receipt: true },
    );
  });

  test("Apple receipt refresh is owner-only, encrypted, versioned and deferred without extending existing trust", async () => {
    const p = await h.fixture("apple-refresh-owner", "1990-01-01"),
      other = await h.fixture("apple-refresh-other", "1990-01-01");
    await withAppAttestationHttp(
      h.db as Db,
      h.infra(),
      async (f) => {
        const { key } = await enroll(f, p),
          a = await attempt(h.db, p);
        const old = await h.db.appAttestationKey.findUniqueOrThrow({
          where: { id: key.id },
        });
        assert.equal(
          (
            await f.call(
              `/keys/${key.id}/refresh`,
              { expectedVersion: 0 },
              other.token,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await f.call(
              `/keys/${key.id}/refresh`,
              { expectedVersion: 1 },
              p.token,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await f.call(
              `/keys/${key.id}/refresh`,
              { expectedVersion: "0" },
              p.token,
            )
          ).status,
          400,
        );
        assert.equal(f.appleCalls(), 0);
        const beforeRisk = await f.call(
          "/challenges",
          {
            kind: "action",
            provider: "apple-app-attest",
            keyId: key.id,
            attemptId: a.id,
            operation: "inspect",
            body: { nonce: a.nonce },
          },
          p.token,
        );
        assert.equal(beforeRisk.status, 403);
        const result = await f.call(
          `/keys/${key.id}/refresh`,
          { expectedVersion: 0 },
          p.token,
        );
        assert.equal(result.status, 201, JSON.stringify(f.errors));
        assert.equal(result.body.refreshed, true);
        assert.equal(result.body.assessment, "accepted");
        assert.equal(result.body.rankingEligible, false);
        const row = await h.db.appAttestationKey.findUniqueOrThrow({
          where: { id: key.id },
        });
        assert.equal(row.version, 1);
        assert.equal(row.counter, 0n);
        assert.notEqual(row.receiptCiphertext, old.receiptCiphertext);
        const stored = f.crypto.open(
          {
            region: f.config.REGION,
            userId: p.u.id,
            id: row.id,
            keyIdHash: row.keyIdHash,
          },
          row.receiptCiphertext!,
        );
        assert.equal(stored.receipt.type, "RECEIPT");
        assert.equal(stored.receipt.riskMetric, 3);
        assert.equal(
          row.receiptCiphertext!.includes(stored.receiptBase64),
          false,
        );
        const early = await f.call(
          `/keys/${key.id}/refresh`,
          { expectedVersion: 1 },
          p.token,
        );
        assert.equal(early.status, 201);
        assert.equal(early.body.refreshed, false);
        assert.equal(f.appleCalls(), 1);
        assert.deepEqual(
          await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          }),
          row,
        );
        const c = await actionChallenge(f, p, key.id, a);
        assert.equal(
          (await f.call("/verify", f.assertion(c, 1), p.token)).status,
          201,
        );
        assert.deepEqual(f.errors, []);
      },
      { receipt: true },
    );
  });
  test("Apple receipt refresh preserves an actual concurrent assertion counter and its valid action grant", async () => {
    const p = await h.fixture("apple-refresh-counter", "1990-01-01");
    await withAppAttestationHttp(
      h.db as Db,
      h.infra(),
      async (f) => {
        const { key } = await enroll(f, p),
          a = await attempt(h.db, p);
        f.receiptResponse({ notBeforeDelayMs: 1 });
        assert.equal(
          (
            await f.call(
              `/keys/${key.id}/refresh`,
              { expectedVersion: 0 },
              p.token,
            )
          ).status,
          201,
        );
        let grantId = "";
        f.pause(async () => {
          const c = await actionChallenge(f, p, key.id, a);
          const proof = await f.call("/verify", f.assertion(c, 1), p.token);
          assert.equal(proof.status, 201);
          grantId = proof.body.grantId;
        });
        const result = await f.call(
          `/keys/${key.id}/refresh`,
          { expectedVersion: 1 },
          p.token,
        );
        assert.equal(result.status, 201, JSON.stringify(f.errors));
        assert.equal(result.body.refreshed, true);
        const row = await h.db.appAttestationKey.findUniqueOrThrow({
          where: { id: key.id },
        });
        assert.equal(row.version, 3);
        assert.equal(row.counter, 1n);
        assert.equal(f.appleCalls(), 2);
        await consume(h, f, await h.actor(p), grantId, a);
        assert.ok(
          (
            await h.db.appAttestationGrant.findUniqueOrThrow({
              where: { id: grantId },
            })
          ).consumedAt,
        );
        assert.deepEqual(f.errors, []);
      },
      { receipt: true },
    );
  });
  test("Apple receipt risk policy blocks game proofs and provider errors cannot replace encrypted trust", async () => {
    const p = await h.fixture("apple-refresh-risk", "1990-01-01");
    await withAppAttestationHttp(
      h.db as Db,
      h.infra(),
      async (f) => {
        const { key } = await enroll(f, p);
        const before = await h.db.appAttestationKey.findUniqueOrThrow({
          where: { id: key.id },
        });
        f.receiptResponse({ status: 401 });
        assert.equal(
          (
            await f.call(
              `/keys/${key.id}/refresh`,
              { expectedVersion: 0 },
              p.token,
            )
          ).status,
          503,
        );
        assert.deepEqual(
          await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          }),
          before,
        );
        f.receiptResponse({ risk: 20 });
        const result = await f.call(
          `/keys/${key.id}/refresh`,
          { expectedVersion: 0 },
          p.token,
        );
        assert.equal(result.status, 201);
        assert.equal(result.body.assessment, "review-required");
        assert.equal(result.body.rankingEligible, false);
        const a = await attempt(h.db, p);
        assert.equal(
          (
            await f.call(
              "/challenges",
              {
                kind: "action",
                provider: "apple-app-attest",
                keyId: key.id,
                attemptId: a.id,
                operation: "inspect",
                body: { nonce: a.nonce },
              },
              p.token,
            )
          ).status,
          403,
        );
        assert.deepEqual(f.errors, []);
      },
      { receipt: true },
    );
  });
  test("Apple receipt refresh discards provider results after revocation, policy change or session expiry", async () => {
    for (const change of ["revoke", "policy", "session"] as const) {
      const p = await h.fixture("apple-refresh-race-" + change, "1990-01-01");
      await withAppAttestationHttp(
        h.db as Db,
        h.infra(),
        async (f) => {
          const { key } = await enroll(f, p);
          const before = await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          });
          f.pause(async () => {
            if (change === "revoke")
              assert.equal(
                (
                  await f.call(
                    `/keys/${key.id}`,
                    { expectedVersion: 0 },
                    p.token,
                    "DELETE",
                  )
                ).status,
                200,
              );
            else if (change === "policy")
              f.config.APP_ATTESTATION_APPLE_RISK_MAX = 99;
            else
              await h.db.session.updateMany({
                where: { tokenHash: hash(p.token) },
                data: { expiresAt: new Date(Date.now() - 1000) },
              });
          });
          assert.equal(
            (
              await f.call(
                `/keys/${key.id}/refresh`,
                { expectedVersion: 0 },
                p.token,
              )
            ).status,
            403,
          );
          const after = await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          });
          if (change === "revoke") {
            assert.equal(after.status, "REVOKED");
            assert.equal(after.receiptCiphertext, null);
          } else assert.deepEqual(after, before);
          assert.deepEqual(f.errors, []);
        },
        { receipt: true },
      );
    }
  });
  test("Apple receipt exchange stays unavailable without its explicit operator gate", async () => {
    const p = await h.fixture("apple-refresh-off", "1990-01-01");
    await withAppAttestationHttp(h.db as Db, h.infra(), async (f) => {
      const { key } = await enroll(f, p);
      assert.equal(
        (
          await f.call(
            `/keys/${key.id}/refresh`,
            { expectedVersion: 0 },
            p.token,
          )
        ).status,
        403,
      );
      assert.equal(f.appleCalls(), 0);
      assert.deepEqual(f.errors, []);
    });
  });
}
