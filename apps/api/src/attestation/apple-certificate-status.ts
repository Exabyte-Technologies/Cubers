import { createHash, X509Certificate } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { privateAddress } from "../network-security";
import { certificateExtensions } from "./apple";
import {
  AttestationError,
  derItems,
  derOnly,
  requireIntegrity,
} from "./binary";
import {
  OcspVerifier,
  ocspRequest,
  ocspResponseLimit,
  type OcspStatus,
} from "./ocsp";

const fingerprint = (c: X509Certificate) =>
  createHash("sha256").update(c.raw).digest("hex");
const cacheKey = (c: X509Certificate, issuer: X509Certificate) =>
  fingerprint(c) + ":" + fingerprint(issuer);
const receiptPurpose = "2a864886f763640c0f";
const cacheLease = 300000;
export const appleCertificateStatusVersion = "CubersAppleCertificateStatus1";

/** Canonical ordered receipt chain. Incoming material never supplies an anchor. */
export function receiptCertificatePath(
  signer: X509Certificate,
  pool: X509Certificate[],
  root: X509Certificate,
) {
  requireIntegrity(
    !signer.ca &&
      certificateExtensions(signer)
        .get(receiptPurpose)
        ?.equals(Buffer.from("0500", "hex")) &&
      pool.length <= 4,
    "certificate-status-chain",
  );
  const available = [
      ...new Map([...pool, root].map((c) => [fingerprint(c), c])).values(),
    ],
    path = [signer];
  while (!path.at(-1)!.raw.equals(root.raw)) {
    requireIntegrity(path.length < 4, "certificate-status-chain");
    const leaf = path.at(-1)!,
      candidates = available.filter(
        (c) =>
          c.ca &&
          !path.some((p) => p.raw.equals(c.raw)) &&
          leaf.checkIssued(c) &&
          leaf.verify(c.publicKey),
      );
    requireIntegrity(candidates.length === 1, "certificate-status-chain");
    path.push(candidates[0]);
  }
  requireIntegrity(
    path.reduce((size, c) => size + c.raw.length, 0) <= 8192,
    "certificate-status-chain",
  );
  return path;
}
export function appleOcspEndpoint(value: string) {
  const url = new URL(value);
  requireIntegrity(
    ["http:", "https:"].includes(url.protocol) &&
      url.hostname === "ocsp.apple.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/ocsp[0-9]{2}-[a-z0-9]{1,80}$/.test(url.pathname) &&
      url.href === value,
    "certificate-status-endpoint",
  );
  return url;
}
export function appleOcspUrl(certificate: X509Certificate) {
  const aia = certificateExtensions(certificate).get("2b06010505070101");
  requireIntegrity(aia, "certificate-status-endpoint");
  const locations: string[] = [];
  for (const description of derItems(derOnly(aia, 0x30))) {
    requireIntegrity(description.tag === 0x30, "certificate-status-endpoint");
    const fields = derItems(description.value);
    requireIntegrity(
      fields.length === 2 && fields[0].tag === 6,
      "certificate-status-endpoint",
    );
    if (fields[0].value.toString("hex") !== "2b06010505073001") continue;
    const raw = fields[1].value.toString("ascii");
    requireIntegrity(
      fields[1].tag === 0x86 &&
        Buffer.from(raw, "ascii").equals(fields[1].value),
      "certificate-status-endpoint",
    );
    locations.push(raw);
  }
  requireIntegrity(locations.length === 1, "certificate-status-endpoint");
  return appleOcspEndpoint(locations[0]);
}
let resolving = 0;
export async function resolveAppleOcsp(
  url: URL,
  signal: AbortSignal,
  resolver: typeof lookup = lookup,
) {
  signal.throwIfAborted();
  appleOcspEndpoint(url.href);
  requireIntegrity(
    url.hostname === "ocsp.apple.com" && resolving < 2,
    "certificate-status-busy",
  );
  resolving++;
  const pending = Promise.resolve()
    .then(() => resolver(url.hostname, { all: true }))
    .finally(() => resolving--);
  let cancel!: () => void;
  try {
    const addresses = await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        cancel = () =>
          reject(new AttestationError("certificate-status-cancelled"));
        signal.addEventListener("abort", cancel, { once: true });
        if (signal.aborted) cancel();
      }),
    ]);
    requireIntegrity(
      addresses.length > 0 &&
        addresses.length <= 32 &&
        addresses.every(
          (a) => [4, 6].includes(a.family) && !privateAddress(a.address),
        ),
      "certificate-status-address",
    );
    signal.throwIfAborted();
    return addresses.find((a) => a.family === 4) || addresses[0];
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
/** HTTP is permitted only when explicitly advertised by Apple's signed cert.
 * Responses are authenticated independently; TLS is never disabled for HTTPS. */
export async function fetchAppleOcsp(
  url: URL,
  body: Buffer,
  signal: AbortSignal,
) {
  const address = await resolveAppleOcsp(url, signal);
  signal.throwIfAborted();
  return new Promise<Buffer>((resolve, reject) => {
    const pinned: LookupFunction = (host, options, done) => {
      if (host !== "ocsp.apple.com")
        return done(Error("Unexpected certificate-status host"), "", 0);
      if (options.all) done(null, [address]);
      else done(null, address.address, address.family);
    };
    let completed = false;
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "POST",
        agent: false,
        lookup: pinned,
        signal,
        headers: {
          "Content-Type": "application/ocsp-request",
          Accept: "application/ocsp-response",
          "Accept-Encoding": "identity",
          "Content-Length": body.length,
          "User-Agent": "Cubers-Certificate-Status/1",
        },
      },
      (res) => {
        const type = res.headers["content-type"]
            ?.split(";")[0]
            .trim()
            .toLowerCase(),
          length = res.headers["content-length"],
          encoding = res.headers["content-encoding"];
        if (
          res.statusCode !== 200 ||
          type !== "application/ocsp-response" ||
          (encoding && encoding !== "identity") ||
          (length &&
            (!/^[0-9]+$/.test(length) || Number(length) > ocspResponseLimit))
        ) {
          res.destroy();
          req.destroy(new AttestationError("certificate-status-response"));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > ocspResponseLimit) {
            res.destroy();
            req.destroy(new AttestationError("certificate-status-format"));
          } else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          if (!completed) {
            completed = true;
            resolve(Buffer.concat(chunks));
          }
        });
      },
    );
    req.on("error", (e) => {
      if (!completed) {
        completed = true;
        reject(e);
      }
    });
    req.setTimeout(3000, () =>
      req.destroy(new AttestationError("certificate-status-timeout")),
    );
    req.end(body);
  });
}
type Entry = { status: OcspStatus; checkedAt: number; until: number };
export class AppleCertificateStatus {
  private readonly verifier: OcspVerifier;
  private readonly cache = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<Entry>>();
  private readonly stopped = new AbortController();
  constructor(
    private readonly root: X509Certificate,
    opensslPath = "/usr/bin/openssl",
    private readonly transport = fetchAppleOcsp,
    private readonly clock: () => number = Date.now,
  ) {
    this.verifier = new OcspVerifier(root, opensslPath, clock);
  }
  private path(encoded: readonly string[]) {
    requireIntegrity(
      Array.isArray(encoded) && encoded.length >= 2 && encoded.length <= 4,
      "certificate-status-chain",
    );
    const certificates = encoded.map((value) => {
      requireIntegrity(
        typeof value === "string" && value.length <= 12000,
        "certificate-status-chain",
      );
      const bytes = Buffer.from(value, "base64"),
        c = new X509Certificate(bytes);
      requireIntegrity(
        bytes.toString("base64") === value && c.raw.equals(bytes),
        "certificate-status-chain",
      );
      return c;
    });
    const path = receiptCertificatePath(
      certificates[0],
      certificates.slice(1),
      this.root,
    );
    requireIntegrity(
      path.length === certificates.length &&
        path.every((c, i) => c.raw.equals(certificates[i].raw)),
      "certificate-status-chain",
    );
    return path;
  }
  private live() {
    requireIntegrity(
      !this.stopped.signal.aborted,
      "certificate-status-cancelled",
    );
  }
  private current(entry: Entry | undefined, now: number) {
    return (
      !!entry &&
      entry.checkedAt <= now + 5000 &&
      entry.until > now &&
      entry.status.validUntil > now
    );
  }
  private get(
    certificate: X509Certificate,
    issuer: X509Certificate,
    chain: X509Certificate[],
  ) {
    this.live();
    const key = cacheKey(certificate, issuer),
      now = this.clock(),
      cached = this.cache.get(key);
    if (this.current(cached, now)) return Promise.resolve(cached!);
    if (this.pending.has(key)) return this.pending.get(key)!;
    for (const [k, value] of this.cache)
      if (!this.current(value, now)) this.cache.delete(k);
    requireIntegrity(
      this.pending.size < 2 && this.cache.size + this.pending.size < 128,
      "certificate-status-busy",
    );
    const signal = AbortSignal.any([
      this.stopped.signal,
      AbortSignal.timeout(5000),
    ]);
    let cancel!: () => void;
    const interruption = new Promise<never>((_, reject) => {
      cancel = () =>
        reject(
          new AttestationError(
            this.stopped.signal.aborted
              ? "certificate-status-cancelled"
              : "certificate-status-timeout",
          ),
        );
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
    });
    const job = Promise.resolve()
      .then(async () => {
        const response = await this.transport(
          appleOcspUrl(certificate),
          ocspRequest(certificate, issuer),
          signal,
        );
        this.live();
        signal.throwIfAborted();
        const status = await this.verifier.verify(
          certificate,
          issuer,
          chain,
          response,
          signal,
        );
        this.live();
        signal.throwIfAborted();
        const checkedAt = this.clock(),
          value = {
            status,
            checkedAt,
            until: Math.min(status.validUntil, checkedAt + cacheLease),
          };
        this.cache.set(key, value);
        return value;
      })
      .finally(() => {
        signal.removeEventListener("abort", cancel);
        this.pending.delete(key);
      });
    const bounded = Promise.race([job, interruption]);
    this.pending.set(key, bounded);
    return bounded;
  }
  async ensure(encoded: readonly string[], signal?: AbortSignal) {
    this.live();
    requireIntegrity(!signal?.aborted, "certificate-status-cancelled");
    requireIntegrity(Array.isArray(encoded), "certificate-status-chain");
    encoded = Object.freeze([...encoded]);
    const path = this.path(encoded),
      work = (async () => {
        for (let i = 0; i < path.length - 1; i++) {
          requireIntegrity(!signal?.aborted, "certificate-status-cancelled");
          await this.get(path[i], path[i + 1], path.slice(i + 1));
        }
      })();
    // Public lookups can be shared across accounts. One cancelled consumer
    // cannot cancel another consumer's status lookup or publish a late grant.
    let cancel!: () => void;
    try {
      await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          cancel = () =>
            reject(new AttestationError("certificate-status-cancelled"));
          signal?.addEventListener("abort", cancel, { once: true });
          if (signal?.aborted) cancel();
        }),
      ]);
      requireIntegrity(!signal?.aborted, "certificate-status-cancelled");
      return this.until(encoded);
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }
  until(encoded: readonly string[]) {
    this.live();
    const path = this.path(encoded),
      now = this.clock(),
      entries = path
        .slice(0, -1)
        .map((c, i) => this.cache.get(cacheKey(c, path[i + 1])));
    requireIntegrity(
      entries.every((e) => this.current(e, now) && e!.status.status === "good"),
      "certificate-status-untrusted",
    );
    const until = Math.min(
      ...entries.map((e) => e!.until),
      ...path.map((c) => Date.parse(c.validTo)),
    );
    requireIntegrity(
      until > now && path.every((c) => Date.parse(c.validFrom) <= now),
      "certificate-status-time",
    );
    return until;
  }
  stop() {
    this.stopped.abort();
    this.cache.clear();
  }
}
