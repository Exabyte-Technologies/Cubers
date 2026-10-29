import React, { useEffect, useState, useRef } from "react";
import { Platform } from "react-native";
import { useApp } from "../state";
import { Card, Txt, Field, Button, Notice } from "../ui";
import { practiceReminders } from "./native";
export function ReminderSettings() {
  const { user, region, t, locale, api, token } = useApp();
  const identity = useRef("");
  identity.current = `${token}:${region}:${user?.id}`;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [time, setTime] = useState("19:00"),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    setEnabled(false);
    practiceReminders.setContext(
      user?.permissions.canLearn ? { id: user.id, region } : null,
    );
    void practiceReminders.status().then((pref) => {
      if (active && pref) {
        setTime(
          `${String(pref.hour).padStart(2, "0")}:${String(pref.minute).padStart(2, "0")}`,
        );
        setEnabled(true);
      }
    });
    return () => {
      active = false;
    };
  }, [user?.id, user?.permissions.canLearn, region]);
  async function save(enable: boolean) {
    const key = identity.current,
      active = () => mounted.current && identity.current === key;
    setBusy(true);
    setMessage("");
    try {
      if (enable) {
        if (!user?.permissions.canLearn) throw Error("Sign in online first");
        const current = await api("me");
        if (!active()) return;
        if (
          current.id !== user.id ||
          current.region !== region ||
          !current.permissions.canLearn
        )
          throw Error("Current learning permission is required");
        practiceReminders.setContext({ id: user.id, region });
        const [hour, minute] = time.split(":").map(Number);
        await practiceReminders.enable(hour, minute, locale);
      } else await practiceReminders.reset();
      if (!active()) return;
      setEnabled(enable);
      setMessage(
        t("Reminder settings saved on this device.", "提醒设置已保存在本机。"),
      );
    } catch {
      if (!active()) return;
      setEnabled(false);
      setMessage(
        t(
          "Could not enable reminders. Check notification permission and reconnect to your account.",
          "无法启用提醒，请检查通知权限并联网验证账号。",
        ),
      );
    } finally {
      if (active()) setBusy(false);
    }
  }
  if (Platform.OS === "web") return null;
  return (
    <Card>
      <Txt style={{ fontWeight: "700", fontSize: 20 }}>
        {t("Optional practice reminder", "可选练习提醒")}
      </Txt>
      <Txt small>
        {t(
          "Off by default. Set a quiet local reminder for the next seven days. Opening the app online renews it. Messages include no name or progress; delivery depends on your phone settings. Signing out or removing this setting cancels it.",
          "默认关闭。可设置未来七天的本机静音提醒，联网打开应用后续期。消息不含姓名或进度，送达时间由手机设置决定。退出登录或关闭本设置会取消提醒。",
        )}
      </Txt>
      <Field
        label={t("Local time (HH:MM)", "本地时间（HH:MM）")}
        value={time}
        onChangeText={setTime}
        maxLength={5}
        placeholder="19:00"
      />
      <Txt>
        {enabled
          ? t("Enabled on this device", "已在本机启用")
          : t("Off", "已关闭")}
      </Txt>
      <Button
        label={t("Enable / update reminder", "启用或更新提醒")}
        disabled={
          busy ||
          !user?.permissions.canLearn ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
        }
        onPress={() => void save(true)}
      />
      <Button
        kind="secondary"
        label={t("Turn off reminders", "关闭提醒")}
        disabled={busy}
        onPress={() => void save(false)}
      />
      {!!message && <Notice text={message} />}
    </Card>
  );
}
