// Host development API -> private Unix socket -> isolated Docker renderer.
// The Docker socket and application credentials are never mounted in the parser.
import http from "node:http";
import { spawn, execFile as callback } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, lstat, chmod, rm, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
const exec = promisify(callback),
  root = resolve(".data"),
  socket = resolve(root, "local-documents.sock");
await mkdir(root, { recursive: true });
try {
  await lstat(socket);
  throw Error(
    "A local document socket already exists; inspect its owner before restarting",
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const name = "cubers-local-documents-" + randomUUID().slice(0, 8);
const { stdout } = await exec(
  "docker",
  [
    "run",
    "--detach",
    "--name",
    name,
    "--network",
    "none",
    "--read-only",
    "--init",
    "--user",
    "1000:1000",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--pids-limit",
    "32",
    "--memory",
    "512m",
    "--cpus",
    "1",
    "--tmpfs",
    "/tmp:size=134217728,mode=1777",
    "-e",
    "DOCUMENT_REVIEW_SOCKET=/tmp/review.sock",
    process.env.CUBERS_DOCUMENTS_IMAGE || "cubers-documents:local",
  ],
  { timeout: 30000 },
);
const id = stdout.trim();
if (!/^[a-f0-9]{64}$/.test(id)) throw Error("Unknown local document container");
let active = false,
  stopping = false;
const server = http.createServer((req, res) => {
  const length = Number(req.headers["content-length"]);
  if (
    req.url !== "/review" ||
    req.method !== "POST" ||
    req.headers["content-type"] !== "application/pdf" ||
    !Number.isInteger(length) ||
    length < 1 ||
    length > 10 * 1024 * 1024
  ) {
    res.writeHead(400).end();
    return;
  }
  if (active) {
    res.writeHead(429).end();
    return;
  }
  active = true;
  const code = `const http=require('http');const r=http.request({socketPath:'/tmp/review.sock',path:'/review',method:'POST',headers:{'Content-Type':'application/pdf','Content-Length':${length}},agent:false},s=>{if(s.statusCode!==200){s.resume();s.on('end',()=>{process.exitCode=s.statusCode===422?22:1});return;}s.pipe(process.stdout);});r.on('error',()=>{process.exitCode=1});process.stdin.pipe(r);`;
  const child = spawn("docker", ["exec", "-i", id, "node", "-e", code], {
    stdio: ["pipe", "pipe", "ignore"],
  });
  let size = 0,
    received = 0,
    failed = false;
  const chunks = [];
  const kill = () => {
    failed = true;
    child.kill("SIGTERM");
  };
  const timer = setTimeout(kill, 18000);
  req.once("aborted", kill);
  res.once("close", () => {
    if (!res.writableFinished) kill();
  });
  req.on("data", (b) => {
    received += b.length;
    if (received > length) {
      req.destroy();
      kill();
    }
  });
  child.stdin.on("error", () => {});
  req.pipe(child.stdin);
  child.stdout.on("data", (b) => {
    size += b.length;
    if (size > 12 * 1024 * 1024) kill();
    else chunks.push(b);
  });
  child.once("error", () => {
    failed = true;
  });
  child.once("close", (status) => {
    clearTimeout(timer);
    active = false;
    if (!res.destroyed)
      res
        .writeHead(!failed && status === 0 ? 200 : status === 22 ? 422 : 503, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        })
        .end(!failed && status === 0 ? Buffer.concat(chunks) : undefined);
  });
});
server.requestTimeout = 5000;
server.headersTimeout = 5000;
server.maxConnections = 4;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.closeAllConnections();
  await new Promise((r) => server.close(() => r()));
  await exec("docker", ["rm", "--force", id], { timeout: 30000 });
  await rm(socket, { force: true });
  process.exit(0);
}
try {
  const expected = createHash("sha256")
    .update(await readFile("infra/document-review.mjs"))
    .digest("hex");
  const actual = await exec(
    "docker",
    [
      "exec",
      id,
      "node",
      "-e",
      "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('/opt/cubers-documents/document-review.mjs')).digest('hex'))",
    ],
    { timeout: 10000 },
  );
  if (actual.stdout.trim() !== expected)
    throw Error("Rebuild the local document image from current source");
  await new Promise((r) => server.listen(socket, r));
  await chmod(socket, 0o600);
  await writeFile(
    resolve(root, "local-documents.json"),
    JSON.stringify(
      { socket, containerId: id, sourceSha256: expected },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    "Private local document review ready. Set CONSENT_REVIEW_SOCKET=" +
      socket +
      " for the host development API.",
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => void stop());
} catch (e) {
  await exec("docker", ["rm", "--force", id], { timeout: 30000 }).catch(
    () => {},
  );
  throw e;
}
