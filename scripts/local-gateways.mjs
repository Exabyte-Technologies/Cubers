import { simulatedModeration } from "./mock-ai-protocol.mjs";
// Local development emulators. Never included in the production API image.
import { SMTPServer } from "smtp-server";
import S3rver from "s3rver";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { randomUUID, getCiphers } from "node:crypto";
// S3rver uses DES only for its synthetic opaque list cursor. This flag belongs
// solely to this development emulator process, never the application runtime.
if (!getCiphers().includes("des"))
  throw Error(
    "Start the development gateway with: node --openssl-legacy-provider scripts/local-gateways.mjs",
  );
await mkdir(".data/mail", { recursive: true, mode: 0o700 });
await mkdir(".data/s3", { recursive: true });
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["AUTH", "STARTTLS"],
  onData(stream, _session, callback) {
    let text = "";
    stream.on("data", (b) => {
      text += b;
      if (text.length > 100000) stream.destroy();
    });
    stream.on("end", async () => {
      await writeFile(`.data/mail/${randomUUID()}.eml`, text, { mode: 0o600 });
      callback();
    });
  },
});
smtp.listen(10259, "127.0.0.1");
const extraOrigins = (process.env.CUBERS_DEV_WEB_ORIGINS || "")
  .split(",")
  .filter(Boolean)
  .map((value) => {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== value ||
      /[<>&"']/.test(value)
    )
      throw Error("Invalid development web origin");
    return url.origin;
  });
const cors =
  "<CORSConfiguration><CORSRule>" +
  [
    ...new Set([
      "http://localhost:8081",
      "http://127.0.0.1:8081",
      "http://127.0.0.1:4173",
      "http://localhost:4173",
      ...extraOrigins,
    ]),
  ]
    .map((value) => `<AllowedOrigin>${value}</AllowedOrigin>`)
    .join("") +
  "<AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>300</MaxAgeSeconds></CORSRule></CORSConfiguration>";
const storage = new S3rver({
  port: 9009,
  address: process.env.CUBERS_DEV_LAN === "true" ? "0.0.0.0" : "127.0.0.1",
  silent: true,
  directory: ".data/s3",
  configureBuckets: [
    { name: "cubers-intl", configs: [cors] },
    { name: "cubers-cn", configs: [cors] },
  ],
});
await storage.run();
const ai = createServer(async (req, res) => {
  if (req.url === "/v1/models") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: [{ id: "cubers-simulator" }] }));
    return;
  }
  if (!["/v1/chat/completions", "/v1/moderations"].includes(req.url || "")) {
    res.writeHead(404).end();
    return;
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20000) {
      res.writeHead(413).end();
      return;
    }
  }
  try {
    const b = JSON.parse(raw);
    if (req.url === "/v1/moderations") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(simulatedModeration(b)));
      return;
    }
    const context = JSON.parse(b.messages.at(-1).content);
    const content =
      context.language === "zh"
        ? "这是本地模拟的开发测试讲解。先观察目标块，慢慢执行已验证的课程步骤，并在每一步后检查色块的位置。"
        : "This is a local simulated explanation for development testing. Observe the target pieces, follow the validated lesson, and check their positions after each turn.";
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          { finish_reason: "stop", message: { role: "assistant", content } },
        ],
      }),
    );
  } catch {
    res.writeHead(400).end();
  }
}).listen(4010, "127.0.0.1");
process.on("SIGINT", () => {
  smtp.close();
  void storage.close();
  ai.close();
});
process.on("SIGTERM", () => {
  smtp.close();
  void storage.close();
  ai.close();
});
console.log(
  "Local email, S3 emulator, and simulated AI are running. Mail stays in .data/mail; no external AI calls.",
);
