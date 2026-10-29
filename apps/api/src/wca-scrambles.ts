import { ServiceUnavailableException } from "@nestjs/common";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  practiceApply,
  practiceSolved,
  solvedPuzzle,
  type Puzzle,
} from "@cubers/core";
import type { Config } from "./config";

export const WCA_PROGRAM = {
  program: "cubing.js",
  version: "0.66.1",
  filter: "cubers-min-distance-v1",
  artifactSha256:
    "b3303fa3ae3eddb59e99f9bd4ae17acb30ba7e713132fe08e8da836291961a0a",
} as const;
export const WCA_EVENTS: Record<Puzzle, string> = {
  "2x2": "222",
  "3x3": "333",
  "4x4": "444",
  pyraminx: "pyram",
};
export type WcaSource = typeof WCA_PROGRAM & { event: string };
export type WcaSet = { scrambles: string[][]; source: WcaSource };
const unavailable = () =>
  new ServiceUnavailableException(
    "WCA scramble generation unavailable; try again later · WCA 打乱生成暂不可用，请稍后重试",
  );

export function parseWcaSet(
  puzzle: Puzzle,
  raw: unknown,
  count: number,
): WcaSet {
  const rows = z.array(z.string().min(1).max(2048)).length(count).parse(raw);
  const scrambles = rows.map((text) => {
    const moves = text.trim().split(/\s+/);
    const grammar =
      puzzle === "pyraminx"
        ? /^[URLBurlb]'?$/
        : puzzle === "4x4"
          ? /^[URFDLB]w?(?:2|')?$/
          : /^[URFDLB](?:2|')?$/;
    if (
      moves.length > 100 ||
      moves.some((m) => !grammar.test(m)) ||
      practiceSolved(practiceApply(solvedPuzzle(puzzle), moves))
    )
      throw new Error("Invalid community-generator scramble output");
    return moves;
  });
  return { scrambles, source: { ...WCA_PROGRAM, event: WCA_EVENTS[puzzle] } };
}

type Job = {
  id: string;
  puzzle: Puzzle;
  count: number;
  resolve: (value: WcaSet) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type Slot = { worker: Worker; active?: Job };
/** Regional in-process worker pool. No network service, Java, account data or seeds. */
export class WcaScrambles {
  private queue: Job[] = [];
  private slots = new Set<Slot>();
  private terminating = new Set<Promise<number>>();
  private closed = false;
  constructor(private config: Pick<Config, "SCRAMBLE_TIMEOUT_MS">) {}
  stored(puzzle: Puzzle, raw: unknown, count = 1): WcaSet {
    try {
      const row = z
        .object({
          source: z
            .object({
              program: z.literal(WCA_PROGRAM.program),
              version: z.literal(WCA_PROGRAM.version),
              filter: z.literal(WCA_PROGRAM.filter),
              artifactSha256: z.literal(WCA_PROGRAM.artifactSha256),
              event: z.literal(WCA_EVENTS[puzzle]),
            })
            .strict(),
          scrambles: z
            .array(z.array(z.string().min(1).max(5)).min(1).max(100))
            .length(count),
        })
        .strict()
        .parse(raw);
      return parseWcaSet(
        puzzle,
        row.scrambles.map((m) => m.join(" ")),
        count,
      );
    } catch {
      throw unavailable();
    }
  }
  generate(puzzle: Puzzle, count = 1): Promise<WcaSet> {
    if (
      !Object.hasOwn(WCA_EVENTS, puzzle) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 30
    )
      throw new Error("Invalid WCA scramble request");
    if (this.closed || this.queue.length >= 128)
      return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      const job: Job = {
        id: randomUUID(),
        puzzle,
        count,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.queue.indexOf(job);
          if (index >= 0) this.queue.splice(index, 1);
          const slot = [...this.slots].find((s) => s.active === job);
          if (slot) this.retire(slot);
          else job.reject(unavailable());
        }, this.config.SCRAMBLE_TIMEOUT_MS),
      };
      this.queue.push(job);
      this.drain();
    });
  }
  private retire(slot: Slot) {
    if (!this.slots.delete(slot)) return;
    if (slot.active) {
      clearTimeout(slot.active.timer);
      slot.active.reject(unavailable());
      slot.active = undefined;
    }
    // Hold capacity until termination completes; nested cubing workers terminate too.
    const pending = slot.worker.terminate();
    this.terminating.add(pending);
    void pending.finally(() => {
      this.terminating.delete(pending);
      this.drain();
    });
  }
  private drain() {
    if (this.closed) return;
    while (this.queue.length) {
      let slot = [...this.slots].find((s) => !s.active);
      if (!slot) {
        if (this.slots.size + this.terminating.size >= 4) return;
        try {
          const worker = new Worker(join(__dirname, "wca-worker.mjs"), {
            execArgv: [],
            resourceLimits: {
              maxOldGenerationSizeMb: 256,
              maxYoungGenerationSizeMb: 32,
              stackSizeMb: 4,
            },
          });
          slot = { worker };
          this.slots.add(slot);
          const current = slot;
          worker.on("message", (message) => {
            const job = current.active;
            if (!this.slots.has(current) || !job || message?.id !== job.id)
              return;
            clearTimeout(job.timer);
            current.active = undefined;
            worker.unref();
            try {
              if (message.error || message.version !== WCA_PROGRAM.version)
                throw unavailable();
              job.resolve(
                parseWcaSet(job.puzzle, message.scrambles, job.count),
              );
            } catch {
              job.reject(unavailable());
            }
            this.drain();
          });
          worker.on("error", () => this.retire(current));
          worker.on("exit", () => this.retire(current));
        } catch {
          const job = this.queue.shift()!;
          clearTimeout(job.timer);
          job.reject(unavailable());
          continue;
        }
      }
      slot.active = this.queue.shift()!;
      slot.worker.ref();
      slot.worker.postMessage({
        id: slot.active.id,
        event: WCA_EVENTS[slot.active.puzzle],
        count: slot.active.count,
      });
    }
  }
  async close() {
    this.closed = true;
    for (const job of this.queue.splice(0)) {
      clearTimeout(job.timer);
      job.reject(unavailable());
    }
    for (const slot of this.slots) this.retire(slot);
    await Promise.allSettled([...this.terminating]);
  }
}
