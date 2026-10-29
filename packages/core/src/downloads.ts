import { z } from "zod";
import { Puzzle, Region } from "./contracts";
import { practiceSetup } from "./practice";
import { OfflineGuidedSnapshot } from "./offline-guidance-contract";
import { lessonStage } from "./lesson-stage";
import { guidedCourseId } from "./first-solve";
import {
  LessonAlternatives,
  checkedLessonAlternatives,
} from "./lesson-alternatives";
export const OFFLINE_LEASE_MS = 24 * 60 * 60 * 1000;
const bilingual = (max: number) =>
  z.object({ en: z.string().max(max), zh: z.string().max(max) }).strict();
export const DownloadedLesson = z
  .object({
    schemaVersion: z.literal(1),
    ownerId: z.string().uuid(),
    region: Region,
    downloadedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    courseVersion: z.number().int().positive(),
    guidedPractice: OfflineGuidedSnapshot.optional(),
    lesson: z
      .object({
        id: z.string().regex(/^[a-z0-9-]{1,100}$/),
        puzzle: Puzzle,
        kind: z.enum(["drill", "guided-first-solve"]).optional(),
        level: z.enum(["beginner", "intermediate", "advanced"]),
        title: bilingual(200),
        summary: bilingual(4000),
        steps: z
          .object({
            en: z.array(z.string().max(4000)).max(50),
            zh: z.array(z.string().max(4000)).max(50),
          })
          .strict(),
        algorithm: z.string().max(8000),
        minutes: z.number().int().min(1).max(240),
        caseFamily: z.enum(["OLL", "PLL", "CLL"]).optional(),
        alternatives: LessonAlternatives.optional(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (p) =>
      p.expiresAt > p.downloadedAt &&
      p.expiresAt - p.downloadedAt <= OFFLINE_LEASE_MS,
    "Invalid offline access window",
  )
  .superRefine((packet, ctx) => {
    if (
      packet.guidedPractice &&
      (packet.lesson.puzzle !== packet.guidedPractice.puzzle ||
        (packet.guidedPractice.lessonId
          ? packet.lesson.id !== packet.guidedPractice.lessonId ||
            lessonStage(packet.lesson.id)?.puzzle !== packet.lesson.puzzle
          : packet.lesson.kind !== "guided-first-solve" ||
            packet.lesson.id !== guidedCourseId(packet.guidedPractice.puzzle)))
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Downloaded guidance belongs to another course",
      });
    if (packet.lesson.algorithm.length > 8000) return;
    if (packet.lesson.algorithm.trim().split(/\s+/).length > 500) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Downloaded demonstration is too long",
      });
      return;
    }
    try {
      practiceSetup(packet.lesson.puzzle, packet.lesson.algorithm);
      checkedLessonAlternatives(packet.lesson);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid downloaded puzzle demonstration",
      });
    }
  });
export type DownloadedLesson = z.infer<typeof DownloadedLesson>;
