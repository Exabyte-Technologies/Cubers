import { z } from "zod";
import { Puzzle } from "./contracts";
import { lessons } from "./curriculum";
import { practiceSetup, practiceSolved, practiceApply } from "./practice";
import {
  LessonAlternatives,
  checkedLessonAlternatives,
} from "./lesson-alternatives";
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s),
      "Unsupported control character",
    );
const bilingual = (max: number) =>
  z.object({ en: text(max), zh: text(max) }).strict();
export const CourseLesson = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,100}$/),
    puzzle: Puzzle,
    kind: z.enum(["drill", "guided-first-solve"]).optional(),
    level: z.enum(["beginner", "intermediate", "advanced"]),
    title: bilingual(200),
    summary: bilingual(2000),
    steps: z
      .object({
        en: z.array(text(2000)).min(1).max(24),
        zh: z.array(text(2000)).min(1).max(24),
      })
      .strict(),
    algorithm: z.string().trim().max(4000),
    minutes: z.number().int().min(1).max(240),
    caseFamily: z.enum(["OLL", "PLL", "CLL"]).optional(),
    alternatives: LessonAlternatives.optional(),
  })
  .strict();
export type EditableLesson = z.infer<typeof CourseLesson>;
const reason = text(1000).refine(
  (value) => value.length >= 10,
  "Explain the edit in at least ten characters",
);
export const CourseCreate = z
  .object({ lesson: CourseLesson.omit({ id: true }), reason })
  .strict();
export const CourseEdit = z
  .object({
    expectedVersion: z.number().int().positive(),
    lesson: CourseLesson,
    reason,
  })
  .strict();
export const CoursePublish = z.union([
  z
    .object({
      expectedVersion: z.number().int().positive(),
      published: z.literal(false),
    })
    .strict(),
  z
    .object({
      expectedVersion: z.number().int().positive(),
      published: z.literal(true),
      reviewed: z.literal(true),
      englishReviewed: z.literal(true),
      chineseReviewed: z.literal(true),
      rightsConfirmed: z.literal(true),
    })
    .strict(),
]);
export function checkedCourseLesson(
  value: unknown,
  existingPuzzle?: string,
): EditableLesson {
  const lesson = CourseLesson.parse(value),
    canonical = lessons.find((row) => row.id === lesson.id);
  if (JSON.stringify(lesson).length > 30000)
    throw Error("Course text exceeds the publication limit");
  if (existingPuzzle && lesson.puzzle !== existingPuzzle)
    throw Error("A course cannot change its puzzle; create a separate course");
  if (canonical) {
    for (const key of ["puzzle", "level", "algorithm", "caseFamily"] as const)
      if (lesson[key] !== canonical[key])
        throw Error(
          "Built-in verification fields are fixed; create a separate drill",
        );
    if ((lesson.kind || "drill") !== (canonical.kind || "drill"))
      throw Error("Built-in course method is fixed");
    // Legacy content can retain no alternative. Adding one uses the exact
    // source-reviewed built-in option and the normal version/review workflow.
    if (
      lesson.alternatives?.length &&
      JSON.stringify(lesson.alternatives) !==
        JSON.stringify(LessonAlternatives.parse(canonical.alternatives || []))
    )
      throw Error(
        "Built-in alternative teaching is fixed; create a separate drill",
      );
  } else if (
    !/^custom-[a-f0-9-]{36}$/.test(lesson.id) ||
    lesson.caseFamily ||
    lesson.kind === "guided-first-solve"
  )
    throw Error(
      "New courses must be ordinary drills with a server-generated identity",
    );
  if (lesson.kind !== "guided-first-solve") {
    if (!lesson.algorithm.trim() || lesson.algorithm.split(/\s+/).length > 500)
      throw Error("Provide one to five hundred validated turns");
    const setup = practiceSetup(lesson.puzzle, lesson.algorithm);
    if (
      practiceSolved(setup) ||
      !practiceSolved(practiceApply(setup, lesson.algorithm))
    )
      throw Error("A drill must contain a nontrivial, solvable exercise");
  }
  checkedLessonAlternatives(lesson);
  return lesson;
}
