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
    ? sessionStorage.getItem(k)
    : SecureStore.getItemAsync(k);
const write = orderedWriter(async (k: string, v: string | null) => {
  if (Platform.OS === "web") {
    if (v === null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } else if (v === null) await SecureStore.deleteItemAsync(k);
  else await SecureStore.setItemAsync(k, v);
});
import { detectCommunity, communityEndpoint } from "./community-routing";
const endpoints = {
  discovery: process.env.EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL,
  INTL: process.env.EXPO_PUBLIC_API_URL_INTL,
  CN: process.env.EXPO_PUBLIC_API_URL_CN,
};
type Context = {
  locale: Locale;
  region: Region;
  user: User | null;
  token: string | null;
  loading: boolean;
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
      pendingDetection.current = detectCommunity(endpoints, __DEV__);
    try {
      return await pendingDetection.current;
    } finally {
      pendingDetection.current = null;
    }
  }, []);
  const applyDetection = useCallback(async (detected: CommunityDetection) => {
    if (tokenRef.current) return regionRef.current === detected.region;
    const same = regionRef.current === detected.region;
    regionRef.current = detected.region;
    setReg(detected.region);
    setDetection(detected);
    setRegionError("");
    await write("cubers-region", detected.region);
    return same;
  }, []);
  const detectRegion = useCallback(async () => {
    // Existing sessions remain bound to their original regional account. Only
    // signed-out registration/login is routed from the current connection.
    if (tokenRef.current) return true;
    try {
      const detected = await resolveRegion();
      if (tokenRef.current) return true;
      return await applyDetection(detected);
    } catch {
      setDetection(null);
      const message =
        locale === "zh"
          ? "暂时无法确定社区，请检查网络后重试。"
          : "Could not determine your community. Check your connection and retry.";
      setRegionError(message);
      throw new Error(message);
    }
  }, [token, locale, applyDetection, resolveRegion]);
  const requestApi = useCallback(
    async <T,>(
      community: Region,
      path: string,
      body?: unknown,
      method?: string,
      accessToken?: string | null,
    ): Promise<T> => {
      let base: string;
      try {
        base = communityEndpoint(endpoints, community, __DEV__);
      } catch {
        throw serviceError(503, null, locale);
      }
      const requestMethod = method || (body === undefined ? "GET" : "POST");
      let response: Response, data: any;
      try {
        ({ response, data } = await withTimeout(async (signal) => {
          const response = await fetch(base + "/v1/" + path, {
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
        }, 15000));
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
    [locale],
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
      return requestApi(community, path, body);
    },
    [requestApi, locale],
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
      const savedLocale = await read("cubers-locale");
      if (savedLocale === "en" || savedLocale === "zh") setLang(savedLocale);
      const savedRegion = await read("cubers-region");
      const accountRegion = savedRegion === "CN" ? "CN" : "INTL";
      const savedToken = await read("cubers-token-" + accountRegion);
      if (savedToken) {
        if (active) {
          regionRef.current = accountRegion;
          setReg(accountRegion);
          setSessionToken(savedToken);
        }
      } else {
        try {
          const detected = await resolveRegion();
          if (active) await applyDetection(detected);
        } catch {
          if (active)
            setRegionError(
              savedLocale === "zh"
                ? "暂时无法确定社区，请检查网络后重试。"
                : "Could not determine your community. Check your connection and retry.",
            );
        }
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [resolveRegion, applyDetection]);
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
      if ((e as any).status === 401) {
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
      if (state === "active" && !token && !loading)
        void detectRegion().catch(() => {});
    });
    return () => subscription.remove();
  }, [token, loading, detectRegion, reload]);
  async function signin(value: string, community: Region = region) {
    await cardFileShares.reset().catch(() => {});
    await practiceReminders.reset().catch(() => {});
    offlineLibrary.setContext(null);
    await offlineLibrary.clear();
    setUser(null);
    await write("cubers-token-" + community, value);
    await write("cubers-region", community);
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
    void write("cubers-locale", value);
  }
  return (
    <State.Provider
      value={{
        locale,
        region,
        user,
        token,
        loading,
        offline,
        api,
        authApi,
        authLinkApi,
        deletionApi,
        signin,
        signout,
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
