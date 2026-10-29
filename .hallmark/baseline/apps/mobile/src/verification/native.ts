import { Platform, AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { PlayVerificationClient } from "./play-client";
import {
  AppVerificationClient,
  VerificationError,
  type VerificationNative,
} from "./client";
function sdk(): typeof import("@expo/app-integrity") {
  if (Platform.OS !== "ios" && Platform.OS !== "android")
    throw new VerificationError("UNAVAILABLE");
  try {
    return require("@expo/app-integrity");
  } catch {
    throw new VerificationError("UNAVAILABLE");
  }
}
function crypto(): typeof import("expo-crypto") {
  try {
    return require("expo-crypto");
  } catch {
    throw new VerificationError("UNAVAILABLE");
  }
}
const native: VerificationNative = {
  supported: () => {
    try {
      return Platform.OS === "ios" && sdk().isSupported;
    } catch {
      return false;
    }
  },
  generate: () => sdk().generateKeyAsync(),
  attest: (key, clientData) => sdk().attestKeyAsync(key, clientData),
  assert: (key, clientData) => sdk().generateAssertionAsync(key, clientData),
};
export const verificationProvider =
  Platform.OS === "android" ? "google-play" : "apple-app-attest";
const apple = new AppVerificationClient(native, {
  read: (key) =>
    Platform.OS === "ios"
      ? SecureStore.getItemAsync(key)
      : Promise.resolve(null),
  write: async (key, value) => {
    if (Platform.OS !== "ios") {
      if (value === null) return;
      throw new VerificationError("UNAVAILABLE");
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
  },
});
export const appVerification =
  Platform.OS === "android"
    ? new PlayVerificationClient({
        supported: () => {
          try {
            return (
              typeof sdk().prepareIntegrityTokenProviderAsync === "function" &&
              typeof sdk().requestIntegrityCheckAsync === "function" &&
              typeof crypto().digestStringAsync === "function"
            );
          } catch {
            return false;
          }
        },
        prepare: (project) => sdk().prepareIntegrityTokenProviderAsync(project),
        request: (hash) => sdk().requestIntegrityCheckAsync(hash),
        hash: async (input) => {
          const Crypto = crypto();
          return (
            await Crypto.digestStringAsync(
              Crypto.CryptoDigestAlgorithm.SHA256,
              input,
              { encoding: Crypto.CryptoEncoding.BASE64 },
            )
          )
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
        },
      })
    : apple;
appVerification.setActive(AppState.currentState === "active");
