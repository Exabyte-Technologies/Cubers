import { z } from "zod";
import type { Puzzle } from "./contracts";
import {
  practiceApply,
  practiceKey,
  practiceSetup,
  solvedPuzzle,
} from "./practice";

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => !/[\u0000-\u001f\u007f-\u009f]/.test(value),
      "Unsupported control character",
    );
export const LessonAlternative = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .refine((value) => !/\s/.test(value)),
    title: z.object({ en: text(200), zh: text(200) }).strict(),
    steps: z
      .object({
        en: z.array(text(2000)).min(1).max(8),
        zh: z.array(text(2000)).min(1).max(8),
      })
      .strict(),
    algorithm: text(4000),
  })
  .strict();
export type LessonAlternative = z.infer<typeof LessonAlternative>;
export const LessonAlternatives = z.array(LessonAlternative).max(3);

/** Alternatives must solve the exact original setup, including its color frame. */
export function checkedLessonAlternatives(lesson: {
  puzzle: Puzzle;
  algorithm: string;
  kind?: string;
  alternatives?: LessonAlternative[];
}) {
  const rows = LessonAlternatives.parse(lesson.alternatives || []);
  if (rows.length && lesson.kind === "guided-first-solve")
    throw Error(
      "State-specific guidance cannot use a fixed alternate sequence",
    );
  if (new Set(rows.map((row) => row.id)).size !== rows.length)
    throw Error("Alternative identities must be unique");
  if (!rows.length) return rows;
  const baseline = practiceSetup(lesson.puzzle, lesson.algorithm),
    initial = practiceKey(baseline),
    solved = practiceKey(solvedPuzzle(lesson.puzzle)),
    originalLength = lesson.algorithm
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  for (const row of rows) {
    const moves = row.algorithm.split(" ");
    if (
      moves.length < 1 ||
      moves.length >= originalLength ||
      moves.length > 500 ||
      row.algorithm.trim().split(/\s+/).length !== moves.length ||
      practiceKey(practiceSetup(lesson.puzzle, row.algorithm)) !== initial ||
      practiceKey(practiceApply(baseline, moves)) !== solved
    )
      throw Error(
        "A shorter alternative must solve the exact same setup in fewer turns",
      );
  }
  return rows;
}
export function lessonDemonstration(
  lesson: {
    puzzle: Puzzle;
    algorithm: string;
    kind?: string;
    alternatives?: LessonAlternative[];
  },
  alternativeId?: string,
) {
  if (!alternativeId) return { guideId: null, guideAlgorithm: null };
  const option = checkedLessonAlternatives(lesson).find(
    (row) => row.id === alternativeId,
  );
  if (!option)
    throw Error("This sequence is not available in the published lesson");
  return { guideId: option.id, guideAlgorithm: option.algorithm };
}
