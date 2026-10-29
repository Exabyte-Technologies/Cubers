import { Injectable, Inject } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { permissions } from "@cubers/core";
import { Db, Infrastructure } from "../services";
import { accountPolicy } from "../security";
import { AppAttestationCrypto } from "./provider";
import { openAppleKey } from "./apple-key-storage";
import { receiptRefreshAt, receiptScheduleOff } from "./receipt-schedule";
type Tx = Prisma.TransactionClient;
@Injectable()
export class AppleReceiptMaintenance {
  private stopped = new AbortController();
  private running?: Promise<void>;
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(AppAttestationCrypto) private crypto: AppAttestationCrypto,
  ) {}
  private available() {
    return (
      !this.stopped.signal.aborted &&
      !this.infra.playIntegrityUnavailable &&
      this.infra.config.APP_ATTESTATION_APPLE_AUTO_REFRESH === "true" &&
      this.crypto.receiptRefreshAvailable()
    );
  }
  /** Background authority has no fabricated user session. It requires current
   * per-key opt-in plus locked current account/guardian learning eligibility. */
  private async owned<T>(
    userId: string,
    work: (tx: Tx, eligible: () => Promise<boolean>) => Promise<T>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const initial = await tx.consent.findUnique({
          where: { childId: userId },
          select: { guardianId: true },
        });
        const ids = [
          ...new Set([userId, ...(initial ? [initial.guardianId] : [])]),
        ].sort();
        await tx.$queryRaw`SELECT id FROM "User" WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR NO KEY UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Consent" WHERE "childId"=${userId}::uuid FOR SHARE`;
        const eligible = async () => {
          const consent = await tx.consent.findUnique({
            where: { childId: userId },
            select: { guardianId: true },
          });
          if (consent && !ids.includes(consent.guardianId)) return false;
          const user = await tx.user.findUnique({ where: { id: userId } });
          return (
            !!user &&
            !user.deletedAt &&
            user.emailVerified &&
            user.region === this.infra.config.REGION &&
            permissions(await accountPolicy(tx, user)).canLearn
          );
        };
        return work(tx, eligible);
      },
      { timeout: 10000 },
    );
  }
  run() {
    if (this.running) return this.running;
    if (!this.available()) return Promise.resolve();
    this.running = this.batch().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async batch() {
    const now = new Date();
    const rows = await this.db.appAttestationKey.findMany({
      where: {
        receiptAutoRefresh: true,
        status: "ACTIVE",
        receiptRefreshAt: { lte: now },
        receiptExpiresAt: { gt: now },
        user: { region: this.infra.config.REGION },
        OR: [
          { receiptRefreshLeaseUntil: null },
          { receiptRefreshLeaseUntil: { lte: now } },
        ],
      },
      select: { id: true, userId: true },
      orderBy: [{ receiptRefreshAt: "asc" }, { id: "asc" }],
      take: 5,
    });
    for (const row of rows) {
      if (!this.available()) break;
      const lease = randomUUID();
      const snapshot = await this.owned(row.userId, async (tx, eligible) => {
        await tx.$queryRaw`SELECT id FROM "AppAttestationKey" WHERE id=${row.id}::uuid FOR UPDATE`;
        const key = await tx.appAttestationKey.findUnique({
            where: { id: row.id },
          }),
          now = Date.now();
        if (
          !this.available() ||
          !key ||
          !key.receiptAutoRefresh ||
          key.status !== "ACTIVE" ||
          !key.receiptRefreshAt ||
          key.receiptRefreshAt.getTime() > now ||
          key.receiptExpiresAt.getTime() <= now ||
          (key.receiptRefreshLeaseUntil &&
            key.receiptRefreshLeaseUntil.getTime() > now)
        )
          return null;
        if (!(await eligible())) {
          await tx.appAttestationKey.update({
            where: { id: key.id },
            data: { ...receiptScheduleOff, version: { increment: 1 } },
          });
          return null;
        }
        let enrolled;
        try {
          enrolled = openAppleKey(key, this.infra.config.REGION, this.crypto);
        } catch {
          await tx.appAttestationKey.update({
            where: { id: key.id },
            data: { ...receiptScheduleOff, version: { increment: 1 } },
          });
          return null;
        }
        // Check the signed date again even if scheduling metadata was altered.
        if (
          enrolled.receipt.notBefore !== null &&
          enrolled.receipt.notBefore >= now
        ) {
          await tx.appAttestationKey.update({
            where: { id: key.id },
            data: {
              version: { increment: 1 },
              receiptRefreshAt: receiptRefreshAt(enrolled.receipt),
              receiptRefreshLease: null,
              receiptRefreshLeaseUntil: null,
            },
          });
          return null;
        }
        const until = new Date(now + 30000);
        await tx.appAttestationKey.update({
          where: { id: key.id },
          data: {
            version: { increment: 1 },
            receiptRefreshLease: lease,
            receiptRefreshLeaseUntil: until,
          },
        });
        if (!(await eligible()) || !this.available())
          throw Error("Receipt scheduling eligibility changed");
        return { key, enrolled, policy: this.crypto.policyDigest(), until };
      });
      if (!snapshot) continue;
      let result:
        Awaited<ReturnType<AppAttestationCrypto["refreshReceipt"]>> | undefined;
      try {
        result = await this.crypto.refreshReceipt(
          snapshot.enrolled,
          this.stopped.signal,
        );
      } catch {}
      await this.owned(row.userId, async (tx, eligible) => {
        await tx.$queryRaw`SELECT id FROM "AppAttestationKey" WHERE id=${row.id}::uuid FOR UPDATE`;
        const key = await tx.appAttestationKey.findUnique({
          where: { id: row.id },
        });
        if (!key || key.receiptRefreshLease !== lease) return;
        if (
          !(await eligible()) ||
          key.status !== "ACTIVE" ||
          !key.receiptAutoRefresh ||
          key.receiptExpiresAt.getTime() <= Date.now()
        ) {
          await tx.appAttestationKey.update({
            where: { id: key.id },
            data: { ...receiptScheduleOff, version: { increment: 1 } },
          });
          return;
        }
        const unchanged =
          key.receiptCiphertext === snapshot.key.receiptCiphertext &&
          key.policyDigest === snapshot.key.policyDigest;
        const current =
          this.available() &&
          this.crypto.policyDigest() === snapshot.policy &&
          snapshot.until.getTime() > Date.now() &&
          key.receiptRefreshLeaseUntil?.getTime() ===
            snapshot.until.getTime() &&
          unchanged;
        if (!current || !result) {
          const failures = Math.min(10, key.receiptRefreshFailures + 1);
          await tx.appAttestationKey.update({
            where: { id: key.id },
            data: {
              version: { increment: 1 },
              receiptRefreshLease: null,
              receiptRefreshLeaseUntil: null,
              receiptRefreshFailures: failures,
              receiptRefreshAt: receiptRefreshAt(
                { expiresAt: key.receiptExpiresAt.getTime(), notBefore: null },
                Date.now(),
                0,
                failures,
              ),
            },
          });
          return;
        }
        if (result.kind === "deferred") {
          await tx.appAttestationKey.update({
            where: { id: key.id },
            data: {
              version: { increment: 1 },
              receiptRefreshLease: null,
              receiptRefreshLeaseUntil: null,
              receiptRefreshFailures: 0,
              receiptRefreshAt: receiptRefreshAt(
                snapshot.enrolled.receipt,
                Date.now(),
                result.retryAt,
              ),
            },
          });
          return;
        }
        if (result.receipt.expiresAt <= Date.now())
          throw Error("Updated receipt expired");
        const enrolled = {
          ...snapshot.enrolled,
          receipt: result.receipt,
          receiptBase64: result.receiptBase64,
        };
        await tx.appAttestationKey.update({
          where: { id: key.id },
          data: {
            version: { increment: 1 },
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
            receiptRefreshLease: null,
            receiptRefreshLeaseUntil: null,
            receiptRefreshFailures: 0,
            receiptRefreshAt: receiptRefreshAt(result.receipt),
          },
        });
        if (
          !(await eligible()) ||
          !this.available() ||
          this.crypto.policyDigest() !== snapshot.policy ||
          snapshot.until.getTime() <= Date.now() ||
          result.receipt.expiresAt <= Date.now()
        )
          throw Error("Receipt scheduling eligibility changed");
      });
    }
  }
  async onModuleDestroy() {
    this.stopped.abort();
    await this.running;
  }
}
