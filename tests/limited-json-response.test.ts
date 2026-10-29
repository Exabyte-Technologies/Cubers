import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { limitedJsonResponse } from "../scripts/limited-json-response";

test("container JSON decoding preserves Chinese and emoji across every byte boundary, enforces byte limits and rejects corrupt or interrupted input", async () => {
  const value = {
      en: "Download guidance",
      zh: "下载剩余首次还原指导 🧩",
      notes: "工作人员设备测试记录",
    },
    bytes = Buffer.from(JSON.stringify(value));
  for (let split = 1; split < bytes.length; split++)
    assert.deepEqual(
      await limitedJsonResponse(
        Readable.from([bytes.subarray(0, split), bytes.subarray(split)]),
        bytes.length,
      ),
      value,
    );
  assert.deepEqual(
    await limitedJsonResponse(
      Readable.from([...bytes].map((b) => Buffer.from([b]))),
      bytes.length,
    ),
    value,
  );
  await assert.rejects(
    limitedJsonResponse(Readable.from([bytes]), bytes.length - 1),
    /exceeded limit/,
  );
  await assert.rejects(
    limitedJsonResponse(Readable.from([Buffer.from([0x22, 0xc0, 0xaf, 0x22])])),
    /Invalid API response/,
  );
  await assert.rejects(
    limitedJsonResponse(Readable.from([Buffer.from('{"incomplete":')])),
    /Invalid API response/,
  );
  await assert.rejects(
    limitedJsonResponse(
      Readable.from(
        (async function* () {
          yield bytes.subarray(0, 2);
          throw Error("source interrupted");
        })(),
      ),
    ),
    /source interrupted/,
  );
});
