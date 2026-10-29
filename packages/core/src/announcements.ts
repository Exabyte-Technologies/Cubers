import { z } from "zod";
const text = (max: number, multiline = false) =>
  z
    .string()
    .trim()
    .min(2)
    .max(max)
    .refine(
      (value) =>
        !(
          multiline
            ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
            : /[\u0000-\u001f\u007f]/
        ).test(value),
      "Use plain text without control characters",
    );
const bilingual = (max: number, multiline = false) =>
  z.object({ en: text(max, multiline), zh: text(max, multiline) }).strict();
const courseId = z.string().regex(/^[a-z0-9-]{1,100}$/);
export const AnnouncementContent = z
  .object({
    kind: z.enum(["service", "learning"]),
    title: bilingual(120),
    summary: bilingual(300),
    body: bilingual(4000, true),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    courseId: courseId.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const start = Date.parse(value.startsAt),
      end = Date.parse(value.endsAt);
    if (end <= start || end - start > 90 * 86400000)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An update must span at most 90 days",
      });
    if (value.kind !== "learning" && value.courseId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only learning updates can link to a lesson",
      });
  });
export type AnnouncementContent = z.infer<typeof AnnouncementContent>;
const version = z.number().int().min(1).max(2147483646);
const reason = text(500).refine(
  (value) => value.length >= 10,
  "Explain the change in at least ten characters",
);
export const AnnouncementCreate = z
  .object({ content: AnnouncementContent, reason })
  .strict();
export const AnnouncementEdit = z
  .object({ expectedVersion: version, content: AnnouncementContent, reason })
  .strict();
export const AnnouncementPublish = z.discriminatedUnion("published", [
  z
    .object({ expectedVersion: version, published: z.literal(false), reason })
    .strict(),
  z
    .object({
      expectedVersion: version,
      published: z.literal(true),
      englishReviewed: z.literal(true),
      chineseReviewed: z.literal(true),
      rightsConfirmed: z.literal(true),
      serviceOrLearningOnly: z.literal(true),
      courseVersion: version.optional(),
      reason,
    })
    .strict(),
]);
export const AnnouncementPreview = z
  .object({
    id: z.string().uuid(),
    version,
    kind: z.enum(["service", "learning"]),
    title: bilingual(120),
    summary: bilingual(300),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    validForMs: z.number().int().positive().max(30_000),
  })
  .strict();
export const AnnouncementDetail = AnnouncementPreview.extend({
  body: bilingual(4000, true),
  courseId: courseId.optional(),
}).strict();
export type AnnouncementPreview = z.infer<typeof AnnouncementPreview>;
export type AnnouncementDetail = z.infer<typeof AnnouncementDetail>;
export const AnnouncementsPage = z
  .object({
    items: z.array(AnnouncementPreview).max(10),
    nextCursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .nullable(),
  })
  .strict();
