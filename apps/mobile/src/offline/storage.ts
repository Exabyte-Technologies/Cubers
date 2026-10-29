import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { OfflineLibrary, type OfflineContext } from "./library";
const file = () => new File(Paths.cache, "cubers-lessons-v1.json");
const bindingKey = "cubers-download-binding";
export const offlineLibrary = new OfflineLibrary({
  async read() {
    const f = file();
    if (!f.exists) return null;
    if (f.size > 2_000_000) {
      f.delete();
      return null;
    }
    return f.text();
  },
  async write(value) {
    file().write(value);
  },
  async binding() {
    try {
      return JSON.parse(
        (await SecureStore.getItemAsync(bindingKey)) || "null",
      ) as OfflineContext | null;
    } catch {
      return null;
    }
  },
  async bind(value) {
    await SecureStore.setItemAsync(bindingKey, JSON.stringify(value));
  },
  async clear() {
    const f = file();
    if (f.exists) f.delete();
    await SecureStore.deleteItemAsync(bindingKey);
  },
});
