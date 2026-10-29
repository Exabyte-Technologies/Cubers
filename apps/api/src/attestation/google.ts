import { AttestationError, requireIntegrity } from "./binary";
import { z } from "zod";
export type PlayIntegrityPolicy = {
  packageName: string;
  certificateDigests: readonly string[];
  versionCodes: readonly string[];
};
export type IntegrityRequest = {
  requestHash: string;
  issuedAt: number;
  expiresAt: number;
};
const digest = /^[A-Za-z0-9_-]{43}$/;
const version = /^[1-9][0-9]{0,18}$/;
const Payload = z.object({
  tokenPayloadExternal: z.object({
    requestDetails: z.object({
      requestPackageName: z.string(),
      requestHash: z.string(),
      timestampMillis: z.string().regex(/^[0-9]{1,16}$/),
    }),
    accountDetails: z.object({ appLicensingVerdict: z.literal("LICENSED") }),
    appIntegrity: z.object({
      appRecognitionVerdict: z.literal("PLAY_RECOGNIZED"),
      packageName: z.string(),
      certificateSha256Digest: z.array(z.string().regex(digest)).min(1).max(8),
      versionCode: z.string().regex(version),
    }),
    deviceIntegrity: z.object({
      deviceRecognitionVerdict: z.array(z.string()).max(16),
    }),
    testingDetails: z
      .object({ isTestingResponse: z.boolean().optional() })
      .optional(),
  }),
});
async function boundedJson(response: Response) {
  requireIntegrity(
    response.ok &&
      !response.redirected &&
      response.headers.get("content-type")?.split(";")[0].trim() ===
        "application/json",
    "provider-response",
  );
  const length = response.headers.get("content-length");
  requireIntegrity(
    length === null || (/^[0-9]+$/.test(length) && Number(length) <= 65536),
    "provider-response",
  );
  const reader = response.body?.getReader();
  requireIntegrity(reader, "provider-response");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      requireIntegrity(total <= 65536, "provider-response");
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    void reader.cancel().catch(() => {});
  }
}
/** Only Google-decrypted responses reach the verdict checks. Callers must still
 * consume the server challenge once and atomically bind the result to its action. */
export class PlayIntegrityCrypto {
  private readonly policy: PlayIntegrityPolicy;
  constructor(
    policy: PlayIntegrityPolicy,
    private readonly accessToken: (signal: AbortSignal) => Promise<string>,
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => number = Date.now,
  ) {
    requireIntegrity(
      /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(
        policy.packageName,
      ) &&
        policy.packageName.length <= 200 &&
        policy.certificateDigests.length >= 1 &&
        policy.certificateDigests.length <= 8 &&
        policy.certificateDigests.every((v) => digest.test(v)) &&
        new Set(policy.certificateDigests).size ===
          policy.certificateDigests.length &&
        policy.versionCodes.length >= 1 &&
        policy.versionCodes.length <= 100 &&
        policy.versionCodes.every((v) => version.test(v)),
      "policy",
    );
    this.policy = Object.freeze({
      ...policy,
      certificateDigests: Object.freeze([...policy.certificateDigests]),
      versionCodes: Object.freeze([...policy.versionCodes]),
    });
  }
  async verifyToken(token: string, context: IntegrityRequest) {
    requireIntegrity(
      typeof token === "string" &&
        token.length >= 16 &&
        token.length <= 32768 &&
        /^[\x21-\x7e]+$/.test(token),
      "token",
    );
    const request = { ...context };
    requireIntegrity(
      typeof request.requestHash === "string" &&
        digest.test(request.requestHash) &&
        Number.isSafeInteger(request.issuedAt) &&
        Number.isSafeInteger(request.expiresAt) &&
        request.expiresAt > request.issuedAt &&
        request.expiresAt - request.issuedAt <= 120000,
      "challenge",
    );
    this.fresh(request);
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abort.abort();
        reject(new AttestationError("provider-timeout"));
      }, 8000);
    });
    try {
      return await Promise.race([
        timeout,
        (async () => {
          const bearer = await this.accessToken(abort.signal);
          requireIntegrity(
            typeof bearer === "string" &&
              bearer.length >= 16 &&
              bearer.length <= 8192 &&
              /^[A-Za-z0-9._~+/=-]+$/.test(bearer),
            "provider-credentials",
          );
          const response = await this.fetcher(
            `https://playintegrity.googleapis.com/v1/${this.policy.packageName}:decodeIntegrityToken`,
            {
              method: "POST",
              redirect: "error",
              signal: abort.signal,
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${bearer}`,
              },
              body: JSON.stringify({ integrity_token: token }),
            },
          );
          const parsed = Payload.safeParse(await boundedJson(response));
          requireIntegrity(parsed.success, "verdict");
          const verdict = parsed.data.tokenPayloadExternal,
            details = verdict.requestDetails,
            app = verdict.appIntegrity;
          const now = this.fresh(request),
            timestamp = Number(details.timestampMillis);
          requireIntegrity(
            details.requestPackageName === this.policy.packageName &&
              app.packageName === this.policy.packageName &&
              details.requestHash === request.requestHash,
            "request-binding",
          );
          requireIntegrity(
            Number.isSafeInteger(timestamp) &&
              timestamp >= request.issuedAt - 1000 &&
              timestamp <= now + 5000 &&
              now - timestamp <= 120000,
            "timestamp",
          );
          requireIntegrity(
            app.certificateSha256Digest.every((v) =>
              this.policy.certificateDigests.includes(v),
            ) &&
              new Set(app.certificateSha256Digest).size ===
                app.certificateSha256Digest.length &&
              this.policy.versionCodes.includes(app.versionCode),
            "app-build",
          );
          requireIntegrity(
            verdict.deviceIntegrity.deviceRecognitionVerdict.includes(
              "MEETS_DEVICE_INTEGRITY",
            ) && verdict.testingDetails?.isTestingResponse !== true,
            "device",
          );
          return {
            provider: "google-play" as const,
            packageName: app.packageName,
            versionCode: app.versionCode,
            certificateDigests: [...app.certificateSha256Digest],
            verifiedAt: now,
          };
        })(),
      ]);
    } catch (error) {
      if (error instanceof AttestationError) throw error;
      throw new AttestationError("provider-unavailable");
    } finally {
      clearTimeout(timer!);
      abort.abort();
    }
  }
  private fresh(request: IntegrityRequest) {
    const now = this.clock();
    requireIntegrity(
      Number.isSafeInteger(now) &&
        now >= request.issuedAt &&
        now < request.expiresAt,
      "challenge-expired",
    );
    return now;
  }
}
