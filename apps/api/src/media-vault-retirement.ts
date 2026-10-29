/** Minimal terminal custody: no owner, media, object-key or per-file retention data. */
import { createHmac } from "node:crypto";
import { z } from "zod";
import { canonicalSnapshotJson, readPrivateJson } from "./database-snapshot";
const Hex = z.string().regex(/^[a-f0-9]{64}$/),
  Uuid = z.string().uuid();
export const RetiredMediaTarget = z
  .object({
    version: z.literal(1),
    kind: z.literal("RETIRED_MEDIA_TARGET"),
    region: z.enum(["CN", "INTL"]),
    installationId: Uuid,
    journalKeyId: Hex,
    bundleId: Uuid,
    batchId: Uuid,
    source: Hex,
    snapshotId: Uuid,
    indexDigest: Hex,
    target: Hex,
    storage: Hex,
    bucket: z.string().min(3).max(63),
    expiresAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    objects: z.number().int().min(0).max(10000),
    authentication: Hex,
  })
  .strict();
export type RetiredMediaTarget = z.infer<typeof RetiredMediaTarget>;
export type TargetRetirementBinding = Pick<
  RetiredMediaTarget,
  | "region"
  | "installationId"
  | "journalKeyId"
  | "bundleId"
  | "batchId"
  | "source"
  | "expiresAt"
> & { indexDigest?: string };
function authenticate(
  body: Omit<RetiredMediaTarget, "authentication">,
  master: Buffer,
) {
  return createHmac("sha256", master)
    .update("cubers-target-retired-v1")
    .update(canonicalSnapshotJson(body))
    .digest("hex");
}
export function signTargetRetirement(
  body: Omit<RetiredMediaTarget, "authentication">,
  master: Buffer,
) {
  return RetiredMediaTarget.parse({
    ...body,
    authentication: authenticate(body, master),
  });
}
export async function readTargetRetirement(
  path: string,
  binding: TargetRetirementBinding,
  master: Buffer,
) {
  let raw: unknown;
  try {
    raw = await readPrivateJson(path, 8192);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }
  const proof = RetiredMediaTarget.parse(raw),
    { authentication, ...body } = proof;
  if (
    authentication !== authenticate(body, master) ||
    Object.entries(binding).some(
      ([key, value]) =>
        value !== undefined && proof[key as keyof RetiredMediaTarget] !== value,
    ) ||
    Date.parse(proof.completedAt) > Date.now() + 60000
  )
    throw Error(
      "Terminal target custody is damaged or belongs to another installation",
    );
  return proof;
}
