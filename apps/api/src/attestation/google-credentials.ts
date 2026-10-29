import { JWT } from "google-auth-library";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { createPrivateKey, createPublicKey, createHash } from "node:crypto";
import { z } from "zod";
const Credential = z.object({
  type: z.literal("service_account"),
  project_id: z.string().regex(/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/),
  client_email: z
    .string()
    .regex(/^[a-zA-Z0-9_.-]+@[a-zA-Z0-9-]+\.iam\.gserviceaccount\.com$/),
  private_key_id: z.string().regex(/^[a-f0-9]{40}$/),
  private_key: z.string().min(1000).max(16384),
  token_uri: z.literal("https://oauth2.googleapis.com/token"),
  universe_domain: z.literal("googleapis.com").optional(),
});
function fail(): never {
  throw Error("Private Google verification credentials are unavailable");
}
export async function googleCredentials(path: string) {
  let value: z.infer<typeof Credential>;
  try {
    if (resolve(path) !== path || (await realpath(path)) !== path) fail();
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await file.stat();
      if (
        !info.isFile() ||
        info.nlink !== 1 ||
        ![0, process.getuid?.()].includes(info.uid) ||
        (info.mode & 0o177) !== 0 ||
        info.size > 32768
      )
        fail();
      const bytes = Buffer.alloc(32769),
        { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > 32768) fail();
      value = Credential.parse(
        JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            bytes.subarray(0, bytesRead),
          ),
        ),
      );
    } finally {
      await file.close();
    }
    const key = createPrivateKey(value.private_key);
    if (
      key.asymmetricKeyType !== "rsa" ||
      (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
    )
      fail();
    const fingerprint = createHash("sha256")
      .update(createPublicKey(key).export({ type: "spki", format: "der" }))
      .digest("hex");
    const client = new JWT({
      email: value.client_email,
      key: value.private_key,
      keyId: value.private_key_id,
      scopes: ["https://www.googleapis.com/auth/playintegrity"],
      transporterOptions: {
        timeout: 4000,
        retry: false,
        retryConfig: { retry: 0 },
        maxRedirects: 0,
        maxContentLength: 65536,
      },
    });
    // The SDK supplies its own POST retryConfig. Enforce limits after its
    // request options are assembled, rather than relying on transport defaults.
    client.transporter.interceptors.request.add({
      resolved: async (options) => {
        if (String(options.url) !== "https://oauth2.googleapis.com/token")
          fail();
        return {
          ...options,
          timeout: 4000,
          maxRedirects: 0,
          maxContentLength: 65536,
          retry: false,
          retryConfig: { retry: 0 },
        };
      },
    });
    // Only selected, validated service-account fields reach the SDK. No ADC,
    // external credential executable, token_uri override or metadata fallback.
    return { fingerprint, projectId: value.project_id, client };
  } catch {
    fail();
  }
}
