import React, { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Screen, Heading, Card, Txt, Field, Button, Notice } from "../src/ui";
import { useApp } from "../src/state";
import { appVerification } from "../src/verification/native";
export default function DeleteAccount() {
  const {
      t,
      token,
      api,
      signout,
      region,
      user,
      deletionApi,
      authLinkApi,
      detectRegion,
      regionReady,
      regionError,
    } = useApp(),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [finished, setFinished] = useState(false),
    [deletionSession, setDeletionSession] = useState<{
      token: string;
      region: "CN" | "INTL";
      email: string;
    } | null>(null);
  const { community } = useLocalSearchParams<{ community?: string }>();
  const linkedCommunity =
    community === "CN" || community === "INTL" ? community : null;
  const accountRegion = deletionSession?.region || linkedCommunity || region;
  const fullSession = token && region === accountRegion;
  const canDelete = !!deletionSession || !!fullSession;
  async function login() {
    setBusy(true);
    setMessage("");
    try {
      if (!linkedCommunity && !(await detectRegion())) {
        setPassword("");
        throw new Error(
          t(
            "The detected community changed. Check it and submit again.",
            "检测到的社区已变更，请核对后重新提交。",
          ),
        );
      }
      const result = await deletionApi(accountRegion, "auth/deletion-login", {
        email,
        password,
        ...(otp ? { otp } : {}),
      });
      if (result.region !== accountRegion)
        throw new Error(
          t(
            "Account community changed. Sign in again.",
            "账号所属社区已变化，请重新登录。",
          ),
        );
      setDeletionSession({ token: result.token, region: accountRegion, email });
      setPassword("");
      setOtp("");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setMessage("");
    try {
      if (deletionSession)
        await deletionApi(
          deletionSession.region,
          "me",
          { confirmation },
          deletionSession.token,
        );
      else await api("me", { confirmation }, "DELETE");
      if (fullSession && user)
        await appVerification.eraseLocal(user.id, accountRegion);
      setDeletionSession(null);
      if (fullSession) await signout();
      setFinished(true);
      setConfirmation("");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Button
        kind="secondary"
        label={t("Cubers", "返回 Cubers")}
        onPress={() => router.replace("/")}
      />
      <Heading eyebrow={t("Your account, your choice", "你的账号，由你决定")}>
        {t("Request account deletion.", "申请注销账号。")}
      </Heading>
      <Txt>
        {t(
          "You can request deletion here in a browser without installing the app. The account community is shown below. Regional links keep deletion available when you travel.",
          "无需安装应用，即可在此通过浏览器申请注销。下方显示账号所属社区；所属区域的注销链接可在旅行时继续使用。",
        )}
      </Txt>
      {finished ? (
        <Notice
          text={t(
            "Your account is disabled, sessions are revoked and account data is queued for deletion. The documented backup limit is 30 days. Linked child accounts are included.",
            "账号已停用，会话已撤销，账号数据已安排删除；文档规定备份最长保留三十日。关联儿童账号也包含在内。",
          )}
        />
      ) : canDelete ? (
        <Card>
          <Txt style={{ fontWeight: "600" }}>
            {fullSession
              ? user?.displayName || t("Signed-in account", "当前登录账号")
              : deletionSession?.email}{" "}
            /{" "}
            {accountRegion === "CN"
              ? t("Mainland China", "中国大陆")
              : t("International", "国际社区")}
          </Txt>
          <Notice
            error
            text={t(
              "This permanently removes your account, linked child accounts, posts, practice history and media. Your account becomes unavailable immediately. To delete only a child account, use the Guardian dashboard instead.",
              "此操作将永久删除你的账号、关联儿童账号、帖子、练习记录及媒体，账号将立即停用。如仅需注销某个儿童账号，请使用监护人管理页面。",
            )}
          />
          <Field
            label={t("Type DELETE to confirm", "输入 DELETE 确认")}
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
          />
          <Button
            kind="danger"
            label={t(
              "Delete my account and linked child accounts",
              "注销我的账号及关联儿童账号",
            )}
            onPress={() => void remove()}
            disabled={busy || confirmation !== "DELETE"}
          />
          <Button
            kind="secondary"
            label={t("Use a different account", "使用其他账号")}
            onPress={() => {
              if (deletionSession)
                void deletionApi(
                  accountRegion,
                  "auth/logout",
                  {},
                  deletionSession.token,
                )
                  .catch(() => {})
                  .finally(() => setDeletionSession(null));
              else void signout();
            }}
          />
        </Card>
      ) : (
        <Card>
          <Txt small>
            {t("Account community: ", "账号所属社区：")}
            {accountRegion === "CN"
              ? t("Mainland China", "中国大陆")
              : t("International", "国际社区")}
          </Txt>
          <Notice
            text={t(
              "This sign-in only permits account deletion, lasts ten minutes, and cannot open community or profile data.",
              "此次登录仅可注销账号，十分钟后失效，不能查看社区或个人页数据。",
            )}
          />
          {!linkedCommunity && !!regionError && (
            <Notice text={regionError} error />
          )}
          {!linkedCommunity && !regionReady && (
            <Button
              kind="secondary"
              label={t("Retry community detection", "重试社区检测")}
              onPress={() => void detectRegion().catch(() => {})}
            />
          )}
          <Field
            label={t("Email", "邮箱")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label={t("Password", "密码")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
          />
          <Field
            label={t(
              "Administrator MFA code (if applicable)",
              "管理员 MFA 验证码（如适用）",
            )}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            autoComplete="one-time-code"
          />
          <Button
            label={t("Sign in to request deletion", "登录并申请注销")}
            onPress={() => void login()}
            disabled={
              busy || (!linkedCommunity && !regionReady) || !email || !password
            }
          />
          <Button
            kind="secondary"
            label={t("Send password recovery email", "发送密码找回邮件")}
            disabled={busy || !email}
            onPress={() => {
              setBusy(true);
              void authLinkApi(accountRegion, "auth/forgot", { email })
                .then((result) => setMessage(result.message))
                .catch((e) => setMessage(e.message))
                .finally(() => setBusy(false));
            }}
          />
        </Card>
      )}
      {!!message && <Notice text={message} error />}
      <Button
        kind="secondary"
        label={t("Deletion policy and support", "注销说明与支持")}
        onPress={() => router.push("/legal/deletion")}
      />
    </Screen>
  );
}
