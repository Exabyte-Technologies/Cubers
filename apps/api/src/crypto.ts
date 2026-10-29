import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { HttpException } from "@nestjs/common";
const scrypt = promisify(scryptCb);
let passwordJobs = 0;
async function derivePassword(password: string, salt: string) {
  // Bound memory and thread-pool pressure even when many distinct accounts
  // bypass a per-email throttle. Saturation fails closed instead of queuing.
  if (passwordJobs >= 4)
    throw new HttpException("Authentication busy. Try again shortly.", 429);
  passwordJobs++;
  try {
    return (await scrypt(password, salt, 64)) as Buffer;
  } finally {
    passwordJobs--;
  }
}
export const DUMMY_PASSWORD_HASH = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;
export const opaque = () => randomBytes(32).toString("base64url");
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derivePassword(password, salt);
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function passwordMatches(password: string, encoded: string) {
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded)) return false;
  const [, salt, key] = encoded.split(":");
  const actual = await derivePassword(password, salt);
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
