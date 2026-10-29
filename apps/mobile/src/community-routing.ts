import { CommunityDetection, type Region } from "@cubers/core";
import { withTimeout } from "./timeout";
export type CommunityEndpoints = {
  discovery?: string;
  CN?: string;
  INTL?: string;
};
export function communityEndpoint(
  endpoints: CommunityEndpoints,
  region: Region,
  development: boolean,
) {
  const value =
    endpoints[region] || (development ? "http://localhost:3000" : "");
  if (!value) throw new Error("Regional service URL is not configured");
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "") ||
    (!development && url.protocol !== "https:") ||
    !["https:", "http:"].includes(url.protocol)
  )
    throw new Error("Invalid regional service URL");
  return url.origin;
}
export async function detectCommunity(
  endpoints: CommunityEndpoints,
  development: boolean,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15000,
) {
  const discovery =
    endpoints.discovery ||
    (development
      ? endpoints.INTL || endpoints.CN || "http://localhost:3000"
      : "");
  if (!discovery)
    throw new Error("Community detection service is not configured");
  const discoveryOrigin = communityEndpoint(
    { INTL: discovery },
    "INTL",
    development,
  );
  const read = async (origin: string) =>
    withTimeout(async (signal) => {
      const response = await fetcher(origin + "/v1/community-region", {
        signal,
        credentials: "omit",
        redirect: "error",
        headers: { Accept: "application/json" },
      });
      if (!response.ok)
        throw new Error("Community detection is temporarily unavailable");
      const result = CommunityDetection.parse(await response.json());
      if (!development && result.source !== "ip")
        throw new Error("Connection could not be located");
      return result;
    }, timeoutMs);
  const detected = await read(discoveryOrigin);
  const selectedOrigin = communityEndpoint(
    endpoints,
    detected.region,
    development,
  );
  // Follow only build-configured regional origins, never a URL returned by a
  // remote discovery response. No credentials or account tokens are sent here.
  const confirmed = await read(selectedOrigin);
  if (
    confirmed.serverRegion !== detected.region ||
    confirmed.region !== detected.region
  )
    throw new Error("Community changed during detection. Try again.");
  return confirmed;
}
