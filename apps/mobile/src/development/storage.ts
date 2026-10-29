import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { DEVELOPMENT_BUILD } from "./config";
import {
  developmentStorageKey,
  validateDevelopmentSettings,
  type DevelopmentSettings,
} from "./runtime";
const key = "cubers-development-settings-v1";
const file = () => {
  if (!FileSystem.documentDirectory)
    throw new Error("Development settings storage is unavailable.");
  return FileSystem.documentDirectory + key + ".json";
};
export async function readDevelopmentSettings() {
  if (!DEVELOPMENT_BUILD) throw new Error("Development tools are unavailable.");
  let raw: string | null;
  if (Platform.OS === "web") raw = localStorage.getItem(key);
  else
    raw = (await FileSystem.getInfoAsync(file())).exists
      ? await FileSystem.readAsStringAsync(file())
      : null;
  return raw === null ? null : validateDevelopmentSettings(JSON.parse(raw));
}
export async function saveDevelopmentSettings(settings: DevelopmentSettings) {
  if (!DEVELOPMENT_BUILD) throw new Error("Development tools are unavailable.");
  const raw = JSON.stringify(validateDevelopmentSettings(settings));
  if (Platform.OS === "web") localStorage.setItem(key, raw);
  else await FileSystem.writeAsStringAsync(file(), raw);
}
export async function clearDevelopmentTokens() {
  if (!DEVELOPMENT_BUILD) throw new Error("Development tools are unavailable.");
  for (const region of ["CN", "INTL"]) {
    const tokenKey = developmentStorageKey("cubers-token-" + region, true);
    if (Platform.OS === "web") sessionStorage.removeItem(tokenKey);
    else await SecureStore.deleteItemAsync(tokenKey);
  }
}
