// GoCube UART mappings adapted from Pau Oliva/Andy Fedotov's MIT reference.
import { smartFacelets } from "./cubies";
import { SMART_PROFILES, type SmartCodec, type SmartPacket } from "./types";
const AXIS = [5, 2, 0, 3, 1, 4],
  RING = [0, 1, 2, 5, 8, 7, 6, 3],
  OFFSET = [0, 0, 6, 2, 0, 0];
export class GoCubeCodec implements SmartCodec {
  readonly profile = SMART_PROFILES["gocube-edge"];
  private buffer = new Uint8Array();
  private started = 0;
  private closed = false;
  get partial() {
    return this.buffer.length > 0;
  }
  command(kind: "state" | "battery") {
    if (this.closed) throw new Error("Device decoder closed");
    return Uint8Array.of(kind === "state" ? 51 : 50);
  }
  feed(bytes: Uint8Array, receivedAt: number): SmartPacket[] {
    if (
      this.closed ||
      !bytes.length ||
      bytes.length > 260 ||
      this.buffer.length + bytes.length > 520
    )
      throw new Error("Invalid GoCube notification size");
    if (this.buffer.length && receivedAt - this.started > 1000)
      throw new Error("Incomplete GoCube frame expired");
    if (!this.buffer.length) this.started = receivedAt;
    const joined = new Uint8Array(this.buffer.length + bytes.length);
    joined.set(this.buffer);
    joined.set(bytes, this.buffer.length);
    this.buffer = joined;
    const events: SmartPacket[] = [];
    while (this.buffer.length >= 2) {
      const length = this.buffer[1] + 2;
      if (this.buffer[0] !== 42 || length < 7 || length > 257)
        throw new Error("Invalid GoCube frame header");
      if (this.buffer.length < length) break;
      const frame = this.buffer.slice(0, length);
      this.buffer = this.buffer.slice(length);
      if (
        frame[length - 2] !== 13 ||
        frame[length - 1] !== 10 ||
        (frame.slice(0, -3).reduce((sum, value) => sum + value, 0) & 255) !==
          frame[length - 3]
      )
        throw new Error("Invalid GoCube frame checksum");
      const type = frame[2],
        payload = frame.slice(3, -3);
      if (type === 2) {
        if (payload.length !== 54 || payload.some((color) => color > 5))
          throw new Error("Invalid GoCube facelets");
        const faces = Array<string>(54);
        for (let wire = 0; wire < 6; wire++) {
          const start = AXIS[wire] * 9;
          faces[start + 4] = "BFUDRL"[payload[wire * 9]];
          for (let ring = 0; ring < 8; ring++)
            faces[start + RING[(ring + OFFSET[wire]) % 8]] = "BFUDRL"[
              payload[wire * 9 + ring + 1]
            ];
        }
        events.push({ type: "state", state: smartFacelets(faces) });
      } else if (type === 1) {
        if (!payload.length || payload.length % 2 || payload.length > 64)
          throw new Error(
            "Incomplete GoCube move frame; request a fresh state",
          );
        const moves = [];
        for (let at = 0; at < payload.length; at += 2) {
          const face = AXIS[payload[at] >> 1];
          if (face === undefined) throw new Error("Invalid GoCube move face");
          moves.push({ move: "URFDLB"[face] + (payload[at] & 1 ? "'" : "") });
        }
        events.push({ type: "moves", moves });
      } else if (type === 5) {
        if (payload.length !== 1 || payload[0] > 100)
          throw new Error("Invalid GoCube battery response");
        events.push({ type: "battery", percent: payload[0] });
      } else if (type !== 3) throw new Error("Unsupported GoCube message");
      // Orientation frames are not move telemetry; no IMU command is sent.
    }
    return events;
  }
  battery(bytes: Uint8Array) {
    return this.feed(bytes, 0);
  }
  reset() {
    this.buffer = new Uint8Array();
    this.started = 0;
  }
  close() {
    this.closed = true;
    this.reset();
  }
}
