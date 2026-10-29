// GAN Gen2 wire definitions adapted from Andy Fedotov's MIT-licensed reference.
// See NOTICE.ts and docs/SMART-CUBES.md for exact upstream revision and license.
import { ModeOfOperation } from "aes-js";
import { readBits, smartCubies } from "./cubies";
import { SMART_PROFILES, type SmartCodec, type SmartPacket } from "./types";
const KEY = [1, 2, 66, 40, 49, 145, 22, 7, 32, 5, 24, 84, 66, 17, 18, 83];
const IV = [17, 3, 50, 40, 33, 1, 118, 39, 32, 149, 120, 20, 50, 18, 2, 67];
export function ganSalt(address: string) {
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(address))
    throw new Error("Enter the cube's six-byte Bluetooth address");
  return Uint8Array.from(
    address
      .split(":")
      .map((part) => parseInt(part, 16))
      .reverse(),
  );
}
export class GanGen2Codec implements SmartCodec {
  readonly profile = SMART_PROFILES["gan-356-i3"];
  readonly partial = false;
  private key: Uint8Array;
  private iv: Uint8Array;
  private closed = false;
  constructor(address: string) {
    const salt = ganSalt(address);
    this.key = Uint8Array.from(KEY);
    this.iv = Uint8Array.from(IV);
    for (let index = 0; index < 6; index++) {
      this.key[index] = (KEY[index] + salt[index]) % 255;
      this.iv[index] = (IV[index] + salt[index]) % 255;
    }
    salt.fill(0);
  }
  private chunk(bytes: Uint8Array, offset: number, decrypt: boolean) {
    const cipher = new ModeOfOperation.cbc(this.key, this.iv),
      part = bytes.slice(offset, offset + 16);
    bytes.set(decrypt ? cipher.decrypt(part) : cipher.encrypt(part), offset);
  }
  encrypt(bytes: Uint8Array) {
    if (this.closed || bytes.length !== 20)
      throw new Error("GAN Gen2 messages need twenty bytes");
    const result = bytes.slice();
    this.chunk(result, 0, false);
    this.chunk(result, 4, false);
    return result;
  }
  decrypt(bytes: Uint8Array) {
    if (this.closed || bytes.length !== 20)
      throw new Error("GAN Gen2 messages need twenty bytes");
    const result = bytes.slice();
    this.chunk(result, 4, true);
    this.chunk(result, 0, true);
    return result;
  }
  command(kind: "state" | "battery") {
    const bytes = new Uint8Array(20);
    bytes[0] = kind === "state" ? 4 : 9;
    return this.encrypt(bytes);
  }
  feed(bytes: Uint8Array): SmartPacket[] {
    const raw = this.decrypt(bytes),
      bit = (offset: number, length: number) => readBits(raw, offset, length),
      type = bit(0, 4);
    if (type === 4) {
      const cp = Array.from({ length: 7 }, (_, i) => bit(12 + i * 3, 3)),
        co = Array.from({ length: 7 }, (_, i) => bit(33 + i * 2, 2)),
        ep = Array.from({ length: 11 }, (_, i) => bit(47 + i * 4, 4)),
        eo = Array.from({ length: 11 }, (_, i) => bit(91 + i, 1));
      cp.push(28 - cp.reduce((a, b) => a + b, 0));
      co.push((3 - (co.reduce((a, b) => a + b, 0) % 3)) % 3);
      ep.push(66 - ep.reduce((a, b) => a + b, 0));
      eo.push(eo.reduce((a, b) => a ^ b, 0));
      return [
        {
          type: "state",
          state: smartCubies(cp, co, ep, eo),
          serial: bit(4, 8),
        },
      ];
    }
    if (type === 2) {
      const moves = Array.from({ length: 7 }, (_, i) => {
        const face = bit(12 + 5 * i, 4),
          direction = bit(16 + 5 * i, 1),
          elapsed = bit(47 + 16 * i, 16);
        if (face > 5) throw new Error("Invalid GAN move face");
        return {
          move: "URFDLB"[face] + (direction ? "'" : ""),
          deviceElapsedMs: elapsed || null,
        };
      });
      return [{ type: "moves", serial: bit(4, 8), newestFirst: true, moves }];
    }
    if (type === 9) {
      const percent = bit(8, 8);
      if (percent > 100) throw new Error("Invalid GAN battery");
      return [{ type: "battery", percent }];
    }
    if (type === 13) return [{ type: "disconnect" }];
    if (type === 1) return []; // Gyroscope is deliberately not treated as move telemetry.
    if (type === 5) {
      const name = String.fromCharCode(...raw.slice(5, 13)).replace(
        /\0+$/g,
        "",
      );
      if (!/^[\x20-\x7e]{0,8}$/.test(name))
        throw new Error("Invalid GAN hardware response");
      return [{ type: "info", name, firmware: raw[3] + "." + raw[4] }];
    }
    throw new Error("Unsupported GAN Gen2 packet");
  }
  battery(bytes: Uint8Array) {
    return this.feed(bytes);
  }
  reset() {}
  close() {
    this.closed = true;
    this.key.fill(0);
    this.iv.fill(0);
  }
}
