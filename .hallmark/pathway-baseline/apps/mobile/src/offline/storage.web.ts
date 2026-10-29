import { OfflineLibrary, type OfflineContext } from "./library";
// Browser downloads live only in this tab's session, matching web credentials.
export const offlineLibrary = new OfflineLibrary({
  async read() {
    return sessionStorage.getItem("cubers-downloads");
  },
  async write(value) {
    sessionStorage.setItem("cubers-downloads", value);
  },
  async binding() {
    try {
      return JSON.parse(
        sessionStorage.getItem("cubers-download-binding") || "null",
      ) as OfflineContext | null;
    } catch {
      return null;
    }
  },
  async bind(value) {
    sessionStorage.setItem("cubers-download-binding", JSON.stringify(value));
  },
  async clear() {
    sessionStorage.removeItem("cubers-downloads");
    sessionStorage.removeItem("cubers-download-binding");
  },
});
