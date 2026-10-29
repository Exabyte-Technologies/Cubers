import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { smartDeviceCatalogue, type SmartModel } from "@cubers/core";
/** Hardware activation requires a reviewed client/server release, never an
 * environment flag, database allowlist or test report alone. */
@Injectable()
export class SmartPlayAccess {
  room(puzzle: string) {
    if (puzzle !== "3x3")
      throw new BadRequestException("These smart models support 3x3 only");
    if (
      !smartDeviceCatalogue().some(
        (row) =>
          row.enabled &&
          row.physicallyTested &&
          row.playEnabled &&
          row.playPlatforms.length,
      )
    )
      throw new BadRequestException(
        "Smart play hardware acceptance is pending",
      );
  }
  require(model: SmartModel, platform: "ios" | "android") {
    const row = smartDeviceCatalogue().find((row) => row.id === model);
    if (
      !row?.enabled ||
      !row.physicallyTested ||
      !row.playEnabled ||
      !row.playPlatforms.includes(platform)
    )
      throw new ForbiddenException(
        "Smart play hardware and platform acceptance is pending",
      );
  }
}
