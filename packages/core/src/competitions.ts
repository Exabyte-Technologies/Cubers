import { z } from "zod";
import { Puzzle } from "./contracts";

const bilingual = (max: number) =>
  z
    .object({
      en: z.string().trim().min(1).max(max),
      zh: z.string().trim().min(1).max(max),
    })
    .strict();
export const CompetitionFormat = z.enum([
  "BEST1",
  "BEST3",
  "MEAN3",
  "AVERAGE5",
]);
export type CompetitionFormat = z.infer<typeof CompetitionFormat>;
export const competitionAttemptCount: Record<CompetitionFormat, number> = {
  BEST1: 1,
  BEST3: 3,
  MEAN3: 3,
  AVERAGE5: 5,
};
export const CompetitionDefinition = z
  .object({
    title: bilingual(120),
    description: bilingual(2000),
    puzzle: Puzzle,
    input: z.enum(["virtual", "scan", "smart"]),
    ranked: z.boolean(),
    capacity: z.number().int().min(1).max(100),
    registrationOpensAt: z.string().datetime(),
    registrationClosesAt: z.string().datetime(),
    rounds: z
      .array(
        z
          .object({
            title: bilingual(80),
            format: CompetitionFormat,
            opensAt: z.string().datetime(),
            closesAt: z.string().datetime(),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict()
  .superRefine((value, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (value.input === "smart" && value.puzzle !== "3x3")
      fail("These smart-cube models support 3x3 competitions only");
    const open = Date.parse(value.registrationOpensAt),
      close = Date.parse(value.registrationClosesAt);
    if (open >= close || close > Date.parse(value.rounds[0].opensAt))
      fail("Registration must end before the first round");
    let previous = close;
    for (const round of value.rounds) {
      const start = Date.parse(round.opensAt),
        end = Date.parse(round.closesAt);
      if (start < previous || end - start < 60000 || end - start > 86400000)
        fail(
          "Rounds must not overlap and must last between one minute and 24 hours",
        );
      previous = end;
    }
    if (previous - open > 7 * 86400000)
      fail("Competition schedule cannot exceed seven days");
  });
export const CompetitionRegister = z
  .object({
    expectedVersion: z.number().int().positive(),
    privateResultsUnderstood: z.literal(true),
  })
  .strict();
export const CompetitionShare = z
  .object({
    scope: z.union([
      z.literal("overall"),
      z
        .string()
        .uuid()
        .transform((id) => id.toLowerCase()),
    ]),
    sharingUnderstood: z.literal(true),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const CompetitionReview = z
  .object({
    revision: z.number().int().positive(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    approve: z.boolean(),
    checkedExactResult: z.literal(true),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
export type CompetitionSlot =
  | { status: "APPROVED"; durationMs: number }
  | { status: "PENDING" | "DNF" | "DNS" };
export type CompetitionScore = {
  status: "SCORED" | "PENDING" | "DNF";
  units: number | null;
  bestMs: number | null;
};
/** Integer units represent one third of a millisecond; no rounding affects placement. */
export function competitionScore(
  format: CompetitionFormat,
  slots: CompetitionSlot[],
): CompetitionScore {
  if (slots.length !== competitionAttemptCount[format])
    throw new Error("Incorrect attempt count");
  for (const slot of slots)
    if (
      slot.status === "APPROVED" &&
      (!Number.isSafeInteger(slot.durationMs) ||
        slot.durationMs < 300 ||
        slot.durationMs > 3602000)
    )
      throw new Error("Invalid verified duration");
  const times = slots
    .flatMap((s) => (s.status === "APPROVED" ? [s.durationMs] : []))
    .sort((a, b) => a - b);
  const bestMs = times[0] ?? null;
  if (slots.some((s) => s.status === "PENDING"))
    return { status: "PENDING", units: null, bestMs };
  let units: number | null = null;
  if (format.startsWith("BEST")) units = bestMs === null ? null : bestMs * 3;
  else if (format === "MEAN3")
    units = times.length === 3 ? times.reduce((a, b) => a + b, 0) : null;
  else if (times.length >= 4)
    units = times.slice(1, 4).reduce((a, b) => a + b, 0);
  return { status: units === null ? "DNF" : "SCORED", units, bestMs };
}
export function competitionScoreText(
  score: CompetitionScore,
  locale: "en" | "zh" = "en",
): string {
  return score.status === "SCORED"
    ? `${(score.units! / 3000).toFixed(3)} ${locale === "zh" ? "秒" : "s"}`
    : score.status === "PENDING"
      ? locale === "zh"
        ? "待完成或审核"
        : "Pending"
      : locale === "zh"
        ? "无有效成绩（DNF）"
        : "No result (DNF)";
}

export function competitionFormatLabel(format: string, locale: "en" | "zh") {
  const labels: Record<string, [string, string]> = {
    BEST1: ["Single solve", "单次成绩"],
    BEST3: ["Best of three", "三次取最佳"],
    MEAN3: ["Mean of three", "三次平均"],
    AVERAGE5: ["Trimmed average of five", "五次去头尾平均"],
  };
  return Object.hasOwn(labels, format)
    ? labels[format][locale === "zh" ? 1 : 0]
    : format;
}
export function competitionStatusLabel(status: string, locale: "en" | "zh") {
  const labels: Record<string, [string, string]> = {
    CREATED: ["Ready to prepare", "待准备"],
    INSPECTION: ["Inspection", "观察中"],
    SOLVING: ["Solving", "还原中"],
    AWAITING_EVIDENCE: ["Awaiting final scan or video", "待最终扫描或录像"],
    PROVISIONAL: ["Video awaiting review", "录像待审核"],
    APPROVED: ["Verified", "已核准"],
    INTERRUPTED: ["Interrupted", "已中止"],
    EXPIRED: ["Expired", "已过期"],
    PENDING_GUARDIAN: ["Awaiting guardian review", "待家长审核"],
    PENDING_REVIEW: ["Awaiting moderator review", "待审核员审核"],
    READY: ["Approved for sharing", "已批准分享"],
    REJECTED: ["Rejected", "未通过"],
    CANCELLED: ["Withdrawn or cancelled", "已撤回或取消"],
    PUBLISHED: ["Published", "已发布"],
    DRAFT: ["Private draft", "私密草稿"],
    REGISTERED: ["Registered", "已报名"],
    WITHDRAWN: ["Withdrawn", "已退出"],
    DNF: ["No result (DNF)", "无有效成绩（DNF）"],
    DNS: ["Not started (DNS)", "未参加（DNS）"],
    PENDING: ["Pending", "待完成或审核"],
  };
  return Object.hasOwn(labels, status)
    ? labels[status][locale === "zh" ? 1 : 0]
    : status;
}

export function competitionInputLabel(input: string, locale: "en" | "zh") {
  const labels: Record<string, [string, string]> = {
    virtual: ["Virtual", "虚拟"],
    scan: ["Physical scans", "实物扫描"],
    smart: ["Smart cube", "智能魔方"],
  };
  return Object.hasOwn(labels, input)
    ? labels[input][locale === "zh" ? 1 : 0]
    : input;
}
