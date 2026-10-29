export type CommunityPost = {
  id: string;
  body: string;
  tags: string[];
  mediaIds: string[];
  clubId?: string | null;
  kind: string;
  status: string;
  revision: number;
  createdAt: string;
  aiGenerated: boolean;
  aiSourceLabel?: "1" | "2" | "3" | null;
  author: { id: string; displayName: string };
  _count: { comments: number };
  likes: number;
  viewer: { liked: boolean; saved: boolean; following: boolean };
  reason?: string | null;
};
export type ThreadComment = {
  id: string;
  parentId: string | null;
  body: string;
  author: { id: string; displayName: string };
  createdAt: string;
};
export type CommentPage = {
  items: ThreadComment[];
  context: ThreadComment[];
  nextCursor: string | null;
};
export function mergeCommentPage(rows: ThreadComment[], page: CommentPage) {
  return [
    ...new Map(
      [...rows, ...page.context, ...page.items].map((row) => [row.id, row]),
    ).values(),
  ].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
export function commentTree(rows: ThreadComment[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const result: { comment: ThreadComment; depth: number }[] = [],
    seen = new Set<string>();
  function visit(parentId: string | null, depth: number) {
    for (const row of rows.filter((row) => row.parentId === parentId)) {
      if (seen.has(row.id) || depth > 5) continue;
      seen.add(row.id);
      result.push({ comment: row, depth });
      visit(row.id, depth + 1);
    }
  }
  visit(null, 0);
  // Do not manufacture root comments from orphaned or cyclic replies.
  return result.filter(
    ({ comment }) => !comment.parentId || byId.has(comment.parentId),
  );
}
