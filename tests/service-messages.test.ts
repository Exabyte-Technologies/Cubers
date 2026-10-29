import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  serviceError,
  serviceConnectionError,
  readServicePayload,
  localizeServiceSuccess,
} from "@cubers/core";

test("actual Nest string and object errors retain recovery meaning in both languages", () => {
  for (const [exception, expected] of [
    [new HttpException("Too many requests", 429), "操作过于频繁"],
    [
      new UnauthorizedException("Invalid email or password"),
      "邮箱或密码不正确",
    ],
    [new ForbiddenException("Verify your email first"), "验证邮件"],
    [new BadRequestException("Link expired"), "链接已过期"],
    [new ForbiddenException("Verified guardian consent is required"), "监护人"],
    [
      new HttpException("Guidance is busy; try again shortly", 503),
      "解题引导繁忙",
    ],
  ] as const) {
    const zh = serviceError(
      exception.getStatus(),
      exception.getResponse(),
      "zh",
    );
    const en = serviceError(
      exception.getStatus(),
      exception.getResponse(),
      "en",
    );
    assert.equal(zh.status, exception.getStatus());
    assert.ok(zh.message.includes(expected));
    assert.equal(en.message, exception.message);
  }
});

test("malformed and unknown server payloads use safe localized status fallbacks", () => {
  const privateDetail =
    "<script>private@example.test SQL SELECT token secret</script>";
  const statuses = [
    400, 401, 403, 404, 409, 410, 413, 415, 429, 500, 502, 503, 418,
  ];
  for (const status of statuses) {
    for (const payload of [
      null,
      undefined,
      12,
      [],
      [privateDetail],
      privateDetail,
      { message: privateDetail, issues: [{ message: privateDetail }] },
      { message: [privateDetail] },
      { message: "__proto__" },
      { message: "constructor" },
      { message: "x".repeat(100000) },
    ]) {
      for (const locale of ["en", "zh"] as const) {
        const error = serviceError(status, payload, locale);
        assert.equal(error.status, status);
        assert.ok(error.message.length < 200);
        assert.ok(!error.message.includes("SQL"));
        assert.ok(!error.message.includes("<script>"));
        assert.equal(/[\u4e00-\u9fff]/.test(error.message), locale === "zh");
        assert.equal(error.code, undefined);
      }
    }
  }
});

test("only bounded machine codes survive while status remains available to callers", () => {
  for (const code of [
    "COMMUNITY_CHANGED",
    "SESSION_CHANGED",
    "PROVIDER_UNAVAILABLE",
  ]) {
    const error = serviceError(
      409,
      { message: "private internals", code },
      "zh",
    );
    assert.equal(error.status, 409);
    assert.equal(error.code, code);
  }
  for (const code of [
    "a",
    "<script>",
    "A".repeat(65),
    {},
    42,
    "CODE\nprivate",
    "CODE\n",
    "CODE\r",
    "CODE\u2028",
    ["CODE"],
  ])
    assert.equal(serviceError(401, { code }, "en").code, undefined);
});

test("non-JSON authentication errors retain HTTP meaning, malformed success refuses confirmation", async () => {
  let reads = 0;
  const json = async () => {
    reads++;
    throw new SyntaxError("private proxy body");
  };
  for (const status of [401, 403, 413, 502]) {
    const response = { ok: false, status, json };
    const payload = await readServicePayload(response);
    assert.equal(payload, null);
    assert.equal(serviceError(response.status, payload, "zh").status, status);
  }
  await assert.rejects(readServicePayload({ ok: true, json }), SyntaxError);
  assert.equal(reads, 5); // No retry, including for potentially committed writes.
  const value = { id: "created-item" };
  assert.equal(
    await readServicePayload({ ok: true, json: async () => value }),
    value,
  );
  assert.match(
    serviceConnectionError("en").message,
    /whether the action succeeded/,
  );
  assert.match(serviceConnectionError("zh").message, /确认操作是否已成功/);
});

test("auth and deletion notices translate only explicitly authorized response fields", () => {
  for (const [path, method, expected] of [
    ["auth/register", "POST", "验证邮件"],
    ["auth/resend", "POST", "若账号符合条件"],
    ["auth/forgot", "POST", "若该账号存在"],
    ["auth/verify", "POST", "邮箱验证成功"],
    ["auth/reset", "POST", "所有登录已失效"],
    ["me", "DELETE", "30天"],
  ]) {
    const original = {
      message: "server notice",
      token: "untouched",
      nested: { id: 42 },
    };
    const result = localizeServiceSuccess(path, method, original, "zh");
    assert.ok(result.message.includes(expected));
    assert.equal(original.message, "server notice");
    assert.equal(result.nested, original.nested);
    assert.equal(result.token, original.token);
    assert.notEqual(
      localizeServiceSuccess(path, method, original, "en").message,
      result.message,
    );
    assert.equal(
      localizeServiceSuccess(path, "PATCH", original, "zh"),
      original,
    );
    for (const malformed of [null, "message", [], {}, { message: null }])
      assert.equal(
        localizeServiceSuccess(path, method, malformed, "zh"),
        malformed,
      );
  }
  for (const path of [
    "posts",
    "auth/login",
    "auth/register?x=1",
    "admin/review",
    "me",
  ])
    for (const locale of ["en", "zh"] as const) {
      const content = { message: "User-authored content", token: "unchanged" };
      assert.equal(
        localizeServiceSuccess(path, "POST", content, locale),
        content,
      );
    }
});
