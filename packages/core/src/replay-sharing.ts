import { z } from "zod";
import { ReplayPacket } from "./replay";
export const ReplayShareStatus = z.enum([
  "PENDING_GUARDIAN",
  "PENDING_REVIEW",
  "READY",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
]);
export const PrepareReplayShare = z
  .object({
    attemptId: z.string().uuid(),
    disclosureConfirmed: z.literal(true),
  })
  .strict();
export const ReplayShareApproval = z
  .object({
    revision: z.number().int().positive(),
    packetDigest: z.string().regex(/^[a-f0-9]{64}$/),
    receipt: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    approve: z.boolean(),
    packetChecked: z.boolean(),
    reason: z.string().trim().max(400).default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.approve && !value.packetChecked)
      ctx.addIssue({
        code: "custom",
        message: "Inspect the exact replay before approving",
      });
    if (!value.approve && value.reason.length < 3)
      ctx.addIssue({
        code: "custom",
        message: "Give a short rejection reason",
      });
  });
export const ReplaySharePublish = z
  .object({
    revision: z.number().int().positive(),
    packetDigest: z.string().regex(/^[a-f0-9]{64}$/),
    disclosureConfirmed: z.literal(true),
  })
  .strict();
export const OpenReplayShare = z
  .object({
    id: z.string().uuid(),
    key: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export type ReplayShareView = {
  id: string;
  attemptId?: string;
  puzzle: string;
  input: "virtual" | "smart";
  mode: "race" | "daily";
  durationMs: number;
  status: z.infer<typeof ReplayShareStatus>;
  revision: number;
  packetDigest: string;
  createdAt: string;
  expiresAt: string;
  reason: string | null;
  expired: boolean;
  subject?: { id: string; displayName: string };
};
export const ReplaySharePreview = z
  .object({
    packet: ReplayPacket,
    revision: z.number().int().positive(),
    packetDigest: z.string().regex(/^[a-f0-9]{64}$/),
    receipt: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type ReplaySharePreview = z.infer<typeof ReplaySharePreview>;
export const SharedReplay = z
  .object({ packet: ReplayPacket, expiresAt: z.string().datetime() })
  .strict();
