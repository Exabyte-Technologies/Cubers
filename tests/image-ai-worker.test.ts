import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Background } from "../apps/api/src/worker";
import type { Db, Infrastructure } from "../apps/api/src/services";
import {
  imageAiXmp,
  readImageAiMetadata,
} from "../apps/api/src/image-ai-metadata";
import { readVideoAiMetadata } from "../apps/api/src/video-ai-metadata";
const execFile = promisify(execFileCb);

const claim = {
  Label: "2" as const,
  ContentProducer: "synthetic-来源",
  ProduceID: "source-id",
  ReservedCode1: "unverified",
  ContentPropagator: "",
  PropagateID: "",
  ReservedCode2: "",
};
// Exercise the real processor with in-memory persistence/storage only. No sockets,
// Redis worker startup, real database, S3 service or AI provider are involved.
async function process(
  bytes: Buffer,
  type: string,
  deletedDuringPut = false,
  aiDeclared = false,
) {
  const id = randomUUID(),
    key = `INTL/synthetic/${id}/upload`;
  const row: any = {
    id,
    key,
    type,
    size: bytes.length,
    purpose: "post",
    status: "PROCESSING",
    aiDeclared,
  };
  const objects = new Map<string, Buffer>([[key, bytes]]);
  const db = {
    media: {
      findMany: async () => [row],
      updateMany: async ({ where, data }: any) => {
        if (row.status !== where.status || row.id !== where.id)
          return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  } as unknown as Db;
  const infra = {
    config: { S3_BUCKET: "synthetic-only" },
    storage: {
      send: async (command: GetObjectCommand | PutObjectCommand) => {
        assert.equal(command.input.Bucket, "synthetic-only");
        if (command instanceof GetObjectCommand) {
          const b = objects.get(command.input.Key!)!;
          return {
            ContentLength: b.length,
            Body: { transformToByteArray: async () => b },
          };
        }
        assert.ok(command instanceof PutObjectCommand);
        objects.set(
          command.input.Key!,
          Buffer.from(command.input.Body as Buffer),
        );
        if (deletedDuringPut) row.status = "DELETING";
        return {};
      },
    },
    delete: async (path: string) => {
      objects.delete(path);
    },
  } as unknown as Infrastructure;
  await new Background(db, infra).processMedia();
  return { row, objects, key };
}

test("real image worker preserves recognized claims, strips unrelated metadata and keeps ordinary images unlabelled with simulated persistence", async () => {
  for (const type of ["jpeg", "png"] as const)
    for (const labelled of [true, false]) {
      let image = sharp({
        create: { width: 2050, height: 30, channels: 3, background: "#18495f" },
      })
        .withExif({ IFD0: { Artist: "PRIVATE-location-device" } })
        .toFormat(type);
      if (labelled) image = image.withXmp(imageAiXmp(claim, "previous-id"));
      const input = await image.toBuffer();
      const { row, objects, key } = await process(input, `image/${type}`);
      assert.equal(row.status, "READY");
      assert.equal(objects.has(key), false);
      assert.equal(objects.size, 1);
      const output = objects.get(row.key)!;
      const metadata = await sharp(output).metadata();
      assert.equal(metadata.width, 2048);
      assert.equal(metadata.exif, undefined);
      assert.equal(
        output.includes(Buffer.from("PRIVATE-location-device")),
        false,
      );
      if (labelled) {
        assert.equal(row.aiLabel, "2");
        assert.equal(row.aiMetadata.PropagateID, "previous-id");
        assert.deepEqual(readImageAiMetadata(output, `image/${type}`), {
          ...claim,
          ContentPropagator: "Cubers",
          PropagateID: row.id,
          ReservedCode2: "",
        });
      } else {
        assert.equal(row.aiLabel, null);
        assert.equal(row.aiMetadata, undefined);
        assert.equal(metadata.xmp, undefined);
        assert.equal(readImageAiMetadata(output, `image/${type}`), null);
      }
    }
});

test("real image worker rejects malformed claims and unsupported credentials without retaining uploaded or processed objects", async () => {
  for (const xmp of [
    "<AIGC>broken claim</AIGC>",
    "<credential>c2pa</credential>",
  ]) {
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#3a8971" },
    })
      .jpeg()
      .withXmp(xmp)
      .toBuffer();
    const { row, objects } = await process(bytes, "image/jpeg");
    assert.equal(row.status, "REJECTED");
    assert.equal(objects.size, 0);
    assert.equal(row.aiLabel, undefined);
  }
});

test("an image deleted during processing cannot publish its new label or leave an orphan output", async () => {
  const bytes = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "#3a8971" },
  })
    .png()
    .withXmp(imageAiXmp(claim, "previous-id"))
    .toBuffer();
  const { row, objects } = await process(bytes, "image/png", true);
  assert.equal(row.status, "DELETING");
  assert.equal(objects.size, 0);
  assert.equal(row.aiLabel, undefined);
});

test("real video worker preserves MP4/MOV claims while removing audio and private global/stream metadata", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cubers-video-claims-"));
  try {
    for (const [extension, Label] of [
      ["mp4", "1"],
      ["mov", "3"],
    ] as const) {
      const original = { ...claim, Label, ReservedCode2: "prior-signature" },
        path = join(temp, `source.${extension}`);
      await execFile(
        "ffmpeg",
        [
          "-nostdin",
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "color=c=blue:s=80x60:r=5",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:sample_rate=8000",
          "-t",
          "0.5",
          "-c:v",
          "libx264",
          "-c:a",
          "aac",
          "-metadata",
          "title=PRIVATE-LOCATION",
          "-metadata:s:v:0",
          "handler_name=PRIVATE-DEVICE",
          "-metadata",
          "AIGC=" + JSON.stringify({ AIGC: original }),
          "-movflags",
          "use_metadata_tags",
          path,
        ],
        { timeout: 20000 },
      );
      const input = await readFile(path);
      assert.deepEqual(readVideoAiMetadata(input), original);
      const { row, objects, key } = await process(
        input,
        extension === "mov" ? "video/quicktime" : "video/mp4",
      );
      assert.equal(row.status, "READY");
      assert.equal(row.type, "video/mp4");
      assert.equal(row.aiLabel, Label);
      assert.equal(objects.has(key), false);
      assert.equal(objects.size, 1);
      assert.deepEqual(row.aiMetadata, original);
      const output = objects.get(row.key)!;
      assert.deepEqual(readVideoAiMetadata(output), {
        ...original,
        ContentPropagator: "Cubers",
        PropagateID: row.id,
        ReservedCode2: "",
      });
      const clean = join(temp, `clean-${extension}.mp4`);
      await writeFile(clean, output);
      const probe = JSON.parse(
        (
          await execFile("ffprobe", [
            "-v",
            "error",
            "-show_entries",
            "format_tags:stream=codec_type,codec_name:stream_tags",
            "-of",
            "json",
            clean,
          ])
        ).stdout,
      );
      assert.equal(probe.streams.length, 1);
      assert.equal(probe.streams[0].codec_type, "video");
      assert.equal(JSON.stringify(probe).includes("PRIVATE-"), false);
      assert.equal(JSON.parse(probe.format.tags.AIGC).AIGC.PropagateID, row.id);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("real video worker refuses malformed declared metadata and credential containers instead of stripping them", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cubers-video-refusal-"));
  try {
    const path = join(temp, "malformed.mp4");
    await execFile(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=80x60:r=5",
        "-t",
        "0.5",
        "-c:v",
        "libx264",
        "-metadata",
        "AIGC=malformed source",
        "-movflags",
        "use_metadata_tags",
        path,
      ],
      { timeout: 20000 },
    );
    const plain = join(temp, "plain.mp4");
    await execFile(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-i",
        path,
        "-c",
        "copy",
        "-map_metadata",
        "-1",
        plain,
      ],
      { timeout: 20000 },
    );
    const bytes = await readFile(path),
      cleanBytes = await readFile(plain),
      credential = Buffer.alloc(24);
    credential.writeUInt32BE(24);
    credential.write("uuid", 4);
    Buffer.from("d8fec3d61b0e483c92975828877ec481", "hex").copy(credential, 8);
    assert.equal(readVideoAiMetadata(cleanBytes), null);
    for (const input of [bytes, Buffer.concat([cleanBytes, credential])]) {
      const { row, objects } = await process(input, "video/mp4");
      assert.equal(row.status, "REJECTED");
      assert.equal(row.aiLabel, undefined);
      assert.equal(objects.size, 0);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("author-declared photos receive visible and embedded possible-generation labels without claiming source provenance", async () => {
  for (const type of ["png", "jpeg"]) {
    const bytes = await sharp({
      create: { width: 90, height: 60, channels: 3, background: "#164fa0" },
    })
      .toFormat(type as "png" | "jpeg")
      .toBuffer();
    const { row, objects } = await process(bytes, "image/" + type, false, true);
    assert.equal(row.status, "READY");
    assert.equal(row.aiDeclared, true);
    assert.equal(row.aiLabel, null);
    assert.equal(row.aiMetadata, undefined);
    const output = objects.get(row.key)!,
      claim = readImageAiMetadata(output, "image/" + type)!;
    assert.equal(claim.Label, "2");
    assert.equal(claim.ContentProducer, "");
    assert.equal(claim.ProduceID, "");
    assert.equal(claim.ContentPropagator, "Cubers");
    assert.equal(claim.PropagateID, row.id);
    const geometry = await sharp(output).metadata();
    assert.equal(geometry.width, 320);
    assert.ok(geometry.height! > 60);
  }
});
test("author-declared short videos carry a visible footer at the start and after two seconds, silent H264 output and embedded labels", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cubers-declared-video-"));
  try {
    const source = join(temp, "source.mp4"),
      output = join(temp, "output.mp4");
    await execFile(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=80x60:r=5",
        "-t",
        "0.5",
        "-c:v",
        "libx264",
        source,
      ],
      { timeout: 20000 },
    );
    const { row, objects } = await process(
      await readFile(source),
      "video/mp4",
      false,
      true,
    );
    assert.equal(row.status, "READY");
    assert.equal(row.aiLabel, null);
    assert.equal(row.aiDeclared, true);
    assert.ok(row.durationMs >= 2000);
    const bytes = objects.get(row.key)!;
    assert.equal(readVideoAiMetadata(bytes)!.Label, "2");
    await writeFile(output, bytes);
    const probe = JSON.parse(
      (
        await execFile("ffprobe", [
          "-v",
          "error",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          output,
        ])
      ).stdout,
    );
    assert.equal(probe.streams.length, 1);
    assert.equal(probe.streams[0].codec_name, "h264");
    assert.ok(Number(probe.format.duration) >= 2);
    for (const [i, time] of ["0", "1.9"].entries()) {
      const frame = join(temp, "frame" + i + ".png");
      await execFile(
        "ffmpeg",
        [
          "-nostdin",
          "-v",
          "error",
          "-ss",
          time,
          "-i",
          output,
          "-frames:v",
          "1",
          frame,
        ],
        { timeout: 20000 },
      );
      const { data, info } = await sharp(frame)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let white = 0;
      for (let y = 60; y < info.height; y++)
        for (let x = 0; x < info.width; x++) {
          const p = (y * info.width + x) * 3;
          if (data[p] > 210 && data[p + 1] > 210 && data[p + 2] > 210) white++;
        }
      assert.ok(white > 50);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("labelled portrait video applies rotation and records actual output duration when the removed audio outlasts the video", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cubers-rotated-label-"));
  try {
    const source = join(temp, "source.mp4"),
      rotated = join(temp, "rotated.mp4"),
      clean = join(temp, "clean.mp4");
    await execFile(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=80x60:r=5:d=0.5",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=4",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        source,
      ],
      { timeout: 20000 },
    );
    await execFile(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        ...((
          await execFile("ffmpeg", ["-hide_banner", "-h", "full"], {
            maxBuffer: 8 * 1024 * 1024,
          })
        ).stdout.includes("-display_rotation")
          ? ["-display_rotation", "90", "-i", source, "-c", "copy"]
          : ["-i", source, "-c", "copy", "-metadata:s:v:0", "rotate=90"]),
        rotated,
      ],
      { timeout: 20000 },
    );
    const before = JSON.parse(
      (
        await execFile("ffprobe", [
          "-v",
          "error",
          "-show_streams",
          "-of",
          "json",
          rotated,
        ])
      ).stdout,
    );
    assert.equal(Math.abs(before.streams[0].side_data_list[0].rotation), 90);
    const { row, objects } = await process(
      await readFile(rotated),
      "video/mp4",
      false,
      true,
    );
    assert.equal(row.status, "READY");
    await writeFile(clean, objects.get(row.key)!);
    const info = JSON.parse(
      (
        await execFile("ffprobe", [
          "-v",
          "error",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          clean,
        ])
      ).stdout,
    );
    assert.equal(info.streams.length, 1);
    assert.equal(info.streams[0].width, 320);
    assert.equal(info.streams[0].height, 142);
    assert.equal(
      row.durationMs,
      Math.round(Number(info.format.duration) * 1000),
    );
    assert.ok(row.durationMs >= 2000 && row.durationMs < 4000);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
