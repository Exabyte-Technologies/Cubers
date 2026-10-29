import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import { privateAddress } from "./network-security";
export { privateAddress } from "./network-security";
import type { Config } from "./config";
import type { Lesson, Locale } from "@cubers/core";
export type TutorReply = {
  source: "authored" | "simulated" | "ai";
  explanation: string;
  algorithm: string;
  label: string;
  reason?: string;
};
export async function resolveAiEndpoint(
  base: string,
  c: Pick<
    Config,
    | "NODE_ENV"
    | "AI_MODE"
    | "REGION"
    | "AI_ALLOWED_HOSTS"
    | "AI_CN_APPROVED_HOSTS"
  >,
  resolver: typeof lookup = lookup,
) {
  const u = new URL(base);
  if (u.username || u.password || u.search || u.hash)
    throw new Error("AI URL cannot include credentials, query, or fragment");
  if (c.AI_MODE === "mock") {
    if (
      c.NODE_ENV === "production" ||
      u.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)
    )
      throw new Error("Mock AI must use a local development server");
  } else {
    if (u.protocol !== "https:") throw new Error("AI URL requires HTTPS");
    const hosts = (
      c.REGION === "CN" ? c.AI_CN_APPROVED_HOSTS : c.AI_ALLOWED_HOSTS
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!hosts.includes(u.hostname))
      throw new Error("AI host has not been approved for this region");
  }
  const hostname = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolver(hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some((a) =>
      c.AI_MODE === "mock"
        ? !ipaddr.isValid(a.address) ||
          ipaddr.parse(a.address).range() !== "loopback"
        : privateAddress(a.address),
    )
  )
    throw new Error("AI endpoint resolves to a private or reserved address");
  // Use exactly this validated address at connect time, with the original
  // hostname preserved for HTTP Host, TLS SNI and certificate verification.
  return {
    url: u,
    address: addresses.find((a) => a.family === 4) || addresses[0],
  };
}
export async function validateAiUrl(
  base: string,
  c: Parameters<typeof resolveAiEndpoint>[1],
) {
  return (await resolveAiEndpoint(base, c)).url;
}
export function pinnedLookup(
  endpoint: Awaited<ReturnType<typeof resolveAiEndpoint>>,
): LookupFunction {
  return (hostname, options, callback) => {
    if (hostname !== endpoint.url.hostname.replace(/^\[|\]$/g, ""))
      return callback(new Error("Unexpected AI destination"), "", 0);
    if (options.all) callback(null, [endpoint.address]);
    else callback(null, endpoint.address.address, endpoint.address.family);
  };
}
async function pinnedResponse(
  endpoint: Awaited<ReturnType<typeof resolveAiEndpoint>>,
  path: string,
  options: RequestInit,
  maximum: number,
): Promise<Response> {
  const url = new URL(endpoint.url.href.replace(/\/$/, "") + path);
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const request = send(
      url,
      {
        method: options.method,
        headers: options.headers as Record<string, string>,
        agent: false,
        lookup: pinnedLookup(endpoint),
        signal: options.signal || undefined,
        maxHeaderSize: 16384,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("error", reject);
        if (Number(response.headers["content-length"] || 0) > maximum) {
          request.destroy(new Error("Provider response exceeds limit"));
          return;
        }
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maximum)
            request.destroy(new Error("Provider response exceeds limit"));
          else chunks.push(chunk);
        });
        response.on("end", () => {
          const status = response.statusCode || 502;
          if (status < 200 || status >= 300) {
            reject(new Error(`Provider returned ${status}`));
            return;
          }
          resolve(new Response(Buffer.concat(chunks), { status }));
        });
      },
    );
    request.on("error", reject);
    request.end(options.body as string | undefined);
  });
}
export type AiConnection = { baseUrl: string; model: string; enabled: boolean };
const validatedModels = new Map<string, number>();
async function boundedJson(
  response: Response,
  maximum: number,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  if (Number(response.headers.get("content-length") || 0) > maximum)
    throw new Error("Provider response exceeds limit");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty provider response");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "",
    bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      signal?.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > maximum) throw new Error("Provider response exceeds limit");
      body += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally {
    await reader.cancel().catch(() => {});
  }
}
class AiSafetyError extends Error {}
let activeAiRequests = 0;
async function aiDeadline<T>(
  milliseconds: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (activeAiRequests >= 8) throw new AiSafetyError("provider-busy");
  activeAiRequests++;
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort.abort();
      reject(new AiSafetyError("provider-timeout"));
    }, milliseconds);
  });
  // Capacity belongs to the underlying operation, even if a faulty test
  // transport ignores cancellation. A timed-out result is never delivered.
  const job = Promise.resolve()
    .then(() => work(abort.signal))
    .finally(() => {
      activeAiRequests--;
    });
  try {
    return await Promise.race([job, interrupted]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
const moderationCategories = [
  "sexual",
  "sexual/minors",
  "harassment",
  "harassment/threatening",
  "hate",
  "hate/threatening",
  "illicit",
  "illicit/violent",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "violence",
  "violence/graphic",
];
function moderationAccepted(data: any) {
  const result = data?.results?.[0];
  if (
    data?.error ||
    typeof data?.id !== "string" ||
    !data.id ||
    data.id.length > 256 ||
    typeof data.model !== "string" ||
    !data.model ||
    data.model.length > 100 ||
    !Array.isArray(data.results) ||
    data.results.length !== 1 ||
    typeof result?.flagged !== "boolean" ||
    !result.categories ||
    !result.category_scores ||
    !moderationCategories.every(
      (key) =>
        Object.hasOwn(result.categories, key) &&
        Object.hasOwn(result.category_scores, key),
    ) ||
    Object.values(result.categories).some((v) => typeof v !== "boolean") ||
    Object.values(result.category_scores).some(
      (v) => typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1,
    ) ||
    Object.keys(result.categories).some(
      (key) => !Object.hasOwn(result.category_scores, key),
    )
  )
    throw new AiSafetyError("moderation-unavailable");
  if (
    result.flagged ||
    Object.values(result.categories).some((v) => v === true)
  )
    throw new AiSafetyError("moderation-flagged");
}
export class AiTutor {
  constructor(
    private c: Config,
    private fetcher?: typeof fetch,
  ) {}
  private async response(
    base: string,
    path: string,
    options: RequestInit,
    maximum: number,
  ) {
    options.signal?.throwIfAborted();
    const endpoint = await resolveAiEndpoint(base, this.c);
    options.signal?.throwIfAborted();
    return this.fetcher
      ? this.fetcher(endpoint.url.href.replace(/\/$/, "") + path, options)
      : pinnedResponse(endpoint, path, options, maximum);
  }
  private key() {
    if (this.c.AI_MODE === "mock") return undefined;
    return (
      this.c.AI_API_KEY ||
      (this.c.REGION === "CN" ? this.c.QWEN_API_KEY : this.c.OPENAI_API_KEY)
    );
  }
  private connection(override?: AiConnection) {
    return {
      baseUrl:
        override?.baseUrl ||
        this.c.AI_BASE_URL ||
        (this.c.REGION === "CN"
          ? "https://dashscope.aliyuncs.com/compatible-mode/v1"
          : "https://api.openai.com/v1"),
      model: override?.model || this.c.AI_MODEL,
    };
  }
  async validateModel(override?: AiConnection, force = false) {
    return aiDeadline(this.c.AI_TIMEOUT_MS, (signal) =>
      this.checkModel(override, force, signal),
    );
  }
  private async moderate(base: string, text: string, signal: AbortSignal) {
    if (Buffer.byteLength(text) > 32768)
      throw new AiSafetyError("moderation-unavailable");
    try {
      const key = this.key();
      const response = await this.response(
        base,
        "/moderations",
        {
          method: "POST",
          redirect: "error",
          signal,
          headers: {
            "Content-Type": "application/json",
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          body: JSON.stringify({
            model: this.c.AI_MODERATION_MODEL,
            input: text,
          }),
        },
        32768,
      );
      moderationAccepted(await boundedJson(response, 32768, signal));
    } catch (error) {
      if (error instanceof AiSafetyError) throw error;
      throw new AiSafetyError("moderation-unavailable");
    }
  }
  private async checkModel(
    override: AiConnection | undefined,
    force: boolean,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    if (this.c.AI_MODE === "disabled")
      throw new Error("AI is disabled in this deployment");
    const key = this.key();
    if (this.c.AI_MODE === "live" && !key)
      throw new Error("Add the API key to the server before enabling AI");
    if (
      this.c.REGION === "CN" &&
      this.c.AI_MODE === "live" &&
      this.c.CN_AI_APPROVED !== "true"
    )
      throw new Error("Mainland AI review is pending");
    if (
      this.c.REGION === "CN" &&
      this.c.AI_MODE === "live" &&
      this.c.AI_CN_GUARDRAILS_APPROVED !== "true"
    )
      throw new AiSafetyError("guardrail-review-pending");
    const { baseUrl, model } = this.connection(override);
    if (!model) throw new Error("Model identifier is required");
    const url = await validateAiUrl(baseUrl, this.c);
    const signature = createHash("sha256")
      .update(
        JSON.stringify([
          this.c.REGION,
          this.c.AI_MODE,
          url.href,
          model,
          key,
          this.c.AI_MODERATION_MODEL,
          this.c.AI_CN_GUARDRAILS_APPROVED,
        ]),
      )
      .digest("hex");
    if (!force && (validatedModels.get(signature) || 0) > Date.now()) return;
    const response = await this.response(
      baseUrl,
      "/models",
      {
        method: "GET",
        redirect: "error",
        signal,
        headers: key ? { Authorization: `Bearer ${key}` } : {},
      },
      256 * 1024,
    );
    const data = await boundedJson(response, 256 * 1024, signal);
    if (
      !Array.isArray(data?.data) ||
      !data.data.some(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          "id" in item &&
          item.id === model,
      )
    )
      throw new Error(
        "The configured model is not available from this endpoint",
      );
    if (this.c.REGION === "INTL")
      await this.moderate(baseUrl, "Cubers lesson explanation.", signal);
    signal.throwIfAborted();
    // Revalidate frequently: a changed URL, model, region or credential never
    // inherits another connection's validation result.
    if (validatedModels.size > 100) validatedModels.clear();
    validatedModels.set(signature, Date.now() + 5 * 60000);
  }
  async explain(
    lesson: Lesson,
    locale: Locale,
    eligible: boolean,
    question: string,
    override?: AiConnection,
  ): Promise<TutorReply> {
    const fallback = (reason?: string): TutorReply => ({
      source: "authored",
      explanation: lesson.steps[locale].join("\n\n"),
      algorithm: lesson.algorithm,
      label: locale === "zh" ? "课程讲解" : "Course explanation",
      ...(reason ? { reason } : {}),
    });
    if (
      !eligible ||
      this.c.AI_MODE === "disabled" ||
      override?.enabled === false
    )
      return fallback();
    if (
      this.c.REGION === "CN" &&
      this.c.AI_MODE === "live" &&
      this.c.CN_AI_APPROVED !== "true"
    )
      return fallback("regional-review-pending");
    const key = this.key();
    if (this.c.AI_MODE === "live" && !key) return fallback("not-configured");
    if (
      this.c.REGION === "CN" &&
      this.c.AI_MODE === "live" &&
      this.c.AI_CN_GUARDRAILS_APPROVED !== "true"
    )
      return fallback("guardrail-review-pending");
    try {
      return await aiDeadline(this.c.AI_TIMEOUT_MS, async (signal) => {
        const { baseUrl: base, model } = this.connection(override);
        if (!model) return fallback("model-not-configured");
        await this.checkModel(override, false, signal);
        // Only a locally classified learning intent leaves the server, never the raw prompt.
        const intent = /notation|记号/i.test(question)
          ? "notation"
          : /why|为什么/i.test(question)
            ? "reasoning"
            : /practice|练习/i.test(question)
              ? "practice"
              : "explain";
        const context = {
          lesson: lesson.id,
          language: locale,
          intent,
          validatedExplanation: lesson.steps[locale],
          validatedAlgorithm: lesson.algorithm,
        };
        const minimized = JSON.stringify(context);
        if (this.c.REGION === "INTL")
          await this.moderate(base, minimized, signal);
        const response = await this.response(
          base,
          "/chat/completions",
          {
            method: "POST",
            redirect: "error",
            signal,
            headers: {
              "Content-Type": "application/json",
              ...(this.c.REGION === "CN"
                ? {
                    "X-DashScope-DataInspection":
                      '{"input":"cip","output":"cip"}',
                  }
                : {}),
              ...(key ? { Authorization: `Bearer ${key}` } : {}),
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content:
                    "Explain only the provided cubing lesson in the requested language. Do not invent solutions or give move sequences. Do not discuss unrelated subjects, ask for personal information, or claim to track a physical cube. Return plain text, at most 150 words.",
                },
                { role: "user", content: minimized },
              ],
              max_tokens: 300,
              store: false,
            }),
          },
          32768,
        );
        if (!response.ok) return fallback(`provider-${response.status}`);
        const data = await boundedJson(response, 32768, signal);
        if (
          data?.choices?.[0]?.finish_reason !== "stop" ||
          data?.choices?.[0]?.message?.refusal ||
          data?.error
        )
          return fallback("provider-safety-refusal");
        const explanation = data?.choices?.[0]?.message?.content;
        if (
          typeof explanation !== "string" ||
          !explanation.trim() ||
          explanation.length > 4000
        )
          return fallback("invalid-response");
        if (
          /\b(?:[URFDLBMES]w?(?:2|')?|[ulrb]'?)\b/.test(explanation) ||
          /https?:|@|<[^>]+>|suicide|色情|赌博|自杀/i.test(explanation)
        )
          return fallback("unvalidated-content");
        if (this.c.REGION === "INTL")
          await this.moderate(base, explanation, signal);
        signal.throwIfAborted();
        return {
          source: this.c.AI_MODE === "mock" ? "simulated" : "ai",
          explanation: explanation.trim(),
          algorithm: lesson.algorithm,
          label:
            locale === "zh"
              ? this.c.AI_MODE === "mock"
                ? "模拟 AI · 仅供开发测试"
                : "AI 生成内容"
              : this.c.AI_MODE === "mock"
                ? "Simulated AI · development only"
                : "AI-generated explanation",
        };
      });
    } catch (error) {
      if (error instanceof AiSafetyError) return fallback(error.message);
      return fallback("provider-unavailable");
    }
  }
}
