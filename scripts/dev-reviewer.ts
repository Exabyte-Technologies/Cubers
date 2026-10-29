// Explicit development-only fixture for UI verification. Never call this during production seeding.
import { PrismaClient } from "@prisma/client";
import { passwordHash } from "../apps/api/src/crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { authenticator } from "otplib";
async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    !process.env.DATABASE_URL?.includes("127.0.0.1")
  )
    throw new Error("Development fixture requires local database");
  const db = new PrismaClient(),
    password = randomBytes(18).toString("base64url"),
    secret = authenticator.generateSecret();
  const user = await db.user.upsert({
    where: { email: "reviewer@cubers.local" },
    create: {
      email: "reviewer@cubers.local",
      displayName: "Local test reviewer",
      passwordHash: await passwordHash(password),
      birthDate: "1990-01-01",
      region: "INTL",
      emailVerified: true,
      adultVerified: true,
      identityVerified: true,
      role: "ADMIN",
      mfaSecret: secret,
    },
    update: { passwordHash: await passwordHash(password), mfaSecret: secret },
  });
  await mkdir(".data", { recursive: true, mode: 0o700 });
  await writeFile(
    ".data/reviewer.json",
    JSON.stringify({ email: user.email, password, totpSecret: secret }),
    { mode: 0o600 },
  );
  await db.$disconnect();
  console.log(
    "Local-only reviewer fixture created. Credentials are in the ignored .data/reviewer.json file.",
  );
}
void main();
