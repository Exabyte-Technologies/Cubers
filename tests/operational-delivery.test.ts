import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  realpath,
  rm,
  writeFile,
  readFile,
  chmod,
  symlink,
  link,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { DatabaseSync } from "node:sqlite";
import {
  OperationalWebhook,
  OperationalEnvelope,
  operationalWebhookUrl,
  loadOperationalWebhook,
  resolveOperationalWebhook,
  sendOperationalWebhook,
} from "../apps/api/src/operational-webhook";
import { OperationalOutbox } from "../apps/api/src/operational-outbox";
import { OperationalDelivery } from "../apps/api/src/operational-delivery";
import type { OperationalAlert } from "../apps/api/src/operational-alerts";
import type { OperationalSnapshot } from "@cubers/core";
import { receiptOpenSsl } from "./helpers/apple-receipt-fixture";
import { readConfig } from "../apps/api/src/config";

const endpoint = "https://collector.cubers.invalid/alerts",
  secret = Buffer.alloc(32, 37);
test("outbound alert delivery stays unconfigured by default and rejects partial operator configuration", () => {
  const base = {
    DATABASE_URL: "postgresql://test",
    REDIS_URL: "redis://127.0.0.1",
    S3_ENDPOINT: "http://127.0.0.1",
    S3_REGION: "test",
    S3_BUCKET: "test",
    S3_ACCESS_KEY: "test",
    S3_SECRET_KEY: "test",
  };
  assert.equal(readConfig(base).OPERATIONS_ALERT_FILE, undefined);
  assert.throws(() =>
    readConfig({ ...base, OPERATIONS_ALERT_FILE: "/private/key.json" }),
  );
  assert.throws(() =>
    readConfig({
      ...base,
      OPERATIONS_ALERT_FILE: "/private/key.json",
      OPERATIONS_ALERT_OUTBOX_DIRECTORY: "/private/queue",
    }),
  );
});
const credential = (region: "INTL" | "CN" = "INTL", url = endpoint) =>
  new OperationalWebhook(
    region,
    "synthetic-key",
    url,
    Buffer.from(secret),
    "collector.cubers.invalid",
  );
const event = (now = Date.now()): OperationalAlert => ({
  event: "cubers.operational.alert",
  region: "INTL",
  signal: "database",
  state: "critical",
  sampledAt: new Date(now).toISOString(),
  count: null,
});
const snapshot = (
  state: "ok" | "critical",
  at: number,
): OperationalSnapshot => ({
  region: "INTL",
  sampledAt: new Date(at).toISOString(),
  state,
  checks: [
    {
      signal: "database",
      state,
      count: null,
      oldestAt: null,
      thresholdSeconds: null,
    },
  ],
  queue: null,
});
async function fixture(
  work: (f: {
    dir: string;
    key: OperationalWebhook;
    open: (capacity?: number) => Promise<OperationalOutbox>;
    close: (q: OperationalOutbox) => void;
  }) => Promise<void>,
) {
  const dir = await realpath(
      await mkdtemp(join(tmpdir(), "cubers-alert-outbox-")),
    ),
    key = credential(),
    queues = new Set<OperationalOutbox>();
  try {
    await work({
      dir,
      key,
      open: async (capacity) => {
        const q = await OperationalOutbox.open(dir, key, capacity);
        queues.add(q);
        return q;
      },
      close: (q) => {
        q.close();
        queues.delete(q);
      },
    });
  } finally {
    for (const q of queues)
      try {
        q.close();
      } catch {}
    key.destroy();
    await rm(dir, { recursive: true, force: true });
  }
}
test("operational credentials reject unsafe files, links, FIFOs and another community without exposing secrets", async () => {
  const dir = await realpath(
      await mkdtemp(join(tmpdir(), "cubers-alert-secret-")),
    ),
    path = join(dir, "key.json"),
    fifo = join(dir, "fifo");
  const data = {
    version: 1,
    region: "INTL",
    endpoint,
    keyId: "synthetic-key",
    key: secret.toString("base64"),
  };
  try {
    await writeFile(path, JSON.stringify(data), { mode: 0o600 });
    const loaded = await loadOperationalWebhook(
      path,
      "INTL",
      "collector.cubers.invalid",
    );
    assert.equal(JSON.stringify(loaded), '"[private operational webhook]"');
    loaded.destroy();
    await assert.rejects(
      loadOperationalWebhook(path, "CN", "collector.cubers.invalid"),
      /unavailable/,
    );
    await chmod(path, 0o644);
    await assert.rejects(
      loadOperationalWebhook(path, "INTL", "collector.cubers.invalid"),
    );
    await chmod(path, 0o600);
    await symlink(path, join(dir, "alias"));
    await assert.rejects(
      loadOperationalWebhook(
        join(dir, "alias"),
        "INTL",
        "collector.cubers.invalid",
      ),
    );
    await link(path, join(dir, "hard"));
    await assert.rejects(
      loadOperationalWebhook(path, "INTL", "collector.cubers.invalid"),
    );
    await unlink(join(dir, "hard"));
    execFileSync("mkfifo", [fifo]);
    const began = Date.now();
    await assert.rejects(
      loadOperationalWebhook(fifo, "INTL", "collector.cubers.invalid"),
    );
    assert.ok(Date.now() - began < 1000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("alert destinations require exact HTTPS hosts, reject mixed/private answers and pin a validated address", async () => {
  for (const value of [
    "http://collector.cubers.invalid/alerts",
    "https://user:secret@collector.cubers.invalid/alerts",
    "https://collector.cubers.invalid:444/alerts",
    "https://collector.cubers.invalid/alerts?token=secret",
    "https://127.0.0.1/alerts",
    "https://other.cubers.invalid/alerts",
  ]) {
    assert.throws(() =>
      operationalWebhookUrl(value, "collector.cubers.invalid"),
    );
  }
  const good = operationalWebhookUrl(endpoint, "collector.cubers.invalid"),
    signal = AbortSignal.timeout(1000);
  assert.deepEqual(
    await resolveOperationalWebhook(good, signal, (async () => [
      { address: "8.8.8.8", family: 4 },
    ]) as any),
    { address: "8.8.8.8", family: 4 },
  );
  await assert.rejects(
    resolveOperationalWebhook(good, signal, (async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]) as any),
  );
  await assert.rejects(
    resolveOperationalWebhook(good, signal, (async () => [
      { address: "::ffff:127.0.0.1", family: 6 },
    ]) as any),
  );
});
test("aborted DNS work retains its bounded admission until the underlying resolver settles", async () => {
  const stops = [new AbortController(), new AbortController()],
    release: Array<() => void> = [];
  const resolver = (() =>
    new Promise((resolve) =>
      release.push(() => resolve([{ address: "8.8.8.8", family: 4 }])),
    )) as any;
  const jobs = stops.map((stop) =>
    resolveOperationalWebhook(new URL(endpoint), stop.signal, resolver).then(
      () => null,
      (error) => error,
    ),
  );
  await new Promise((r) => setImmediate(r));
  stops.forEach((stop) => stop.abort());
  await Promise.all(jobs);
  try {
    await assert.rejects(
      resolveOperationalWebhook(
        new URL(endpoint),
        AbortSignal.timeout(1000),
        resolver,
      ),
      /capacity/,
    );
  } finally {
    release.forEach((done) => done());
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(
    (
      await resolveOperationalWebhook(
        new URL(endpoint),
        AbortSignal.timeout(1000),
        (async () => [{ address: "8.8.8.8", family: 4 }]) as any,
      )
    ).family,
    4,
  );
});
test("operational queue files must be private, regular and unlinked before SQLite opens them", async () =>
  fixture(async ({ dir, key }) => {
    await chmod(dir, 0o755);
    await assert.rejects(OperationalOutbox.open(dir, key));
    await chmod(dir, 0o700);
    const file = join(dir, "alerts.sqlite");
    execFileSync("mkfifo", [file]);
    const began = Date.now();
    await assert.rejects(OperationalOutbox.open(dir, key));
    assert.ok(Date.now() - began < 1000);
    await unlink(file);
    const target = await realpath(
      await mkdtemp(join(tmpdir(), "cubers-alert-target-")),
    );
    try {
      const source = join(target, "source");
      await writeFile(source, "", { mode: 0o600 });
      await symlink(source, file);
      await assert.rejects(OperationalOutbox.open(dir, key));
      await unlink(file);
      await link(source, file);
      await assert.rejects(OperationalOutbox.open(dir, key));
      await unlink(file);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }));
test("a full queue rolls back observation checkpoints so the missed transition is retried after capacity returns", async () =>
  fixture(async ({ open }) => {
    const q = await open(1),
      now = Date.now();
    q.observe(snapshot("critical", now), now);
    const changed = snapshot("critical", now + 1);
    changed.checks.push({
      signal: "smtp",
      state: "warning",
      count: null,
      oldestAt: null,
      thresholdSeconds: null,
    });
    assert.throws(() => q.observe(changed, now + 1), /full/);
    const previous = q.claim(now + 2)!;
    q.complete(previous, true, now + 3);
    assert.equal(q.observe(changed, now + 4)[0].signal, "smtp");
  }));
test("outbox transactions preserve restart recovery and never deliver a recovery before its queued alert", async () =>
  fixture(async ({ open, close }) => {
    const now = Date.now();
    let q = await open();
    assert.equal(q.observe(snapshot("critical", now), now).length, 1);
    assert.equal(q.observe(snapshot("critical", now + 1), now + 1).length, 0);
    close(q);
    q = await open();
    assert.equal(
      q.observe(snapshot("ok", now + 2), now + 2)[0].event,
      "cubers.operational.recovery",
    );
    const alert = q.claim(now + 3)!;
    assert.equal(
      JSON.parse(alert.body).alert.event,
      "cubers.operational.alert",
    );
    q.complete(alert, false, now + 4);
    assert.equal(q.claim(now + 5), undefined);
    const retry = q.claim(now + 30005)!;
    assert.equal(retry.id, alert.id);
    assert.equal(retry.body, alert.body);
    assert.equal(q.complete(retry, true, now + 30006), true);
    const recovery = q.claim(now + 30007)!;
    assert.equal(
      JSON.parse(recovery.body).alert.event,
      "cubers.operational.recovery",
    );
    assert.equal(q.complete(recovery, true, now + 30008), true);
    assert.equal(q.summary().pending, 0);
  }));
test("persistent leases refuse competing delivery and stale acknowledgements after lease recovery", async () =>
  fixture(async ({ open }) => {
    const first = await open(),
      second = await open(),
      now = Date.now();
    first.enqueue([event(now)], now);
    const lease = first.claim(now)!;
    assert.equal(second.claim(now + 1), undefined);
    const replacement = second.claim(now + 30001)!;
    assert.equal(replacement.id, lease.id);
    assert.notEqual(replacement.lease, lease.lease);
    assert.equal(first.complete(lease, true, now + 30002), false);
    assert.equal(second.complete(replacement, true, now + 30003), true);
    assert.equal(first.summary().pending, 0);
  }));
test("bounded outboxes roll back overflow, reject region/credential changes and expire old messages", async () =>
  fixture(async ({ dir, key, open }) => {
    const q = await open(2),
      now = Date.now();
    q.enqueue([event(now), event(now)], now);
    assert.throws(() => q.enqueue([event(now)], now));
    assert.equal(q.summary().pending, 2);
    assert.throws(() => q.enqueue([{ ...event(now), region: "CN" }], now));
    const other = credential("CN");
    try {
      await assert.rejects(OperationalOutbox.open(dir, other));
    } finally {
      other.destroy();
    }
    assert.equal(q.summary().pending, 2);
    assert.equal(q.prune(now + 72 * 3600000), 2);
    assert.equal(q.summary().pending, 0);
    const changed = credential(
      "INTL",
      "https://collector.cubers.invalid/replacement",
    );
    try {
      await assert.rejects(OperationalOutbox.open(dir, changed));
    } finally {
      changed.destroy();
    }
    assert.ok(key.binding);
  }));
test("outbox authentication refuses modified records while retaining the pending event", async () =>
  fixture(async ({ dir, open }) => {
    const q = await open();
    q.enqueue([event()]);
    const db = new DatabaseSync(join(dir, "alerts.sqlite"));
    try {
      db.prepare("UPDATE pending SET body=?").run('{"altered":true}');
    } finally {
      db.close();
    }
    assert.throws(() => q.claim(), /integrity/);
    assert.equal(q.summary().pending, 1);
  }));
test("delivery coalesces callers and keeps a cancelled operation admitted until its underlying sender settles", async () =>
  fixture(async ({ open, key }) => {
    const q = await open();
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>((r) => (started = r)),
      pause = new Promise<void>((r) => (release = r));
    let calls = 0;
    const service = new OperationalDelivery(q, key, async () => {
      calls++;
      started();
      await pause;
    });
    service.enqueue([event()]);
    const first = service.run();
    assert.equal(service.run(), first);
    await entered;
    service.stop();
    let closed = false;
    const close = service.close().then(() => {
      closed = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(closed, false);
    assert.equal(calls, 1);
    release();
    await close;
    assert.equal((await first).delivered, 0);
  }));
async function tlsFixture(
  work: (f: {
    url: URL;
    ca: string;
    receive: (handler: (req: any, res: any, body: string) => void) => void;
  }) => Promise<void>,
) {
  const dir = await realpath(
    await mkdtemp(join(tmpdir(), "cubers-alert-tls-")),
  );
  execFileSync(
    receiptOpenSsl,
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=collector.cubers.invalid",
      "-addext",
      "subjectAltName=DNS:collector.cubers.invalid",
      "-keyout",
      join(dir, "key.pem"),
      "-out",
      join(dir, "cert.pem"),
    ],
    { stdio: "ignore" },
  );
  const ca = await readFile(join(dir, "cert.pem"), "utf8");
  let handler = (req: any, res: any, _body: string) => res.end();
  const server = createServer(
    { key: await readFile(join(dir, "key.pem")), cert: ca },
    async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const b of req) chunks.push(b);
      handler(req, res, Buffer.concat(chunks).toString());
    },
  );
  try {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const url = new URL(endpoint);
    url.port = String((server.address() as any).port);
    await work({ url, ca, receive: (next) => (handler = next) });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
}
test("actual HTTPS delivery signs exact fixed-label payloads with verified hostname, timestamp and stable event identity", async () =>
  tlsFixture(async ({ url, ca, receive }) => {
    const key = credential(),
      now = Date.now(),
      body = JSON.stringify(
        OperationalEnvelope.parse({
          version: 1,
          id: "33d00421-1281-4520-87a3-423e02507ac6",
          createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 10000).toISOString(),
          alert: event(now),
        }),
      );
    let requests = 0;
    receive((req, res, received) => {
      requests++;
      assert.equal(received, body);
      assert.equal(req.socket.servername, "collector.cubers.invalid");
      assert.equal(req.headers["x-cubers-event-id"], JSON.parse(body).id);
      const signed = `CubersOperationalAlerts1\nsynthetic-key\n${req.headers["x-cubers-sent-at"]}\n${body}`;
      assert.equal(
        req.headers["x-cubers-signature"],
        "sha256=" + createHmac("sha256", secret).update(signed).digest("hex"),
      );
      res.writeHead(204).end();
    });
    try {
      await sendOperationalWebhook(
        url,
        { address: "127.0.0.1", family: 4 },
        key.headers(body),
        body,
        AbortSignal.timeout(2000),
        ca,
      );
      assert.equal(requests, 1);
    } finally {
      key.destroy();
    }
  }));
test("actual HTTPS transport never follows redirects and rejects oversized or stalled acknowledgements", async () =>
  tlsFixture(async ({ url, ca, receive }) => {
    const key = credential(),
      now = Date.now(),
      body = JSON.stringify({
        version: 1,
        id: "33d00421-1281-4520-87a3-423e02507ac6",
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 10000).toISOString(),
        alert: event(now),
      });
    let requests = 0;
    try {
      receive((_req, res) => {
        requests++;
        res
          .writeHead(302, {
            Location: "https://unapproved.cubers.invalid/secret",
          })
          .end();
      });
      await assert.rejects(
        sendOperationalWebhook(
          url,
          { address: "127.0.0.1", family: 4 },
          key.headers(body),
          body,
          AbortSignal.timeout(2000),
          ca,
        ),
      );
      assert.equal(requests, 1);
      receive((_req, res) =>
        res.writeHead(200, { "Content-Length": "5000" }).end("x".repeat(5000)),
      );
      await assert.rejects(
        sendOperationalWebhook(
          url,
          { address: "127.0.0.1", family: 4 },
          key.headers(body),
          body,
          AbortSignal.timeout(2000),
          ca,
        ),
      );
      receive((_req, res) => {
        res.writeHead(200);
        res.write("pending");
      });
      const started = Date.now();
      await assert.rejects(
        sendOperationalWebhook(
          url,
          { address: "127.0.0.1", family: 4 },
          key.headers(body),
          body,
          AbortSignal.timeout(150),
          ca,
        ),
      );
      assert.ok(Date.now() - started < 1500);
    } finally {
      key.destroy();
    }
  }));
