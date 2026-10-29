import { z } from "zod";
export const NotificationCategory = z.enum([
  "SYSTEM",
  "REVIEW",
  "CONNECTION",
  "CLUB",
]);
export type NotificationCategory = z.infer<typeof NotificationCategory>;
export const NotificationPreferences = z
  .object({ connections: z.boolean(), clubs: z.boolean() })
  .strict();
export type NotificationPreferences = z.infer<typeof NotificationPreferences>;
export type NotificationItem = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};
export type NotificationPage = {
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
};
export type NotificationPreferenceView = {
  communityUpdatesAvailable: boolean;
  revision: number;
  settings: NotificationPreferences;
  required: readonly ["SYSTEM", "REVIEW"];
};
