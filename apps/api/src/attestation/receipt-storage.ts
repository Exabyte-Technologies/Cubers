import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
const File = z
  .object({ version: z.literal(1), id: z.string().uuid(), key: z.string() })
  .strict();
export type ReceiptBinding = {
  region: "CN" | "INTL";
  userId: string;
  id: string;
  keyIdHash: string;
};
function fail(): never {
  throw new Error("Private app verification receipt storage is unavailable");
}
function aad(binding: ReceiptBinding) {
  return Buffer.from(
    JSON.stringify([
      "CubersReceipt1",
      binding.region,
      binding.userId,
      binding.id,
      binding.keyIdHash,
    ]),
  );
}
export class ReceiptStorage {
  private constructor(
    readonly id: string,
    private key: Buffer,
  ) {}
  static async load(path: string) {
    if (resolve(path) !== path || (await realpath(path)) !== path) fail();
    // Do not let a misconfigured FIFO block startup before the regular-file check.
    const f = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await f.stat();
      if (
        !info.isFile() ||
        info.nlink !== 1 ||
        ![0, process.getuid?.()].includes(info.uid) ||
        (info.mode & 0o177) !== 0 ||
        info.size > 4096
      )
        fail();
      const data = Buffer.alloc(4097),
        read = await f.read(data, 0, data.length, 0);
      if (read.bytesRead > 4096) fail();
      const parsed = File.parse(
        JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            data.subarray(0, read.bytesRead),
          ),
        ),
      );
      const key = Buffer.from(parsed.key, "base64");
      if (key.length !== 32 || key.toString("base64") !== parsed.key) fail();
      return new ReceiptStorage(parsed.id, key);
    } catch {
      fail();
    } finally {
      await f.close();
    }
  }
  seal(binding: ReceiptBinding, value: unknown) {
    const plaintext = Buffer.from(JSON.stringify(value));
    if (plaintext.length > 40000 || this.key.length !== 32) fail();
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(aad(binding));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    return JSON.stringify({
      v: 1,
      kid: this.id,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: ciphertext.toString("base64"),
    });
  }
  open(binding: ReceiptBinding, encoded: string): unknown {
    try {
      if (encoded.length > 65536 || this.key.length !== 32) fail();
      const e = z
        .object({
          v: z.literal(1),
          kid: z.literal(this.id),
          iv: z.string(),
          tag: z.string(),
          data: z.string(),
        })
        .strict()
        .parse(JSON.parse(encoded));
      const decode = (v: string, length?: number) => {
        const b = Buffer.from(v, "base64");
        if (
          b.toString("base64") !== v ||
          (length !== undefined && b.length !== length)
        )
          fail();
        return b;
      };
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        decode(e.iv, 12),
      );
      decipher.setAAD(aad(binding));
      decipher.setAuthTag(decode(e.tag, 16));
      const bytes = Buffer.concat([
        decipher.update(decode(e.data)),
        decipher.final(),
      ]);
      if (bytes.length > 40000) fail();
      return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
    } catch {
      fail();
    }
  }
  destroy() {
    this.key.fill(0);
    this.key = Buffer.alloc(0);
  }
}
