// GiiKER wire mappings adapted from Pau Oliva/Andy Fedotov's MIT reference.
import { GIIKER_CORNERS, GIIKER_EDGES, smartCubies } from "./cubies";
import { SMART_PROFILES, type SmartCodec, type SmartPacket } from "./types";
const KEY = [
  176, 81, 104, 224, 86, 137, 237, 119, 38, 26, 193, 161, 210, 126, 150, 81, 93,
  13, 236, 249, 89, 235, 88, 24, 113, 81, 214, 131, 130, 199, 2, 169, 39, 165,
  171, 41,
];
const MASK = [-1, 1, -1, 1, 1, -1, 1, -1];
export class GiikerCodec implements SmartCodec {
  readonly profile = SMART_PROFILES["giiker-i3s"];
  readonly partial = false;
  private closed = false;
  command(kind: "state" | "battery") {
    if (this.closed || kind !== "battery")
      throw new Error("GiiKER state must be read from its data characteristic");
    return Uint8Array.of(0xb5);
  }
  feed(bytes: Uint8Array): SmartPacket[] {
    if (this.closed || bytes.length !== 20)
      throw new Error("GiiKER messages need twenty bytes");
    const raw = bytes.slice();
    if (raw[18] === 0xa7)
      for (let at = 0; at < 18; at++)
        raw[at] =
          (raw[at] + KEY[at + (raw[19] >> 4)] + KEY[at + (raw[19] & 15)]) & 255;
    const nibbles = Array.from(raw.slice(0, 18)).flatMap((value) => [
      value >> 4,
      value & 15,
    ]);
    const cp = nibbles.slice(0, 8).map((value) => value - 1),
      rawCo = nibbles.slice(8, 16);
    if (rawCo.some((value) => value > 2))
      throw new Error("Invalid GiiKER corner orientation");
    const co = rawCo.map((value, index) => (3 + value * MASK[index]) % 3),
      ep = nibbles.slice(16, 28).map((value) => value - 1),
      eo = nibbles
        .slice(28, 31)
        .flatMap((value) => [8, 4, 2, 1].map((mask) => (value & mask ? 1 : 0)));
    const face = "?BDLURF"[nibbles[32]],
      direction = nibbles[33],
      latestMove =
        face && face !== "?" && [1, 2, 3, 9].includes(direction)
          ? face +
            (direction === 2
              ? "2"
              : direction === 3 || direction === 9
                ? "'"
                : "")
          : undefined;
    return [
      {
        type: "state",
        state: smartCubies(cp, co, ep, eo, GIIKER_CORNERS, GIIKER_EDGES),
        ...(latestMove ? { latestMove } : {}),
      },
    ];
  }
  battery(bytes: Uint8Array): SmartPacket[] {
    if (
      this.closed ||
      bytes.length !== 2 ||
      bytes[0] !== 0xb5 ||
      bytes[1] > 100
    )
      throw new Error("Invalid GiiKER battery response");
    return [{ type: "battery", percent: bytes[1] }];
  }
  reset() {}
  close() {
    this.closed = true;
  }
}
