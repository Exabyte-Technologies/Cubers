type Point = { x: number; y: number };
/** Tracks one pointer gesture independently of touch-event sampling frequency. */
export class PuzzleGesture {
  private active?: {
    start: Point;
    delta: Point;
    maximum: number;
    multiple: boolean;
  };
  begin(x: number, y: number, touches = 1) {
    this.cancel();
    if (!Number.isFinite(x) || !Number.isFinite(y) || touches !== 1) return;
    this.active = {
      start: { x, y },
      delta: { x: 0, y: 0 },
      maximum: 0,
      multiple: false,
    };
  }
  observeTouches(touches: number) {
    if (
      this.active &&
      (!Number.isInteger(touches) || touches > 1 || touches < 0)
    )
      this.active.multiple = true;
  }
  move(x: number, y: number, touches = 1): Point | undefined {
    this.observeTouches(touches);
    const active = this.active;
    if (!active) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      this.cancel();
      return;
    }
    active.maximum = Math.max(active.maximum, Math.abs(x) + Math.abs(y));
    const delta = { x: x - active.delta.x, y: y - active.delta.y };
    active.delta = { x, y };
    return active.multiple ? undefined : delta;
  }
  finish(x: number, y: number): Point | undefined {
    this.move(x, y, 0);
    const active = this.active;
    this.cancel();
    return active && !active.multiple && active.maximum < 8
      ? active.start
      : undefined;
  }
  cancel() {
    this.active = undefined;
  }
}
