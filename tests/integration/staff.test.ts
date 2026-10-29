import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { authenticator } from "otplib";
import { randomUUID } from "node:crypto";
import {
  prepareStaffAccess,
  applyStaffAccess,
  staffPlanDigest,
} from "../../apps/api/src/staff-access";
import { passwordHash, opaque, hash } from "../../apps/api/src/crypto";
const execFile = promisify(execFileCb),
  url = "postgresql://cubers:cubers_dev_only@127.0.0.1:54329/cubers_staff_test",
  db = new PrismaClient({ datasourceUrl: url }),
  run = randomUUID().slice(0, 8),
  password = "synthetic-staff-password";
const code = (secret: string, now: number) =>
  authenticator.clone({ epoch: now }).generate(secret);
async function person(name: string, birthDate = "1990-01-01", region = "INTL") {
  return db.user.create({
    data: {
      email: `staff-${name}-${run}@cubers.test`,
      displayName: "Synthetic staff",
      birthDate,
      region,
      emailVerified: true,
      passwordHash: await passwordHash(password),
    },
  });
}
const request = (action: string, userId: string, extra = {}) => ({
  action,
  userId,
  region: "INTL",
  caseReference: `synthetic-case-${run}`,
  operatorReviewConfirmed: true,
  ...extra,
});
const confirm = (plan: any, now: number, extra = {}) => ({
  planDigest: staffPlanDigest(plan),
  recoverySaved: true,
  targetPassword: password,
  ...(plan.secret ? { newOtp: code(plan.secret, now) } : {}),
  ...extra,
});
before(
  async () => {
    const master = new PrismaClient({
      datasourceUrl:
        "postgresql://cubers:cubers_dev_only@127.0.0.1:54329/cubers",
    });
    try {
      const exists = await master.$queryRaw<
        { exists: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname='cubers_staff_test')`;
      if (!exists[0].exists)
        await master.$executeRawUnsafe("CREATE DATABASE cubers_staff_test");
    } finally {
      await master.$disconnect();
    }
    await execFile(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--schema",
        "apps/api/prisma/schema.prisma",
      ],
      { env: { ...process.env, DATABASE_URL: url } },
    );
    // This database is reserved for isolated operator tests, never preview/users.
    await db.user.deleteMany();
    await db.audit.deleteMany();
  },
  { timeout: 60000 },
);
after(() => db.$disconnect());
let administrator: any, firstPlan: any, clock: number;
test("only one simultaneous first administrator can bootstrap with password and fresh enrollment proof", async () => {
  clock = Date.now();
  const a = await person("bootstrap-a"),
    b = await person("bootstrap-b");
  const plans = await Promise.all([
    prepareStaffAccess(
      db,
      "INTL",
      request("bootstrap", a.id, { role: "ADMIN" }),
      clock,
    ),
    prepareStaffAccess(
      db,
      "INTL",
      request("bootstrap", b.id, { role: "ADMIN" }),
      clock,
    ),
  ]);
  await assert.rejects(
    applyStaffAccess(
      db,
      "INTL",
      plans[0],
      confirm(plans[0], clock, { targetPassword: "wrong" }),
      clock,
    ),
  );
  const results = await Promise.allSettled(
    plans.map((p) => applyStaffAccess(db, "INTL", p, confirm(p, clock), clock)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const winner = results.findIndex((r) => r.status === "fulfilled");
  firstPlan = plans[winner];
  administrator = await db.user.findUniqueOrThrow({
    where: { id: firstPlan.request.userId },
  });
  assert.equal(administrator.role, "ADMIN");
  assert.equal(administrator.adultVerified, false);
  assert.equal(administrator.identityVerified, false);
  assert.equal(administrator.staffRecoveryHash, hash(firstPlan.recoveryCode!));
  await assert.rejects(
    prepareStaffAccess(
      db,
      "INTL",
      request("bootstrap", plans[1 - winner].request.userId, { role: "ADMIN" }),
      clock,
    ),
  );
  const audit = await db.audit.findFirstOrThrow({
    where: { action: "staff.bootstrap" },
  });
  const serialized = JSON.stringify(audit);
  assert.equal(serialized.includes(firstPlan.secret!), false);
  assert.equal(serialized.includes(firstPlan.recoveryCode!), false);
  assert.equal(serialized.includes(password), false);
});
test("independent staff grants, lost-factor recovery, one-use recovery rotation and revocation invalidate old credentials", async () => {
  const target = await person("grant"),
    minor = await person("minor", "2018-01-01"),
    foreign = await person("foreign", "1990-01-01", "CN");
  clock += 30000;
  await assert.rejects(
    prepareStaffAccess(
      db,
      "INTL",
      request("grant", minor.id, {
        role: "MODERATOR",
        actorId: administrator.id,
      }),
      clock,
    ),
  );
  await assert.rejects(
    prepareStaffAccess(
      db,
      "INTL",
      request("grant", foreign.id, {
        role: "MODERATOR",
        actorId: administrator.id,
      }),
      clock,
    ),
  );
  const plan = await prepareStaffAccess(
    db,
    "INTL",
    request("grant", target.id, {
      role: "MODERATOR",
      actorId: administrator.id,
    }),
    clock,
  );
  const session = await db.session.create({
    data: {
      userId: target.id,
      tokenHash: hash(opaque()),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await db.authToken.create({
    data: {
      userId: target.id,
      tokenHash: hash(opaque()),
      purpose: "reset",
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await assert.rejects(
    applyStaffAccess(
      db,
      "INTL",
      plan,
      confirm(plan, clock, { actorPassword: password, actorOtp: "invalid" }),
      clock,
    ),
  );
  await applyStaffAccess(
    db,
    "INTL",
    plan,
    confirm(plan, clock, {
      actorPassword: password,
      actorOtp: code(administrator.mfaSecret, clock),
    }),
    clock,
  );
  assert.equal(
    await db.session.findUnique({ where: { id: session.id } }),
    null,
  );
  assert.equal(await db.authToken.count({ where: { userId: target.id } }), 0);
  await assert.rejects(
    applyStaffAccess(
      db,
      "INTL",
      plan,
      confirm(plan, clock, {
        actorPassword: password,
        actorOtp: code(administrator.mfaSecret, clock),
      }),
      clock,
    ),
  );
  clock += 30000;
  const recovered = await prepareStaffAccess(
    db,
    "INTL",
    request("recover", target.id, { actorId: administrator.id }),
    clock,
  );
  await applyStaffAccess(
    db,
    "INTL",
    recovered,
    confirm(recovered, clock, {
      actorPassword: password,
      actorOtp: code(administrator.mfaSecret, clock),
    }),
    clock,
  );
  const after = await db.user.findUniqueOrThrow({ where: { id: target.id } });
  assert.notEqual(after.mfaSecret, plan.secret);
  assert.equal(after.mfaGeneration, 2);
  clock += 30000;
  const rotated = await prepareStaffAccess(
    db,
    "INTL",
    request("rotate", target.id),
    clock,
  );
  await assert.rejects(
    applyStaffAccess(
      db,
      "INTL",
      rotated,
      confirm(rotated, clock, { recoveryCode: plan.recoveryCode }),
      clock,
    ),
  );
  await applyStaffAccess(
    db,
    "INTL",
    rotated,
    confirm(rotated, clock, { recoveryCode: recovered.recoveryCode }),
    clock,
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: target.id } }))
      .staffRecoveryHash,
    hash(rotated.recoveryCode!),
  );
  clock += 30000;
  const revoke = await prepareStaffAccess(
    db,
    "INTL",
    request("revoke", target.id, { actorId: administrator.id }),
    clock,
  );
  await applyStaffAccess(
    db,
    "INTL",
    revoke,
    {
      planDigest: staffPlanDigest(revoke),
      recoverySaved: true,
      actorPassword: password,
      actorOtp: code(administrator.mfaSecret, clock),
    },
    clock,
  );
  const ordinary = await db.user.findUniqueOrThrow({
    where: { id: target.id },
  });
  assert.equal(ordinary.role, "USER");
  assert.equal(ordinary.mfaSecret, null);
  assert.equal(ordinary.staffRecoveryHash, null);
});
test("operator plans bind current identity, factor state, expiry, region and explicit independent actor", async () => {
  const target = await person("stale");
  clock += 30000;
  const plan = await prepareStaffAccess(
    db,
    "INTL",
    request("grant", target.id, { role: "ADMIN", actorId: administrator.id }),
    clock,
  );
  await assert.rejects(
    applyStaffAccess(db, "CN", plan, confirm(plan, clock), clock),
  );
  await assert.rejects(
    applyStaffAccess(db, "INTL", plan, confirm(plan, clock), plan.expiresAt),
  );
  await assert.rejects(
    applyStaffAccess(
      db,
      "INTL",
      { ...plan, secret: authenticator.generateSecret() },
      confirm(plan, clock),
      clock,
    ),
  );
  await db.user.update({
    where: { id: target.id },
    data: { emailVerified: false },
  });
  await assert.rejects(
    applyStaffAccess(
      db,
      "INTL",
      plan,
      confirm(plan, clock, {
        actorPassword: password,
        actorOtp: code(administrator.mfaSecret, clock),
      }),
      clock,
    ),
  );
  await assert.rejects(
    prepareStaffAccess(
      db,
      "INTL",
      request("revoke", administrator.id, { actorId: administrator.id }),
      clock,
    ),
  );
  assert.equal(await db.audit.count({ where: { targetId: target.id } }), 0);
});
