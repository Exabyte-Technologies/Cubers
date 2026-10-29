import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import sharp from "sharp";
import {
  readImageAiMetadata,
  imageAiXmp,
  type ImageAiMetadata,
} from "../apps/api/src/image-ai-metadata";

const source: ImageAiMetadata = {
  Label: "1",
  ContentProducer: 'source "工作室" <&>',
  ProduceID: "synthetic-001",
  ReservedCode1: "unverified-producer-claim",
  ContentPropagator: "previous",
  PropagateID: "previous-id",
  ReservedCode2: "old-propagator-signature",
};
function chunk(name: string, data: Buffer) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(name, 4, "ascii");
  data.copy(result, 8);
  let crc = 0xffffffff;
  for (const byte of result.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
const png = (...chunks: Buffer[]) =>
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ...chunks,
    chunk("IEND", Buffer.alloc(0)),
  ]);
const text = (label: unknown) =>
  chunk("tEXt", Buffer.from("AIGC\0" + JSON.stringify({ AIGC: label })));
function jpegSegment(marker: number, value: Buffer) {
  const prefix = Buffer.alloc(4);
  prefix[0] = 255;
  prefix[1] = marker;
  prefix.writeUInt16BE(value.length + 2, 2);
  return Buffer.concat([prefix, value]);
}
const jpeg = (...segments: Buffer[]) =>
  Buffer.concat([
    Buffer.from([255, 216]),
    ...segments,
    Buffer.from([255, 217]),
  ]);

test("JPEG and PNG XMP round trips preserve all three source claim classes and escaped text", async () => {
  for (const type of ["jpeg", "png"] as const)
    for (const Label of ["1", "2", "3"] as const) {
      const claim = { ...source, Label };
      const image = await sharp({
        create: { width: 12, height: 8, channels: 3, background: "#12589a" },
      })
        .toFormat(type)
        .withXmp(imageAiXmp(claim, "current-media-id"))
        .toBuffer();
      assert.deepEqual(readImageAiMetadata(image, `image/${type}`), {
        ...claim,
        ContentPropagator: "Cubers",
        PropagateID: "current-media-id",
        ReservedCode2: "",
      });
    }
});

test("ordinary JPEG and PNG remain unlabelled and unknown source fields are not retained", async () => {
  for (const type of ["jpeg", "png"] as const) {
    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#12589a" },
    })
      .toFormat(type)
      .withExif({ IFD0: { Artist: "PRIVATE-location-device" } })
      .toBuffer();
    assert.equal(readImageAiMetadata(image, `image/${type}`), null);
  }
  assert.deepEqual(
    readImageAiMetadata(
      png(text({ ...source, Location: "PRIVATE", Device: "PRIVATE" })),
      "image/png",
    ),
    source,
  );
});

test("bounded PNG text, compressed text and international text accept identical claims and reject conflicts", () => {
  const json = Buffer.from(JSON.stringify({ AIGC: source }));
  const ztext = chunk(
    "zTXt",
    Buffer.concat([Buffer.from("AIGC\0\0"), deflateSync(json)]),
  );
  const itext = chunk(
    "iTXt",
    Buffer.concat([Buffer.from("AIGC\0\x01\0en\0label\0"), deflateSync(json)]),
  );
  const plain = chunk(
    "iTXt",
    Buffer.concat([Buffer.from("AIGC\0\0\0\0\0"), json]),
  );
  assert.deepEqual(
    readImageAiMetadata(png(text(source), ztext, itext, plain), "image/png"),
    source,
  );
  assert.throws(
    () =>
      readImageAiMetadata(
        png(text(source), text({ ...source, Label: "2" })),
        "image/png",
      ),
    /ambiguous/,
  );
  const bomb = chunk(
    "zTXt",
    Buffer.concat([
      Buffer.from("AIGC\0\0"),
      deflateSync(Buffer.alloc(1000000, 65)),
    ]),
  );
  assert.throws(() => readImageAiMetadata(png(bomb), "image/png"));
  assert.throws(() =>
    readImageAiMetadata(
      png(chunk("iTXt", Buffer.from("AIGC\0\x02\0\0\0bad"))),
      "image/png",
    ),
  );
});

test("source claims reject malformed JSON, unsupported values, control characters, excessive size and nesting", () => {
  for (const value of [
    null,
    [],
    { ...source, Label: "4" },
    { ...source, ProduceID: 1 },
    { ...source, ContentProducer: "x\nprivate" },
    { ...source, ProduceID: "a".repeat(4097) },
  ])
    assert.throws(() => readImageAiMetadata(png(text(value)), "image/png"));
  for (const value of [
    'AIGC {"AIGC":',
    '{"AIGC":{"Label":"1","extra":{"a":{"b":{}}}}}',
    "AIGC " + "a".repeat(33000),
  ])
    assert.throws(() =>
      readImageAiMetadata(
        png(chunk("tEXt", Buffer.from("data\0" + value))),
        "image/png",
      ),
    );
  assert.throws(
    () =>
      imageAiXmp(
        {
          ...source,
          ContentProducer: "中".repeat(4096),
          ProduceID: "中".repeat(4096),
        },
        "id",
      ),
    /bounds/,
  );
});

test("unhandled content credentials cannot silently pass through JPEG or PNG processing", () => {
  for (const value of [
    Buffer.from(JSON.stringify({ AIGC: source }), "utf16le"),
    Buffer.from(JSON.stringify({ AIGC: source }), "utf16le").swap16(),
  ])
    assert.throws(
      () => readImageAiMetadata(jpeg(jpegSegment(225, value)), "image/jpeg"),
      /malformed/,
    );
  for (const value of [
    jpeg(jpegSegment(235, Buffer.from("JUMBF c2pa"))),
    jpeg(jpegSegment(225, Buffer.from("c2pa"))),
  ])
    assert.throws(
      () => readImageAiMetadata(value, "image/jpeg"),
      /preservation-capable/,
    );
  for (const value of [
    png(chunk("caBX", Buffer.alloc(8))),
    png(chunk("tEXt", Buffer.from("description\0c2pa"))),
  ])
    assert.throws(
      () => readImageAiMetadata(value, "image/png"),
      /preservation-capable/,
    );
});

test("container bounds and aggregate metadata budgets reject oversized or truncated inputs", () => {
  const bad = chunk("tEXt", Buffer.from("note\0ok"));
  bad.writeUInt32BE(0xffffffff);
  assert.throws(() => readImageAiMetadata(png(bad), "image/png"));
  assert.throws(() =>
    readImageAiMetadata(jpeg(Buffer.from([255, 225, 255, 255])), "image/jpeg"),
  );
  assert.throws(() =>
    readImageAiMetadata(
      png(
        ...Array.from({ length: 5 }, () =>
          chunk("tEXt", Buffer.from("note\0" + "a".repeat(30000))),
        ),
      ),
      "image/png",
    ),
  );
  assert.throws(() =>
    readImageAiMetadata(
      png(
        ...Array.from({ length: 4097 }, () =>
          chunk("tEXt", Buffer.from("note\0ok")),
        ),
      ),
      "image/png",
    ),
  );
  assert.throws(() =>
    readImageAiMetadata(Buffer.from("not an image"), "image/png"),
  );
  assert.throws(() => readImageAiMetadata(Buffer.alloc(0), "image/heic"));
});
