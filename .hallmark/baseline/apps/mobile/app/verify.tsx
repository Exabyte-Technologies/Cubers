import React, { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { useApp } from "../src/state";
import { Screen, Heading, Button, Notice } from "../src/ui";
export default function Verify() {
  const { token, community } = useLocalSearchParams<{
      token: string;
      community?: string;
    }>(),
    { authLinkApi, t } = useApp(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function verify() {
    setBusy(true);
    try {
      const r = await authLinkApi(
        community === "CN" || community === "INTL"
          ? community
          : process.env.EXPO_PUBLIC_REGION === "CN"
            ? "CN"
            : "INTL",
        "auth/verify",
        { token },
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
      <Heading>{t("Verify your email", "验证邮箱")}</Heading>
      <Notice
        text={
          t("Account community: ", "账号所属社区：") +
          (community === "CN" ||
          (!community && process.env.EXPO_PUBLIC_REGION === "CN")
            ? t("Mainland China", "中国大陆")
            : t("International", "国际社区"))
        }
      />
      <Button
        label={t("Confirm email", "确认邮箱")}
        onPress={() => void verify()}
        disabled={busy || !token}
      />
      {!!message && <Notice text={message} />}
      <Button
        label={t("Back to sign in", "返回登录")}
        kind="secondary"
        onPress={() => router.replace("/")}
      />
    </Screen>
  );
}
