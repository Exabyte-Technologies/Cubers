import {
  Injectable,
  Inject,
  Optional,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  Prisma,
  type AppAttestationKey,
  type AppAttestationChallenge,
} from "@prisma/client";
import {
  createHash,
  randomBytes,
  randomUUID,
  createPublicKey,
} from "node:crypto";
import { z } from "zod";
import {
  AppAttestationChallengeRequest,
  AppAttestationProofRequest,
  AppAttestationKeyVersion,
  AppAttestationReceiptSchedule,
  appAttestationActionBody,
  permissions,
  playInput,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { communityWrite, type CommunityActor } from "./community-authority";
import { learningWrite, type LearningDeadline } from "./learning-authority";
import type { Authed } from "./security";
import {
  AppAttestationCrypto,
  type EnrolledAppleKey,
} from "./attestation/provider";
import { AttestationError } from "./attestation/binary";
import { Competitions } from "./competitions";
import { PlayIntegrityProvider } from "./attestation/google-provider";
import { openAppleKey } from "./attestation/apple-key-storage";
import {
  receiptRefreshAt,
  receiptScheduleOff,
} from "./attestation/receipt-schedule";
const Id = z
  .string()
  .uuid()
  .transform((v) => v.toLowerCase());
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const textHash = (v: string) => createHash("sha256").update(v).digest("hex");
type Tx = Prisma.TransactionClient;
type AttemptFrame = Prisma.AttemptGetPayload<{
  include: { room: { include: { competitionRound: true } } };
}>;
export function appAttestationKeySummary(key: AppAttestationKey) {
  return {
    id: key.id,
    provider: key.provider,
    version: key.version,
    status:
      key.status === "ACTIVE" && key.receiptExpiresAt <= new Date()
        ? "EXPIRED"
        : key.status,
    enrolledBundleVersion: key.enrolledBundleVersion,
    bundleVersion: key.bundleVersion,
    distribution: key.distribution,
    createdAt: key.createdAt,
    lastVerifiedAt: key.lastVerifiedAt,
    receiptExpiresAt: key.receiptExpiresAt,
    receiptAutoRefresh: key.receiptAutoRefresh,
    receiptRefreshAt: key.receiptRefreshAt,
    rankingEligible: false,
  };
}
@Injectable()
export class AppAttestations {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(AppAttestationCrypto) private crypto: AppAttestationCrypto,
    @Optional() @Inject(Competitions) private competitions?: Competitions,
    @Optional()
    @Inject(PlayIntegrityProvider)
    private playIntegrity?: PlayIntegrityProvider,
  ) {}
  private requireProvider(provider = "apple-app-attest") {
    if (
      this.infra.playIntegrityUnavailable ||
      !(provider === "google-play"
        ? this.playIntegrity?.available()
        : this.crypto.available(provider))
    )
      throw new ForbiddenException(
        "App verification is not configured or approved for this platform/community",
      );
  }
  private policyDigest(provider: string) {
    if (provider === "google-play") {
      if (!this.playIntegrity)
        throw new ServiceUnavailableException(
          "Google app verification is unavailable",
        );
      return this.playIntegrity.policyDigest();
    }
    return this.crypto.policyDigest();
  }
  private checkPolicy(challenge: AppAttestationChallenge) {
    this.requireProvider(challenge.provider);
    if (
      challenge.region !== this.infra.config.REGION ||
      challenge.policyDigest !== this.policyDigest(challenge.provider)
    )
      throw new ConflictException(
        "App verification configuration changed; request a fresh challenge",
      );
  }
  async list(r: Authed) {
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "account",
      [],
      async (tx) => ({
        providers: [
          {
            provider: "apple-app-attest",
            platform: "ios",
            available:
              this.crypto.available("apple-app-attest") &&
              !this.infra.playIntegrityUnavailable,
            ...(this.infra.config.APP_ATTESTATION_APPLE_RECEIPT_ENABLED ===
            "true"
              ? {
                  receiptRefreshAvailable:
                    this.crypto.receiptRefreshAvailable(),
                  receiptAutoRefreshAvailable:
                    this.crypto.receiptRefreshAvailable() &&
                    this.infra.config.APP_ATTESTATION_APPLE_AUTO_REFRESH ===
                      "true",
                }
              : {}),
          },
          {
            provider: "google-play",
            platform: "android",
            available:
              !!this.playIntegrity?.available() &&
              !this.infra.playIntegrityUnavailable,
            ...(this.playIntegrity?.available()
              ? {
                  cloudProjectNumber:
                    this.infra.config.APP_ATTESTATION_GOOGLE_PROJECT_NUMBER,
                }
              : {}),
          },
        ],
        rankingEnabled: false,
        keys: (
          await tx.appAttestationKey.findMany({
            where: { userId: r.user.id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 50,
          })
        ).map(appAttestationKeySummary),
      }),
    );
  }
  private async limit(r: Authed, enroll: boolean) {
    if (
      !(await this.infra.limit(
        `app-attestation:${enroll ? "enroll" : "action"}:${r.user.id}`,
        enroll ? 10 : 600,
        86400,
      ))
    )
      throw new HttpException("App verification limit reached", 429);
  }
  private async key(
    tx: Tx,
    r: Authed,
    id: string,
    until: LearningDeadline,
    assessRisk = true,
  ) {
    await tx.$queryRaw`SELECT id FROM "AppAttestationKey" WHERE id=${id}::uuid AND "userId"=${r.user.id}::uuid FOR UPDATE`;
    const key = await tx.appAttestationKey.findFirst({
      where: { id, userId: r.user.id },
    });
    if (!key) throw new NotFoundException();
    if (
      key.status !== "ACTIVE" ||
      !key.publicKeyPem ||
      !key.receiptCiphertext ||
      key.policyDigest !== this.crypto.keyPolicyDigest()
    )
      throw new ForbiddenException("A current verification key is required");
    until(key.receiptExpiresAt, "Verification receipt expired");
    let enrolled: EnrolledAppleKey;
    try {
      enrolled = openAppleKey(key, this.infra.config.REGION, this.crypto);
    } catch {
      throw new ForbiddenException(
        "Verification key storage failed its integrity check",
      );
    }
    if (assessRisk) {
      try {
        until(
          new Date(this.crypto.receiptCertificateStatusUntil(enrolled)),
          "Apple certificate status expired",
        );
      } catch {
        throw new ForbiddenException(
          "Current Apple certificate status is required",
        );
      }
    }
    if (
      assessRisk &&
      this.infra.config.APP_ATTESTATION_APPLE_RECEIPT_ENABLED === "true" &&
      !this.crypto.receiptRiskAccepted(enrolled)
    )
      throw new ForbiddenException(
        "A current verification receipt within the operator review policy is required",
      );
    return key;
  }
  private async prepareKeyCertificateStatus(r: Authed, id: string) {
    const key = await this.db.appAttestationKey.findFirst({
      where: { id: Id.parse(id), userId: r.user.id },
    });
    if (!key) throw new NotFoundException();
    let value: EnrolledAppleKey;
    try {
      value = openAppleKey(key, this.infra.config.REGION, this.crypto);
    } catch {
      throw new ForbiddenException("A current verification key is required");
    }
    try {
      await this.crypto.ensureReceiptCertificateStatus(value);
    } catch {
      throw new ServiceUnavailableException(
        "Current Apple certificate status could not be confirmed; retry or refresh app verification",
      );
    }
  }
  async refreshReceipt(r: Authed, idRaw: string, raw: unknown) {
    const id = Id.parse(idRaw),
      body = AppAttestationKeyVersion.parse(raw);
    this.requireProvider();
    if (!this.crypto.receiptRefreshAvailable())
      throw new ForbiddenException("Apple receipt exchange is unavailable");
    if (
      !(await this.infra.limit(`app-receipt-refresh:${r.user.id}`, 10, 86400))
    )
      throw new HttpException("Verification refresh limit reached", 429);
    const snapshot = await learningWrite(
      this.db,
      this.infra.config,
      r,
      async (tx, until) => {
        this.requireProvider();
        const key = await this.key(tx, r, id, until, false);
        if (key.version !== body.expectedVersion)
          throw new ConflictException(
            "Verification key changed; reload before refreshing",
          );
        return {
          key,
          policy: this.crypto.policyDigest(),
          enrolled: this.crypto.open(
            {
              region: this.infra.config.REGION,
              userId: key.userId,
              id: key.id,
              keyIdHash: key.keyIdHash,
            },
            key.receiptCiphertext!,
          ),
        };
      },
    );
    let result: Awaited<ReturnType<AppAttestationCrypto["refreshReceipt"]>>;
    try {
      result = await this.crypto.refreshReceipt(snapshot.enrolled);
    } catch {
      throw new ServiceUnavailableException(
        "Apple receipt refresh is unavailable; current trust has not been extended",
      );
    }
    return learningWrite(this.db, this.infra.config, r, async (tx, until) => {
      this.requireProvider();
      const key = await this.key(tx, r, id, until, false);
      if (
        this.crypto.policyDigest() !== snapshot.policy ||
        key.receiptCiphertext !== snapshot.key.receiptCiphertext
      )
        throw new ConflictException(
          "Verification changed during refresh; reload its current status",
        );
      // Assertions may advance the counter while Apple is contacted. Refresh
      // retains that current counter and increments the current version once.
      if (result.kind === "deferred")
        return {
          key: appAttestationKeySummary(key),
          refreshed: false,
          retryAt: new Date(result.retryAt),
          rankingEligible: false,
        };
      until(
        new Date(result.receipt.expiresAt),
        "Refreshed verification receipt expired",
      );
      const enrolled = {
        ...snapshot.enrolled,
        receipt: result.receipt,
        receiptBase64: result.receiptBase64,
      };
      const updated = await tx.appAttestationKey.update({
        where: { id },
        data: {
          receiptCiphertext: this.crypto.seal(
            {
              region: this.infra.config.REGION,
              userId: key.userId,
              id: key.id,
              keyIdHash: key.keyIdHash,
            },
            enrolled,
          ),
          receiptExpiresAt: new Date(result.receipt.expiresAt),
          ...(key.receiptAutoRefresh
            ? {
                receiptRefreshAt: receiptRefreshAt(result.receipt),
                receiptRefreshLease: null,
                receiptRefreshLeaseUntil: null,
                receiptRefreshFailures: 0,
              }
            : {}),
          version: { increment: 1 },
        },
      });
      this.requireProvider();
      if (this.crypto.policyDigest() !== snapshot.policy)
        throw new ConflictException(
          "Verification policy changed during refresh",
        );
      return {
        key: appAttestationKeySummary(updated),
        refreshed: true,
        retryAt:
          result.receipt.notBefore === null
            ? null
            : new Date(result.receipt.notBefore),
        assessment: this.crypto.receiptRiskAccepted(enrolled)
          ? "accepted"
          : "review-required",
        rankingEligible: false,
      };
    });
  }
  async receiptSchedule(r: Authed, idRaw: string, raw: unknown) {
    const id = Id.parse(idRaw),
      body = AppAttestationReceiptSchedule.parse(raw);
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "account",
      [],
      async (tx, actor) => {
        await tx.$queryRaw`SELECT id FROM "AppAttestationKey" WHERE id=${id}::uuid AND "userId"=${r.user.id}::uuid FOR UPDATE`;
        const key = await tx.appAttestationKey.findFirst({
          where: { id, userId: r.user.id },
        });
        if (!key) throw new NotFoundException();
        if (body.enabled && key.version !== body.expectedVersion)
          throw new ConflictException(
            "Verification key changed; reload its current status",
          );
        if (body.enabled) {
          this.requireProvider();
          if (
            this.infra.config.APP_ATTESTATION_APPLE_AUTO_REFRESH !== "true" ||
            !this.crypto.receiptRefreshAvailable() ||
            !permissions(actor.policy).canLearn
          )
            throw new ForbiddenException(
              "Automatic receipt updates are unavailable",
            );
        }
        if (key.receiptAutoRefresh === body.enabled)
          return appAttestationKeySummary(key);
        let enrolled: EnrolledAppleKey | null = null;
        if (body.enabled) {
          try {
            enrolled = openAppleKey(key, this.infra.config.REGION, this.crypto);
          } catch {
            throw new ForbiddenException(
              "A current verification key is required",
            );
          }
        }
        const updated = await tx.appAttestationKey.update({
          where: { id },
          data: {
            ...receiptScheduleOff,
            ...(enrolled
              ? {
                  receiptAutoRefresh: true,
                  receiptRefreshAt: receiptRefreshAt(enrolled.receipt),
                }
              : {}),
            version: { increment: 1 },
          },
        });
        if (body.enabled && key.receiptExpiresAt <= new Date())
          throw new ConflictException("Verification receipt expired");
        return appAttestationKeySummary(updated);
      },
    );
  }
  private async lockAttempt(tx: Tx, r: Authed, id: string, operation: string) {
    const a = await tx.attempt.findFirst({
      where: { id, userId: r.user.id },
      include: { room: true },
    });
    if (!a) throw new NotFoundException();
    if (a.room.competitionAttempt) {
      if (!this.competitions)
        throw new ServiceUnavailableException(
          "Competition verification is unavailable",
        );
      await this.competitions.guardAttempt(
        tx,
        r,
        a.room,
        operation === "evidence" ? "evidence" : "active",
      );
    }
    await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${a.roomId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Attempt" WHERE id=${id}::uuid FOR UPDATE`;
  }
  private frameDeadlines(
    a: AttemptFrame,
    operation: string,
    until: LearningDeadline,
  ) {
    until(new Date(a.createdAt.getTime() + 30 * 86400000), "Attempt expired");
    if (a.room.competitionRound) {
      if (operation === "evidence") {
        if (!a.finishedAt || a.finishedAt > a.room.competitionRound.closesAt)
          throw new ConflictException(
            "Solve was not finished before the round deadline",
          );
      } else
        until(a.room.competitionRound.closesAt, "Competition round closed");
    }
    if (operation === "start") {
      if (!a.inspectionAt)
        throw new ConflictException("Inspection is unavailable");
      until(new Date(a.inspectionAt.getTime() + 17000), "Inspection expired");
    }
    if (operation === "finish") {
      if (!a.startedAt) throw new ConflictException("Solve is unavailable");
      until(new Date(a.startedAt.getTime() + 3600000), "Solve expired");
    }
  }
  private async frame(
    tx: Tx,
    r: Authed,
    actor: CommunityActor,
    attemptId: string,
    operation: string,
    body: unknown,
    until: LearningDeadline,
  ) {
    await this.lockAttempt(tx, r, attemptId, operation);
    const a = await tx.attempt.findFirst({
      where: { id: attemptId, userId: r.user.id },
      include: { room: { include: { competitionRound: true } } },
    });
    if (
      !a ||
      !(operation === "evidence"
        ? ["ACTIVE", "FINISHED", "CLOSED"].includes(a.room.status)
        : a.room.status === "ACTIVE") ||
      !(await tx.roomMember.findUnique({
        where: { roomId_userId: { roomId: a.roomId, userId: r.user.id } },
      }))
    )
      throw new ForbiddenException(
        "Current active attempt membership required",
      );
    const allowed: Record<string, string> = {
      record: "CREATED",
      inspect: "CREATED",
      start: "INSPECTION",
      finish: "SOLVING",
      evidence: "AWAITING_EVIDENCE",
    };
    if (a.status !== allowed[operation])
      throw new ConflictException("Attempt phase changed");
    const normalized = appAttestationActionBody(operation as any, body);
    if (normalized.nonce !== a.nonce)
      throw new ForbiddenException("Attempt binding mismatch");
    const input = playInput(a.room, a.input);
    if (
      ["record", "evidence"].includes(operation) &&
      (input === "virtual" || !permissions(actor.policy).canRecord)
    )
      throw new ForbiddenException(
        "Current physical recording permission required",
      );
    this.frameDeadlines(a, operation, until);
    return {
      a,
      body: normalized,
      payloadDigest: digest(normalized),
      attemptDigest: digest({
        ...a,
        room: { ...a.room, competitionRound: a.room.competitionRound },
      }),
    };
  }
  private async pendingLimit(tx: Tx, userId: string) {
    if (
      (await tx.appAttestationChallenge.count({
        where: {
          userId,
          status: { in: ["PENDING", "VERIFYING"] },
          expiresAt: { gt: new Date() },
        },
      })) >= 8
    )
      throw new HttpException("Too many pending app checks", 429);
  }
  async challenge(r: Authed, raw: unknown) {
    const b = AppAttestationChallengeRequest.parse(raw);
    if (b.provider === "google-play" && b.kind !== "play-action")
      throw new ForbiddenException(
        "Google app verification requires a fresh action check",
      );
    this.requireProvider(b.provider);
    await this.limit(r, b.kind === "enroll");
    if (b.kind === "action") await this.prepareKeyCertificateStatus(r, b.keyId);
    return learningWrite(
      this.db,
      this.infra.config,
      r,
      async (tx, until, actor) => {
        this.requireProvider(b.provider);
        await this.pendingLimit(tx, r.user.id);
        const policyDigest = this.policyDigest(b.provider),
          now = new Date(),
          expiresAt = new Date(
            Math.min(now.getTime() + 120000, actor.session.expiresAt.getTime()),
          );
        until(expiresAt, "App verification challenge expired");
        if (b.kind === "enroll") {
          const keyIdHash = textHash(b.keyId),
            existing = await tx.appAttestationKey.findUnique({
              where: { keyIdHash },
            });
          if (existing) {
            if (
              existing.userId === r.user.id &&
              existing.status === "ACTIVE" &&
              existing.policyDigest === this.crypto.keyPolicyDigest() &&
              existing.receiptExpiresAt > now
            )
              return {
                kind: "enroll",
                alreadyEnrolled: appAttestationKeySummary(existing),
                rankingEligible: false,
              };
            throw new ConflictException("Use a new native verification key");
          }
          if (
            (await tx.appAttestationKey.count({
              where: { userId: r.user.id, status: "ACTIVE" },
            })) >= 5 ||
            (await tx.appAttestationKey.count({
              where: { userId: r.user.id },
            })) >= 50
          )
            throw new HttpException("Verification key limit reached", 429);
          const contextDigest = digest([
            this.infra.config.REGION,
            r.user.id,
            r.sessionId,
            "ENROLL",
            keyIdHash,
            policyDigest,
          ]);
          const clientData =
            randomBytes(32).toString("base64url") + "." + contextDigest;
          const c = await tx.appAttestationChallenge.create({
            data: {
              userId: r.user.id,
              sessionId: r.sessionId,
              provider: b.provider,
              region: this.infra.config.REGION,
              purpose: "ENROLL",
              keyIdHash,
              policyDigest,
              contextDigest,
              challengeHash: textHash(clientData),
              createdAt: now,
              expiresAt,
            },
          });
          return {
            kind: "enroll",
            id: c.id,
            clientData,
            encoding: "utf8",
            expiresAt,
            rankingEligible: false,
          };
        }
        const deadlines: Date[] = [expiresAt];
        const collect: LearningDeadline = (d, m) => {
          until(d, m);
          deadlines.push(d);
        };
        const frame = await this.frame(
            tx,
            r,
            actor,
            b.attemptId,
            b.operation,
            b.body,
            collect,
          ),
          key =
            b.kind === "play-action"
              ? null
              : await this.key(tx, r, b.keyId, collect);
        const contextDigest = digest([
          this.infra.config.REGION,
          r.user.id,
          r.sessionId,
          "ACTION",
          key?.id ?? "google-play",
          b.attemptId,
          b.operation,
          frame.a.version,
          frame.attemptDigest,
          frame.payloadDigest,
          policyDigest,
        ]);
        const clientData =
            randomBytes(32).toString("base64url") + "." + contextDigest,
          deadline = new Date(Math.min(...deadlines.map((d) => d.getTime())));
        const c = await tx.appAttestationChallenge.create({
          data: {
            userId: r.user.id,
            sessionId: r.sessionId,
            keyId: key?.id,
            attemptId: frame.a.id,
            provider: b.provider,
            region: this.infra.config.REGION,
            purpose: "ACTION",
            operation: b.operation,
            policyDigest,
            contextDigest,
            attemptVersion: frame.a.version,
            attemptDigest: frame.attemptDigest,
            payloadDigest: frame.payloadDigest,
            challengeHash: textHash(clientData),
            createdAt: now,
            expiresAt: deadline,
          },
        });
        return {
          kind: b.kind,
          id: c.id,
          clientData,
          encoding: "utf8",
          expiresAt: deadline,
          payloadDigest: frame.payloadDigest,
          attemptVersion: frame.a.version,
          rankingEligible: false,
          ...(b.kind === "play-action"
            ? {
                requestHash: createHash("sha256")
                  .update(clientData, "utf8")
                  .digest("base64url"),
                cloudProjectNumber:
                  this.infra.config.APP_ATTESTATION_GOOGLE_PROJECT_NUMBER,
              }
            : {}),
        };
      },
    );
  }
  private async claim(
    r: Authed,
    id: string,
    kind: string,
    clientData: string,
    keyId?: string,
  ) {
    return learningWrite(this.db, this.infra.config, r, async (tx, until) => {
      const c = await tx.appAttestationChallenge.findFirst({
        where: { id, userId: r.user.id, sessionId: r.sessionId },
      });
      if (!c) throw new NotFoundException();
      this.checkPolicy(c);
      until(c.expiresAt, "App verification challenge expired");
      if (
        c.status !== "PENDING" ||
        c.provider !==
          (kind === "play-action" ? "google-play" : "apple-app-attest") ||
        c.purpose !== (kind === "enroll" ? "ENROLL" : "ACTION") ||
        c.challengeHash !== textHash(clientData) ||
        !clientData.endsWith("." + c.contextDigest) ||
        (kind === "enroll" && c.keyIdHash !== textHash(keyId!))
      )
        throw new ConflictException(
          "App verification challenge is invalid or consumed",
        );
      const count = await tx.appAttestationChallenge.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "VERIFYING", claimedAt: new Date() },
      });
      if (count.count !== 1)
        throw new ConflictException("App verification challenge consumed");
      return c;
    });
  }
  private async failChallenge(r: Authed, id: string) {
    await this.db.appAttestationChallenge
      .updateMany({
        where: { id, userId: r.user.id, status: "VERIFYING" },
        data: { status: "FAILED", finishedAt: new Date() },
      })
      .catch(() => {});
  }
  private async activeChallenge(
    tx: Tx,
    r: Authed,
    c: AppAttestationChallenge,
    until: LearningDeadline,
  ) {
    await tx.$queryRaw`SELECT id FROM "AppAttestationChallenge" WHERE id=${c.id}::uuid FOR UPDATE`;
    const current = await tx.appAttestationChallenge.findFirst({
      where: {
        id: c.id,
        userId: r.user.id,
        sessionId: r.sessionId,
        status: "VERIFYING",
      },
    });
    if (!current)
      throw new ConflictException("App verification challenge ended");
    this.checkPolicy(current);
    until(current.expiresAt, "App verification challenge expired");
    return current;
  }
  async verify(r: Authed, raw: unknown) {
    const b = AppAttestationProofRequest.parse(raw);
    this.requireProvider(
      b.kind === "play-action" ? "google-play" : "apple-app-attest",
    );
    let release = () => {};
    if (b.kind === "enroll") {
      try {
        release = this.crypto.reserveEnrollment();
      } catch {
        throw new ServiceUnavailableException(
          "App verification is busy; retry this pending challenge",
        );
      }
    }
    if (b.kind === "play-action") {
      try {
        release = this.playIntegrity!.reserve();
      } catch {
        throw new ServiceUnavailableException(
          "App verification is busy; request a fresh challenge",
        );
      }
    }
    let c: AppAttestationChallenge | undefined;
    try {
      c = await this.claim(
        r,
        b.challengeId,
        b.kind,
        b.clientData,
        b.kind === "enroll" ? b.keyId : undefined,
      );
      if (b.kind === "play-action")
        return await this.verifyPlay(r, c, b.integrityToken, b.clientData);
      if (b.kind === "enroll") {
        const enrolled = await this.crypto.enroll(
          b.attestation,
          b.keyId,
          b.clientData,
        );
        return await learningWrite(
          this.db,
          this.infra.config,
          r,
          async (tx, until) => {
            const current = await this.activeChallenge(tx, r, c!, until);
            until(
              new Date(enrolled.receipt.expiresAt),
              "Verification receipt expired",
            );
            until(
              new Date(this.crypto.receiptCertificateStatusUntil(enrolled)),
              "Apple certificate status expired",
            );
            if (
              enrolled.receipt.publicKeySha256 !==
                createHash("sha256")
                  .update(
                    createPublicKey(enrolled.publicKeyPem).export({
                      type: "spki",
                      format: "der",
                    }),
                  )
                  .digest("hex") ||
              enrolled.receipt.appId !== enrolled.appId
            )
              throw new ForbiddenException("App verification binding failed");
            if (
              (await tx.appAttestationKey.count({
                where: { userId: r.user.id, status: "ACTIVE" },
              })) >= 5 ||
              (await tx.appAttestationKey.count({
                where: { userId: r.user.id },
              })) >= 50
            )
              throw new HttpException("Verification key limit reached", 429);
            const id = randomUUID(),
              receiptCiphertext = this.crypto.seal(
                {
                  region: this.infra.config.REGION,
                  userId: r.user.id,
                  id,
                  keyIdHash: current.keyIdHash!,
                },
                enrolled,
              );
            const key = await tx.appAttestationKey.create({
              data: {
                id,
                userId: r.user.id,
                provider: "apple-app-attest",
                keyIdHash: current.keyIdHash!,
                publicKeyHash: enrolled.receipt.publicKeySha256,
                publicKeyPem: enrolled.publicKeyPem,
                appId: enrolled.appId,
                distribution: enrolled.distribution,
                enrolledBundleVersion: enrolled.bundleVersion,
                bundleVersion: enrolled.bundleVersion,
                policyDigest: this.crypto.keyPolicyDigest(),
                receiptCiphertext,
                receiptExpiresAt: new Date(enrolled.receipt.expiresAt),
                lastVerifiedAt: new Date(),
              },
            });
            await tx.appAttestationChallenge.update({
              where: { id: current.id },
              data: { status: "USED", finishedAt: new Date() },
            });
            until(
              new Date(this.crypto.receiptCertificateStatusUntil(enrolled)),
              "Apple certificate status expired",
            );
            return {
              key: appAttestationKeySummary(key),
              rankingEligible: false,
            };
          },
        );
      }
      await this.prepareKeyCertificateStatus(r, c.keyId!);
      const snapshot = await learningWrite(
        this.db,
        this.infra.config,
        r,
        async (tx, until) => {
          this.checkPolicy(c!);
          until(c!.expiresAt, "App verification challenge expired");
          return this.key(tx, r, c!.keyId!, until);
        },
      );
      const result = await this.crypto.assertion(
        snapshot.publicKeyPem!,
        b.assertion,
        b.clientData,
        snapshot.counter,
      );
      return await learningWrite(
        this.db,
        this.infra.config,
        r,
        async (tx, until, actor) => {
          const deadlines: Date[] = [
            c!.expiresAt,
            actor.session.expiresAt,
            new Date(Date.now() + 30000),
          ];
          const collect: LearningDeadline = (d, m) => {
            until(d, m);
            deadlines.push(d);
          };
          this.checkPolicy(c!);
          // Reconstruct the same operation body from its sealed challenge digest.
          // The caller supplies the body only at challenge creation; verification
          // checks the complete current attempt snapshot rather than trusting it.
          const frame = await this.currentFrame(tx, r, actor, c!, collect),
            key = await this.key(tx, r, c!.keyId!, collect);
          await this.activeChallenge(tx, r, c!, collect);
          if (
            result.counter <= Number(key.counter) ||
            key.publicKeyHash !== snapshot.publicKeyHash
          )
            throw new ConflictException(
              "Verification counter changed; request a fresh proof",
            );
          if (
            (await tx.appAttestationGrant.count({
              where: {
                userId: r.user.id,
                consumedAt: null,
                expiresAt: { gt: new Date() },
              },
            })) >= 16
          )
            throw new HttpException("Too many outstanding app proofs", 429);
          const updated = await tx.appAttestationKey.update({
              where: { id: key.id },
              data: {
                counter: BigInt(result.counter),
                bundleVersion: result.bundleVersion,
                version: { increment: 1 },
                lastVerifiedAt: new Date(),
              },
            }),
            now = new Date(),
            expiresAt = new Date(
              Math.min(
                ...deadlines.map((d) => d.getTime()),
                now.getTime() + 30000,
              ),
            );
          const grant = await tx.appAttestationGrant.create({
            data: {
              userId: r.user.id,
              sessionId: r.sessionId,
              keyId: key.id,
              challengeId: c!.id,
              attemptId: c!.attemptId!,
              operation: c!.operation!,
              policyDigest: c!.policyDigest,
              payloadDigest: c!.payloadDigest!,
              attemptDigest: c!.attemptDigest!,
              attemptVersion: c!.attemptVersion!,
              keyVersion: updated.version,
              createdAt: now,
              expiresAt,
            },
          });
          await tx.appAttestationChallenge.update({
            where: { id: c!.id },
            data: { status: "USED", finishedAt: new Date() },
          });
          return {
            grantId: grant.id,
            operation: grant.operation,
            attemptId: grant.attemptId,
            expiresAt,
            rankingEligible: false,
          };
        },
      );
    } catch (error) {
      if (c) await this.failChallenge(r, c.id);
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "Verification key already enrolled; reload your keys",
        );
      if (error instanceof AttestationError)
        throw new BadRequestException(
          "App verification failed; request a fresh challenge",
        );
      throw error;
    } finally {
      release();
    }
  }
  private async verifyPlay(
    r: Authed,
    c: AppAttestationChallenge,
    token: string,
    clientData: string,
  ) {
    if (c.provider !== "google-play" || c.keyId !== null)
      throw new ForbiddenException("App proof provider mismatch");
    await this.playIntegrity!.verify(token, {
      requestHash: createHash("sha256")
        .update(clientData, "utf8")
        .digest("base64url"),
      issuedAt: c.createdAt.getTime(),
      expiresAt: c.expiresAt.getTime(),
    });
    return learningWrite(
      this.db,
      this.infra.config,
      r,
      async (tx, until, actor) => {
        const deadlines = [
          c.expiresAt,
          actor.session.expiresAt,
          new Date(Date.now() + 30000),
        ];
        const collect: LearningDeadline = (d, m) => {
          until(d, m);
          deadlines.push(d);
        };
        this.checkPolicy(c);
        await this.currentFrame(tx, r, actor, c, collect);
        await this.activeChallenge(tx, r, c, collect);
        if (
          (await tx.appAttestationGrant.count({
            where: {
              userId: r.user.id,
              consumedAt: null,
              expiresAt: { gt: new Date() },
            },
          })) >= 16
        )
          throw new HttpException("Too many outstanding app proofs", 429);
        const grant = await tx.appAttestationGrant.create({
          data: {
            provider: "google-play",
            userId: r.user.id,
            sessionId: r.sessionId,
            challengeId: c.id,
            attemptId: c.attemptId!,
            operation: c.operation!,
            policyDigest: c.policyDigest,
            payloadDigest: c.payloadDigest!,
            attemptDigest: c.attemptDigest!,
            attemptVersion: c.attemptVersion!,
            createdAt: new Date(),
            expiresAt: new Date(Math.min(...deadlines.map((d) => d.getTime()))),
          },
        });
        await tx.appAttestationChallenge.update({
          where: { id: c.id },
          data: { status: "USED", finishedAt: new Date() },
        });
        return {
          grantId: grant.id,
          operation: grant.operation,
          attemptId: grant.attemptId,
          expiresAt: grant.expiresAt,
          rankingEligible: false,
        };
      },
    );
  }
  private async currentFrame(
    tx: Tx,
    r: Authed,
    actor: CommunityActor,
    c: AppAttestationChallenge,
    until: LearningDeadline,
  ) {
    await this.lockAttempt(tx, r, c.attemptId!, c.operation!);
    const a = await tx.attempt.findFirst({
      where: { id: c.attemptId!, userId: r.user.id },
      include: { room: { include: { competitionRound: true } } },
    });
    if (
      !a ||
      a.version !== c.attemptVersion ||
      digest({
        ...a,
        room: { ...a.room, competitionRound: a.room.competitionRound },
      }) !== c.attemptDigest ||
      !(c.operation === "evidence"
        ? ["ACTIVE", "FINISHED", "CLOSED"].includes(a.room.status)
        : a.room.status === "ACTIVE") ||
      !(await tx.roomMember.findUnique({
        where: { roomId_userId: { roomId: a.roomId, userId: r.user.id } },
      }))
    )
      throw new ConflictException("Attempt changed while checking app proof");
    if (
      ["record", "evidence"].includes(c.operation!) &&
      !permissions(actor.policy).canRecord
    )
      throw new ForbiddenException("Current recording permission required");
    this.frameDeadlines(a, c.operation!, until);
    return a;
  }
  async consume(
    tx: Tx,
    r: Authed,
    actor: CommunityActor,
    until: LearningDeadline,
    grantId: string,
    attemptId: string,
    operation: string,
    body: unknown,
  ) {
    if (actor.user.id !== r.user.id || actor.sessionId !== r.sessionId)
      throw new ForbiddenException("Current verification actor required");
    until(actor.session.expiresAt, "Session expired");
    const grant = await tx.appAttestationGrant.findFirst({
      where: {
        id: Id.parse(grantId),
        userId: r.user.id,
        sessionId: r.sessionId,
        attemptId,
        operation,
      },
    });
    if (!grant)
      throw new ForbiddenException(
        "An exact app verification proof is required",
      );
    this.requireProvider(grant.provider);
    if (grant.policyDigest !== this.policyDigest(grant.provider))
      throw new ConflictException("App verification configuration changed");
    until(grant.expiresAt, "App verification proof expired");
    const normalized = appAttestationActionBody(operation as any, body),
      frame = await this.frame(
        tx,
        r,
        actor,
        attemptId,
        operation,
        normalized,
        until,
      ),
      key =
        grant.provider === "apple-app-attest" && grant.keyId
          ? await this.key(tx, r, grant.keyId, until)
          : null;
    if (
      grant.payloadDigest !== frame.payloadDigest ||
      grant.attemptDigest !== frame.attemptDigest ||
      grant.attemptVersion !== frame.a.version ||
      (grant.provider === "apple-app-attest"
        ? !key || grant.keyVersion === null || key.version < grant.keyVersion
        : grant.provider !== "google-play" ||
          grant.keyId !== null ||
          grant.keyVersion !== null)
    )
      throw new ForbiddenException(
        "App proof does not match the current action",
      );
    const used = await tx.appAttestationGrant.updateMany({
      where: { id: grant.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (used.count !== 1)
      throw new ConflictException("App verification proof consumed");
  }
  async revokePlay(r: Authed) {
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "account",
      [],
      async (tx) => {
        await tx.appAttestationGrant.deleteMany({
          where: { userId: r.user.id, provider: "google-play" },
        });
        await tx.appAttestationChallenge.updateMany({
          where: {
            userId: r.user.id,
            provider: "google-play",
            status: { in: ["PENDING", "VERIFYING"] },
          },
          data: { status: "FAILED", finishedAt: new Date() },
        });
        return { cancelled: true, rankingEligible: false };
      },
    );
  }
  async revoke(r: Authed, idRaw: string, raw: unknown) {
    const id = Id.parse(idRaw),
      b = AppAttestationKeyVersion.parse(raw);
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "account",
      [],
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "AppAttestationKey" WHERE id=${id}::uuid AND "userId"=${r.user.id}::uuid FOR UPDATE`;
        const key = await tx.appAttestationKey.findFirst({
          where: { id, userId: r.user.id },
        });
        if (!key) throw new NotFoundException();
        if (key.status !== "ACTIVE") return appAttestationKeySummary(key);
        if (key.version !== b.expectedVersion)
          throw new ConflictException(
            "Verification key changed; reload before revoking",
          );
        const updated = await tx.appAttestationKey.update({
          where: { id },
          data: {
            status: "REVOKED",
            publicKeyPem: null,
            receiptCiphertext: null,
            ...receiptScheduleOff,
            version: { increment: 1 },
          },
        });
        await tx.appAttestationChallenge.updateMany({
          where: { keyId: id, status: { in: ["PENDING", "VERIFYING"] } },
          data: { status: "FAILED", finishedAt: new Date() },
        });
        await tx.appAttestationGrant.deleteMany({ where: { keyId: id } });
        return appAttestationKeySummary(updated);
      },
    );
  }
}
