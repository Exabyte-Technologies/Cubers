export type RankingCategory = {
  puzzle: "2x2" | "3x3" | "4x4" | "pyraminx";
  input: "virtual" | "scan" | "smart";
  mode: "race" | "daily";
};
export type AnonymousAttemptScore = { place: number; durationMs: number };

// Retain no account, attempt identifier or display name in the displayed board.
export function categoryAttemptScores(
  value: unknown,
  category: RankingCategory,
): AnonymousAttemptScore[] {
  if (!Array.isArray(value) || value.length > 100)
    throw Error("Invalid category rankings");
  const times = value.map((row) => {
    if (
      !row ||
      !Number.isSafeInteger(row.durationMs) ||
      row.durationMs < 0 ||
      !row.room ||
      row.room.puzzle !== category.puzzle ||
      row.room.input !== category.input ||
      row.room.mode !== category.mode
    )
      throw Error("Invalid category rankings");
    return row.durationMs as number;
  });
  times.sort((a, b) => a - b);
  let place = 0;
  return times.map((durationMs, index) => {
    if (index === 0 || times[index - 1] !== durationMs) place = index + 1;
    return { place, durationMs };
  });
}
