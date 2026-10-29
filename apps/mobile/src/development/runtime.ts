import type { CommunityEndpoints } from "../community-routing";

export type DevelopmentSettings = {
  version: 1;
  endpoints: { INTL: string; CN: string; discovery: string };
  timeoutMs: number;
  latencyMs: number;
  offline: boolean;
};
export type RequestDiagnostic = {
  method: string;
  category: string;
  outcome: "response" | "failed" | "cancelled";
  status?: number;
  durationMs: number;
};
export function developmentStorageKey(key: string, enabled: boolean) {
  return enabled ? "cubers-development." + key : key;
}
function origin(value: unknown) {
  if (typeof value !== "string" || value.trim().length > 300)
    throw new Error("Enter a server origin of at most 300 characters.");
  const url = new URL(value.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    throw new Error(
      "Use an HTTP or HTTPS origin without a path, credentials or query.",
    );
  return url.origin;
}
export function validateDevelopmentSettings(
  value: unknown,
): DevelopmentSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid development settings.");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) =>
        !["version", "endpoints", "timeoutMs", "latencyMs", "offline"].includes(
          k,
        ),
    ) ||
    v.version !== 1
  )
    throw new Error("Unsupported development settings.");
  if (
    !v.endpoints ||
    typeof v.endpoints !== "object" ||
    Array.isArray(v.endpoints)
  )
    throw new Error("Configure all three server addresses.");
  const e = v.endpoints as Record<string, unknown>;
  if (Object.keys(e).some((k) => !["INTL", "CN", "discovery"].includes(k)))
    throw new Error("Unexpected server address field.");
  if (
    !Number.isInteger(v.timeoutMs) ||
    Number(v.timeoutMs) < 500 ||
    Number(v.timeoutMs) > 60000 ||
    !Number.isInteger(v.latencyMs) ||
    Number(v.latencyMs) < 0 ||
    Number(v.latencyMs) > 10000 ||
    typeof v.offline !== "boolean"
  )
    throw new Error("Use a 500–60000 ms timeout and 0–10000 ms latency.");
  return {
    version: 1,
    endpoints: {
      INTL: origin(e.INTL),
      CN: origin(e.CN),
      discovery: origin(e.discovery),
    },
    timeoutMs: Number(v.timeoutMs),
    latencyMs: Number(v.latencyMs),
    offline: v.offline,
  };
}
export function defaultDevelopmentSettings(
  endpoints: CommunityEndpoints,
): DevelopmentSettings {
  return validateDevelopmentSettings({
    version: 1,
    endpoints: {
      INTL: endpoints.INTL || "http://localhost:3000",
      CN: endpoints.CN || "http://localhost:3000",
      discovery:
        endpoints.discovery || endpoints.INTL || "http://localhost:3000",
    },
    timeoutMs: 15000,
    latencyMs: 0,
    offline: false,
  });
}
export function sameDevelopmentServers(
  a: DevelopmentSettings,
  b: DevelopmentSettings,
) {
  return ["INTL", "CN", "discovery"].every(
    (k) =>
      a.endpoints[k as keyof typeof a.endpoints] ===
      b.endpoints[k as keyof typeof b.endpoints],
  );
}
export function createDevelopmentRuntime(
  enabled: boolean,
  initial: DevelopmentSettings,
  fetcher: typeof fetch = fetch,
) {
  let settings = validateDevelopmentSettings(initial),
    locked = false;
  const pending = new Set<AbortController>(),
    listeners = new Set<() => void>();
  const diagnostics: RequestDiagnostic[] = [];
  const emit = () => listeners.forEach((listener) => listener());
  const cancel = () => {
    for (const controller of pending) controller.abort();
  };
  return {
    enabled,
    get settings() {
      return { ...settings, endpoints: { ...settings.endpoints } };
    },
    get locked() {
      return locked;
    },
    get diagnostics() {
      return diagnostics.map((row) => ({ ...row }));
    },
    get pendingRequests() {
      return pending.size;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    configure(value: DevelopmentSettings) {
      if (!enabled || locked)
        throw new Error("Development configuration is unavailable.");
      const next = validateDevelopmentSettings(value);
      cancel();
      settings = next;
      emit();
    },
    lock() {
      if (!enabled)
        throw new Error("Development configuration is unavailable.");
      locked = true;
      cancel();
      emit();
    },
    unlock() {
      if (!enabled) return;
      locked = false;
      emit();
    },
    clearDiagnostics() {
      if (enabled) {
        diagnostics.length = 0;
        emit();
      }
    },
    fetch: (enabled
      ? async (input: RequestInfo | URL, init?: RequestInit) => {
          if (locked)
            throw new Error(
              "Development servers are changing. Reload to continue.",
            );
          const captured = settings,
            controller = new AbortController(),
            started = Date.now();
          const category = (() => {
            try {
              const name = /^\/v1\/([a-z-]+)(?:\/|$)/.exec(
                new URL(String(input)).pathname,
              )?.[1];
              return name &&
                [
                  "auth",
                  "me",
                  "courses",
                  "legal",
                  "community-region",
                  "health",
                  "devices",
                  "tutor",
                  "guided",
                  "rooms",
                  "posts",
                  "media",
                  "clubs",
                  "competitions",
                  "rankings",
                  "progress",
                  "assessments",
                  "learning-plan",
                  "notifications",
                  "admin",
                  "invitation",
                  "replay-shares",
                  "profiles",
                  "connections",
                  "guardian",
                  "announcements",
                ].includes(name)
                ? name
                : "request";
            } catch {
              return "request";
            }
          })();
          const row: RequestDiagnostic = {
            method: [
              "GET",
              "POST",
              "PUT",
              "DELETE",
              "PATCH",
              "HEAD",
              "OPTIONS",
            ].includes(init?.method || "GET")
              ? init?.method || "GET"
              : "REQUEST",
            category,
            outcome: "failed",
            durationMs: 0,
          };
          let timer: ReturnType<typeof setTimeout> | undefined,
            latency: ReturnType<typeof setTimeout> | undefined;
          const external = init?.signal;
          const abort = () => controller.abort();
          external?.addEventListener("abort", abort, { once: true });
          if (external?.aborted) controller.abort();
          pending.add(controller);
          try {
            const aborted = new Promise<never>((_, reject) => {
              controller.signal.addEventListener(
                "abort",
                () =>
                  reject(
                    new Error("Development request cancelled or timed out."),
                  ),
                { once: true },
              );
            });
            timer = setTimeout(abort, captured.timeoutMs);
            const request = async () => {
              if (controller.signal.aborted)
                throw new Error("Development request cancelled.");
              if (captured.offline)
                throw new Error("Development offline simulation.");
              if (captured.latencyMs)
                await new Promise<void>((resolve) => {
                  latency = setTimeout(resolve, captured.latencyMs);
                });
              if (controller.signal.aborted)
                throw new Error("Development request cancelled.");
              const response = await fetcher(input, {
                ...init,
                signal: controller.signal,
              });
              if (controller.signal.aborted || captured !== settings || locked)
                throw new Error("Development request became stale.");
              return response;
            };
            const response = await Promise.race([request(), aborted]);
            row.outcome = "response";
            row.status = response.status;
            return response;
          } catch (error) {
            if (controller.signal.aborted) row.outcome = "cancelled";
            throw error;
          } finally {
            clearTimeout(timer);
            clearTimeout(latency);
            external?.removeEventListener("abort", abort);
            pending.delete(controller);
            row.durationMs = Math.max(0, Date.now() - started);
            diagnostics.push(row);
            if (diagnostics.length > 100) diagnostics.shift();
            emit();
          }
        }
      : fetcher) as typeof fetch,
  };
}
