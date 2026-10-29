import {
  Injectable,
  ServiceUnavailableException,
  OnModuleDestroy,
} from "@nestjs/common";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  guidedFacelets,
  isPyraminx,
  type PracticeState,
  type GuidedSolvePlan,
  type GuidedPuzzle,
} from "@cubers/core";
type Job = {
  id: string;
  puzzle: GuidedPuzzle;
  faces: Record<string, string[]>;
  resolve: (plan: GuidedSolvePlan) => void;
  reject: (reason: Error) => void;
};
@Injectable()
export class FirstSolveSolver implements OnModuleDestroy {
  private worker?: Worker;
  private terminating?: Promise<number>;
  private queue: Job[] = [];
  private active?: Job;
  private timer?: ReturnType<typeof setTimeout>;
  private stopping = false;
  solve(cube: PracticeState): Promise<GuidedSolvePlan> {
    if (!isPyraminx(cube) && ![2, 3, 4].includes(cube.size))
      return Promise.reject(
        new ServiceUnavailableException("Unsupported guided puzzle"),
      );
    if (this.stopping || this.queue.length + Number(!!this.active) >= 6)
      return Promise.reject(
        new ServiceUnavailableException("Guidance is busy; try again shortly"),
      );
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: randomUUID(),
        puzzle: isPyraminx(cube)
          ? "pyraminx"
          : cube.size === 4
            ? "4x4"
            : cube.size === 2
              ? "2x2"
              : "3x3",
        faces: guidedFacelets(cube),
        resolve,
        reject,
      });
      this.next();
    });
  }
  private next() {
    if (this.active || this.stopping || this.terminating || !this.queue.length)
      return;
    this.active = this.queue.shift()!;
    try {
      if (!this.worker) {
        const worker = this.createWorker();
        this.worker = worker;
        worker.on("message", (message) => {
          if (worker !== this.worker || message.id !== this.active?.id) return;
          const job = this.active!;
          clearTimeout(this.timer);
          this.active = undefined;
          worker.unref();
          if (message.error)
            job.reject(
              new ServiceUnavailableException(
                "Could not validate guidance for this state",
              ),
            );
          else job.resolve(message.plan);
          this.next();
        });
        const failed = () => {
          this.retire(
            worker,
            new ServiceUnavailableException("Guidance interrupted; retry"),
          );
        };
        worker.on("error", failed);
        worker.on("exit", failed);
      }
      const current = this.worker;
      this.timer = setTimeout(() => {
        this.retire(
          current,
          new ServiceUnavailableException("Guidance timed out; retry"),
        );
      }, 3000);
      this.worker.ref();
      this.worker.postMessage({
        id: this.active.id,
        puzzle: this.active.puzzle,
        faces: this.active.faces,
      });
    } catch {
      const error = new ServiceUnavailableException(
        "Guidance interrupted; retry",
      );
      if (this.worker) this.retire(this.worker, error);
      else {
        this.active?.reject(error);
        this.active = undefined;
        queueMicrotask(() => this.next());
      }
    }
  }
  protected createWorker(): Worker {
    return new Worker(join(__dirname, "first-solve-worker.js"), {
      resourceLimits: {
        maxOldGenerationSizeMb: 64,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 4,
      },
    });
  }
  private retire(worker: Worker, error: Error) {
    if (worker !== this.worker) return;
    this.worker = undefined;
    clearTimeout(this.timer);
    this.active?.reject(error);
    this.active = undefined;
    // A terminating thread still consumes memory and CPU. Reserve its slot
    // until exit, including after timeout and during application shutdown.
    const termination = worker.terminate();
    this.terminating = termination;
    void termination
      .catch(() => {})
      .finally(() => {
        if (this.terminating !== termination) return;
        this.terminating = undefined;
        this.next();
      });
  }
  async onModuleDestroy() {
    this.stopping = true;
    clearTimeout(this.timer);
    const error = new ServiceUnavailableException("Guidance is shutting down");
    this.active?.reject(error);
    this.active = undefined;
    for (const job of this.queue.splice(0)) job.reject(error);
    const worker = this.worker;
    if (worker) this.retire(worker, error);
    await this.terminating?.catch(() => {});
  }
}
