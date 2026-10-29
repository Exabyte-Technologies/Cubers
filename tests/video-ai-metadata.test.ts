import test from "node:test";
import assert from "node:assert/strict";
import { readVideoAiMetadata } from "../apps/api/src/video-ai-metadata";
import {
  readAiClaimPacket,
  readAiClaimText,
  aiPropagationJson,
} from "../apps/api/src/media-ai-claims";
const source = {
  Label: "3" as const,
  ContentProducer: "synthetic-来源<&>",
  ProduceID: "source-001",
  ReservedCode1: "unverified",
  ContentPropagator: "prior",
  PropagateID: "prior-id",
  ReservedCode2: "prior-signature",
};
function atom(name: string | Buffer, body = Buffer.alloc(0), wide = false) {
  const header = Buffer.alloc(wide ? 16 : 8);
  if (typeof name === "string") header.write(name, 4, "latin1");
  else name.copy(header, 4);
  header.writeUInt32BE(wide ? 1 : header.length + body.length);
  if (wide) header.writeBigUInt64BE(BigInt(header.length + body.length), 8);
  return Buffer.concat([header, body]);
}
function metadata(
  entries: { key: string; value: Buffer; type?: number }[],
  full = true,
) {
  const count = Buffer.alloc(8);
  count.writeUInt32BE(entries.length, 4);
  return atom(
    "meta",
    Buffer.concat([
      ...(full ? [Buffer.alloc(4)] : []),
      atom(
        "keys",
        Buffer.concat([
          count,
          ...entries.map(({ key }) => atom("mdta", Buffer.from(key))),
        ]),
      ),
      atom(
        "ilst",
        Buffer.concat(
          entries.map(({ value, type = 1 }, i) => {
            const index = Buffer.alloc(4);
            index.writeUInt32BE(i + 1);
            const flags = Buffer.alloc(8);
            flags.writeUInt32BE(type);
            return atom(index, atom("data", Buffer.concat([flags, value])));
          }),
        ),
      ),
    ]),
  );
}
const json = (value: unknown = source) =>
  Buffer.from(JSON.stringify({ AIGC: value }));
const movie = (...items: Buffer[]) =>
  Buffer.concat([atom("ftyp", Buffer.from("isom\0\0\0\0isom")), ...items]);

test("BMFF typed UTF-8 and UTF-16 metadata preserve three source classes across movie, track and media scopes", () => {
  for (const Label of ["1", "2", "3"] as const)
    for (const full of [true, false]) {
      const claim = { ...source, Label };
      const utf8 = metadata([{ key: "AIGC", value: json(claim) }], full);
      const utf16 = metadata(
        [
          {
            key: "AIGC",
            value: Buffer.from(
              JSON.stringify({ AIGC: claim }),
              "utf16le",
            ).swap16(),
            type: 2,
          },
        ],
        full,
      );
      assert.deepEqual(
        readVideoAiMetadata(
          movie(
            atom(
              "moov",
              Buffer.concat([utf8, atom("trak", atom("mdia", utf16))]),
            ),
          ),
        ),
        claim,
      );
    }
  assert.deepEqual(
    readVideoAiMetadata(
      movie(atom("moov", atom("udta", atom("AIGC", json())))),
    ),
    source,
  );
  assert.deepEqual(
    readVideoAiMetadata(
      movie(
        atom(
          "moov",
          atom(
            "trak",
            atom(
              "mdia",
              atom(
                "hdlr",
                Buffer.concat([Buffer.alloc(24), json(), Buffer.alloc(1)]),
              ),
            ),
          ),
        ),
      ),
    ),
    source,
  );
  const freeform = atom(
    "meta",
    Buffer.concat([
      Buffer.alloc(4),
      atom(
        "ilst",
        atom(
          "----",
          Buffer.concat([
            atom(
              "mean",
              Buffer.concat([Buffer.alloc(4), Buffer.from("synthetic")]),
            ),
            atom("name", Buffer.concat([Buffer.alloc(4), Buffer.from("AIGC")])),
            atom(
              "data",
              Buffer.concat([Buffer.from([0, 0, 0, 1, 0, 0, 0, 0]), json()]),
            ),
          ]),
        ),
      ),
    ]),
  );
  assert.deepEqual(readVideoAiMetadata(movie(atom("moov", freeform))), source);
});

test("BMFF sample bytes are never treated as labels and output propagation JSON preserves identities without stale signatures", () => {
  assert.equal(
    readVideoAiMetadata(movie(atom("mdat", json()), atom("moov"))),
    null,
  );
  assert.equal(
    readVideoAiMetadata(
      movie(
        metadata([{ key: "title", value: Buffer.from("ordinary source") }]),
      ),
    ),
    null,
  );
  const expected = {
    ...source,
    ContentPropagator: "Cubers",
    PropagateID: "current-id",
    ReservedCode2: "",
  };
  const serialized = aiPropagationJson(source, "current-id");
  assert.match(serialized, /\\u[0-9a-f]{4}/);
  assert.deepEqual(
    readVideoAiMetadata(
      movie(metadata([{ key: "AIGC", value: Buffer.from(serialized) }])),
    ),
    expected,
  );
  const extended = atom(
    "uuid",
    Buffer.concat([Buffer.alloc(16), json()]),
    true,
  );
  assert.deepEqual(readVideoAiMetadata(movie(extended)), source);
});

test("BMFF cannot silently discard malformed, conflicting, missing or unsupported recognized metadata", () => {
  assert.throws(
    () =>
      readVideoAiMetadata(
        movie(
          metadata([
            { key: "AIGC", value: json() },
            { key: "AIGC", value: json({ ...source, Label: "1" }) },
          ]),
        ),
      ),
    /ambiguous/,
  );
  for (const value of [
    Buffer.from("broken"),
    json({ ...source, Label: "4" }),
    json({ ...source, ProduceID: "invalid\nidentifier" }),
  ])
    assert.throws(() =>
      readVideoAiMetadata(movie(metadata([{ key: "AIGC", value }]))),
    );
  assert.throws(() =>
    readVideoAiMetadata(
      movie(metadata([{ key: "AIGC", value: json(), type: 13 }])),
    ),
  );
  assert.throws(() =>
    readVideoAiMetadata(
      movie(metadata([{ key: "AIGC", value: Buffer.from([0]), type: 2 }])),
    ),
  );
  const missing = Buffer.alloc(8);
  missing.writeUInt32BE(1, 4);
  assert.throws(() =>
    readVideoAiMetadata(
      movie(
        atom(
          "meta",
          Buffer.concat([
            Buffer.alloc(4),
            atom(
              "keys",
              Buffer.concat([missing, atom("mdta", Buffer.from("AIGC"))]),
            ),
          ]),
        ),
      ),
    ),
  );
});

test("BMFF rejects C2PA UUIDs, JUMBF boxes and metadata credential markers without asserting authentication", () => {
  for (const item of [
    atom("uuid", Buffer.from("d8fec3d61b0e483c92975828877ec481", "hex")),
    atom("jumb"),
    atom("c2pa"),
    metadata([
      { key: "c2pa.manifest", value: Buffer.from("not authenticated") },
    ]),
    metadata([{ key: "title", value: Buffer.from("JUMBF c2pa") }]),
  ])
    assert.throws(
      () => readVideoAiMetadata(movie(item)),
      /preservation-capable/,
    );
});

test("BMFF bounds reject truncated, oversized, deeply nested and excessive metadata containers", () => {
  for (const name of ["cmov", "bxml"])
    assert.throws(() => readVideoAiMetadata(movie(atom("moov", atom(name)))));
  assert.throws(() => readVideoAiMetadata(Buffer.alloc(7)));
  assert.throws(() =>
    readVideoAiMetadata(Buffer.from([0, 0, 0, 1, 109, 111, 111, 118])),
  );
  const huge = atom("moov", Buffer.alloc(0), true);
  huge.writeBigUInt64BE(2n ** 63n, 8);
  assert.throws(() => readVideoAiMetadata(huge));
  assert.throws(() =>
    readVideoAiMetadata(
      movie(metadata([{ key: "AIGC", value: Buffer.alloc(32769, 65) }])),
    ),
  );
  assert.throws(() =>
    readVideoAiMetadata(
      movie(
        metadata(
          Array.from({ length: 5 }, () => ({
            key: "title",
            value: Buffer.alloc(30000, 65),
          })),
        ),
      ),
    ),
  );
  assert.throws(() =>
    readVideoAiMetadata(
      Buffer.concat(Array.from({ length: 8193 }, () => atom("free"))),
    ),
  );
  let deep = atom("free");
  for (let i = 0; i < 15; i++) deep = atom("moov", deep);
  assert.throws(() => readVideoAiMetadata(movie(deep)));
  assert.throws(() =>
    readVideoAiMetadata(
      movie(metadata([{ key: "AIGC".repeat(70), value: json() }])),
    ),
  );
});

test("source identifiers cannot be silently changed by UTF-8 replacement or plain-JSON entity decoding", () => {
  assert.deepEqual(
    readAiClaimText('{"\\u0041IGC":' + JSON.stringify(source) + "}"),
    [source],
  );
  for (const text of [
    '{"AIGC":{"Label":"1","Label":"2","ContentProducer":"source","ProduceID":"id"}}',
    '{"AIGC":{"Label":"1","La\\u0062el":"2","ContentProducer":"source","ProduceID":"id"}}',
    '{"AIGC":{"Label":"1","ContentProducer":"source","ProduceID":"id"},"AIGC":{"Label":"2","ContentProducer":"source","ProduceID":"id"}}',
  ])
    assert.throws(() => readAiClaimText(text), /ambiguous/);
  const claim = { ...source, ContentProducer: '&amp;&quot;<tag> "literal"' };
  assert.deepEqual(readAiClaimText(JSON.stringify({ AIGC: claim })), [claim]);
  const numeric = JSON.stringify({
    AIGC: { ...source, ContentProducer: "NUMERIC" },
  }).replace("NUMERIC", "&#20013;&#x6587;&amp;amp;");
  assert.deepEqual(readAiClaimText("<meta>" + numeric + "</meta>"), [
    { ...source, ContentProducer: "中文&amp;" },
  ]);
  for (const entity of [
    "&external;",
    "&#0;",
    "&#xD800;",
    "&#999999999999999;",
    "&#xFFFF;",
  ])
    assert.throws(
      () =>
        readAiClaimText(
          "<meta>" +
            numeric.replace("&#20013;&#x6587;&amp;amp;", entity) +
            "</meta>",
        ),
      /malformed/,
    );
  const corrupt = Buffer.from(
    JSON.stringify({ AIGC: { ...source, ProduceID: "bad!id" } }),
  );
  corrupt[corrupt.indexOf(Buffer.from("bad!id")) + 3] = 255;
  assert.throws(() => readAiClaimPacket(corrupt), /malformed/);
  assert.throws(
    () =>
      readVideoAiMetadata(movie(metadata([{ key: "AIGC", value: corrupt }]))),
    /malformed/,
  );
  const literal = { ...source, ProduceID: "valid-\ufffd" };
  assert.deepEqual(readAiClaimPacket(json(literal)), [literal]);
});
