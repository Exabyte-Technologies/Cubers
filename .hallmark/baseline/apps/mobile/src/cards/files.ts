import {
  cleanCardBytes,
  cardSharingError,
  assertCardFresh,
  type ExportBinding,
} from "./bytes";
export type CardFileIO = {
  clear(): Promise<void>;
  write(id: string, bytes: Uint8Array): Promise<string>;
  remove(id: string): Promise<void>;
  available(): Promise<boolean>;
  share(uri: string): Promise<void>;
  now(): number;
};
/** No credentials or owner IDs are written into cache filenames or image metadata. */
export class CardFileShares {
  private context: string | null = null;
  private epoch = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private failedCleanup = false;
  private sharing = false;
  private sequence = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private leases = new Map<string, number>();
  constructor(private io: CardFileIO) {
    void this.clear();
  }
  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const next = this.tail.then(action);
    this.tail = next.catch(() => {});
    return next;
  }
  private clear() {
    clearTimeout(this.timer);
    return this.enqueue(async () => {
      try {
        await this.io.clear();
        this.leases.clear();
        this.failedCleanup = false;
      } catch {
        this.failedCleanup = true;
      }
    });
  }
  setContext(key: string | null) {
    if (key === this.context) return;
    this.context = key;
    this.epoch++;
    void this.clear();
  }
  reset() {
    this.context = null;
    this.epoch++;
    return this.clear();
  }
  prune() {
    return this.enqueue(async () => {
      try {
        if (this.failedCleanup) {
          await this.io.clear();
          this.leases.clear();
          this.failedCleanup = false;
        }
        for (const [id, expiry] of this.leases)
          if (
            expiry <= this.io.now() ||
            this.io.now() < expiry - 30 * 60000 - 5000
          ) {
            await this.io.remove(id);
            this.leases.delete(id);
          }
      } catch {
        this.failedCleanup = true;
      }
      this.schedule();
    });
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.leases.size) return;
    this.timer = setTimeout(
      () => {
        void this.prune();
      },
      Math.max(1, Math.min(...this.leases.values()) - this.io.now()),
    );
    // Node tests need not be kept alive by a native cache lease.
    (this.timer as any).unref?.();
  }
  async share(value: unknown, expected: ExportBinding) {
    if (!this.context || this.sharing)
      throw cardSharingError(
        this.sharing ? "BUSY" : "CONTEXT",
        "Sharing is unavailable or already open",
      );
    const epoch = this.epoch,
      context = this.context;
    const current = () => epoch === this.epoch && context === this.context;
    const binding = { ...expected };
    const { bytes } = cleanCardBytes(value, binding, this.io.now());
    this.sharing = true;
    try {
      const uri = await this.enqueue(async () => {
        if (!current() || this.failedCleanup)
          throw cardSharingError(
            this.failedCleanup ? "CLEANUP" : "CONTEXT",
            "Card context or cleanup changed",
          );
        if (!(await this.io.available()))
          throw cardSharingError(
            "UNAVAILABLE",
            "Image sharing is unavailable in this device or build",
          );
        if (!current())
          throw cardSharingError("CONTEXT", "Card context changed");
        assertCardFresh(binding, this.io.now());
        while (this.leases.size >= 4) {
          const id = this.leases.keys().next().value!;
          try {
            await this.io.remove(id);
            this.leases.delete(id);
          } catch {
            this.failedCleanup = true;
            throw cardSharingError("CLEANUP", "Temporary card cleanup failed");
          }
        }
        const id = `${this.io.now().toString(36)}-${(++this.sequence).toString(36)}`;
        let uri: string;
        try {
          uri = await this.io.write(id, bytes);
        } catch {
          try {
            await this.io.remove(id);
          } catch {
            this.failedCleanup = true;
          }
          throw cardSharingError(
            "WRITE",
            "Could not create the temporary card image",
          );
        }
        try {
          assertCardFresh(binding, this.io.now());
        } catch (error) {
          try {
            await this.io.remove(id);
          } catch {
            this.failedCleanup = true;
          }
          throw error;
        }
        if (!current()) {
          try {
            await this.io.remove(id);
          } catch {
            this.failedCleanup = true;
          }
          throw cardSharingError("CONTEXT", "Card context changed");
        }
        this.leases.set(id, this.io.now() + 30 * 60000);
        this.schedule();
        return uri;
      });
      if (!current()) throw cardSharingError("CONTEXT", "Card context changed");
      // Do not hold the file queue while another app owns the share sheet.
      await this.io.share(uri);
    } finally {
      this.sharing = false;
    }
  }
  download(value: unknown, expected: ExportBinding) {
    return this.share(value, expected);
  }
}
