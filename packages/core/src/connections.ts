import { z } from "zod";
export const ConnectionKind = z.enum(["FRIEND", "MENTORSHIP"]);
export const ConnectionSettings = z
  .object({
    requests: z.enum(["CLUB", "ANY", "NONE"]).default("CLUB"),
    offerMentoring: z.boolean().default(false),
    mentorCapacity: z.number().int().min(1).max(20).default(5),
  })
  .strict();
export const ConnectionRequest = z
  .object({
    targetId: z
      .string()
      .uuid()
      .transform((id) => id.toLowerCase()),
    kind: ConnectionKind,
    clubId: z
      .string()
      .uuid()
      .transform((id) => id.toLowerCase())
      .optional(),
  })
  .strict();
export const ConnectionAction = z
  .object({
    action: z.enum(["ACCEPT", "DECLINE", "CANCEL", "END"]),
    version: z.number().int().nonnegative(),
  })
  .strict();
export const ConnectionReview = z
  .object({
    approve: z.boolean(),
    version: z.number().int().nonnegative(),
  })
  .strict();
export type ConnectionPreferences = z.infer<typeof ConnectionSettings>;
export type ConnectionView = {
  id: string;
  kind: z.infer<typeof ConnectionKind>;
  status:
    "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "ENDED" | "EXPIRED";
  version: number;
  requester: { id: string; displayName: string };
  recipient: { id: string; displayName: string };
  club: { id: string; name: string } | null;
  active: boolean;
  unavailable: string | null;
  recipientAccepted: boolean;
  needs: { recipient: boolean; guardian: boolean; clubReview: boolean };
  expiresAt: string;
  createdAt: string;
};
