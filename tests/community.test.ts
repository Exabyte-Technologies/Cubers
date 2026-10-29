import { test } from "node:test";
import assert from "node:assert/strict";
import { CreatePost } from "@cubers/core";
import {
  parsePostTags,
  selectedVideoType,
  selectedImageType,
  checkPostFile,
} from "../apps/mobile/src/post-media.shared";
import {
  commentTree,
  mergeCommentPage,
  type ThreadComment,
} from "../apps/mobile/src/community.shared";
test("community tags normalize Unicode and case without accepting markup or excess tags", () => {
  assert.deepEqual(parsePostTags("#F2L f2l，练习 e\u0301 é"), [
    "f2l",
    "练习",
    "é",
  ]);
  assert.deepEqual(
    CreatePost.parse({ body: "Practice", tags: ["F2L", "f2l", "练习"] }).tags,
    ["f2l", "练习"],
  );
  assert.throws(() => parsePostTags("a b c d e f"));
  assert.throws(() => parsePostTags("<script>"));
  assert.throws(() =>
    CreatePost.parse({ body: "Practice", kind: "ADMIN_NOTICE" }),
  );
});
test("later reply pages retain parent context without duplicating the thread", () => {
  const row = (
    id: string,
    parentId: string | null,
    time: number,
  ): ThreadComment => ({
    id,
    parentId,
    body: id,
    author: { id: "author", displayName: "Cuber" },
    createdAt: new Date(time).toISOString(),
  });
  const root = row("root", null, 1),
    reply = row("reply", "root", 2),
    nested = row("nested", "reply", 3);
  const first = mergeCommentPage([], {
    items: [nested],
    context: [reply, root],
    nextCursor: "next",
  });
  const second = mergeCommentPage(first, {
    items: [reply],
    context: [{ ...root, body: "Current root" }],
    nextCursor: null,
  });
  assert.equal(second.length, 3);
  assert.equal(second[0].body, "Current root");
  assert.deepEqual(
    commentTree(second).map(({ comment, depth }) => [comment.id, depth]),
    [
      ["root", 0],
      ["reply", 1],
      ["nested", 2],
    ],
  );
});
test("community uploads enforce file and duration boundaries before upload", () => {
  assert.equal(selectedImageType("image/png", "photo.png"), "image/png");
  assert.equal(selectedImageType(undefined, "PHOTO.JPEG"), "image/jpeg");
  assert.equal(
    selectedImageType("application/octet-stream", "photo.PNG"),
    "image/png",
  );
  for (const mime of ["image/heic", "text/html", "image/gif"])
    assert.throws(() => selectedImageType(mime, "photo.jpg"));
  assert.throws(() => selectedImageType(undefined, "photo.heic"));
  assert.equal(
    selectedVideoType("video/quicktime", "clip.mov"),
    "video/quicktime",
  );
  assert.equal(selectedVideoType(undefined, "CLIP.MP4"), "video/mp4");
  assert.throws(() => selectedVideoType("text/html", "clip.mp4"));
  checkPostFile("image/jpeg", 10 * 1024 * 1024);
  checkPostFile("video/mp4", 50 * 1024 * 1024, 90000);
  for (const size of [0, -1, NaN, Infinity])
    assert.throws(() => checkPostFile("image/jpeg", size));
  assert.throws(() => checkPostFile("image/jpeg", 10 * 1024 * 1024 + 1));
  assert.throws(() => checkPostFile("video/mp4", 1, 90001));
});
test("thread rendering preserves reply ancestry and hides orphaned or cyclic replies", () => {
  const row = (id: string, parentId: string | null): ThreadComment => ({
    id,
    parentId,
    body: id,
    author: { id: "author", displayName: "Cuber" },
    createdAt: "2026-10-15T00:00:00Z",
  });
  const result = commentTree([
    row("reply", "root"),
    row("root", null),
    row("nested", "reply"),
    row("orphan", "missing"),
    row("cycle1", "cycle2"),
    row("cycle2", "cycle1"),
  ]);
  assert.deepEqual(
    result.map(({ comment, depth }) => [comment.id, depth]),
    [
      ["root", 0],
      ["reply", 1],
      ["nested", 2],
    ],
  );
});
