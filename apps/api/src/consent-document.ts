import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { request } from "node:http";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { communityWrite } from "./community-authority";
import type { Authed } from "./security";
import type { Db, Infrastructure } from "./services";
import type { Prisma } from "@prisma/client";
let active = 0;
export async function renderConsentPages(
  socketPath: string,
  bytes: Buffer,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const req = request({
      socketPath,
      path: "/review",
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": bytes.length,
      },
      agent: false,
    });
    const timer = setTimeout(
      () => req.destroy(Error("Document review timed out")),
      12500,
    );
    let result: string[] | undefined, failure: Error | undefined;
    req.once("response", (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      if (res.statusCode !== 200) {
        req.destroy(
          res.statusCode === 422
            ? new BadRequestException(
                "Use an unencrypted PDF of at most eight pages",
              )
            : new ServiceUnavailableException(
                "Document review service is busy or unavailable; retry shortly",
              ),
        );
        return;
      }
      res.on("data", (b) => {
        size += b.length;
        if (size > 12 * 1024 * 1024)
          req.destroy(Error("Document response too large"));
        else chunks.push(b);
      });
      res.once("error", (e) => {
        failure = e;
        req.destroy(e);
      });
      res.once("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          if (
            data.version !== 1 ||
            !Array.isArray(data.pages) ||
            data.pages.length < 1 ||
            data.pages.length > 8 ||
            !data.pages.every(
              (p: unknown) =>
                typeof p === "string" &&
                p.length <= 1400000 &&
                /^[A-Za-z0-9+/]+={0,2}$/.test(p),
            )
          )
            throw Error("Invalid review response");
          result = data.pages;
        } catch {
          failure = Error("Invalid review response");
        }
      });
    });
    req.once("error", (e) => {
      failure = e;
    });
    req.once("close", () => {
      clearTimeout(timer);
      if (failure || !result)
        reject(
          failure instanceof BadRequestException ||
            failure instanceof ServiceUnavailableException
            ? failure
            : new ServiceUnavailableException(
                "Document review service is unavailable; retry shortly",
              ),
        );
      else resolve(result);
    });
    req.end(bytes);
  });
}
export async function consentDocumentPreview(
  db: Db,
  infra: Infrastructure,
  actor: Authed,
  id: string,
) {
  const snapshot = await db.media.findUniqueOrThrow({ where: { id } });
  const capability = snapshot.userId === actor.user.id ? "account" : "staff";
  const authorize = (
    work: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) =>
    communityWrite(
      db,
      infra.config,
      actor,
      capability,
      [snapshot.userId],
      async (tx) => {
        const current = await tx.media.findUnique({ where: { id } }),
          owner = await tx.user.findUnique({ where: { id: snapshot.userId } });
        if (
          !owner ||
          owner.deletedAt ||
          owner.region !== infra.config.REGION ||
          !current ||
          current.userId !== snapshot.userId ||
          current.purpose !== "consent" ||
          current.type !== "application/pdf" ||
          current.status !== "READY" ||
          !current.sha256 ||
          current.sha256 !== snapshot.sha256 ||
          current.key !== snapshot.key ||
          current.size !== snapshot.size ||
          current.size > 10 * 1024 * 1024
        )
          throw new ForbiddenException(
            "Current private consent document required",
          );
        return work(tx);
      },
    );
  await authorize(async () => undefined);
  if (
    !(await infra.limit(`document-review:${actor.user.id}`, 12, 60)) ||
    active >= 2
  )
    throw new ServiceUnavailableException(
      "Document review is busy; retry shortly",
    );
  active++;
  try {
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 3000);
    let bytes: Buffer;
    try {
      const object = await infra.storage.send(
        new GetObjectCommand({
          Bucket: infra.config.S3_BUCKET,
          Key: snapshot.key,
        }),
        { abortSignal: abort.signal },
      );
      if (!object.Body || object.ContentLength !== snapshot.size)
        throw Error("Document size mismatch");
      const body = object.Body as AsyncIterable<Uint8Array> & {
        destroy?: () => void;
      };
      const stop = () => body.destroy?.();
      abort.signal.addEventListener("abort", stop, { once: true });
      try {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const b of body) {
          size += b.length;
          if (size > snapshot.size || abort.signal.aborted)
            throw Error("Document size mismatch");
          chunks.push(Buffer.from(b));
        }
        bytes = Buffer.concat(chunks);
      } finally {
        abort.signal.removeEventListener("abort", stop);
      }
      if (
        bytes.length !== snapshot.size ||
        createHash("sha256").update(bytes).digest("hex") !== snapshot.sha256
      )
        throw Error("Document digest mismatch");
    } finally {
      clearTimeout(timer);
    }
    const rendered = await renderConsentPages(
      infra.config.CONSENT_REVIEW_SOCKET,
      bytes,
    );
    const pages: string[] = [];
    for (const page of rendered) {
      const image = sharp(Buffer.from(page, "base64"), {
        limitInputPixels: 1600 * 1600,
        failOn: "warning",
      });
      const metadata = await image.metadata();
      if (
        metadata.format !== "jpeg" ||
        !metadata.width ||
        !metadata.height ||
        metadata.width > 1600 ||
        metadata.height > 1600 ||
        (metadata.pages ?? 1) !== 1
      )
        throw Error("Invalid document page");
      const safe = await image
        .flatten({ background: "white" })
        .jpeg({ quality: 90 })
        .toBuffer();
      if (safe.length > 1024 * 1024) throw Error("Document page too large");
      pages.push("data:image/jpeg;base64," + safe.toString("base64"));
    }
    let reviewId: string | undefined;
    await authorize(async (tx) => {
      if (capability === "staff") {
        const audit = await tx.audit.create({
          data: {
            actorId: actor.user.id,
            action: "consent.document-preview",
            targetId: id,
            detail: {
              sha256: snapshot.sha256,
              sessionHash: createHash("sha256")
                .update(actor.sessionId)
                .digest("hex"),
              mfaGeneration: actor.user.mfaGeneration,
              region: infra.config.REGION,
            },
          },
        });
        reviewId = audit.id;
      }
    });
    return {
      id,
      pages,
      reviewId,
      expiresIn: 600,
      originalSha256: snapshot.sha256,
      signatureValidated: false,
    };
  } catch (e) {
    if (
      e instanceof ForbiddenException ||
      e instanceof ServiceUnavailableException ||
      e instanceof BadRequestException
    )
      throw e;
    throw new BadRequestException(
      "Document preview failed. Use an unencrypted PDF of at most eight pages; the private original is unchanged.",
    );
  } finally {
    active--;
  }
}
export async function requireConsentPreview(
  tx: Prisma.TransactionClient,
  actor: Authed,
  documentId: string,
  reviewId: string | undefined,
  region: string,
) {
  if (!reviewId)
    throw new BadRequestException(
      "Open the isolated document preview before approving consent",
    );
  const [review, document] = await Promise.all([
    tx.audit.findUnique({ where: { id: reviewId } }),
    tx.media.findUnique({ where: { id: documentId } }),
  ]);
  const detail = review?.detail as Record<string, unknown> | undefined;
  if (
    !review ||
    review.actorId !== actor.user.id ||
    review.action !== "consent.document-preview" ||
    review.targetId !== documentId ||
    review.createdAt.getTime() <= Date.now() - 600000 ||
    review.createdAt.getTime() > Date.now() ||
    !document ||
    document.purpose !== "consent" ||
    document.status !== "READY" ||
    !document.sha256 ||
    detail?.sha256 !== document.sha256 ||
    detail.sessionHash !==
      createHash("sha256").update(actor.sessionId).digest("hex") ||
    detail.mfaGeneration !== actor.user.mfaGeneration ||
    detail.region !== region
  )
    throw new ForbiddenException(
      "Document preview expired or changed; reopen it before approval",
    );
}
