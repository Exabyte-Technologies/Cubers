import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderConsentPages } from "../apps/api/src/consent-document";
import { consentPdfFixture } from "./helpers/consent-pdf";
async function socketCase(
  handler: Parameters<typeof createServer>[0],
  work: (socket: string) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "cubers-doc-ipc-")),
    socket = join(directory, "review.sock");
  const server = createServer(handler);
  try {
    await new Promise<void>((resolve) => server.listen(socket, resolve));
    await work(socket);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}
test("document transport sends exact private bytes over its Unix socket and waits for complete response", async () => {
  const pdf = consentPdfFixture();
  await socketCase(
    async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const b of req) chunks.push(b);
      assert.deepEqual(Buffer.concat(chunks), pdf);
      assert.equal(req.url, "/review");
      assert.equal(req.headers["content-type"], "application/pdf");
      res.end(JSON.stringify({ version: 1, pages: ["YWJj"] }));
    },
    async (socket) =>
      assert.deepEqual(await renderConsentPages(socket, pdf), ["YWJj"]),
  );
});
test("document transport rejects redirects, busy services and invalid page contracts", async () => {
  for (const result of [
    { code: 302, body: "" },
    { code: 429, body: "" },
    { code: 200, body: "not json" },
    { code: 200, body: JSON.stringify({ version: 1, pages: [] }) },
    {
      code: 200,
      body: JSON.stringify({ version: 1, pages: ["data:text/html,unsafe"] }),
    },
  ]) {
    await socketCase(
      (req, res) => {
        req.resume();
        req.on("end", () => res.writeHead(result.code).end(result.body));
      },
      async (socket) => {
        await assert.rejects(renderConsentPages(socket, consentPdfFixture()));
      },
    );
  }
});
test("document transport rejects an interrupted response rather than delivering partial pages", async () => {
  await socketCase(
    (req, res) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "Content-Length": "1000" });
        res.write('{"version":1,"pages":[');
        res.destroy();
      });
    },
    async (socket) => {
      await assert.rejects(renderConsentPages(socket, consentPdfFixture()));
    },
  );
});
