import {
  Controller,
  Get,
  Post,
  Delete,
  Inject,
  Req,
  Body,
  Param,
} from "@nestjs/common";
import type { Authed } from "./security";
import { AppAttestations } from "./app-attestation";
@Controller("v1/me/app-attestation")
export class AppAttestationController {
  constructor(@Inject(AppAttestations) private attestations: AppAttestations) {}
  @Get() list(@Req() r: Authed) {
    return this.attestations.list(r);
  }
  @Post("challenges") challenge(@Req() r: Authed, @Body() b: unknown) {
    return this.attestations.challenge(r, b);
  }
  @Post("verify") verify(@Req() r: Authed, @Body() b: unknown) {
    return this.attestations.verify(r, b);
  }
  @Post("keys/:id/refresh") refreshReceipt(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.attestations.refreshReceipt(r, id, b);
  }
  @Post("keys/:id/receipt-schedule") receiptSchedule(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.attestations.receiptSchedule(r, id, b);
  }
  @Delete("keys/:id") revoke(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.attestations.revoke(r, id, b);
  }
  @Delete("play") revokePlay(@Req() r: Authed) {
    return this.attestations.revokePlay(r);
  }
}
