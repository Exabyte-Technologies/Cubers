import { z } from "zod";
import { authenticator } from "otplib";
import { Prisma, PrismaClient, type User } from "@prisma/client";
import { ageOn } from "@cubers/core";
import { hash, opaque, passwordMatches } from "./crypto";
import { timingSafeEqual } from "node:crypto";
const Region = z.enum(["CN", "INTL"]),
  Role = z.enum(["ADMIN", "MODERATOR"]);
const CaseReference = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{9,119}$/);
export const StaffRequest = z
  .object({
    action: z.enum(["bootstrap", "grant", "rotate", "recover", "revoke"]),
    region: Region,
    userId: z.string().uuid(),
    role: Role.optional(),
    actorId: z.string().uuid().optional(),
    caseReference: CaseReference,
    operatorReviewConfirmed: z.literal(true),
  })
  .strict();
const Snapshot = z.string().regex(/^[a-f0-9]{64}$/);
export const StaffPlan = z
  .object({
    version: z.literal(1),
    request: StaffRequest,
    targetSnapshot: Snapshot,
    actorSnapshot: Snapshot.nullable(),
    createdAt: z.number().int(),
    expiresAt: z.number().int(),
    challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    secret: z
      .string()
      .regex(/^[A-Z2-7]{16,128}$/)
      .nullable(),
    recoveryCode: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .nullable(),
    enrollmentUri: z.string().max(1000).nullable(),
  })
  .strict();
export type StaffPlanData = z.infer<typeof StaffPlan>;
export const StaffConfirmation = z
  .object({
    planDigest: Snapshot,
    targetPassword: z.string().min(1).max(128).optional(),
    newOtp: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    oldOtp: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    recoveryCode: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
    actorPassword: z.string().min(1).max(128).optional(),
    actorOtp: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    recoverySaved: z.literal(true).optional(),
  })
  .strict();
function fail(message: string): never {
  throw Error(message);
}
export function staffSnapshot(user: User) {
  return hash(
    JSON.stringify([
      user.id,
      user.email,
      user.passwordHash,
      user.birthDate,
      user.region,
      user.emailVerified,
      user.role,
      user.mfaSecret,
      user.mfaGeneration,
      user.mfaLastStep,
      user.staffRecoveryHash,
      user.deletedAt,
    ]),
  );
}
export function staffPlanDigest(plan: StaffPlanData) {
  return hash(JSON.stringify(StaffPlan.parse(plan)));
}
function eligible(user: User | null, region: string): asserts user is User {
  if (
    !user ||
    user.deletedAt ||
    !user.emailVerified ||
    user.region !== region ||
    ageOn(user.birthDate) < 18
  )
    fail(
      "An existing, email-verified adult account in this region is required",
    );
}
function staff(user: User) {
  return user.role === "ADMIN" || user.role === "MODERATOR";
}
export function checkedMfaStep(
  user: Pick<User, "mfaSecret" | "mfaLastStep">,
  otp: unknown,
  now = Date.now(),
) {
  const step = Math.floor(now / 30000);
  if (
    !user.mfaSecret ||
    typeof otp !== "string" ||
    !/^\d{6}$/.test(otp) ||
    step <= user.mfaLastStep ||
    !authenticator.clone({ epoch: now, window: 0 }).check(otp, user.mfaSecret)
  )
    fail(
      "A fresh valid MFA code is required; wait for the next code if already used",
    );
  return step;
}
function intent(
  request: z.infer<typeof StaffRequest>,
  target: User,
  actor: User | null,
) {
  eligible(target, request.region);
  if (request.action === "bootstrap") {
    if (
      request.role !== "ADMIN" ||
      request.actorId ||
      target.role !== "USER" ||
      target.mfaSecret
    )
      fail(
        "Bootstrap requires a normal account, ADMIN role and no staff actor",
      );
  } else if (request.action === "grant") {
    if (!request.role || target.role !== "USER" || target.mfaSecret)
      fail("Grant requires a normal account and a staff role");
  } else {
    if (!staff(target) || !target.mfaSecret || request.role)
      fail(
        "Recovery, rotation and revocation require existing staff and cannot change the role",
      );
  }
  const independent = ["grant", "recover", "revoke"].includes(request.action);
  if (independent) {
    eligible(actor, request.region);
    if (actor.id === target.id || actor.role !== "ADMIN" || !actor.mfaSecret)
      fail("A different active administrator is required");
  } else if (request.actorId) fail("Unexpected staff actor");
}
export async function prepareStaffAccess(
  db: PrismaClient,
  region: string,
  value: unknown,
  now = Date.now(),
): Promise<StaffPlanData> {
  const request = StaffRequest.parse(value);
  if (request.region !== region)
    fail("Deployment region does not match the request");
  const target = await db.user.findUnique({ where: { id: request.userId } }),
    actor = request.actorId
      ? await db.user.findUnique({ where: { id: request.actorId } })
      : null;
  eligible(target, region);
  intent(request, target, actor);
  if (
    request.action === "bootstrap" &&
    (await db.user.count({
      where: { role: { in: ["ADMIN", "MODERATOR"] }, deletedAt: null },
    }))
  )
    fail("Staff already exists; bootstrap is unavailable");
  const secret =
    request.action === "revoke" ? null : authenticator.generateSecret();
  return StaffPlan.parse({
    version: 1,
    request,
    targetSnapshot: staffSnapshot(target),
    actorSnapshot: actor ? staffSnapshot(actor) : null,
    createdAt: now,
    expiresAt: now + 30 * 60000,
    challenge: opaque(),
    secret,
    recoveryCode: secret ? opaque() : null,
    enrollmentUri: secret
      ? authenticator.keyuri(target.email, `Cubers ${region}`, secret)
      : null,
  });
}
export async function applyStaffAccess(
  db: PrismaClient,
  region: string,
  rawPlan: unknown,
  rawConfirmation: unknown,
  now = Date.now(),
) {
  const plan = StaffPlan.parse(rawPlan),
    confirmation = StaffConfirmation.parse(rawConfirmation),
    request = plan.request;
  if (plan.secret && !confirmation.recoverySaved)
    fail("Confirm the replacement recovery code is saved offline");
  if (
    request.region !== region ||
    plan.expiresAt !== plan.createdAt + 30 * 60000 ||
    now < plan.createdAt - 5000 ||
    now >= plan.expiresAt ||
    confirmation.planDigest !== staffPlanDigest(plan)
  )
    fail("Plan region, lifetime or digest changed; prepare a new plan");
  if (
    (request.action === "revoke") !== (plan.secret === null) ||
    (plan.secret === null) !== (plan.recoveryCode === null)
  )
    fail("Invalid enrollment plan");
  // Password derivation is bounded and outside the database locks. Revalidate
  // the exact password/factor snapshots again after acquiring ordered locks.
  const target = await db.user.findUnique({ where: { id: request.userId } }),
    actor = request.actorId
      ? await db.user.findUnique({ where: { id: request.actorId } })
      : null;
  eligible(target, region);
  intent(request, target, actor);
  if (
    request.action !== "revoke" &&
    (!confirmation.targetPassword ||
      !(await passwordMatches(
        confirmation.targetPassword,
        target.passwordHash,
      )))
  )
    fail("Target account password is required");
  if (
    actor &&
    (!confirmation.actorPassword ||
      !(await passwordMatches(confirmation.actorPassword, actor.passwordHash)))
  )
    fail("Independent administrator password is required");
  return db.$transaction(
    async (tx) => {
      // Every lifecycle writer shares this regional database lock, including
      // simultaneous bootstrap and last-admin revocation decisions.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472106)`;
      for (const id of [target.id, ...(actor ? [actor.id] : [])].sort())
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({
          where: { id: target.id },
        }),
        reviewer = actor
          ? await tx.user.findUniqueOrThrow({ where: { id: actor.id } })
          : null;
      intent(request, current, reviewer);
      if (
        staffSnapshot(current) !== plan.targetSnapshot ||
        (reviewer ? staffSnapshot(reviewer) : null) !== plan.actorSnapshot
      )
        fail("Account or factor state changed; prepare a new plan");
      if (
        request.action === "bootstrap" &&
        (await tx.user.count({
          where: { role: { in: ["ADMIN", "MODERATOR"] }, deletedAt: null },
        }))
      )
        fail("Staff already exists; bootstrap is unavailable");
      if (
        request.action === "revoke" &&
        current.role === "ADMIN" &&
        (await tx.user.count({
          where: {
            role: "ADMIN",
            deletedAt: null,
            emailVerified: true,
            mfaSecret: { not: null },
          },
        })) <= 1
      )
        fail("The last active administrator cannot be revoked");
      const actorStep = reviewer
        ? checkedMfaStep(reviewer, confirmation.actorOtp, now)
        : undefined;
      if (request.action === "rotate") {
        if (confirmation.recoveryCode) {
          const actual = hash(confirmation.recoveryCode),
            expected = current.staffRecoveryHash;
          if (
            !expected ||
            !/^[a-f0-9]{64}$/.test(expected) ||
            !timingSafeEqual(
              Buffer.from(actual, "hex"),
              Buffer.from(expected, "hex"),
            )
          )
            fail("Invalid one-use staff recovery code");
        } else checkedMfaStep(current, confirmation.oldOtp, now);
      }
      const nextStep = plan.secret
        ? checkedMfaStep(
            { mfaSecret: plan.secret, mfaLastStep: -1 },
            confirmation.newOtp,
            now,
          )
        : -1;
      if (reviewer)
        await tx.user.update({
          where: { id: reviewer.id },
          data: { mfaLastStep: actorStep },
        });
      await tx.user.update({
        where: { id: current.id },
        data: {
          role:
            request.action === "revoke" ? "USER" : request.role || current.role,
          mfaSecret: plan.secret,
          mfaGeneration: { increment: 1 },
          mfaLastStep: nextStep,
          staffRecoveryHash: plan.recoveryCode ? hash(plan.recoveryCode) : null,
        },
      });
      const revoked = await tx.session.deleteMany({
        where: { userId: current.id },
      });
      await tx.authToken.deleteMany({ where: { userId: current.id } });
      await tx.audit.create({
        data: {
          actorId: reviewer?.id || `operator:${request.caseReference}`,
          action: `staff.${request.action}`,
          targetId: current.id,
          detail: {
            region,
            caseReference: request.caseReference,
            role:
              request.action === "revoke"
                ? "USER"
                : request.role || current.role,
            generation: current.mfaGeneration + 1,
            planDigest: staffPlanDigest(plan),
            revokedSessions: revoked.count,
            operatorReviewConfirmed: true,
          },
        },
      });
      return {
        ok: true,
        action: request.action,
        region,
        userId: current.id,
        revokedSessions: revoked.count,
      };
    },
    { timeout: 15000, maxWait: 10000 },
  );
}
