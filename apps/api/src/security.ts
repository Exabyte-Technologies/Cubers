import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  Inject,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Db, Infrastructure } from "./services";
import { hash } from "./crypto";
import { ageOn, permissions, type AccountPolicy } from "@cubers/core";
import type { User, Consent, Prisma } from "@prisma/client";
import type { Request } from "express";
import { CommunityRegion, regionalAccessExempt } from "./community-region";
export const Public = () => SetMetadata("public", true);
export type Authed = Request & {
  user: User;
  policy: AccountPolicy;
  sessionId: string;
};
export async function sessionUser(
  db: Db,
  token: unknown,
  allowDeletion = false,
) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new UnauthorizedException("Sign in required");
  const s = await db.session.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: true },
  });
  if (
    !s ||
    s.expiresAt <= new Date() ||
    s.user.deletedAt ||
    !s.user.emailVerified ||
    (s.scope !== "FULL" && !(allowDeletion && s.scope === "DELETION"))
  )
    throw new UnauthorizedException("Session expired");
  return s;
}
export async function accountPolicy(
  db: Pick<Prisma.TransactionClient, "consent" | "user">,
  user: User,
): Promise<AccountPolicy> {
  return (await accountPolicies(db, [user])).get(user.id)!;
}
export type GuardianEligibility = Pick<
  User,
  "region" | "emailVerified" | "adultVerified" | "birthDate" | "deletedAt"
>;
export function eligibleGuardian(
  guardian: GuardianEligibility | null | undefined,
  region: string,
) {
  if (
    !guardian ||
    guardian.deletedAt ||
    guardian.region !== region ||
    !guardian.emailVerified ||
    !guardian.adultVerified
  )
    return false;
  try {
    return ageOn(guardian.birthDate) >= 18;
  } catch {
    return false;
  }
}
export async function accountPolicies(
  db: Pick<Prisma.TransactionClient, "consent" | "user">,
  users: User[],
) {
  const consents = await db.consent.findMany({
    where: { childId: { in: users.map((user) => user.id) } },
  });
  const guardians = consents.length
    ? await db.user.findMany({
        where: {
          id: {
            in: [...new Set(consents.map((consent) => consent.guardianId))],
          },
        },
        select: {
          id: true,
          region: true,
          emailVerified: true,
          adultVerified: true,
          birthDate: true,
          deletedAt: true,
        },
      })
    : [];
  const byChild = new Map(
      consents.map((consent) => [consent.childId, consent]),
    ),
    byGuardian = new Map(guardians.map((guardian) => [guardian.id, guardian]));
  return new Map(
    users.map((user) => {
      const consent = byChild.get(user.id) || null;
      return [
        user.id,
        policyFrom(
          user,
          consent,
          consent ? byGuardian.get(consent.guardianId) : null,
        ),
      ];
    }),
  );
}
export function policyFrom(
  user: User,
  consent: Consent | null,
  guardian?: GuardianEligibility | null,
): AccountPolicy {
  const verified =
    consent?.status === "APPROVED" && eligibleGuardian(guardian, user.region);
  return {
    region: user.region as "CN" | "INTL",
    age: ageOn(user.birthDate),
    guardianVerified: verified,
    postingConsent: verified && !!consent?.publicPosting,
    recordingConsent: verified && !!consent?.recording,
    adultVerified: user.adultVerified,
    identityVerified: user.identityVerified,
  };
}
@Injectable()
export class Security implements CanActivate {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(Reflector) private reflector: Reflector,
    @Optional()
    @Inject(CommunityRegion)
    private communityRegion: CommunityRegion = new CommunityRegion(
      infra.config,
    ),
  ) {}
  async canActivate(context: ExecutionContext) {
    const r = context.switchToHttp().getRequest<Authed>();
    const key = hash(r.ip || "unknown");
    // A generous IP ceiling protects session lookups without penalizing a club
    // whose members share one school or venue connection.
    if (!(await this.infra.limit(`http-ip:${key}`, 12000, 60)))
      throw new HttpException("Too many requests", 429);
    if (
      this.reflector.getAllAndOverride("public", [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      if (!regionalAccessExempt(r.method, r.path))
        await this.communityRegion.requireMatchingConnection(r.ip);
      if (!(await this.infra.limit(`http-public:${key}`, 180, 60)))
        throw new HttpException("Too many requests", 429);
      return true;
    }
    const session = await sessionUser(
      this.db,
      r.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1],
      true,
    );
    r.user = session.user;
    r.sessionId = session.id;
    if (
      session.scope === "DELETION" &&
      !(
        (r.method === "DELETE" && r.path === "/v1/me") ||
        (r.method === "POST" && r.path === "/v1/auth/logout")
      )
    )
      throw new ForbiddenException(
        "This session can only delete the account or sign out",
      );
    if (!regionalAccessExempt(r.method, r.path))
      await this.communityRegion.requireMatchingConnection(r.ip);
    if (!(await this.infra.limit(`http-user:${r.user.id}`, 600, 60)))
      throw new HttpException("Too many requests", 429);
    if (r.user.region !== this.infra.config.REGION)
      throw new ForbiddenException("Account belongs to another region");
    r.policy = await accountPolicy(this.db, r.user);
    if (
      r.path.startsWith("/v1/admin") &&
      (!["ADMIN", "MODERATOR"].includes(r.user.role) ||
        !r.user.mfaSecret ||
        !session.mfaVerified)
    )
      throw new ForbiddenException("Administrator role and MFA are required");
    if (
      !permissions(r.policy).canLearn &&
      !(r.method === "GET" && /^\/v1\/announcements(?:\/|$)/.test(r.path)) &&
      !/^\/v1\/(me|guardian|auth|legal|media)/.test(r.path)
    )
      throw new ForbiddenException("Verified guardian consent is required");
    return true;
  }
}
