import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Db } from "./services";
import type { Config } from "./config";
import type { Authed } from "./security";
import { communityWrite, type CommunityActor } from "./community-authority";

/** Register a saved practice deadline at read time and check it again after any
 * content/row waits and staged writes. Throwing rolls back all learning effects. */
export type LearningDeadline = (expiresAt: Date, message: string) => void;
export function learningWrite<T>(
  db: Db,
  config: Config,
  request: Authed,
  work: (
    tx: Prisma.TransactionClient,
    until: LearningDeadline,
    actor: CommunityActor,
  ) => Promise<T>,
) {
  return communityWrite(db, config, request, "learn", [], async (tx, actor) => {
    const checks: (() => void)[] = [];
    const until: LearningDeadline = (expiresAt, message) => {
      const deadline = expiresAt.getTime();
      const check = () => {
        if (!Number.isFinite(deadline) || Date.now() >= deadline)
          throw new ConflictException(message);
      };
      check();
      checks.push(check);
    };
    const result = await work(tx, until, actor);
    for (const check of checks) check();
    return result;
  });
}
