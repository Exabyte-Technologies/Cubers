import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { Readable } from "node:stream";
import sharp from "sharp";
import {
  consentDocumentPreview,
  requireConsentPreview,
} from "../../apps/api/src/consent-document";
import { consentPdfFixture } from "./consent-pdf";
export function registerConsentDocumentCases(ctx: any) {
  async function setup(work: (env: any) => Promise<void>) {
    const pdf = consentPdfFixture(),
      suffix = randomUUID().slice(0, 8);
    const { db } = ctx,
      directory = await mkdtemp(join(tmpdir(), "cubers-review-")),
      socket = join(directory, "review.sock");
    const png = await sharp({
      create: { width: 40, height: 60, channels: 3, background: "white" },
    })
      .jpeg()
      .toBuffer();
    let handler = async (req: any, res: any) => {
      const chunks = [];
      for await (const b of req) chunks.push(b);
      assert.deepEqual(Buffer.concat(chunks), pdf);
      res.end(JSON.stringify({ version: 1, pages: [png.toString("base64")] }));
    };
    const server = createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      void handler(req, res).catch(() => {
        res.destroy();
      });
    });
    await new Promise<void>((resolve) => server.listen(socket, resolve));
    try {
      const owner = await ctx.fixture("document-owner-" + suffix, "1985-01-01"),
        staff = await ctx.fixture(
          "document-reviewer-" + suffix,
          "1985-01-01",
          "ADMIN",
        ),
        outsider = await ctx.fixture(
          "document-outsider-" + suffix,
          "1985-01-01",
        );
      const actor = await ctx.actor(staff),
        media = await db.media.create({
          data: {
            userId: owner.u.id,
            key: `INTL/${owner.u.id}/${randomUUID()}/clean`,
            type: "application/pdf",
            purpose: "consent",
            status: "READY",
            size: pdf.length,
            sha256: createHash("sha256").update(pdf).digest("hex"),
          },
        });
      const infra = Object.create(ctx.infra());
      infra.config = { ...infra.config, CONSENT_REVIEW_SOCKET: socket };
      infra.storage = {
        send: async () => ({
          ContentLength: pdf.length,
          Body: Readable.from([pdf]),
        }),
      };
      await work({
        db,
        infra,
        owner,
        staff,
        outsider,
        actor,
        media,
        pdf,
        setHandler: (next: any) => (handler = next),
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  }
  test("private consent review delivers only reencoded images, retains original evidence and binds a staff receipt", async () =>
    setup(async ({ db, infra, owner, actor, media, pdf }: any) => {
      const preview = await consentDocumentPreview(db, infra, actor, media.id);
      assert.ok(preview.pages[0].startsWith("data:image/jpeg;base64,"));
      assert.equal(preview.signatureValidated, false);
      assert.equal(
        preview.originalSha256,
        createHash("sha256").update(pdf).digest("hex"),
      );
      assert.ok(preview.reviewId);
      await db.$transaction((tx: any) =>
        requireConsentPreview(tx, actor, media.id, preview.reviewId, "INTL"),
      );
      const current = await db.media.findUniqueOrThrow({
        where: { id: media.id },
      });
      assert.equal(current.key, media.key);
      assert.equal(current.sha256, media.sha256);
      const ownerPreview = await consentDocumentPreview(
        db,
        infra,
        await ctx.actor(owner),
        media.id,
      );
      assert.equal(ownerPreview.reviewId, undefined);
      const metadata = await ctx.call(
        `media/${media.id}`,
        undefined,
        owner.token,
      );
      assert.equal(metadata.status, 200);
      assert.equal(metadata.body.url, undefined);
    }));
  test("document previews reject unrelated accounts and revoked staff MFA before reading storage", async () =>
    setup(async ({ db, infra, outsider, actor, media }: any) => {
      let reads = 0;
      infra.storage = {
        send: async () => {
          reads++;
          throw Error("Must not read");
        },
      };
      await assert.rejects(
        consentDocumentPreview(db, infra, await ctx.actor(outsider), media.id),
        (e: any) => e.getStatus?.() === 403,
      );
      await db.session.update({
        where: { id: actor.sessionId },
        data: { mfaVerified: false },
      });
      await assert.rejects(
        consentDocumentPreview(db, infra, actor, media.id),
        (e: any) => e.getStatus?.() === 403,
      );
      assert.equal(reads, 0);
    }));
  test("document review rejects mismatched original bytes and malformed renderer output without a receipt", async () =>
    setup(async ({ db, infra, actor, media, setHandler }: any) => {
      await db.media.update({
        where: { id: media.id },
        data: { sha256: "f".repeat(64) },
      });
      await assert.rejects(
        consentDocumentPreview(db, infra, actor, media.id),
        (e: any) => e.getStatus?.() === 400,
      );
      await db.media.update({
        where: { id: media.id },
        data: { sha256: media.sha256 },
      });
      setHandler(async (req: any, res: any) => {
        for await (const _ of req) {
        }
        res.end(
          JSON.stringify({
            version: 1,
            pages: [Buffer.from("<svg onload='bad'/>").toString("base64")],
          }),
        );
      });
      await assert.rejects(
        consentDocumentPreview(db, infra, actor, media.id),
        (e: any) => e.getStatus?.() === 400,
      );
      assert.equal(
        await db.audit.count({
          where: { action: "consent.document-preview", targetId: media.id },
        }),
        0,
      );
    }));
  test("staff revocation during actual renderer work withholds images and audit receipts", async () =>
    setup(async ({ db, infra, actor, media, setHandler }: any) => {
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>((r) => (entered = r)),
        gate = new Promise<void>((r) => (release = r));
      const image = await sharp({
        create: { width: 40, height: 60, channels: 3, background: "white" },
      })
        .jpeg()
        .toBuffer();
      setHandler(async (req: any, res: any) => {
        for await (const _ of req) {
        }
        entered();
        await gate;
        res.end(
          JSON.stringify({ version: 1, pages: [image.toString("base64")] }),
        );
      });
      const pending = consentDocumentPreview(db, infra, actor, media.id).then(
        () => null,
        (e) => e,
      );
      await Promise.race([
        ready,
        pending.then((error) => {
          throw error ?? Error("Preview finished before renderer entry");
        }),
      ]);
      await db.session.delete({ where: { id: actor.sessionId } });
      release();
      assert.equal((await pending)?.getStatus(), 403);
      assert.equal(
        await db.audit.count({
          where: { action: "consent.document-preview", targetId: media.id },
        }),
        0,
      );
    }));
  test("approval rejects absent, expired, other-session and changed-document preview receipts", async () =>
    setup(async ({ db, infra, actor, media }: any) => {
      await assert.rejects(
        db.$transaction((tx: any) =>
          requireConsentPreview(tx, actor, media.id, undefined, "INTL"),
        ),
      );
      const preview = await consentDocumentPreview(db, infra, actor, media.id);
      await assert.rejects(
        db.$transaction((tx: any) =>
          requireConsentPreview(
            tx,
            { ...actor, sessionId: randomUUID() },
            media.id,
            preview.reviewId,
            "INTL",
          ),
        ),
      );
      await db.media.update({
        where: { id: media.id },
        data: { sha256: "0".repeat(64) },
      });
      await assert.rejects(
        db.$transaction((tx: any) =>
          requireConsentPreview(tx, actor, media.id, preview.reviewId, "INTL"),
        ),
      );
      await db.media.update({
        where: { id: media.id },
        data: { sha256: media.sha256 },
      });
      await db.audit.update({
        where: { id: preview.reviewId },
        data: { createdAt: new Date(Date.now() - 600001) },
      });
      await assert.rejects(
        db.$transaction((tx: any) =>
          requireConsentPreview(tx, actor, media.id, preview.reviewId, "INTL"),
        ),
      );
    }));
  test("staff can reject an unreadable consent document without asserting successful identity or signature checks", async () =>
    setup(async ({ db, staff, owner, media }: any) => {
      const child = await ctx.fixture(
        "document-rejection-" + randomUUID().slice(0, 8),
        "2018-01-01",
      );
      const consent = await db.consent.create({
        data: {
          childId: child.u.id,
          guardianId: owner.u.id,
          documentId: media.id,
          status: "PENDING",
        },
      });
      const result = await ctx.call(
        `admin/consents/${consent.id}/review`,
        { approve: false, reason: "Please replace the unreadable document" },
        staff.token,
      );
      assert.equal(result.status, 201);
      assert.equal(
        (await db.consent.findUniqueOrThrow({ where: { id: consent.id } }))
          .status,
        "REJECTED",
      );
    }));
}
