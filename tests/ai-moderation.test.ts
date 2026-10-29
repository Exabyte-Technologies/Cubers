import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AiTutor } from "../apps/api/src/ai";
import { readConfig } from "../apps/api/src/config";
import { lessons } from "@cubers/core";
import { simulatedModeration } from "../scripts/mock-ai-protocol.mjs";
const lesson = lessons[0],
  text = "Observe the pieces and compare their positions after each turn.";
function config(region: "INTL" | "CN" = "INTL") {
  return readConfig({
    NODE_ENV: "test",
    REGION: region,
    DATABASE_URL: "postgresql://localhost/test",
    REDIS_URL: "redis://localhost:6389",
    S3_ENDPOINT: "http://localhost:9009",
    S3_BUCKET: "test",
    S3_ACCESS_KEY: "test",
    S3_SECRET_KEY: "test",
    AI_MODE: "mock",
    AI_MODEL: "simulator",
    AI_BASE_URL: "http://127.0.0.1:4010/" + randomUUID(),
    AI_TIMEOUT_MS: "1000",
  });
}
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status });
function fixture(
  c: ReturnType<typeof config>,
  change?: (
    path: string,
    body: any,
    options: RequestInit,
  ) => Response | Promise<Response> | undefined,
) {
  const requests: { path: string; body: any; options: RequestInit }[] = [];
  const fetcher = (async (url: any, options: RequestInit) => {
    const path = new URL(url).pathname.split("/").at(-1)!,
      body = options.body ? JSON.parse(options.body as string) : null;
    requests.push({ path, body, options });
    const changed = await change?.(path, body, options);
    if (changed) return changed;
    if (path === "models") return json({ data: [{ id: "simulator" }] });
    if (path === "moderations") return json(simulatedModeration(body));
    return json({
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: text },
        },
      ],
    });
  }) as typeof fetch;
  return { requests, tutor: new AiTutor(c, fetcher) };
}
test("moderation screens minimized input and candidate output, keeps keys/raw questions private and does not use an enable-probe cache as content approval", async () => {
  const c = config();
  c.AI_API_KEY = "synthetic-test-secret";
  const f = fixture(c);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await f.tutor.explain(
          lesson,
          "en",
          true,
          "SECRET_NAME private@example.invalid why",
        )
      ).source,
      "simulated",
    );
  assert.deepEqual(
    f.requests.map((r) => r.path),
    [
      "models",
      "moderations",
      "moderations",
      "completions",
      "moderations",
      "moderations",
      "completions",
      "moderations",
    ],
  );
  assert.ok(
    f.requests.every(
      (r) =>
        !(r.options.headers as any)?.Authorization &&
        r.options.redirect === "error",
    ),
  );
  assert.ok(
    !JSON.stringify(f.requests.map((r) => r.body)).includes("SECRET_NAME"),
  );
  assert.ok(
    !JSON.stringify(f.requests.map((r) => r.body)).includes("private@example"),
  );
  const inputs = f.requests
    .filter((r) => r.path === "moderations")
    .map((r) => r.body.input);
  assert.equal(inputs.filter((v) => v === text).length, 2);
  const contexts = inputs
    .filter((value: string) => value.startsWith("{"))
    .map((value: string) => JSON.parse(value));
  assert.equal(contexts.length, 2);
  assert.ok(
    contexts.every(
      (context: any) =>
        context.intent === "reasoning" &&
        context.validatedAlgorithm === lesson.algorithm &&
        Array.isArray(context.validatedExplanation),
    ),
  );
});
test("flagged input prevents generation and flagged output never reaches the reader, including inconsistent false overall flags", async () => {
  for (const stage of ["input", "output"] as const)
    for (const inconsistent of [false, true]) {
      const c = config();
      const f = fixture(c, (path, body) => {
        if (
          path !== "moderations" ||
          (stage === "input"
            ? !String(body.input).includes("validatedExplanation")
            : body.input !== text)
        )
          return;
        const result = simulatedModeration(body);
        result.results[0].flagged = !inconsistent;
        result.results[0].categories.violence = true;
        result.results[0].category_scores.violence = 0.99;
        return json(result);
      });
      const reply = await f.tutor.explain(lesson, "en", true, "why");
      assert.equal(reply.source, "authored");
      assert.equal(reply.reason, "moderation-flagged");
      assert.equal(
        f.requests.some((r) => r.path === "completions"),
        stage === "output",
      );
      assert.equal(reply.algorithm, lesson.algorithm);
    }
});
test("missing, malformed, oversized, redirected and unavailable moderation responses fail closed without retry or error-body disclosure", async () => {
  const broken = [
    {},
    { id: "x", model: "x", results: [] },
    { error: { message: "PRIVATE_ERROR" }, ...simulatedModeration() },
    {
      ...simulatedModeration(),
      results: [
        ...simulatedModeration().results,
        ...simulatedModeration().results,
      ],
    },
    { ...simulatedModeration(), id: "" },
    {
      ...simulatedModeration(),
      results: [
        {
          flagged: false,
          categories: { safe: false },
          category_scores: { safe: 0 },
        },
      ],
    },
  ];
  for (const data of broken) {
    const c = config(),
      f = fixture(c, (path) =>
        path === "moderations" ? json(data) : undefined,
      );
    const reply = await f.tutor.explain(lesson, "en", true, "why");
    assert.equal(reply.source, "authored");
    assert.equal(reply.reason, "moderation-unavailable");
    assert.ok(!JSON.stringify(reply).includes("PRIVATE_ERROR"));
    assert.equal(f.requests.length, 2);
  }
  for (const status of [302, 401, 429, 503]) {
    const c = config(),
      f = fixture(c, (path) =>
        path === "moderations"
          ? json({ error: "PRIVATE_ERROR" }, status)
          : undefined,
      );
    assert.equal(
      (await f.tutor.explain(lesson, "en", true, "")).source,
      "authored",
    );
    assert.equal(f.requests.length, 2);
  }
  const c = config(),
    f = fixture(c, (path) =>
      path === "moderations" ? new Response("x".repeat(32769)) : undefined,
    );
  assert.equal(
    (await f.tutor.explain(lesson, "en", true, "")).reason,
    "moderation-unavailable",
  );
});
test("moderation models require the full text-category contract and bounded finite scores", async () => {
  for (const change of ["missing", "flag", "negative", "above", "null"]) {
    const c = config(),
      f = fixture(c, (path, body) => {
        if (path !== "moderations") return;
        const r = simulatedModeration(body);
        if (change === "missing")
          delete (r.results[0].category_scores as any).violence;
        else if (change === "flag") (r.results[0] as any).flagged = "false";
        else
          (r.results[0].category_scores as any).violence =
            change === "negative" ? -1 : change === "above" ? 2 : null;
        return json(r);
      });
    await assert.rejects(
      () => f.tutor.validateModel(),
      /moderation-unavailable/,
    );
  }
  const c = config(),
    f = fixture(c);
  await f.tutor.validateModel();
  c.AI_MODERATION_MODEL = "other-approved-model";
  await f.tutor.validateModel();
  assert.equal(f.requests.filter((r) => r.path === "models").length, 2);
  assert.ok(f.requests.some((r) => r.body?.model === "other-approved-model"));
});
test("one shared deadline covers model validation, moderation and generation and discards late results", async () => {
  const c = config();
  c.AI_TIMEOUT_MS = 100;
  const f = fixture(c, async () => {
    await new Promise((r) => setTimeout(r, 30));
    return undefined;
  });
  const start = Date.now();
  const reply = await f.tutor.explain(lesson, "en", true, "");
  assert.equal(reply.source, "authored");
  assert.equal(reply.reason, "provider-timeout");
  assert.ok(Date.now() - start < 250);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(f.requests.length <= 4);
});
test("uncooperative transports retain bounded admission after timeout and release it only when their work actually settles", async () => {
  let release!: (v: Response) => void;
  const held = new Promise<Response>((r) => {
    release = r;
  });
  const c = config();
  c.AI_TIMEOUT_MS = 50;
  const slow = new AiTutor(c, (async () => held) as typeof fetch);
  const replies = await Promise.all(
    Array.from({ length: 8 }, () => slow.explain(lesson, "en", true, "")),
  );
  assert.ok(replies.every((r) => r.reason === "provider-timeout"));
  assert.equal(
    (await slow.explain(lesson, "en", true, "")).reason,
    "provider-busy",
  );
  release(json({ data: [{ id: "simulator" }] }));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(
    (await fixture(config()).tutor.explain(lesson, "en", true, "")).source,
    "simulated",
  );
});
test("mainland tutoring requests both inline guardrails, avoids OpenAI moderation routes and rejects filtered/refused/incomplete completions", async () => {
  for (const finish of ["stop", "content_filter", "length", undefined]) {
    const c = config("CN"),
      f = fixture(c, (path) =>
        path === "completions"
          ? json({
              choices: [
                {
                  finish_reason: finish,
                  message: { role: "assistant", content: text },
                },
              ],
            })
          : undefined,
      );
    const reply = await f.tutor.explain(lesson, "zh", true, "");
    assert.equal(reply.source, finish === "stop" ? "simulated" : "authored");
    assert.ok(!f.requests.some((r) => r.path === "moderations"));
    const call = f.requests.find((r) => r.path === "completions")!;
    assert.equal(
      (call.options.headers as any)["X-DashScope-DataInspection"],
      '{"input":"cip","output":"cip"}',
    );
  }
  const c = config("CN");
  c.AI_MODE = "live";
  c.CN_AI_APPROVED = "true";
  c.QWEN_API_KEY = "synthetic-not-a-real-key";
  const f = fixture(c);
  assert.equal(
    (await f.tutor.explain(lesson, "en", true, "")).reason,
    "guardrail-review-pending",
  );
  await assert.rejects(
    () => f.tutor.validateModel(),
    /guardrail-review-pending/,
  );
  assert.equal(f.requests.length, 0);
});
test("minors, disabled deployments and operator-disabled connections make no moderation or generation request", async () => {
  const c = config(),
    f = fixture(c);
  await f.tutor.explain(lesson, "en", false, "private");
  await f.tutor.explain(lesson, "en", true, "", {
    baseUrl: c.AI_BASE_URL!,
    model: "simulator",
    enabled: false,
  });
  c.AI_MODE = "disabled";
  await f.tutor.explain(lesson, "en", true, "");
  assert.equal(f.requests.length, 0);
});
