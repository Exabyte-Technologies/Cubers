import { createHash, createPublicKey, type KeyObject } from "node:crypto";
import { AttestationError, base64, requireIntegrity } from "./binary";
import type { AppleReceiptVerifier, AppleReceiptPolicy } from "./apple-receipt";
import type { AppleReceiptCredential } from "./apple-credentials";
type Receipt = Awaited<ReturnType<AppleReceiptVerifier["verify"]>>;
export type StoredAppleReceipt = {
  receiptBase64: string;
  receipt: Receipt;
  publicKeyPem: string;
};
export type AppleReceiptExchangeResult =
  | { kind: "deferred"; retryAt: number }
  | { kind: "refreshed"; receiptBase64: string; receipt: Receipt };
const endpoints = {
  development:
    "https://data-development.appattest.apple.com/v1/attestationData",
  production: "https://data.appattest.apple.com/v1/attestationData",
} as const;
const hash = (v: Buffer) => createHash("sha256").update(v).digest("hex");
/** An exchange does not grant account or game authority. The consumer must
 * recheck the current owner, consent, key, policy and original receipt before
 * atomically replacing its encrypted receipt. Nothing is persisted here. */
export class AppleReceiptExchange {
  private active = 0;
  private stopped = new AbortController();
  private readonly policy: Readonly<AppleReceiptPolicy>;
  constructor(
    policy: AppleReceiptPolicy,
    private readonly credential: AppleReceiptCredential,
    private readonly verifier: Pick<AppleReceiptVerifier, "verify">,
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => number = Date.now,
  ) {
    requireIntegrity(
      /^[A-Z0-9]{10}\.[A-Za-z0-9.-]{3,200}$/.test(policy.appId) &&
        policy.appId.split(".")[0] === credential.teamId &&
        Object.hasOwn(endpoints, policy.environment),
      "policy",
    );
    this.policy = Object.freeze({ ...policy });
  }
  async refresh(
    stored: StoredAppleReceipt,
    signal?: AbortSignal,
  ): Promise<AppleReceiptExchangeResult> {
    this.live(signal);
    requireIntegrity(this.active < 2, "receipt-service-busy");
    // Copy the signed values before awaiting transport, so caller mutation
    // cannot move the refresh window, key or comparison receipt mid-request.
    const previous = { ...stored.receipt };
    const encoded = stored.receiptBase64;
    let key: KeyObject;
    try {
      key = createPublicKey(stored.publicKeyPem);
    } catch {
      throw new AttestationError("receipt-binding");
    }
    const now = this.fresh(previous);
    requireIntegrity(
      previous.appId === this.policy.appId &&
        previous.environment === this.policy.environment &&
        previous.publicKeySha256 ===
          hash(key.export({ type: "spki", format: "der" })) &&
        previous.receiptSha256 === hash(base64(encoded, 16384)),
      "receipt-binding",
    );
    if (previous.notBefore !== null && previous.notBefore > now)
      return { kind: "deferred", retryAt: previous.notBefore };
    this.active++;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel!: () => void;
    const interruption = new Promise<never>((_, reject) => {
      cancel = () => {
        abort.abort();
        reject(new AttestationError("receipt-service-cancelled"));
      };
      signal?.addEventListener("abort", cancel, { once: true });
      this.stopped.signal.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => {
        abort.abort();
        reject(new AttestationError("receipt-service-timeout"));
      }, 8000);
    });
    // The underlying operation retains its admission slot if an injected or
    // faulty transport ignores cancellation. A late result is never delivered.
    const job = this.exchange(encoded, previous, key, abort.signal).finally(
      () => {
        this.active--;
      },
    );
    try {
      const result = await Promise.race([job, interruption]);
      this.live(signal);
      this.fresh(previous);
      return result;
    } catch (error) {
      if (error instanceof AttestationError) throw error;
      throw new AttestationError("receipt-service-unavailable");
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      this.stopped.signal.removeEventListener("abort", cancel);
    }
  }
  private live(signal?: AbortSignal) {
    requireIntegrity(
      !signal?.aborted && !this.stopped.signal.aborted,
      "receipt-service-cancelled",
    );
  }
  private fresh(receipt: Receipt) {
    const now = this.clock();
    requireIntegrity(
      Number.isSafeInteger(now) &&
        now >= 0 &&
        Number.isSafeInteger(receipt.createdAt) &&
        receipt.createdAt <= now + 300000 &&
        Number.isSafeInteger(receipt.expiresAt) &&
        receipt.expiresAt > now &&
        receipt.expiresAt > receipt.createdAt &&
        (receipt.notBefore === null ||
          (Number.isSafeInteger(receipt.notBefore) &&
            receipt.notBefore >= receipt.createdAt &&
            receipt.notBefore < receipt.expiresAt)),
      "receipt-time",
    );
    return now;
  }
  private async exchange(
    encoded: string,
    previous: Receipt,
    key: KeyObject,
    signal: AbortSignal,
  ): Promise<AppleReceiptExchangeResult> {
    this.live(signal);
    const endpoint = endpoints[this.policy.environment];
    const response = await this.fetcher(endpoint, {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        Authorization: this.credential.token(this.fresh(previous)),
        "Content-Type": "application/octet-stream",
        Accept: "application/octet-stream, text/plain",
      },
      body: encoded,
    });
    try {
      this.live(signal);
      this.fresh(previous);
      requireIntegrity(
        !response.redirected && (!response.url || response.url === endpoint),
        "receipt-service-response",
      );
      if (response.status === 304)
        return {
          kind: "deferred",
          retryAt: Math.min(this.clock() + 60000, previous.expiresAt),
        };
      const statusErrors: Record<number, string> = {
        400: "receipt-service-rejected",
        401: "receipt-service-unauthorized",
        404: "receipt-service-no-data",
        429: "receipt-service-limited",
        500: "receipt-service-unavailable",
        503: "receipt-service-unavailable",
      };
      requireIntegrity(
        response.status === 200,
        statusErrors[response.status] ?? "receipt-service-status",
      );
      const length = response.headers.get("content-length");
      requireIntegrity(
        length === null || (/^[0-9]+$/.test(length) && Number(length) <= 21850),
        "receipt-service-response",
      );
      const reader = response.body?.getReader();
      requireIntegrity(reader, "receipt-service-response");
      let bytes = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          this.live(signal);
          const chunk = await reader.read();
          this.live(signal);
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          requireIntegrity(bytes <= 21850, "receipt-service-response");
          chunks.push(chunk.value);
        }
      } finally {
        void reader.cancel().catch(() => {});
      }
      this.live(signal);
      const receiptBase64 = new TextDecoder("utf-8", { fatal: true })
        .decode(Buffer.concat(chunks))
        .replace(/\r?\n$/, "");
      base64(receiptBase64, 16384);
      const receipt = await this.verifier.verify(
        receiptBase64,
        key,
        "RECEIPT",
        signal,
      );
      this.live(signal);
      this.fresh(previous);
      requireIntegrity(
        receipt.type === "RECEIPT" &&
          receipt.appId === previous.appId &&
          receipt.environment === previous.environment &&
          receipt.publicKeySha256 === previous.publicKeySha256 &&
          receipt.receiptSha256 !== previous.receiptSha256 &&
          receipt.createdAt > previous.createdAt &&
          receipt.notBefore !== null &&
          receipt.riskMetric !== null &&
          Number.isSafeInteger(receipt.riskMetric) &&
          receipt.riskMetric >= 0,
        "receipt-binding",
      );
      this.fresh(receipt);
      return { kind: "refreshed", receiptBase64, receipt };
    } finally {
      // Releases unused bodies on status/header refusal, without waiting on
      // an uncooperative body cancellation implementation.
      if (response.body && !response.body.locked)
        void response.body.cancel().catch(() => {});
    }
  }
  stop() {
    this.stopped.abort();
  }
}
