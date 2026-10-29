import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  type KeyObject,
} from "node:crypto";
import { z } from "zod";
const Credential = z
  .object({
    version: z.literal(1),
    teamId: z.string().regex(/^[A-Z0-9]{10}$/),
    keyId: z.string().regex(/^[A-Z0-9]{10}$/),
    privateKey: z.string().max(8192),
  })
  .strict();
function fail(): never {
  throw new Error("Private Apple verification credentials are unavailable");
}
export interface AppleReceiptCredential {
  readonly teamId: string;
  readonly keyId: string;
  readonly fingerprint: string;
  token(now: number): string;
  destroy(): void;
}
/** Only operator-owned DeviceCheck-enabled P-256 keys are accepted. There is
 * no platform-account lookup, URL override, passphrase command or fallback. */
export async function loadAppleReceiptCredential(
  path: string,
  expectedTeamId: string,
): Promise<AppleReceiptCredential> {
  try {
    if (resolve(path) !== path || (await realpath(path)) !== path) fail();
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    let value: z.infer<typeof Credential>;
    try {
      const info = await file.stat();
      if (
        !info.isFile() ||
        info.nlink !== 1 ||
        ![0, process.getuid?.()].includes(info.uid) ||
        (info.mode & 0o177) !== 0 ||
        info.size > 16384
      )
        fail();
      const bytes = Buffer.alloc(16385);
      try {
        const read = await file.read(bytes, 0, bytes.length, 0);
        if (read.bytesRead > 16384) fail();
        value = Credential.parse(
          JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              bytes.subarray(0, read.bytesRead),
            ),
          ),
        );
      } finally {
        bytes.fill(0);
      }
    } finally {
      await file.close();
    }
    if (
      value.teamId !== expectedTeamId ||
      !/^-----BEGIN PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PRIVATE KEY-----\s*$/.test(
        value.privateKey,
      )
    )
      fail();
    let key: KeyObject | undefined = createPrivateKey(value.privateKey);
    if (
      key.asymmetricKeyType !== "ec" ||
      key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
    )
      fail();
    const fingerprint = createHash("sha256")
      .update(createPublicKey(key).export({ type: "spki", format: "der" }))
      .digest("hex");
    const teamId = value.teamId,
      keyId = value.keyId;
    return Object.freeze({
      teamId,
      keyId,
      fingerprint,
      token(now: number) {
        if (!key || !Number.isSafeInteger(now) || now < 0) fail();
        const header = Buffer.from(
          JSON.stringify({ alg: "ES256", kid: keyId }),
        ).toString("base64url");
        const claims = Buffer.from(
          JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) }),
        ).toString("base64url");
        const input = `${header}.${claims}`;
        return `${input}.${sign("sha256", Buffer.from(input), {
          key,
          dsaEncoding: "ieee-p1363",
        }).toString("base64url")}`;
      },
      destroy() {
        key = undefined;
      },
    });
  } catch {
    fail();
  }
}
