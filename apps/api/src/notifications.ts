import {
  NotificationPreferences,
  type NotificationCategory,
} from "@cubers/core";
import type { Prisma, User } from "@prisma/client";
export function notificationPreferences(
  user: Pick<User, "notificationSettings">,
): NotificationPreferences {
  const raw = user.notificationSettings;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { connections: false, clubs: false };
  const result = NotificationPreferences.safeParse({
    connections: true,
    clubs: true,
    ...raw,
  });
  return result.success ? result.data : { connections: false, clubs: false };
}
export function notificationCategories(
  user: Pick<User, "notificationSettings">,
  allowSocial = true,
): NotificationCategory[] {
  if (!allowSocial) return ["SYSTEM", "REVIEW"];
  const p = notificationPreferences(user);
  return [
    "SYSTEM",
    "REVIEW",
    ...(p.connections ? ["CONNECTION" as const] : []),
    ...(p.clubs ? ["CLUB" as const] : []),
  ];
}
export function notificationScope(
  user: Pick<User, "id" | "notificationSettings">,
  now = Date.now(),
  allowSocial = true,
): Prisma.NotificationWhereInput {
  return {
    userId: user.id,
    category: { in: notificationCategories(user, allowSocial) },
    OR: [
      { read: false, createdAt: { gte: new Date(now - 90 * 86400000) } },
      { read: true, createdAt: { gte: new Date(now - 30 * 86400000) } },
    ],
  };
}
export async function notifyUser(
  db: Prisma.TransactionClient,
  region: string,
  userId: string,
  category: NotificationCategory,
  title: string,
  body: string,
) {
  const user = await db.user.findFirst({
    where: { id: userId, region, deletedAt: null },
    select: { notificationSettings: true },
  });
  if (!user || !notificationCategories(user).includes(category)) return;
  await db.notification.create({ data: { userId, category, title, body } });
}
