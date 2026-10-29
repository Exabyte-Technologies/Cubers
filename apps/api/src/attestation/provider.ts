import {
  Injectable,
  Inject,
  OnModuleInit,
  OnApplicationShutdown,
} from "@nestjs/common";
import { createHash, createPublicKey } from "node:crypto";
import { Infrastructure } from "../services";
import { ReceiptStorage, type ReceiptBinding } from "./receipt-storage";
import {
  appleEnrollmentVerifier,
  appleReceiptRootSha256,
  appleReceiptVerifier,
  appleReceiptTrustRoot,
  type AppleReceiptPolicy,
} from "./apple-receipt";
import {
  loadAppleReceiptCredential,
  type AppleReceiptCredential,
} from "./apple-credentials";
import {
  AppleReceiptExchange,
  type StoredAppleReceipt,
} from "./apple-exchange";
import { appleAppAttestCrypto, appleAttestationRootSha256 } from "./apple";
import {
  AppleCertificateStatus,
  appleCertificateStatusVersion,
} from "./apple-certificate-status";
export type EnrolledAppleKey = Awaited<
  ReturnType<ReturnType<typeof appleEnrollmentVerifier>["verify"]>
>;
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
@Injectable()
export class AppAttestationCrypto
  implements OnModuleInit, OnApplicationShutdown
{
  private storage?: ReceiptStorage;
  private certificateStatus?: AppleCertificateStatus;
  private receiptCredential?: AppleReceiptCredential;
  private exchange?: AppleReceiptExchange;
  private exchangePolicy?: string;
  private activeEnrollments = 0;
  private stopped = new AbortController();
  private jobs = new Set<Promise<EnrolledAppleKey>>();
  private cached?: {
    digest: string;
    verifier: ReturnType<typeof appleEnrollmentVerifier>;
  };
  reserveEnrollment() {
    if (this.activeEnrollments >= 2)
      throw new Error("App verification is busy; retry this pending challenge");
    this.activeEnrollments++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.activeEnrollments--;
      }
    };
  }
  constructor(@Inject(Infrastructure) protected infra: Infrastructure) {}
  async onModuleInit() {
    if (this.infra.config.APP_ATTESTATION_APPLE_ENABLED === "true") {
      this.storage = await ReceiptStorage.load(
        this.infra.config.APP_ATTESTATION_RECEIPT_KEY_FILE!,
      );
      this.certificateStatus = new AppleCertificateStatus(
        appleReceiptTrustRoot(),
        this.infra.config.APP_ATTESTATION_OPENSSL_PATH,
      );
    }
    if (this.infra.config.APP_ATTESTATION_APPLE_RECEIPT_ENABLED === "true") {
      const c = this.infra.config;
      this.receiptCredential = await loadAppleReceiptCredential(
        c.APP_ATTESTATION_APPLE_CREDENTIAL_FILE!,
        c.APP_ATTESTATION_APPLE_APP_ID.split(".")[0],
      );
      const policy = {
        appId: c.APP_ATTESTATION_APPLE_APP_ID,
        environment:
          c.APP_ATTESTATION_APPLE_DISTRIBUTION === "development"
            ? ("development" as const)
            : ("production" as const),
      };
      this.exchange = this.createReceiptExchange(
        policy,
        this.receiptCredential,
      );
      this.exchangePolicy = this.receiptPolicyDigest();
    }
  }
  protected createReceiptExchange(
    policy: AppleReceiptPolicy,
    credential: AppleReceiptCredential,
  ) {
    return new AppleReceiptExchange(
      policy,
      credential,
      appleReceiptVerifier(
        policy,
        this.infra.config.APP_ATTESTATION_OPENSSL_PATH,
        this.certificateStatus,
      ),
    );
  }
  private receiptPolicyDigest() {
    const c = this.infra.config;
    return digest([
      "CubersAppleReceiptService1",
      c.APP_ATTESTATION_APPLE_RECEIPT_ENABLED,
      c.APP_ATTESTATION_APPLE_CREDENTIAL_FILE,
      c.APP_ATTESTATION_APPLE_RISK_MAX,
      c.APP_ATTESTATION_APPLE_APP_ID,
      c.APP_ATTESTATION_APPLE_DISTRIBUTION,
      c.APP_ATTESTATION_OPENSSL_PATH,
      this.receiptCredential?.fingerprint,
      this.receiptCredential?.keyId,
    ]);
  }
  receiptRefreshAvailable() {
    return (
      this.available("apple-app-attest") &&
      !!this.exchange &&
      this.exchangePolicy === this.receiptPolicyDigest()
    );
  }
  refreshReceipt(value: StoredAppleReceipt, signal?: AbortSignal) {
    if (!this.receiptRefreshAvailable())
      throw new Error("Apple receipt exchange is unavailable");
    return this.exchange!.refresh(value, signal);
  }
  receiptRiskAccepted(value: EnrolledAppleKey) {
    if (this.infra.config.APP_ATTESTATION_APPLE_RECEIPT_ENABLED !== "true")
      return true;
    return (
      this.receiptRefreshAvailable() &&
      value.receipt.type === "RECEIPT" &&
      value.receipt.riskMetric !== null &&
      value.receipt.riskMetric <=
        this.infra.config.APP_ATTESTATION_APPLE_RISK_MAX!
    );
  }
  available(provider: string) {
    const c = this.infra.config;
    return (
      provider === "apple-app-attest" &&
      !this.stopped.signal.aborted &&
      !!this.storage &&
      !!this.certificateStatus &&
      (c.APP_ATTESTATION_APPLE_RECEIPT_ENABLED !== "true" ||
        (!!this.exchange &&
          this.exchangePolicy === this.receiptPolicyDigest())) &&
      c.APP_ATTESTATION_APPLE_ENABLED === "true" &&
      (c.REGION !== "CN" ||
        (c.CN_GAMES_APPROVED === "true" &&
          c.APP_ATTESTATION_CN_APPROVED === "true"))
    );
  }
  protected policy() {
    const c = this.infra.config;
    return {
      appId: c.APP_ATTESTATION_APPLE_APP_ID,
      distribution: c.APP_ATTESTATION_APPLE_DISTRIBUTION,
      bundleVersions: c.APP_ATTESTATION_APPLE_BUILDS.split(",").map((v) =>
        v.trim(),
      ),
    };
  }
  keyPolicyDigest() {
    const p = this.policy();
    return digest([
      "CubersAppleKeys1",
      p.appId,
      p.distribution,
      this.storage?.id,
      appleAttestationRootSha256,
      appleReceiptRootSha256,
      appleCertificateStatusVersion,
    ]);
  }
  policyDigest() {
    return digest([
      this.keyPolicyDigest(),
      this.policy().bundleVersions,
      this.receiptPolicyDigest(),
    ]);
  }
  enroll(proof: string, keyId: string, clientData: string) {
    const digest = this.policyDigest();
    if (this.cached?.digest !== digest)
      this.cached = {
        digest,
        verifier: appleEnrollmentVerifier(
          this.policy(),
          this.infra.config.APP_ATTESTATION_OPENSSL_PATH,
          this.certificateStatus,
        ),
      };
    const job = this.cached.verifier.verify(
      proof,
      keyId,
      Buffer.from(clientData, "utf8"),
      this.stopped.signal,
    );
    this.jobs.add(job);
    return job.finally(() => this.jobs.delete(job));
  }
  assertion(
    publicKeyPem: string,
    proof: string,
    clientData: string,
    counter: bigint,
  ) {
    return appleAppAttestCrypto(this.policy()).verifyAssertion(
      proof,
      createPublicKey(publicKeyPem),
      Buffer.from(clientData, "utf8"),
      Number(counter),
    );
  }
  ensureReceiptCertificateStatus(
    value: EnrolledAppleKey,
    signal?: AbortSignal,
  ) {
    if (!this.certificateStatus)
      throw new Error("Apple certificate status is unavailable");
    return this.certificateStatus.ensure(
      value.receipt.certificateChain ?? [],
      signal ?? this.stopped.signal,
    );
  }
  receiptCertificateStatusUntil(value: EnrolledAppleKey) {
    if (!this.certificateStatus)
      throw new Error("Apple certificate status is unavailable");
    return this.certificateStatus.until(value.receipt.certificateChain ?? []);
  }
  seal(binding: ReceiptBinding, value: EnrolledAppleKey) {
    if (!this.storage) throw new Error("App verification storage unavailable");
    return this.storage.seal(binding, value);
  }
  open(binding: ReceiptBinding, ciphertext: string): EnrolledAppleKey {
    if (!this.storage) throw new Error("App verification storage unavailable");
    return this.storage.open(binding, ciphertext) as EnrolledAppleKey;
  }
  async onApplicationShutdown() {
    this.stopped.abort();
    this.certificateStatus?.stop();
    this.exchange?.stop();
    this.receiptCredential?.destroy();
    await Promise.allSettled([...this.jobs]);
    this.storage?.destroy();
  }
}
