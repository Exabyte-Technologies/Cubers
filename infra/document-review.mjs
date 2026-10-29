// Dedicated no-network container. No application credentials or storage mounts.
import http from "node:http";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  rm,
  chmod,
  lstat,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const socket =
  process.env.DOCUMENT_REVIEW_SOCKET || "/run/cubers-documents/review.sock";
let active = false;
function run(command, args, signal, timeout) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: { PATH: "/usr/bin:/bin", HOME: "/tmp", LANG: "C.UTF-8" },
    });
    let output = "",
      errors = 0,
      failed = false;
    const kill = () => {
      failed = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    };
    const timer = setTimeout(kill, timeout);
    signal.addEventListener("abort", kill, { once: true });
    if (signal.aborted) kill();
    child.stdout.on("data", (b) => {
      output += b.toString();
      if (output.length > 32768) kill();
    });
    child.stderr.on("data", (b) => {
      errors += b.length;
      if (errors > 32768) kill();
    });
    child.once("error", () => {
      failed = true;
    });
    // Admission and private scratch remain owned until actual child close.
    child.once("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", kill);
      if (failed || code !== 0 || signal.aborted)
        reject(Error("Document rendering failed"));
      else resolve(output);
    });
  });
}
const server = http.createServer(async (req, res) => {
  if (
    req.method !== "POST" ||
    req.url !== "/review" ||
    req.headers["content-type"] !== "application/pdf"
  ) {
    res.writeHead(400).end();
    return;
  }
  if (active) {
    res.writeHead(429).end();
    return;
  }
  active = true;
  const abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 12000);
  req.once("aborted", () => abort.abort());
  res.once("close", () => {
    if (!res.writableFinished) abort.abort();
  });
  let temp;
  try {
    const chunks = [];
    let size = 0;
    const bodyTimer = setTimeout(() => {
      abort.abort();
      req.destroy();
    }, 4000);
    try {
      for await (const b of req) {
        size += b.length;
        if (size > 10 * 1024 * 1024) throw Error("Document too large");
        chunks.push(b);
      }
    } finally {
      clearTimeout(bodyTimer);
    }
    if (!size || abort.signal.aborted) throw Error("No document");
    temp = await mkdtemp(join(tmpdir(), "cubers-document-"));
    const input = join(temp, "source.pdf");
    await writeFile(input, Buffer.concat(chunks), { mode: 0o600 });
    const info = await run("/usr/bin/pdfinfo", [input], abort.signal, 2000);
    const pages = Number(/^Pages:\s+(\d+)\s*$/m.exec(info)?.[1]);
    if (
      !Number.isInteger(pages) ||
      pages < 1 ||
      pages > 8 ||
      /^Encrypted:\s+yes/m.test(info)
    )
      throw Error("Unsupported document");
    await run(
      "/usr/bin/pdftoppm",
      [
        "-f",
        "1",
        "-l",
        String(pages),
        "-scale-to",
        "1600",
        "-jpeg",
        "-jpegopt",
        "quality=85,optimize=y",
        input,
        join(temp, "page"),
      ],
      abort.signal,
      8000,
    );
    const files = (await readdir(temp))
      .filter((f) => /^page-\d+\.jpg$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    if (files.length !== pages) throw Error("Incomplete document");
    const images = [];
    let total = 0;
    for (const name of files) {
      const file = join(temp, name),
        st = await lstat(file);
      if (!st.isFile() || st.isSymbolicLink() || st.size > 1024 * 1024)
        throw Error("Invalid page");
      const bytes = await readFile(file);
      total += bytes.length;
      if (total > 8 * 1024 * 1024) throw Error("Document too large");
      images.push(bytes.toString("base64"));
    }
    if (abort.signal.aborted) throw Error("Cancelled");
    res
      .writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      })
      .end(JSON.stringify({ version: 1, pages: images }));
  } catch {
    if (!res.destroyed && !res.headersSent) res.writeHead(422).end();
  } finally {
    clearTimeout(timer);
    if (temp) await rm(temp, { recursive: true, force: true });
    active = false;
  }
});
server.requestTimeout = 5000;
server.headersTimeout = 5000;
server.maxHeadersCount = 16;
server.maxConnections = 8;
server.maxRequestsPerSocket = 1;
try {
  const s = await lstat(socket);
  if (!s.isSocket()) throw Error("Unsafe socket path");
  await rm(socket);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
server.listen(socket, async () => {
  await chmod(socket, 0o600);
  console.log("Document review ready");
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 15000).unref();
  });
