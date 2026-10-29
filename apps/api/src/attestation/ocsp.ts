import { createHash, X509Certificate } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { certificateExtensions } from "./apple";
import {
  AttestationError,
  derItems,
  derOnly,
  requireIntegrity,
  type Der,
} from "./binary";

const run = promisify(execFile);
const sha1Oid = "2b0e03021a";
const basicOcspOid = "2b0601050507300101";
const clockSkew = 5000;
const maxAge = 86400000;
export const ocspResponseLimit = 32768;
export type OcspStatus = {
  status: "good" | "revoked" | "unknown";
  producedAt: number;
  thisUpdate: number;
  nextUpdate: number | null;
  validUntil: number;
};

export function ocspDer(tag: number, value: Buffer): Buffer {
  requireIntegrity(
    value.length <= ocspResponseLimit,
    "certificate-status-format",
  );
  const length =
    value.length < 128
      ? Buffer.from([value.length])
      : value.length < 256
        ? Buffer.from([0x81, value.length])
        : Buffer.from([0x82, value.length >>> 8, value.length & 255]);
  return Buffer.concat([Buffer.from([tag]), length, value]);
}
function serial(value: Buffer) {
  requireIntegrity(
    value.length > 0 &&
      value.length <= 21 &&
      !(value[0] & 128) &&
      (value.length === 1 || value[0] !== 0 || !!(value[1] & 128)),
    "certificate-status-id",
  );
  return value;
}
function certificateId(certificate: X509Certificate, issuer: X509Certificate) {
  const fields = (c: X509Certificate) =>
    derItems(derItems(derOnly(c.raw, 0x30))[0].value);
  const leaf = fields(certificate),
    ca = fields(issuer),
    l = leaf[0].tag === 0xa0 ? 1 : 0,
    i = ca[0].tag === 0xa0 ? 1 : 0;
  requireIntegrity(
    leaf[l]?.tag === 2 && ca[i + 4]?.tag === 0x30 && ca[i + 5]?.tag === 0x30,
    "certificate-status-id",
  );
  const spki = derItems(ca[i + 5].value);
  requireIntegrity(
    spki.length === 2 && spki[1].tag === 3 && spki[1].value[0] === 0,
    "certificate-status-id",
  );
  return ocspDer(
    0x30,
    Buffer.concat([
      ocspDer(
        0x30,
        Buffer.concat([
          ocspDer(6, Buffer.from(sha1Oid, "hex")),
          ocspDer(5, Buffer.alloc(0)),
        ]),
      ),
      ocspDer(
        4,
        createHash("sha1")
          .update(ocspDer(0x30, ca[i + 4].value))
          .digest(),
      ),
      ocspDer(4, createHash("sha1").update(spki[1].value.subarray(1)).digest()),
      ocspDer(2, serial(leaf[l].value)),
    ]),
  );
}
/** SHA-1 here identifies a public certificate; it is never a signature digest. */
export function ocspRequest(
  certificate: X509Certificate,
  issuer: X509Certificate,
) {
  let value = certificateId(certificate, issuer);
  for (let i = 0; i < 4; i++) value = ocspDer(0x30, value);
  return value;
}
function identifier(value: Buffer) {
  const fields = derItems(value);
  requireIntegrity(
    fields.length === 4 &&
      fields[0].tag === 0x30 &&
      fields[1].tag === 4 &&
      fields[2].tag === 4 &&
      fields[3].tag === 2,
    "certificate-status-id",
  );
  const algorithm = derItems(fields[0].value);
  requireIntegrity(
    (algorithm.length === 1 ||
      (algorithm.length === 2 &&
        algorithm[1].tag === 5 &&
        algorithm[1].value.length === 0)) &&
      algorithm[0].tag === 6 &&
      algorithm[0].value.toString("hex") === sha1Oid &&
      fields[1].value.length === 20 &&
      fields[2].value.length === 20,
    "certificate-status-id",
  );
  return Buffer.concat([
    fields[1].value,
    fields[2].value,
    serial(fields[3].value),
  ]).toString("hex");
}
function time(item: Der) {
  requireIntegrity(item.tag === 0x18, "certificate-status-time");
  const value = item.value.toString("ascii");
  requireIntegrity(
    /^(19|20)[0-9]{12}Z$/.test(value) &&
      Buffer.from(value, "ascii").equals(item.value),
    "certificate-status-time",
  );
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}.000Z`,
    timestamp = Date.parse(iso);
  requireIntegrity(
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === iso,
    "certificate-status-time",
  );
  return timestamp;
}
function extensions(encoded: Buffer) {
  const values = derItems(derOnly(encoded, 0x30)),
    seen = new Set<string>();
  requireIntegrity(values.length <= 16, "certificate-status-format");
  for (const value of values) {
    requireIntegrity(value.tag === 0x30, "certificate-status-format");
    const fields = derItems(value.value);
    requireIntegrity(
      (fields.length === 2 || fields.length === 3) &&
        fields[0].tag === 6 &&
        fields.at(-1)!.tag === 4,
      "certificate-status-format",
    );
    const id = fields[0].value.toString("hex");
    requireIntegrity(!seen.has(id), "certificate-status-format");
    seen.add(id);
    // No critical OCSP extension is required by this unsigned, nonce-free request.
    if (fields.length === 3)
      requireIntegrity(
        fields[1].tag === 1 &&
          fields[1].value.length === 1 &&
          fields[1].value[0] === 0,
        "certificate-status-extension",
      );
  }
}
function parseResponse(response: Buffer, expectedId: string) {
  requireIntegrity(
    response.length > 0 && response.length <= ocspResponseLimit,
    "certificate-status-format",
  );
  const envelope = derItems(derOnly(response, 0x30));
  requireIntegrity(
    envelope.length === 2 &&
      envelope[0].tag === 10 &&
      envelope[0].value.equals(Buffer.from([0])) &&
      envelope[1].tag === 0xa0,
    "certificate-status-response",
  );
  const bytes = derItems(derOnly(envelope[1].value, 0x30));
  requireIntegrity(
    bytes.length === 2 &&
      bytes[0].tag === 6 &&
      bytes[0].value.toString("hex") === basicOcspOid &&
      bytes[1].tag === 4,
    "certificate-status-format",
  );
  const basic = derItems(derOnly(bytes[1].value, 0x30));
  requireIntegrity(
    (basic.length === 3 || basic.length === 4) &&
      basic[0].tag === 0x30 &&
      basic[1].tag === 0x30 &&
      basic[2].tag === 3 &&
      basic[2].value.length > 1 &&
      basic[2].value[0] === 0,
    "certificate-status-format",
  );
  const algorithm = derItems(basic[1].value),
    oid = algorithm[0]?.value.toString("hex"),
    ecdsa = [
      "2a8648ce3d040302",
      "2a8648ce3d040303",
      "2a8648ce3d040304",
    ].includes(oid),
    rsa = [
      "2a864886f70d01010b",
      "2a864886f70d01010c",
      "2a864886f70d01010d",
    ].includes(oid);
  requireIntegrity(
    algorithm[0]?.tag === 6 &&
      ((ecdsa && algorithm.length === 1) ||
        (rsa &&
          (algorithm.length === 1 ||
            (algorithm.length === 2 &&
              algorithm[1].tag === 5 &&
              algorithm[1].value.length === 0)))),
    "certificate-status-algorithm",
  );
  const data = derItems(basic[0].value);
  let at = 0;
  if (data[at]?.tag === 0xa0) {
    requireIntegrity(
      derOnly(data[at++].value, 2).equals(Buffer.from([0])),
      "certificate-status-format",
    );
  }
  requireIntegrity(
    data[at]?.tag === 0xa1 ||
      (data[at]?.tag === 0xa2 && derOnly(data[at].value, 4).length === 20),
    "certificate-status-responder",
  );
  at++;
  const producedAt = time(data[at++]);
  requireIntegrity(data[at]?.tag === 0x30, "certificate-status-format");
  const responses = derItems(data[at++].value),
    ids = new Set<string>();
  requireIntegrity(
    responses.length > 0 && responses.length <= 8,
    "certificate-status-format",
  );
  let found: Omit<OcspStatus, "producedAt" | "validUntil"> | undefined;
  for (const item of responses) {
    requireIntegrity(item.tag === 0x30, "certificate-status-format");
    const fields = derItems(item.value);
    requireIntegrity(
      fields.length >= 3 && fields.length <= 5 && fields[0].tag === 0x30,
      "certificate-status-format",
    );
    const id = identifier(fields[0].value);
    requireIntegrity(!ids.has(id), "certificate-status-id");
    ids.add(id);
    if (id !== expectedId) continue;
    const tag = fields[1].tag;
    requireIntegrity(
      tag === 0x80 || tag === 0x82
        ? fields[1].value.length === 0
        : tag === 0xa1,
      "certificate-status-format",
    );
    const thisUpdate = time(fields[2]);
    let nextUpdate: number | null = null,
      index = 3;
    if (fields[index]?.tag === 0xa0)
      nextUpdate = time({
        tag: 0x18,
        value: derOnly(fields[index++].value, 0x18),
      });
    if (fields[index]?.tag === 0xa1) extensions(fields[index++].value);
    requireIntegrity(index === fields.length, "certificate-status-format");
    found = {
      status: tag === 0x80 ? "good" : tag === 0xa1 ? "revoked" : "unknown",
      thisUpdate,
      nextUpdate,
    };
  }
  if (data[at]?.tag === 0xa1) extensions(data[at++].value);
  requireIntegrity(at === data.length && found, "certificate-status-id");
  const certificates: X509Certificate[] = [];
  if (basic.length === 4) {
    requireIntegrity(basic[3].tag === 0xa0, "certificate-status-format");
    const encoded = derItems(derOnly(basic[3].value, 0x30));
    requireIntegrity(
      encoded.length > 0 && encoded.length <= 4,
      "certificate-status-format",
    );
    for (const value of encoded) {
      requireIntegrity(value.tag === 0x30, "certificate-status-format");
      certificates.push(new X509Certificate(ocspDer(0x30, value.value)));
    }
  }
  return { ...found, producedAt, certificates };
}

/** Verifies supplied OCSP bytes offline. The caller owns approved transport.
 * OpenSSL validates signature, responder authorization and the pinned chain;
 * independent DER checks bind the exact certificate and bounded status times. */
export class OcspVerifier {
  private active = 0;
  constructor(
    private readonly root: X509Certificate,
    private readonly opensslPath = "/usr/bin/openssl",
    private readonly clock: () => number = Date.now,
  ) {
    requireIntegrity(
      isAbsolute(opensslPath) &&
        root.ca &&
        root.checkIssued(root) &&
        root.verify(root.publicKey),
      "certificate-status-policy",
    );
  }
  async verify(
    certificate: X509Certificate,
    issuer: X509Certificate,
    chain: X509Certificate[],
    response: Buffer,
    signal?: AbortSignal,
  ): Promise<OcspStatus> {
    requireIntegrity(!signal?.aborted, "certificate-status-cancelled");
    requireIntegrity(this.active < 2, "certificate-status-busy");
    this.active++;
    let directory: string | undefined;
    try {
      requireIntegrity(
        response.length <= ocspResponseLimit,
        "certificate-status-format",
      );
      response = Buffer.from(response);
      requireIntegrity(
        issuer.ca &&
          certificate.checkIssued(issuer) &&
          certificate.verify(issuer.publicKey) &&
          chain.length <= 4,
        "certificate-status-chain",
      );
      const request = ocspRequest(certificate, issuer),
        expectedId = identifier(
          derOnly(certificateId(certificate, issuer), 0x30),
        ),
        parsed = parseResponse(response, expectedId);
      const fresh = () => {
        const now = this.clock();
        requireIntegrity(
          Number.isSafeInteger(now) &&
            now >= 0 &&
            parsed.producedAt <= now + clockSkew &&
            parsed.thisUpdate <= now + clockSkew &&
            parsed.thisUpdate <= parsed.producedAt + clockSkew &&
            now - parsed.thisUpdate <= maxAge &&
            now - parsed.producedAt <= maxAge,
          "certificate-status-time",
        );
        if (parsed.nextUpdate !== null)
          requireIntegrity(
            parsed.nextUpdate > parsed.thisUpdate && parsed.nextUpdate > now,
            "certificate-status-time",
          );
        const certificates = [
          certificate,
          issuer,
          this.root,
          ...chain,
          ...parsed.certificates,
        ];
        for (const cert of certificates)
          requireIntegrity(
            Date.parse(cert.validFrom) <= now && Date.parse(cert.validTo) > now,
            "certificate-status-time",
          );
        const validUntil = Math.min(
          parsed.nextUpdate ?? parsed.thisUpdate + 600000,
          parsed.thisUpdate + maxAge,
          parsed.producedAt + maxAge,
          ...certificates.map((c) => Date.parse(c.validTo)),
        );
        requireIntegrity(validUntil > now, "certificate-status-time");
        return validUntil;
      };
      fresh();
      directory = await mkdtemp(join(tmpdir(), "cubers-ocsp-"));
      await chmod(directory, 0o700);
      const ca = join(directory, "root.pem"),
        issuers = join(directory, "issuers.pem"),
        req = join(directory, "request.der"),
        res = join(directory, "response.der"),
        empty = join(directory, "empty-ca");
      await mkdir(empty, { mode: 0o700 });
      for (const [file, content] of [
        [ca, this.root.toString()],
        [issuers, [issuer, ...chain].map((c) => c.toString()).join("\n")],
        [req, request],
        [res, response],
      ] as const)
        await writeFile(file, content, { flag: "wx", mode: 0o600 });
      const job = run(
        this.opensslPath,
        [
          "ocsp",
          "-reqin",
          req,
          "-respin",
          res,
          "-CAfile",
          ca,
          "-verify_other",
          issuers,
          "-no-CApath",
          "-no-CAstore",
          "-no_explicit",
          "-no_nonce",
          "-x509_strict",
          "-auth_level",
          "2",
          "-verify_depth",
          "3",
          "-attime",
          String(Math.floor(this.clock() / 1000)),
          "-validity_period",
          "5",
          "-status_age",
          "600",
        ],
        {
          cwd: directory,
          timeout: 2000,
          killSignal: "SIGKILL",
          signal,
          maxBuffer: 32768,
          env: {
            PATH: "/usr/bin:/bin",
            OPENSSL_CONF: "/dev/null",
            SSL_CERT_FILE: ca,
            SSL_CERT_DIR: empty,
          },
        },
      );
      const closed = new Promise<void>((resolve) =>
        job.child.once("close", () => resolve()),
      );
      let output: Awaited<typeof job>;
      try {
        output = await job;
      } finally {
        await closed;
      }
      requireIntegrity(
        output.stderr.trim() === "Response verify OK",
        "certificate-status-signature",
      );
      // A delegated responder needs an explicit issuer-signed lifetime policy.
      // Otherwise its own revocation would require another reviewed mechanism.
      for (const responder of parsed.certificates)
        requireIntegrity(
          [issuer, ...chain, this.root].some((c) =>
            c.raw.equals(responder.raw),
          ) ||
            certificateExtensions(responder)
              .get("2b0601050507300105")
              ?.equals(Buffer.from("0500", "hex")),
          "certificate-status-responder-policy",
        );
      requireIntegrity(!signal?.aborted, "certificate-status-cancelled");
      return {
        status: parsed.status,
        producedAt: parsed.producedAt,
        thisUpdate: parsed.thisUpdate,
        nextUpdate: parsed.nextUpdate,
        validUntil: fresh(),
      };
    } catch (error) {
      if (error instanceof AttestationError) throw error;
      if (signal?.aborted)
        throw new AttestationError("certificate-status-cancelled");
      const e = error as { code?: string; killed?: boolean };
      throw new AttestationError(
        e.code === "ENOENT"
          ? "certificate-status-tool"
          : e.killed
            ? "certificate-status-timeout"
            : "certificate-status-signature",
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
