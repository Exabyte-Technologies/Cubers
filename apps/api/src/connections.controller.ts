import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Inject,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import {
  ConnectionSettings,
  ConnectionRequest,
  ConnectionAction,
  ConnectionReview,
  ageOn,
} from "@cubers/core";
import { Prisma } from "@prisma/client";
import { Db, Infrastructure } from "./services";
import { type Authed } from "./security";
import {
  Connections,
  connectionPreferences,
  lockConnectionUsers,
} from "./connections";
import { communityAvailable } from "./community-access";
@Controller("v1")
export class ConnectionsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(Connections) private connections: Connections,
  ) {}
  private available() {
    communityAvailable(this.infra.config);
  }
  @Get("me/connection-settings") async settings(@Req() r: Authed) {
    return {
      ...connectionPreferences(r.user),
      canOfferMentoring: ageOn(r.user.birthDate) >= 18 && r.user.adultVerified,
      canReceiveFromAnyone: ageOn(r.user.birthDate) >= 18,
    };
  }
  @Post("me/connection-settings") async saveSettings(
    @Req() r: Authed,
    @Body() body: unknown,
  ) {
    this.available();
    const data = ConnectionSettings.parse(body);
    await this.db.$transaction(async (tx) => {
      await lockConnectionUsers(tx, [r.user.id]);
      const current = await tx.user.findUniqueOrThrow({
        where: { id: r.user.id },
      });
      if (
        (data.requests === "ANY" && ageOn(current.birthDate) < 18) ||
        (data.offerMentoring &&
          (ageOn(current.birthDate) < 18 || !current.adultVerified))
      )
        throw new ForbiddenException(
          "Current adult verification is required for these settings",
        );
      await tx.user.update({
        where: { id: current.id },
        data: { connectionSettings: data },
      });
    });
    return data;
  }
  @Post("connections") async request(@Req() r: Authed, @Body() body: unknown) {
    this.available();
    return this.connections.create(r, ConnectionRequest.parse(body));
  }
  @Post("connections/:id/action") async action(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    this.available();
    z.string().uuid().parse(id);
    const b = ConnectionAction.parse(body);
    return this.connections.mutate(r, id, b.version, b.action);
  }
  @Get("connections") async list(@Req() r: Authed, @Query() query: unknown) {
    this.available();
    const b = z
      .object({
        cursor: z.string().uuid().optional(),
        filter: z.enum(["current", "history"]).default("current"),
      })
      .strict()
      .parse(query);
    const own = {
      OR: [{ requesterId: r.user.id }, { recipientId: r.user.id }],
    };
    if (
      b.cursor &&
      !(await this.db.connection.findFirst({ where: { id: b.cursor, ...own } }))
    )
      throw new NotFoundException();
    const rows = await this.db.connection.findMany({
      where: {
        ...own,
        ...(b.filter === "current"
          ? {
              status: {
                in: ["PENDING", "ACCEPTED"] as ("PENDING" | "ACCEPTED")[],
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 31,
      ...(b.cursor ? { cursor: { id: b.cursor }, skip: 1 } : {}),
    });
    return {
      items: await Promise.all(
        rows.slice(0, 30).map((row) => this.connections.view(this.db, row)),
      ),
      nextCursor: rows.length > 30 ? rows[29].id : null,
    };
  }
  @Get("connection-targets/:id") async target(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    this.available();
    z.string().uuid().parse(id);
    const user = await this.db.user.findFirst({
      where: {
        id,
        deletedAt: null,
        emailVerified: true,
        region: r.user.region,
      },
      select: {
        id: true,
        displayName: true,
        birthDate: true,
        connectionSettings: true,
        adultVerified: true,
      },
    });
    if (
      !user ||
      id === r.user.id ||
      (await this.db.social.findFirst({
        where: {
          kind: "block",
          OR: [
            {
              actorId: r.user.id,
              targetId: { equals: id, mode: "insensitive" },
            },
            {
              actorId: id,
              targetId: { equals: r.user.id, mode: "insensitive" },
            },
          ],
        },
      }))
    )
      throw new NotFoundException();
    const mine = await this.db.membership.findMany({
      where: { userId: r.user.id, status: "APPROVED" },
      select: { clubId: true },
    });
    const theirs = await this.db.membership.findMany({
      where: {
        userId: id,
        status: "APPROVED",
        clubId: { in: mine.map((m) => m.clubId) },
      },
      select: { clubId: true },
    });
    const clubs = await this.db.club.findMany({
      where: { id: { in: theirs.map((m) => m.clubId) }, status: "APPROVED" },
      select: { id: true, name: true },
      take: 100,
    });
    const clubRequired = ageOn(user.birthDate) < 18 || r.policy.age < 18;
    if (clubRequired && !clubs.length) throw new NotFoundException();
    const preferences = ConnectionSettings.parse(user.connectionSettings);
    return {
      id: user.id,
      displayName: user.displayName,
      clubs,
      clubRequired: clubRequired || preferences.requests === "CLUB",
      accepting: preferences.requests !== "NONE",
      offersMentoring:
        ageOn(user.birthDate) >= 18 &&
        user.adultVerified &&
        preferences.offerMentoring,
      current: (
        await this.db.connection.findMany({
          where: {
            OR: [
              { requesterId: r.user.id, recipientId: id },
              { requesterId: id, recipientId: r.user.id },
            ],
          },
          select: { id: true, kind: true, status: true, expiresAt: true },
          take: 2,
        })
      ).map((row) => ({
        id: row.id,
        kind: row.kind,
        status:
          row.status === "PENDING" && row.expiresAt <= new Date()
            ? "EXPIRED"
            : row.status,
      })),
    };
  }
  @Get("guardian/connections") async guardianList(
    @Req() r: Authed,
    @Query() query: unknown,
  ) {
    this.available();
    const b = z
      .object({
        childId: z.string().uuid(),
        cursor: z.string().uuid().optional(),
      })
      .strict()
      .parse(query);
    await this.connections.guardianAccess(this.db, r, b.childId);
    const where = {
      OR: [{ requesterId: b.childId }, { recipientId: b.childId }],
    };
    if (
      b.cursor &&
      !(await this.db.connection.findFirst({
        where: { id: b.cursor, ...where },
      }))
    )
      throw new NotFoundException();
    const rows = await this.db.connection.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 31,
      ...(b.cursor ? { cursor: { id: b.cursor }, skip: 1 } : {}),
    });
    return {
      items: await Promise.all(
        rows.slice(0, 30).map(async (row) => ({
          ...(await this.connections.view(this.db, row)),
          canGuardianApprove: (
            await this.connections.context(this.db, row)
          ).guardianNeeded.some((child) => child.id === b.childId),
        })),
      ),
      nextCursor: rows.length > 30 ? rows[29].id : null,
    };
  }
  @Post("guardian/connections/:id/review") async guardianReview(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    this.available();
    z.string().uuid().parse(id);
    const b = ConnectionReview.extend({ childId: z.string().uuid() }).parse(
      body,
    );
    return this.connections.guardianReview(
      r,
      id,
      b.childId,
      b.version,
      b.approve,
    );
  }
  @Get("clubs/:clubId/connections") async clubQueue(
    @Req() r: Authed,
    @Param("clubId") clubId: string,
    @Query() query: unknown,
  ) {
    this.available();
    z.string().uuid().parse(clubId);
    const b = z
      .object({ cursor: z.string().uuid().optional() })
      .strict()
      .parse(query);
    const club = await this.db.club.findFirst({
      where: { id: clubId, ownerId: r.user.id, status: "APPROVED" },
    });
    if (!club || !r.user.adultVerified || r.policy.age < 18)
      throw new NotFoundException();
    const where = {
      clubId,
      kind: "MENTORSHIP" as const,
      status: { in: ["PENDING", "ACCEPTED"] as ("PENDING" | "ACCEPTED")[] },
      requesterId: { not: r.user.id },
      recipientId: { not: r.user.id },
    };
    if (
      b.cursor &&
      !(await this.db.connection.findFirst({
        where: { id: b.cursor, ...where },
      }))
    )
      throw new NotFoundException();
    const rows = await this.db.connection.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 31,
      ...(b.cursor ? { cursor: { id: b.cursor }, skip: 1 } : {}),
    });
    const views = await Promise.all(
      rows.slice(0, 30).map((row) => this.connections.view(this.db, row)),
    );
    return {
      items: views.filter((view) => view.needs.clubReview),
      nextCursor: rows.length > 30 ? rows[29].id : null,
    };
  }
  @Post("clubs/:clubId/connections/:id/review") async clubReview(
    @Req() r: Authed,
    @Param("clubId") clubId: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    this.available();
    z.string().uuid().parse(clubId);
    z.string().uuid().parse(id);
    const b = ConnectionReview.parse(body);
    return this.connections.clubReview(r, id, b.version, b.approve, clubId);
  }
  @Get("admin/connections") async adminQueue(
    @Req() r: Authed,
    @Query() query: unknown,
  ) {
    this.available();
    const b = z
      .object({ cursor: z.string().uuid().optional() })
      .strict()
      .parse(query);
    const where = {
      kind: "MENTORSHIP" as const,
      status: { in: ["PENDING", "ACCEPTED"] as ("PENDING" | "ACCEPTED")[] },
      clubId: { not: null },
      requesterId: { not: r.user.id },
      recipientId: { not: r.user.id },
    };
    if (
      b.cursor &&
      !(await this.db.connection.findFirst({
        where: { id: b.cursor, ...where },
      }))
    )
      throw new NotFoundException();
    const rows = await this.db.connection.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 31,
      ...(b.cursor ? { cursor: { id: b.cursor }, skip: 1 } : {}),
    });
    return {
      items: (
        await Promise.all(
          rows.slice(0, 30).map((row) => this.connections.view(this.db, row)),
        )
      ).filter((view) => view.needs.clubReview),
      nextCursor: rows.length > 30 ? rows[29].id : null,
    };
  }
  @Post("admin/connections/:id/review") async adminReview(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    this.available();
    z.string().uuid().parse(id);
    const b = ConnectionReview.parse(body);
    return this.connections.clubReview(r, id, b.version, b.approve);
  }
}
