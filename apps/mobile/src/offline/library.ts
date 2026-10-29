import { DownloadedLesson, type Region } from "@cubers/core";
export type OfflineContext = {
  token: string;
  region: Region;
  ownerId?: string;
};
export interface OfflineStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  binding(): Promise<OfflineContext | null>;
  bind(value: OfflineContext): Promise<void>;
  clear(): Promise<void>;
}
const MAX_BYTES = 600_000; // Character bound also keeps UTF-8 files below 2 MB.
const CLOCK_SKEW_MS = 60_000;
export class OfflineLibrary {
  private context: OfflineContext | null = null;
  private epoch = 0;
  private queue = Promise.resolve();
  constructor(
    private storage: OfflineStorage,
    private clock = () => Date.now(),
  ) {}
  setContext(value: OfflineContext | null) {
    if (JSON.stringify(value) === JSON.stringify(this.context)) return;
    this.context = value;
    this.epoch++;
    if (!value) void this.clear().catch(() => {});
  }
  private async serial<T>(job: () => Promise<T>): Promise<T> {
    const task = this.queue.then(job);
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  private async read(context: OfflineContext) {
    const binding = await this.storage.binding();
    if (
      !binding ||
      binding.token !== context.token ||
      binding.region !== context.region ||
      (context.ownerId && binding.ownerId !== context.ownerId)
    ) {
      await this.storage.clear();
      return [];
    }
    const raw = await this.storage.read();
    if (!raw) return [];
    const now = this.clock();
    if (raw.length > MAX_BYTES || !Number.isFinite(now) || now < 0) {
      await this.storage.clear();
      return [];
    }
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || data.length > 200)
        throw Error("Invalid download index");
      const entries = data.map((p) => DownloadedLesson.parse(p));
      if (
        entries.some(
          (p) =>
            p.ownerId !== binding.ownerId ||
            p.region !== context.region ||
            p.downloadedAt > now + CLOCK_SKEW_MS,
        )
      )
        throw Error("Download scope changed");
      const valid = entries.filter((p) => p.expiresAt > now);
      if (valid.length !== entries.length)
        await this.storage.write(JSON.stringify(valid));
      return valid;
    } catch {
      await this.storage.clear();
      return [];
    }
  }
  async list(): Promise<DownloadedLesson[]> {
    const context = this.context,
      epoch = this.epoch;
    if (!context) return [];
    return this.serial(async () => {
      const entries = await this.read(context);
      return epoch === this.epoch ? entries : [];
    });
  }
  async save(value: unknown) {
    const packet = DownloadedLesson.parse(value),
      context = this.context,
      epoch = this.epoch;
    const now = this.clock();
    if (
      !context ||
      packet.region !== context.region ||
      (context.ownerId && packet.ownerId !== context.ownerId) ||
      packet.downloadedAt > now + CLOCK_SKEW_MS ||
      packet.expiresAt <= now
    )
      throw Error(
        "Download does not belong to the current account or access window",
      );
    await this.serial(async () => {
      if (epoch !== this.epoch) throw Error("Account changed");
      const entries = await this.read(context);
      if (epoch !== this.epoch) throw Error("Account changed");
      const next = [
        ...entries.filter((p) => p.lesson.id !== packet.lesson.id),
        packet,
      ];
      const raw = JSON.stringify(next);
      if (next.length > 200 || raw.length > MAX_BYTES)
        throw Error("Download library is full");
      await this.storage.bind({ ...context, ownerId: packet.ownerId });
      await this.storage.write(raw);
      if (epoch !== this.epoch) {
        await this.storage.clear();
        throw Error("Account changed");
      }
    });
  }
  async remove(id: string) {
    const context = this.context,
      epoch = this.epoch;
    if (!context) return;
    await this.serial(async () => {
      const entries = await this.read(context);
      if (epoch === this.epoch)
        await this.storage.write(
          JSON.stringify(entries.filter((p) => p.lesson.id !== id)),
        );
    });
  }
  async reconcilePublished(
    versions: { id: string; version: number }[],
    token: string,
    region: string,
  ) {
    const context = this.context,
      epoch = this.epoch;
    if (!context || context.token !== token || context.region !== region)
      return [];
    return this.serial(async () => {
      const entries = await this.read(context);
      if (epoch !== this.epoch) return [];
      const valid = entries.filter((p) =>
        versions.some(
          (v) => v.id === p.lesson.id && v.version === p.courseVersion,
        ),
      );
      await this.storage.write(JSON.stringify(valid));
      return epoch === this.epoch ? valid : [];
    });
  }
  async clear() {
    await this.serial(() => this.storage.clear());
  }
}
