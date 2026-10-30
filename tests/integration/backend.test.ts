import { registerStepLessonCases } from "../helpers/step-lesson-cases";
import { registerServerRegionCases } from "../helpers/server-region-cases";
import { registerAppleReceiptScheduleCases } from "../helpers/apple-receipt-schedule-cases";
import { registerActivityCalendarCases } from "../helpers/activity-calendar-cases";
import { registerConsentDocumentCases } from "../helpers/consent-document-cases";
import { syntheticConsentReview } from "../helpers/consent-review-proof";
import { simulatedModeration } from "../../scripts/mock-ai-protocol.mjs";
import "reflect-metadata";
import { ServiceUnavailableException } from "@nestjs/common";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  spawn,
  execFile as execFileCb,
  type ChildProcess,
} from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, mkdtemp, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  registerAppAttestationCases,
  registerPlayIntegrityCases,
  registerAppleReceiptRefreshCases,
} from "../helpers/app-attestation-cases";
import { createServer } from "node:http";
import { once } from "node:events";
import { authenticator } from "otplib";
import { io } from "socket.io-client";
import * as THREE from "three";
import {
  buildPyraminxGroup,
  clearPyraminxGroup,
  pyraminxTurnAt,
} from "../../apps/mobile/src/pyraminx-scene";
import {
  lessons,
  PublicLegalDocument,
  inverse,
  facelets,
  solvedCube,
  applyMoves,
  practiceSetup,
  practiceApply,
  practiceMatches,
  isPyraminx,
  pyraminxFacelets,
  pyraminxApply,
  solvedPyraminx,
  algorithmCases,
  observeLastLayer,
  openOfflineGuidance,
  DownloadedLesson,
  guidedCourseId,
  practiceSolved,
  solvedPuzzle,
  ProfileSettings,
  pyraminxInverse,
  type AssessmentTask,
  type AssessmentView,
  type GuidedSolveView,
  type Lesson,
  fromFacelets,
  firstSolveGoal,
  guidedState,
  guidedFacelets,
  guidedGoal,
  pyraminxOrientations,
  cubePieces,
  PYRA_POINTS,
  PYRA_VERTICES,
  pyraminxTurn,
  serviceError,
  localizeServiceSuccess,
} from "@cubers/core";
import { passwordHash, opaque, hash } from "../../apps/api/src/crypto";
import {
  DeviceTesting,
  expireDeviceTests,
} from "../../apps/api/src/device-testing";
import {
  deviceTestFixture,
  declaredPassingDeviceTest,
} from "../helpers/device-test-fixture";
import sharp from "sharp";
import {
  imageAiXmp,
  readImageAiMetadata,
} from "../../apps/api/src/image-ai-metadata";
import { readVideoAiMetadata } from "../../apps/api/src/video-ai-metadata";
import { Background } from "../../apps/api/src/worker";
import { Operations } from "../../apps/api/src/operations";
import { OperationsController } from "../../apps/api/src/operations.controller";
import { OperationalSnapshot } from "@cubers/core";
import {
  Announcements,
  expireAnnouncements,
} from "../../apps/api/src/announcements";
import { accountPolicy, type Authed } from "../../apps/api/src/security";
import { CommunityController } from "../../apps/api/src/community.controller";
import { AdminController } from "../../apps/api/src/admin.controller";
import { Competitions } from "../../apps/api/src/competitions";
import { Campaigns } from "../../apps/api/src/campaigns";
import {
  WCA_PROGRAM,
  WCA_EVENTS,
  parseWcaSet,
} from "../../apps/api/src/wca-scrambles";
import { PlayGateway } from "../../apps/api/src/gateway";
import { PlayController } from "../../apps/api/src/play.controller";
import { Db, Infrastructure } from "../../apps/api/src/services";
import { readConfig } from "../../apps/api/src/config";
import { notifyUser } from "../../apps/api/src/notifications";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
const execFile = promisify(execFileCb),
  processes: ChildProcess[] = [],
  runId = randomUUID().slice(0, 8);
const dbUrl = "postgresql://cubers:cubers_dev_only@127.0.0.1:54329/cubers_test",
  cnUrl = "postgresql://cubers:cubers_dev_only@127.0.0.1:54329/cubers_cn_test";
const db = new PrismaClient({ datasourceUrl: dbUrl }),
  cnDb = new PrismaClient({ datasourceUrl: cnUrl });
const origin = "http://127.0.0.1:3101",
  cnOrigin = "http://127.0.0.1:3102";
let adminToken: string,
  adultToken: string,
  childToken: string,
  teenToken: string,
  childId: string,
  consentId: string,
  adminId: string,
  adultId: string;
let infrastructure: Infrastructure;
registerActivityCalendarCases({ db, origin, cnOrigin, fixture, call });
registerStepLessonCases({
  db,
  fixture,
  call,
  actor: communityActor,
  infra: () => infrastructure,
});
registerServerRegionCases({
  db: db as Db,
  fixture,
  infrastructure: () => infrastructure,
});
registerConsentDocumentCases({
  db,
  fixture,
  actor: communityActor,
  infra: () => infrastructure,
  call,
});
registerAppAttestationCases({
  db,
  cnDb,
  infra: () => infrastructure,
  fixture,
  actor: communityActor,
  call,
  lockDelay: learningLockDelay,
});
registerPlayIntegrityCases({
  db,
  cnDb,
  infra: () => infrastructure,
  fixture,
  actor: communityActor,
  call,
  lockDelay: learningLockDelay,
});
registerAppleReceiptRefreshCases({
  db,
  cnDb,
  infra: () => infrastructure,
  fixture,
  actor: communityActor,
  call,
  lockDelay: learningLockDelay,
});
registerAppleReceiptScheduleCases({
  db,
  cnDb,
  infra: () => infrastructure,
  fixture,
  actor: communityActor,
  call,
  lockDelay: learningLockDelay,
});
async function call(
  path: string,
  body?: unknown,
  token?: string,
  method?: string,
  base = origin,
) {
  const response = await fetch(`${base}/v1/${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
async function waitFor(fn: () => Promise<boolean>, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await fn()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Local service did not become ready");
}
async function fixture(
  name: string,
  birthDate: string,
  role = "USER",
  verified = true,
) {
  const secret = role === "ADMIN" ? authenticator.generateSecret() : null;
  const u = await db.user.create({
    data: {
      email: `${name}-${runId}@cubers.test`,
      displayName: `Test ${name}`,
      birthDate,
      passwordHash: await passwordHash("test-password-not-production"),
      region: "INTL",
      emailVerified: true,
      adultVerified: verified,
      identityVerified: verified,
      role,
      mfaSecret: secret,
      privateProfile: true,
    },
  });
  const token = opaque();
  await db.session.create({
    data: {
      tokenHash: hash(token),
      userId: u.id,
      mfaVerified: role === "ADMIN",
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return { u, token, secret };
}
before(
  async () => {
    const master = new PrismaClient({
      datasourceUrl:
        "postgresql://cubers:cubers_dev_only@127.0.0.1:54329/cubers",
    });
    for (const database of ["cubers_test", "cubers_cn_test"]) {
      const found = await master.$queryRawUnsafe<{ exists: boolean }[]>(
        `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname='${database}')`,
      );
      if (!found[0].exists)
        await master.$executeRawUnsafe(`CREATE DATABASE ${database}`);
    }
    await master.$disconnect();
    const raw = await readFile(".env.example", "utf8");
    const base = Object.fromEntries(
      raw
        .split("\n")
        .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
    for (const [region, url, port] of [
      ["INTL", dbUrl, "3101"],
      ["CN", cnUrl, "3102"],
    ]) {
      const env = {
        ...process.env,
        ...base,
        NODE_ENV: "test",
        REGION: region,
        DATABASE_URL: url,
        PORT: port,
        WORKER_ENABLED: "false",
        AI_API_KEY: "",
        OPENAI_API_KEY: "",
        QWEN_API_KEY: "",
        AI_MODE: "mock",
        SPONSORS_APPROVED: region === "INTL" ? "true" : "false",
        AI_BASE_URL: "http://127.0.0.1:4010/v1",
        AI_MODEL: "cubers-simulator",
        CN_SOCIAL_APPROVED: "true",
        CN_GAMES_APPROVED: "true",
        S3_BUCKET: region === "CN" ? "cubers-cn" : "cubers-intl",
        S3_ACCESS_KEY: "S3RVER",
        S3_SECRET_KEY: "S3RVER",
      };
      if (region === "INTL")
        infrastructure = new Infrastructure(readConfig(env));
      await execFile(
        process.execPath,
        [
          "node_modules/prisma/build/index.js",
          "migrate",
          "deploy",
          "--schema",
          "apps/api/prisma/schema.prisma",
        ],
        { env },
      );
      const p = spawn(process.execPath, ["apps/api/dist/main.js"], {
        env,
        stdio: "ignore",
      });
      processes.push(p);
      await waitFor(async () => {
        return (await fetch(`http://127.0.0.1:${port}/v1/health`)).ok;
      });
    }
    // Remove only previous synthetic custom courses in this reserved test database.
    await db.course.deleteMany({ where: { id: { startsWith: "custom-" } } });
    // Repeated local runs must not exhaust the real 500-event regional limit.
    // Match only this harness's earlier bilingual synthetic schedule marker;
    // neither application data nor the production capacity rule is changed.
    const oldSchedules = await db.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Competition" WHERE title->>'en' ~ '^Competition [0-9a-f]{8}$' AND title->>'zh'='测试比赛'`;
    if (oldSchedules.length)
      await db.$transaction(async (tx) => {
        const ids = oldSchedules.map((x) => x.id);
        await tx.room.deleteMany({
          where: { competitionEntry: { competitionId: { in: ids } } },
        });
        await tx.competition.deleteMany({ where: { id: { in: ids } } });
      });
    for (const l of lessons)
      await db.course.upsert({
        where: { id: l.id },
        create: {
          id: l.id,
          puzzle: l.puzzle,
          level: l.level,
          content: l as any,
          published: true,
        },
        update: { content: l as any, published: true },
      });
    const admin = await fixture("reviewer", "1990-01-01", "ADMIN"),
      adult = await fixture("adult", "1995-01-01"),
      child = await fixture("child", "2018-01-01", "USER", false),
      teen = await fixture("teen", "2010-01-01", "USER", false);
    adminToken = admin.token;
    adminId = admin.u.id;
    adultToken = adult.token;
    adultId = adult.u.id;
    childToken = child.token;
    childId = child.u.id;
    teenToken = teen.token;
    const doc = await db.media.create({
      data: {
        userId: adultId,
        key: `INTL/${runId}/signed-test-consent`,
        type: "application/pdf",
        size: 32,
        purpose: "consent",
        status: "READY",
      },
    });
    const consent = await db.consent.create({
      data: {
        childId,
        guardianId: adultId,
        documentId: doc.id,
        status: "PENDING",
        publicPosting: true,
        recording: false,
      },
    });
    consentId = consent.id;
  },
  { timeout: 60000 },
);
after(async () => {
  for (const p of processes) p.kill("SIGTERM");
  await Promise.all([db.$disconnect(), cnDb.$disconnect()]);
  await infrastructure?.close();
});
test("community post writes recheck a captured session after a real account lock wait", async () => {
  const person = await fixture("community-captured-session", "1990-01-01"),
    session = await db.session.findUniqueOrThrow({
      where: { tokenHash: hash(person.token) },
    }),
    actor = {
      user: person.u,
      policy: await accountPolicy(db, person.u),
      sessionId: session.id,
    } as Authed,
    service = new CommunityController(db as Db, infrastructure);
  let release!: () => void, acquired!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
  const blocker = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${person.u.id}::uuid FOR UPDATE`;
      acquired();
      await gate;
      await tx.session.delete({ where: { id: session.id } });
    },
    { timeout: 10000 },
  );
  await locked;
  const result = service
    .create(actor, { body: "Captured permission must not create this post" })
    .then(
      () => ({ status: 201 }),
      (error) => ({ status: error.getStatus?.() ?? 500 }),
    );
  let waiting = false;
  try {
    for (let i = 0; i < 100; i++) {
      const rows = await db.$queryRaw<
        { waiting: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT id FROM "User"%') AS waiting`;
      if (rows[0].waiting) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    release();
    await blocker;
  }
  assert.equal(waiting, true, "The write must actually wait before revocation");
  assert.equal((await result).status, 403);
  assert.equal(await db.post.count({ where: { authorId: person.u.id } }), 0);
});
async function communityActor(person: Awaited<ReturnType<typeof fixture>>) {
  const session = await db.session.findUniqueOrThrow({
    where: { tokenHash: hash(person.token) },
  });
  return {
    user: person.u,
    policy: await accountPolicy(db, person.u),
    sessionId: session.id,
  } as Authed;
}
async function communityLockRace(
  userId: string,
  action: () => Promise<unknown>,
  change: (tx: any) => Promise<unknown>,
) {
  let release!: () => void, acquired!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
  const blocker = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
      acquired();
      await gate;
      await change(tx);
    },
    { timeout: 10000 },
  );
  await locked;
  const result = action().then(
    (value) => ({ value, error: null }),
    (error) => ({ value: null, error }),
  );
  let waiting = false;
  try {
    for (let i = 0; i < 100; i++) {
      const rows = await db.$queryRaw<
        { waiting: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT id FROM "User"%') AS waiting`;
      if (rows[0].waiting) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    release();
    await blocker;
  }
  assert.equal(
    waiting,
    true,
    "The action must actually wait for account authority",
  );
  return result;
}
test("community authority rechecks full scope, account state, regional identity and guardian permissions after locks", async () => {
  const service = new CommunityController(db as Db, infrastructure);
  for (const change of [
    "scope",
    "email",
    "deleted",
    "region",
    "identity",
  ] as const) {
    const person = await fixture(`community-authority-${change}`, "1990-01-01");
    if (change === "identity")
      person.u = await db.user.update({
        where: { id: person.u.id },
        data: { region: "CN" },
      });
    const actor = await communityActor(person),
      target =
        change === "identity" ? Object.create(infrastructure) : infrastructure;
    if (change === "identity")
      target.config = {
        ...infrastructure.config,
        REGION: "CN",
        CN_SOCIAL_APPROVED: "true",
      };
    const controller =
      change === "identity"
        ? new CommunityController(db as Db, target)
        : service;
    const denied = await communityLockRace(
      person.u.id,
      () =>
        controller.create(actor, {
          body: "Stale account policy cannot create a post",
        }),
      (tx) =>
        change === "scope"
          ? tx.session.update({
              where: { id: actor.sessionId },
              data: { scope: "DELETION" },
            })
          : tx.user.update({
              where: { id: person.u.id },
              data:
                change === "email"
                  ? { emailVerified: false }
                  : change === "deleted"
                    ? { deletedAt: new Date() }
                    : change === "region"
                      ? { region: "CN" }
                      : { identityVerified: false },
            }),
    );
    assert.equal(denied.error?.getStatus(), 403, change);
    assert.equal(await db.post.count({ where: { authorId: person.u.id } }), 0);
  }
  for (const change of ["posting", "guardian"] as const) {
    const parent = await fixture(`community-parent-${change}`, "1985-01-01"),
      child = await fixture(`community-child-${change}`, "2018-01-01");
    await db.consent.create({
      data: {
        childId: child.u.id,
        guardianId: parent.u.id,
        documentId: randomUUID(),
        status: "APPROVED",
        publicPosting: true,
      },
    });
    const actor = await communityActor(child);
    const denied = await communityLockRace(
      change === "guardian" ? parent.u.id : child.u.id,
      () =>
        service.create(actor, {
          body: "Guardian permission must stay current",
        }),
      (tx) =>
        change === "guardian"
          ? tx.user.update({
              where: { id: parent.u.id },
              data: { adultVerified: false },
            })
          : tx.consent.update({
              where: { childId: child.u.id },
              data: { publicPosting: false },
            }),
    );
    assert.equal(denied.error?.getStatus(), 403, change);
    assert.equal(await db.post.count({ where: { authorId: child.u.id } }), 0);
  }
});
test("community authority protects every community mutation from a captured revoked session", async () => {
  const person = await fixture("community-all-writes", "1985-01-01"),
    peer = await fixture("community-write-peer", "1990-01-01"),
    child = await fixture("community-write-child", "2018-01-01"),
    actor = await communityActor(person),
    service = new CommunityController(db as Db, infrastructure);
  const ownPost = await db.post.create({
      data: { authorId: person.u.id, body: "Own retained draft" },
    }),
    publicPost = await db.post.create({
      data: {
        authorId: peer.u.id,
        body: "Synthetic reviewed conversation",
        status: "PUBLISHED",
        moderatorApproved: true,
        guardianApproved: true,
      },
    }),
    ownClub = await db.club.create({
      data: {
        ownerId: person.u.id,
        name: "Synthetic owner club",
        description: "Synthetic authority check",
        private: true,
        status: "APPROVED",
      },
    }),
    leaveClub = await db.club.create({
      data: {
        ownerId: peer.u.id,
        name: "Synthetic leave club",
        description: "Synthetic authority check",
        private: false,
        status: "APPROVED",
      },
    }),
    joinClub = await db.club.create({
      data: {
        ownerId: peer.u.id,
        name: "Synthetic join club",
        description: "Synthetic authority check",
        private: false,
        status: "APPROVED",
      },
    });
  await db.membership.createMany({
    data: [
      { clubId: ownClub.id, userId: person.u.id, status: "APPROVED" },
      { clubId: ownClub.id, userId: peer.u.id, status: "PENDING" },
      { clubId: leaveClub.id, userId: person.u.id, status: "APPROVED" },
    ],
  });
  await db.consent.create({
    data: {
      childId: child.u.id,
      guardianId: person.u.id,
      documentId: randomUUID(),
      status: "APPROVED",
      publicPosting: true,
    },
  });
  const childPost = await db.post.create({
    data: { authorId: child.u.id, body: "Pending child draft" },
  });
  await db.session.delete({ where: { id: actor.sessionId } });
  const clubBody = {
    name: "Changed club",
    description: "Must not persist",
    private: false,
  };
  for (const action of [
    () => service.create(actor, { body: "Must not persist" }),
    () =>
      service.edit(actor, ownPost.id, {
        body: "Must not persist",
        revision: 1,
      }),
    () => service.remove(actor, ownPost.id),
    () => service.guardianApprove(actor, childPost.id, { revision: 1 }),
    () => service.comment(actor, publicPost.id, { body: "Must not persist" }),
    () =>
      service.social(actor, {
        targetId: peer.u.id,
        kind: "block",
        enabled: true,
      }),
    () =>
      service.social(actor, {
        targetId: publicPost.id,
        kind: "like",
        enabled: true,
      }),
    () =>
      service.report(actor, {
        targetId: publicPost.id,
        reason: "Must not persist this report",
      }),
    () => service.createClub(actor, clubBody),
    () => service.editClub(actor, ownClub.id, clubBody),
    () => service.rotateInvite(actor, ownClub.id),
    () => service.join(actor, joinClub.id),
    () => service.acceptInvite(actor, { code: joinClub.inviteCode }),
    () => service.leave(actor, leaveClub.id),
    () => service.approveMember(actor, ownClub.id, peer.u.id, {}),
  ])
    await assert.rejects(action(), (e: any) => e.getStatus?.() === 403);
  assert.equal(
    (await db.post.findUniqueOrThrow({ where: { id: ownPost.id } })).revision,
    1,
  );
  assert.equal(
    (await db.post.findUniqueOrThrow({ where: { id: childPost.id } }))
      .guardianApproved,
    false,
  );
  assert.equal(
    (await db.club.findUniqueOrThrow({ where: { id: ownClub.id } })).inviteCode,
    ownClub.inviteCode,
  );
  assert.equal(await db.club.count({ where: { ownerId: person.u.id } }), 1);
  assert.equal(
    (
      await db.membership.findUniqueOrThrow({
        where: { clubId_userId: { clubId: ownClub.id, userId: peer.u.id } },
      })
    ).status,
    "PENDING",
  );
  assert.equal(
    (
      await db.membership.findUniqueOrThrow({
        where: { clubId_userId: { clubId: leaveClub.id, userId: person.u.id } },
      })
    ).status,
    "APPROVED",
  );
  assert.equal(
    await db.membership.count({
      where: { clubId: joinClub.id, userId: person.u.id },
    }),
    0,
  );
  assert.equal(await db.comment.count({ where: { authorId: person.u.id } }), 0);
  assert.equal(await db.social.count({ where: { actorId: person.u.id } }), 0);
  assert.equal(
    await db.report.count({ where: { reporterId: person.u.id } }),
    0,
  );
});
test("community authority rejects an HTTP post revoked after its initial session check", async () => {
  const person = await fixture("community-http-revocation", "1990-01-01"),
    actor = await communityActor(person);
  const denied = await communityLockRace(
    person.u.id,
    () =>
      call(
        "posts",
        { body: "HTTP authorization must stay current" },
        person.token,
      ),
    (tx) => tx.session.delete({ where: { id: actor.sessionId } }),
  );
  assert.equal((denied.value as any).status, 403);
  assert.equal(await db.post.count({ where: { authorId: person.u.id } }), 0);
});
test("community authority rolls back an edit after session expiry during a real content lock wait", async () => {
  const person = await fixture("community-content-expiry", "1990-01-01"),
    actor = await communityActor(person),
    service = new CommunityController(db as Db, infrastructure),
    post = await db.post.create({
      data: { authorId: person.u.id, body: "Original retained draft" },
    }),
    expiresAt = new Date(Date.now() + 2200);
  await db.session.update({
    where: { id: actor.sessionId },
    data: { expiresAt },
  });
  let release!: () => void, acquired!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
  const blocker = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Post" WHERE id=${post.id}::uuid FOR UPDATE`;
      acquired();
      await gate;
    },
    { timeout: 10000 },
  );
  await locked;
  const result = service
    .edit(actor, post.id, { body: "Expired edit must roll back", revision: 1 })
    .then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error }),
    );
  try {
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      const rows = await db.$queryRaw<
        { waiting: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT id FROM "Post"%') AS waiting`;
      if (rows[0].waiting) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(waiting, true, "The edit must wait on the actual content row");
    // Ordinary private notification FK checks must not deadlock behind the
    // authority lock while another action is waiting for content.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout='1000ms'`;
      await tx.notification.create({
        data: {
          userId: person.u.id,
          category: "REVIEW",
          title: "Synthetic update",
          body: "Lock compatibility check",
        },
      });
    });
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, expiresAt.getTime() - Date.now() + 80)),
    );
  } finally {
    release();
    await blocker;
  }
  assert.equal((await result).error?.getStatus(), 403);
  const saved = await db.post.findUniqueOrThrow({ where: { id: post.id } });
  assert.equal(saved.body, post.body);
  assert.equal(saved.revision, 1);
});
function communityAdmin() {
  return new AdminController(
    db as Db,
    infrastructure,
    new Competitions(db as Db, infrastructure),
    new Campaigns(db as Db, infrastructure),
  );
}
test("community administration rejects captured roles, factors, sessions and regional account authority", async () => {
  const peer = await fixture("community-admin-peer", "1990-01-01"),
    child = await fixture("community-admin-child", "2018-01-01"),
    service = communityAdmin(),
    post = await db.post.create({
      data: { authorId: peer.u.id, body: "Unreviewed synthetic draft" },
    }),
    comment = await db.comment.create({
      data: { authorId: peer.u.id, postId: post.id, body: "Unreviewed reply" },
    }),
    club = await db.club.create({
      data: {
        ownerId: peer.u.id,
        name: "Unreviewed synthetic club",
        description: "Authority test",
      },
    }),
    consent = await db.consent.create({
      data: {
        childId: child.u.id,
        guardianId: peer.u.id,
        documentId: randomUUID(),
        status: "PENDING",
      },
    }),
    report = await db.report.create({
      data: {
        reporterId: peer.u.id,
        targetId: post.id,
        reason: "Synthetic review check",
      },
    }),
    room = await db.room.create({
      data: {
        ownerId: peer.u.id,
        code: randomUUID(),
        puzzle: "3x3",
        input: "scan",
        mode: "race",
        ranked: true,
        private: true,
      },
    }),
    attempt = await db.attempt.create({
      data: {
        userId: peer.u.id,
        roomId: room.id,
        nonce: randomUUID(),
        scramble: [],
        status: "PROVISIONAL",
      },
    }),
    aiBefore = await db.setting.findUnique({ where: { key: "ai" } });
  for (const change of [
    "role",
    "factor",
    "mfa",
    "scope",
    "session",
    "email",
    "region",
  ] as const) {
    const staff = await fixture(
        `community-admin-${change}`,
        "1985-01-01",
        "ADMIN",
      ),
      actor = await communityActor(staff);
    if (change === "session")
      await db.session.delete({ where: { id: actor.sessionId } });
    else if (change === "mfa" || change === "scope")
      await db.session.update({
        where: { id: actor.sessionId },
        data: change === "mfa" ? { mfaVerified: false } : { scope: "DELETION" },
      });
    else
      await db.user.update({
        where: { id: staff.u.id },
        data:
          change === "role"
            ? { role: "USER" }
            : change === "factor"
              ? { mfaGeneration: { increment: 1 } }
              : change === "email"
                ? { emailVerified: false }
                : { region: "CN" },
      });
    for (const action of [
      () =>
        service.post(actor, post.id, {
          approve: true,
          revision: 1,
          reason: "Synthetic independent review",
        }),
      () =>
        service.consent(actor, consent.id, {
          approve: true,
          reason: "Synthetic independent consent review",
          signedDocumentChecked: true,
          guardianIdentityChecked: true,
          relationshipChecked: true,
        }),
      () =>
        service.review(actor, "club", club.id, {
          approve: true,
          revision: 1,
          reason: "Synthetic review",
        }),
      () =>
        service.review(actor, "comment", comment.id, {
          approve: false,
          reason: "Synthetic review",
        }),
      () =>
        service.review(actor, "report", report.id, {
          approve: true,
          reason: "Synthetic review",
        }),
      () =>
        service.attempt(actor, attempt.id, {
          approve: false,
          reason: "Synthetic evidence review",
          evidenceChecked: true,
          uninterrupted: false,
          scrambleMatches: false,
          cubeAndHandsVisible: false,
          finalStateSolved: false,
        }),
      () =>
        service.eligibility(actor, peer.u.id, {
          identityVerified: false,
          adultVerified: false,
          proofReviewed: true,
          reason: "Synthetic eligibility review",
        }),
      () =>
        service.ai(actor, {
          baseUrl: "http://127.0.0.1:4010/v1",
          model: "cubers-simulator",
          enabled: true,
        }),
    ])
      await assert.rejects(
        action(),
        (e: any) => e.getStatus?.() === 403,
        change,
      );
    assert.equal(await db.audit.count({ where: { actorId: staff.u.id } }), 0);
  }
  const staff = await fixture("community-admin-lock", "1985-01-01", "ADMIN"),
    actor = await communityActor(staff);
  const denied = await communityLockRace(
    staff.u.id,
    () =>
      service.post(actor, post.id, {
        approve: true,
        revision: 1,
        reason: "Must not persist stale review",
      }),
    (tx) =>
      tx.user.update({ where: { id: staff.u.id }, data: { role: "USER" } }),
  );
  assert.equal(denied.error?.getStatus(), 403);
  assert.equal(await db.audit.count({ where: { actorId: staff.u.id } }), 0);
  assert.equal(
    (await db.post.findUniqueOrThrow({ where: { id: post.id } })).status,
    "PENDING",
  );
  assert.equal(
    (await db.comment.findUniqueOrThrow({ where: { id: comment.id } })).status,
    "PENDING",
  );
  assert.equal(
    (await db.club.findUniqueOrThrow({ where: { id: club.id } })).status,
    "PENDING",
  );
  assert.equal(
    (await db.consent.findUniqueOrThrow({ where: { id: consent.id } })).status,
    "PENDING",
  );
  assert.equal(
    (await db.report.findUniqueOrThrow({ where: { id: report.id } })).status,
    "OPEN",
  );
  assert.equal(
    (await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status,
    "PROVISIONAL",
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: peer.u.id } }))
      .adultVerified,
    true,
  );
  assert.deepEqual(
    await db.setting.findUnique({ where: { key: "ai" } }),
    aiBefore,
  );
});
test("community administration rolls back review, audit and notifications after content-lock session expiry", async () => {
  const staff = await fixture("community-review-expiry", "1985-01-01", "ADMIN"),
    author = await fixture("community-review-expiry-author", "1990-01-01"),
    actor = await communityActor(staff),
    admin = communityAdmin(),
    post = await db.post.create({
      data: {
        authorId: author.u.id,
        body: "Unreviewed expiry fixture",
        guardianApproved: true,
      },
    }),
    expiresAt = new Date(Date.now() + 2200);
  await db.session.update({
    where: { id: actor.sessionId },
    data: { expiresAt },
  });
  let release!: () => void, acquired!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
  const blocker = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Post" WHERE id=${post.id}::uuid FOR UPDATE`;
      acquired();
      await gate;
    },
    { timeout: 10000 },
  );
  await locked;
  const result = admin
    .post(actor, post.id, {
      approve: true,
      revision: 1,
      reason: "Expired review must fully roll back",
    })
    .then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error }),
    );
  try {
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      const rows = await db.$queryRaw<
        { waiting: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%UPDATE%Post%') AS waiting`;
      if (rows[0].waiting) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(
      waiting,
      true,
      "The review must wait on its actual database update",
    );
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, expiresAt.getTime() - Date.now() + 80)),
    );
  } finally {
    release();
    await blocker;
  }
  assert.equal((await result).error?.getStatus(), 403);
  assert.equal(
    (await db.post.findUniqueOrThrow({ where: { id: post.id } })).status,
    "PENDING",
  );
  assert.equal(await db.audit.count({ where: { actorId: staff.u.id } }), 0);
  assert.equal(
    await db.notification.count({ where: { userId: author.u.id } }),
    0,
  );
});
test("mock AI configuration rechecks staff authority after model validation without holding account locks across HTTP", async () => {
  const staff = await fixture(
      "community-ai-probe-authority",
      "1985-01-01",
      "ADMIN",
    ),
    actor = await communityActor(staff),
    admin = communityAdmin(),
    before = await db.setting.findUnique({ where: { key: "ai" } });
  let release!: () => void, reached!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    requested = new Promise<void>((resolve) => {
      reached = resolve;
    });
  let requests = 0;
  const mock = createServer(async (req, res) => {
    if (req.url === "/v1/moderations") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(simulatedModeration()));
      return;
    }
    assert.equal(req.url, "/v1/models");
    assert.equal(
      req.headers.authorization,
      undefined,
      "No real credential is sent to simulated AI",
    );
    requests++;
    reached();
    await gate;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: [{ id: "cubers-simulator" }] }));
  });
  mock.listen(0, "127.0.0.1");
  await once(mock, "listening");
  const port = (mock.address() as { port: number }).port;
  const result = admin
    .ai(actor, {
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: "cubers-simulator",
      enabled: true,
    })
    .then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error }),
    );
  try {
    await Promise.race([
      requested,
      result.then(() => {
        throw new Error("Expected mock model request");
      }),
      new Promise((_, reject) => {
        const t = setTimeout(
          () => reject(new Error("Mock model probe timed out")),
          3000,
        );
        t.unref();
      }),
    ]);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout='1000ms'`;
      await tx.session.delete({ where: { id: actor.sessionId } });
      await tx.user.update({
        where: { id: staff.u.id },
        data: { role: "USER" },
      });
    });
    release();
    assert.equal((await result).error?.getStatus(), 403);
    assert.equal(requests, 1);
    assert.deepEqual(
      await db.setting.findUnique({ where: { key: "ai" } }),
      before,
    );
    assert.equal(await db.audit.count({ where: { actorId: staff.u.id } }), 0);
  } finally {
    release();
    await result;
    await new Promise<void>((resolve, reject) =>
      mock.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
test("independent guardian and moderator approvals cannot be supplied by the same account", async () => {
  const parent = await fixture(
      "community-review-parent",
      "1985-01-01",
      "ADMIN",
    ),
    reviewer = await fixture(
      "community-independent-reviewer",
      "1985-01-01",
      "ADMIN",
    ),
    child = await fixture("community-review-child", "2018-01-01"),
    actor = await communityActor(parent),
    independent = await communityActor(reviewer),
    admin = communityAdmin(),
    community = new CommunityController(db as Db, infrastructure),
    consent = await db.consent.create({
      data: {
        childId: child.u.id,
        guardianId: parent.u.id,
        documentId: randomUUID(),
        status: "PENDING",
        publicPosting: true,
      },
    }),
    review = {
      approve: true,
      reason: "Synthetic independent document review",
      signedDocumentChecked: true,
      guardianIdentityChecked: true,
      relationshipChecked: true,
    };
  await assert.rejects(
    admin.consent(actor, consent.id, review),
    (e: any) => e.getStatus?.() === 403,
  );
  assert.equal(
    (await db.consent.findUniqueOrThrow({ where: { id: consent.id } })).status,
    "PENDING",
  );
  await admin.consent(independent, consent.id, {
    ...review,
    documentReviewId: await syntheticConsentReview(
      db,
      independent,
      consent.documentId,
      parent.u.id,
    ),
  });
  const childActor = await communityActor(child),
    post = await community.create(childActor, {
      body: "Synthetic child request for independent review",
    });
  await community.guardianApprove(actor, post.id, { revision: 1 });
  const postReview = {
    approve: true,
    revision: 1,
    reason: "Synthetic independent content review",
  };
  await assert.rejects(
    admin.post(actor, post.id, postReview),
    (e: any) => e.getStatus?.() === 403,
  );
  await admin.post(independent, post.id, postReview);
  assert.equal(
    (await db.post.findUniqueOrThrow({ where: { id: post.id } })).status,
    "PUBLISHED",
  );
  await community.edit(childActor, post.id, {
    body: "Changed child draft needs both approvals again",
    revision: 1,
  });
  await assert.rejects(
    community.guardianApprove(actor, post.id, { revision: 1 }),
    (e: any) => e.getStatus?.() === 400,
  );
  await assert.rejects(
    admin.post(independent, post.id, { ...postReview, revision: 2 }),
    (e: any) => e.getStatus?.() === 403,
  );
  await db.user.update({
    where: { id: parent.u.id },
    data: { adultVerified: false },
  });
  await assert.rejects(
    community.guardianApprove(actor, post.id, { revision: 2 }),
    (e: any) => e.getStatus?.() === 403,
  );
  const saved = await db.post.findUniqueOrThrow({ where: { id: post.id } });
  assert.equal(saved.status, "PENDING");
  assert.equal(saved.guardianApproved, false);
  assert.equal(saved.moderatorApproved, false);
});
test("uppercase UUIDs cannot bypass independent eligibility review or the club owner's membership protection", async () => {
  const staff = await fixture(
    "community-casing-reviewer",
    "1985-01-01",
    "ADMIN",
    false,
  );
  const denied = await call(
    `admin/users/${staff.u.id.toUpperCase()}/eligibility`,
    {
      identityVerified: true,
      adultVerified: true,
      proofReviewed: true,
      reason: "Must not self verify using UUID casing",
    },
    staff.token,
  );
  assert.equal(denied.status, 403);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: staff.u.id } }))
      .adultVerified,
    false,
  );
  assert.equal(await db.audit.count({ where: { actorId: staff.u.id } }), 0);
  const owner = await fixture("community-casing-owner", "1985-01-01"),
    club = await db.club.create({
      data: {
        ownerId: owner.u.id,
        name: "Synthetic owner membership",
        description: "UUID casing check",
        status: "APPROVED",
      },
    });
  await db.membership.create({
    data: { clubId: club.id, userId: owner.u.id, status: "APPROVED" },
  });
  const membership = await call(
    `clubs/${club.id.toUpperCase()}/members/${owner.u.id.toUpperCase()}`,
    { status: "BANNED" },
    owner.token,
  );
  assert.equal(membership.status, 403);
  assert.equal(
    (
      await db.membership.findUniqueOrThrow({
        where: { clubId_userId: { clubId: club.id, userId: owner.u.id } },
      })
    ).status,
    "APPROVED",
  );
});
test("public legal pages work; core APIs require verified regional sessions", async () => {
  for (const [region, base, website, name, address] of [
    [
      "CN",
      cnOrigin,
      "https://juyuanqin.com",
      "北京聚缘琴科技有限公司",
      "北京市海淀区上地十街1号院5号楼17层1704室，邮政编码100000",
    ],
    [
      "INTL",
      origin,
      "https://exabyte.org.cn",
      "Beijing Juyuanqin Technology Co., Ltd.",
      "1704, Floor 17, Building 5, No.1 Courtyard, Shangdi 10th Street, Haidian District, Beijing 100000, China",
    ],
  ]) {
    for (const slug of [
      "privacy",
      "terms",
      "children",
      "community",
      "deletion",
      "support",
    ]) {
      const response = await call(
        `legal/${slug}`,
        undefined,
        undefined,
        undefined,
        base,
      );
      assert.equal(
        response.status,
        200,
        "Operator and privacy contacts remain public before registration",
      );
      const document = PublicLegalDocument.parse(response.body);
      assert.equal(document.operator.region, region);
      assert.equal(document.operator.website, website);
      assert.equal(document.operator.name.en, name);
      assert.equal(document.operator.address.en, address);
      for (const locale of ["en", "zh"] as const) {
        assert.ok(document.body[locale].includes("support@exabyte.org.cn"));
        assert.ok(document.body[locale].includes(website));
      }
      assert.ok(document.body.zh.includes("北京聚缘琴科技有限公司"));
      assert.ok(
        document.body.zh.includes("北京市海淀区上地十街1号院5号楼17层1704室"),
      );
      if (slug === "deletion")
        assert.equal(
          new URL(document.actionUrl).searchParams.get("community"),
          region,
        );
    }
  }
  assert.equal((await call("legal/constructor")).status, 404);
  const deletionUrl = new URL((await call("legal/deletion")).body.actionUrl);
  assert.equal(deletionUrl.pathname, "/delete-account");
  assert.equal(deletionUrl.searchParams.get("community"), "INTL");
  assert.equal((await call("courses")).status, 401);
  assert.equal((await call("me", undefined, adultToken)).status, 200);
  assert.equal(
    (await call("me", undefined, adultToken, undefined, cnOrigin)).status,
    401,
  );
  const wrong = await db.user.create({
    data: {
      email: `wrong-region-${runId}@cubers.test`,
      displayName: "Wrong region fixture",
      passwordHash: "unused",
      birthDate: "1990-01-01",
      region: "CN",
      emailVerified: true,
    },
  });
  const token = opaque();
  await db.session.create({
    data: {
      userId: wrong.id,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  assert.equal((await call("me", undefined, token)).status, 403);
});
test("smart device catalogue stays disabled despite a forged allowlist and requires regional consent", async () => {
  assert.equal((await call("devices")).status, 401);
  assert.equal((await call("devices", undefined, childToken)).status, 403);
  assert.equal(
    (await call("devices", undefined, adultToken, undefined, cnOrigin)).status,
    401,
  );
  const previous = await db.setting.findUnique({
    where: { key: "tested-devices" },
  });
  try {
    await db.setting.upsert({
      where: { key: "tested-devices" },
      create: {
        key: "tested-devices",
        value: [{ id: "gan-356-i3", enabled: true, physicallyTested: true }],
      },
      update: {
        value: [{ id: "gan-356-i3", enabled: true, physicallyTested: true }],
      },
    });
    const response = await fetch(`${origin}/v1/devices`, {
      headers: { Authorization: `Bearer ${adultToken}` },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /private.*no-store/);
    const result = await response.json();
    assert.deepEqual(result.devices.map((d: any) => d.id).sort(), [
      "gan-356-i3",
      "giiker-i3s",
      "gocube-edge",
    ]);
    assert.ok(
      result.devices.every(
        (d: any) =>
          d.enabled === false &&
          d.physicallyTested === false &&
          d.adapter === "implemented-unverified",
      ),
    );
    const settings = await call("admin/settings", undefined, adminToken);
    assert.equal(settings.status, 200);
    assert.deepEqual(settings.body.devices.value, result.devices);
    assert.equal(
      (
        await call(
          "rooms",
          { puzzle: "3x3", input: "smart", mode: "race", ranked: false },
          adultToken,
        )
      ).status,
      400,
    );
  } finally {
    if (previous)
      await db.setting.update({
        where: { key: "tested-devices" },
        data: { value: previous.value as any },
      });
    else await db.setting.delete({ where: { key: "tested-devices" } });
  }
});
test("lesson downloads are versioned, published-only, consent-bound and capped by the current regional session", async () => {
  assert.equal((await call("courses/3-notation/download", {})).status, 401);
  assert.equal(
    (await call("courses/3-notation/download", {}, childToken)).status,
    403,
  );
  assert.equal(
    (
      await call(
        "courses/3-notation/download",
        {},
        adultToken,
        undefined,
        cnOrigin,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        "courses/3-notation/download",
        { expiresAt: Date.now() + 999999999 },
        adultToken,
      )
    ).status,
    400,
  );
  const session = await db.session.findUniqueOrThrow({
    where: { tokenHash: hash(adultToken) },
  });
  const response = await fetch(`${origin}/v1/courses/3-notation/download`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adultToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(response.status, 201);
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  const result = await response.json(),
    course = await db.course.findUniqueOrThrow({ where: { id: "3-notation" } });
  assert.equal(result.ownerId, adultId);
  assert.equal(result.region, "INTL");
  assert.equal(result.courseVersion, course.version);
  assert.deepEqual(result.lesson, course.content);
  assert.ok(result.expiresAt <= session.expiresAt.getTime());
  assert.ok(result.expiresAt - result.downloadedAt <= 24 * 60 * 60 * 1000);
  const before = await db.progress.count({ where: { userId: adultId } });
  assert.equal(
    (await call("courses/4-first-solve/download", {}, adultToken)).status,
    201,
  );
  assert.equal(await db.progress.count({ where: { userId: adultId } }), before);
  await db.course.update({
    where: { id: course.id },
    data: { published: false },
  });
  try {
    const manifest = await call(
      "course-download-manifest",
      undefined,
      adultToken,
    );
    assert.equal(manifest.status, 200);
    assert.equal(
      manifest.body.courses.some((c: any) => c.id === course.id),
      false,
    );
    assert.equal(
      (await call("courses/3-notation/download", {}, adultToken)).status,
      404,
    );
  } finally {
    await db.course.update({
      where: { id: course.id },
      data: { published: course.published },
    });
  }
});
function decodedMailBody(message: string) {
  const split = message.search(/\r?\n\r?\n/);
  assert.ok(split >= 0);
  const headers = message.slice(0, split);
  const body = message.slice(split).replace(/^\r?\n\r?\n/, "");
  if (/Content-Transfer-Encoding:\s*base64/i.test(headers))
    return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8");
  if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(headers))
    return Buffer.from(
      body
        .replace(/=\r?\n/g, "")
        .replace(/=([0-9a-f]{2})/gi, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16)),
        ),
      "latin1",
    ).toString("utf8");
  return body;
}
test("email registration, bilingual notices and one-use recovery survive process-independent DB access", async () => {
  const email = `register-${runId}@cubers.test`,
    password = "test-registration-password-2026";
  const r = await call("auth/register", {
    email,
    password,
    displayName: "Registration test",
    birthDate: "1990-02-01",
    region: "INTL",
    terms: true,
    privacy: true,
  });
  assert.equal(r.status, 201);
  assert.match(
    localizeServiceSuccess("auth/register", "POST", r.body, "zh").message,
    /验证邮件/,
  );
  const unverified = await call("auth/login", { email, password });
  assert.equal(unverified.status, 403);
  assert.match(
    serviceError(unverified.status, unverified.body, "zh").message,
    /验证邮件/,
  );
  let token = "";
  for (const f of await readdir(".data/mail")) {
    const raw = await readFile(`.data/mail/${f}`, "utf8");
    if (raw.includes(email)) {
      const text = decodedMailBody(raw);
      const match = text.match(/\/verify\?token=([A-Za-z0-9_-]+)/);
      if (match) {
        token = match[1];
        assert.match(text, /验证 Cubers 邮箱/);
        assert.match(text, /This link expires in 30 minutes/);
        assert.match(text, /此链接将在30分钟后失效/);
        assert.match(text, /community=INTL/);
        assert.equal((text.match(/\/verify\?token=/g) || []).length, 1);
      }
    }
  }
  assert.ok(token);
  assert.equal((await call("auth/verify", { token })).status, 201);
  const reused = await call("auth/verify", { token });
  assert.equal(reused.status, 400);
  assert.match(serviceError(reused.status, reused.body, "zh").message, /链接/);
  assert.equal((await call("auth/login", { email, password })).status, 201);
  const stored = await db.user.findUniqueOrThrow({ where: { email } });
  assert.notEqual(stored.passwordHash, password);
  assert.ok(stored.emailVerified);
  const session = await call("auth/login", { email, password });
  assert.equal((await call("auth/forgot", { email })).status, 201);
  let resetToken = "";
  for (const f of await readdir(".data/mail")) {
    const raw = await readFile(`.data/mail/${f}`, "utf8");
    if (raw.includes(email)) {
      const text = decodedMailBody(raw);
      const match = text.match(/\/reset-password\?token=([A-Za-z0-9_-]+)/);
      if (match) {
        resetToken = match[1];
        assert.match(text, /重置 Cubers 密码/);
        assert.match(text, /This link expires in 30 minutes/);
        assert.match(text, /此链接将在30分钟后失效/);
        assert.match(text, /community=INTL/);
        assert.equal((text.match(/\/reset-password\?token=/g) || []).length, 1);
      }
    }
  }
  assert.ok(resetToken);
  const newPassword = "updated-local-test-password-2026";
  assert.equal(
    (await call("auth/reset", { token: resetToken, password: newPassword }))
      .status,
    201,
  );
  assert.equal(
    (await call("auth/reset", { token: resetToken, password: newPassword }))
      .status,
    400,
  );
  assert.equal((await call("me", undefined, session.body.token)).status, 401);
  assert.equal((await call("auth/login", { email, password })).status, 401);
  assert.equal(
    (await call("auth/login", { email, password: newPassword })).status,
    201,
  );
});
test("administrator role alone cannot bypass MFA", async () => {
  assert.equal(
    (await call("admin/overview", undefined, adultToken)).status,
    403,
  );
  const token = opaque();
  await db.session.create({
    data: {
      userId: adminId,
      tokenHash: hash(token),
      mfaVerified: false,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  assert.equal((await call("admin/overview", undefined, token)).status, 403);
  assert.equal(
    (await call("admin/overview", undefined, adminToken)).status,
    200,
  );
});
test("child consent, per-post guardian approval, edits, and revocation are enforced", async () => {
  assert.equal((await call("courses", undefined, childToken)).status, 403);
  const document = await db.consent.findUniqueOrThrow({
    where: { id: consentId },
  });
  const staff = await db.user.findUniqueOrThrow({ where: { id: adminId } });
  const staffSession = await db.session.findUniqueOrThrow({
    where: { tokenHash: hash(adminToken) },
  });
  const documentReviewId = await syntheticConsentReview(
    db,
    { user: staff, sessionId: staffSession.id } as Authed,
    document.documentId,
    adultId,
  );
  const review = await call(
    `admin/consents/${consentId}/review`,
    {
      approve: true,
      reason: "Test signed consent and relationship checked",
      documentReviewId,
      signedDocumentChecked: true,
      guardianIdentityChecked: true,
      relationshipChecked: true,
    },
    adminToken,
  );
  assert.equal(review.status, 201);
  assert.equal((await call("courses", undefined, childToken)).status, 200);
  const post = await call(
    "posts",
    { body: "A child cubing practice fixture", tags: [], mediaIds: [] },
    childToken,
  );
  assert.equal(post.status, 201);
  assert.equal(
    (
      await call(
        `admin/posts/${post.body.id}/review`,
        { approve: true, revision: 1, reason: "Reviewed test content" },
        adminToken,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `guardian/posts/${post.body.id}/approve`,
        { revision: 1 },
        adultToken,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await call(
        `admin/posts/${post.body.id}/review`,
        { approve: true, revision: 1, reason: "Reviewed test content" },
        adminToken,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await call(
        `posts/${post.body.id}`,
        { body: "Edited child practice fixture", tags: [], mediaIds: [] },
        childToken,
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (await db.post.findUniqueOrThrow({ where: { id: post.body.id } }))
      .guardianApproved,
    false,
  );
  assert.equal(
    (
      await call(
        `guardian/posts/${post.body.id}/approve`,
        { revision: 1 },
        adultToken,
      )
    ).status,
    400,
  );
  assert.equal((await call("sponsors", undefined, childToken)).body.length, 0);
  assert.equal(
    (
      await call(
        "tutor",
        {
          courseVersion: (
            await db.course.findUniqueOrThrow({ where: { id: lessons[0].id } })
          ).version,
          lessonId: lessons[0].id,
          locale: "en",
          moves: [],
          question: "explain",
        },
        childToken,
      )
    ).body.source,
    "authored",
  );
});
test("adult tutor reaches the simulated provider and persists an editable base URL", async () => {
  const update = await call(
    "admin/settings/ai",
    {
      baseUrl: "http://127.0.0.1:4010/v1",
      model: "cubers-simulator",
      enabled: true,
    },
    adminToken,
  );
  assert.equal(update.status, 201);
  const invalid = await call(
    "admin/settings/ai",
    {
      baseUrl: "http://127.0.0.1:4010/v1",
      model: "not-a-real-model",
      enabled: true,
    },
    adminToken,
  );
  assert.equal(invalid.status, 400);
  assert.equal(
    (
      (await db.setting.findUniqueOrThrow({ where: { key: "ai" } }))
        .value as any
    ).model,
    "cubers-simulator",
  );
  assert.equal(
    (await db.setting.findUniqueOrThrow({ where: { key: "ai" } })).value !==
      null,
    true,
  );
  const reply = await call(
    "tutor",
    {
      courseVersion: (
        await db.course.findUniqueOrThrow({ where: { id: lessons[0].id } })
      ).version,
      lessonId: lessons[0].id,
      locale: "zh",
      moves: [],
      question: "为什么",
    },
    adultToken,
  );
  assert.equal(reply.status, 201);
  assert.equal(reply.body.source, "simulated");
  const teen = await call(
    "tutor",
    {
      courseVersion: (
        await db.course.findUniqueOrThrow({ where: { id: lessons[0].id } })
      ).version,
      lessonId: lessons[0].id,
      locale: "en",
      moves: [],
      question: "explain",
    },
    teenToken,
  );
  assert.equal(teen.body.source, "authored");
});
test("lesson completion is reconstructed rather than trusting a client success flag", async () => {
  const id = lessons[0].id;
  assert.equal(
    (
      await call(
        `progress/${id}`,
        {
          courseVersion: (
            await db.course.findUniqueOrThrow({
              where: { id: `progress/${id}`.slice(9) },
            })
          ).version,
          moves: [],
          completed: true,
        },
        adultToken,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `progress/${id}`,
        {
          courseVersion: (
            await db.course.findUniqueOrThrow({
              where: { id: `progress/${id}`.slice(9) },
            })
          ).version,
          moves: [],
        },
        adultToken,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `progress/${id}`,
        {
          moves: lessons[0].algorithm.split(" "),
          courseVersion: (await db.course.findUniqueOrThrow({ where: { id } }))
            .version,
        },
        adultToken,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await db.progress.findUniqueOrThrow({
        where: { userId_lessonId: { userId: adultId, lessonId: id } },
      })
    ).completed,
    true,
  );
});
test("physical lessons persist confirmed moves, verify scans and save each final checkpoint once", async () => {
  for (const puzzle of ["2x2", "3x3", "4x4", "pyraminx"] as const) {
    const lesson = lessons.find((row) => row.puzzle === puzzle)!;
    const start = practiceSetup(puzzle, lesson.algorithm),
      moves = lesson.algorithm.split(" ");
    const colors = (state: typeof start) =>
      isPyraminx(state) ? pyraminxFacelets(state) : facelets(state);
    const previous = await db.progress.findUnique({
      where: { userId_lessonId: { userId: adultId, lessonId: lesson.id } },
    });
    const created = await call(
      `courses/${lesson.id}/sessions`,
      {
        input: "scan",
        courseVersion: (
          await db.course.findUniqueOrThrow({ where: { id: lesson.id } })
        ).version,
      },
      adultToken,
    );
    assert.equal(created.status, 201);
    let session = created.body;
    const path = `lesson-sessions/${session.id}`;
    assert.equal((await call(path, undefined, teenToken)).status, 404);
    assert.equal(
      (
        await call(
          `${path}/moves`,
          { version: 0, moves: [moves[0]] },
          adultToken,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          `${path}/checkpoint`,
          {
            version: 0,
            kind: "initial",
            faces: colors(practiceApply(start, moves)),
          },
          adultToken,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          `${path}/checkpoint`,
          { version: 0, kind: "initial", faces: { F: ["x"] } },
          adultToken,
        )
      ).status,
      400,
    );
    const initial = await call(
      `${path}/checkpoint`,
      { version: 0, kind: "initial", faces: colors(start) },
      adultToken,
    );
    assert.equal(initial.status, 201);
    session = initial.body;
    assert.equal(
      (
        await call(
          `${path}/checkpoint`,
          { version: session.version, kind: "final", faces: colors(start) },
          adultToken,
        )
      ).status,
      400,
    );
    const concurrent = await Promise.all(
      [1, 2].map(() =>
        call(
          `${path}/moves`,
          { version: session.version, moves: [moves[0]] },
          adultToken,
        ),
      ),
    );
    assert.deepEqual(concurrent.map((row) => row.status).sort(), [201, 409]);
    session = (await call(path, undefined, adultToken)).body;
    assert.deepEqual(session.moves, [moves[0]]);
    const middle = practiceApply(start, session.moves);
    assert.equal(
      (
        await call(
          `${path}/checkpoint`,
          { version: session.version, kind: "check", faces: colors(start) },
          adultToken,
        )
      ).status,
      400,
    );
    const checked = await call(
      `${path}/checkpoint`,
      { version: session.version, kind: "check", faces: colors(middle) },
      adultToken,
    );
    assert.equal(checked.status, 201);
    session = checked.body;
    const finished = await call(
      `${path}/moves`,
      { version: session.version, moves: moves.slice(1) },
      adultToken,
    );
    assert.equal(finished.status, 201);
    session = finished.body;
    const final = {
      version: session.version,
      kind: "final",
      faces: colors(practiceApply(start, moves)),
    };
    const finals = await Promise.all(
      [1, 2].map(() => call(`${path}/checkpoint`, final, adultToken)),
    );
    assert.deepEqual(finals.map((row) => row.status).sort(), [201, 409]);
    assert.equal(
      (await call(path, undefined, adultToken)).body.status,
      "COMPLETED",
    );
    assert.equal(
      (
        await db.progress.findUniqueOrThrow({
          where: { userId_lessonId: { userId: adultId, lessonId: lesson.id } },
        })
      ).repetitions,
      (previous?.repetitions || 0) + 1,
    );
  }
  assert.equal(
    (await call("courses/4-parity/sessions", { input: "smart" }, adultToken))
      .status,
    400,
  );
  const exported = await call("me/export", undefined, adultToken);
  assert.ok(
    exported.body.lessonSessions.some(
      (row: any) => row.puzzle === "pyraminx" && row.status === "COMPLETED",
    ),
  );
});
test("Pyraminx pointer picks complete authenticated tip and main-layer lessons with persisted virtual history", async () => {
  const owner = await fixture("pyraminx-pointer", "1990-01-01");
  for (const id of ["pyr-beginner", "pyr-intuitive"]) {
    const lesson = lessons.find((row) => row.id === id)!;
    let state = practiceSetup("pyraminx", lesson.algorithm) as ReturnType<
      typeof solvedPyraminx
    >;
    const moves: string[] = [];
    for (const expected of lesson.algorithm.split(" ")) {
      // The visible picker turns clockwise; two clockwise taps are a prime.
      for (let n = 0; n < (expected.endsWith("'") ? 2 : 1); n++) {
        const move = expected[0],
          vertex = PYRA_VERTICES.indexOf(
            move.toUpperCase() as (typeof PYRA_VERTICES)[number],
          );
        const group = new THREE.Group();
        buildPyraminxGroup(group, state);
        try {
          const mesh = group.children.find(
            (m) =>
              m.userData.position?.[vertex] ===
              (move === move.toLowerCase() ? 7 : 5),
          ) as THREE.Mesh;
          assert.ok(mesh);
          const camera = new THREE.PerspectiveCamera(36, 360 / 290, 0.1, 100);
          camera.position.copy(
            new THREE.Vector3(...PYRA_POINTS[mesh.userData.position.indexOf(0)])
              .normalize()
              .multiplyScalar(-6),
          );
          camera.lookAt(0, 0, 0);
          camera.updateMatrixWorld();
          const a = mesh.geometry.getAttribute("position"),
            center = new THREE.Vector3();
          for (let i = 0; i < a.count; i++)
            center.add(new THREE.Vector3().fromBufferAttribute(a, i));
          center.divideScalar(a.count).project(camera);
          const picked = pyraminxTurnAt(
            group,
            camera,
            { x: (center.x + 1) * 180, y: (1 - center.y) * 145 },
            { width: 360, height: 290 },
          );
          assert.equal(picked, move);
          moves.push(picked!);
          state = pyraminxTurn(state, picked!);
        } finally {
          clearPyraminxGroup(group);
        }
      }
    }
    assert.ok(practiceSolved(state));
    const courseVersion = (await db.course.findUniqueOrThrow({ where: { id } }))
      .version;
    assert.equal(
      (
        await call(
          `progress/${id}`,
          { courseVersion, moves: moves.slice(0, -1) },
          owner.token,
        )
      ).status,
      400,
    );
    const completed = await call(
      `progress/${id}`,
      { courseVersion, moves },
      owner.token,
    );
    assert.equal(completed.status, 201);
    const saved = await db.lessonSession.findFirstOrThrow({
      where: { userId: owner.u.id, lessonId: id, status: "COMPLETED" },
    });
    assert.equal(saved.input, "virtual");
    assert.deepEqual(saved.moves, moves);
    assert.ok(
      (
        await db.progress.findFirstOrThrow({
          where: { userId: owner.u.id, lessonId: id },
        })
      ).completed,
    );
  }
});
test("Pyraminx lessons support virtual completion and simulated tutoring with strict move validation", async () => {
  const lesson = lessons.find((row) => row.id === "pyr-last-layer")!;
  assert.equal(
    (
      await call(
        `progress/${lesson.id}`,
        {
          moves: lesson.algorithm.split(" "),
          courseVersion: (
            await db.course.findUniqueOrThrow({ where: { id: lesson.id } })
          ).version,
        },
        adultToken,
      )
    ).status,
    201,
  );
  const tutor = await call(
    "tutor",
    {
      courseVersion: (
        await db.course.findUniqueOrThrow({ where: { id: lesson.id } })
      ).version,
      lessonId: lesson.id,
      locale: "zh",
      moves: ["R", "u'"],
      question: "why",
    },
    adultToken,
  );
  assert.equal(tutor.status, 201);
  assert.equal(tutor.body.source, "simulated");
  assert.equal(
    (
      await call(
        "tutor",
        {
          courseVersion: (
            await db.course.findUniqueOrThrow({ where: { id: lesson.id } })
          ).version,
          lessonId: lesson.id,
          locale: "en",
          moves: ["R2"],
          question: "why",
        },
        adultToken,
      )
    ).status,
    400,
  );
  const created = await call(
      `courses/${lesson.id}/sessions`,
      {
        input: "scan",
        courseVersion: (
          await db.course.findUniqueOrThrow({ where: { id: lesson.id } })
        ).version,
      },
      adultToken,
    ),
    id = created.body.id;
  await call(`lesson-sessions/${id}`, undefined, adultToken, "DELETE");
  assert.equal(
    (
      await call(
        `lesson-sessions/${id}/checkpoint`,
        {
          version: 1,
          kind: "initial",
          faces: pyraminxFacelets(
            practiceSetup("pyraminx", lesson.algorithm) as ReturnType<
              typeof solvedPyraminx
            >,
          ),
        },
        adultToken,
      )
    ).status,
    409,
  );
});
test("full case libraries are published and scanned last layers receive deterministic guidance", async () => {
  const courses = await call("courses", undefined, adultToken);
  for (const [family, count] of [
    ["OLL", 57],
    ["PLL", 21],
    ["CLL", 42],
  ] as const) {
    assert.equal(
      courses.body.filter((course: any) => course.content.caseFamily === family)
        .length,
      count,
    );
    const entry = algorithmCases.find((row) => row.family === family)!;
    const state = practiceApply(practiceSetup(entry.puzzle, entry.algorithm), [
      "U",
    ]);
    assert.ok(!isPyraminx(state));
    const recognized = await call(
      "last-layer/recognize",
      { family, faces: facelets(state) },
      adultToken,
    );
    assert.equal(recognized.status, 201);
    assert.equal(recognized.body.kind, "case");
    assert.equal(recognized.body.source, "validated");
    assert.ok(recognized.body.before.length > 0);
    assert.deepEqual(
      recognized.body.observations.current,
      observeLastLayer(state, family),
    );
    const prepared = practiceApply(state, recognized.body.before);
    assert.ok(!isPyraminx(prepared));
    assert.deepEqual(
      recognized.body.observations.prepared,
      observeLastLayer(prepared, family),
    );
    const result = practiceApply(state, [
      ...recognized.body.before,
      ...recognized.body.algorithm,
      ...recognized.body.after,
    ]);
    if (family === "OLL") {
      assert.ok(!isPyraminx(result));
      assert.ok(facelets(result).U.every((color) => color === "U"));
    } else assert.ok(practiceSolved(result));
    assert.equal(
      (
        await call(
          `progress/${entry.id}`,
          {
            moves: entry.algorithm.split(" "),
            courseVersion: (
              await db.course.findUniqueOrThrow({ where: { id: entry.id } })
            ).version,
          },
          adultToken,
        )
      ).status,
      201,
    );
    await db.course.update({
      where: { id: recognized.body.lessonId },
      data: { published: false },
    });
    try {
      assert.equal(
        (
          await call(
            "last-layer/recognize",
            { family, faces: facelets(state) },
            adultToken,
          )
        ).status,
        404,
      );
    } finally {
      await db.course.update({
        where: { id: recognized.body.lessonId },
        data: { published: true },
      });
    }
  }
  assert.equal(
    (
      await call(
        "last-layer/recognize",
        { family: "OLL", faces: facelets(solvedCube()) },
        adultToken,
      )
    ).body.kind,
    "stage-complete",
  );
  const alignment = await call(
    "last-layer/recognize",
    { family: "PLL", faces: facelets(applyMoves(solvedCube(), "U")) },
    adultToken,
  );
  assert.deepEqual(alignment.body.moves, ["U'"]);
  assert.equal(
    (
      await call(
        "last-layer/recognize",
        { family: "OLL", faces: facelets(applyMoves(solvedCube(), "R")) },
        adultToken,
      )
    ).body.reason,
    "FIRST_LAYERS_REQUIRED",
  );
  const impossible = facelets(solvedCube());
  [impossible.U[7], impossible.F[1]] = [impossible.F[1], impossible.U[7]];
  assert.equal(
    (
      await call(
        "last-layer/recognize",
        { family: "OLL", faces: impossible },
        adultToken,
      )
    ).status,
    400,
  );
});
test("withdrawn guardian consent immediately stops a child's saved physical lesson", async () => {
  const child = await fixture("lesson-child", "2018-04-01", "USER", false);
  const doc = await db.media.create({
    data: {
      userId: adultId,
      key: `INTL/${runId}/lesson-consent`,
      purpose: "consent",
      type: "application/pdf",
      size: 32,
      status: "READY",
    },
  });
  await db.consent.create({
    data: {
      childId: child.u.id,
      guardianId: adultId,
      documentId: doc.id,
      status: "APPROVED",
    },
  });
  const started = await call(
    "courses/pyr-beginner/sessions",
    {
      input: "scan",
      courseVersion: (
        await db.course.findUniqueOrThrow({ where: { id: "pyr-beginner" } })
      ).version,
    },
    child.token,
  );
  assert.equal(started.status, 201);
  await db.consent.update({
    where: { childId: child.u.id },
    data: { status: "REVOKED" },
  });
  assert.equal(
    (await call(`lesson-sessions/${started.body.id}`, undefined, child.token))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        `lesson-sessions/${started.body.id}/moves`,
        { version: 0, moves: ["u"] },
        child.token,
      )
    ).status,
    403,
  );
});
test("stale publication cannot expose a child's post or attachments after consent withdrawal", async () => {
  const child = await fixture(
    "stale-publication-child",
    "2018-06-01",
    "USER",
    false,
  );
  const media = await db.media.create({
    data: {
      userId: child.u.id,
      key: `INTL/${runId}/stale-child-photo`,
      purpose: "post",
      type: "image/jpeg",
      size: 32,
      status: "READY",
    },
  });
  const doc = await db.media.create({
    data: {
      userId: adultId,
      key: `INTL/${runId}/stale-child-consent`,
      purpose: "consent",
      type: "application/pdf",
      size: 32,
      status: "READY",
    },
  });
  const consent = await db.consent.create({
    data: {
      childId: child.u.id,
      guardianId: adultId,
      documentId: doc.id,
      status: "APPROVED",
      publicPosting: true,
      reviewedAt: new Date(),
    },
  });
  const post = await db.post.create({
    data: {
      authorId: child.u.id,
      body: "Synthetic delayed-publication fixture",
      tags: [],
      mediaIds: [media.id],
      status: "PUBLISHED",
      moderatorApproved: true,
      guardianApproved: true,
    },
  });
  assert.ok(
    (await call("feed", undefined, teenToken)).body.items.some(
      (row: any) => row.id === post.id,
    ),
  );
  assert.equal(
    (await call(`media/${media.id}`, undefined, teenToken)).status,
    200,
  );
  assert.equal(
    (
      await call(
        `guardian/children/${child.u.id}/consent`,
        undefined,
        adultToken,
        "DELETE",
      )
    ).status,
    200,
  );
  // Reproduce an old delayed writer setting a stale PUBLISHED flag.
  await db.post.update({
    where: { id: post.id },
    data: {
      status: "PUBLISHED",
      moderatorApproved: true,
      guardianApproved: true,
    },
  });
  assert.ok(
    !(await call("feed", undefined, teenToken)).body.items.some(
      (row: any) => row.id === post.id,
    ),
  );
  assert.equal(
    (await call(`posts/${post.id}/comments`, undefined, teenToken)).status,
    404,
  );
  assert.equal(
    (await call(`media/${media.id}`, undefined, teenToken)).status,
    403,
  );
  assert.equal(
    (
      await call(
        `admin/consents/${consent.id}/review`,
        {
          approve: true,
          reason: "A withdrawn request cannot be reused",
          signedDocumentChecked: true,
          guardianIdentityChecked: true,
          relationshipChecked: true,
        },
        adminToken,
      )
    ).status,
    400,
  );
});
test("ranked virtual attempts reject forged, replayed and out-of-sequence submissions", async () => {
  const room = await call(
    "rooms",
    {
      puzzle: "3x3",
      input: "virtual",
      mode: "race",
      ranked: true,
      private: true,
    },
    adultToken,
  );
  assert.equal(room.status, 201);
  assert.equal(
    (await call(`rooms/${room.body.id}/start`, {}, adultToken)).status,
    201,
  );
  const attempt = await call(`rooms/${room.body.id}/attempts`, {}, adultToken),
    a = attempt.body;
  assert.equal(
    (await call(`attempts/${a.id}/inspect`, { nonce: "forged" }, adultToken))
      .status,
    403,
  );
  assert.equal(
    (await call(`attempts/${a.id}/inspect`, { nonce: a.nonce }, adultToken))
      .status,
    201,
  );
  assert.equal(
    (await call(`attempts/${a.id}/start`, { nonce: a.nonce }, adultToken))
      .status,
    201,
  );
  assert.equal(
    (
      await call(
        `attempts/${a.id}/moves`,
        { nonce: a.nonce, events: [{ sequence: 4, move: "R", elapsedMs: 0 }] },
        adultToken,
      )
    ).status,
    400,
  );
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(
    (await call(`attempts/${a.id}/finish`, { nonce: a.nonce }, adultToken))
      .status,
    400,
  );
  const events = inverse(a.scramble).map((move, sequence) => ({
    move,
    sequence,
    elapsedMs: sequence,
  }));
  assert.equal(
    (
      await call(
        `attempts/${a.id}/moves`,
        { nonce: a.nonce, events },
        adultToken,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await call(
        `attempts/${a.id}/moves`,
        { nonce: a.nonce, events },
        adultToken,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `attempts/${a.id}/finish`,
        { nonce: a.nonce, durationMs: 1 },
        adultToken,
      )
    ).status,
    400,
  );
  const result = await call(
    `attempts/${a.id}/finish`,
    { nonce: a.nonce },
    adultToken,
  );
  assert.equal(result.status, 201);
  assert.equal(result.body.status, "APPROVED");
  assert.ok(result.body.durationMs >= 350);
  assert.equal(
    (await call(`attempts/${a.id}/finish`, { nonce: a.nonce }, adultToken))
      .status,
    403,
  );
});
test("interrupted attempts cannot resume; ranked physical solves need evidence", async () => {
  for (const input of ["virtual", "scan"]) {
    const room = (
      await call(
        "rooms",
        { puzzle: "3x3", input, mode: "race", ranked: true, private: true },
        adultToken,
      )
    ).body;
    await call(`rooms/${room.id}/start`, {}, adultToken);
    const a = (await call(`rooms/${room.id}/attempts`, {}, adultToken)).body;
    if (input === "scan") {
      assert.equal(
        (await call(`attempts/${a.id}/inspect`, { nonce: a.nonce }, adultToken))
          .status,
        403,
      );
      assert.equal(
        (await call(`attempts/${a.id}/record`, { nonce: a.nonce }, adultToken))
          .status,
        201,
      );
      assert.equal(
        (
          await call(
            `attempts/${a.id}/checkpoint`,
            {
              nonce: a.nonce,
              stage: "scramble",
              faces: facelets(applyMoves(solvedCube(3), a.scramble)),
            },
            adultToken,
          )
        ).status,
        201,
      );
    }
    await call(`attempts/${a.id}/inspect`, { nonce: a.nonce }, adultToken);
    await call(
      `attempts/${a.id}/start`,
      { nonce: a.nonce, recordingStarted: input === "scan" },
      adultToken,
    );
    if (input === "scan") {
      await new Promise((r) => setTimeout(r, 350));
      const finished = await call(
        `attempts/${a.id}/finish`,
        { nonce: a.nonce },
        adultToken,
      );
      assert.equal(finished.status, 201);
      assert.equal(finished.body.status, "AWAITING_EVIDENCE");
      assert.equal(
        (
          await call(
            `attempts/${a.id}/evidence`,
            { nonce: a.nonce, evidenceId: randomUUID() },
            adultToken,
          )
        ).status,
        403,
      );
      assert.equal(
        (await db.attempt.findUniqueOrThrow({ where: { id: a.id } }))
          .evidenceId,
        null,
      );
    }
    await call(`attempts/${a.id}/interrupt`, {}, adultToken);
    assert.equal(
      (
        await call(
          `attempts/${a.id}/start`,
          { nonce: a.nonce, recordingStarted: input === "scan" },
          adultToken,
        )
      ).status,
      400,
    );
    assert.equal(
      (await call(`attempts/${a.id}/finish`, { nonce: a.nonce }, adultToken))
        .status,
      403,
    );
  }
});
test("database uniqueness prevents simultaneous duplicate attempts", async () => {
  const room = (
    await call(
      "rooms",
      {
        puzzle: "2x2",
        input: "virtual",
        mode: "race",
        ranked: true,
        private: true,
      },
      adultToken,
    )
  ).body;
  await call(`rooms/${room.id}/start`, {}, adultToken);
  const requests = await Promise.all([
    call(`rooms/${room.id}/attempts`, {}, adultToken),
    call(`rooms/${room.id}/attempts`, {}, adultToken),
  ]);
  assert.deepEqual(requests.map((x) => x.status).sort(), [201, 409]);
  assert.equal(
    await db.attempt.count({ where: { roomId: room.id, userId: adultId } }),
    1,
  );
});
test("physical evidence is attempt-bound, duration-checked, provisional and category-separated", async () => {
  const room = (
    await call(
      "rooms",
      {
        puzzle: "3x3",
        input: "scan",
        mode: "race",
        ranked: true,
        private: true,
      },
      adultToken,
    )
  ).body;
  await call(`rooms/${room.id}/start`, {}, adultToken);
  const a = (await call(`rooms/${room.id}/attempts`, {}, adultToken)).body;
  await call(`attempts/${a.id}/record`, { nonce: a.nonce }, adultToken);
  assert.equal(
    (
      await call(
        `attempts/${a.id}/checkpoint`,
        { nonce: a.nonce, stage: "scramble", faces: facelets(solvedCube(3)) },
        adultToken,
      )
    ).status,
    400,
  );
  await call(
    `attempts/${a.id}/checkpoint`,
    {
      nonce: a.nonce,
      stage: "scramble",
      faces: facelets(applyMoves(solvedCube(3), a.scramble)),
    },
    adultToken,
  );
  await call(`attempts/${a.id}/inspect`, { nonce: a.nonce }, adultToken);
  await call(`attempts/${a.id}/start`, { nonce: a.nonce }, adultToken);
  await new Promise((r) => setTimeout(r, 350));
  const finished = await call(
    `attempts/${a.id}/finish`,
    { nonce: a.nonce },
    adultToken,
  );
  assert.equal(finished.body.status, "AWAITING_EVIDENCE");
  await call(
    `attempts/${a.id}/checkpoint`,
    { nonce: a.nonce, stage: "final", faces: facelets(solvedCube(3)) },
    adultToken,
  );
  assert.equal(
    (
      await call(
        "media",
        { purpose: "evidence", size: 100, type: "video/mp4" },
        adultToken,
      )
    ).status,
    400,
  );
  const m = await db.media.create({
    data: {
      userId: adultId,
      purpose: "evidence",
      type: "video/mp4",
      key: `${runId}/evidence-${randomUUID()}`,
      status: "READY",
      size: 100,
      durationMs: 1000,
      attemptId: randomUUID(),
    },
  });
  const attach = () =>
    call(
      `attempts/${a.id}/evidence`,
      { nonce: a.nonce, evidenceId: m.id },
      adultToken,
    );
  assert.equal((await attach()).status, 400);
  await db.attempt.update({
    where: { id: a.id },
    data: { recordingAt: new Date(Date.now() - 30000) },
  });
  await db.media.update({ where: { id: m.id }, data: { attemptId: a.id } });
  assert.equal(
    (await attach()).status,
    400,
    "A short clip cannot cover the attempt",
  );
  await db.media.update({ where: { id: m.id }, data: { durationMs: 31000 } });
  const submitted = await attach();
  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.status, "PROVISIONAL");
  assert.equal(
    submitted.body.durationMs,
    finished.body.durationMs,
    "Upload time is excluded",
  );
  assert.equal(
    (
      await call(
        "rankings?puzzle=3x3&input=scan&mode=race",
        undefined,
        adultToken,
      )
    ).body.some((x: any) => x.id === a.id),
    false,
  );
  const decision = await call(
    `admin/attempts/${a.id}/review`,
    {
      approve: true,
      reason: "Synthetic reviewer evidence workflow test",
      evidenceChecked: true,
      uninterrupted: true,
      scrambleMatches: true,
      cubeAndHandsVisible: true,
      finalStateSolved: true,
    },
    adminToken,
  );
  assert.equal(decision.status, 201);
  const stored = await db.attempt.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(stored.status, "APPROVED");
  assert.equal(stored.durationMs, finished.body.durationMs);
  const board = await call(
    "rankings?puzzle=3x3&input=scan&mode=race",
    undefined,
    adultToken,
  );
  assert.equal(board.status, 200);
  assert.ok(board.body.length <= 100);
  assert.equal(
    new Set(board.body.map((row: any) => row.id)).size,
    board.body.length,
  );
  assert.ok(
    board.body.every(
      (row: any, i: number) =>
        row.room.puzzle === "3x3" &&
        row.room.input === "scan" &&
        row.room.mode === "race" &&
        (!i || row.durationMs >= board.body[i - 1].durationMs),
    ),
  );
  // A persistent fixture database can already contain 100 faster approvals.
  // Approval does not promise a place inside the bounded public board.
  if (!board.body.some((row: any) => row.id === a.id)) {
    assert.equal(board.body.length, 100);
    assert.ok(stored.durationMs !== null);
    assert.ok(
      board.body.every((row: any) => row.durationMs <= stored.durationMs!),
    );
  }
  assert.equal(
    (
      await call(
        "rankings?puzzle=3x3&input=virtual&mode=race",
        undefined,
        adultToken,
      )
    ).body.some((x: any) => x.id === a.id),
    false,
  );
  assert.ok(stored.evidenceDeleteAt!.getTime() <= Date.now() + 7 * 86400000);
});
test("4×4 physical play validates wings, confirms server scramble and requires a final scan", async () => {
  const created = await call(
    "rooms",
    {
      puzzle: "4x4",
      input: "scan",
      mode: "race",
      ranked: false,
      private: true,
    },
    adultToken,
  );
  assert.equal(created.status, 201);
  const room = created.body;
  await call(`rooms/${room.id}/start`, {}, adultToken);
  const a = (await call(`rooms/${room.id}/attempts`, {}, adultToken)).body;
  assert.equal(
    (await call(`attempts/${a.id}/inspect`, { nonce: a.nonce }, adultToken))
      .status,
    400,
  );
  const impossible = solvedCube(4),
    wing = impossible.stickers.filter(
      (sticker) => sticker.p.join() === "3,3,1",
    );
  assert.equal(wing.length, 2);
  [wing[0].color, wing[1].color] = [wing[1].color, wing[0].color];
  assert.equal(
    (
      await call(
        `attempts/${a.id}/checkpoint`,
        { nonce: a.nonce, stage: "scramble", faces: facelets(impossible) },
        adultToken,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `attempts/${a.id}/checkpoint`,
        {
          nonce: a.nonce,
          stage: "scramble",
          faces: facelets(applyMoves(solvedCube(4), a.scramble)),
        },
        adultToken,
      )
    ).status,
    201,
  );
  await call(`attempts/${a.id}/inspect`, { nonce: a.nonce }, adultToken);
  await call(`attempts/${a.id}/start`, { nonce: a.nonce }, adultToken);
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(
    (await call(`attempts/${a.id}/finish`, { nonce: a.nonce }, adultToken)).body
      .status,
    "AWAITING_EVIDENCE",
  );
  assert.equal(
    (
      await call(
        `attempts/${a.id}/checkpoint`,
        { nonce: a.nonce, stage: "final", faces: facelets(impossible) },
        adultToken,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `attempts/${a.id}/checkpoint`,
        { nonce: a.nonce, stage: "final", faces: facelets(solvedCube(4)) },
        adultToken,
      )
    ).body.status,
    "APPROVED",
  );
});
test("Pyraminx races, daily solves, pattern chase and sprints reconstruct turns including tips", async () => {
  for (const mode of ["race", "daily", "pattern", "sprint"]) {
    const created = await call(
      "rooms",
      {
        puzzle: "pyraminx",
        input: "virtual",
        mode,
        ranked: mode === "race" || mode === "daily",
        private: true,
      },
      adultToken,
    );
    assert.equal(created.status, 201);
    const room = created.body;
    await call(`rooms/${room.id}/start`, {}, adultToken);
    const a = (await call(`rooms/${room.id}/attempts`, {}, adultToken)).body;
    if (mode === "daily") {
      const second = (
        await call(
          "rooms",
          {
            puzzle: "pyraminx",
            input: "virtual",
            mode,
            ranked: false,
            private: true,
          },
          teenToken,
        )
      ).body;
      await call(`rooms/${second.id}/start`, {}, teenToken);
      assert.deepEqual(
        (await call(`rooms/${second.id}/attempts`, {}, teenToken)).body
          .scramble,
        a.scramble,
      );
    }
    await call(`attempts/${a.id}/inspect`, { nonce: a.nonce }, adultToken);
    await call(`attempts/${a.id}/start`, { nonce: a.nonce }, adultToken);
    const moves =
      mode === "sprint"
        ? room.target
        : [...inverse(a.scramble), ...(mode === "pattern" ? room.target : [])];
    const events = moves.map((move: string, sequence: number) => ({
      move,
      sequence,
      elapsedMs: sequence,
    }));
    if (mode === "race") {
      const socket = io(`${origin}/play`, {
        auth: { token: adultToken },
        transports: ["websocket"],
        reconnection: false,
        forceNew: true,
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Pyraminx socket did not connect")),
            5000,
          );
          socket.once("connect", () => {
            clearTimeout(timer);
            resolve();
          });
          socket.once("connect_error", (error) => {
            clearTimeout(timer);
            reject(error);
          });
        });
        assert.equal(
          (
            await socket
              .timeout(3000)
              .emitWithAck("room.join", { roomId: room.id })
          ).ok,
          true,
        );
        assert.equal(
          (
            await socket.timeout(3000).emitWithAck("attempt.moves", {
              attemptId: a.id,
              nonce: a.nonce,
              events: [{ sequence: 0, elapsedMs: 0, move: "R2" }],
            })
          ).ok,
          false,
        );
        assert.equal(
          (
            await socket.timeout(3000).emitWithAck("attempt.moves", {
              attemptId: a.id,
              nonce: a.nonce,
              events,
            })
          ).ok,
          true,
        );
        await new Promise((resolve) => setTimeout(resolve, 350));
        assert.equal(
          (
            await call(
              `attempts/${a.id}/finish`,
              { nonce: a.nonce },
              adultToken,
            )
          ).body.status,
          "APPROVED",
        );
      } finally {
        socket.disconnect();
      }
      const board = await call(
        "rankings?puzzle=pyraminx&input=virtual&mode=race",
        undefined,
        adultToken,
      );
      assert.equal(board.status, 200);
      assert.ok(board.body.length <= 100);
      assert.equal(
        new Set(board.body.map((row: any) => row.id)).size,
        board.body.length,
      );
      assert.ok(
        board.body.every(
          (row: any) =>
            row.room.puzzle === "pyraminx" &&
            row.room.input === "virtual" &&
            row.room.mode === "race",
        ),
      );
      // This persistent fixture database can contain over 100 faster results
      // from preceding runs. A valid finish need not enter the bounded board.
      if (!board.body.some((row: any) => row.id === a.id)) {
        const completed = await db.attempt.findUniqueOrThrow({
          where: { id: a.id },
        });
        assert.equal(board.body.length, 100);
        assert.ok(completed.durationMs !== null);
        assert.ok(
          board.body.every(
            (row: any) => row.durationMs <= completed.durationMs!,
          ),
        );
      }
      assert.ok(
        !(
          await call(
            "rankings?puzzle=3x3&input=virtual&mode=race",
            undefined,
            adultToken,
          )
        ).body.some((row: any) => row.id === a.id),
      );
    } else {
      assert.equal(
        (
          await call(
            `attempts/${a.id}/moves`,
            { nonce: a.nonce, events },
            adultToken,
          )
        ).status,
        201,
      );
      await new Promise((resolve) => setTimeout(resolve, 350));
      assert.equal(
        (await call(`attempts/${a.id}/finish`, { nonce: a.nonce }, adultToken))
          .body.status,
        "APPROVED",
      );
    }
  }
});
test("Pyraminx physical ranked attempts use four-face validation and bound video review", async () => {
  const room = (
    await call(
      "rooms",
      {
        puzzle: "pyraminx",
        input: "scan",
        mode: "race",
        ranked: true,
        private: true,
      },
      adultToken,
    )
  ).body;
  await call(`rooms/${room.id}/start`, {}, adultToken);
  const a = (await call(`rooms/${room.id}/attempts`, {}, adultToken)).body;
  await call(`attempts/${a.id}/record`, { nonce: a.nonce }, adultToken);
  const scrambled = practiceApply(solvedPuzzle("pyraminx"), a.scramble);
  assert.ok(isPyraminx(scrambled));
  const flipped = structuredClone(scrambled),
    edge = flipped.stickers.filter(
      (sticker) => sticker.position[0] === 4 && sticker.position[1] === 4,
    );
  [edge[0].color, edge[1].color] = [edge[1].color, edge[0].color];
  assert.equal(
    (
      await call(
        `attempts/${a.id}/checkpoint`,
        { nonce: a.nonce, stage: "scramble", faces: pyraminxFacelets(flipped) },
        adultToken,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `attempts/${a.id}/checkpoint`,
        {
          nonce: a.nonce,
          stage: "scramble",
          faces: pyraminxFacelets(scrambled),
        },
        adultToken,
      )
    ).status,
    201,
  );
  await call(`attempts/${a.id}/inspect`, { nonce: a.nonce }, adultToken);
  await call(`attempts/${a.id}/start`, { nonce: a.nonce }, adultToken);
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(
    (await call(`attempts/${a.id}/finish`, { nonce: a.nonce }, adultToken)).body
      .status,
    "AWAITING_EVIDENCE",
  );
  assert.equal(
    (
      await call(
        `attempts/${a.id}/checkpoint`,
        {
          nonce: a.nonce,
          stage: "final",
          faces: pyraminxFacelets(solvedPyraminx()),
        },
        adultToken,
      )
    ).status,
    201,
  );
  const media = await db.media.create({
    data: {
      userId: adultId,
      key: `INTL/${runId}/pyraminx-evidence`,
      purpose: "evidence",
      type: "video/mp4",
      size: 100,
      status: "READY",
      attemptId: a.id,
      durationMs: 1000,
    },
  });
  assert.equal(
    (
      await call(
        `attempts/${a.id}/evidence`,
        { nonce: a.nonce, evidenceId: media.id },
        adultToken,
      )
    ).body.status,
    "PROVISIONAL",
  );
  assert.ok(
    !(
      await call(
        "rankings?puzzle=pyraminx&input=scan&mode=race",
        undefined,
        adultToken,
      )
    ).body.some((row: any) => row.id === a.id),
  );
});
test("Pyraminx relay advances only after the assigned player's verified solve", async () => {
  const peerId = (await call("me", undefined, teenToken)).body.id;
  const room = (
    await call(
      "rooms",
      {
        puzzle: "pyraminx",
        input: "virtual",
        mode: "relay",
        ranked: false,
        private: true,
      },
      adultToken,
    )
  ).body;
  assert.equal(
    (await call("rooms/join", { code: room.code }, teenToken)).status,
    201,
  );
  await call(`rooms/${room.id}/start`, {}, adultToken);
  const roster = (await call(`rooms/${room.id}`, undefined, adultToken)).body
    .roster;
  const tokens: Record<string, string> = {
    [adultId]: adultToken,
    [peerId]: teenToken,
  };
  for (const [round, player] of roster.entries()) {
    const token = tokens[player],
      other = player === adultId ? teenToken : adultToken;
    assert.equal(
      (await call(`rooms/${room.id}/attempts`, {}, other)).status,
      403,
    );
    const a = (await call(`rooms/${room.id}/attempts`, {}, token)).body;
    await call(`attempts/${a.id}/inspect`, { nonce: a.nonce }, token);
    await call(`attempts/${a.id}/start`, { nonce: a.nonce }, token);
    const events = inverse(a.scramble).map((move, sequence) => ({
      move,
      sequence,
      elapsedMs: sequence,
    }));
    assert.equal(
      (await call(`attempts/${a.id}/moves`, { nonce: a.nonce, events }, token))
        .status,
      201,
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(
      (await call(`attempts/${a.id}/finish`, { nonce: a.nonce }, token)).body
        .status,
      "APPROVED",
    );
    const current = (await call(`rooms/${room.id}`, undefined, adultToken))
      .body;
    assert.equal(current.round, round + 1);
    assert.equal(
      current.status,
      round === roster.length - 1 ? "FINISHED" : "ACTIVE",
    );
  }
});
test("cooperative relay handoffs and exact team subtotals are server-owned in every puzzle category", async () => {
  const peerId = (await call("me", undefined, teenToken)).body.id;
  const tokens: Record<string, string> = {
    [adultId]: adultToken,
    [peerId]: teenToken,
  };
  for (const puzzle of ["2x2", "3x3", "4x4", "pyraminx"]) {
    const made = await call(
      "rooms",
      { puzzle, input: "virtual", mode: "relay", ranked: false, private: true },
      adultToken,
    );
    assert.equal(made.status, 201);
    const room = made.body;
    await call("rooms/join", { code: room.code }, teenToken);
    const waiting = (await call(`rooms/${room.id}`, undefined, adultToken))
      .body;
    assert.equal(waiting.relay.status, "waiting");
    assert.equal(waiting.relay.total, 2);
    assert.equal(
      (await call(`rooms/${room.id}/relay/end`, {}, teenToken)).status,
      403,
    );
    await call(`rooms/${room.id}/start`, {}, adultToken);
    const initial = (await call(`rooms/${room.id}`, undefined, adultToken))
      .body;
    let total = 0;
    for (const [index, player] of initial.roster.entries()) {
      const token = tokens[player];
      const issued = await Promise.all([
        call(`rooms/${room.id}/attempts`, {}, token),
        call(`rooms/${room.id}/attempts`, {}, token),
      ]);
      assert.deepEqual(issued.map((x) => x.status).sort(), [201, 409]);
      const attempt = issued.find((x) => x.status === 201)!.body;
      await call(
        `attempts/${attempt.id}/inspect`,
        { nonce: attempt.nonce },
        token,
      );
      await call(
        `attempts/${attempt.id}/start`,
        { nonce: attempt.nonce },
        token,
      );
      const events = inverse(attempt.scramble).map((move, sequence) => ({
        move,
        sequence,
        elapsedMs: sequence,
      }));
      assert.equal(
        (
          await call(
            `attempts/${attempt.id}/moves`,
            { nonce: attempt.nonce, events },
            token,
          )
        ).status,
        201,
      );
      // Reserved test database timing fixture; ranking eligibility is unchanged.
      await db.attempt.update({
        where: { id: attempt.id },
        data: { startedAt: new Date(Date.now() - 1000) },
      });
      const finished = await Promise.all([
        call(`attempts/${attempt.id}/finish`, { nonce: attempt.nonce }, token),
        call(`attempts/${attempt.id}/finish`, { nonce: attempt.nonce }, token),
      ]);
      assert.equal(finished.filter((x) => x.status === 201).length, 1);
      assert.ok(finished.some((x) => [403, 409].includes(x.status)));
      total += finished.find((x) => x.status === 201)!.body.durationMs;
      const state = (await call(`rooms/${room.id}`, undefined, token)).body;
      assert.equal(state.round, index + 1);
      assert.equal(state.relay.completed, index + 1);
      assert.equal(state.relay.solveTotalMs, total);
      assert.equal(state.relay.status, index === 1 ? "complete" : "active");
      assert.equal(state.relay.legs[index].yours, true);
      for (const id of initial.roster)
        assert.equal(JSON.stringify(state.relay).includes(id), false);
    }
    const board = await call(
      `rankings?puzzle=${puzzle}&input=virtual&mode=race`,
      undefined,
      adultToken,
    );
    const ids = (
      await db.attempt.findMany({
        where: { roomId: room.id },
        select: { id: true },
      })
    ).map((a) => a.id);
    assert.ok(board.body.every((a: any) => !ids.includes(a.id)));
  }
});

test("a relay handoff failure rolls back the verified result; retry and legacy split-write repair preserve the next turn", async () => {
  const peerId = (await call("me", undefined, teenToken)).body.id;
  const room = (
    await call(
      "rooms",
      {
        puzzle: "2x2",
        input: "virtual",
        mode: "relay",
        ranked: false,
        private: true,
      },
      adultToken,
    )
  ).body;
  await call("rooms/join", { code: room.code }, teenToken);
  await call(`rooms/${room.id}/start`, {}, adultToken);
  const initial = (await call(`rooms/${room.id}`, undefined, adultToken)).body;
  const player = initial.roster[0],
    token = player === adultId ? adultToken : teenToken;
  const attempt = (await call(`rooms/${room.id}/attempts`, {}, token)).body;
  await call(`attempts/${attempt.id}/inspect`, { nonce: attempt.nonce }, token);
  await call(`attempts/${attempt.id}/start`, { nonce: attempt.nonce }, token);
  await call(
    `attempts/${attempt.id}/moves`,
    {
      nonce: attempt.nonce,
      events: inverse(attempt.scramble).map((move, sequence) => ({
        move,
        sequence,
        elapsedMs: sequence,
      })),
    },
    token,
  );
  await db.attempt.update({
    where: { id: attempt.id },
    data: { startedAt: new Date(Date.now() - 1000) },
  });
  const { sessionUser, accountPolicy } =
    await import("../../apps/api/src/security");
  const session = await sessionUser(db as Db, token);
  const context = {
    user: session.user,
    sessionId: session.id,
    policy: await accountPolicy(db as any, session.user),
  } as any;
  const failing = new Proxy(db, {
    get(target, key) {
      if (key === "$transaction")
        return (callback: any) =>
          db.$transaction((tx) =>
            callback(
              new Proxy(tx, {
                get(inner, property) {
                  if (property === "room")
                    return new Proxy(inner.room, {
                      get(delegate, method) {
                        if (method === "update")
                          return async (args: any) => {
                            if (
                              args.where.id === room.id &&
                              args.data.round === 1
                            )
                              throw Error(
                                "Synthetic relay handoff write failure",
                              );
                            return delegate.update(args);
                          };
                        return Reflect.get(delegate, method);
                      },
                    });
                  return Reflect.get(inner, property);
                },
              }),
            ),
          );
      return Reflect.get(target, key);
    },
  }) as unknown as Db;
  await assert.rejects(
    new PlayController(failing, infrastructure, undefined as any).finish(
      context,
      attempt.id,
      { nonce: attempt.nonce },
    ),
    /handoff write failure/,
  );
  assert.equal(
    (await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status,
    "SOLVING",
  );
  assert.equal(
    (await db.room.findUniqueOrThrow({ where: { id: room.id } })).round,
    0,
  );
  assert.equal(
    (
      await call(
        `attempts/${attempt.id}/finish`,
        { nonce: attempt.nonce },
        token,
      )
    ).status,
    201,
  );
  // An old release could commit approval but miss its separate room write.
  await db.room.update({ where: { id: room.id }, data: { round: 0 } });
  const recovered = (await call(`rooms/${room.id}`, undefined, adultToken))
    .body;
  assert.equal(recovered.round, 1);
  assert.equal(recovered.relay.completed, 1);
  const next = initial.roster[1] === adultId ? adultToken : teenToken;
  assert.equal((await call(`rooms/${room.id}/attempts`, {}, next)).status, 201);
  assert.equal(
    (await call(`rooms/${room.id}/relay/end`, {}, adultToken)).status,
    201,
  );
  const ended = (await call(`rooms/${room.id}`, undefined, adultToken)).body;
  assert.equal(ended.status, "CLOSED");
  assert.equal(ended.relay.status, "interrupted");
  assert.equal(ended.relay.completed, 1);
  assert.equal(
    (
      await db.attempt.findUniqueOrThrow({
        where: {
          roomId_userId: { roomId: room.id, userId: initial.roster[1] },
        },
      })
    ).status,
    "INTERRUPTED",
  );
  assert.ok(
    [400, 409].includes(
      (await call(`rooms/${room.id}/attempts`, {}, next)).status,
    ),
  );
});

test("relay disconnection closes the team session and current authorization is checked after a captured request", async () => {
  const host = await fixture("relay-guard-host", "1990-01-01"),
    peer = await fixture("relay-guard-peer", "1990-01-01");
  const room = (
    await call(
      "rooms",
      {
        puzzle: "3x3",
        input: "virtual",
        mode: "relay",
        ranked: false,
        private: true,
      },
      host.token,
    )
  ).body;
  await call("rooms/join", { code: room.code }, peer.token);
  await call(`rooms/${room.id}/start`, {}, host.token);
  const state = (await call(`rooms/${room.id}`, undefined, host.token)).body;
  const current = state.roster[0] === host.u.id ? host : peer;
  const attempt = (await call(`rooms/${room.id}/attempts`, {}, current.token))
    .body;
  const { sessionUser, accountPolicy } =
    await import("../../apps/api/src/security");
  const session = await sessionUser(db as Db, current.token);
  const context = {
    user: session.user,
    sessionId: session.id,
    policy: await accountPolicy(db as any, session.user),
  } as any;
  await db.session.delete({ where: { id: session.id } });
  const play = new PlayController(db as Db, infrastructure, undefined as any);
  await assert.rejects(
    play.inspect(context, attempt.id, { nonce: attempt.nonce }),
    (error: any) => error.getStatus?.() === 403,
  );
  assert.equal(
    (await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status,
    "CREATED",
  );
  // Test-only state fixture exercises the real gateway disconnect persistence.
  await db.attempt.update({
    where: { id: attempt.id },
    data: { status: "INSPECTION" },
  });
  await new PlayGateway(db as Db, infrastructure, play).handleDisconnect({
    data: { userId: current.u.id, roomId: room.id },
  } as any);
  assert.equal(
    (await db.room.findUniqueOrThrow({ where: { id: room.id } })).status,
    "CLOSED",
  );
  assert.equal(
    (await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status,
    "INTERRUPTED",
  );
});

test("private rooms and files cannot be read by outsiders", async () => {
  const room = (
    await call(
      "rooms",
      {
        puzzle: "2x2",
        input: "virtual",
        mode: "sprint",
        ranked: false,
        private: true,
      },
      adultToken,
    )
  ).body;
  assert.equal(
    (await call(`rooms/${room.id}`, undefined, teenToken)).status,
    403,
  );
  assert.equal(
    (await call("rooms/join", { id: room.id }, teenToken)).status,
    404,
  );
  const m = await db.media.create({
    data: {
      userId: adultId,
      key: `INTL/${runId}/private-evidence`,
      purpose: "evidence",
      type: "video/mp4",
      size: 100,
      status: "PENDING",
    },
  });
  assert.equal((await call(`media/${m.id}`, undefined, teenToken)).status, 403);
});
test("revoked consent removes child access and public posting", async () => {
  assert.equal(
    (
      await call(
        `guardian/children/${childId}/consent`,
        undefined,
        adultToken,
        "DELETE",
      )
    ).status,
    200,
  );
  assert.equal((await call("me", undefined, childToken)).status, 401);
  assert.equal(
    await db.post.count({ where: { authorId: childId, status: "PUBLISHED" } }),
    0,
  );
});
test("real private storage processing removes image metadata and rejects malformed media", async () => {
  const bytes = await sharp({
    create: {
      width: 40,
      height: 40,
      channels: 3,
      background: { r: Math.floor(Math.random() * 255), g: 91, b: 48 },
    },
  })
    .jpeg()
    .withExif({ IFD0: { Artist: `PRIVATE-${runId}` } })
    .toBuffer();
  const worker = new Background(db as Db, infrastructure);
  for (const [data, valid] of [
    [bytes, true],
    [Buffer.from(`Not an image ${runId}`), false],
  ] as const) {
    const upload = await call(
      "media",
      { purpose: "post", type: "image/jpeg", size: data.length },
      adultToken,
    );
    assert.equal(upload.status, 201);
    const put = await fetch(upload.body.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: data,
    });
    assert.equal(put.ok, true);
    assert.equal(
      (await call(`media/${upload.body.id}/complete`, {}, adultToken)).status,
      201,
    );
    await worker.processMedia();
    const m = await db.media.findUniqueOrThrow({
      where: { id: upload.body.id },
    });
    assert.equal(m.status, valid ? "READY" : "REJECTED");
    assert.equal(
      (await call(`media/${m.id}`, undefined, teenToken)).status,
      403,
    );
    if (valid) {
      const result = await infrastructure.storage.send(
        new GetObjectCommand({
          Bucket: infrastructure.config.S3_BUCKET,
          Key: m.key,
        }),
      );
      const clean = await result.Body!.transformToByteArray();
      assert.equal((await sharp(clean).metadata()).exif, undefined);
      assert.equal(Buffer.from(clean).includes(Buffer.from("PRIVATE-")), false);
    }
    await infrastructure.delete(m.key);
    await db.media.delete({ where: { id: m.id } });
  }
});
test("imported JPEG and PNG AI claims survive private processing, force post labels and remain distinct from declarations", async () => {
  const publisher = await fixture("ai-image-publisher", "1990-01-01"),
    viewer = await fixture("ai-image-reader", "1990-01-01"),
    worker = new Background(db as Db, infrastructure),
    ids: string[] = [];
  const claim = {
    Label: "1" as const,
    ContentProducer: `synthetic-工作室-${runId}`,
    ProduceID: "source-claim",
    ReservedCode1: "unverified-signature",
    ContentPropagator: "previous-source",
    PropagateID: "previous-propagation",
    ReservedCode2: "previous-signature",
  };
  for (const Label of ["1", "2", "3"] as const) {
    const type = Label === "2" ? "image/png" : "image/jpeg";
    const bytes = await sharp({
      create: { width: 2050, height: 20, channels: 3, background: "#184e92" },
    })
      .toFormat(type === "image/png" ? "png" : "jpeg")
      .withExif({ IFD0: { Artist: `PRIVATE-DEVICE-${runId}` } })
      .withXmp(imageAiXmp({ ...claim, Label }, "source-fixture"))
      .toBuffer();
    const upload = await call(
      "media",
      { purpose: "post", type, size: bytes.length },
      publisher.token,
    );
    assert.equal(upload.status, 201);
    const id = upload.body.id;
    ids.push(id);
    assert.equal(
      (
        await fetch(upload.body.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": type },
          body: bytes,
        })
      ).ok,
      true,
    );
    assert.equal(
      (await call(`media/${id}/complete`, {}, publisher.token)).status,
      201,
    );
    await worker.processMedia();
    const media = await call(`media/${id}`, undefined, publisher.token);
    assert.equal(media.status, 200);
    assert.equal(media.body.status, "READY");
    assert.equal(media.body.aiLabel, Label);
    assert.equal(media.body.aiMetadata, undefined);
    const saved = await db.media.findUniqueOrThrow({ where: { id } });
    await assert.rejects(
      db.media.update({ where: { id }, data: { aiLabel: "4" } }),
    );
    await assert.rejects(
      db.media.update({ where: { id }, data: { aiMetadata: {} } }),
    );
    assert.deepEqual(saved.aiMetadata, {
      ...claim,
      Label,
      ContentPropagator: "Cubers",
      PropagateID: "source-fixture",
      ReservedCode2: "",
    });
    const output = Buffer.from(
      await (await fetch(media.body.url)).arrayBuffer(),
    );
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.width, 2048);
    assert.equal(metadata.exif, undefined);
    assert.equal(output.includes(Buffer.from("PRIVATE-DEVICE")), false);
    assert.deepEqual(readImageAiMetadata(output, type), {
      ...claim,
      Label,
      ContentPropagator: "Cubers",
      PropagateID: id,
      ReservedCode2: "",
    });
    const post = await call(
      "posts",
      {
        body: "Synthetic source-label fixture",
        aiGenerated: false,
        mediaIds: [id],
      },
      publisher.token,
    );
    assert.equal(post.status, 201);
    assert.equal(post.body.aiGenerated, true);
    assert.equal(post.body.aiSourceLabel, Label);
    await assert.rejects(
      db.post.update({
        where: { id: post.body.id },
        data: { aiGenerated: false },
      }),
    );
    const reviewed = await call(
      `admin/posts/${post.body.id}/review`,
      { approve: true, revision: 1, reason: "Synthetic source label reviewed" },
      adminToken,
    );
    assert.equal(reviewed.status, 201);
    const visible = await call(
      `posts/${post.body.id}`,
      undefined,
      viewer.token,
    );
    assert.equal(visible.status, 200);
    assert.equal(visible.body.aiSourceLabel, Label);
    assert.equal(
      JSON.stringify(visible.body).includes(claim.ContentProducer),
      false,
    );
    const edit = await call(
      `posts/${post.body.id}`,
      {
        body: "Declaration cannot clear imported label",
        aiGenerated: false,
        mediaIds: [id],
        revision: 1,
      },
      publisher.token,
      "PATCH",
    );
    assert.equal(edit.status, 200);
    assert.equal(edit.body.aiGenerated, true);
    assert.equal(edit.body.aiSourceLabel, Label);
    assert.equal(edit.body.status, "PENDING");
    assert.equal(edit.body.moderatorApproved, false);
    assert.equal(
      (await call(`posts/${post.body.id}`, undefined, viewer.token)).status,
      404,
    );
    const removed = await call(
      `posts/${post.body.id}`,
      {
        body: "Attachment removed for fresh review",
        aiGenerated: false,
        mediaIds: [],
        revision: 2,
      },
      publisher.token,
      "PATCH",
    );
    assert.equal(removed.status, 200);
    assert.equal(removed.body.aiSourceLabel, null);
    assert.equal(removed.body.status, "PENDING");
  }
  const mixed = await call(
    "posts",
    {
      body: "Mixed source claims",
      aiGenerated: false,
      mediaIds: [...ids].reverse(),
    },
    publisher.token,
  );
  assert.equal(mixed.status, 201);
  assert.equal(mixed.body.aiSourceLabel, "1");
  assert.equal(mixed.body.aiGenerated, true);
  assert.equal(
    (
      await call(
        "posts",
        { body: "Cannot borrow another owner's claim", mediaIds: ids },
        viewer.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "posts",
        { body: "Cannot inject source claim", aiSourceLabel: "1" },
        publisher.token,
      )
    ).status,
    400,
  );
  const declared = await call(
    "posts",
    { body: "User-declared without imported metadata", aiGenerated: true },
    publisher.token,
  );
  assert.equal(declared.status, 201);
  assert.equal(declared.body.aiGenerated, true);
  assert.equal(declared.body.aiSourceLabel, null);
  const exported = await call("me/export", undefined, publisher.token);
  assert.equal(exported.status, 200);
  assert.equal(
    exported.body.media.find((m: any) => m.id === ids[0]).aiMetadata
      .ContentProducer,
    claim.ContentProducer,
  );
  for (const xmp of [
    "<AIGC>malformed source</AIGC>",
    "<credential>c2pa</credential>",
  ]) {
    const bytes = await sharp({
      create: { width: 15, height: 10, channels: 3, background: "#814e23" },
    })
      .jpeg()
      .withXmp(xmp)
      .toBuffer();
    const upload = await call(
      "media",
      { purpose: "post", type: "image/jpeg", size: bytes.length },
      publisher.token,
    );
    assert.equal(upload.status, 201);
    assert.equal(
      (
        await fetch(upload.body.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: bytes,
        })
      ).ok,
      true,
    );
    assert.equal(
      (await call(`media/${upload.body.id}/complete`, {}, publisher.token))
        .status,
      201,
    );
    await worker.processMedia();
    const media = await call(
      `media/${upload.body.id}`,
      undefined,
      publisher.token,
    );
    assert.equal(media.body.status, "REJECTED");
    assert.equal(media.body.url, undefined);
    assert.equal(
      (
        await call(
          "posts",
          {
            body: "Rejected source cannot publish",
            mediaIds: [upload.body.id],
          },
          publisher.token,
        )
      ).status,
      400,
    );
  }
});
test("guardian child creation, export and individual deletion preserve the guardian account", async () => {
  assert.equal(
    (await call(`guardian/children/${childId}/export`, undefined, teenToken))
      .status,
    403,
  );
  const exported = await call(
    `guardian/children/${childId}/export`,
    undefined,
    adultToken,
  );
  assert.equal(exported.status, 200);
  assert.equal(exported.body.profile.id, childId);
  assert.equal(JSON.stringify(exported.body).includes("passwordHash"), false);
  assert.equal(JSON.stringify(exported.body).includes("nonce"), false);
  const documentId = (
    await db.consent.findUniqueOrThrow({ where: { id: consentId } })
  ).documentId;
  const request = {
    displayName: "New child",
    birthDate: "2018-01-01",
    documentId,
    publicPosting: false,
    recording: false,
    signedConsent: true,
  };
  assert.equal(
    (
      await call(
        "guardian/children",
        { ...request, signedConsent: false },
        adultToken,
      )
    ).status,
    400,
  );
  const created = await call("guardian/children", request, adultToken);
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "PENDING");
  assert.equal(
    (
      await call(
        `guardian/children/${created.body.childId}/session`,
        {},
        adultToken,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `guardian/children/${created.body.childId}`,
        { confirmation: "DELETE" },
        teenToken,
        "DELETE",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `guardian/children/${created.body.childId}`,
        { confirmation: "DELETE" },
        adultToken,
        "DELETE",
      )
    ).status,
    200,
  );
  assert.ok(
    (await db.user.findUniqueOrThrow({ where: { id: created.body.childId } }))
      .deletedAt,
  );
  assert.equal((await call("me", undefined, adultToken)).status, 200);
});
test("withdrawing guardian recording consent removes rank eligibility and queues evidence deletion", async () => {
  const child = await fixture("recording-child", "2018-01-01", "USER", false);
  const documentId = (
    await db.consent.findUniqueOrThrow({ where: { id: consentId } })
  ).documentId;
  await db.consent.create({
    data: {
      guardianId: adultId,
      childId: child.u.id,
      status: "APPROVED",
      recording: true,
      publicPosting: false,
      reviewedAt: new Date(),
      reviewerId: adminId,
      documentId,
    },
  });
  const room = await db.room.create({
    data: {
      code: opaque(),
      ownerId: adultId,
      puzzle: "3x3",
      input: "scan",
      mode: "race",
      ranked: true,
      private: true,
    },
  });
  const attempt = await db.attempt.create({
    data: {
      roomId: room.id,
      userId: child.u.id,
      nonce: opaque(),
      scramble: [],
      status: "APPROVED",
      durationMs: 1000,
    },
  });
  const media = await db.media.create({
    data: {
      userId: child.u.id,
      purpose: "evidence",
      attemptId: attempt.id,
      type: "video/mp4",
      status: "READY",
      size: 4,
      durationMs: 5000,
      key: `${runId}/withdraw-${opaque()}`,
    },
  });
  await db.attempt.update({
    where: { id: attempt.id },
    data: { evidenceId: media.id },
  });
  assert.equal(
    (
      await call(
        `guardian/children/${child.u.id}/consent`,
        undefined,
        adultToken,
        "DELETE",
      )
    ).status,
    200,
  );
  assert.equal(
    (await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status,
    "REJECTED",
  );
  assert.equal(
    (await db.media.findUniqueOrThrow({ where: { id: media.id } })).status,
    "DELETING",
  );
  const review = await call(
    `admin/attempts/${attempt.id}/review`,
    {
      approve: true,
      reason: "Consent withdrawal must prevent reapproval",
      evidenceChecked: true,
      uninterrupted: true,
      scrambleMatches: true,
      cubeAndHandsVisible: true,
      finalStateSolved: true,
    },
    adminToken,
  );
  assert.equal(review.status, 403);
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(await db.media.count({ where: { id: media.id } }), 0);
  assert.equal(
    (await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } }))
      .evidenceId,
    null,
  );
});
test("video processing strips audio and identifying metadata", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cubers-video-test-"));
  try {
    const input = join(temp, "input.mp4");
    await execFile(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=green:s=160x120:r=10",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=8000",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-metadata",
        `title=PRIVATE-${runId}`,
        input,
      ],
      { timeout: 20000 },
    );
    const bytes = await readFile(input),
      upload = await call(
        "media",
        { purpose: "post", type: "video/mp4", size: bytes.length },
        adultToken,
      );
    assert.equal(upload.status, 201);
    assert.equal(
      (
        await fetch(upload.body.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "video/mp4" },
          body: bytes,
        })
      ).ok,
      true,
    );
    await call(`media/${upload.body.id}/complete`, {}, adultToken);
    await new Background(db as Db, infrastructure).processMedia();
    const media = await db.media.findUniqueOrThrow({
      where: { id: upload.body.id },
    });
    assert.equal(media.status, "READY");
    assert.ok(media.durationMs! >= 900 && media.durationMs! <= 1100);
    const url = await infrastructure.downloadUrl(media.key);
    const clean = await fetch(url).then((r) => r.arrayBuffer());
    const output = join(temp, "output.mp4");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(output, Buffer.from(clean)),
    );
    const probe = await execFile("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      output,
    ]);
    const info = JSON.parse(probe.stdout);
    assert.equal(
      info.streams.some((s: any) => s.codec_type === "audio"),
      false,
    );
    assert.equal(JSON.stringify(info).includes("PRIVATE-"), false);
    await infrastructure.delete(media.key);
    await db.media.delete({ where: { id: media.id } });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test("MP4/MOV imported claims survive real private processing and force publication labels without exposing private metadata", async () => {
  const publisher = await fixture("ai-video-publisher", "1990-01-01"),
    viewer = await fixture("ai-video-viewer", "1990-01-01"),
    temp = await mkdtemp(join(tmpdir(), "cubers-video-label-integration-"));
  const source = {
    Label: "2" as const,
    ContentProducer: `synthetic-video-来源-${runId}`,
    ProduceID: "source-clip-001",
    ReservedCode1: "unverified-source",
    ContentPropagator: "prior",
    PropagateID: "prior-id",
    ReservedCode2: "prior-signature",
  };
  const ids: string[] = [];
  try {
    for (const [extension, Label] of [
      ["mp4", "2"],
      ["mov", "3"],
    ] as const) {
      const input = join(temp, `source.${extension}`),
        claim = { ...source, Label };
      await execFile(
        "ffmpeg",
        [
          "-nostdin",
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "color=c=blue:s=80x60:r=5",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:sample_rate=8000",
          "-t",
          "0.5",
          "-c:v",
          "libx264",
          "-c:a",
          "aac",
          "-metadata",
          "title=PRIVATE-LOCATION",
          "-metadata:s:v:0",
          "handler_name=PRIVATE-DEVICE",
          "-metadata",
          "AIGC=" +
            JSON.stringify({
              AIGC: { ...claim, UnknownLocation: "PRIVATE-LOCATION" },
            }),
          "-movflags",
          "use_metadata_tags",
          input,
        ],
        { timeout: 20000 },
      );
      const bytes = await readFile(input),
        type = extension === "mov" ? "video/quicktime" : "video/mp4";
      const upload = await call(
        "media",
        { purpose: "post", type, size: bytes.length },
        publisher.token,
      );
      assert.equal(upload.status, 201);
      ids.push(upload.body.id);
      assert.equal(
        (
          await fetch(upload.body.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": type },
            body: bytes,
          })
        ).ok,
        true,
      );
      assert.equal(
        (await call(`media/${upload.body.id}/complete`, {}, publisher.token))
          .status,
        201,
      );
      await new Background(db as Db, infrastructure).processMedia();
      const media = await call(
        `media/${upload.body.id}`,
        undefined,
        publisher.token,
      );
      assert.equal(media.body.status, "READY");
      assert.equal(media.body.type, "video/mp4");
      assert.equal(media.body.aiLabel, Label);
      assert.equal(media.body.aiMetadata, undefined);
      const output = Buffer.from(
        await (await fetch(media.body.url)).arrayBuffer(),
      );
      assert.deepEqual(readVideoAiMetadata(output), {
        ...claim,
        ContentPropagator: "Cubers",
        PropagateID: upload.body.id,
        ReservedCode2: "",
      });
      const saved = await db.media.findUniqueOrThrow({
        where: { id: upload.body.id },
      });
      assert.deepEqual(saved.aiMetadata, claim);
      const clean = join(temp, `clean-${extension}.mp4`);
      await import("node:fs/promises").then((fs) =>
        fs.writeFile(clean, output),
      );
      const info = JSON.parse(
        (
          await execFile("ffprobe", [
            "-v",
            "error",
            "-show_entries",
            "format_tags:stream=codec_type:stream_tags",
            "-of",
            "json",
            clean,
          ])
        ).stdout,
      );
      assert.equal(info.streams.length, 1);
      assert.equal(info.streams[0].codec_type, "video");
      assert.equal(JSON.stringify(info).includes("PRIVATE-"), false);
      const post = await call(
        "posts",
        {
          body: "Synthetic source-labelled clip",
          mediaIds: [upload.body.id],
          aiGenerated: false,
        },
        publisher.token,
      );
      assert.equal(post.status, 201);
      assert.equal(post.body.aiGenerated, true);
      assert.equal(post.body.aiSourceLabel, Label);
      assert.equal(
        (
          await call(
            `admin/posts/${post.body.id}/review`,
            {
              approve: true,
              revision: 1,
              reason: "Synthetic clip claim reviewed",
            },
            adminToken,
          )
        ).status,
        201,
      );
      const visible = await call(
        `posts/${post.body.id}`,
        undefined,
        viewer.token,
      );
      assert.equal(visible.status, 200);
      assert.equal(visible.body.aiSourceLabel, Label);
      assert.equal(
        JSON.stringify(visible.body).includes(source.ContentProducer),
        false,
      );
      assert.equal(
        (
          await call(
            `media/${upload.body.id}?postId=${post.body.id}`,
            undefined,
            viewer.token,
          )
        ).body.aiLabel,
        Label,
      );
      const edit = await call(
        `posts/${post.body.id}`,
        {
          body: "Retained source clip",
          mediaIds: [upload.body.id],
          aiGenerated: false,
          revision: 1,
        },
        publisher.token,
        "PATCH",
      );
      assert.equal(edit.status, 200);
      assert.equal(edit.body.aiSourceLabel, Label);
      assert.equal(edit.body.aiGenerated, true);
      assert.equal(edit.body.status, "PENDING");
      assert.equal(
        (await call(`posts/${post.body.id}`, undefined, viewer.token)).status,
        404,
      );
    }
    const exported = await call("me/export", undefined, publisher.token);
    assert.equal(exported.status, 200);
    assert.equal(
      exported.body.media.find((m: any) => m.id === ids[0]).aiMetadata
        .ContentProducer,
      source.ContentProducer,
    );
    const malformed = join(temp, "malformed.mp4");
    await execFile(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=80x60:r=5",
        "-t",
        "0.5",
        "-c:v",
        "libx264",
        "-metadata",
        "AIGC=malformed source",
        "-movflags",
        "use_metadata_tags",
        malformed,
      ],
      { timeout: 20000 },
    );
    const bytes = await readFile(malformed),
      upload = await call(
        "media",
        { purpose: "post", type: "video/mp4", size: bytes.length },
        publisher.token,
      );
    assert.equal(upload.status, 201);
    assert.equal(
      (
        await fetch(upload.body.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "video/mp4" },
          body: bytes,
        })
      ).ok,
      true,
    );
    assert.equal(
      (await call(`media/${upload.body.id}/complete`, {}, publisher.token))
        .status,
      201,
    );
    await new Background(db as Db, infrastructure).processMedia();
    const rejected = await call(
      `media/${upload.body.id}`,
      undefined,
      publisher.token,
    );
    assert.equal(rejected.body.status, "REJECTED");
    assert.equal(rejected.body.url, undefined);
    assert.equal(
      (
        await call(
          "posts",
          { body: "Rejected source cannot attach", mediaIds: [upload.body.id] },
          publisher.token,
        )
      ).status,
      400,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test("finalized evidence expires, appeals retain only their allowed window and unresolved attempts expire", async () => {
  const now = Date.now();
  for (const kind of ["finalized", "appealed", "unresolved"]) {
    const room = await db.room.create({
      data: {
        code: opaque(),
        ownerId: adultId,
        puzzle: "3x3",
        input: "scan",
        mode: "race",
        ranked: true,
        private: true,
      },
    });
    const a = await db.attempt.create({
      data: {
        userId: adultId,
        roomId: room.id,
        nonce: opaque(),
        scramble: [],
        status: kind === "unresolved" ? "PROVISIONAL" : "REJECTED",
        createdAt: new Date(now - (kind === "unresolved" ? 31 : 10) * 86400000),
        appealed: kind === "appealed",
        evidenceDeleteAt: new Date(
          now + (kind === "appealed" ? 10 : -1) * 86400000,
        ),
      },
    });
    const m = await db.media.create({
      data: {
        userId: adultId,
        attemptId: a.id,
        key: `${runId}/retention-${opaque()}`,
        purpose: "evidence",
        type: "video/mp4",
        size: 4,
        status: "READY",
      },
    });
    await infrastructure.storage.send(
      new PutObjectCommand({
        Bucket: infrastructure.config.S3_BUCKET,
        Key: m.key,
        Body: Buffer.from("test"),
      }),
    );
    await db.attempt.update({
      where: { id: a.id },
      data: { evidenceId: m.id },
    });
    await new Background(db as Db, infrastructure).maintenance();
    const stored = await db.attempt.findUniqueOrThrow({ where: { id: a.id } });
    if (kind === "appealed") {
      assert.equal(stored.evidenceId, m.id);
      assert.equal((await infrastructure.head(m.key)).ContentLength, 4);
      await infrastructure.delete(m.key);
      await db.media.delete({ where: { id: m.id } });
      await db.attempt.update({
        where: { id: a.id },
        data: { evidenceId: null },
      });
    } else {
      assert.equal(stored.evidenceId, null);
      assert.equal(await db.media.count({ where: { id: m.id } }), 0);
      await assert.rejects(() => infrastructure.head(m.key));
      if (kind === "unresolved") assert.equal(stored.status, "EXPIRED");
    }
  }
});
test("account deletion removes owned data and storage while preserving other members' histories", async () => {
  const departing = await fixture("departing", "1990-01-01"),
    peer = await fixture("remaining", "1990-01-01");
  const club = await db.club.create({
    data: {
      ownerId: departing.u.id,
      name: "Temporary club",
      description: "Personal text",
      status: "APPROVED",
      private: true,
    },
  });
  await db.membership.createMany({
    data: [departing.u.id, peer.u.id].map((userId) => ({
      clubId: club.id,
      userId,
      status: "APPROVED",
    })),
  });
  const personal = await db.post.create({
    data: {
      authorId: departing.u.id,
      body: "Remove this",
      tags: [],
      mediaIds: [],
    },
  });
  const peerPost = await db.post.create({
    data: {
      authorId: peer.u.id,
      clubId: club.id,
      body: "Keep my own work private",
      status: "PUBLISHED",
      tags: [],
      mediaIds: [],
    },
  });
  const room = await db.room.create({
    data: {
      ownerId: departing.u.id,
      code: opaque(),
      puzzle: "3x3",
      input: "virtual",
      mode: "race",
      ranked: false,
      private: true,
    },
  });
  const peerAttempt = await db.attempt.create({
    data: {
      roomId: room.id,
      userId: peer.u.id,
      nonce: opaque(),
      scramble: [],
      status: "APPROVED",
      durationMs: 1234,
    },
  });
  const upload = await call(
    "media",
    { purpose: "post", type: "image/png", size: 4 },
    departing.token,
  );
  assert.equal(
    (
      await fetch(upload.body.uploadUrl, {
        method: "PUT",
        body: Buffer.from("test"),
        headers: { "Content-Type": "image/png" },
      })
    ).ok,
    true,
  );
  const media = await db.media.findUniqueOrThrow({
    where: { id: upload.body.id },
  });
  assert.equal(
    (await call("me", { confirmation: "DELETE" }, departing.token, "DELETE"))
      .status,
    200,
  );
  assert.equal((await call("me", undefined, departing.token)).status, 401);
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(await db.user.count({ where: { id: departing.u.id } }), 0);
  assert.equal(await db.post.count({ where: { id: personal.id } }), 0);
  assert.equal(await db.media.count({ where: { userId: departing.u.id } }), 0);
  await assert.rejects(() => infrastructure.head(media.key));
  assert.equal(await db.post.count({ where: { id: peerPost.id } }), 1);
  assert.equal(await db.attempt.count({ where: { id: peerAttempt.id } }), 1);
  assert.equal(
    (await db.club.findUniqueOrThrow({ where: { id: club.id } })).status,
    "ARCHIVED",
  );
  assert.equal(
    (await db.room.findUniqueOrThrow({ where: { id: room.id } })).status,
    "CLOSED",
  );
});
test("private profile statistics separate inputs, exclude unapproved games and derive goal progress", async () => {
  const owner = await fixture("statistics", "1990-01-01");
  async function solve(
    input: string,
    durationMs: number,
    status = "APPROVED",
    mode = "race",
    count = 2,
  ) {
    const room = await db.room.create({
      data: {
        ownerId: owner.u.id,
        code: opaque(),
        puzzle: "3x3",
        input,
        mode,
        ranked: false,
        private: true,
      },
    });
    return db.attempt.create({
      data: {
        userId: owner.u.id,
        roomId: room.id,
        nonce: opaque(),
        scramble: [],
        status,
        durationMs,
        moves: Array.from({ length: count }, (_, sequence) => ({
          sequence,
          move: "R",
          elapsedMs: sequence,
        })),
      },
    });
  }
  for (const ms of [1000, 2000, 3000, 4000, 5000]) await solve("virtual", ms);
  await solve("scan", 800);
  await solve("scan", 900);
  await solve("virtual", 1, "REJECTED");
  await solve("virtual", 20, "APPROVED", "pattern");
  const stats = await call("me/statistics", undefined, owner.token);
  assert.equal(stats.status, 200);
  const virtual = stats.body.categories.find((x: any) => x.input === "virtual"),
    physical = stats.body.categories.find((x: any) => x.input === "scan");
  assert.equal(virtual.solves, 5);
  assert.equal(virtual.bestMs, 1000);
  assert.equal(virtual.meanMs, 3000);
  assert.equal(virtual.latestFiveTrimmedMeanMs, 3000);
  assert.equal(virtual.moveCount, 10);
  assert.equal(physical.solves, 2);
  assert.equal(physical.bestMs, 800);
  assert.equal(physical.moveCount, null);
  assert.equal(physical.turnsPerSecond, null);
  const history = await call(
    "me/history?puzzle=3x3&input=virtual",
    undefined,
    owner.token,
  );
  assert.equal(history.body.items.length, 6);
  assert.equal(
    history.body.items.every(
      (row: any) => row.room.input === "virtual" && !("nonce" in row),
    ),
    true,
  );
  const otherAttempt = await db.attempt.findFirstOrThrow({
    where: { userId: adultId },
  });
  assert.equal(
    (await call(`me/history?cursor=${otherAttempt.id}`, undefined, owner.token))
      .status,
    400,
  );
  const goal = await call(
    "me/goals",
    { puzzle: "3x3", input: "virtual", kind: "solves", target: 2 },
    owner.token,
  );
  assert.equal(goal.status, 201);
  assert.equal(
    (await call("me/goals", undefined, owner.token)).body.find(
      (x: any) => x.id === goal.body.id,
    ).current,
    0,
  );
  await solve("virtual", 2500);
  await solve("virtual", 2600);
  assert.equal(
    (await call("me/goals", undefined, owner.token)).body.find(
      (x: any) => x.id === goal.body.id,
    ).achieved,
    true,
  );
  assert.equal(
    (
      await call(
        "me/goals",
        { puzzle: "3x3", input: "virtual", kind: "time", target: 1 },
        owner.token,
      )
    ).status,
    400,
  );
  await call(`me/goals/${goal.body.id}`, undefined, teenToken, "DELETE");
  assert.equal(await db.practiceGoal.count({ where: { id: goal.body.id } }), 1);
  const exported = await call("me/export", undefined, owner.token);
  assert.equal(
    exported.body.goals.some((x: any) => x.id === goal.body.id),
    true,
  );
  await call(`me/goals/${goal.body.id}`, undefined, owner.token, "DELETE");
  assert.equal(await db.practiceGoal.count({ where: { id: goal.body.id } }), 0);
});

test("private clubs require invitations, membership and version-specific moderation", async () => {
  const owner = await fixture("club-owner", "1990-01-01"),
    peer = await fixture("club-peer", "2010-01-01", "USER", false),
    stranger = await fixture("club-stranger", "1990-01-01");
  const created = await call(
    "clubs",
    {
      name: "Synthetic private cubers",
      description: "A local integration fixture",
      private: true,
    },
    owner.token,
  );
  assert.equal(created.status, 201);
  const club = created.body;
  assert.equal(
    (await call(`clubs/${club.id}`, undefined, stranger.token)).status,
    404,
  );
  assert.equal(
    (
      await call(
        "clubs",
        {
          name: "Teen-managed club",
          description: "Not allowed",
          private: false,
        },
        peer.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `admin/review/club/${club.id}`,
        { approve: true, reason: "Reviewed club fixture", revision: 1 },
        adminToken,
      )
    ).status,
    201,
  );
  assert.ok(
    !(await call("clubs", undefined, stranger.token)).body.some(
      (row: any) => row.id === club.id,
    ),
  );
  assert.equal(
    (await call(`clubs/${club.id}/join`, {}, peer.token)).status,
    403,
  );
  const invited = await call(
    "clubs/invite",
    { code: club.inviteCode },
    peer.token,
  );
  assert.equal(invited.status, 201);
  assert.equal(invited.body.membership, "PENDING");
  assert.equal(invited.body.inviteCode, undefined);
  assert.equal(
    (await call(`clubs/${club.id}`, undefined, peer.token)).body.canRead,
    false,
  );
  assert.equal(
    (await call(`clubs/${club.id}/members`, undefined, peer.token)).status,
    404,
  );
  assert.equal(
    (
      await call(
        `clubs/${club.id}/members/${peer.u.id}`,
        { status: "APPROVED" },
        owner.token,
      )
    ).status,
    201,
  );
  assert.equal(
    (await call(`clubs/${club.id}`, undefined, peer.token)).body.canRead,
    true,
  );
  const announcement = await call(
    "posts",
    {
      body: "Synthetic club announcement",
      clubId: club.id,
      kind: "ANNOUNCEMENT",
    },
    owner.token,
  );
  assert.equal(announcement.status, 201);
  assert.equal(
    (
      await call(
        "posts",
        { body: "Not the owner", clubId: club.id, kind: "ANNOUNCEMENT" },
        peer.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `admin/posts/${announcement.body.id}/review`,
        { approve: true, revision: 1, reason: "Reviewed announcement fixture" },
        adminToken,
      )
    ).status,
    201,
  );
  assert.ok(
    (
      await call(
        `feed?clubId=${club.id}&postKind=ANNOUNCEMENT`,
        undefined,
        peer.token,
      )
    ).body.items.some((row: any) => row.id === announcement.body.id),
  );
  assert.equal(
    (await call(`feed?clubId=${club.id}`, undefined, stranger.token)).status,
    404,
  );
  assert.equal(
    (await call(`posts/${announcement.body.id}`, undefined, stranger.token))
      .status,
    404,
  );
  const rotated = await call(`clubs/${club.id}/invite/rotate`, {}, owner.token);
  assert.notEqual(rotated.body.inviteCode, club.inviteCode);
  assert.equal(
    (await call("clubs/invite", { code: club.inviteCode }, stranger.token))
      .status,
    404,
  );
  assert.equal(
    (
      await call(
        `clubs/${club.id}/members/${peer.u.id}`,
        { status: "BANNED" },
        owner.token,
      )
    ).status,
    201,
  );
  await call(`clubs/${club.id}/membership`, undefined, peer.token, "DELETE");
  assert.equal(
    (await call("clubs/invite", { code: rotated.body.inviteCode }, peer.token))
      .status,
    403,
  );
  assert.equal(
    (await call(`posts/${announcement.body.id}`, undefined, peer.token)).status,
    404,
  );
  const edited = await call(
    `clubs/${club.id}`,
    {
      name: "Synthetic renamed public club",
      description: "Reviewed again",
      private: false,
    },
    owner.token,
    "PATCH",
  );
  assert.equal(edited.body.revision, 2);
  assert.ok(
    !(await call("feed", undefined, stranger.token)).body.items.some(
      (row: any) => row.id === announcement.body.id,
    ),
  );
  assert.equal(
    (
      await call(
        `admin/review/club/${club.id}`,
        { approve: true, reason: "Stale club fixture review", revision: 1 },
        adminToken,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `admin/review/club/${club.id}`,
        { approve: true, reason: "Reviewed changed club fixture", revision: 2 },
        adminToken,
      )
    ).status,
    201,
  );
  assert.equal(
    (await call(`posts/${announcement.body.id}`, undefined, stranger.token))
      .status,
    200,
  );
  assert.equal(
    (
      await call(
        `admin/review/club/${club.id}`,
        { approve: false, reason: "Fixture club withdrawn", revision: 2 },
        adminToken,
      )
    ).status,
    201,
  );
  assert.equal(
    (await call(`posts/${announcement.body.id}`, undefined, stranger.token))
      .status,
    404,
  );
});

test("photo posts enforce private processing, tags, saved feeds and edit reapproval", async () => {
  const publisher = await fixture("media-publisher", "1990-01-01"),
    viewer = await fixture("media-viewer", "1990-01-01");
  const bytes = await sharp({
    create: {
      width: 30,
      height: 20,
      channels: 3,
      background: { r: 17, g: 78, b: 124 },
    },
  })
    .jpeg()
    .withMetadata({
      exif: { IFD0: { ImageDescription: `Private test ${runId}` } },
    })
    .toBuffer();
  const upload = await call(
    "media",
    { purpose: "post", type: "image/jpeg", size: bytes.length },
    publisher.token,
  );
  assert.equal(upload.status, 201);
  const id = upload.body.id;
  assert.equal(
    (await call(`media/${id}`, undefined, viewer.token)).status,
    403,
  );
  assert.equal(
    (
      await fetch(upload.body.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: bytes,
      })
    ).ok,
    true,
  );
  assert.equal(
    (await call(`media/${id}/complete`, {}, publisher.token)).status,
    201,
  );
  await new Background(db as Db, infrastructure).processMedia();
  assert.equal(
    (await call(`media/${id}`, undefined, publisher.token)).body.status,
    "READY",
  );
  assert.equal(
    (
      await call(
        "posts",
        { body: "Duplicate attachments", mediaIds: [id, id] },
        publisher.token,
      )
    ).status,
    400,
  );
  const post = await call(
    "posts",
    {
      body: "Synthetic photo post",
      tags: ["F2L", "f2l", "练习"],
      mediaIds: [id],
    },
    publisher.token,
  );
  assert.equal(post.status, 201);
  assert.deepEqual(post.body.tags, ["f2l", "练习"]);
  assert.equal(
    (await call(`media/${id}`, undefined, publisher.token, "DELETE")).status,
    400,
  );
  assert.equal(
    (await call(`posts/${post.body.id}`, undefined, viewer.token)).status,
    404,
  );
  await call(
    `admin/posts/${post.body.id}/review`,
    { approve: true, revision: 1, reason: "Reviewed photo fixture" },
    adminToken,
  );
  const privateMedia = await call(
    `media/${id}?postId=${post.body.id}`,
    undefined,
    viewer.token,
  );
  assert.equal(privateMedia.status, 200);
  assert.equal(
    (await call(`media/${id}?postId=${randomUUID()}`, undefined, viewer.token))
      .status,
    403,
  );
  const clean = Buffer.from(
    await (await fetch(privateMedia.body.url)).arrayBuffer(),
  );
  assert.equal((await sharp(clean).metadata()).exif, undefined);
  for (let i = 0; i < 2; i++)
    await call(
      "social",
      { targetId: post.body.id, kind: "like", enabled: true },
      viewer.token,
    );
  assert.equal(
    (await call(`posts/${post.body.id}`, undefined, viewer.token)).body.likes,
    1,
  );
  await call(
    "social",
    { targetId: post.body.id, kind: "save", enabled: true },
    viewer.token,
  );
  assert.ok(
    (await call("feed?kind=saved", undefined, viewer.token)).body.items.some(
      (row: any) => row.id === post.body.id,
    ),
  );
  assert.ok(
    (await call("feed?tag=F2L", undefined, viewer.token)).body.items.some(
      (row: any) => row.id === post.body.id,
    ),
  );
  assert.equal(
    (await call(`posts/${post.body.id}`, undefined, viewer.token)).body.reason,
    undefined,
  );
  assert.equal(
    (
      await call(
        `posts/${post.body.id}`,
        {
          body: "Edited private photo post",
          tags: [],
          mediaIds: [id],
          revision: 1,
        },
        publisher.token,
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        `posts/${post.body.id}`,
        { body: "Stale update", revision: 1 },
        publisher.token,
        "PATCH",
      )
    ).status,
    409,
  );
  assert.equal(
    (await call(`media/${id}?postId=${post.body.id}`, undefined, viewer.token))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        `admin/posts/${post.body.id}/review`,
        { approve: true, revision: 1, reason: "Stale photo review" },
        adminToken,
      )
    ).status,
    400,
  );
  await call(`posts/${post.body.id}`, undefined, publisher.token, "DELETE");
  assert.equal(
    (await call(`media/${id}`, undefined, publisher.token, "DELETE")).status,
    200,
  );
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(await db.media.findUnique({ where: { id } }), null);
  const rows = Array.from({ length: 23 }, (_, i) => ({
    authorId: publisher.u.id,
    body: `page-${runId}-${i}`,
    tags: [],
    mediaIds: [],
    status: "PUBLISHED",
    guardianApproved: true,
    moderatorApproved: true,
  }));
  await db.post.createMany({ data: rows });
  const first = await call(`feed?q=page-${runId}`, undefined, viewer.token),
    next = await call(
      `feed?q=page-${runId}&cursor=${first.body.nextCursor}`,
      undefined,
      viewer.token,
    );
  assert.equal(first.body.items.length, 20);
  assert.equal(next.body.items.length, 3);
  assert.equal(
    new Set([...first.body.items, ...next.body.items].map((row: any) => row.id))
      .size,
    23,
  );
});

test("MOV post uploads become silent MP4 and oversized-duration clips are rejected", async () => {
  const publisher = await fixture("mov-publisher", "1990-01-01"),
    temp = await mkdtemp(join(tmpdir(), "cubers-mov-test-"));
  try {
    const input = join(temp, "source.mov");
    await execFile(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=160x120:r=5",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=330:sample_rate=8000",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-metadata",
        `title=MOV-PRIVATE-${runId}`,
        input,
      ],
      { timeout: 20000 },
    );
    const bytes = await readFile(input),
      upload = await call(
        "media",
        { purpose: "post", type: "video/quicktime", size: bytes.length },
        publisher.token,
      );
    assert.equal(upload.status, 201);
    assert.equal(
      (
        await fetch(upload.body.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "video/quicktime" },
          body: bytes,
        })
      ).ok,
      true,
    );
    await call(`media/${upload.body.id}/complete`, {}, publisher.token);
    await new Background(db as Db, infrastructure).processMedia();
    const result = await call(
      `media/${upload.body.id}`,
      undefined,
      publisher.token,
    );
    assert.equal(result.body.status, "READY");
    assert.equal(result.body.type, "video/mp4");
    assert.ok(result.body.durationMs >= 900 && result.body.durationMs <= 1100);
    const output = join(temp, "clean.mp4");
    await import("node:fs/promises").then((fs) =>
      fetch(result.body.url)
        .then((response) => response.arrayBuffer())
        .then((buffer) => fs.writeFile(output, Buffer.from(buffer))),
    );
    const probe = JSON.parse(
      (
        await execFile("ffprobe", [
          "-v",
          "error",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          output,
        ])
      ).stdout,
    );
    assert.equal(
      probe.streams.some((stream: any) => stream.codec_type === "audio"),
      false,
    );
    assert.equal(JSON.stringify(probe).includes("MOV-PRIVATE"), false);
    const long = join(temp, "long.mov");
    await execFile(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=16x16:r=1",
        "-t",
        "91",
        "-c:v",
        "libx264",
        "-metadata",
        `comment=long-${runId}`,
        long,
      ],
      { timeout: 20000 },
    );
    const longBytes = await readFile(long),
      rejected = await call(
        "media",
        { purpose: "post", type: "video/quicktime", size: longBytes.length },
        publisher.token,
      );
    assert.equal(rejected.status, 201);
    await fetch(rejected.body.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/quicktime" },
      body: longBytes,
    });
    await call(`media/${rejected.body.id}/complete`, {}, publisher.token);
    await new Background(db as Db, infrastructure).processMedia();
    const invalid = await call(
      `media/${rejected.body.id}`,
      undefined,
      publisher.token,
    );
    assert.equal(invalid.body.status, "REJECTED");
    assert.equal(invalid.body.url, undefined);
    assert.equal(
      (
        await call(
          "media",
          {
            purpose: "evidence",
            type: "video/quicktime",
            size: bytes.length,
            attemptId: randomUUID(),
          },
          publisher.token,
        )
      ).status,
      403,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("threaded replies require moderation, respect blocks and hide removed ancestry", async () => {
  const publisher = await fixture("thread-publisher", "1990-01-01"),
    peer = await fixture("thread-peer", "1990-01-01"),
    reader = await fixture("thread-reader", "1990-01-01");
  const post = (
    await call(
      "posts",
      { body: "Synthetic threaded conversation" },
      publisher.token,
    )
  ).body;
  await call(
    `admin/posts/${post.id}/review`,
    { approve: true, revision: 1, reason: "Reviewed thread fixture" },
    adminToken,
  );
  const root = await call(
    `posts/${post.id}/comments`,
    { body: "A root reply" },
    peer.token,
  );
  assert.equal(root.status, 201);
  assert.equal(
    (await call(`posts/${post.id}/comments`, undefined, reader.token)).body
      .length,
    0,
  );
  assert.equal(
    (
      await call(
        `admin/review/comment/${root.body.id}`,
        { approve: true, reason: "Reviewed root reply" },
        adminToken,
      )
    ).status,
    201,
  );
  const reply = await call(
    `posts/${post.id}/comments`,
    { body: "A nested reply", parentId: root.body.id },
    publisher.token,
  );
  assert.equal(reply.status, 201);
  await call(
    `admin/review/comment/${reply.body.id}`,
    { approve: true, reason: "Reviewed nested reply" },
    adminToken,
  );
  const visible = await call(
    `posts/${post.id}/comments`,
    undefined,
    reader.token,
  );
  assert.equal(visible.body.length, 2);
  assert.equal(
    visible.body.find((row: any) => row.id === reply.body.id).parentId,
    root.body.id,
  );
  await call(
    "social",
    { targetId: peer.u.id, kind: "block", enabled: true },
    publisher.token,
  );
  assert.equal(
    (await call(`posts/${post.id}/comments`, undefined, publisher.token)).body
      .length,
    0,
  );
  assert.equal(
    (
      await call(
        `posts/${post.id}/comments`,
        { body: "Blocked reply", parentId: root.body.id },
        publisher.token,
      )
    ).status,
    403,
  );
  await call(
    "social",
    { targetId: peer.u.id, kind: "block", enabled: false },
    publisher.token,
  );
  assert.equal(
    (await call(`posts/${post.id}/comments`, undefined, publisher.token)).body
      .length,
    2,
  );
  await call(
    `admin/review/comment/${root.body.id}`,
    { approve: false, reason: "Removed root fixture" },
    adminToken,
  );
  assert.equal(
    (await call(`posts/${post.id}/comments`, undefined, reader.token)).body
      .length,
    0,
  );
  let parentId: string | undefined;
  for (let depth = 0; depth <= 5; depth++) {
    const row = await call(
      `posts/${post.id}/comments`,
      { body: `Depth ${depth}`, ...(parentId ? { parentId } : {}) },
      publisher.token,
    );
    assert.equal(row.status, 201);
    assert.equal(
      (
        await call(
          `admin/review/comment/${row.body.id}`,
          { approve: true, reason: "Reviewed depth fixture" },
          adminToken,
        )
      ).status,
      201,
    );
    parentId = row.body.id;
  }
  assert.equal(
    (
      await call(
        `posts/${post.id}/comments`,
        { body: "Too deeply nested", parentId },
        publisher.token,
      )
    ).status,
    400,
  );
});

test("identical authorized photos remain separate while duplicate competition clips are rejected", async () => {
  const first = await fixture("duplicate-media-a", "1990-01-01"),
    second = await fixture("duplicate-media-b", "1990-01-01");
  const photo = await sharp({
    create: {
      width: 20,
      height: 20,
      channels: 3,
      background: { r: 34, g: 129, b: 76 },
    },
  })
    .jpeg()
    .toBuffer();
  const ids: string[] = [];
  for (const owner of [first, second]) {
    const upload = await call(
      "media",
      { purpose: "post", type: "image/jpeg", size: photo.length },
      owner.token,
    );
    assert.equal(upload.status, 201);
    ids.push(upload.body.id);
    await fetch(upload.body.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: photo,
    });
    await call(`media/${upload.body.id}/complete`, {}, owner.token);
  }
  await new Background(db as Db, infrastructure).processMedia();
  const photos = await db.media.findMany({ where: { id: { in: ids } } });
  assert.equal(photos.filter((media) => media.status === "READY").length, 2);
  assert.equal(photos[0].sha256, photos[1].sha256);
  assert.notEqual(photos[0].key, photos[1].key);
  assert.equal(
    (await call(`media/${ids[0]}`, undefined, second.token)).status,
    403,
  );
  const temp = await mkdtemp(join(tmpdir(), "cubers-duplicate-video-"));
  try {
    const input = join(temp, "source.mp4");
    await execFile(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=yellow:s=32x32:r=2",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-metadata",
        `comment=evidence-${runId}`,
        input,
      ],
      { timeout: 20000 },
    );
    const bytes = await readFile(input),
      clips: string[] = [];
    for (const owner of [first, second]) {
      const key = `INTL/${runId}/${owner.u.id}/duplicate-clip/upload`;
      await infrastructure.storage.send(
        new PutObjectCommand({
          Bucket: infrastructure.config.S3_BUCKET,
          Key: key,
          Body: bytes,
          ContentType: "video/mp4",
        }),
      );
      const media = await db.media.create({
        data: {
          userId: owner.u.id,
          key,
          purpose: "evidence",
          type: "video/mp4",
          size: bytes.length,
          status: "PROCESSING",
          attemptId: randomUUID(),
        },
      });
      clips.push(media.id);
    }
    await new Background(db as Db, infrastructure).processMedia();
    const results = await db.media.findMany({ where: { id: { in: clips } } });
    assert.deepEqual(results.map((media) => media.status).sort(), [
      "READY",
      "REJECTED",
    ]);
    assert.ok(
      results.find((media) => media.status === "READY")!.evidenceFingerprint,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("child private-club media still requires guardian and moderator approval", async () => {
  const owner = await fixture("child-club-owner", "1990-01-01"),
    guardian = await fixture("child-club-guardian", "1990-01-01"),
    child = await fixture("child-club-member", "2018-01-01", "USER", false);
  const doc = await db.media.create({
    data: {
      userId: guardian.u.id,
      key: `INTL/${runId}/child-club-consent`,
      purpose: "consent",
      type: "application/pdf",
      size: 32,
      status: "READY",
    },
  });
  await db.consent.create({
    data: {
      childId: child.u.id,
      guardianId: guardian.u.id,
      documentId: doc.id,
      status: "APPROVED",
      publicPosting: true,
      reviewedAt: new Date(),
    },
  });
  const club = (
    await call(
      "clubs",
      {
        name: "Synthetic child-safe club",
        description: "Private fixture",
        private: true,
      },
      owner.token,
    )
  ).body;
  await call(
    `admin/review/club/${club.id}`,
    { approve: true, reason: "Reviewed child-safe club fixture", revision: 1 },
    adminToken,
  );
  await call("clubs/invite", { code: club.inviteCode }, child.token);
  await call(
    `clubs/${club.id}/members/${child.u.id}`,
    { status: "APPROVED" },
    owner.token,
  );
  const image = await sharp({
    create: {
      width: 20,
      height: 20,
      channels: 3,
      background: { r: 98, g: 172, b: 37 },
    },
  })
    .jpeg()
    .toBuffer();
  const upload = (
    await call(
      "media",
      { purpose: "post", type: "image/jpeg", size: image.length },
      child.token,
    )
  ).body;
  await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: image,
  });
  await call(`media/${upload.id}/complete`, {}, child.token);
  await new Background(db as Db, infrastructure).processMedia();
  const post = await call(
    "posts",
    {
      body: "Synthetic child club contribution",
      clubId: club.id,
      mediaIds: [upload.id],
    },
    child.token,
  );
  assert.equal(post.status, 201);
  const review = () =>
    call(
      `admin/posts/${post.body.id}/review`,
      { approve: true, reason: "Reviewed child media fixture", revision: 1 },
      adminToken,
    );
  assert.equal((await review()).status, 403);
  assert.equal(
    (await call(`media/${upload.id}`, undefined, guardian.token)).status,
    200,
  );
  assert.equal(
    (await call(`clubs/${club.id}`, undefined, guardian.token)).status,
    404,
  );
  assert.equal(
    (
      await call(
        `guardian/posts/${post.body.id}/approve`,
        { revision: 1 },
        guardian.token,
      )
    ).status,
    201,
  );
  assert.equal((await review()).status, 201);
  assert.equal(
    (await call(`posts/${post.body.id}`, undefined, owner.token)).status,
    200,
  );
  assert.equal(
    (
      await call(
        `posts/${post.body.id}/comments`,
        { body: "A child reply" },
        child.token,
      )
    ).status,
    403,
  );
  await call(
    `guardian/children/${child.u.id}/consent`,
    undefined,
    guardian.token,
    "DELETE",
  );
  assert.equal(
    (await call(`posts/${post.body.id}`, undefined, owner.token)).status,
    404,
  );
  assert.equal(
    (
      await call(
        `media/${upload.id}?postId=${post.body.id}`,
        undefined,
        owner.token,
      )
    ).status,
    403,
  );
});

test("abandoned-upload cleanup cannot remove a concurrently attached photo", async () => {
  const owner = await fixture("cleanup-race-owner", "1990-01-01");
  const bytes = await sharp({
    create: {
      width: 20,
      height: 20,
      channels: 3,
      background: { r: 132, g: 40, b: 72 },
    },
  })
    .jpeg()
    .toBuffer();
  const key = `INTL/${runId}/cleanup-race/clean`;
  await infrastructure.storage.send(
    new PutObjectCommand({
      Bucket: infrastructure.config.S3_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: "image/jpeg",
    }),
  );
  const media = await db.media.create({
    data: {
      userId: owner.u.id,
      key,
      purpose: "post",
      type: "image/jpeg",
      size: bytes.length,
      status: "READY",
      createdAt: new Date(Date.now() - 2 * 86400000),
    },
  });
  const [post] = await Promise.all([
    call(
      "posts",
      { body: "Synthetic cleanup race", mediaIds: [media.id] },
      owner.token,
    ),
    new Background(db as Db, infrastructure).maintenance(),
  ]);
  const after = await db.media.findUnique({ where: { id: media.id } });
  if (post.status === 201) {
    assert.equal(after?.status, "READY");
    assert.equal((await infrastructure.head(key)).ContentLength, bytes.length);
  } else {
    assert.equal(post.status, 400);
    assert.equal(after, null);
  }
});

test("API rejects malformed JSON, oversized or compressed bodies and unapproved browser origins", async () => {
  for (const [headers, body, status] of [
    [{ "Content-Type": "application/json" }, "{broken", 400],
    [
      { "Content-Type": "application/json" },
      JSON.stringify({ value: "x".repeat(140000) }),
      413,
    ],
    [{ "Content-Type": "text/plain" }, "{}", 415],
    [
      { "Content-Type": "application/json", "Content-Encoding": "gzip" },
      "{}",
      415,
    ],
    [
      {
        "Content-Type": "application/json",
        Origin: "https://attacker.invalid",
      },
      "{}",
      403,
    ],
    [{ "Content-Type": "application/json", Origin: "null" }, "{}", 403],
  ] as [Record<string, string>, string, number][]) {
    const response = await fetch(`${origin}/v1/auth/login`, {
      method: "POST",
      headers,
      body,
    });
    assert.equal(response.status, status);
    const payload = await response.text();
    assert.equal(payload.includes("SyntaxError"), false);
    assert.equal(payload.includes("node_modules"), false);
  }
  assert.equal(
    (
      await fetch(`${origin}/v1/health`, {
        headers: { Origin: "http://localhost:8081" },
      })
    ).status,
    200,
  );
  assert.equal((await call("me", undefined, "not-a-session")).status, 401);
});

async function connectSocket(token: unknown, browserOrigin?: string) {
  const socket = io(`${origin}/play`, {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
    timeout: 2000,
    ...(browserOrigin ? { extraHeaders: { Origin: browserOrigin } } : {}),
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", (error) => {
      socket.disconnect();
      reject(error);
    });
  });
  return socket;
}
test("realtime admission rejects unauthenticated, malformed, foreign-origin and excess account connections", async () => {
  const account = await fixture("socket-security", "1990-01-01");
  await assert.rejects(connectSocket(undefined));
  await assert.rejects(connectSocket({ forged: true }));
  await assert.rejects(
    connectSocket(account.token, "https://attacker.invalid"),
  );
  const sockets: Awaited<ReturnType<typeof connectSocket>>[] = [];
  try {
    for (let i = 0; i < 4; i++)
      sockets.push(await connectSocket(account.token, "http://localhost:8081"));
    await assert.rejects(connectSocket(account.token));
    sockets.pop()!.disconnect();
    await waitFor(
      async () =>
        (await infrastructure.redis.zcard(`ws-connections:${account.u.id}`)) ===
        3,
    );
    sockets.push(await connectSocket(account.token));
    await db.session.deleteMany({ where: { userId: account.u.id } });
    assert.equal(
      (await sockets[0].timeout(2000).emitWithAck("room.refresh")).ok,
      false,
    );
  } finally {
    for (const socket of sockets) socket.disconnect();
  }
});

async function securityChild(name: string, birthDate = "2018-01-01") {
  const guardian = await fixture(`${name}-guardian`, "1990-01-01"),
    child = await fixture(`${name}-child`, birthDate, "USER", false);
  const consent = await db.consent.create({
    data: {
      guardianId: guardian.u.id,
      childId: child.u.id,
      documentId: randomUUID(),
      status: "APPROVED",
      publicPosting: true,
      recording: true,
      reviewedAt: new Date(),
      reviewerId: adminId,
    },
  });
  return { guardian, child, consent };
}
test("guardian eligibility is rechecked for child sessions, public content and private evidence access", async () => {
  const { guardian, child } = await securityChild("guardian-current");
  const photo = await db.media.create({
    data: {
      userId: child.u.id,
      purpose: "post",
      type: "image/jpeg",
      size: 32,
      status: "READY",
      key: `INTL/${runId}/guardian-security-photo`,
    },
  });
  const post = await db.post.create({
    data: {
      authorId: child.u.id,
      body: "Synthetic reviewed child post",
      status: "PUBLISHED",
      moderatorApproved: true,
      guardianApproved: true,
      mediaIds: [photo.id],
    },
  });
  assert.equal(
    (await call(`posts/${post.id}`, undefined, adultToken)).status,
    200,
  );
  assert.equal(
    (await call(`media/${photo.id}`, undefined, guardian.token)).status,
    200,
  );
  await db.user.update({
    where: { id: guardian.u.id },
    data: { adultVerified: false },
  });
  assert.equal(
    (await call("me", undefined, child.token)).body.permissions.canLearn,
    false,
  );
  assert.equal(
    (await call(`guardian/children/${child.u.id}/session`, {}, guardian.token))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        `guardian/children/${child.u.id}/export`,
        undefined,
        guardian.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (await call(`media/${photo.id}`, undefined, guardian.token)).status,
    403,
  );
  assert.equal(
    (await call(`posts/${post.id}`, undefined, adultToken)).status,
    404,
  );
});
test("former guardians cannot access or delete a linked account after it reaches adulthood", async () => {
  const { guardian, child } = await securityChild(
    "adult-independence",
    "2008-01-01",
  );
  const photo = await db.media.create({
    data: {
      userId: child.u.id,
      purpose: "post",
      type: "image/jpeg",
      size: 32,
      status: "READY",
      key: `INTL/${runId}/adult-private-photo`,
    },
  });
  assert.equal(
    (
      await call(
        `guardian/children/${child.u.id}/export`,
        undefined,
        guardian.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (await call(`guardian/children/${child.u.id}/session`, {}, guardian.token))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        `guardian/children/${child.u.id}`,
        { confirmation: "DELETE" },
        guardian.token,
        "DELETE",
      )
    ).status,
    403,
  );
  assert.equal(
    (await call(`media/${photo.id}`, undefined, guardian.token)).status,
    403,
  );
  assert.equal(
    (await call("me", { confirmation: "DELETE" }, guardian.token, "DELETE"))
      .status,
    200,
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: child.u.id } })).deletedAt,
    null,
  );
  assert.equal((await call("me", undefined, child.token)).status, 200);
});
test("legacy social mutations cannot bypass friendship acceptance or controlled mentorship", async () => {
  for (const kind of ["friend", "mentorship"]) {
    assert.equal(
      (
        await call(
          "social",
          { targetId: childId, kind, enabled: true },
          adultToken,
        )
      ).status,
      403,
    );
    assert.equal(
      await db.social.count({
        where: { actorId: adultId, targetId: childId, kind },
      }),
      0,
    );
  }
});
test("disguised SVG and network playlists cannot be processed as photos or videos", async () => {
  const owner = await fixture("disguised-media", "1990-01-01");
  for (const [type, content] of [
    [
      "image/jpeg",
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///etc/passwd"/></svg>',
    ],
    ["video/mp4", "#EXTM3U\n#EXTINF:1\nhttp://127.0.0.1:4010/private\n"],
  ]) {
    const bytes = Buffer.from(content);
    const upload = await call(
      "media",
      { purpose: "post", type, size: bytes.length },
      owner.token,
    );
    assert.equal(upload.status, 201);
    assert.equal(
      (
        await fetch(upload.body.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": type },
          body: bytes,
        })
      ).status,
      200,
    );
    assert.equal(
      (await call(`media/${upload.body.id}/complete`, {}, owner.token)).status,
      201,
    );
    await new Background(db as Db, infrastructure).processMedia();
    assert.equal(
      (await db.media.findUniqueOrThrow({ where: { id: upload.body.id } }))
        .status,
      "REJECTED",
    );
    assert.equal(
      (await call(`media/${upload.body.id}`, undefined, owner.token)).body.url,
      undefined,
    );
  }
});
test("approval racing guardian withdrawal cannot restore a physical ranking", async () => {
  const { guardian, child } = await securityChild("rank-consent-race");
  const room = await db.room.create({
    data: {
      code: opaque(),
      ownerId: guardian.u.id,
      puzzle: "3x3",
      input: "scan",
      mode: "race",
      ranked: true,
      private: true,
    },
  });
  const attempt = await db.attempt.create({
    data: {
      roomId: room.id,
      userId: child.u.id,
      nonce: opaque(),
      scramble: [],
      status: "PROVISIONAL",
      durationMs: 1000,
    },
  });
  const media = await db.media.create({
    data: {
      userId: child.u.id,
      purpose: "evidence",
      attemptId: attempt.id,
      type: "video/mp4",
      status: "READY",
      size: 4,
      durationMs: 5000,
      key: `INTL/${runId}/rank-race-evidence`,
    },
  });
  await db.attempt.update({
    where: { id: attempt.id },
    data: { evidenceId: media.id },
  });
  const [review, withdrawal] = await Promise.all([
    call(
      `admin/attempts/${attempt.id}/review`,
      {
        approve: true,
        reason: "Synthetic evidence review race",
        evidenceChecked: true,
        uninterrupted: true,
        scrambleMatches: true,
        cubeAndHandsVisible: true,
        finalStateSolved: true,
      },
      adminToken,
    ),
    call(
      `guardian/children/${child.u.id}/consent`,
      undefined,
      guardian.token,
      "DELETE",
    ),
  ]);
  assert.ok([201, 403].includes(review.status), JSON.stringify(review));
  assert.equal(withdrawal.status, 200);
  assert.equal(
    (await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status,
    "REJECTED",
  );
  assert.equal(
    (await call("rankings?input=scan", undefined, adultToken)).body.some(
      (row: any) => row.id === attempt.id,
    ),
    false,
  );
});
test("a child's display-name change cannot alter already reviewed public content without reapproval", async () => {
  const { child } = await securityChild("reviewed-identity");
  const post = await db.post.create({
    data: {
      authorId: child.u.id,
      body: "Synthetic public identity fixture",
      status: "PUBLISHED",
      guardianApproved: true,
      moderatorApproved: true,
    },
  });
  const comment = await db.comment.create({
    data: {
      postId: post.id,
      authorId: child.u.id,
      body: "Synthetic reviewed reply",
      status: "APPROVED",
    },
  });
  assert.equal(
    (
      await call(
        "me",
        { displayName: "contact@example.com", bio: "", privateProfile: true },
        child.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "me",
        { displayName: "New safe nickname", bio: "", privateProfile: true },
        child.token,
      )
    ).status,
    201,
  );
  const updated = await db.post.findUniqueOrThrow({ where: { id: post.id } });
  assert.equal(updated.status, "PENDING");
  assert.equal(updated.revision, post.revision + 1);
  assert.equal(updated.guardianApproved, false);
  assert.equal(updated.moderatorApproved, false);
  assert.equal(
    (await db.comment.findUniqueOrThrow({ where: { id: comment.id } })).status,
    "PENDING",
  );
  assert.equal(
    (await call(`posts/${post.id}`, undefined, adultToken)).status,
    404,
  );
});
test("concurrent upload reservations respect pending limits and deleting files cannot reset the byte budget", async () => {
  const owner = await fixture("upload-budget", "1990-01-01");
  await db.media.createMany({
    data: Array.from({ length: 11 }, (_, index) => ({
      userId: owner.u.id,
      purpose: "post",
      type: "image/jpeg",
      size: 32,
      status: "PENDING",
      key: `INTL/${runId}/pending-budget-${index}`,
    })),
  });
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      call(
        "media",
        { purpose: "post", type: "image/jpeg", size: 32 },
        owner.token,
      ),
    ),
  );
  assert.equal(results.filter((row) => row.status === 201).length, 1);
  assert.equal(results.filter((row) => row.status === 429).length, 2);
  assert.equal(
    await db.media.count({ where: { userId: owner.u.id, status: "PENDING" } }),
    12,
  );
  const accepted = results.find((row) => row.status === 201)!;
  assert.ok(
    new URL(accepted.body.uploadUrl).searchParams
      .get("X-Amz-SignedHeaders")!
      .split(";")
      .includes("content-length"),
  );
  await db.media.deleteMany({ where: { userId: owner.u.id } });
  assert.equal(
    await infrastructure.redis.get(`INTL:media-bytes:${owner.u.id}`),
    "32",
  );
  await infrastructure.redis.set(
    `INTL:media-bytes:${owner.u.id}`,
    infrastructure.config.MEDIA_DAILY_BYTES - 31,
    "EX",
    86400,
  );
  assert.equal(
    (
      await call(
        "media",
        { purpose: "post", type: "image/jpeg", size: 32 },
        owner.token,
      )
    ).status,
    429,
  );
});
test("one completed physical attempt cannot reserve duplicate evidence uploads concurrently", async () => {
  const owner = await fixture("evidence-reservation", "1990-01-01");
  const room = await db.room.create({
    data: {
      code: opaque(),
      ownerId: owner.u.id,
      puzzle: "3x3",
      input: "scan",
      mode: "race",
      ranked: true,
      private: true,
    },
  });
  const attempt = await db.attempt.create({
    data: {
      roomId: room.id,
      userId: owner.u.id,
      nonce: opaque(),
      scramble: [],
      status: "AWAITING_EVIDENCE",
      recordingAt: new Date(),
      durationMs: 1000,
    },
  });
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      call(
        "media",
        {
          purpose: "evidence",
          type: "video/mp4",
          size: 32,
          attemptId: attempt.id,
        },
        owner.token,
      ),
    ),
  );
  assert.equal(results.filter((row) => row.status === 201).length, 1);
  assert.equal(results.filter((row) => row.status === 400).length, 2);
});
test("a still-valid signed PUT cannot leave a resurrected object after its media row is deleted", async () => {
  const owner = await fixture("late-put-cleanup", "1990-01-01");
  const bytes = Buffer.alloc(32);
  const upload = await call(
    "media",
    { purpose: "post", type: "image/jpeg", size: bytes.length },
    owner.token,
  );
  assert.equal(upload.status, 201);
  const media = await db.media.findUniqueOrThrow({
    where: { id: upload.body.id },
  });
  const put = () =>
    fetch(upload.body.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: bytes,
    });
  assert.equal((await put()).status, 200);
  assert.equal(
    (await call(`media/${media.id}`, undefined, owner.token, "DELETE")).status,
    200,
  );
  const worker = new Background(db as Db, infrastructure);
  await worker.maintenance();
  assert.equal(await db.media.findUnique({ where: { id: media.id } }), null);
  assert.ok(await db.objectRemoval.findUnique({ where: { id: media.id } }));
  // Reuse the existing private signed link while it has not yet expired.
  assert.equal((await put()).status, 200);
  assert.equal((await infrastructure.head(media.key)).ContentLength, 32);
  await db.objectRemoval.update({
    where: { id: media.id },
    data: { retryAt: new Date(0) },
  });
  await worker.maintenance();
  await assert.rejects(
    infrastructure.head(media.key),
    (error: any) => error.$metadata?.httpStatusCode === 404,
  );
  await db.objectRemoval.update({
    where: { id: media.id },
    data: { retryAt: new Date(0), expiresAt: new Date(0) },
  });
  await worker.maintenance();
  assert.equal(
    await db.objectRemoval.findUnique({ where: { id: media.id } }),
    null,
  );
});

test("failed interruption persistence pauses play rather than allowing a silent ranked resume", async () => {
  const failedDb = {
    attempt: {
      updateMany: async () => {
        throw new Error("Simulated database outage");
      },
    },
  } as unknown as Db;
  const play = new PlayController(failedDb, infrastructure);
  const gateway = new PlayGateway(failedDb, infrastructure, play);
  try {
    await gateway.handleDisconnect({
      data: { userId: adultId, roomId: randomUUID() },
    } as any);
    assert.equal(infrastructure.playIntegrityUnavailable, true);
    await assert.rejects(
      play.rooms({} as any),
      (error: any) => error.getStatus() === 503,
    );
  } finally {
    infrastructure.playIntegrityUnavailable = false;
  }
});

async function connectionSettings(
  token: string,
  extra: Record<string, unknown> = {},
) {
  const result = await call(
    "me/connection-settings",
    { requests: "ANY", offerMentoring: false, mentorCapacity: 5, ...extra },
    token,
  );
  assert.equal(result.status, 201, JSON.stringify(result));
}
async function connectionClub(owner: any, people: any[]) {
  const club = await db.club.create({
    data: {
      ownerId: owner.u.id,
      name: `Connection club ${runId}`,
      description: "Synthetic supervised club",
      private: true,
      status: "APPROVED",
    },
  });
  await db.membership.createMany({
    data: [owner, ...people].map((person) => ({
      clubId: club.id,
      userId: person.u.id,
      status: "APPROVED",
    })),
  });
  return club;
}
test("friendship requires recipient acceptance, hides private fields and rejects stale or unauthorized actions", async () => {
  const alice = await fixture("friend-alice", "1990-01-01"),
    bob = await fixture("friend-bob", "1990-01-01"),
    outsider = await fixture("friend-outsider", "1990-01-01");
  assert.equal(
    (await call("me/connection-settings", undefined, bob.token)).body.requests,
    "CLUB",
  );
  assert.equal(
    (
      await call(
        "connections",
        { targetId: bob.u.id, kind: "FRIEND" },
        alice.token,
      )
    ).status,
    403,
  );
  await connectionSettings(bob.token);
  const request = await call(
    "connections",
    { targetId: bob.u.id, kind: "FRIEND" },
    alice.token,
  );
  assert.equal(request.status, 201, JSON.stringify(request));
  assert.equal(request.body.active, false);
  assert.equal(
    (
      await call(
        `connections/${request.body.id}/action`,
        { action: "ACCEPT", version: request.body.version },
        alice.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        `connections/${request.body.id}/action`,
        { action: "ACCEPT", version: request.body.version },
        outsider.token,
      )
    ).status,
    404,
  );
  const accepted = await call(
    `connections/${request.body.id}/action`,
    { action: "ACCEPT", version: request.body.version },
    bob.token,
  );
  assert.equal(accepted.status, 201, JSON.stringify(accepted));
  assert.equal(accepted.body.active, true);
  assert.equal(accepted.body.status, "ACCEPTED");
  assert.equal(
    (
      await call(
        `connections/${request.body.id}/action`,
        { action: "END", version: request.body.version },
        alice.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        "connections",
        { targetId: alice.u.id, kind: "FRIEND" },
        bob.token,
      )
    ).status,
    409,
  );
  const list = await call("connections", undefined, alice.token);
  assert.ok(
    list.body.items.some(
      (row: any) => row.id === request.body.id && row.active,
    ),
  );
  for (const field of [
    "passwordHash",
    "birthDate",
    "guardianApprovals",
    "email",
    "mfaSecret",
  ])
    assert.equal(JSON.stringify(list.body).includes(field), false, field);
  assert.equal(
    (
      await call(
        `connections?cursor=${request.body.id}`,
        undefined,
        outsider.token,
      )
    ).status,
    404,
  );
  assert.ok(
    (await call("me/export", undefined, alice.token)).body.connections.some(
      (row: any) => row.id === request.body.id,
    ),
  );
  assert.equal(
    (
      await call(
        `connections/${request.body.id}/action`,
        { action: "END", version: accepted.body.version },
        alice.token,
      )
    ).body.status,
    "ENDED",
  );
});
test("minor friendship is limited to a shared club and each younger child's guardian must approve", async () => {
  const a = await securityChild("child-friend-a"),
    b = await securityChild("child-friend-b"),
    owner = await fixture("child-friend-owner", "1990-01-01");
  const club = await connectionClub(owner, [a.child, b.child]);
  assert.equal(
    (
      await call(
        "connections",
        { targetId: b.child.u.id, kind: "FRIEND" },
        a.child.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "me/connection-settings",
        { requests: "ANY", offerMentoring: false, mentorCapacity: 5 },
        a.child.token,
      )
    ).status,
    403,
  );
  const request = await call(
    "connections",
    { targetId: b.child.u.id, kind: "FRIEND", clubId: club.id },
    a.child.token,
  );
  assert.equal(request.status, 201, JSON.stringify(request));
  const accepted = await call(
    `connections/${request.body.id}/action`,
    { action: "ACCEPT", version: request.body.version },
    b.child.token,
  );
  assert.equal(accepted.body.status, "PENDING");
  assert.equal(accepted.body.needs.guardian, true);
  assert.equal(
    (
      await call(
        `guardian/connections/${request.body.id}/review`,
        {
          childId: a.child.u.id,
          approve: true,
          version: accepted.body.version,
        },
        b.guardian.token,
      )
    ).status,
    404,
  );
  const first = await call(
    `guardian/connections/${request.body.id}/review`,
    { childId: a.child.u.id, approve: true, version: accepted.body.version },
    a.guardian.token,
  );
  assert.equal(first.status, 201, JSON.stringify(first));
  assert.equal(first.body.active, false);
  const queue = await call(
    `guardian/connections?childId=${b.child.u.id}`,
    undefined,
    b.guardian.token,
  );
  assert.equal(queue.body.items[0].canGuardianApprove, true);
  const second = await call(
    `guardian/connections/${request.body.id}/review`,
    { childId: b.child.u.id, approve: true, version: first.body.version },
    b.guardian.token,
  );
  assert.equal(second.body.active, true, JSON.stringify(second));
  await db.membership.update({
    where: { clubId_userId: { clubId: club.id, userId: a.child.u.id } },
    data: { status: "BANNED" },
  });
  assert.equal(
    (await call("connections", undefined, b.child.token)).body.items[0].active,
    false,
  );
  assert.equal(
    (await call(`connection-targets/${a.child.u.id}`, undefined, b.child.token))
      .status,
    404,
  );
});
test("mentorship for a younger learner needs opted-in verified mentor, guardian and independent club review", async () => {
  const child = await securityChild("mentee"),
    mentor = await fixture("verified-mentor", "1990-01-01"),
    owner = await fixture("mentor-club-owner", "1990-01-01"),
    intruder = await fixture("mentor-intruder", "1990-01-01");
  const club = await connectionClub(owner, [child.child, mentor]);
  assert.equal(
    (
      await call(
        "connections",
        { targetId: mentor.u.id, kind: "MENTORSHIP", clubId: club.id },
        child.child.token,
      )
    ).status,
    403,
  );
  await connectionSettings(mentor.token, {
    requests: "CLUB",
    offerMentoring: true,
  });
  const requested = await call(
    "connections",
    { targetId: mentor.u.id, kind: "MENTORSHIP", clubId: club.id },
    child.child.token,
  );
  assert.equal(requested.status, 201, JSON.stringify(requested));
  let row = (
    await call(
      `connections/${requested.body.id}/action`,
      { action: "ACCEPT", version: requested.body.version },
      mentor.token,
    )
  ).body;
  assert.equal(row.needs.clubReview, true);
  assert.equal(row.needs.guardian, true);
  assert.equal(row.active, false);
  assert.equal(
    (
      await call(
        `clubs/${club.id}/connections/${row.id}/review`,
        { approve: true, version: row.version },
        mentor.token,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        `clubs/${club.id}/connections/${row.id}/review`,
        { approve: true, version: row.version },
        intruder.token,
      )
    ).status,
    404,
  );
  assert.equal(
    (await call(`clubs/${club.id}/connections`, undefined, owner.token)).body
      .items[0].id,
    row.id,
  );
  row = (
    await call(
      `guardian/connections/${row.id}/review`,
      { childId: child.child.u.id, approve: true, version: row.version },
      child.guardian.token,
    )
  ).body;
  row = (
    await call(
      `clubs/${club.id}/connections/${row.id}/review`,
      { approve: true, version: row.version },
      owner.token,
    )
  ).body;
  assert.equal(row.active, true, JSON.stringify(row));
  await db.user.update({
    where: { id: mentor.u.id },
    data: { adultVerified: false },
  });
  assert.equal(
    (await call("connections", undefined, child.child.token)).body.items[0]
      .active,
    false,
  );
  assert.equal(
    (
      await call(
        "me/connection-settings",
        { requests: "CLUB", offerMentoring: true, mentorCapacity: 5 },
        mentor.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "social",
        { targetId: mentor.u.id, kind: "block", enabled: true },
        child.child.token,
      )
    ).status,
    201,
  );
  const hidden = (
    await call("connections?filter=history", undefined, child.child.token)
  ).body.items[0];
  assert.equal(hidden.unavailable, "BLOCKED");
  assert.equal(
    hidden.recipient.displayName.includes(mentor.u.displayName),
    false,
  );
});
test("a club-owning mentor cannot approve their own minor mentorship and an MFA moderator can review it", async () => {
  const child = await securityChild("owner-mentor-child"),
    mentor = await fixture("owner-mentor", "1990-01-01");
  const club = await connectionClub(mentor, [child.child]);
  await connectionSettings(mentor.token, {
    requests: "CLUB",
    offerMentoring: true,
  });
  let row = (
    await call(
      "connections",
      { targetId: mentor.u.id, kind: "MENTORSHIP", clubId: club.id },
      child.child.token,
    )
  ).body;
  row = (
    await call(
      `connections/${row.id}/action`,
      { action: "ACCEPT", version: row.version },
      mentor.token,
    )
  ).body;
  row = (
    await call(
      `guardian/connections/${row.id}/review`,
      { childId: child.child.u.id, approve: true, version: row.version },
      child.guardian.token,
    )
  ).body;
  assert.equal(
    (
      await call(
        `clubs/${club.id}/connections/${row.id}/review`,
        { approve: true, version: row.version },
        mentor.token,
      )
    ).status,
    404,
  );
  assert.equal(
    (await call("admin/connections", undefined, mentor.token)).status,
    403,
  );
  assert.ok(
    (await call("admin/connections", undefined, adminToken)).body.items.some(
      (item: any) => item.id === row.id,
    ),
  );
  const accepted = await call(
    `admin/connections/${row.id}/review`,
    { approve: true, version: row.version },
    adminToken,
  );
  assert.equal(accepted.status, 201, JSON.stringify(accepted));
  assert.equal(accepted.body.active, true);
  await db.club.update({
    where: { id: club.id },
    data: { revision: { increment: 1 } },
  });
  const paused = (await call("connections", undefined, child.child.token)).body
    .items[0];
  assert.equal(paused.active, false);
  assert.equal(paused.needs.clubReview, true);
});
test("mentorship capacity remains bounded under concurrent acceptance", async () => {
  const mentor = await fixture("capacity-mentor", "1990-01-01"),
    a = await fixture("capacity-a", "1990-01-01"),
    b = await fixture("capacity-b", "1990-01-01");
  await connectionSettings(mentor.token, {
    offerMentoring: true,
    mentorCapacity: 1,
  });
  const first = await call(
      "connections",
      { targetId: mentor.u.id, kind: "MENTORSHIP" },
      a.token,
    ),
    second = await call(
      "connections",
      { targetId: mentor.u.id, kind: "MENTORSHIP" },
      b.token,
    );
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  const accepted = await Promise.all(
    [first, second].map((request) =>
      call(
        `connections/${request.body.id}/action`,
        { action: "ACCEPT", version: request.body.version },
        mentor.token,
      ),
    ),
  );
  assert.equal(
    accepted.filter((r) => r.status === 201).length,
    1,
    JSON.stringify(accepted),
  );
  assert.equal(accepted.filter((r) => r.status === 409).length, 1);
});
test("blocking cannot race acceptance to restore a connection, and unblocking does not revive it", async () => {
  const a = await fixture("block-friend-a", "1990-01-01"),
    b = await fixture("block-friend-b", "1990-01-01");
  await connectionSettings(b.token);
  const request = await call(
    "connections",
    { targetId: b.u.id, kind: "FRIEND" },
    a.token,
  );
  assert.equal(request.status, 201);
  const results = await Promise.all([
    call(
      `connections/${request.body.id}/action`,
      { action: "ACCEPT", version: request.body.version },
      b.token,
    ),
    call("social", { targetId: b.u.id, kind: "block", enabled: true }, a.token),
  ]);
  assert.equal(results[1].status, 201);
  assert.ok(
    [201, 403, 409].includes(results[0].status),
    JSON.stringify(results),
  );
  assert.equal(
    (await db.connection.findUniqueOrThrow({ where: { id: request.body.id } }))
      .status,
    "ENDED",
  );
  await call(
    "social",
    { targetId: b.u.id, kind: "block", enabled: false },
    a.token,
  );
  assert.equal(
    (await call("connections?filter=history", undefined, b.token)).body.items[0]
      .active,
    false,
  );
  assert.equal(
    (await call("connections", { targetId: b.u.id, kind: "FRIEND" }, a.token))
      .status,
    409,
  );
});
test("request bodies cannot smuggle private messages and pending requests expire", async () => {
  const a = await fixture("expiry-friend-a", "1990-01-01"),
    b = await fixture("expiry-friend-b", "1990-01-01");
  await connectionSettings(b.token);
  assert.equal(
    (
      await call(
        "connections",
        { targetId: b.u.id, kind: "FRIEND", message: "Contact me privately" },
        a.token,
      )
    ).status,
    400,
  );
  const request = await call(
    "connections",
    { targetId: b.u.id, kind: "FRIEND" },
    a.token,
  );
  assert.equal(request.status, 201);
  await db.connection.update({
    where: { id: request.body.id },
    data: { expiresAt: new Date(0) },
  });
  assert.equal(
    (
      await call(
        `connections/${request.body.id}/action`,
        { action: "ACCEPT", version: request.body.version },
        b.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (await call("connections", undefined, a.token)).body.items[0].status,
    "EXPIRED",
  );
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(
    (await db.connection.findUniqueOrThrow({ where: { id: request.body.id } }))
      .status,
    "EXPIRED",
  );
});
test("withdrawing guardian consent immediately deactivates an accepted child connection", async () => {
  const child = await securityChild("connection-withdrawal"),
    friend = await fixture("connection-withdraw-friend", "1990-01-01"),
    owner = await fixture("connection-withdraw-owner", "1990-01-01");
  const club = await connectionClub(owner, [child.child, friend]);
  let row = (
    await call(
      "connections",
      { targetId: friend.u.id, kind: "FRIEND", clubId: club.id },
      child.child.token,
    )
  ).body;
  row = (
    await call(
      `connections/${row.id}/action`,
      { action: "ACCEPT", version: row.version },
      friend.token,
    )
  ).body;
  row = (
    await call(
      `guardian/connections/${row.id}/review`,
      { childId: child.child.u.id, approve: true, version: row.version },
      child.guardian.token,
    )
  ).body;
  assert.equal(row.active, true);
  assert.equal(
    (
      await call(
        `guardian/children/${child.child.u.id}/consent`,
        undefined,
        child.guardian.token,
        "DELETE",
      )
    ).status,
    200,
  );
  const visible = (
    await call("connections", undefined, friend.token)
  ).body.items.find((item: any) => item.id === row.id);
  assert.equal(visible.active, false);
  assert.equal(visible.unavailable, "CONSENT_REQUIRED");
  assert.equal(
    (
      await call(
        `guardian/connections/${row.id}/review`,
        { childId: child.child.u.id, approve: true, version: row.version },
        child.guardian.token,
      )
    ).status,
    403,
  );
});
test("account deletion removes both directions of connections and a former guardian cannot inspect an adult", async () => {
  const a = await fixture("delete-connection-a", "1990-01-01"),
    b = await fixture("delete-connection-b", "1990-01-01");
  await connectionSettings(b.token);
  const row = (
    await call("connections", { targetId: b.u.id, kind: "FRIEND" }, a.token)
  ).body;
  const peerAudit = await db.audit.create({
    data: {
      actorId: b.u.id,
      action: "connection.accept",
      targetId: row.id,
      detail: { synthetic: true },
    },
  });
  assert.equal(
    (await call("me", { confirmation: "DELETE" }, a.token, "DELETE")).status,
    200,
  );
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(await db.connection.findUnique({ where: { id: row.id } }), null);
  const redacted = await db.audit.findUniqueOrThrow({
    where: { id: peerAudit.id },
  });
  assert.equal(redacted.targetId, "deleted");
  assert.deepEqual(redacted.detail, { redacted: true });
  const adult = await securityChild("former-guardian-connection", "2000-01-01");
  assert.equal(
    (
      await call(
        `guardian/connections?childId=${adult.child.u.id}`,
        undefined,
        adult.guardian.token,
      )
    ).status,
    404,
  );
});
test("legacy social rows are preserved but never treated as accepted friendships", async () => {
  const a = await fixture("legacy-connection-a", "1990-01-01"),
    b = await fixture("legacy-connection-b", "1990-01-01");
  const legacy = await db.social.create({
    data: { actorId: a.u.id, targetId: b.u.id, kind: "friend" },
  });
  assert.equal(
    (await call("connections", undefined, a.token)).body.items.length,
    0,
  );
  assert.ok(await db.social.findUnique({ where: { id: legacy.id } }));
  assert.equal(
    (await call("connections", { targetId: b.u.id, kind: "FRIEND" }, a.token))
      .status,
    403,
  );
});
test("older teens require shared-club independent mentorship review without open private messaging", async () => {
  const teen = await fixture("older-mentee", "2010-01-01", "USER", false),
    mentor = await fixture("older-mentor", "1990-01-01"),
    owner = await fixture("older-mentor-owner", "1990-01-01");
  const club = await connectionClub(owner, [teen, mentor]);
  await connectionSettings(mentor.token, {
    requests: "CLUB",
    offerMentoring: true,
  });
  let row = (
    await call(
      "connections",
      { targetId: mentor.u.id, kind: "MENTORSHIP", clubId: club.id },
      teen.token,
    )
  ).body;
  assert.equal(row.needs.guardian, false);
  assert.equal(row.needs.clubReview, true);
  row = (
    await call(
      `connections/${row.id}/action`,
      { action: "ACCEPT", version: row.version },
      mentor.token,
    )
  ).body;
  assert.equal(row.active, false);
  row = (
    await call(
      `clubs/${club.id}/connections/${row.id}/review`,
      { approve: true, version: row.version },
      owner.token,
    )
  ).body;
  assert.equal(row.active, true, JSON.stringify(row));
  assert.equal(
    (await call("me", undefined, teen.token)).body.permissions.canChat,
    false,
  );
  assert.equal(
    (
      await call(
        "messages",
        { targetId: mentor.u.id, message: "test" },
        teen.token,
      )
    ).status,
    404,
  );
});
test("mainland under-14 connection approval and regional isolation are enforced", async () => {
  const make = async (name: string, birthDate: string) => {
    const u = await cnDb.user.create({
      data: {
        email: `${name}-${runId}@cubers.test`,
        displayName: `Test ${name}`,
        birthDate,
        passwordHash: "unused",
        region: "CN",
        emailVerified: true,
        adultVerified: birthDate === "1990-01-01",
        identityVerified: true,
      },
    });
    const token = opaque();
    await cnDb.session.create({
      data: {
        userId: u.id,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    return { u, token };
  };
  const guardian = await make("cn-connect-guardian", "1990-01-01"),
    child = await make("cn-connect-child", "2013-01-01"),
    teen = await make("cn-connect-teen", "2010-01-01");
  await cnDb.consent.create({
    data: {
      childId: child.u.id,
      guardianId: guardian.u.id,
      documentId: randomUUID(),
      status: "APPROVED",
      reviewedAt: new Date(),
    },
  });
  const club = await cnDb.club.create({
    data: {
      ownerId: guardian.u.id,
      name: "Synthetic mainland club",
      description: "Test only",
      status: "APPROVED",
      private: true,
    },
  });
  await cnDb.membership.createMany({
    data: [guardian, child, teen].map((p) => ({
      clubId: club.id,
      userId: p.u.id,
      status: "APPROVED",
    })),
  });
  const cn = (path: string, body?: unknown, token?: string) =>
    call(path, body, token, undefined, cnOrigin);
  const request = await cn(
    "connections",
    { targetId: teen.u.id, kind: "FRIEND", clubId: club.id },
    child.token,
  );
  assert.equal(request.status, 201, JSON.stringify(request));
  const accepted = await cn(
    `connections/${request.body.id}/action`,
    { action: "ACCEPT", version: request.body.version },
    teen.token,
  );
  assert.equal(accepted.body.needs.guardian, true);
  assert.equal(accepted.body.active, false);
  const approved = await cn(
    `guardian/connections/${request.body.id}/review`,
    { childId: child.u.id, approve: true, version: accepted.body.version },
    guardian.token,
  );
  assert.equal(approved.body.active, true, JSON.stringify(approved));
  assert.equal(
    (
      await cn(
        "connections",
        { targetId: adultId, kind: "FRIEND", clubId: club.id },
        child.token,
      )
    ).status,
    404,
  );
  assert.equal((await call("connections", undefined, child.token)).status, 401);
});
test("unauthorized callers cannot probe connection versions and moderator review cannot bypass MFA", async () => {
  const child = await securityChild("review-mfa-child"),
    mentor = await fixture("review-mfa-mentor", "1990-01-01"),
    moderator = await fixture("review-mfa-staff", "1990-01-01", "ADMIN"),
    outsider = await fixture("review-mfa-outsider", "1990-01-01");
  const club = await connectionClub(mentor, [child.child]);
  await connectionSettings(mentor.token, {
    requests: "CLUB",
    offerMentoring: true,
  });
  const row = (
    await call(
      "connections",
      { targetId: mentor.u.id, kind: "MENTORSHIP", clubId: club.id },
      child.child.token,
    )
  ).body;
  assert.equal(
    (
      await call(
        `connections/${row.id}/action`,
        { action: "END", version: row.version + 1000 },
        outsider.token,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        `guardian/connections/${row.id}/review`,
        {
          childId: child.child.u.id,
          approve: true,
          version: row.version + 1000,
        },
        outsider.token,
      )
    ).status,
    404,
  );
  await db.session.updateMany({
    where: { userId: moderator.u.id },
    data: { mfaVerified: false },
  });
  assert.equal(
    (
      await call(
        `clubs/${club.id}/connections/${row.id}/review`,
        { approve: true, version: row.version },
        moderator.token,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        `admin/connections/${row.id}/review`,
        { approve: true, version: row.version },
        moderator.token,
      )
    ).status,
    403,
  );
});
test("private connections paginate without duplicates and closed records and connection audits expire", async () => {
  const owner = await fixture("connection-pages", "1990-01-01");
  const peers = Array.from({ length: 32 }, (_, index) => ({
    id: randomUUID(),
    email: `connection-page-${index}-${runId}@cubers.test`,
    displayName: `Synthetic peer ${index}`,
    birthDate: "1990-01-01",
    passwordHash: "unused",
    region: "INTL",
    emailVerified: true,
  }));
  await db.user.createMany({ data: peers });
  await db.connection.createMany({
    data: peers.map((peer, index) => ({
      pairKey: `FRIEND:${[owner.u.id, peer.id].sort().join(":")}`,
      kind: "FRIEND",
      requesterId: owner.u.id,
      recipientId: peer.id,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(Date.now() - index * 1000),
    })),
  });
  const first = await call("connections", undefined, owner.token);
  assert.equal(first.body.items.length, 30);
  assert.ok(first.body.nextCursor);
  const second = await call(
    `connections?cursor=${first.body.nextCursor}`,
    undefined,
    owner.token,
  );
  assert.equal(second.body.items.length, 2);
  assert.equal(second.body.nextCursor, null);
  assert.equal(
    new Set([...first.body.items, ...second.body.items].map((row) => row.id))
      .size,
    32,
  );
  const old = new Date(Date.now() - 91 * 86400000),
    closed = first.body.items[0],
    kept = first.body.items[1];
  await db.connection.update({
    where: { id: closed.id },
    data: { status: "ENDED", updatedAt: old },
  });
  await db.connection.update({
    where: { id: kept.id },
    data: { status: "ACCEPTED", recipientAccepted: true, updatedAt: old },
  });
  const audit = await db.audit.create({
    data: {
      actorId: owner.u.id,
      action: "connection.request",
      targetId: closed.id,
      detail: { synthetic: true },
      createdAt: new Date(Date.now() - 191 * 86400000),
    },
  });
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(
    await db.connection.findUnique({ where: { id: closed.id } }),
    null,
  );
  assert.ok(await db.connection.findUnique({ where: { id: kept.id } }));
  assert.equal(await db.audit.findUnique({ where: { id: audit.id } }), null);
});
test("UUID capitalization cannot create duplicate relationships or bypass new and preserved blocks", async () => {
  const a = await fixture("case-friend-a", "1990-01-01"),
    b = await fixture("case-friend-b", "1990-01-01");
  await connectionSettings(b.token);
  const row = await call(
    "connections",
    { targetId: b.u.id.toUpperCase(), kind: "FRIEND" },
    a.token,
  );
  assert.equal(row.status, 201, JSON.stringify(row));
  assert.equal(
    (await call("connections", { targetId: b.u.id, kind: "FRIEND" }, a.token))
      .status,
    409,
  );
  assert.equal(
    await db.connection.count({
      where: { requesterId: a.u.id, recipientId: b.u.id },
    }),
    1,
  );
  const blocked = await call(
    "social",
    { targetId: b.u.id.toUpperCase(), kind: "block", enabled: true },
    a.token,
  );
  assert.equal(blocked.status, 201);
  assert.equal(
    (
      await db.social.findFirstOrThrow({
        where: { actorId: a.u.id, kind: "block" },
      })
    ).targetId,
    b.u.id,
  );
  assert.equal(
    (await call(`connection-targets/${b.u.id}`, undefined, a.token)).status,
    404,
  );
  const c = await fixture("case-legacy-a", "1990-01-01"),
    d = await fixture("case-legacy-b", "1990-01-01");
  await connectionSettings(d.token);
  await db.social.create({
    data: { actorId: d.u.id, targetId: c.u.id.toUpperCase(), kind: "block" },
  });
  assert.equal(
    (await call("connections", { targetId: d.u.id, kind: "FRIEND" }, c.token))
      .status,
    403,
  );
  assert.equal(
    (await call(`connection-targets/${d.u.id}`, undefined, c.token)).status,
    404,
  );
  const post = await db.post.create({
    data: {
      authorId: d.u.id,
      body: "Synthetic blocked post",
      status: "PUBLISHED",
      moderatorApproved: true,
    },
  });
  assert.equal(
    (await call(`posts/${post.id}`, undefined, c.token)).status,
    404,
  );
  assert.equal(
    (await call("feed", undefined, c.token)).body.items.some(
      (item: any) => item.id === post.id,
    ),
    false,
  );
});

// Profile fixtures below are synthetic; real operator/human review is not
// claimed by these automated authorization and persistence checks.
async function saveProfile(person: any, settings: any, extra: any = {}) {
  const own = (await call("me/profile", undefined, person.token)).body;
  return call(
    "me/profile",
    {
      displayName: own.displayName,
      bio: own.bio,
      privateProfile: own.privateProfile,
      revision: own.review.revision,
      settings: ProfileSettings.parse(settings),
      ...extra,
    },
    person.token,
  );
}
async function publishProfile(person: any, settings: any, extra: any = {}) {
  const saved = await saveProfile(person, settings, {
    privateProfile: false,
    sharingConfirmed: true,
    ...extra,
  });
  assert.equal(saved.status, 201, JSON.stringify(saved));
  if (saved.body.status === "PENDING") {
    const reviewed = await call(
      `admin/profiles/${person.u.id}/review`,
      {
        approve: true,
        revision: saved.body.revision,
        reason: "Synthetic reviewed profile fixture",
      },
      adminToken,
    );
    assert.equal(reviewed.status, 201, JSON.stringify(reviewed));
  }
  return saved;
}
async function profileFriends(a: any, b: any) {
  await connectionSettings(b.token);
  const requested = await call(
    "connections",
    { targetId: b.u.id, kind: "FRIEND" },
    a.token,
  );
  assert.equal(requested.status, 201, JSON.stringify(requested));
  const accepted = await call(
    `connections/${requested.body.id}/action`,
    { action: "ACCEPT", version: requested.body.version },
    b.token,
  );
  assert.equal(accepted.body.active, true, JSON.stringify(accepted));
  return accepted.body;
}
test("profile defaults preserve private data and reject forged customization and minor sharing", async () => {
  const person = await fixture("profile-defaults", "1990-01-01");
  const child = await securityChild("profile-child");
  const unverified = await fixture(
    "profile-unverified",
    "1990-01-01",
    "USER",
    false,
  );
  const own = await call("me/profile", undefined, person.token);
  assert.equal(own.status, 200);
  assert.deepEqual(own.body.settings, ProfileSettings.parse({}));
  assert.deepEqual(own.body.achievements, []);
  assert.equal(own.body.review.status, "DRAFT");
  assert.equal(
    (await call(`profiles/${person.u.id}`, undefined, adultToken)).status,
    404,
  );
  assert.equal((await call(`profiles/${person.u.id}`)).status, 401);
  const saved = await saveProfile(person, {
    avatar: { shape: "orbit", color: "rose" },
    favorites: ["3x3", "pyraminx"],
    skills: ["beginner", "f2l"],
  });
  assert.equal(saved.status, 201);
  assert.deepEqual(
    (await call("me/profile", undefined, person.token)).body.settings.favorites,
    ["3x3", "pyraminx"],
  );
  assert.equal(
    (await saveProfile(person, { selectedAchievements: ["virtual-solve"] }))
      .status,
    400,
  );
  const current = (await call("me/profile", undefined, person.token)).body;
  assert.equal(
    (
      await call(
        "me/profile",
        {
          ...current,
          revision: current.review.revision,
          settings: { avatar: { shape: "https://attacker.invalid" } },
        },
        person.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await saveProfile(
        child.child,
        { visibility: { about: "PUBLIC" } },
        { privateProfile: false, sharingConfirmed: true },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await saveProfile(
        unverified,
        { visibility: { about: "PUBLIC" } },
        { privateProfile: false, sharingConfirmed: true },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "me",
        { displayName: "child@example.com", bio: "", privateProfile: true },
        child.child.token,
      )
    ).status,
    400,
  );
  const exported = (await call("me/export", undefined, person.token)).body;
  assert.equal(exported.schemaVersion, 3);
  assert.deepEqual(exported.profile.profileSettings.avatar, {
    shape: "orbit",
    color: "rose",
  });
  assert.equal(JSON.stringify(exported).includes("passwordHash"), false);
});
test("shared profile needs explicit audience confirmation, current revision review and independent MFA reviewer", async () => {
  const person = await fixture("profile-review", "1990-01-01");
  const settings = { visibility: { about: "PUBLIC" } };
  assert.equal(
    (await saveProfile(person, settings, { privateProfile: false })).status,
    400,
  );
  const submitted = await saveProfile(person, settings, {
    privateProfile: false,
    sharingConfirmed: true,
    bio: "Original safe cubing bio",
  });
  assert.equal(submitted.body.status, "PENDING");
  assert.equal(
    (await call(`profiles/${person.u.id}`, undefined, adultToken)).status,
    404,
  );
  let queue = await call("admin/profiles", undefined, adminToken);
  assert.equal(queue.status, 200);
  const seenQueueCursors = new Set<string>();
  while (!queue.body.items.some((u: any) => u.id === person.u.id)) {
    const cursor = queue.body.nextCursor;
    assert.ok(cursor, "Submitted profile must appear in the paged queue");
    assert.equal(seenQueueCursors.has(cursor), false);
    seenQueueCursors.add(cursor);
    queue = await call(
      `admin/profiles?cursor=${encodeURIComponent(cursor)}`,
      undefined,
      adminToken,
    );
    assert.equal(queue.status, 200);
  }
  assert.ok(queue.body.items.some((u: any) => u.id === person.u.id));
  for (const item of queue.body.items)
    for (const key of ["email", "birthDate", "passwordHash", "mfaSecret"])
      assert.equal(key in item, false);
  assert.equal(
    (await call("admin/profiles", undefined, person.token)).status,
    403,
  );
  assert.equal(
    (
      await call(
        `admin/profiles/${person.u.id}/review`,
        {
          approve: true,
          revision: submitted.body.revision,
          reason: "Unauthorized reviewer",
        },
        person.token,
      )
    ).status,
    403,
  );
  const edited = await saveProfile(person, settings, {
    privateProfile: false,
    bio: "A changed safe bio",
  });
  assert.equal(
    (
      await call(
        `admin/profiles/${person.u.id}/review`,
        {
          approve: true,
          revision: submitted.body.revision,
          reason: "Stale revision fixture",
        },
        adminToken,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        `admin/profiles/${person.u.id}/review`,
        {
          approve: true,
          revision: edited.body.revision,
          reason: "Current revision fixture",
        },
        adminToken,
      )
    ).status,
    201,
  );
  const shared = await call(
    `profiles/${person.u.id.toUpperCase()}`,
    undefined,
    adultToken,
  );
  assert.equal(shared.status, 200);
  assert.equal(shared.body.about.bio, "A changed safe bio");
  assert.deepEqual(
    Object.keys(shared.body).sort(),
    [
      "id",
      "displayName",
      "avatar",
      "about",
      "achievements",
      "statistics",
      "friends",
      "clubs",
    ].sort(),
  );
  assert.equal(shared.body.statistics, null);
  assert.equal(shared.body.friends, null);
  assert.equal(shared.body.clubs, null);
  const reviewer = await fixture("profile-self-review", "1990-01-01", "ADMIN");
  const pending = await saveProfile(reviewer, settings, {
    privateProfile: false,
    sharingConfirmed: true,
  });
  assert.equal(
    (
      await call(
        `admin/profiles/${reviewer.u.id}/review`,
        {
          approve: true,
          revision: pending.body.revision,
          reason: "Cannot review own profile",
        },
        reviewer.token,
      )
    ).status,
    403,
  );
  await db.session.updateMany({
    where: { userId: reviewer.u.id },
    data: { mfaVerified: false },
  });
  assert.equal(
    (await call("admin/profiles", undefined, reviewer.token)).status,
    403,
  );
  const inspected = await call(
    `admin/profiles/${person.u.id}`,
    undefined,
    adminToken,
  );
  assert.equal(inspected.body.profileStatus, "APPROVED");
  assert.equal(
    (
      await call(
        `admin/profiles/${person.u.id}/review`,
        {
          approve: false,
          revision: edited.body.revision,
          reason: "Reported profile removal fixture",
        },
        adminToken,
      )
    ).status,
    201,
  );
  assert.equal(
    (await call(`profiles/${person.u.id}`, undefined, adultToken)).status,
    404,
  );
});
test("profile achievements and statistics derive from eligible records and friendship grants are current", async () => {
  const owner = await fixture("profile-achievements", "1990-01-01");
  const friend = await fixture("profile-achievement-friend", "1990-01-01");
  await db.progress.create({
    data: {
      userId: owner.u.id,
      lessonId: lessons[0].id,
      completed: true,
      moves: [],
      repetitions: 10,
    },
  });
  const earned = (await call("me/profile", undefined, owner.token)).body
    .achievements;
  assert.deepEqual(
    earned.map((a: any) => a.id),
    ["first-checkpoint", "ten-checkpoints"],
  );
  async function result(
    input: string,
    ranked: boolean,
    status: string,
    reviewerId: string | null,
    mode = "race",
  ) {
    const room = await db.room.create({
      data: {
        ownerId: owner.u.id,
        code: opaque(),
        puzzle: "3x3",
        input,
        mode,
        ranked,
        private: true,
      },
    });
    return db.attempt.create({
      data: {
        userId: owner.u.id,
        roomId: room.id,
        nonce: opaque(),
        scramble: ["R"],
        status,
        durationMs: 1500,
        reviewerId,
        moves: [{ move: "R'", sequence: 0, elapsedMs: 100 }],
      },
    });
  }
  await result("virtual", false, "APPROVED", null);
  await result("virtual", true, "REJECTED", adminId);
  await result("virtual", false, "APPROVED", null, "pattern");
  await result("scan", true, "APPROVED", null);
  await result("scan", true, "APPROVED", adminId);
  const settings = {
    selectedAchievements: [
      "first-checkpoint",
      "virtual-solve",
      "reviewed-physical",
    ],
    visibility: { achievements: "FRIENDS", statistics: "FRIENDS" },
  };
  await publishProfile(owner, settings);
  assert.equal(
    (await call(`profiles/${owner.u.id}`, undefined, friend.token)).status,
    404,
  );
  for (const kind of ["follow", "friend"])
    await db.social.create({
      data: { actorId: friend.u.id, targetId: owner.u.id, kind },
    });
  assert.equal(
    (await call(`profiles/${owner.u.id}`, undefined, friend.token)).status,
    404,
  );
  const connection = await profileFriends(owner, friend);
  const shared = await call(`profiles/${owner.u.id}`, undefined, friend.token);
  assert.deepEqual(
    shared.body.achievements.map((a: any) => a.id),
    settings.selectedAchievements,
  );
  assert.equal(shared.body.about, null);
  assert.deepEqual(
    shared.body.statistics.categories
      .map((s: any) => [s.input, s.solves])
      .sort(),
    [
      ["scan", 1],
      ["virtual", 1],
    ],
  );
  for (const forbidden of [
    "scramble",
    "moves",
    "nonce",
    "createdAt",
    "birthDate",
    "email",
    "evidenceId",
  ])
    assert.equal(
      JSON.stringify(shared.body).includes('"' + forbidden + '"'),
      false,
    );
  await call(
    `connections/${connection.id}/action`,
    { action: "END", version: connection.version },
    friend.token,
  );
  assert.equal(
    (await call(`profiles/${owner.u.id}`, undefined, friend.token)).status,
    404,
  );
});
test("public friendship lists require both participants sharing choices and block checks", async () => {
  const owner = await fixture("profile-mutual-owner", "1990-01-01"),
    peer = await fixture("profile-mutual-peer", "1990-01-01");
  await publishProfile(owner, { visibility: { friends: "PUBLIC" } });
  await publishProfile(peer, { visibility: { about: "PUBLIC" } });
  await profileFriends(owner, peer);
  assert.deepEqual(
    (await call(`profiles/${owner.u.id}/friends`, undefined, adultToken)).body
      .items,
    [],
  );
  await publishProfile(peer, { visibility: { friends: "PUBLIC" } });
  const visible = (
    await call(`profiles/${owner.u.id}/friends`, undefined, adultToken)
  ).body.items;
  assert.equal(visible.length, 1);
  assert.deepEqual(
    Object.keys(visible[0]).sort(),
    ["id", "displayName", "avatar"].sort(),
  );
  await db.social.create({
    data: {
      actorId: adultId,
      targetId: peer.u.id.toUpperCase(),
      kind: "block",
    },
  });
  assert.deepEqual(
    (await call(`profiles/${owner.u.id}/friends`, undefined, adultToken)).body
      .items,
    [],
  );
  await saveProfile(
    peer,
    { visibility: { friends: "PUBLIC" } },
    { privateProfile: true },
  );
  assert.deepEqual(
    (await call(`profiles/${owner.u.id}/friends`, undefined, owner.token)).body
      .items,
    [],
  );
});
test("profile pagination uses private viewer-bound expiring cursors and rechecks withdrawals", async () => {
  const owner = await fixture("profile-page-owner", "1990-01-01"),
    viewer = await fixture("profile-page-viewer", "1990-01-01");
  await publishProfile(owner, {
    visibility: { friends: "PUBLIC", clubs: "PUBLIC" },
  });
  const peers = Array.from({ length: 21 }, (_, n) => ({
    id: randomUUID(),
    email: `profile-page-${n}-${runId}@cubers.test`,
    displayName: `Synthetic page ${n}`,
    birthDate: "1990-01-01",
    region: "INTL",
    passwordHash: owner.u.passwordHash,
    emailVerified: true,
    adultVerified: true,
    privateProfile: false,
    profileStatus: "APPROVED",
    profileSettings: ProfileSettings.parse({
      visibility: { friends: "PUBLIC" },
    }),
  }));
  await db.user.createMany({ data: peers });
  await db.connection.createMany({
    data: peers.map((peer) => ({
      requesterId: owner.u.id,
      recipientId: peer.id,
      pairKey: "FRIEND:" + [owner.u.id, peer.id].sort().join(":"),
      kind: "FRIEND",
      status: "ACCEPTED",
      recipientAccepted: true,
      expiresAt: new Date(Date.now() + 86400000),
    })),
  });
  const first = (
    await call(`profiles/${owner.u.id}/friends`, undefined, viewer.token)
  ).body;
  assert.equal(first.items.length, 20);
  assert.match(first.nextCursor, /^[A-Za-z0-9_-]{43}$/);
  const second = (
    await call(
      `profiles/${owner.u.id}/friends?cursor=${first.nextCursor}`,
      undefined,
      viewer.token,
    )
  ).body;
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, null);
  assert.equal(
    new Set([...first.items, ...second.items].map((p: any) => p.id)).size,
    21,
  );
  assert.equal(
    (
      await call(
        `profiles/${owner.u.id}/friends?cursor=${first.nextCursor}`,
        undefined,
        adultToken,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `profiles/${peers[0].id}/friends?cursor=${first.nextCursor}`,
        undefined,
        viewer.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `profiles/${owner.u.id}/clubs?cursor=${first.nextCursor}`,
        undefined,
        viewer.token,
      )
    ).status,
    400,
  );
  const key = "INTL:profile-cursor:" + hash(first.nextCursor);
  assert.ok((await infrastructure.redis.ttl(key)) <= 900);
  await infrastructure.redis.del(key);
  assert.equal(
    (
      await call(
        `profiles/${owner.u.id}/friends?cursor=${first.nextCursor}`,
        undefined,
        viewer.token,
      )
    ).status,
    400,
  );
  await saveProfile(owner, {
    visibility: { friends: "PRIVATE", clubs: "PUBLIC" },
  });
  assert.equal(
    (await call(`profiles/${owner.u.id}/friends`, undefined, viewer.token))
      .status,
    404,
  );
});
test("shared club memberships respect private membership and current club and owner approval", async () => {
  const owner = await fixture("profile-clubs-owner", "1990-01-01"),
    clubOwner = await fixture("profile-clubs-manager", "1990-01-01"),
    viewer = await fixture("profile-clubs-viewer", "1990-01-01");
  const publicClub = await db.club.create({
    data: {
      ownerId: clubOwner.u.id,
      name: "Synthetic public club",
      description: "",
      status: "APPROVED",
    },
  });
  const privateClub = await db.club.create({
    data: {
      ownerId: clubOwner.u.id,
      name: "Synthetic private club",
      description: "",
      status: "APPROVED",
      private: true,
    },
  });
  for (const clubId of [publicClub.id, privateClub.id])
    await db.membership.create({
      data: { clubId, userId: owner.u.id, status: "APPROVED" },
    });
  await publishProfile(owner, { visibility: { clubs: "PUBLIC" } });
  const outside = (
    await call(`profiles/${owner.u.id}/clubs`, undefined, viewer.token)
  ).body.items;
  assert.deepEqual(
    outside.map((c: any) => c.id),
    [publicClub.id],
  );
  await db.membership.create({
    data: { clubId: privateClub.id, userId: viewer.u.id, status: "APPROVED" },
  });
  const member = (
    await call(`profiles/${owner.u.id}/clubs`, undefined, viewer.token)
  ).body.items;
  assert.equal(member.length, 2);
  assert.equal(JSON.stringify(member).includes(privateClub.inviteCode), false);
  await db.membership.update({
    where: { clubId_userId: { clubId: privateClub.id, userId: owner.u.id } },
    data: { status: "BANNED" },
  });
  assert.deepEqual(
    (
      await call(`profiles/${owner.u.id}/clubs`, undefined, viewer.token)
    ).body.items.map((c: any) => c.id),
    [publicClub.id],
  );
  await db.user.update({
    where: { id: clubOwner.u.id },
    data: { adultVerified: false },
  });
  assert.deepEqual(
    (await call(`profiles/${owner.u.id}/clubs`, undefined, viewer.token)).body
      .items,
    [],
  );
});
test("nickname edits hide shared profiles and requeue actual published adult posts and replies", async () => {
  const owner = await fixture("profile-identity", "1990-01-01");
  await publishProfile(owner, { visibility: { about: "PUBLIC" } });
  const post = await db.post.create({
    data: {
      authorId: owner.u.id,
      body: "Synthetic reviewed post",
      status: "PUBLISHED",
      moderatorApproved: true,
    },
  });
  const comment = await db.comment.create({
    data: {
      authorId: owner.u.id,
      postId: post.id,
      body: "Synthetic published reply",
      status: "PUBLISHED",
    },
  });
  const updated = await call(
    "me",
    {
      displayName: "A changed reviewed identity",
      bio: "Updated cubing bio",
      privateProfile: false,
    },
    owner.token,
  );
  assert.equal(updated.status, 201);
  assert.equal(updated.body.status, "PENDING");
  assert.equal(
    (await call(`profiles/${owner.u.id}`, undefined, adultToken)).status,
    404,
  );
  assert.equal(
    (await db.post.findUniqueOrThrow({ where: { id: post.id } })).status,
    "PENDING",
  );
  assert.equal(
    (await db.comment.findUniqueOrThrow({ where: { id: comment.id } })).status,
    "PENDING",
  );
  assert.equal(
    (await call(`posts/${post.id}/comments`, undefined, adultToken)).status,
    404,
  );
});
test("shared profiles cannot bypass minor, regional, block, eligibility or deletion boundaries", async () => {
  const person = await fixture("profile-boundaries", "1990-01-01"),
    minor = await fixture(
      "profile-malicious-minor",
      "2015-01-01",
      "USER",
      false,
    );
  await publishProfile(person, { visibility: { about: "PUBLIC" } });
  await db.user.update({
    where: { id: minor.u.id },
    data: {
      privateProfile: false,
      profileStatus: "APPROVED",
      adultVerified: true,
      profileSettings: ProfileSettings.parse({
        visibility: { about: "PUBLIC" },
      }),
    },
  });
  assert.equal(
    (await call(`profiles/${minor.u.id}`, undefined, adultToken)).status,
    404,
  );
  await db.social.create({
    data: {
      actorId: person.u.id,
      targetId: adultId.toUpperCase(),
      kind: "block",
    },
  });
  assert.equal(
    (await call(`profiles/${person.u.id}`, undefined, adultToken)).status,
    404,
  );
  await db.social.deleteMany({ where: { actorId: person.u.id } });
  await db.user.update({ where: { id: person.u.id }, data: { region: "CN" } });
  assert.equal(
    (await call(`profiles/${person.u.id}`, undefined, adultToken)).status,
    404,
  );
  await db.user.update({
    where: { id: person.u.id },
    data: { region: "INTL", adultVerified: false },
  });
  assert.equal(
    (await call(`profiles/${person.u.id}`, undefined, adultToken)).status,
    404,
  );
  await db.user.update({
    where: { id: person.u.id },
    data: { adultVerified: true },
  });
  assert.equal(
    (await call("me", { confirmation: "DELETE" }, person.token, "DELETE"))
      .status,
    200,
  );
  assert.equal(
    (await call(`profiles/${person.u.id}`, undefined, adultToken)).status,
    404,
  );
  await new Background(db as any, infrastructure).maintenance();
  assert.equal(await db.user.findUnique({ where: { id: person.u.id } }), null);
  const audits = await db.audit.findMany({
    where: { action: { startsWith: "profile." }, targetId: "deleted" },
  });
  assert.ok(audits.some((a) => (a.detail as any).redacted));
});

test("private bios and interests stay outside moderation and enabling About requires its own review", async () => {
  const owner = await fixture("profile-review-scope", "1990-01-01");
  const secretBio = "PRIVATE BIO SCOPE SENTINEL";
  const submitted = await saveProfile(
    owner,
    {
      favorites: ["pyraminx"],
      skills: ["f2l"],
      visibility: { friends: "PUBLIC" },
    },
    { privateProfile: false, sharingConfirmed: true, bio: secretBio },
  );
  assert.equal(submitted.body.status, "PENDING");
  let queue = (await call("admin/profiles", undefined, adminToken)).body;
  let row = queue.items.find((u: any) => u.id === owner.u.id);
  const seenCursors = new Set<string>();
  while (!row) {
    assert.ok(
      queue.nextCursor,
      "Submitted profile must appear in the paged moderation queue",
    );
    assert.equal(
      seenCursors.has(queue.nextCursor),
      false,
      "Queue pagination must advance",
    );
    seenCursors.add(queue.nextCursor);
    queue = (
      await call(
        `admin/profiles?cursor=${encodeURIComponent(queue.nextCursor)}`,
        undefined,
        adminToken,
      )
    ).body;
    row = queue.items.find((u: any) => u.id === owner.u.id);
  }
  assert.equal(row.bio, null);
  assert.equal(row.bioSubmitted, false);
  assert.deepEqual(row.profileSettings.favorites, []);
  assert.deepEqual(row.profileSettings.skills, []);
  assert.equal(JSON.stringify(row).includes(secretBio), false);
  await call(
    `admin/profiles/${owner.u.id}/review`,
    {
      approve: true,
      revision: submitted.body.revision,
      reason: "Name and shared section only fixture",
    },
    adminToken,
  );
  const own = (await call("me/profile", undefined, owner.token)).body;
  assert.equal(own.bio, secretBio);
  assert.equal(own.review.includesBio, false);
  assert.equal(
    (await call(`profiles/${owner.u.id}`, undefined, adultToken)).body.about,
    null,
  );
  const edited = await saveProfile(
    owner,
    { favorites: ["3x3"], skills: ["roux"], visibility: { friends: "PUBLIC" } },
    { bio: "CHANGED PRIVATE BIO SENTINEL" },
  );
  assert.equal(edited.body.status, "APPROVED");
  assert.equal(
    (await call(`admin/profiles/${owner.u.id}`, undefined, adminToken)).body
      .bio,
    null,
  );
  const expanded = await saveProfile(
    owner,
    {
      favorites: ["3x3"],
      skills: ["roux"],
      visibility: { about: "PUBLIC", friends: "PUBLIC" },
    },
    { sharingConfirmed: true },
  );
  assert.equal(expanded.body.status, "PENDING");
  assert.equal(
    (await call(`profiles/${owner.u.id}`, undefined, adultToken)).status,
    404,
  );
  const review = (
    await call(`admin/profiles/${owner.u.id}`, undefined, adminToken)
  ).body;
  assert.equal(review.bio, "CHANGED PRIVATE BIO SENTINEL");
  assert.equal(review.bioSubmitted, true);
  await call(
    `admin/profiles/${owner.u.id}/review`,
    {
      approve: true,
      revision: expanded.body.revision,
      reason: "About reviewed after explicit expansion fixture",
    },
    adminToken,
  );
  assert.equal(
    (await call(`profiles/${owner.u.id}`, undefined, adultToken)).body.about
      .bio,
    "CHANGED PRIVATE BIO SENTINEL",
  );
});

test("community detection is public, private/no-store and ignores untrusted location headers", async () => {
  const response = await fetch(origin + "/v1/community-region?country=CN", {
    headers: {
      "X-Forwarded-For": "114.114.114.114",
      "CF-IPCountry": "CN",
      "X-Country": "CN",
    },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  const detected = await response.json();
  assert.equal(detected.region, "INTL");
  assert.equal(detected.source, "development");
  assert.equal("country" in detected, false);
  assert.equal(JSON.stringify(detected).includes("127.0.0.1"), false);
  assert.equal(detected.attribution.url, "https://freeipapi.com");
});
test("deletion-only authentication cannot open profiles, core data, admin queues or realtime connections", async () => {
  const owner = await fixture("deletion-scope", "1990-01-01");
  const response = await call("auth/deletion-login", {
    email: owner.u.email,
    password: "test-password-not-production",
  });
  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(response.body).sort(), ["region", "token"]);
  const session = await db.session.findUniqueOrThrow({
    where: { tokenHash: hash(response.body.token) },
  });
  assert.equal(session.scope, "DELETION");
  assert.ok(session.expiresAt.getTime() <= Date.now() + 10 * 60000);
  for (const path of [
    "me",
    "me/export",
    "me/profile",
    "feed",
    "progress",
    "rooms",
    "guardian/children",
    "admin/profiles",
    "learning-plan?puzzle=3x3",
    "assessments?puzzle=3x3",
    "first-solves",
  ])
    assert.equal(
      (await call(path, undefined, response.body.token)).status,
      403,
      path,
    );
  const { sessionUser } = await import("../../apps/api/src/security");
  await assert.rejects(
    () => sessionUser(db as Db, response.body.token),
    /Session expired/,
  );
  assert.equal(
    (await call("auth/sessions", undefined, response.body.token, "DELETE"))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        "me",
        { confirmation: "DELETE" },
        response.body.token,
        "DELETE",
      )
    ).status,
    200,
  );
  assert.equal((await call("me", undefined, owner.token)).status, 401);
  const reviewer = await fixture("deletion-scope-admin", "1990-01-01", "ADMIN");
  assert.equal(
    (
      await call("auth/deletion-login", {
        email: reviewer.u.email,
        password: "test-password-not-production",
      })
    ).status,
    403,
  );
  const withMfa = await call("auth/deletion-login", {
    email: reviewer.u.email,
    password: "test-password-not-production",
    otp: authenticator.generate(reviewer.secret!),
  });
  assert.equal(withMfa.status, 201);
  assert.equal(
    (await call("admin/overview", undefined, withMfa.body.token)).status,
    403,
  );
  assert.equal((await call("auth/logout", {}, withMfa.body.token)).status, 201);
  assert.equal(
    (await call("me", { confirmation: "DELETE" }, withMfa.body.token, "DELETE"))
      .status,
    401,
  );
});
test("regional email and deletion links identify their original account community", async () => {
  const document = await call("legal/deletion");
  assert.equal(
    new URL(document.body.actionUrl).searchParams.get("community"),
    "INTL",
  );
  const cn = await call(
    "legal/deletion",
    undefined,
    undefined,
    undefined,
    cnOrigin,
  );
  assert.equal(new URL(cn.body.actionUrl).searchParams.get("community"), "CN");
  const email = `routing-email-${runId}@cubers.test`;
  await call("auth/register", {
    email,
    password: "test-password-not-production",
    displayName: "Synthetic link routing",
    birthDate: "1990-01-01",
    region: "INTL",
    terms: true,
    privacy: true,
  });
  let link = "";
  await waitFor(async () => {
    for (const file of await readdir(".data/mail")) {
      const message = await readFile(join(".data/mail", file), "utf8");
      if (!message.includes(email)) continue;
      const content = /Content-Transfer-Encoding: quoted-printable/i.test(
        message,
      )
        ? message
            .replace(/=\r?\n/g, "")
            .replace(/=([0-9A-F]{2})/gi, (_match, hex) =>
              String.fromCharCode(parseInt(hex, 16)),
            )
        : message;
      const match = content.match(
        /https?:[^\s]+\/verify\?token=[A-Za-z0-9_-]+&community=INTL/,
      );
      if (match) link = match[0];
    }
    return !!link;
  });
  assert.equal(new URL(link).searchParams.get("community"), "INTL");
});

test("placement sessions resume atomically and reject ownership probes, forged results and duplicate answers", async () => {
  const owner = await fixture("placement-ownership", "1990-01-01");
  assert.equal((await call("assessments", { puzzle: "3x3" })).status, 401);
  assert.equal((await call("learning-plan?puzzle=3x3")).status, 401);
  const started = await Promise.all([
    call("assessments", { puzzle: "3x3" }, owner.token),
    call("assessments", { puzzle: "3x3" }, owner.token),
  ]);
  assert.ok(started.every((r) => r.status === 201));
  const session = started[0].body as AssessmentView;
  assert.equal(session.id, started[1].body.id);
  assert.equal(
    await db.learningAssessment.count({
      where: { userId: owner.u.id, status: "ACTIVE" },
    }),
    1,
  );
  assert.deepEqual(Object.keys(session.current!).sort(), [
    "choices",
    "id",
    "question",
    "setup",
    "title",
  ]);
  assert.equal(JSON.stringify(session).includes("correctOptionId"), false);
  assert.equal(JSON.stringify(session).includes("explanation"), false);
  assert.equal(
    (await call(`assessments/${session.id}`, undefined, adultToken)).status,
    404,
  );
  assert.equal(
    (await call(`assessments/${randomUUID()}`, undefined, adultToken)).status,
    404,
  );
  assert.equal(
    (
      await call(
        `assessments/${session.id}/answers`,
        { kind: "skip", version: 0 },
        adultToken,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        `assessments/${session.id}`,
        undefined,
        owner.token,
        undefined,
        cnOrigin,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        `assessments/${session.id}/answers`,
        { kind: "submit", version: 0, optionId: "a", moves: [], passed: true },
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `assessments/${session.id}/answers`,
        { kind: "submit", version: 0, optionId: "a", moves: ["NOT_A_TURN"] },
        owner.token,
      )
    ).status,
    400,
  );
  const results = await Promise.all([
    call(
      `assessments/${session.id}/answers`,
      { kind: "skip", version: 0 },
      owner.token,
    ),
    call(
      `assessments/${session.id}/answers`,
      { kind: "skip", version: 0 },
      owner.token,
    ),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const saved = (
    await call(`assessments/${session.id}`, undefined, owner.token)
  ).body;
  assert.equal(saved.version, 1);
  assert.equal(saved.feedback.length, 1);
  assert.equal(saved.feedback[0].skipped, true);
  assert.equal(saved.current.id, "pair");
  const plan = (await call("learning-plan?puzzle=3x3", undefined, owner.token))
    .body;
  assert.equal(plan.activeAssessmentId, session.id);
  assert.equal(plan.assessment, null);
  assert.equal(
    plan.queue.some((item: any) => item.reason === "placement"),
    false,
  );
});

test("all four placement checks reconstruct real moves and persist private recommendations without awarding progress", async () => {
  const owner = await fixture("placement-all-puzzles", "1990-01-01");
  for (const puzzle of ["2x2", "3x3", "4x4", "pyraminx"]) {
    let session = (await call("assessments", { puzzle }, owner.token))
      .body as AssessmentView;
    const stored = await db.learningAssessment.findUniqueOrThrow({
      where: { id: session.id },
    });
    const tasks = stored.tasks as unknown as AssessmentTask[];
    for (const task of tasks) {
      const moves =
        puzzle === "pyraminx"
          ? pyraminxInverse(task.setup)
          : inverse(task.setup);
      const result = await call(
        `assessments/${session.id}/answers`,
        {
          kind: "submit",
          version: session.version,
          optionId: task.correctOptionId,
          moves,
        },
        owner.token,
      );
      assert.equal(result.status, 201);
      session = result.body;
      const feedback = session.feedback.at(-1)!;
      assert.equal(feedback.knowledge, true);
      assert.equal(feedback.puzzle, true);
    }
    assert.equal(session.status, "COMPLETED");
    assert.equal(session.current, null);
    assert.ok(session.finishedAt);
    assert.equal(
      (
        await call(
          `assessments/${session.id}/answers`,
          { kind: "skip", version: session.version },
          owner.token,
        )
      ).status,
      409,
    );
    const plan = (
      await call(`learning-plan?puzzle=${puzzle}`, undefined, owner.token)
    ).body;
    assert.equal(plan.assessment.id, session.id);
    assert.equal(plan.assessment.checksPassed, 3);
    assert.equal(plan.activeAssessmentId, null);
    assert.ok(plan.queue.length > 0 && plan.queue.length <= 6);
    const recommended = await db.course.findUniqueOrThrow({
      where: { id: plan.queue[0].lessonId },
    });
    assert.equal((recommended.content as any).level, "advanced");
    for (const item of plan.queue) {
      const course = await db.course.findUniqueOrThrow({
        where: { id: item.lessonId },
      });
      assert.equal(course.published, true);
      assert.equal((course.content as any).puzzle, puzzle);
    }
  }
  assert.equal(await db.progress.count({ where: { userId: owner.u.id } }), 0);
  assert.equal(
    await db.lessonSession.count({ where: { userId: owner.u.id } }),
    0,
  );
  const exported = (await call("me/export", undefined, owner.token)).body;
  assert.equal(exported.assessments.length, 4);
  assert.ok(exported.assessments.every((a: any) => a.userId === owner.u.id));
  const privateProfile = (await call("me/profile", undefined, owner.token))
    .body;
  assert.equal(JSON.stringify(privateProfile).includes("checksPassed"), false);
});

test("knowledge, real puzzle completion and skips remain distinct and drive placement gaps", async () => {
  const owner = await fixture("placement-gaps", "1990-01-01");
  let session = (await call("assessments", { puzzle: "3x3" }, owner.token))
    .body;
  const tasks = (
    await db.learningAssessment.findUniqueOrThrow({ where: { id: session.id } })
  ).tasks as unknown as AssessmentTask[];
  session = (
    await call(
      `assessments/${session.id}/answers`,
      {
        kind: "submit",
        version: 0,
        optionId: tasks[0].correctOptionId,
        moves: [],
      },
      owner.token,
    )
  ).body;
  assert.equal(session.feedback[0].knowledge, true);
  assert.equal(session.feedback[0].puzzle, false);
  const wrong = tasks[1].choices.find(
    (choice) => choice.id !== tasks[1].correctOptionId,
  )!.id;
  session = (
    await call(
      `assessments/${session.id}/answers`,
      {
        kind: "submit",
        version: 1,
        optionId: wrong,
        moves: inverse(tasks[1].setup),
      },
      owner.token,
    )
  ).body;
  assert.equal(session.feedback[1].knowledge, false);
  assert.equal(session.feedback[1].puzzle, true);
  session = (
    await call(
      `assessments/${session.id}/answers`,
      { kind: "skip", version: 2 },
      owner.token,
    )
  ).body;
  assert.equal(session.status, "COMPLETED");
  assert.equal(session.feedback[2].knowledge, false);
  assert.equal(session.feedback[2].puzzle, false);
  const plan = (await call("learning-plan?puzzle=3x3", undefined, owner.token))
    .body;
  assert.equal(plan.assessment.checksPassed, 0);
  assert.deepEqual(
    plan.queue
      .filter((i: any) => i.reason === "placement")
      .map((i: any) => i.lessonId),
    tasks.map((t) => t.lessonId),
  );
});

test("placement expiry, cancellation, publication and per-puzzle quotas are enforced by the server", async () => {
  const owner = await fixture("placement-limits", "1990-01-01");
  let session = (await call("assessments", { puzzle: "2x2" }, owner.token))
    .body;
  const expiredId = session.id;
  await db.learningAssessment.update({
    where: { id: session.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (
      await call(
        `assessments/${session.id}`,
        { version: 0 },
        owner.token,
        "DELETE",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        `assessments/${session.id}/answers`,
        { kind: "skip", version: 0 },
        owner.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (await call(`assessments/${session.id}`, undefined, owner.token)).body
      .status,
    "EXPIRED",
  );
  for (let i = 0; i < 2; i++) {
    session = (await call("assessments", { puzzle: "2x2" }, owner.token)).body;
    assert.equal(
      (
        await call(
          `assessments/${session.id}`,
          { version: 0 },
          owner.token,
          "DELETE",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          `assessments/${session.id}/answers`,
          { kind: "skip", version: 0 },
          owner.token,
        )
      ).status,
      409,
    );
  }
  assert.equal(
    (await call("assessments", { puzzle: "2x2" }, owner.token)).status,
    429,
  );
  await db.course.update({
    where: { id: "3-notation" },
    data: { published: false },
  });
  try {
    assert.equal(
      (await call("assessments", { puzzle: "3x3" }, owner.token)).status,
      409,
    );
    const plan = (
      await call("learning-plan?puzzle=3x3", undefined, owner.token)
    ).body;
    assert.equal(
      plan.queue.some((i: any) => i.lessonId === "3-notation"),
      false,
    );
  } finally {
    await db.course.update({
      where: { id: "3-notation" },
      data: { published: true },
    });
  }
  assert.equal(
    (await call("assessments", { puzzle: "5x5" }, owner.token)).status,
    400,
  );
  assert.equal(
    (await call("assessments?puzzle=__proto__", undefined, owner.token)).status,
    400,
  );
  // A delayed worker must not restart the expired record's retention clock.
  await db.learningAssessment.update({
    where: { id: expiredId },
    data: {
      expiresAt: new Date(Date.now() - 32 * 86400000),
      status: "ACTIVE",
      finishedAt: null,
    },
  });
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(
    await db.learningAssessment.findUnique({ where: { id: expiredId } }),
    null,
  );
  const limited = (
    await call("assessments", { puzzle: "pyraminx" }, owner.token)
  ).body;
  await infrastructure.redis.set(
    `INTL:assessment-answer:${owner.u.id}`,
    "120",
    "EX",
    3600,
  );
  assert.equal(
    (
      await call(
        `assessments/${limited.id}/answers`,
        { kind: "skip", version: 0 },
        owner.token,
      )
    ).status,
    429,
  );
  assert.equal(
    (
      await db.learningAssessment.findUniqueOrThrow({
        where: { id: limited.id },
      })
    ).version,
    0,
  );
});

test("adaptive practice prioritizes due reviews and refreshes after real course completion", async () => {
  const owner = await fixture("placement-adaptive", "1990-01-01");
  await db.progress.create({
    data: {
      userId: owner.u.id,
      lessonId: "3-sune",
      completed: true,
      repetitions: 1,
      moves: [],
      reviewAt: new Date(Date.now() - 86400000),
    },
  });
  let plan = (await call("learning-plan?puzzle=3x3", undefined, owner.token))
    .body;
  assert.deepEqual(plan.queue[0], { lessonId: "3-sune", reason: "review" });
  assert.equal(
    new Set(plan.queue.map((i: any) => i.lessonId)).size,
    plan.queue.length,
  );
  const lesson = lessons.find((l) => l.id === "3-sune")!;
  assert.equal(
    (
      await call(
        "progress/3-sune",
        {
          courseVersion: (
            await db.course.findUniqueOrThrow({
              where: { id: "progress/3-sune".slice(9) },
            })
          ).version,
          moves: lesson.algorithm.split(" "),
        },
        owner.token,
      )
    ).status,
    201,
  );
  plan = (await call("learning-plan?puzzle=3x3", undefined, owner.token)).body;
  assert.equal(
    plan.queue.some((i: any) => i.lessonId === "3-sune"),
    false,
  );
  assert.equal(plan.queue[0].lessonId, "3-notation");
});

test("placement observes current child consent, guardian export and account-deletion cleanup", async () => {
  const guardian = await fixture("placement-guardian", "1980-01-01");
  const child = await fixture("placement-child", "2020-01-01", "USER", false);
  assert.equal(
    (await call("assessments", { puzzle: "pyraminx" }, child.token)).status,
    403,
  );
  await db.consent.create({
    data: {
      childId: child.u.id,
      guardianId: guardian.u.id,
      documentId: randomUUID(),
      status: "APPROVED",
      reviewerId: adminId,
      reviewedAt: new Date(),
    },
  });
  const started = await call(
    "assessments",
    { puzzle: "pyraminx" },
    child.token,
  );
  assert.equal(started.status, 201);
  const exported = await call(
    `guardian/children/${child.u.id}/export`,
    undefined,
    guardian.token,
  );
  assert.equal(exported.status, 200);
  assert.equal(exported.body.assessments.length, 1);
  const activity = await call(
    `guardian/children/${child.u.id}/activity`,
    undefined,
    guardian.token,
  );
  assert.equal(activity.body.assessments[0].id, started.body.id);
  await db.consent.update({
    where: { childId: child.u.id },
    data: { status: "REVOKED" },
  });
  assert.equal(
    (
      await call(
        `assessments/${started.body.id}/answers`,
        { kind: "skip", version: 0 },
        child.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("learning-plan?puzzle=pyraminx", undefined, child.token))
      .status,
    403,
  );
  await call("me", { confirmation: "DELETE" }, guardian.token, "DELETE");
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(
    await db.learningAssessment.count({ where: { userId: child.u.id } }),
    0,
  );
});

test("downloaded first-solve plans cover all four puzzles without changing online sessions or granting progress", async () => {
  const owner = await fixture("guided-download-owner", "1990-01-01");
  const auth = await db.session.findUniqueOrThrow({
    where: { tokenHash: hash(owner.token) },
  });
  const authExpiry = new Date(Date.now() + 5 * 60_000);
  await db.session.update({
    where: { id: auth.id },
    data: { expiresAt: authExpiry },
  });
  for (const puzzle of ["2x2", "3x3", "4x4", "pyraminx"] as const) {
    const created = await call(
      "first-solves",
      { input: "virtual", puzzle },
      owner.token,
    );
    assert.equal(created.status, 201);
    const source = await db.guidedSolve.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    const response = await fetch(
      `${origin}/v1/first-solves/${source.id}/download`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${owner.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version: source.version }),
      },
    );
    assert.equal(response.status, 201);
    assert.match(response.headers.get("cache-control")!, /private.*no-store/);
    const packet = DownloadedLesson.parse(await response.json());
    assert.equal(packet.ownerId, owner.u.id);
    assert.equal(packet.lesson.id, guidedCourseId(puzzle));
    assert.equal(packet.guidedPractice!.sourceId, source.id);
    assert.equal(packet.guidedPractice!.sourceVersion, source.version);
    assert.equal(packet.guidedPractice!.startingStage, 0);
    assert.ok(packet.expiresAt <= authExpiry.getTime());
    assert.ok(packet.expiresAt <= source.expiresAt.getTime());
    const local = await openOfflineGuidance(packet);
    for (const step of packet.guidedPractice!.steps) {
      for (const move of step.moves) local.turn(move);
      local.checkpoint();
    }
    assert.equal(local.view().completed, true);
    const unchanged = await db.guidedSolve.findUniqueOrThrow({
      where: { id: source.id },
    });
    assert.equal(unchanged.version, source.version);
    assert.equal(unchanged.stage, 0);
    assert.equal(unchanged.status, "ACTIVE");
    assert.deepEqual(unchanged.moves, []);
    assert.deepEqual(unchanged.currentFaces, source.currentFaces);
    assert.equal(await db.progress.count({ where: { userId: owner.u.id } }), 0);
    assert.equal(
      (
        await call(`first-solves/${source.id}/download`, {
          version: source.version,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call(
          `first-solves/${source.id}/download`,
          { version: source.version },
          adultToken,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          `first-solves/${source.id}/download`,
          { version: source.version },
          owner.token,
          undefined,
          cnOrigin,
        )
      ).status,
      401,
    );
  }
});
test("guided downloads bind the saved revision, active checkpoint, publication and bounded expiry", async () => {
  const owner = await fixture("guided-download-bounds", "1990-01-01");
  const created = await call(
    "first-solves",
    {
      input: "scan",
      puzzle: "2x2",
      faces: facelets(applyMoves(solvedCube(2), "R U F")),
    },
    owner.token,
  );
  assert.equal(created.status, 201);
  const id = created.body.id,
    version = created.body.version;
  const sourceExpiry = new Date(Date.now() + 90_000);
  await db.guidedSolve.update({
    where: { id },
    data: { expiresAt: sourceExpiry },
  });
  const download = await call(
    `first-solves/${id}/download`,
    { version },
    owner.token,
  );
  assert.equal(download.status, 201);
  assert.equal(download.body.guidedPractice.input, "scan");
  assert.equal(download.body.expiresAt, sourceExpiry.getTime());
  assert.equal(
    (
      await call(
        `first-solves/${id}/download`,
        { version, expiresAt: Date.now() + 99999999 },
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `first-solves/${id}/download`,
        { version: version + 1 },
        owner.token,
      )
    ).status,
    409,
  );
  const course = await db.course.findUniqueOrThrow({
    where: { id: "2-first-solve" },
  });
  await db.course.update({
    where: { id: course.id },
    data: { published: false },
  });
  try {
    assert.equal(
      (await call(`first-solves/${id}/download`, { version }, owner.token))
        .status,
      409,
    );
  } finally {
    await db.course.update({
      where: { id: course.id },
      data: { published: course.published },
    });
  }
  await db.course.update({
    where: { id: course.id },
    data: { version: course.version + 1 },
  });
  try {
    assert.equal(
      (await call(`first-solves/${id}/download`, { version }, owner.token))
        .status,
      409,
    );
  } finally {
    await db.course.update({
      where: { id: course.id },
      data: { version: course.version },
    });
  }
  const moved = await call(
    `first-solves/${id}/moves`,
    { version, moves: ["U"] },
    owner.token,
  );
  assert.equal(moved.status, 201);
  assert.equal(
    (
      await call(
        `first-solves/${id}/download`,
        { version: moved.body.version },
        owner.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        `first-solves/${id}`,
        { version: moved.body.version },
        owner.token,
        "DELETE",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        `first-solves/${id}/download`,
        { version: moved.body.version + 1 },
        owner.token,
      )
    ).status,
    409,
  );
});
test("guardian withdrawal immediately prevents new guided downloads for the linked child", async () => {
  const { child, consent } = await securityChild("guided-offline-consent");
  const started = await call(
    "first-solves",
    { input: "virtual", puzzle: "2x2" },
    child.token,
  );
  assert.equal(started.status, 201);
  assert.equal(
    (
      await call(
        `first-solves/${started.body.id}/download`,
        { version: started.body.version },
        child.token,
      )
    ).status,
    201,
  );
  await db.consent.update({
    where: { id: consent.id },
    data: { status: "REVOKED" },
  });
  assert.equal(
    (
      await call(
        `first-solves/${started.body.id}/download`,
        { version: started.body.version },
        child.token,
      )
    ).status,
    403,
  );
});
test("guided download rechecks a captured session after waiting for its account lock", async () => {
  const owner = await fixture("guided-offline-session-race", "1990-01-01");
  const started = await call(
    "first-solves",
    { input: "virtual", puzzle: "2x2" },
    owner.token,
  );
  assert.equal(started.status, 201);
  const auth = await db.session.findUniqueOrThrow({
    where: { tokenHash: hash(owner.token) },
  });
  let release!: () => void, acquired!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const blocker = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${owner.u.id}::uuid FOR UPDATE`;
      acquired();
      await gate;
      await tx.session.delete({ where: { id: auth.id } });
    },
    { timeout: 10_000 },
  );
  await locked;
  const download = call(
    `first-solves/${started.body.id}/download`,
    { version: started.body.version },
    owner.token,
  );
  let waiting = false;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await db.$queryRaw<
        { waiting: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT id FROM "User"%' AND (query LIKE '%FOR UPDATE%' OR query LIKE '%FOR NO KEY UPDATE%')) AS waiting`;
      if (result[0].waiting) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    release();
    await blocker;
  }
  assert.equal(
    waiting,
    true,
    "The request must actually wait before session revocation",
  );
  assert.equal((await download).status, 403);
  assert.equal(
    (await db.guidedSolve.findUniqueOrThrow({ where: { id: started.body.id } }))
      .version,
    started.body.version,
  );
});

test("a complete virtual guided solve verifies all stages once and cannot bypass progress through old drill APIs", async () => {
  const owner = await fixture("guided-virtual", "1990-01-01");
  assert.equal((await call("first-solves", { input: "virtual" })).status, 401);
  assert.equal(
    (
      await call(
        "progress/3-first-solve",
        {
          courseVersion: (
            await db.course.findUniqueOrThrow({
              where: { id: "progress/3-first-solve".slice(9) },
            })
          ).version,
          moves: [],
        },
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "courses/3-first-solve/sessions",
        {
          courseVersion: (
            await db.course.findUniqueOrThrow({
              where: { id: "courses/3-first-solve/sessions".slice(8, -9) },
            })
          ).version,
          input: "scan",
        },
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "tutor",
        {
          courseVersion: (
            await db.course.findUniqueOrThrow({
              where: { id: "3-first-solve" },
            })
          ).version,
          lessonId: "3-first-solve",
          locale: "en",
          moves: [],
          question: "why",
        },
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "first-solves",
        { input: "virtual", faces: facelets(solvedCube()) },
        owner.token,
      )
    ).status,
    400,
  );
  const starts = await Promise.all([
    call("first-solves", { input: "virtual" }, owner.token),
    call("first-solves", { input: "virtual" }, owner.token),
  ]);
  assert.deepEqual(starts.map((result) => result.status).sort(), [201, 409]);
  let session = starts.find((result) => result.status === 201)!
    .body as GuidedSolveView;
  assert.equal(session.total, 13);
  assert.equal(session.currentFaces.D[4], "U");
  assert.equal(session.currentFaces.F[4], "F");
  assert.equal(
    (await call(`first-solves/${session.id}`, undefined, adultToken)).status,
    404,
  );
  assert.equal(
    (
      await call(
        `first-solves/${session.id}`,
        undefined,
        owner.token,
        undefined,
        cnOrigin,
      )
    ).status,
    401,
  );
  for (let stage = 0; stage < 13; stage++) {
    assert.equal(session.stage, stage);
    const moves = session.step!.moves;
    for (let i = 0; i < moves.length; i += 100) {
      const result = await call(
        `first-solves/${session.id}/moves`,
        { version: session.version, moves: moves.slice(i, i + 100) },
        owner.token,
      );
      assert.equal(result.status, 201);
      session = result.body;
    }
    if (stage === 12) {
      const finals = await Promise.all([
        call(
          `first-solves/${session.id}/checkpoint`,
          { version: session.version },
          owner.token,
        ),
        call(
          `first-solves/${session.id}/checkpoint`,
          { version: session.version },
          owner.token,
        ),
      ]);
      assert.deepEqual(
        finals.map((result) => result.status).sort(),
        [201, 409],
      );
      session = finals.find((result) => result.status === 201)!.body;
    } else {
      const checked = await call(
        `first-solves/${session.id}/checkpoint`,
        { version: session.version },
        owner.token,
      );
      assert.equal(checked.status, 201);
      session = checked.body;
    }
  }
  assert.equal(session.status, "COMPLETED");
  assert.equal(session.checkpoints.length, 13);
  const progress = await db.progress.findUniqueOrThrow({
    where: {
      userId_lessonId: { userId: owner.u.id, lessonId: "3-first-solve" },
    },
  });
  assert.equal(progress.completed, true);
  assert.equal(progress.repetitions, 1);
  assert.ok(progress.moves.length > 0);
  assert.equal(await db.attempt.count({ where: { userId: owner.u.id } }), 0);
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/checkpoint`,
        { version: session.version },
        owner.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (await call("me/export", undefined, owner.token)).body.guidedSolves.length,
    1,
  );
});

test("guided virtual turns are versioned, bounded and reversible without accepting a client state", async () => {
  const owner = await fixture("guided-recovery", "1990-01-01");
  let session = (await call("first-solves", { input: "virtual" }, owner.token))
    .body as GuidedSolveView;
  const initial = session.currentFaces;
  session = (
    await call(
      `first-solves/${session.id}/moves`,
      { version: 0, moves: ["R"] },
      owner.token,
    )
  ).body;
  const repeated = await Promise.all([
    call(
      `first-solves/${session.id}/moves`,
      { version: 1, moves: ["U"] },
      owner.token,
    ),
    call(
      `first-solves/${session.id}/moves`,
      { version: 1, moves: ["U"] },
      owner.token,
    ),
  ]);
  assert.deepEqual(repeated.map((result) => result.status).sort(), [201, 409]);
  session = repeated.find((result) => result.status === 201)!.body;
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/checkpoint`,
        { version: session.version, faces: facelets(solvedCube()) },
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/rescan`,
        { version: session.version, faces: facelets(solvedCube()) },
        owner.token,
      )
    ).status,
    400,
  );
  for (const body of [
    { version: session.version, moves: ["M"] },
    { version: session.version, moves: Array(101).fill("R") },
    { version: session.version, moves: ["R"], completed: true },
  ])
    assert.equal(
      (await call(`first-solves/${session.id}/moves`, body, owner.token))
        .status,
      400,
    );
  session = (
    await call(
      `first-solves/${session.id}/reset`,
      { version: session.version },
      owner.token,
    )
  ).body;
  assert.deepEqual(session.currentFaces, initial);
  assert.equal(session.stageMoves.length, 0);
  assert.equal(session.moveCount, 4);
  session = (
    await call(
      `first-solves/${session.id}/moves`,
      { version: session.version, moves: ["R"] },
      owner.token,
    )
  ).body;
  session = (
    await call(
      `first-solves/${session.id}/moves`,
      { version: session.version, moves: ["R'"] },
      owner.token,
    )
  ).body;
  assert.deepEqual(session.currentFaces, initial);
  assert.equal(session.stageMoves.length, 0);
  assert.equal(session.matchedGuide, true);
  assert.equal(session.guideIndex, 0);
  assert.equal(session.moveCount, 6);
  if (firstSolveGoal(fromFacelets(3, session.currentFaces), "cross"))
    session = (
      await call(
        `first-solves/${session.id}/moves`,
        { version: session.version, moves: ["R"] },
        owner.token,
      )
    ).body;
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/checkpoint`,
        { version: session.version },
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(await db.progress.count({ where: { userId: owner.u.id } }), 0);
  assert.equal(
    (await call(`first-solves?cursor=${session.id}`, undefined, adultToken))
      .status,
    404,
  );
});

test("arbitrary physical guided practice accepts fresh checked states and replans after unconfirmed changes", async () => {
  const owner = await fixture("guided-physical", "1990-01-01");
  assert.equal(
    (
      await call(
        "first-solves",
        { input: "scan", faces: facelets(solvedCube()) },
        owner.token,
      )
    ).status,
    400,
  );
  const invalid = facelets(solvedCube());
  [invalid.U[7], invalid.F[1]] = [invalid.F[1], invalid.U[7]];
  assert.equal(
    (await call("first-solves", { input: "scan", faces: invalid }, owner.token))
      .status,
    400,
  );
  let session = (
    await call(
      "first-solves",
      {
        input: "scan",
        faces: facelets(applyMoves(solvedCube(), "R U F2 L D' B R2")),
      },
      owner.token,
    )
  ).body as GuidedSolveView;
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/checkpoint`,
        { version: 0 },
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/reset`,
        { version: 0 },
        owner.token,
      )
    ).status,
    400,
  );
  let actual = applyMoves(fromFacelets(3, session.currentFaces), [
    ...session.step!.moves,
    "U",
  ]);
  const alternate = await call(
    `first-solves/${session.id}/checkpoint`,
    { version: session.version, faces: facelets(actual) },
    owner.token,
  );
  assert.equal(alternate.status, 201);
  session = alternate.body;
  assert.equal(session.stage, 1);
  assert.equal(session.moveCount, 0);
  actual = applyMoves(actual, "F R");
  const recovery = await call(
    `first-solves/${session.id}/rescan`,
    { version: session.version, faces: facelets(actual) },
    owner.token,
  );
  assert.equal(recovery.status, 201);
  session = recovery.body;
  assert.equal(session.stage, 0);
  assert.equal(session.checkpoints.at(-1)!.kind, "RESCAN");
  assert.equal(await db.progress.count({ where: { userId: owner.u.id } }), 0);
  for (let stage = 0; stage < 13; stage++) {
    actual = applyMoves(
      fromFacelets(3, session.currentFaces),
      session.step!.moves,
    );
    const response = await call(
      `first-solves/${session.id}/checkpoint`,
      { version: session.version, faces: facelets(actual) },
      owner.token,
    );
    assert.equal(response.status, 201);
    session = response.body;
  }
  assert.equal(session.status, "COMPLETED");
  assert.equal(session.moveCount, 0);
  assert.equal(await db.attempt.count({ where: { userId: owner.u.id } }), 0);
});

test("guided practice respects publication, expiry, private pagination, consent and deletion deadlines", async () => {
  const owner = await fixture("guided-lifecycle", "1990-01-01");
  let session = (await call("first-solves", { input: "virtual" }, owner.token))
    .body;
  const expiredId = session.id;
  await db.guidedSolve.update({
    where: { id: session.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (
      await call(
        `first-solves/${session.id}`,
        { version: 0 },
        owner.token,
        "DELETE",
      )
    ).status,
    409,
  );
  assert.equal(
    (await call(`first-solves/${session.id}`, undefined, owner.token)).body
      .status,
    "EXPIRED",
  );
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/moves`,
        { version: 0, moves: ["R"] },
        owner.token,
      )
    ).status,
    409,
  );
  session = (await call("first-solves", { input: "virtual" }, owner.token))
    .body;
  const original = await db.course.findUniqueOrThrow({
    where: { id: "3-first-solve" },
  });
  await db.course.update({
    where: { id: original.id },
    data: { published: false },
  });
  try {
    assert.equal(
      (
        await call(
          "first-solves",
          { input: "scan", faces: facelets(applyMoves(solvedCube(), "R")) },
          owner.token,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          `first-solves/${session.id}/moves`,
          { version: 0, moves: ["R"] },
          owner.token,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          `first-solves/${session.id}`,
          { version: 0 },
          owner.token,
          "DELETE",
        )
      ).status,
      200,
    );
  } finally {
    await db.course.update({
      where: { id: original.id },
      data: { published: original.published },
    });
  }
  await db.guidedSolve.update({
    where: { id: expiredId },
    data: {
      status: "ACTIVE",
      finishedAt: null,
      expiresAt: new Date(Date.now() - 32 * 86400000),
    },
  });
  const guardian = await fixture("guided-guardian", "1980-01-01"),
    child = await fixture("guided-child", "2020-01-01", "USER", false);
  assert.equal(
    (await call("first-solves", { input: "virtual" }, child.token)).status,
    403,
  );
  await db.consent.create({
    data: {
      childId: child.u.id,
      guardianId: guardian.u.id,
      documentId: randomUUID(),
      status: "APPROVED",
      reviewerId: adminId,
    },
  });
  const childSession = (
    await call("first-solves", { input: "virtual" }, child.token)
  ).body;
  const exported = await call(
    `guardian/children/${child.u.id}/export`,
    undefined,
    guardian.token,
  );
  assert.equal(exported.status, 200);
  assert.equal(exported.body.guidedSolves.length, 1);
  await db.consent.update({
    where: { childId: child.u.id },
    data: { status: "REVOKED" },
  });
  assert.equal(
    (
      await call(
        `first-solves/${childSession.id}/moves`,
        { version: 0, moves: ["R"] },
        child.token,
      )
    ).status,
    403,
  );
  await call("me", { confirmation: "DELETE" }, guardian.token, "DELETE");
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(
    await db.guidedSolve.count({ where: { userId: child.u.id } }),
    0,
  );
  assert.equal(
    await db.guidedSolve.findUnique({ where: { id: expiredId } }),
    null,
  );
});

test("bounded solver workers recover from interruption without blocking server guidance", async () => {
  const { FirstSolveSolver } =
    await import("../../apps/api/dist/first-solve-solver");
  const solver = new FirstSolveSolver();
  try {
    const state = applyMoves(solvedCube(), "R U F2 L D' B R2");
    const jobs = Array.from({ length: 7 }, () => solver.solve(state));
    const settled = await Promise.allSettled(jobs);
    assert.equal(
      settled.filter((result) => result.status === "fulfilled").length,
      6,
    );
    assert.equal(
      settled.filter((result) => result.status === "rejected").length,
      1,
    );
    const failed = solver.solve(state);
    const failure = assert.rejects(() => failed, /interrupted/);
    await (solver as any).worker.terminate();
    await failure;
    assert.equal((await solver.solve(state)).steps.length, 13);
  } finally {
    await solver.onModuleDestroy();
  }
});

test("complete 2×2 virtual guidance coexists with 3×3, binds history and grants only the correct course", async () => {
  const owner = await fixture("two-guided-virtual", "1990-01-01");
  for (const path of [
    "progress/2-first-solve",
    "courses/2-first-solve/sessions",
  ])
    assert.equal(
      (
        await call(
          path,
          path.startsWith("progress") ? { moves: [] } : { input: "scan" },
          owner.token,
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await call(
        "tutor",
        {
          courseVersion: (
            await db.course.findUniqueOrThrow({
              where: { id: "2-first-solve" },
            })
          ).version,
          lessonId: "2-first-solve",
          locale: "en",
          moves: [],
          question: "why",
        },
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "first-solves",
        { input: "virtual", puzzle: "5x5" },
        owner.token,
      )
    ).status,
    400,
  );
  const three = await call("first-solves", { input: "virtual" }, owner.token);
  assert.equal(three.status, 201);
  assert.equal(three.body.puzzle, "3x3");
  let session = (
    await call("first-solves", { input: "virtual", puzzle: "2x2" }, owner.token)
  ).body as GuidedSolveView;
  assert.equal(session.puzzle, "2x2");
  assert.equal(session.total, 6);
  assert.equal(session.currentFaces.U.length, 4);
  assert.equal(
    (
      await call(
        "first-solves",
        { input: "virtual", puzzle: "2x2" },
        owner.token,
      )
    ).status,
    409,
  );
  const twoList = (
    await call("first-solves?puzzle=2x2", undefined, owner.token)
  ).body;
  assert.deepEqual(
    twoList.active.map((r: any) => r.id),
    [session.id],
  );
  assert.ok(twoList.items.every((r: any) => r.puzzle === "2x2"));
  assert.equal(
    (await call("first-solves", undefined, owner.token)).body.active[0].id,
    three.body.id,
  );
  assert.equal(
    (
      await call(
        `first-solves?puzzle=2x2&cursor=${three.body.id}`,
        undefined,
        owner.token,
      )
    ).status,
    404,
  );
  assert.equal(
    (await call(`first-solves/${session.id}`, undefined, adultToken)).status,
    404,
  );
  assert.equal(
    (
      await call(
        `first-solves/${session.id}`,
        undefined,
        owner.token,
        undefined,
        cnOrigin,
      )
    ).status,
    401,
  );
  for (let stage = 0; stage < 6; stage++) {
    assert.equal(session.stage, stage);
    const moves = session.step!.moves;
    if (moves.length) {
      const moved = await call(
        `first-solves/${session.id}/moves`,
        { version: session.version, moves },
        owner.token,
      );
      assert.equal(moved.status, 201);
      session = moved.body;
    }
    if (stage === 5) {
      const results = await Promise.all([
        call(
          `first-solves/${session.id}/checkpoint`,
          { version: session.version },
          owner.token,
        ),
        call(
          `first-solves/${session.id}/checkpoint`,
          { version: session.version },
          owner.token,
        ),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      session = results.find((r) => r.status === 201)!.body;
    } else {
      const result = await call(
        `first-solves/${session.id}/checkpoint`,
        { version: session.version },
        owner.token,
      );
      assert.equal(result.status, 201);
      session = result.body;
    }
  }
  assert.equal(session.status, "COMPLETED");
  const progress = await db.progress.findMany({
    where: { userId: owner.u.id },
  });
  assert.equal(progress.length, 1);
  assert.equal(progress[0].lessonId, "2-first-solve");
  assert.equal(progress[0].repetitions, 1);
  assert.equal(
    (await db.guidedSolve.findUniqueOrThrow({ where: { id: session.id } }))
      .courseId,
    "2-first-solve",
  );
  assert.equal(
    (await call(`first-solves/${three.body.id}`, undefined, owner.token)).body
      .stage,
    0,
  );
  assert.equal(await db.attempt.count({ where: { userId: owner.u.id } }), 0);
});

test("2×2 scans keep their reference, handle odd permutations and recover to a finished rotated scan", async () => {
  const owner = await fixture("two-guided-physical", "1990-01-01");
  assert.equal(
    (
      await call(
        "first-solves",
        { input: "scan", puzzle: "2x2", faces: facelets(solvedCube(3)) },
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "first-solves",
        { input: "scan", puzzle: "2x2", faces: facelets(solvedCube(2)) },
        owner.token,
      )
    ).status,
    400,
  );
  const faces = facelets(solvedCube(2));
  faces.R[0] = "F";
  faces.F[1] = "L";
  faces.F[0] = "R";
  faces.L[1] = "F";
  let response = await call(
    "first-solves",
    { input: "scan", puzzle: "2x2", faces },
    owner.token,
  );
  assert.equal(response.status, 201);
  let session = response.body as GuidedSolveView;
  assert.deepEqual(session.currentFaces, faces);
  const alternate = applyMoves(fromFacelets(2, session.currentFaces), [
    ...session.step!.moves,
    "U",
  ]);
  response = await call(
    `first-solves/${session.id}/checkpoint`,
    { version: session.version, faces: facelets(alternate) },
    owner.token,
  );
  assert.equal(response.status, 201);
  session = response.body;
  assert.equal(session.stage, 1);
  const changed = facelets(applyMoves(alternate, "F R"));
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/rescan`,
        { version: session.version, puzzle: "3x3", faces: changed },
        owner.token,
      )
    ).status,
    400,
  );
  response = await call(
    `first-solves/${session.id}/rescan`,
    { version: session.version, faces: changed },
    owner.token,
  );
  assert.equal(response.status, 201);
  session = response.body;
  assert.equal(session.stage, 0);
  assert.equal(session.puzzle, "2x2");
  for (let stage = 0; stage < 6; stage++) {
    let actual = applyMoves(
      fromFacelets(2, session.currentFaces),
      session.step!.moves,
    );
    if (stage === 5) actual = applyMoves(actual, "x y");
    response = await call(
      `first-solves/${session.id}/checkpoint`,
      { version: session.version, faces: facelets(actual) },
      owner.token,
    );
    assert.equal(response.status, 201);
    session = response.body;
  }
  assert.equal(session.status, "COMPLETED");
  assert.equal(session.moveCount, 0);
  assert.equal(session.currentFaces.D[0], "U");
  assert.equal(session.currentFaces.F[0], "F");
  assert.equal(
    (await call("me/export", undefined, owner.token)).body.guidedSolves[0]
      .puzzle,
    "2x2",
  );
});

test("2×2 guided permissions, independent publication and child erasure remain enforced", async () => {
  const guardian = await fixture("two-guided-parent", "1980-01-01"),
    child = await fixture("two-guided-child", "2020-01-01", "USER", false);
  assert.equal(
    (
      await call(
        "first-solves",
        { input: "virtual", puzzle: "2x2" },
        child.token,
      )
    ).status,
    403,
  );
  await db.consent.create({
    data: {
      childId: child.u.id,
      guardianId: guardian.u.id,
      documentId: randomUUID(),
      status: "APPROVED",
      reviewerId: adminId,
    },
  });
  let response = await call(
    "first-solves",
    { input: "virtual", puzzle: "2x2" },
    child.token,
  );
  assert.equal(response.status, 201);
  const session = response.body;
  const activity = await call(
    `guardian/children/${child.u.id}/activity`,
    undefined,
    guardian.token,
  );
  assert.equal(activity.body.guidedSolves[0].puzzle, "2x2");
  assert.equal(activity.body.guidedSolves[0].plan.steps.length, 6);
  await db.course.update({
    where: { id: "2-first-solve" },
    data: { published: false },
  });
  try {
    assert.equal(
      (
        await call(
          `first-solves/${session.id}/moves`,
          { version: 0, moves: ["R"] },
          child.token,
        )
      ).status,
      409,
    );
    response = await call(
      "first-solves",
      { input: "virtual", puzzle: "3x3" },
      child.token,
    );
    assert.equal(response.status, 201);
  } finally {
    await db.course.update({
      where: { id: "2-first-solve" },
      data: { published: true },
    });
  }
  await db.consent.update({
    where: { childId: child.u.id },
    data: { status: "REVOKED" },
  });
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/checkpoint`,
        { version: 0 },
        child.token,
      )
    ).status,
    403,
  );
  await call("me", { confirmation: "DELETE" }, guardian.token, "DELETE");
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(
    await db.guidedSolve.count({ where: { userId: child.u.id } }),
    0,
  );
});

test("reply pages traverse beyond 100 rows with tied timestamps and later-page ancestry", async () => {
  const publisher = await fixture("page-reply-publisher", "1990-01-01"),
    reader = await fixture("page-reply-reader", "1990-01-01");
  const post = await db.post.create({
    data: {
      authorId: publisher.u.id,
      body: "Synthetic long discussion",
      tags: [],
      mediaIds: [],
      status: "PUBLISHED",
      moderatorApproved: true,
    },
  });
  const ids = Array.from({ length: 125 }, () => randomUUID()).sort();
  const at = new Date("2026-01-01T00:00:00.000Z");
  await db.comment.createMany({
    data: ids.map((id, index) => ({
      id,
      postId: post.id,
      authorId: publisher.u.id,
      body: `Synthetic reply ${index}`,
      status: "PUBLISHED",
      createdAt: at,
      parentId: index === 124 ? ids[0] : null,
    })),
  });
  const seen: string[] = [];
  let cursor: string | null = null,
    pages = 0;
  do {
    const response = await call(
      `posts/${post.id}/comments/page${cursor ? `?cursor=${cursor}` : ""}`,
      undefined,
      reader.token,
    );
    assert.equal(response.status, 200);
    assert.ok(response.body.items.length <= 20);
    seen.push(...response.body.items.map((row: any) => row.id));
    if (response.body.items.some((row: any) => row.id === ids[124])) {
      assert.deepEqual(
        response.body.context.map((row: any) => row.id),
        [ids[0]],
      );
    }
    cursor = response.body.nextCursor;
    if (cursor) assert.match(cursor, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(++pages <= 7);
  } while (cursor);
  assert.deepEqual(seen, ids);
  assert.equal(
    (await call(`posts/${post.id}/comments`, undefined, reader.token)).body
      .length,
    100,
  );
});

test("reply cursors and parent context recheck access, moderation and expiry between pages", async () => {
  const publisher = await fixture("page-parent-publisher", "1990-01-01"),
    peer = await fixture("page-parent-peer", "1990-01-01"),
    reader = await fixture("page-parent-reader", "1990-01-01"),
    other = await fixture("page-parent-other", "1990-01-01");
  const postData = {
    authorId: publisher.u.id,
    body: "Synthetic policy thread",
    tags: [],
    mediaIds: [],
    status: "PUBLISHED",
    moderatorApproved: true,
  };
  const post = await db.post.create({ data: postData }),
    second = await db.post.create({ data: postData });
  const ids = Array.from({ length: 25 }, () => randomUUID()).sort();
  await db.comment.createMany({
    data: ids.map((id, index) => ({
      id,
      postId: post.id,
      authorId: index === 0 ? peer.u.id : publisher.u.id,
      body: `Synthetic ancestry ${index}`,
      status: "PUBLISHED",
      createdAt: new Date("2026-01-01"),
      parentId: index >= 20 ? ids[0] : null,
    })),
  });
  const first = (
    await call(`posts/${post.id}/comments/page`, undefined, reader.token)
  ).body;
  const path = `posts/${post.id}/comments/page?cursor=${first.nextCursor}`;
  assert.equal((await call(path, undefined, other.token)).status, 400);
  assert.equal(
    (
      await call(
        `posts/${second.id}/comments/page?cursor=${first.nextCursor}`,
        undefined,
        reader.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `posts/${post.id}/comments/page?cursor=invalid`,
        undefined,
        reader.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `posts/${post.id}/comments/page?limit=100000`,
        undefined,
        reader.token,
      )
    ).status,
    400,
  );
  await db.comment.delete({ where: { id: ids[19] } });
  let later = await call(path, undefined, reader.token);
  assert.equal(later.status, 200);
  assert.equal(later.body.items.length, 5);
  assert.deepEqual(
    later.body.context.map((row: any) => row.id),
    [ids[0]],
  );
  await db.comment.update({
    where: { id: ids[0] },
    data: { status: "REJECTED" },
  });
  later = await call(path, undefined, reader.token);
  assert.deepEqual(later.body.items, []);
  assert.deepEqual(later.body.context, []);
  await db.comment.update({
    where: { id: ids[0] },
    data: { status: "PUBLISHED" },
  });
  await call(
    "social",
    { targetId: peer.u.id, kind: "block", enabled: true },
    reader.token,
  );
  assert.deepEqual((await call(path, undefined, reader.token)).body.items, []);
  await call(
    "social",
    { targetId: peer.u.id, kind: "block", enabled: false },
    reader.token,
  );
  await db.user.update({
    where: { id: peer.u.id },
    data: { emailVerified: false },
  });
  assert.deepEqual((await call(path, undefined, reader.token)).body.items, []);
  await db.user.update({
    where: { id: peer.u.id },
    data: { emailVerified: true },
  });
  await db.post.update({
    where: { id: post.id },
    data: { status: "REJECTED" },
  });
  assert.equal((await call(path, undefined, reader.token)).status, 404);
  await db.post.update({
    where: { id: post.id },
    data: { status: "PUBLISHED" },
  });
  await infrastructure.redis.del(
    "INTL:comment-cursor:" + hash(first.nextCursor),
  );
  assert.equal((await call(path, undefined, reader.token)).status, 400);
});

test("club announcement pages keep filters and viewers separate and revoke private access", async () => {
  const owner = await fixture("page-club-owner", "1990-01-01"),
    member = await fixture("page-club-member", "1990-01-01"),
    other = await fixture("page-club-other", "1990-01-01");
  const club = await db.club.create({
    data: {
      name: "Synthetic paged club",
      description: "Private pagination fixture",
      ownerId: owner.u.id,
      private: true,
      status: "APPROVED",
    },
  });
  await db.membership.create({
    data: { clubId: club.id, userId: member.u.id, status: "APPROVED" },
  });
  await db.membership.create({
    data: { clubId: club.id, userId: owner.u.id, status: "APPROVED" },
  });
  const ids = Array.from({ length: 25 }, () => randomUUID())
    .sort()
    .reverse();
  await db.post.createMany({
    data: ids.map((id) => ({
      id,
      authorId: owner.u.id,
      clubId: club.id,
      kind: "ANNOUNCEMENT",
      body: "Synthetic announcement",
      tags: [],
      mediaIds: [],
      status: "PUBLISHED",
      moderatorApproved: true,
      createdAt: new Date("2026-01-01"),
    })),
  });
  const base = `feed?clubId=${club.id}&postKind=ANNOUNCEMENT`;
  const first = await call(base, undefined, member.token);
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 20);
  assert.match(first.body.nextCursor, /^[A-Za-z0-9_-]{43}$/);
  const path = `${base}&cursor=${first.body.nextCursor}`;
  assert.equal((await call(path, undefined, owner.token)).status, 400);
  assert.equal(
    (
      await call(
        `feed?clubId=${club.id}&postKind=DISCUSSION&cursor=${first.body.nextCursor}`,
        undefined,
        member.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (await call(path + "&q=changed", undefined, member.token)).status,
    400,
  );
  assert.equal((await call(path, undefined, other.token)).status, 404);
  await db.post.delete({ where: { id: ids[19] } });
  const later = await call(path, undefined, member.token);
  assert.equal(later.status, 200);
  assert.deepEqual(
    later.body.items.map((row: any) => row.id),
    ids.slice(20),
  );
  await db.membership.delete({
    where: { clubId_userId: { clubId: club.id, userId: member.u.id } },
  });
  assert.equal((await call(path, undefined, member.token)).status, 404);
  await db.membership.create({
    data: { clubId: club.id, userId: member.u.id, status: "APPROVED" },
  });
  await infrastructure.redis.del(
    "INTL:feed-cursor:" + hash(first.body.nextCursor),
  );
  assert.equal((await call(path, undefined, member.token)).status, 400);
});

test("complete virtual Pyraminx guidance keeps puzzle-specific moves, history and completion credit", async () => {
  const owner = await fixture("pyra-guided-virtual", "1990-01-01");
  for (const path of [
    "progress/pyra-first-solve",
    "courses/pyra-first-solve/sessions",
  ])
    assert.equal(
      (
        await call(
          path,
          path.startsWith("progress") ? { moves: [] } : { input: "scan" },
          owner.token,
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await call(
        "tutor",
        {
          courseVersion: (
            await db.course.findUniqueOrThrow({
              where: { id: "pyra-first-solve" },
            })
          ).version,
          lessonId: "pyra-first-solve",
          locale: "en",
          moves: [],
          question: "why",
        },
        owner.token,
      )
    ).status,
    400,
  );
  const two = await call(
      "first-solves",
      { puzzle: "2x2", input: "virtual" },
      owner.token,
    ),
    three = await call("first-solves", { input: "virtual" }, owner.token);
  let response = await call(
    "first-solves",
    { puzzle: "pyraminx", input: "virtual" },
    owner.token,
  );
  assert.equal(response.status, 201);
  let session = response.body as GuidedSolveView;
  assert.equal(session.puzzle, "pyraminx");
  assert.equal(session.total, 12);
  assert.deepEqual(Object.keys(session.currentFaces).sort(), [
    "D",
    "F",
    "L",
    "R",
  ]);
  assert.equal(
    (
      await call(
        "first-solves",
        { puzzle: "pyraminx", input: "virtual" },
        owner.token,
      )
    ).status,
    409,
  );
  for (const move of ["F", "U2", "u2", "r2", "x"])
    assert.equal(
      (
        await call(
          `first-solves/${session.id}/moves`,
          { version: session.version, moves: [move] },
          owner.token,
        )
      ).status,
      400,
    );
  assert.equal(
    (await call(`first-solves/${session.id}`, undefined, adultToken)).status,
    404,
  );
  assert.equal(
    (
      await call(
        `first-solves/${session.id}`,
        undefined,
        owner.token,
        undefined,
        cnOrigin,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        `first-solves?puzzle=pyraminx&cursor=${two.body.id}`,
        undefined,
        owner.token,
      )
    ).status,
    404,
  );
  const history = (
    await call("first-solves?puzzle=pyraminx", undefined, owner.token)
  ).body;
  assert.deepEqual(
    history.active.map((r: any) => r.id),
    [session.id],
  );
  assert.ok(history.items.every((r: any) => r.puzzle === "pyraminx"));
  const initial = JSON.stringify(session.currentFaces);
  response = await call(
    `first-solves/${session.id}/moves`,
    { version: session.version, moves: ["u"] },
    owner.token,
  );
  assert.equal(response.status, 201);
  session = response.body;
  response = await call(
    `first-solves/${session.id}/reset`,
    { version: session.version },
    owner.token,
  );
  assert.equal(response.status, 201);
  session = response.body;
  assert.equal(JSON.stringify(session.currentFaces), initial);
  assert.equal(session.moveCount, 2);
  assert.deepEqual(session.stageMoves, []);
  assert.equal(session.guideIndex, 0);
  for (let stage = 0; stage < 12; stage++) {
    assert.equal(session.stage, stage);
    const moves = session.step!.moves;
    if (moves.length) {
      response = await call(
        `first-solves/${session.id}/moves`,
        { version: session.version, moves },
        owner.token,
      );
      assert.equal(response.status, 201);
      session = response.body;
    }
    assert.equal(
      guidedGoal(guidedState("pyraminx", session.currentFaces), session.step!),
      true,
    );
    if (stage === 11) {
      const finals = await Promise.all(
        [0, 1].map(() =>
          call(
            `first-solves/${session.id}/checkpoint`,
            { version: session.version },
            owner.token,
          ),
        ),
      );
      assert.deepEqual(finals.map((r) => r.status).sort(), [201, 409]);
      session = finals.find((r) => r.status === 201)!.body;
    } else {
      response = await call(
        `first-solves/${session.id}/checkpoint`,
        { version: session.version },
        owner.token,
      );
      assert.equal(response.status, 201);
      session = response.body;
    }
  }
  assert.equal(session.status, "COMPLETED");
  assert.equal(session.checkpoints.length, 12);
  const progress = await db.progress.findMany({
    where: { userId: owner.u.id },
  });
  assert.deepEqual(
    progress.map((p) => [p.lessonId, p.repetitions]),
    [["pyra-first-solve", 1]],
  );
  assert.equal(
    (await call(`first-solves/${two.body.id}`, undefined, owner.token)).body
      .stage,
    0,
  );
  assert.equal(
    (await call(`first-solves/${three.body.id}`, undefined, owner.token)).body
      .stage,
    0,
  );
  assert.equal(await db.attempt.count({ where: { userId: owner.u.id } }), 0);
  assert.ok(
    (await call("me/export", undefined, owner.token)).body.guidedSolves.some(
      (r: any) => r.id === session.id && r.puzzle === "pyraminx",
    ),
  );
});

test("physical Pyraminx guidance validates four-face scans and rotated checkpoints after recovery", async () => {
  const owner = await fixture("pyra-guided-physical", "1990-01-01");
  assert.equal(
    (
      await call(
        "first-solves",
        { puzzle: "pyraminx", input: "scan", faces: facelets(solvedCube()) },
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "first-solves",
        {
          puzzle: "pyraminx",
          input: "scan",
          faces: pyraminxFacelets(solvedPyraminx()),
        },
        owner.token,
      )
    ).status,
    400,
  );
  const malformed = pyraminxFacelets(solvedPyraminx());
  malformed.F.pop();
  assert.equal(
    (
      await call(
        "first-solves",
        { puzzle: "pyraminx", input: "scan", faces: malformed },
        owner.token,
      )
    ).status,
    400,
  );
  let response = await call(
    "first-solves",
    {
      puzzle: "pyraminx",
      input: "scan",
      faces: pyraminxFacelets(
        pyraminxApply(solvedPyraminx(), "U R' L B u r' l"),
      ),
    },
    owner.token,
  );
  assert.equal(response.status, 201);
  let session = response.body as GuidedSolveView;
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/checkpoint`,
        { version: session.version },
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/reset`,
        { version: session.version },
        owner.token,
      )
    ).status,
    400,
  );
  let actual = practiceApply(guidedState("pyraminx", session.currentFaces), [
    ...session.step!.moves,
    "u",
  ]);
  response = await call(
    `first-solves/${session.id}/checkpoint`,
    { version: session.version, faces: guidedFacelets(actual) },
    owner.token,
  );
  assert.equal(response.status, 201);
  session = response.body;
  assert.equal(session.stage, 1);
  actual = practiceApply(actual, "R L' b");
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/rescan`,
        {
          version: session.version,
          puzzle: "3x3",
          faces: guidedFacelets(actual),
        },
        owner.token,
      )
    ).status,
    400,
  );
  response = await call(
    `first-solves/${session.id}/rescan`,
    { version: session.version, faces: guidedFacelets(actual) },
    owner.token,
  );
  assert.equal(response.status, 201);
  session = response.body;
  assert.equal(session.stage, 0);
  assert.equal(session.checkpoints.at(-1)!.kind, "RESCAN");
  assert.equal(await db.progress.count({ where: { userId: owner.u.id } }), 0);
  for (let stage = 0; stage < 12; stage++) {
    actual = practiceApply(
      guidedState("pyraminx", session.currentFaces),
      session.step!.moves,
    );
    assert.ok(isPyraminx(actual));
    const faces = pyraminxFacelets(pyraminxOrientations(actual)[stage % 12]);
    response = await call(
      `first-solves/${session.id}/checkpoint`,
      { version: session.version, faces },
      owner.token,
    );
    assert.equal(response.status, 201, `Pyraminx physical stage ${stage}`);
    session = response.body;
  }
  assert.equal(session.status, "COMPLETED");
  assert.equal(session.moveCount, 0);
  assert.equal(
    (
      await db.progress.findUniqueOrThrow({
        where: {
          userId_lessonId: { userId: owner.u.id, lessonId: "pyra-first-solve" },
        },
      })
    ).repetitions,
    1,
  );
});

test("Pyraminx guidance rechecks guardian consent, independent publication and child erasure", async () => {
  const guardian = await fixture("pyra-guided-parent", "1980-01-01"),
    child = await fixture("pyra-guided-child", "2020-01-01", "USER", false);
  assert.equal(
    (
      await call(
        "first-solves",
        { puzzle: "pyraminx", input: "virtual" },
        child.token,
      )
    ).status,
    403,
  );
  await db.consent.create({
    data: {
      childId: child.u.id,
      guardianId: guardian.u.id,
      documentId: randomUUID(),
      status: "APPROVED",
      reviewerId: adminId,
    },
  });
  let response = await call(
    "first-solves",
    { puzzle: "pyraminx", input: "virtual" },
    child.token,
  );
  assert.equal(response.status, 201);
  const session = response.body;
  const activity = (
    await call(
      `guardian/children/${child.u.id}/activity`,
      undefined,
      guardian.token,
    )
  ).body;
  assert.equal(activity.guidedSolves[0].puzzle, "pyraminx");
  assert.equal(activity.guidedSolves[0].plan.steps.length, 12);
  await db.course.update({
    where: { id: "pyra-first-solve" },
    data: { published: false },
  });
  try {
    assert.equal(
      (
        await call(
          `first-solves/${session.id}/moves`,
          { version: 0, moves: ["u"] },
          child.token,
        )
      ).status,
      409,
    );
    response = await call(
      "first-solves",
      { puzzle: "2x2", input: "virtual" },
      child.token,
    );
    assert.equal(response.status, 201);
  } finally {
    await db.course.update({
      where: { id: "pyra-first-solve" },
      data: { published: true },
    });
  }
  await db.consent.update({
    where: { childId: child.u.id },
    data: { status: "REVOKED" },
  });
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/checkpoint`,
        { version: 0 },
        child.token,
      )
    ).status,
    403,
  );
  await call("me", { confirmation: "DELETE" }, guardian.token, "DELETE");
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(
    await db.guidedSolve.count({ where: { userId: child.u.id } }),
    0,
  );
});

test("complete 4×4 virtual reduction verifies 32 phases, wide-turn undo and independent course credit", async () => {
  const owner = await fixture("four-guided-virtual", "1990-01-01");
  for (const path of [
    "progress/4-first-solve",
    "courses/4-first-solve/sessions",
  ])
    assert.equal(
      (
        await call(
          path,
          path.startsWith("progress") ? { moves: [] } : { input: "scan" },
          owner.token,
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await call(
        "tutor",
        {
          courseVersion: (
            await db.course.findUniqueOrThrow({
              where: { id: "4-first-solve" },
            })
          ).version,
          lessonId: "4-first-solve",
          locale: "en",
          moves: [],
          question: "why",
        },
        owner.token,
      )
    ).status,
    400,
  );
  const otherPuzzles = await Promise.all(
    ["2x2", "3x3", "pyraminx"].map((puzzle) =>
      call("first-solves", { puzzle, input: "virtual" }, owner.token),
    ),
  );
  let response = await call(
    "first-solves",
    { puzzle: "4x4", input: "virtual" },
    owner.token,
  );
  assert.equal(response.status, 201);
  let session = response.body as GuidedSolveView;
  assert.equal(session.puzzle, "4x4");
  assert.equal(session.total, 32);
  assert.equal(session.currentFaces.U.length, 16);
  assert.equal(
    (
      await call(
        "first-solves",
        { puzzle: "4x4", input: "virtual" },
        owner.token,
      )
    ).status,
    409,
  );
  for (const move of ["r", "M", "x", "2R", "Rww"])
    assert.equal(
      (
        await call(
          `first-solves/${session.id}/moves`,
          { version: session.version, moves: [move] },
          owner.token,
        )
      ).status,
      400,
    );
  assert.equal(
    (await call(`first-solves/${session.id}`, undefined, adultToken)).status,
    404,
  );
  assert.equal(
    (
      await call(
        `first-solves?puzzle=4x4&cursor=${otherPuzzles[0].body.id}`,
        undefined,
        owner.token,
      )
    ).status,
    404,
  );
  const history = (
    await call("first-solves?puzzle=4x4", undefined, owner.token)
  ).body;
  assert.deepEqual(
    history.active.map((r: any) => r.id),
    [session.id],
  );
  const initial = JSON.stringify(session.currentFaces);
  response = await call(
    `first-solves/${session.id}/moves`,
    { version: session.version, moves: ["Rw", "U2"] },
    owner.token,
  );
  assert.equal(response.status, 201);
  session = response.body;
  response = await call(
    `first-solves/${session.id}/reset`,
    { version: session.version },
    owner.token,
  );
  assert.equal(response.status, 201);
  session = response.body;
  assert.equal(JSON.stringify(session.currentFaces), initial);
  assert.equal(session.moveCount, 4);
  assert.deepEqual(session.stageMoves, []);
  for (let stage = 0; stage < 32; stage++) {
    assert.equal(session.stage, stage);
    const moves = session.step!.moves;
    for (let at = 0; at < moves.length; at += 100) {
      response = await call(
        `first-solves/${session.id}/moves`,
        { version: session.version, moves: moves.slice(at, at + 100) },
        owner.token,
      );
      assert.equal(response.status, 201);
      session = response.body;
    }
    assert.equal(
      guidedGoal(guidedState("4x4", session.currentFaces), session.step!),
      true,
    );
    if (stage === 31) {
      const finals = await Promise.all(
        [0, 1].map(() =>
          call(
            `first-solves/${session.id}/checkpoint`,
            { version: session.version },
            owner.token,
          ),
        ),
      );
      assert.deepEqual(finals.map((r) => r.status).sort(), [201, 409]);
      session = finals.find((r) => r.status === 201)!.body;
    } else {
      response = await call(
        `first-solves/${session.id}/checkpoint`,
        { version: session.version },
        owner.token,
      );
      assert.equal(response.status, 201);
      session = response.body;
    }
  }
  assert.equal(session.status, "COMPLETED");
  assert.equal(session.checkpoints.length, 32);
  assert.deepEqual(
    (await db.progress.findMany({ where: { userId: owner.u.id } })).map((p) => [
      p.lessonId,
      p.repetitions,
    ]),
    [["4-first-solve", 1]],
  );
  for (const other of otherPuzzles)
    assert.equal(
      (await call(`first-solves/${other.body.id}`, undefined, owner.token)).body
        .stage,
      0,
    );
  assert.equal(await db.attempt.count({ where: { userId: owner.u.id } }), 0);
});

test("4×4 physical guidance accepts legal parity, alternate routes, recovery and rotated reduced scans", async () => {
  const owner = await fixture("four-guided-physical", "1990-01-01");
  assert.equal(
    (
      await call(
        "first-solves",
        {
          puzzle: "4x4",
          input: "scan",
          faces: facelets(applyMoves(solvedCube(4), "x")),
        },
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "first-solves",
        { puzzle: "4x4", input: "scan", faces: facelets(solvedCube(3)) },
        owner.token,
      )
    ).status,
    400,
  );
  const invalid = solvedCube(4),
    wing = cubePieces(invalid).find((piece) => piece.length === 2)!;
  [wing[0].color, wing[1].color] = [wing[1].color, wing[0].color];
  assert.equal(
    (
      await call(
        "first-solves",
        { puzzle: "4x4", input: "scan", faces: facelets(invalid) },
        owner.token,
      )
    ).status,
    400,
  );
  const parity = solvedCube(4);
  for (const pair of cubePieces(parity).filter(
    (piece) =>
      piece.length === 2 &&
      piece.some((s) => s.color === "U") &&
      piece.some((s) => s.color === "R"),
  ))
    [pair[0].color, pair[1].color] = [pair[1].color, pair[0].color];
  let response = await call(
    "first-solves",
    { puzzle: "4x4", input: "scan", faces: facelets(parity) },
    owner.token,
  );
  assert.equal(response.status, 201);
  let session = response.body as GuidedSolveView;
  assert.equal(session.step!.moves.length, 2);
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/checkpoint`,
        { version: session.version },
        owner.token,
      )
    ).status,
    400,
  );
  let actual = practiceApply(
    guidedState("4x4", session.currentFaces),
    session.step!.moves,
  );
  response = await call(
    `first-solves/${session.id}/checkpoint`,
    { version: session.version, faces: guidedFacelets(actual) },
    owner.token,
  );
  assert.equal(response.status, 201);
  session = response.body;
  actual = practiceApply(guidedState("4x4", session.currentFaces), [
    ...session.step!.moves,
    "U",
  ]);
  response = await call(
    `first-solves/${session.id}/checkpoint`,
    { version: session.version, faces: guidedFacelets(actual) },
    owner.token,
  );
  assert.equal(response.status, 201);
  session = response.body;
  actual = practiceApply(actual, "Fw R'");
  response = await call(
    `first-solves/${session.id}/rescan`,
    { version: session.version, faces: guidedFacelets(actual) },
    owner.token,
  );
  assert.equal(response.status, 201);
  session = response.body;
  assert.equal(session.stage, 0);
  assert.equal(session.checkpoints.at(-1)!.kind, "RESCAN");
  assert.equal(await db.progress.count({ where: { userId: owner.u.id } }), 0);
  for (let stage = 0; stage < 32; stage++) {
    actual = practiceApply(
      guidedState("4x4", session.currentFaces),
      session.step!.moves,
    );
    if (stage === 19) actual = practiceApply(actual, "U");
    assert.ok(!isPyraminx(actual));
    if (stage >= 7)
      actual = applyMoves(actual, ["", "x", "y2", "z'"][stage % 4]);
    response = await call(
      `first-solves/${session.id}/checkpoint`,
      { version: session.version, faces: guidedFacelets(actual) },
      owner.token,
    );
    assert.equal(response.status, 201, `4×4 physical phase ${stage}`);
    session = response.body;
  }
  assert.equal(session.status, "COMPLETED");
  assert.equal(session.moveCount, 0);
  assert.equal(
    (
      await db.progress.findUniqueOrThrow({
        where: {
          userId_lessonId: { userId: owner.u.id, lessonId: "4-first-solve" },
        },
      })
    ).repetitions,
    1,
  );
  assert.ok(
    (await call("me/export", undefined, owner.token)).body.guidedSolves.some(
      (row: any) => row.id === session.id && row.puzzle === "4x4",
    ),
  );
});

test("4×4 guidance keeps guardian consent, course publication and child deletion enforced", async () => {
  const guardian = await fixture("four-guided-parent", "1980-01-01"),
    child = await fixture("four-guided-child", "2020-01-01", "USER", false);
  assert.equal(
    (
      await call(
        "first-solves",
        { puzzle: "4x4", input: "virtual" },
        child.token,
      )
    ).status,
    403,
  );
  await db.consent.create({
    data: {
      childId: child.u.id,
      guardianId: guardian.u.id,
      documentId: randomUUID(),
      status: "APPROVED",
      reviewerId: adminId,
    },
  });
  let response = await call(
    "first-solves",
    { puzzle: "4x4", input: "virtual" },
    child.token,
  );
  assert.equal(response.status, 201);
  const session = response.body;
  const activity = (
    await call(
      `guardian/children/${child.u.id}/activity`,
      undefined,
      guardian.token,
    )
  ).body;
  assert.equal(activity.guidedSolves[0].puzzle, "4x4");
  assert.equal(activity.guidedSolves[0].plan.steps.length, 32);
  await db.course.update({
    where: { id: "4-first-solve" },
    data: { published: false },
  });
  try {
    assert.equal(
      (
        await call(
          `first-solves/${session.id}/moves`,
          { version: 0, moves: ["Rw"] },
          child.token,
        )
      ).status,
      409,
    );
    response = await call(
      "first-solves",
      { puzzle: "3x3", input: "virtual" },
      child.token,
    );
    assert.equal(response.status, 201);
  } finally {
    await db.course.update({
      where: { id: "4-first-solve" },
      data: { published: true },
    });
  }
  await db.consent.update({
    where: { childId: child.u.id },
    data: { status: "REVOKED" },
  });
  assert.equal(
    (
      await call(
        `first-solves/${session.id}/checkpoint`,
        { version: 0 },
        child.token,
      )
    ).status,
    403,
  );
  await call("me", { confirmation: "DELETE" }, guardian.token, "DELETE");
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(
    await db.guidedSolve.count({ where: { userId: child.u.id } }),
    0,
  );
});

test("notification settings persist with optimistic revisions and cannot mute required categories", async () => {
  const owner = await fixture("notification-settings", "1990-01-01");
  assert.equal((await call("me/notification-settings")).status, 401);
  assert.equal(
    (
      await call(
        "me/notification-settings",
        undefined,
        owner.token,
        undefined,
        cnOrigin,
      )
    ).status,
    401,
  );
  const initial = await call(
    "me/notification-settings",
    undefined,
    owner.token,
  );
  assert.deepEqual(initial.body.settings, { connections: true, clubs: true });
  assert.deepEqual(initial.body.required, ["SYSTEM", "REVIEW"]);
  assert.equal(
    (
      await call(
        "me/notification-settings",
        {
          revision: initial.body.revision,
          settings: { connections: false, clubs: false, review: false },
        },
        owner.token,
        "PUT",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "me/notification-settings",
        {
          revision: initial.body.revision,
          settings: { connections: false, clubs: false },
          role: "ADMIN",
        },
        owner.token,
        "PUT",
      )
    ).status,
    400,
  );
  const results = await Promise.all([
    call(
      "me/notification-settings",
      {
        revision: initial.body.revision,
        settings: { connections: false, clubs: false },
      },
      owner.token,
      "PUT",
    ),
    call(
      "me/notification-settings",
      {
        revision: initial.body.revision,
        settings: { connections: false, clubs: false },
      },
      owner.token,
      "PUT",
    ),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const stored = await call("me/notification-settings", undefined, owner.token);
  assert.equal(stored.body.revision, initial.body.revision + 1);
  assert.deepEqual(stored.body.settings, { connections: false, clubs: false });
  const exported = await call("me/export", undefined, owner.token);
  assert.deepEqual(
    exported.body.profile.notificationSettings,
    stored.body.settings,
  );
  const response = await fetch(`${origin}/v1/me/notification-settings`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
});
test("notification keyset pages remain viewer/filter-bound after boundary deletion and cursor expiry", async () => {
  const owner = await fixture("notification-pages", "1990-01-01"),
    outsider = await fixture("notification-pages-other", "1990-01-01");
  const at = new Date(),
    ids = Array.from({ length: 45 }, () => randomUUID());
  await db.notification.createMany({
    data: ids.map((id) => ({
      id,
      userId: owner.u.id,
      category: "SYSTEM",
      title: "Generic synthetic update",
      body: "No private sender information",
      createdAt: at,
    })),
  });
  const first = await call("me/notifications", undefined, owner.token);
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 20);
  assert.equal(first.body.unreadCount, 45);
  assert.ok(first.body.nextCursor);
  assert.ok(
    first.body.items.every((n: any) => !("userId" in n) && !("targetId" in n)),
  );
  const cursor = first.body.nextCursor;
  assert.equal(
    (await call(`me/notifications?cursor=${cursor}`, undefined, outsider.token))
      .status,
    400,
  );
  assert.equal(
    (
      await call(
        `me/notifications?unread=true&cursor=${cursor}`,
        undefined,
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `me/notifications?category=REVIEW&cursor=${cursor}`,
        undefined,
        owner.token,
      )
    ).status,
    400,
  );
  const boundary = first.body.items.at(-1).id;
  assert.equal(
    (
      await call(
        `me/notifications/${boundary}`,
        undefined,
        owner.token,
        "DELETE",
      )
    ).status,
    200,
  );
  const second = await call(
    `me/notifications?cursor=${cursor}`,
    undefined,
    owner.token,
  );
  assert.equal(second.body.items.length, 20);
  const third = await call(
    `me/notifications?cursor=${second.body.nextCursor}`,
    undefined,
    owner.token,
  );
  assert.equal(third.body.items.length, 5);
  assert.equal(third.body.nextCursor, null);
  assert.equal(
    new Set(
      [...first.body.items, ...second.body.items, ...third.body.items].map(
        (n) => n.id,
      ),
    ).size,
    45,
  );
  await infrastructure.redis.del(`INTL:notification-cursor:${hash(cursor)}`);
  assert.equal(
    (await call(`me/notifications?cursor=${cursor}`, undefined, owner.token))
      .status,
    409,
  );
  assert.equal(
    (await call("me/notifications?limit=10000", undefined, owner.token)).status,
    400,
  );
});
test("notification read and dismissal are owner-only and invalid batches cannot partially mutate", async () => {
  const owner = await fixture("notification-read", "1990-01-01"),
    outsider = await fixture("notification-read-other", "1990-01-01");
  const own = await db.notification.create({
      data: {
        userId: owner.u.id,
        title: "Own generic status",
        body: "Check account",
      },
    }),
    foreign = await db.notification.create({
      data: {
        userId: outsider.u.id,
        title: "Other status",
        body: "Other account",
      },
    });
  assert.equal(
    (
      await call(
        "me/notifications/read",
        { ids: [own.id, foreign.id] },
        owner.token,
      )
    ).status,
    404,
  );
  assert.equal(
    (await db.notification.findUniqueOrThrow({ where: { id: own.id } })).read,
    false,
  );
  assert.equal(
    (
      await call(
        `me/notifications/${foreign.id}`,
        undefined,
        owner.token,
        "DELETE",
      )
    ).status,
    404,
  );
  const read = await call(
    "me/notifications/read",
    { ids: [own.id.toUpperCase(), own.id] },
    owner.token,
  );
  assert.equal(read.status, 201);
  assert.equal(read.body.unreadCount, 0);
  assert.equal(
    (await call("me/notifications/read", { ids: [own.id] }, owner.token))
      .status,
    201,
  );
  assert.equal(
    (await call("me/notifications?unread=true", undefined, owner.token)).body
      .items.length,
    0,
  );
  assert.equal(
    (await call(`me/notifications/${own.id}`, undefined, owner.token, "DELETE"))
      .status,
    200,
  );
  assert.ok(await db.notification.findUnique({ where: { id: foreign.id } }));
});
test("optional notification producers respect preferences while required reviews and pending-child account notices remain available", async () => {
  const alice = await fixture("notification-producer", "1990-01-01"),
    bob = await fixture("notification-producer-bob", "1990-01-01"),
    child = await fixture(
      "notification-pending-child",
      "2018-01-01",
      "USER",
      false,
    );
  const pref = (await call("me/notification-settings", undefined, alice.token))
    .body;
  await call(
    "me/notification-settings",
    { revision: pref.revision, settings: { connections: false, clubs: false } },
    alice.token,
    "PUT",
  );
  await connectionSettings(bob.token);
  assert.equal(
    (
      await call(
        "connections",
        { targetId: bob.u.id, kind: "FRIEND" },
        alice.token,
      )
    ).status,
    201,
  );
  assert.equal(
    await db.notification.count({
      where: { userId: alice.u.id, category: "CONNECTION" },
    }),
    0,
  );
  assert.ok(
    await db.notification.count({
      where: { userId: bob.u.id, category: "CONNECTION" },
    }),
  );
  await db.$transaction(async (tx) => {
    await notifyUser(
      tx,
      "INTL",
      alice.u.id,
      "CLUB",
      "Club status",
      "Generic update",
    );
    await notifyUser(
      tx,
      "INTL",
      alice.u.id,
      "REVIEW",
      "Review status",
      "Generic review",
    );
    await notifyUser(
      tx,
      "CN",
      alice.u.id,
      "SYSTEM",
      "Wrong region",
      "Must not be saved",
    );
    await notifyUser(
      tx,
      "INTL",
      child.u.id,
      "SYSTEM",
      "Account status",
      "Generic account notice",
    );
  });
  assert.equal(
    await db.notification.count({
      where: { userId: alice.u.id, category: "CLUB" },
    }),
    0,
  );
  const page = await call("me/notifications", undefined, alice.token);
  assert.deepEqual(
    page.body.items.map((n: any) => n.category),
    ["REVIEW"],
  );
  assert.deepEqual(
    (await call("me", undefined, alice.token)).body.notifications.map(
      (n: any) => n.category,
    ),
    ["REVIEW"],
  );
  assert.equal((await call("courses", undefined, child.token)).status, 403);
  assert.equal(
    (await call("me/notifications", undefined, child.token)).body.items[0]
      .category,
    "SYSTEM",
  );
  // A cursor issued before preferences change must not continue the old view.
  await db.notification.createMany({
    data: Array.from({ length: 21 }, () => ({
      userId: bob.u.id,
      title: "Generic",
      body: "Status",
    })),
  });
  const oldCursor = (await call("me/notifications", undefined, bob.token)).body
    .nextCursor;
  const bobPrefs = (
    await call("me/notification-settings", undefined, bob.token)
  ).body;
  await call(
    "me/notification-settings",
    {
      revision: bobPrefs.revision,
      settings: { connections: false, clubs: true },
    },
    bob.token,
    "PUT",
  );
  assert.equal(
    (await call(`me/notifications?cursor=${oldCursor}`, undefined, bob.token))
      .status,
    409,
  );
});
test("notification retention and account deletion remove old and owned inbox data", async () => {
  const owner = await fixture("notification-retention", "1990-01-01");
  const now = Date.now();
  await db.notification.createMany({
    data: [
      {
        userId: owner.u.id,
        title: "Read old",
        body: "Generic",
        read: true,
        createdAt: new Date(now - 40 * 86400000),
      },
      {
        userId: owner.u.id,
        title: "Unread retained",
        body: "Generic",
        createdAt: new Date(now - 40 * 86400000),
      },
      {
        userId: owner.u.id,
        title: "Unread expired",
        body: "Generic",
        createdAt: new Date(now - 100 * 86400000),
      },
    ],
  });
  const visible = await call("me/notifications", undefined, owner.token);
  assert.deepEqual(
    visible.body.items.map((n: any) => n.title),
    ["Unread retained"],
  );
  assert.equal(visible.body.unreadCount, 1);
  assert.deepEqual(
    (await call("me", undefined, owner.token)).body.notifications.map(
      (n: any) => n.title,
    ),
    ["Unread retained"],
  );
  await new Background(db as any, infrastructure).maintenance();
  assert.deepEqual(
    (await db.notification.findMany({ where: { userId: owner.u.id } })).map(
      (n) => n.title,
    ),
    ["Unread retained"],
  );
  assert.equal(
    (await call("me", { confirmation: "DELETE" }, owner.token, "DELETE"))
      .status,
    200,
  );
  assert.equal(
    (await call("me/notifications", undefined, owner.token)).status,
    401,
  );
  await new Background(db as any, infrastructure).maintenance();
  assert.equal(
    await db.notification.count({ where: { userId: owner.u.id } }),
    0,
  );
});

test("private session statistics use named time zones, exclude other owners and non-solve results, and expose no telemetry", async () => {
  const owner = await fixture("session-statistics", "1990-01-01"),
    other = await fixture("session-statistics-other", "1990-01-01");
  async function record(
    userId: string,
    at: string,
    input = "virtual",
    status = "APPROVED",
    mode = "race",
    durationMs = 10000,
  ) {
    const room = await db.room.create({
      data: {
        ownerId: userId,
        code: opaque(),
        puzzle: "3x3",
        input,
        mode,
        ranked: false,
        private: true,
      },
    });
    return db.attempt.create({
      data: {
        userId,
        roomId: room.id,
        nonce: opaque(),
        scramble: ["R"],
        status,
        durationMs,
        createdAt: new Date(at),
        startedAt: new Date(at),
        finishedAt: new Date(Date.parse(at) + durationMs),
        moves: [{ sequence: 0, move: "R'", elapsedMs: 100 }],
      },
    });
  }
  await record(owner.u.id, "2026-10-16T15:59:50Z");
  await record(owner.u.id, "2026-10-16T16:01:00Z", "scan");
  await record(owner.u.id, "2026-10-16T17:01:00Z");
  await record(owner.u.id, "2026-10-16T17:02:00Z", "virtual", "REJECTED");
  await record(
    owner.u.id,
    "2026-10-16T17:03:00Z",
    "virtual",
    "APPROVED",
    "pattern",
  );
  await record(owner.u.id, "2026-10-16T17:04:00Z", "virtual", "PROVISIONAL");
  await record(
    owner.u.id,
    "2026-10-16T17:05:00Z",
    "virtual",
    "APPROVED",
    "race",
    0,
  );
  await record(other.u.id, "2026-10-16T17:02:00Z");
  assert.equal((await call("me/session-statistics")).status, 401);
  assert.equal(
    (
      await call(
        "me/session-statistics?timeZone=UTC&userId=" + other.u.id,
        undefined,
        owner.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "me/session-statistics?timeZone=Mars%2FCity",
        undefined,
        owner.token,
      )
    ).status,
    400,
  );
  const result = await call(
    "me/session-statistics?timeZone=Asia%2FShanghai",
    undefined,
    owner.token,
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.window.solves, 3);
  assert.equal(result.body.window.estimatedStarts, 0);
  assert.equal(result.body.timeZone, "Asia/Shanghai");
  assert.deepEqual(
    result.body.sessions.map((s: any) => s.solves),
    [1, 2],
  );
  assert.deepEqual(
    result.body.days.map((d: any) => [d.day, d.solves]),
    [
      ["2026-10-17", 2],
      ["2026-10-16", 1],
    ],
  );
  const raw = JSON.stringify(result.body);
  for (const field of [
    owner.u.id,
    other.u.id,
    '"scramble"',
    '"moves"',
    '"nonce"',
    '"evidenceId"',
    '"turnsPerSecond"',
  ])
    assert.equal(raw.includes(field), false);
  assert.equal(
    (
      await call(
        "me/session-statistics",
        undefined,
        owner.token,
        undefined,
        cnOrigin,
      )
    ).status,
    401,
  );
  const response = await fetch(
    `${origin}/v1/me/session-statistics?timeZone=UTC`,
    { headers: { Authorization: `Bearer ${owner.token}` } },
  );
  assert.match(
    response.headers.get("cache-control") || "",
    /private.*no-store/,
  );
  assert.equal((await response.json()).days.length, 1);
});

test("session statistics bound database history to one thousand solves without returning raw attempts", async () => {
  const owner = await fixture("session-statistics-window", "1990-01-01");
  const ids = Array.from({ length: 1001 }, () => randomUUID());
  await db.room.createMany({
    data: ids.map((id) => ({
      id,
      ownerId: owner.u.id,
      code: opaque(),
      puzzle: "2x2",
      input: "virtual",
      mode: "daily",
      ranked: false,
      private: true,
    })),
  });
  await db.attempt.createMany({
    data: ids.map((id, i) => ({
      userId: owner.u.id,
      roomId: id,
      nonce: opaque(),
      scramble: [],
      status: "APPROVED",
      durationMs: 1000,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      startedAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      finishedAt: new Date(Date.UTC(2026, 0, 1, 0, i, 1)),
    })),
  });
  const result = await call("me/session-statistics", undefined, owner.token);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.window, {
    solves: 1000,
    limit: 1000,
    hasEarlier: true,
    estimatedStarts: 0,
  });
  assert.equal(result.body.sessions.length, 1);
  assert.equal(result.body.sessions[0].solves, 1000);
  assert.equal(result.body.sessions[0].mayIncludeEarlierSolves, true);
  assert.equal(result.body.sessions[0].categories[0].bestMs, 1000);
  await db.user.delete({ where: { id: owner.u.id } });
  assert.equal(
    (await call("me/session-statistics", undefined, owner.token)).status,
    401,
  );
});

test("owner-only virtual replays validate all puzzles without exposing private attempt fields or granting progress", async () => {
  const owner = await fixture("replays-owner", "1990-01-01"),
    other = await fixture("replays-other", "1990-01-01"),
    pending = await fixture("replays-pending", "2019-01-01");
  let firstId = "";
  for (const [puzzle, scramble] of [
    ["2x2", ["R", "U2", "F'"]],
    ["3x3", ["R", "U2", "M'"]],
    ["4x4", ["Rw", "U", "Fw'"]],
    ["pyraminx", ["R", "u", "B", "l'"]],
  ] as ["2x2" | "3x3" | "4x4" | "pyraminx", string[]][]) {
    const moves =
      puzzle === "pyraminx" ? pyraminxInverse(scramble) : inverse(scramble);
    const room = await db.room.create({
      data: {
        ownerId: owner.u.id,
        code: opaque(),
        puzzle,
        input: "virtual",
        mode: "race",
        ranked: false,
        private: true,
      },
    });
    const attempt = await db.attempt.create({
      data: {
        userId: owner.u.id,
        roomId: room.id,
        nonce: opaque(),
        scramble,
        status: "APPROVED",
        durationMs: 1000,
        moves: moves.map((move, sequence) => ({
          move,
          sequence,
          elapsedMs: sequence * 50,
        })),
      },
    });
    firstId ||= attempt.id;
    const result = await call(
      `me/replays/${attempt.id}`,
      undefined,
      owner.token,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.puzzle, puzzle);
    assert.deepEqual(result.body.moves, moves);
    assert.deepEqual(result.body.scramble, scramble);
    for (const key of [
      "nonce",
      "userId",
      "roomId",
      "evidenceId",
      "events",
      "reviewerId",
      "reason",
    ])
      assert.equal(key in result.body, false);
    assert.equal(
      practiceSolved(
        practiceApply(
          practiceApply(solvedPuzzle(puzzle), result.body.scramble),
          result.body.moves,
        ),
      ),
      true,
    );
    assert.equal(
      (await call(`me/replays/${attempt.id}`, undefined, other.token)).status,
      404,
    );
    const history = await call(
      `me/history?puzzle=${puzzle}&input=virtual`,
      undefined,
      owner.token,
    );
    assert.equal(history.body.items[0].replayAvailable, true);
  }
  assert.equal((await call(`me/replays/${firstId}`)).status, 401);
  assert.equal(
    (await call("me/replays/not-a-uuid", undefined, owner.token)).status,
    400,
  );
  assert.equal(
    (
      await call(
        `me/replays/${firstId}`,
        undefined,
        owner.token,
        undefined,
        cnOrigin,
      )
    ).status,
    401,
  );
  assert.equal(
    (await call(`me/replays/${firstId}`, undefined, pending.token)).status,
    403,
  );
  const response = await fetch(`${origin}/v1/me/replays/${firstId}`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.match(
    response.headers.get("cache-control") || "",
    /private.*no-store/,
  );
  assert.equal((await call("progress", undefined, owner.token)).body.length, 0);
  await db.user.delete({ where: { id: owner.u.id } });
  assert.equal(
    (await call(`me/replays/${firstId}`, undefined, owner.token)).status,
    401,
  );
});

test("saved replays reject physical, rejected, provisional, non-solve and corrupted histories", async () => {
  const owner = await fixture("replay-invalid", "1990-01-01");
  for (const [input, status, mode, moves] of [
    ["scan", "APPROVED", "race", []],
    ["smart", "APPROVED", "race", []],
    ["virtual", "REJECTED", "race", []],
    ["virtual", "PROVISIONAL", "race", []],
    ["virtual", "APPROVED", "pattern", []],
    [
      "virtual",
      "APPROVED",
      "race",
      [{ move: "R'", sequence: 2, elapsedMs: 1 }],
    ],
    ["virtual", "APPROVED", "race", [{ move: "U", sequence: 0, elapsedMs: 1 }]],
  ] as [string, string, string, any[]][]) {
    const room = await db.room.create({
      data: {
        ownerId: owner.u.id,
        code: opaque(),
        puzzle: "3x3",
        input,
        mode,
        ranked: false,
        private: true,
      },
    });
    const attempt = await db.attempt.create({
      data: {
        userId: owner.u.id,
        roomId: room.id,
        nonce: opaque(),
        scramble: ["R"],
        status,
        durationMs: 1000,
        moves,
      },
    });
    const invalidStream =
      input === "virtual" && status === "APPROVED" && mode === "race";
    assert.equal(
      (await call(`me/replays/${attempt.id}`, undefined, owner.token)).status,
      invalidStream ? 409 : 404,
    );
  }
});

test("replay workers bound admission, survive interruption and reject stale shutdown work", async () => {
  const { Replays } = await import("../../apps/api/dist/replays");
  const service = new Replays();
  const source = {
    attemptId: randomUUID(),
    puzzle: "4x4",
    input: "virtual",
    mode: "race",
    durationMs: 10000,
    createdAt: new Date().toISOString(),
    scramble: [],
    events: Array.from({ length: 10000 }, (_, sequence) => ({
      sequence,
      move: sequence % 2 ? "Rw'" : "Rw",
      elapsedMs: sequence,
    })),
  };
  try {
    const jobs = Array.from({ length: 5 }, () => service.validate(source));
    const settled = await Promise.allSettled(jobs);
    assert.equal(settled.filter((x) => x.status === "fulfilled").length, 4);
    assert.equal(settled.filter((x) => x.status === "rejected").length, 1);
    const interrupted = service.validate(source),
      checked = assert.rejects(() => interrupted, /interrupted/);
    await (service as any).worker.terminate();
    await checked;
    assert.equal((await service.validate(source)).moves.length, 10000);
    // Simulate a worker that accepts a message but never answers.
    (service as any).worker.postMessage = () => {};
    await assert.rejects(service.validate(source), /timed out/);
    assert.equal((await service.validate(source)).moves.length, 10000);
    const pending = Array.from({ length: 4 }, () => service.validate(source));
    const stopped = Promise.allSettled(pending);
    await service.onModuleDestroy();
    assert.equal(
      (await stopped).every((result) => result.status === "rejected"),
      true,
    );
  } finally {
    await service.onModuleDestroy();
  }
  await assert.rejects(service.validate(source), /busy/);
});

test("replay reads recheck status, session and guardian learning permission after asynchronous validation", async () => {
  const { ProfileController } =
    await import("../../apps/api/src/profile.controller");
  const { accountPolicy } = await import("../../apps/api/src/security");
  const { validatedReplay } = await import("@cubers/core");
  for (const change of ["status", "session", "consent"] as const) {
    const child = await securityChild(`replay-late-${change}`);
    const user = await db.user.findUniqueOrThrow({
      where: { id: child.child.u.id },
    });
    const session = await db.session.findUniqueOrThrow({
      where: { tokenHash: hash(child.child.token) },
    });
    const room = await db.room.create({
      data: {
        ownerId: user.id,
        code: opaque(),
        puzzle: "3x3",
        input: "virtual",
        mode: "race",
        ranked: false,
        private: true,
      },
    });
    const attempt = await db.attempt.create({
      data: {
        userId: user.id,
        roomId: room.id,
        nonce: opaque(),
        scramble: ["R"],
        status: "APPROVED",
        durationMs: 1000,
        moves: [{ move: "R'", sequence: 0, elapsedMs: 100 }],
      },
    });
    const request = {
      user,
      policy: await accountPolicy(db as any, user),
      sessionId: session.id,
    } as any;
    const controller = new ProfileController(db as any, infrastructure, {
      validate: async (source: unknown) => {
        const packet = validatedReplay(source);
        if (change === "status")
          await db.attempt.update({
            where: { id: attempt.id },
            data: { status: "REJECTED" },
          });
        if (change === "session")
          await db.session.delete({ where: { id: session.id } });
        if (change === "consent")
          await db.consent.updateMany({
            where: { childId: user.id },
            data: { status: "REVOKED" },
          });
        return packet;
      },
    } as any);
    await assert.rejects(
      controller.replay(request, attempt.id),
      (error: any) => error.getStatus() === (change === "status" ? 404 : 403),
    );
  }
});

test("achievement cards release only owned earned anonymous images and keep previews visibly separate", async () => {
  const owner = await fixture("card-owner", "1990-01-01"),
    other = await fixture("card-other", "1990-01-01");
  const body = {
    achievementId: "first-checkpoint",
    locale: "zh",
    includeName: false,
    disclosureConfirmed: true,
  };
  assert.equal(
    (await call("me/achievement-cards", body, owner.token)).status,
    400,
  );
  await db.progress.create({
    data: {
      userId: owner.u.id,
      lessonId: "3-notation",
      completed: true,
      repetitions: 1,
    },
  });
  assert.equal(
    (await call("me/achievement-cards", { ...body, score: 123 }, owner.token))
      .status,
    400,
  );
  const prepared = await call("me/achievement-cards", body, owner.token);
  assert.equal(prepared.status, 201);
  const card = prepared.body;
  assert.equal(card.status, "READY");
  assert.equal(card.namedLabel, null);
  const preview = await call(
    `me/achievement-cards/${card.id}/preview`,
    {},
    owner.token,
  );
  assert.equal(preview.status, 201);
  assert.equal(preview.body.watermarked, true);
  assert.equal(preview.body.approvalDigest, card.imageDigest);
  assert.notEqual(preview.body.imageDigest, card.imageDigest);
  assert.equal(
    (await call(`me/achievement-cards/${card.id}/preview`, {}, other.token))
      .status,
    404,
  );
  const consent = {
    revision: card.revision,
    imageDigest: card.imageDigest,
    disclosureConfirmed: true,
  };
  assert.equal(
    (
      await call(
        `me/achievement-cards/${card.id}/export`,
        { ...consent, imageDigest: "a".repeat(64) },
        owner.token,
      )
    ).status,
    409,
  );
  const exported = await call(
    `me/achievement-cards/${card.id}/export`,
    consent,
    owner.token,
  );
  assert.equal(exported.status, 201);
  assert.equal(exported.body.watermarked, false);
  assert.equal(exported.body.imageDigest, card.imageDigest);
  const png = Buffer.from(exported.body.base64, "base64"),
    metadata = await sharp(png).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 1500);
  assert.equal(metadata.exif, undefined);
  assert.equal(exported.body.filename, "cubers-milestone.png");
  const data = (await call("me/export", undefined, owner.token)).body
    .achievementCards;
  assert.equal(data.length, 1);
  assert.equal("reviewerId" in data[0], false);
  assert.equal("guardianId" in data[0], false);
  await call(`me/achievement-cards/${card.id}/cancel`, {}, owner.token);
  assert.equal(
    (await call(`me/achievement-cards/${card.id}/export`, consent, owner.token))
      .status,
    409,
  );
  const response = await fetch(`${origin}/v1/me/achievement-cards/requests`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.match(
    response.headers.get("cache-control") || "",
    /private.*no-store/,
  );
  assert.equal(
    (
      await call(
        "me/achievement-cards",
        undefined,
        owner.token,
        undefined,
        cnOrigin,
      )
    ).status,
    401,
  );
  await db.user.delete({ where: { id: owner.u.id } });
  assert.equal(
    await db.achievementCard.count({ where: { userId: owner.u.id } }),
    0,
  );
});

test("child achievement images need current guardian plus independent MFA review; teens remain anonymous with content review", async () => {
  const { guardian, child, consent } = await securityChild("card-child"),
    stranger = await fixture("card-stranger", "1990-01-01"),
    moderator = await fixture("card-reviewer", "1990-01-01", "ADMIN");
  await db.progress.create({
    data: {
      userId: child.u.id,
      lessonId: "3-notation",
      completed: true,
      repetitions: 1,
    },
  });
  const body = {
    achievementId: "first-checkpoint",
    locale: "en",
    includeName: false,
    disclosureConfirmed: true,
  };
  assert.equal(
    (
      await call(
        "me/achievement-cards",
        { ...body, includeName: true },
        child.token,
      )
    ).status,
    400,
  );
  const card = (await call("me/achievement-cards", body, child.token)).body;
  assert.equal(card.status, "PENDING_GUARDIAN");
  const exportBody = {
    revision: card.revision,
    imageDigest: card.imageDigest,
    disclosureConfirmed: true,
  };
  assert.equal(
    (
      await call(
        `me/achievement-cards/${card.id}/export`,
        exportBody,
        child.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        `guardian/achievement-cards/${card.id}/preview`,
        {},
        stranger.token,
      )
    ).status,
    404,
  );
  const preview = await call(
    `guardian/achievement-cards/${card.id}/preview`,
    {},
    guardian.token,
  );
  assert.equal(preview.status, 201);
  assert.equal(preview.body.watermarked, false);
  assert.equal(preview.body.imageDigest, card.imageDigest);
  const approval = {
    revision: card.revision,
    imageDigest: card.imageDigest,
    approve: true,
    imageChecked: true,
    reason: "",
  };
  assert.equal(
    (
      await call(
        `guardian/achievement-cards/${card.id}/review`,
        { ...approval, imageChecked: false },
        guardian.token,
      )
    ).status,
    400,
  );
  const parent = await call(
    `guardian/achievement-cards/${card.id}/review`,
    approval,
    guardian.token,
  );
  assert.equal(parent.status, 201);
  assert.equal(parent.body.status, "PENDING_REVIEW");
  assert.equal(
    (
      await call(
        `admin/achievement-cards/${card.id}/review`,
        { ...approval, revision: parent.body.revision },
        stranger.token,
      )
    ).status,
    403,
  );
  await db.user.update({
    where: { id: guardian.u.id },
    data: { role: "ADMIN", mfaSecret: authenticator.generateSecret() },
  });
  await db.session.updateMany({
    where: { userId: guardian.u.id },
    data: { mfaVerified: true },
  });
  assert.equal(
    (
      await call(
        `admin/achievement-cards/${card.id}/review`,
        { ...approval, revision: parent.body.revision },
        guardian.token,
      )
    ).status,
    403,
  );
  const approved = await call(
    `admin/achievement-cards/${card.id}/review`,
    { ...approval, revision: parent.body.revision },
    moderator.token,
  );
  assert.equal(approved.status, 201);
  assert.equal(approved.body.status, "READY");
  const bound = { ...exportBody, revision: approved.body.revision };
  assert.equal(
    (await call(`me/achievement-cards/${card.id}/export`, bound, child.token))
      .status,
    201,
  );
  await db.consent.update({
    where: { id: consent.id },
    data: { status: "REVOKED" },
  });
  assert.equal(
    (await call(`me/achievement-cards/${card.id}/export`, bound, child.token))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        `guardian/achievement-cards/${card.id}/preview`,
        {},
        guardian.token,
      )
    ).status,
    404,
  );
  const teen = await fixture("card-teen", "2011-01-01", "USER", false);
  await db.progress.create({
    data: {
      userId: teen.u.id,
      lessonId: "3-notation",
      completed: true,
      repetitions: 1,
    },
  });
  const teenCard = (await call("me/achievement-cards", body, teen.token)).body;
  assert.equal(teenCard.status, "PENDING_REVIEW");
  assert.equal(teenCard.namedLabel, null);
  assert.equal(
    (
      await call(
        "me/achievement-cards",
        { ...body, includeName: true },
        teen.token,
      )
    ).status,
    400,
  );
});

test("named card approvals are image/revision-bound and withdraw on identity, achievement or expiry changes", async () => {
  const owner = await fixture("card-named", "1990-01-01", "ADMIN"),
    reviewer = await fixture("card-named-reviewer", "1990-01-01", "ADMIN");
  await db.progress.create({
    data: {
      userId: owner.u.id,
      lessonId: "3-notation",
      completed: true,
      repetitions: 1,
    },
  });
  const body = {
    achievementId: "first-checkpoint",
    locale: "zh",
    includeName: true,
    disclosureConfirmed: true,
  };
  const card = (await call("me/achievement-cards", body, owner.token)).body;
  assert.equal(card.status, "PENDING_REVIEW");
  assert.equal(card.namedLabel, owner.u.displayName);
  const approval = {
    revision: card.revision,
    imageDigest: card.imageDigest,
    approve: true,
    imageChecked: true,
    reason: "",
  };
  assert.equal(
    (
      await call(
        `admin/achievement-cards/${card.id}/review`,
        approval,
        owner.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `admin/achievement-cards/${card.id}/review`,
        { ...approval, revision: 99 },
        reviewer.token,
      )
    ).status,
    409,
  );
  const ready = (
    await call(
      `admin/achievement-cards/${card.id}/review`,
      approval,
      reviewer.token,
    )
  ).body;
  assert.equal(ready.status, "READY");
  const exportBody = {
    revision: ready.revision,
    imageDigest: ready.imageDigest,
    disclosureConfirmed: true,
  };
  assert.equal(
    (
      await call(
        `me/achievement-cards/${card.id}/export`,
        exportBody,
        owner.token,
      )
    ).status,
    201,
  );
  await db.user.update({
    where: { id: owner.u.id },
    data: {
      profileRevision: { increment: 1 },
      displayName: "Changed identity",
    },
  });
  assert.equal(
    (
      await call(
        `me/achievement-cards/${card.id}/export`,
        exportBody,
        owner.token,
      )
    ).status,
    409,
  );
  const anonymous = (
    await call(
      "me/achievement-cards",
      { ...body, includeName: false },
      owner.token,
    )
  ).body;
  const anonymousExport = {
    revision: anonymous.revision,
    imageDigest: anonymous.imageDigest,
    disclosureConfirmed: true,
  };
  await db.achievementCard.update({
    where: { id: anonymous.id },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  assert.equal(
    (
      await call(
        `me/achievement-cards/${anonymous.id}/export`,
        anonymousExport,
        owner.token,
      )
    ).status,
    409,
  );
  await db.progress.deleteMany({ where: { userId: owner.u.id } });
  assert.equal(
    (
      await call(
        "me/achievement-cards",
        { ...body, includeName: false },
        owner.token,
      )
    ).status,
    400,
  );
  await db.achievementCard.updateMany({
    where: { userId: owner.u.id },
    data: { createdAt: new Date(Date.now() - 31 * 86400000) },
  });
  const audit = await db.audit.findFirstOrThrow({
    where: { targetId: card.id, action: "card.review" },
  });
  const background = new Background(db as any, infrastructure);
  await background.maintenance();
  assert.equal(
    await db.achievementCard.count({ where: { userId: owner.u.id } }),
    0,
  );
  const redacted = await db.audit.findUniqueOrThrow({
    where: { id: audit.id },
  });
  assert.equal(redacted.targetId, "expired-card");
  assert.deepEqual(redacted.detail, { redacted: true });
});

test("achievement-card histories page tied dates with ownership boundaries and active caps survive quota loss", async () => {
  const owner = await fixture("card-pages", "1990-01-01"),
    outsider = await fixture("card-pages-other", "1990-01-01");
  const ids = Array.from({ length: 45 }, () => randomUUID()),
    at = new Date();
  await db.achievementCard.createMany({
    data: ids.map((id) => ({
      id,
      userId: owner.u.id,
      achievementId: "first-checkpoint",
      locale: "en",
      imageDigest: "a".repeat(64),
      status: "REJECTED",
      createdAt: at,
      expiresAt: new Date(Date.now() + 86400000),
    })),
  });
  const first = await call(
    "me/achievement-cards/requests",
    undefined,
    owner.token,
  );
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 30);
  assert.deepEqual(
    first.body.items.map((row: any) => row.id),
    [...ids].sort().reverse().slice(0, 30),
  );
  assert.equal(
    (
      await call(
        `me/achievement-cards/requests?cursor=${first.body.nextCursor}`,
        undefined,
        outsider.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        `me/achievement-cards/requests?userId=${owner.u.id}`,
        undefined,
        outsider.token,
      )
    ).status,
    400,
  );
  const second = await call(
    `me/achievement-cards/requests?cursor=${first.body.nextCursor}`,
    undefined,
    owner.token,
  );
  assert.equal(second.body.items.length, 15);
  assert.equal(second.body.nextCursor, null);
  assert.equal(
    new Set(
      [...first.body.items, ...second.body.items].map((row: any) => row.id),
    ).size,
    45,
  );
  await db.achievementCard.delete({ where: { id: first.body.nextCursor } });
  assert.equal(
    (
      await call(
        `me/achievement-cards/requests?cursor=${first.body.nextCursor}`,
        undefined,
        owner.token,
      )
    ).status,
    409,
  );
  const quota = await fixture("card-quota", "1990-01-01");
  await db.progress.create({
    data: {
      userId: quota.u.id,
      lessonId: "3-notation",
      completed: true,
      repetitions: 1,
    },
  });
  const body = {
    achievementId: "first-checkpoint",
    locale: "en",
    includeName: false,
    disclosureConfirmed: true,
  };
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await call("me/achievement-cards", body, quota.token)).status,
      201,
    );
  assert.equal(
    (await call("me/achievement-cards", body, quota.token)).status,
    429,
  );
  await infrastructure.redis.del(`INTL:card-prepare:${quota.u.id}`);
  assert.equal(
    (await call("me/achievement-cards", body, quota.token)).status,
    400,
  );
  assert.equal(
    await db.achievementCard.count({ where: { userId: quota.u.id } }),
    10,
  );
});

test("card review conflicts, prohibited self inspection and guardian/operator withdrawal stop future clean exports", async () => {
  const owner = await fixture("card-withdraw-owner", "1990-01-01", "ADMIN"),
    reviewer = await fixture("card-withdraw-reviewer", "1990-01-01", "ADMIN");
  await db.progress.create({
    data: {
      userId: owner.u.id,
      lessonId: "3-notation",
      completed: true,
      repetitions: 1,
    },
  });
  const card = (
    await call(
      "me/achievement-cards",
      {
        achievementId: "first-checkpoint",
        locale: "en",
        includeName: true,
        disclosureConfirmed: true,
      },
      owner.token,
    )
  ).body;
  assert.equal(
    (await call(`admin/achievement-cards/${card.id}/preview`, {}, owner.token))
      .status,
    403,
  );
  const preview = await call(
    `admin/achievement-cards/${card.id}/preview`,
    {},
    reviewer.token,
  );
  assert.equal(preview.status, 201);
  assert.equal(preview.body.imageDigest, card.imageDigest);
  const approval = {
    revision: card.revision,
    imageDigest: card.imageDigest,
    approve: true,
    imageChecked: true,
    reason: "",
  };
  const outcomes = await Promise.all([
    call(`admin/achievement-cards/${card.id}/review`, approval, reviewer.token),
    call(`admin/achievement-cards/${card.id}/review`, approval, reviewer.token),
  ]);
  assert.deepEqual(outcomes.map((result) => result.status).sort(), [201, 409]);
  const ready = outcomes.find((result) => result.status === 201)!.body;
  const exportBody = {
    revision: ready.revision,
    imageDigest: ready.imageDigest,
    disclosureConfirmed: true,
  };
  assert.equal(
    (
      await call(
        `me/achievement-cards/${card.id}/export`,
        exportBody,
        owner.token,
      )
    ).status,
    201,
  );
  await db.user.update({
    where: { id: owner.u.id },
    data: { profileStatus: "REMOVED" },
  });
  assert.equal(
    (
      await call(
        `me/achievement-cards/${card.id}/export`,
        exportBody,
        owner.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (await call("me/achievement-cards", undefined, owner.token)).body
      .namedCardsAvailable,
    false,
  );
  assert.equal(
    (
      await call(
        "me/achievement-cards",
        {
          achievementId: "first-checkpoint",
          locale: "en",
          includeName: true,
          disclosureConfirmed: true,
        },
        owner.token,
      )
    ).status,
    400,
  );
  await db.user.update({
    where: { id: owner.u.id },
    data: { profileStatus: "DRAFT" },
  });
  const detail = await call(
    `admin/achievement-cards/${card.id}`,
    undefined,
    reviewer.token,
  );
  assert.equal(detail.status, 200);
  assert.equal(detail.body.status, "READY");
  assert.equal(
    (
      await call(
        `admin/achievement-cards/${card.id}/review`,
        {
          ...approval,
          revision: ready.revision,
          approve: false,
          imageChecked: false,
          reason: "Synthetic permission withdrawal",
        },
        reviewer.token,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await call(
        `me/achievement-cards/${card.id}/export`,
        exportBody,
        owner.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        `admin/achievement-cards/${card.id}/preview`,
        {},
        reviewer.token,
      )
    ).status,
    409,
  );
  const { guardian, child } = await securityChild("card-parent-withdraw");
  await db.progress.create({
    data: {
      userId: child.u.id,
      lessonId: "3-notation",
      completed: true,
      repetitions: 1,
    },
  });
  const childCard = (
    await call(
      "me/achievement-cards",
      {
        achievementId: "first-checkpoint",
        locale: "zh",
        includeName: false,
        disclosureConfirmed: true,
      },
      child.token,
    )
  ).body;
  const childApproval = {
    revision: childCard.revision,
    imageDigest: childCard.imageDigest,
    approve: true,
    imageChecked: true,
    reason: "",
  };
  const parentApproved = (
    await call(
      `guardian/achievement-cards/${childCard.id}/review`,
      childApproval,
      guardian.token,
    )
  ).body;
  const childReady = (
    await call(
      `admin/achievement-cards/${childCard.id}/review`,
      { ...childApproval, revision: parentApproved.revision },
      reviewer.token,
    )
  ).body;
  assert.equal(childReady.status, "READY");
  const list = await call(
    "guardian/achievement-cards",
    undefined,
    guardian.token,
  );
  assert.ok(
    list.body.items.some(
      (row: any) => row.id === childReady.id && row.status === "READY",
    ),
  );
  const activity = await call(
    `guardian/children/${child.u.id}/activity`,
    undefined,
    guardian.token,
  );
  assert.ok(
    activity.body.achievementCards.some((row: any) => row.id === childReady.id),
  );
  assert.equal("reviewerId" in activity.body.achievementCards[0], false);
  const withdrawn = await call(
    `guardian/achievement-cards/${childReady.id}/review`,
    {
      ...childApproval,
      revision: childReady.revision,
      approve: false,
      imageChecked: false,
      reason: "Guardian withdrew this image",
    },
    guardian.token,
  );
  assert.equal(withdrawn.status, 201);
  assert.equal(withdrawn.body.status, "REJECTED");
  assert.equal(
    (
      await call(
        `me/achievement-cards/${childReady.id}/export`,
        {
          revision: childReady.revision,
          imageDigest: childReady.imageDigest,
          disclosureConfirmed: true,
        },
        child.token,
      )
    ).status,
    409,
  );
});

test("image rendering revalidates sessions, approvals, identity, consent and reviewer MFA before returning PNG data", async () => {
  const { AchievementCards } =
    await import("../../apps/api/src/achievement-cards");
  const { Profiles } = await import("../../apps/api/src/profiles");
  const { Connections } = await import("../../apps/api/src/connections");
  const { accountPolicy } = await import("../../apps/api/src/security");
  const { renderAchievementCard } =
    await import("../../apps/api/src/achievement-card-image");
  const reviewer = await fixture("card-race-reviewer", "1990-01-01", "ADMIN");
  for (const change of [
    "session",
    "achievement",
    "cancel",
    "expiry",
    "identity",
    "consent",
    "reviewer",
  ] as const) {
    const family =
      change === "consent" ? await securityChild("card-race-consent") : null;
    const owner =
      family?.child ||
      (await fixture(`card-race-subject-${change}`, "1990-01-01"));
    await db.progress.create({
      data: {
        userId: owner.u.id,
        lessonId: "3-notation",
        completed: true,
        repetitions: 1,
      },
    });
    const named = change === "identity" || change === "reviewer";
    let card = (
      await call(
        "me/achievement-cards",
        {
          achievementId: "first-checkpoint",
          locale: "en",
          includeName: named,
          disclosureConfirmed: true,
        },
        owner.token,
      )
    ).body;
    const approve = (revision: number) => ({
      revision,
      imageDigest: card.imageDigest,
      approve: true,
      imageChecked: true,
      reason: "",
    });
    if (family)
      card = (
        await call(
          `guardian/achievement-cards/${card.id}/review`,
          approve(card.revision),
          family.guardian.token,
        )
      ).body;
    if (card.status === "PENDING_REVIEW" && change !== "reviewer")
      card = (
        await call(
          `admin/achievement-cards/${card.id}/review`,
          approve(card.revision),
          reviewer.token,
        )
      ).body;
    const actor = change === "reviewer" ? reviewer : owner;
    const session = await db.session.findUniqueOrThrow({
      where: { tokenHash: hash(actor.token) },
    });
    const user = await db.user.findUniqueOrThrow({ where: { id: actor.u.id } });
    const request = {
      user,
      sessionId: session.id,
      policy: await accountPolicy(db as any, user),
    } as any;
    const service = new AchievementCards(
      db as any,
      infrastructure,
      new Profiles(
        db as any,
        infrastructure,
        new Connections(db as any, infrastructure),
      ),
    );
    (service as any).renderer = async (
      ...args: Parameters<typeof renderAchievementCard>
    ) => {
      const result = await renderAchievementCard(...args);
      if (change === "session")
        await db.session.delete({ where: { id: session.id } });
      if (change === "achievement")
        await db.progress.deleteMany({ where: { userId: owner.u.id } });
      if (change === "cancel")
        await db.achievementCard.update({
          where: { id: card.id },
          data: { status: "CANCELLED", revision: { increment: 1 } },
        });
      if (change === "expiry")
        await db.achievementCard.update({
          where: { id: card.id },
          data: { expiresAt: new Date(Date.now() - 1) },
        });
      if (change === "identity")
        await db.user.update({
          where: { id: owner.u.id },
          data: {
            profileRevision: { increment: 1 },
            displayName: "Changed during rendering",
          },
        });
      if (change === "consent")
        await db.consent.update({
          where: { id: family!.consent.id },
          data: { status: "REVOKED" },
        });
      if (change === "reviewer")
        await db.session.update({
          where: { id: session.id },
          data: { mfaVerified: false },
        });
      return result;
    };
    await assert.rejects(
      service.image(
        request,
        card.id,
        change === "reviewer" ? "staff" : "owner",
        change === "reviewer"
          ? undefined
          : {
              revision: card.revision,
              imageDigest: card.imageDigest,
              disclosureConfirmed: true,
            },
      ),
      (error: any) =>
        error.getStatus() ===
        (["session", "consent", "reviewer"].includes(change) ? 403 : 409),
    );
  }
});

test("authored discovery respects regional publication and never manufactures progress or community activity", async () => {
  const person = await fixture("discovery-reader", "1990-01-01");
  assert.equal((await call("discovery")).status, 401);
  const before = await Promise.all([
    db.progress.count({ where: { userId: person.u.id } }),
    db.post.count(),
    db.attempt.count(),
  ]);
  const original = await db.course.findUniqueOrThrow({
    where: { id: "2-first-solve" },
  });
  const cnOriginal = await cnDb.course.findUnique({
    where: { id: original.id },
  });
  try {
    await cnDb.course.upsert({
      where: { id: original.id },
      create: {
        id: original.id,
        puzzle: original.puzzle,
        level: original.level,
        content: original.content as any,
        published: true,
      },
      update: { published: true },
    });
    await db.course.update({
      where: { id: original.id },
      data: { published: true },
    });
    const response = await call("discovery", undefined, person.token);
    assert.equal(response.status, 200);
    const { DiscoveryResponse, DiscoveryStory } = await import("@cubers/core");
    const stories = DiscoveryResponse.parse(response.body).items;
    assert.equal(stories.length, 4);
    assert.ok(
      stories
        .find((story) => story.puzzle === "2x2")!
        .actions.some((action) => action.courseId === original.id),
    );
    await db.course.update({
      where: { id: original.id },
      data: { published: false },
    });
    const detail = await call(
      "discovery/more-than-one-color",
      undefined,
      person.token,
    );
    assert.equal(detail.status, 200);
    assert.equal(DiscoveryStory.parse(detail.body).actions.length, 0);
    assert.equal(
      (await call("courses/2-first-solve", undefined, person.token)).status,
      404,
    );
    assert.equal(
      (await call("discovery/missing-story", undefined, person.token)).status,
      404,
    );
    assert.equal(
      (await call("discovery/not.valid", undefined, person.token)).status,
      400,
    );
    const cnPerson = await cnDb.user.create({
      data: {
        email: `discovery-cn-${runId}@cubers.test`,
        displayName: "Synthetic regional reader",
        birthDate: "1990-01-01",
        passwordHash: await passwordHash("test-password-not-production"),
        region: "CN",
        emailVerified: true,
      },
    });
    const cnToken = opaque();
    await cnDb.session.create({
      data: {
        userId: cnPerson.id,
        tokenHash: hash(cnToken),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    assert.equal(
      (await call("discovery", undefined, person.token, undefined, cnOrigin))
        .status,
      401,
    );
    const cnDetail = await call(
      "discovery/more-than-one-color",
      undefined,
      cnToken,
      undefined,
      cnOrigin,
    );
    assert.equal(cnDetail.status, 200);
    assert.ok(
      cnDetail.body.actions.some(
        (action: any) => action.courseId === original.id,
      ),
    );
    assert.deepEqual(
      await Promise.all([
        db.progress.count({ where: { userId: person.u.id } }),
        db.post.count(),
        db.attempt.count(),
      ]),
      before,
    );
  } finally {
    await db.course.update({
      where: { id: original.id },
      data: { published: original.published },
    });
    if (cnOriginal)
      await cnDb.course.update({
        where: { id: cnOriginal.id },
        data: { published: cnOriginal.published },
      });
    else await cnDb.course.delete({ where: { id: original.id } });
  }
});

test("discovery remains behind current guardian learning permission and full-session scope", async () => {
  const pending = await fixture(
    "discovery-pending-child",
    "2018-01-01",
    "USER",
    false,
  );
  assert.equal((await call("discovery", undefined, pending.token)).status, 403);
  const family = await securityChild("discovery-consented");
  assert.equal(
    (await call("discovery/one-turn-at-a-time", undefined, family.child.token))
      .status,
    200,
  );
  await db.consent.update({
    where: { id: family.consent.id },
    data: { status: "REVOKED" },
  });
  assert.equal(
    (await call("discovery/one-turn-at-a-time", undefined, family.child.token))
      .status,
    403,
  );
  const person = await fixture("discovery-deletion-only", "1990-01-01");
  await db.session.updateMany({
    where: { userId: person.u.id },
    data: { scope: "DELETION" },
  });
  assert.equal((await call("discovery", undefined, person.token)).status, 403);
});

test("concurrent administrator logins cannot reuse the same MFA step", async () => {
  const reviewer = await fixture("staff-login-replay", "1990-01-01", "ADMIN");
  if (Date.now() % 30000 > 28000)
    await new Promise((resolve) =>
      setTimeout(resolve, 30050 - (Date.now() % 30000)),
    );
  const credentials = {
    email: reviewer.u.email,
    password: "test-password-not-production",
    otp: authenticator.generate(reviewer.secret!),
  };
  const replies = await Promise.all([
    call("auth/login", credentials),
    call("auth/login", credentials),
  ]);
  assert.deepEqual(replies.map((r) => r.status).sort(), [201, 403]);
  const success = replies.find((r) => r.status === 201)!;
  assert.equal(
    (await call("admin/overview", undefined, success.body.token)).status,
    200,
  );
  assert.equal((await call("auth/deletion-login", credentials)).status, 403);
});

test("login rechecks password and staff factor changes under the account lock before issuing a session", async () => {
  for (const field of ["password", "factor"]) {
    const person = await fixture(
      `staff-login-race-${field}`,
      "1990-01-01",
      "ADMIN",
    );
    let pending: ReturnType<typeof call>;
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${person.u.id}::uuid FOR UPDATE`;
        pending = call("auth/login", {
          email: person.u.email,
          password: "test-password-not-production",
          otp: authenticator.generate(person.secret!),
        });
        await waitFor(async () => {
          const [r] = await db.$queryRaw<
            { count: number }[]
          >`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT id FROM "User"%'`;
          return r.count > 0;
        }, 2500);
        await tx.user.update({
          where: { id: person.u.id },
          data:
            field === "password"
              ? {
                  passwordHash: await passwordHash(
                    "changed-synthetic-password",
                  ),
                }
              : {
                  mfaSecret: authenticator.generateSecret(),
                  mfaGeneration: { increment: 1 },
                },
        });
      },
      { timeout: 10000 },
    );
    assert.equal((await pending!).status, 401);
    assert.equal(await db.session.count({ where: { userId: person.u.id } }), 1);
  }
});

const courseDraft = (puzzle = "3x3", algorithm = "R U R' U'") => ({
  puzzle,
  kind: "drill",
  level: "beginner",
  title: { en: "Original synthetic exercise", zh: "原创测试练习" },
  summary: {
    en: "A bounded original teaching exercise.",
    zh: "有明确范围的原创教学练习。",
  },
  steps: {
    en: ["Use the shown reference and follow the supplied sequence."],
    zh: ["保持展示的参照方向，完成所提供的转动序列。"],
  },
  algorithm,
  minutes: 5,
});
const publication = (version: number) => ({
  expectedVersion: version,
  published: true,
  reviewed: true,
  englishReviewed: true,
  chineseReviewed: true,
  rightsConfirmed: true,
});
async function originalCourse(
  token: string,
  puzzle = "3x3",
  algorithm = "R U R' U'",
) {
  const created = await call(
    "admin/courses",
    {
      lesson: courseDraft(puzzle, algorithm),
      reason: "Synthetic authored course for verification",
    },
    token,
  );
  assert.equal(created.status, 201);
  return created.body;
}
test("administrators author, review and revise all four puzzle drills without rewriting historical progress", async () => {
  const editor = await fixture("course-editor-four", "1990-01-01", "ADMIN"),
    learner = await fixture("course-reader-four", "1990-01-01");
  assert.equal(
    (
      await call(
        "admin/courses",
        { lesson: courseDraft(), reason: "Synthetic draft creation" },
        learner.token,
      )
    ).status,
    403,
  );
  for (const [puzzle, algorithm, nextAlgorithm] of [
    ["2x2", "R U R'", "U R U'"],
    ["3x3", "R U R' U'", "U R U' R'"],
    ["4x4", "Rw U Rw'", "Uw R Uw'"],
    ["pyraminx", "u L R'", "l R L'"],
  ]) {
    let course = await originalCourse(editor.token, puzzle, algorithm);
    assert.match(course.id, /^custom-/);
    assert.equal(course.published, false);
    assert.equal(course.version, 1);
    assert.equal(
      (await call(`courses/${course.id}`, undefined, learner.token)).status,
      404,
    );
    assert.equal(
      (
        await call(
          `admin/courses/${course.id}`,
          { expectedVersion: 1, published: true, reviewed: true },
          editor.token,
        )
      ).status,
      400,
    );
    const published = await call(
      `admin/courses/${course.id}`,
      publication(1),
      editor.token,
    );
    assert.equal(published.status, 201);
    course = published.body;
    assert.equal(course.version, 2);
    assert.equal(
      (
        await call(
          `progress/${course.id}`,
          { moves: algorithm.split(" ") },
          learner.token,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          `progress/${course.id}`,
          { moves: algorithm.split(" "), courseVersion: 1 },
          learner.token,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          "tutor",
          {
            lessonId: course.id,
            locale: "en",
            moves: [],
            question: "why",
            courseVersion: 1,
          },
          learner.token,
        )
      ).status,
      409,
    );
    const finished = await call(
      `progress/${course.id}`,
      { moves: algorithm.split(" "), courseVersion: 2 },
      learner.token,
    );
    assert.equal(finished.status, 201);
    assert.equal(finished.body.courseVersion, 2);
    const session = await call(
      `courses/${course.id}/sessions`,
      { input: "scan", courseVersion: 2 },
      learner.token,
    );
    assert.equal(session.status, 201);
    const edited = await call(
      `admin/courses/${course.id}/content`,
      {
        expectedVersion: 2,
        lesson: {
          ...course.content,
          algorithm: nextAlgorithm,
          title: { en: "Revised synthetic exercise", zh: "修订后的测试练习" },
        },
        reason: "A separately reviewed original teaching revision",
      },
      editor.token,
    );
    assert.equal(edited.status, 201);
    assert.equal(edited.body.published, false);
    assert.equal(edited.body.version, 3);
    assert.equal(
      (await call(`courses/${course.id}`, undefined, learner.token)).status,
      404,
    );
    const state = practiceSetup(puzzle as any, algorithm);
    assert.equal(
      (
        await call(
          `lesson-sessions/${session.body.id}/checkpoint`,
          {
            version: 0,
            kind: "initial",
            faces: isPyraminx(state)
              ? pyraminxFacelets(state)
              : facelets(state),
          },
          learner.token,
        )
      ).status,
      409,
    );
    assert.equal(
      (await call(`admin/courses/${course.id}`, publication(2), editor.token))
        .status,
      409,
    );
    const republished = await call(
      `admin/courses/${course.id}`,
      publication(3),
      editor.token,
    );
    assert.equal(republished.status, 201);
    assert.equal(republished.body.version, 4);
    let progress = (await call("progress", undefined, learner.token)).body.find(
      (row: any) => row.lessonId === course.id,
    );
    assert.equal(progress.completed, true);
    assert.equal(progress.currentCompleted, false);
    assert.equal(progress.courseVersion, 2);
    assert.equal(
      (
        await call(
          `progress/${course.id}`,
          { moves: nextAlgorithm.split(" "), courseVersion: 4 },
          learner.token,
        )
      ).status,
      201,
    );
    progress = (await call("progress", undefined, learner.token)).body.find(
      (row: any) => row.lessonId === course.id,
    );
    assert.equal(progress.currentCompleted, true);
    assert.equal(progress.courseVersion, 4);
    assert.equal(progress.repetitions, 2);
    const history = await db.lessonSession.findMany({
      where: { userId: learner.u.id, lessonId: course.id, status: "COMPLETED" },
      orderBy: { courseVersion: "asc" },
    });
    assert.deepEqual(
      history.map((row) => [row.courseVersion, row.algorithm]),
      [
        [2, algorithm],
        [4, nextAlgorithm],
      ],
    );
    const revisions = await call(
      `admin/courses/${course.id}/revisions`,
      undefined,
      editor.token,
    );
    assert.equal(revisions.status, 200);
    assert.deepEqual(
      revisions.body.items.map((row: any) => row.version),
      [4, 3, 2, 1],
    );
    assert.equal(JSON.stringify(revisions.body).includes('"content"'), false);
  }
});

test("course editing rejects stale concurrent writes and preserves built-in checkpoint methods", async () => {
  const editor = await fixture("course-conflicts", "1990-01-01", "ADMIN"),
    course = await originalCourse(editor.token);
  const edit = (title: string) => ({
    expectedVersion: 1,
    lesson: { ...course.content, title: { en: title, zh: "并发修订" } },
    reason: "Synthetic concurrent teaching revision",
  });
  const replies = await Promise.all([
    call(
      `admin/courses/${course.id}/content`,
      edit("First revision"),
      editor.token,
    ),
    call(
      `admin/courses/${course.id}/content`,
      edit("Second revision"),
      editor.token,
    ),
  ]);
  assert.deepEqual(replies.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    (await db.course.findUniqueOrThrow({ where: { id: course.id } })).version,
    2,
  );
  const original = await db.course.findUniqueOrThrow({
    where: { id: "3-first-solve" },
  });
  assert.equal(
    (
      await call(
        `admin/courses/${original.id}/content`,
        {
          expectedVersion: original.version,
          lesson: { ...(original.content as any), algorithm: "R" },
          reason: "Attempt to replace the verified guided method",
        },
        editor.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (await db.course.findUniqueOrThrow({ where: { id: original.id } })).version,
    original.version,
  );
  const moderator = await fixture("course-inspector", "1990-01-01", "ADMIN");
  await db.user.update({
    where: { id: moderator.u.id },
    data: { role: "MODERATOR" },
  });
  assert.equal(
    (await call("admin/course-library", undefined, moderator.token)).body
      .canEdit,
    false,
  );
  assert.equal(
    (
      await call(
        `admin/courses/${course.id}/content`,
        edit("Unauthorized edit"),
        moderator.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `admin/courses/${course.id}/revisions`,
        undefined,
        moderator.token,
      )
    ).status,
    200,
  );
});

test("course library paging escapes literal searches and bounded revisions restore into a new draft", async () => {
  const editor = await fixture("course-history-editor", "1990-01-01", "ADMIN"),
    marker = randomUUID().slice(0, 8),
    ids = Array.from({ length: 41 }, () => `custom-${randomUUID()}`).sort();
  try {
    await db.course.createMany({
      data: ids.map((id, i) => ({
        id,
        puzzle: "3x3",
        level: "beginner",
        published: false,
        content: {
          id,
          ...courseDraft(),
          title: {
            en: i === 40 ? `literal-XX-${marker}` : `literal-%_-${marker}`,
            zh: "分页测试",
          },
        },
      })),
    });
    let cursor: string | null = null;
    const collected: string[] = [];
    do {
      const response = await call(
        `admin/course-library?q=${encodeURIComponent(`literal-%_-${marker}`)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        undefined,
        editor.token,
      );
      assert.equal(response.status, 200);
      collected.push(...response.body.items.map((row: any) => row.id));
      cursor = response.body.nextCursor;
      if (cursor) await db.course.delete({ where: { id: cursor } });
    } while (cursor);
    assert.equal(collected.length, 40);
    assert.equal(new Set(collected).size, 40);
    assert.equal(collected.includes(ids[40]), false);
  } finally {
    await db.course.deleteMany({ where: { id: { in: ids } } });
  }
  let course = await originalCourse(editor.token);
  for (let i = 0; i < 52; i++) {
    const response = await call(
      `admin/courses/${course.id}/content`,
      {
        expectedVersion: course.version,
        lesson: {
          ...course.content,
          title: { en: `Revision ${i}`, zh: `第 ${i} 次修订` },
        },
        reason: "Synthetic revision-retention exercise",
      },
      editor.token,
    );
    assert.equal(response.status, 201);
    course = response.body;
  }
  const history = (
    await call(`admin/courses/${course.id}/revisions`, undefined, editor.token)
  ).body;
  assert.equal(history.limit, 50);
  assert.equal(history.items.length, 50);
  assert.equal(history.items[0].version, 53);
  assert.equal(history.items.at(-1).version, 4);
  assert.equal(
    (
      await call(
        `admin/courses/${course.id}/revisions/1`,
        undefined,
        editor.token,
      )
    ).status,
    404,
  );
  const old = (
    await call(
      `admin/courses/${course.id}/revisions/5`,
      undefined,
      editor.token,
    )
  ).body;
  const restored = await call(
    `admin/courses/${course.id}/content`,
    {
      expectedVersion: 53,
      lesson: old.content,
      reason: "Restore historical teaching as a fresh draft",
    },
    editor.token,
  );
  assert.equal(restored.status, 201);
  assert.equal(restored.body.version, 54);
  assert.equal(restored.body.published, false);
  assert.deepEqual(restored.body.content, old.content);
  assert.equal(
    (
      await call(
        `admin/courses/${course.id}/revisions/5`,
        undefined,
        editor.token,
      )
    ).body.digest,
    old.digest,
  );
  const count = await db.audit.count({ where: { targetId: course.id } });
  const noop = await call(
    `admin/courses/${course.id}/content`,
    {
      expectedVersion: 54,
      lesson: restored.body.content,
      reason: "No-op verification keeps existing revision",
    },
    editor.token,
  );
  assert.equal(noop.status, 201);
  assert.equal(noop.body.version, 54);
  assert.equal(await db.audit.count({ where: { targetId: course.id } }), count);
});

test("course writes recheck current staff authority and virtual completion cannot cross a committed edit", async () => {
  const { CourseEditing } = await import("../../apps/api/src/course-editing"),
    { accountPolicy } = await import("../../apps/api/src/security");
  for (const change of ["role", "factor", "session"]) {
    const editor = await fixture(
        `course-editor-race-${change}`,
        "1990-01-01",
        "ADMIN",
      ),
      course = await originalCourse(editor.token),
      session = await db.session.findUniqueOrThrow({
        where: { tokenHash: hash(editor.token) },
      });
    const actor = {
      user: await db.user.findUniqueOrThrow({ where: { id: editor.u.id } }),
      sessionId: session.id,
      policy: await accountPolicy(db as any, editor.u),
    } as any;
    const service = new CourseEditing(db as any, infrastructure),
      quota = (service as any).quota.bind(service);
    (service as any).quota = async (r: any) => {
      await quota(r);
      if (change === "session")
        await db.session.delete({ where: { id: session.id } });
      else
        await db.user.update({
          where: { id: editor.u.id },
          data:
            change === "role"
              ? { role: "USER" }
              : { mfaGeneration: { increment: 1 } },
        });
    };
    await assert.rejects(
      service.edit(actor, course.id, {
        expectedVersion: 1,
        lesson: {
          ...course.content,
          title: { en: "Late rejected edit", zh: "不得生效的修订" },
        },
        reason: "Synthetic revoked-staff write verification",
      }),
      (error: any) => error.getStatus() === 403,
    );
    assert.equal(
      (await db.course.findUniqueOrThrow({ where: { id: course.id } })).version,
      1,
    );
  }
  const editor = await fixture(
      "course-grade-race-admin",
      "1990-01-01",
      "ADMIN",
    ),
    learner = await fixture("course-grade-race-learner", "1990-01-01");
  let course = await originalCourse(editor.token);
  course = (
    await call(`admin/courses/${course.id}`, publication(1), editor.token)
  ).body;
  let pending: ReturnType<typeof call>;
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${course.id} FOR UPDATE`;
      pending = call(
        `progress/${course.id}`,
        { courseVersion: 2, moves: course.content.algorithm.split(" ") },
        learner.token,
      );
      await waitFor(async () => {
        const [row] = await db.$queryRaw<
          { count: number }[]
        >`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT id FROM "Course"%'`;
        return row.count > 0;
      }, 2500);
      await tx.course.update({
        where: { id: course.id },
        data: { published: false, version: { increment: 1 } },
      });
    },
    { timeout: 10000 },
  );
  assert.equal((await pending!).status, 409);
  assert.equal(
    await db.progress.count({
      where: { userId: learner.u.id, lessonId: course.id },
    }),
    0,
  );
  assert.equal(
    await db.lessonSession.count({
      where: { userId: learner.u.id, lessonId: course.id },
    }),
    0,
  );
});

test("tutor responses are withheld when their saved lesson revision changes during simulated generation", async () => {
  const { AiTutor } = await import("../../apps/api/src/ai"),
    { LearningController } =
      await import("../../apps/api/src/learning.controller"),
    { accountPolicy } = await import("../../apps/api/src/security");
  const editor = await fixture("course-tutor-editor", "1990-01-01", "ADMIN"),
    learner = await fixture("course-tutor-reader", "1990-01-01");
  let course = await originalCourse(editor.token);
  course = (
    await call(`admin/courses/${course.id}`, publication(1), editor.token)
  ).body;
  const session = await db.session.findUniqueOrThrow({
      where: { tokenHash: hash(learner.token) },
    }),
    actor = {
      user: learner.u,
      sessionId: session.id,
      policy: await accountPolicy(db as any, learner.u),
    } as any,
    original = AiTutor.prototype.explain;
  try {
    AiTutor.prototype.explain = async () => {
      await db.course.update({
        where: { id: course.id },
        data: { published: false, version: { increment: 1 } },
      });
      return {
        source: "authored",
        text: "Synthetic explanation",
        algorithm: [],
        intent: "explain",
      } as any;
    };
    await assert.rejects(
      new LearningController(db as any, infrastructure).tutor(actor, {
        lessonId: course.id,
        courseVersion: 2,
        locale: "en",
        moves: [],
        question: "why",
      }),
      (error: any) => error.getStatus() === 409,
    );
  } finally {
    AiTutor.prototype.explain = original;
  }
});

async function learningLockDelay(
  table:
    | "Course"
    | "LearningAssessment"
    | "Room"
    | "Attempt"
    | "Competition"
    | "ReplayShare",
  id: string,
  deadline: number,
  action: () => Promise<unknown>,
) {
  let release!: () => void, acquired!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
  const blocker = db.$transaction(
    async (tx) => {
      if (table === "Course")
        await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${id} FOR UPDATE`;
      else if (table === "Room")
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${id}::uuid FOR UPDATE`;
      else if (table === "Attempt")
        await tx.$queryRaw`SELECT id FROM "Attempt" WHERE id=${id}::uuid FOR UPDATE`;
      else if (table === "ReplayShare")
        await tx.$queryRaw`SELECT id FROM "ReplayShare" WHERE id=${id}::uuid FOR UPDATE`;
      else if (table === "Competition")
        await tx.$queryRaw`SELECT id FROM "Competition" WHERE id=${id}::uuid FOR UPDATE`;
      else
        await tx.$queryRaw`SELECT id FROM "LearningAssessment" WHERE id=${id}::uuid FOR UPDATE`;
      acquired();
      await gate;
    },
    { timeout: 10000 },
  );
  await locked;
  const result = action().then(
    (value) => ({ value, error: null as any }),
    (error) => ({ value: null, error }),
  );
  let waiting = false;
  try {
    for (let i = 0; i < 100; i++) {
      const rows = await db.$queryRaw<
        { waiting: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ${`%"${table}"%`}) AS waiting`;
      if (rows[0].waiting) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (waiting)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, deadline - Date.now() + 25)),
      );
  } finally {
    release();
    await blocker;
  }
  assert.equal(
    waiting,
    true,
    `The learning action must actually wait on ${table}`,
  );
  return result;
}
test("learning checkpoints roll back when full sessions expire during course-lock waits", async () => {
  const f = await tutorAuthorityFixture("checkpoint-login-expiry"),
    deadline = Date.now() + 1500;
  await db.session.update({
    where: { id: f.actor.sessionId },
    data: { expiresAt: new Date(deadline) },
  });
  const result = await learningLockDelay("Course", f.course.id, deadline, () =>
    f.service.complete(f.actor, f.course.id, {
      courseVersion: f.course.version,
      moves: (f.course.content as unknown as Lesson).algorithm.split(" "),
    }),
  );
  assert.equal(result.error?.getStatus(), 403);
  assert.equal(
    await db.lessonSession.count({ where: { userId: f.person.u.id } }),
    0,
  );
  assert.equal(
    await db.progress.count({ where: { userId: f.person.u.id } }),
    0,
  );
});
test("learning scanned checkpoints cannot outlive their seven-day session while waiting", async () => {
  const f = await tutorAuthorityFixture("checkpoint-practice-expiry"),
    lesson = f.course.content as unknown as Lesson;
  let session = await f.service.createSession(f.actor, f.course.id, {
    input: "scan",
    courseVersion: f.course.version,
  });
  session = (await f.service.checkpoint(f.actor, session.id, {
    version: session.version,
    kind: "initial",
    faces: facelets(practiceSetup(lesson.puzzle, lesson.algorithm) as any),
  })) as any;
  session = (await f.service.confirmMoves(f.actor, session.id, {
    version: session.version,
    moves: lesson.algorithm.split(" "),
  })) as any;
  const deadline = Date.now() + 1500;
  await db.lessonSession.update({
    where: { id: session.id },
    data: { createdAt: new Date(deadline - 7 * 86400000) },
  });
  const result = await learningLockDelay("Course", f.course.id, deadline, () =>
    f.service.checkpoint(f.actor, session.id, {
      version: session.version,
      kind: "final",
      faces: facelets(solvedCube()),
    }),
  );
  assert.equal(result.error?.getStatus(), 409);
  const after = await db.lessonSession.findUniqueOrThrow({
    where: { id: session.id },
  });
  assert.equal(after.status, "PRACTICING");
  assert.equal(after.version, session.version);
  assert.equal(
    await db.progress.count({ where: { userId: f.person.u.id } }),
    0,
  );
});
test("learning assessment mutations reject captured sessions whose scope has been revoked", async () => {
  const { AssessmentController } =
      await import("../../apps/api/src/assessment.controller"),
    service = new AssessmentController(db as Db, infrastructure);
  for (const operation of ["start", "answer", "cancel"] as const) {
    const person = await fixture(
        `learning-placement-session-${operation}`,
        "1990-01-01",
      ),
      actor = await communityActor(person);
    const row =
      operation === "start"
        ? null
        : await service.start(actor, { puzzle: "3x3" });
    await db.session.update({
      where: { id: actor.sessionId },
      data: { scope: "DELETION" },
    });
    await assert.rejects(
      operation === "start"
        ? service.start(actor, { puzzle: "3x3" })
        : operation === "answer"
          ? service.answer(actor, row!.id, {
              version: row!.version,
              kind: "skip",
            })
          : service.cancel(actor, row!.id, { version: row!.version }),
      (error: any) => error.getStatus?.() === 403,
      operation,
    );
    if (row) {
      const after = await db.learningAssessment.findUniqueOrThrow({
        where: { id: row.id },
      });
      assert.equal(after.version, 0);
      assert.deepEqual(after.answers, []);
      assert.equal(after.status, "ACTIVE");
    } else
      assert.equal(
        await db.learningAssessment.count({ where: { userId: person.u.id } }),
        0,
      );
  }
});
test("learning assessment answers roll back if the check expires while its update is blocked", async () => {
  const { AssessmentController } =
      await import("../../apps/api/src/assessment.controller"),
    person = await fixture("learning-placement-expiry", "1990-01-01"),
    actor = await communityActor(person),
    service = new AssessmentController(db as Db, infrastructure),
    row = await service.start(actor, { puzzle: "3x3" }),
    deadline = Date.now() + 1500;
  await db.learningAssessment.update({
    where: { id: row.id },
    data: { expiresAt: new Date(deadline) },
  });
  const result = await learningLockDelay(
    "LearningAssessment",
    row.id,
    deadline,
    () => service.answer(actor, row.id, { version: 0, kind: "skip" }),
  );
  assert.equal(result.error?.getStatus(), 409);
  const after = await db.learningAssessment.findUniqueOrThrow({
    where: { id: row.id },
  });
  assert.equal(after.version, 0);
  assert.deepEqual(after.answers, []);
  assert.equal(after.status, "ACTIVE");
});

test("learning ordinary mutations and downloads reject every captured revoked login", async () => {
  for (const operation of [
    "complete",
    "create",
    "moves",
    "checkpoint",
    "cancel",
    "download",
  ] as const) {
    const f = await tutorAuthorityFixture(`all-writes-${operation}`),
      lesson = f.course.content as unknown as Lesson;
    let session: any;
    if (["moves", "checkpoint", "cancel"].includes(operation))
      session = await f.service.createSession(f.actor, f.course.id, {
        input: "scan",
        courseVersion: f.course.version,
      });
    if (operation === "moves")
      session = await f.service.checkpoint(f.actor, session.id, {
        version: session.version,
        kind: "initial",
        faces: facelets(practiceSetup(lesson.puzzle, lesson.algorithm) as any),
      });
    const before = await db.lessonSession.findMany({
      where: { userId: f.person.u.id },
    });
    await db.session.update({
      where: { id: f.actor.sessionId },
      data: { scope: "DELETION" },
    });
    const action =
      operation === "complete"
        ? () =>
            f.service.complete(f.actor, f.course.id, {
              courseVersion: f.course.version,
              moves: lesson.algorithm.split(" "),
            })
        : operation === "create"
          ? () =>
              f.service.createSession(f.actor, f.course.id, {
                input: "scan",
                courseVersion: f.course.version,
              })
          : operation === "moves"
            ? () =>
                f.service.confirmMoves(f.actor, session.id, {
                  version: session.version,
                  moves: ["R"],
                })
            : operation === "checkpoint"
              ? () =>
                  f.service.checkpoint(f.actor, session.id, {
                    version: session.version,
                    kind: "initial",
                    faces: facelets(
                      practiceSetup(lesson.puzzle, lesson.algorithm) as any,
                    ),
                  })
              : operation === "cancel"
                ? () => f.service.cancelSession(f.actor, session.id)
                : () => f.service.download(f.actor, f.course.id, {});
    await assert.rejects(
      action(),
      (error: any) => error.getStatus?.() === 403,
      operation,
    );
    assert.deepEqual(
      await db.lessonSession.findMany({ where: { userId: f.person.u.id } }),
      before,
    );
    assert.equal(
      await db.progress.count({ where: { userId: f.person.u.id } }),
      0,
    );
  }
});
async function guidedAuthoritySession(
  person: Awaited<ReturnType<typeof fixture>>,
) {
  const response = await call(
    "first-solves",
    {
      input: "scan",
      puzzle: "2x2",
      faces: facelets(applyMoves(solvedCube(2), "R U F")),
    },
    person.token,
  );
  assert.equal(response.status, 201);
  const { FirstSolveController } =
    await import("../../apps/api/src/first-solve.controller");
  // These tests call only saved-move/download operations; no solver is invoked.
  return {
    row: response.body,
    service: new FirstSolveController(db as Db, infrastructure, {} as any),
  };
}
test("learning writes wait for current guardian authority before granting progress, placement or downloads", async () => {
  const { AssessmentController } =
    await import("../../apps/api/src/assessment.controller");
  for (const operation of [
    "complete",
    "assessment",
    "guided",
    "download",
  ] as const) {
    const f = await tutorAuthorityFixture(
        `guardian-${operation}`,
        "2018-01-01",
      ),
      parent = await fixture(
        `learning-authority-parent-${operation}`,
        "1980-01-01",
      );
    await db.consent.create({
      data: {
        childId: f.person.u.id,
        guardianId: parent.u.id,
        documentId: randomUUID(),
        status: "APPROVED",
      },
    });
    f.actor = await communityActor(f.person);
    const guided =
      operation === "guided" ? await guidedAuthoritySession(f.person) : null;
    const action =
      operation === "complete"
        ? () =>
            f.service.complete(f.actor, f.course.id, {
              courseVersion: f.course.version,
              moves: (f.course.content as unknown as Lesson).algorithm.split(
                " ",
              ),
            })
        : operation === "assessment"
          ? () =>
              new AssessmentController(db as Db, infrastructure).start(
                f.actor,
                { puzzle: "3x3" },
              )
          : operation === "guided"
            ? () =>
                guided!.service.moves(f.actor, guided!.row.id, {
                  version: 0,
                  moves: ["R"],
                })
            : () =>
                f.service.download(f.actor, f.course.id, {
                  includeAlternatives: true,
                });
    const result = await communityLockRace(parent.u.id, action, (tx) =>
      tx.user.update({
        where: { id: parent.u.id },
        data: { adultVerified: false },
      }),
    );
    assert.equal(result.error?.getStatus(), 403, operation);
    assert.equal(
      await db.progress.count({ where: { userId: f.person.u.id } }),
      0,
    );
    assert.equal(
      await db.learningAssessment.count({ where: { userId: f.person.u.id } }),
      0,
    );
    if (guided) {
      const after = await db.guidedSolve.findUniqueOrThrow({
        where: { id: guided.row.id },
      });
      assert.equal(after.version, 0);
      assert.deepEqual(after.moves, []);
    }
  }
});
test("learning guided turns roll back if the saved practice expires during a course-lock wait", async () => {
  const person = await fixture("learning-guided-expiry", "1990-01-01"),
    actor = await communityActor(person),
    f = await guidedAuthoritySession(person),
    deadline = Date.now() + 1500;
  const before = await db.guidedSolve.update({
    where: { id: f.row.id },
    data: { expiresAt: new Date(deadline) },
  });
  const result = await learningLockDelay(
    "Course",
    before.courseId,
    deadline,
    () =>
      f.service.moves(actor, before.id, {
        version: before.version,
        moves: ["R"],
      }),
  );
  assert.equal(result.error?.getStatus(), 409);
  assert.deepEqual(
    await db.guidedSolve.findUniqueOrThrow({ where: { id: before.id } }),
    before,
  );
  assert.equal(await db.progress.count({ where: { userId: person.u.id } }), 0);
});

test("learning cancellation cannot alter a scanned session underneath an admitted final checkpoint", async () => {
  const f = await tutorAuthorityFixture("cancel-checkpoint-race"),
    lesson = f.course.content as unknown as Lesson;
  let session: any = await f.service.createSession(f.actor, f.course.id, {
    input: "scan",
    courseVersion: f.course.version,
  });
  session = await f.service.checkpoint(f.actor, session.id, {
    version: session.version,
    kind: "initial",
    faces: facelets(practiceSetup(lesson.puzzle, lesson.algorithm) as any),
  });
  session = await f.service.confirmMoves(f.actor, session.id, {
    version: session.version,
    moves: lesson.algorithm.split(" "),
  });
  let release!: () => void, acquired!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
  const blocker = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${f.course.id} FOR UPDATE`;
      acquired();
      await gate;
    },
    { timeout: 10000 },
  );
  await locked;
  const final = f.service.checkpoint(f.actor, session.id, {
    version: session.version,
    kind: "final",
    faces: facelets(solvedCube()),
  });
  const waitForLock = async (table: "Course" | "User") => {
    for (let i = 0; i < 100; i++) {
      const rows = await db.$queryRaw<
        { waiting: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ${`%SELECT id FROM "${table}"%`}) AS waiting`;
      if (rows[0].waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`Expected real ${table} lock wait`);
  };
  let cancel: Promise<unknown> | undefined;
  try {
    await waitForLock("Course");
    cancel = f.service.cancelSession(f.actor, session.id);
    await waitForLock("User");
    assert.equal(
      (await db.lessonSession.findUniqueOrThrow({ where: { id: session.id } }))
        .status,
      "PRACTICING",
    );
  } finally {
    release();
    await blocker;
    await Promise.all([final, cancel]);
  }
  const saved = await db.lessonSession.findUniqueOrThrow({
      where: { id: session.id },
    }),
    progress = await db.progress.findUniqueOrThrow({
      where: {
        userId_lessonId: { userId: f.person.u.id, lessonId: f.course.id },
      },
    });
  assert.equal(saved.status, "COMPLETED");
  assert.equal(saved.version, session.version + 1);
  assert.equal(progress.repetitions, 1);
});

// This capability override exists only in this test process. Shipping API and
// native factories retain the real, disabled physical-acceptance catalogue.
async function smartTestService() {
  const { SmartLearningController, SmartLessonAccess } =
    await import("../../apps/api/src/smart-learning.controller");
  class SyntheticAcceptance extends SmartLessonAccess {
    require() {}
  }
  return {
    service: new SmartLearningController(
      db as Db,
      infrastructure,
      new SyntheticAcceptance(),
    ),
    SyntheticAcceptance,
  };
}
async function withSmartHttp(work: (base: string) => Promise<void>) {
  const { Module, Catch } = await import("@nestjs/common"),
    { NestFactory, APP_GUARD } = await import("@nestjs/core"),
    { Security } = await import("../../apps/api/src/security"),
    { SmartLearningController, SmartLessonAccess } =
      await import("../../apps/api/src/smart-learning.controller"),
    { SyntheticAcceptance } = await smartTestService(),
    { SmartFirstSolveController } =
      await import("../../apps/api/src/smart-first-solve.controller"),
    { FirstSolveController } =
      await import("../../apps/api/src/first-solve.controller"),
    { FirstSolveSolver } =
      await import("../../apps/api/src/first-solve-solver"),
    { FirstSolveSolver: CompiledSolver } =
      await import("../../apps/api/dist/first-solve-solver");
  const { SmartAttemptController } =
      await import("../../apps/api/src/smart-attempt.controller"),
    { SmartPlayAccess } = await import("../../apps/api/src/smart-play-access");
  class SyntheticGameAcceptance extends SmartPlayAccess {
    room(puzzle: string) {
      if (puzzle !== "3x3") throw Error("Only 3x3 fixture");
    }
    require() {}
  }
  const { CompetitionsController, AdminCompetitionsController } =
    await import("../../apps/api/src/competitions.controller");
  const localInfra = new Infrastructure(infrastructure.config);
  class FixtureModule {}
  Module({
    controllers: [
      SmartLearningController,
      SmartFirstSolveController,
      FirstSolveController,
      SmartAttemptController,
      PlayController,
      CompetitionsController,
      AdminCompetitionsController,
    ],
    providers: [
      { provide: Db, useValue: db },
      { provide: Infrastructure, useValue: localInfra },
      { provide: SmartLessonAccess, useClass: SyntheticAcceptance },
      { provide: FirstSolveSolver, useValue: new CompiledSolver() },
      { provide: SmartPlayAccess, useClass: SyntheticGameAcceptance },
      PlayController,
      Competitions,
      { provide: APP_GUARD, useClass: Security },
    ],
  })(FixtureModule);
  class InvalidRequest {
    catch(error: any, host: any) {
      host
        .switchToHttp()
        .getResponse()
        .status(error.getStatus?.() || (error.name === "ZodError" ? 400 : 500))
        .json({ message: "Invalid request" });
    }
  }
  Catch()(InvalidRequest);
  const app = await NestFactory.create(FixtureModule, { logger: false });
  try {
    app.useGlobalFilters(new InvalidRequest());
    await app.listen(0, "127.0.0.1");
    await work(await app.getUrl());
  } finally {
    await app.close();
  }
}
test("smart lesson public routes keep every unaccepted model and platform disabled in both regions", async () => {
  for (const base of [origin, cnOrigin]) {
    const regionalDb = base === origin ? db : cnDb,
      beforeCount = await regionalDb.lessonSession.count({
        where: { input: "smart" },
      });
    const regionalToken =
      base === origin
        ? adultToken
        : await (async () => {
            const user = await cnDb.user.create({
                data: {
                  email: "smart-cn-gate-" + runId + "@cubers.test",
                  displayName: "Synthetic CN gate fixture",
                  birthDate: "1990-01-01",
                  passwordHash: "!synthetic-no-login",
                  region: "CN",
                  emailVerified: true,
                  adultVerified: true,
                },
              }),
              raw = opaque();
            await cnDb.session.create({
              data: {
                userId: user.id,
                tokenHash: hash(raw),
                expiresAt: new Date(Date.now() + 60000),
              },
            });
            return raw;
          })();
    const catalogue = await call(
      "devices",
      undefined,
      regionalToken,
      undefined,
      base,
    );
    assert.equal(catalogue.status, 200);
    assert.equal(
      catalogue.body.devices.every(
        (row: any) =>
          !row.enabled &&
          !row.physicallyTested &&
          !row.learningEnabled &&
          row.learningPlatforms.length === 0 &&
          !row.playEnabled &&
          row.playPlatforms.length === 0,
      ),
      true,
    );
    const guidedBefore = await regionalDb.guidedSolve.count({
      where: { input: "smart" },
    });
    for (const model of ["gan-356-i3", "gocube-edge", "giiker-i3s"])
      for (const platform of ["ios", "android"]) {
        assert.equal(
          (
            await call(
              "smart-attempts/" + randomUUID() + "/bind",
              {
                nonce: "synthetic-unaccepted-attempt",
                version: 0,
                model,
                platform,
                faces: facelets(solvedCube()),
                counter: model === "gan-356-i3" ? 250 : null,
              },
              regionalToken,
              undefined,
              base,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await call(
              "smart-first-solves",
              {
                model,
                platform,
                courseVersion: 1,
                faces: facelets(applyMoves(solvedCube(), "R U F2")),
                counter: model === "gan-356-i3" ? 250 : null,
              },
              regionalToken,
              undefined,
              base,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await call(
              "courses/3-notation/smart-sessions",
              { model, platform, courseVersion: 1 },
              regionalToken,
              undefined,
              base,
            )
          ).status,
          403,
        );
      }
    assert.equal(
      await regionalDb.guidedSolve.count({ where: { input: "smart" } }),
      guidedBefore,
    );
    assert.equal(
      await regionalDb.lessonSession.count({ where: { input: "smart" } }),
      beforeCount,
    );
  }
});
test("native smart lesson bridge completes all three models through authenticated HTTP and persistent private progress", async () => {
  const { SmartLessonLink } =
      await import("../../apps/mobile/src/smart/lesson-link"),
    { SmartCubeFrame, smartLessonReference } = await import("@cubers/core");
  await withSmartHttp(async (base) => {
    for (const [index, model] of (
      ["gan-356-i3", "gocube-edge", "giiker-i3s"] as const
    ).entries()) {
      const owner = await fixture("smart-http-" + model, "1990-01-01"),
        peer = await fixture("smart-peer-" + model, "1990-01-01");
      const source =
        index === 0
          ? lessons.find((l) => l.id === "3-notation")!
          : lessons.find(
              (l) =>
                l.caseFamily === (index === 1 ? "PLL" : "OLL") &&
                l.alternatives?.length,
            )!;
      const course = (
          await call("courses/" + source.id, undefined, owner.token)
        ).body,
        lesson = course.content as Lesson,
        option = index ? lesson.alternatives![0] : undefined,
        frame = new SmartCubeFrame(smartLessonReference(lesson));
      let hardware = frame.toHardwareState(
          practiceSetup("3x3", lesson.algorithm) as any,
        ),
        saved: any;
      const api = async <T = any>(
        path: string,
        body?: unknown,
        method?: string,
      ): Promise<T> => {
        const r = await call(path, body, owner.token, method, base);
        if (r.status >= 400) throw Error("Synthetic smart HTTP " + r.status);
        return r.body;
      };
      const link = new SmartLessonLink(
        api,
        {
          lessonId: lesson.id,
          courseVersion: course.version,
          alternativeId: option?.id,
          model,
          platform: "ios",
        },
        (row) => {
          saved = row;
        },
        (message) => {
          throw Error(message);
        },
      );
      link.observe({
        type: "state",
        state: hardware,
        verified: false,
        ...(index === 0 ? { deviceCounter: 250 } : {}),
      });
      try {
        await link.start();
        const sequence = (option?.algorithm || lesson.algorithm).split(" ");
        for (const [i, move] of sequence.entries()) {
          const raw = frame.toHardwareMove(move);
          hardware = applyMoves(hardware, [raw]);
          link.observe({
            type: "move",
            sequence: i,
            receivedAt: 100 + i,
            integrity:
              index === 0 ? "counter" : index === 1 ? "pending-state" : "state",
            move: {
              move: raw,
              ...(index === 0 ? { deviceCounter: (251 + i) & 255 } : {}),
            },
          });
          link.observe({
            type: "state",
            state: hardware,
            verified: index === 2,
            ...(index === 0 ? { deviceCounter: (251 + i) & 255 } : {}),
          });
        }
        if (index === 0) {
          await link.flush(true);
          assert.equal(link.saved!.smart.independentState, false);
          const pending = link.saved!;
          assert.equal(
            (
              await call(
                "smart-lesson-sessions/" + pending.id,
                {
                  action: "finish",
                  version: pending.version,
                  epoch: pending.smart.epoch,
                  faces: facelets(hardware),
                  counter: pending.smart.counter,
                },
                owner.token,
                undefined,
                base,
              )
            ).status,
            400,
          );
          assert.equal(
            await db.progress.count({
              where: { userId: owner.u.id, lessonId: lesson.id },
            }),
            0,
          );
        }
        link.observe({
          type: "state",
          state: hardware,
          verified: true,
          ...(index === 0
            ? { deviceCounter: (250 + sequence.length) & 255 }
            : {}),
        });
        await link.flush(true);
        await link.finish();
        assert.equal(saved.status, "COMPLETED");
        const row = await db.lessonSession.findUniqueOrThrow({
            where: { id: saved.id },
          }),
          progress = await db.progress.findUniqueOrThrow({
            where: {
              userId_lessonId: { userId: owner.u.id, lessonId: lesson.id },
            },
          });
        assert.equal(row.input, "smart");
        assert.equal(row.algorithm, lesson.algorithm);
        assert.equal(row.guideId, option?.id || null);
        assert.deepEqual(row.moves, sequence);
        assert.equal(progress.repetitions, 1);
        assert.equal(progress.completed, true);
        assert.equal(
          (row.smart as any).continuity,
          index === 0 ? "counter" : "net-state",
        );
        assert.equal(
          (
            await call(
              "smart-lesson-sessions/" + row.id,
              undefined,
              peer.token,
              undefined,
              base,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await call(
              "smart-lesson-sessions/" + row.id,
              {
                action: "finish",
                version: row.version,
                epoch: (row.smart as any).epoch,
                faces: facelets(hardware),
                counter: (row.smart as any).counter,
              },
              owner.token,
              undefined,
              base,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await db.progress.findUniqueOrThrow({
              where: {
                userId_lessonId: { userId: owner.u.id, lessonId: lesson.id },
              },
            })
          ).repetitions,
          1,
        );
      } finally {
        await link.close();
      }
    }
  });
});
async function smartPracticeFixture(name: string, child = false) {
  const f = await tutorAuthorityFixture(
      "smart-" + name,
      child ? "2018-01-01" : "1990-01-01",
    ),
    { service } = await smartTestService(),
    { SmartCubeFrame } = await import("@cubers/core");
  let guardian: any;
  if (child) {
    guardian = await fixture("smart-parent-" + name, "1980-01-01");
    await db.consent.create({
      data: {
        childId: f.person.u.id,
        guardianId: guardian.u.id,
        documentId: randomUUID(),
        status: "APPROVED",
      },
    });
    f.actor = await communityActor(f.person);
  }
  let row = await service.create(f.actor, f.course.id, {
    model: "gan-356-i3",
    platform: "ios",
    courseVersion: f.course.version,
  });
  const frame = new SmartCubeFrame(row.smart.reference),
    hardware = frame.toHardwareState(
      practiceSetup("3x3", row.algorithm) as any,
    );
  row = await service.action(f.actor, row.id, {
    action: "confirm",
    version: row.version,
    epoch: row.smart.epoch,
    faces: facelets(hardware),
    counter: 250,
  });
  return { ...f, service, row, frame, hardware, guardian };
}
test("smart lesson server rejects replayed, mismatched, forged and out-of-order telemetry without mutating history", async () => {
  const f = await smartPracticeFixture("invalid");
  const before = await db.lessonSession.findUniqueOrThrow({
      where: { id: f.row.id },
    }),
    body = {
      action: "turns",
      version: f.row.version,
      epoch: f.row.smart.epoch,
      turns: [
        {
          sequence: 0,
          move: "R",
          receivedAt: 1,
          counter: 251,
          recovered: false,
        },
      ],
      faces: facelets(applyMoves(f.hardware, ["R"])),
      counter: 251,
      independentState: false,
    };
  for (const patch of [
    { epoch: randomUUID() },
    { version: 999 },
    { turns: [{ ...body.turns[0], sequence: 1 }] },
    { counter: 20 },
    { faces: facelets(solvedCube()) },
  ])
    await assert.rejects(
      f.service.action(f.actor, f.row.id, { ...body, ...patch }),
    );
  assert.deepEqual(
    await db.lessonSession.findUniqueOrThrow({ where: { id: f.row.id } }),
    before,
  );
  await assert.rejects(
    db.$executeRawUnsafe(
      'UPDATE "LessonSession" SET smart=$1::jsonb WHERE id=$2::uuid',
      JSON.stringify({
        ...(before.smart as any),
        address: "AA:BB:CC:DD:EE:FF",
      }),
      before.id,
    ),
  );
  assert.equal(
    await db.progress.count({ where: { userId: f.person.u.id } }),
    0,
  );
  const raced = await Promise.allSettled([
    f.service.action(f.actor, f.row.id, body),
    f.service.action(f.actor, f.row.id, body),
  ]);
  assert.equal(
    raced.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    raced.filter(
      (result) =>
        result.status === "rejected" && result.reason.getStatus?.() === 409,
    ).length,
    1,
  );
  await assert.rejects(
    f.service.action(f.actor, f.row.id, body),
    (error: any) => error.getStatus?.() === 409,
  );
  assert.equal(
    (await db.lessonSession.findUniqueOrThrow({ where: { id: f.row.id } }))
      .moves.length,
    1,
  );
});
test("smart lesson disconnect and expired leases require a new epoch and preserve interrupted history", async () => {
  const f = await smartPracticeFixture("lease");
  await db.lessonSession.update({
    where: { id: f.row.id },
    data: { smartSeenAt: new Date(Date.now() - 31000) },
  });
  const body = {
    action: "turns",
    version: f.row.version,
    epoch: f.row.smart.epoch,
    turns: [],
    faces: facelets(f.hardware),
    counter: 250,
    independentState: true,
  };
  await assert.rejects(
    f.service.action(f.actor, f.row.id, body),
    (error: any) => error.getStatus?.() === 409,
  );
  assert.equal((await f.service.get(f.actor, f.row.id)).status, "INTERRUPTED");
  const fresh = await f.service.create(f.actor, f.course.id, {
    model: "gan-356-i3",
    platform: "ios",
    courseVersion: f.course.version,
  });
  assert.notEqual(fresh.smart.epoch, f.row.smart.epoch);
  assert.notEqual(fresh.id, f.row.id);
  const old = await db.lessonSession.findUniqueOrThrow({
    where: { id: f.row.id },
  });
  assert.equal(old.status, "INTERRUPTED");
  assert.deepEqual(old.moves, []);
  const ended = await f.service.action(f.actor, fresh.id, {
    action: "interrupt",
    version: fresh.version,
    epoch: fresh.smart.epoch,
  });
  assert.equal(ended.status, "INTERRUPTED");
  await assert.rejects(
    f.service.action(f.actor, fresh.id, {
      ...body,
      version: ended.version,
      epoch: ended.smart.epoch,
    }),
  );
  assert.equal(
    await db.progress.count({ where: { userId: f.person.u.id } }),
    0,
  );
});
test("smart lesson writes recheck guardian authority and login expiry after real lock waits", async () => {
  const child = await smartPracticeFixture("guardian", true);
  const body = {
    action: "turns",
    version: child.row.version,
    epoch: child.row.smart.epoch,
    turns: [],
    faces: facelets(child.hardware),
    counter: 250,
    independentState: true,
  };
  const denied = await communityLockRace(
    child.guardian.u.id,
    () => child.service.action(child.actor, child.row.id, body),
    (tx) =>
      tx.user.update({
        where: { id: child.guardian.u.id },
        data: { adultVerified: false },
      }),
  );
  assert.equal(denied.error?.getStatus(), 403);
  assert.equal(
    (await db.lessonSession.findUniqueOrThrow({ where: { id: child.row.id } }))
      .version,
    child.row.version,
  );
  const f = await smartPracticeFixture("login-expiry"),
    deadline = Date.now() + 1500;
  await db.session.update({
    where: { id: f.actor.sessionId },
    data: { expiresAt: new Date(deadline) },
  });
  const result = await learningLockDelay("Course", f.course.id, deadline, () =>
    f.service.action(f.actor, f.row.id, {
      ...body,
      version: f.row.version,
      epoch: f.row.smart.epoch,
      faces: facelets(f.hardware),
    }),
  );
  assert.equal(result.error?.getStatus(), 403);
  assert.equal(
    (await db.lessonSession.findUniqueOrThrow({ where: { id: f.row.id } }))
      .version,
    f.row.version,
  );
});

test("smart lesson private context is exported to its owner and erased by account deletion", async () => {
  const f = await smartPracticeFixture("account-erasure");
  await f.service.action(f.actor, f.row.id, {
    action: "interrupt",
    version: f.row.version,
    epoch: f.row.smart.epoch,
  });
  const exported = await call("me/export", undefined, f.person.token);
  assert.equal(exported.status, 200);
  const row = exported.body.lessonSessions.find(
    (item: any) => item.id === f.row.id,
  );
  assert.equal(row.input, "smart");
  assert.equal(row.smart.epoch, f.row.smart.epoch);
  assert.equal(row.smart.model, "gan-356-i3");
  assert.equal("address" in row.smart, false);
  assert.equal("battery" in row.smart, false);
  assert.equal(
    (await call("me", { confirmation: "DELETE" }, f.person.token, "DELETE"))
      .status,
    200,
  );
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(
    await db.lessonSession.count({ where: { userId: f.person.u.id } }),
    0,
  );
  assert.equal(
    await db.progress.count({ where: { userId: f.person.u.id } }),
    0,
  );
});

async function tutorAuthorityFixture(name: string, birthDate = "1990-01-01") {
  const person = await fixture(`tutor-authority-${name}`, birthDate),
    actor = await communityActor(person),
    course = await db.course.findUniqueOrThrow({ where: { id: "3-notation" } }),
    { LearningController } =
      await import("../../apps/api/src/learning.controller");
  assert.equal(course.published, true);
  return {
    person,
    actor,
    course,
    service: new LearningController(db as Db, infrastructure),
    request: {
      lessonId: course.id,
      courseVersion: course.version,
      locale: "en",
      moves: [],
      question: "why",
    },
  };
}
test("tutoring admission uses current adult eligibility instead of captured permission", async () => {
  const { AiTutor } = await import("../../apps/api/src/ai"),
    original = AiTutor.prototype.explain;
  try {
    for (const change of ["adult", "age"] as const) {
      const f = await tutorAuthorityFixture(`admission-${change}`);
      assert.equal(f.actor.policy.adultVerified, true);
      await db.user.update({
        where: { id: f.person.u.id },
        data:
          change === "adult"
            ? { adultVerified: false }
            : { birthDate: "2012-01-01" },
      });
      let admitted: boolean | undefined;
      AiTutor.prototype.explain = async function (...args) {
        admitted = args[2];
        return original.apply(this, args);
      };
      const result = await f.service.tutor(f.actor, f.request);
      assert.equal(admitted, false);
      assert.equal(result.source, "authored");
      assert.equal(
        result.explanation,
        (f.course.content as unknown as Lesson).steps.en.join("\n\n"),
      );
    }
  } finally {
    AiTutor.prototype.explain = original;
  }
});
test("tutoring admission waits for revocation and never starts a provider request for a revoked session", async () => {
  const { AiTutor } = await import("../../apps/api/src/ai"),
    original = AiTutor.prototype.explain,
    f = await tutorAuthorityFixture("locked-admission");
  let called = false;
  AiTutor.prototype.explain = async function (...args) {
    called = true;
    return original.apply(this, args);
  };
  try {
    const result = await communityLockRace(
      f.person.u.id,
      () => f.service.tutor(f.actor, f.request),
      (tx) =>
        tx.session.update({
          where: { id: f.actor.sessionId },
          data: { scope: "DELETION" },
        }),
    );
    assert.equal(result.error?.getStatus(), 403);
    assert.equal(called, false);
  } finally {
    AiTutor.prototype.explain = original;
  }
});
test("pending simulated tutoring withholds replies after adult, account or session authority is revoked", async () => {
  const { AiTutor } = await import("../../apps/api/src/ai"),
    original = AiTutor.prototype.explain;
  assert.equal(infrastructure.config.AI_MODE, "mock");
  try {
    for (const change of [
      "adult",
      "age",
      "scope",
      "expiry",
      "logout",
      "email",
      "deleted",
      "region",
    ] as const) {
      const f = await tutorAuthorityFixture(`delivery-${change}`);
      AiTutor.prototype.explain = async function (...args) {
        assert.equal(args[2], true);
        // Exercise the actual local HTTP simulator; no credentials/live AI.
        const reply = await original.call(
          this,
          args[0],
          args[1],
          args[2],
          args[3],
          {
            baseUrl: "http://127.0.0.1:4010/v1",
            model: "cubers-simulator",
            enabled: true,
          },
        );
        assert.equal(reply.source, "simulated");
        if (change === "scope" || change === "expiry")
          await db.session.update({
            where: { id: f.actor.sessionId },
            data:
              change === "scope"
                ? { scope: "DELETION" }
                : { expiresAt: new Date(Date.now() - 1) },
          });
        else if (change === "logout")
          await db.session.delete({ where: { id: f.actor.sessionId } });
        else
          await db.user.update({
            where: { id: f.person.u.id },
            data:
              change === "adult"
                ? { adultVerified: false }
                : change === "age"
                  ? { birthDate: "2012-01-01" }
                  : change === "email"
                    ? { emailVerified: false }
                    : change === "deleted"
                      ? { deletedAt: new Date() }
                      : { region: "CN" },
          });
        return reply;
      };
      await assert.rejects(
        f.service.tutor(f.actor, f.request),
        (error: any) => error.getStatus?.() === 403,
        change,
      );
    }
  } finally {
    AiTutor.prototype.explain = original;
  }
});
test("pending authored tutoring also rechecks a younger child's guardian and consent", async () => {
  const { AiTutor } = await import("../../apps/api/src/ai"),
    original = AiTutor.prototype.explain;
  try {
    for (const change of ["guardian", "consent"] as const) {
      const f = await tutorAuthorityFixture(`child-${change}`, "2018-01-01"),
        guardian = await fixture(
          `tutor-authority-parent-${change}`,
          "1980-01-01",
        );
      await db.consent.create({
        data: {
          childId: f.person.u.id,
          guardianId: guardian.u.id,
          documentId: randomUUID(),
          status: "APPROVED",
        },
      });
      f.actor = await communityActor(f.person);
      assert.equal(f.actor.policy.guardianVerified, true);
      AiTutor.prototype.explain = async function (...args) {
        assert.equal(args[2], false);
        const reply = await original.apply(this, args);
        assert.equal(reply.source, "authored");
        if (change === "guardian")
          await db.user.update({
            where: { id: guardian.u.id },
            data: { adultVerified: false },
          });
        else
          await db.consent.update({
            where: { childId: f.person.u.id },
            data: { status: "REVOKED" },
          });
        return reply;
      };
      await assert.rejects(
        f.service.tutor(f.actor, f.request),
        (error: any) => error.getStatus?.() === 403,
        change,
      );
    }
  } finally {
    AiTutor.prototype.explain = original;
  }
});

test("regional custom-course capacity is serialized across simultaneous administrator creation", async () => {
  const editor = await fixture("course-capacity-editor", "1990-01-01", "ADMIN"),
    existing = await db.course.count({
      where: { id: { startsWith: "custom-" } },
    });
  assert.ok(existing < 999);
  const ids = Array.from(
      { length: 999 - existing },
      () => `custom-${randomUUID()}`,
    ),
    createdIds: string[] = [];
  try {
    await db.course.createMany({
      data: ids.map((id) => ({
        id,
        puzzle: "3x3",
        level: "beginner",
        content: { id, ...courseDraft() },
        published: false,
      })),
    });
    const request = {
      lesson: courseDraft(),
      reason: "Synthetic concurrent regional capacity test",
    };
    const responses = await Promise.all([
      call("admin/courses", request, editor.token),
      call("admin/courses", request, editor.token),
    ]);
    createdIds.push(
      ...responses.filter((r) => r.status === 201).map((r) => r.body.id),
    );
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    assert.equal(
      await db.course.count({ where: { id: { startsWith: "custom-" } } }),
      1000,
    );
  } finally {
    await db.course.deleteMany({
      where: { id: { in: [...ids, ...createdIds] } },
    });
  }
});

// Scheduled competitions use real HTTP attempts; schedule changes below are test-clock fixtures only.
async function competitionFixture(
  options: {
    puzzle?: string;
    input?: string;
    ranked?: boolean;
    capacity?: number;
    formats?: string[];
  } = {},
  base = origin,
) {
  const now = Date.now(),
    title = { en: `Competition ${runId}`, zh: "测试比赛" };
  const created = await call(
    "admin/competitions",
    {
      title,
      description: {
        en: "Private results and reviewed sharing.",
        zh: "成绩私密，分享须审核。",
      },
      puzzle: options.puzzle || "3x3",
      input: options.input || "virtual",
      ranked: options.ranked ?? false,
      capacity: options.capacity ?? 100,
      registrationOpensAt: new Date(now - 60000).toISOString(),
      registrationClosesAt: new Date(now + 600000).toISOString(),
      rounds: (options.formats || ["BEST1"]).map((format, index) => ({
        title: { en: `Round ${index + 1}`, zh: `第 ${index + 1} 轮` },
        format,
        opensAt: new Date(now + 1200000 + index * 600000).toISOString(),
        closesAt: new Date(now + 1800000 + index * 600000).toISOString(),
      })),
    },
    adminToken,
    undefined,
    base,
  );
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(JSON.stringify(created.body).includes("scrambles"), false);
  const published = await call(
    `admin/competitions/${created.body.id}/publish`,
    {
      expectedVersion: 1,
      englishReviewed: true,
      chineseReviewed: true,
      rulesReviewed: true,
      rightsConfirmed: true,
    },
    adminToken,
    undefined,
    base,
  );
  assert.equal(published.status, 201, JSON.stringify(published.body));
  return (
    await call(
      `competitions/${created.body.id}`,
      undefined,
      adultToken,
      undefined,
      base,
    )
  ).body;
}
async function competitionRegister(event: any, token: string) {
  const response = await call(
    `competitions/${event.id}/register`,
    { expectedVersion: event.version, privateResultsUnderstood: true },
    token,
  );
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body;
}
async function competitionOpen(event: any, index = 0) {
  await db.competition.update({
    where: { id: event.id },
    data: { registrationClosesAt: new Date(Date.now() - 60000) },
  });
  await db.competitionRound.update({
    where: { id: event.rounds[index].id },
    data: {
      opensAt: new Date(Date.now() - 60000),
      closesAt: new Date(Date.now() + 600000),
    },
  });
}
async function competitionEnter(
  event: any,
  token: string,
  index = 0,
  roundIndex = 0,
) {
  const response = await call(
    `competitions/${event.id}/rounds/${event.rounds[roundIndex].id}/attempts`,
    { index },
    token,
  );
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body;
}
async function competitionSolve(entered: any, token: string, inspectionMs = 0) {
  const a = entered.attempt;
  assert.equal(
    (await call(`attempts/${a.id}/inspect`, { nonce: a.nonce }, token)).status,
    201,
  );
  if (inspectionMs)
    await db.attempt.update({
      where: { id: a.id },
      data: { inspectionAt: new Date(Date.now() - inspectionMs) },
    });
  assert.equal(
    (await call(`attempts/${a.id}/start`, { nonce: a.nonce }, token)).status,
    201,
  );
  const moves = [...a.scramble]
    .reverse()
    .map((m: string) =>
      m.endsWith("2") ? m : m.endsWith("'") ? m.slice(0, -1) : `${m}'`,
    );
  assert.equal(
    (
      await call(
        `attempts/${a.id}/moves`,
        {
          nonce: a.nonce,
          events: moves.map((move: string, sequence: number) => ({
            move,
            sequence,
            elapsedMs: 0,
          })),
        },
        token,
      )
    ).status,
    201,
  );
  await new Promise((resolve) => setTimeout(resolve, 320));
  const finished = await call(
    `attempts/${a.id}/finish`,
    { nonce: a.nonce },
    token,
  );
  assert.equal(finished.status, 201, JSON.stringify(finished.body));
  assert.equal(finished.body.status, "APPROVED");
  return finished.body;
}
async function competitionClose(event: any, index = 0) {
  await db.competitionRound.update({
    where: { id: event.rounds[index].id },
    data: { closesAt: new Date() },
  });
}
async function competitionShare(event: any, token: string, scope = "overall") {
  const mine = (await call(`competitions/${event.id}`, undefined, token)).body
    .mine;
  const response = await call(
    `competitions/${event.id}/share`,
    { scope, digest: mine.digests[scope], sharingUnderstood: true },
    token,
  );
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body;
}
const competitionApproval = (row: any, approve = true) => ({
  revision: row.revision,
  digest: row.digest,
  approve,
  checkedExactResult: true,
  reason: "Checked the exact anonymous result and sharing eligibility",
});

test("WCA virtual learning stores real generator provenance without inventing provenance for older attempts or daily sets", async () => {
  const person = await fixture("wca-learning-provenance", "1990-01-01");
  for (const puzzle of Object.keys(WCA_EVENTS) as (keyof typeof WCA_EVENTS)[]) {
    const response = await call(
      "first-solves",
      { puzzle, input: "virtual" },
      person.token,
    );
    assert.equal(response.status, 201, JSON.stringify(response.body));
    const row = await db.guidedSolve.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    assert.deepEqual(row.scrambleSource, {
      ...WCA_PROGRAM,
      event: WCA_EVENTS[puzzle],
    });
    for (const bad of [
      { program: "fake" },
      { ...WCA_PROGRAM, event: "invalid" },
      { ...WCA_PROGRAM, event: WCA_EVENTS[puzzle], extra: true },
    ])
      await assert.rejects(
        db.$executeRaw`UPDATE "GuidedSolve" SET "scrambleSource"=${JSON.stringify(bad)}::jsonb WHERE id=${row.id}::uuid`,
      );
    assert.deepEqual(
      (await db.guidedSolve.findUniqueOrThrow({ where: { id: row.id } }))
        .scrambleSource,
      row.scrambleSource,
    );
  }
  const room = await db.room.create({
    data: {
      ownerId: person.u.id,
      code: randomUUID(),
      puzzle: "3x3",
      input: "virtual",
      mode: "race",
      ranked: false,
      private: true,
      status: "ACTIVE",
    },
  });
  await db.roomMember.create({
    data: { roomId: room.id, userId: person.u.id },
  });
  const old = await db.attempt.create({
    data: {
      userId: person.u.id,
      roomId: room.id,
      nonce: randomUUID(),
      scramble: ["R"],
    },
  });
  assert.equal(
    (await call(`rooms/${room.id}/attempts`, {}, person.token)).status,
    409,
  );
  const retained = await db.attempt.findUniqueOrThrow({
    where: { id: old.id },
  });
  assert.deepEqual(retained.scramble, ["R"]);
  assert.equal(retained.scrambleSource, null);
  const legacyKey = `daily:3x3:${new Date().toISOString().slice(0, 10)}`;
  await db.setting.upsert({
    where: { key: legacyKey },
    create: { key: legacyKey, value: ["R"] },
    update: { value: ["R"] },
  });
  const made = await call(
    "rooms",
    {
      puzzle: "3x3",
      input: "virtual",
      mode: "daily",
      ranked: false,
      private: true,
    },
    person.token,
  );
  await call(`rooms/${made.body.id}/start`, {}, person.token);
  const current = await call(
    `rooms/${made.body.id}/attempts`,
    {},
    person.token,
  );
  assert.equal(current.status, 201);
  assert.deepEqual(current.body.scrambleSource, {
    ...WCA_PROGRAM,
    event: "333",
  });
  assert.notDeepEqual(current.body.scramble, ["R"]);
  assert.deepEqual(
    (await db.setting.findUniqueOrThrow({ where: { key: legacyKey } })).value,
    ["R"],
  );
});
test("WCA program failure denies solve attempts while the authored sprint task remains independent", async () => {
  const person = await fixture("wca-program-failure", "1990-01-01"),
    actor = await communityActor(person);
  let requests = 0;
  const infra = new Infrastructure(infrastructure.config),
    controller = new PlayController(
      db as Db,
      infra,
      new Competitions(db as Db, infra),
    );
  infra.scrambles.generate = async () => {
    requests++;
    throw new ServiceUnavailableException();
  };
  try {
    for (const mode of ["race", "sprint"]) {
      const room = await db.room.create({
        data: {
          ownerId: person.u.id,
          code: randomUUID(),
          puzzle: "3x3",
          input: "virtual",
          mode,
          ranked: false,
          private: true,
          status: "ACTIVE",
        },
      });
      await db.roomMember.create({
        data: { roomId: room.id, userId: person.u.id },
      });
      if (mode === "race") {
        await assert.rejects(
          controller.attempt(actor, room.id),
          (e: any) => e.getStatus?.() === 503,
        );
        assert.equal(await db.attempt.count({ where: { roomId: room.id } }), 0);
      } else {
        const task = await controller.attempt(actor, room.id);
        assert.deepEqual(task.scramble, []);
        assert.equal(task.scrambleSource, null);
      }
    }
    assert.equal(requests, 1);
  } finally {
    await infra.close();
  }
});
test("WCA game generation uses real community-generator scrambles for every puzzle, mode and shared daily set", async () => {
  const person = await fixture("wca-game-adult", "1990-01-01"),
    other = await fixture("wca-game-peer", "1990-01-01");
  for (const puzzle of Object.keys(WCA_EVENTS) as (keyof typeof WCA_EVENTS)[]) {
    for (const mode of ["race", "pattern", "daily", "relay", "sprint"]) {
      const made = await call(
        "rooms",
        { puzzle, input: "virtual", mode, ranked: false, private: true },
        person.token,
      );
      assert.equal(made.status, 201, JSON.stringify(made.body));
      const room = made.body;
      if (mode === "relay")
        assert.equal(
          (await call("rooms/join", { code: room.code }, other.token)).status,
          201,
        );
      assert.equal(
        (await call(`rooms/${room.id}/start`, {}, person.token)).status,
        201,
      );
      const current = await db.room.findUniqueOrThrow({
          where: { id: room.id },
        }),
        token =
          mode === "relay" && current.roster[0] === other.u.id
            ? other.token
            : person.token;
      const issued = await call(
        `rooms/${room.id}/attempts`,
        { scramble: ["R"], scrambleSource: { program: "forged" } },
        token,
      );
      assert.equal(issued.status, 201, JSON.stringify(issued.body));
      if (mode === "sprint") {
        assert.deepEqual(issued.body.scramble, []);
        assert.equal(issued.body.scrambleSource, null);
      } else {
        assert.deepEqual(issued.body.scrambleSource, {
          ...WCA_PROGRAM,
          event: WCA_EVENTS[puzzle],
        });
        const state = practiceApply(solvedPuzzle(puzzle), issued.body.scramble);
        assert.equal(practiceSolved(state), false);
        assert.equal(
          practiceSolved(practiceApply(state, inverse(issued.body.scramble))),
          true,
        );
      }
      assert.equal(
        (await call(`rooms/${room.id}/attempts`, {}, token)).status,
        409,
      );
      if (mode === "daily") {
        const another = await call(
          "rooms",
          { puzzle, input: "virtual", mode, ranked: false, private: true },
          other.token,
        );
        await call(`rooms/${another.body.id}/start`, {}, other.token);
        const shared = await call(
          `rooms/${another.body.id}/attempts`,
          {},
          other.token,
        );
        assert.equal(shared.status, 201);
        assert.deepEqual(shared.body.scramble, issued.body.scramble);
        assert.deepEqual(
          shared.body.scrambleSource,
          issued.body.scrambleSource,
        );
      }
    }
  }
});
test("WCA generator waits hold no account or room locks and cannot commit revoked session, consent or membership authority", async () => {
  for (const change of ["session", "consent", "membership", "room"] as const) {
    const parent = await fixture(`wca-wait-parent-${change}`, "1985-01-01"),
      person = await fixture(
        `wca-wait-${change}`,
        change === "consent" ? "2018-01-01" : "1990-01-01",
      );
    if (change === "consent")
      await db.consent.create({
        data: {
          childId: person.u.id,
          guardianId: parent.u.id,
          documentId: randomUUID(),
          status: "APPROVED",
          publicPosting: true,
        },
      });
    const actor = await communityActor(person);
    const room = await db.room.create({
      data: {
        ownerId: person.u.id,
        code: randomUUID(),
        puzzle: "3x3",
        input: "virtual",
        mode: "daily",
        ranked: false,
        private: true,
        status: "ACTIVE",
      },
    });
    await db.roomMember.create({
      data: { roomId: room.id, userId: person.u.id },
    });
    let reached!: () => void, release!: () => void;
    const requested = new Promise<void>((r) => {
        reached = r;
      }),
      gate = new Promise<void>((r) => {
        release = r;
      });
    const infra = new Infrastructure(infrastructure.config),
      controller = new PlayController(
        db as Db,
        infra,
        new Competitions(db as Db, infra),
      );
    infra.scrambles.generate = async (puzzle, count = 1) => {
      reached();
      await gate;
      return parseWcaSet(puzzle, Array(count).fill("R U F R2 U' F2"), count);
    };
    // A fresh daily key is needed so this authority test actually reaches the
    // community generator, rather than reading an already issued shared challenge.
    const key = `daily-wca:${WCA_PROGRAM.program}:${WCA_PROGRAM.version}:${WCA_PROGRAM.filter}:3x3:${new Date().toISOString().slice(0, 10)}`;
    await db.setting.deleteMany({ where: { key } });
    const result = controller.attempt(actor, room.id).then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error }),
    );
    try {
      await Promise.race([
        requested,
        result.then(() => {
          throw Error("Expected a program request");
        }),
        new Promise((_, reject) => {
          const t = setTimeout(
            () => reject(Error("Program probe timeout")),
            3000,
          );
          t.unref();
        }),
      ]);
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout='1000ms'`;
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${person.u.id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${room.id}::uuid FOR UPDATE`;
        if (change === "session")
          await tx.session.delete({ where: { id: actor.sessionId } });
        else if (change === "consent")
          await tx.consent.update({
            where: { childId: person.u.id },
            data: { status: "REVOKED" },
          });
        else if (change === "membership")
          await tx.roomMember.deleteMany({
            where: { roomId: room.id, userId: person.u.id },
          });
        else
          await tx.room.update({
            where: { id: room.id },
            data: { status: "CLOSED" },
          });
      });
      release();
      assert.equal(
        (await result).error?.getStatus(),
        change === "room" ? 409 : 403,
        change,
      );
      assert.equal(await db.attempt.count({ where: { roomId: room.id } }), 0);
      assert.equal(
        await db.setting.count({ where: { key } }),
        0,
        "Failed admission must not publish a daily cache",
      );
    } finally {
      release();
      await result;
      await infra.close();
    }
  }
});
test("WCA publication rechecks staff after community generator generation and preserves an unpublished draft on revocation", async () => {
  const staff = await fixture("wca-publish-authority", "1985-01-01", "ADMIN"),
    actor = await communityActor(staff);
  let reached!: () => void, release!: () => void;
  const requested = new Promise<void>((r) => {
      reached = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  const infra = new Infrastructure(infrastructure.config),
    service = new Competitions(db as Db, infra),
    now = Date.now();
  infra.scrambles.generate = async (puzzle, count = 1) => {
    reached();
    await gate;
    return parseWcaSet(puzzle, Array(count).fill("R U F R2 U' F2"), count);
  };
  const event = await service.create(actor, {
    title: { en: `Competition ${runId}`, zh: "测试比赛" },
    description: {
      en: "Synthetic WCA publication authority",
      zh: "WCA 发布权限测试",
    },
    puzzle: "3x3",
    input: "virtual",
    ranked: false,
    capacity: 10,
    registrationOpensAt: new Date(now - 1000).toISOString(),
    registrationClosesAt: new Date(now + 60000).toISOString(),
    rounds: [
      {
        title: { en: "Round", zh: "轮次" },
        format: "BEST1",
        opensAt: new Date(now + 120000).toISOString(),
        closesAt: new Date(now + 240000).toISOString(),
      },
    ],
  });
  const result = service
    .publish(actor, event.id, {
      expectedVersion: 1,
      englishReviewed: true,
      chineseReviewed: true,
      rulesReviewed: true,
      rightsConfirmed: true,
    })
    .then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error }),
    );
  try {
    await Promise.race([
      requested,
      result.then(() => {
        throw Error("Expected a program request");
      }),
      new Promise((_, reject) => {
        const t = setTimeout(
          () => reject(Error("Program probe timeout")),
          3000,
        );
        t.unref();
      }),
    ]);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout='1000ms'`;
      await tx.user.update({
        where: { id: staff.u.id },
        data: { role: "USER" },
      });
      await tx.$queryRaw`SELECT id FROM "Competition" WHERE id=${event.id}::uuid FOR UPDATE`;
    });
    release();
    assert.equal((await result).error?.getStatus(), 403);
    const saved = await db.competition.findUniqueOrThrow({
      where: { id: event.id },
      include: { rounds: true },
    });
    assert.equal(saved.status, "DRAFT");
    assert.equal(saved.version, 1);
    assert.deepEqual(saved.rounds[0].scrambles, []);
    assert.equal(saved.rounds[0].scrambleSource, null);
    assert.equal(
      await db.audit.count({
        where: { actorId: staff.u.id, action: "competition.publish" },
      }),
      0,
    );
  } finally {
    release();
    await result;
    await infra.close();
  }
});
test("scheduled competition connects real virtual solves for every puzzle, with shared scrambles and private results", async () => {
  const other = await fixture("competition-other", "1994-01-01");
  for (const puzzle of ["2x2", "3x3", "4x4", "pyraminx"]) {
    const event = await competitionFixture({ puzzle, ranked: true });
    const entry = await competitionRegister(event, adultToken);
    await competitionRegister(event, other.token);
    assert.equal(
      (
        await call(
          `competitions/${event.id}/rounds/${event.rounds[0].id}/attempts`,
          { index: 0 },
          adultToken,
        )
      ).status,
      409,
    );
    await competitionOpen(event);
    const a = await competitionEnter(event, adultToken),
      b = await competitionEnter(event, other.token);
    assert.deepEqual(a.attempt.scramble, b.attempt.scramble);
    assert.deepEqual(a.attempt.scrambleSource, {
      ...WCA_PROGRAM,
      event: WCA_EVENTS[puzzle as keyof typeof WCA_EVENTS],
    });
    assert.deepEqual(b.attempt.scrambleSource, a.attempt.scrambleSource);
    assert.notEqual(a.attempt.nonce, b.attempt.nonce);
    assert.equal(
      (await call(`rooms/${a.roomId}/attempts`, {}, adultToken)).status,
      403,
    );
    assert.equal(
      (await call(`rooms/${a.roomId}/start`, {}, adultToken)).status,
      403,
    );
    assert.equal(
      (await call(`rooms/${a.roomId}`, undefined, other.token)).status,
      403,
    );
    const room = await db.room.findUniqueOrThrow({ where: { id: a.roomId } });
    assert.equal(
      (await call("rooms/join", { code: room.code }, other.token)).status,
      404,
    );
    const result = await competitionSolve(
      a,
      adultToken,
      puzzle === "2x2" ? 16000 : 0,
    );
    if (puzzle === "2x2") assert.equal(result.penaltyMs, 2000);
    const before = (
      await call(`competitions/${event.id}`, undefined, adultToken)
    ).body;
    assert.equal(
      (
        await call(
          `competitions/${event.id}/share`,
          {
            scope: "overall",
            digest: before.mine.digests.overall,
            sharingUnderstood: true,
          },
          adultToken,
        )
      ).status,
      409,
    );
    await competitionClose(event);
    assert.equal(
      (await call(`competitions/${event.id}/board`, undefined, adultToken)).body
        .items.length,
      0,
    );
    assert.equal(
      (await call(`competitions/${event.id}`, undefined, other.token)).body.mine
        .number === entry.number,
      false,
    );
    assert.equal(
      (
        await call(
          `competitions/${event.id}/share`,
          { scope: "overall", digest: "0".repeat(64), sharingUnderstood: true },
          adultToken,
        )
      ).status,
      409,
    );
    const pub = await competitionShare(event, adultToken);
    assert.equal(pub.status, "READY");
    assert.equal(pub.snapshot.score.units, result.durationMs * 3);
    const board = (
      await call(`competitions/${event.id}/board`, undefined, other.token)
    ).body;
    assert.deepEqual(Object.keys(board.items[0]).sort(), [
      "number",
      "rank",
      "score",
    ]);
    assert.equal(board.items[0].number, entry.number);
    assert.equal(JSON.stringify(board).includes(adultId), false);
    assert.equal(JSON.stringify(board).includes(a.attempt.id), false);
    const rankings = await call(
      `rankings?puzzle=${puzzle}&input=virtual&mode=race`,
      undefined,
      adultToken,
    );
    assert.equal(
      rankings.body.some((row: any) => row.id === a.attempt.id),
      false,
    );
    assert.equal(
      (
        await call(
          `competitions/${event.id}`,
          undefined,
          adultToken,
          undefined,
          cnOrigin,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await call(
          `competitions/publications/${pub.id}/cancel`,
          competitionApproval(pub, false),
          adultToken,
        )
      ).status,
      201,
    );
    assert.equal(
      (await call(`competitions/${event.id}/board`, undefined, other.token))
        .body.items.length,
      0,
    );
  }
});

test("competition capacity and attempt allocation serialize concurrent requests, and withdrawal prevents reentry after registration", async () => {
  const a = await fixture("competition-cap-a", "1990-01-01"),
    b = await fixture("competition-cap-b", "1990-01-01"),
    event = await competitionFixture({ capacity: 1, formats: ["BEST3"] });
  const registrations = await Promise.all(
    [a, b].map((u) =>
      call(
        `competitions/${event.id}/register`,
        { expectedVersion: event.version, privateResultsUnderstood: true },
        u.token,
      ),
    ),
  );
  assert.deepEqual(registrations.map((r) => r.status).sort(), [201, 409]);
  const winner = registrations[0].status === 201 ? a : b;
  await competitionOpen(event);
  assert.equal(
    (
      await call(
        `competitions/${event.id}/rounds/${event.rounds[0].id}/attempts`,
        { index: 1 },
        winner.token,
      )
    ).status,
    409,
  );
  const copies = await Promise.all([
    competitionEnter(event, winner.token),
    competitionEnter(event, winner.token),
  ]);
  assert.equal(copies[0].attempt.id, copies[1].attempt.id);
  assert.equal(
    (
      await call(
        `competitions/${event.id}/rounds/${event.rounds[0].id}/attempts`,
        { index: 1 },
        winner.token,
      )
    ).status,
    409,
  );
  await call(`attempts/${copies[0].attempt.id}/interrupt`, {}, winner.token);
  const second = await competitionEnter(event, winner.token, 1);
  assert.notEqual(second.attempt.id, copies[0].attempt.id);
  assert.equal(
    (
      await call(
        `competitions/${event.id}/withdraw`,
        { confirmation: "WITHDRAW" },
        winner.token,
      )
    ).status,
    201,
  );
  assert.equal(
    (await db.attempt.findUniqueOrThrow({ where: { id: second.attempt.id } }))
      .status,
    "INTERRUPTED",
  );
  assert.equal(
    (
      await call(
        `competitions/${event.id}/register`,
        { expectedVersion: event.version, privateResultsUnderstood: true },
        winner.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        `attempts/${second.attempt.id}/inspect`,
        { nonce: second.attempt.nonce },
        winner.token,
      )
    ).status,
    400,
  );
});

test("competition deadlines reject HTTP and WebSocket move writes independently of delayed maintenance", async () => {
  const event = await competitionFixture(),
    entrant = await fixture("competition-deadline", "1992-01-01");
  await competitionRegister(event, entrant.token);
  await competitionOpen(event);
  const a = await competitionEnter(event, entrant.token);
  await call(
    `attempts/${a.attempt.id}/inspect`,
    { nonce: a.attempt.nonce },
    entrant.token,
  );
  await call(
    `attempts/${a.attempt.id}/start`,
    { nonce: a.attempt.nonce },
    entrant.token,
  );
  const solution = [...a.attempt.scramble]
    .reverse()
    .map((m: string) =>
      m.endsWith("2") ? m : m.endsWith("'") ? m.slice(0, -1) : `${m}'`,
    );
  assert.equal(
    (
      await call(
        `attempts/${a.attempt.id}/moves`,
        {
          nonce: a.attempt.nonce,
          events: solution.map((move: string, sequence: number) => ({
            move,
            sequence,
            elapsedMs: 0,
          })),
        },
        entrant.token,
      )
    ).status,
    201,
  );
  await new Promise((resolve) => setTimeout(resolve, 320));
  await competitionClose(event);
  assert.equal(
    (
      await call(
        `attempts/${a.attempt.id}/moves`,
        {
          nonce: a.attempt.nonce,
          events: [{ move: "R", sequence: solution.length, elapsedMs: 0 }],
        },
        entrant.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        `attempts/${a.attempt.id}/finish`,
        { nonce: a.attempt.nonce },
        entrant.token,
      )
    ).status,
    409,
  );
  const ws = io(`${origin}/play`, {
    auth: { token: entrant.token },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      ws.once("connect", () => resolve());
      ws.once("connect_error", reject);
    });
    const reply = await new Promise<any>((resolve) =>
      ws.emit(
        "attempt.moves",
        {
          attemptId: a.attempt.id,
          nonce: a.attempt.nonce,
          events: [{ move: "R", sequence: solution.length, elapsedMs: 0 }],
        },
        resolve,
      ),
    );
    assert.equal(reply?.ok === true, false);
  } finally {
    ws.disconnect();
  }
  assert.equal(
    (await db.attempt.findUniqueOrThrow({ where: { id: a.attempt.id } }))
      .moves instanceof Array,
    true,
  );
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(
    (await db.attempt.findUniqueOrThrow({ where: { id: a.attempt.id } }))
      .status,
    "INTERRUPTED",
  );
});

test("child competition sharing requires exact guardian and independent MFA reviews; revocation prevents reappearance", async () => {
  const guardian = await fixture("competition-parent", "1987-01-01"),
    child = await fixture("competition-kid", "2018-01-01", "USER", false),
    reviewer = await fixture("competition-mod", "1990-01-01", "ADMIN"),
    event = await competitionFixture();
  const consent = await db.consent.create({
    data: {
      childId: child.u.id,
      guardianId: guardian.u.id,
      documentId: randomUUID(),
      status: "APPROVED",
      publicPosting: true,
      recording: true,
      reviewedAt: new Date(),
    },
  });
  await competitionRegister(event, child.token);
  await competitionOpen(event);
  const a = await competitionEnter(event, child.token);
  await competitionSolve(a, child.token);
  await competitionClose(event);
  let pub = await competitionShare(event, child.token);
  assert.equal(pub.status, "PENDING_GUARDIAN");
  assert.equal(
    (
      await call(
        `admin/competition-publications/${pub.id}/review`,
        competitionApproval(pub),
        reviewer.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        `guardian/competition-publications/${pub.id}/review`,
        competitionApproval(pub),
        adultToken,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `guardian/competition-publications/${pub.id}/review`,
        { ...competitionApproval(pub), digest: "0".repeat(64) },
        guardian.token,
      )
    ).status,
    409,
  );
  const parent = await call(
    `guardian/competition-publications/${pub.id}/review`,
    competitionApproval(pub),
    guardian.token,
  );
  assert.equal(parent.status, 201);
  pub = parent.body;
  assert.equal(pub.status, "PENDING_REVIEW");
  assert.equal(
    (
      await call(
        `admin/competition-publications/${pub.id}/review`,
        competitionApproval(pub),
        reviewer.token,
      )
    ).status,
    201,
  );
  assert.equal(
    (await call(`competitions/${event.id}/board`, undefined, adultToken)).body
      .items.length,
    1,
  );
  const exported = await call("me/export", undefined, child.token);
  assert.ok(
    exported.body.competitionEntries.some(
      (e: any) => e.competitionId === event.id,
    ),
  );
  assert.equal(
    "consentDigest" in exported.body.competitionEntries[0].publications[0],
    false,
  );
  assert.equal(
    (
      await call(
        `guardian/children/${child.u.id}/consent`,
        undefined,
        guardian.token,
        "DELETE",
      )
    ).status,
    200,
  );
  assert.equal(
    (await call(`competitions/${event.id}/board`, undefined, adultToken)).body
      .items.length,
    0,
  );
  assert.equal(
    (
      await call("guardian/competition-publications", undefined, guardian.token)
    ).body.items.some((row: any) => row.id === pub.id),
    false,
  );
  await db.consent.update({
    where: { id: consent.id },
    data: {
      status: "APPROVED",
      publicPosting: true,
      recording: true,
      reviewedAt: new Date(),
    },
  });
  assert.equal(
    (await call(`competitions/${event.id}/board`, undefined, adultToken)).body
      .items.length,
    0,
  );
  await db.user.update({
    where: { id: child.u.id },
    data: { birthDate: "1990-01-01" },
  });
  assert.equal(
    (
      await call("guardian/competition-publications", undefined, guardian.token)
    ).body.items.some((row: any) => row.id === pub.id),
    false,
  );
  assert.equal(
    (
      await call(
        `guardian/competition-publications/${pub.id}/cancel`,
        competitionApproval(pub, false),
        guardian.token,
      )
    ).status,
    403,
  );
});

test("scheduled physical results stay private and provisional, corrections withdraw sharing and update placements", async () => {
  const event = await competitionFixture({ input: "scan", ranked: true }),
    entrant = await fixture("competition-camera", "1990-01-01");
  await competitionRegister(event, entrant.token);
  await competitionOpen(event);
  const entered = await competitionEnter(event, entrant.token),
    a = entered.attempt;
  const faces = facelets(practiceApply(solvedPuzzle("3x3"), a.scramble) as any);
  assert.equal(
    (await call(`attempts/${a.id}/record`, { nonce: a.nonce }, entrant.token))
      .status,
    201,
  );
  assert.equal(
    (
      await call(
        `attempts/${a.id}/checkpoint`,
        { nonce: a.nonce, stage: "scramble", faces },
        entrant.token,
      )
    ).status,
    201,
  );
  assert.equal(
    (await call(`attempts/${a.id}/inspect`, { nonce: a.nonce }, entrant.token))
      .status,
    201,
  );
  assert.equal(
    (await call(`attempts/${a.id}/start`, { nonce: a.nonce }, entrant.token))
      .status,
    201,
  );
  await new Promise((resolve) => setTimeout(resolve, 320));
  const finish = await call(
    `attempts/${a.id}/finish`,
    { nonce: a.nonce },
    entrant.token,
  );
  assert.equal(finish.body.status, "AWAITING_EVIDENCE");
  await competitionClose(event);
  assert.equal(
    (
      await call(
        `attempts/${a.id}/checkpoint`,
        { nonce: a.nonce, stage: "final", faces: facelets(solvedCube()) },
        entrant.token,
      )
    ).status,
    201,
  );
  const pending = (
    await call(`competitions/${event.id}`, undefined, entrant.token)
  ).body.mine;
  assert.equal(pending.results.score.status, "PENDING");
  assert.equal(
    (
      await call(
        `competitions/${event.id}/share`,
        {
          scope: "overall",
          digest: pending.digests.overall,
          sharingUnderstood: true,
        },
        entrant.token,
      )
    ).status,
    409,
  );
  const media = await db.media.create({
    data: {
      userId: entrant.u.id,
      key: `INTL/${runId}/competition-evidence-${a.id}`,
      purpose: "evidence",
      attemptId: a.id,
      type: "video/mp4",
      size: 1000,
      status: "READY",
      durationMs: 30000,
    },
  });
  assert.equal(
    (
      await call(
        `attempts/${a.id}/evidence`,
        { nonce: a.nonce, evidenceId: media.id },
        entrant.token,
      )
    ).body.status,
    "PROVISIONAL",
  );
  const checklist = {
    approve: true,
    reason: "Reviewed uninterrupted private evidence for this exact attempt",
    evidenceChecked: true,
    uninterrupted: true,
    scrambleMatches: true,
    cubeAndHandsVisible: true,
    finalStateSolved: true,
  };
  assert.equal(
    (await call(`admin/attempts/${a.id}/review`, checklist, adminToken)).status,
    201,
  );
  const pub = await competitionShare(event, entrant.token);
  assert.equal(pub.status, "READY");
  assert.equal(
    (await call(`competitions/${event.id}/board`, undefined, adultToken)).body
      .items.length,
    1,
  );
  assert.equal(
    (
      await call(
        `admin/attempts/${a.id}/review`,
        {
          ...checklist,
          approve: false,
          reason:
            "Evidence correction: scramble mismatch was identified on reinspection",
        },
        adminToken,
      )
    ).status,
    201,
  );
  assert.equal(
    (await call(`competitions/${event.id}/board`, undefined, adultToken)).body
      .items.length,
    0,
  );
  assert.equal(
    (
      await db.competitionPublication.findUniqueOrThrow({
        where: { id: pub.id },
      })
    ).status,
    "CANCELLED",
  );
  assert.equal(
    (await call(`admin/attempts/${a.id}/review`, checklist, adminToken)).status,
    201,
  );
  assert.equal(
    (await call(`competitions/${event.id}/board`, undefined, adultToken)).body
      .items.length,
    0,
  );
});

test("competition cancellation stops attempts and retention removes publication links without entering generic rankings", async () => {
  const event = await competitionFixture({ ranked: true }),
    entrant = await fixture("competition-retention", "1990-01-01");
  await competitionRegister(event, entrant.token);
  await competitionOpen(event);
  const entered = await competitionEnter(event, entrant.token);
  await competitionSolve(entered, entrant.token);
  await competitionClose(event);
  const pub = await competitionShare(event, entrant.token);
  assert.equal(
    (
      await call(
        `admin/competitions/${event.id}/cancel`,
        {
          expectedVersion: event.version,
          reason: "Cancelled after review of this synthetic test schedule",
        },
        adminToken,
      )
    ).status,
    201,
  );
  assert.equal(
    (await call(`competitions/${event.id}/board`, undefined, adultToken)).body
      .items.length,
    0,
  );
  assert.ok(
    await db.notification.findFirst({
      where: {
        userId: entrant.u.id,
        title: { contains: "Competition cancelled" },
      },
    }),
  );
  await db.competition.update({
    where: { id: event.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(await db.competition.count({ where: { id: event.id } }), 0);
  assert.equal(
    await db.competitionPublication.count({ where: { id: pub.id } }),
    0,
  );
  const room = await db.room.findUniqueOrThrow({
    where: { id: entered.roomId },
  });
  assert.equal(room.competitionAttempt, true);
  assert.equal(room.competitionEntryId, null);
  assert.equal(
    (await db.attempt.findUniqueOrThrow({ where: { id: entered.attempt.id } }))
      .status,
    "APPROVED",
  );
  assert.equal(
    (
      await call(
        "rankings?puzzle=3x3&input=virtual&mode=race",
        undefined,
        adultToken,
      )
    ).body.some((r: any) => r.id === entered.attempt.id),
    false,
  );
  assert.equal(
    (await call(`rooms/${room.id}/attempts`, {}, entrant.token)).status,
    403,
  );
  const audit = await db.audit.findMany({
    where: {
      action: { startsWith: "competition." },
      targetId: "expired-competition",
    },
  });
  assert.ok(audit.length > 0);
  assert.equal(JSON.stringify(audit).includes(entrant.u.id), false);
});

test("multi-round competitions keep round scopes separate, calculate exact aggregates and share tied places", async () => {
  const event = await competitionFixture({
      formats: ["MEAN3", "AVERAGE5", "BEST3"],
    }),
    owner = await fixture("competition-formats", "1990-01-01"),
    tied = await fixture("competition-tie", "1990-01-01");
  await competitionRegister(event, owner.token);
  await competitionRegister(event, tied.token);
  const expected = [3003, 3006, 3000];
  for (let round = 0; round < 3; round++) {
    await competitionOpen(event, round);
    const count = [3, 5, 3][round];
    for (let index = 0; index < count; index++) {
      const entered = await competitionEnter(event, owner.token, index, round);
      if ((round === 1 && index === 4) || (round === 2 && index > 0))
        await call(`attempts/${entered.attempt.id}/interrupt`, {}, owner.token);
      else {
        await competitionSolve(entered, owner.token);
        await db.attempt.update({
          where: { id: entered.attempt.id },
          data: { durationMs: 1000 + index },
        });
      }
    }
    if (round === 0) {
      for (let index = 0; index < 3; index++) {
        const entered = await competitionEnter(event, tied.token, index);
        await competitionSolve(entered, tied.token);
        await db.attempt.update({
          where: { id: entered.attempt.id },
          data: { durationMs: 1000 + index },
        });
      }
    }
    await competitionClose(event, round);
    const pub = await competitionShare(
      event,
      owner.token,
      event.rounds[round].id,
    );
    assert.equal(pub.snapshot.score.units, expected[round]);
    const uppercase = await call(
      `competitions/${event.id.toUpperCase()}/share`,
      {
        scope: event.rounds[round].id.toUpperCase(),
        digest: pub.digest,
        sharingUnderstood: true,
      },
      owner.token,
    );
    assert.equal(uppercase.status, 201);
    assert.equal(uppercase.body.id, pub.id);
    if (round === 0) {
      await competitionShare(event, tied.token, event.rounds[0].id);
      const board = (
        await call(
          `competitions/${event.id}/board?scope=${event.rounds[0].id}`,
          undefined,
          owner.token,
        )
      ).body;
      assert.deepEqual(
        board.items.map((x: any) => x.rank),
        [1, 1],
      );
      const privateResult = (
        await call(`competitions/${event.id}`, undefined, owner.token)
      ).body.mine;
      assert.equal(
        (
          await call(
            `competitions/${event.id}/share`,
            {
              scope: "overall",
              digest: privateResult.digests.overall,
              sharingUnderstood: true,
            },
            owner.token,
          )
        ).status,
        409,
      );
    }
  }
  const overall = await competitionShare(event, owner.token);
  assert.equal(overall.snapshot.score.units, 9009);
  assert.equal(
    (await call(`competitions/${event.id}/board`, undefined, owner.token)).body
      .items.length,
    1,
  );
  const dnf = await competitionShare(event, tied.token);
  assert.equal(dnf.snapshot.score.status, "DNF");
  const withDnf = (
    await call(`competitions/${event.id}/board`, undefined, owner.token)
  ).body.items;
  assert.equal(withDnf[1].rank, null);
  assert.equal(withDnf[1].score.status, "DNF");
});

test("competition writes recheck captured staff authority and factor generation after waiting for account locks", async () => {
  const { Competitions } = await import("../../apps/api/src/competitions");
  const source = await competitionFixture();
  const definition = {
    title: source.title,
    description: source.description,
    puzzle: source.puzzle,
    input: source.input,
    ranked: source.ranked,
    capacity: source.capacity,
    registrationOpensAt: source.registrationOpensAt,
    registrationClosesAt: source.registrationClosesAt,
    rounds: source.rounds.map(({ title, format, opensAt, closesAt }: any) => ({
      title,
      format,
      opensAt,
      closesAt,
    })),
  };
  for (const change of ["role", "generation"]) {
    const editor = await fixture(
        `competition-stale-${change}`,
        "1990-01-01",
        "ADMIN",
      ),
      session = await db.session.findFirstOrThrow({
        where: { userId: editor.u.id },
      }),
      service = new Competitions(db as Db, infrastructure);
    let request: Promise<unknown> | undefined,
      settled = false;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${editor.u.id}::uuid FOR UPDATE`;
      request = service
        .create({ user: editor.u, sessionId: session.id } as any, definition)
        .then(
          () => {
            settled = true;
            throw Error("Stale staff request unexpectedly succeeded");
          },
          (error) => {
            settled = true;
            assert.equal(error.getStatus(), 403);
          },
        );
      await new Promise((resolve) => setTimeout(resolve, 75));
      assert.equal(settled, false);
      await tx.user.update({
        where: { id: editor.u.id },
        data:
          change === "role"
            ? { role: "USER" }
            : { mfaGeneration: { increment: 1 } },
      });
    });
    await request;
    assert.equal(
      await db.competition.count({ where: { creatorId: editor.u.id } }),
      0,
    );
  }
});

test("competition exports and account erasure include private entries and publications without retaining public aliases", async () => {
  const event = await competitionFixture(),
    owner = await fixture("competition-erase", "1990-01-01");
  await competitionRegister(event, owner.token);
  await competitionOpen(event);
  const entered = await competitionEnter(event, owner.token);
  await competitionSolve(entered, owner.token);
  await competitionClose(event);
  const pub = await competitionShare(event, owner.token);
  const exported = (await call("me/export", undefined, owner.token)).body;
  assert.ok(
    exported.competitionEntries.some((row: any) =>
      row.publications.some((p: any) => p.id === pub.id),
    ),
  );
  assert.equal(
    (await call("me", { confirmation: "DELETE" }, owner.token, "DELETE"))
      .status,
    200,
  );
  assert.equal(
    (await call(`competitions/${event.id}/board`, undefined, adultToken)).body
      .items.length,
    0,
  );
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(
    await db.competitionEntry.count({ where: { userId: owner.u.id } }),
    0,
  );
  assert.equal(
    await db.competitionPublication.count({ where: { id: pub.id } }),
    0,
  );
  assert.equal(
    await db.attempt.count({ where: { id: entered.attempt.id } }),
    0,
  );
  assert.equal(await db.audit.count({ where: { targetId: pub.id } }), 0);
  assert.equal(
    (
      await db.room.findUniqueOrThrow({ where: { id: entered.roomId } })
    ).roster.includes(owner.u.id),
    false,
  );
});

test("scheduled move admission rechecks the clock after waiting for the attempt row lock", async () => {
  const event = await competitionFixture(),
    owner = await fixture("competition-lock-deadline", "1990-01-01");
  await competitionRegister(event, owner.token);
  await competitionOpen(event);
  const entered = await competitionEnter(event, owner.token),
    a = entered.attempt;
  await call(`attempts/${a.id}/inspect`, { nonce: a.nonce }, owner.token);
  await call(`attempts/${a.id}/start`, { nonce: a.nonce }, owner.token);
  await db.competitionRound.update({
    where: { id: event.rounds[0].id },
    data: { closesAt: new Date(Date.now() + 200) },
  });
  let response: Promise<any> | undefined,
    settled = false;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Attempt" WHERE id=${a.id}::uuid FOR UPDATE`;
    response = call(
      `attempts/${a.id}/moves`,
      { nonce: a.nonce, events: [{ move: "R", sequence: 0, elapsedMs: 0 }] },
      owner.token,
    ).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(settled, false);
  });
  assert.equal((await response).status, 409);
  assert.deepEqual(
    (await db.attempt.findUniqueOrThrow({ where: { id: a.id } })).moves,
    [],
  );
});

test("competition schedule keysets preserve tied starts after boundary deletion and keep private history separate", async () => {
  const source = await competitionFixture(),
    owner = await fixture("competition-pagination", "1990-01-01"),
    base = Date.now() + 3600000,
    ids: string[] = [];
  try {
    for (let index = 0; index < 32; index++) {
      const startsAt = new Date(base + Math.floor(index / 2) * 1000),
        endsAt = new Date(startsAt.getTime() + 60000);
      const event = await db.competition.create({
        data: {
          creatorId: adminId,
          title: { en: `Pagination ${index}`, zh: `分页 ${index}` },
          description: source.description,
          puzzle: "3x3",
          input: "virtual",
          ranked: false,
          capacity: 100,
          status: "PUBLISHED",
          version: 2,
          registrationOpensAt: new Date(base - 120000),
          registrationClosesAt: new Date(base - 60000),
          startsAt,
          endsAt,
          expiresAt: new Date(endsAt.getTime() + 180 * 86400000),
          rounds: {
            create: {
              ordinal: 0,
              title: { en: "Round", zh: "轮次" },
              format: "BEST1",
              opensAt: startsAt,
              closesAt: endsAt,
              scrambles: [["R", "U"]],
            },
          },
          entries: { create: { userId: owner.u.id, number: 1 } },
        },
      });
      ids.push(event.id);
    }
    const first = await call("competitions?mine=true", undefined, owner.token);
    assert.equal(first.status, 200);
    assert.equal(first.body.items.length, 30);
    assert.match(first.body.nextCursor, /^\d{13}_[0-9a-f-]{36}$/);
    assert.equal(JSON.stringify(first.body).includes("scrambles"), false);
    assert.equal(JSON.stringify(first.body).includes(owner.u.id), false);
    for (let i = 1; i < first.body.items.length; i++) {
      const a = first.body.items[i - 1],
        b = first.body.items[i];
      assert.ok(
        a.startsAt < b.startsAt || (a.startsAt === b.startsAt && a.id < b.id),
      );
    }
    await db.competition.delete({ where: { id: first.body.items.at(-1).id } });
    const second = await call(
      `competitions?mine=true&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      undefined,
      owner.token,
    );
    assert.equal(second.status, 200);
    assert.equal(second.body.items.length, 2);
    assert.equal(second.body.nextCursor, null);
    assert.equal(
      second.body.items.some((row: any) =>
        first.body.items.some((old: any) => old.id === row.id),
      ),
      false,
    );
    assert.equal(
      (await call("competitions?cursor=not-a-cursor", undefined, owner.token))
        .status,
      400,
    );
  } finally {
    await db.competition.deleteMany({ where: { id: { in: ids } } });
  }
});

test("legacy category rankings cannot publish minor scores or unreviewed profile nicknames around competition approvals", async () => {
  const { child } = await securityChild("competition-legacy-child"),
    adult = await fixture("competition-legacy-adult", "1990-01-01");
  await db.user.update({
    where: { id: adult.u.id },
    data: {
      privateProfile: false,
      profileStatus: "PENDING",
      displayName: "Unreviewed profile label",
    },
  });
  const ids: string[] = [];
  for (const entrant of [adult, child]) {
    const room = await call(
      "rooms",
      {
        puzzle: "3x3",
        input: "virtual",
        mode: "race",
        ranked: true,
        private: true,
      },
      entrant.token,
    );
    assert.equal(room.status, 201);
    await call(`rooms/${room.body.id}/start`, {}, entrant.token);
    const attempt = await call(
      `rooms/${room.body.id}/attempts`,
      {},
      entrant.token,
    );
    assert.equal(attempt.status, 201);
    await competitionSolve(
      { roomId: room.body.id, attempt: attempt.body },
      entrant.token,
    );
    ids.push(attempt.body.id);
  }
  await db.user.update({
    where: { id: child.u.id },
    data: { adultVerified: true },
  });
  const board = (
    await call(
      "rankings?puzzle=3x3&input=virtual&mode=race",
      undefined,
      adult.token,
    )
  ).body;
  assert.deepEqual(board.find((row: any) => row.id === ids[0]).user, {
    displayName: "Private cuber",
  });
  assert.equal(
    board.some((row: any) => row.id === ids[1]),
    false,
  );
  assert.equal(
    JSON.stringify(board).includes("Unreviewed profile label"),
    false,
  );
  assert.equal(JSON.stringify(board).includes(adult.u.id), false);
});

const sponsorContent = () => ({
  title: { en: "Cubing workshop", zh: "魔方体验课" },
  summary: {
    en: "A reviewed cubing education session.",
    zh: "经过审核的魔方教学体验。",
  },
  category: "cubing-education",
  destination: "https://example.org/cubing",
  startsAt: new Date(Date.now() - 60000).toISOString(),
  endsAt: new Date(Date.now() + 3600000).toISOString(),
});
const sponsorReason = "Synthetic operator campaign review";
async function sponsorOperator(label: string) {
  return fixture(label, "1990-01-01", "ADMIN");
}
async function reviewedSponsor(token: string) {
  const made = await call(
    "admin/campaigns",
    { content: sponsorContent(), reason: sponsorReason },
    token,
  );
  assert.equal(made.status, 201);
  const approved = await call(
    `admin/campaigns/${made.body.id}/review`,
    {
      expectedVersion: made.body.version,
      decision: "approve",
      archiveReference: "REGISTER/2026/SYNTHETIC",
      advertiserRecordReviewed: true,
      destinationReviewed: true,
      bilingualReviewed: true,
      reason: sponsorReason,
    },
    token,
  );
  assert.equal(approved.status, 201);
  const enabled = await call(
    `admin/campaigns/${made.body.id}/enabled`,
    {
      expectedVersion: approved.body.version,
      enabled: true,
      reason: sponsorReason,
    },
    token,
  );
  assert.equal(enabled.status, 201);
  return enabled.body;
}
test("versioned sponsor management keeps drafts off, requires exact review, archives editions and prevents stale writes", async () => {
  const staff = await sponsorOperator("campaign-manager");
  const normal = await fixture("campaign-nonstaff", "1990-01-01");
  assert.equal(
    (await call("admin/campaigns", undefined, normal.token)).status,
    403,
  );
  assert.equal(
    (
      await call(
        "admin/campaigns",
        {
          title: "Old API",
          destination: "https://example.org",
          enabled: true,
          reviewed: true,
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 10000).toISOString(),
        },
        staff.token,
      )
    ).status,
    400,
  );
  const made = await call(
    "admin/campaigns",
    { content: sponsorContent(), reason: sponsorReason },
    staff.token,
  );
  assert.equal(made.status, 201);
  const row = made.body;
  assert.equal(row.enabled, false);
  assert.equal(row.reviewed, false);
  assert.equal(row.version, 1);
  assert.equal(
    (
      await call(
        `admin/campaigns/${row.id}/enabled`,
        { expectedVersion: 1, enabled: true, reason: sponsorReason },
        staff.token,
      )
    ).status,
    409,
  );
  const wrong = await call(
    `admin/campaigns/${row.id}/review`,
    {
      expectedVersion: 1,
      decision: "approve",
      archiveReference: "REGISTER/2026/TEST",
      advertiserRecordReviewed: false,
      destinationReviewed: true,
      bilingualReviewed: true,
      reason: sponsorReason,
    },
    staff.token,
  );
  assert.equal(wrong.status, 400);
  const changes = await Promise.all([
    call(
      `admin/campaigns/${row.id}/content`,
      { expectedVersion: 1, content: sponsorContent(), reason: sponsorReason },
      staff.token,
    ),
    call(
      `admin/campaigns/${row.id}/content`,
      { expectedVersion: 1, content: sponsorContent(), reason: sponsorReason },
      staff.token,
    ),
  ]);
  assert.deepEqual(changes.map((x) => x.status).sort(), [201, 409]);
  const history = await call(
    `admin/campaigns/${row.id}/history`,
    undefined,
    staff.token,
  );
  assert.equal(history.status, 200);
  assert.equal(history.body.items.length, 2);
  assert.ok(
    history.body.items.every(
      (h: any) => Date.parse(h.retainUntil) >= Date.parse(h.snapshot.endsAt),
    ),
  );
  assert.ok(
    history.body.items.every(
      (h: any) => !JSON.stringify(h.snapshot).includes(staff.u.id),
    ),
  );
  const saved = await db.campaign.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(saved.version, 2);
  assert.equal(saved.enabled, false);
});
test("sponsor delivery and external opening exclude minors and unverified adults and recheck exact current permissions", async () => {
  const staff = await sponsorOperator("campaign-delivery");
  const campaign = await reviewedSponsor(staff.token);
  let library = (await call("admin/campaigns", undefined, staff.token)).body;
  if (!library.setting.enabled)
    assert.equal(
      (
        await call(
          "admin/settings/sponsors",
          { expectedVersion: library.setting.version, enabled: true },
          staff.token,
        )
      ).status,
      201,
    );
  const adult = await fixture("campaign-eligible-adult", "1990-01-01");
  await db.user.update({
    where: { id: adult.u.id },
    data: { adultVerified: true },
  });
  for (const year of ["2010-01-01", "2015-01-01", "1990-01-01"]) {
    const u = await fixture(`campaign-ineligible-${year}`, year, "USER", false);
    if (year !== "1990-01-01")
      await db.user.update({
        where: { id: u.u.id },
        data: { adultVerified: true },
      });
    const hidden = await call("sponsors", undefined, u.token);
    assert.ok([200, 403].includes(hidden.status));
    if (hidden.status === 200) assert.deepEqual(hidden.body, []);
    assert.equal(
      (
        await call(
          `sponsors/${campaign.id}/open`,
          { expectedVersion: campaign.version },
          u.token,
        )
      ).status,
      403,
    );
  }
  const cards = await call("sponsors", undefined, adult.token);
  assert.equal(cards.status, 200);
  assert.ok(cards.body.some((c: any) => c.id === campaign.id));
  assert.ok(cards.body.length <= 3);
  assert.ok(
    cards.body.every((c: any) => c.validForMs > 0 && c.validForMs <= 30000),
  );
  assert.equal(JSON.stringify(cards.body).includes("archiveReference"), false);
  assert.equal(
    (
      await call(
        `sponsors/${campaign.id}/open`,
        { expectedVersion: campaign.version },
        adult.token,
      )
    ).body.destination,
    campaign.destination,
  );
  const { Campaigns } = await import("../../apps/api/src/campaigns"),
    { sessionUser, accountPolicy } =
      await import("../../apps/api/src/security");
  const session = await sessionUser(db as Db, adult.token);
  const captured = {
    user: session.user,
    sessionId: session.id,
    policy: await accountPolicy(db as any, session.user),
  } as any;
  await db.user.update({
    where: { id: adult.u.id },
    data: { adultVerified: false },
  });
  assert.deepEqual(
    await new Campaigns(db as Db, infrastructure).cards(captured),
    [],
  );
  await assert.rejects(
    new Campaigns(db as Db, infrastructure).open(captured, campaign.id, {
      expectedVersion: campaign.version,
    }),
    /adult sponsor/,
  );
  const edited = await call(
    `admin/campaigns/${campaign.id}/content`,
    {
      expectedVersion: campaign.version,
      content: {
        ...sponsorContent(),
        title: { en: "Changed workshop", zh: "修改后的体验课" },
      },
      reason: sponsorReason,
    },
    staff.token,
  );
  assert.equal(edited.status, 201);
  assert.equal(edited.body.enabled, false);
  assert.equal(edited.body.reviewed, false);
  assert.equal(edited.body.archiveReference, null);
  await db.user.update({
    where: { id: adult.u.id },
    data: { adultVerified: true },
  });
  assert.equal(
    (
      await call(
        `sponsors/${campaign.id}/open`,
        { expectedVersion: campaign.version },
        adult.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (await call("sponsors", undefined, adult.token)).body.some(
      (c: any) => c.id === campaign.id,
    ),
    false,
  );
  library = (await call("admin/campaigns", undefined, staff.token)).body;
  const off = await call(
    "admin/settings/sponsors",
    { expectedVersion: library.setting.version, enabled: false },
    staff.token,
  );
  assert.equal(off.status, 201);
  assert.equal(
    (
      await call(
        "admin/settings/sponsors",
        { expectedVersion: library.setting.version, enabled: true },
        staff.token,
      )
    ).status,
    409,
  );
  assert.deepEqual((await call("sponsors", undefined, adult.token)).body, []);
  const cn = await fixture("campaign-cn-gate", "1990-01-01"); // Cross-region bearer cannot bypass the independently unapproved deployment.
  assert.equal(
    (await call("sponsors", undefined, cn.token, undefined, cnOrigin)).status,
    401,
  );
});
test("campaign actions recheck captured staff factor authority after waiting for the account lock", async () => {
  const staff = await sponsorOperator("campaign-factor-race"),
    { Campaigns } = await import("../../apps/api/src/campaigns"),
    { sessionUser, accountPolicy } =
      await import("../../apps/api/src/security");
  const session = await sessionUser(db as Db, staff.token);
  const r = {
    user: session.user,
    sessionId: session.id,
    policy: await accountPolicy(db as any, session.user),
  } as any;
  let held!: () => void, release!: () => void;
  const locked = new Promise<void>((yes) => (held = yes)),
    released = new Promise<void>((yes) => (release = yes));
  const beforeCount = await db.campaign.count();
  const blocker = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${staff.u.id}::uuid FOR UPDATE`;
    held();
    await released;
    await tx.user.update({
      where: { id: staff.u.id },
      data: { mfaGeneration: { increment: 1 } },
    });
  });
  await locked;
  const write = new Campaigns(db as Db, infrastructure).create(r, {
    content: sponsorContent(),
    reason: sponsorReason,
  });
  const rejected = assert.rejects(write, /Current staff MFA/);
  try {
    await waitFor(
      async () =>
        (
          await db.$queryRaw<
            { waiting: boolean }[]
          >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FOR SHARE%') AS waiting`
        )[0].waiting,
      2000,
    );
  } finally {
    release();
  }
  await blocker;
  await rejected;
  assert.equal(await db.campaign.count(), beforeCount);
});
test("sponsor archives survive withdrawal, expire only after three calendar years and serialize with current edits", async () => {
  const staff = await sponsorOperator("campaign-retention"),
    row = await reviewedSponsor(staff.token);
  const withdrawal = await call(
    `admin/campaigns/${row.id}/review`,
    {
      expectedVersion: row.version,
      decision: "withdraw",
      reason: sponsorReason,
    },
    staff.token,
  );
  assert.equal(withdrawal.status, 201);
  assert.equal(
    await db.campaignRevision.count({ where: { campaignId: row.id } }),
    4,
  );
  const { expireCampaignArchives } =
    await import("../../apps/api/src/campaigns");
  const now = new Date(),
    before = new Date(now);
  before.setUTCFullYear(before.getUTCFullYear() + 2);
  await expireCampaignArchives(db as Db, before);
  assert.equal(
    await db.campaignRevision.count({ where: { campaignId: row.id } }),
    4,
  );
  const cleanupTime = new Date(now);
  cleanupTime.setUTCFullYear(cleanupTime.getUTCFullYear() + 3);
  cleanupTime.setUTCDate(cleanupTime.getUTCDate() + 2);
  const freshEnd = new Date(now.getTime() + 10 * 86400000),
    freshExpiry = new Date(freshEnd);
  freshExpiry.setUTCFullYear(freshExpiry.getUTCFullYear() + 3);
  let ready!: () => void, release!: () => void;
  const held = new Promise<void>((yes) => (ready = yes)),
    proceed = new Promise<void>((yes) => (release = yes));
  const edit = db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472114)`;
    const content = { ...sponsorContent(), endsAt: freshEnd.toISOString() };
    const current = await tx.campaign.update({
      where: { id: row.id },
      data: {
        content,
        endsAt: freshEnd,
        reviewed: false,
        enabled: false,
        reviewedAt: null,
        archiveReference: null,
        version: { increment: 1 },
      },
    });
    await tx.campaignRevision.create({
      data: {
        campaignId: row.id,
        version: current.version,
        snapshot: content,
        reason: "Synthetic concurrent archive edit",
        retainUntil: freshExpiry,
      },
    });
    ready();
    await proceed;
  });
  await held;
  const pending = expireCampaignArchives(db as Db, cleanupTime);
  try {
    await waitFor(
      async () =>
        (
          await db.$queryRaw<
            { waiting: boolean }[]
          >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%83472114%') AS waiting`
        )[0].waiting,
      2000,
    );
  } finally {
    release();
  }
  await edit;
  await pending;
  assert.equal(
    await db.campaignRevision.count({ where: { campaignId: row.id } }),
    1,
  );
  assert.ok(await db.campaign.findUnique({ where: { id: row.id } }));
  const future = new Date(now);
  future.setUTCFullYear(future.getUTCFullYear() + 4);
  await expireCampaignArchives(db as Db, future);
  assert.equal(
    await db.campaignRevision.count({ where: { campaignId: row.id } }),
    0,
  );
  assert.equal(await db.campaign.findUnique({ where: { id: row.id } }), null);
});

test("mainland sponsor approval stays independent even with verified adults and synthetic enabled database rows", async () => {
  const token = opaque(),
    id = randomUUID(),
    campaignId = randomUUID(),
    prior = await cnDb.setting.findUnique({
      where: { key: "sponsors-enabled" },
    });
  const content = sponsorContent();
  await cnDb.user.create({
    data: {
      id,
      email: `sponsor-cn-${runId}@cubers.test`,
      passwordHash: await passwordHash(opaque()),
      displayName: "Synthetic CN sponsor operator",
      birthDate: "1990-01-01",
      region: "CN",
      emailVerified: true,
      adultVerified: true,
      identityVerified: true,
      role: "ADMIN",
      mfaSecret: authenticator.generateSecret(),
    },
  });
  await cnDb.session.create({
    data: {
      userId: id,
      tokenHash: hash(token),
      mfaVerified: true,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  try {
    await cnDb.setting.upsert({
      where: { key: "sponsors-enabled" },
      create: { key: "sponsors-enabled", value: { enabled: true, version: 1 } },
      update: { value: { enabled: true, version: 1 } },
    });
    await cnDb.campaign.create({
      data: {
        id: campaignId,
        title: content.title.en,
        destination: content.destination,
        content,
        enabled: true,
        reviewed: true,
        reviewedAt: new Date(),
        archiveReference: "REGISTER/2026/CN-TEST",
        startsAt: new Date(content.startsAt),
        endsAt: new Date(content.endsAt),
      },
    });
    assert.deepEqual(
      (await call("sponsors", undefined, token, undefined, cnOrigin)).body,
      [],
    );
    assert.equal(
      (
        await call(
          `sponsors/${campaignId}/open`,
          { expectedVersion: 1 },
          token,
          undefined,
          cnOrigin,
        )
      ).status,
      403,
    );
    const library = await call(
      "admin/campaigns",
      undefined,
      token,
      undefined,
      cnOrigin,
    );
    assert.equal(library.status, 200);
    assert.equal(library.body.deliveryApproved, false);
    assert.equal(
      (
        await call(
          "admin/settings/sponsors",
          { expectedVersion: 1, enabled: true },
          token,
          undefined,
          cnOrigin,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          "admin/settings/sponsors",
          { expectedVersion: 1, enabled: false },
          token,
          undefined,
          cnOrigin,
        )
      ).status,
      201,
    );
  } finally {
    await cnDb.campaign.deleteMany({ where: { id: campaignId } });
    if (prior)
      await cnDb.setting.update({
        where: { key: "sponsors-enabled" },
        data: { value: prior.value as any },
      });
    else await cnDb.setting.deleteMany({ where: { key: "sponsors-enabled" } });
  }
});

function updateContent(
  kind: "service" | "learning" = "service",
  courseId?: string,
) {
  return {
    kind,
    title: { en: `Synthetic update ${runId}`, zh: "合成测试公告" },
    summary: { en: "Synthetic service information", zh: "合成服务信息" },
    body: {
      en: "Original synthetic text.\nNo external action.",
      zh: "原创合成文字。\n没有外部操作。",
    },
    startsAt: new Date(Date.now() - 5000).toISOString(),
    endsAt: new Date(Date.now() + 86400000).toISOString(),
    ...(courseId ? { courseId } : {}),
  };
}
function announcementsInZone(zone: string) {
  return new Announcements(
    {
      $transaction: (work: (tx: any) => Promise<unknown>) =>
        db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT set_config('TimeZone', ${zone}, true)`;
          return work(tx);
        }),
    } as Db,
    infrastructure,
  );
}
const updateReview = (version: number, courseVersion?: number) => ({
  expectedVersion: version,
  published: true,
  englishReviewed: true,
  chineseReviewed: true,
  rightsConfirmed: true,
  serviceOrLearningOnly: true,
  ...(courseVersion ? { courseVersion } : {}),
  reason: "Synthetic bilingual editorial review",
});
async function publishedUpdate(
  ids: string[],
  content = updateContent(),
  courseVersion?: number,
) {
  const created = await call(
    "admin/announcements",
    { content, reason: "Create a synthetic original update" },
    adminToken,
  );
  assert.equal(created.status, 201);
  ids.push(created.body.id);
  const published = await call(
    `admin/announcements/${created.body.id}/publication`,
    updateReview(created.body.version, courseVersion),
    adminToken,
  );
  assert.equal(published.status, 201);
  return published.body;
}
test("staff announcements require explicit bilingual review and edits atomically withdraw the exact version", async () => {
  const ids: string[] = [];
  try {
    assert.equal(
      (
        await call(
          "admin/announcements",
          { content: updateContent(), reason: "Unauthorized synthetic update" },
          adultToken,
        )
      ).status,
      403,
    );
    const created = await call(
      "admin/announcements",
      {
        content: updateContent(),
        reason: "Create original bilingual service copy",
      },
      adminToken,
    );
    assert.equal(created.status, 201);
    const row = created.body;
    ids.push(row.id);
    assert.equal(row.published, false);
    assert.equal(
      (await call(`announcements/${row.id}?version=1`, undefined, adultToken))
        .status,
      404,
    );
    assert.equal(
      (
        await call(
          `admin/announcements/${row.id}/publication`,
          { ...updateReview(1), chineseReviewed: false },
          adminToken,
        )
      ).status,
      400,
    );
    const published = await call(
      `admin/announcements/${row.id}/publication`,
      updateReview(1),
      adminToken,
    );
    assert.equal(published.status, 201);
    const detail = await fetch(
      `${origin}/v1/announcements/${row.id}?version=2`,
      { headers: { Authorization: `Bearer ${adultToken}` } },
    );
    assert.equal(detail.status, 200);
    assert.match(detail.headers.get("cache-control")!, /private.*no-store/);
    const body = await detail.json();
    assert.equal(body.body.zh, row.content.body.zh);
    assert.equal(body.reviewedAt, undefined);
    assert.equal(body.actorId, undefined);
    const edits = await Promise.all(
      ["First", "Second"].map((word) =>
        call(
          `admin/announcements/${row.id}/content`,
          {
            expectedVersion: 2,
            content: {
              ...row.content,
              title: { ...row.content.title, en: `${word} synthetic update` },
            },
            reason: "Correct the saved bilingual version",
          },
          adminToken,
        ),
      ),
    );
    assert.deepEqual(edits.map((result) => result.status).sort(), [201, 409]);
    const edited = edits.find((result) => result.status === 201)!.body;
    assert.equal(edited.version, 3);
    assert.equal(edited.published, false);
    assert.equal(edited.reviewedAt, null);
    assert.equal(
      (await call(`announcements/${row.id}?version=2`, undefined, adultToken))
        .status,
      404,
    );
    const republished = await call(
      `admin/announcements/${row.id}/publication`,
      updateReview(3),
      adminToken,
    );
    assert.equal(republished.status, 201);
    assert.equal(
      (await call(`announcements/${row.id}?version=2`, undefined, adultToken))
        .status,
      409,
    );
    assert.equal(
      (
        await call(
          `admin/announcements/${row.id}/publication`,
          {
            expectedVersion: 4,
            published: false,
            reason: "Withdraw the synthetic publication",
          },
          adminToken,
        )
      ).status,
      201,
    );
    const history = await call(
      `admin/announcements/${row.id}/history`,
      undefined,
      adminToken,
    );
    assert.deepEqual(
      history.body.map((entry: any) => entry.version),
      [5, 4, 3, 2, 1],
    );
    assert.equal(
      await db.audit.count({
        where: { targetId: row.id, action: "announcement.change" },
      }),
      5,
    );
  } finally {
    await db.announcement.deleteMany({ where: { id: { in: ids } } });
  }
});
test("scheduled learning announcements bind current lesson publication and the reviewed course version", async () => {
  const ids: string[] = [],
    course = await db.course.findUniqueOrThrow({ where: { id: "3-notation" } });
  try {
    const row = await publishedUpdate(
      ids,
      updateContent("learning", course.id),
      course.version,
    );
    assert.equal(
      (
        await call(
          `announcements/${row.id}?version=${row.version}`,
          undefined,
          adultToken,
        )
      ).status,
      200,
    );
    await db.course.update({
      where: { id: course.id },
      data: { version: course.version + 1 },
    });
    assert.equal(
      (
        await call(
          `announcements/${row.id}?version=${row.version}`,
          undefined,
          adultToken,
        )
      ).status,
      404,
    );
    const renewed = await call(
      `admin/announcements/${row.id}/publication`,
      updateReview(row.version, course.version + 1),
      adminToken,
    );
    assert.equal(renewed.status, 201);
    await db.course.update({
      where: { id: course.id },
      data: { published: false },
    });
    assert.equal(
      (
        await call(
          `announcements/${row.id}?version=${renewed.body.version}`,
          undefined,
          adultToken,
        )
      ).status,
      404,
    );
    const future = updateContent();
    future.startsAt = new Date(Date.now() + 3600000).toISOString();
    const scheduled = await publishedUpdate(ids, future);
    const auth = await db.session.findUniqueOrThrow({
      where: { tokenHash: hash(adultToken) },
    });
    const actor = {
      user: await db.user.findUniqueOrThrow({ where: { id: adultId } }),
      sessionId: auth.id,
    } as Authed;
    for (const zone of ["Asia/Shanghai", "Pacific/Honolulu"])
      await assert.rejects(
        announcementsInZone(zone).detail(actor, scheduled.id, {
          version: scheduled.version,
        }),
        (error: any) => error.getStatus() === 404,
      );
    assert.equal(
      (
        await call(
          `announcements/${scheduled.id}?version=${scheduled.version}`,
          undefined,
          adultToken,
        )
      ).status,
      404,
    );
    await db.announcement.update({
      where: { id: scheduled.id },
      data: {
        startsAt: new Date(Date.now() - 10000),
        endsAt: new Date(Date.now() - 1),
      },
    });
    assert.equal(
      (
        await call(
          `announcements/${scheduled.id}?version=${scheduled.version}`,
          undefined,
          adultToken,
        )
      ).status,
      404,
    );
  } finally {
    await db.course.update({
      where: { id: course.id },
      data: { version: course.version, published: course.published },
    });
    await db.announcement.deleteMany({ where: { id: { in: ids } } });
  }
});
test("service updates remain readable after guardian learning withdrawal while scoped pages and learning content remain protected", async () => {
  const ids: string[] = [];
  try {
    const service = await publishedUpdate(ids),
      learning = await publishedUpdate(ids, updateContent("learning"));
    const { child, consent } = await securityChild("announcement-permission");
    const first = await call("announcements", undefined, child.token);
    assert.equal(first.status, 200);
    assert.ok(first.body.items.some((item: any) => item.id === learning.id));
    await db.consent.update({
      where: { id: consent.id },
      data: { status: "REVOKED" },
    });
    const after = await call("announcements", undefined, child.token);
    assert.equal(after.status, 200);
    assert.ok(after.body.items.some((item: any) => item.id === service.id));
    assert.equal(
      after.body.items.some((item: any) => item.id === learning.id),
      false,
    );
    assert.equal(
      (
        await call(
          `announcements/${learning.id}?version=${learning.version}`,
          undefined,
          child.token,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          `announcements/${service.id}?version=${service.version}`,
          undefined,
          child.token,
        )
      ).status,
      200,
    );
    assert.equal((await call("courses", undefined, child.token)).status, 403);
    assert.equal((await call("announcements")).status, 401);
    assert.equal(
      (await call("announcements", undefined, adultToken, undefined, cnOrigin))
        .status,
      401,
    );
  } finally {
    await db.announcement.deleteMany({ where: { id: { in: ids } } });
  }
});
test("announcement pages survive boundary deletion and reject another viewer, expired markers and changed learning scope", async () => {
  const ids = Array.from({ length: 14 }, () => randomUUID());
  const now = new Date(),
    c = { ...updateContent(), startsAt: now.toISOString() };
  const reader = await fixture("announcement-pages", "1990-01-01");
  try {
    await db.announcement.createMany({
      data: ids.map((id) => ({
        id,
        kind: c.kind,
        content: c,
        published: true,
        reviewedAt: now,
        startsAt: now,
        endsAt: new Date(c.endsAt),
      })),
    });
    const page = await call("announcements", undefined, reader.token);
    const auth = await db.session.findUniqueOrThrow({
      where: { tokenHash: hash(reader.token) },
    });
    for (const zone of ["Asia/Shanghai", "Pacific/Honolulu"]) {
      const service = announcementsInZone(zone),
        actor = { user: reader.u, sessionId: auth.id } as Authed;
      const first = await service.feed(actor, {});
      assert.equal(first.items.length, 10);
      assert.ok(first.nextCursor);
      const next = await service.feed(actor, { cursor: first.nextCursor });
      assert.equal(next.items.length, 4);
      assert.ok(
        next.items.every(
          (item) => !first.items.some((old) => old.id === item.id),
        ),
      );
    }
    assert.equal(page.body.items.length, 10);
    assert.ok(page.body.nextCursor);
    assert.equal(
      (
        await call(
          `announcements?cursor=${page.body.nextCursor}`,
          undefined,
          adultToken,
        )
      ).status,
      400,
    );
    const boundary = page.body.items.at(-1).id;
    assert.ok(ids.includes(boundary));
    await db.announcement.delete({ where: { id: boundary } });
    const next = await call(
      `announcements?cursor=${page.body.nextCursor}`,
      undefined,
      reader.token,
    );
    assert.equal(next.status, 200);
    assert.equal(next.body.items.length, 4);
    assert.ok(
      next.body.items.every(
        (item: any) => !page.body.items.some((old: any) => old.id === item.id),
      ),
    );
    await infrastructure.redis.del(
      `announcements-page:${hash(page.body.nextCursor)}`,
    );
    assert.equal(
      (
        await call(
          `announcements?cursor=${page.body.nextCursor}`,
          undefined,
          reader.token,
        )
      ).status,
      400,
    );
    const { child, consent } = await securityChild(
      "announcement-cursor-permission",
    );
    const childPage = await call("announcements", undefined, child.token);
    assert.ok(childPage.body.nextCursor);
    await db.consent.update({
      where: { id: consent.id },
      data: { status: "REVOKED" },
    });
    assert.equal(
      (
        await call(
          `announcements?cursor=${childPage.body.nextCursor}`,
          undefined,
          child.token,
        )
      ).status,
      400,
    );
  } finally {
    await db.announcement.deleteMany({ where: { id: { in: ids } } });
  }
});
test("announcement authority and full sessions are rechecked after actual account lock waits", async () => {
  const staff = await fixture("announcement-lock-staff", "1990-01-01", "ADMIN"),
    reader = await fixture("announcement-lock-reader", "1990-01-01");
  const service = new Announcements(db as Db, infrastructure);
  async function afterLock(
    person: typeof staff,
    action: (actor: Authed) => Promise<unknown>,
    mutation: (tx: any) => Promise<unknown>,
  ) {
    const session = await db.session.findUniqueOrThrow({
      where: { tokenHash: hash(person.token) },
    });
    const actor = { user: person.u, sessionId: session.id } as Authed;
    let release!: () => void, acquired!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
      }),
      locked = new Promise<void>((resolve) => {
        acquired = resolve;
      });
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${person.u.id}::uuid FOR UPDATE`;
        acquired();
        await gate;
        await mutation(tx);
      },
      { timeout: 10000 },
    );
    await locked;
    const result = action(actor).then(
      () => ({ ok: true, error: null }),
      (error) => ({ ok: false, error }),
    );
    let waiting = false;
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        const rows = await db.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT id FROM "User"%' AND query LIKE '%FOR SHARE%') AS waiting`;
        if (rows[0].waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      release();
      await blocker;
    }
    assert.equal(waiting, true);
    const denied = await result;
    assert.equal(denied.ok, false);
    assert.equal(denied.error.getStatus(), 403);
  }
  await afterLock(
    staff,
    (actor) =>
      service.create(actor, {
        content: updateContent(),
        reason: "Captured staff authority must not persist",
      }),
    (tx) =>
      tx.user.update({
        where: { id: staff.u.id },
        data: { mfaGeneration: { increment: 1 } },
      }),
  );
  await afterLock(
    reader,
    (actor) => service.feed(actor, {}),
    (tx) => tx.session.deleteMany({ where: { userId: reader.u.id } }),
  );
});
test("announcement history keeps twenty revisions and maintenance deletes bounded expired batches with their history", async () => {
  const ids: string[] = [];
  try {
    const created = await call(
      "admin/announcements",
      {
        content: updateContent(),
        reason: "Synthetic retained editorial draft",
      },
      adminToken,
    );
    assert.equal(created.status, 201);
    let row = created.body;
    ids.push(row.id);
    for (let index = 0; index < 22; index++) {
      const next = await call(
        `admin/announcements/${row.id}/content`,
        {
          expectedVersion: row.version,
          content: {
            ...row.content,
            title: { ...row.content.title, en: `Synthetic revision ${index}` },
          },
          reason: "Retain only the current revision window",
        },
        adminToken,
      );
      assert.equal(next.status, 201);
      row = next.body;
    }
    const history = await call(
      `admin/announcements/${row.id}/history`,
      undefined,
      adminToken,
    );
    assert.equal(history.body.length, 20);
    assert.equal(history.body[0].version, row.version);
    assert.equal(history.body.at(-1).version, row.version - 19);
    const active = await publishedUpdate(ids);
    const old = new Date(Date.now() - 100 * 86400000);
    await db.announcement.update({
      where: { id: row.id },
      data: {
        startsAt: new Date(old.getTime() - 86400000),
        endsAt: new Date(old.getTime() - 1),
      },
    });
    const expiredIds = Array.from({ length: 100 }, () => randomUUID());
    ids.push(...expiredIds);
    await db.announcement.createMany({
      data: expiredIds.map((id) => ({
        id,
        kind: "service",
        content: updateContent(),
        startsAt: new Date(old.getTime() - 86400000),
        endsAt: old,
      })),
    });
    assert.equal((await expireAnnouncements(db as Db)).count, 100);
    assert.equal(
      await db.announcementRevision.count({
        where: { announcementId: row.id },
      }),
      0,
    );
    assert.ok(await db.announcement.findUnique({ where: { id: active.id } }));
    assert.equal((await expireAnnouncements(db as Db)).count, 1);
  } finally {
    await db.announcement.deleteMany({ where: { id: { in: ids } } });
  }
});

const deviceReview = (expectedVersion: number, approve = true) =>
  approve
    ? {
        expectedVersion,
        approve: true,
        reason: "Independent synthetic workflow evidence review",
        evidenceInspected: true,
        physicalDeviceConfirmed: true,
        configurationConfirmed: true,
        independentReview: true,
      }
    : {
        expectedVersion,
        approve: false,
        reason: "Synthetic evidence is insufficient for physical acceptance",
      };
async function newDeviceReport(
  token: string,
  content = declaredPassingDeviceTest(),
) {
  const made = await call(
    "admin/device-tests",
    { content, reason: "Create synthetic acceptance workflow fixture" },
    token,
  );
  assert.equal(made.status, 201, JSON.stringify(made.body));
  return made.body;
}
test("device test lifecycle requires exact versions and an independent reviewer, preserves earlier contributors and never enables hardware", async () => {
  const a = await fixture("device-author", "1990-01-01", "ADMIN"),
    b = await fixture("device-editor", "1990-01-01", "ADMIN"),
    c = await fixture("device-reviewer", "1990-01-01", "ADMIN");
  let row = await newDeviceReport(a.token);
  try {
    assert.equal(row.status, "DRAFT");
    assert.equal(row.activationAvailable, false);
    row = (
      await call(
        `admin/device-tests/${row.id}/content`,
        {
          content: row.content,
          expectedVersion: row.version,
          reason: "A second administrator edits the evidence",
        },
        b.token,
      )
    ).body;
    row = (
      await call(
        `admin/device-tests/${row.id}/content`,
        {
          content: row.content,
          expectedVersion: row.version,
          reason: "The original author updates the current content",
        },
        a.token,
      )
    ).body;
    const submitted = await call(
      `admin/device-tests/${row.id}/submit`,
      {
        expectedVersion: row.version,
        reason: "Submit this exact synthetic workflow edition",
      },
      a.token,
    );
    assert.equal(submitted.status, 201);
    row = submitted.body;
    assert.equal(row.status, "SUBMITTED");
    for (const token of [a.token, b.token])
      assert.equal(
        (
          await call(
            `admin/device-tests/${row.id}/review`,
            deviceReview(row.version),
            token,
          )
        ).status,
        403,
      );
    assert.equal(
      (
        await call(
          `admin/device-tests/${row.id}/review`,
          { ...deviceReview(row.version), evidenceInspected: false },
          c.token,
        )
      ).status,
      400,
    );
    const response = await fetch(`${origin}/v1/admin/device-tests/${row.id}`, {
      headers: { Authorization: `Bearer ${c.token}` },
    });
    assert.match(response.headers.get("cache-control")!, /private.*no-store/);
    const loaded = await response.json();
    assert.equal(loaded.canReview, true);
    assert.equal(loaded.contributedByYou, false);
    assert.equal("reviewerId" in loaded, false);
    assert.equal("contributors" in loaded, false);
    const reviewedVersion = row.version;
    const approved = await call(
      `admin/device-tests/${row.id}/review`,
      deviceReview(row.version),
      c.token,
    );
    assert.equal(approved.status, 201);
    row = approved.body;
    assert.equal(row.status, "APPROVED");
    assert.equal(row.reviewedVersion, reviewedVersion);
    assert.equal(row.activationAvailable, false);
    assert.equal(
      (
        await call(
          `admin/device-tests/${row.id}/content`,
          {
            expectedVersion: reviewedVersion,
            content: row.content,
            reason: "Reject a stale evidence overwrite",
          },
          a.token,
        )
      ).status,
      409,
    );
    const devices = (await call("devices", undefined, adultToken)).body.devices;
    assert.ok(
      devices.every(
        (device: any) => !device.enabled && !device.physicallyTested,
      ),
    );
    assert.equal(
      (
        await call(
          "courses/3-notation/sessions",
          { input: "smart" },
          adultToken,
        )
      ).status,
      400,
    );
    const edited = await call(
      `admin/device-tests/${row.id}/content`,
      {
        expectedVersion: row.version,
        content: row.content,
        reason: "Any approved evidence edit clears its decision",
      },
      a.token,
    );
    assert.equal(edited.status, 201);
    row = edited.body;
    assert.equal(row.status, "DRAFT");
    assert.equal(row.reviewedAt, null);
    assert.equal(row.reviewedVersion, null);
    const history = await call(
      `admin/device-tests/${row.id}/history`,
      undefined,
      c.token,
    );
    assert.equal(history.status, 200);
    assert.equal(history.body[1].snapshot.status, "APPROVED");
    assert.equal(JSON.stringify(history.body).includes(c.u.id), false);
    assert.ok(
      await db.audit.findFirst({
        where: { action: "device-test.change", targetId: row.id },
      }),
    );
  } finally {
    await db.deviceTestReport.deleteMany({ where: { id: row.id } });
  }
});
test("synthetic, incomplete, unknown-firmware and narrower-scope evidence cannot obtain physical approval", async () => {
  const a = await fixture("device-incomplete-author", "1990-01-01", "ADMIN"),
    b = await fixture("device-incomplete-review", "1990-01-01", "ADMIN");
  const cases = [
    { ...declaredPassingDeviceTest(), provenance: "synthetic" as const },
    declaredPassingDeviceTest("transport"),
    { ...declaredPassingDeviceTest(), firmware: "unknown" },
    { ...declaredPassingDeviceTest(), scope: "learning" as const },
    { ...declaredPassingDeviceTest("learning"), scope: "ranked" as const },
  ];
  cases[1].checks.initial_sync = {
    status: "failed",
    notes: "Synthetic initial-state synchronization mismatch",
  };
  for (const content of cases) {
    const row = await newDeviceReport(a.token, content);
    try {
      assert.equal(
        (
          await call(
            `admin/device-tests/${row.id}/submit`,
            {
              expectedVersion: 1,
              reason: "Submit incomplete observations for review",
            },
            a.token,
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await call(
            `admin/device-tests/${row.id}/review`,
            deviceReview(2),
            b.token,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await call(
            `admin/device-tests/${row.id}/review`,
            deviceReview(2, false),
            b.token,
          )
        ).status,
        201,
      );
      assert.equal(
        (await call(`admin/device-tests/${row.id}`, undefined, a.token)).body
          .status,
        "REJECTED",
      );
    } finally {
      await db.deviceTestReport.delete({ where: { id: row.id } });
    }
  }
  for (const testedAt of [
    new Date(Date.now() + 3600000).toISOString(),
    new Date(Date.now() - 366 * 86400000).toISOString(),
  ])
    assert.equal(
      (
        await call(
          "admin/device-tests",
          {
            content: deviceTestFixture({ testedAt }),
            reason: "Invalid test date must not create a report",
          },
          a.token,
        )
      ).status,
      400,
    );
});
test("device report access requires current regional full staff MFA and moderators remain read only", async () => {
  const a = await fixture("device-access-author", "1990-01-01", "ADMIN"),
    mod = await fixture("device-read-mod", "1990-01-01", "ADMIN");
  await db.user.update({
    where: { id: mod.u.id },
    data: { role: "MODERATOR" },
  });
  const row = await newDeviceReport(a.token);
  const readers = await Promise.all([
    fixture("device-access-adult", "1990-01-01"),
    fixture("device-access-teen", "2010-01-01"),
    fixture("device-access-child", "2020-01-01"),
  ]);
  try {
    assert.equal((await call("admin/device-tests")).status, 401);
    for (const { token } of readers)
      assert.equal(
        (await call("admin/device-tests", undefined, token)).status,
        403,
      );
    assert.equal(
      (
        await call(
          "admin/device-tests",
          undefined,
          a.token,
          undefined,
          cnOrigin,
        )
      ).status,
      401,
    );
    const library = await call("admin/device-tests", undefined, mod.token);
    assert.equal(library.status, 200);
    assert.equal(library.body.canEdit, false);
    assert.equal(library.body.activationAvailable, false);
    assert.equal(
      (await call(`admin/device-tests/${row.id}`, undefined, mod.token)).status,
      200,
    );
    assert.equal(
      (await call(`admin/device-tests/${row.id}/history`, undefined, mod.token))
        .status,
      200,
    );
    assert.equal(
      (
        await call(
          `admin/device-tests/${row.id}/content`,
          {
            expectedVersion: 1,
            content: row.content,
            reason: "Moderator writes must be denied",
          },
          mod.token,
        )
      ).status,
      403,
    );
    const limited = opaque();
    await db.session.create({
      data: {
        userId: a.u.id,
        tokenHash: hash(limited),
        mfaVerified: true,
        scope: "DELETION",
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    assert.equal(
      (await call("admin/device-tests", undefined, limited)).status,
      403,
    );
    await db.session.updateMany({
      where: { userId: a.u.id },
      data: { mfaVerified: false },
    });
    assert.equal(
      (await call("admin/device-tests", undefined, a.token)).status,
      403,
    );
    const privacy = (await call("legal/privacy")).body;
    assert.ok(privacy.body.en.includes("Staff device-test records"));
    assert.ok(privacy.body.zh.includes("设备测试记录"));
  } finally {
    await db.deviceTestReport.delete({ where: { id: row.id } });
  }
});
test("device report edits and reviews reject conflicting revisions and preserve the original retention bound", async () => {
  const a = await fixture("device-race-author", "1990-01-01", "ADMIN"),
    b = await fixture("device-race-review", "1990-01-01", "ADMIN"),
    c = await fixture("device-race-review-2", "1990-01-01", "ADMIN");
  let row = await newDeviceReport(a.token);
  try {
    const expiry = row.expiresAt;
    const edits = await Promise.all(
      [1, 2].map(() =>
        call(
          `admin/device-tests/${row.id}/content`,
          {
            expectedVersion: row.version,
            content: { ...row.content, testedAt: new Date().toISOString() },
            reason: "A concurrent edit cannot overwrite another edition",
          },
          a.token,
        ),
      ),
    );
    assert.deepEqual(edits.map((r) => r.status).sort(), [201, 409]);
    row = edits.find((r) => r.status === 201)!.body;
    assert.equal(row.expiresAt, expiry);
    row = (
      await call(
        `admin/device-tests/${row.id}/submit`,
        {
          expectedVersion: row.version,
          reason: "Submit the exact surviving edit for review",
        },
        a.token,
      )
    ).body;
    const reviews = await Promise.all(
      [b.token, c.token].map((token) =>
        call(
          `admin/device-tests/${row.id}/review`,
          deviceReview(row.version),
          token,
        ),
      ),
    );
    assert.deepEqual(reviews.map((r) => r.status).sort(), [201, 409]);
    row = reviews.find((r) => r.status === 201)!.body;
    const withdrawn = await call(
      `admin/device-tests/${row.id}/withdraw`,
      {
        expectedVersion: row.version,
        reason: "Withdraw an unreliable synthetic report version",
      },
      a.token,
    );
    assert.equal(withdrawn.status, 201);
    assert.equal(withdrawn.body.status, "WITHDRAWN");
    assert.equal(withdrawn.body.reviewedAt, null);
  } finally {
    await db.deviceTestReport.delete({ where: { id: row.id } });
  }
});
test("device report authority, sessions and expiry are rechecked after real database lock waits", async () => {
  const service = new DeviceTesting(db as Db, infrastructure);
  async function blocked(
    kind: "account" | "global",
    person: Awaited<ReturnType<typeof fixture>>,
    action: (actor: Authed) => Promise<unknown>,
    mutate: () => Promise<unknown>,
  ) {
    const session = await db.session.findUniqueOrThrow({
        where: { tokenHash: hash(person.token) },
      }),
      actor = { user: person.u, sessionId: session.id } as Authed;
    let unlock!: () => void, ready!: () => void;
    const gate = new Promise<void>((resolve) => {
        unlock = resolve;
      }),
      started = new Promise<void>((resolve) => {
        ready = resolve;
      });
    const hold = db.$transaction(
      async (tx) => {
        if (kind === "account")
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${person.u.id}::uuid FOR UPDATE`;
        else await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472116)`;
        ready();
        await gate;
        if (kind === "account")
          await tx.user.update({
            where: { id: person.u.id },
            data: { mfaGeneration: { increment: 1 } },
          });
      },
      { timeout: 10000 },
    );
    await started;
    const pending = action(actor).then(
      () => ({ ok: true, error: null }),
      (error) => ({ ok: false, error }),
    );
    let seen = false;
    try {
      for (let i = 0; i < 100; i++) {
        const rows = await db.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND ((query LIKE '%SELECT id FROM "User"%' AND query LIKE '%FOR SHARE%') OR query LIKE '%pg_advisory_xact_lock(83472116)%')) AS waiting`;
        if (rows[0].waiting) {
          seen = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 10));
      }
      if (kind === "global") await mutate();
    } finally {
      unlock();
      await hold;
    }
    assert.equal(seen, true);
    return pending;
  }
  const a = await fixture("device-lock-factor", "1990-01-01", "ADMIN");
  const factor = await blocked(
    "account",
    a,
    (actor) =>
      service.create(actor, {
        content: deviceTestFixture(),
        reason: "Captured staff factors are not current authority",
      }),
    async () => {},
  );
  assert.equal(factor.ok, false);
  assert.equal(factor.error.getStatus(), 403);
  const b = await fixture("device-lock-session", "1990-01-01", "ADMIN");
  const session = await blocked(
    "global",
    b,
    (actor) =>
      service.create(actor, {
        content: deviceTestFixture(),
        reason: "A revoked session must not survive the serialization wait",
      }),
    () => db.session.deleteMany({ where: { userId: b.u.id } }),
  );
  assert.equal(session.ok, false);
  assert.equal(session.error.getStatus(), 403);
  const c = await fixture("device-lock-expiry", "1990-01-01", "ADMIN"),
    row = await newDeviceReport(c.token);
  try {
    const expired = await blocked(
      "global",
      c,
      (actor) =>
        service.edit(actor, row.id, {
          content: row.content,
          expectedVersion: 1,
          reason: "Expiry must be current after waiting for other changes",
        }),
      () =>
        db.deviceTestReport.update({
          where: { id: row.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        }),
    );
    assert.equal(expired.ok, false);
    assert.equal(expired.error.getStatus(), 404);
  } finally {
    await db.deviceTestReport.delete({ where: { id: row.id } });
  }
});
test("device report history stays bounded, preserves earlier contributor independence and removes account identifiers through real foreign keys", async () => {
  const a = await fixture("device-history-author", "1990-01-01", "ADMIN"),
    b = await fixture("device-history-editor", "1990-01-01", "ADMIN"),
    c = await fixture("device-history-reviewer", "1990-01-01", "ADMIN");
  let row = await newDeviceReport(a.token);
  try {
    row = (
      await call(
        `admin/device-tests/${row.id}/content`,
        {
          content: row.content,
          expectedVersion: row.version,
          reason: "An early contributor remains independent-review ineligible",
        },
        b.token,
      )
    ).body;
    for (let n = 0; n < 21; n++) {
      const edited = await call(
        `admin/device-tests/${row.id}/content`,
        {
          content: row.content,
          expectedVersion: row.version,
          reason:
            "Retain only bounded report history without forgetting contributors",
        },
        a.token,
      );
      assert.equal(edited.status, 201);
      row = edited.body;
    }
    const history = (
      await call(`admin/device-tests/${row.id}/history`, undefined, c.token)
    ).body;
    assert.equal(history.length, 20);
    assert.equal(history.at(-1).version, row.version - 19);
    assert.equal(JSON.stringify(history).includes(a.u.id), false);
    assert.equal(JSON.stringify(history).includes(b.u.id), false);
    row = (
      await call(
        `admin/device-tests/${row.id}/submit`,
        {
          expectedVersion: row.version,
          reason: "Submit after historical content versions have retired",
        },
        a.token,
      )
    ).body;
    assert.equal(
      (
        await call(
          `admin/device-tests/${row.id}/review`,
          deviceReview(row.version),
          b.token,
        )
      ).status,
      403,
    );
    row = (
      await call(
        `admin/device-tests/${row.id}/review`,
        deviceReview(row.version),
        c.token,
      )
    ).body;
    const exported = await call("me/export", undefined, a.token);
    assert.ok(
      exported.body.deviceTestReports.some(
        (record: any) => record.id === row.id,
      ),
    );
    assert.equal(
      (
        await call("me/export", undefined, adultToken)
      ).body.deviceTestReports.some((record: any) => record.id === row.id),
      false,
    );
    await db.user.delete({ where: { id: a.u.id } });
    assert.equal(
      await db.deviceTestContributor.count({
        where: { reportId: row.id, userId: a.u.id },
      }),
      0,
    );
    assert.equal(
      await db.deviceTestContributor.count({
        where: { reportId: row.id, userId: null },
      }),
      1,
    );
    await db.user.delete({ where: { id: c.u.id } });
    assert.equal(
      (await db.deviceTestReport.findUniqueOrThrow({ where: { id: row.id } }))
        .reviewerId,
      null,
    );
    assert.equal(
      (await call(`admin/device-tests/${row.id}`, undefined, b.token)).status,
      200,
    );
  } finally {
    await db.deviceTestReport.deleteMany({ where: { id: row.id } });
  }
});
test("expired device reports are unreadable and bounded maintenance cascades only expired history and contributor rows", async () => {
  const a = await fixture("device-expiry-author", "1990-01-01", "ADMIN"),
    active = await newDeviceReport(a.token),
    ids = Array.from({ length: 101 }, () => randomUUID()),
    expiredAt = Date.now() - 1000;
  try {
    await db.deviceTestReport.createMany({
      data: ids.map((id, index) => ({
        id,
        model: "gan-356-i3",
        content: deviceTestFixture(),
        expiresAt: new Date(expiredAt + index),
      })),
    });
    await db.deviceTestRevision.create({
      data: {
        reportId: ids[0],
        version: 1,
        snapshot: { status: "DRAFT" },
        reason: "Synthetic expiry cleanup record",
      },
    });
    await db.deviceTestContributor.create({
      data: { reportId: ids[0], userId: a.u.id },
    });
    assert.equal(
      (await call(`admin/device-tests/${ids[0]}`, undefined, a.token)).status,
      404,
    );
    assert.equal(
      (await call(`admin/device-tests/${ids[0]}/history`, undefined, a.token))
        .status,
      404,
    );
    const page = (await call("admin/device-tests", undefined, a.token)).body;
    assert.equal(
      page.items.some((row: any) => ids.includes(row.id)),
      false,
    );
    assert.equal((await expireDeviceTests(db as Db)).count, 100);
    assert.equal(
      await db.deviceTestRevision.count({ where: { reportId: ids[0] } }),
      0,
    );
    assert.equal(
      await db.deviceTestContributor.count({ where: { reportId: ids[0] } }),
      0,
    );
    assert.ok(
      await db.deviceTestReport.findUnique({ where: { id: active.id } }),
    );
    assert.equal((await expireDeviceTests(db as Db)).count, 1);
  } finally {
    await db.deviceTestReport.deleteMany({
      where: { id: { in: [...ids, active.id] } },
    });
  }
});

test("device library filters and summary paging remain bounded and traverse a deleted boundary without leaking detailed evidence", async () => {
  const a = await fixture("device-page-author", "1990-01-01", "ADMIN"),
    ids = Array.from({ length: 24 }, () => randomUUID());
  try {
    await db.deviceTestReport.createMany({
      data: ids.map((id) => ({
        id,
        model: "giiker-i3s",
        content: deviceTestFixture({
          model: "giiker-i3s",
          platform: "android",
        }),
        status: "WITHDRAWN",
        expiresAt: new Date(Date.now() + 86400000),
      })),
    });
    const first = await call(
      "admin/device-tests?model=giiker-i3s&status=WITHDRAWN",
      undefined,
      a.token,
    );
    assert.equal(first.status, 200);
    assert.equal(first.body.items.length, 20);
    assert.ok(
      first.body.items.every(
        (row: any) =>
          row.model === "giiker-i3s" &&
          row.status === "WITHDRAWN" &&
          !("content" in row) &&
          !("caseReference" in row) &&
          !row.activationAvailable,
      ),
    );
    const marker = first.body.nextCursor;
    assert.equal(typeof marker, "string");
    await db.deviceTestReport.delete({ where: { id: marker } });
    const second = await call(
      `admin/device-tests?model=giiker-i3s&status=WITHDRAWN&cursor=${marker}`,
      undefined,
      a.token,
    );
    assert.equal(second.status, 200);
    assert.equal(second.body.items.length, 4);
    assert.equal(second.body.nextCursor, null);
    assert.equal(
      new Set(
        [...first.body.items, ...second.body.items].map((row: any) => row.id),
      ).size,
      24,
    );
    assert.equal(
      (await call("admin/device-tests?enabled=true", undefined, a.token))
        .status,
      400,
    );
  } finally {
    await db.deviceTestReport.deleteMany({ where: { id: { in: ids } } });
  }
});
test("device catalogue and contributor caps serialize concurrent writes and decided database records require a real reviewed version", async () => {
  const a = await fixture("device-cap-author", "1990-01-01", "ADMIN"),
    b = await fixture("device-cap-new-editor", "1990-01-01", "ADMIN"),
    row = await newDeviceReport(a.token),
    contributors = Array.from({ length: 19 }, () => randomUUID()),
    padding: string[] = [],
    created: string[] = [];
  try {
    await assert.rejects(
      db.deviceTestReport.create({
        data: {
          model: "gan-356-i3",
          content: deviceTestFixture(),
          status: "APPROVED",
          version: 2,
          reviewedAt: new Date(),
          reviewedVersion: null,
          expiresAt: new Date(Date.now() + 86400000),
        },
      }),
    );
    await db.user.createMany({
      data: contributors.map((id) => ({
        id,
        email: `device-contrib-${id}@cubers.test`,
        displayName: "Synthetic inactive contributor",
        birthDate: "1990-01-01",
        passwordHash: "!synthetic-no-login",
        region: "INTL",
      })),
    });
    await db.deviceTestContributor.createMany({
      data: contributors.map((userId) => ({ reportId: row.id, userId })),
    });
    assert.equal(
      (
        await call(
          `admin/device-tests/${row.id}/content`,
          {
            content: row.content,
            expectedVersion: 1,
            reason: "A twenty-first contributor must not be added",
          },
          b.token,
        )
      ).status,
      409,
    );
    assert.equal(
      await db.deviceTestContributor.count({ where: { reportId: row.id } }),
      20,
    );
    const count = await db.deviceTestReport.count();
    assert.ok(count < 500);
    padding.push(...Array.from({ length: 499 - count }, () => randomUUID()));
    await db.deviceTestReport.createMany({
      data: padding.map((id) => ({
        id,
        model: "gocube-edge",
        content: deviceTestFixture({ model: "gocube-edge" }),
        status: "WITHDRAWN",
        expiresAt: new Date(Date.now() + 86400000),
      })),
    });
    const outcomes = await Promise.all(
      [a.token, b.token].map((token) =>
        call(
          "admin/device-tests",
          {
            content: deviceTestFixture(),
            reason: "Concurrent capacity cannot exceed the regional bound",
          },
          token,
        ),
      ),
    );
    for (const result of outcomes)
      if (result.status === 201) created.push(result.body.id);
    assert.deepEqual(outcomes.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await db.deviceTestReport.count(), 500);
  } finally {
    await db.deviceTestReport.deleteMany({
      where: { id: { in: [row.id, ...padding, ...created] } },
    });
    await db.user.deleteMany({ where: { id: { in: contributors } } });
  }
});

async function withPublishedAlternative(
  family: "OLL" | "PLL" | "CLL",
  work: (context: {
    lesson: Lesson;
    course: any;
    learner: Awaited<ReturnType<typeof fixture>>;
    staff: Awaited<ReturnType<typeof fixture>>;
    previous: any;
  }) => Promise<void>,
) {
  const lesson = lessons.find(
    (l) => l.caseFamily === family && l.alternatives?.length,
  )!;
  const scope = randomUUID().slice(0, 8);
  const staff = await fixture(
      `alternative-staff-${family}-${scope}`,
      "1985-01-01",
      "ADMIN",
    ),
    learner = await fixture(
      `alternative-learner-${family}-${scope}`,
      "1990-01-01",
    ),
    path = `admin/courses/${lesson.id}`,
    previous = (await call(path, undefined, staff.token)).body;
  try {
    const edited = await call(
      `${path}/content`,
      {
        expectedVersion: previous.version,
        lesson: {
          ...previous.content,
          alternatives: lesson.alternatives,
          title: {
            ...previous.content.title,
            en: previous.content.title.en + ` · Alternate check ${runId}`,
          },
        },
        reason:
          "Review the exact shorter sequence and original bilingual teaching without changing the setup",
      },
      staff.token,
    );
    assert.equal(edited.status, 201, JSON.stringify(edited.body));
    assert.equal(
      (await call(`courses/${lesson.id}`, undefined, learner.token)).status,
      404,
    );
    const published = await call(
      path,
      {
        expectedVersion: edited.body.version,
        published: true,
        reviewed: true,
        englishReviewed: true,
        chineseReviewed: true,
        rightsConfirmed: true,
      },
      staff.token,
    );
    assert.equal(published.status, 201, JSON.stringify(published.body));
    const course = (
      await call(`courses/${lesson.id}`, undefined, learner.token)
    ).body;
    await work({ lesson, course, learner, staff, previous });
  } finally {
    const current = (await call(path, undefined, staff.token)).body,
      edited = await call(
        `${path}/content`,
        {
          expectedVersion: current.version,
          lesson: previous.content,
          reason:
            "Restore the original isolated test course after the alternate-sequence checks",
        },
        staff.token,
      );
    assert.equal(edited.status, 201);
    if (previous.published)
      assert.equal(
        (
          await call(
            path,
            {
              expectedVersion: edited.body.version,
              published: true,
              reviewed: true,
              englishReviewed: true,
              chineseReviewed: true,
              rightsConfirmed: true,
            },
            staff.token,
          )
        ).status,
        201,
      );
  }
}

test("published shorter guides connect all three families to virtual, scanned and downloaded practice", async () => {
  for (const family of ["OLL", "PLL", "CLL"] as const)
    await withPublishedAlternative(
      family,
      async ({ lesson, course, learner }) => {
        const option = lesson.alternatives![0],
          moves = option.algorithm.split(" ");
        const downloaded = await call(
          `courses/${lesson.id}/download`,
          { includeAlternatives: true },
          learner.token,
        );
        assert.equal(downloaded.status, 201);
        assert.equal(
          DownloadedLesson.parse(downloaded.body).lesson.alternatives![0]
            .algorithm,
          option.algorithm,
        );
        const legacyDownload = await call(
          `courses/${lesson.id}/download`,
          {},
          learner.token,
        );
        assert.equal(legacyDownload.status, 201);
        assert.equal(legacyDownload.body.lesson.alternatives, undefined);
        assert.equal(legacyDownload.body.lesson.algorithm, lesson.algorithm);
        const virtual = await call(
          `progress/${lesson.id}`,
          { courseVersion: course.version, alternativeId: option.id, moves },
          learner.token,
        );
        assert.equal(virtual.status, 201, JSON.stringify(virtual.body));
        const row = await db.lessonSession.findFirstOrThrow({
          where: {
            userId: learner.u.id,
            lessonId: lesson.id,
            input: "virtual",
          },
        });
        assert.equal(row.algorithm, lesson.algorithm);
        assert.equal(row.guideId, option.id);
        assert.equal(row.guideAlgorithm, option.algorithm);
        assert.deepEqual(row.moves, moves);
        assert.equal(row.courseVersion, course.version);
        const made = await call(
          `courses/${lesson.id}/sessions`,
          {
            input: "scan",
            courseVersion: course.version,
            alternativeId: option.id,
          },
          learner.token,
        );
        assert.equal(made.status, 201);
        assert.equal(made.body.algorithm, lesson.algorithm);
        assert.equal(made.body.guideAlgorithm, option.algorithm);
        const initial = practiceSetup(lesson.puzzle, lesson.algorithm);
        assert.ok(!isPyraminx(initial));
        const starting = await call(
          `lesson-sessions/${made.body.id}/checkpoint`,
          {
            version: made.body.version,
            kind: "initial",
            faces: facelets(initial),
          },
          learner.token,
        );
        assert.equal(starting.status, 201);
        const turning = await call(
          `lesson-sessions/${made.body.id}/moves`,
          { version: starting.body.version, moves },
          learner.token,
        );
        assert.equal(turning.status, 201);
        const solved = practiceApply(initial, moves);
        assert.ok(!isPyraminx(solved));
        const final = await call(
          `lesson-sessions/${made.body.id}/checkpoint`,
          {
            version: turning.body.version,
            kind: "final",
            faces: facelets(solved),
          },
          learner.token,
        );
        assert.equal(final.status, 201, JSON.stringify(final.body));
        assert.equal(final.body.status, "COMPLETED");
        assert.equal(final.body.guideId, option.id);
      },
    );
});
test("alternate guide claims cannot bypass publication, versions, exact final states or source selection", async () => {
  await withPublishedAlternative(
    "CLL",
    async ({ lesson, course, learner, previous }) => {
      const option = lesson.alternatives![0],
        path = `courses/${lesson.id}/sessions`,
        count = await db.lessonSession.count({
          where: { userId: learner.u.id },
        });
      for (const body of [
        {
          input: "scan",
          courseVersion: course.version,
          alternativeId: "unknown",
        },
        {
          input: "scan",
          courseVersion: course.version,
          alternativeId: option.id,
          guideAlgorithm: "R",
        },
        {
          input: "smart",
          courseVersion: course.version,
          alternativeId: option.id,
        },
      ])
        assert.equal((await call(path, body, learner.token)).status, 400);
      assert.equal(
        (
          await call(
            path,
            {
              input: "scan",
              courseVersion: previous.version,
              alternativeId: option.id,
            },
            learner.token,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await call(
            `progress/${lesson.id}`,
            {
              courseVersion: course.version,
              alternativeId: option.id,
              moves: ["R"],
            },
            learner.token,
          )
        ).status,
        400,
      );
      assert.equal(
        await db.lessonSession.count({ where: { userId: learner.u.id } }),
        count,
      );
      const historical = await db.lessonSession.create({
        data: {
          userId: learner.u.id,
          lessonId: lesson.id,
          puzzle: lesson.puzzle,
          input: "virtual",
          algorithm: lesson.algorithm,
          courseVersion: previous.version,
          moves: lesson.algorithm.split(" "),
          status: "COMPLETED",
          finishedAt: new Date(),
        },
      });
      assert.equal(historical.guideId, null);
      assert.equal(historical.guideAlgorithm, null);
      for (const bad of [
        `UPDATE "LessonSession" SET "guideId"='shorter-v1' WHERE id='${historical.id}'::uuid`,
        `UPDATE "LessonSession" SET "guideAlgorithm"='R' WHERE id='${historical.id}'::uuid`,
        `UPDATE "LessonSession" SET "guideId"='bad id',"guideAlgorithm"='R' WHERE id='${historical.id}'::uuid`,
      ])
        await assert.rejects(db.$executeRawUnsafe(bad));
      const retained = await db.lessonSession.findUniqueOrThrow({
        where: { id: historical.id },
      });
      assert.equal(retained.courseVersion, previous.version);
      assert.equal(retained.algorithm, lesson.algorithm);
      assert.deepEqual(retained.moves, historical.moves);
      assert.equal(retained.guideId, null);
    },
  );
});
test("alternate tutoring stays bound to the published guide and minors receive its authored explanation", async () => {
  await withPublishedAlternative("PLL", async ({ lesson, course, learner }) => {
    const option = lesson.alternatives![0],
      teen = await fixture("alternative-teen", "2010-01-01");
    const reply = await call(
      "tutor",
      {
        lessonId: lesson.id,
        courseVersion: course.version,
        alternativeId: option.id,
        locale: "zh",
        moves: [],
        question: "Explain the validated sequence",
      },
      teen.token,
    );
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
    assert.equal(reply.body.source, "authored");
    assert.equal(reply.body.algorithm, option.algorithm);
    assert.equal(reply.body.explanation, option.steps.zh.join("\n\n"));
    const unknown = await call(
      "tutor",
      {
        lessonId: lesson.id,
        courseVersion: course.version,
        alternativeId: "unknown",
        locale: "en",
        moves: [],
      },
      learner.token,
    );
    assert.equal(unknown.status, 400);
    const old = await call(
      "tutor",
      {
        lessonId: lesson.id,
        courseVersion: course.version,
        locale: "en",
        moves: [],
      },
      teen.token,
    );
    assert.equal(old.status, 201);
    assert.equal(old.body.algorithm, lesson.algorithm);
  });
});

async function smartGuidedFixture(name: string, child = false) {
  const person = await fixture(
      "smart-guided-" + name,
      child ? "2018-01-01" : "1990-01-01",
    ),
    { SyntheticAcceptance } = await smartTestService(),
    { SmartFirstSolveController } =
      await import("../../apps/api/src/smart-first-solve.controller"),
    { FirstSolveSolver } =
      await import("../../apps/api/dist/first-solve-solver"),
    solver = new FirstSolveSolver();
  let guardian: any;
  if (child) {
    guardian = await fixture("smart-guided-parent-" + name, "1980-01-01");
    await db.consent.create({
      data: {
        childId: person.u.id,
        guardianId: guardian.u.id,
        documentId: randomUUID(),
        status: "APPROVED",
      },
    });
  }
  const actor = await communityActor(person),
    course = await db.course.findUniqueOrThrow({
      where: { id: "3-first-solve" },
    }),
    hardware = applyMoves(solvedCube(), "R U F2"),
    service = new SmartFirstSolveController(
      db as Db,
      infrastructure,
      new SyntheticAcceptance(),
      solver as any,
    );
  try {
    const row = await service.create(actor, {
      model: "gan-356-i3",
      platform: "ios",
      courseVersion: course.version,
      faces: facelets(hardware),
      counter: 250,
    });
    return { person, actor, course, hardware, service, row, guardian, solver };
  } finally {
    await solver.onModuleDestroy();
  }
}

test("smart first solves complete all 13 stages for three native model streams through authenticated HTTP", async () => {
  const { SmartLessonLink } =
      await import("../../apps/mobile/src/smart/lesson-link"),
    { SmartCubeFrame, SMART_FIRST_SOLVE_REFERENCE } =
      await import("@cubers/core");
  await withSmartHttp(async (base) => {
    for (const [index, model] of (
      ["gan-356-i3", "gocube-edge", "giiker-i3s"] as const
    ).entries()) {
      const owner = await fixture("guided-http-" + model, "1990-01-01"),
        peer = await fixture("guided-peer-" + model, "1990-01-01"),
        course = await db.course.findUniqueOrThrow({
          where: { id: "3-first-solve" },
        }),
        frame = new SmartCubeFrame(SMART_FIRST_SOLVE_REFERENCE);
      let hardware = applyMoves(solvedCube(), "R U F2"),
        sequence = 0,
        saved: any;
      const counter = () => (index === 0 ? (250 + sequence) & 255 : null);
      const api = async <T = any>(
        path: string,
        body?: unknown,
        method?: string,
      ): Promise<T> => {
        const result = await call(path, body, owner.token, method, base);
        assert.ok(
          result.status < 400,
          "Guided HTTP " + result.status + " " + path,
        );
        return result.body;
      };
      const link = new SmartLessonLink<import("@cubers/core").SmartGuidedView>(
        api,
        {
          lessonId: course.id,
          courseVersion: course.version,
          model,
          platform: "ios",
          guided: true,
        },
        (row) => {
          saved = row;
        },
        (message) => {
          throw Error(message);
        },
      );
      const snapshot = (verified = true) =>
        link.observe({
          type: "state",
          state: hardware,
          verified,
          ...(index === 0 ? { deviceCounter: counter()! } : {}),
        });
      snapshot();
      try {
        await link.start();
        const epoch = saved.smart.epoch,
          id = saved.id;
        assert.deepEqual(saved.smart.reference, SMART_FIRST_SOLVE_REFERENCE);
        assert.equal(
          (
            await call(
              "smart-first-solves/" + id,
              undefined,
              peer.token,
              undefined,
              base,
            )
          ).status,
          404,
        );
        for (const [suffix, body] of [
          ["moves", { version: saved.version, moves: ["R"] }],
          ["reset", { version: saved.version }],
          ["checkpoint", { version: saved.version }],
          ["rescan", { version: saved.version, faces: facelets(hardware) }],
          ["download", { version: saved.version }],
        ] as const)
          assert.equal(
            (
              await call(
                "first-solves/" + id + "/" + suffix,
                body,
                owner.token,
                undefined,
                base,
              )
            ).status,
            400,
            suffix,
          );
        assert.equal(
          (
            await call(
              "smart-first-solves/" + id,
              { action: "finish", version: saved.version, epoch },
              owner.token,
              undefined,
              base,
            )
          ).status,
          400,
        );
        const received: string[] = [];
        while (saved.status === "PRACTICING") {
          const step = saved.guidance.step;
          assert.ok(step && saved.guidance.stage < 13);
          const initialStage = saved.guidance.stage;
          for (const move of step.moves as string[]) {
            const raw = frame.toHardwareMove(move),
              packets =
                index !== 2 && raw.endsWith("2") ? [raw[0], raw[0]] : [raw];
            for (const packet of packets) {
              hardware = applyMoves(hardware, [packet]);
              const i = sequence++;
              received.push(frame.toTeachingMove(packet));
              link.observe({
                type: "move",
                sequence: i,
                receivedAt: 100 + i,
                integrity:
                  index === 0
                    ? "counter"
                    : index === 1
                      ? "pending-state"
                      : "state",
                move: {
                  move: packet,
                  ...(index === 0 ? { deviceCounter: counter()! } : {}),
                },
              });
              snapshot(index === 2);
            }
          }
          if (sequence && index === 0 && initialStage === 0) {
            await link.flush(true);
            assert.equal(saved.smart.independentState, false);
            assert.equal(
              (
                await call(
                  "smart-first-solves/" + id,
                  {
                    action: "checkpoint",
                    version: saved.version,
                    epoch,
                    faces: facelets(hardware),
                    counter: counter(),
                  },
                  owner.token,
                  undefined,
                  base,
                )
              ).status,
              400,
            );
          }
          snapshot();
          await link.finish();
          assert.equal(saved.guidance.stage, initialStage + 1);
          assert.equal(saved.smart.epoch, epoch);
          assert.equal(saved.smart.nextSequence, sequence);
        }
        assert.equal(saved.status, "COMPLETED");
        assert.equal(saved.guidance.stage, 13);
        assert.equal(practiceSolved(hardware), true);
        const row = await db.guidedSolve.findUniqueOrThrow({ where: { id } }),
          progress = await db.progress.findUniqueOrThrow({
            where: {
              userId_lessonId: { userId: owner.u.id, lessonId: course.id },
            },
          });
        assert.equal(row.input, "smart");
        assert.equal(row.scrambleSource, null);
        assert.equal(row.courseVersion, course.version);
        assert.deepEqual(row.moves, received);
        assert.equal(
          (row.checkpoints as any[]).filter((c) => c.kind === "CHECKPOINT")
            .length,
          13,
        );
        assert.equal(progress.repetitions, 1);
        assert.equal(progress.completed, true);
        assert.equal((row.smart as any).counter, counter());
        assert.equal(
          (
            await call(
              "smart-first-solves/" + id,
              {
                action: "checkpoint",
                version: saved.version,
                epoch,
                faces: facelets(hardware),
                counter: counter(),
              },
              owner.token,
              undefined,
              base,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await db.progress.findUniqueOrThrow({
              where: {
                userId_lessonId: { userId: owner.u.id, lessonId: course.id },
              },
            })
          ).repetitions,
          1,
        );
      } finally {
        await link.close();
      }
    }
  });
});

test("smart guided state rejects replay, forged snapshots and manual progress; expired connections cannot continue", async () => {
  const f = await smartGuidedFixture("invalid"),
    before = await db.guidedSolve.findUniqueOrThrow({
      where: { id: f.row.id },
    }),
    heartbeat = {
      action: "turns",
      version: f.row.version,
      epoch: f.row.smart.epoch,
      turns: [],
      faces: facelets(f.hardware),
      counter: 250,
      independentState: true,
    };
  for (const patch of [
    { version: 999 },
    { epoch: randomUUID() },
    { counter: 251 },
    { faces: facelets(solvedCube()) },
    {
      turns: [
        {
          sequence: 1,
          move: "R",
          counter: 251,
          receivedAt: 1,
          recovered: false,
        },
      ],
    },
  ])
    await assert.rejects(
      f.service.action(f.actor, f.row.id, { ...heartbeat, ...patch }),
    );
  await assert.rejects(
    f.service.action(f.actor, f.row.id, {
      action: "checkpoint",
      version: f.row.version,
      epoch: f.row.smart.epoch,
      faces: facelets(f.hardware),
      counter: 250,
    }),
  );
  assert.deepEqual(
    await db.guidedSolve.findUniqueOrThrow({ where: { id: f.row.id } }),
    before,
  );
  const accepted = await f.service.action(f.actor, f.row.id, heartbeat);
  await assert.rejects(
    f.service.action(f.actor, f.row.id, heartbeat),
    (e: any) => e.getStatus?.() === 409,
  );
  await db.guidedSolve.update({
    where: { id: f.row.id },
    data: { smartSeenAt: new Date(Date.now() - 31000) },
  });
  await assert.rejects(
    f.service.action(f.actor, f.row.id, {
      ...heartbeat,
      version: accepted.version,
    }),
    (e: any) => e.getStatus?.() === 409,
  );
  assert.equal((await f.service.get(f.actor, f.row.id)).status, "INTERRUPTED");
  assert.equal((await f.service.list(f.actor)).active, null);
  const ended = await f.service.action(f.actor, f.row.id, {
    action: "interrupt",
    version: accepted.version,
    epoch: accepted.smart.epoch,
  });
  assert.equal(ended.status, "INTERRUPTED");
  assert.equal(
    await db.progress.count({ where: { userId: f.person.u.id } }),
    0,
  );
});

test("smart first-solve writes recheck guardian authority and expired login after actual row-lock waits", async () => {
  const child = await smartGuidedFixture("guardian", true),
    body = (f: typeof child) => ({
      action: "turns",
      version: f.row.version,
      epoch: f.row.smart.epoch,
      turns: [],
      faces: facelets(f.hardware),
      counter: 250,
      independentState: true,
    });
  const denied = await communityLockRace(
    child.guardian.u.id,
    () => child.service.action(child.actor, child.row.id, body(child)),
    (tx) =>
      tx.user.update({
        where: { id: child.guardian.u.id },
        data: { adultVerified: false },
      }),
  );
  assert.equal(denied.error?.getStatus(), 403);
  assert.equal(
    (await db.guidedSolve.findUniqueOrThrow({ where: { id: child.row.id } }))
      .version,
    child.row.version,
  );
  const f = await smartGuidedFixture("expiry"),
    deadline = Date.now() + 1500;
  await db.session.update({
    where: { id: f.actor.sessionId },
    data: { expiresAt: new Date(deadline) },
  });
  const result = await learningLockDelay("Course", f.course.id, deadline, () =>
    f.service.action(f.actor, f.row.id, body(f)),
  );
  assert.equal(result.error?.getStatus(), 403);
  assert.equal(
    (await db.guidedSolve.findUniqueOrThrow({ where: { id: f.row.id } }))
      .version,
    f.row.version,
  );
});

test("smart guided history exports only to its owner and follows account erasure", async () => {
  const f = await smartGuidedFixture("erasure");
  await f.service.action(f.actor, f.row.id, {
    action: "interrupt",
    version: f.row.version,
    epoch: f.row.smart.epoch,
  });
  const exported = await call("me/export", undefined, f.person.token);
  assert.equal(exported.status, 200);
  const row = exported.body.guidedSolves.find(
    (item: any) => item.id === f.row.id,
  );
  assert.equal(row.input, "smart");
  assert.equal(row.smart.epoch, f.row.smart.epoch);
  assert.equal(row.smart.model, "gan-356-i3");
  assert.equal("address" in row.smart, false);
  assert.equal(
    (await call("me", { confirmation: "DELETE" }, f.person.token, "DELETE"))
      .status,
    200,
  );
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(
    await db.guidedSolve.count({ where: { userId: f.person.u.id } }),
    0,
  );
  assert.equal(
    await db.progress.count({ where: { userId: f.person.u.id } }),
    0,
  );
});

test("smart guidance planning holds no learning locks and rechecks permissions, course publication and concurrent interruption", async () => {
  const { SmartFirstSolveController } =
      await import("../../apps/api/src/smart-first-solve.controller"),
    { SyntheticAcceptance } = await smartTestService();
  for (const change of ["guardian", "course", "interrupt"] as const) {
    const f = await smartGuidedFixture(
        "planning-" + change,
        change === "guardian",
      ),
      original = await db.guidedSolve.findUniqueOrThrow({
        where: { id: f.row.id },
      });
    let release!: (plan: unknown) => void, entered!: () => void;
    const started = new Promise<void>((r) => {
        entered = r;
      }),
      waiting = new Promise<any>((r) => {
        release = r;
      }),
      solver = {
        solve() {
          entered();
          return waiting;
        },
      };
    const service = new SmartFirstSolveController(
      db as Db,
      infrastructure,
      new SyntheticAcceptance(),
      solver as any,
    );
    const flight = service
      .action(f.actor, f.row.id, {
        action: "replan",
        version: f.row.version,
        epoch: f.row.smart.epoch,
        faces: facelets(f.hardware),
        counter: 250,
      })
      .then(
        (value) => ({ value, error: null }),
        (error) => ({ value: null, error }),
      );
    await started;
    try {
      if (change === "guardian")
        await db.user.update({
          where: { id: f.guardian.u.id },
          data: { adultVerified: false },
        });
      else if (change === "course")
        await db.course.update({
          where: { id: f.course.id },
          data: { published: false },
        });
      else
        await f.service.action(f.actor, f.row.id, {
          action: "interrupt",
          version: f.row.version,
          epoch: f.row.smart.epoch,
        });
      release(original.plan);
      const result = await flight;
      assert.equal(
        result.error?.getStatus(),
        change === "guardian" ? 403 : 409,
      );
      const after = await db.guidedSolve.findUniqueOrThrow({
        where: { id: f.row.id },
      });
      assert.deepEqual(after.plan, original.plan);
      assert.deepEqual(after.moves, []);
      assert.deepEqual(after.checkpoints, []);
      assert.equal(
        after.version,
        original.version + (change === "interrupt" ? 1 : 0),
      );
    } finally {
      release(original.plan);
      await flight;
      if (change === "course")
        await db.course.update({
          where: { id: f.course.id },
          data: { published: f.course.published },
        });
    }
  }
});

test("ordinary smart drills retain their 500-turn limit when guided first solves allow 2000", async () => {
  const f = await smartPracticeFixture("ordinary-cap"),
    repeated = Array.from({ length: 500 }, (_, i) => (i % 2 ? "R'" : "R"));
  await db.lessonSession.update({
    where: { id: f.row.id },
    data: {
      moves: repeated,
      smart: { ...f.row.smart, nextSequence: 500, lastTime: 500 },
    },
  });
  const before = await db.lessonSession.findUniqueOrThrow({
    where: { id: f.row.id },
  });
  await assert.rejects(
    f.service.action(f.actor, f.row.id, {
      action: "turns",
      version: f.row.version,
      epoch: f.row.smart.epoch,
      turns: [
        {
          sequence: 500,
          move: "R",
          receivedAt: 501,
          counter: 251,
          recovered: false,
        },
      ],
      faces: facelets(applyMoves(f.hardware, ["R"])),
      counter: 251,
      independentState: true,
    }),
    (e: any) => e.getStatus?.() === 400,
  );
  assert.deepEqual(
    await db.lessonSession.findUniqueOrThrow({ where: { id: f.row.id } }),
    before,
  );
});

test("smart first-solve replanning uses the actual changed position without losing received turns, counter or epoch", async () => {
  const f = await smartGuidedFixture("replan"),
    { SmartFirstSolveController } =
      await import("../../apps/api/src/smart-first-solve.controller"),
    { SyntheticAcceptance } = await smartTestService(),
    { FirstSolveSolver } =
      await import("../../apps/api/dist/first-solve-solver"),
    { SmartCubeFrame } = await import("@cubers/core"),
    solver = new FirstSolveSolver(),
    service = new SmartFirstSolveController(
      db as Db,
      infrastructure,
      new SyntheticAcceptance(),
      solver as any,
    );
  try {
    const hardware = applyMoves(f.hardware, ["R"]),
      frame = new SmartCubeFrame(f.row.smart.reference),
      moved = await service.action(f.actor, f.row.id, {
        action: "turns",
        version: f.row.version,
        epoch: f.row.smart.epoch,
        turns: [
          {
            sequence: 0,
            move: "R",
            counter: 251,
            receivedAt: 100,
            recovered: false,
          },
        ],
        faces: facelets(hardware),
        counter: 251,
        independentState: true,
      }),
      replanned = await service.action(f.actor, f.row.id, {
        action: "replan",
        version: moved.version,
        epoch: moved.smart.epoch,
        faces: facelets(hardware),
        counter: 251,
      }),
      row = await db.guidedSolve.findUniqueOrThrow({ where: { id: f.row.id } });
    assert.equal(replanned.guidance.stage, 0);
    assert.deepEqual(replanned.smart, moved.smart);
    assert.deepEqual(row.moves, [frame.toTeachingMove("R")]);
    assert.deepEqual(row.stageMoves, []);
    assert.deepEqual(
      (row.plan as any).startingFaces,
      guidedFacelets(frame.toTeachingState(hardware)),
    );
    assert.equal((row.checkpoints as any[])[0].kind, "REPLAN");
    assert.equal(
      await db.progress.count({ where: { userId: f.person.u.id } }),
      0,
    );
    await assert.rejects(
      service.action(f.actor, f.row.id, {
        action: "replan",
        version: moved.version,
        epoch: moved.smart.epoch,
        faces: facelets(hardware),
        counter: 251,
      }),
      (e: any) => e.getStatus?.() === 409,
    );
  } finally {
    await solver.onModuleDestroy();
  }
});

async function smartGameFixture(
  name: string,
  ranked = false,
  model: import("@cubers/core").SmartModel = "gan-356-i3",
  child = false,
) {
  const person = await fixture(
      "smart-game-" + name,
      child ? "2018-01-01" : "1990-01-01",
    ),
    { SmartPlayAccess } = await import("../../apps/api/src/smart-play-access"),
    { SmartAttemptController } =
      await import("../../apps/api/src/smart-attempt.controller");
  let guardian: any;
  if (child) {
    guardian = await fixture("smart-game-parent-" + name, "1980-01-01");
    await db.consent.create({
      data: {
        childId: person.u.id,
        guardianId: guardian.u.id,
        documentId: randomUUID(),
        status: "APPROVED",
        recording: true,
      },
    });
  }
  class SyntheticGameAcceptance extends SmartPlayAccess {
    room() {}
    require() {}
  }
  const access = new SyntheticGameAcceptance(),
    play = new PlayController(
      db as Db,
      infrastructure,
      new Competitions(db as Db, infrastructure),
      access,
    ),
    service = new SmartAttemptController(
      db as Db,
      infrastructure,
      play,
      access,
    ),
    actor = await communityActor(person),
    room = await play.create(actor, {
      puzzle: "3x3",
      input: "smart",
      mode: "race",
      ranked,
      private: true,
    });
  await play.startRoom(actor, room.id);
  const created = await play.attempt(actor, room.id),
    hardware = applyMoves(solvedCube(), created.scramble);
  if (ranked) await play.record(actor, created.id, { nonce: created.nonce });
  const current = await db.attempt.findUniqueOrThrow({
      where: { id: created.id },
    }),
    row = await service.bind(actor, created.id, {
      nonce: created.nonce,
      version: current.version,
      model,
      platform: "ios",
      faces: facelets(hardware),
      counter: model === "gan-356-i3" ? 250 : null,
    });
  return {
    person,
    actor,
    play,
    service,
    access,
    room,
    created,
    row,
    hardware,
    guardian,
  };
}

test("authenticated smart game routes verify all three model streams and isolate virtual bypasses", async () => {
  await withSmartHttp(async (base) => {
    for (const model of ["gan-356-i3", "gocube-edge", "giiker-i3s"] as const) {
      const owner = await fixture("smart-game-http-" + model, "1990-01-01"),
        peer = await fixture("smart-game-http-peer-" + model, "1990-01-01"),
        api = (path: string, body?: unknown) =>
          call(path, body, owner.token, undefined, base),
        room = (
          await api("rooms", {
            puzzle: "3x3",
            input: "smart",
            mode: "race",
            ranked: false,
            private: true,
          })
        ).body;
      assert.ok(room.id);
      assert.equal((await api("rooms/" + room.id + "/start", {})).status, 201);
      const created = (await api("rooms/" + room.id + "/attempts", {})).body;
      assert.ok(created.id);
      assert.ok(created.scrambleSource);
      let hardware = applyMoves(solvedCube(), created.scramble),
        row = (
          await api("smart-attempts/" + created.id + "/bind", {
            nonce: created.nonce,
            version: created.version,
            model,
            platform: "ios",
            faces: facelets(hardware),
            counter: model === "gan-356-i3" ? 250 : null,
          })
        ).body;
      assert.ok(row.smart);
      const epoch = row.smart.epoch;
      assert.equal(
        (
          await call(
            "smart-attempts/" + created.id,
            undefined,
            peer.token,
            undefined,
            base,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await api("attempts/" + created.id + "/inspect", {
            nonce: created.nonce,
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await api("attempts/" + created.id + "/start", {
            nonce: created.nonce,
          })
        ).status,
        201,
      );
      await db.attempt.update({
        where: { id: created.id },
        data: { startedAt: new Date(Date.now() - 1000) },
      });
      row = (await api("smart-attempts/" + created.id)).body;
      assert.equal(
        (
          await api("attempts/" + created.id + "/moves", {
            nonce: created.nonce,
            events: [{ sequence: 0, move: "R", elapsedMs: 1 }],
          })
        ).status,
        400,
      );
      const received = inverse(created.scramble).flatMap((move) =>
          model !== "giiker-i3s" && move.endsWith("2")
            ? [move[0], move[0]]
            : [move],
        ),
        counter = (n: number) =>
          model === "gan-356-i3" ? (250 + n) & 255 : null;
      for (let at = 0; at < received.length; at += 50) {
        const batch = received.slice(at, at + 50);
        hardware = applyMoves(hardware, batch);
        const result = await api("smart-attempts/" + created.id + "/turns", {
          action: "turns",
          nonce: created.nonce,
          version: row.version,
          epoch,
          turns: batch.map((move, i) => ({
            sequence: at + i,
            move,
            receivedAt: 100 + at + i,
            counter: counter(at + i + 1),
            recovered: false,
          })),
          faces: facelets(hardware),
          counter: counter(at + batch.length),
          independentState: false,
        });
        assert.equal(result.status, 201);
        row = result.body;
      }
      assert.equal(
        (
          await api("attempts/" + created.id + "/finish", {
            nonce: created.nonce,
          })
        ).status,
        409,
      );
      const confirm = {
          action: "turns",
          nonce: created.nonce,
          version: row.version,
          epoch,
          turns: [],
          faces: facelets(hardware),
          counter: counter(received.length),
          independentState: true,
        },
        checked = await api("smart-attempts/" + created.id + "/turns", confirm);
      assert.equal(checked.status, 201);
      row = checked.body;
      assert.equal(
        (await api("smart-attempts/" + created.id + "/turns", confirm)).status,
        409,
      );
      const finished = await api("attempts/" + created.id + "/finish", {
        nonce: created.nonce,
      });
      assert.equal(finished.status, 201);
      assert.equal(finished.body.status, "APPROVED");
      const saved = await db.attempt.findUniqueOrThrow({
        where: { id: created.id },
      });
      assert.deepEqual(
        (saved.moves as any[]).map((e) => e.move),
        received,
      );
      assert.equal((saved.smart as any).epoch, epoch);
      assert.equal((saved.smart as any).nextSequence, received.length);
      assert.equal((saved.smart as any).counter, counter(received.length));
      assert.equal(saved.evidenceId, null);
      assert.equal(
        (saved.smart as any).continuity,
        model === "gan-356-i3" ? "counter" : "net-state",
      );
      assert.equal(
        (
          await api("attempts/" + created.id + "/finish", {
            nonce: created.nonce,
          })
        ).status,
        403,
      );
    }
  });
});

test("invalid smart telemetry closes its exact bound attempt and cannot resume or reset counters", async () => {
  for (const kind of ["gap", "snapshot", "counter", "early"] as const) {
    const f = await smartGameFixture("invalid-" + kind);
    if (kind !== "early") {
      await f.play.inspect(f.actor, f.row.id, { nonce: f.row.nonce });
      await f.play.start(f.actor, f.row.id, { nonce: f.row.nonce });
    }
    const row = await f.service.get(f.actor, f.row.id),
      body = {
        action: "turns",
        nonce: row.nonce,
        version: row.version,
        epoch: row.smart!.epoch,
        turns: [
          {
            sequence: kind === "gap" ? 1 : 0,
            move: "R",
            counter: 251,
            receivedAt: 1,
            recovered: false,
          },
        ],
        faces: facelets(
          kind === "snapshot" ? f.hardware : applyMoves(f.hardware, ["R"]),
        ),
        counter: kind === "counter" ? 252 : 251,
        independentState: true,
      };
    await assert.rejects(
      f.service.turns(f.actor, row.id, body),
      (e: any) => e.getStatus?.() === 400,
    );
    const saved = await db.attempt.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(saved.status, "INTERRUPTED");
    assert.deepEqual(saved.moves, []);
    assert.equal((saved.smart as any).nextSequence, 0);
    await assert.rejects(
      f.service.bind(f.actor, row.id, {
        nonce: row.nonce,
        version: saved.version,
        model: "gan-356-i3",
        platform: "ios",
        faces: facelets(f.hardware),
        counter: 250,
      }),
      (e: any) => e.getStatus?.() === 409,
    );
  }
});

test("smart game lifetime and permission checks survive actual database waits without writing stale telemetry", async () => {
  const body = (f: any) => ({
    action: "turns",
    nonce: f.row.nonce,
    version: f.row.version,
    epoch: f.row.smart.epoch,
    turns: [],
    faces: facelets(f.hardware),
    counter: 250,
    independentState: true,
  });
  const child = await smartGameFixture("guardian", true, "gan-356-i3", true),
    denied = await communityLockRace(
      child.guardian.u.id,
      () => child.service.turns(child.actor, child.row.id, body(child)),
      (tx) =>
        tx.consent.update({
          where: { childId: child.person.u.id },
          data: { recording: false },
        }),
    );
  assert.equal(denied.error?.getStatus(), 403);
  assert.equal(
    (await db.attempt.findUniqueOrThrow({ where: { id: child.row.id } }))
      .version,
    child.row.version,
  );
  const expired = await smartGameFixture("lease");
  await db.attempt.update({
    where: { id: expired.row.id },
    data: { smartSeenAt: new Date(Date.now() - 31000) },
  });
  await assert.rejects(
    expired.service.turns(expired.actor, expired.row.id, body(expired)),
    (e: any) => e.getStatus?.() === 409,
  );
  assert.equal(
    (await expired.service.get(expired.actor, expired.row.id)).status,
    "INTERRUPTED",
  );
  const f = await smartGameFixture("login"),
    deadline = Date.now() + 1500;
  await db.session.update({
    where: { id: f.actor.sessionId },
    data: { expiresAt: new Date(deadline) },
  });
  const result = await learningLockDelay("Room", f.room.id, deadline, () =>
    f.service.turns(f.actor, f.row.id, body(f)),
  );
  assert.equal(result.error?.getStatus(), 403);
  assert.equal(
    (await db.attempt.findUniqueOrThrow({ where: { id: f.row.id } })).version,
    f.row.version,
  );
});

test("native smart game bridge completes authenticated inspection, receipt uploads and verified finish", async () => {
  const { SmartAttemptLink } =
    await import("../../apps/mobile/src/smart/attempt-link");
  await withSmartHttp(async (base) => {
    for (const [index, model] of (
      ["gan-356-i3", "gocube-edge", "giiker-i3s"] as const
    ).entries()) {
      const owner = await fixture("smart-native-" + model, "1990-01-01"),
        api = async <T = any>(path: string, body?: unknown): Promise<T> => {
          const result = await call(path, body, owner.token, undefined, base);
          assert.ok(
            result.status < 400,
            "Native smart HTTP " + result.status + " " + path,
          );
          return result.body;
        },
        room = await api("rooms", {
          puzzle: "3x3",
          input: "smart",
          mode: "sprint",
          ranked: false,
          private: true,
        });
      await api("rooms/" + room.id + "/start", {});
      const created = await api("rooms/" + room.id + "/attempts", {});
      let hardware = solvedCube(),
        sequence = 0,
        saved: any;
      const counter = () => (index === 0 ? (250 + sequence) & 255 : null);
      const link = new SmartAttemptLink(
        api,
        { id: created.id, model, platform: "ios" },
        (row) => {
          saved = row;
        },
        (message) => {
          throw Error(message);
        },
      );
      const snapshot = (verified = true) =>
        link.observe({
          type: "state",
          state: hardware,
          verified,
          ...(index === 0 ? { deviceCounter: counter()! } : {}),
        });
      snapshot(false);
      try {
        await link.bind();
        snapshot();
        await link.inspect();
        await link.start();
        await db.attempt.update({
          where: { id: created.id },
          data: { startedAt: new Date(Date.now() - 1000) },
        });
        for (const move of room.target) {
          hardware = applyMoves(hardware, [move]);
          const n = sequence++;
          link.observe({
            type: "move",
            sequence: n,
            receivedAt: 100 + n,
            integrity:
              index === 0 ? "counter" : index === 1 ? "pending-state" : "state",
            move: {
              move,
              ...(index === 0 ? { deviceCounter: counter()! } : {}),
            },
          });
          snapshot(index === 2);
        }
        snapshot();
        await link.finish();
        assert.equal(saved.status, "APPROVED");
        assert.equal(saved.smart.nextSequence, 4);
        assert.deepEqual(
          saved.moves.map((row: any) => row.move),
          room.target,
        );
      } finally {
        await link.close();
      }
    }
  });
});

test("ranked smart solves retain attempt-bound evidence and human review before category credit", async () => {
  const f = await smartGameFixture("ranked", true);
  await f.play.inspect(f.actor, f.row.id, { nonce: f.row.nonce });
  await f.play.start(f.actor, f.row.id, { nonce: f.row.nonce });
  await db.attempt.update({
    where: { id: f.row.id },
    data: { startedAt: new Date(Date.now() - 1000) },
  });
  let row = await f.service.get(f.actor, f.row.id),
    hardware = f.hardware;
  const moves = inverse(row.scramble).flatMap((move) =>
    move.endsWith("2") ? [move[0], move[0]] : [move],
  );
  for (let at = 0; at < moves.length; at += 50) {
    const batch = moves.slice(at, at + 50);
    hardware = applyMoves(hardware, batch);
    row = await f.service.turns(f.actor, row.id, {
      action: "turns",
      nonce: row.nonce,
      version: row.version,
      epoch: row.smart!.epoch,
      turns: batch.map((move, i) => ({
        sequence: at + i,
        move,
        counter: (251 + at + i) & 255,
        receivedAt: 100 + at + i,
        recovered: false,
      })),
      faces: facelets(hardware),
      counter: (250 + at + batch.length) & 255,
      independentState: true,
    });
  }
  const finished = await f.play.finish(f.actor, row.id, { nonce: row.nonce });
  assert.equal(finished.status, "AWAITING_EVIDENCE");
  assert.equal(
    await db.attempt.count({ where: { id: row.id, status: "APPROVED" } }),
    0,
  );
  const media = await db.media.create({
    data: {
      userId: f.person.u.id,
      key: "INTL/" + runId + "/smart-evidence-" + randomUUID(),
      type: "video/mp4",
      purpose: "evidence",
      status: "READY",
      size: 100,
      durationMs: 60000,
      attemptId: randomUUID(),
    },
  });
  await assert.rejects(
    f.play.evidence(f.actor, row.id, {
      nonce: row.nonce,
      evidenceId: media.id,
    }),
    (e: any) => e.getStatus?.() === 400,
  );
  await db.media.update({
    where: { id: media.id },
    data: { attemptId: row.id },
  });
  assert.equal(
    (
      await f.play.evidence(f.actor, row.id, {
        nonce: row.nonce,
        evidenceId: media.id,
      })
    ).status,
    "PROVISIONAL",
  );
  assert.equal(
    (
      await f.play.rankings(f.actor, {
        puzzle: "3x3",
        input: "smart",
        mode: "race",
      })
    ).some((score) => score.id === row.id),
    false,
  );
  const review = {
    approve: true,
    reason: "Synthetic private smart evidence fixture checked",
    evidenceChecked: true,
    uninterrupted: true,
    scrambleMatches: true,
    cubeAndHandsVisible: true,
    finalStateSolved: true,
  };
  assert.equal(
    (await call("admin/attempts/" + row.id + "/review", review, adminToken))
      .status,
    201,
  );
  const approved = await db.attempt.findUniqueOrThrow({
    where: { id: row.id },
  });
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.reviewerId, adminId);
  assert.ok(approved.evidenceDeleteAt);
  assert.equal(
    (
      await f.play.rankings(f.actor, {
        puzzle: "3x3",
        input: "smart",
        mode: "race",
      })
    ).some((score) => score.id === row.id),
    true,
  );
  assert.equal(
    (
      await f.play.rankings(f.actor, {
        puzzle: "3x3",
        input: "virtual",
        mode: "race",
      })
    ).some((score: any) => score.id === row.id),
    false,
  );
});

test("smart connection interruption covers bound setup and pending evidence and preserves private export/erasure", async () => {
  for (const status of ["CREATED", "AWAITING_EVIDENCE"]) {
    const f = await smartGameFixture("disconnect-" + status);
    await db.attempt.update({ where: { id: f.row.id }, data: { status } });
    await f.play.disconnect(f.person.u.id, f.room.id);
    assert.equal(
      (await db.attempt.findUniqueOrThrow({ where: { id: f.row.id } })).status,
      "INTERRUPTED",
    );
  }
  const f = await smartGameFixture("erasure"),
    exported = await call("me/export", undefined, f.person.token);
  assert.equal(exported.status, 200);
  const row = exported.body.attempts.find((row: any) => row.id === f.row.id);
  assert.equal(row.smart.epoch, f.row.smart!.epoch);
  assert.equal(row.smart.model, "gan-356-i3");
  assert.equal("address" in row.smart, false);
  assert.equal(
    (await call("me", { confirmation: "DELETE" }, f.person.token, "DELETE"))
      .status,
    200,
  );
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(await db.attempt.count({ where: { userId: f.person.u.id } }), 0);
});

async function finishSyntheticSmart(f: any, target: string[]) {
  await f.play.inspect(f.actor, f.row.id, { nonce: f.row.nonce });
  await f.play.start(f.actor, f.row.id, { nonce: f.row.nonce });
  await db.attempt.update({
    where: { id: f.row.id },
    data: { startedAt: new Date(Date.now() - 1000) },
  });
  let row = await f.service.get(f.actor, f.row.id),
    hardware = f.hardware;
  const model = row.smart!.model,
    moves = target.flatMap((move) =>
      model !== "giiker-i3s" && move.endsWith("2")
        ? [move[0], move[0]]
        : [move],
    ),
    counter = (n: number) => (model === "gan-356-i3" ? (250 + n) & 255 : null);
  for (let at = 0; at < moves.length; at += 50) {
    const batch = moves.slice(at, at + 50);
    hardware = applyMoves(hardware, batch);
    row = await f.service.turns(f.actor, row.id, {
      action: "turns",
      nonce: row.nonce,
      version: row.version,
      epoch: row.smart!.epoch,
      turns: batch.map((move, i) => ({
        sequence: at + i,
        move,
        counter: counter(at + i + 1),
        receivedAt: 100 + at + i,
        recovered: false,
      })),
      faces: facelets(hardware),
      counter: counter(at + batch.length),
      independentState: true,
    });
  }
  return f.play.finish(f.actor, row.id, { nonce: row.nonce });
}
test("smart pattern, daily and cooperative relay games reconstruct physical turns without mixed-category ranking credit", async () => {
  const f = await smartGameFixture("game-modes");
  for (const mode of ["pattern", "daily"]) {
    const room = await f.play.create(f.actor, {
      puzzle: "3x3",
      input: "smart",
      mode,
      ranked: false,
      private: true,
    });
    await f.play.startRoom(f.actor, room.id);
    const created = await f.play.attempt(f.actor, room.id),
      hardware = applyMoves(solvedCube(), created.scramble),
      row = await f.service.bind(f.actor, created.id, {
        nonce: created.nonce,
        version: created.version,
        model: "gan-356-i3",
        platform: "ios",
        faces: facelets(hardware),
        counter: 250,
      });
    assert.equal(
      (
        await finishSyntheticSmart({ ...f, row, hardware }, [
          ...inverse(created.scramble),
          ...room.target,
        ])
      ).status,
      "APPROVED",
    );
  }
  const peer = await fixture("smart-relay-peer", "1990-01-01"),
    other = await communityActor(peer),
    room = await f.play.create(f.actor, {
      puzzle: "3x3",
      input: "smart",
      mode: "relay",
      ranked: false,
      private: true,
    });
  await f.play.join(other, { code: room.code });
  await f.play.startRoom(f.actor, room.id);
  const roster = (await db.room.findUniqueOrThrow({ where: { id: room.id } }))
    .roster;
  for (const userId of roster) {
    const actor = userId === f.actor.user.id ? f.actor : other;
    const created = await f.play.attempt(actor, room.id),
      hardware = applyMoves(solvedCube(), created.scramble),
      row = await f.service.bind(actor, created.id, {
        nonce: created.nonce,
        version: created.version,
        model: "gan-356-i3",
        platform: "ios",
        faces: facelets(hardware),
        counter: 250,
      });
    assert.equal(
      (
        await finishSyntheticSmart(
          { ...f, actor, row, hardware },
          inverse(created.scramble),
        )
      ).status,
      "APPROVED",
    );
  }
  const saved = await db.room.findUniqueOrThrow({ where: { id: room.id } });
  assert.equal(saved.status, "FINISHED");
  assert.equal(saved.round, 2);
  assert.equal(saved.ranked, false);
  assert.equal(saved.input, "smart");
});

async function scheduledSmartServices() {
  const { SmartPlayAccess } =
      await import("../../apps/api/src/smart-play-access"),
    { SmartAttemptController } =
      await import("../../apps/api/src/smart-attempt.controller");
  class SyntheticAcceptance extends SmartPlayAccess {
    room(puzzle: string) {
      assert.equal(puzzle, "3x3");
    }
    require() {}
  }
  const access = new SyntheticAcceptance(),
    competitions = new Competitions(db as Db, infrastructure, access),
    play = new PlayController(db as Db, infrastructure, competitions, access),
    smart = new SmartAttemptController(db as Db, infrastructure, play, access);
  return { access, competitions, play, smart };
}
async function scheduledSmartFixture(
  name: string,
  base: string,
  options: { ranked?: boolean; child?: boolean; formats?: string[] } = {},
) {
  const person = await fixture(
    "scheduled-smart-" + name,
    options.child ? "2018-01-01" : "1990-01-01",
  );
  let guardian: any;
  if (options.child) {
    guardian = await fixture("scheduled-smart-parent-" + name, "1980-01-01");
    await db.consent.create({
      data: {
        childId: person.u.id,
        guardianId: guardian.u.id,
        documentId: randomUUID(),
        status: "APPROVED",
        recording: true,
      },
    });
  }
  const services = await scheduledSmartServices(),
    actor = await communityActor(person),
    event = await competitionFixture(
      {
        input: "smart",
        ranked: options.ranked ?? false,
        formats: options.formats,
      },
      base,
    ),
    registration = await call(
      "competitions/" + event.id + "/register",
      { expectedVersion: event.version, privateResultsUnderstood: true },
      person.token,
      undefined,
      base,
    );
  assert.equal(registration.status, 201);
  await competitionOpen(event);
  const entered = await call(
    `competitions/${event.id}/rounds/${event.rounds[0].id}/attempts`,
    { index: 0 },
    person.token,
    undefined,
    base,
  );
  assert.equal(entered.status, 201);
  const attempt = entered.body.attempt,
    hardware = applyMoves(solvedCube(), attempt.scramble);
  if (options.ranked)
    await services.play.record(actor, attempt.id, { nonce: attempt.nonce });
  const latest = await db.attempt.findUniqueOrThrow({
      where: { id: attempt.id },
    }),
    row = await services.smart.bind(actor, attempt.id, {
      nonce: attempt.nonce,
      version: latest.version,
      model: "gan-356-i3",
      platform: "ios",
      faces: facelets(hardware),
      counter: 250,
    });
  return {
    ...services,
    person,
    guardian,
    actor,
    event,
    entered: entered.body,
    row,
    hardware,
  };
}

test("scheduled smart competition connects three native model streams, shared WCA slots, reviewed evidence and exact private sharing", async () => {
  const { SmartAttemptLink } =
    await import("../../apps/mobile/src/smart/attempt-link");
  await withSmartHttp(async (base) => {
    const event = await competitionFixture(
        { input: "smart", ranked: true },
        base,
      ),
      owners = await Promise.all(
        ["gan", "gocube", "giiker"].map((name) =>
          fixture("scheduled-http-" + name, "1990-01-01"),
        ),
      );
    for (const owner of owners)
      assert.equal(
        (
          await call(
            `competitions/${event.id}/register`,
            { expectedVersion: event.version, privateResultsUnderstood: true },
            owner.token,
            undefined,
            base,
          )
        ).status,
        201,
      );
    await competitionOpen(event);
    const rows: any[] = [];
    for (const [index, model] of (
      ["gan-356-i3", "gocube-edge", "giiker-i3s"] as const
    ).entries()) {
      const owner = owners[index],
        api = async <T = any>(path: string, body?: unknown): Promise<T> => {
          const result = await call(path, body, owner.token, undefined, base);
          assert.ok(
            result.status < 400,
            "Scheduled smart HTTP " + result.status + " " + path,
          );
          return result.body;
        },
        entered = await api(
          `competitions/${event.id}/rounds/${event.rounds[0].id}/attempts`,
          { index: 0 },
        ),
        a = entered.attempt;
      assert.ok(a.scrambleSource);
      assert.equal(
        (
          await api(
            `competitions/${event.id}/rounds/${event.rounds[0].id}/attempts`,
            { index: 0 },
          )
        ).attempt.id,
        a.id,
      );
      if (index) assert.deepEqual(a.scramble, rows[0].scramble);
      assert.equal(
        (
          await call(
            "rooms/" + entered.roomId + "/attempts",
            {},
            owner.token,
            undefined,
            base,
          )
        ).status,
        403,
      );
      await api("attempts/" + a.id + "/record", { nonce: a.nonce });
      let hardware = applyMoves(solvedCube(), a.scramble),
        sequence = 0,
        saved: any;
      const counter = () => (index === 0 ? (250 + sequence) & 255 : null);
      const link = new SmartAttemptLink(
          api,
          { id: a.id, model, platform: "ios" },
          (row) => {
            saved = row;
          },
          (message) => {
            throw Error(message);
          },
        ),
        snapshot = (verified = true) =>
          link.observe({
            type: "state",
            state: hardware,
            verified,
            ...(index === 0 ? { deviceCounter: counter()! } : {}),
          });
      snapshot(false);
      try {
        await link.bind();
        snapshot();
        await link.inspect();
        await link.start();
        await db.attempt.update({
          where: { id: a.id },
          data: {
            startedAt: new Date(Date.now() - 1000),
            recordingAt: new Date(Date.now() - 2000),
          },
        });
        for (const teaching of inverse(a.scramble)) {
          const packets =
            index !== 2 && teaching.endsWith("2")
              ? [teaching[0], teaching[0]]
              : [teaching];
          for (const move of packets) {
            hardware = applyMoves(hardware, [move]);
            const n = sequence++;
            link.observe({
              type: "move",
              sequence: n,
              receivedAt: 100 + n,
              integrity:
                index === 0
                  ? "counter"
                  : index === 1
                    ? "pending-state"
                    : "state",
              move: {
                move,
                ...(index === 0 ? { deviceCounter: counter()! } : {}),
              },
            });
            snapshot(index === 2);
          }
        }
        snapshot();
        await link.finish();
        assert.equal(saved.status, "AWAITING_EVIDENCE");
        rows.push({
          id: a.id,
          nonce: a.nonce,
          owner,
          scramble: a.scramble,
          epoch: saved.smart.epoch,
          link,
        });
      } finally {
        // A complete captured recording remains pending private processing; keep the
        // original bridge alive until evidence attachment, without restarting it.
        if (saved?.status !== "AWAITING_EVIDENCE") await link.close();
      }
    }
    await db.competitionRound.update({
      where: { id: event.rounds[0].id },
      data: { closesAt: new Date() },
    });
    assert.equal(
      (
        await call(
          `competitions/${event.id}/board`,
          undefined,
          owners[0].token,
          undefined,
          base,
        )
      ).body.items.length,
      0,
    );
    for (const row of rows) {
      const media = await db.media.create({
          data: {
            userId: row.owner.u.id,
            key: `INTL/${runId}/scheduled-smart-${randomUUID()}`,
            purpose: "evidence",
            type: "video/mp4",
            status: "READY",
            size: 100,
            durationMs: 10000,
            attemptId: row.id,
          },
        }),
        attached = await call(
          `attempts/${row.id}/evidence`,
          { nonce: row.nonce, evidenceId: media.id },
          row.owner.token,
          undefined,
          base,
        );
      assert.equal(attached.status, 201);
      assert.equal(attached.body.status, "PROVISIONAL");
      await row.link.close();
      assert.equal(
        (
          await call(
            `admin/attempts/${row.id}/review`,
            {
              approve: true,
              reason: "Synthetic scheduled smart footage reviewed",
              evidenceChecked: true,
              uninterrupted: true,
              scrambleMatches: true,
              cubeAndHandsVisible: true,
              finalStateSolved: true,
            },
            adminToken,
          )
        ).status,
        201,
      );
      const detail = await call(
        `competitions/${event.id}`,
        undefined,
        row.owner.token,
        undefined,
        base,
      );
      assert.equal(detail.body.input, "smart");
      const shared = await call(
        `competitions/${event.id}/share`,
        {
          scope: "overall",
          digest: detail.body.mine.digests.overall,
          sharingUnderstood: true,
        },
        row.owner.token,
        undefined,
        base,
      );
      assert.equal(shared.status, 201);
      assert.equal(shared.body.status, "READY");
      assert.equal(shared.body.snapshot.input, "smart");
      const generic = await call(
        "rankings?puzzle=3x3&input=smart&mode=race",
        undefined,
        row.owner.token,
      );
      assert.equal(
        generic.body.some((item: any) => item.id === row.id),
        false,
      );
    }
    const board = (
      await call(
        `competitions/${event.id}/board`,
        undefined,
        owners[0].token,
        undefined,
        base,
      )
    ).body;
    assert.equal(board.items.length, 3);
    for (const item of board.items)
      assert.deepEqual(Object.keys(item).sort(), ["number", "rank", "score"]);
    for (const row of rows) {
      assert.equal(JSON.stringify(board).includes(row.owner.u.id), false);
      assert.equal(JSON.stringify(board).includes(row.id), false);
    }
  });
});

test("scheduled smart attempts enforce the round deadline after actual room and attempt lock waits", async () => {
  await withSmartHttp(async (base) => {
    for (const table of ["Room", "Attempt"] as const) {
      const f = await scheduledSmartFixture("deadline-" + table, base);
      await f.play.inspect(f.actor, f.row.id, { nonce: f.row.nonce });
      await f.play.start(f.actor, f.row.id, { nonce: f.row.nonce });
      const row = await f.smart.get(f.actor, f.row.id),
        deadline = Date.now() + 1500;
      await db.competitionRound.update({
        where: { id: f.event.rounds[0].id },
        data: { closesAt: new Date(deadline) },
      });
      const before = await db.attempt.findUniqueOrThrow({
          where: { id: row.id },
        }),
        result = await learningLockDelay(
          table,
          table === "Room" ? f.entered.roomId : row.id,
          deadline,
          () =>
            f.smart.turns(f.actor, row.id, {
              action: "turns",
              nonce: row.nonce,
              version: row.version,
              epoch: row.smart!.epoch,
              turns: [],
              faces: facelets(f.hardware),
              counter: 250,
              independentState: true,
            }),
        );
      assert.equal(result.error?.getStatus(), 409);
      assert.deepEqual(
        await db.attempt.findUniqueOrThrow({ where: { id: row.id } }),
        before,
      );
    }
  });
});

test("scheduled smart writes recheck guardian recording authority and full session expiry after schedule lock waits", async () => {
  await withSmartHttp(async (base) => {
    const child = await scheduledSmartFixture("guardian", base, {
        ranked: true,
        child: true,
      }),
      body = (f: any) => ({
        action: "turns",
        nonce: f.row.nonce,
        version: f.row.version,
        epoch: f.row.smart.epoch,
        turns: [],
        faces: facelets(f.hardware),
        counter: 250,
        independentState: true,
      }),
      denied = await communityLockRace(
        child.guardian.u.id,
        () => child.smart.turns(child.actor, child.row.id, body(child)),
        (tx) =>
          tx.consent.update({
            where: { childId: child.person.u.id },
            data: { recording: false },
          }),
      );
    assert.equal(denied.error?.getStatus(), 403);
    assert.equal(
      (await db.attempt.findUniqueOrThrow({ where: { id: child.row.id } }))
        .version,
      child.row.version,
    );
    const f = await scheduledSmartFixture("login", base),
      deadline = Date.now() + 1500;
    await db.session.update({
      where: { id: f.actor.sessionId },
      data: { expiresAt: new Date(deadline) },
    });
    const result = await learningLockDelay(
      "Competition",
      f.event.id,
      deadline,
      () => f.smart.turns(f.actor, f.row.id, body(f)),
    );
    assert.equal(result.error?.getStatus(), 403);
    assert.equal(
      (await db.attempt.findUniqueOrThrow({ where: { id: f.row.id } })).version,
      f.row.version,
    );
  });
});

function smartScheduleDefinition() {
  const now = Date.now();
  return {
    title: { en: "Synthetic smart schedule", zh: "合成智能魔方安排" },
    description: {
      en: "Private test schedule only",
      zh: "仅用于私密测试的安排",
    },
    puzzle: "3x3",
    input: "smart",
    ranked: false,
    capacity: 10,
    registrationOpensAt: new Date(now - 60000).toISOString(),
    registrationClosesAt: new Date(now + 600000).toISOString(),
    rounds: [
      {
        title: { en: "Private round", zh: "私密轮次" },
        format: "BEST1",
        opensAt: new Date(now + 1200000).toISOString(),
        closesAt: new Date(now + 1800000).toISOString(),
      },
    ],
  };
}
test("default regional APIs allow smart drafts but deny unaccepted publication, registration and attempt issuance", async () => {
  for (const base of [origin, cnOrigin]) {
    const regionalDb = base === origin ? db : cnDb;
    let token = adminToken;
    if (base === cnOrigin) {
      const user = await cnDb.user.create({
        data: {
          email: "smart-schedule-cn-" + runId + "@cubers.test",
          displayName: "Synthetic schedule reviewer",
          passwordHash: "!synthetic-no-password",
          birthDate: "1990-01-01",
          region: "CN",
          role: "ADMIN",
          emailVerified: true,
          adultVerified: true,
          identityVerified: true,
          mfaSecret: authenticator.generateSecret(),
        },
      });
      token = opaque();
      await cnDb.session.create({
        data: {
          userId: user.id,
          tokenHash: hash(token),
          mfaVerified: true,
          expiresAt: new Date(Date.now() + 60000),
        },
      });
    }
    const created = await call(
      "admin/competitions",
      smartScheduleDefinition(),
      token,
      undefined,
      base,
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.input, "smart");
    assert.equal(
      (
        await call(
          `admin/competitions/${created.body.id}/publish`,
          {
            expectedVersion: 1,
            englishReviewed: true,
            chineseReviewed: true,
            rulesReviewed: true,
            rightsConfirmed: true,
          },
          token,
          undefined,
          base,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          `competitions/${created.body.id}/register`,
          { expectedVersion: 1, privateResultsUnderstood: true },
          token,
          undefined,
          base,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          `competitions/${created.body.id}/rounds/${created.body.rounds[0].id}/attempts`,
          { index: 0 },
          token,
          undefined,
          base,
        )
      ).status,
      400,
    );
    const saved = await regionalDb.competition.findUniqueOrThrow({
      where: { id: created.body.id },
      include: { rounds: true, entries: true },
    });
    assert.equal(saved.status, "DRAFT");
    assert.deepEqual(saved.rounds[0].scrambles, []);
    assert.equal(saved.rounds[0].scrambleSource, null);
    assert.equal(saved.entries.length, 0);
  }
});

test("scheduled smart cancellation and disconnect use compatible lock order and cannot revive an attempt", async () => {
  await withSmartHttp(async (base) => {
    for (const kind of ["cancel", "disconnect"] as const) {
      const f = await scheduledSmartFixture("lock-order-" + kind, base),
        before = await db.attempt.findUniqueOrThrow({
          where: { id: f.row.id },
        });
      let release!: () => void, entered!: () => void;
      const gate = new Promise<void>((resolve) => {
          release = resolve;
        }),
        locked = new Promise<void>((resolve) => {
          entered = resolve;
        });
      const blocker = db.$transaction(
        async (tx) => {
          if (kind === "cancel")
            await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${f.entered.roomId}::uuid FOR UPDATE`;
          else
            await tx.$queryRaw`SELECT id FROM "Attempt" WHERE id=${f.row.id}::uuid FOR UPDATE`;
          entered();
          await gate;
        },
        { timeout: 10000 },
      );
      await locked;
      const outcome = (task: Promise<unknown>) =>
          task.then(
            (value) => ({ value, error: null as any }),
            (error) => ({ value: null, error }),
          ),
        first = outcome(
          f.smart.turns(f.actor, f.row.id, {
            action: "turns",
            nonce: f.row.nonce,
            version: f.row.version,
            epoch: f.row.smart!.epoch,
            turns: [],
            faces: facelets(f.hardware),
            counter: 250,
            independentState: true,
          }),
        );
      let second: ReturnType<typeof outcome> | undefined;
      try {
        const waitLock = async (table: string) =>
          waitFor(async () => {
            const [row] = await db.$queryRaw<
              { waiting: boolean }[]
            >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ${'%SELECT id FROM "' + table + '"%'}) AS waiting`;
            return row.waiting;
          }, 2500);
        await waitLock(kind === "cancel" ? "Room" : "Attempt");
        if (kind === "cancel") {
          const admin = await db.user.findUniqueOrThrow({
              where: { id: adminId },
            }),
            session = await db.session.findUniqueOrThrow({
              where: { tokenHash: hash(adminToken) },
            });
          second = outcome(
            f.competitions.cancel(
              {
                user: admin,
                sessionId: session.id,
                policy: await accountPolicy(db, admin),
              } as Authed,
              f.event.id,
              {
                expectedVersion: f.event.version,
                reason: "Synthetic cancellation lock-order check",
              },
            ),
          );
          await waitLock("Competition");
        } else {
          second = outcome(f.play.disconnect(f.person.u.id, f.entered.roomId));
          await waitLock("Room");
        }
      } finally {
        release();
        await blocker;
      }
      const a = await first,
        b = await second!;
      assert.equal(a.error, null);
      assert.equal(b.error, null);
      const after = await db.attempt.findUniqueOrThrow({
        where: { id: f.row.id },
      });
      assert.equal(after.status, "INTERRUPTED");
      assert.equal(after.version, before.version + 2);
      assert.equal((after.smart as any).epoch, f.row.smart!.epoch);
      assert.deepEqual(after.moves, []);
    }
  });
});

test("scheduled smart slots keep order, fresh nonces and epochs, and permit cleanup while hardware use is withdrawn", async () => {
  await withSmartHttp(async (base) => {
    const f = await scheduledSmartFixture("slots", base, {
      formats: ["BEST3"],
    });
    await assert.rejects(
      f.competitions.enter(f.actor, f.event.id, f.event.rounds[0].id, {
        index: 1,
      }),
      (e: any) => e.getStatus?.() === 409,
    );
    await f.play.interrupt(f.actor, f.row.id);
    const next = await f.competitions.enter(
      f.actor,
      f.event.id,
      f.event.rounds[0].id,
      { index: 1 },
    );
    assert.notEqual(next.attempt.id, f.row.id);
    assert.notEqual(next.attempt.nonce, f.row.nonce);
    const hardware = applyMoves(solvedCube(), next.attempt.scramble),
      bound = await f.smart.bind(f.actor, next.attempt.id, {
        nonce: next.attempt.nonce,
        version: next.attempt.version,
        model: "gan-356-i3",
        platform: "ios",
        faces: facelets(hardware),
        counter: 0,
      });
    assert.notEqual(bound.smart!.epoch, f.row.smart!.epoch);
    await assert.rejects(
      f.smart.turns(f.actor, bound.id, {
        action: "turns",
        nonce: f.row.nonce,
        version: bound.version,
        epoch: f.row.smart!.epoch,
        turns: [],
        faces: facelets(hardware),
        counter: 0,
        independentState: true,
      }),
      (e: any) => e.getStatus?.() === 409,
    );
    const before = await db.attempt.findUniqueOrThrow({
        where: { id: bound.id },
      }),
      { BadRequestException } = await import("@nestjs/common");
    f.access.room = () => {
      throw new BadRequestException("Synthetic withdrawn hardware acceptance");
    };
    await assert.rejects(
      f.smart.turns(f.actor, bound.id, {
        action: "turns",
        nonce: bound.nonce,
        version: bound.version,
        epoch: bound.smart!.epoch,
        turns: [],
        faces: facelets(hardware),
        counter: 0,
        independentState: true,
      }),
      (e: any) => e.getStatus?.() === 400,
    );
    assert.deepEqual(
      await db.attempt.findUniqueOrThrow({ where: { id: bound.id } }),
      before,
    );
    assert.equal((await f.smart.get(f.actor, bound.id)).id, bound.id);
    await f.competitions.withdraw(f.actor, f.event.id, {
      confirmation: "WITHDRAW",
    });
    assert.equal(
      (await db.attempt.findUniqueOrThrow({ where: { id: bound.id } })).status,
      "INTERRUPTED",
    );
    await assert.rejects(
      f.competitions.enter(f.actor, f.event.id, f.event.rounds[0].id, {
        index: 2,
      }),
      (e: any) => e.getStatus?.() === 400,
    );
    assert.equal(
      await db.attempt.count({
        where: {
          userId: f.person.u.id,
          room: { competitionEntry: { competitionId: f.event.id } },
        },
      }),
      2,
    );
  });
});

test("young-child smart competition sharing requires current posting consent and exact guardian plus independent staff review", async () => {
  await withSmartHttp(async (base) => {
    const f = await scheduledSmartFixture("child-share", base, {
      ranked: true,
      child: true,
    });
    await finishSyntheticSmart(
      { ...f, service: f.smart },
      inverse(f.row.scramble),
    );
    const media = await db.media.create({
      data: {
        userId: f.person.u.id,
        key: `INTL/${runId}/smart-child-${randomUUID()}`,
        purpose: "evidence",
        attemptId: f.row.id,
        type: "video/mp4",
        status: "READY",
        size: 100,
        durationMs: 10000,
      },
    });
    await f.play.evidence(f.actor, f.row.id, {
      nonce: f.row.nonce,
      evidenceId: media.id,
    });
    assert.equal(
      (
        await call(
          `admin/attempts/${f.row.id}/review`,
          {
            approve: true,
            reason: "Synthetic child smart footage reviewed independently",
            evidenceChecked: true,
            uninterrupted: true,
            scrambleMatches: true,
            cubeAndHandsVisible: true,
            finalStateSolved: true,
          },
          adminToken,
        )
      ).status,
      201,
    );
    await competitionClose(f.event);
    let detail = (
      await call(
        `competitions/${f.event.id}`,
        undefined,
        f.person.token,
        undefined,
        base,
      )
    ).body;
    const share = () =>
      call(
        `competitions/${f.event.id}/share`,
        {
          scope: "overall",
          digest: detail.mine.digests.overall,
          sharingUnderstood: true,
        },
        f.person.token,
        undefined,
        base,
      );
    assert.equal((await share()).status, 403);
    await db.consent.update({
      where: { childId: f.person.u.id },
      data: { publicPosting: true },
    });
    detail = (
      await call(
        `competitions/${f.event.id}`,
        undefined,
        f.person.token,
        undefined,
        base,
      )
    ).body;
    const requested = await share();
    assert.equal(requested.status, 201);
    assert.equal(requested.body.status, "PENDING_GUARDIAN");
    assert.equal(requested.body.snapshot.input, "smart");
    const review = (p: any) => ({
      revision: p.revision,
      digest: p.digest,
      approve: true,
      checkedExactResult: true,
      reason: "Checked this exact private smart result before sharing",
    });
    assert.equal(
      (
        await call(
          `admin/competition-publications/${requested.body.id}/review`,
          review(requested.body),
          adminToken,
        )
      ).status,
      409,
    );
    const guardian = await call(
      `guardian/competition-publications/${requested.body.id}/review`,
      review(requested.body),
      f.guardian.token,
    );
    assert.equal(guardian.status, 201);
    const refreshed = (
      await call("admin/competition-publications", undefined, adminToken)
    ).body.items.find((p: any) => p.id === requested.body.id);
    assert.ok(refreshed);
    assert.equal(
      (
        await call(
          `admin/competition-publications/${requested.body.id}/review`,
          review(refreshed),
          adminToken,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await call(
          `competitions/${f.event.id}/board`,
          undefined,
          f.person.token,
          undefined,
          base,
        )
      ).body.items.length,
      1,
    );
    await db.consent.update({
      where: { childId: f.person.u.id },
      data: { publicPosting: false },
    });
    assert.equal(
      (
        await call(
          `competitions/${f.event.id}/board`,
          undefined,
          f.person.token,
          undefined,
          base,
        )
      ).body.items.length,
      0,
    );
  });
});

async function mixedHttpRoom(puzzle = "3x3", mode = "race", input = "virtual") {
  const host = await fixture(
      "mixed-host-" + randomUUID().slice(0, 8),
      "1990-01-01",
    ),
    peer = await fixture(
      "mixed-peer-" + randomUUID().slice(0, 8),
      "1990-01-01",
    ),
    made = await call(
      "rooms",
      { puzzle, mode, input, ranked: false, mixed: true, private: true },
      host.token,
    );
  assert.equal(made.status, 201);
  return { host, peer, room: made.body };
}
async function finishMixedVirtual(
  person: any,
  attempt: any,
  puzzle: string,
  target: string[] = inverse(attempt.scramble),
) {
  assert.equal(
    (
      await call(
        `attempts/${attempt.id}/inspect`,
        { nonce: attempt.nonce },
        person.token,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await call(
        `attempts/${attempt.id}/start`,
        { nonce: attempt.nonce },
        person.token,
      )
    ).status,
    201,
  );
  await db.attempt.update({
    where: { id: attempt.id },
    data: { startedAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (
      await call(
        `attempts/${attempt.id}/moves`,
        {
          nonce: attempt.nonce,
          events: target.map((move, sequence) => ({
            move,
            sequence,
            elapsedMs: sequence + 1,
          })),
        },
        person.token,
      )
    ).status,
    201,
  );
  const result = await call(
    `attempts/${attempt.id}/finish`,
    { nonce: attempt.nonce },
    person.token,
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.status, "APPROVED");
  return result.body;
}
test("mixed races share WCA scrambles across virtual and scans for every puzzle and preserve actual private history", async () => {
  for (const puzzle of ["2x2", "3x3", "4x4", "pyraminx"]) {
    const { host, peer, room } = await mixedHttpRoom(puzzle);
    assert.equal(
      (await call("rooms/join", { code: room.code, input: "scan" }, peer.token))
        .status,
      201,
    );
    const before = await call(`rooms/${room.id}`, undefined, peer.token);
    assert.equal(before.body.input, "scan");
    assert.equal(Object.hasOwn(before.body, "mixedScramble"), false);
    assert.equal(
      (await call(`rooms/${room.id}/start`, {}, host.token)).status,
      201,
    );
    const [a, b] = await Promise.all([
      call(`rooms/${room.id}/attempts`, {}, host.token),
      call(`rooms/${room.id}/attempts`, {}, peer.token),
    ]);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.deepEqual(a.body.scramble, b.body.scramble);
    assert.deepEqual(a.body.scrambleSource, b.body.scrambleSource);
    assert.equal(a.body.input, "virtual");
    assert.equal(b.body.input, "scan");
    assert.equal(
      (await call(`rooms/${room.id}/input`, { input: "virtual" }, peer.token))
        .status,
      409,
    );
    assert.equal(
      (
        await call(
          `attempts/${b.body.id}/moves`,
          {
            nonce: b.body.nonce,
            events: [{ move: "R", sequence: 0, elapsedMs: 1 }],
          },
          peer.token,
        )
      ).status,
      403,
    );
    const initial = practiceApply(solvedPuzzle(puzzle as any), a.body.scramble),
      faces = (state: any) =>
        isPyraminx(state) ? pyraminxFacelets(state) : facelets(state);
    assert.equal(
      (
        await call(
          `attempts/${b.body.id}/checkpoint`,
          { nonce: b.body.nonce, stage: "scramble", faces: faces(initial) },
          peer.token,
        )
      ).status,
      201,
    );
    await call(
      `attempts/${b.body.id}/inspect`,
      { nonce: b.body.nonce },
      peer.token,
    );
    await call(
      `attempts/${b.body.id}/start`,
      { nonce: b.body.nonce },
      peer.token,
    );
    await db.attempt.update({
      where: { id: b.body.id },
      data: { startedAt: new Date(Date.now() - 1000) },
    });
    assert.equal(
      (
        await call(
          `attempts/${b.body.id}/finish`,
          { nonce: b.body.nonce },
          peer.token,
        )
      ).body.status,
      "AWAITING_EVIDENCE",
    );
    assert.equal(
      (
        await call(
          `attempts/${b.body.id}/checkpoint`,
          {
            nonce: b.body.nonce,
            stage: "final",
            faces: faces(solvedPuzzle(puzzle as any)),
          },
          peer.token,
        )
      ).body.status,
      "APPROVED",
    );
    const target =
      puzzle === "pyraminx"
        ? pyraminxInverse(a.body.scramble)
        : inverse(a.body.scramble);
    await finishMixedVirtual(host, a.body, puzzle, target);
    for (const [person, input, id] of [
      [host, "virtual", a.body.id],
      [peer, "scan", b.body.id],
    ] as const) {
      const history = await call(
          `me/history?input=${input}`,
          undefined,
          person.token,
        ),
        item = history.body.items.find((v: any) => v.id === id);
      assert.equal(item.room.input, input);
      assert.equal(item.room.mixed, true);
      assert.equal(item.replayAvailable, input === "virtual");
      assert.equal(
        input === "scan" ? item.moveCount === null : item.moveCount > 0,
        true,
      );
      assert.equal(
        (
          await call(
            `me/history?input=${input === "scan" ? "virtual" : "scan"}`,
            undefined,
            person.token,
          )
        ).body.items.some((v: any) => v.id === id),
        false,
      );
      assert.equal(
        (await call(`me/replays/${id}`, undefined, person.token)).status,
        input === "virtual" ? 200 : 404,
      );
      const stats = await call("me/statistics", undefined, person.token);
      assert.equal(stats.body.categories.length, 1);
      assert.equal(stats.body.categories[0].input, input);
      assert.equal(
        (
          await call(
            `rankings?puzzle=${puzzle}&input=${input}`,
            undefined,
            person.token,
          )
        ).body.some((v: any) => v.id === id),
        false,
      );
    }
  }
});
test("mixed room selection defaults safely, requires membership, and cannot become ranked or change attempt input", async () => {
  const { host, peer, room } = await mixedHttpRoom();
  assert.equal(
    (await call(`rooms/${room.id}/input`, { input: "scan" }, peer.token))
      .status,
    403,
  );
  await call("rooms/join", { code: room.code }, peer.token);
  assert.equal(
    (await call(`rooms/${room.id}`, undefined, peer.token)).body.input,
    "virtual",
  );
  assert.equal(
    (await call(`rooms/${room.id}/input`, { input: "scan" }, peer.token))
      .status,
    201,
  );
  assert.equal(
    (await call("rooms/join", { code: room.code }, peer.token)).status,
    201,
  );
  assert.equal(
    (await call(`rooms/${room.id}`, undefined, peer.token)).body.input,
    "scan",
  );
  assert.equal(
    (
      await call(
        "rooms/join",
        { code: room.code, input: "virtual" },
        peer.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (await call(`rooms/${room.id}/input`, { input: "smart" }, peer.token))
      .status,
    400,
  );
  assert.equal(
    (
      await call(
        "rooms",
        {
          puzzle: "3x3",
          input: "virtual",
          mode: "race",
          mixed: true,
          ranked: true,
        },
        host.token,
      )
    ).status,
    400,
  );
  await call(`rooms/${room.id}/start`, {}, host.token);
  const a = (await call(`rooms/${room.id}/attempts`, {}, peer.token)).body;
  for (const data of [
    { ranked: true },
    { competitionAttempt: true },
    { mixed: false },
    { input: "scan" },
  ])
    await assert.rejects(db.room.update({ where: { id: room.id }, data }));
  await assert.rejects(
    db.roomMember.update({
      where: { roomId_userId: { roomId: room.id, userId: peer.u.id } },
      data: { input: "virtual" },
    }),
  );
  await assert.rejects(
    db.attempt.update({ where: { id: a.id }, data: { input: "virtual" } }),
  );
  await assert.rejects(
    db.attempt.update({ where: { id: a.id }, data: { roomId: randomUUID() } }),
  );
  assert.equal(
    (await call(`attempts/${a.id}/inspect`, { nonce: "wrong" }, peer.token))
      .status,
    403,
  );
  await call(`attempts/${a.id}/interrupt`, {}, peer.token);
  assert.equal(
    (await call(`attempts/${a.id}/inspect`, { nonce: a.nonce }, peer.token))
      .status,
    400,
  );
});
test("mixed telemetry games reject scans, keep authored sprint setup, and share daily scramble provenance", async () => {
  for (const mode of ["pattern", "sprint", "relay"]) {
    const { host, peer, room } = await mixedHttpRoom("3x3", mode);
    assert.equal(
      (await call("rooms/join", { code: room.code, input: "scan" }, peer.token))
        .status,
      400,
    );
    await call("rooms/join", { code: room.code }, peer.token);
    assert.equal(
      (await call(`rooms/${room.id}/input`, { input: "scan" }, peer.token))
        .status,
      400,
    );
    await call(`rooms/${room.id}/start`, {}, host.token);
    const stored = await db.room.findUniqueOrThrow({ where: { id: room.id } }),
      person = mode === "relay" && stored.roster[0] === peer.u.id ? peer : host;
    const a = (await call(`rooms/${room.id}/attempts`, {}, person.token)).body;
    if (mode === "sprint") {
      assert.deepEqual(a.scramble, []);
      assert.equal(a.scrambleSource, null);
    } else assert.ok(a.scrambleSource);
  }
  const { host, peer, room } = await mixedHttpRoom("3x3", "daily");
  await call("rooms/join", { code: room.code, input: "scan" }, peer.token);
  await call(`rooms/${room.id}/start`, {}, host.token);
  const a = (await call(`rooms/${room.id}/attempts`, {}, host.token)).body,
    b = (await call(`rooms/${room.id}/attempts`, {}, peer.token)).body;
  assert.deepEqual(a.scramble, b.scramble);
  assert.deepEqual(a.scrambleSource, b.scrambleSource);
  const view = (await call(`rooms/${room.id}`, undefined, peer.token)).body;
  assert.equal(view.mixedChallengeDate, new Date().toISOString().slice(0, 10));
  assert.equal(view.mixedScramble, undefined);
  assert.equal(view.ownAttempt.input, "scan");
});
test("mixed smart routing uses the player's frozen input rather than the host default, including relay handoff", async () => {
  const { play, smart } = await scheduledSmartServices(),
    host = await fixture("mixed-smart-host", "1990-01-01"),
    peer = await fixture("mixed-smart-peer", "1990-01-01"),
    actor = await communityActor(host),
    other = await communityActor(peer);
  for (const mode of ["race", "pattern", "sprint", "relay"]) {
    const room = await play.create(actor, {
      puzzle: "3x3",
      input: "virtual",
      mode,
      ranked: false,
      mixed: true,
      private: true,
    });
    await play.join(other, { code: room.code, input: "smart" });
    await play.startRoom(actor, room.id);
    const stored = await db.room.findUniqueOrThrow({ where: { id: room.id } }),
      order = mode === "relay" ? stored.roster : [peer.u.id, host.u.id];
    for (const userId of order) {
      const who = userId === peer.u.id ? other : actor,
        a = await play.attempt(who, room.id),
        target =
          mode === "sprint"
            ? room.target
            : [
                ...inverse(a.scramble),
                ...(mode === "pattern" ? room.target : []),
              ];
      if (userId === peer.u.id) {
        assert.equal(a.input, "smart");
        await assert.rejects(
          play.moves(who, a.id, {
            nonce: a.nonce,
            events: [{ move: "R", sequence: 0, elapsedMs: 1 }],
          }),
        );
        const hardware = applyMoves(solvedCube(), a.scramble),
          row = await smart.bind(who, a.id, {
            nonce: a.nonce,
            version: a.version,
            model: "gan-356-i3",
            platform: "ios",
            faces: facelets(hardware),
            counter: 250,
          });
        assert.equal(
          (
            await finishSyntheticSmart(
              { play, service: smart, actor: who, row, hardware },
              target,
            )
          ).status,
          "APPROVED",
        );
        assert.equal(
          (await call(`me/replays/${a.id}`, undefined, peer.token)).status,
          mode === "race" ? 200 : 404,
        );
      } else {
        await assert.rejects(smart.get(who, a.id));
        await finishMixedVirtual(host, a, "3x3", target);
      }
    }
    if (mode === "relay")
      assert.equal((await play.room(actor, room.id)).relay?.status, "complete");
  }
  const history = (await call("me/history?input=smart", undefined, peer.token))
    .body;
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0].room.input, "smart");
  assert.equal(history.items[0].replayAvailable, true);
});
test("mixed smart HTTP routes require the selected input and retain default hardware gates", async () => {
  await withSmartHttp(async (base) => {
    const host = await fixture("mixed-smart-http-host", "1990-01-01"),
      peer = await fixture("mixed-smart-http-peer", "1990-01-01"),
      room = (
        await call(
          "rooms",
          {
            puzzle: "3x3",
            input: "smart",
            mode: "race",
            mixed: true,
            ranked: false,
            private: true,
          },
          host.token,
          undefined,
          base,
        )
      ).body;
    assert.equal(
      (
        await call(
          "rooms/join",
          { code: room.code, input: "virtual" },
          peer.token,
          undefined,
          base,
        )
      ).status,
      201,
    );
    await call(`rooms/${room.id}/start`, {}, host.token, undefined, base);
    const a = (
        await call(`rooms/${room.id}/attempts`, {}, host.token, undefined, base)
      ).body,
      b = (
        await call(`rooms/${room.id}/attempts`, {}, peer.token, undefined, base)
      ).body;
    assert.equal(a.input, "smart");
    assert.equal(b.input, "virtual");
    assert.deepEqual(a.scramble, b.scramble);
    assert.equal(
      (
        await call(
          `smart-attempts/${b.id}`,
          undefined,
          peer.token,
          undefined,
          base,
        )
      ).status,
      400,
    );
    const bound = await call(
      `smart-attempts/${a.id}/bind`,
      {
        nonce: a.nonce,
        version: a.version,
        model: "gan-356-i3",
        platform: "ios",
        faces: facelets(applyMoves(solvedCube(), a.scramble)),
        counter: 250,
      },
      host.token,
      undefined,
      base,
    );
    assert.equal(bound.status, 201);
    assert.equal(
      (
        await call(
          `attempts/${a.id}/moves`,
          {
            nonce: a.nonce,
            events: [{ move: "R", sequence: 0, elapsedMs: 1 }],
          },
          host.token,
          undefined,
          base,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          `smart-attempts/${a.id}/bind`,
          {
            nonce: a.nonce,
            version: a.version,
            model: "gan-356-i3",
            platform: "ios",
            faces: facelets(applyMoves(solvedCube(), a.scramble)),
            counter: 250,
          },
          host.token,
        )
      ).status,
      403,
    );
    const view = await call(
      `rooms/${room.id}`,
      undefined,
      peer.token,
      undefined,
      base,
    );
    assert.equal(view.body.input, "virtual");
    assert.equal(view.body.mixedScrambleSource, undefined);
  });
});
test("mixed mutations recheck session expiry after room locks and before storing generated scrambles", async () => {
  const { play } = await scheduledSmartServices(),
    host = await fixture("mixed-delayed-host", "1990-01-01"),
    actor = await communityActor(host),
    room = await play.create(actor, {
      puzzle: "3x3",
      input: "virtual",
      mode: "race",
      mixed: true,
      ranked: false,
      private: true,
    }),
    deadline = Date.now() + 1200;
  await db.session.update({
    where: { id: actor.sessionId },
    data: { expiresAt: new Date(deadline) },
  });
  const changed = await learningLockDelay("Room", room.id, deadline, () =>
    play.chooseInput(actor, room.id, { input: "scan" }),
  );
  assert.ok(changed.error);
  assert.equal(
    (
      await db.roomMember.findUniqueOrThrow({
        where: { roomId_userId: { roomId: room.id, userId: host.u.id } },
      })
    ).input,
    "virtual",
  );
  const fresh = await fixture("mixed-generation-host", "1990-01-01"),
    request = await communityActor(fresh),
    second = await play.create(request, {
      puzzle: "3x3",
      input: "virtual",
      mode: "race",
      mixed: true,
      ranked: false,
      private: true,
    });
  await play.startRoom(request, second.id);
  const real = (play as any).gameScramble.bind(play);
  let release!: () => void, entered!: () => void;
  const wait = new Promise<void>((resolve) => {
      release = resolve;
    }),
    started = new Promise<void>((resolve) => {
      entered = resolve;
    });
  (play as any).gameScramble = async (...args: any[]) => {
    const set = await real(...args);
    entered();
    await wait;
    return set;
  };
  try {
    const pending = play.attempt(request, second.id).then(
      (value) => ({ value, error: null as any }),
      (error) => ({ value: null, error }),
    );
    await started;
    await db.session.delete({ where: { id: request.sessionId } });
    release();
    assert.ok((await pending).error);
    assert.equal(await db.attempt.count({ where: { roomId: second.id } }), 0);
    assert.equal(
      (await db.room.findUniqueOrThrow({ where: { id: second.id } }))
        .mixedScramble,
      null,
    );
  } finally {
    release();
    (play as any).gameScramble = real;
  }
});
test("mixed room start freezes queued input updates under the actual room lock", async () => {
  const { host, peer, room } = await mixedHttpRoom();
  await call("rooms/join", { code: room.code }, peer.token);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    locked = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const blocker = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${room.id}::uuid FOR UPDATE`;
      entered();
      await gate;
      await tx.room.update({
        where: { id: room.id },
        data: { status: "ACTIVE", roster: [host.u.id, peer.u.id] },
      });
    },
    { timeout: 10000 },
  );
  await locked;
  const pending = call(`rooms/${room.id}/input`, { input: "scan" }, peer.token);
  try {
    await waitFor(async () => {
      const [row] = await db.$queryRaw<
        { waiting: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%"Room"%') AS waiting`;
      return row.waiting;
    });
  } finally {
    release();
    await blocker;
  }
  assert.equal((await pending).status, 409);
  assert.equal(
    (
      await db.roomMember.findUniqueOrThrow({
        where: { roomId_userId: { roomId: room.id, userId: peer.u.id } },
      })
    ).input,
    "virtual",
  );
});
test("approved smart archives replay all three models privately with continuity limits and no hardware activation", async () => {
  const outsider = await fixture("smart-replay-outsider", "1990-01-01"),
    { ReplayPacket } = await import("@cubers/core");
  for (const model of ["gan-356-i3", "gocube-edge", "giiker-i3s"]) {
    const f = await smartGameFixture("saved-replay-" + model, false, model);
    await finishSyntheticSmart(f, inverse(f.row.scramble));
    const saved = await call(
      `me/replays/${f.row.id}`,
      undefined,
      f.person.token,
    );
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const packet = ReplayPacket.parse(saved.body);
    assert.equal(packet.input, "smart");
    assert.deepEqual((packet as any).telemetry, {
      model,
      continuity: model === "gan-356-i3" ? "counter" : "net-state",
    });
    for (const key of [
      "smart",
      "nonce",
      "epoch",
      "counter",
      "evidenceId",
      "reviewerId",
      "roomId",
      "userId",
    ])
      assert.equal(Object.hasOwn(packet, key), false);
    assert.equal(
      practiceSolved(
        practiceApply(
          practiceApply(solvedPuzzle("3x3"), packet.scramble),
          packet.moves,
        ),
      ),
      true,
    );
    const item = (
      await call("me/history?input=smart", undefined, f.person.token)
    ).body.items.find((row: any) => row.id === f.row.id);
    assert.equal(item.replayAvailable, true);
    assert.equal(
      model === "gan-356-i3" ? item.moveCount > 0 : item.moveCount === null,
      true,
    );
    const stats = (await call("me/statistics", undefined, f.person.token)).body
      .categories[0];
    assert.equal(
      model === "gan-356-i3"
        ? stats.turnsPerSecond > 0
        : stats.turnsPerSecond === null,
      true,
    );
    assert.equal(
      (await call(`me/replays/${f.row.id}`, undefined, outsider.token)).status,
      404,
    );
    assert.equal(
      (
        await call(
          `smart-attempts/${f.row.id}/bind`,
          {
            nonce: f.row.nonce,
            version: 0,
            model,
            platform: "ios",
            faces: facelets(solvedCube()),
            counter: model === "gan-356-i3" ? 250 : null,
          },
          f.person.token,
        )
      ).status,
      403,
    );
  }
});
test("smart archived replay rejects unverified, recovered, mismatched and unsupported saved metadata", async () => {
  const f = await smartGameFixture("replay-invalid-archive");
  await finishSyntheticSmart(f, inverse(f.row.scramble));
  const original = await db.attempt.findUniqueOrThrow({
    where: { id: f.row.id },
  });
  for (const patch of [
    { smart: null, smartSeenAt: null },
    { scrambleVerifiedAt: null },
    { smart: null, smartSeenAt: null },
    { finishedAt: null },
    { smartSeenAt: new Date(original.finishedAt!.getTime() - 30001) },
    { smart: { ...(original.smart as any), nextSequence: 0 } },
    { smart: { ...(original.smart as any), recoveryRun: 1 } },
    { smart: { ...(original.smart as any), independentState: false } },
  ]) {
    const data = {
      smart: original.smart,
      smartSeenAt: original.smartSeenAt,
      scrambleVerifiedAt: original.scrambleVerifiedAt,
      finishedAt: original.finishedAt,
      ...patch,
    };
    await db.attempt.update({
      where: { id: f.row.id },
      data: {
        ...data,
        smart:
          data.smart === null
            ? (await import("@prisma/client")).Prisma.DbNull
            : (data.smart as any),
      },
    });
    assert.equal(
      (await call(`me/replays/${f.row.id}`, undefined, f.person.token)).status,
      404,
    );
    assert.equal(
      (await call("me/history?input=smart", undefined, f.person.token)).body
        .items[0].replayAvailable,
      false,
    );
  }
});
test("smart archived replay rechecks source, current session and guardian authority after validation", async () => {
  const { ProfileController } =
      await import("../../apps/api/src/profile.controller"),
    { validatedReplay } = await import("@cubers/core");
  for (const change of ["moves", "smart", "category", "session", "guardian"]) {
    const f = await smartGameFixture(
      "replay-late-" + change,
      false,
      "gan-356-i3",
      change === "guardian",
    );
    await finishSyntheticSmart(f, inverse(f.row.scramble));
    const controller = new ProfileController(db as Db, infrastructure, {
      validate: async (source: unknown) => {
        const packet = validatedReplay(source);
        if (change === "moves")
          await db.attempt.update({
            where: { id: f.row.id },
            data: { moves: [] },
          });
        if (change === "smart")
          await db.attempt.update({
            where: { id: f.row.id },
            data: {
              smart: {
                ...((
                  await db.attempt.findUniqueOrThrow({
                    where: { id: f.row.id },
                  })
                ).smart as any),
                nextSequence: 0,
              },
            },
          });
        if (change === "category")
          await db.room.update({
            where: { id: f.room.id },
            data: { input: "scan" },
          });
        if (change === "session")
          await db.session.delete({ where: { id: f.actor.sessionId } });
        if (change === "guardian")
          await db.consent.updateMany({
            where: { childId: f.actor.user.id },
            data: { status: "REVOKED" },
          });
        return packet;
      },
    } as any);
    await assert.rejects(
      controller.replay(f.actor, f.row.id),
      (error: any) =>
        error.getStatus?.() ===
        (["session", "guardian"].includes(change) ? 403 : 409),
    );
  }
});
async function replaySharingFixture(
  name: string,
  birthDate = "1990-01-01",
  puzzle = "3x3",
) {
  const person = await fixture("share-replay-" + name, birthDate);
  let guardian: any;
  if (Number(birthDate.slice(0, 4)) > 2013) {
    guardian = await fixture(
      "share-replay-parent-" + name,
      "1980-01-01",
      "ADMIN",
    );
    await db.consent.create({
      data: {
        childId: person.u.id,
        guardianId: guardian.u.id,
        documentId: randomUUID(),
        status: "APPROVED",
        publicPosting: true,
        recording: true,
      },
    });
  }
  const room = await db.room.create({
      data: {
        ownerId: person.u.id,
        code: opaque(),
        puzzle,
        input: "virtual",
        mode: "race",
        ranked: false,
        private: true,
      },
    }),
    moves = puzzle === "pyraminx" ? ["R'", "u'"] : ["R'"],
    scramble = puzzle === "pyraminx" ? ["u", "R"] : ["R"],
    attempt = await db.attempt.create({
      data: {
        userId: person.u.id,
        roomId: room.id,
        nonce: opaque(),
        scramble,
        moves: moves.map((move, sequence) => ({
          move,
          sequence,
          elapsedMs: 100 + sequence,
        })),
        status: "APPROVED",
        durationMs: 1000,
        createdAt: new Date("2026-10-17T00:00:00.000Z"),
      },
    });
  return { person, guardian, room, attempt };
}
async function prepareReplayLink(f: any) {
  const made = await call(
    "me/replay-shares",
    { attemptId: f.attempt.id, disclosureConfirmed: true },
    f.person.token,
  );
  assert.equal(made.status, 201, JSON.stringify(made.body));
  return made.body;
}
async function publishReplayLink(person: any, row: any) {
  const result = await call(
    `me/replay-shares/${row.id}/publish`,
    {
      revision: row.revision,
      packetDigest: row.packetDigest,
      disclosureConfirmed: true,
    },
    person.token,
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}
test("replay sharing publishes anonymous four-puzzle snapshots, rotates hashed links, respects blocking and withdraws access", async () => {
  const recipient = await fixture("share-replay-recipient", "1990-01-01");
  for (const puzzle of ["2x2", "3x3", "4x4", "pyraminx"]) {
    const f = await replaySharingFixture(
        "adult-" + puzzle,
        "1990-01-01",
        puzzle,
      ),
      row = await prepareReplayLink(f);
    assert.equal(row.status, "READY");
    assert.notEqual(row.id, f.attempt.id);
    const result = await publishReplayLink(f.person, row),
      saved = await db.replayShare.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(saved.tokenHash, hash(result.key));
    assert.notEqual(saved.tokenHash, result.key);
    assert.equal(JSON.stringify(row).includes(result.key), false);
    assert.equal(
      (await call("shared-replays/open", { id: row.id, key: result.key }))
        .status,
      401,
    );
    const opened = await call(
      "shared-replays/open",
      { id: row.id, key: result.key },
      recipient.token,
    );
    assert.equal(opened.status, 201, JSON.stringify(opened.body));
    assert.equal(opened.body.packet.attemptId, row.id);
    assert.notEqual(
      opened.body.packet.createdAt,
      f.attempt.createdAt.toISOString(),
    );
    assert.equal(opened.body.packet.createdAt, row.createdAt);
    for (const value of [
      f.person.u.id,
      f.person.u.email,
      f.attempt.id,
      f.attempt.nonce,
      f.room.id,
    ])
      assert.equal(JSON.stringify(opened.body).includes(value), false);
    const newer = await publishReplayLink(f.person, result.share);
    assert.equal(
      (
        await call(
          "shared-replays/open",
          { id: row.id, key: result.key },
          recipient.token,
        )
      ).status,
      404,
    );
    await db.social.create({
      data: { actorId: recipient.u.id, targetId: f.person.u.id, kind: "block" },
    });
    assert.equal(
      (
        await call(
          "shared-replays/open",
          { id: row.id, key: newer.key },
          recipient.token,
        )
      ).status,
      404,
    );
    await db.social.deleteMany({
      where: {
        actorId: recipient.u.id,
        targetId: f.person.u.id,
        kind: "block",
      },
    });
    assert.equal(
      (
        await call(
          "shared-replays/open",
          { id: row.id, key: newer.key },
          recipient.token,
        )
      ).status,
      201,
    );
    const exported = await call("me/export", undefined, f.person.token);
    assert.equal(exported.status, 200);
    assert.ok(
      exported.body.replayShares.some((share: any) => share.id === row.id),
    );
    assert.equal(
      Object.hasOwn(exported.body.replayShares[0], "tokenHash"),
      false,
    );
    assert.equal(
      (await call(`me/replay-shares/${row.id}/cancel`, {}, recipient.token))
        .status,
      404,
    );
    assert.equal(
      (await call(`me/replay-shares/${row.id}/cancel`, {}, f.person.token))
        .status,
      201,
    );
    assert.equal(
      (
        await call(
          "shared-replays/open",
          { id: row.id, key: newer.key },
          recipient.token,
        )
      ).status,
      404,
    );
    await assert.rejects(
      db.replayShare.update({
        where: { id: row.id },
        data: { status: "READY" },
      }),
    );
    await assert.rejects(
      db.replayShare.update({ where: { id: row.id }, data: { packet: {} } }),
    );
    await assert.rejects(
      db.replayShare.update({
        where: { id: row.id },
        data: { expiresAt: new Date(Date.now() + 20 * 86400000) },
      }),
    );
  }
});
test("replay sharing requires exact current guardian and independent moderator previews before releasing child or teen links", async () => {
  const staff = await fixture("share-replay-reviewer", "1980-01-01", "ADMIN"),
    recipient = await fixture("share-replay-child-viewer", "1990-01-01");
  for (const birth of ["2018-01-01", "2010-01-01"]) {
    const f = await replaySharingFixture("minor-" + birth, birth),
      row = await prepareReplayLink(f);
    assert.equal(
      row.status,
      f.guardian ? "PENDING_GUARDIAN" : "PENDING_REVIEW",
    );
    assert.equal(
      (
        await call(
          `me/replay-shares/${row.id}/publish`,
          {
            revision: row.revision,
            packetDigest: row.packetDigest,
            disclosureConfirmed: true,
          },
          f.person.token,
        )
      ).status,
      409,
    );
    let current = row;
    if (f.guardian) {
      const preview = await call(
        `guardian/replay-shares/${row.id}/preview`,
        {},
        f.guardian.token,
      );
      assert.equal(preview.status, 201);
      const approval = {
        revision: preview.body.revision,
        packetDigest: preview.body.packetDigest,
        receipt: preview.body.receipt,
        approve: true,
        packetChecked: true,
      };
      assert.equal(
        (
          await call(
            `guardian/replay-shares/${row.id}/review`,
            { ...approval, packetChecked: false },
            f.guardian.token,
          )
        ).status,
        400,
      );
      current = (
        await call(
          `guardian/replay-shares/${row.id}/review`,
          approval,
          f.guardian.token,
        )
      ).body;
      assert.equal(current.status, "PENDING_REVIEW");
      assert.equal(
        (
          await call(
            `admin/replay-shares/${row.id}/preview`,
            {},
            f.guardian.token,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await call(
            `guardian/replay-shares/${row.id}/review`,
            approval,
            f.guardian.token,
          )
        ).status,
        409,
      );
    }
    const preview = await call(
      `admin/replay-shares/${row.id}/preview`,
      {},
      staff.token,
    );
    assert.equal(preview.status, 201);
    assert.equal(preview.body.packet.attemptId, row.id);
    const approved = await call(
      `admin/replay-shares/${row.id}/review`,
      {
        revision: preview.body.revision,
        packetDigest: preview.body.packetDigest,
        receipt: preview.body.receipt,
        approve: true,
        packetChecked: true,
      },
      staff.token,
    );
    assert.equal(approved.status, 201);
    assert.equal(approved.body.status, "READY");
    const link = await publishReplayLink(f.person, approved.body);
    assert.equal(
      (
        await call(
          "shared-replays/open",
          { id: row.id, key: link.key },
          recipient.token,
        )
      ).status,
      201,
    );
    if (f.guardian) {
      assert.equal(
        (
          await call(
            `guardian/children/${f.person.u.id}/consent`,
            undefined,
            f.guardian.token,
            "DELETE",
          )
        ).status,
        200,
      );
      assert.equal(
        (await db.replayShare.findUniqueOrThrow({ where: { id: row.id } }))
          .status,
        "CANCELLED",
      );
      await db.consent.updateMany({
        where: { childId: f.person.u.id },
        data: { status: "APPROVED", publicPosting: true, recording: true },
      });
      assert.equal(
        (
          await call(
            "shared-replays/open",
            { id: row.id, key: link.key },
            recipient.token,
          )
        ).status,
        404,
      );
    }
  }
});
test("replay sharing preserves smart continuity labels without exposing original attempt or connection context", async () => {
  const recipient = await fixture("shared-smart-recipient", "1990-01-01");
  for (const model of ["gan-356-i3", "gocube-edge", "giiker-i3s"] as const) {
    const f = await smartGameFixture("shared-" + model, false, model);
    await finishSyntheticSmart(f, inverse(f.row.scramble));
    const row = await prepareReplayLink({ person: f.person, attempt: f.row }),
      link = await publishReplayLink(f.person, row),
      opened = await call(
        "shared-replays/open",
        { id: row.id, key: link.key },
        recipient.token,
      );
    assert.equal(opened.status, 201);
    assert.deepEqual(opened.body.packet.telemetry, {
      model,
      continuity: model === "gan-356-i3" ? "counter" : "net-state",
    });
    assert.notEqual(opened.body.packet.attemptId, f.row.id);
    for (const key of [
      "smart",
      "epoch",
      "counter",
      "nonce",
      "reference",
      "platform",
    ])
      assert.equal(Object.hasOwn(opened.body.packet, key), false);
  }
});
test("replay sharing rejects source changes during workers, expired sessions after locks, and stale previews", async () => {
  const { ReplayShares } = await import("../../apps/api/src/replay-shares"),
    { validatedReplay } = await import("@cubers/core"),
    { Replays } = await import("../../apps/api/dist/replays"),
    f = await replaySharingFixture("late-permissions"),
    actor = await communityActor(f.person),
    row = await prepareReplayLink(f),
    recipient = await fixture("share-late-reader", "1990-01-01"),
    reader = await communityActor(recipient),
    link = await publishReplayLink(f.person, row);
  const changed = new ReplayShares(db as Db, infrastructure, {
    validate: async (source: unknown) => {
      const packet = validatedReplay(source);
      await db.replayShare.update({
        where: { id: row.id },
        data: {
          status: "CANCELLED",
          tokenHash: null,
          revision: { increment: 1 },
        },
      });
      return packet;
    },
  } as any);
  await assert.rejects(changed.open(reader, { id: row.id, key: link.key }));
  const second = await replaySharingFixture("expired-session"),
    request = await communityActor(second.person),
    next = await prepareReplayLink(second),
    worker = new Replays(),
    service = new ReplayShares(db as Db, infrastructure, worker),
    deadline = Date.now() + 1200;
  try {
    await db.session.update({
      where: { id: request.sessionId },
      data: { expiresAt: new Date(deadline) },
    });
    const result = await learningLockDelay(
      "ReplayShare",
      next.id,
      deadline,
      () =>
        service.publish(request, next.id, {
          revision: next.revision,
          packetDigest: next.packetDigest,
          disclosureConfirmed: true,
        }),
    );
    assert.ok(result.error);
    assert.equal(
      (await db.replayShare.findUniqueOrThrow({ where: { id: next.id } }))
        .tokenHash,
      null,
    );
  } finally {
    await worker.onModuleDestroy();
  }
});
test("replay sharing expiry rolls back publication after real waits and expired snapshots cannot load", async () => {
  const f = await replaySharingFixture("expiry"),
    original = await prepareReplayLink(f),
    stored = await db.replayShare.findUniqueOrThrow({
      where: { id: original.id },
    }),
    { ReplayPacket } = await import("@cubers/core"),
    { ReplayShares } = await import("../../apps/api/src/replay-shares"),
    { Replays } = await import("../../apps/api/dist/replays"),
    worker = new Replays(),
    service = new ReplayShares(db as Db, infrastructure, worker),
    actor = await communityActor(f.person),
    id = randomUUID(),
    createdAt = new Date(),
    expiresAt = new Date(Date.now() + 1500),
    packet = ReplayPacket.parse({
      ...(stored.packet as any),
      attemptId: id,
      createdAt: createdAt.toISOString(),
    });
  const row = await db.replayShare.create({
    data: {
      ...stored,
      id,
      createdAt,
      expiresAt,
      packet: packet as any,
      packetDigest: hash(JSON.stringify(packet)),
      tokenHash: null,
    },
  });
  try {
    const result = await learningLockDelay(
      "ReplayShare",
      row.id,
      expiresAt.getTime(),
      () =>
        service.publish(actor, row.id, {
          revision: row.revision,
          packetDigest: row.packetDigest,
          disclosureConfirmed: true,
        }),
    );
    assert.ok(result.error);
    assert.equal(
      (await db.replayShare.findUniqueOrThrow({ where: { id } })).tokenHash,
      null,
    );
    assert.equal(
      (await call(`me/replay-shares/${id}/cancel`, {}, f.person.token)).status,
      201,
    );
    assert.equal(
      (await db.replayShare.findUniqueOrThrow({ where: { id } })).status,
      "EXPIRED",
    );
  } finally {
    await worker.onModuleDestroy();
  }
});
test("replay sharing durable withdrawal survives database rollback and cannot be reversed by replaying decisions", async () => {
  const f = await replaySharingFixture("journal"),
    row = await prepareReplayLink(f),
    link = await publishReplayLink(f.person, row),
    root = await realpath(
      await mkdtemp(join(tmpdir(), "cubers-replay-withdraw-")),
    ),
    { mkdir, chmod } = await import("node:fs/promises"),
    { FileDeletionJournal } =
      await import("../../apps/api/src/deletion-journal"),
    { applyMediaRecoveryRecord } =
      await import("../../apps/api/src/media-recovery");
  await chmod(root, 0o700);
  const directory = join(root, "journal");
  await mkdir(directory, { mode: 0o700 });
  try {
    const journal = await FileDeletionJournal.initialize(
        directory,
        join(root, "key.json"),
        "INTL",
      ),
      record = await journal.appendMedia(f.person.u.id, {
        kind: "REPLAY_SHARE_WITHDRAWAL",
        shareId: row.id,
        decision: "CANCELLED",
      });
    assert.equal(record.version, 2);
    await assert.rejects(
      db.$transaction(async (tx) => {
        await applyMediaRecoveryRecord(tx, record as any);
        throw Error("synthetic rollback after independent append");
      }),
    );
    assert.equal(
      (await db.replayShare.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
      "READY",
    );
    await db.$transaction((tx) => applyMediaRecoveryRecord(tx, record as any));
    const after = await db.replayShare.findUniqueOrThrow({
      where: { id: row.id },
    });
    assert.equal(after.status, "CANCELLED");
    assert.equal(after.tokenHash, null);
    await db.$transaction((tx) => applyMediaRecoveryRecord(tx, record as any));
    assert.equal(
      (await db.replayShare.findUniqueOrThrow({ where: { id: row.id } }))
        .revision,
      after.revision,
    );
    assert.equal(
      (
        await call(
          "shared-replays/open",
          { id: row.id, key: link.key },
          f.person.token,
        )
      ).status,
      404,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("replay sharing cleanup redacts old reviews and account deletion removes linked snapshots", async () => {
  const f = await replaySharingFixture("erasure"),
    row = await prepareReplayLink(f),
    stored = await db.replayShare.findUniqueOrThrow({ where: { id: row.id } }),
    { ReplayPacket } = await import("@cubers/core"),
    id = randomUUID(),
    createdAt = new Date(Date.now() - 40 * 86400000),
    packet = ReplayPacket.parse({
      ...(stored.packet as any),
      attemptId: id,
      createdAt: createdAt.toISOString(),
    });
  await db.replayShare.create({
    data: {
      ...stored,
      id,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 7 * 86400000),
      packet: packet as any,
      packetDigest: hash(JSON.stringify(packet)),
      tokenHash: null,
    },
  });
  const audit = await db.audit.create({
    data: {
      actorId: f.person.u.id,
      action: "replay-share.review",
      targetId: id,
      detail: { packetDigest: stored.packetDigest },
    },
  });
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(await db.replayShare.count({ where: { id } }), 0);
  const redacted = await db.audit.findUniqueOrThrow({
    where: { id: audit.id },
  });
  assert.equal(redacted.targetId, "expired-replay-share");
  assert.deepEqual(redacted.detail, { redacted: true });
  assert.equal(
    (await call("me", { confirmation: "DELETE" }, f.person.token, "DELETE"))
      .status,
    200,
  );
  await new Background(db as Db, infrastructure).maintenance();
  assert.equal(
    await db.replayShare.count({ where: { userId: f.person.u.id } }),
    0,
  );
});

test("service health is private, aggregate-only and requires a current full MFA staff session", async () => {
  assert.equal((await call("admin/operations")).status, 401);
  assert.equal(
    (await call("admin/operations", undefined, adultToken)).status,
    403,
  );
  const staff = await fixture("operations-staff", "1990-01-01", "ADMIN");
  const result = await call("admin/operations", undefined, staff.token);
  assert.equal(result.status, 200);
  const snapshot = OperationalSnapshot.parse(result.body);
  assert.equal(snapshot.region, "INTL");
  assert.ok(
    snapshot.checks.some((c) => c.signal === "database" && c.state === "ok"),
  );
  const raw = JSON.stringify(snapshot);
  for (const privateValue of [
    staff.u.email,
    staff.u.id,
    staff.token,
    staff.secret!,
  ])
    assert.ok(!raw.includes(privateValue));
  const response = await fetch(`${origin}/v1/admin/operations`, {
    headers: { Authorization: `Bearer ${staff.token}` },
  });
  assert.match(
    response.headers.get("cache-control") ?? "",
    /private.*no-store/,
  );
  await db.session.updateMany({
    where: { userId: staff.u.id },
    data: { mfaVerified: false },
  });
  assert.equal(
    (await call("admin/operations", undefined, staff.token)).status,
    403,
  );
  assert.equal(
    (
      await call(
        "admin/operations",
        undefined,
        staff.token,
        undefined,
        cnOrigin,
      )
    ).status,
    401,
  );
});

test("service health rechecks staff authority after slow sampling", async () => {
  const staff = await fixture("operations-revoked", "1990-01-01", "ADMIN");
  const request = await communityActor(staff);
  let sampled = 0;
  const delayed = {
    snapshot: async () => {
      sampled++;
      await db.user.update({
        where: { id: staff.u.id },
        data: { role: "USER" },
      });
      return {
        region: "INTL",
        sampledAt: new Date().toISOString(),
        state: "ok",
        checks: [],
        queue: null,
      };
    },
  };
  const controller = new OperationsController(
    db as Db,
    infrastructure,
    delayed as unknown as Operations,
  );
  await assert.rejects(controller.status(request), /Current staff authority/);
  assert.equal(sampled, 1);
});

test("operational Redis signals expire, recover and remain isolated between communities", async () => {
  // Database 15 is reserved for this isolated telemetry test; never flush shared Redis.
  const url = new URL(infrastructure.config.REDIS_URL);
  url.pathname = "/15";
  const local = new Infrastructure({
    ...infrastructure.config,
    REDIS_URL: url.toString(),
  });
  const cn = new Infrastructure({ ...local.config, REGION: "CN" });
  const keys = [
    "INTL:ops:v1:workers",
    "CN:ops:v1:workers",
    ...["maintenance", "media", "smtp"].flatMap((job) => [
      `INTL:ops:v1:job:${job}`,
      `CN:ops:v1:job:${job}`,
    ]),
  ];
  const operations: Operations[] = [];
  let fixtureOwned = false;
  const observe = async (client = local, database: any = db) => {
    const service = new Operations(database, client);
    operations.push(service);
    return service.snapshot();
  };
  try {
    assert.equal(
      await local.redis.exists(...keys),
      0,
      "Telemetry fixture namespace is already in use",
    );
    fixtureOwned = true;
    await local.telemetry.heartbeat("synthetic-operations-worker");
    await local.telemetry.outcome("maintenance", true);
    await local.telemetry.outcome("media", true);
    await local.telemetry.outcome("smtp", false);
    let sample = await observe();
    assert.equal(sample.checks.find((c) => c.signal === "worker")!.state, "ok");
    assert.equal(
      sample.checks.find((c) => c.signal === "maintenance")!.state,
      "ok",
    );
    assert.equal(
      sample.checks.find((c) => c.signal === "smtp")!.state,
      "warning",
    );
    const other = await observe(cn, cnDb);
    assert.equal(other.checks.find((c) => c.signal === "worker")!.count, 0);
    assert.equal(
      other.checks.find((c) => c.signal === "maintenance")!.state,
      "unknown",
    );
    await local.telemetry.outcome("smtp", true);
    await local.redis.zadd(
      keys[0],
      Date.now() - 46000,
      "synthetic-operations-worker",
    );
    sample = await observe();
    assert.equal(
      sample.checks.find((c) => c.signal === "worker")!.state,
      "critical",
    );
    assert.equal(sample.checks.find((c) => c.signal === "smtp")!.state, "ok");
    await local.telemetry.heartbeat("synthetic-operations-worker");
    sample = await observe();
    assert.equal(sample.checks.find((c) => c.signal === "worker")!.state, "ok");
    assert.ok((await local.redis.ttl(keys[0])) > 0);
    const unavailableDb = {
      $transaction: async () => {
        throw Error("sensitive provider response must not escape");
      },
    };
    sample = await observe(local, unavailableDb);
    assert.equal(
      sample.checks.find((c) => c.signal === "database")!.state,
      "critical",
    );
    assert.equal(
      sample.checks.find((c) => c.signal === "posts")!.state,
      "unknown",
    );
    assert.ok(!JSON.stringify(sample).includes("sensitive"));
  } finally {
    for (const service of operations) await service.onApplicationShutdown();
    if (fixtureOwned) {
      await local.redis.del(...keys);
      // BullMQ may initialize only these fixed queue metadata keys on inspection.
      for (const region of ["INTL", "CN"])
        await local.redis.del(`bull:cubers-${region}:meta`);
    }
    await local.close();
    await cn.close();
  }
});

test("operational database samples detect overdue evidence and erasure without exposing content", async () => {
  const owner = await fixture("operations-backlog", "1990-01-01");
  const room = await db.room.create({
    data: {
      code: `ops-${randomUUID()}`,
      ownerId: owner.u.id,
      puzzle: "3x3",
      input: "scanned",
      mode: "race",
      ranked: false,
      private: true,
    },
  });
  const media = await db.media.create({
    data: {
      userId: owner.u.id,
      key: `INTL/operations/${randomUUID()}/upload`,
      type: "video/mp4",
      purpose: "evidence",
      size: 1,
      status: "READY",
    },
  });
  const removalId = randomUUID();
  const expiredAt = new Date(Date.now() - 600000);
  let service: Operations | undefined;
  try {
    await db.attempt.create({
      data: {
        userId: owner.u.id,
        roomId: room.id,
        nonce: randomUUID(),
        scramble: ["R"],
        status: "INTERRUPTED",
        evidenceId: media.id,
        evidenceDeleteAt: expiredAt,
      },
    });
    await db.accountRemoval.create({
      data: {
        id: removalId,
        requestedAt: new Date(Date.now() - 86400000),
        retryAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    service = new Operations(db as Db, infrastructure);
    let sample = await service.snapshot();
    assert.equal(
      sample.checks.find((c) => c.signal === "evidence-retention")!.state,
      "critical",
    );
    // A freshly due repeat erase is routine even if its original request is older.
    assert.ok(
      sample.checks.find((c) => c.signal === "account-erasure")!.count! >= 1,
    );
    await service.onApplicationShutdown();
    service = undefined;
    await db.accountRemoval.update({
      where: { id: removalId },
      data: { retryAt: expiredAt },
    });
    service = new Operations(db as Db, infrastructure);
    sample = await service.snapshot();
    assert.equal(
      sample.checks.find((c) => c.signal === "account-erasure")!.state,
      "critical",
    );
    assert.ok(!JSON.stringify(sample).includes(media.key));
  } finally {
    await service?.onApplicationShutdown();
    await db.accountRemoval.deleteMany({ where: { id: removalId } });
    await db.attempt.deleteMany({ where: { roomId: room.id } });
    await db.media.deleteMany({ where: { id: media.id } });
    await db.room.deleteMany({ where: { id: room.id } });
  }
});

test("operational sampling bounds a Redis outage and reconnects after recovery", async () => {
  const config = { ...infrastructure.config, REDIS_URL: "redis://127.0.0.1:1" };
  const service = new Operations(db as Db, { config });
  try {
    const began = Date.now();
    const failure = await service.snapshot();
    assert.ok(Date.now() - began < 10000);
    assert.equal(
      failure.checks.find((c) => c.signal === "redis")!.state,
      "critical",
    );
    assert.equal(
      failure.checks.find((c) => c.signal === "worker")!.state,
      "unknown",
    );
    assert.equal(failure.queue, null);
    config.REDIS_URL = infrastructure.config.REDIS_URL;
    await new Promise((resolve) => setTimeout(resolve, 10100));
    const recovered = await service.snapshot();
    assert.equal(
      recovered.checks.find((c) => c.signal === "redis")!.state,
      "ok",
    );
  } finally {
    await service.onApplicationShutdown();
  }
});

test("author-declared attachments retain download labels, force post disclosures through edits and keep declaration separate from source claims", async () => {
  const publisher = await fixture("declared-file-publisher", "1990-01-01"),
    other = await fixture("declared-file-other", "1990-01-01");
  const bytes = await sharp({
    create: { width: 100, height: 80, channels: 3, background: "#164fa0" },
  })
    .png()
    .toBuffer();
  for (const body of [
    { purpose: "consent", type: "application/pdf", aiDeclared: true },
    { purpose: "evidence", type: "video/mp4", aiDeclared: true },
    { purpose: "post", type: "image/png", aiDeclared: "true" },
  ])
    assert.equal(
      (await call("media", { ...body, size: bytes.length }, publisher.token))
        .status,
      400,
    );
  const upload = await call(
    "media",
    {
      purpose: "post",
      type: "image/png",
      size: bytes.length,
      aiDeclared: true,
    },
    publisher.token,
  );
  assert.equal(upload.status, 201);
  const id = upload.body.id;
  assert.equal(
    (
      await fetch(upload.body.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: bytes,
      })
    ).ok,
    true,
  );
  assert.equal(
    (await call(`media/${id}/complete`, {}, publisher.token)).status,
    201,
  );
  await new Background(db as Db, infrastructure).processMedia();
  const saved = await db.media.findUniqueOrThrow({ where: { id } });
  assert.equal(saved.status, "READY");
  assert.equal(saved.aiDeclared, true);
  assert.equal(saved.aiLabel, null);
  assert.equal(saved.aiMetadata, null);
  await assert.rejects(
    db.media.update({ where: { id }, data: { aiDeclared: false } }),
  );
  assert.equal((await call(`media/${id}`, undefined, other.token)).status, 403);
  const media = await call(`media/${id}`, undefined, publisher.token);
  assert.equal(media.status, 200);
  assert.equal(media.body.aiDeclared, true);
  assert.equal(media.body.aiLabel, null);
  assert.equal(Object.hasOwn(media.body, "aiMetadata"), false);
  const processed = Buffer.from(
      await (await fetch(media.body.url)).arrayBuffer(),
    ),
    metadata = readImageAiMetadata(processed, "image/png")!;
  assert.equal(metadata.Label, "2");
  assert.equal(metadata.ContentProducer, "");
  assert.equal(metadata.ProduceID, "");
  assert.equal(metadata.ContentPropagator, "Cubers");
  assert.equal(metadata.PropagateID, id);
  const shape = await sharp(processed).metadata();
  assert.equal(shape.width, 320);
  assert.ok(shape.height! > 80);
  const post = await call(
    "posts",
    { body: "Synthetic declared file", mediaIds: [id], aiGenerated: false },
    publisher.token,
  );
  assert.equal(post.status, 201);
  assert.equal(post.body.aiGenerated, true);
  assert.equal(post.body.aiSourceLabel, null);
  assert.equal(post.body.status, "PENDING");
  assert.equal(
    (await call("posts", { body: "Not my file", mediaIds: [id] }, other.token))
      .status,
    400,
  );
  const edited = await call(
    `posts/${post.body.id}`,
    {
      body: "Synthetic edited declaration",
      mediaIds: [id],
      aiGenerated: false,
      revision: post.body.revision,
    },
    publisher.token,
    "PATCH",
  );
  assert.equal(edited.status, 200);
  assert.equal(edited.body.aiGenerated, true);
  assert.equal(edited.body.aiSourceLabel, null);
  assert.equal(edited.body.status, "PENDING");
  assert.equal(edited.body.moderatorApproved, false);
  const exported = await call("me/export", undefined, publisher.token);
  assert.equal(exported.status, 200);
  assert.equal(
    exported.body.media.find((m: any) => m.id === id).aiDeclared,
    true,
  );
  const removed = await call(
    `posts/${post.body.id}`,
    {
      body: "Synthetic attachment removed",
      mediaIds: [],
      aiGenerated: false,
      revision: edited.body.revision,
    },
    publisher.token,
    "PATCH",
  );
  assert.equal(removed.status, 200);
  assert.equal(removed.body.aiGenerated, false);
});

test("pending moderated tutoring cannot deliver after the operator changes AI settings", async () => {
  const { AiTutor } = await import("../../apps/api/src/ai"),
    original = AiTutor.prototype.explain,
    before = await db.setting.findUnique({ where: { key: "ai" } }),
    f = await tutorAuthorityFixture("moderation-setting-change");
  AiTutor.prototype.explain = async function (...args) {
    const result = await original.call(
      this,
      args[0],
      args[1],
      args[2],
      args[3],
      {
        baseUrl: "http://127.0.0.1:4010/v1",
        model: "cubers-simulator",
        enabled: true,
      },
    );
    assert.equal(result.source, "simulated");
    await db.setting.upsert({
      where: { key: "ai" },
      create: {
        key: "ai",
        value: {
          baseUrl: "http://127.0.0.1:4010/v1",
          model: "cubers-simulator",
          enabled: false,
          validatedAt: new Date().toISOString(),
        },
      },
      update: {
        value: {
          baseUrl: "http://127.0.0.1:4010/v1",
          model: "cubers-simulator",
          enabled: false,
          validatedAt: new Date().toISOString(),
        },
      },
    });
    return result;
  };
  try {
    await assert.rejects(
      f.service.tutor(f.actor, f.request),
      (error: any) => error.getStatus?.() === 409,
    );
    assert.equal(
      (await db.setting.findUniqueOrThrow({ where: { key: "ai" } })).value &&
        (
          (await db.setting.findUniqueOrThrow({ where: { key: "ai" } }))
            .value as any
        ).enabled,
      false,
    );
  } finally {
    AiTutor.prototype.explain = original;
    if (before)
      await db.setting.upsert({
        where: { key: "ai" },
        create: { key: "ai", value: before.value as any },
        update: { value: before.value as any },
      });
    else await db.setting.deleteMany({ where: { key: "ai" } });
  }
});
test("the final real HTTP moderation response cannot deliver tutoring after its full session is withdrawn", async () => {
  const before = await db.setting.findUnique({ where: { key: "ai" } }),
    f = await tutorAuthorityFixture("moderation-session-change"),
    explanation =
      "Observe the pieces and compare their positions after each turn.";
  let moderation = 0,
    generation = 0;
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, undefined);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/models") {
      res.end(JSON.stringify({ data: [{ id: "cubers-simulator" }] }));
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    assert.ok(!raw.includes("PRIVATE_QUESTION"));
    const body = JSON.parse(raw);
    if (req.url === "/v1/moderations") {
      moderation++;
      if (body.input === explanation)
        await db.session.update({
          where: { id: f.actor.sessionId },
          data: { scope: "DELETION" },
        });
      res.end(JSON.stringify(simulatedModeration(body)));
      return;
    }
    assert.equal(req.url, "/v1/chat/completions");
    generation++;
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: explanation },
          },
        ],
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as any).port}/v1`;
    await db.setting.upsert({
      where: { key: "ai" },
      create: {
        key: "ai",
        value: { baseUrl, model: "cubers-simulator", enabled: true },
      },
      update: { value: { baseUrl, model: "cubers-simulator", enabled: true } },
    });
    await assert.rejects(
      f.service.tutor(f.actor, {
        ...f.request,
        question: "PRIVATE_QUESTION why",
      }),
      (error: any) => error.getStatus?.() === 403,
    );
    assert.equal(moderation, 3);
    assert.equal(generation, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    if (before)
      await db.setting.upsert({
        where: { key: "ai" },
        create: { key: "ai", value: before.value as any },
        update: { value: before.value as any },
      });
    else await db.setting.deleteMany({ where: { key: "ai" } });
  }
});

test("an unavailable moderation service prevents an administrator from enabling a connection without changing settings or audit state", async () => {
  const staff = await fixture("moderation-admin-enable", "1985-01-01", "ADMIN"),
    actor = await communityActor(staff),
    admin = communityAdmin(),
    before = await db.setting.findUnique({ where: { key: "ai" } }),
    audit = await db.audit.count({ where: { actorId: staff.u.id } });
  let moderation = 0;
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, undefined);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/models")
      res.end(JSON.stringify({ data: [{ id: "cubers-simulator" }] }));
    else {
      assert.equal(req.url, "/v1/moderations");
      moderation++;
      res.end(JSON.stringify({ error: { message: "PRIVATE_PROVIDER_ERROR" } }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await assert.rejects(
      admin.ai(actor, {
        baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`,
        model: "cubers-simulator",
        enabled: true,
      }),
      (error: any) =>
        error.getStatus?.() === 400 &&
        !error.message.includes("PRIVATE_PROVIDER_ERROR"),
    );
    assert.equal(moderation, 1);
    assert.deepEqual(
      (await db.setting.findUnique({ where: { key: "ai" } }))?.value ?? null,
      before?.value ?? null,
    );
    assert.equal(
      await db.audit.count({ where: { actorId: staff.u.id } }),
      audit,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
