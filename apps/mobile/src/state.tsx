import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { Platform, AppState as Lifecycle } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { Locale, Region, CommunityDetection } from "@cubers/core";
import {
  serviceError,
  serviceConnectionError,
  readServicePayload,
  localizeServiceSuccess,
} from "@cubers/core";
import { withTimeout } from "./timeout";
import { offlineLibrary } from "./offline/storage";
import { practiceReminders } from "./reminders/native";
import { cardFileShares } from "./cards/native";
import { orderedWriter } from "./ordered-storage";
import { sessionRequest } from "./session-request";
import { appVerification } from "./verification/native";
import { readStoredSession } from "./stored-session";
import {
  DEVELOPMENT_BUILD,
  appEndpoints,
  developmentRuntime,
} from "./development/config";
import { developmentStorageKey } from "./development/runtime";
type User = {
  id: string;
  displayName: string;
  bio: string;
  privateProfile: boolean;
  role: string;
  region: Region;
  ageBand: string;
  guardianEligible: boolean;
  permissions: {
    canPost: boolean;
    canChat: boolean;
    canRecord: boolean;
    canSeeSponsors: boolean;
    canLearn: boolean;
    needsPostApproval: boolean;
  };
  notifications: { id: string; title: string; body: string }[];
};
const read = async (k: string) =>
  Platform.OS === "web"
    ? sessionStorage.getItem(developmentStorageKey(k, DEVELOPMENT_BUILD))
    : SecureStore.getItemAsync(developmentStorageKey(k, DEVELOPMENT_BUILD));
const write = orderedWriter(async (k: string, v: string | null) => {
  k = developmentStorageKey(k, DEVELOPMENT_BUILD);
  if (Platform.OS === "web") {
    if (v === null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } else if (v === null) await SecureStore.deleteItemAsync(k);
  else await SecureStore.setItemAsync(k, v);
});
import { detectCommunity, communityEndpoint } from "./community-routing";
type Context = {
  locale: Locale;
  region: Region;
  user: User | null;
  token: string | null;
  loading: boolean;
  storageUnavailable: boolean;
  retrySessionRestore: () => void;
  offline: boolean;
  regionReady: boolean;
  regionError: string;
  detection: CommunityDetection | null;
  detectRegion: () => Promise<boolean>;
  api: <T = any>(path: string, body?: unknown, method?: string) => Promise<T>;
  authApi: (
    community: Region,
    path: "auth/login" | "auth/register" | "auth/forgot" | "auth/resend",
    body: unknown,
  ) => Promise<any>;
  authLinkApi: (
    community: Region,
    path: "auth/verify" | "auth/reset" | "auth/forgot" | "auth/resend",
    body: unknown,
  ) => Promise<any>;
  deletionApi: (
    community: Region,
    path: "auth/deletion-login" | "me" | "auth/logout",
    body: unknown,
    accessToken?: string,
  ) => Promise<any>;
  signin: (token: string, community?: Region) => Promise<void>;
  signout: () => Promise<void>;
  resetDevelopmentSession?: () => Promise<void>;
  setLocale: (l: Locale) => void;
  reload: () => Promise<void>;
  t: (en: string, zh: string) => string;
};
const State = createContext<Context>(null!);
export function AppState({ children }: { children: React.ReactNode }) {
  const [locale, setLang] = useState<Locale>("en"),
    [region, setReg] = useState<Region>(
      process.env.EXPO_PUBLIC_REGION === "CN" ? "CN" : "INTL",
    ),
    [token, setToken] = useState<string | null>(null),
    [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [storageUnavailable, setStorageUnavailable] = useState(false),
    [restoreRevision, setRestoreRevision] = useState(0),
    [offline, setOffline] = useState(false),
    [detection, setDetection] = useState<CommunityDetection | null>(null),
    [regionError, setRegionError] = useState("");
  const regionRef = useRef<Region>(region);
  const tokenRef = useRef<string | null>(null);
  const setSessionToken = useCallback((value: string | null) => {
    appVerification.setContext(null);
    cardFileShares.setContext(null);
    tokenRef.current = value;
    setToken(value);
  }, []);
  const pendingDetection = useRef<Promise<CommunityDetection> | null>(null);
  const resolveRegion = useCallback(async () => {
    if (!pendingDetection.current)
      pendingDetection.current = detectCommunity(
        appEndpoints(),
        __DEV__ || DEVELOPMENT_BUILD,
        DEVELOPMENT_BUILD ? developmentRuntime.fetch : fetch,
        DEVELOPMENT_BUILD ? developmentRuntime.settings.timeoutMs : 15000,
      );
    try {
      return await pendingDetection.current;
    } finally {
      pendingDetection.current = null;
    }
  }, []);
  const applyDetection = useCallback(
    async (detected: CommunityDetection, persist = true) => {
      if (tokenRef.current) return regionRef.current === detected.region;
      const same = regionRef.current === detected.region;
      regionRef.current = detected.region;
      setReg(detected.region);
      setDetection(detected);
      setRegionError("");
      if (persist) await write("cubers-region", detected.region);
      return same;
    },
    [],
  );
  const detectRegion = useCallback(async () => {
    // Sessions never migrate accounts; every business request is also checked
    // against the current connection by the server.
    if (tokenRef.current) return true;
    try {
      const detected = await resolveRegion();
      if (tokenRef.current) return true;
      // Recovery email and legal information remain available when saved
      // credentials cannot be read. No account token is restored this way.
      return await applyDetection(detected, !storageUnavailable);
    } catch {
      setDetection(null);
      const message =
        locale === "zh"
          ? "暂时无法确定社区，请检查网络后重试。"
          : "Could not determine your community. Check your connection and retry.";
      setRegionError(message);
      throw new Error(message);
    }
  }, [token, locale, storageUnavailable, applyDetection, resolveRegion]);
  const requestApi = useCallback(
    async <T,>(
      community: Region,
      path: string,
      body?: unknown,
      method?: string,
      accessToken?: string | null,
    ): Promise<T> => {
      if (DEVELOPMENT_BUILD && developmentRuntime.locked)
        throw new Error(
          "Development servers are changing. Reload to continue.",
        );
      let base: string;
      try {
        base = communityEndpoint(
          appEndpoints(),
          community,
          __DEV__ || DEVELOPMENT_BUILD,
        );
      } catch {
        throw serviceError(503, null, locale);
      }
      const requestMethod = method || (body === undefined ? "GET" : "POST");
      let response: Response, data: any;
      try {
        ({ response, data } = await withTimeout(
          async (signal) => {
            const transport = DEVELOPMENT_BUILD
              ? developmentRuntime.fetch
              : fetch;
            const response = await transport(base + "/v1/" + path, {
              method: requestMethod,
              credentials: "omit",
              redirect: "error",
              headers: {
                "Content-Type": "application/json",
                ...(accessToken
                  ? { Authorization: "Bearer " + accessToken }
                  : {}),
              },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
              signal,
            });
            return { response, data: await readServicePayload(response) };
          },
          DEVELOPMENT_BUILD ? developmentRuntime.settings.timeoutMs : 15000,
        ));
        if (DEVELOPMENT_BUILD && developmentRuntime.locked)
          throw new Error("Development connection changed.");
        setOffline(false);
      } catch {
        setOffline(true);
        throw serviceConnectionError(locale);
      }
      if (!response.ok) {
        if (
          accessToken &&
          tokenRef.current === accessToken &&
          regionRef.current === community &&
          response.status === 409 &&
          data?.code === "COMMUNITY_CHANGED"
        ) {
          offlineLibrary.setContext(null);
          practiceReminders.setContext(null);
          setSessionToken(null);
          setUser(null);
          setDetection(null);
          await Promise.all([
            practiceReminders.reset().catch(() => {}),
            offlineLibrary.clear().catch(() => {}),
            cardFileShares.reset().catch(() => {}),
            write("cubers-token-" + community, null),
          ]);
          void resolveRegion()
            .then(applyDetection)
            .catch(() =>
              setRegionError(
                locale === "zh"
                  ? "请重试社区检测。"
                  : "Retry community detection.",
              ),
            );
        }
        if (
          accessToken &&
          tokenRef.current === accessToken &&
          regionRef.current === community &&
          (response.status === 401 ||
            (response.status === 403 &&
              /^(courses|course-download-manifest|progress|tutor|assessments|learning-plan|guided)/.test(
                path,
              )))
        ) {
          offlineLibrary.setContext(null);
          await offlineLibrary.clear().catch(() => {});
          if (
            tokenRef.current === accessToken &&
            regionRef.current === community
          )
            await practiceReminders.reset().catch(() => {});
        }
        throw serviceError(response.status, data, locale);
      }
      if (
        path === "me" &&
        method === "DELETE" &&
        tokenRef.current === accessToken &&
        regionRef.current === community
      ) {
        await practiceReminders.reset().catch(() => {});
        if (
          tokenRef.current === accessToken &&
          regionRef.current === community
        ) {
          offlineLibrary.setContext(null);
          await offlineLibrary.clear();
        }
      }
      return localizeServiceSuccess(path, requestMethod, data, locale);
    },
    [locale, setSessionToken, resolveRegion, applyDetection],
  );
  const api = useCallback(
    <T,>(path: string, body?: unknown, method?: string): Promise<T> =>
      sessionRequest(
        { token, region },
        () => ({ token: tokenRef.current, region: regionRef.current }),
        () => requestApi<T>(region, path, body, method, token),
        locale === "zh"
          ? "账号或社区已切换，请重新打开当前页面。"
          : "Account or community changed. Reopen this page.",
      ),
    [requestApi, region, token, locale],
  );
  const authLinkApi = useCallback(
    (
      community: Region,
      path: "auth/verify" | "auth/reset" | "auth/forgot" | "auth/resend",
      body: unknown,
    ) => requestApi(community, path, body),
    [requestApi],
  );
  const authApi = useCallback(
    (
      community: Region,
      path: "auth/login" | "auth/register" | "auth/forgot" | "auth/resend",
      body: unknown,
    ) => {
      // The submit callback may belong to a render just before a foreground
      // detection completed. Bind credentials to the community that callback
      // displayed and refuse stale callbacks before making any account request.
      if (tokenRef.current || community !== regionRef.current)
        throw serviceError(
          409,
          {
            message: "Community changed. Submit again.",
            code: "COMMUNITY_CHANGED",
          },
          locale,
        );
      if (
        storageUnavailable &&
        (path === "auth/login" || path === "auth/register")
      )
        throw new Error(
          locale === "zh"
            ? "请先重试读取已保存的登录信息。"
            : "Retry saved sign-in storage first.",
        );
      return requestApi(community, path, body);
    },
    [requestApi, locale, storageUnavailable],
  );
  const deletionApi = useCallback(
    (
      community: Region,
      path: "auth/deletion-login" | "me" | "auth/logout",
      body: unknown,
      accessToken?: string,
    ) =>
      requestApi(
        community,
        path,
        body,
        path === "me" ? "DELETE" : "POST",
        accessToken,
      ),
    [requestApi],
  );
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const {
          locale: savedLocale,
          region: accountRegion,
          token: savedToken,
        } = await readStoredSession(read);
        if (!active || (DEVELOPMENT_BUILD && developmentRuntime.locked)) return;
        if (savedLocale) setLang(savedLocale);
        if (savedToken) {
          regionRef.current = accountRegion;
          setReg(accountRegion);
          setSessionToken(savedToken);
        } else {
          try {
            const detected = await resolveRegion();
            if (active) await applyDetection(detected);
          } catch {
            if (active) {
              setDetection(null);
              setRegionError(
                savedLocale === "zh"
                  ? "暂时无法确定社区，请检查网络后重试。"
                  : "Could not determine your community. Check your connection and retry.",
              );
            }
          }
        }
      } catch {
        if (active) setStorageUnavailable(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [resolveRegion, applyDetection, restoreRevision]);
  const retrySessionRestore = useCallback(() => {
    if (tokenRef.current) return;
    setLoading(true);
    setStorageUnavailable(false);
    setRestoreRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    if (storageUnavailable) void detectRegion().catch(() => {});
  }, [storageUnavailable, detectRegion]);
  const reload = useCallback(async () => {
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const result = await api<User>("me");
      if (tokenRef.current === token && regionRef.current === region)
        setUser(result);
      if (tokenRef.current === token && regionRef.current === region) {
        if (!result.permissions.canLearn || !result.permissions.canPost)
          cardFileShares.setContext(null);
        practiceReminders.setContext(
          result.permissions.canLearn ? { id: result.id, region } : null,
        );
        if (!result.permissions.canLearn)
          await practiceReminders.reset().catch(() => {});
        else await practiceReminders.refresh().catch(() => {});
      }
    } catch (e) {
      if (tokenRef.current !== token || regionRef.current !== region) return;
      if (
        (e as any).status === 401 ||
        ((e as any).status === 409 && (e as any).code === "COMMUNITY_CHANGED")
      ) {
        offlineLibrary.setContext(null);
        practiceReminders.setContext(null);
        setSessionToken(null);
        setUser(null);
        setDetection(null);
        await Promise.all([
          practiceReminders.reset().catch(() => {}),
          offlineLibrary.clear().catch(() => {}),
          cardFileShares.reset().catch(() => {}),
          write("cubers-token-" + region, null),
        ]);
        void resolveRegion()
          .then(applyDetection)
          .catch(() =>
            setRegionError(
              locale === "zh"
                ? "请重试社区检测。"
                : "Retry community detection.",
            ),
          );
      }
    }
  }, [api, token, region, locale, resolveRegion, applyDetection]);
  useEffect(() => {
    offlineLibrary.setContext(
      token && (!user || user.permissions.canLearn)
        ? { token, region, ownerId: user?.id }
        : null,
    );
  }, [token, region, user?.id, user?.permissions.canLearn]);
  useEffect(() => {
    appVerification.setContext(
      token && user
        ? {
            token,
            region,
            ownerId: user.id,
            canLearn: user.permissions.canLearn,
            api,
          }
        : null,
    );
  }, [token, region, user?.id, user?.permissions.canLearn, api]);
  useEffect(() => {
    appVerification.setActive(Lifecycle.currentState === "active");
    const subscription = Lifecycle.addEventListener("change", (state) =>
      appVerification.setActive(state === "active"),
    );
    return () => {
      subscription.remove();
      appVerification.setContext(null);
      appVerification.setActive(false);
    };
  }, []);
  useEffect(() => {
    practiceReminders.setContext(
      token && user?.permissions.canLearn ? { id: user.id, region } : null,
    );
  }, [token, region, user?.id, user?.permissions.canLearn]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    cardFileShares.setContext(
      token && user?.permissions.canLearn && user.permissions.canPost
        ? JSON.stringify([token, region, user.id])
        : null,
    );
  }, [
    token,
    region,
    user?.id,
    user?.permissions.canLearn,
    user?.permissions.canPost,
  ]);
  useEffect(() => {
    const subscription = Lifecycle.addEventListener("change", (state) => {
      if (state === "active") void cardFileShares.prune();
      if (state === "active" && token) void reload();
      if (state === "active" && !token && !loading && !storageUnavailable)
        void detectRegion().catch(() => {});
    });
    return () => subscription.remove();
  }, [token, loading, storageUnavailable, detectRegion, reload]);
  async function signin(value: string, community: Region = region) {
    const checkDevelopmentConnection = () => {
      if (DEVELOPMENT_BUILD && developmentRuntime.locked)
        throw new Error(
          "Development servers are changing. Reload before signing in.",
        );
    };
    checkDevelopmentConnection();
    if (storageUnavailable)
      throw new Error(
        locale === "zh"
          ? "请先重试读取已保存的登录信息。"
          : "Retry saved sign-in storage first.",
      );
    await cardFileShares.reset().catch(() => {});
    await practiceReminders.reset().catch(() => {});
    offlineLibrary.setContext(null);
    await offlineLibrary.clear();
    setUser(null);
    checkDevelopmentConnection();
    await write("cubers-token-" + community, value);
    await write("cubers-region", community);
    checkDevelopmentConnection();
    regionRef.current = community;
    setReg(community);
    setSessionToken(value);
  }
  async function signout() {
    setSessionToken(null);
    setUser(null);
    setDetection(null);
    offlineLibrary.setContext(null);
    practiceReminders.setContext(null);
    await Promise.all([
      practiceReminders.reset().catch(() => {}),
      cardFileShares.reset().catch(() => {}),
      offlineLibrary.clear().catch(() => {}),
      write("cubers-token-" + region, null),
    ]);
    try {
      // Revoke the captured old server session after local credentials clear.
      await requestApi(region, "auth/logout", {}, undefined, token);
    } catch {}
    if (tokenRef.current) return;
    try {
      await applyDetection(await resolveRegion());
    } catch {
      setRegionError(
        locale === "zh" ? "请重试社区检测。" : "Retry community detection.",
      );
    }
  }
  function setLocale(value: Locale) {
    setLang(value);
    // Language remains usable on the storage-recovery screen. Failure to save
    // this preference must not produce another unhandled storage rejection.
    void write("cubers-locale", value).catch(() => {});
  }
  async function resetDevelopmentSession() {
    if (!DEVELOPMENT_BUILD)
      throw new Error("Development tools are unavailable.");
    await signout();
    // Changing an installation must never restore a token for either old host.
    await Promise.all([
      write("cubers-token-CN", null),
      write("cubers-token-INTL", null),
    ]);
  }
  return (
    <State.Provider
      value={{
        locale,
        region,
        user,
        token,
        loading,
        storageUnavailable,
        retrySessionRestore,
        offline,
        api,
        authApi,
        authLinkApi,
        deletionApi,
        signin,
        signout,
        resetDevelopmentSession: DEVELOPMENT_BUILD
          ? resetDevelopmentSession
          : undefined,
        setLocale,
        reload,
        detectRegion,
        detection,
        regionReady: !!token || !!detection,
        regionError,
        t: (en, zh) => (locale === "zh" ? zh : en),
      }}
    >
      {children}
    </State.Provider>
  );
}
export const useApp = () => useContext(State);
