import { simulatedModeration } from "./mock-ai-protocol.mjs";
import { createServer } from "node:http";
const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/v1/models") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: [{ id: "cubers-simulator" }] }));
    return;
  }
  if (
    req.method !== "POST" ||
    !["/v1/chat/completions", "/v1/moderations"].includes(req.url || "")
  ) {
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
    const body = JSON.parse(raw);
    if (req.url === "/v1/moderations") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(simulatedModeration(body)));
      return;
    }
    const context = JSON.parse(body.messages?.at(-1)?.content);
    const chinese = context.language === "zh";
    const message = chinese
      ? "这是开发环境的模拟讲解。先观察目标色块，再慢慢完成课程中的已验证步骤。每一步后停下来检查，重点理解色块如何移动。"
      : "This is a simulated development explanation. Find the target pieces, then work slowly through the validated lesson steps. Pause after each turn to understand where the pieces move.";
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        id: "cubers-simulated",
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: message },
          },
        ],
      }),
    );
  } catch {
    res.writeHead(400).end();
  }
});
server.listen(Number(process.env.MOCK_AI_PORT || 4010), "127.0.0.1", () =>
  console.log("Cubers simulated AI listening locally; no external AI calls."),
);
