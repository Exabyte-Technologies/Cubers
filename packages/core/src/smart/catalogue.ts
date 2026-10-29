import { SMART_PROFILES, type SmartModel } from "./types";
export type SmartDeviceAvailability = {
  id: SmartModel;
  name: string;
  puzzle: "3x3";
  adapter: "implemented-unverified";
  enabled: boolean;
  physicallyTested: boolean;
  learningEnabled: boolean;
  learningPlatforms: ("ios" | "android")[];
  playEnabled: boolean;
  playPlatforms: ("ios" | "android")[];
  hardwareMoveCounter: boolean;
  stateInEveryMove: boolean;
};
// A database setting is not evidence of a hardware test. Activation requires a
// separate reviewed evidence workflow and server-side telemetry integration.
export function smartDeviceCatalogue(): SmartDeviceAvailability[] {
  return Object.values(SMART_PROFILES).map((profile) => ({
    id: profile.model,
    name: profile.name,
    puzzle: "3x3",
    adapter: "implemented-unverified",
    enabled: false,
    physicallyTested: false,
    learningEnabled: false,
    learningPlatforms: [],
    playEnabled: false,
    playPlatforms: [],
    hardwareMoveCounter: profile.deviceCounter,
    stateInEveryMove: profile.stateInEveryMove,
  }));
}
