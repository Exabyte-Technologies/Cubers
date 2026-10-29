import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categoryAttemptScores,
  type RankingCategory,
} from "../apps/mobile/src/category-rankings";
const category: RankingCategory = {
  puzzle: "3x3",
  input: "virtual",
  mode: "race",
};
const row = (durationMs: number) => ({
  durationMs,
  room: category,
  id: "private-attempt-id",
  user: { id: "private-account-id", displayName: "Unreviewed name" },
});
test("category boards share exact tied places and discard all identity fields", () => {
  const source = [row(1501), row(1000), row(1000), row(1500)];
  assert.deepEqual(categoryAttemptScores(source, category), [
    { place: 1, durationMs: 1000 },
    { place: 1, durationMs: 1000 },
    { place: 3, durationMs: 1500 },
    { place: 4, durationMs: 1501 },
  ]);
  assert.equal(source[0].durationMs, 1501);
  assert.deepEqual(categoryAttemptScores([], category), []);
});
test("category boards reject crossed categories, malformed or unbounded results", () => {
  for (const value of [
    null,
    {},
    Array.from({ length: 101 }, () => row(1)),
    [row(NaN)],
    [row(-1)],
    [row(1.2)],
    [{ ...row(1), room: { ...category, input: "smart" } }],
    [{ ...row(1), room: { ...category, puzzle: "2x2" } }],
    [{ ...row(1), room: { ...category, mode: "daily" } }],
  ])
    assert.throws(
      () => categoryAttemptScores(value, category),
      /Invalid category/,
    );
});
