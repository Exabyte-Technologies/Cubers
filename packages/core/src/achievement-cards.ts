import { z } from "zod";
import { AchievementCatalog, AchievementId } from "./profiles";
import type { ProfileAchievement } from "./profiles";
import { Locale } from "./contracts";
export const CARD_TEMPLATE_VERSION = 1;
export const PrepareAchievementCard = z
  .object({
    achievementId: AchievementId,
    locale: Locale,
    includeName: z.boolean().default(false),
    disclosureConfirmed: z.literal(true),
  })
  .strict();
export const CardApproval = z
  .object({
    revision: z.number().int().positive(),
    imageDigest: z.string().regex(/^[a-f0-9]{64}$/),
    approve: z.boolean(),
    imageChecked: z.boolean(),
    reason: z.string().trim().max(400).default(""),
  })
  .strict()
  .superRefine((value, c) => {
    if (value.approve && !value.imageChecked)
      c.addIssue({
        code: "custom",
        path: ["imageChecked"],
        message: "Inspect the exact image before approving",
      });
    if (!value.approve && value.reason.length < 3)
      c.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Give a short reason",
      });
  });
export const CardExport = z
  .object({
    revision: z.number().int().positive(),
    imageDigest: z.string().regex(/^[a-f0-9]{64}$/),
    disclosureConfirmed: z.literal(true),
  })
  .strict();
export const CardStatus = z.enum([
  "PENDING_GUARDIAN",
  "PENDING_REVIEW",
  "READY",
  "REJECTED",
  "CANCELLED",
]);
export type AchievementCardView = {
  id: string;
  achievementId: z.infer<typeof AchievementId>;
  locale: z.infer<typeof Locale>;
  namedLabel: string | null;
  status: z.infer<typeof CardStatus>;
  revision: number;
  imageDigest: string;
  templateVersion: number;
  reason: string | null;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
};
export const CardImage = z
  .object({
    cardId: z.string().uuid(),
    imageDigest: z.string().regex(/^[a-f0-9]{64}$/),
    base64: z
      .string()
      .min(1)
      .max(700000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    mime: z.literal("image/png"),
    width: z.literal(1200),
    height: z.literal(1500),
    filename: z.literal("cubers-milestone.png"),
    approvalDigest: z.string().regex(/^[a-f0-9]{64}$/),
    watermarked: z.boolean(),
  })
  .strict();
export type CardImage = z.infer<typeof CardImage>;
export type AchievementCardCatalogue = {
  achievements: ProfileAchievement[];
  sharingAvailable: boolean;
  namedCardsAvailable: boolean;
  youngChild: boolean;
  minor: boolean;
};
export type AchievementCardPage = {
  items: AchievementCardView[];
  nextCursor: string | null;
};
export type ReviewCard = AchievementCardView & {
  independentReviewer?: boolean;
  subject: { id: string; displayName: string };
};
export function achievementCardText(id: string, locale: string) {
  const achievement = AchievementCatalog.find(
      (a) => a.id === AchievementId.parse(id),
    )!,
    language = Locale.parse(locale);
  return {
    title: achievement[language],
    description:
      language === "en"
        ? achievement.description.en.replace(
            /^(Complete|Finish|Receive)\b/,
            (verb) =>
              ({
                Complete: "Completed",
                Finish: "Finished",
                Receive: "Received",
              })[verb]!,
          )
        : achievement.description.zh,
    footer:
      language === "zh"
        ? "个人学习里程碑 · 非官方赛事证书"
        : "Personal milestone · Not an official competition certificate",
  };
}
