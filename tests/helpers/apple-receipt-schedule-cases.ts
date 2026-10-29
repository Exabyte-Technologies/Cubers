import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AppAttestationCatalogue, AppAttestationKeyView } from "@cubers/core";
import { Db } from "../../apps/api/src/services";
import { AppleReceiptMaintenance } from "../../apps/api/src/attestation/receipt-maintenance";
import { withAppAttestationHttp } from "./app-attestation-http";
import { enroll, type Harness } from "./app-attestation-cases";
const due = {
  version: { increment: 1 },
  receiptRefreshAt: new Date(Date.now() - 10000),
};
export function registerAppleReceiptScheduleCases(h: Harness) {
  test("receipt schedules require exact owner opt-in/version and allow stopping after the operator disables service", async () => {
    const owner = await h.fixture("receipt-auto-owner", "1990-01-01"),
      other = await h.fixture("receipt-auto-other", "1990-01-01");
    await withAppAttestationHttp(
      h.db as Db,
      h.infra(),
      async (f) => {
        const { key } = await enroll(f, owner),
          path = `/keys/${key.id}/receipt-schedule`;
        assert.equal(
          AppAttestationKeyView.parse(key).receiptAutoRefresh,
          false,
        );
        assert.equal(
          (
            await f.call(
              path,
              { expectedVersion: 0, enabled: true },
              owner.token,
            )
          ).status,
          403,
        );
        f.config.APP_ATTESTATION_APPLE_AUTO_REFRESH = "true";
        assert.equal(
          (
            await f.call(
              path,
              { expectedVersion: 0, enabled: true },
              other.token,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await f.call(
              path,
              { expectedVersion: 0, enabled: "true" },
              owner.token,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await f.call(
              path,
              { expectedVersion: 99, enabled: true },
              owner.token,
            )
          ).status,
          409,
        );
        const enabled = await f.call(
          path,
          { expectedVersion: 0, enabled: true },
          owner.token,
        );
        assert.equal(enabled.status, 201);
        assert.equal(enabled.body.receiptAutoRefresh, true);
        assert.equal(enabled.body.version, 1);
        assert.ok(
          new Date(enabled.body.receiptRefreshAt).getTime() >
            Date.now() + 50000,
        );
        assert.equal(Object.hasOwn(enabled.body, "receiptRefreshLease"), false);
        assert.equal(f.appleCalls(), 0);
        const c = AppAttestationCatalogue.parse(
          (await f.call("", undefined, owner.token)).body,
        );
        assert.equal(c.providers[0].receiptAutoRefreshAvailable, true);
        const exported = await h.call("me/export", undefined, owner.token);
        assert.equal(exported.status, 200);
        assert.ok(JSON.stringify(exported.body).includes("receiptAutoRefresh"));
        f.config.APP_ATTESTATION_APPLE_AUTO_REFRESH = "false";
        f.config.APP_ATTESTATION_APPLE_RECEIPT_ENABLED = "false";
        const stopped = await f.call(
          path,
          { expectedVersion: 1, enabled: false },
          owner.token,
        );
        assert.equal(stopped.status, 201);
        assert.equal(stopped.body.receiptAutoRefresh, false);
        assert.equal(stopped.body.receiptRefreshAt, null);
        assert.equal(f.appleCalls(), 0);
        assert.deepEqual(f.errors, []);
      },
      { receipt: true },
    );
  });
  test("receipt workers share a persistent lease, hold no account locks during transport and preserve current assertion counters", async () => {
    const owner = await h.fixture("receipt-auto-race", "1990-01-01");
    await withAppAttestationHttp(
      h.db as Db,
      h.infra(),
      async (f) => {
        f.config.APP_ATTESTATION_APPLE_AUTO_REFRESH = "true";
        const { key } = await enroll(f, owner);
        await f.call(
          `/keys/${key.id}/receipt-schedule`,
          { expectedVersion: 0, enabled: true },
          owner.token,
        );
        const before = await h.db.appAttestationKey.update({
          where: { id: key.id },
          data: due,
        });
        let entered!: () => void, release!: () => void;
        const reached = new Promise<void>((r) => (entered = r)),
          pause = new Promise<void>((r) => (release = r));
        f.pause(async () => {
          entered();
          await pause;
        });
        const worker = new AppleReceiptMaintenance(
            h.db as Db,
            f.infra,
            f.crypto,
          ),
          other = new AppleReceiptMaintenance(h.db as Db, f.infra, f.crypto);
        const work = worker.run();
        void work.catch(() => {});
        try {
          await Promise.race([
            reached,
            work.then(() => {
              throw Error(
                "Synthetic transport was not reached; " +
                  JSON.stringify({
                    available: f.crypto.available("apple-app-attest"),
                    refresh: f.crypto.receiptRefreshAvailable(),
                    auto: f.config.APP_ATTESTATION_APPLE_AUTO_REFRESH,
                    region: f.config.REGION,
                  }),
              );
            }),
          ]);
          assert.equal(f.appleCalls(), 1);
          await other.run();
          assert.equal(f.appleCalls(), 1);
          await h.db.user.update({
            where: { id: owner.u.id },
            data: { displayName: "Independent account update" },
          });
          await h.db.appAttestationKey.update({
            where: { id: key.id },
            data: { counter: 17n, version: { increment: 1 } },
          });
        } finally {
          release();
          await work;
          await worker.onModuleDestroy();
          await other.onModuleDestroy();
        }
        const after = await h.db.appAttestationKey.findUniqueOrThrow({
          where: { id: key.id },
        });
        assert.equal(after.counter, 17n);
        assert.equal(after.version, before.version + 3);
        assert.notEqual(after.receiptCiphertext, before.receiptCiphertext);
        assert.equal(after.receiptRefreshLease, null);
        assert.equal(after.receiptRefreshFailures, 0);
        assert.equal(after.receiptAutoRefresh, true);
        assert.ok(after.receiptRefreshAt!.getTime() > Date.now() + 3500000);
        assert.equal(f.appleCalls(), 1);
        assert.deepEqual(f.errors, []);
      },
      { receipt: true },
    );
  });
  test("receipt workers honor signed not-before, defer/back off failures without extending trust, recover abandoned leases and retain high-risk screening", async () => {
    const owner = await h.fixture("receipt-auto-retries", "1990-01-01");
    await withAppAttestationHttp(
      h.db as Db,
      h.infra(),
      async (f) => {
        f.config.APP_ATTESTATION_APPLE_AUTO_REFRESH = "true";
        const { key } = await enroll(f, owner);
        await f.call(
          `/keys/${key.id}/receipt-schedule`,
          { expectedVersion: 0, enabled: true },
          owner.token,
        );
        const before = await h.db.appAttestationKey.update({
          where: { id: key.id },
          data: due,
        });
        const worker = new AppleReceiptMaintenance(
          h.db as Db,
          f.infra,
          f.crypto,
        );
        try {
          f.receiptResponse({ status: 304 });
          await worker.run();
          let row = await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          });
          assert.equal(row.receiptCiphertext, before.receiptCiphertext);
          assert.equal(
            row.receiptExpiresAt.getTime(),
            before.receiptExpiresAt.getTime(),
          );
          assert.equal(row.version, before.version + 2);
          assert.ok(row.receiptRefreshAt!.getTime() > Date.now() + 50000);
          await h.db.appAttestationKey.update({
            where: { id: key.id },
            data: due,
          });
          f.receiptResponse({ status: 503 });
          await worker.run();
          row = await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          });
          assert.equal(row.receiptCiphertext, before.receiptCiphertext);
          assert.equal(row.receiptRefreshFailures, 1);
          assert.ok(row.receiptRefreshAt!.getTime() > Date.now() + 110000);
          await h.db.appAttestationKey.update({
            where: { id: key.id },
            data: {
              ...due,
              receiptRefreshLease: randomUUID(),
              receiptRefreshLeaseUntil: new Date(Date.now() - 1000),
            },
          });
          f.receiptResponse({ risk: 20 });
          await worker.run();
          row = await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          });
          const value = f.crypto.open(
            {
              region: "INTL",
              userId: owner.u.id,
              id: key.id,
              keyIdHash: row.keyIdHash,
            },
            row.receiptCiphertext!,
          );
          assert.equal(value.receipt.riskMetric, 20);
          assert.equal(f.crypto.receiptRiskAccepted(value), false);
          assert.equal(row.receiptRefreshFailures, 0);
          await h.db.appAttestationKey.update({
            where: { id: key.id },
            data: due,
          });
          await worker.run();
          assert.equal(f.appleCalls(), 3);
          assert.ok(
            (
              await h.db.appAttestationKey.findUniqueOrThrow({
                where: { id: key.id },
              })
            ).receiptRefreshAt!.getTime() >
              Date.now() + 3500000,
          );
          await assert.rejects(
            h.db.appAttestationKey.update({
              where: { id: key.id },
              data: { receiptAutoRefresh: false, version: { increment: 1 } },
            }),
          );
          await assert.rejects(
            h.db.appAttestationKey.update({
              where: { id: key.id },
              data: {
                receiptRefreshLease: randomUUID(),
                version: { increment: 1 },
              },
            }),
          );
        } finally {
          await worker.onModuleDestroy();
        }
        assert.deepEqual(f.errors, []);
      },
      { receipt: true },
    );
  });
  test("pending automatic receipt results cannot outlive opt-out, revocation, policy change, lease expiry or account deletion", async () => {
    for (const change of [
      "opt-out",
      "revoked",
      "policy",
      "lease",
      "deleted",
    ] as const) {
      const owner = await h.fixture("receipt-auto-" + change, "1990-01-01");
      await withAppAttestationHttp(
        h.db as Db,
        h.infra(),
        async (f) => {
          f.config.APP_ATTESTATION_APPLE_AUTO_REFRESH = "true";
          const { key } = await enroll(f, owner);
          await f.call(
            `/keys/${key.id}/receipt-schedule`,
            { expectedVersion: 0, enabled: true },
            owner.token,
          );
          const before = await h.db.appAttestationKey.update({
            where: { id: key.id },
            data: due,
          });
          f.pause(async () => {
            if (change === "opt-out")
              assert.equal(
                (
                  await f.call(
                    `/keys/${key.id}/receipt-schedule`,
                    { expectedVersion: 1, enabled: false },
                    owner.token,
                  )
                ).status,
                201,
              );
            if (change === "revoked")
              assert.equal(
                (
                  await f.call(
                    `/keys/${key.id}`,
                    {
                      expectedVersion: (
                        await h.db.appAttestationKey.findUniqueOrThrow({
                          where: { id: key.id },
                        })
                      ).version,
                    },
                    owner.token,
                    "DELETE",
                  )
                ).status,
                200,
              );
            if (change === "policy")
              f.config.APP_ATTESTATION_APPLE_RISK_MAX = 4;
            if (change === "lease")
              await h.db.appAttestationKey.update({
                where: { id: key.id },
                data: {
                  receiptRefreshLeaseUntil: new Date(Date.now() - 1),
                  version: { increment: 1 },
                },
              });
            if (change === "deleted")
              await h.db.user.update({
                where: { id: owner.u.id },
                data: { deletedAt: new Date() },
              });
          });
          const worker = new AppleReceiptMaintenance(
            h.db as Db,
            f.infra,
            f.crypto,
          );
          try {
            await worker.run();
          } finally {
            await worker.onModuleDestroy();
          }
          const after = await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          });
          assert.equal(
            after.receiptCiphertext,
            change === "revoked" ? null : before.receiptCiphertext,
          );
          assert.equal(
            after.receiptExpiresAt.getTime(),
            before.receiptExpiresAt.getTime(),
          );
          assert.equal(after.receiptRefreshLease, null);
          if (["opt-out", "revoked", "deleted"].includes(change))
            assert.equal(after.receiptAutoRefresh, false);
          assert.equal(f.appleCalls(), 1);
          assert.deepEqual(f.errors, []);
        },
        { receipt: true },
      );
    }
  });
  test("automatic receipt updates stop before or after transport when current guardian learning consent is withdrawn", async () => {
    for (const pending of [false, true]) {
      const guardian = await h.fixture(
          "receipt-auto-guardian-" + pending,
          "1990-01-01",
        ),
        child = await h.fixture(
          "receipt-auto-child-" + pending,
          "2018-01-01",
          "USER",
          false,
        );
      const document = await h.db.media.create({
        data: {
          userId: guardian.u.id,
          key: `INTL/schedule-consent/${randomUUID()}`,
          type: "application/pdf",
          size: 32,
          purpose: "consent",
          status: "READY",
        },
      });
      const consent = await h.db.consent.create({
        data: {
          childId: child.u.id,
          guardianId: guardian.u.id,
          documentId: document.id,
          status: "APPROVED",
          publicPosting: false,
          recording: false,
        },
      });
      await withAppAttestationHttp(
        h.db as Db,
        h.infra(),
        async (f) => {
          f.config.APP_ATTESTATION_APPLE_AUTO_REFRESH = "true";
          const { key } = await enroll(f, child);
          assert.equal(
            (
              await f.call(
                `/keys/${key.id}/receipt-schedule`,
                { expectedVersion: 0, enabled: true },
                child.token,
              )
            ).status,
            201,
          );
          const before = await h.db.appAttestationKey.update({
            where: { id: key.id },
            data: due,
          });
          const withdraw = async () => {
            await h.db.consent.update({
              where: { id: consent.id },
              data: { status: "REVOKED" },
            });
          };
          if (pending) f.pause(withdraw);
          else await withdraw();
          const worker = new AppleReceiptMaintenance(
            h.db as Db,
            f.infra,
            f.crypto,
          );
          try {
            await worker.run();
          } finally {
            await worker.onModuleDestroy();
          }
          const row = await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          });
          assert.equal(row.receiptCiphertext, before.receiptCiphertext);
          assert.equal(row.receiptAutoRefresh, false);
          assert.equal(row.receiptRefreshLease, null);
          assert.equal(f.appleCalls(), pending ? 1 : 0);
          assert.deepEqual(f.errors, []);
        },
        { receipt: true },
      );
    }
  });
  test("automatic receipt shutdown discards late transport and disabled regional services make no request", async () => {
    const owner = await h.fixture("receipt-auto-stop", "1990-01-01");
    await withAppAttestationHttp(
      h.db as Db,
      h.infra(),
      async (f) => {
        f.config.APP_ATTESTATION_APPLE_AUTO_REFRESH = "true";
        const { key } = await enroll(f, owner);
        await f.call(
          `/keys/${key.id}/receipt-schedule`,
          { expectedVersion: 0, enabled: true },
          owner.token,
        );
        const before = await h.db.appAttestationKey.update({
          where: { id: key.id },
          data: due,
        });
        const worker = new AppleReceiptMaintenance(
          h.db as Db,
          f.infra,
          f.crypto,
        );
        f.config.APP_ATTESTATION_APPLE_ENABLED = "false";
        await worker.run();
        assert.equal(f.appleCalls(), 0);
        f.config.APP_ATTESTATION_APPLE_ENABLED = "true";
        let entered!: () => void, release!: () => void;
        const reached = new Promise<void>((r) => (entered = r)),
          pause = new Promise<void>((r) => (release = r));
        f.pause(async () => {
          entered();
          await pause;
        });
        const work = worker.run();
        void work.catch(() => {});
        try {
          await Promise.race([
            reached,
            work.then(() => {
              throw Error(
                "Synthetic transport was not reached; " +
                  JSON.stringify({
                    available: f.crypto.available("apple-app-attest"),
                    refresh: f.crypto.receiptRefreshAvailable(),
                    auto: f.config.APP_ATTESTATION_APPLE_AUTO_REFRESH,
                    region: f.config.REGION,
                  }),
              );
            }),
          ]);
          await worker.onModuleDestroy();
          await work;
          const row = await h.db.appAttestationKey.findUniqueOrThrow({
            where: { id: key.id },
          });
          assert.equal(row.receiptCiphertext, before.receiptCiphertext);
          assert.equal(row.receiptRefreshLease, null);
          assert.equal(row.receiptRefreshFailures, 1);
          await worker.run();
          assert.equal(f.appleCalls(), 1);
        } finally {
          release();
          await work;
        }
        await new Promise((r) => setTimeout(r, 20));
        assert.equal(
          (
            await h.db.appAttestationKey.findUniqueOrThrow({
              where: { id: key.id },
            })
          ).receiptCiphertext,
          before.receiptCiphertext,
        );
        assert.deepEqual(f.errors, []);
      },
      { receipt: true },
    );
  });
}
