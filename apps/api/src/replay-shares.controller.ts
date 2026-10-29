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
import { ReplayShares } from "./replay-shares";
import type { Authed } from "./security";
@Controller("v1/me/replay-shares")
export class ReplaySharesController {
  constructor(@Inject(ReplayShares) private shares: ReplayShares) {}
  @Get() @Header("Cache-Control", "private, no-store") list(
    @Req() r: Authed,
    @Query() q: unknown,
  ) {
    return this.shares.list(r, "owner", q);
  }
  @Post() prepare(@Req() r: Authed, @Body() b: unknown) {
    return this.shares.prepare(r, b);
  }
  @Post(":id/preview") preview(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.shares.preview(r, id, "owner", b);
  }
  @Post(":id/publish") publish(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.shares.publish(r, id, b);
  }
  @Post(":id/cancel") cancel(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.shares.cancel(r, id, b);
  }
}
@Controller("v1/guardian/replay-shares")
export class GuardianReplaySharesController {
  constructor(@Inject(ReplayShares) private shares: ReplayShares) {}
  @Get() list(@Req() r: Authed, @Query() q: unknown) {
    return this.shares.list(r, "guardian", q);
  }
  @Post(":id/preview") preview(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.shares.preview(r, id, "guardian", b);
  }
  @Post(":id/review") review(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.shares.review(r, id, "guardian", b);
  }
}
@Controller("v1/admin/replay-shares")
export class AdminReplaySharesController {
  constructor(@Inject(ReplayShares) private shares: ReplayShares) {}
  @Get() list(@Req() r: Authed, @Query() q: unknown) {
    return this.shares.list(r, "staff", q);
  }
  @Post(":id/preview") preview(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.shares.preview(r, id, "staff", b);
  }
  @Post(":id/review") review(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.shares.review(r, id, "staff", b);
  }
}
@Controller("v1/shared-replays")
export class SharedReplaysController {
  constructor(@Inject(ReplayShares) private shares: ReplayShares) {}
  @Post("open") @Header("Cache-Control", "private, no-store") open(
    @Req() r: Authed,
    @Body() b: unknown,
  ) {
    return this.shares.open(r, b);
  }
}
