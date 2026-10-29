import { z } from "zod";
const Id = z
  .string()
  .uuid()
  .transform((v) => v.toLowerCase());
export const AppAttestationProvider = z.enum([
  "apple-app-attest",
  "google-play",
]);
export const AppAttestationOperation = z.enum([
  "record",
  "inspect",
  "start",
  "finish",
  "evidence",
]);
export type AppAttestationOperation = z.infer<typeof AppAttestationOperation>;
const Nonce = z.string().min(1).max(256);
const AppleKeyId = z
  .string()
  .length(44)
  .regex(/^[A-Za-z0-9+/]{43}=$/);
export const AppAttestationChallengeRequest = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("play-action"),
      provider: z.literal("google-play"),
      attemptId: Id,
      operation: AppAttestationOperation,
      body: z.unknown(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("enroll"),
      provider: AppAttestationProvider,
      keyId: AppleKeyId,
    })
    .strict(),
  z
    .object({
      kind: z.literal("action"),
      provider: AppAttestationProvider,
      keyId: Id,
      attemptId: Id,
      operation: AppAttestationOperation,
      body: z.unknown(),
    })
    .strict(),
]);
type Operation = z.infer<typeof AppAttestationOperation>;
const NonceBody = z.object({ nonce: Nonce }).strict();
const ActionBodies = {
  record: NonceBody,
  inspect: NonceBody,
  finish: NonceBody,
  start: z
    .object({ nonce: Nonce, recordingStarted: z.boolean().optional() })
    .strict(),
  evidence: z.object({ nonce: Nonce, evidenceId: Id }).strict(),
};
type ActionBody<O extends Operation> = z.output<(typeof ActionBodies)[O]>;
export function appAttestationActionBody<O extends Operation>(
  operation: O,
  body: unknown,
): ActionBody<O> {
  return ActionBodies[operation].parse(body) as ActionBody<O>;
}
/** The grant is a transport credential, excluded from the signed action digest. */
export function appAttestationActionRequest<O extends Operation>(
  operation: O,
  body: unknown,
): ActionBody<O> & { appProofId?: string } {
  return ActionBodies[operation]
    .extend({ appProofId: Id.optional() })
    .strict()
    .parse(body) as ActionBody<O> & { appProofId?: string };
}
export const AppAttestationProofRequest = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("play-action"),
      challengeId: Id,
      clientData: z.string().regex(/^[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/),
      integrityToken: z
        .string()
        .min(16)
        .max(32768)
        .regex(/^[\x21-\x7e]+$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal("enroll"),
      challengeId: Id,
      clientData: z.string().regex(/^[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/),
      keyId: AppleKeyId,
      attestation: z.string().min(1).max(43692),
    })
    .strict(),
  z
    .object({
      kind: z.literal("action"),
      challengeId: Id,
      clientData: z.string().regex(/^[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/),
      assertion: z.string().min(1).max(5464),
    })
    .strict(),
]);
export const AppAttestationKeyVersion = z
  .object({ expectedVersion: z.number().int().nonnegative() })
  .strict();
export const AppAttestationReceiptSchedule = z
  .object({
    expectedVersion: z.number().int().min(0).max(2147483647),
    enabled: z.boolean(),
  })
  .strict();
export const AppAttestationKeyView = z
  .object({
    id: Id,
    provider: z.literal("apple-app-attest"),
    version: z.number().int().nonnegative(),
    status: z.enum(["ACTIVE", "REVOKED", "EXPIRED"]),
    enrolledBundleVersion: z.string().min(1).max(32),
    bundleVersion: z.string().min(1).max(32),
    distribution: z.enum(["app-store", "testflight", "development"]),
    createdAt: z.string().datetime(),
    lastVerifiedAt: z.string().datetime(),
    receiptExpiresAt: z.string().datetime(),
    receiptAutoRefresh: z.boolean().default(false),
    receiptRefreshAt: z.string().datetime().nullable().default(null),
    rankingEligible: z.literal(false),
  })
  .strict();
export const AppAttestationCatalogue = z
  .object({
    providers: z
      .array(
        z
          .object({
            provider: AppAttestationProvider,
            platform: z.enum(["ios", "android"]),
            available: z.boolean(),
            receiptRefreshAvailable: z.boolean().optional(),
            receiptAutoRefreshAvailable: z.boolean().optional(),
            cloudProjectNumber: z
              .string()
              .regex(/^[1-9][0-9]{5,18}$/)
              .optional(),
          })
          .strict(),
      )
      .max(2),
    rankingEnabled: z.literal(false),
    keys: z.array(AppAttestationKeyView).max(50),
  })
  .strict();
export const AppAttestationReceiptRefreshResult = z
  .object({
    key: AppAttestationKeyView,
    refreshed: z.boolean(),
    retryAt: z.string().datetime().nullable(),
    assessment: z.enum(["accepted", "review-required"]).optional(),
    rankingEligible: z.literal(false),
  })
  .strict();
