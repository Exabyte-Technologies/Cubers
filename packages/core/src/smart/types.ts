import type { CubeState } from "../puzzle";
export type SmartModel = "gan-356-i3" | "gocube-edge" | "giiker-i3s";
export type SmartMove = {
  move: string;
  deviceCounter?: number;
  deviceElapsedMs?: number | null;
  recovered?: boolean;
};
export type SmartPacket =
  | { type: "state"; state: CubeState; serial?: number; latestMove?: string }
  | {
      type: "moves";
      moves: SmartMove[];
      serial?: number;
      newestFirst?: boolean;
    }
  | { type: "battery"; percent: number }
  | { type: "disconnect" }
  | { type: "info"; name: string; firmware: string };
export type GattChannel = { service: string; characteristic: string };
export type SmartProfile = {
  model: SmartModel;
  name: string;
  namePrefixes: readonly string[];
  state: GattChannel;
  command?: GattChannel;
  battery?: { notify: GattChannel; command: GattChannel };
  deviceCounter: boolean;
  stateInEveryMove: boolean;
};
export interface SmartCodec {
  readonly profile: SmartProfile;
  readonly partial: boolean;
  feed(bytes: Uint8Array, receivedAt: number): SmartPacket[];
  command(kind: "state" | "battery"): Uint8Array;
  battery(bytes: Uint8Array): SmartPacket[];
  reset(): void;
  close(): void;
}
const base = "-0000-1000-8000-00805f9b34fb";
export const SMART_PROFILES: Record<SmartModel, SmartProfile> = {
  "gan-356-i3": {
    model: "gan-356-i3",
    name: "GAN 356 i3",
    namePrefixes: ["GAN"],
    state: {
      service: "6e400001-b5a3-f393-e0a9-e50e24dc4179",
      characteristic: "28be4cb6-cd67-11e9-a32f-2a2ae2dbcce4",
    },
    command: {
      service: "6e400001-b5a3-f393-e0a9-e50e24dc4179",
      characteristic: "28be4a4a-cd67-11e9-a32f-2a2ae2dbcce4",
    },
    deviceCounter: true,
    stateInEveryMove: false,
  },
  "gocube-edge": {
    model: "gocube-edge",
    name: "GoCube Edge",
    namePrefixes: ["GoCube"],
    state: {
      service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
      characteristic: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
    },
    command: {
      service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
      characteristic: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
    },
    deviceCounter: false,
    stateInEveryMove: false,
  },
  "giiker-i3s": {
    model: "giiker-i3s",
    name: "GiiKER i3S",
    namePrefixes: ["GiS"],
    state: { service: "0000aadb" + base, characteristic: "0000aadc" + base },
    battery: {
      notify: { service: "0000aaaa" + base, characteristic: "0000aaab" + base },
      command: {
        service: "0000aaaa" + base,
        characteristic: "0000aaac" + base,
      },
    },
    deviceCounter: false,
    stateInEveryMove: true,
  },
};
