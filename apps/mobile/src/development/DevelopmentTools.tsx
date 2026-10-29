import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  Share,
  Switch,
  Text,
  View,
} from "react-native";
import { reloadAppAsync } from "expo";
import { Scanner } from "../Scanner";
import { ScanTurnReview } from "./ScanTurnReview";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Card,
  Chip,
  Field,
  Heading,
  Notice,
  Row,
  Screen,
  Txt,
  useTheme,
} from "../ui";
import { useApp } from "../state";
import { withTimeout } from "../timeout";
import {
  DEVELOPMENT_BUILD,
  bundledEndpoints,
  developmentRuntime,
} from "./config";
import {
  defaultDevelopmentSettings,
  sameDevelopmentServers,
  validateDevelopmentSettings,
  type DevelopmentSettings,
} from "./runtime";
import {
  clearDevelopmentTokens,
  readDevelopmentSettings,
  saveDevelopmentSettings,
} from "./storage";

export function DevelopmentBootstrap({
  children,
}: {
  children: React.ReactNode;
}) {
  const c = useTheme();
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setError(false);
    void (async () => {
      try {
        const saved = await Promise.race([
          readDevelopmentSettings(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Development storage timeout")),
              8000,
            );
          }),
        ]);
        if (!active) return;
        const next = saved || defaultDevelopmentSettings(bundledEndpoints);
        if (!saved) {
          await clearDevelopmentTokens();
          await saveDevelopmentSettings(next);
        }
        if (!active) return;
        developmentRuntime.configure(next);
        setReady(true);
      } catch {
        if (active) setError(true);
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [revision]);
  if (ready) return children;
  if (!error)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator accessibilityLabel="Loading Cubers" color={c.blue} />
      </View>
    );
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 28,
        gap: 20,
        backgroundColor: "#f5f2e9",
      }}
    >
      <Text style={{ fontSize: 24, color: "#111827" }}>
        Cubers · Development / 开发版
      </Text>
      <Text style={{ color: "#111827" }}>
        {error
          ? "Development settings could not be read. Retry, or reset only development settings and sign-in. / 无法读取开发设置。请重试，或重置开发设置与登录信息。"
          : "Loading development settings… / 正在读取开发设置…"}
      </Text>
      {error ? (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRevision((v) => v + 1)}
            style={{
              padding: 18,
              backgroundColor: "#ffe000",
              borderRadius: 18,
            }}
          >
            <Text>Retry / 重试</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void (async () => {
                try {
                  await clearDevelopmentTokens();
                  await saveDevelopmentSettings(
                    defaultDevelopmentSettings(bundledEndpoints),
                  );
                  setRevision((v) => v + 1);
                } catch {
                  setError(true);
                }
              })();
            }}
            style={{ padding: 18, backgroundColor: "white", borderRadius: 18 }}
          >
            <Text>
              Reset development settings and sign-in / 重置开发设置与登录
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

async function restart() {
  if (Platform.OS === "web") {
    window.location.reload();
    return;
  }
  await reloadAppAsync();
}
function ToolsPanel({ close }: { close: () => void }) {
  const {
    t,
    locale,
    setLocale,
    region,
    token,
    loading,
    storageUnavailable,
    regionReady,
    resetDevelopmentSession,
  } = useApp();
  const [tab, setTab] = useState("servers"),
    [settings, setSettings] = useState(developmentRuntime.settings);
  const [timeout, setTimeoutText] = useState(String(settings.timeoutMs)),
    [latency, setLatency] = useState(String(settings.latencyMs));
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [mustReload, setMustReload] = useState(false),
    [, refresh] = useState(0);
  const [scanTest, setScanTest] = useState(false),
    [turnTest, setTurnTest] = useState(false),
    [scanSize, setScanSize] = useState<2 | 3 | 4>(3);
  useEffect(
    () => developmentRuntime.subscribe(() => refresh((v) => v + 1)),
    [],
  );
  const draft = () =>
    validateDevelopmentSettings({
      ...settings,
      timeoutMs: Number(timeout),
      latencyMs: Number(latency),
    });
  async function apply(next: DevelopmentSettings) {
    setBusy(true);
    setMessage("");
    let stored = false;
    try {
      const serversChanged = !sameDevelopmentServers(
        next,
        developmentRuntime.settings,
      );
      if (serversChanged) {
        developmentRuntime.lock();
        await resetDevelopmentSession!();
        await saveDevelopmentSettings(next);
        stored = true;
        setMustReload(true);
        await restart();
      } else {
        await saveDevelopmentSettings(next);
        developmentRuntime.configure(next);
        setMessage(t("Development parameters saved.", "开发参数已保存。"));
      }
    } catch {
      if (!stored) developmentRuntime.unlock();
      setMessage(
        stored
          ? t(
              "Settings saved. Reload to finish changing servers.",
              "设置已保存，请重新加载以完成服务器切换。",
            )
          : t(
              "Could not save settings. Check the addresses and parameter ranges.",
              "无法保存设置，请检查地址与参数范围。",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setBusy(true);
    setMessage("");
    try {
      const value = draft(),
        results: string[] = [];
      for (const name of ["INTL", "CN", "discovery"] as const) {
        try {
          const result = await withTimeout(async (signal) => {
            const response = await fetch(
              value.endpoints[name] +
                (name === "discovery" ? "/v1/community-region" : "/v1/health"),
              {
                signal,
                credentials: "omit",
                redirect: "error",
                headers: { Accept: "application/json" },
              },
            );
            if (!response.ok) throw new Error("Unavailable");
            const body = await response.json();
            const detected = name === "discovery" ? body.region : body.region;
            if (!["CN", "INTL"].includes(detected))
              throw new Error("Unexpected response");
            if (name !== "discovery" && body.status !== "ok")
              throw new Error("Unexpected health");
            return detected as string;
          }, 8000);
          results.push(`${name}: ${t("connected", "已连接")} · ${result}`);
        } catch {
          results.push(
            `${name}: ${t("unavailable or unexpected response", "无法连接或响应不符")}`,
          );
        }
      }
      setMessage(results.join("\n"));
    } catch {
      setMessage(
        t("Enter valid server origins first.", "请先填写有效的服务器地址。"),
      );
    } finally {
      setBusy(false);
    }
  }
  const report = JSON.stringify(
    {
      app: "Cubers development",
      version: Constants.expoConfig?.version,
      platform: Platform.OS,
      locale,
      region,
      signedIn: !!token,
      sessionLoading: loading,
      storageUnavailable,
      regionReady,
      settings: developmentRuntime.settings,
      pendingRequests: developmentRuntime.pendingRequests,
      requests: developmentRuntime.diagnostics,
    },
    null,
    2,
  );
  return (
    <Screen>
      <Button
        kind="secondary"
        disabled={busy || mustReload}
        label={t("Close development settings", "关闭开发设置")}
        onPress={close}
      />
      <Heading>{t("Development settings", "开发设置")}</Heading>
      <Txt>
        {t(
          "These controls exist only in this development app. Server changes clear development sign-in and reload the app. No server data is deleted.",
          "这些功能仅存在于开发版。切换服务器会清除开发版登录并重新加载，不删除服务器数据。",
        )}
      </Txt>
      <Row>
        {[
          ["servers", t("Servers", "服务器")],
          ["network", t("Network", "网络")],
          ["diagnostics", t("Diagnostics", "诊断")],
        ].map(([key, label]) => (
          <Chip
            key={key}
            label={label}
            selected={tab === key}
            onPress={() => setTab(key)}
          />
        ))}
      </Row>
      {message ? <Notice text={message} /> : null}
      {mustReload ? (
        <Button
          disabled={busy}
          label={t("Reload to finish", "重新加载并完成")}
          onPress={() => {
            void restart().catch(() =>
              setMessage(
                t(
                  "Close and reopen the app to finish.",
                  "请关闭并重新打开应用以完成。",
                ),
              ),
            );
          }}
        />
      ) : null}
      {tab === "servers" ? (
        <Card>
          <Txt>
            {t(
              "Enter origins such as https://api.example.com or http://192.168.1.20:3000. The server still determines the community. Connection checks send no sign-in details and ignore network simulation.",
              "填写源地址，例如 https://api.example.com 或 http://192.168.1.20:3000。社区仍由服务器判断。连接检测不发送登录信息，且不受网络模拟影响。",
            )}
          </Txt>
          {(["INTL", "CN", "discovery"] as const).map((key) => (
            <Field
              key={key}
              label={
                key === "INTL"
                  ? t("International API origin", "国际 API 地址")
                  : key === "CN"
                    ? t("Mainland API origin", "中国大陆 API 地址")
                    : t("Community discovery origin", "社区检测地址")
              }
              value={settings.endpoints[key]}
              editable={!busy && !mustReload}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={(value) =>
                setSettings((s) => ({
                  ...s,
                  endpoints: { ...s.endpoints, [key]: value },
                }))
              }
            />
          ))}
          <Button
            kind="secondary"
            disabled={busy || mustReload}
            label={t(
              "Use International address for all fields",
              "全部使用国际 API 地址",
            )}
            onPress={() =>
              setSettings((s) => ({
                ...s,
                endpoints: {
                  INTL: s.endpoints.INTL,
                  CN: s.endpoints.INTL,
                  discovery: s.endpoints.INTL,
                },
              }))
            }
          />
          <Button
            kind="secondary"
            disabled={busy || mustReload}
            label={t("Check servers without signing in", "不登录检测服务器")}
            onPress={() => void check()}
          />
          <Button
            disabled={busy || mustReload}
            label={t("Save servers and reload", "保存服务器并重新加载")}
            onPress={() => {
              try {
                void apply(draft());
              } catch {
                setMessage(
                  t(
                    "Use valid HTTP/HTTPS origins without paths, credentials or queries.",
                    "请使用有效的 HTTP/HTTPS 源地址，不含路径、凭据或查询参数。",
                  ),
                );
              }
            }}
          />
        </Card>
      ) : null}
      {tab === "network" ? (
        <Card>
          <Txt>
            {t(
              "Simulation applies to API and community-detection HTTP requests. Game sockets, media uploads and camera/Bluetooth still use their real connections.",
              "模拟作用于 API 和社区检测的 HTTP 请求。游戏连接、媒体上传及摄像头/蓝牙仍使用真实连接。",
            )}
          </Txt>
          <Field
            label={t(
              "Request timeout (500–60000 ms)",
              "请求超时（500–60000 毫秒）",
            )}
            value={timeout}
            keyboardType="number-pad"
            editable={!busy && !mustReload}
            onChangeText={setTimeoutText}
          />
          <Field
            label={t("Extra latency (0–10000 ms)", "额外延迟（0–10000 毫秒）")}
            value={latency}
            keyboardType="number-pad"
            editable={!busy && !mustReload}
            onChangeText={setLatency}
          />
          <Txt>{t("Simulate HTTP offline", "模拟 HTTP 离线")}</Txt>
          <Switch
            accessibilityLabel={t("Simulate HTTP offline", "模拟 HTTP 离线")}
            value={settings.offline}
            disabled={busy || mustReload}
            onValueChange={(offline) => setSettings((s) => ({ ...s, offline }))}
          />
          <Button
            disabled={busy || mustReload}
            label={t("Save development parameters", "保存开发参数")}
            onPress={() => {
              try {
                void apply(draft());
              } catch {
                setMessage(
                  t(
                    "Check timeout and latency ranges.",
                    "请检查超时与延迟范围。",
                  ),
                );
              }
            }}
          />
          <Button
            kind="secondary"
            disabled={busy || mustReload}
            label={t("Reset network simulation", "重置网络模拟")}
            onPress={() => {
              const next = {
                ...developmentRuntime.settings,
                timeoutMs: 15000,
                latencyMs: 0,
                offline: false,
              };
              setSettings(next);
              setTimeoutText("15000");
              setLatency("0");
              void apply(next);
            }}
          />
        </Card>
      ) : null}
      {tab === "diagnostics" ? (
        <Card>
          <Txt>
            {t(
              "Local camera test. No account, lesson progress or server request is created.",
              "本机相机测试，不创建账号、课程进度或服务器请求。",
            )}
          </Txt>
          <Row>
            {([2, 3, 4] as const).map((size) => (
              <Chip
                key={size}
                label={`${size}×${size}`}
                selected={scanSize === size}
                onPress={() => {
                  setScanTest(false);
                  setScanSize(size);
                }}
              />
            ))}
          </Row>
          <Button
            kind="secondary"
            disabled={busy || mustReload}
            label={
              scanTest
                ? t("Close scanner test", "关闭扫描测试")
                : t("Test automatic cube scanning", "测试自动魔方扫描")
            }
            onPress={() => setScanTest((value) => !value)}
          />
          <Modal
            visible={scanTest}
            animationType="none"
            presentationStyle="fullScreen"
            onRequestClose={() => setScanTest(false)}
          >
            {scanTest ? (
              <Screen>
                <Button
                  kind="secondary"
                  label={t("Close camera test", "关闭相机测试")}
                  onPress={() => setScanTest(false)}
                />
                <Scanner
                  size={scanSize}
                  onState={() => {
                    setScanTest(false);
                    setMessage(
                      t(
                        "The local cube scan is physically valid. No progress was saved or sent.",
                        "本机扫描的魔方状态符合物理规则，未保存或发送课程进度。",
                      ),
                    );
                  }}
                />
              </Screen>
            ) : null}
          </Modal>
          <Button
            kind="secondary"
            label={t("Review scan turn animation", "检查扫描转动动画")}
            onPress={() => setTurnTest(true)}
          />
          <Modal
            visible={turnTest}
            animationType="none"
            presentationStyle="fullScreen"
            onRequestClose={() => setTurnTest(false)}
          >
            {turnTest ? (
              <ScanTurnReview
                size={scanSize}
                close={() => setTurnTest(false)}
              />
            ) : null}
          </Modal>
          <Button
            kind="secondary"
            disabled={busy || mustReload || Platform.OS === "web" || !__DEV__}
            label={t(
              "Open React Native developer menu",
              "打开 React Native 开发菜单",
            )}
            onPress={() => {
              try {
                if (
                  !DEVELOPMENT_BUILD ||
                  !__DEV__ ||
                  Platform.OS === "web" ||
                  typeof NativeModules.DevMenu?.show !== "function"
                )
                  throw new Error("Unavailable");
                NativeModules.DevMenu.show();
              } catch {
                setMessage(
                  t(
                    "The native developer menu is unavailable in this runtime. Use the Metro debug build.",
                    "当前运行环境不提供原生开发菜单，请使用连接 Metro 的调试构建。",
                  ),
                );
              }
            }}
          />
          <Txt small>
            {t(
              "React Native's developer menu requires the native Metro debug build. Standalone embedded-code builds keep it disabled; web debugging uses your browser tools.",
              "React Native 开发菜单需要连接 Metro 的原生调试构建。内嵌代码的独立构建不启用此菜单；网页版请使用浏览器开发工具。",
            )}
          </Txt>
          <Row>
            <Chip
              label="English"
              selected={locale === "en"}
              onPress={() => setLocale("en")}
            />
            <Chip
              label="中文"
              selected={locale === "zh"}
              onPress={() => setLocale("zh")}
            />
          </Row>
          <Txt>
            {t(
              "The last 100 HTTP request summaries stay in memory. Bodies, headers, tokens, account IDs, query strings and raw errors are excluded.",
              "仅在内存中保留最近 100 条 HTTP 请求概要，不记录正文、请求头、令牌、账号 ID、查询参数或原始错误。",
            )}
          </Txt>
          <Txt small selectable>
            {report}
          </Txt>
          <Button
            kind="secondary"
            label={t("Share diagnostics", "分享诊断")}
            onPress={() => {
              void Share.share({ message: report }).catch(() =>
                setMessage(t("Could not open sharing.", "无法打开分享。")),
              );
            }}
          />
          <Button
            kind="secondary"
            label={t("Clear request summaries", "清空请求概要")}
            onPress={() => developmentRuntime.clearDiagnostics()}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
export function DevelopmentTools() {
  const [visible, setVisible] = useState(false),
    c = useTheme(),
    insets = useSafeAreaInsets(),
    { t } = useApp();
  if (!DEVELOPMENT_BUILD) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("Development settings", "开发设置")}
        onPress={() => setVisible(true)}
        style={{
          position: "absolute",
          right: 16,
          bottom: Math.max(insets.bottom, 16) + 82,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: c.paper,
          borderWidth: 2,
          borderColor: c.blue,
          alignItems: "center",
          justifyContent: "center",
          elevation: 8,
          zIndex: 1000,
        }}
      >
        <Ionicons name="settings-outline" size={26} color={c.ink} />
      </Pressable>
      <Modal
        visible={visible}
        animationType="none"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          if (!developmentRuntime.locked) setVisible(false);
        }}
      >
        {visible ? <ToolsPanel close={() => setVisible(false)} /> : null}
      </Modal>
    </>
  );
}
