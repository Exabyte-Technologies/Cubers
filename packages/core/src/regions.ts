import { z } from "zod";
import { Region } from "./contracts";
export const CommunityDetection = z
  .object({
    region: Region,
    serverRegion: Region,
    source: z.enum(["ip", "development"]),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    provider: z.literal("FreeIPAPI"),
    attribution: z
      .object({
        label: z.literal("IP Geolocation by FreeIPAPI"),
        url: z.literal("https://freeipapi.com"),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const known = isCommunityCountry(value.country);
    if (
      value.source === "ip" &&
      (!known || value.region !== (value.country === "CN" ? "CN" : "INTL"))
    )
      ctx.addIssue({
        code: "custom",
        message: "Country and community must agree",
      });
    if (
      value.source === "development" &&
      (value.country !== undefined || value.region !== value.serverRegion)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Development fallback must identify its own server without a country",
      });
  });
export type CommunityDetection = z.infer<typeof CommunityDetection>;

// ISO country codes returned by the documented provider, plus its XK code.
const communityCountries = new Set(
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(
    " ",
  ),
);
export function isCommunityCountry(value: unknown): value is string {
  return typeof value === "string" && communityCountries.has(value);
}
