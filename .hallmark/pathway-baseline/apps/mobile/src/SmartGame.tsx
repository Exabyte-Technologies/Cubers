import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  GanGen2Codec,
  GoCubeCodec,
  GiikerCodec,
  SmartCubeSession,
  applyMoves,
  solvedCube,
  stateKey,
  type CubeState,
  type SmartModel,
  type SmartAttemptView,
  type SmartDeviceAvailability,
} from "@cubers/core";
import { useApp } from "./state";
import { Card, Row, Button, Txt, Notice, Field } from "./ui";
import { CubeView } from "./CubeView";
import {
  createSmartPlayRadio,
  type SmartRadio,
  type SmartCandidate,
  type SmartConnection,
} from "./smart/radio";
import { SmartAttemptLink } from "./smart/attempt-link";
import { appVerification } from "./verification/native";
import { VerificationError } from "./verification/client";
import { verificationMessage } from "./verification/messages";
import type { AppAttestationOperation } from "@cubers/core";
export function SmartGame({
  attempt,
  ranked,
  onChange,
  onInterrupted,
}: {
  attempt: SmartAttemptView;
  ranked: boolean;
  onChange: (row: SmartAttemptView) => void;
  onInterrupted: (reason: string) => void;
}) {
  const { api, t, locale } = useApp(),
    [models, setModels] = useState<SmartDeviceAvailability[]>([]),
    [model, setModel] = useState<SmartModel>("gan-356-i3"),
    [candidates, setCandidates] = useState<SmartCandidate[]>([]),
    [state, setState] = useState<CubeState>(),
    [phase, setPhase] = useState("disconnected"),
    [battery, setBattery] = useState<number | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [address, setAddress] = useState(""),
    [needsAddress, setNeedsAddress] = useState(false),
    [saved, setSaved] = useState<SmartAttemptView>();
  const callbacks = useRef({ onChange, onInterrupted });
  callbacks.current = { onChange, onInterrupted };
  const generation = useRef(0),
    operation = useRef(false),
    radio = useRef<SmartRadio | null>(null),
    native = useRef<SmartCubeSession | null>(null),
    link = useRef<SmartAttemptLink | null>(null),
    pending = useRef<SmartConnection | null>(null),
    cleanup = useRef(Promise.resolve());
  const stop = useCallback(() => {
    appVerification.cancel();
    generation.current++;
    operation.current = false;
    const old = [
      link.current?.close(),
      native.current?.close(),
      pending.current?.transport.disconnect(),
      radio.current?.close(),
    ];
    link.current = null;
    native.current = null;
    pending.current = null;
    radio.current = null;
    cleanup.current = Promise.allSettled([cleanup.current, ...old]).then(
      () => {},
    );
    setState(undefined);
    setPhase("disconnected");
    setCandidates([]);
    setNeedsAddress(false);
    setAddress("");
    setBattery(null);
    setBusy(false);
    return cleanup.current;
  }, []);
  useFocusEffect(
    useCallback(() => {
      void stop();
      let active = true;
      setModels([]);
      setSaved(undefined);
      void api<{ devices: SmartDeviceAvailability[] }>("devices")
        .then((value) => {
          if (active) setModels(value.devices);
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
      const subscription = AppState.addEventListener("change", (value) => {
        if (value !== "active") {
          void stop();
          callbacks.current.onInterrupted(
            "Keep Cubers open; this physical attempt cannot resume after interruption",
          );
        }
      });
      return () => {
        active = false;
        subscription.remove();
        void stop();
      };
    }, [api, attempt.id, stop]),
  );
  useEffect(() => {
    if (
      [
        "INTERRUPTED",
        "EXPIRED",
        "REJECTED",
        "APPROVED",
        "PROVISIONAL",
      ].includes(attempt.status)
    )
      void stop();
  }, [attempt.status, stop]);
  const entry = models.find((row) => row.id === model),
    available =
      (Platform.OS === "ios" || Platform.OS === "android") &&
      !!entry?.enabled &&
      entry.physicallyTested &&
      entry.playEnabled &&
      entry.playPlatforms.includes(Platform.OS);
  async function work(task: (epoch: number) => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    const epoch = generation.current;
    setBusy(true);
    setMessage("");
    try {
      await task(epoch);
    } catch (e) {
      if (epoch === generation.current) {
        const reason = (e as Error).message;
        void stop();
        setMessage(reason);
        callbacks.current.onInterrupted(reason);
      }
    } finally {
      if (epoch === generation.current) {
        operation.current = false;
        setBusy(false);
      }
    }
  }
  async function scan() {
    const stopped = stop(),
      epoch = generation.current;
    operation.current = true;
    setBusy(true);
    await stopped;
    if (epoch !== generation.current) return;
    try {
      if (!available || attempt.status !== "CREATED") return;
      const current = createSmartPlayRadio(model);
      radio.current = current;
      await current.scan(model, (items) => {
        if (epoch === generation.current) setCandidates(items);
      });
    } catch (e) {
      if (epoch === generation.current) {
        const reason = (e as Error).message;
        void stop();
        setMessage(reason);
        callbacks.current.onInterrupted(reason);
      }
    } finally {
      if (epoch === generation.current) {
        operation.current = false;
        setBusy(false);
      }
    }
  }
  async function initialize(
    connection: SmartConnection,
    epoch: number,
    mac?: string,
  ) {
    const currentLink = new SmartAttemptLink(
      async <T,>(path: string, body?: unknown, method?: string): Promise<T> => {
        const action = path.match(
          /^attempts\/([a-f0-9-]+)\/(inspect|start|finish)$/,
        );
        if (!ranked || !action) return api<T>(path, body, method);
        try {
          return await appVerification.perform<T>(
            action[1],
            action[2] as AppAttestationOperation,
            body,
          );
        } catch (error) {
          if (error instanceof VerificationError)
            throw new Error(verificationMessage(error, locale));
          throw error;
        }
      },
      { id: attempt.id, model, platform: Platform.OS as "ios" | "android" },
      (row) => {
        if (epoch === generation.current) {
          setSaved(row);
          callbacks.current.onChange(row);
        }
      },
      (reason) => {
        if (epoch === generation.current) {
          void stop();
          setMessage(reason);
          callbacks.current.onInterrupted(reason);
        }
      },
    );
    link.current = currentLink;
    const codec =
      model === "gan-356-i3"
        ? new GanGen2Codec(mac || "")
        : model === "gocube-edge"
          ? new GoCubeCodec()
          : new GiikerCodec();
    const current = new SmartCubeSession(
      connection.transport,
      codec,
      (event) => {
        if (epoch !== generation.current) return;
        currentLink.observe(event);
        if (event.type === "state") setState(event.state);
        if (event.type === "battery") setBattery(event.percent);
        if (event.type === "status") {
          setPhase(event.phase);
          if (["disconnected", "resync"].includes(event.phase)) {
            void stop();
            callbacks.current.onInterrupted(
              "Smart-cube tracking stopped; synchronize a new attempt",
            );
          }
        }
      },
    );
    native.current = current;
    pending.current = null;
    setNeedsAddress(false);
    setAddress("");
    await current.start();
  }
  async function connect(id: string) {
    await work(async (epoch) => {
      if (!radio.current) return;
      radio.current.stopScan();
      const connection = await radio.current.connect(id, model);
      if (epoch !== generation.current) {
        await connection.transport.disconnect();
        return;
      }
      pending.current = connection;
      setCandidates([]);
      if (model === "gan-356-i3" && !connection.address) setNeedsAddress(true);
      else await initialize(connection, epoch, connection.address);
    });
  }
  const matches =
    state &&
    stateKey(state) === stateKey(applyMoves(solvedCube(), attempt.scramble));
  return (
    <Card>
      <Txt style={{ fontWeight: "700", fontSize: 20 }}>
        {t("Smart-cube attempt", "智能魔方尝试")}
      </Txt>
      <Txt>
        {t(
          "Hold white on top and green in front. Confirm the server scramble before inspection. Keep this hold throughout the attempt.",
          "保持白色朝上、绿色朝前；先确认服务器打乱，再开始观察，并在本次尝试中保持此方向。",
        )}
      </Txt>
      <Notice
        text={t(
          "Device reports are cross-checked, but do not prove hardware authenticity. Models without counters cannot prove every intermediate turn. Ranked results require uninterrupted recording and human review.",
          "服务器会核对设备数据，但数据不能证明硬件真实性；无硬件计数器的型号无法证明每次中间转动。排名成绩须全程录像并经人工审核。",
        )}
      />
      {!available && (
        <Notice
          text={t(
            "Smart play remains unavailable until this model and platform pass physical acceptance.",
            "此型号和平台通过实机验收前，智能游戏保持不可用。",
          )}
        />
      )}
      <Row>
        {models.map((row) => (
          <Button
            key={row.id}
            small
            kind="secondary"
            label={row.name + (model === row.id ? " ✓" : "")}
            disabled={busy || phase !== "disconnected" || !!saved?.smart}
            onPress={() => {
              void stop();
              setModel(row.id);
            }}
          />
        ))}
      </Row>
      <Button
        label={t("Find a cube", "查找魔方")}
        disabled={
          !available ||
          busy ||
          phase !== "disconnected" ||
          attempt.status !== "CREATED" ||
          !!saved?.smart
        }
        onPress={() => void scan()}
      />
      {candidates.map((item) => (
        <Button
          key={item.id}
          label={item.name}
          disabled={busy}
          onPress={() => void connect(item.id)}
        />
      ))}
      {needsAddress && (
        <>
          <Field
            label={t("Actual GAN Bluetooth address", "GAN 实际蓝牙地址")}
            value={address}
            onChangeText={setAddress}
            maxLength={17}
          />
          <Button
            label={t("Connect", "连接")}
            disabled={busy || !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(address)}
            onPress={() =>
              void work(async (epoch) => {
                if (pending.current)
                  await initialize(pending.current, epoch, address);
              })
            }
          />
        </>
      )}
      <Txt small>
        {t("Battery: ", "电量：")}
        {battery === null ? t("Unknown", "未知") : battery + "%"}
      </Txt>
      {state && <CubeView state={state} />}
      {phase === "confirm" && !saved?.smart && (
        <Button
          label={t(
            "Confirm the physical server scramble",
            "确认实物符合服务器打乱",
          )}
          disabled={busy || !matches || (ranked && !attempt.recordingAt)}
          onPress={() =>
            void work(async (epoch) => {
              const current = link.current,
                device = native.current;
              if (!current || !device) return;
              await current.bind();
              if (epoch === generation.current) device.confirm();
            })
          }
        />
      )}
      {saved?.smart &&
        ["CREATED", "INSPECTION", "SOLVING"].includes(attempt.status) && (
          <>
            <Button
              kind="secondary"
              label={t("Refresh device position", "刷新设备状态")}
              disabled={busy}
              onPress={() =>
                void work(async () => {
                  await native.current?.verifyState();
                })
              }
            />
            <Button
              label={
                attempt.status === "CREATED"
                  ? t("Begin 15-second inspection", "开始 15 秒观察")
                  : attempt.status === "INSPECTION"
                    ? t("Start solving", "开始还原")
                    : t("Stop and verify result", "停止并验证结果")
              }
              disabled={busy}
              onPress={() =>
                void work(async () => {
                  const current = link.current,
                    device = native.current;
                  if (!current || !device) return;
                  await device.verifyState();
                  if (attempt.status === "CREATED") await current.inspect();
                  else if (attempt.status === "INSPECTION")
                    await current.start();
                  else await current.finish();
                })
              }
            />
          </>
        )}
      <Button
        kind="secondary"
        label={t("End smart connection", "结束智能连接")}
        onPress={() => {
          void stop();
          callbacks.current.onInterrupted(
            t("Smart connection ended", "智能连接已结束"),
          );
        }}
      />
      {!!message && <Notice text={message} error />}
    </Card>
  );
}
