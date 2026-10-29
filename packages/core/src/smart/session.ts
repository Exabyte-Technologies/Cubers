import {
  applyMoves,
  facelets,
  fromFacelets,
  stateKey,
  type CubeState,
} from "../puzzle";
import type { GattChannel, SmartCodec, SmartPacket, SmartMove } from "./types";
export interface SmartTransport {
  has(channel: GattChannel): Promise<boolean>;
  read(channel: GattChannel): Promise<Uint8Array>;
  write(channel: GattChannel, bytes: Uint8Array): Promise<void>;
  subscribe(
    channel: GattChannel,
    onBytes: (bytes: Uint8Array) => void,
    onError: () => void,
  ): Promise<() => void>;
  onDisconnect(callback: () => void): () => void;
  disconnect(): Promise<void>;
}
export type SmartPhase =
  "disconnected" | "syncing" | "confirm" | "ready" | "resync";
export type SmartSessionEvent =
  | { type: "status"; phase: SmartPhase; reason?: string }
  | {
      type: "state";
      state: CubeState;
      verified: boolean;
      deviceCounter?: number;
    }
  | { type: "battery"; percent: number | null }
  | {
      type: "move";
      sequence: number;
      receivedAt: number;
      integrity: "counter" | "state" | "pending-state";
      move: SmartMove;
    };
const clone = (state: CubeState) => fromFacelets(3, facelets(state));
export class SmartCubeSession {
  private state?: CubeState;
  private serial?: number;
  private sequence = 0;
  private phase: SmartPhase = "disconnected";
  private started = false;
  private closed = false;
  private generation = 0;
  private subscriptions: (() => void)[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private partialTimer?: ReturnType<typeof setTimeout>;
  private verificationTimer?: ReturnType<typeof setTimeout>;
  private writes = Promise.resolve();
  private queuedWrites = 0;
  private stateRequested = false;
  private windowStart = 0;
  private packets = 0;
  constructor(
    private transport: SmartTransport,
    readonly codec: SmartCodec,
    private listener: (event: SmartSessionEvent) => void,
    private clock = () =>
      typeof performance === "undefined" ? Date.now() : performance.now(),
    private initialTimeout = 5000,
    private operationTimeout = 5000,
  ) {}
  get status() {
    return this.phase;
  }
  get snapshot() {
    return this.state ? clone(this.state) : null;
  }
  private async wait<T>(task: Promise<T>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Bluetooth operation timed out")),
            this.operationTimeout,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  private async monitor(
    channel: GattChannel,
    onBytes: (bytes: Uint8Array) => void,
    onError: () => void,
  ) {
    const generation = this.generation;
    let discarded = false;
    const task = this.transport
      .subscribe(channel, onBytes, onError)
      .then((cancel) => {
        if (discarded || this.closed || generation !== this.generation) {
          cancel();
          throw new Error("Device session changed");
        }
        return cancel;
      });
    try {
      return await this.wait(task);
    } catch (error) {
      discarded = true;
      void task.then(
        (cancel) => {
          try {
            cancel();
          } catch {}
        },
        () => {},
      );
      throw error;
    }
  }
  private emit(event: SmartSessionEvent) {
    try {
      this.listener(event);
    } catch {}
  }
  private statusChanged(phase: SmartPhase, reason?: string) {
    this.phase = phase;
    this.emit({ type: "status", phase, ...(reason ? { reason } : {}) });
  }
  private stateChanged(verified: boolean) {
    if (this.state)
      this.emit({
        type: "state",
        state: clone(this.state),
        verified,
        ...(this.codec.profile.deviceCounter && this.serial !== undefined
          ? { deviceCounter: this.serial }
          : {}),
      });
  }
  private clearTimers() {
    clearTimeout(this.timer);
    clearTimeout(this.partialTimer);
    clearTimeout(this.verificationTimer);
    this.timer = undefined;
    this.partialTimer = undefined;
    this.verificationTimer = undefined;
  }
  private pause(reason: string) {
    if (this.closed || this.phase === "resync") return;
    this.generation++;
    this.clearTimers();
    this.codec.reset();
    this.state = undefined;
    this.serial = undefined;
    this.stateRequested = false;
    this.statusChanged("resync", reason);
  }
  private async write(channel: GattChannel, bytes: Uint8Array) {
    if (this.closed || this.queuedWrites >= 8)
      throw new Error("Device command queue is unavailable");
    const generation = this.generation;
    this.queuedWrites++;
    const task = this.writes.then(async () => {
      if (this.closed || generation !== this.generation)
        throw new Error("Device session changed");
      await this.wait(this.transport.write(channel, bytes.slice()));
    });
    this.writes = task.catch(() => {});
    try {
      await task;
    } finally {
      this.queuedWrites--;
    }
  }
  async start() {
    if (this.closed || this.started)
      throw new Error("Start a new device session");
    this.started = true;
    const generation = this.generation;
    this.statusChanged("syncing");
    try {
      if (
        !(await this.wait(this.transport.has(this.codec.profile.state))) ||
        (this.codec.profile.command &&
          !(await this.wait(this.transport.has(this.codec.profile.command))))
      )
        throw new Error(
          "The selected model's Bluetooth services are unavailable",
        );
      if (this.closed || generation !== this.generation)
        throw new Error("Device session changed");
      this.subscriptions.push(
        this.transport.onDisconnect(() => {
          void this.close("disconnected");
        }),
      );
      const unsubscribe = await this.monitor(
        this.codec.profile.state,
        (bytes) => this.receive(bytes),
        () => {
          void this.close("transport-error");
        },
      );
      if (this.closed || generation !== this.generation) {
        unsubscribe();
        throw new Error("Device session changed");
      }
      this.subscriptions.push(unsubscribe);
      this.armInitialTimer();
      await this.requestState();
      await this.requestBattery().catch(() => {
        this.emit({ type: "battery", percent: null });
      });
    } catch (error) {
      await this.close("connect-failed");
      throw error;
    }
  }
  private armInitialTimer() {
    clearTimeout(this.timer);
    if (this.phase === "syncing")
      this.timer = setTimeout(
        () => this.pause("initial-state-timeout"),
        this.initialTimeout,
      );
  }
  private async requestState() {
    if (this.closed || this.stateRequested) return;
    const generation = this.generation,
      sequence = this.sequence,
      readyRead = this.phase === "ready";
    this.stateRequested = true;
    try {
      if (this.codec.profile.command)
        await this.write(
          this.codec.profile.command,
          this.codec.command("state"),
        );
      else {
        const value = await this.wait(
          this.transport.read(this.codec.profile.state),
        );
        // A newer notification can arrive before this read completes.
        if (generation !== this.generation || this.closed) return;
        if (
          this.phase === "syncing" ||
          (readyRead && this.phase === "ready" && sequence === this.sequence)
        )
          this.receive(value);
        else this.stateRequested = false;
      }
    } catch (error) {
      if (generation === this.generation) this.stateRequested = false;
      throw error;
    }
  }
  async verifyState() {
    if (this.closed || this.phase !== "ready")
      throw new Error("Confirm the current connection first");
    if (!this.verificationTimer)
      this.verificationTimer = setTimeout(
        () => this.pause("state-verification-timeout"),
        1500,
      );
    await this.requestState();
  }
  async requestBattery() {
    if (this.closed) throw new Error("Device disconnected");
    const battery = this.codec.profile.battery;
    if (battery) {
      if (
        !(await this.wait(this.transport.has(battery.notify))) ||
        !(await this.wait(this.transport.has(battery.command)))
      ) {
        this.emit({ type: "battery", percent: null });
        return;
      }
      // Subscribe once, before the first request.
      if (!this.batterySubscribed && !this.batterySetup) {
        this.batterySetup = this.subscribeBattery(battery.notify).finally(
          () => {
            this.batterySetup = undefined;
          },
        );
      }
      await this.batterySetup;
      await this.write(battery.command, this.codec.command("battery"));
    } else if (this.codec.profile.command)
      await this.write(
        this.codec.profile.command,
        this.codec.command("battery"),
      );
  }
  private async subscribeBattery(channel: GattChannel) {
    const generation = this.generation;
    const cancel = await this.monitor(
      channel,
      (bytes) => {
        if (this.closed) return;
        try {
          for (const packet of this.codec.battery(bytes))
            if (packet.type === "battery")
              this.emit({ type: "battery", percent: packet.percent });
        } catch {
          this.emit({ type: "battery", percent: null });
        }
      },
      () => {
        if (!this.closed) this.emit({ type: "battery", percent: null });
      },
    );
    if (this.closed || generation !== this.generation) {
      cancel();
      return;
    }
    this.subscriptions.push(cancel);
    this.batterySubscribed = true;
  }
  private batterySetup?: Promise<void>;
  private batterySubscribed = false;
  confirm(actual?: CubeState) {
    if (this.closed || this.phase !== "confirm" || !this.state)
      throw new Error("Wait for a fresh device position");
    if (
      actual &&
      (actual.size !== 3 || stateKey(actual) !== stateKey(this.state))
    )
      throw new Error("The device position does not match the physical scan");
    this.statusChanged("ready");
    this.stateChanged(true);
  }
  async resync() {
    if (this.closed || this.phase !== "resync")
      throw new Error("Reconnect or wait for the current synchronization");
    this.generation++;
    this.clearTimers();
    this.codec.reset();
    this.state = undefined;
    this.serial = undefined;
    this.stateRequested = false;
    this.statusChanged("syncing");
    try {
      this.armInitialTimer();
      await this.requestState();
    } catch (error) {
      await this.close("transport-error");
      throw error;
    }
  }
  private receive(bytes: Uint8Array) {
    if (this.closed) return;
    const now = this.clock();
    if (!Number.isFinite(now) || now < 0) {
      this.pause("invalid-clock");
      return;
    }
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.packets = 0;
    }
    if (++this.packets > 300) {
      this.pause("notification-limit");
      return;
    }
    try {
      const packets = this.codec.feed(bytes.slice(), now);
      clearTimeout(this.partialTimer);
      if (this.codec.partial)
        this.partialTimer = setTimeout(
          () => this.pause("incomplete-frame"),
          1000,
        );
      for (const packet of packets) {
        if (this.closed) break;
        this.handle(packet, now);
      }
    } catch {
      this.pause("invalid-packet");
    }
  }
  private handle(packet: SmartPacket, now: number) {
    if (packet.type === "disconnect") {
      void this.close("disconnected");
      return;
    }
    if (packet.type === "battery") {
      this.emit({ type: "battery", percent: packet.percent });
      return;
    }
    if (packet.type === "info" || this.phase === "resync") return;
    if (packet.type === "state") {
      this.stateRequested = false;
      clearTimeout(this.timer);
      clearTimeout(this.verificationTimer);
      this.verificationTimer = undefined;
      if (this.phase === "syncing" || this.phase === "confirm") {
        this.state = clone(packet.state);
        this.serial = packet.serial;
        this.statusChanged("confirm");
        this.stateChanged(false);
        return;
      }
      if (!this.state || this.phase !== "ready") return;
      if (
        this.codec.profile.stateInEveryMove &&
        stateKey(packet.state) !== stateKey(this.state)
      ) {
        if (
          !packet.latestMove ||
          stateKey(applyMoves(this.state, [packet.latestMove])) !==
            stateKey(packet.state)
        ) {
          this.pause("state-mismatch");
          return;
        }
        this.state = clone(packet.state);
        this.emit({
          type: "move",
          sequence: this.sequence++,
          receivedAt: now,
          integrity: "state",
          move: { move: packet.latestMove },
        });
      } else if (
        stateKey(packet.state) !== stateKey(this.state) ||
        (this.codec.profile.deviceCounter && packet.serial !== this.serial)
      ) {
        this.pause("state-mismatch");
        return;
      }
      this.stateChanged(true);
      return;
    }
    if (!this.state || !["ready", "confirm"].includes(this.phase)) return;
    let moves = packet.moves;
    if (this.codec.profile.deviceCounter) {
      if (packet.serial === undefined || this.serial === undefined) {
        this.pause("missing-counter");
        return;
      }
      const difference = (packet.serial - this.serial) & 255;
      if (!difference) return;
      if (difference > 7 || difference > packet.moves.length) {
        this.pause("move-gap");
        return;
      }
      moves = packet.moves
        .slice(0, difference)
        .reverse()
        .map((move, index) => ({
          ...move,
          deviceCounter: (this.serial! + index + 1) & 255,
          recovered: index < difference - 1,
        }));
      this.serial = packet.serial;
    }
    for (const move of moves) {
      this.state = applyMoves(this.state, [move.move]);
      if (this.phase === "ready")
        this.emit({
          type: "move",
          sequence: this.sequence++,
          receivedAt: now,
          integrity: this.codec.profile.deviceCounter
            ? "counter"
            : "pending-state",
          move,
        });
    }
    this.stateChanged(false);
    if (!this.codec.profile.deviceCounter) {
      if (!this.verificationTimer)
        this.verificationTimer = setTimeout(
          () => this.pause("state-verification-timeout"),
          1500,
        );
      const generation = this.generation;
      void this.requestState().catch(() => {
        if (generation === this.generation) this.pause("state-request-failed");
      });
    }
  }
  async close(reason?: string) {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    this.clearTimers();
    this.state = undefined;
    this.serial = undefined;
    for (const cancel of this.subscriptions.splice(0)) {
      try {
        cancel();
      } catch {}
    }
    this.codec.close();
    this.statusChanged("disconnected", reason);
    await this.wait(this.transport.disconnect()).catch(() => {});
  }
}
