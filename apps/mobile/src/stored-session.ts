import type { Locale, Region } from "@cubers/core";

export class SessionStorageUnavailable extends Error {
  constructor() {
    super("Saved sign-in storage is unavailable");
    this.name = "SessionStorageUnavailable";
  }
}

/** A failed/late read must never become a signed-out snapshot or erase a key. */
export async function readStoredSession(
  read: (key: string) => Promise<string | null>,
  milliseconds = 8000,
): Promise<{ locale?: Locale; region: Region; token: string | null }> {
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const get = async (key: string) => {
    if (expired) throw new SessionStorageUnavailable();
    const value = await read(key);
    if (expired) throw new SessionStorageUnavailable();
    return value;
  };
  const snapshot = (async () => {
    const savedLocale = await get("cubers-locale");
    const savedRegion = await get("cubers-region");
    const region = savedRegion === "CN" ? "CN" : "INTL";
    const token = await get("cubers-token-" + region);
    return {
      locale:
        savedLocale === "en" || savedLocale === "zh" ? savedLocale : undefined,
      region,
      token: token || null,
    } as { locale?: Locale; region: Region; token: string | null };
  })();
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(new SessionStorageUnavailable());
    }, milliseconds);
  });
  try {
    return await Promise.race([snapshot, deadline]);
  } catch {
    // Do not expose platform errors, key names or stored values in the UI.
    throw new SessionStorageUnavailable();
  } finally {
    clearTimeout(timer);
  }
}
