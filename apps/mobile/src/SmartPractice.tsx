import { LessonStageNotice } from "./LessonStageNotice";
import { guidedMoveText } from "./guided-move-text";
import { LessonStageAdvice } from "@cubers/core";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, AccessibilityInfo } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  GanGen2Codec,
  GoCubeCodec,
  GiikerCodec,
  SmartCubeSession,
  SmartCubeFrame,
  SMART_FIRST_SOLVE_REFERENCE,
  guidedTeaching,
  guidedGoal,
  guidedState,
  practiceKey,
  smartLessonReference,
  practiceSetup,
  practiceSolved,
  practiceMatches,
  inverse,
  type Lesson,
  type CubeState,
  type SmartModel,
  type SmartDeviceAvailability,
  type SmartPhase,
  type SmartPracticeView,
} from "@cubers/core";
import { useApp } from "./state";
import { Card, Row, Button, Txt, Notice, Field } from "./ui";
import { CubeView } from "./CubeView";
import {
  createSmartLessonRadio,
  type SmartRadio,
  type SmartCandidate,
  type SmartConnection,
} from "./smart/radio";
import { SmartLessonLink } from "./smart/lesson-link";
import { LessonWork, demonstrateState } from "./lesson-work";
export function SmartPractice({
  lesson,
  courseVersion,
  alternativeId,
  onActiveChange,
  guided = false,
}: {
  lesson: Lesson;
  courseVersion: number;
  alternativeId?: string;
  onActiveChange?: (active: boolean) => void;
  guided?: boolean;
}) {
  const { api, t, locale } = useApp(),
    [models, setModels] = useState<SmartDeviceAvailability[]>([]),
    [model, setModel] = useState<SmartModel>("gan-356-i3"),
    [candidates, setCandidates] = useState<SmartCandidate[]>([]),
    [phase, setPhase] = useState<SmartPhase>("disconnected"),
    [state, setState] = useState<CubeState>(),
    [verified, setVerified] = useState(false),
    [battery, setBattery] = useState<number | null>(null),
    [lastMove, setLastMove] = useState<string>(),
    [saved, setSaved] = useState<SmartPracticeView>(),
    [previous, setPrevious] = useState<string>(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [scanning, setScanning] = useState(false),
    [address, setAddress] = useState(""),
    [needsAddress, setNeedsAddress] = useState(false);
  const [stageAdvice, setStageAdvice] = useState<LessonStageAdvice>();
  const [preview, setPreview] = useState<CubeState>(),
    [previewMove, setPreviewMove] = useState<string>();
  const previewWork = useRef(new LessonWork()).current;
  const generation = useRef(0),
    operation = useRef(false),
    cleanup = useRef<Promise<void>>(Promise.resolve()),
    radio = useRef<SmartRadio | null>(null),
    device = useRef<SmartCubeSession | null>(null),
    link = useRef<SmartLessonLink<SmartPracticeView> | null>(null),
    pending = useRef<SmartConnection | null>(null);
  const stop = useCallback(() => {
    generation.current++;
    previewWork.focus(false);
    setPreview(undefined);
    setPreviewMove(undefined);
    operation.current = false;
    const oldRadio = radio.current,
      oldDevice = device.current,
      oldLink = link.current,
      oldPending = pending.current;
    radio.current = null;
    device.current = null;
    link.current = null;
    pending.current = null;
    const release = Promise.allSettled([
      oldLink?.close(),
      oldDevice?.close(),
      oldPending?.transport.disconnect(),
      oldRadio?.close(),
    ]);
    cleanup.current = Promise.allSettled([cleanup.current, release]).then(
      () => {},
    );
    setPhase("disconnected");
    setState(undefined);
    setVerified(false);
    setBattery(null);
    setLastMove(undefined);
    setSaved(undefined);
    setCandidates([]);
    setBusy(false);
    setScanning(false);
    setAddress("");
    setNeedsAddress(false);
    onActiveChange?.(false);
    return cleanup.current;
  }, [onActiveChange, previewWork]);
  useEffect(() => {
    onActiveChange?.(busy || scanning || phase !== "disconnected");
  }, [busy, scanning, phase, onActiveChange]);
  useFocusEffect(
    useCallback(() => {
      void stop();
      setModels([]);
      setPrevious(undefined);
      setMessage("");
      let active = true;
      void Promise.all([
        api<{ devices: SmartDeviceAvailability[] }>("devices"),
        guided
          ? api<{ active: string | null }>(
              `smart-first-solves${lesson.id !== "3-first-solve" ? `?lessonId=${lesson.id}` : ""}`,
            )
          : api<any[]>("lesson-sessions"),
      ])
        .then(([catalogue, history]) => {
          if (!active) return;
          setModels(catalogue.devices);
          setPrevious(
            guided
              ? (history as { active: string | null }).active || undefined
              : (history as any[]).find(
                  (row) =>
                    row.input === "smart" &&
                    ["PREPARING", "PRACTICING"].includes(row.status),
                )?.id,
          );
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
      const subscription = AppState.addEventListener("change", (value) => {
        if (value !== "active") void stop();
      });
      return () => {
        active = false;
        subscription.remove();
        void stop();
      };
    }, [api, lesson.id, courseVersion, alternativeId, guided, stop]),
  );
  const entry = models.find((row) => row.id === model),
    available =
      (Platform.OS === "ios" || Platform.OS === "android") &&
      !!entry?.enabled &&
      entry.physicallyTested &&
      entry.learningEnabled &&
      entry.learningPlatforms.includes(Platform.OS);
  const projection =
    lesson.puzzle === "3x3"
      ? new SmartCubeFrame(
          guided ? SMART_FIRST_SOLVE_REFERENCE : smartLessonReference(lesson),
        )
      : undefined;
  async function scan() {
    const stopped = stop(),
      epoch = generation.current;
    setScanning(true);
    await stopped;
    if (epoch !== generation.current) return;
    if (!available || previous || !projection) {
      setScanning(false);
      return;
    }
    setMessage("");
    try {
      const current = createSmartLessonRadio(model);
      radio.current = current;
      await current.scan(model, (items) => {
        if (epoch === generation.current) setCandidates(items);
      });
    } catch (e) {
      if (epoch === generation.current) {
        void stop();
        setMessage((e as Error).message);
      }
    } finally {
      if (epoch === generation.current) setScanning(false);
    }
  }
  async function initialize(connection: SmartConnection, mac?: string) {
    if (device.current) return;
    const epoch = generation.current;
    operation.current = true;
    setBusy(true);
    try {
      const currentLink = new SmartLessonLink<SmartPracticeView>(
        api,
        {
          lessonId: lesson.id,
          courseVersion,
          alternativeId,
          guided,
          model,
          platform: Platform.OS as "ios" | "android",
        },
        (row) => {
          if (epoch === generation.current) setSaved(row);
        },
        (reason, detail) => {
          if (epoch === generation.current) {
            void stop();
            setMessage(reason);
            const advice = LessonStageAdvice.safeParse(
              (detail as any)?.lessonStage,
            );
            if (advice.success) setStageAdvice(advice.data);
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
          if (event.type === "status") {
            setPhase(event.phase);
            if (event.phase === "resync" || event.phase === "disconnected") {
              void stop();
              setState(undefined);
              setVerified(false);
              setMessage(
                t(
                  "Tracking stopped. End this connection and synchronize a new practice.",
                  "跟踪已停止，请结束连接并重新同步练习。",
                ),
              );
            }
          }
          if (event.type === "battery") setBattery(event.percent);
          if (event.type === "state") {
            setState(projection!.toTeachingState(event.state));
            setVerified(event.verified);
          }
          if (event.type === "move") {
            previewWork.focus(false);
            setPreview(undefined);
            setPreviewMove(undefined);
            setLastMove(projection!.toTeachingMove(event.move.move));
          }
        },
      );
      device.current = current;
      pending.current = null;
      setNeedsAddress(false);
      setAddress("");
      await current.start();
    } catch (e) {
      if (epoch === generation.current) {
        void stop();
        setMessage((e as Error).message);
      }
    } finally {
      if (epoch === generation.current) {
        operation.current = false;
        setBusy(false);
      }
    }
  }
  async function connect(id: string) {
    if (operation.current || !radio.current) return;
    operation.current = true;
    const epoch = generation.current;
    setBusy(true);
    setMessage("");
    setCandidates([]);
    try {
      radio.current?.stopScan();
      const connection = await radio.current!.connect(id, model);
      if (epoch !== generation.current) {
        await connection.transport.disconnect();
        return;
      }
      pending.current = connection;
      if (model === "gan-356-i3" && !connection.address) setNeedsAddress(true);
      else await initialize(connection, connection.address);
    } catch (e) {
      if (epoch === generation.current) {
        void stop();
        setMessage((e as Error).message);
      }
    } finally {
      if (epoch === generation.current) {
        operation.current = false;
        setBusy(false);
      }
    }
  }
  async function confirm() {
    if (operation.current || !link.current || !device.current) return;
    operation.current = true;
    const epoch = generation.current,
      current = link.current,
      native = device.current;
    setBusy(true);
    try {
      await current.start();
      if (epoch === generation.current) native.confirm();
    } catch (e) {
      if (epoch === generation.current) {
        void stop();
        setMessage((e as Error).message);
      }
    } finally {
      if (epoch === generation.current) {
        operation.current = false;
        setBusy(false);
      }
    }
  }
  async function finish() {
    if (operation.current || !link.current) return;
    operation.current = true;
    const epoch = generation.current,
      current = link.current;
    setBusy(true);
    try {
      await current.finish();
      if (epoch === generation.current) {
        if (guided && current.saved?.status !== "COMPLETED") {
          setMessage(
            t(
              "Stage verified. Continue with the next guide.",
              "阶段已验证，请继续下一阶段指导。",
            ),
          );
          return;
        }
        const completed = current.saved,
          stopped = stop(),
          closingEpoch = generation.current;
        await stopped;
        if (closingEpoch !== generation.current) return;
        setSaved(completed);
        setMessage(
          t(
            "Checkpoint verified. Your practice and next review are saved.",
            "检查点已验证，练习记录和下次复习已保存。",
          ),
        );
      }
    } catch (e) {
      if (epoch === generation.current) setMessage((e as Error).message);
    } finally {
      if (epoch === generation.current) {
        operation.current = false;
        setBusy(false);
      }
    }
  }
  async function refresh() {
    if (operation.current || !device.current) return;
    const epoch = generation.current,
      native = device.current;
    operation.current = true;
    setBusy(true);
    try {
      await native.verifyState();
    } catch (e) {
      if (epoch === generation.current) setMessage((e as Error).message);
    } finally {
      if (epoch === generation.current) {
        operation.current = false;
        setBusy(false);
      }
    }
  }
  async function endPrevious() {
    if (operation.current || !previous) return;
    const epoch = generation.current,
      id = previous;
    operation.current = true;
    setBusy(true);
    try {
      if (guided) {
        const row = await api<SmartPracticeView>("smart-first-solves/" + id);
        await api("smart-first-solves/" + id, {
          action: "interrupt",
          version: row.version,
          epoch: row.smart.epoch,
        });
      } else await api("lesson-sessions/" + id, undefined, "DELETE");
      if (epoch === generation.current) setPrevious(undefined);
    } catch (e) {
      if (epoch === generation.current) setMessage((e as Error).message);
    } finally {
      if (epoch === generation.current) {
        operation.current = false;
        setBusy(false);
      }
    }
  }
  const colors: Record<string, [string, string]> = {
    U: ["white", "白色"],
    R: ["red", "红色"],
    F: ["green", "绿色"],
    D: ["yellow", "黄色"],
    L: ["orange", "橙色"],
    B: ["blue", "蓝色"],
  };
  const guidance = saved && "guidance" in saved ? saved.guidance : undefined;
  const teaching = guidance?.step
    ? guidedTeaching(guidance.step, guidance.currentFaces, locale, "3x3")
    : undefined;
  const checkpointReady =
    state &&
    (guided
      ? !!guidance?.step && guidedGoal(state, guidance.step)
      : practiceSolved(state));
  async function replan() {
    if (operation.current || !link.current) return;
    const epoch = generation.current,
      current = link.current;
    operation.current = true;
    setBusy(true);
    try {
      await current.replan();
      if (epoch === generation.current)
        setMessage(
          t(
            "Guidance updated from your verified position.",
            "已根据核验后的当前状态更新指导。",
          ),
        );
    } catch (e) {
      if (epoch === generation.current) setMessage((e as Error).message);
    } finally {
      if (epoch === generation.current) {
        operation.current = false;
        setBusy(false);
      }
    }
  }
  async function watch() {
    if (operation.current || !link.current || !guided || !projection) return;
    const epoch = generation.current,
      current = link.current;
    operation.current = true;
    setBusy(true);
    try {
      await current.flush(true);
      const row = current.saved,
        snapshot = current.snapshot;
      if (
        epoch !== generation.current ||
        !row ||
        !("guidance" in row) ||
        !row.guidance.step ||
        !row.guidance.matchedGuide ||
        !snapshot
      )
        return;
      const initial = projection.toTeachingState(snapshot.state);
      if (
        practiceKey(initial) !==
        practiceKey(guidedState("3x3", row.guidance.currentFaces))
      )
        throw Error(
          "Wait for the current turns to synchronize before previewing",
        );
      previewWork.focus(false);
      previewWork.activate(AppState.currentState === "active");
      previewWork.focus(true);
      const task = previewWork.begin();
      if (!task) return;
      try {
        const reduced = await AccessibilityInfo.isReduceMotionEnabled().catch(
          () => true,
        );
        await demonstrateState(
          initial,
          row.guidance.step.moves.slice(row.guidance.guideIndex),
          task,
          (frame) => {
            if (epoch === generation.current && "size" in frame.state) {
              setPreview(frame.state);
              setPreviewMove(frame.lastMove);
            }
          },
          reduced,
        );
      } finally {
        task.finish();
      }
    } catch (e) {
      if (epoch === generation.current) setMessage((e as Error).message);
    } finally {
      if (epoch === generation.current) {
        setPreview(undefined);
        setPreviewMove(undefined);
        operation.current = false;
        setBusy(false);
      }
    }
  }
  if (lesson.puzzle !== "3x3")
    return (
      <Notice
        text={t(
          "These smart models support 3×3 only. Use virtual or scanned practice for this puzzle.",
          "这些智能型号仅支持三阶；当前项目请使用虚拟或扫描练习。",
        )}
      />
    );
  return (
    <Card>
      <Txt style={{ fontWeight: "700", fontSize: 20 }}>
        {t("Connect your smart cube", "连接智能魔方")}
      </Txt>
      <Txt>
        {t(
          "Keep " +
            t(...colors[projection!.reference.up]) +
            " up and " +
            t(...colors[projection!.reference.front]) +
            " facing you. Keep this reference throughout the connection.",
          "请保持" +
            t(...colors[projection!.reference.up]) +
            "朝上、" +
            t(...colors[projection!.reference.front]) +
            "朝前，并在连接期间保持这一参照方向。",
        )}
      </Txt>
      <Txt small>
        {t(
          "Your confirmed model, teaching reference and received turns are saved privately to this community account.",
          "确认的型号、教学参照方向和接收的转动将私密保存到当前社区账号。",
        )}
      </Txt>
      <Txt small>
        {guided
          ? t(
              "Start with your unsolved physical cube. Its actual position determines each stage of the guide.",
              "请从尚未还原的实物魔方开始，指导将根据实际状态逐步生成。",
            )
          : t("Initial position:", "起始状态公式：") +
            " " +
            inverse(lesson.algorithm.split(" ")).join(" ")}
      </Txt>
      <Txt small>
        {t(
          "This is private learning. Device reports do not establish a ranked physical result; models without a hardware counter cannot prove every intermediate turn.",
          "这是私密学习。设备数据不构成排名实物成绩；没有硬件计数的型号无法证明每一次中间转动。",
        )}
      </Txt>
      <Row>
        {models.map((row) => (
          <Button
            key={row.id}
            small
            kind="secondary"
            label={row.name + (row.id === model ? " ✓" : "")}
            disabled={busy || phase !== "disconnected" || scanning}
            onPress={() => {
              void stop();
              setModel(row.id);
            }}
          />
        ))}
      </Row>
      {!available && (
        <Notice
          text={t(
            "Smart lessons are unavailable until this model and platform pass physical acceptance. Virtual and scanned practice are available.",
            "此型号和平台通过实机验收前，智能练习保持不可用。你仍可使用虚拟或扫描练习。",
          )}
        />
      )}
      {previous && (
        <Button
          label={t("End previous smart connection", "结束上次智能连接")}
          disabled={busy}
          onPress={() => void endPrevious()}
        />
      )}
      <Row>
        <Button
          label={
            scanning
              ? t("Searching…", "正在搜索……")
              : t("Find a cube", "查找魔方")
          }
          disabled={
            !available ||
            busy ||
            scanning ||
            !!previous ||
            phase !== "disconnected"
          }
          onPress={() => void scan()}
        />
        <Button
          kind="secondary"
          label={t("End connection", "结束连接")}
          onPress={() => void stop()}
        />
      </Row>
      {candidates.map((candidate) => (
        <Button
          key={candidate.id}
          kind="secondary"
          label={candidate.name}
          disabled={busy}
          onPress={() => void connect(candidate.id)}
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
            label={t("Connect with this address", "使用此地址连接")}
            disabled={busy || !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(address)}
            onPress={() => {
              if (pending.current) void initialize(pending.current, address);
            }}
          />
        </>
      )}
      <Txt small>
        {t("Battery: ", "电量：")}
        {battery === null ? t("Unknown", "未知") : battery + "%"}
      </Txt>
      {preview && (
        <Notice
          text={t(
            "Preview only. These turns are not saved. Moving your physical cube stops the preview.",
            "仅为演示，转动不会保存；转动实物魔方会停止演示。",
          )}
        />
      )}
      {guidance?.step && teaching && (
        <>
          <Txt small>
            {t(
              "Checkpoint " + (guidance.stage + 1) + " of " + guidance.total,
              "第 " +
                (guidance.stage + 1) +
                " 个检查点，共 " +
                guidance.total +
                " 个",
            )}
          </Txt>
          <Txt style={{ fontSize: 22, fontWeight: "700" }}>
            {teaching.title}
          </Txt>
          <Txt>{teaching.why}</Txt>
          {guidance.step.moves[guidance.guideIndex] && (
            <Txt>
              {guidedMoveText(
                guidance.step.moves[guidance.guideIndex],
                locale,
                "3x3",
              )}
            </Txt>
          )}
        </>
      )}
      {(preview || state) && (
        <CubeView
          showFaces={!guided}
          state={(preview || state)!}
          lastMove={preview ? previewMove : lastMove}
        />
      )}
      {stageAdvice && (
        <LessonStageNotice
          advice={stageAdvice}
          input="smart"
          beforeNavigate={stop}
        />
      )}
      {guidance?.step && teaching && (
        <>
          <Notice text={teaching.frame} />
          <Txt small>{teaching.check}</Txt>
          <Txt selectable>
            {guidance.step.moves.join(" ") ||
              t(
                "This goal already matches your position; refresh and verify it.",
                "当前状态已经符合此目标，请刷新并验证。",
              )}
          </Txt>
          {guidance.matchedGuide &&
            guidance.step.moves[guidance.guideIndex] && (
              <Notice
                text={t(
                  "Next suggested turn: " +
                    guidance.step.moves[guidance.guideIndex],
                  "下一步建议：" + guidance.step.moves[guidance.guideIndex],
                )}
              />
            )}
          <Button
            kind="secondary"
            label={t("Preview this stage", "观看这一阶段演示")}
            disabled={busy || !guidance.matchedGuide}
            onPress={() => void watch()}
          />
          <Button
            kind="secondary"
            label={t(
              "Update guidance from this position",
              "根据当前位置更新指导",
            )}
            disabled={busy || !verified}
            onPress={() => void replan()}
          />
        </>
      )}
      {phase === "confirm" && (
        <Button
          label={t(
            "The physical cube matches — start practice",
            "实物与起始状态一致，开始练习",
          )}
          disabled={
            busy ||
            !state ||
            !(guided
              ? !practiceSolved(state)
              : practiceMatches(
                  state,
                  practiceSetup(lesson.puzzle, lesson.algorithm),
                ))
          }
          onPress={() => void confirm()}
        />
      )}
      {phase === "ready" && (
        <Row>
          <Button
            kind="secondary"
            label={t("Refresh device position", "刷新设备状态")}
            disabled={busy}
            onPress={() => void refresh()}
          />
          <Button
            label={t("Verify checkpoint", "验证检查点")}
            disabled={busy || !verified || !checkpointReady}
            onPress={() => void finish()}
          />
        </Row>
      )}
      {saved?.smart.continuity === "net-state" && (
        <Notice
          text={t(
            "Received turns and device positions are checked. Complete turn history and turning-speed statistics are unavailable for this model.",
            "已核对接收的转动和设备状态；此型号不提供完整转动历史或转速统计。",
          )}
        />
      )}
      {!!message && <Notice text={message} />}
    </Card>
  );
}
