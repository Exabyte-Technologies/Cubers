import { z } from "zod";
const Env = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  REGION: z.enum(["CN", "INTL"]).default("INTL"),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.enum(["127.0.0.1", "0.0.0.0"]).optional(),
  TRUSTED_PROXY_CIDRS: z.string().default(""),
  // REGION is server-controlled; development/test use it directly (default INTL).
  DELETION_JOURNAL_MODE: z.enum(["disabled", "file"]).default("disabled"),
  DELETION_JOURNAL_DIRECTORY: z.string().optional(),
  DELETION_JOURNAL_KEY_FILE: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  APP_ORIGIN: z.string().url().default("http://localhost:8081"),
  ADMIN_ORIGIN: z.string().url().default("http://localhost:4173"),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("Cubers <noreply@example.invalid>"),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  OPERATIONS_ALERT_FILE: z.string().startsWith("/").max(400).optional(),
  OPERATIONS_ALERT_OUTBOX_DIRECTORY: z
    .string()
    .startsWith("/")
    .max(400)
    .optional(),
  OPERATIONS_ALERT_ALLOWED_HOSTS: z.string().max(2000).default(""),
  CONSENT_REVIEW_SOCKET: z
    .string()
    .startsWith("/")
    .max(200)
    .default("/run/cubers-documents/review.sock"),
  MEDIA_DAILY_BYTES: z.coerce
    .number()
    .int()
    .min(250 * 1024 * 1024)
    .max(10 * 1024 ** 3)
    .default(1024 ** 3),
  SCRAMBLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60000)
    .default(30000),
  APP_ATTESTATION_APPLE_ENABLED: z.enum(["true", "false"]).default("false"),
  APP_ATTESTATION_APPLE_RECEIPT_ENABLED: z
    .enum(["true", "false"])
    .default("false"),
  APP_ATTESTATION_APPLE_CREDENTIAL_FILE: z.string().optional(),
  APP_ATTESTATION_APPLE_AUTO_REFRESH: z
    .enum(["true", "false"])
    .default("false"),
  APP_ATTESTATION_APPLE_RISK_MAX: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().min(0).max(999999999).optional(),
  ),
  APP_ATTESTATION_APPLE_APP_ID: z.string().default(""),
  APP_ATTESTATION_APPLE_BUILDS: z.string().default(""),
  APP_ATTESTATION_APPLE_DISTRIBUTION: z
    .enum(["app-store", "testflight", "development"])
    .default("app-store"),
  APP_ATTESTATION_RECEIPT_KEY_FILE: z.string().optional(),
  APP_ATTESTATION_OPENSSL_PATH: z.string().default("/usr/bin/openssl"),
  APP_ATTESTATION_CN_APPROVED: z.enum(["true", "false"]).default("false"),
  APP_ATTESTATION_GOOGLE_ENABLED: z.enum(["true", "false"]).default("false"),
  APP_ATTESTATION_GOOGLE_PROJECT_NUMBER: z.string().default(""),
  APP_ATTESTATION_GOOGLE_PACKAGE: z.string().default(""),
  APP_ATTESTATION_GOOGLE_SIGNERS: z.string().default(""),
  APP_ATTESTATION_GOOGLE_BUILDS: z.string().default(""),
  APP_ATTESTATION_GOOGLE_CREDENTIAL_FILE: z.string().optional(),
  AI_MODE: z.enum(["disabled", "mock", "live"]).default("disabled"),
  AI_BASE_URL: z.string().url().optional(),
  AI_MODEL: z.string().default(""),
  AI_MODERATION_MODEL: z
    .string()
    .min(1)
    .max(100)
    .default("omni-moderation-latest"),
  AI_CN_GUARDRAILS_APPROVED: z.enum(["true", "false"]).default("false"),
  AI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  QWEN_API_KEY: z.string().optional(),
  AI_ALLOWED_HOSTS: z.string().default(""),
  AI_CN_APPROVED_HOSTS: z.string().default(""),
  AI_TIMEOUT_MS: z.coerce.number().int().min(50).max(30000).default(8000),
  CN_SOCIAL_APPROVED: z.enum(["true", "false"]).default("false"),
  CN_GAMES_APPROVED: z.enum(["true", "false"]).default("false"),
  CN_AI_APPROVED: z.enum(["true", "false"]).default("false"),
  SPONSORS_APPROVED: z.enum(["true", "false"]).default("false"),
  PUBLIC_RELEASE_APPROVED: z.enum(["true", "false"]).default("false"),
});
export type Config = z.infer<typeof Env>;
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const c = Env.parse(env);
  if (
    !!c.OPERATIONS_ALERT_FILE !== !!c.OPERATIONS_ALERT_OUTBOX_DIRECTORY ||
    (c.OPERATIONS_ALERT_FILE && !c.OPERATIONS_ALERT_ALLOWED_HOSTS.trim())
  )
    throw Error(
      "Operational alert delivery requires a private regional key file, independent outbox and exact approved hosts",
    );
  if (
    c.APP_ATTESTATION_APPLE_AUTO_REFRESH === "true" &&
    c.APP_ATTESTATION_APPLE_RECEIPT_ENABLED !== "true"
  )
    throw new Error(
      "Automatic receipt updates require the approved Apple receipt service",
    );
  if (c.APP_ATTESTATION_GOOGLE_ENABLED === "true") {
    const signers = c.APP_ATTESTATION_GOOGLE_SIGNERS.split(",");
    const builds = c.APP_ATTESTATION_GOOGLE_BUILDS.split(",");
    if (
      !/^[1-9][0-9]{5,18}$/.test(c.APP_ATTESTATION_GOOGLE_PROJECT_NUMBER) ||
      BigInt(c.APP_ATTESTATION_GOOGLE_PROJECT_NUMBER) > 9223372036854775807n ||
      !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(
        c.APP_ATTESTATION_GOOGLE_PACKAGE,
      ) ||
      c.APP_ATTESTATION_GOOGLE_PACKAGE.length > 200 ||
      signers.length > 8 ||
      !signers.every((v) => /^[A-Za-z0-9_-]{43}$/.test(v)) ||
      new Set(signers).size !== signers.length ||
      builds.length > 100 ||
      !builds.every((v) => /^[1-9][0-9]{0,18}$/.test(v)) ||
      new Set(builds).size !== builds.length ||
      !c.APP_ATTESTATION_GOOGLE_CREDENTIAL_FILE?.startsWith("/")
    )
      throw new Error(
        "Google app verification requires a project, package, exact signers/builds and private credential file",
      );
  }
  if (
    c.DELETION_JOURNAL_MODE === "file" &&
    (!c.DELETION_JOURNAL_DIRECTORY || !c.DELETION_JOURNAL_KEY_FILE)
  )
    throw new Error(
      "Configured deletion journaling requires an independent directory and key file",
    );
  if (c.APP_ATTESTATION_APPLE_ENABLED === "true") {
    const builds = c.APP_ATTESTATION_APPLE_BUILDS.split(",").map((v) =>
      v.trim(),
    );
    if (
      !/^[A-Z0-9]{10}\.[A-Za-z0-9.-]{3,200}$/.test(
        c.APP_ATTESTATION_APPLE_APP_ID,
      ) ||
      builds.length > 100 ||
      !builds.every(
        (v) => /^[0-9]+(?:\.[0-9]+){0,2}$/.test(v) && v.length <= 32,
      ) ||
      new Set(builds).size !== builds.length ||
      !c.APP_ATTESTATION_RECEIPT_KEY_FILE?.startsWith("/") ||
      !c.APP_ATTESTATION_OPENSSL_PATH.startsWith("/")
    )
      throw new Error(
        "Configured app verification requires an app identity, exact builds, private receipt key and absolute OpenSSL path",
      );
    if (
      c.NODE_ENV === "production" &&
      c.APP_ATTESTATION_APPLE_DISTRIBUTION !== "app-store"
    )
      throw new Error(
        "Production app verification requires App Store distribution",
      );
  }
  if (
    c.APP_ATTESTATION_APPLE_RECEIPT_ENABLED === "true" &&
    (c.APP_ATTESTATION_APPLE_ENABLED !== "true" ||
      !c.APP_ATTESTATION_APPLE_CREDENTIAL_FILE?.startsWith("/") ||
      c.APP_ATTESTATION_APPLE_RISK_MAX === undefined)
  )
    throw new Error(
      "Apple receipt exchange requires enabled app verification, a private DeviceCheck credential file and an explicit operator risk policy",
    );
  if (c.NODE_ENV === "production") {
    if (c.AI_MODE === "mock")
      throw new Error("Simulated AI is forbidden in production");
    if (!c.SMTP_URL) throw new Error("Production requires SMTP");
    if (
      !c.APP_ORIGIN.startsWith("https:") ||
      !c.ADMIN_ORIGIN.startsWith("https:")
    )
      throw new Error("Production origins require HTTPS");
    if (c.PUBLIC_RELEASE_APPROVED !== "true")
      throw new Error("Production release review is not approved");
    if (c.DELETION_JOURNAL_MODE !== "file")
      throw new Error(
        "Production requires an independently stored deletion journal",
      );
  }
  return c;
}
