import { Controller, Get, Inject, Req, HttpException } from "@nestjs/common";
import { communityWrite } from "./community-authority";
import { Db, Infrastructure } from "./services";
import type { Authed } from "./security";
import { Operations } from "./operations";
@Controller("v1/admin")
export class OperationsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(Operations) private operations: Operations,
  ) {}
  private authorize(r: Authed) {
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "staff",
      [],
      async () => undefined,
    );
  }
  @Get("operations") async status(@Req() r: Authed) {
    await this.authorize(r);
    if (!(await this.infra.limit(`operations:${r.user.id}`, 12, 60)))
      throw new HttpException("Refresh service health less often", 429);
    const snapshot = await this.operations.snapshot();
    await this.authorize(r);
    return snapshot;
  }
}
