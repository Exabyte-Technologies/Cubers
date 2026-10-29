import { expireCampaignArchives } from "./campaigns";
import { AppleReceiptMaintenance } from "./attestation/receipt-maintenance";
import { receiptScheduleOff } from "./attestation/receipt-schedule";
import { expireAnnouncements } from "./announcements";
import { expireDeviceTests } from "./device-testing";
import {
  readImageAiMetadata,
  imageAiXmp,
  type ImageAiMetadata,
} from "./image-ai-metadata";
import { readVideoAiMetadata } from "./video-ai-metadata";
import { aiPropagationJson } from "./media-ai-claims";
import {
  declaredAiClaim,
  labelPostImage,
  aiLabelBanner,
} from "./media-ai-label";
import { reconcileInterruptedRelays } from "./relay";
import { eraseAccountPrefixes } from "./account-storage-removal";
import { reconcileDeletionJournal } from "./recovery";
import { retireDeletionHistory } from "./journal-retention";
import {
  Inject,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { Db, Infrastructure } from "./services";
import { createHash, randomUUID } from "node:crypto";
import { rememberObjectRemoval } from "./object-removal";
const run = promisify(execFile);
@Injectable()
export class Background implements OnModuleInit, OnModuleDestroy {
  queue?: Queue;
  worker?: Worker;
  private instance = randomUUID();
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private heartbeatJob?: Promise<void>;
  private stopping = false;
  private heartbeat() {
    if (this.stopping || this.heartbeatJob) return;
    this.heartbeatJob = this.infra.telemetry
      .heartbeat(this.instance)
      .catch(() => {
        console.error("Worker heartbeat unavailable; inspect Redis");
      })
      .finally(() => {
        this.heartbeatJob = undefined;
      });
  }
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Optional()
    @Inject(AppleReceiptMaintenance)
    private receipts?: AppleReceiptMaintenance,
  ) {}
  async onModuleInit() {
    if (process.env.WORKER_ENABLED === "false") return;
    const u = new URL(this.infra.config.REDIS_URL);
    const connection = {
      host: u.hostname,
      port: Number(u.port || 6379),
      password: u.password || undefined,
      username: u.username || undefined,
      ...(u.protocol === "rediss:" ? { tls: {} } : {}),
    };
    this.queue = new Queue(`cubers-${this.infra.config.REGION}`, {
      connection,
    });
    this.worker = new Worker(
      `cubers-${this.infra.config.REGION}`,
      async (job) => {
        const kind = job.name === "maintenance" ? "maintenance" : "media";
        try {
          if (kind === "maintenance") await this.maintenance();
          else await this.processMedia();
        } catch (error) {
          await this.infra.telemetry.safely(kind, false);
          throw error;
        }
        await this.infra.telemetry.safely(kind, true);
      },
      { connection, concurrency: 1 },
    );
    this.worker.on("error", () =>
      console.error(
        "Background worker failed; inspect service health without logging user content",
      ),
    );
    await this.queue.upsertJobScheduler(
      "maintenance",
      { every: 60000 },
      {
        name: "maintenance",
        data: {},
        opts: { removeOnComplete: 10, removeOnFail: 20 },
      },
    );
    await this.queue.upsertJobScheduler(
      "media",
      { every: 10000 },
      {
        name: "media",
        data: {},
        opts: { removeOnComplete: 10, removeOnFail: 20 },
      },
    );
    this.heartbeat();
    this.heartbeatTimer = setInterval(() => this.heartbeat(), 10000);
    this.heartbeatTimer.unref();
  }
  async processMedia() {
    const rows = await this.db.media.findMany({
      where: { status: "PROCESSING" },
      take: 5,
      orderBy: { createdAt: "asc" },
    });
    for (const m of rows) {
      const temp = await mkdtemp(join(tmpdir(), "cubers-media-"));
      try {
        const object = await this.infra.storage.send(
          new GetObjectCommand({
            Bucket: this.infra.config.S3_BUCKET,
            Key: m.key,
          }),
        );
        if (object.ContentLength !== m.size || !object.Body)
          throw new Error("Size mismatch");
        const bytes = await object.Body.transformToByteArray();
        if (bytes.length !== m.size) throw new Error("Size mismatch");
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        if (
          m.purpose === "evidence" &&
          (await this.db.media.findUnique({
            where: { evidenceFingerprint: sha256 },
          }))
        )
          throw new Error("Duplicate evidence");
        let clean: Buffer;
        let durationMs: number | null = null;
        let aiMetadata: ImageAiMetadata | null = null;
        if (m.type.startsWith("image/")) {
          const signature = Buffer.from(bytes);
          if (
            m.type === "image/png"
              ? !signature
                  .subarray(0, 8)
                  .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
              : signature[0] !== 255 ||
                signature[1] !== 216 ||
                signature[2] !== 255
          )
            throw new Error("Image signature does not match declared type");
          if (m.purpose === "post")
            aiMetadata = readImageAiMetadata(Buffer.from(bytes), m.type);
          let image = sharp(bytes, { limitInputPixels: 25000000 })
            .rotate()
            .resize({
              width: 2048,
              height: 2048,
              fit: "inside",
              withoutEnlargement: true,
            })
            .toFormat(m.type === "image/png" ? "png" : "jpeg");
          const outputClaim = declaredAiClaim(
            aiMetadata,
            m.purpose === "post" && m.aiDeclared,
          );
          if (outputClaim) {
            image = (
              await labelPostImage(await image.toBuffer(), outputClaim.Label)
            )
              .toFormat(m.type === "image/png" ? "png" : "jpeg")
              .withXmp(imageAiXmp(outputClaim, m.id));
          }
          clean = await image.toBuffer();
          if (
            outputClaim &&
            JSON.stringify(readImageAiMetadata(clean, m.type)) !==
              JSON.stringify(
                JSON.parse(aiPropagationJson(outputClaim, m.id)).AIGC,
              )
          )
            throw Error("Image label preservation failed");
        } else if (
          m.type === "video/mp4" ||
          (m.purpose === "post" && m.type === "video/quicktime")
        ) {
          if (m.purpose === "post")
            aiMetadata = readVideoAiMetadata(Buffer.from(bytes));
          const input = join(temp, "input.mp4"),
            output = join(temp, "output.mp4");
          await writeFile(input, bytes);
          const probe = await run(
            "ffprobe",
            [
              "-v",
              "error",
              "-protocol_whitelist",
              "file",
              "-format_whitelist",
              "mov",
              "-f",
              "mov",
              "-enable_drefs",
              "0",
              "-use_absolute_path",
              "0",
              "-show_entries",
              "format=duration:stream=codec_type,codec_name,width,height,sample_aspect_ratio:stream_side_data=rotation",
              "-of",
              "json",
              input,
            ],
            { timeout: 15000, maxBuffer: 32768 },
          );
          const info = JSON.parse(probe.stdout);
          durationMs = Math.round(Number(info.format?.duration) * 1000);
          if (
            !Number.isFinite(Number(info.format?.duration)) ||
            Number(info.format.duration) > (m.purpose === "post" ? 90 : 3600) ||
            Number(info.format.duration) <= 0
          )
            throw new Error("Invalid duration");
          const videos = Array.isArray(info.streams)
            ? info.streams.filter(
                (s: { codec_type: string }) => s.codec_type === "video",
              )
            : [];
          if (
            videos.length !== 1 ||
            info.streams.length > 8 ||
            !Number.isInteger(videos[0].width) ||
            !Number.isInteger(videos[0].height) ||
            videos[0].width <= 0 ||
            videos[0].height <= 0 ||
            videos[0].width > 3840 ||
            videos[0].height > 2160 ||
            !["h264", "hevc"].includes(videos[0].codec_name)
          )
            throw new Error("Invalid video stream");
          const outputClaim = declaredAiClaim(
            aiMetadata,
            m.purpose === "post" && m.aiDeclared,
          );
          const video = videos[0];
          let labelArgs: string[] = [];
          if (outputClaim) {
            const rotation = Number(
              video.side_data_list?.find(
                (s: { rotation?: number }) => s.rotation !== undefined,
              )?.rotation ?? 0,
            );
            if (
              !Number.isFinite(rotation) ||
              rotation % 90 !== 0 ||
              ![undefined, "0:1", "1:1"].includes(video.sample_aspect_ratio)
            )
              throw Error("Labelled video display geometry is unsupported");
            const swap = Math.abs(rotation % 180) === 90;
            const banner = await aiLabelBanner(
              swap ? video.height : video.width,
              swap ? video.width : video.height,
              outputClaim.Label,
            );
            const labelPath = join(temp, "ai-label.png");
            await writeFile(labelPath, banner.png);
            durationMs = Math.max(durationMs, 2000);
            labelArgs = [
              "-protocol_whitelist",
              "file",
              "-format_whitelist",
              "image2",
              "-f",
              "image2",
              "-pattern_type",
              "none",
              "-i",
              labelPath,
              "-filter_complex_threads",
              "1",
              "-filter_complex",
              `[0:v:0]scale=${banner.contentWidth}:${banner.contentHeight},setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=2,pad=${banner.width}:${banner.height}:(ow-iw)/2:0:color=0x111827[base];[base][1:v:0]overlay=0:${banner.contentHeight}:eof_action=repeat[out]`,
              "-map",
              "[out]",
              "-c:v",
              "libx264",
              "-preset",
              "veryfast",
              "-crf",
              "20",
              "-pix_fmt",
              "yuv420p",
              "-threads",
              "2",
              "-t",
              String(durationMs / 1000),
            ];
          }
          await run(
            "ffmpeg",
            [
              "-nostdin",
              "-v",
              "error",
              "-protocol_whitelist",
              "file",
              "-format_whitelist",
              "mov",
              "-f",
              "mov",
              "-enable_drefs",
              "0",
              "-use_absolute_path",
              "0",
              "-i",
              input,
              ...(outputClaim ? labelArgs : ["-map", "0:v:0", "-c:v", "copy"]),
              "-an",
              "-map_metadata",
              "-1",
              "-map_metadata:s",
              "-1",
              "-map_chapters",
              "-1",
              ...(outputClaim
                ? ["-metadata", "AIGC=" + aiPropagationJson(outputClaim, m.id)]
                : []),
              "-movflags",
              outputClaim ? "+faststart+use_metadata_tags" : "+faststart",
              output,
            ],
            { timeout: 60000, maxBuffer: 32768 },
          );
          clean = await readFile(output);
          if (outputClaim) {
            const verified = JSON.parse(
              (
                await run(
                  "ffprobe",
                  [
                    "-v",
                    "error",
                    "-protocol_whitelist",
                    "file",
                    "-format_whitelist",
                    "mov",
                    "-f",
                    "mov",
                    "-show_entries",
                    "format=duration:stream=codec_type,codec_name,width,height",
                    "-of",
                    "json",
                    output,
                  ],
                  { timeout: 15000, maxBuffer: 32768 },
                )
              ).stdout,
            );
            const stream = verified.streams?.[0];
            const seconds = Number(verified.format?.duration);
            if (
              verified.streams?.length !== 1 ||
              stream?.codec_type !== "video" ||
              stream.codec_name !== "h264" ||
              !Number.isInteger(stream.width) ||
              stream.width < 1 ||
              stream.width > 2048 ||
              !Number.isInteger(stream.height) ||
              stream.height < 1 ||
              stream.height > 2048 ||
              !Number.isFinite(seconds) ||
              seconds < 2 ||
              seconds > 90.05
            )
              throw Error("Labelled video output failed validation");
            durationMs = Math.round(seconds * 1000);
          }
          if (m.purpose === "post") {
            const expected = outputClaim
              ? JSON.parse(aiPropagationJson(outputClaim, m.id)).AIGC
              : null;
            if (
              JSON.stringify(readVideoAiMetadata(clean)) !==
              JSON.stringify(expected)
            )
              throw Error("Video label preservation failed");
          }
        } else {
          const b = Buffer.from(bytes);
          if (
            b.subarray(0, 5).toString() !== "%PDF-" ||
            !b.subarray(-2048).includes(Buffer.from("%%EOF"))
          )
            throw new Error("Invalid PDF");
          clean = b;
        }
        const key = m.key.replace(/\/upload$/, "/clean");
        await this.infra.storage.send(
          new PutObjectCommand({
            Bucket: this.infra.config.S3_BUCKET,
            Key: key,
            Body: clean,
            ContentType: m.type.startsWith("video/") ? "video/mp4" : m.type,
            ContentDisposition:
              m.purpose === "consent" ? "attachment" : "inline",
            ServerSideEncryption:
              process.env.S3_SSE === "AES256" ? "AES256" : undefined,
          }),
        );
        await this.infra.delete(m.key);
        const updated = await this.db.media.updateMany({
          where: { id: m.id, status: "PROCESSING" },
          data: {
            key,
            status: "READY",
            sha256,
            aiLabel: aiMetadata?.Label ?? null,
            ...(aiMetadata ? { aiMetadata } : {}),
            evidenceFingerprint: m.purpose === "evidence" ? sha256 : null,
            size: clean.length,
            durationMs,
            type: m.type.startsWith("video/") ? "video/mp4" : m.type,
          },
        });
        if (!updated.count) await this.infra.delete(key);
      } catch {
        await this.db.media.updateMany({
          where: { id: m.id, status: "PROCESSING" },
          data: { status: "REJECTED" },
        });
        await this.infra.delete(m.key).catch(() => {});
        await this.infra
          .delete(m.key.replace(/\/upload$/, "/clean"))
          .catch(() => {});
      } finally {
        await rm(temp, { recursive: true, force: true });
      }
    }
  }
  async maintenance() {
    await reconcileDeletionJournal(this.db, this.infra.config);
    await reconcileInterruptedRelays(this.db);
    await expireCampaignArchives(this.db);
    await expireAnnouncements(this.db);
    await expireDeviceTests(this.db);
    // Deadlines are also checked on every active attempt write; this sweep is cleanup.
    await this.db.attempt.updateMany({
      where: {
        status: { in: ["CREATED", "INSPECTION", "SOLVING"] },
        room: {
          competitionAttempt: true,
          OR: [
            { competitionRound: { closesAt: { lte: new Date() } } },
            { competitionRoundId: null },
          ],
        },
      },
      data: {
        status: "INTERRUPTED",
        reason: "Scheduled round deadline reached",
        version: { increment: 1 },
      },
    });
    const expiredCompetitions = await this.db.competition.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: {
        id: true,
        entries: {
          select: { id: true, publications: { select: { id: true } } },
        },
      },
      take: 100,
    });
    for (const event of expiredCompetitions) {
      const targets = [
        event.id,
        ...event.entries.flatMap((e) => [
          e.id,
          ...e.publications.map((p) => p.id),
        ]),
      ];
      await this.db.$transaction([
        this.db.audit.updateMany({
          where: {
            action: { startsWith: "competition." },
            targetId: { in: targets },
          },
          data: {
            actorId: "expired",
            targetId: "expired-competition",
            detail: { expired: true },
          },
        }),
        this.db.competition.deleteMany({
          where: { id: event.id, expiresAt: { lte: new Date() } },
        }),
      ]);
    }
    await this.db.replayShare.updateMany({
      where: {
        expiresAt: { lte: new Date() },
        status: { in: ["PENDING_GUARDIAN", "PENDING_REVIEW", "READY"] },
      },
      data: { status: "EXPIRED", tokenHash: null, revision: { increment: 1 } },
    });
    const oldReplayShares = await this.db.replayShare.findMany({
      where: { createdAt: { lt: new Date(Date.now() - 30 * 86400000) } },
      select: { id: true },
      take: 500,
      orderBy: { createdAt: "asc" },
    });
    if (oldReplayShares.length)
      await this.db.$transaction([
        this.db.audit.updateMany({
          where: {
            action: { startsWith: "replay-share." },
            targetId: { in: oldReplayShares.map((row) => row.id) },
          },
          data: {
            targetId: "expired-replay-share",
            detail: { redacted: true },
          },
        }),
        this.db.replayShare.deleteMany({
          where: { id: { in: oldReplayShares.map((row) => row.id) } },
        }),
      ]);
    const oldCards = await this.db.achievementCard.findMany({
      where: { createdAt: { lt: new Date(Date.now() - 30 * 86400000) } },
      select: { id: true },
      take: 500,
      orderBy: { createdAt: "asc" },
    });
    if (oldCards.length)
      await this.db.$transaction([
        this.db.audit.updateMany({
          where: {
            action: { startsWith: "card." },
            targetId: { in: oldCards.map((row) => row.id) },
          },
          data: { targetId: "expired-card", detail: { redacted: true } },
        }),
        this.db.achievementCard.deleteMany({
          where: { id: { in: oldCards.map((row) => row.id) } },
        }),
      ]);
    const notificationNow = Date.now();
    await this.db.notification.deleteMany({
      where: {
        OR: [
          { createdAt: { lt: new Date(notificationNow - 90 * 86400000) } },
          {
            read: true,
            createdAt: { lt: new Date(notificationNow - 30 * 86400000) },
          },
        ],
      },
    });
    await this.db.guidedSolve.updateMany({
      where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
      data: {
        status: "EXPIRED",
        finishedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await this.db.guidedSolve.deleteMany({
      where: {
        OR: [
          {
            status: "EXPIRED",
            expiresAt: { lt: new Date(Date.now() - 30 * 86400000) },
          },
          {
            status: "CANCELLED",
            finishedAt: { lt: new Date(Date.now() - 30 * 86400000) },
          },
        ],
      },
    });
    await this.db.learningAssessment.updateMany({
      where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
      data: {
        status: "EXPIRED",
        finishedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await this.db.learningAssessment.deleteMany({
      where: {
        OR: [
          {
            status: "EXPIRED",
            expiresAt: { lt: new Date(Date.now() - 30 * 86400000) },
          },
          {
            status: "CANCELLED",
            finishedAt: { lt: new Date(Date.now() - 30 * 86400000) },
          },
        ],
      },
    });
    const now = new Date();
    await this.db.connection.updateMany({
      where: { status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED", version: { increment: 1 } },
    });
    await this.db.connection.deleteMany({
      where: {
        status: { in: ["DECLINED", "CANCELLED", "ENDED", "EXPIRED"] },
        updatedAt: { lt: new Date(Date.now() - 90 * 86400000) },
      },
    });
    await this.db.audit.deleteMany({
      where: {
        OR: [
          { action: { startsWith: "connection." } },
          { action: { startsWith: "profile." } },
          { action: { startsWith: "card." } },
          { action: { startsWith: "competition." } },
        ],
        createdAt: { lt: new Date(Date.now() - 190 * 86400000) },
      },
    });
    const withdrawn = await this.db.media.findMany({
      where: { status: "DELETING" },
    });
    for (const media of withdrawn) {
      await rememberObjectRemoval(this.db, media, this.infra.config);
      await this.infra.delete(media.key);
      await this.db.$transaction([
        this.db.attempt.updateMany({
          where: { evidenceId: media.id },
          data: { evidenceId: null },
        }),
        this.db.media.deleteMany({ where: { id: media.id } }),
      ]);
    }
    await this.db.appAttestationGrant.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    await this.db.appAttestationChallenge.updateMany({
      where: {
        status: { in: ["PENDING", "VERIFYING"] },
        expiresAt: { lte: now },
      },
      data: { status: "FAILED", finishedAt: now },
    });
    await this.db.appAttestationChallenge.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - 2 * 86400000) } },
    });
    await this.db.appAttestationKey.updateMany({
      where: { status: "ACTIVE", receiptExpiresAt: { lte: now } },
      data: {
        status: "EXPIRED",
        publicKeyPem: null,
        receiptCiphertext: null,
        ...receiptScheduleOff,
        version: { increment: 1 },
      },
    });
    await this.db.appAttestationKey.deleteMany({
      where: {
        status: { in: ["REVOKED", "EXPIRED"] },
        updatedAt: { lt: new Date(now.getTime() - 30 * 86400000) },
      },
    });
    await this.db.session.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.db.authToken.deleteMany({ where: { expiresAt: { lt: now } } });
    const cutoff = new Date(Date.now() - 30 * 86400000);
    await this.db.attempt.updateMany({
      where: {
        status: {
          in: [
            "CREATED",
            "INSPECTION",
            "SOLVING",
            "AWAITING_EVIDENCE",
            "PROVISIONAL",
          ],
        },
        createdAt: { lt: cutoff },
      },
      data: {
        status: "EXPIRED",
        reason: "Unresolved attempt expired without ranking credit",
        evidenceDeleteAt: now,
      },
    });
    const expired = await this.db.attempt.findMany({
      where: { evidenceId: { not: null }, evidenceDeleteAt: { lte: now } },
    });
    for (const a of expired) {
      const m = await this.db.media.findUnique({
        where: { id: a.evidenceId! },
      });
      if (m) {
        await rememberObjectRemoval(this.db, m, this.infra.config);
        await this.infra.delete(m.key);
        await this.db.media.delete({ where: { id: m.id } });
      }
      await this.db.attempt.update({
        where: { id: a.id },
        data: { evidenceId: null },
      });
    }
    const jobs = await this.db.setting.findMany({
      where: { key: { startsWith: "delete:" } },
    });
    for (const job of jobs) {
      const ids = (job.value as { ids: string[] }).ids;
      const media = await this.db.media.findMany({
        where: { userId: { in: ids } },
      });
      for (const m of media) {
        await rememberObjectRemoval(this.db, m, this.infra.config);
        await this.infra.delete(m.key);
      }
      const owned = await this.db.room.findMany({
        where: { ownerId: { in: ids } },
        select: { id: true },
      });
      const roomIds = owned.map((x) => x.id);
      const clubs = await this.db.club.findMany({
        where: { ownerId: { in: ids } },
        select: { id: true },
      });
      const clubIds = clubs.map((x) => x.id);
      const personalPosts = await this.db.post.findMany({
        where: { authorId: { in: ids } },
        select: { id: true },
      });
      const personalAttempts = await this.db.attempt.findMany({
        where: { userId: { in: ids } },
        select: { id: true },
      });
      const personalComments = await this.db.comment.findMany({
        where: { authorId: { in: ids } },
        select: { id: true },
      });
      const personalConnections = await this.db.connection.findMany({
        where: {
          OR: [{ requesterId: { in: ids } }, { recipientId: { in: ids } }],
        },
        select: { id: true },
      });
      const personalCompetitionEntries =
        await this.db.competitionEntry.findMany({
          where: { userId: { in: ids } },
          select: { id: true, publications: { select: { id: true } } },
        });
      const targets = [
        ...personalCompetitionEntries.flatMap((e) => [
          e.id,
          ...e.publications.map((p) => p.id),
        ]),
        ...(
          await this.db.replayShare.findMany({
            where: { userId: { in: ids } },
            select: { id: true },
          })
        ).map((row) => row.id),
        ...ids,
        ...personalPosts.map((x) => x.id),
        ...personalAttempts.map((x) => x.id),
        ...personalComments.map((x) => x.id),
        ...personalConnections.map((x) => x.id),
        ...media.map((x) => x.id),
        ...(
          await this.db.achievementCard.findMany({
            where: { userId: { in: ids } },
            select: { id: true },
          })
        ).map((x) => x.id),
      ];
      const removedOwner = "00000000-0000-0000-0000-000000000000";
      await this.db.$transaction(async (tx) => {
        await tx.roomMember.deleteMany({
          where: { userId: { in: ids } },
        });
        // Preserve other participants' private histories and evidence. Shared
        // containers become read-only and lose the departing owner's identity.
        await tx.room.updateMany({
          where: { id: { in: roomIds } },
          data: { ownerId: removedOwner, status: "CLOSED", private: true },
        });
        const rosterRooms = await tx.room.findMany({
          where: { roster: { hasSome: ids } },
          select: { id: true, roster: true },
        });
        for (const row of rosterRooms)
          await tx.room.update({
            where: { id: row.id },
            data: {
              roster: row.roster.filter((userId) => !ids.includes(userId)),
            },
          });
        await tx.membership.deleteMany({
          where: { userId: { in: ids } },
        });
        await tx.club.updateMany({
          where: { id: { in: clubIds } },
          data: {
            ownerId: removedOwner,
            status: "ARCHIVED",
            private: true,
            name: "Archived club · 已归档社团",
            description: "",
            reason: null,
          },
        });
        await tx.comment.updateMany({
          where: { parentId: { in: personalComments.map((x) => x.id) } },
          data: { parentId: null },
        });
        await tx.social.deleteMany({
          where: {
            OR: [{ actorId: { in: ids } }, { targetId: { in: targets } }],
          },
        });
        await tx.report.deleteMany({
          where: {
            OR: [{ reporterId: { in: ids } }, { targetId: { in: targets } }],
          },
        });
        await tx.consent.deleteMany({
          where: {
            OR: [{ guardianId: { in: ids } }, { childId: { in: ids } }],
          },
        });
        await tx.media.deleteMany({ where: { userId: { in: ids } } });
        await tx.authToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.audit.updateMany({
          where: {
            OR: [{ actorId: { in: ids } }, { targetId: { in: targets } }],
          },
          data: {
            actorId: "deleted",
            targetId: "deleted",
            detail: { redacted: true },
          },
        });
        await tx.attempt.updateMany({
          where: { reviewerId: { in: ids } },
          data: { reviewerId: null },
        });
        await tx.user.deleteMany({ where: { id: { in: ids } } });
        await tx.setting.delete({ where: { key: job.key } });
      });
    }
    await eraseAccountPrefixes(this.db, this.infra);
    // Orphaned and abandoned private uploads are bounded independently of account deletion.
    const stale = await this.db.media.findMany({
      where: {
        createdAt: { lt: new Date(Date.now() - 86400000) },
        status: { in: ["PENDING", "REJECTED"] },
      },
    });
    for (const m of stale) {
      await rememberObjectRemoval(this.db, m, this.infra.config);
      await this.infra.delete(m.key);
      await this.db.media.delete({ where: { id: m.id } });
    }
    const unattached = await this.db.media.findMany({
      where: {
        status: "READY",
        createdAt: { lt: new Date(Date.now() - 86400000) },
      },
      take: 200,
      orderBy: { createdAt: "asc" },
    });
    for (const m of unattached) {
      const reserved = await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${m.userId}::uuid FOR UPDATE`;
        const current = await tx.media.findFirst({
          where: {
            id: m.id,
            status: "READY",
            createdAt: { lt: new Date(Date.now() - 86400000) },
          },
        });
        if (!current) return false;
        const referenced =
          (await tx.post.count({ where: { mediaIds: { has: m.id } } })) ||
          (await tx.consent.count({ where: { documentId: m.id } })) ||
          (await tx.attempt.count({
            where: {
              OR: [
                { evidenceId: m.id },
                ...(m.attemptId
                  ? [
                      {
                        id: m.attemptId,
                        status: "AWAITING_EVIDENCE",
                        createdAt: { gte: cutoff },
                      },
                    ]
                  : []),
              ],
            },
          }));
        if (referenced) return false;
        return (
          (
            await tx.media.updateMany({
              where: { id: m.id, status: "READY" },
              data: { status: "DELETING" },
            })
          ).count === 1
        );
      });
      if (reserved) {
        await rememberObjectRemoval(this.db, m, this.infra.config);
        await this.infra.delete(m.key);
        await this.db.media.deleteMany({
          where: { id: m.id, status: "DELETING" },
        });
      }
    }
    // Re-delete both staging and processed keys after rows are removed: a
    // previously issued signed PUT may finish after the first deletion pass.
    const removals = await this.db.objectRemoval.findMany({
      where: { retryAt: { lte: now } },
      take: 200,
      orderBy: { retryAt: "asc" },
    });
    for (const removal of removals) {
      for (const key of removal.keys) await this.infra.delete(key);
      if (removal.expiresAt <= now)
        await this.db.objectRemoval.deleteMany({ where: { id: removal.id } });
      else
        await this.db.objectRemoval.updateMany({
          where: { id: removal.id },
          data: { retryAt: new Date(Date.now() + 60000) },
        });
    }
    const retirement = await retireDeletionHistory(this.db, this.infra.config);
    if ("deferred" in retirement && Number(retirement.deferred) > 0)
      throw Error(
        "Expired privacy history is waiting for confirmed erasure cleanup; inspect maintenance failures",
      );
    await this.receipts?.run();
  }
  async onModuleDestroy() {
    this.stopping = true;
    clearInterval(this.heartbeatTimer);
    await this.receipts?.onModuleDestroy();
    await this.worker?.close();
    await this.queue?.close();
    await this.heartbeatJob;
    if (this.worker)
      await this.infra.telemetry.stopped(this.instance).catch(() => {});
  }
}
