import {
  applyMoves,
  facelets,
  fromFacelets,
  stateKey,
  type CubeState,
  type SmartSessionEvent,
  type SmartLessonView,
  type SmartConnectionView,
  type SmartLessonAction,
  type SmartModel,
} from "@cubers/core";
type Api = <T = any>(
  path: string,
  body?: unknown,
  method?: string,
) => Promise<T>;
const clone = (state: CubeState) => fromFacelets(3, facelets(state));
/** One physical connection and one server epoch. No addresses or raw packets
 * reach this bridge. A failed/closed bridge can never resume an old epoch. */
export class SmartLessonLink<T extends SmartConnectionView = SmartLessonView> {
  private row?: T;
  private latest?: {
    state: CubeState;
    verified: boolean;
    counter: number | null;
  };
  private accepted?: CubeState;
  private pending: Extract<SmartLessonAction, { action: "turns" }>["turns"] =
    [];
  private flight?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private closed = false;
  private finishing = false;
  private closing?: Promise<void>;
  private lastSent = 0;
  constructor(
    private api: Api,
    private options: {
      lessonId: string;
      courseVersion: number;
      alternativeId?: string;
      guided?: boolean;
      model: SmartModel;
      platform: "ios" | "android";
    },
    private changed: (row: T) => void,
    private problem: (message: string, detail?: unknown) => void,
    private clock = () => Date.now(),
  ) {}
  get saved() {
    return this.row;
  }
  get snapshot() {
    return this.latest
      ? { ...this.latest, state: clone(this.latest.state) }
      : undefined;
  }
  private publish() {
    if (!this.closed && this.row) this.changed(this.row);
  }
  observe(event: SmartSessionEvent) {
    if (this.closed || this.finishing) return;
    if (
      event.type === "status" &&
      (event.phase === "disconnected" || event.phase === "resync")
    ) {
      void this.close();
      return;
    }
    if (event.type === "state")
      this.latest = {
        state: clone(event.state),
        verified: event.verified,
        counter: event.deviceCounter ?? null,
      };
    if (
      event.type === "move" &&
      this.accepted &&
      this.row?.status === "PRACTICING"
    ) {
      if (
        this.pending.length >= 100 ||
        this.row.smart.nextSequence + this.pending.length !== event.sequence
      ) {
        this.fail(
          "Turn stream changed or exceeded its buffer; synchronize a new practice",
        );
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
  private fail(message: string, detail?: unknown) {
    try {
      if (!this.closed) this.problem(message, detail);
    } finally {
      void this.close();
    }
  }
  private track(task: Promise<void>) {
    const tracked = task
      .catch((error) => {
        this.fail((error as Error).message, error);
        throw error;
      })
      .finally(() => {
        if (this.flight === tracked) this.flight = undefined;
      });
    this.flight = tracked;
    void tracked.catch(() => {});
    return tracked;
  }
  private path(id?: string) {
    const root = this.options.guided
      ? "smart-first-solves"
      : "smart-lesson-sessions";
    return id ? root + "/" + id : root;
  }
  async start() {
    if (this.closed || this.flight || this.row || !this.latest)
      throw Error("Synchronize a fresh device before starting");
    const start = this.snapshot!,
      same = () =>
        !!this.latest &&
        stateKey(this.latest.state) === stateKey(start.state) &&
        this.latest.counter === start.counter;
    return this.track(
      (async () => {
        this.row = await this.api<T>(
          this.options.guided
            ? this.path()
            : "courses/" + this.options.lessonId + "/smart-sessions",
          {
            model: this.options.model,
            platform: this.options.platform,
            courseVersion: this.options.courseVersion,
            ...(this.options.guided
              ? {
                  faces: facelets(start.state),
                  counter: start.counter,
                  ...(this.options.lessonId !== "3-first-solve"
                    ? { lessonId: this.options.lessonId }
                    : {}),
                }
              : {}),
            ...(this.options.alternativeId
              ? { alternativeId: this.options.alternativeId }
              : {}),
          },
        );
        if (this.closed || !same())
          throw Error("The cube changed while starting; synchronize again");
        if (!this.options.guided)
          this.row = await this.api<T>(this.path(this.row.id), {
            action: "confirm",
            version: this.row.version,
            epoch: this.row.smart.epoch,
            faces: facelets(start.state),
            counter: start.counter,
          });
        if (this.closed || !same())
          throw Error("The cube changed while confirming; synchronize again");
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
    if (this.closed || this.finishing || !this.accepted || !this.row) return;
    if (this.flight) {
      await this.flight;
      if (!this.closed && force) return this.flush(true);
      return;
    }
    if (!force && !this.pending.length && this.clock() - this.lastSent < 10000)
      return;
    return this.track(
      (async () => {
        // Send bounded prefixes. Only the last prefix may use an independent
        // device snapshot; intermediate prefix positions are reconstructed.
        do {
          const turns = this.pending.slice(0, 50),
            state = applyMoves(
              this.accepted!,
              turns.map((turn) => turn.move),
            );
          const counter = turns.at(-1)?.counter ?? this.row!.smart.counter;
          const independentState =
            turns.length === this.pending.length &&
            !!this.latest?.verified &&
            stateKey(state) === stateKey(this.latest.state) &&
            counter === this.latest.counter;
          this.row = await this.api<T>(this.path(this.row!.id), {
            action: "turns",
            version: this.row!.version,
            epoch: this.row!.smart.epoch,
            turns,
            faces: facelets(state),
            counter,
            independentState,
          });
          this.accepted = state;
          this.pending.splice(0, turns.length);
          this.lastSent = this.clock();
          this.publish();
        } while (!this.closed && this.pending.length);
      })(),
    );
  }
  async finish() {
    return this.checkpoint(this.options.guided ? "checkpoint" : "finish");
  }
  async continueWithoutCheck() {
    if (!this.options.guided)
      throw Error(
        "Only guided units can continue without an intermediate check",
      );
    await this.flush(true);
    if (
      this.closed ||
      this.flight ||
      !this.row ||
      !this.accepted ||
      !this.latest ||
      this.pending.length ||
      stateKey(this.accepted) !== stateKey(this.latest.state)
    )
      throw Error("Wait for all received turns before continuing");
    return this.track(
      (async () => {
        this.row = await this.api<T>(this.path(this.row!.id), {
          action: "continue",
          version: this.row!.version,
          epoch: this.row!.smart.epoch,
        });
        this.publish();
      })(),
    );
  }
  async replan() {
    if (!this.options.guided)
      throw Error("Only first-solve guidance can be updated");
    return this.checkpoint("replan");
  }
  private async checkpoint(action: "finish" | "checkpoint" | "replan") {
    await this.flush(true);
    if (
      this.closed ||
      this.flight ||
      !this.row ||
      !this.accepted ||
      this.pending.length ||
      !this.latest?.verified ||
      stateKey(this.accepted) !== stateKey(this.latest.state)
    )
      throw Error(
        "Stop turning and request a fresh device position before finishing",
      );
    this.finishing = action === "finish";
    if (this.finishing) clearInterval(this.timer);
    return this.track(
      (async () => {
        this.row = await this.api<T>(this.path(this.row!.id), {
          action,
          version: this.row!.version,
          epoch: this.row!.smart.epoch,
          faces: facelets(this.latest!.state),
          counter: this.latest!.counter,
        });
        if (this.row.status === "COMPLETED") {
          this.finishing = true;
          clearInterval(this.timer);
        }
        this.publish();
      })(),
    );
  }
  close() {
    if (this.closing) return this.closing;
    this.closed = true;
    clearInterval(this.timer);
    this.closing = (async () => {
      await this.flight?.catch(() => {});
      if (this.row)
        try {
          // A timed-out write may have committed. Read this exact epoch before
          // closing it; never guess a revision or operate on a newer connection.
          const latest = await this.api<T>(this.path(this.row.id));
          if (
            latest.smart.epoch === this.row.smart.epoch &&
            ["PREPARING", "PRACTICING"].includes(latest.status)
          )
            await this.api(this.path(latest.id), {
              action: "interrupt",
              version: latest.version,
              epoch: latest.smart.epoch,
            });
        } catch {
          /* The bounded server lease still prevents resuming a lost connection. */
        }
      this.pending = [];
      this.latest = undefined;
      this.accepted = undefined;
    })();
    return this.closing;
  }
}
