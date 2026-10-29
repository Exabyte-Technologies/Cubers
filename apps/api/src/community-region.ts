import {
  Injectable,
  Inject,
  Optional,
  ConflictException,
  ServiceUnavailableException,
} from "@nestjs/common";
import ipaddr from "ipaddr.js";
import { privateAddress } from "./network-security";
import type { CommunityDetection } from "@cubers/core";
import type { Config } from "./config";
import { CONFIG } from "./services";
import {
  FREEIP_COUNTRY,
  FreeIpCountry,
  type CountryLookup,
} from "./freeip-country";

/** Narrow public recovery/erasure access never permits normal account reads. */
export function regionalAccessExempt(method: string, path: string) {
  return (
    (method === "GET" &&
      (path === "/v1/health" ||
        path === "/v1/community-region" ||
        /^\/v1\/legal\/[a-z-]+$/.test(path))) ||
    (method === "POST" &&
      /^\/v1\/auth\/(verify|forgot|reset|resend|deletion-login|logout)$/.test(
        path,
      )) ||
    (method === "DELETE" && path === "/v1/me")
  );
}
@Injectable()
export class CommunityRegion {
  constructor(
    @Inject(CONFIG) private config: Config,
    @Optional()
    @Inject(FREEIP_COUNTRY)
    private lookup: CountryLookup = new FreeIpCountry(),
  ) {}
  async detect(address: string | undefined): Promise<CommunityDetection> {
    let country: string | undefined;
    if (this.config.NODE_ENV === "production") {
      try {
        const normalized = ipaddr.process(address || "").toString();
        if (privateAddress(normalized))
          throw new Error("Public connection required");
        country = await this.lookup.country(normalized);
      } catch {
        throw new ServiceUnavailableException(
          "Could not determine the community from this connection",
        );
      }
    }
    return {
      region: country ? (country === "CN" ? "CN" : "INTL") : this.config.REGION,
      serverRegion: this.config.REGION,
      source: country ? "ip" : "development",
      ...(country ? { country } : {}),
      provider: "FreeIPAPI",
      attribution: {
        label: "IP Geolocation by FreeIPAPI",
        url: "https://freeipapi.com",
      },
    };
  }
  async requireMatchingConnection(address: string | undefined) {
    const detected = await this.detect(address);
    if (detected.region !== this.config.REGION)
      throw new ConflictException({
        message:
          "Your connection belongs to another community. Refresh community detection before submitting again.",
        code: "COMMUNITY_CHANGED",
        region: detected.region,
      });
  }
}
