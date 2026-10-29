import type { Prisma, Post } from "@prisma/client";
import { permissions } from "@cubers/core";
import { accountPolicies } from "./security";
// Re-evaluate current author eligibility when reading. A stale moderation status
// must not expose a post after guardian withdrawal or account deletion.
export async function eligiblePostIds(
  db: Pick<Prisma.TransactionClient, "user" | "consent">,
  posts: Pick<
    Post,
    "id" | "authorId" | "status" | "guardianApproved" | "moderatorApproved"
  >[],
) {
  const ids = [...new Set(posts.map((post) => post.authorId))];
  if (!ids.length) return new Set<string>();
  const users = await db.user.findMany({
    where: { id: { in: ids }, deletedAt: null, emailVerified: true },
  });
  const policies = await accountPolicies(db, users),
    byUser = new Map(users.map((user) => [user.id, user]));
  return new Set(
    posts
      .filter((post) => {
        const user = byUser.get(post.authorId);
        if (!user || post.status !== "PUBLISHED" || !post.moderatorApproved)
          return false;
        const policy = permissions(policies.get(user.id)!);
        return (
          policy.canPost && (!policy.needsPostApproval || post.guardianApproved)
        );
      })
      .map((post) => post.id),
  );
}
