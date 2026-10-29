// Synthetic certificates and keys; never accepted by Cubers' pinned Apple root.
import { execFileSync } from "node:child_process";
import {
  generateKeyPairSync,
  createHash,
  sign,
  X509Certificate,
} from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
export function encodeCbor(value: any): Buffer {
  const head = (major: number, n: number) =>
    n < 24
      ? Buffer.from([(major << 5) | n])
      : n <= 255
        ? Buffer.from([(major << 5) | 24, n])
        : n <= 65535
          ? Buffer.from([(major << 5) | 25, n >> 8, n & 255])
          : Buffer.from([
              (major << 5) | 26,
              n >>> 24,
              (n >>> 16) & 255,
              (n >>> 8) & 255,
              n & 255,
            ]);
  if (typeof value === "number")
    return head(value < 0 ? 1 : 0, value < 0 ? -value - 1 : value);
  if (Buffer.isBuffer(value))
    return Buffer.concat([head(2, value.length), value]);
  if (typeof value === "string") {
    const b = Buffer.from(value);
    return Buffer.concat([head(3, b.length), b]);
  }
  if (Array.isArray(value))
    return Buffer.concat([head(4, value.length), ...value.map(encodeCbor)]);
  if (value instanceof Map)
    return Buffer.concat([
      head(5, value.size),
      ...Array.from(value, ([key, val]) =>
        Buffer.concat([encodeCbor(key), encodeCbor(val)]),
      ),
    ]);
  throw new Error("Unsupported synthetic fixture type");
}
const sha = (data: Buffer | string) =>
  createHash("sha256").update(data).digest();
export function appleFixture() {
  const directory = mkdtempSync(join(tmpdir(), "cubers-attest-"));
  const file = (name: string) => join(directory, name);
  const write = (name: string, data: string | Buffer) =>
    writeFileSync(file(name), data, { mode: 0o600 });
  const openssl = (...args: string[]) =>
    execFileSync("openssl", args, {
      cwd: directory,
      stdio: "pipe",
      timeout: 10000,
    });
  const key = (name: string, curve: string) => {
    const pair = generateKeyPairSync("ec", { namedCurve: curve });
    write(
      name + ".key",
      pair.privateKey.export({ format: "pem", type: "pkcs8" }),
    );
    return pair;
  };
  const root = key("root", "secp384r1"),
    issuer = key("issuer", "secp384r1"),
    leaf = key("leaf", "prime256v1");
  write(
    "root.cnf",
    "[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=Cubers synthetic attestation root\n[ext]\nbasicConstraints=critical,CA:TRUE,pathlen:1\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always\n",
  );
  openssl(
    "req",
    "-new",
    "-x509",
    "-sha384",
    "-key",
    "root.key",
    "-out",
    "root.pem",
    "-days",
    "2",
    "-config",
    "root.cnf",
  );
  openssl(
    "req",
    "-new",
    "-key",
    "issuer.key",
    "-subj",
    "/CN=Cubers synthetic intermediate",
    "-out",
    "issuer.csr",
  );
  write(
    "issuer.cnf",
    "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always\n",
  );
  openssl(
    "x509",
    "-req",
    "-sha384",
    "-in",
    "issuer.csr",
    "-CA",
    "root.pem",
    "-CAkey",
    "root.key",
    "-set_serial",
    "2",
    "-out",
    "issuer.pem",
    "-days",
    "1",
    "-extfile",
    "issuer.cnf",
  );
  openssl(
    "req",
    "-new",
    "-key",
    "leaf.key",
    "-subj",
    "/CN=Cubers synthetic app key",
    "-out",
    "leaf.csr",
  );
  const jwk = leaf.publicKey.export({ format: "jwk" }),
    x = Buffer.from(jwk.x!, "base64url"),
    y = Buffer.from(jwk.y!, "base64url");
  const keyId = sha(Buffer.concat([Buffer.from([4]), x, y])),
    challenge = Buffer.alloc(32, 17),
    appId = "ABCDE12345.app.cubers.mobile";
  const properties = (category = 4, version = "1") =>
    new Map<any, any>([
      ["apple_bundle_version_01", version],
      ["apple_validation_category_01", Buffer.from([category, 0, 0, 0])],
    ]);
  const object = (
    options: {
      modify?: (auth: Buffer) => Buffer;
      category?: number;
      version?: string;
      extraCertificateExtension?: string;
      signingChallenge?: Buffer;
    } = {},
  ) => {
    const key = encodeCbor(
      new Map<any, any>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, x],
        [-3, y],
      ]),
    );
    let auth: Buffer = Buffer.concat([
      sha(appId),
      Buffer.from([0xc0]),
      Buffer.alloc(4),
      Buffer.from("appattest"),
      Buffer.alloc(7),
      Buffer.from([0, 32]),
      keyId,
      key,
      encodeCbor(properties(options.category, options.version)),
    ]);
    if (options.modify) auth = options.modify(auth);
    const nonce = sha(
      Buffer.concat([auth, sha(options.signingChallenge ?? challenge)]),
    );
    const der = Buffer.concat([Buffer.from("3024a1220420", "hex"), nonce])
      .toString("hex")
      .match(/../g)!
      .join(":");
    write(
      "leaf.cnf",
      "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n1.2.840.113635.100.8.2=DER:" +
        der +
        "\n" +
        (options.extraCertificateExtension ?? ""),
    );
    openssl(
      "x509",
      "-req",
      "-sha256",
      "-in",
      "leaf.csr",
      "-CA",
      "issuer.pem",
      "-CAkey",
      "issuer.key",
      "-set_serial",
      "3",
      "-out",
      "leaf.pem",
      "-days",
      "1",
      "-extfile",
      "leaf.cnf",
    );
    return new Map<any, any>([
      ["fmt", "apple-appattest"],
      [
        "attStmt",
        new Map<any, any>([
          [
            "x5c",
            [
              new X509Certificate(readFileSync(file("leaf.pem"))).raw,
              new X509Certificate(readFileSync(file("issuer.pem"))).raw,
            ],
          ],
          ["receipt", Buffer.from("synthetic-unverified-receipt")],
        ]),
      ],
      ["authData", auth],
    ]);
  };
  const assertion = (
    counter = 1,
    options: {
      category?: number;
      version?: string;
      modify?: (auth: Buffer) => Buffer;
      signingChallenge?: Buffer;
    } = {},
  ) => {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(counter);
    let auth: Buffer = Buffer.concat([
      sha(appId),
      Buffer.from([0x80]),
      count,
      encodeCbor(properties(options.category, options.version)),
    ]);
    if (options.modify) auth = options.modify(auth);
    return encodeCbor(
      new Map<any, any>([
        [
          "signature",
          sign(
            "sha256",
            Buffer.concat([auth, sha(options.signingChallenge ?? challenge)]),
            leaf.privateKey,
          ),
        ],
        ["authenticatorData", auth],
      ]),
    ).toString("base64");
  };
  return {
    directory,
    appId,
    challenge,
    keyId: keyId.toString("base64"),
    leaf,
    root: new X509Certificate(readFileSync(file("root.pem"))),
    object,
    assertion,
    close: () => rmSync(directory, { recursive: true, force: true }),
  };
}
