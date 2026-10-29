// Test emulator only: not part of the production runtime or an IAM validation.
const S3rver = require("s3rver");
const { DUMMY_ACCOUNT } = require("s3rver/lib/models/account");
const fs = require("node:fs");
DUMMY_ACCOUNT.revokeAccessKey("S3RVER");
DUMMY_ACCOUNT.createKeyPair(
  process.env.S3_ACCESS_KEY,
  process.env.S3_SECRET_KEY,
);
const directory = process.env.STORAGE_DIRECTORY || "/tmp/storage";
fs.mkdirSync(directory, { recursive: true });
const origins = (process.env.STORAGE_CORS_ORIGINS || "")
  .split(",")
  .filter(Boolean)
  .map((value) => {
    const origin = new URL(value);
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.origin !== value
    )
      throw new Error("Invalid development storage origin");
    return `<AllowedOrigin>${origin.origin}</AllowedOrigin>`;
  });
const configs = origins.length
  ? [
      `<CORSConfiguration><CORSRule>${origins.join("")}<AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader></CORSRule></CORSConfiguration>`,
    ]
  : [];
const storage = new S3rver({
  address: "0.0.0.0",
  port: 9000,
  silent: true,
  vhostBuckets: false,
  directory,
  configureBuckets: (process.env.S3_BUCKETS || process.env.S3_BUCKET)
    .split(",")
    .map((name) => ({ name, configs })),
});
// S3rver permits unsigned reads. This test wrapper requires authentication;
// production private-bucket policies must still be tested on the real service.
storage.middleware.unshift(async (ctx, next) => {
  if (
    ctx.method !== "OPTIONS" &&
    !ctx.headers.authorization &&
    !ctx.query["X-Amz-Signature"]
  ) {
    ctx.status = 403;
    ctx.body = "Authentication required";
    return;
  }
  await next();
});
storage.run().catch(() => {
  console.error("Storage emulator startup failed");
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => void storage.close());
