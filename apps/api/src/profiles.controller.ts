import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Body,
  Inject,
  NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { Profiles } from "./profiles";
import { Db, Infrastructure } from "./services";
import type { Authed } from "./security";
import { ProfileSettings } from "@cubers/core";
function reviewView<T extends { bio: string; profileSettings: unknown }>(
  row: T,
) {
  const settings = ProfileSettings.parse(row.profileSettings);
  const about = settings.visibility.about !== "PRIVATE";
  return {
    ...row,
    bio: about ? row.bio : null,
    bioSubmitted: about,
    profileSettings: {
      ...settings,
      favorites: about ? settings.favorites : [],
      skills: about ? settings.skills : [],
      selectedAchievements:
        settings.visibility.achievements !== "PRIVATE"
          ? settings.selectedAchievements
          : [],
    },
  };
}
const Page = z.object({ cursor: z.string().optional() }).strict();
@Controller("v1")
export class ProfilesController {
  constructor(
    @Inject(Profiles) private profiles: Profiles,
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
  ) {}
  @Get("me/profile") own(@Req() r: Authed) {
    return this.profiles.own(r);
  }
  @Post("me/profile") save(@Req() r: Authed, @Body() body: unknown) {
    return this.profiles.save(r, body);
  }
  @Get("profiles/:id") view(@Req() r: Authed, @Param("id") id: string) {
    return this.profiles.view(r, id);
  }
  @Get("profiles/:id/friends") async friends(
    @Req() r: Authed,
    @Param("id") id: string,
    @Query() query: unknown,
  ) {
    return this.profiles.connectionsPage(
      r,
      await this.profiles.subject(r, id),
      Page.parse(query).cursor,
    );
  }
  @Get("profiles/:id/clubs") async clubs(
    @Req() r: Authed,
    @Param("id") id: string,
    @Query() query: unknown,
  ) {
    return this.profiles.clubsPage(
      r,
      await this.profiles.subject(r, id),
      Page.parse(query).cursor,
    );
  }
  @Get("admin/profiles") async queue(@Query() query: unknown) {
    const b = z
      .object({ cursor: z.string().uuid().optional() })
      .strict()
      .parse(query);
    const rows = await this.db.user.findMany({
      where: {
        deletedAt: null,
        region: this.infra.config.REGION,
        privateProfile: false,
        profileStatus: "PENDING",
        ...(b.cursor ? { id: { lt: b.cursor.toLowerCase() } } : {}),
      },
      select: {
        id: true,
        displayName: true,
        bio: true,
        profileSettings: true,
        profileRevision: true,
        profileStatus: true,
      },
      orderBy: { id: "desc" },
      take: 31,
    });
    return {
      items: rows.slice(0, 30).map(reviewView),
      nextCursor: rows.length > 30 ? rows[29].id : null,
    };
  }
  @Get("admin/profiles/:id") async inspect(@Param("id") id: string) {
    const user = await this.db.user.findFirst({
      where: {
        id: z.string().uuid().parse(id).toLowerCase(),
        region: this.infra.config.REGION,
        deletedAt: null,
        privateProfile: false,
        profileStatus: { in: ["PENDING", "APPROVED", "REJECTED"] },
      },
      select: {
        id: true,
        displayName: true,
        bio: true,
        profileSettings: true,
        profileRevision: true,
        profileStatus: true,
      },
    });
    if (!user) throw new NotFoundException("Shared profile unavailable");
    return reviewView(user);
  }
  @Post("admin/profiles/:id/review") review(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.profiles.review(r, id, body);
  }
}
