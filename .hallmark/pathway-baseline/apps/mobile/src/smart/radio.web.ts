import type { SmartRadio } from "./radio.types";
import type { SmartModel } from "@cubers/core";
export type {
  SmartRadio,
  SmartCandidate,
  SmartConnection,
} from "./radio.types";
export function createSmartRadio(): SmartRadio {
  throw new Error(
    "Bluetooth testing requires an iOS or Android development build",
  );
}
export function createSmartLessonRadio(_model: SmartModel): SmartRadio {
  throw new Error(
    "Smart lessons require an accepted iOS or Android native build",
  );
}
export function createSmartPlayRadio(_model: SmartModel): SmartRadio {
  throw new Error(
    "Smart play requires an accepted iOS or Android native build",
  );
}
