import { backOrReplace } from "../src/back-navigation";
import React, { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { router, Redirect, useFocusEffect } from "expo-router";
import {
  NotificationCategory,
  type NotificationPage,
  type NotificationItem,
  type NotificationPreferenceView,
  type NotificationPreferences,
} from "@cubers/core";
import { useApp } from "../src/state";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Button,
  Row,
  Chip,
  Notice,
  Busy,
  useTheme,
} from "../src/ui";
export default function Notifications() {
  const { api, t, locale, token, user, region, reload } = useApp();
  const c = useTheme();
  const [storedItems, setItems] = useState<NotificationItem[]>([]),
    [storedNext, setNext] = useState<string | null>(null),
    [storedUnreadCount, setUnreadCount] = useState(0);
  const [storedSettings, setSettings] = useState<NotificationPreferenceView>(),
    [draft, setDraft] = useState<NotificationPreferences>({
      connections: true,
      clubs: true,
    });
  const [category, setCategory] = useState("all"),
    [unread, setUnread] = useState(false),
    [busy, setBusy] = useState(false),
    [paging, setPaging] = useState(false),
    [saving, setSaving] = useState(false),
    [action, setAction] = useState(""),
    [error, setError] = useState("");
  const generation = useRef(0),
    morePending = useRef(false);
  const [loadedFor, setLoadedFor] = useState<string>();
  const owner = JSON.stringify([token, user?.id, region, category, unread]);
  // A context switch must hide old private data before effect cleanup runs.
  const current = loadedFor === owner;
  const items = current ? storedItems : [];
  const next = current ? storedNext : null;
  const unreadCount = current ? storedUnreadCount : 0;
  const settings = current ? storedSettings : undefined;
  const labels: Record<string, string> = {
    all: t("All updates", "全部消息"),
    SYSTEM: t("Account and safety", "账号与安全"),
    REVIEW: t("Review status", "审核状态"),
    CONNECTION: t("Friends and mentorship", "好友与指导"),
    CLUB: t("Clubs", "社团"),
  };
  const path = () =>
    `me/notifications?unread=${unread}${category === "all" ? "" : `&category=${category}`}`;
  async function refresh() {
    const epoch = ++generation.current;
    setLoadedFor(undefined);
    morePending.current = false;
    setPaging(false);
    setSaving(false);
    setAction("");
    setItems([]);
    setUnreadCount(0);
    setNext(null);
    setBusy(true);
    setError("");
    setSettings(undefined);
    try {
      const [page, preferences] = await Promise.all([
        api<NotificationPage>(path()),
        api<NotificationPreferenceView>("me/notification-settings"),
      ]);
      if (epoch !== generation.current) return;
      setLoadedFor(owner);
      setItems(page.items);
      setNext(page.nextCursor);
      setUnreadCount(page.unreadCount);
      setSettings(preferences);
      setDraft(preferences.settings);
    } catch {
      if (epoch === generation.current) {
        setItems([]);
        setUnreadCount(0);
        setSettings(undefined);
        setError(
          t(
            "Could not load updates. Reconnect and refresh.",
            "暂时无法加载消息，请联网后刷新。",
          ),
        );
      }
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      if (token) void refresh();
      return () => {
        generation.current++;
        morePending.current = false;
        setItems([]);
        setUnreadCount(0);
        setSettings(undefined);
      };
    }, [api, token, region, user?.id, category, unread]),
  );
  async function more() {
    if (!next || morePending.current || busy) return;
    const epoch = generation.current;
    morePending.current = true;
    setPaging(true);
    setError("");
    try {
      const page = await api<NotificationPage>(
        path() + `&cursor=${encodeURIComponent(next)}`,
      );
      if (epoch !== generation.current) return;
      setItems((old) =>
        [
          ...old,
          ...page.items.filter((item) => !old.some((p) => p.id === item.id)),
        ].slice(-100),
      );
      setNext(page.nextCursor);
      setUnreadCount(page.unreadCount);
    } catch (error) {
      if (epoch === generation.current) {
        if ((error as any).status === 409) {
          await refresh();
        } else {
          if ([401, 403].includes((error as any).status)) {
            setItems([]);
            setUnreadCount(0);
            setSettings(undefined);
          }
          setError(
            t(
              "Could not load older updates. Refresh the inbox.",
              "无法加载更早的消息，请刷新消息页。",
            ),
          );
        }
      }
    } finally {
      if (epoch === generation.current) {
        morePending.current = false;
        setPaging(false);
      }
    }
  }
  async function save() {
    if (!settings || saving) return;
    const epoch = generation.current;
    setSaving(true);
    setError("");
    try {
      await api(
        "me/notification-settings",
        { revision: settings.revision, settings: draft },
        "PUT",
      );
      if (epoch === generation.current) {
        await refresh();
        void reload();
      }
    } catch (error) {
      if (epoch === generation.current)
        setError(
          (error as any).status === 409
            ? t(
                "Settings changed elsewhere. Refresh before saving again.",
                "设置已在其他设备更改，请刷新后重新保存。",
              )
            : t("Could not save your settings.", "暂时无法保存设置。"),
        );
    } finally {
      if (epoch === generation.current) setSaving(false);
    }
  }
  async function update(item: NotificationItem, dismiss = false) {
    if (action) return;
    const epoch = generation.current;
    setAction(item.id);
    setError("");
    try {
      let result: { unreadCount: number };
      if (dismiss)
        result = await api(`me/notifications/${item.id}`, undefined, "DELETE");
      else result = await api("me/notifications/read", { ids: [item.id] });
      if (epoch !== generation.current) return;
      setItems((old) =>
        dismiss || unread
          ? old.filter((p) => p.id !== item.id)
          : old.map((p) => (p.id === item.id ? { ...p, read: true } : p)),
      );
      setUnreadCount(result.unreadCount);
      void reload();
    } catch (error) {
      if (epoch === generation.current) {
        if ((error as any).status === 404) await refresh();
        else
          setError(
            t(
              "Could not update this message. Refresh and try again.",
              "暂时无法更新此消息，请刷新后重试。",
            ),
          );
      }
    } finally {
      if (epoch === generation.current) setAction("");
    }
  }
  if (!token) return <Redirect href="/" />;
  return (
    <Screen>
      <Button
        kind="secondary"
        label={t("Back", "返回")}
        onPress={() => backOrReplace(router, "/(tabs)/profile")}
      />
      <View style={{ backgroundColor: c.lavender, borderRadius: 24, padding: 24, gap: 8 }}>
        <Heading>{t("Your updates", "你的消息")}</Heading>
        <Txt style={{ fontSize: 22, lineHeight: 30, fontWeight: "600" }}>
          {t(`${unreadCount} unread updates`, `${unreadCount} 条未读消息`)}
        </Txt>
      </View>

      <Row>
        <Chip
          label={t("All", "全部")}
          selected={!unread}
          onPress={() => setUnread(false)}
        />
        <Chip
          label={t("Unread", "未读")}
          selected={unread}
          onPress={() => setUnread(true)}
        />
      </Row>
      <Row>
        {["all", ...NotificationCategory.options].map((c) => (
          <Chip
            key={c}
            label={labels[c]}
            selected={category === c}
            onPress={() => setCategory(c)}
          />
        ))}
      </Row>
      {items.length >= 100 && (
        <Txt small>
          {t(
            "You are browsing older updates. Refresh to return to the latest.",
            "你正在浏览更早的消息，刷新可返回最新消息。",
          )}
        </Txt>
      )}
      <Button
        kind="secondary"
        disabled={busy || saving}
        label={t("Refresh", "刷新")}
        onPress={() => void refresh()}
      />
      {!!error && <Notice text={error} error />}
      {busy && <Busy />}
      {!busy && !items.length && (
        <Card>
          <Txt>{t("No updates in this view.", "当前分类暂无消息。")}</Txt>
        </Card>
      )}
      {items.map((item) => (
        <Card key={item.id} style={{ borderLeftWidth: item.read ? 1 : 5, borderLeftColor: item.read ? c.line : c.green, backgroundColor: item.read ? c.bg : c.paper }}>
          <Txt small>
            {labels[item.category]} /{" "}
            {item.read ? t("Read", "已读") : t("Unread", "未读")}
          </Txt>
          <Txt style={{ fontWeight: "600" }}>{item.title}</Txt>
          <Txt>{item.body}</Txt>
          <Txt small>
            {new Date(item.createdAt).toLocaleString(
              locale === "zh" ? "zh-CN" : "en",
            )}
          </Txt>
          {!item.read && (
            <Button
              small
              kind="secondary"
              disabled={!!action}
              label={t("Mark read", "标为已读")}
              onPress={() => void update(item)}
            />
          )}
          <Button
            small
            kind="secondary"
            disabled={!!action}
            label={t("Dismiss", "移除")}
            onPress={() => void update(item, true)}
          />
        </Card>
      ))}
      {!!next && (
        <Button
          kind="secondary"
          disabled={paging || busy}
          label={
            paging ? t("Loading…", "加载中…") : t("Older updates", "更早的消息")
          }
          onPress={() => void more()}
        />
      )}
      <Card>
        <Txt style={{ fontWeight: "600", fontSize: 21 }}>
          {t("Notification preferences", "消息偏好")}
        </Txt>
        <Txt small>
          {t(
            "These settings belong to this community account. Turning a category off hides its retained updates and stops new optional notices. Turning it back on shows retained history again. Account, safety and review status stay available.",
            "设置仅适用于本社区账号。关闭某类消息会隐藏保留的历史消息，并停止新的可选提醒；重新开启会显示仍保留的历史消息。账号、安全和审核状态始终可查看。",
          )}
        </Txt>
        {settings && (
          <>
            {!settings.communityUpdatesAvailable && (
              <Txt small>
                {t(
                  "Community updates are currently unavailable here. Account and review notices remain available. Your choices are saved for when community services become available.",
                  "本社区暂未开放社交消息。账号和审核消息仍可查看；你的偏好会保存，待社交服务开放后生效。",
                )}
              </Txt>
            )}
            <Button
              kind={draft.connections ? "primary" : "secondary"}
              disabled={saving}
              label={`${labels.CONNECTION} / ${draft.connections ? t("On", "开启") : t("Off", "关闭")}`}
              onPress={() =>
                setDraft((p) => ({ ...p, connections: !p.connections }))
              }
            />
            <Button
              kind={draft.clubs ? "primary" : "secondary"}
              disabled={saving}
              label={`${labels.CLUB} / ${draft.clubs ? t("On", "开启") : t("Off", "关闭")}`}
              onPress={() => setDraft((p) => ({ ...p, clubs: !p.clubs }))}
            />
            <Button
              disabled={
                saving ||
                busy ||
                JSON.stringify(draft) === JSON.stringify(settings.settings)
              }
              label={t("Save preferences", "保存偏好")}
              onPress={() => void save()}
            />
          </>
        )}
        <Button
          kind="secondary"
          label={t("On-device practice reminders", "本机练习提醒")}
          onPress={() => router.push("/downloads")}
        />
        <Txt small>
          {t(
            "This inbox sends no email or push notifications. Read updates older than 30 days and other updates older than 90 days are removed.",
            "本消息页不发送邮件或推送通知。已读且创建超过三十日的消息，以及其他创建超过九十日的消息会被移除。",
          )}
        </Txt>
      </Card>
    </Screen>
  );
}
