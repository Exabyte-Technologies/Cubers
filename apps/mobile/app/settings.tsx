import React, { useEffect, useRef, useState } from "react";
import { Share, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useApp } from "../src/state";
import { appVerification } from "../src/verification/native";
import { ProfileDetails } from "../src/ProfileDetails";
import { ProfileSectionTabs } from "../src/ProfileSectionTabs";
import {
  Screen,
  Heading,
  Txt,
  Field,
  Button,
  Notice,
  useTheme,
} from "../src/ui";
const categories = [
  ["account", "Account", "账号"],
  ["privacy", "Profile & privacy", "资料与隐私"],
  ["learning", "Learning & devices", "学习与设备"],
  ["family", "Family & safety", "家庭与安全"],
  ["notifications", "Notifications", "消息"],
] as const;
type Category = (typeof categories)[number][0];
export default function Settings() {
  const { tab: requested } = useLocalSearchParams<{ tab?: string }>();
  const { user, token, region, api, signout, t } = useApp(),
    c = useTheme();
  const [tab, setTab] = useState<Category>(
    categories.some(([key]) => key === requested)
      ? (requested as Category)
      : "account",
  );
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const owner = JSON.stringify([token, user?.id, region]);
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  useEffect(
    () => () => {
      ownerRef.current = "";
    },
    [],
  );

  useEffect(() => {
    setConfirmation("");
    setMessage("");
    setBusy(false);
  }, [owner]);
  useEffect(() => {
    if (categories.some(([key]) => key === requested))
      setTab(requested as Category);
  }, [requested]);
  async function exportData() {
    setBusy(true);
    setMessage("");
    try {
      const data = await api("me/export");
      if (ownerRef.current !== owner) return;
      await Share.share({
        message: JSON.stringify(data, null, 2),
        title: "Cubers account export",
      });
    } catch (e) {
      if (ownerRef.current === owner) setMessage((e as Error).message);
    } finally {
      if (ownerRef.current === owner) setBusy(false);
    }
  }
  async function revoke() {
    setBusy(true);
    setMessage("");
    try {
      await api("auth/sessions", undefined, "DELETE");
      if (ownerRef.current === owner) await signout();
    } catch (e) {
      if (ownerRef.current === owner) setMessage((e as Error).message);
    } finally {
      if (ownerRef.current === owner) setBusy(false);
    }
  }
  async function remove() {
    if (confirmation !== "DELETE" || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api("me", { confirmation }, "DELETE");
      if (user) await appVerification.eraseLocal(user.id, region);
      if (ownerRef.current === owner) await signout();
    } catch (e) {
      if (ownerRef.current === owner) setMessage((e as Error).message);
    } finally {
      if (ownerRef.current === owner) setBusy(false);
    }
  }
  if (!token) return <Redirect href="/" />;
  return (
    <Screen>
      <Button
        kind="secondary"
        label={t("Back to profile", "返回个人页")}
        onPress={() => router.replace("/(tabs)/profile")}
      />
      <Heading>{t("Settings", "设置")}</Heading>
      <ProfileSectionTabs
        label={t("Settings categories", "设置分类")}
        value={tab}
        onChange={(value) => {
          setTab(value);
          setMessage("");
          setConfirmation("");
        }}
        items={categories.map(([value, en, zh]) => ({
          value,
          label: t(en, zh),
        }))}
      />
      <View
        style={{
          gap: 20,
          borderTopWidth: 1,
          borderColor: c.line,
          paddingTop: 24,
        }}
      >
        <Txt
          accessibilityRole="header"
          style={{ fontSize: 24, fontWeight: "600", lineHeight: 31 }}
        >
          {t(
            categories.find(([key]) => key === tab)![1],
            categories.find(([key]) => key === tab)![2],
          )}
        </Txt>
        {tab === "account" && (
          <>
            <Txt>{user?.displayName}</Txt>
            <Txt small style={{ color: c.muted }}>
              {region === "CN"
                ? t("Mainland China community", "中国大陆社区")
                : t("International community", "国际社区")}
            </Txt>
            <Button
              kind="secondary"
              label={t("Export my data", "导出我的数据")}
              onPress={() => void exportData()}
              disabled={busy}
            />
            <Button
              kind="secondary"
              label={t("Revoke all sessions", "撤销所有会话")}
              onPress={() => void revoke()}
              disabled={busy}
            />
            <Button
              kind="secondary"
              label={t("Sign out", "退出登录")}
              onPress={() => void signout()}
              disabled={busy}
            />
            <View
              style={{
                borderTopWidth: 1,
                borderColor: c.line,
                paddingTop: 24,
                gap: 16,
              }}
            >
              <Field
                label={t(
                  "Type DELETE to delete your account",
                  "输入 DELETE 以注销账号",
                )}
                value={confirmation}
                onChangeText={setConfirmation}
                autoCapitalize="characters"
                editable={!busy}
              />
              <Txt small style={{ color: c.muted }}>
                {t(
                  "This disables your account immediately and deletes linked child accounts, posts and media. Backups expire within 30 days.",
                  "账号将立即停用，关联儿童账号、帖子及媒体将被删除，备份最长三十日到期。",
                )}
              </Txt>
              <Button
                kind="danger"
                label={t("Delete account", "注销账号")}
                onPress={() => void remove()}
                disabled={confirmation !== "DELETE" || busy}
              />
            </View>
          </>
        )}
        {tab === "privacy" && (
          <>
            <Txt small style={{ color: c.muted }}>
              {t(
                "Choose your avatar, edit your identity and control which profile sections you share.",
                "选择头像、编辑资料，并决定分享哪些个人页内容。",
              )}
            </Txt>
            <Button
              kind="secondary"
              label={t("Customize profile and sharing", "设置资料与分享范围")}
              onPress={() => router.push("/profile/edit")}
            />
            <Button
              kind="secondary"
              label={t("Friends and mentorship preferences", "好友与指导偏好")}
              onPress={() => router.push("/connections")}
            />
            <Button
              kind="secondary"
              label={t("Privacy & support", "隐私与支持")}
              onPress={() => router.push("/legal/privacy")}
            />
          </>
        )}
        {tab === "learning" && (
          <>
            <Button
              kind="secondary"
              label={t("Lesson downloads & reminders", "课程下载与提醒")}
              onPress={() => router.push("/downloads")}
            />
            <Button
              kind="secondary"
              label={t("Device options", "设备选项")}
              onPress={() => router.push("/devices")}
            />
            <Button
              kind="secondary"
              label={t("App verification", "应用验证")}
              onPress={() => router.push("/app-verification")}
            />
            <Txt small style={{ color: c.muted }}>
              {t(
                "No tested smart-cube models are enabled yet.",
                "目前尚未启用通过实机测试的智能魔方型号。",
              )}
            </Txt>
            <ProfileDetails key={owner} section="goals" />
          </>
        )}
        {tab === "family" && (
          <>
            <Button
              kind="secondary"
              label={t("Guardian dashboard", "监护人管理")}
              onPress={() => router.push("/guardian")}
            />
            {user?.guardianEligible && (
              <>
                <Button
                  kind="secondary"
                  label={t("Review child's replay sharing", "审核儿童回放分享")}
                  onPress={() =>
                    router.push({
                      pathname: "/replay-shares",
                      params: { role: "guardian" },
                    })
                  }
                />
                <Button
                  kind="secondary"
                  label={t(
                    "Review child's achievement cards",
                    "审核儿童成就卡片",
                  )}
                  onPress={() => router.push("/guardian-cards")}
                />
              </>
            )}
            <Button
              kind="secondary"
              label={t("Community standards", "社区规范")}
              onPress={() => router.push("/legal/community")}
            />
            <Button
              kind="secondary"
              label={t("Privacy & support", "隐私与支持")}
              onPress={() => router.push("/legal/privacy")}
            />
          </>
        )}
        {tab === "notifications" && (
          <>
            <Button
              kind="secondary"
              label={t(
                "All updates & notification settings",
                "全部消息与消息设置",
              )}
              onPress={() => router.push("/notifications")}
            />
            <Button
              kind="secondary"
              label={t(
                "Cubers service & learning updates",
                "Cubers 服务与学习公告",
              )}
              onPress={() => router.push("/announcements")}
            />
          </>
        )}
      </View>
      {!!message && <Notice text={message} error />}
    </Screen>
  );
}
