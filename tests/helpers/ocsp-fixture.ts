import {
  createHash,
  createPrivateKey,
  sign,
  X509Certificate,
} from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { receiptFixture, receiptOpenSsl } from "./apple-receipt-fixture";
import { derItems, derOnly } from "../../apps/api/src/attestation/binary";
import { ocspDer as d } from "../../apps/api/src/attestation/ocsp";

export function ocspFixture(withEndpoints = false) {
  const fixture = receiptFixture(),
    file = (name: string) => join(fixture.directory, name);
  const openssl = (...args: string[]) =>
    execFileSync(receiptOpenSsl, args, {
      cwd: fixture.directory,
      stdio: "pipe",
      timeout: 10000,
    });
  if (withEndpoints) {
    for (const [name, issuer, serial, url] of [
      ["issuer", "root", "2", "ocsp03-applerootcag3"],
      ["receipt", "issuer", "4", "ocsp03-aaica5g101"],
    ]) {
      writeFileSync(
        file(name + ".cnf"),
        readFileSync(file(name + ".cnf"), "utf8") +
          `authorityInfoAccess=OCSP;URI:http://ocsp.apple.com/${url}\n`,
        { mode: 0o600 },
      );
      openssl(
        "x509",
        "-req",
        "-in",
        name + ".csr",
        "-CA",
        issuer + ".pem",
        "-CAkey",
        issuer + ".key",
        "-set_serial",
        serial,
        "-out",
        name + ".pem",
        "-days",
        "1",
        "-extfile",
        name + ".cnf",
      );
    }
  }
  const certificate = new X509Certificate(readFileSync(file("receipt.pem"))),
    issuer = new X509Certificate(readFileSync(file("issuer.pem"))),
    issuerKey = createPrivateKey(readFileSync(file("issuer.key")));
  execFileSync(
    receiptOpenSsl,
    [
      "ocsp",
      "-issuer",
      file("issuer.pem"),
      "-cert",
      file("receipt.pem"),
      "-no_nonce",
      "-reqout",
      file("ocsp-request.der"),
    ],
    { stdio: "pipe", timeout: 10000 },
  );
  const request = readFileSync(file("ocsp-request.der"));
  openssl(
    "ocsp",
    "-issuer",
    "root.pem",
    "-cert",
    "issuer.pem",
    "-no_nonce",
    "-reqout",
    "ocsp-issuer-request.der",
  );
  const issuerRequest = readFileSync(file("ocsp-issuer-request.der"));
  let id: Buffer = request;
  let issuerId: Buffer = issuerRequest;
  for (let n = 0; n < 4; n++) id = derOnly(id, 0x30);
  for (let n = 0; n < 4; n++) issuerId = derOnly(issuerId, 0x30);
  const now = Date.now();
  const datetime = (n: number) =>
    d(
      0x18,
      Buffer.from(
        new Date(n)
          .toISOString()
          .replace(/[-:T]/g, "")
          .replace(/\.\d{3}/, ""),
      ),
    );
  function response(
    options: {
      status?: "good" | "revoked" | "unknown";
      thisUpdate?: number;
      producedAt?: number;
      nextUpdate?: number | null;
      duplicate?: boolean;
      criticalExtension?: boolean;
      weak?: boolean;
      unauthorized?: boolean;
      issuerStatus?: boolean;
      delegated?: "nocheck" | "unreviewed";
    } = {},
  ) {
    let delegated: X509Certificate | undefined;
    if (options.delegated) {
      writeFileSync(
        file("responder.cnf"),
        "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,OCSPSigning\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n" +
          (options.delegated === "nocheck"
            ? "1.3.6.1.5.5.7.48.1.5=DER:05:00\n"
            : ""),
        { mode: 0o600 },
      );
      openssl(
        "x509",
        "-req",
        "-in",
        "receipt.csr",
        "-CA",
        "issuer.pem",
        "-CAkey",
        "issuer.key",
        "-set_serial",
        "9",
        "-out",
        "responder.pem",
        "-days",
        "1",
        "-extfile",
        "responder.cnf",
      );
      delegated = new X509Certificate(readFileSync(file("responder.pem")));
    }
    const status = options.status ?? "good",
      responder =
        delegated ??
        (options.unauthorized
          ? certificate
          : options.issuerStatus
            ? fixture.root
            : issuer),
      key =
        options.unauthorized || delegated
          ? createPrivateKey(readFileSync(file("receipt.key")))
          : options.issuerStatus
            ? createPrivateKey(readFileSync(file("root.key")))
            : issuerKey,
      spki = responder.publicKey.export({ type: "spki", format: "der" }),
      keyBits = derItems(derOnly(spki, 0x30))[1].value.subarray(1),
      thisUpdate = options.thisUpdate ?? now - 1000,
      nextUpdate =
        options.nextUpdate === undefined ? now + 60000 : options.nextUpdate,
      single = d(
        0x30,
        Buffer.concat([
          options.issuerStatus ? issuerId : id,
          status === "good"
            ? d(0x80, Buffer.alloc(0))
            : status === "unknown"
              ? d(0x82, Buffer.alloc(0))
              : d(0xa1, datetime(now - 10000)),
          datetime(thisUpdate),
          ...(nextUpdate === null ? [] : [d(0xa0, datetime(nextUpdate))]),
        ]),
      ),
      data = d(
        0x30,
        Buffer.concat([
          d(0xa2, d(4, createHash("sha1").update(keyBits).digest())),
          datetime(options.producedAt ?? now - 1000),
          d(0x30, options.duplicate ? Buffer.concat([single, single]) : single),
          ...(options.criticalExtension
            ? [
                d(
                  0xa1,
                  d(
                    0x30,
                    d(
                      0x30,
                      Buffer.concat([
                        d(6, Buffer.from("2a0304", "hex")),
                        d(1, Buffer.from([255])),
                        d(4, d(5, Buffer.alloc(0))),
                      ]),
                    ),
                  ),
                ),
              ]
            : []),
        ]),
      ),
      algorithm = d(
        0x30,
        d(
          6,
          Buffer.from(
            options.weak ? "2a8648ce3d040301" : "2a8648ce3d040302",
            "hex",
          ),
        ),
      ),
      basic = d(
        0x30,
        Buffer.concat([
          data,
          algorithm,
          d(
            3,
            Buffer.concat([
              Buffer.from([0]),
              sign(options.weak ? "sha1" : "sha256", data, key),
            ]),
          ),
          ...(delegated || options.unauthorized
            ? [d(0xa0, d(0x30, responder.raw))]
            : []),
        ]),
      );
    return d(
      0x30,
      Buffer.concat([
        d(10, Buffer.from([0])),
        d(
          0xa0,
          d(
            0x30,
            Buffer.concat([
              d(6, Buffer.from("2b0601050507300101", "hex")),
              d(4, basic),
            ]),
          ),
        ),
      ]),
    );
  }
  return {
    ...fixture,
    now,
    certificate,
    issuer,
    request,
    issuerRequest,
    response,
    encoded: [certificate, issuer, fixture.root].map((c) =>
      c.raw.toString("base64"),
    ),
  };
}
