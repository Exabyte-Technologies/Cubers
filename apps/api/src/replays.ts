import {
  Injectable,
  ConflictException,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from "@nestjs/common";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { type ReplayPacket, ReplaySource } from "@cubers/core";
type Job = {
  id: string;
  source: unknown;
  resolve: (packet: ReplayPacket) => void;
  reject: (error: Error) => void;
};
@Injectable()
export class Replays implements OnModuleDestroy {
  private worker?: Worker;
  private active?: Job;
  private queue: Job[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private stopping = false;
  validate(value: unknown): Promise<ReplayPacket> {
    if (this.stopping || this.queue.length + Number(!!this.active) >= 4)
      return Promise.reject(
        new ServiceUnavailableException("Replay is busy; retry shortly"),
      );
    // Validate shape/count/primitive bounds before worker message cloning.
    const parsed = ReplaySource.safeParse(value);
    if (!parsed.success)
      return Promise.reject(
        new ConflictException("Saved replay is unavailable"),
      );
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: randomUUID(),
        source: parsed.data,
        resolve,
        reject,
      });
      this.next();
    });
  }
  private next() {
    if (this.stopping || this.active || !this.queue.length) return;
    if (!this.worker) {
      const worker = new Worker(join(__dirname, "replay-worker.js"), {
        resourceLimits: {
          maxOldGenerationSizeMb: 64,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 4,
        },
      });
      worker.unref();
      this.worker = worker;
      worker.on("message", (message) => {
        if (worker !== this.worker || message.id !== this.active?.id) return;
        const job = this.active!;
        clearTimeout(this.timer);
        this.active = undefined;
        if (message.invalid)
          job.reject(
            new ConflictException("Saved replay could not be validated"),
          );
        else job.resolve(message.packet);
        this.next();
      });
      const failed = () => {
        if (worker !== this.worker) return;
        this.worker = undefined;
        clearTimeout(this.timer);
        this.active?.reject(
          new ServiceUnavailableException("Replay interrupted; retry"),
        );
        this.active = undefined;
        void worker.terminate();
        this.next();
      };
      worker.on("error", failed);
      worker.on("exit", failed);
    }
    this.active = this.queue.shift()!;
    const worker = this.worker;
    this.timer = setTimeout(() => {
      if (worker !== this.worker) return;
      this.worker = undefined;
      this.active?.reject(
        new ServiceUnavailableException("Replay timed out; retry"),
      );
      this.active = undefined;
      void worker.terminate();
      this.next();
    }, 3000);
    worker.postMessage({ id: this.active.id, source: this.active.source });
  }
  async onModuleDestroy() {
    this.stopping = true;
    clearTimeout(this.timer);
    const error = new ServiceUnavailableException("Replay is shutting down");
    this.active?.reject(error);
    this.active = undefined;
    for (const job of this.queue.splice(0)) job.reject(error);
    const worker = this.worker;
    this.worker = undefined;
    await worker?.terminate();
  }
}
