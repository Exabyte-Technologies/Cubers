import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { createHash } from "node:crypto";
import ipaddr from "ipaddr.js";
import { isCommunityCountry } from "@cubers/core";
import { privateAddress } from "./network-security";

export const FREEIP_COUNTRY = "FREEIP_COUNTRY";
export interface CountryLookup {
  country(address: string): Promise<string>;
}
export type CountryTransport = (address: string) => Promise<unknown>;

/** Fixed vendor origin, public DNS pinning, no redirects, no client headers. */
export async function freeIpResponse(address: string): Promise<unknown> {
  const host = "free.freeipapi.com",
    signal = AbortSignal.timeout(3000);
  const addresses = await Promise.race([
    lookup(host, { all: true, verbatim: true }),
    new Promise<never>((_, reject) =>
      signal.addEventListener(
        "abort",
        () => reject(new Error("Country lookup timed out")),
        { once: true },
      ),
    ),
  ]);
  signal.throwIfAborted();
  if (!addresses.length || addresses.some((a) => privateAddress(a.address)))
    throw new Error("Invalid country service address");
  const pinned = addresses[0];
  return new Promise((resolve, reject) => {
    const req = request(
      new URL(`https://${host}/api/v1/json/${encodeURIComponent(address)}`),
      {
        method: "GET",
        agent: false,
        signal,
        maxHeaderSize: 8192,
        headers: { Accept: "application/json", "Accept-Encoding": "identity" },
        lookup: ((_name: string, options: any, callback: any) =>
          options?.all
            ? callback(null, [pinned])
            : callback(null, pinned.address, pinned.family)) as any,
      },
      (res) => {
        if (
          res.statusCode !== 200 ||
          !/^application\/json(?:;|$)/i.test(
            res.headers["content-type"] || "",
          ) ||
          Number(res.headers["content-length"] || 0) > 16384
        ) {
          req.destroy(new Error("Country service unavailable"));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("error", reject);
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 16384)
            req.destroy(new Error("Country response too large"));
          else chunks.push(chunk);
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("Invalid country response"));
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/** Bounded, country-only five-minute cache. Failure never grants a region. */
export class FreeIpCountry implements CountryLookup {
  private cache = new Map<string, { until: number; country?: string }>();
  private pending = new Map<string, Promise<string>>();
  private requests: number[] = [];
  constructor(
    private transport: CountryTransport = freeIpResponse,
    private clock: () => number = Date.now,
  ) {}
  async country(address: string): Promise<string> {
    const normalized = ipaddr.process(address).toString();
    if (privateAddress(normalized))
      throw new Error("Public connection required");
    const key = createHash("sha256").update(normalized).digest("hex"),
      now = this.clock(),
      cached = this.cache.get(key);
    if (cached && cached.until > now) {
      if (cached.country) return cached.country;
      throw new Error("Country service unavailable");
    }
    if (this.pending.has(key)) return this.pending.get(key)!;
    this.requests = this.requests.filter((at) => at > now - 60000);
    if (
      this.pending.size >= 32 ||
      this.requests.length >= 60 ||
      this.requests.filter((at) => at > now - 10000).length >= 10
    )
      throw new Error("Country lookup capacity unavailable");
    this.requests.push(now);
    const pending = (async () => {
      try {
        const response = (await this.transport(normalized)) as any;
        if (
          !response ||
          typeof response !== "object" ||
          Array.isArray(response) ||
          !isCommunityCountry(response.countryCode) ||
          typeof response.ipAddress !== "string" ||
          ipaddr.process(response.ipAddress).toString() !== normalized ||
          response.ipVersion !==
            (ipaddr.parse(normalized).kind() === "ipv4" ? 4 : 6)
        )
          throw new Error("Invalid country response");
        this.remember(key, {
          country: response.countryCode,
          until: this.clock() + 300000,
        });
        return response.countryCode as string;
      } catch {
        this.remember(key, { until: this.clock() + 5000 });
        throw new Error("Country service unavailable");
      }
    })();
    this.pending.set(key, pending);
    try {
      return await pending;
    } finally {
      this.pending.delete(key);
    }
  }
  private remember(key: string, value: { until: number; country?: string }) {
    if (this.cache.size >= 10000)
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, value);
  }
}
