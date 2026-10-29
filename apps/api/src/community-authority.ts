import { ForbiddenException } from "@nestjs/common";
import { Prisma, type Session } from "@prisma/client";
import { permissions } from "@cubers/core";
import { z } from "zod";
import type { Db } from "./services";
import type { Config } from "./config";
import { accountPolicy, type Authed } from "./security";
import { communityAvailable } from "./community-access";

export type CommunityActor = Pick<Authed, "user" | "policy" | "sessionId"> & {
  session: Session;
};
export type CommunityCapability =
  "account" | "learn" | "post" | "adult" | "staff" | "admin";

/** User/guardian -> consent -> session -> content. Keep DB effects transactional;
 * durable privacy decisions must enforce actor.session.expiresAt at admission. */
export async function communityWrite<T>(
  db: Db,
  config: Config,
  request: Authed,
  capability: CommunityCapability,
  related: string[],
  work: (
    tx: Prisma.TransactionClient,
    actor: CommunityActor,
    locked: ReadonlySet<string>,
  ) => Promise<T>,
) {
  const roots = [
    ...new Set(
      [request.user.id, ...related].map((id) =>
        z.string().uuid().parse(id).toLowerCase(),
      ),
    ),
  ].sort();
  if (
    roots.length > 16 ||
    !z.string().uuid().safeParse(request.sessionId).success
  )
    throw new ForbiddenException(
      "Current community session required · 请重新登录",
    );
  return db.$transaction(
    async (tx) => {
      const initial = await tx.consent.findMany({
        where: { childId: { in: roots } },
        select: { guardianId: true },
      });
      const ids = [
          ...new Set([...roots, ...initial.map((c) => c.guardianId)]),
        ].sort(),
        locked = new Set(ids);
      // NO KEY UPDATE still excludes account/eligibility changes, while allowing
      // notification/post foreign-key KEY SHARE checks from other transactions.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR NO KEY UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Consent" WHERE "childId" IN (${Prisma.join(roots.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY "childId" FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM "Session" WHERE id=${request.sessionId}::uuid FOR SHARE`;
      async function current(): Promise<CommunityActor> {
        const consents = await tx.consent.findMany({
          where: { childId: { in: roots } },
          select: { guardianId: true },
        });
        if (consents.some((c) => !locked.has(c.guardianId)))
          throw new ForbiddenException(
            "Guardian relationship changed; reopen the action · 监护关系已变更，请重新打开",
          );
        const user = await tx.user.findUnique({
            where: { id: request.user.id },
          }),
          session = await tx.session.findUnique({
            where: { id: request.sessionId },
          });
        if (
          !user ||
          user.deletedAt ||
          !user.emailVerified ||
          user.region !== config.REGION ||
          !session ||
          session.userId !== user.id ||
          session.scope !== "FULL" ||
          session.expiresAt <= new Date()
        )
          throw new ForbiddenException(
            "Current full community session required · 请重新登录",
          );
        const policy = await accountPolicy(tx, user);
        if (capability !== "account" && !permissions(policy).canLearn)
          throw new ForbiddenException(
            "Current guardian consent required · 需要当前有效的监护授权",
          );
        if (capability === "post" || capability === "adult") {
          communityAvailable(config);
          if (
            !permissions(policy).canPost ||
            (capability === "adult" && (policy.age < 18 || !user.adultVerified))
          )
            throw new ForbiddenException(
              "Current posting and owner eligibility required · 当前发帖或社团管理资格无效",
            );
        }
        if (capability === "staff" || capability === "admin") {
          if (
            !(capability === "admin"
              ? user.role === "ADMIN"
              : ["ADMIN", "MODERATOR"].includes(user.role)) ||
            !user.mfaSecret ||
            !session.mfaVerified ||
            user.mfaGeneration !== request.user.mfaGeneration
          )
            throw new ForbiddenException(
              "Current staff authority and MFA required · 需要当前有效的管理权限和多重验证",
            );
        }
        if (session.expiresAt <= new Date())
          throw new ForbiddenException(
            "Current full community session required · 请重新登录",
          );
        return { user, policy, session, sessionId: session.id };
      }
      const actor = await current(),
        result = await work(tx, actor, locked);
      // Content locks/unique writes may themselves wait. Expiry is evaluated after
      // that work too, so an elapsed session rolls back every staged DB effect.
      await current();
      return result;
    },
    { timeout: 10000 },
  );
}
