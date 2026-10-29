import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  X509Certificate,
  type KeyObject,
} from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  chmod,
  writeFile,
  readFile,
  rm,
  mkdir,
  stat,
} from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import {
  AttestationError,
  requireIntegrity,
  base64,
  derItems,
  derOnly,
} from "./binary";
import {
  certificateExtensions,
  appleAppAttestCrypto,
  type AppleAppAttestCrypto,
  type ApplePolicy,
} from "./apple";
import {
  receiptCertificatePath,
  type AppleCertificateStatus,
} from "./apple-certificate-status";

const run = promisify(execFile);
export const appleReceiptRootSha256 =
  "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";
const receiptPurposeOid = "2a864886f763640c0f";
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
export type AppleReceiptPolicy = {
  appId: string;
  environment: "development" | "production";
};
export type AppleReceiptType = "ATTEST" | "RECEIPT";
export type AppleVerifiedReceipt = {
  type: AppleReceiptType;
  appId: string;
  environment: "development" | "production";
  createdAt: number;
  expiresAt: number;
  notBefore: number | null;
  riskMetric: number | null;
  verifiedAt: number;
  receiptSha256: string;
  publicKeySha256: string;
  certificateChain?: string[];
};

// Apple CMS envelopes use BER indefinite containers. Check the one outer
// envelope's exact extent before OpenSSL handles its signature and full syntax.
function envelope(input: Buffer) {
  requireIntegrity(
    input.length >= 2 && input.length <= 16384 && input[0] === 0x30,
    "receipt-format",
  );
  let nodes = 0;
  function end(start: number, depth: number): number {
    requireIntegrity(
      ++nodes <= 512 && depth <= 16 && start + 2 <= input.length,
      "receipt-format",
    );
    let at = start;
    const tag = input[at++];
    requireIntegrity(tag !== 0 && (tag & 31) !== 31, "receipt-format");
    const first = input[at++];
    if (first === 0x80) {
      requireIntegrity((tag & 0x20) !== 0, "receipt-format");
      while (true) {
        requireIntegrity(at + 2 <= input.length, "receipt-format");
        if (input[at] === 0 && input[at + 1] === 0) return at + 2;
        at = end(at, depth + 1);
      }
    }
    let length = first;
    if (first & 128) {
      const width = first & 127;
      requireIntegrity(
        width >= 1 &&
          width <= 3 &&
          at + width <= input.length &&
          input[at] !== 0,
        "receipt-format",
      );
      length = input.readUIntBE(at, width);
      at += width;
      requireIntegrity(length >= 128, "receipt-format");
    }
    requireIntegrity(at + length <= input.length, "receipt-format");
    return at + length;
  }
  requireIntegrity(end(0, 0) === input.length, "receipt-format");
}
function integer(data: Buffer) {
  requireIntegrity(
    data.length >= 1 &&
      data.length <= 4 &&
      (data[0] & 128) === 0 &&
      (data.length === 1 || data[0] !== 0 || (data[1] & 128) !== 0),
    "receipt-fields",
  );
  return data.readUIntBE(0, data.length);
}
function attributes(data: Buffer) {
  const result = new Map<number, Buffer>();
  const rows = derItems(derOnly(data, 0x31));
  requireIntegrity(rows.length >= 1 && rows.length <= 64, "receipt-fields");
  for (const row of rows) {
    requireIntegrity(row.tag === 0x30, "receipt-fields");
    const fields = derItems(row.value);
    requireIntegrity(
      fields.length === 3 &&
        fields[0].tag === 2 &&
        fields[1].tag === 2 &&
        fields[2].tag === 4 &&
        integer(fields[1].value) === 1,
      "receipt-fields",
    );
    const id = integer(fields[0].value);
    requireIntegrity(!result.has(id), "receipt-fields");
    result.set(id, fields[2].value);
  }
  return result;
}
function text(fields: Map<number, Buffer>, id: number) {
  const data = fields.get(id);
  requireIntegrity(
    data && data.length >= 1 && data.length <= 256,
    "receipt-fields",
  );
  const value = data.toString("utf8");
  requireIntegrity(Buffer.from(value, "utf8").equals(data), "receipt-fields");
  return value;
}
function date(fields: Map<number, Buffer>, id: number) {
  const value = text(fields, id);
  requireIntegrity(
    /^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(
      value,
    ),
    "receipt-time",
  );
  const timestamp = Date.parse(value);
  requireIntegrity(
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value,
    "receipt-time",
  );
  return timestamp;
}
function publicKey(data: Buffer): KeyObject {
  // Apple's published receipt carries a DER certificate in field 3. Accept a
  // canonical SPKI too; both representations must resolve to the attested key.
  try {
    const cert = new X509Certificate(data);
    requireIntegrity(cert.raw.equals(data), "receipt-key");
    return cert.publicKey;
  } catch (error) {
    if (error instanceof AttestationError) throw error;
  }
  try {
    const key = createPublicKey({ key: data, type: "spki", format: "der" });
    requireIntegrity(
      key.export({ type: "spki", format: "der" }).equals(data),
      "receipt-key",
    );
    return key;
  } catch {
    throw new AttestationError("receipt-key");
  }
}
function keyDigest(key: KeyObject) {
  requireIntegrity(
    key.asymmetricKeyType === "ec" &&
      key.asymmetricKeyDetails?.namedCurve === "prime256v1",
    "receipt-key",
  );
  return createHash("sha256")
    .update(key.export({ type: "spki", format: "der" }))
    .digest();
}
async function boundedFile(path: string) {
  const info = await stat(path);
  requireIntegrity(info.isFile() && info.size <= 32768, "receipt-format");
  return readFile(path);
}

/** Independent CMS verification. Trust roots and executable are server-owned
 * dependencies; incoming proofs cannot choose either. OpenSSL 3 is required. */
export class AppleReceiptVerifier {
  private active = 0;
  private readonly policy: AppleReceiptPolicy;
  constructor(
    policy: AppleReceiptPolicy,
    private readonly root: X509Certificate,
    private readonly opensslPath = "/usr/bin/openssl",
    private readonly clock: () => number = Date.now,
    private readonly certificateStatus?: Pick<AppleCertificateStatus, "ensure">,
  ) {
    requireIntegrity(
      /^[A-Z0-9]{10}\.[A-Za-z0-9.-]{3,200}$/.test(policy.appId) &&
        ["development", "production"].includes(policy.environment) &&
        isAbsolute(opensslPath),
      "policy",
    );
    requireIntegrity(
      root.ca && root.checkIssued(root) && root.verify(root.publicKey),
      "root",
    );
    this.policy = Object.freeze({ ...policy });
  }
  async verify(
    encoded: string,
    expectedPublicKey: KeyObject,
    expectedType: AppleReceiptType,
    signal?: AbortSignal,
  ): Promise<AppleVerifiedReceipt> {
    const input = base64(encoded, 16384);
    envelope(input);
    requireIntegrity(
      expectedType === "ATTEST" || expectedType === "RECEIPT",
      "policy",
    );
    const expectedKey = keyDigest(expectedPublicKey);
    requireIntegrity(this.active < 2, "receipt-busy");
    this.active++;
    let directory: string | undefined;
    try {
      requireIntegrity(!signal?.aborted, "receipt-cancelled");
      const now = this.clock();
      requireIntegrity(Number.isSafeInteger(now) && now >= 0, "receipt-time");
      directory = await mkdtemp(join(tmpdir(), "cubers-receipt-"));
      await chmod(directory, 0o700);
      const inputFile = join(directory, "receipt.der"),
        rootFile = join(directory, "root.pem"),
        payloadFile = join(directory, "payload.der"),
        signerFile = join(directory, "signers.pem"),
        chainFile = join(directory, "chain.pem"),
        emptyCa = join(directory, "empty-ca");
      await mkdir(emptyCa, { mode: 0o700 });
      for (const [path, content] of [
        [inputFile, input],
        [rootFile, this.root.toString()],
        [payloadFile, Buffer.alloc(0)],
        [signerFile, Buffer.alloc(0)],
        [chainFile, Buffer.alloc(0)],
      ] as const)
        await writeFile(path, content, { mode: 0o600, flag: "wx" });
      const verification = run(
        this.opensslPath,
        [
          "cms",
          "-verify",
          "-binary",
          "-inform",
          "DER",
          "-CAfile",
          rootFile,
          "-no-CApath",
          "-no-CAstore",
          "-purpose",
          "any",
          "-verify_retcode",
          "-x509_strict",
          "-auth_level",
          "2",
          "-verify_depth",
          "3",
          "-attime",
          String(Math.floor(now / 1000)),
          "-in",
          inputFile,
          "-out",
          payloadFile,
          "-signer",
          signerFile,
          "-certsout",
          chainFile,
        ],
        {
          cwd: directory,
          timeout: 2000,
          killSignal: "SIGKILL",
          maxBuffer: 32768,
          signal,
          env: {
            PATH: "/usr/bin:/bin",
            OPENSSL_CONF: "/dev/null",
            SSL_CERT_FILE: rootFile,
            SSL_CERT_DIR: emptyCa,
          },
        },
      );
      // execFile rejects immediately on AbortSignal cancellation, before its
      // process necessarily exits. Keep proof files and admission until close.
      const closed = new Promise<void>((resolve) => {
        verification.child.once("close", () => resolve());
      });
      try {
        await verification;
      } finally {
        await closed;
      }
      requireIntegrity(!signal?.aborted, "receipt-cancelled");
      const signerPem = (await boundedFile(signerFile)).toString("ascii");
      const signers =
        signerPem.match(
          /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
        ) ?? [];
      requireIntegrity(
        signers.length === 1 && signerPem.trim() === signers[0],
        "receipt-signer",
      );
      const signer = new X509Certificate(signers[0]),
        ext = certificateExtensions(signer);
      requireIntegrity(
        !signer.ca &&
          ext.get(receiptPurposeOid)?.equals(Buffer.from("0500", "hex")),
        "receipt-purpose",
      );
      const usage = ext.get("551d0f");
      requireIntegrity(usage, "receipt-purpose");
      const bits = derOnly(usage, 3);
      requireIntegrity(
        bits.length >= 2 && bits[0] <= 7 && (bits[1] & 0x80) !== 0,
        "receipt-purpose",
      );
      const fields = attributes(await boundedFile(payloadFile));
      requireIntegrity(
        text(fields, 2) === this.policy.appId &&
          text(fields, 7) === this.policy.environment,
        "receipt-app",
      );
      const attestedKey = fields.get(3);
      requireIntegrity(
        attestedKey && attestedKey.length <= 8192,
        "receipt-key",
      );
      requireIntegrity(
        timingSafeEqual(keyDigest(publicKey(attestedKey)), expectedKey),
        "receipt-key",
      );
      requireIntegrity(text(fields, 6) === expectedType, "receipt-type");
      const createdAt = date(fields, 12),
        expiresAt = date(fields, 21),
        verifiedAt = this.clock();
      requireIntegrity(
        Number.isSafeInteger(verifiedAt) &&
          verifiedAt >= now &&
          createdAt <= verifiedAt + 5000 &&
          verifiedAt - createdAt <= 300000 &&
          expiresAt > verifiedAt &&
          expiresAt > createdAt,
        "receipt-time",
      );
      const chainPem = (await boundedFile(chainFile)).toString("ascii"),
        chain =
          chainPem.match(
            /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
          ) ?? [];
      requireIntegrity(
        chain.length >= 1 &&
          chain.length <= 4 &&
          chainPem
            .replace(
              /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
              "",
            )
            .trim() === "",
        "receipt-signer",
      );
      // Recheck at delivery: certificate validity may have elapsed while the
      // external verifier was running. The private CA file supplies the root.
      for (const certificate of [
        this.root,
        ...chain.map((pem) => new X509Certificate(pem)),
      ])
        requireIntegrity(
          Date.parse(certificate.validFrom) <= verifiedAt &&
            Date.parse(certificate.validTo) > verifiedAt,
          "receipt-time",
        );
      const notBefore = fields.has(19) ? date(fields, 19) : null;
      requireIntegrity(
        notBefore === null || (notBefore >= createdAt && notBefore < expiresAt),
        "receipt-time",
      );
      let riskMetric: number | null = null;
      if (expectedType === "RECEIPT") {
        requireIntegrity(notBefore !== null, "receipt-risk");
        const value = text(fields, 17);
        requireIntegrity(/^(0|[1-9][0-9]{0,8})$/.test(value), "receipt-risk");
        riskMetric = Number(value);
      } else requireIntegrity(!fields.has(17), "receipt-risk");
      requireIntegrity(!signal?.aborted, "receipt-cancelled");
      const certificateChain = receiptCertificatePath(
        signer,
        chain.map((pem) => new X509Certificate(pem)),
        this.root,
      ).map((c) => c.raw.toString("base64"));
      const certificateUntil = this.certificateStatus
        ? await this.certificateStatus.ensure(certificateChain, signal)
        : Infinity;
      const deliveredAt = this.clock();
      requireIntegrity(
        deliveredAt >= verifiedAt &&
          deliveredAt - createdAt <= 300000 &&
          expiresAt > deliveredAt &&
          certificateUntil > deliveredAt &&
          !signal?.aborted,
        "receipt-time",
      );
      return {
        type: expectedType,
        appId: this.policy.appId,
        environment: this.policy.environment,
        createdAt,
        expiresAt,
        notBefore,
        riskMetric,
        verifiedAt: deliveredAt,
        receiptSha256: sha(input),
        publicKeySha256: expectedKey.toString("hex"),
        certificateChain,
      };
    } catch (error) {
      if (error instanceof AttestationError) throw error;
      if (signal?.aborted) throw new AttestationError("receipt-cancelled");
      const e = error as { code?: string; killed?: boolean };
      throw new AttestationError(
        e.code === "ENOENT"
          ? "receipt-tool-unavailable"
          : e.killed
            ? "receipt-timeout"
            : "receipt-signature",
      );
    } finally {
      try {
        if (directory) await rm(directory, { recursive: true, force: true });
      } finally {
        this.active--;
      }
    }
  }
}
export function appleReceiptVerifier(
  policy: AppleReceiptPolicy,
  opensslPath = "/usr/bin/openssl",
  certificateStatus?: Pick<AppleCertificateStatus, "ensure">,
) {
  return new AppleReceiptVerifier(
    policy,
    appleReceiptTrustRoot(),
    opensslPath,
    Date.now,
    certificateStatus,
  );
}
export function appleReceiptTrustRoot() {
  const root = new X509Certificate(
    readFileSync(join(__dirname, "../../assets/security/apple-root-g3.pem")),
  );
  requireIntegrity(sha(root.raw) === appleReceiptRootSha256, "root");
  return root;
}
/** Completes both independent Apple checks, without granting account/action
 * authority. The caller must consume its challenge and persist key ownership. */
export class AppleEnrollmentVerifier {
  constructor(
    private readonly keyCrypto: AppleAppAttestCrypto,
    private readonly receipts: AppleReceiptVerifier,
    private readonly clock: () => number = Date.now,
  ) {}
  async verify(
    input: string,
    keyId: string,
    challenge: Buffer,
    signal?: AbortSignal,
  ) {
    requireIntegrity(!signal?.aborted, "receipt-cancelled");
    const { unverifiedReceipt, ...key } = this.keyCrypto.verifyKeyAttestation(
      input,
      keyId,
      challenge,
      this.clock(),
    );
    const receipt = await this.receipts.verify(
      unverifiedReceipt,
      createPublicKey(key.publicKeyPem),
      "ATTEST",
      signal,
    );
    requireIntegrity(!signal?.aborted, "receipt-cancelled");
    requireIntegrity(
      receipt.appId === key.appId &&
        receipt.environment ===
          (key.distribution === "development" ? "development" : "production"),
      "receipt-app",
    );
    return { ...key, receipt, receiptBase64: unverifiedReceipt };
  }
}
export function appleEnrollmentVerifier(
  policy: ApplePolicy,
  opensslPath = "/usr/bin/openssl",
  certificateStatus?: Pick<AppleCertificateStatus, "ensure">,
) {
  const keyCrypto = appleAppAttestCrypto(policy),
    receipts = appleReceiptVerifier(
      {
        appId: policy.appId,
        environment:
          policy.distribution === "development" ? "development" : "production",
      },
      opensslPath,
      certificateStatus,
    );
  return new AppleEnrollmentVerifier(keyCrypto, receipts);
}
