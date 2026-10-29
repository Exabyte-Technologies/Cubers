import { z } from "zod";
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(2)
    .max(max)
    .refine(
      (v) => !/[\u0000-\u001f\u007f]/.test(v),
      "Use plain text without control characters",
    );
// A conservative portable HTTPS grammar keeps the reviewed address identical
// in Node, browsers and React Native's non-WHATWG URL implementation. No fetch.
export function parseSponsorDestination(
  value: string,
): { url: string; host: string } | null {
  const match =
    /^https:\/\/([a-z0-9.-]+)(?::443)?(\/[a-z0-9\-._~!$&'()*+,;=:@/%]*)?$/i.exec(
      value,
    );
  if (!match) return null;
  const host = match[1].toLowerCase(),
    labels = host.split("."),
    path = match[2] || "/";
  if (
    host.length > 253 ||
    labels.length < 2 ||
    labels.some((l) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(l)) ||
    !/[a-z]/i.test(labels.at(-1)!) ||
    ["localhost", "local", "internal", "test", "invalid", "example"].includes(
      labels.at(-1)!,
    )
  )
    return null;
  try {
    const decoded = decodeURIComponent(path);
    if (
      /[\s\\\u0000-\u001f\u007f]/.test(decoded) ||
      decoded.split("/").some((p) => p === "." || p === "..")
    )
      return null;
  } catch {
    return null;
  }
  return { url: `https://${host}${path}`, host };
}
export const SponsorDestination = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (v) => parseSponsorDestination(v) !== null,
    "Use a public HTTPS landing page without credentials, query tracking, fragments or ambiguous paths",
  )
  .transform((v) => parseSponsorDestination(v)!.url);
export const CampaignContent = z
  .object({
    title: z.object({ en: text(100), zh: text(100) }).strict(),
    summary: z.object({ en: text(300), zh: text(300) }).strict(),
    category: z.enum(["cubing-equipment", "cubing-education", "cubing-event"]),
    destination: SponsorDestination,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const start = Date.parse(v.startsAt),
      end = Date.parse(v.endsAt);
    if (end <= start || end - start > 366 * 86400000)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Campaign dates must be ordered and cover at most 366 days",
      });
  });
export type CampaignContent = z.infer<typeof CampaignContent>;
const version = z.number().int().min(1).max(2147483646);
const reason = z.string().trim().min(10).max(500);
export const CampaignCreate = z
  .object({ content: CampaignContent, reason })
  .strict();
export const CampaignEdit = z
  .object({ expectedVersion: version, content: CampaignContent, reason })
  .strict();
export const CampaignReview = z.discriminatedUnion("decision", [
  z
    .object({
      expectedVersion: version,
      decision: z.literal("approve"),
      archiveReference: z.string().regex(/^[A-Z0-9][A-Z0-9._/-]{4,119}$/),
      advertiserRecordReviewed: z.literal(true),
      destinationReviewed: z.literal(true),
      bilingualReviewed: z.literal(true),
      reason,
    })
    .strict(),
  z
    .object({
      expectedVersion: version,
      decision: z.literal("withdraw"),
      reason,
    })
    .strict(),
]);
export const CampaignEnable = z
  .object({ expectedVersion: version, enabled: z.boolean(), reason })
  .strict();
export const SponsorSetting = z
  .object({ expectedVersion: version, enabled: z.boolean() })
  .strict();
export const SponsorCard = z
  .object({
    id: z.string().uuid(),
    version,
    title: z
      .object({
        en: z.string().min(2).max(100),
        zh: z.string().min(2).max(100),
      })
      .strict(),
    summary: z
      .object({
        en: z.string().min(2).max(300),
        zh: z.string().min(2).max(300),
      })
      .strict(),
    destination: SponsorDestination,
    endsAt: z.string().datetime(),
    validForMs: z.number().int().min(1).max(30000),
  })
  .strict();
export type SponsorCard = z.infer<typeof SponsorCard>;
export function campaignArchiveExpiry(endsAt: Date, now = new Date()) {
  const date = new Date(Math.max(endsAt.getTime(), now.getTime()));
  date.setUTCFullYear(date.getUTCFullYear() + 3);
  return date;
}

export const SponsorCards = z.array(SponsorCard).max(3);
