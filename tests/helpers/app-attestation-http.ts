// Only tests inject a synthetic certificate root. Production always pins Apple.
import "reflect-metadata";
import { Module, Catch, type ExceptionFilter } from "@nestjs/common";
import { NestFactory, APP_GUARD } from "@nestjs/core";
import {
  createPublicKey,
  randomBytes,
  randomUUID,
  generateKeyPairSync,
} from "node:crypto";
import { writeFile, realpath, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Db, Infrastructure } from "../../apps/api/src/services";
import { Security } from "../../apps/api/src/security";
import { AppAttestations } from "../../apps/api/src/app-attestation";
import { AppAttestationController } from "../../apps/api/src/app-attestation.controller";
import { PlayController } from "../../apps/api/src/play.controller";
import { Competitions } from "../../apps/api/src/competitions";
import { SmartPlayAccess } from "../../apps/api/src/smart-play-access";
import { AppAttestationCrypto } from "../../apps/api/src/attestation/provider";
import { AppleAppAttestCrypto } from "../../apps/api/src/attestation/apple";
import {
  AppleEnrollmentVerifier,
  AppleReceiptVerifier,
} from "../../apps/api/src/attestation/apple-receipt";
import { receiptFixture, receiptOpenSsl } from "./apple-receipt-fixture";
import { receiptScheduleOff } from "../../apps/api/src/attestation/receipt-schedule";
import { encodeCbor } from "./app-attest-fixture";
import { PlayIntegrityProvider } from "../../apps/api/src/attestation/google-provider";
import { PlayIntegrityCrypto } from "../../apps/api/src/attestation/google";
import { AppleReceiptExchange } from "../../apps/api/src/attestation/apple-exchange";
import type { AppleReceiptPolicy } from "../../apps/api/src/attestation/apple-receipt";
import type { AppleReceiptCredential } from "../../apps/api/src/attestation/apple-credentials";

export async function withAppAttestationHttp(
  db: Db,
  infra: Infrastructure,
  work: (f: {
    call: (
      path: string,
      body?: unknown,
      token?: string,
      method?: string,
    ) => Promise<{ status: number; body: any }>;
    game: (
      path: string,
      body: unknown,
      token: string,
    ) => Promise<{ status: number; body: any }>;
    play: PlayController;
    native: ReturnType<typeof receiptFixture>;
    proof: (challenge: any) => any;
    assertion: (challenge: any, counter: number, version?: string) => any;
    service: AppAttestations;
    infra: Infrastructure;
    crypto: AppAttestationCrypto;
    config: Infrastructure["config"];
    errors: unknown[];
    pause: (hook?: () => Promise<void>) => void;
    certificateStatus: (state: {
      until?: number;
      unavailable?: boolean;
    }) => void;
    pauseCertificateStatus: (hook?: () => Promise<void>) => void;
    playToken: (challenge: any, change?: (payload: any) => void) => string;
    googleCalls: () => number;
    appleCalls: () => number;
    receiptResponse: (response: {
      status?: number;
      risk?: number;
      notBeforeDelayMs?: number;
    }) => void;
  }) => Promise<void>,
  options: { play?: boolean; receipt?: boolean } = {},
) {
  const native = receiptFixture();
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "cubers-http-attest-")),
  );
  const secretPath = join(directory, "receipt-key.json");
  const credentialPath = join(directory, "apple-devicecheck.json");
  if (options.receipt)
    await writeFile(
      credentialPath,
      JSON.stringify({
        version: 1,
        teamId: native.appId.split(".")[0],
        keyId: "ABCDEFGHIJ",
        privateKey: generateKeyPairSync("ec", { namedCurve: "prime256v1" })
          .privateKey.export({ type: "pkcs8", format: "pem" })
          .toString(),
      }),
      { mode: 0o600 },
    );
  await writeFile(
    secretPath,
    JSON.stringify({
      version: 1,
      id: randomUUID(),
      key: randomBytes(32).toString("base64"),
    }),
    { mode: 0o600 },
  );
  const config = {
    ...infra.config,
    APP_ATTESTATION_APPLE_ENABLED: "true" as const,
    APP_ATTESTATION_APPLE_RECEIPT_ENABLED: options.receipt
      ? ("true" as const)
      : ("false" as const),
    APP_ATTESTATION_APPLE_CREDENTIAL_FILE: options.receipt
      ? credentialPath
      : undefined,
    APP_ATTESTATION_APPLE_RISK_MAX: options.receipt ? 5 : undefined,
    APP_ATTESTATION_APPLE_APP_ID: native.appId,
    APP_ATTESTATION_APPLE_BUILDS: "1",
    APP_ATTESTATION_APPLE_DISTRIBUTION: "app-store" as const,
    APP_ATTESTATION_RECEIPT_KEY_FILE: secretPath,
    APP_ATTESTATION_OPENSSL_PATH: receiptOpenSsl,
    APP_ATTESTATION_GOOGLE_ENABLED: options.play
      ? ("true" as const)
      : ("false" as const),
    APP_ATTESTATION_GOOGLE_PROJECT_NUMBER: "123456789012",
    APP_ATTESTATION_GOOGLE_PACKAGE: "app.cubers.mobile",
    APP_ATTESTATION_GOOGLE_SIGNERS: Buffer.alloc(32, 7).toString("base64url"),
    APP_ATTESTATION_GOOGLE_BUILDS: "42",
  };
  const localInfra = new Infrastructure(config);
  let hook: (() => Promise<void>) | undefined;
  let certificateHook: (() => Promise<void>) | undefined;
  let certificateState: { until?: number; unavailable?: boolean } = {};
  let googleCalls = 0;
  let appleCalls = 0;
  let receiptResponse: {
    status?: number;
    risk?: number;
    notBeforeDelayMs?: number;
  } = {};
  class SyntheticPlay extends PlayIntegrityProvider {
    override async onModuleInit() {}
    override available() {
      return options.play === true && config.REGION === "INTL";
    }
    override async verify(token: string, request: any) {
      const verifier = new PlayIntegrityCrypto(
        {
          packageName: config.APP_ATTESTATION_GOOGLE_PACKAGE,
          certificateDigests: [config.APP_ATTESTATION_GOOGLE_SIGNERS],
          versionCodes: ["42"],
        },
        async () => "synthetic-google-server-bearer",
        (async (url: string, init: RequestInit) => {
          googleCalls++;
          if (
            url !==
            "https://playintegrity.googleapis.com/v1/app.cubers.mobile:decodeIntegrityToken"
          )
            throw Error("Unexpected provider URL");
          const supplied = JSON.parse(init.body as string).integrity_token;
          if (!supplied.startsWith("synthetic."))
            throw Error("Invalid synthetic token");
          return new Response(
            Buffer.from(supplied.slice(10), "base64url").toString("utf8"),
            { headers: { "Content-Type": "application/json" } },
          );
        }) as typeof fetch,
      );
      const verified = await verifier.verifyToken(token, request);
      await hook?.();
      return verified;
    }
  }
  class SyntheticCrypto extends AppAttestationCrypto {
    override async ensureReceiptCertificateStatus(value: any) {
      await certificateHook?.();
      return this.receiptCertificateStatusUntil(value);
    }
    override receiptCertificateStatusUntil(value: any) {
      if (certificateState.unavailable)
        throw Error("Synthetic status unavailable");
      return Math.min(
        value.receipt.expiresAt,
        certificateState.until ?? Infinity,
      );
    }
    protected override createReceiptExchange(
      policy: AppleReceiptPolicy,
      credential: AppleReceiptCredential,
    ) {
      return new AppleReceiptExchange(
        policy,
        credential,
        new AppleReceiptVerifier(policy, native.root, receiptOpenSsl),
        (async (url) => {
          appleCalls++;
          if (url !== "https://data.appattest.apple.com/v1/attestationData")
            throw Error("Unexpected Apple URL");
          await hook?.();
          if (receiptResponse.status && receiptResponse.status !== 200)
            return new Response(null, { status: receiptResponse.status });
          const now = Date.now() + 1;
          const fields = native
            .fields("RECEIPT")
            .map(
              ([id, value]) =>
                [
                  id,
                  id === 12
                    ? Buffer.from(new Date(now).toISOString())
                    : id === 17
                      ? Buffer.from(String(receiptResponse.risk ?? 3))
                      : id === 19
                        ? Buffer.from(
                            new Date(
                              now +
                                (receiptResponse.notBeforeDelayMs ?? 3600000),
                            ).toISOString(),
                          )
                        : id === 21
                          ? Buffer.from(
                              new Date(now + 90 * 86400000).toISOString(),
                            )
                          : value,
                ] as [number, Buffer],
            );
          return new Response(native.sign(fields));
        }) as typeof fetch,
      );
    }
    override async enroll(proof: string, keyId: string, clientData: string) {
      const policy = this.policy();
      const result = await new AppleEnrollmentVerifier(
        new AppleAppAttestCrypto(policy, native.root),
        new AppleReceiptVerifier(
          { appId: policy.appId, environment: "production" },
          native.root,
          receiptOpenSsl,
        ),
      ).verify(proof, keyId, Buffer.from(clientData, "utf8"));
      await hook?.();
      return result;
    }
    override assertion(
      publicKeyPem: string,
      proof: string,
      clientData: string,
      counter: bigint,
    ) {
      return new AppleAppAttestCrypto(
        this.policy(),
        native.root,
      ).verifyAssertion(
        proof,
        createPublicKey(publicKeyPem),
        Buffer.from(clientData, "utf8"),
        Number(counter),
      );
    }
  }
  const crypto = new SyntheticCrypto(localInfra),
    errors: unknown[] = [];
  class FixtureModule {}
  Module({
    controllers: [AppAttestationController, PlayController],
    providers: [
      { provide: Db, useValue: db },
      { provide: Infrastructure, useValue: localInfra },
      { provide: AppAttestationCrypto, useValue: crypto },
      {
        provide: PlayIntegrityProvider,
        useValue: new SyntheticPlay(localInfra),
      },
      { provide: Competitions, useValue: new Competitions(db, localInfra) },
      { provide: SmartPlayAccess, useValue: new SmartPlayAccess() },
      AppAttestations,
      { provide: APP_GUARD, useClass: Security },
    ],
  })(FixtureModule);
  class InvalidRequest implements ExceptionFilter {
    catch(error: any, host: any) {
      const status =
        error.getStatus?.() || (error.name === "ZodError" ? 400 : 500);
      if (status === 500) errors.push(error);
      host
        .switchToHttp()
        .getResponse()
        .status(status)
        .json({ message: "Invalid request" });
    }
  }
  Catch()(InvalidRequest);
  const app = await NestFactory.create(FixtureModule, { logger: false });
  let fixtureKeyPolicy: string | undefined;
  try {
    app.useGlobalFilters(new InvalidRequest());
    await app.listen(0, "127.0.0.1");
    fixtureKeyPolicy = app.get(AppAttestationCrypto).keyPolicyDigest();
    const base = await app.getUrl();
    await work({
      native,
      service: app.get(AppAttestations),
      infra: localInfra,
      play: app.get(PlayController),
      game: async (path, body, token) => {
        const response = await fetch(`${base}/v1/${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        return { status: response.status, body: await response.json() };
      },
      crypto,
      config,
      errors,
      pause: (next) => {
        hook = next;
      },
      certificateStatus: (next) => {
        certificateState = next;
      },
      pauseCertificateStatus: (next) => {
        certificateHook = next;
      },
      googleCalls: () => googleCalls,
      appleCalls: () => appleCalls,
      receiptResponse: (next) => {
        receiptResponse = next;
      },
      playToken: (challenge, change) => {
        const payload = {
          tokenPayloadExternal: {
            requestDetails: {
              requestPackageName: config.APP_ATTESTATION_GOOGLE_PACKAGE,
              requestHash: challenge.requestHash,
              timestampMillis: String(Date.now()),
            },
            accountDetails: { appLicensingVerdict: "LICENSED" },
            appIntegrity: {
              appRecognitionVerdict: "PLAY_RECOGNIZED",
              packageName: config.APP_ATTESTATION_GOOGLE_PACKAGE,
              certificateSha256Digest: [config.APP_ATTESTATION_GOOGLE_SIGNERS],
              versionCode: "42",
            },
            deviceIntegrity: {
              deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"],
            },
          },
        };
        change?.(payload);
        return (
          "synthetic." +
          Buffer.from(JSON.stringify(payload)).toString("base64url")
        );
      },
      call: async (path, body, token, method) => {
        const response = await fetch(`${base}/v1/me/app-attestation${path}`, {
          method: method || (body === undefined ? "GET" : "POST"),
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, body: await response.json() };
      },
      proof: (challenge) => {
        const object = native.object({
          signingChallenge: Buffer.from(challenge.clientData, "utf8"),
        });
        const now = Date.now();
        const fields = native
          .fields()
          .map(
            ([id, value]) =>
              [
                id,
                id === 12
                  ? Buffer.from(new Date(now).toISOString())
                  : id === 21
                    ? Buffer.from(new Date(now + 90 * 86400000).toISOString())
                    : value,
              ] as [number, Buffer],
          );
        object
          .get("attStmt")
          .set("receipt", Buffer.from(native.sign(fields), "base64"));
        return {
          kind: "enroll",
          challengeId: challenge.id,
          clientData: challenge.clientData,
          keyId: native.keyId,
          attestation: encodeCbor(object).toString("base64"),
        };
      },
      assertion: (challenge, counter, version) => ({
        kind: "action",
        challengeId: challenge.id,
        clientData: challenge.clientData,
        assertion: native.assertion(counter, {
          signingChallenge: Buffer.from(challenge.clientData, "utf8"),
          version,
        }),
      }),
    });
  } finally {
    try {
      // This private synthetic receipt key is destroyed below. Leaving its
      // opt-ins due makes later five-key worker batches consume old fixtures.
      if (fixtureKeyPolicy)
        await db.appAttestationKey.updateMany({
          where: { policyDigest: fixtureKeyPolicy, receiptAutoRefresh: true },
          data: { ...receiptScheduleOff, version: { increment: 1 } },
        });
    } finally {
      await app.close();
      native.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
}
