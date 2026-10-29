import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Worker } from "node:worker_threads";
import { FirstSolveSolver } from "../apps/api/src/first-solve-solver";
import { applyMoves, solvedCube } from "@cubers/core";

const state = () => applyMoves(solvedCube(4), "Rw U F2");
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
class ControlledWorker extends EventEmitter {
  sent: any[] = [];
  terminations = 0;
  failPost = false;
  referenced = true;
  private finish!: (code: number) => void;
  private terminated = new Promise<number>(
    (resolve) => (this.finish = resolve),
  );
  ref() {
    this.referenced = true;
  }
  unref() {
    this.referenced = false;
  }
  postMessage(message: any) {
    if (this.failPost) throw new Error("Synthetic transport failure");
    this.sent.push(message);
  }
  terminate() {
    this.terminations++;
    return this.terminated;
  }
  exit() {
    this.emit("exit", 1);
    this.finish(1);
  }
  reply(plan: any = { marker: "validated-worker-result" }) {
    this.emit("message", { id: this.sent.at(-1).id, plan });
  }
}
class ControlledSolver extends FirstSolveSolver {
  workers: ControlledWorker[] = [];
  failCreate = false;
  failPost = false;
  protected createWorker(): Worker {
    if (this.failCreate) throw new Error("Synthetic construction failure");
    const worker = new ControlledWorker();
    worker.failPost = this.failPost;
    this.workers.push(worker);
    return worker as unknown as Worker;
  }
}

test("guidance timeout reserves worker capacity until exit and ignores late messages", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const solver = new ControlledSolver();
  const first = assert.rejects(solver.solve(state()), /timed out/);
  const old = solver.workers[0];
  t.mock.timers.tick(2999);
  assert.equal(old.terminations, 0);
  t.mock.timers.tick(1);
  await first;
  const queued = Array.from({ length: 6 }, () => solver.solve(state()));
  await assert.rejects(solver.solve(state()), /busy/);
  assert.equal(solver.workers.length, 1);
  old.reply();
  old.emit("error", new Error("Late failure"));
  assert.equal(old.terminations, 1);
  assert.equal(solver.workers.length, 1);
  old.exit();
  await flush();
  const replacement = solver.workers[1];
  assert.ok(replacement);
  for (let i = 0; i < queued.length; i++) {
    const marker = { job: i };
    old.emit("message", {
      id: replacement.sent.at(-1).id,
      plan: { stale: true },
    });
    replacement.reply(marker);
    assert.deepEqual(await queued[i], marker);
  }
  assert.equal(replacement.sent.length, 6);
  assert.equal(replacement.referenced, false);
  const shutdown = solver.onModuleDestroy();
  replacement.exit();
  await shutdown;
});

test("guidance construction and dispatch failures release jobs without leaking queue capacity", async () => {
  const solver = new ControlledSolver();
  solver.failCreate = true;
  await assert.rejects(solver.solve(state()), /interrupted/);
  solver.failCreate = false;
  solver.failPost = true;
  await assert.rejects(solver.solve(state()), /interrupted/);
  assert.equal(solver.workers[0].terminations, 1);
  solver.failPost = false;
  const recovered = solver.solve(state());
  assert.equal(solver.workers.length, 1);
  solver.workers[0].exit();
  await flush();
  const worker = solver.workers[1];
  worker.reply();
  await recovered;
  const shutdown = solver.onModuleDestroy();
  worker.exit();
  await shutdown;
});

test("guidance shutdown rejects active and queued jobs and awaits a retiring worker", async () => {
  const solver = new ControlledSolver();
  const active = assert.rejects(solver.solve(state()), /interrupted/);
  const queued = assert.rejects(solver.solve(state()), /shutting down/);
  const worker = solver.workers[0];
  worker.emit("error", new Error("Synthetic worker crash"));
  await active;
  let stopped = false;
  const shutdown = solver.onModuleDestroy().then(() => (stopped = true));
  await queued;
  await flush();
  assert.equal(stopped, false);
  worker.exit();
  await shutdown;
  assert.equal(solver.workers.length, 1);
  await assert.rejects(solver.solve(state()), /busy/);
});

test("guidance shutdown cancels a running job and prevents replacement on late exit", async () => {
  const solver = new ControlledSolver();
  const active = assert.rejects(solver.solve(state()), /shutting down/);
  const queued = assert.rejects(solver.solve(state()), /shutting down/);
  const worker = solver.workers[0];
  const shutdown = solver.onModuleDestroy();
  await Promise.all([active, queued]);
  worker.reply();
  worker.exit();
  await shutdown;
  assert.equal(worker.terminations, 1);
  assert.equal(solver.workers.length, 1);
});
