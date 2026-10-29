import { test, before } from "node:test";
import assert from "node:assert/strict";
import { renderAchievementCard } from "../apps/api/src/achievement-card-image";
import {
  cleanCardBytes,
  type ExportBinding,
} from "../apps/mobile/src/cards/bytes";
import { CardFileShares } from "../apps/mobile/src/cards/files";
import { cardFileShares as web } from "../apps/mobile/src/cards/native.web";
import { sessionRequest } from "../apps/mobile/src/session-request";
import type { CardImage } from "@cubers/core";
let packet: CardImage;
before(async () => {
  const rendered = await renderAchievementCard("first-checkpoint", "zh", null);
  packet = {
    cardId: "10000000-0000-4000-8000-000000000001",
    base64: rendered.image.toString("base64"),
    imageDigest: rendered.imageDigest,
    approvalDigest: rendered.imageDigest,
    watermarked: false,
    mime: "image/png",
    filename: "cubers-milestone.png",
    width: 1200,
    height: 1500,
  };
});
const binding = (now: number): ExportBinding => ({
  cardId: packet.cardId,
  imageDigest: packet.imageDigest,
  preparedAt: now,
});
const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 1));
  }
  throw Error("Fake operation did not reach the expected boundary");
}
function environment() {
  const files = new Map<string, Uint8Array>();
  const state = {
    now: 1000000,
    available: true,
    shared: 0,
    written: 0,
    clearFailure: false,
    writeFailure: false,
    removeFailure: false,
    writeGate: null as Promise<void> | null,
    shareGate: null as Promise<void> | null,
    availabilityGate: null as Promise<void> | null,
  };
  const manager = new CardFileShares({
    async clear() {
      if (state.clearFailure) throw Error("Fake cleanup denied");
      files.clear();
    },
    async write(id, bytes) {
      files.set(id, bytes);
      state.written++;
      if (state.writeGate) await state.writeGate;
      if (state.writeFailure) throw Error("Fake partial write");
      return `file:///private/cache/${id}/cubers-milestone.png`;
    },
    async remove(id) {
      if (state.removeFailure) throw Error("Fake remove denied");
      files.delete(id);
    },
    async available() {
      if (state.availabilityGate) await state.availabilityGate;
      return state.available;
    },
    async share(uri) {
      assert.ok(uri.endsWith("/cubers-milestone.png"));
      assert.equal(uri.includes("secret-owner"), false);
      state.shared++;
      if (state.shareGate) await state.shareGate;
    },
    now: () => state.now,
  });
  manager.setContext("secret-owner-A");
  return { manager, files, state };
}
test("file export accepts only fresh approved PNG packets bound to the selected card", () => {
  const now = 1000000;
  assert.equal(
    cleanCardBytes(packet, binding(now), now).bytes.length,
    Buffer.from(packet.base64, "base64").length,
  );
  for (const value of [
    { ...packet, watermarked: true },
    { ...packet, cardId: "10000000-0000-4000-8000-000000000002" },
    { ...packet, approvalDigest: "a".repeat(64) },
    { ...packet, mime: "image/svg+xml" },
    { ...packet, base64: "abcd" },
  ])
    assert.throws(() => cleanCardBytes(value, binding(now), now));
  for (const time of [now - 60001, now + 5001, NaN])
    assert.throws(() => cleanCardBytes(packet, binding(time), now));
  const corrupt = Buffer.from(packet.base64, "base64");
  corrupt[0] = 0;
  assert.throws(() =>
    cleanCardBytes(
      { ...packet, base64: corrupt.toString("base64") },
      binding(now),
      now,
    ),
  );
  const dimensions = Buffer.from(packet.base64, "base64");
  dimensions.writeUInt32BE(4000, 16);
  assert.throws(() =>
    cleanCardBytes(
      { ...packet, base64: dimensions.toString("base64") },
      binding(now),
      now,
    ),
  );
});
test("native export leases retain a bounded handoff cache and expire on pruning or account change", async () => {
  const { manager, files, state } = environment();
  try {
    for (let i = 0; i < 5; i++) await manager.share(packet, binding(state.now));
    assert.equal(state.shared, 5);
    assert.equal(files.size, 4);
    assert.ok(
      [...files.values()].reduce((sum, value) => sum + value.length, 0) <=
        2000000,
    );
    state.now += 30 * 60000 + 1;
    await manager.prune();
    assert.equal(files.size, 0);
    await manager.share(packet, binding(state.now));
    state.now -= 10000;
    await manager.prune();
    assert.equal(files.size, 0);
    await manager.share(packet, binding(state.now));
    manager.setContext("secret-owner-B");
    await manager.prune();
    assert.equal(files.size, 0);
  } finally {
    await manager.reset();
  }
});
test("late file writes cannot open a share sheet or survive a different account", async () => {
  const { manager, files, state } = environment(),
    gate = deferred();
  state.writeGate = gate.promise;
  const pending = manager.share(packet, binding(state.now)),
    rejected = assert.rejects(
      pending,
      (error: any) => error.code === "CONTEXT",
    );
  await until(() => state.written === 1);
  manager.setContext("secret-owner-B");
  gate.resolve();
  await rejected;
  await manager.prune();
  assert.equal(files.size, 0);
  assert.equal(state.shared, 0);
  state.writeGate = null;
  await manager.share(packet, binding(state.now));
  assert.equal(files.size, 1);
  await manager.reset();
});
test("sign-out cleanup does not wait for an external share chooser to return", async () => {
  const { manager, files, state } = environment(),
    gate = deferred();
  state.shareGate = gate.promise;
  const pending = manager.share(packet, binding(state.now));
  await until(() => state.shared === 1);
  await manager.reset();
  assert.equal(files.size, 0);
  gate.resolve();
  await pending;
  await assert.rejects(
    manager.share(packet, binding(state.now)),
    (error: any) => error.code === "CONTEXT",
  );
});
test("expired availability and partial write failures release no file and allow safe recovery", async () => {
  const { manager, files, state } = environment(),
    gate = deferred();
  state.availabilityGate = gate.promise;
  const pending = manager.share(packet, binding(state.now)),
    rejected = assert.rejects(
      pending,
      (error: any) => error.code === "EXPIRED",
    );
  await new Promise((r) => setTimeout(r, 1));
  state.now += 60001;
  gate.resolve();
  await rejected;
  assert.equal(files.size, 0);
  assert.equal(state.written, 0);
  assert.equal(state.shared, 0);
  state.availabilityGate = null;
  state.writeFailure = true;
  await assert.rejects(
    manager.share(packet, binding(state.now)),
    (error: any) => error.code === "WRITE",
  );
  assert.equal(files.size, 0);
  state.removeFailure = true;
  await assert.rejects(manager.share(packet, binding(state.now)));
  assert.equal(files.size, 1);
  state.writeFailure = false;
  await assert.rejects(
    manager.share(packet, binding(state.now)),
    (error: any) => error.code === "CLEANUP",
  );
  state.removeFailure = false;
  await manager.prune();
  assert.equal(files.size, 0);
  await manager.share(packet, binding(state.now));
  assert.equal(state.shared, 1);
  await manager.reset();
});
test("unsupported native sharing creates no temporary file", async () => {
  const { manager, files, state } = environment();
  state.available = false;
  await assert.rejects(
    manager.share(packet, binding(state.now)),
    (error: any) => error.code === "UNAVAILABLE",
  );
  assert.equal(files.size, 0);
  assert.equal(state.written, 0);
  await manager.reset();
});
test("web sharing keeps the final user gesture, offers local download and revokes all owned object URLs", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(
      globalThis,
      "navigator",
    ),
    originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document"),
    create = URL.createObjectURL,
    revoke = URL.revokeObjectURL;
  let supported = true,
    called = false,
    clicks = 0,
    failClick = false;
  const created: string[] = [],
    revoked: string[] = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      canShare: ({ files }: any) => supported && files.length === 1,
      share: ({ files }: any) => {
        called = true;
        assert.equal(files[0].name, "cubers-milestone.png");
        return Promise.resolve();
      },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => ({
        click() {
          if (failClick) throw Error("Fake browser blocked download");
          clicks++;
        },
      }),
    },
  });
  URL.createObjectURL = () => {
    const url = `blob:synthetic-${created.length}`;
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    revoked.push(url);
  };
  try {
    web.setContext("web-owner");
    const pending = web.share(packet, binding(Date.now()));
    assert.equal(called, true);
    await pending;
    supported = false;
    await assert.rejects(
      web.share(packet, binding(Date.now())),
      (error: any) => error.code === "UNAVAILABLE",
    );
    for (let i = 0; i < 5; i++) await web.download(packet, binding(Date.now()));
    assert.equal(clicks, 5);
    assert.equal(revoked.length, 1);
    web.setContext("another-owner");
    assert.equal(revoked.length, 5);
    failClick = true;
    await assert.rejects(web.download(packet, binding(Date.now())));
    assert.equal(revoked.at(-1), created.at(-1));
  } finally {
    await web.reset();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    if (originalNavigator)
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete (globalThis as any).navigator;
    if (originalDocument)
      Object.defineProperty(globalThis, "document", originalDocument);
    else delete (globalThis as any).document;
  }
});
test("normal account requests never send stale credentials or accept a prior session's late data", async () => {
  let identity = { token: "session-A", region: "INTL" },
    calls = 0;
  const gate = deferred<string>();
  const pending = sessionRequest(
    { ...identity },
    () => identity,
    () => {
      calls++;
      return gate.promise;
    },
    "Session changed",
  );
  const rejected = assert.rejects(
    pending,
    (error: any) => error.code === "SESSION_CHANGED",
  );
  identity = { token: "session-B", region: "INTL" };
  gate.resolve("private-old-response");
  await rejected;
  await assert.rejects(
    sessionRequest(
      { token: "session-A", region: "INTL" },
      () => identity,
      async () => {
        calls++;
        return "old";
      },
      "Session changed",
    ),
  );
  assert.equal(calls, 1);
  assert.equal(
    await sessionRequest(
      { ...identity },
      () => identity,
      async () => "current",
      "Session changed",
    ),
    "current",
  );
});
