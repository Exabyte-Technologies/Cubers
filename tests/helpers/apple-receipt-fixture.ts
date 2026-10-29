import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { appleFixture } from "./app-attest-fixture";
export const receiptOpenSsl =
  process.platform === "darwin"
    ? existsSync("/opt/homebrew/opt/openssl@3/bin/openssl")
      ? "/opt/homebrew/opt/openssl@3/bin/openssl"
      : "/usr/local/opt/openssl@3/bin/openssl"
    : "/usr/bin/openssl";
const tlv = (tag: number, data: Buffer) =>
  Buffer.concat([
    Buffer.from([tag]),
    data.length < 128
      ? Buffer.from([data.length])
      : data.length <= 255
        ? Buffer.from([0x81, data.length])
        : Buffer.from([0x82, data.length >> 8, data.length & 255]),
    data,
  ]);
export const receiptPayload = (fields: [number, Buffer][]) =>
  tlv(
    0x31,
    Buffer.concat(
      fields.map(([id, value]) =>
        tlv(
          0x30,
          Buffer.concat([
            tlv(2, Buffer.from([id])),
            tlv(2, Buffer.from([1])),
            tlv(4, value),
          ]),
        ),
      ),
    ),
  );
export function receiptFixture() {
  const f = appleFixture(),
    write = (name: string, data: Buffer | string) =>
      writeFileSync(join(f.directory, name), data, { mode: 0o600 });
  const openssl = (...args: string[]) =>
    execFileSync(receiptOpenSsl, args, {
      cwd: f.directory,
      timeout: 10000,
      stdio: "pipe",
    });
  const signer = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  write(
    "receipt.key",
    signer.privateKey.export({ format: "pem", type: "pkcs8" }),
  );
  openssl(
    "req",
    "-new",
    "-key",
    "receipt.key",
    "-subj",
    "/CN=Cubers synthetic receipt signer",
    "-out",
    "receipt.csr",
  );
  function certificate(purpose = true) {
    write(
      "receipt.cnf",
      "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n" +
        (purpose ? "1.2.840.113635.100.12.15=DER:05:00\n" : ""),
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
      "4",
      "-out",
      "receipt.pem",
      "-days",
      "1",
      "-extfile",
      "receipt.cnf",
    );
  }
  certificate();
  // Evaluate synthetic receipts after all fixture certificates become valid.
  const now = Date.now() + 3600000;
  const fields = (
    type: "ATTEST" | "RECEIPT" = "ATTEST",
    key: KeyObject = f.leaf.publicKey,
  ): [number, Buffer][] => [
    [2, Buffer.from(f.appId)],
    [3, key.export({ format: "der", type: "spki" })],
    [4, Buffer.alloc(32, 1)],
    [5, Buffer.from("synthetic-receipt-token")],
    [6, Buffer.from(type)],
    [7, Buffer.from("production")],
    [12, Buffer.from(new Date(now).toISOString())],
    [21, Buffer.from(new Date(now + 90 * 86400000).toISOString())],
    ...(type === "RECEIPT"
      ? ([
          [17, Buffer.from("3")],
          [19, Buffer.from(new Date(now + 3600000).toISOString())],
        ] as [number, Buffer][])
      : []),
  ];
  function sign(
    fieldsInput: [number, Buffer][] = fields(),
    options: { stream?: boolean; noCerts?: boolean; noPurpose?: boolean } = {},
  ) {
    certificate(!options.noPurpose);
    write("payload.der", receiptPayload(fieldsInput));
    openssl(
      "cms",
      "-sign",
      "-binary",
      "-nodetach",
      "-nosmimecap",
      "-md",
      "sha256",
      "-in",
      "payload.der",
      "-signer",
      "receipt.pem",
      "-inkey",
      "receipt.key",
      "-certfile",
      "issuer.pem",
      "-outform",
      "DER",
      "-out",
      "signed.der",
      ...(options.stream ? ["-stream"] : []),
      ...(options.noCerts ? ["-nocerts"] : []),
    );
    return readFileSync(join(f.directory, "signed.der")).toString("base64");
  }
  return { ...f, now, fields, sign };
}
