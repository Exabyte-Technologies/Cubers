import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Body,
  Query,
  Inject,
  Header,
} from "@nestjs/common";
import { z } from "zod";
import { AchievementCards } from "./achievement-cards";
import type { Authed } from "./security";
@Controller("v1/me/achievement-cards")
export class AchievementCardsController {
  constructor(@Inject(AchievementCards) private cards: AchievementCards) {}
  @Get() @Header("Cache-Control", "private, no-store") catalogue(
    @Req() r: Authed,
  ) {
    return this.cards.catalogue(r);
  }
  @Get("requests") @Header("Cache-Control", "private, no-store") list(
    @Req() r: Authed,
    @Query() q: unknown,
  ) {
    return this.cards.list(r, "owner", q);
  }
  @Post() prepare(@Req() r: Authed, @Body() b: unknown) {
    return this.cards.prepare(r, b);
  }
  @Post(":id/preview") preview(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    z.object({}).strict().parse(b);
    return this.cards.image(r, id, "owner");
  }
  @Post(":id/export") export(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.cards.image(r, id, "owner", b);
  }
  @Post(":id/cancel") cancel(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.cards.cancel(r, id, b);
  }
}
@Controller("v1/guardian/achievement-cards")
export class GuardianCardsController {
  constructor(@Inject(AchievementCards) private cards: AchievementCards) {}
  @Get() list(@Req() r: Authed, @Query() q: unknown) {
    return this.cards.list(r, "guardian", q);
  }
  @Post(":id/preview") preview(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    z.object({}).strict().parse(b);
    return this.cards.image(r, id, "guardian");
  }
  @Post(":id/review") review(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.cards.review(r, id, "guardian", b);
  }
}
@Controller("v1/admin/achievement-cards")
export class AdminCardsController {
  constructor(@Inject(AchievementCards) private cards: AchievementCards) {}
  @Get() list(@Req() r: Authed, @Query() q: unknown) {
    return this.cards.list(r, "staff", q);
  }
  @Get(":id") detail(@Req() r: Authed, @Param("id") id: string) {
    return this.cards.detail(r, id);
  }
  @Post(":id/preview") preview(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    z.object({}).strict().parse(b);
    return this.cards.image(r, id, "staff");
  }
  @Post(":id/review") review(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.cards.review(r, id, "staff", b);
  }
}
