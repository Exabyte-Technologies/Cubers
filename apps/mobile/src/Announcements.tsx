import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  AnnouncementsPage,
  AnnouncementDetail,
  type AnnouncementPreview,
} from "@cubers/core";
import { useApp } from "./state";
import { Card, Txt, Button, Notice, Busy, useTheme } from "./ui";

const visible = () =>
  AppState.currentState !== "background" &&
  AppState.currentState !== "inactive" &&
  (Platform.OS !== "web" || document.visibilityState === "visible");
// Authored text is held only for a short server lease. New requests can replace
// an expired view; background/blur invalidates outstanding responses entirely.
function useLeasedUpdate<T>(
  fetcher: () => Promise<{ value: T; lifetime: number }>,
) {
  const [data, setData] = useState<T>(),
    [failed, setFailed] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true,
        epoch = 0,
        expiry: ReturnType<typeof setTimeout> | undefined;
      const clear = () => {
        epoch++;
        clearTimeout(expiry);
        setData(undefined);
      };
      const load = async () => {
        if (!visible()) {
          clear();
          return;
        }
        const run = ++epoch,
          start = performance.now();
        try {
          const result = await fetcher();
          if (!active || run !== epoch || !visible()) return;
          const remaining = result.lifetime - (performance.now() - start);
          if (
            !Number.isFinite(remaining) ||
            remaining <= 0 ||
            result.lifetime > 30000
          ) {
            clear();
            setFailed(true);
            return;
          }
          clearTimeout(expiry);
          setData(result.value);
          setFailed(false);
          expiry = setTimeout(() => {
            if (active) {
              setData(undefined);
              setFailed(true);
            }
          }, remaining);
        } catch (error) {
          if (!active || run !== epoch) return;
          if ([400, 401, 403, 404, 409].includes((error as any).status))
            clear();
          setFailed(true);
        }
      };
      clear();
      void load();
      const timer = setInterval(() => void load(), 25000);
      const lifecycle = AppState.addEventListener("change", () => {
        if (visible()) void load();
        else clear();
      });
      const webChange = () => {
        if (visible()) void load();
        else clear();
      };
      if (Platform.OS === "web")
        document.addEventListener("visibilitychange", webChange);
      return () => {
        active = false;
        epoch++;
        clearInterval(timer);
        clearTimeout(expiry);
        lifecycle.remove();
        if (Platform.OS === "web")
          document.removeEventListener("visibilitychange", webChange);
        setData(undefined);
      };
    }, [fetcher]),
  );
  return { data, failed };
}

function UpdateReader({
  id,
  version,
  close,
}: {
  id: string;
  version: number;
  close: () => void;
}) {
  const { api, locale, t } = useApp();
  const fetcher = useCallback(async () => {
    const value = AnnouncementDetail.parse(
      await api(`announcements/${id}?version=${version}`),
    );
    return { value, lifetime: value.validForMs };
  }, [api, id, version]);
  const { data, failed } = useLeasedUpdate(fetcher);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const focused = useRef(false),
    epoch = useRef(0);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      epoch.current++;
      return () => {
        focused.current = false;
        epoch.current++;
      };
    }, [id, version, api]),
  );
  async function lesson() {
    if (busy || !data?.courseId || !visible()) return;
    const run = ++epoch.current;
    setBusy(true);
    setMessage("");
    try {
      const fresh = AnnouncementDetail.parse(
        await api(`announcements/${id}?version=${version}`),
      );
      if (!focused.current || run !== epoch.current || !visible()) return;
      if (fresh.courseId) router.push(`/lesson/${fresh.courseId}`);
    } catch {
      if (focused.current && run === epoch.current)
        setMessage(
          t(
            "This update or lesson changed. Close it and refresh the list.",
            "公告或课程已变化，请关闭后刷新列表。",
          ),
        );
    } finally {
      if (focused.current && run === epoch.current) setBusy(false);
    }
  }
  return (
    <Card>
      <Button
        small
        kind="secondary"
        label={t("Close update", "关闭公告")}
        onPress={close}
      />
      {data ? (
        <>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 22, fontWeight: "600" }}
          >
            {data.title[locale]}
          </Txt>
          <Txt>{data.body[locale]}</Txt>
          {data.courseId && (
            <Button
              label={t("Open the reviewed lesson", "打开关联课程")}
              disabled={busy}
              onPress={() => void lesson()}
            />
          )}
        </>
      ) : failed ? (
        <Notice
          text={t(
            "This update changed or is temporarily unavailable. Close it and refresh the list.",
            "公告已变化或暂时不可用，请关闭后刷新列表。 ",
          )}
        />
      ) : (
        <Busy />
      )}
      {!!message && <Notice text={message} />}
    </Card>
  );
}

export function AnnouncementCards({ full = false }: { full?: boolean }) {
  const { token, region, user } = useApp();
  if (!token) return null;
  return (
    <UpdatesView
      key={JSON.stringify([token, region, user?.permissions.canLearn, full])}
      full={full}
    />
  );
}
function UpdatesView({ full }: { full: boolean }) {
  const { api, locale, t } = useApp(),
    c = useTheme();
  const [cursor, setCursor] = useState<string>(),
    [selected, setSelected] = useState<AnnouncementPreview>(),
    [reload, setReload] = useState(0);
  const fetcher = useCallback(async () => {
    const value = AnnouncementsPage.parse(
      await api(
        `announcements${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      ),
    );
    return {
      value,
      lifetime: value.items.length
        ? Math.min(...value.items.map((item) => item.validForMs))
        : 30000,
    };
  }, [api, cursor, reload]);
  const { data, failed } = useLeasedUpdate(fetcher);
  useFocusEffect(useCallback(() => () => setSelected(undefined), []));
  useEffect(() => {
    const event = AppState.addEventListener("change", (state) => {
      if (state !== "active") setSelected(undefined);
    });
    const hidden = () => {
      if (document.visibilityState !== "visible") setSelected(undefined);
    };
    if (Platform.OS === "web")
      document.addEventListener("visibilitychange", hidden);
    return () => {
      event.remove();
      if (Platform.OS === "web")
        document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  if (!full && !data?.items.length && !selected) return null;
  return (
    <>
      <Txt
        accessibilityRole="header"
        style={{ fontSize: 22, fontWeight: "600" }}
      >
        {t("Cubers updates", "Cubers 公告")}
      </Txt>
      <Txt small>
        {t(
          "Service information and authored learning updates from Cubers.",
          "Cubers 发布的服务信息与原创学习公告。",
        )}
      </Txt>
      {selected && (
        <UpdateReader
          key={`${selected.id}:${selected.version}`}
          id={selected.id}
          version={selected.version}
          close={() => setSelected(undefined)}
        />
      )}
      {data ? (
        <>
          {!data.items.length && (
            <Notice
              text={t(
                "No current updates on this page.",
                "本页暂无当前有效的公告。 ",
              )}
            />
          )}
          {(full ? data.items : data.items.slice(0, 3)).map((item) => (
            <View
              key={`${item.id}:${item.version}`}
              style={{
                gap: 12,
                paddingVertical: 18,
                borderTopWidth: 1,
                borderColor: c.line,
              }}
            >
              <Txt small>
                {item.kind === "service"
                  ? t("Cubers service", "Cubers 服务公告")
                  : t("Cubers learning", "Cubers 学习公告")}
              </Txt>
              <Txt style={{ fontSize: 20, fontWeight: "600" }}>
                {item.title[locale]}
              </Txt>
              <Txt>{item.summary[locale]}</Txt>
              <Button
                small
                kind="secondary"
                label={t("Read update", "阅读公告")}
                onPress={() => setSelected(item)}
              />
            </View>
          ))}
        </>
      ) : failed ? (
        <Notice
          text={t(
            "Updates could not be refreshed. Return to the latest page or try again.",
            "暂时无法刷新公告，请返回最新一页或重试。 ",
          )}
        />
      ) : (
        <Busy />
      )}
      {full ? (
        <>
          <Button
            small
            kind="secondary"
            label={t("Latest updates / refresh", "最新公告／刷新")}
            onPress={() => {
              setSelected(undefined);
              setCursor(undefined);
              setReload((value) => value + 1);
            }}
          />
          {data?.nextCursor && (
            <Button
              small
              kind="secondary"
              label={t("Next page", "下一页")}
              onPress={() => {
                setSelected(undefined);
                setCursor(data.nextCursor!);
              }}
            />
          )}
        </>
      ) : (
        <Button
          small
          kind="secondary"
          label={t("All Cubers updates", "全部 Cubers 公告")}
          onPress={() => router.push("/announcements")}
        />
      )}
    </>
  );
}
