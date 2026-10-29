import { createHash, createPublicKey } from "node:crypto";
import type { AppAttestationKey } from "@prisma/client";
import type { AppAttestationCrypto } from "./provider";
import { requireIntegrity } from "./binary";
/** Open the authenticated envelope and bind every stored identity and expiry.
 * The caller separately locks and checks the current owner/guardian authority. */
export function openAppleKey(
  key: AppAttestationKey,
  region: "INTL" | "CN",
  crypto: AppAttestationCrypto,
) {
  requireIntegrity(
    key.provider === "apple-app-attest" &&
      key.status === "ACTIVE" &&
      !!key.publicKeyPem &&
      !!key.receiptCiphertext &&
      key.policyDigest === crypto.keyPolicyDigest() &&
      key.receiptExpiresAt.getTime() > Date.now(),
    "receipt-storage",
  );
  const value = crypto.open(
    { region, userId: key.userId, id: key.id, keyIdHash: key.keyIdHash },
    key.receiptCiphertext!,
  );
  const publicHash = createHash("sha256")
    .update(
      createPublicKey(key.publicKeyPem!).export({
        type: "spki",
        format: "der",
      }),
    )
    .digest("hex");
  requireIntegrity(
    value.publicKeyPem === key.publicKeyPem &&
      value.appId === key.appId &&
      value.distribution === key.distribution &&
      value.bundleVersion === key.enrolledBundleVersion &&
      value.receipt.publicKeySha256 === publicHash &&
      key.publicKeyHash === publicHash &&
      value.receipt.expiresAt === key.receiptExpiresAt.getTime() &&
      createHash("sha256")
        .update(Buffer.from(value.receiptBase64, "base64"))
        .digest("hex") === value.receipt.receiptSha256,
    "receipt-storage",
  );
  return value;
}
