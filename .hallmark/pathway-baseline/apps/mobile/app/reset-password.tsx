import React, { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { useApp } from "../src/state";
import { Screen, Heading, Card, Logo, Button, Field, Notice } from "../src/ui";
export default function Reset() {
  const { token, community } = useLocalSearchParams<{
      token: string;
      community?: string;
    }>(),
    { authLinkApi, t } = useApp(),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function reset() {
    setBusy(true);
    try {
      const r = await authLinkApi(
        community === "CN" || community === "INTL"
          ? community
          : process.env.EXPO_PUBLIC_REGION === "CN"
            ? "CN"
            : "INTL",
        "auth/reset",
        { token, password },
      );
      setMessage(r.message);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Card style={{ width: "100%", maxWidth: 560, alignSelf: "center", padding: 28, gap: 20 }}>
      <Logo size={56} />
      <Heading>{t("A fresh start", "重新设置密码")}</Heading>
      <Notice
        text={
          t("Account community: ", "账号所属社区：") +
          (community === "CN" ||
          (!community && process.env.EXPO_PUBLIC_REGION === "CN")
            ? t("Mainland China", "中国大陆")
            : t("International", "国际社区"))
        }
      />
      <Field
        label={t(
          "New password (at least 12 characters)",
          "新密码（至少 12 个字符）",
        )}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button
        label={t("Update password", "更新密码")}
        onPress={() => void reset()}
        disabled={busy || password.length < 12}
      />
      {!!message && <Notice text={message} />}
      <Button
        label={t("Sign in", "登录")}
        kind="secondary"
        onPress={() => router.replace("/")}
      />
      </Card>
    </Screen>
  );
}
