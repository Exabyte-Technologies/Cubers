import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { LookupFunction } from "node:net";
import { z } from "zod";
import { OperationalSignal, OperationalState } from "@cubers/core";
import { privateAddress } from "./network-security";

export const OperationalAlertEvent = z
  .object({
    event: z.enum(["cubers.operational.alert", "cubers.operational.recovery"]),
    region: z.enum(["INTL", "CN"]),
    signal: OperationalSignal,
    state: OperationalState,
    sampledAt: z.string().datetime(),
    count: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
  })
  .strict();
export const OperationalEnvelope = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    alert: OperationalAlertEvent,
  })
  .strict();
export type OperationalEnvelope = z.infer<typeof OperationalEnvelope>;
const File = z
  .object({
    version: z.literal(1),
    region: z.enum(["INTL", "CN"]),
    endpoint: z.string().max(500),
    keyId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    key: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
  })
  .strict();
export class OperationalWebhook {
  readonly endpoint: URL;
  readonly binding: string;
  private queueKey: Buffer;
  constructor(
    readonly region: "INTL" | "CN",
    readonly keyId: string,
    endpoint: string,
    private key: Buffer,
    hosts: string,
  ) {
    this.endpoint = operationalWebhookUrl(endpoint, hosts);
    if (key.length !== 32)
      throw Error("Operational webhook key must contain 32 bytes");
    this.queueKey = createHmac("sha256", key)
      .update("CubersOperationalOutbox1")
      .digest();
    this.binding = createHash("sha256")
      .update(
        JSON.stringify([
          region,
          this.endpoint.href,
          keyId,
          createHash("sha256").update(key).digest("hex"),
        ]),
      )
      .digest("hex");
  }
  mac(body: string) {
    return createHmac("sha256", this.queueKey).update(body).digest("hex");
  }
  headers(body: string, now = Date.now()) {
    const sentAt = new Date(now).toISOString();
    return {
      "x-cubers-event-id": OperationalEnvelope.parse(JSON.parse(body)).id,
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
      "x-cubers-key-id": this.keyId,
      "x-cubers-sent-at": sentAt,
      "x-cubers-signature":
        "sha256=" +
        createHmac("sha256", this.key)
          .update(`CubersOperationalAlerts1\n${this.keyId}\n${sentAt}\n${body}`)
          .digest("hex"),
    };
  }
  destroy() {
    this.key.fill(0);
    this.queueKey.fill(0);
  }
  toJSON() {
    return "[private operational webhook]";
  }
}
export function operationalWebhookUrl(value: string, hosts: string) {
  const url = new URL(value),
    allowed = hosts
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(
      url.hostname,
    ) ||
    !allowed.includes(url.hostname) ||
    !/^\/[A-Za-z0-9._~/-]*$/.test(url.pathname)
  )
    throw Error(
      "Use an approved exact HTTPS alert host, default port and plain path",
    );
  return url;
}
export async function loadOperationalWebhook(
  path: string,
  region: "INTL" | "CN",
  hosts: string,
) {
  try {
    if (resolve(path) !== path || (await realpath(path)) !== path)
      throw Error();
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const st = await file.stat();
      if (
        !st.isFile() ||
        st.nlink !== 1 ||
        ![0, process.getuid?.()].includes(st.uid) ||
        (st.mode & 0o177) !== 0 ||
        st.size > 8192
      )
        throw Error();
      const bytes = Buffer.alloc(8193);
      try {
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        if (bytesRead > 8192) throw Error();
        const value = File.parse(
          JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              bytes.subarray(0, bytesRead),
            ),
          ),
        );
        if (value.region !== region) throw Error();
        const key = Buffer.from(value.key, "base64");
        if (key.toString("base64") !== value.key) throw Error();
        return new OperationalWebhook(
          region,
          value.keyId,
          value.endpoint,
          key,
          hosts,
        );
      } finally {
        bytes.fill(0);
      }
    } finally {
      await file.close();
    }
  } catch {
    throw Error(
      "Private regional operational webhook configuration is unavailable",
    );
  }
}
let resolving = 0;
export async function resolveOperationalWebhook(
  url: URL,
  signal: AbortSignal,
  resolver: typeof lookup = lookup,
) {
  signal.throwIfAborted();
  if (resolving >= 2) throw Error("Alert resolver capacity reached");
  resolving++;
  const pending = Promise.resolve()
    .then(() => resolver(url.hostname, { all: true }))
    .finally(() => resolving--);
  let stop!: () => void;
  try {
    const addresses = await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        stop = () => reject(Error("Alert resolution cancelled"));
        signal.addEventListener("abort", stop, { once: true });
        if (signal.aborted) stop();
      }),
    ]);
    if (
      !addresses.length ||
      addresses.some(
        (a) => ![4, 6].includes(a.family) || privateAddress(a.address),
      )
    )
      throw Error(
        "Alert destination must resolve only to public unicast addresses",
      );
    signal.throwIfAborted();
    return addresses.find((a) => a.family === 4) || addresses[0];
  } finally {
    signal.removeEventListener("abort", stop);
  }
}
/** Called only with the just-validated address. No proxy, redirect or automatic retry. */
export async function sendOperationalWebhook(
  url: URL,
  address: { address: string; family: number },
  headers: Record<string, string>,
  body: string,
  signal: AbortSignal,
  ca?: string,
) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const lookup: LookupFunction = (host, options, done) => {
      if (host !== url.hostname)
        return done(Error("Unexpected operational destination"), "", 0);
      if (options.all) done(null, [address]);
      else done(null, address.address, address.family);
    };
    let completed = false,
      failed = false;
    const req = request(
      url,
      {
        method: "POST",
        headers,
        lookup,
        signal,
        agent: false,
        maxHeaderSize: 8192,
        ...(ca ? { ca } : {}),
      },
      (res) => {
        let bytes = 0;
        if (
          !res.statusCode ||
          res.statusCode < 200 ||
          res.statusCode >= 300 ||
          Number(res.headers["content-length"] || 0) > 4096
        ) {
          failed = true;
          req.destroy();
          return;
        }
        res.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 4096) {
            failed = true;
            req.destroy();
          }
        });
        res.once("error", () => {
          failed = true;
          req.destroy();
        });
        res.once("end", () => {
          completed = true;
        });
      },
    );
    req.once("error", () => {
      failed = true;
    });
    req.once("close", () => {
      if (!failed && completed && !signal.aborted) resolve();
      else reject(Error("Operational delivery failed"));
    });
    req.end(body);
  });
}
