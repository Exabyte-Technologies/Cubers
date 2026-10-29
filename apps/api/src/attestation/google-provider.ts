import { Injectable, Inject, OnModuleInit } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Infrastructure } from "../services";
import { PlayIntegrityCrypto, type IntegrityRequest } from "./google";
import { googleCredentials } from "./google-credentials";
@Injectable()
export class PlayIntegrityProvider implements OnModuleInit {
  private credentials?: Awaited<ReturnType<typeof googleCredentials>>;
  private verifier?: PlayIntegrityCrypto;
  private active = 0;
  private initialPolicy?: string;
  constructor(@Inject(Infrastructure) protected infra: Infrastructure) {}
  async onModuleInit() {
    if (this.infra.config.APP_ATTESTATION_GOOGLE_ENABLED !== "true") return;
    if (this.infra.config.REGION !== "INTL")
      throw Error(
        "Google Play verification is not commissioned for this community",
      );
    this.credentials = await googleCredentials(
      this.infra.config.APP_ATTESTATION_GOOGLE_CREDENTIAL_FILE!,
    );
    const c = this.infra.config;
    this.verifier = new PlayIntegrityCrypto(
      {
        packageName: c.APP_ATTESTATION_GOOGLE_PACKAGE,
        certificateDigests: c.APP_ATTESTATION_GOOGLE_SIGNERS.split(","),
        versionCodes: c.APP_ATTESTATION_GOOGLE_BUILDS.split(","),
      },
      async (signal) => {
        if (signal.aborted) throw Error("Verification cancelled");
        const token = await this.credentials!.client.getAccessToken();
        if (signal.aborted || !token.token)
          throw Error("Verification cancelled");
        return token.token;
      },
    );
    this.initialPolicy = this.policyDigest();
  }
  available() {
    return (
      this.infra.config.REGION === "INTL" &&
      this.infra.config.APP_ATTESTATION_GOOGLE_ENABLED === "true" &&
      !!this.verifier &&
      this.initialPolicy === this.policyDigest()
    );
  }
  policyDigest() {
    const c = this.infra.config;
    return createHash("sha256")
      .update(
        JSON.stringify([
          "CubersPlay1",
          c.REGION,
          c.APP_ATTESTATION_GOOGLE_PROJECT_NUMBER,
          c.APP_ATTESTATION_GOOGLE_PACKAGE,
          c.APP_ATTESTATION_GOOGLE_SIGNERS.split(","),
          c.APP_ATTESTATION_GOOGLE_BUILDS.split(","),
          this.credentials?.fingerprint,
          this.credentials?.projectId,
        ]),
      )
      .digest("hex");
  }
  reserve() {
    if (!this.available() || this.active >= 4)
      throw Error("Google verification unavailable or busy");
    this.active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active--;
      }
    };
  }
  verify(token: string, request: IntegrityRequest) {
    if (!this.verifier || !this.available())
      throw Error("Google verification unavailable");
    return this.verifier.verifyToken(token, request);
  }
}
