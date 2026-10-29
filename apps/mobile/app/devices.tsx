import { backOrReplace } from "../src/back-navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  GanGen2Codec,
  GoCubeCodec,
  GiikerCodec,
  SmartCubeSession,
  SmartCubeFrame,
  SMART_HARDWARE_REFERENCE,
  SMART_FIRST_SOLVE_REFERENCE,
  type SmartModel,
  type SmartDeviceAvailability,
  type SmartSessionEvent,
  type SmartPhase,
  type CubeState,
} from "@cubers/core";
import { useApp } from "../src/state";
import { Screen, Card, Txt, Button, Field, Row, useTheme } from "../src/ui";
import { CubeView } from "../src/CubeView";
import {
  createSmartRadio,
  type SmartRadio,
  type SmartCandidate,
} from "../src/smart/radio";
import { SMART_NOTICES } from "../src/smart/notices";

export default function Devices() {
  const { api, user, region, token, locale } = useApp(),
    router = useRouter(),
    c = useTheme();
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const [models, setModels] = useState<SmartDeviceAvailability[]>([]);
  const [model, setModel] = useState<SmartModel>("gan-356-i3");
  const [candidates, setCandidates] = useState<SmartCandidate[]>([]);
  const [phase, setPhase] = useState<SmartPhase>("disconnected");
  const [state, setState] = useState<CubeState | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [moves, setMoves] = useState<string[]>([]);
  const [hardwareMoves, setHardwareMoves] = useState<string[]>([]);
  const [reference, setReference] = useState<"hardware" | "first-solve">(
    "hardware",
  );
  const [address, setAddress] = useState("");
  const [pendingAddress, setPendingAddress] = useState(false);
  const [busy, setBusy] = useState(false),
    [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [notices, setNotices] = useState(false);
  const generation = useRef(0),
    frame = useRef(new SmartCubeFrame(SMART_HARDWARE_REFERENCE)),
    cleanup = useRef<Promise<void>>(Promise.resolve()),
    radio = useRef<SmartRadio | null>(null),
    session = useRef<SmartCubeSession | null>(null);
  const pending = useRef<Awaited<ReturnType<SmartRadio["connect"]>> | null>(
    null,
  );
  const development = __DEV__ && Platform.OS !== "web";

  function dispose() {
    generation.current++;
    const oldSession = session.current,
      oldRadio = radio.current,
      oldPending = pending.current;
    session.current = null;
    radio.current = null;
    pending.current = null;
    const releasing = Promise.allSettled([
      Promise.resolve().then(() => oldSession?.close()),
      Promise.resolve().then(() => oldPending?.transport.disconnect()),
      Promise.resolve().then(() => oldRadio?.close()),
    ]);
    cleanup.current = Promise.allSettled([cleanup.current, releasing]).then(
      () => {},
    );
  }
  function disconnect() {
    dispose();
    setPhase("disconnected");
    setState(null);
    setMoves([]);
    setHardwareMoves([]);
    setBattery(null);
    setAddress("");
    setPendingAddress(false);
    setCandidates([]);
    setBusy(false);
    setScanning(false);
    setError("");
  }
  function changeReference(next: "hardware" | "first-solve") {
    // Never reinterpret an active connection's earlier turns in a new frame.
    disconnect();
    frame.current = new SmartCubeFrame(
      next === "hardware"
        ? SMART_HARDWARE_REFERENCE
        : SMART_FIRST_SOLVE_REFERENCE,
    );
    setReference(next);
  }
  useFocusEffect(
    useCallback(() => {
      disconnect();
      return disconnect;
    }, []),
  );
  useEffect(() => {
    let active = true;
    disconnect();
    setModels([]);
    if (user && user.permissions.canLearn)
      void api<{ devices: SmartDeviceAvailability[] }>("devices")
        .then((result) => {
          if (active) setModels(result.devices);
        })
        .catch(() => {
          if (active)
            setError(
              t(
                "Device availability could not be loaded. Try again later.",
                "暂时无法加载设备状态，请稍后重试。",
              ),
            );
        });
    const subscription = AppState.addEventListener("change", (value) => {
      if (value !== "active") disconnect();
    });
    return () => {
      active = false;
      subscription.remove();
      dispose();
    };
  }, [user?.id, user?.permissions.canLearn, region, token]);

  async function scan() {
    disconnect();
    if (!development || !user?.permissions.canLearn || !models.length) return;
    const epoch = generation.current;
    setScanning(true);
    try {
      // The previous native manager must finish closing before another manager
      // is created, including after a reference/account change during cleanup.
      await cleanup.current;
      if (epoch !== generation.current) return;
      const current = createSmartRadio();
      radio.current = current;
      await current.scan(model, (devices) => {
        if (epoch === generation.current) setCandidates(devices);
      });
    } catch {
      if (epoch === generation.current)
        setError(
          t(
            "Could not scan. Check Bluetooth, permission and the native development build.",
            "无法扫描，请检查蓝牙、权限及原生开发版本。",
          ),
        );
    } finally {
      if (epoch === generation.current) setScanning(false);
    }
  }
  async function initialize(
    connection: NonNullable<typeof pending.current>,
    mac?: string,
  ) {
    const epoch = generation.current,
      projection = frame.current;
    try {
      const codec =
        model === "gan-356-i3"
          ? new GanGen2Codec(mac || "")
          : model === "gocube-edge"
            ? new GoCubeCodec()
            : new GiikerCodec();
      const current = new SmartCubeSession(
        connection.transport,
        codec,
        (received: SmartSessionEvent) => {
          if (epoch !== generation.current) return;
          let event: SmartSessionEvent;
          try {
            event = projection.project(received);
          } catch {
            disconnect();
            setError(
              t(
                "The cube reference could not be validated. Reconnect and check every face.",
                "无法核验魔方参照方向，请重新连接并逐面核对。",
              ),
            );
            return;
          }
          if (event.type === "status") {
            setPhase(event.phase);
            if (event.phase === "disconnected" || event.phase === "resync") {
              setState(null);
              setMoves([]);
              setHardwareMoves([]);
              setBattery(null);
            }
            if (event.phase === "resync")
              setError(
                t(
                  "Tracking paused. Stop turning and synchronize again.",
                  "追踪已暂停，请停止转动并重新同步。",
                ),
              );
          } else if (event.type === "state") setState(event.state);
          else if (event.type === "battery") setBattery(event.percent);
          else if (event.type === "move") {
            setMoves((previous) => [...previous, event.move.move].slice(-30));
            if (received.type === "move")
              setHardwareMoves((previous) =>
                [...previous, received.move.move].slice(-30),
              );
          }
        },
      );
      session.current = current;
      pending.current = null;
      setPendingAddress(false);
      setAddress("");
      await current.start();
      if (epoch !== generation.current) await current.close();
    } catch {
      if (epoch === generation.current) {
        dispose();
        setBusy(false);
        setScanning(false);
        setState(null);
        setPhase("disconnected");
        setPendingAddress(false);
        setAddress("");
        setError(
          t(
            "Could not synchronize this cube. Check the exact model, services and GAN address, then reconnect.",
            "无法同步，请核对具体型号、蓝牙服务及 GAN 地址，然后重新连接。",
          ),
        );
      }
    }
  }
  async function connect(candidate: SmartCandidate) {
    if (!development || !radio.current || busy) return;
    const epoch = generation.current,
      current = radio.current;
    setBusy(true);
    setError("");
    current.stopScan();
    setScanning(false);
    setCandidates([]);
    try {
      const connection = await current.connect(candidate.id, model);
      if (epoch !== generation.current) {
        await connection.transport.disconnect();
        return;
      }
      if (model === "gan-356-i3" && !connection.address) {
        pending.current = connection;
        setPendingAddress(true);
      } else await initialize(connection, connection.address);
    } catch {
      if (epoch === generation.current) {
        disconnect();
        setError(
          t(
            "Connection failed. Confirm the selected physical model and scan again.",
            "连接失败，请核对实物型号并重新扫描。",
          ),
        );
      }
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  }
  async function resync() {
    if (!session.current || busy) return;
    const epoch = generation.current;
    setBusy(true);
    setError("");
    setMoves([]);
    setHardwareMoves([]);
    try {
      await session.current.resync();
    } catch {
      if (epoch === generation.current)
        setError(
          t(
            "Reconnect to restore the device connection.",
            "请重新连接以恢复设备通信。",
          ),
        );
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  }
  const statusLabel: Record<SmartPhase, string> = {
    disconnected: t("Disconnected", "未连接"),
    syncing: t("Waiting for a fresh position", "等待新的状态"),
    confirm: t("Check the position", "请核对状态"),
    ready: t("Tracking locally", "本地追踪中"),
    resync: t("Synchronization required", "需要重新同步"),
  };
  if (!user)
    return (
      <Screen>
        <Card>
          <Txt>
            {t(
              "Sign in to view your device options.",
              "请登录后查看设备选项。",
            )}
          </Txt>
          <Button
            label={t("Sign in", "登录")}
            onPress={() => router.replace("/")}
          />
        </Card>
      </Screen>
    );
  return (
    <Screen>
      <Row>
        <Button
          small
          kind="secondary"
          label={t("Back", "返回")}
          onPress={() => {
            disconnect();
            backOrReplace(router, "/settings");
          }}
        />
        <Txt style={{ fontSize: 25, fontWeight: "600" }}>
          {t("Smart cubes", "智能魔方")}
        </Txt>
      </Row>
      <Card>
        <Txt>
          {t(
            "Physical testing is still required. These three models are unavailable for lessons and matches.",
            "这三个型号仍需实机测试，目前不可用于课程或比赛。",
          )}
        </Txt>
        {models.map((device) => (
          <Txt key={device.id}>
            {device.name} /{" "}
            {t("Disabled / not physically tested", "未启用 / 未经实机验证")}
          </Txt>
        ))}
        {!user.permissions.canLearn && (
          <Txt>
            {t(
              "Verified guardian permission is required.",
              "需要经过核验的监护人授权。",
            )}
          </Txt>
        )}
      </Card>
      {development && user.permissions.canLearn && models.length > 0 && (
        <>
          <Card>
            <Txt style={{ fontWeight: "600" }}>
              {t("Development hardware test", "开发版实机测试")}
            </Txt>
            <Txt small>
              {t(
                "Only the cube you select connects. Position, address and turns stay in memory and are cleared on leaving, locking the phone or signing out. This test saves no progress or results.",
                "仅连接你选择的魔方。状态、地址和转动只保存在内存中，离开页面、锁屏或退出登录时清除。本测试不记录学习进度或成绩。",
              )}
            </Txt>
            <Txt small>
              {t(
                "On older Android versions, Bluetooth scanning requires the location permission. Cubers does not read GPS coordinates.",
                "旧版 Android 的蓝牙扫描需要位置权限，Cubers 不读取 GPS 坐标。",
              )}
            </Txt>
            <Txt style={{ fontWeight: "600" }}>
              {t("Cube reference", "魔方参照方向")}
            </Txt>
            <Button
              kind={reference === "hardware" ? "primary" : "secondary"}
              disabled={busy}
              label={t("White up / green front", "白色朝上 / 绿色朝前")}
              onPress={() => changeReference("hardware")}
            />
            <Button
              kind={reference === "first-solve" ? "primary" : "secondary"}
              disabled={busy}
              label={t(
                "Lesson reference: white down / green front",
                "课程方向：白色朝下 / 绿色朝前",
              )}
              onPress={() => changeReference("first-solve")}
            />
            <Txt small>
              {t(
                "Changing the reference disconnects and clears earlier turns. Reconnect and check all faces in the new hold. This comparison saves no lesson progress.",
                "切换参照方向会断开连接并清除先前转动，请重新连接，按新方向持握并逐面核对。本核对不记录课程进度。",
              )}
            </Txt>
            {models.map((device) => (
              <Button
                key={device.id}
                kind={model === device.id ? "primary" : "secondary"}
                disabled={busy}
                label={device.name}
                onPress={() => {
                  disconnect();
                  setModel(device.id);
                }}
              />
            ))}
            <Txt small>
              {t(
                "Confirm the exact model on the physical cube before selecting it. An advertised name alone cannot identify a model.",
                "选择前请核对实物的准确型号，广播名称本身无法确定型号。",
              )}
            </Txt>
            <Button
              disabled={
                busy || scanning || phase !== "disconnected" || pendingAddress
              }
              label={
                scanning
                  ? t("Scanning…", "扫描中…")
                  : t("Scan nearby cubes", "扫描附近魔方")
              }
              onPress={() => void scan()}
            />
            {scanning && (
              <Button
                kind="secondary"
                label={t("Stop scanning", "停止扫描")}
                onPress={() => {
                  radio.current?.stopScan();
                  setScanning(false);
                }}
              />
            )}
            {candidates.map((candidate, i) => (
              <Button
                kind="secondary"
                key={candidate.id}
                disabled={busy}
                label={`${candidate.name} / ${i + 1}`}
                onPress={() => void connect(candidate)}
              />
            ))}
          </Card>
          {pendingAddress && (
            <Card>
              <Txt>
                {t(
                  "This GAN cube needs its Bluetooth address. Use the address printed on the device or obtained from its manufacturer tools. Do not guess it.",
                  "此 GAN 魔方需要蓝牙地址，请使用设备标注或厂商工具提供的地址，不要猜测。",
                )}
              </Txt>
              <Field
                label={t(
                  "Bluetooth address (local only)",
                  "蓝牙地址（仅保存在本地内存）",
                )}
                value={address}
                onChangeText={setAddress}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={17}
                placeholder="AA:BB:CC:DD:EE:FF"
              />
              <Button
                disabled={
                  busy || !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(address)
                }
                label={t("Synchronize", "同步")}
                onPress={() => {
                  const connection = pending.current;
                  if (connection) {
                    setBusy(true);
                    const epoch = generation.current;
                    void initialize(connection, address).finally(() => {
                      if (epoch === generation.current) setBusy(false);
                    });
                  }
                }}
              />
            </Card>
          )}
          <Card>
            <Txt>{statusLabel[phase]}</Txt>
            <Txt small>
              {t("Battery", "电量")}:{" "}
              {battery === null ? t("Unknown", "未知") : `${battery}%`}
            </Txt>
            <Txt small>
              {reference === "first-solve"
                ? t(
                    "Hold white down, yellow up and green front, as in the beginner lesson. Check every face against the displayed position before confirming.",
                    "请按入门课程保持白色朝下、黄色朝上、绿色朝前，确认前逐面核对显示状态。",
                  )
                : t(
                    "Hold white up and green front. Check every face against the displayed position before confirming.",
                    "请保持白色朝上、绿色朝前，确认前逐面核对显示状态。",
                  )}
            </Txt>
            <Txt small>
              {t(
                "Turn letters name positions in this hold, not colors. Whole-cube reorientation is not detected. If you change your hold, stop, align the cube and reconnect. A normal camera scan is a snapshot, not continuous tracking.",
                "转动字母表示当前持握方向的位置，不是颜色。本测试不检测整颗魔方的朝向变化；若改变持握方向，请停止转动，对齐魔方并重新连接。普通相机扫描仅反映扫描时的状态，不能持续追踪转动。",
              )}
            </Txt>
            {state && <CubeView state={state} lastMove={moves.at(-1)} />}
            {phase === "confirm" && (
              <Button
                label={t(
                  "All faces match my physical cube",
                  "所有面均与实物一致",
                )}
                onPress={() => {
                  try {
                    session.current?.confirm();
                    setError("");
                  } catch {
                    setError(
                      t("Wait for a fresh position.", "请等待新的状态。"),
                    );
                  }
                }}
              />
            )}
            {phase === "resync" && (
              <Button
                disabled={busy}
                label={t("Synchronize again", "重新同步")}
                onPress={() => void resync()}
              />
            )}
            <Txt small>
              {t("Recent turns in this reference", "当前参照下的最近转动")}:{" "}
              {moves.join(" ") || "—"}
            </Txt>
            {reference === "first-solve" && (
              <Txt small>
                {t(
                  "Device-reference turns for comparison",
                  "用于对照的设备参照转动",
                )}
                : {hardwareMoves.join(" ") || "—"}
              </Txt>
            )}
            <Txt small>
              {model === "gan-356-i3"
                ? t(
                    "The hardware counter detects gaps within its limited history. It does not certify a match.",
                    "硬件计数器可检测有限历史中的缺口，不能认证比赛。",
                  )
                : model === "giiker-i3s"
                  ? t(
                      "Each received state is checked against the latest turn. There is no hardware move counter, so complete move history cannot be proven.",
                      "每次收到的状态均与最新转动核对。设备没有转动计数器，因此无法证明完整转动历史。",
                    )
                  : t(
                      "Turns remain provisional until a fresh state agrees. This protocol cannot prove uninterrupted move history.",
                      "转动需等待新的状态核对，本协议无法证明转动历史从未中断。",
                    )}
            </Txt>
            <Button
              kind="secondary"
              label={t("Disconnect and clear", "断开并清除")}
              onPress={disconnect}
            />
          </Card>
        </>
      )}
      {!!error && (
        <Card>
          <Txt style={{ color: c.red }}>{error}</Txt>
        </Card>
      )}
      <Card>
        <Button
          kind="secondary"
          label={t("Open-source notices", "开源许可声明")}
          onPress={() => setNotices(!notices)}
        />
        {notices && <Txt small>{SMART_NOTICES}</Txt>}
      </Card>
    </Screen>
  );
}
