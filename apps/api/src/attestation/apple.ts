import {
  createHash,
  timingSafeEqual,
  verify,
  X509Certificate,
  type KeyObject,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AttestationError,
  requireIntegrity,
  base64,
  cbor,
  cborItem,
  cborMap,
  derItems,
  derOnly,
  type Cbor,
} from "./binary";

export type ApplePolicy = {
  appId: string;
  distribution: "app-store" | "testflight" | "development";
  bundleVersions: readonly string[];
};
const sha = (input: Buffer | string) =>
  createHash("sha256").update(input).digest();
const equal = (a: Buffer, b: Buffer) =>
  a.length === b.length && timingSafeEqual(a, b);
const nonceOid = "2a864886f763640802";
export const appleAttestationRootSha256 =
  "1cb9823ba28ba6ad2d33a006941de2ae4f513ef1d4e831b9f7e0fa7b6242c932";
function bytes(value: Cbor | undefined, length?: number): Buffer {
  requireIntegrity(
    Buffer.isBuffer(value) && (length === undefined || value.length === length),
    "format",
  );
  return value;
}
function fields(
  map: Map<string | number, Cbor>,
  expected: (string | number)[],
) {
  requireIntegrity(
    map.size === expected.length && expected.every((key) => map.has(key)),
    "format",
  );
}
function publicPoint(key: KeyObject): Buffer {
  requireIntegrity(
    key.asymmetricKeyType === "ec" &&
      key.asymmetricKeyDetails?.namedCurve === "prime256v1",
    "key",
  );
  const jwk = key.export({ format: "jwk" });
  requireIntegrity(
    typeof jwk.x === "string" && typeof jwk.y === "string",
    "key",
  );
  const point = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]);
  requireIntegrity(point.length === 65, "key");
  return point;
}
export function certificateExtensions(
  cert: X509Certificate,
): Map<string, Buffer> {
  const signed = derItems(derOnly(cert.raw, 0x30));
  requireIntegrity(
    signed.length === 3 && signed[0].tag === 0x30,
    "certificate",
  );
  const tbs = derItems(signed[0].value),
    wrappers = tbs.filter((item) => item.tag === 0xa3);
  requireIntegrity(wrappers.length === 1, "certificate");
  const result = new Map<string, Buffer>();
  for (const extension of derItems(derOnly(wrappers[0].value, 0x30))) {
    requireIntegrity(extension.tag === 0x30, "certificate");
    const values = derItems(extension.value);
    requireIntegrity(
      (values.length === 2 || values.length === 3) &&
        values[0].tag === 6 &&
        values.at(-1)!.tag === 4,
      "certificate",
    );
    const oid = values[0].value.toString("hex");
    requireIntegrity(!result.has(oid), "certificate");
    if (values.length === 3) {
      requireIntegrity(
        values[1].tag === 1 && values[1].value.equals(Buffer.from([255])),
        "certificate",
      );
      // Only understood critical certificate constraints are accepted.
      requireIntegrity(
        ["551d13", "551d0f", "551d25"].includes(oid),
        "certificate-critical-extension",
      );
    }
    result.set(oid, values.at(-1)!.value);
  }
  return result;
}
function keyUsage(extensions: Map<string, Buffer>, mask: number) {
  const value = extensions.get("551d0f");
  requireIntegrity(value, "certificate-key-usage");
  const bits = derOnly(value, 3);
  requireIntegrity(
    bits.length >= 2 && bits[0] <= 7 && (bits[1] & mask) === mask,
    "certificate-key-usage",
  );
}
function current(cert: X509Certificate, now: number) {
  requireIntegrity(
    Number.isFinite(now) &&
      Date.parse(cert.validFrom) <= now &&
      Date.parse(cert.validTo) > now,
    "certificate-expired",
  );
}
function properties(
  auth: Buffer,
  at: number,
  flags: number,
  policy: ApplePolicy,
) {
  requireIntegrity((flags & 0x80) !== 0, "app-properties-missing");
  const map = cborMap(cbor(auth.subarray(at)));
  const category = bytes(map.get("apple_validation_category_01"), 4);
  const expected =
    policy.distribution === "app-store"
      ? 4
      : policy.distribution === "testflight"
        ? 2
        : 3;
  // Apple currently publishes this UInt32 as four little-endian bytes. Exact
  // policy comparison rejects missing, unknown and non-app launch categories.
  requireIntegrity(
    category.equals(Buffer.from([expected, 0, 0, 0])),
    "app-distribution",
  );
  const version = map.get("apple_bundle_version_01");
  requireIntegrity(
    typeof version === "string" && policy.bundleVersions.includes(version),
    "app-version",
  );
  return version;
}

/** Crypto layer only. Callers must also enforce one-use challenges, account/key
 * binding, atomic assertion counters and receipt verification before activation. */
export class AppleAppAttestCrypto {
  private readonly policy: ApplePolicy;
  constructor(
    policy: ApplePolicy,
    private readonly root: X509Certificate,
  ) {
    requireIntegrity(
      /^[A-Z0-9]{10}\.[A-Za-z0-9.-]{3,200}$/.test(policy.appId),
      "policy",
    );
    requireIntegrity(
      ["app-store", "testflight", "development"].includes(
        policy.distribution,
      ) &&
        policy.bundleVersions.length >= 1 &&
        policy.bundleVersions.length <= 100 &&
        policy.bundleVersions.every(
          (v) => /^[0-9]+(?:\.[0-9]+){0,2}$/.test(v) && v.length <= 32,
        ),
      "policy",
    );
    requireIntegrity(
      root.ca && root.checkIssued(root) && root.verify(root.publicKey),
      "root",
    );
    this.policy = Object.freeze({
      ...policy,
      bundleVersions: Object.freeze([...policy.bundleVersions]),
    });
  }
  verifyKeyAttestation(
    input: string,
    keyId: string,
    challenge: Buffer,
    now = Date.now(),
  ) {
    try {
      requireIntegrity(
        Buffer.isBuffer(challenge) &&
          challenge.length >= 16 &&
          challenge.length <= 1024,
        "challenge",
      );
      const credentialId = base64(keyId, 32);
      requireIntegrity(credentialId.length === 32, "key-id");
      const object = cborMap(cbor(base64(input)));
      fields(object, ["fmt", "attStmt", "authData"]);
      requireIntegrity(object.get("fmt") === "apple-appattest", "format");
      const statement = cborMap(object.get("attStmt")!);
      fields(statement, ["x5c", "receipt"]);
      const chain = statement.get("x5c");
      requireIntegrity(
        Array.isArray(chain) && chain.length === 2,
        "certificate-chain",
      );
      const leafBytes = bytes(chain[0]),
        issuerBytes = bytes(chain[1]),
        leaf = new X509Certificate(leafBytes),
        issuer = new X509Certificate(issuerBytes);
      requireIntegrity(
        leaf.raw.equals(leafBytes) && issuer.raw.equals(issuerBytes),
        "certificate-encoding",
      );
      current(this.root, now);
      current(issuer, now);
      current(leaf, now);
      requireIntegrity(
        !leaf.ca &&
          issuer.ca &&
          leaf.checkIssued(issuer) &&
          leaf.verify(issuer.publicKey) &&
          issuer.checkIssued(this.root) &&
          issuer.verify(this.root.publicKey),
        "certificate-chain",
      );
      keyUsage(certificateExtensions(issuer), 0x04);
      const leafExtensions = certificateExtensions(leaf);
      keyUsage(leafExtensions, 0x80);
      const auth = bytes(object.get("authData"));
      requireIntegrity(
        auth.length >= 55 &&
          equal(auth.subarray(0, 32), sha(this.policy.appId)),
        "app-id",
      );
      const flags = auth[32];
      requireIntegrity(
        (flags & 0x40) !== 0 &&
          (flags & ~0xc5) === 0 &&
          auth.readUInt32BE(33) === 0,
        "authenticator",
      );
      const nonceValue = leafExtensions.get(nonceOid);
      requireIntegrity(nonceValue, "nonce");
      const nonce = derOnly(derOnly(derOnly(nonceValue, 0x30), 0xa1), 4);
      requireIntegrity(
        equal(nonce, sha(Buffer.concat([auth, sha(challenge)]))),
        "nonce",
      );
      const point = publicPoint(leaf.publicKey);
      requireIntegrity(equal(sha(point), credentialId), "key-id");
      const aaguid =
        this.policy.distribution === "development"
          ? Buffer.from("appattestdevelop")
          : Buffer.concat([Buffer.from("appattest"), Buffer.alloc(7)]);
      requireIntegrity(equal(auth.subarray(37, 53), aaguid), "environment");
      requireIntegrity(
        auth.readUInt16BE(53) === 32 &&
          auth.length >= 87 &&
          equal(auth.subarray(55, 87), credentialId),
        "key-id",
      );
      const encodedKey = cborItem(auth, 87),
        key = cborMap(encodedKey.value);
      fields(key, [1, 3, -1, -2, -3]);
      requireIntegrity(
        key.get(1) === 2 &&
          key.get(3) === -7 &&
          key.get(-1) === 1 &&
          equal(bytes(key.get(-2), 32), point.subarray(1, 33)) &&
          equal(bytes(key.get(-3), 32), point.subarray(33)),
        "cose-key",
      );
      const bundleVersion = properties(
        auth,
        encodedKey.end,
        flags,
        this.policy,
      );
      const receipt = bytes(statement.get("receipt"));
      requireIntegrity(
        receipt.length > 0 && receipt.length <= 16384,
        "receipt",
      );
      return {
        appId: this.policy.appId,
        publicKeyPem: leaf.publicKey
          .export({ type: "spki", format: "pem" })
          .toString(),
        counter: 0,
        bundleVersion,
        distribution: this.policy.distribution,
        unverifiedReceipt: receipt.toString("base64"),
      };
    } catch (error) {
      if (error instanceof AttestationError) throw error;
      throw new AttestationError("certificate");
    }
  }
  verifyAssertion(
    input: string,
    publicKey: KeyObject,
    challenge: Buffer,
    previousCounter: number,
  ) {
    try {
      requireIntegrity(
        Buffer.isBuffer(challenge) &&
          challenge.length >= 16 &&
          challenge.length <= 1024 &&
          Number.isInteger(previousCounter) &&
          previousCounter >= 0 &&
          previousCounter < 0xffffffff,
        "challenge",
      );
      publicPoint(publicKey);
      const object = cborMap(cbor(base64(input, 4096)));
      fields(object, ["signature", "authenticatorData"]);
      const auth = bytes(object.get("authenticatorData")),
        signature = bytes(object.get("signature"));
      requireIntegrity(
        auth.length >= 37 &&
          signature.length >= 8 &&
          signature.length <= 80 &&
          equal(auth.subarray(0, 32), sha(this.policy.appId)),
        "app-id",
      );
      const flags = auth[32],
        counter = auth.readUInt32BE(33);
      requireIntegrity(
        (flags & ~0x85) === 0 && counter > previousCounter,
        "counter",
      );
      const bundleVersion = properties(auth, 37, flags, this.policy);
      // Node hashes this composite once, producing Apple's documented nonce.
      requireIntegrity(
        verify(
          "sha256",
          Buffer.concat([auth, sha(challenge)]),
          publicKey,
          signature,
        ),
        "signature",
      );
      return { counter, bundleVersion, distribution: this.policy.distribution };
    } catch (error) {
      if (error instanceof AttestationError) throw error;
      throw new AttestationError("signature");
    }
  }
}
/** Shipped trust anchor cannot be selected by an incoming certificate chain. */
export function appleAppAttestCrypto(policy: ApplePolicy) {
  const root = new X509Certificate(
    readFileSync(
      join(__dirname, "../../assets/security/apple-app-attest-root.pem"),
    ),
  );
  requireIntegrity(
    sha(root.raw).toString("hex") === appleAttestationRootSha256,
    "root",
  );
  return new AppleAppAttestCrypto(policy, root);
}
