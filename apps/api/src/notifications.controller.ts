import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Query,
  Req,
  Body,
  Inject,
  Header,
  BadRequestException,
  ConflictException,
  NotFoundException,
  HttpException,
} from "@nestjs/common";
import { z } from "zod";
import {
  NotificationCategory,
  NotificationPreferences,
  type NotificationPreferenceView,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import type { Authed } from "./security";
import {
  notificationCategories,
  notificationPreferences,
  notificationScope,
} from "./notifications";
import { hash, opaque } from "./crypto";
const Page = z
  .object({
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
    unread: z.enum(["true", "false"]).default("false"),
    category: NotificationCategory.optional(),
  })
  .strict();
const Cursor = z
  .object({
    viewer: z.string().uuid(),
    region: z.enum(["CN", "INTL"]),
    scope: z.string(),
    revision: z.number().int().positive(),
    at: z.string().datetime(),
    last: z.string().uuid(),
  })
  .strict();
const Ids = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(100) })
  .strict();
@Controller("v1/me")
export class NotificationsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
  ) {}
  private view(user: Authed["user"]): NotificationPreferenceView {
    return {
      communityUpdatesAvailable: this.communityEnabled(),
      revision: user.notificationRevision,
      settings: notificationPreferences(user),
      required: ["SYSTEM", "REVIEW"],
    };
  }
  private communityEnabled() {
    return (
      this.infra.config.REGION !== "CN" ||
      this.infra.config.CN_SOCIAL_APPROVED === "true"
    );
  }
  @Get("notification-settings")
  @Header("Cache-Control", "private, no-store")
  settings(@Req() r: Authed) {
    return this.view(r.user);
  }
  @Put("notification-settings")
  async save(@Req() r: Authed, @Body() body: unknown) {
    const b = z
      .object({
        revision: z.number().int().positive(),
        settings: NotificationPreferences,
      })
      .strict()
      .parse(body);
    if (
      !(await this.infra.limit(`notification-settings:${r.user.id}`, 30, 3600))
    )
      throw new HttpException("Too many preference changes", 429);
    return this.db.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: {
          id: r.user.id,
          region: this.infra.config.REGION,
          deletedAt: null,
          notificationRevision: b.revision,
        },
        data: {
          notificationSettings: b.settings,
          notificationRevision: { increment: 1 },
        },
      });
      if (!result.count)
        throw new ConflictException("Settings changed. Refresh and try again.");
      return this.view(
        await tx.user.findUniqueOrThrow({ where: { id: r.user.id } }),
      );
    });
  }
  @Get("notifications")
  @Header("Cache-Control", "private, no-store")
  async page(@Req() r: Authed, @Query() query: unknown) {
    const b = Page.parse(query),
      scope = JSON.stringify({
        unread: b.unread,
        category: b.category || null,
        community: this.communityEnabled(),
      });
    if (!(await this.infra.limit(`notification-read:${r.user.id}`, 100, 60)))
      throw new HttpException("Too many inbox requests", 429);
    const categories = notificationCategories(
      r.user,
      this.communityEnabled(),
    ).filter((c) => !b.category || c === b.category);
    const cursorKey = (token: string) =>
      this.infra.config.REGION + ":notification-cursor:" + hash(token);
    let position: { at: Date; id: string } | undefined;
    if (b.cursor) {
      const raw = await this.infra.redis.get(cursorKey(b.cursor));
      if (!raw)
        throw new ConflictException("Inbox cursor expired. Refresh the inbox.");
      let cursor: z.infer<typeof Cursor>;
      try {
        cursor = Cursor.parse(JSON.parse(raw));
      } catch {
        throw new BadRequestException("Invalid inbox cursor");
      }
      if (
        cursor.viewer !== r.user.id ||
        cursor.region !== r.user.region ||
        cursor.scope !== scope
      )
        throw new BadRequestException("Cursor belongs to another inbox view");
      if (cursor.revision !== r.user.notificationRevision)
        throw new ConflictException(
          "Notification preferences changed. Refresh the inbox.",
        );
      position = { at: new Date(cursor.at), id: cursor.last };
    }
    const rows = await this.db.notification.findMany({
      where: {
        AND: [notificationScope(r.user, Date.now(), this.communityEnabled())],
        category: { in: categories },
        ...(b.unread === "true" ? { read: false } : {}),
        ...(position
          ? {
              OR: [
                { createdAt: { lt: position.at } },
                { createdAt: position.at, id: { lt: position.id } },
              ],
            }
          : {}),
      },
      take: 21,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        category: true,
        title: true,
        body: true,
        read: true,
        createdAt: true,
      },
    });
    let nextCursor: string | null = null;
    if (rows.length > 20) {
      const last = rows[19];
      nextCursor = opaque();
      await this.infra.redis.set(
        cursorKey(nextCursor),
        JSON.stringify({
          viewer: r.user.id,
          region: r.user.region,
          scope,
          revision: r.user.notificationRevision,
          at: last.createdAt.toISOString(),
          last: last.id,
        }),
        "EX",
        900,
      );
    }
    return {
      items: rows.slice(0, 20),
      nextCursor,
      unreadCount: await this.db.notification.count({
        where: {
          ...notificationScope(r.user, Date.now(), this.communityEnabled()),
          read: false,
          category: {
            in: notificationCategories(r.user, this.communityEnabled()),
          },
        },
      }),
    };
  }
  @Post("notifications/read")
  async read(@Req() r: Authed, @Body() body: unknown) {
    const ids = [...new Set(Ids.parse(body).ids.map((id) => id.toLowerCase()))];
    if (!(await this.infra.limit(`notification-mutate:${r.user.id}`, 120, 60)))
      throw new HttpException("Too many inbox changes", 429);
    return this.db.$transaction(async (tx) => {
      const rows = await tx.notification.findMany({
        where: {
          id: { in: ids },
          AND: [notificationScope(r.user, Date.now(), this.communityEnabled())],
        },
        select: { id: true },
      });
      if (rows.length !== ids.length)
        throw new NotFoundException("An update is unavailable");
      const result = await tx.notification.updateMany({
        where: { userId: r.user.id, id: { in: ids } },
        data: { read: true },
      });
      if (result.count !== ids.length)
        throw new ConflictException("Inbox changed. Refresh and try again.");
      return {
        ok: true,
        count: result.count,
        unreadCount: await tx.notification.count({
          where: {
            ...notificationScope(r.user, Date.now(), this.communityEnabled()),
            read: false,
            category: {
              in: notificationCategories(r.user, this.communityEnabled()),
            },
          },
        }),
      };
    });
  }
  @Delete("notifications/:id")
  async dismiss(@Req() r: Authed, @Param("id") id: string) {
    const notificationId = z.string().uuid().parse(id).toLowerCase();
    if (!(await this.infra.limit(`notification-mutate:${r.user.id}`, 120, 60)))
      throw new HttpException("Too many inbox changes", 429);
    const result = await this.db.notification.deleteMany({
      where: { id: notificationId, userId: r.user.id },
    });
    if (!result.count) throw new NotFoundException("Update unavailable");
    return {
      ok: true,
      unreadCount: await this.db.notification.count({
        where: {
          ...notificationScope(r.user, Date.now(), this.communityEnabled()),
          read: false,
          category: {
            in: notificationCategories(r.user, this.communityEnabled()),
          },
        },
      }),
    };
  }
}
