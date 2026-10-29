import { OperationalOutbox } from "./operational-outbox";
import {
  OperationalWebhook,
  resolveOperationalWebhook,
  sendOperationalWebhook,
} from "./operational-webhook";
import type { OperationalAlert } from "./operational-alerts";
import type { OperationalSnapshot } from "@cubers/core";
export class OperationalDelivery {
  private stopped = new AbortController();
  private running?: Promise<
    ReturnType<OperationalOutbox["summary"]> & {
      attempted: number;
      delivered: number;
      failed: number;
      expired: number;
    }
  >;
  constructor(
    private queue: OperationalOutbox,
    private credential: OperationalWebhook,
    private send = (body: string, signal: AbortSignal) =>
      this.deliver(body, signal),
  ) {}
  enqueue(events: OperationalAlert[]) {
    if (this.stopped.signal.aborted)
      throw Error("Operational delivery stopped");
    this.queue.enqueue(events);
  }
  observe(snapshot: OperationalSnapshot) {
    if (this.stopped.signal.aborted)
      throw Error("Operational delivery stopped");
    return this.queue.observe(snapshot);
  }
  private async deliver(body: string, signal: AbortSignal) {
    const address = await resolveOperationalWebhook(
      this.credential.endpoint,
      signal,
    );
    await sendOperationalWebhook(
      this.credential.endpoint,
      address,
      this.credential.headers(body),
      body,
      signal,
    );
  }
  run() {
    if (this.running) return this.running;
    this.running = this.drain().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async drain() {
    const deadline = Date.now() + 8000;
    let attempted = 0,
      delivered = 0,
      failed = 0;
    const expired = this.queue.prune();
    for (
      let i = 0;
      i < 20 && !this.stopped.signal.aborted && Date.now() < deadline;
      i++
    ) {
      const row = this.queue.claim();
      if (!row) break;
      attempted++;
      const signal = AbortSignal.any([
        this.stopped.signal,
        AbortSignal.timeout(
          Math.min(
            4000,
            Math.max(1, Math.min(deadline, row.expires) - Date.now()),
          ),
        ),
      ]);
      let ok = false;
      try {
        await this.send(row.body, signal);
        ok = !signal.aborted;
      } catch {}
      if (this.queue.complete(row, ok) && ok) delivered++;
      else failed++;
      if (!ok) break;
    }
    return { ...this.queue.summary(), attempted, delivered, failed, expired };
  }
  stop() {
    this.stopped.abort();
  }
  async close() {
    this.stop();
    try {
      await this.running;
    } finally {
      try {
        this.queue.close();
      } finally {
        this.credential.destroy();
      }
    }
  }
}
