import {
  applyMoves,
  facelets,
  fromFacelets,
  stateKey,
  type CubeState,
  type SmartModel,
  type SmartSessionEvent,
  type SmartAttemptView,
  type SmartAttemptBatch,
} from "@cubers/core";
type Api = <T = any>(
  path: string,
  body?: unknown,
  method?: string,
) => Promise<T>;
const clone = (state: CubeState) => fromFacelets(3, facelets(state));
/** One foreground physical attempt. Interrupted epochs are never resumed. */
export class SmartAttemptLink {
  private row?: SmartAttemptView;
  private latest?: {
    state: CubeState;
    counter: number | null;
    verified: boolean;
  };
  private accepted?: CubeState;
  private pending: SmartAttemptBatch["turns"] = [];
  private flight?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private closed = false;
  private finishing = false;
  private closing?: Promise<void>;
  private lastSent = 0;
  constructor(
    private api: Api,
    private options: {
      id: string;
      model: SmartModel;
      platform: "ios" | "android";
    },
    private changed: (row: SmartAttemptView) => void,
    private problem: (message: string) => void,
    private clock = () => Date.now(),
  ) {}
  get saved() {
    return this.row;
  }
  private path(suffix = "") {
    return "smart-attempts/" + this.options.id + suffix;
  }
  private publish() {
    if (!this.closed && this.row) this.changed(this.row);
  }
  private fail(message: string) {
    try {
      if (!this.closed) this.problem(message);
    } finally {
      void this.close();
    }
  }
  observe(event: SmartSessionEvent) {
    if (this.closed || this.finishing) return;
    if (
      event.type === "status" &&
      ["disconnected", "resync"].includes(event.phase)
    ) {
      this.fail("Smart-cube connection interrupted");
      return;
    }
    if (event.type === "state")
      this.latest = {
        state: clone(event.state),
        counter: event.deviceCounter ?? null,
        verified: event.verified,
      };
    if (event.type === "move" && this.row?.smart) {
      if (
        this.row.status !== "SOLVING" ||
        this.pending.length >= 100 ||
        event.sequence !== this.row.smart.nextSequence + this.pending.length
      ) {
        this.fail("Turn stream changed or turning began before solve start");
        return;
      }
      this.pending.push({
        sequence: event.sequence,
        move: event.move.move,
        receivedAt: event.receivedAt,
        counter: event.move.deviceCounter ?? null,
        recovered: !!event.move.recovered,
      });
    }
  }
  private track(task: Promise<void>) {
    const tracked = task
      .catch((error) => {
        this.fail((error as Error).message);
        throw error;
      })
      .finally(() => {
        if (this.flight === tracked) this.flight = undefined;
      });
    this.flight = tracked;
    void tracked.catch(() => {});
    return tracked;
  }
  async bind() {
    if (this.closed || this.row || this.flight || !this.latest)
      throw Error("Synchronize a fresh cube before binding");
    const start = { ...this.latest, state: clone(this.latest.state) };
    return this.track(
      (async () => {
        const initial = await this.api<SmartAttemptView>(this.path());
        if (this.closed) return;
        this.row = await this.api<SmartAttemptView>(this.path("/bind"), {
          nonce: initial.nonce,
          version: initial.version,
          model: this.options.model,
          platform: this.options.platform,
          faces: facelets(start.state),
          counter: start.counter,
        });
        if (
          this.closed ||
          !this.latest ||
          stateKey(this.latest.state) !== stateKey(start.state) ||
          this.latest.counter !== start.counter
        )
          throw Error("The cube changed during scramble confirmation");
        this.accepted = clone(start.state);
        this.lastSent = this.clock();
        this.publish();
        this.timer = setInterval(() => {
          void this.flush().catch(() => {});
        }, 1000);
      })(),
    );
  }
  async flush(force = false): Promise<void> {
    if (this.closed || this.finishing || !this.accepted || !this.row?.smart)
      return;
    if (this.flight) {
      await this.flight;
      if (force && !this.closed) return this.flush(true);
      return;
    }
    if (!force && !this.pending.length && this.clock() - this.lastSent < 10000)
      return;
    return this.track(
      (async () => {
        do {
          const turns = this.pending.slice(0, 50),
            state = applyMoves(
              this.accepted!,
              turns.map((t) => t.move),
            ),
            last = turns.at(-1),
            counter = last?.counter ?? this.row!.smart!.counter,
            independent =
              turns.length === this.pending.length &&
              !!this.latest?.verified &&
              stateKey(state) === stateKey(this.latest.state) &&
              counter === this.latest.counter;
          this.row = await this.api<SmartAttemptView>(this.path("/turns"), {
            action: "turns",
            nonce: this.row!.nonce,
            version: this.row!.version,
            epoch: this.row!.smart!.epoch,
            turns,
            faces: facelets(state),
            counter,
            independentState: independent,
          });
          this.accepted = state;
          this.pending.splice(0, turns.length);
          this.lastSent = this.clock();
          this.publish();
        } while (!this.closed && this.pending.length);
      })(),
    );
  }
  private async advance(action: "inspect" | "start" | "finish") {
    await this.flush(true);
    if (
      this.closed ||
      this.flight ||
      this.pending.length ||
      !this.row?.smart ||
      !this.latest?.verified ||
      !this.accepted ||
      stateKey(this.accepted) !== stateKey(this.latest.state)
    )
      throw Error(
        "Stop turning and refresh the device position before continuing",
      );
    this.finishing = action === "finish";
    if (this.finishing) clearInterval(this.timer);
    return this.track(
      (async () => {
        await this.api("attempts/" + this.options.id + "/" + action, {
          nonce: this.row!.nonce,
        });
        this.row = await this.api<SmartAttemptView>(this.path());
        this.publish();
      })(),
    );
  }
  inspect() {
    return this.advance("inspect");
  }
  start() {
    return this.advance("start");
  }
  finish() {
    return this.advance("finish");
  }
  close() {
    if (this.closing) return this.closing;
    this.closed = true;
    clearInterval(this.timer);
    this.closing = (async () => {
      await this.flight?.catch(() => {});
      if (this.row?.smart)
        try {
          const current = await this.api<SmartAttemptView>(this.path());
          if (
            current.smart?.epoch === this.row.smart.epoch &&
            ["CREATED", "INSPECTION", "SOLVING", "AWAITING_EVIDENCE"].includes(
              current.status,
            )
          )
            await this.api("attempts/" + current.id + "/interrupt", {});
        } catch {}
      this.pending = [];
      this.latest = undefined;
      this.accepted = undefined;
    })();
    return this.closing;
  }
}
