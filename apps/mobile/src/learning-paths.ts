import type { Lesson, Locale, Puzzle } from "@cubers/core";

export type PathCourse = { id: string; content: Lesson };
export type PathLesson = {
  id: string;
  courseId: string;
  stepIndex: number;
  title: Record<Locale, string>;
  instruction: Record<Locale, string>;
  guided: boolean;
};
export type PathUnit = {
  id: string;
  course: PathCourse;
  lessons: PathLesson[];
};
export type LearningPathway = {
  id: string;
  puzzle: Puzzle;
  title: Record<Locale, string>;
  units: PathUnit[];
};
const definitions: {
  id: string;
  puzzle: Puzzle;
  title: Record<Locale, string>;
  beginner?: boolean;
}[] = [
  {
    id: "beginner-3x3",
    puzzle: "3x3",
    title: { en: "Beginner 3×3", zh: "三阶入门" },
    beginner: true,
  },
  {
    id: "advanced-3x3",
    puzzle: "3x3",
    title: { en: "Advanced 3×3", zh: "三阶进阶" },
    beginner: false,
  },
  {
    id: "beginner-2x2",
    puzzle: "2x2",
    title: { en: "Beginner 2×2", zh: "二阶入门" },
    beginner: true,
  },
  {
    id: "advanced-2x2",
    puzzle: "2x2",
    title: { en: "Advanced 2×2", zh: "二阶进阶" },
    beginner: false,
  },
  { id: "4x4", puzzle: "4x4", title: { en: "4×4", zh: "四阶魔方" } },
  {
    id: "pyraminx",
    puzzle: "pyraminx",
    title: { en: "Pyraminx", zh: "金字塔魔方" },
  },
];
const beginnerOrder = [
  "3-notation",
  "3-cross",
  "3-corners",
  "3-middle",
  "3-yellow-cross",
  "3-sune",
  "3-pll",
  "3-first-solve",
  "2-beginner",
  "2-first-solve",
];
const concise = (text: string) => {
  const end = text.search(/[.!?。！？]/);
  return end < 0 ? text : text.slice(0, end + 1);
};
/** A node opens one authored teaching step. Completion belongs to the verified unit checkpoint. */
export function buildLearningPathways(
  courses: PathCourse[],
): LearningPathway[] {
  const seen = new Set<string>();
  const unique = courses.filter((c) => !seen.has(c.id) && !!seen.add(c.id));
  return definitions.map((definition) => {
    const matching = unique.filter(
      ({ content }) =>
        content.puzzle === definition.puzzle &&
        (definition.beginner === undefined ||
          (definition.beginner
            ? content.level === "beginner" && !content.caseFamily
            : content.level !== "beginner" || !!content.caseFamily)),
    );
    if (definition.beginner)
      matching.sort((a, b) => {
        const index = (id: string) => {
          const found = beginnerOrder.indexOf(id);
          return found < 0 ? 1000 : found;
        };
        return index(a.id) - index(b.id);
      });
    return {
      ...definition,
      units: matching.map((course) => {
        const guided = course.content.kind === "guided-first-solve";
        const count = guided
          ? 1
          : Math.max(
              1,
              Math.min(
                course.content.steps.en.length,
                course.content.steps.zh.length,
              ),
            );
        return {
          id: course.id,
          course,
          lessons: Array.from({ length: count }, (_, stepIndex) => {
            const instruction = {
              en:
                course.content.steps.en[stepIndex] || course.content.summary.en,
              zh:
                course.content.steps.zh[stepIndex] || course.content.summary.zh,
            };
            return {
              id: `${course.id}:${stepIndex}`,
              courseId: course.id,
              stepIndex,
              guided,
              instruction,
              title: guided
                ? course.content.title
                : { en: concise(instruction.en), zh: concise(instruction.zh) },
            };
          }),
        };
      }),
    };
  });
}
export function lessonStep(raw: unknown, length: number): number {
  if (typeof raw !== "string" || !/^\d{1,3}$/.test(raw)) return 0;
  const step = Number(raw);
  return step >= 0 && step < length ? step : 0;
}
