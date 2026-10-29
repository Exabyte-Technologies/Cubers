import { test } from "node:test";
import assert from "node:assert/strict";
import { DownloadedLesson, OFFLINE_LEASE_MS, lessons } from "@cubers/core";
import {
  OfflineLibrary,
  type OfflineStorage,
  type OfflineContext,
} from "../apps/mobile/src/offline/library";
const token = "a".repeat(43),
  ownerId = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const context = { token, region: "INTL" as const, ownerId };
const packet = (id = "3-notation", now = 1000) => ({
  schemaVersion: 1,
  ownerId,
  region: "INTL",
  downloadedAt: now,
  expiresAt: now + OFFLINE_LEASE_MS,
  courseVersion: 1,
  lesson: lessons.find((l) => l.id === id)!,
});
class MemoryStorage implements OfflineStorage {
  data: string | null = null;
  scope: OfflineContext | null = null;
  pause?: Promise<void>;
  async read() {
    return this.data;
  }
  async write(value: string) {
    await this.pause;
    this.data = value;
  }
  async binding() {
    return this.scope;
  }
  async bind(value: OfflineContext) {
    this.scope = value;
  }
  async clear() {
    this.data = null;
    this.scope = null;
  }
}
test("download schema covers every published authored lesson and rejects overlong or unbounded grants", () => {
  for (const lesson of lessons)
    assert.equal(
      DownloadedLesson.parse({ ...packet(), lesson }).lesson.id,
      lesson.id,
    );
  assert.throws(() =>
    DownloadedLesson.parse({
      ...packet(),
      expiresAt: 1000 + OFFLINE_LEASE_MS + 1,
    }),
  );
  assert.throws(() => DownloadedLesson.parse({ ...packet(), expiresAt: 999 }));
  assert.throws(() => DownloadedLesson.parse({ ...packet(), token }));
  assert.throws(() =>
    DownloadedLesson.parse({
      ...packet(),
      lesson: { ...packet().lesson, algorithm: "U".repeat(8001) },
    }),
  );
  assert.throws(() =>
    DownloadedLesson.parse({
      ...packet(),
      lesson: { ...packet().lesson, algorithm: "Q" },
    }),
  );
});
test("offline library persists versions without tokens in content, replaces downloads and removes them", async () => {
  const storage = new MemoryStorage(),
    library = new OfflineLibrary(storage, () => 1000);
  library.setContext(context);
  await library.save(packet());
  assert.equal((await library.list()).length, 1);
  assert.equal(storage.data!.includes(token), false);
  await library.save({ ...packet(), courseVersion: 2 });
  assert.equal((await library.list())[0].courseVersion, 2);
  await library.save(packet("4-parity"));
  await library.remove("3-notation");
  assert.deepEqual(
    (await library.list()).map((p) => p.lesson.id),
    ["4-parity"],
  );
  await library.clear();
  assert.deepEqual(await library.list(), []);
});
test("cold restart requires the same secure session and region binding", async () => {
  const storage = new MemoryStorage(),
    first = new OfflineLibrary(storage, () => 1000);
  first.setContext(context);
  await first.save(packet());
  const restored = new OfflineLibrary(storage, () => 1100);
  restored.setContext({ token, region: "INTL" });
  assert.equal((await restored.list()).length, 1);
  restored.setContext({ ...context, region: "CN" });
  assert.deepEqual(await restored.list(), []);
  assert.equal(storage.data, null);
});
test("online publication manifests remove withdrawn and outdated downloads without crossing sessions", async () => {
  const storage = new MemoryStorage(),
    library = new OfflineLibrary(storage, () => 1000);
  library.setContext(context);
  await library.save(packet());
  await library.save(packet("4-parity"));
  assert.deepEqual(
    await library.reconcilePublished(
      [{ id: "3-notation", version: 2 }],
      token,
      "INTL",
    ),
    [],
  );
  await library.save(packet());
  assert.deepEqual(
    await library.reconcilePublished([], "b".repeat(43), "INTL"),
    [],
  );
  assert.equal((await library.list()).length, 1);
});
test("account, owner and session rotation cannot read another library or save an old grant", async () => {
  const storage = new MemoryStorage(),
    library = new OfflineLibrary(storage, () => 1000);
  library.setContext(context);
  await library.save(packet());
  await assert.rejects(library.save({ ...packet(), ownerId: other }));
  await assert.rejects(library.save({ ...packet(), region: "CN" }));
  library.setContext({ ...context, token: "b".repeat(43) });
  assert.deepEqual(await library.list(), []);
  library.setContext(null);
  assert.deepEqual(await library.list(), []);
});
test("expired, future, malformed and mixed-owner content is erased", async () => {
  for (const value of [
    JSON.stringify([packet()]),
    "{bad",
    JSON.stringify([{ ...packet(), ownerId: other }]),
  ]) {
    const storage = new MemoryStorage();
    storage.scope = context;
    storage.data = value;
    const library = new OfflineLibrary(storage, () => 1000 + OFFLINE_LEASE_MS);
    library.setContext(context);
    assert.deepEqual(await library.list(), []);
  }
  const storage = new MemoryStorage();
  storage.scope = context;
  storage.data = JSON.stringify([packet("3-notation", 120000)]);
  const library = new OfflineLibrary(storage, () => 1000);
  library.setContext(context);
  assert.deepEqual(await library.list(), []);
  assert.equal(storage.data, null);
});
test("late writes after signout are erased before another account reads or writes", async () => {
  const storage = new MemoryStorage(),
    library = new OfflineLibrary(storage, () => 1000);
  library.setContext(context);
  let release!: () => void;
  storage.pause = new Promise((r) => {
    release = r;
  });
  const pending = library.save(packet());
  await new Promise((r) => setTimeout(r, 0));
  library.setContext(null);
  release();
  await assert.rejects(pending, /Account changed/);
  await library.clear();
  assert.equal(storage.data, null);
  library.setContext({ ...context, token: "b".repeat(43), ownerId: other });
  await library.save({ ...packet(), ownerId: other });
  assert.equal((await library.list())[0].ownerId, other);
});
