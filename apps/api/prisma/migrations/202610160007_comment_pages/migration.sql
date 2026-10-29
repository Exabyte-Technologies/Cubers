CREATE INDEX "Comment_postId_status_createdAt_id_idx" ON "Comment"("postId", "status", "createdAt", "id");
CREATE INDEX "Post_clubId_kind_status_createdAt_id_idx" ON "Post"("clubId", "kind", "status", "createdAt", "id");
