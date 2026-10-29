import React, { useState } from "react";
import {
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { router, Redirect, useLocalSearchParams } from "expo-router";
import { useApp } from "../src/state";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Field,
  Button,
  Chip,
  Row,
  Logo,
  Notice,
  Busy,
  useTheme,
  CheckboxMark,
} from "../src/ui";
import { authContinuation } from "../src/invitations";
import { SessionRestoreNotice } from "../src/SessionRestoreNotice";
export default function Auth() {
  const continuation = authContinuation(useLocalSearchParams());
  const wide = useWindowDimensions().width >= 900;
  const {
      t,
      region,
      token,
      loading,
      storageUnavailable,
      authApi,
      signin,
      regionReady,
      regionError,
      detectRegion,
    } = useApp(),
    c = useTheme();
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "resend">(
      "login",
    ),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [staffLogin, setStaffLogin] = useState(false),
    [otp, setOtp] = useState(""),
    [name, setName] = useState(""),
    [birth, setBirth] = useState(""),
    [agree, setAgree] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  if (loading) return <Busy />;
  if (token) return <Redirect href={continuation} />;
  async function submit() {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (!(await detectRegion())) {
        setPassword("");
        throw new Error(
          t(
            "Your detected community changed. Check the community below and submit again.",
            "检测到的社区已变更，请核对下方社区后重新提交。",
          ),
        );
      }
      if (mode === "login") {
        const result = await authApi(region, "auth/login", {
          email,
          password,
          ...(staffLogin ? { otp } : {}),
        });
        if (result.user.region !== region)
          throw new Error(
            t(
              "Account community did not match. Try again.",
              "账号所属社区不匹配，请重试。",
            ),
          );
        await signin(result.token, region);
        router.replace(continuation);
      } else if (mode === "register") {
        const r = await authApi(region, "auth/register", {
          email,
          password,
          displayName: name,
          birthDate: birth,
          region,
          terms: agree,
          privacy: agree,
        });
        setMessage(r.message);
        setMode("login");
      } else {
        const r = await authApi(region, `auth/${mode}`, { email });
        setMessage(r.message);
      }
    } catch (e) {
      if ((e as any).code === "COMMUNITY_CHANGED") {
        setPassword("");
        await detectRegion().catch(() => {});
        setError(
          t(
            "Your network location changed. Check the community below and submit again.",
            "网络位置已变化，请核对下方社区后重新提交。",
          ),
        );
      } else setError((e as Error).message);
    } finally {
      setOtp("");
      setBusy(false);
    }
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen>
        <View
          style={{
            flexDirection: wide ? "row" : "column-reverse",
            alignItems: "flex-start",
            gap: 28,
          }}
        >
          <View
            style={{
              flex: wide ? 1 : undefined,
              width: wide ? undefined : "100%",
              backgroundColor: c.lavender,
              borderRadius: 28,
              padding: wide ? 36 : 24,
              gap: 24,
              borderWidth: 1,
              borderColor: c.line,
            }}
          >
            <Row style={{ alignItems: "center", gap: 12 }}>
              <Logo size={64} />
              <Txt style={{ fontSize: 26, fontWeight: "600" }}>Cubers</Txt>
            </Row>
            <Heading
              eyebrow={t(
                "A little twist. A new connection.",
                "转动一小步，连接新朋友。",
              )}
            >
              {t(
                "Find your people.\nSolve something together.",
                "找到同好，\n一起探索魔方。",
              )}
            </Heading>
            <Txt
              style={{
                color: c.muted,
                maxWidth: 470,
                fontSize: 18,
                lineHeight: 29,
              }}
            >
              {t(
                "Learn at your own pace. Share the small wins. Make your next turn a good one.",
                "按自己的节奏学习，分享每一次小进步，让下一次转动更有收获。",
              )}
            </Txt>
          </View>
          <Card
            style={{
              width: wide ? 460 : "100%",
              flexShrink: 0,
              gap: 20,
              padding: wide ? 30 : 24,
            }}
          >
            {!wide && <Logo size={48} />}
            <Txt
              accessibilityRole="header"
              style={{ fontSize: 26, lineHeight: 33, fontWeight: "600" }}
            >
              {mode === "login"
                ? t("Sign in", "登录")
                : mode === "register"
                  ? t("Join Cubers", "注册")
                  : mode === "forgot"
                    ? t("Forgot password?", "忘记密码？")
                    : t("Resend verification", "重发验证邮件")}
            </Txt>
            {storageUnavailable && <SessionRestoreNotice />}
            <Row>
              <Chip
                label={t("Sign in", "登录")}
                selected={mode === "login"}
                onPress={() => setMode("login")}
              />
              <Chip
                label={t("Join Cubers", "注册")}
                selected={mode === "register"}
                onPress={() => setMode("register")}
              />
            </Row>
            {mode === "register" && (
              <>
                <Field
                  label={t("Display name", "昵称")}
                  value={name}
                  onChangeText={setName}
                />
                <Field
                  label={t(
                    "Date of birth (YYYY-MM-DD)",
                    "出生日期（年-月-日）",
                  )}
                  value={birth}
                  onChangeText={setBirth}
                  placeholder="2000-01-01"
                />
                <Txt small style={{ color: c.muted }}>
                  {t(
                    "Under 13 internationally or under 14 in China? A verified guardian creates and manages your account.",
                    "国际区未满 13 周岁、中国大陆区未满 14 周岁，需由经过验证的监护人创建与管理账号。",
                  )}
                </Txt>
              </>
            )}
            <Field
              label={t("Email", "邮箱")}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            {["login", "register"].includes(mode) && (
              <Field
                label={t("Password", "密码")}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                placeholder={
                  mode === "register"
                    ? t("At least 12 characters", "至少 12 个字符")
                    : undefined
                }
              />
            )}
            {mode === "register" && (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agree }}
                onPress={() => setAgree(!agree)}
                style={{ paddingVertical: 8, minHeight: 44 }}
              >
                <Row style={{ alignItems: "flex-start" }}>
                  <CheckboxMark checked={agree} />
                  <Txt small style={{ flex: 1 }}>
                    {t(
                      "I have read and agree to the privacy policy and terms.",
                      "我已阅读并同意隐私政策与用户协议。",
                    )}
                  </Txt>
                </Row>
              </Pressable>
            )}
            {!!error && <Notice text={error} error />}
            {mode === "login" && (
              <>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: staffLogin }}
                  onPress={() => {
                    setStaffLogin(!staffLogin);
                    setOtp("");
                  }}
                  style={{ paddingVertical: 8, minHeight: 44 }}
                >
                  <Row style={{ alignItems: "flex-start" }}>
                    <CheckboxMark checked={staffLogin} />
                    <Txt small style={{ flex: 1 }}>
                      {t(
                        "I’m signing in with a staff account",
                        "使用工作人员账号登录",
                      )}
                    </Txt>
                  </Row>
                </Pressable>
                {staffLogin && (
                  <>
                    <Field
                      label={t(
                        "Six-digit authenticator code",
                        "六位身份验证器验证码",
                      )}
                      value={otp}
                      onChangeText={setOtp}
                      maxLength={6}
                      keyboardType="number-pad"
                      autoComplete="one-time-code"
                      secureTextEntry
                    />
                    <Txt small>
                      {t(
                        "Each code can be used once. After setup or a recent login, wait for the next code.",
                        "每个验证码只能使用一次。刚完成设置或登录后，请等待下一组验证码。",
                      )}
                    </Txt>
                  </>
                )}
              </>
            )}
            {!!message && <Notice text={message} />}
            <Button
              label={
                busy
                  ? t("Please wait…", "请稍候……")
                  : mode === "login"
                    ? t("Let’s get cubing", "开始探索")
                    : mode === "register"
                      ? t("Create account", "创建账号")
                      : t("Send email", "发送邮件")
              }
              onPress={() => void submit()}
              disabled={
                busy ||
                (storageUnavailable &&
                  (mode === "login" || mode === "register")) ||
                !regionReady ||
                (mode === "register" && !agree)
              }
            />
            <Txt
              small
              style={{ color: c.muted }}
              accessibilityLiveRegion="polite"
            >
              {regionReady
                ? t("Community: ", "所属社区：") +
                  (region === "CN"
                    ? t("Mainland China", "中国大陆")
                    : t("International", "国际社区"))
                : t(
                    "Community detection is unavailable.",
                    "暂时无法检测社区。",
                  )}
            </Txt>
            {regionReady && (
              <Txt small style={{ color: c.muted }}>
                {t(
                  "Chosen automatically from your connection. Accounts stay separate; VPNs can affect detection.",
                  "社区根据网络连接自动确定，账号仍相互独立；VPN 可能影响检测结果。",
                )}
              </Txt>
            )}
            {!!regionError && <Notice text={regionError} error />}
            {!regionReady && (
              <Button
                kind="secondary"
                label={t("Retry community detection", "重试社区检测")}
                onPress={() => {
                  setBusy(true);
                  void detectRegion()
                    .catch(() => {})
                    .finally(() => setBusy(false));
                }}
                disabled={busy}
              />
            )}
            <Row>
              <Pressable
                onPress={() => setMode("forgot")}
                style={{ paddingVertical: 12 }}
              >
                <Txt small style={{ color: c.green }}>
                  {t("Forgot password?", "忘记密码？")}
                </Txt>
              </Pressable>
              <Pressable
                onPress={() => setMode("resend")}
                style={{ paddingVertical: 12 }}
              >
                <Txt small style={{ color: c.green }}>
                  {t("Resend verification", "重发验证邮件")}
                </Txt>
              </Pressable>
            </Row>
          </Card>
        </View>
        <Row
          style={{
            justifyContent: "center",
            borderTopWidth: 1,
            borderTopColor: c.line,
            paddingTop: 12,
          }}
        >
          {[
            ["privacy", "Privacy", "隐私"],
            ["terms", "Terms", "协议"],
            ["support", "Support", "支持"],
            ["deletion", "Delete account", "注销账号"],
          ].map(([slug, en, zh]) => (
            <Pressable
              key={slug}
              accessibilityRole="link"
              onPress={() => router.push(`/legal/${slug}`)}
              style={{ padding: 10 }}
            >
              <Txt small style={{ color: c.muted }}>
                {t(en, zh)}
              </Txt>
            </Pressable>
          ))}
        </Row>
      </Screen>
    </KeyboardAvoidingView>
  );
}
