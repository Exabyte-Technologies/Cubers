import test from "node:test";
import assert from "node:assert/strict";
import {
  discoveryStories,
  publishedDiscovery,
  DiscoveryResponse,
  lessons,
} from "@cubers/core";
test("authored discovery covers all launch puzzles and links only to complete bilingual published lessons", () => {
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  assert.equal(
    new Set(discoveryStories.map((story) => story.id)).size,
    discoveryStories.length,
  );
  assert.deepEqual(
    new Set(discoveryStories.map((story) => story.puzzle)),
    new Set(["2x2", "3x3", "4x4", "pyraminx"]),
  );
  for (const story of discoveryStories) {
    for (const id of story.courseIds) {
      assert.ok(byId.has(id));
      assert.equal(byId.get(id)!.puzzle, story.puzzle);
    }
    for (const value of [
      story.title,
      story.summary,
      story.activity,
      ...story.paragraphs,
    ]) {
      assert.ok(value.en.trim().length > 10);
      assert.match(value.zh, /[\u3400-\u9fff]/);
    }
  }
  const response = DiscoveryResponse.parse({
    items: publishedDiscovery(
      lessons.map((lesson) => ({ id: lesson.id, title: lesson.title })),
    ),
  });
  assert.ok(response.items.every((story) => story.actions.length > 0));
});
test("withdrawn or malformed course entries never create a navigable discovery action", () => {
  const empty = publishedDiscovery([]);
  assert.ok(empty.every((story) => story.actions.length === 0));
  const one = publishedDiscovery([
    {
      id: "2-first-solve",
      title: { en: "Updated operator title", zh: "当前课程标题" },
    },
    { id: "3-notation", title: { en: "", zh: "" } },
    { id: "pyr-beginner", title: ["unsafe"] },
  ]);
  assert.deepEqual(one.find((story) => story.puzzle === "2x2")!.actions, [
    {
      courseId: "2-first-solve",
      title: { en: "Updated operator title", zh: "当前课程标题" },
    },
  ]);
  assert.ok(
    one
      .filter((story) => story.puzzle !== "2x2")
      .every((story) => story.actions.length === 0),
  );
  assert.ok(one.every((story) => !("courseIds" in story)));
});
