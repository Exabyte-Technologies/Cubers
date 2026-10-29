import {
  Controller,
  Get,
  Post,
  Req,
  Param,
  Body,
  Query,
  Inject,
} from "@nestjs/common";
import { Competitions } from "./competitions";
import type { Authed } from "./security";
@Controller("v1/competitions")
export class CompetitionsController {
  constructor(@Inject(Competitions) private service: Competitions) {}
  @Get() list(@Req() r: Authed, @Query() q: unknown) {
    return this.service.list(r, q);
  }
  @Get(":id") detail(@Req() r: Authed, @Param("id") id: string) {
    return this.service.detail(r, id.toLowerCase());
  }
  @Get(":id/board") board(
    @Req() r: Authed,
    @Param("id") id: string,
    @Query() q: unknown,
  ) {
    return this.service.board(r, id.toLowerCase(), q);
  }
  @Post(":id/register") register(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.register(r, id.toLowerCase(), b);
  }
  @Post(":id/withdraw") withdraw(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.withdraw(r, id.toLowerCase(), b);
  }
  @Post(":id/rounds/:roundId/attempts") enter(
    @Req() r: Authed,
    @Param("id") id: string,
    @Param("roundId") roundId: string,
    @Body() b: unknown,
  ) {
    return this.service.enter(r, id.toLowerCase(), roundId.toLowerCase(), b);
  }
  @Post(":id/share") share(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.share(r, id.toLowerCase(), b);
  }
  @Post("publications/:id/cancel") cancel(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.reviewPublication(
      r,
      id.toLowerCase(),
      "owner",
      b,
      true,
    );
  }
}
@Controller("v1/admin/competitions")
export class AdminCompetitionsController {
  constructor(@Inject(Competitions) private service: Competitions) {}
  @Get() list(@Req() r: Authed, @Query() q: unknown) {
    return this.service.list(r, q, true);
  }
  @Get(":id") detail(@Req() r: Authed, @Param("id") id: string) {
    return this.service.detail(r, id.toLowerCase(), true);
  }
  @Post() create(@Req() r: Authed, @Body() b: unknown) {
    return this.service.create(r, b);
  }
  @Post(":id/publish") publish(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.publish(r, id.toLowerCase(), b);
  }
  @Post(":id/cancel") cancel(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.cancel(r, id.toLowerCase(), b);
  }
}
@Controller("v1/admin/competition-publications")
export class AdminCompetitionPublicationsController {
  constructor(@Inject(Competitions) private service: Competitions) {}
  @Get() list(@Req() r: Authed, @Query() q: unknown) {
    return this.service.publicationList(r, "staff", q);
  }
  @Post(":id/review") review(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.reviewPublication(r, id.toLowerCase(), "staff", b);
  }
  @Post(":id/cancel") cancel(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.reviewPublication(
      r,
      id.toLowerCase(),
      "staff",
      b,
      true,
    );
  }
}
@Controller("v1/guardian/competition-publications")
export class GuardianCompetitionPublicationsController {
  constructor(@Inject(Competitions) private service: Competitions) {}
  @Get() list(@Req() r: Authed, @Query() q: unknown) {
    return this.service.publicationList(r, "guardian", q);
  }
  @Post(":id/review") review(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.reviewPublication(r, id.toLowerCase(), "guardian", b);
  }
  @Post(":id/cancel") cancel(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.reviewPublication(
      r,
      id.toLowerCase(),
      "guardian",
      b,
      true,
    );
  }
}
