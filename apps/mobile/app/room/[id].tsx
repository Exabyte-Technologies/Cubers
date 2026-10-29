import { backOrReplace } from "../../src/back-navigation";
import { MoveGrid } from "../../src/MoveGrid";
import { SmartGame } from "../../src/SmartGame";
import { RelayProgressCard } from "../../src/RelayProgressCard";
import React, { useState, useEffect, useRef } from "react";
import { AppState as NativeState, View, Share } from "react-native";
import { router, useLocalSearchParams, Redirect } from "expo-router";
import { io, type Socket } from "socket.io-client";
import {
  practiceApply,
  solvedPuzzle,
  practiceSolved,
  isPyraminx,
  facelets,
  pyraminxFacelets,
  type PracticeState,
} from "@cubers/core";
import { useApp } from "../../src/state";
import { DEVELOPMENT_BUILD, appEndpoints } from "../../src/development/config";
import { communityEndpoint } from "../../src/community-routing";
import { invitationLink } from "../../src/invitations";
import { CubeView } from "../../src/CubeView";
import { PuzzleScanner } from "../../src/PuzzleScanner";
import { PyraminxView } from "../../src/PyraminxView";
import { Recording } from "../../src/Recording";
import type { RecordingHandle, RecordedVideo } from "../../src/Recording.types";
import { uploadEvidence, deleteRecording } from "../../src/evidence";
import { appVerification } from "../../src/verification/native";
import { verificationMessage } from "../../src/verification/messages";
import { VerificationError } from "../../src/verification/client";
import type { AppAttestationOperation } from "@cubers/core";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Button,
  Chip,
  Row,
  Notice,
  Busy,
  useTheme,
} from "../../src/ui";
export default function RoomPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, region, user } = useApp();
  if (!token) return <Redirect href="/" />;
  return (
    <RoomView
      key={JSON.stringify([
        id,
        token,
        region,
        user?.id,
        user?.permissions.canLearn,
        user?.permissions.canRecord,
      ])}
      id={id}
    />
  );
}
function RoomView({ id }: { id: string }) {
  const { api, t, token, user, region, locale } = useApp(),
    c = useTheme(),
    [room, setRoom] = useState<any>(),
    [attempt, setAttempt] = useState<any>(),
    [state, setState] = useState<PracticeState>(solvedPuzzle("3x3")),
    [lastMove, setLastMove] = useState<string>(),
    [message, setMessage] = useState(""),
    [elapsed, setElapsed] = useState(0),
    [busy, setBusy] = useState(false),
    socket = useRef<Socket | null>(null),
    active = useRef<any>(null),
    startTime = useRef(0),
    sequence = useRef(0),
    pending = useRef(Promise.resolve());
  const recording = useRef<RecordingHandle>(null),
    video = useRef<RecordedVideo | null>(null),
    evidenceId = useRef<string | null>(null),
    mounted = useRef(true),
    loadEpoch = useRef(0);
  const hydrated = useRef(false);
  useEffect(() => {
    if (
      !(room?.mixed || room?.competitionAttempt || room?.mode === "relay") ||
      !room.ownAttempt ||
      hydrated.current
    )
      return;
    hydrated.current = true;
    const a = room.ownAttempt;
    if (
      ["INSPECTION", "SOLVING", "AWAITING_EVIDENCE"].includes(a.status) ||
      (a.status === "CREATED" && (a.recordingAt || a.smart))
    ) {
      void api(`attempts/${a.id}/interrupt`, {}).catch((e) =>
        setMessage(e.message),
      );
      setAttempt({ ...a, status: "INTERRUPTED" });
      setMessage(
        t(
          "An unfinished attempt cannot resume after reopening this screen.",
          "重新打开页面后，未完成的尝试不能恢复。",
        ),
      );
    } else {
      setAttempt(a);
      setElapsed(typeof a.durationMs === "number" ? a.durationMs : 0);
      setState(
        practiceApply(
          practiceApply(solvedPuzzle(room.puzzle), a.scramble),
          a.moves.map((e: any) => e.move),
        ),
      );
    }
  }, [room, api]);
  const load = async () => {
    const run = ++loadEpoch.current;
    try {
      const value = await api(`rooms/${id}`);
      if (mounted.current && run === loadEpoch.current) setRoom(value);
    } catch (e) {
      if (mounted.current && run === loadEpoch.current)
        setMessage((e as Error).message);
    }
  };
  useEffect(() => {
    mounted.current = true;
    void load();
    const base = DEVELOPMENT_BUILD
      ? communityEndpoint(appEndpoints(), region, true)
      : (region === "CN"
          ? process.env.EXPO_PUBLIC_API_URL_CN
          : process.env.EXPO_PUBLIC_API_URL_INTL) ||
        (__DEV__ ? "http://localhost:3000" : "");
    const s = io(`${base}/play`, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
    });
    socket.current = s;
    s.on("connect", () => s.emit("room.join", { roomId: id }));
    s.on("room.state", (value) => {
      if (!mounted.current) return;
      loadEpoch.current++;
      setRoom(value);
    });
    s.on("disconnect", () => {
      if (
        ["INSPECTION", "SOLVING"].includes(active.current?.status) ||
        ((active.current?.smart || active.current?.recordingAt) &&
          ["CREATED", "AWAITING_EVIDENCE"].includes(active.current.status))
      ) {
        setMessage(
          t(
            "Connection lost. This attempt is interrupted and cannot resume as ranked.",
            "连接中断，本次尝试已中止，不能恢复为排名成绩。",
          ),
        );
        void recording.current?.cancel();
        if (active.current?.id)
          void api(`attempts/${active.current.id}/interrupt`, {}).catch(
            () => {},
          );
        setAttempt((a: any) => ({ ...a, status: "INTERRUPTED" }));
        active.current = { ...active.current, status: "INTERRUPTED" };
      }
    });
    const timer = setInterval(() => s.emit("room.refresh"), 3000);
    const sub = NativeState.addEventListener("change", (v) => {
      if (
        v !== "active" &&
        ["INSPECTION", "SOLVING"].includes(active.current?.status)
      ) {
        void api(`attempts/${active.current.id}/interrupt`, {});
        setAttempt((a: any) => ({ ...a, status: "INTERRUPTED" }));
        active.current = { ...active.current, status: "INTERRUPTED" };
      }
    });
    return () => {
      appVerification.cancel();
      mounted.current = false;
      loadEpoch.current++;
      clearInterval(timer);
      sub.remove();
      s.disconnect();
      void recording.current?.cancel();
      if (video.current) deleteRecording(video.current.path);
    };
  }, [id, token, region, api]);
  useEffect(() => {
    const server = room?.results?.find((x: any) => x.id === active.current?.id);
    if (
      server &&
      ["INTERRUPTED", "EXPIRED", "REJECTED"].includes(server.status) &&
      server.status !== active.current.status
    ) {
      setAttempt((a: any) => ({ ...a, status: server.status }));
      void recording.current?.cancel();
    }
  }, [room]);
  useEffect(() => {
    active.current = attempt;
    if (attempt?.status !== "SOLVING") return;
    const timer = setInterval(
      () => setElapsed(Date.now() - startTime.current),
      100,
    );
    return () => clearInterval(timer);
  }, [attempt?.status]);
  if (!token) return <Redirect href="/" />;
  if (!room)
    return (
      <Screen>{message ? <Notice text={message} error /> : <Busy />}</Screen>
    );
  async function action(path: string, body: unknown = {}) {
    setBusy(true);
    try {
      const match = path.match(
        /^attempts\/([a-f0-9-]+)\/(record|inspect|start|finish|evidence)$/,
      );
      const result =
        room.ranked && match
          ? await appVerification.perform(
              match[1],
              match[2] as AppAttestationOperation,
              body,
            )
          : await api(path, body);
      await load();
      return result;
    } catch (e) {
      setMessage(
        e instanceof VerificationError
          ? verificationMessage(e, locale)
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function makeAttempt() {
    const a = room.competitionAttempt
      ? room.ownAttempt
      : await action(`rooms/${id}/attempts`);
    if (a) {
      setAttempt(a);
      setState(practiceApply(solvedPuzzle(room.puzzle), a.scramble));
      sequence.current = 0;
    }
  }
  async function inspect() {
    if (
      await action(`attempts/${attempt.id}/inspect`, { nonce: attempt.nonce })
    ) {
      setAttempt({ ...attempt, status: "INSPECTION" });
    }
  }
  async function beginRecording() {
    setBusy(true);
    try {
      await recording.current?.start();
      const body = { nonce: attempt.nonce };
      const result = room.ranked
        ? await appVerification.perform(attempt.id, "record", body)
        : await api(`attempts/${attempt.id}/record`, body);
      setAttempt({ ...attempt, recordingAt: result.recordingAt });
    } catch (error) {
      await recording.current?.cancel();
      setMessage(
        error instanceof VerificationError
          ? verificationMessage(error, locale)
          : (error as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function scanCheckpoint(s: PracticeState, stage: "scramble" | "final") {
    const result = await action(`attempts/${attempt.id}/checkpoint`, {
      nonce: attempt.nonce,
      stage,
      faces: isPyraminx(s) ? pyraminxFacelets(s) : facelets(s),
    });
    if (result) {
      setAttempt({
        ...attempt,
        status: result.status,
        ...(stage === "scramble"
          ? { scrambleVerifiedAt: true }
          : { finalScanVerifiedAt: true }),
      });
      setMessage(
        stage === "scramble"
          ? t(
              "Scramble verified. Begin inspection when ready.",
              "打乱已验证，准备好后开始观察。",
            )
          : t(
              "Final scan verified. Ranked attempts still need recording review.",
              "最终扫描已验证，排名尝试仍需审核录像。",
            ),
      );
    }
  }
  async function sendRecording() {
    setBusy(true);
    try {
      if (!video.current) video.current = await recording.current!.stop();
      if (!evidenceId.current)
        evidenceId.current = await uploadEvidence(
          api,
          video.current.path,
          attempt.id,
        );
      setMessage(
        t(
          "Recording uploaded. Keep this screen open while private footage is checked.",
          "录像已上传，私密录像处理期间请保持此页面打开。",
        ),
      );
      const deadline = Date.now() + 10 * 60000;
      while (mounted.current && Date.now() < deadline) {
        const media = await api(`media/${evidenceId.current}`);
        if (media.status === "REJECTED") {
          evidenceId.current = null;
          throw new Error(
            t(
              "Recording validation failed. This attempt cannot receive ranking credit.",
              "录像验证失败，本次尝试不能获得排名成绩。",
            ),
          );
        }
        if (media.status === "READY") {
          const body = {
            nonce: attempt.nonce,
            evidenceId: evidenceId.current,
          };
          const result = room.ranked
            ? await appVerification.perform(attempt.id, "evidence", body)
            : await api(`attempts/${attempt.id}/evidence`, body);
          setAttempt({ ...attempt, status: result.status });
          setMessage(
            t(
              "Recording submitted privately for human review. Your result is provisional.",
              "录像已私密提交人工审核，成绩暂未核准。",
            ),
          );
          deleteRecording(video.current.path);
          video.current = null;
          await load();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (mounted.current)
        throw new Error(
          t(
            "Processing is taking longer. Try the submit button again.",
            "处理时间较长，请再次点击提交按钮。",
          ),
        );
    } catch (error) {
      setMessage(
        error instanceof VerificationError
          ? verificationMessage(error, locale)
          : (error as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  function interruptRecording(reason: string) {
    setMessage(reason);
    if (
      active.current &&
      ["CREATED", "INSPECTION", "SOLVING", "AWAITING_EVIDENCE"].includes(
        active.current.status,
      )
    ) {
      void api(`attempts/${active.current.id}/interrupt`, {}).catch(() => {});
      setAttempt((a: any) => ({ ...a, status: "INTERRUPTED" }));
    }
  }
  async function start() {
    if (
      await action(`attempts/${attempt.id}/start`, { nonce: attempt.nonce })
    ) {
      startTime.current = Date.now();
      setElapsed(0);
      setAttempt({ ...attempt, status: "SOLVING" });
    }
  }
  function execute(move: string) {
    if (active.current?.status !== "SOLVING") return;
    try {
      setState((s) => practiceApply(s, [move]));
      setLastMove(move);
      const event = {
        sequence: sequence.current++,
        move,
        elapsedMs: Date.now() - startTime.current,
      };
      pending.current = pending.current
        .then(async () => {
          await api(`attempts/${attempt.id}/moves`, {
            nonce: attempt.nonce,
            events: [event],
          });
        })
        .catch(() => {
          setMessage(
            t(
              "Move stream interrupted. Start a new room for another attempt.",
              "转动数据流中断，请新建房间重新尝试。",
            ),
          );
          active.current = { ...active.current, status: "INTERRUPTED" };
          setAttempt({ ...attempt, status: "INTERRUPTED" });
          void api(`attempts/${attempt.id}/interrupt`, {}).catch(() => {});
        });
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function finish() {
    await pending.current;
    if (active.current?.status !== "SOLVING") return;
    const r = await action(`attempts/${attempt.id}/finish`, {
      nonce: attempt.nonce,
    });
    if (r) {
      setAttempt({ ...attempt, status: r.status, durationMs: r.durationMs });
      setMessage(
        t(
          `Result: ${r.status}. ${(r.durationMs / 1000).toFixed(2)} seconds.`,
          `结果：${r.status}，${(r.durationMs / 1000).toFixed(2)} 秒。`,
        ),
      );
    }
  }
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("Leave room", "离开房间")}
        onPress={() => {
          if (
            attempt &&
            ["CREATED", "INSPECTION", "SOLVING", "AWAITING_EVIDENCE"].includes(
              attempt.status,
            )
          )
            void api(`attempts/${attempt.id}/interrupt`, {});
          backOrReplace(router, "/(tabs)/play");
        }}
      />
      <Heading eyebrow={`${room.puzzle.replace("x", "×")} / ${room.input}`}>
        {room.mode === "sprint"
          ? t("Make every turn count.", "每一步，都准确。")
          : t("Your next good solve.", "下一次，用心还原。")}
      </Heading>
      {room.mixed && (
        <Card>
          <Txt style={{ fontWeight: "600" }}>
            {t("Mixed inputs / casual", "混合输入 / 休闲")}
          </Txt>
          <Txt small>
            {t(
              "Your input locks when the host starts. These results do not enter rankings.",
              "房主开始后将锁定输入方式，成绩不计入排名。",
            )}
          </Txt>
          <Row>
            {[
              ["virtual", "Virtual", "虚拟"],
              ["scan", "Physical", "实物"],
              ["smart", "Smart", "智能"],
            ].map(([value, en, zh]) => (
              <Chip
                key={value}
                label={t(en, zh)}
                selected={room.input === value}
                disabled={
                  busy ||
                  room.status !== "OPEN" ||
                  (value === "scan" &&
                    !["race", "daily"].includes(room.mode)) ||
                  (value === "smart" && room.puzzle !== "3x3")
                }
                onPress={() =>
                  void action(`rooms/${id}/input`, { input: value })
                }
              />
            ))}
          </Row>
          {!["race", "daily"].includes(room.mode) && (
            <Txt small>
              {t(
                "This game needs turn tracking: choose virtual or a supported smart cube.",
                "此游戏需要转动追踪，请使用虚拟魔方或受支持的智能魔方。",
              )}
            </Txt>
          )}
          {room.mixedChallengeDate && (
            <Txt small>
              {t("Challenge date", "挑战日期")} / {room.mixedChallengeDate}
            </Txt>
          )}
        </Card>
      )}
      {room.competitionAttempt && (
        <Notice
          text={t(
            "This attempt follows the scheduled round deadline. Leaving or reopening during inspection, solving, or pending recording interrupts it. Inspection of 15–17 seconds adds 2 seconds; more than 17 seconds interrupts the attempt.",
            "本次尝试须在预定轮次截止前完成。观察、还原或录像待提交时离开或重开页面将中止尝试。观察超过 15 秒且不超过 17 秒加罚 2 秒，超过 17 秒中止尝试。",
          )}
        />
      )}
      <Card style={{ backgroundColor: c.lavender }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt style={{ fontWeight: "600" }}>
            {room.competitionAttempt
              ? t("Scheduled competition attempt", "定时比赛尝试")
              : `${t("Invite code", "邀请码")} / ${room.code}`}
          </Txt>
          <Txt small>
            {room.ranked ? t("Ranked", "排名") : t("Casual", "休闲")}
          </Txt>
        </Row>
        {room.status === "OPEN" && room.code && (
          <Button
            small
            kind="secondary"
            label={t("Share room invitation", "分享房间邀请")}
            onPress={() =>
              void Share.share({
                message: invitationLink(
                  {
                    kind: "room",
                    code: room.code,
                    community: region,
                  },
                  DEVELOPMENT_BUILD,
                ),
              }).catch((error) => setMessage(error.message))
            }
          />
        )}
        <Txt small>
          {t(
            `${room.members?.length || 0} players / ${room.status}`,
            `${room.members?.length || 0} 位玩家 / ${room.status}`,
          )}
        </Txt>
        {room.status === "OPEN" && room.ownerId === user?.id && (
          <Button
            label={t("Start the round", "开始本轮")}
            onPress={() => void action(`rooms/${id}/start`)}
            disabled={busy}
          />
        )}
        {room.status === "ACTIVE" &&
          !attempt &&
          (room.mode !== "relay" ||
            room.relay?.legs?.some(
              (leg: any) => leg.yours && leg.state === "ready",
            )) && (
            <Button
              label={t("Prepare my attempt", "准备我的尝试")}
              onPress={() => void makeAttempt()}
              disabled={busy}
            />
          )}
      </Card>
      {room.mode === "relay" && room.relay && (
        <RelayProgressCard
          progress={room.relay}
          host={room.ownerId === user?.id}
          busy={busy}
          end={() => action(`rooms/${id}/relay/end`)}
        />
      )}
      {attempt && (
        <>
          <Card>
            <Txt small style={{ color: c.muted }}>
              {t("Server scramble", "服务器打乱")}
            </Txt>
            <Txt selectable style={{ fontWeight: "600", letterSpacing: 0 }}>
              {attempt.scramble.join(" ") ||
                t(
                  "Start solved for this algorithm sprint.",
                  "公式冲刺从还原状态开始。",
                )}
            </Txt>
            {room.target.length > 0 && (
              <Txt>
                {t("Target", "目标")} / {room.target.join(" ")}
              </Txt>
            )}
            <Txt
              style={{
                fontSize: 60,
                lineHeight: 76,
                fontWeight: "600",
                textAlign: "center",
                backgroundColor: c.yellow,
                borderRadius: 20,
                paddingVertical: 20,
                color: c.onAccent,
                fontVariant: ["tabular-nums"],
              }}
            >
              {(elapsed / 1000).toFixed(2)}
            </Txt>
            <Txt small style={{ textAlign: "center" }}>
              {attempt.status}
            </Txt>
            {room.input !== "smart" && attempt.status === "CREATED" && (
              <Button
                label={t("Begin 15-second inspection", "开始 15 秒观察")}
                onPress={() => void inspect()}
                disabled={
                  busy || (room.input === "scan" && !attempt.scrambleVerifiedAt)
                }
              />
            )}
            {room.input !== "smart" && attempt.status === "INSPECTION" && (
              <Button
                label={t("Start solving", "开始还原")}
                onPress={() => void start()}
                disabled={busy}
              />
            )}
          </Card>
          {room.input === "virtual" && (
            <>
              {isPyraminx(state) ? (
                <PyraminxView
                  state={state}
                  lastMove={lastMove}
                  onTurn={execute}
                />
              ) : (
                <CubeView state={state} lastMove={lastMove} onTurn={execute} />
              )}
              <Card>
                <MoveGrid
                  moves={
                    room.puzzle === "pyraminx"
                      ? [
                          "U",
                          "L",
                          "R",
                          "B",
                          "U'",
                          "L'",
                          "R'",
                          "B'",
                          "u",
                          "l",
                          "r",
                          "b",
                          "u'",
                          "l'",
                          "r'",
                          "b'",
                        ]
                      : [
                          "R",
                          "U",
                          "F",
                          "L",
                          "D",
                          "B",
                          "R'",
                          "U'",
                          "F'",
                          "R2",
                          "U2",
                          "F2",
                          ...(room.puzzle === "4x4" ? ["Rw", "Uw", "Rw'"] : []),
                        ]
                  }
                  onMove={execute}
                  disabled={attempt.status !== "SOLVING"}
                />
                <Button
                  label={t("Submit attempt", "提交本次结果")}
                  onPress={() => void finish()}
                  disabled={
                    busy ||
                    attempt.status !== "SOLVING" ||
                    (room.mode !== "pattern" &&
                      room.mode !== "sprint" &&
                      !practiceSolved(state))
                  }
                />
              </Card>
            </>
          )}
          {room.input === "smart" && (
            <>
              {room.ranked &&
                [
                  "CREATED",
                  "INSPECTION",
                  "SOLVING",
                  "AWAITING_EVIDENCE",
                ].includes(attempt.status) && (
                  <Recording
                    ref={recording}
                    onInterrupted={interruptRecording}
                  />
                )}
              {room.ranked &&
                attempt.status === "CREATED" &&
                !attempt.recordingAt && (
                  <Button
                    label={t("Start continuous recording", "开始连续录像")}
                    disabled={busy}
                    onPress={() => void beginRecording()}
                  />
                )}
              <SmartGame
                key={attempt.id}
                attempt={attempt}
                ranked={room.ranked}
                onChange={(row) => {
                  if (!mounted.current) return;
                  if (
                    row.status === "SOLVING" &&
                    active.current?.status !== "SOLVING"
                  )
                    startTime.current = Date.now();
                  active.current = row;
                  setAttempt(row);
                  if (row.durationMs) setElapsed(row.durationMs);
                  void load();
                }}
                onInterrupted={interruptRecording}
              />
              {attempt.status === "AWAITING_EVIDENCE" && room.ranked && (
                <Button
                  label={
                    busy
                      ? t("Checking recording…", "正在检查录像……")
                      : t(
                          "Finish recording & submit privately",
                          "结束录像并私密提交",
                        )
                  }
                  disabled={busy}
                  onPress={() => void sendRecording()}
                />
              )}
            </>
          )}
          {room.input === "scan" && (
            <>
              {room.ranked &&
                [
                  "CREATED",
                  "INSPECTION",
                  "SOLVING",
                  "AWAITING_EVIDENCE",
                ].includes(attempt.status) && (
                  <Recording
                    ref={recording}
                    onInterrupted={interruptRecording}
                  />
                )}
              {room.ranked &&
                attempt.status === "CREATED" &&
                !attempt.recordingAt && (
                  <Button
                    label={t("Start continuous recording", "开始连续录像")}
                    onPress={() => void beginRecording()}
                    disabled={busy}
                  />
                )}
              {attempt.status === "CREATED" &&
                (!room.ranked || attempt.recordingAt) &&
                !attempt.scrambleVerifiedAt && (
                  <PuzzleScanner
                    key="scramble"
                    onPreviewChange={
                      room.ranked
                        ? (preview) =>
                            recording.current?.setScanPreview?.(preview)
                        : undefined
                    }
                    puzzle={room.puzzle}
                    externalCapture={
                      room.ranked
                        ? () => recording.current!.capturePhoto()
                        : undefined
                    }
                    onState={(s) => void scanCheckpoint(s, "scramble")}
                  />
                )}
              {attempt.status === "SOLVING" && (
                <Button
                  label={t("Stop solve timer", "停止还原计时")}
                  onPress={() => void finish()}
                  disabled={busy}
                />
              )}
              {attempt.status === "AWAITING_EVIDENCE" &&
                !attempt.finalScanVerifiedAt && (
                  <>
                    <Notice
                      text={t(
                        "Timer stopped. Keep recording and present all faces for the final scan.",
                        "计时已停止，请继续录像，并展示所有面完成最终扫描。",
                      )}
                    />
                    <PuzzleScanner
                      key="final"
                      onPreviewChange={
                        room.ranked
                          ? (preview) =>
                              recording.current?.setScanPreview?.(preview)
                          : undefined
                      }
                      puzzle={room.puzzle}
                      externalCapture={
                        room.ranked
                          ? () => recording.current!.capturePhoto()
                          : undefined
                      }
                      onState={(s) => void scanCheckpoint(s, "final")}
                    />
                  </>
                )}
              {attempt.status === "AWAITING_EVIDENCE" &&
                attempt.finalScanVerifiedAt &&
                room.ranked && (
                  <Button
                    label={
                      busy
                        ? t("Checking recording…", "正在检查录像……")
                        : t(
                            "Finish recording & submit privately",
                            "结束录像并私密提交",
                          )
                    }
                    onPress={() => void sendRecording()}
                    disabled={busy}
                  />
                )}
              <Notice
                text={t(
                  "Scans check the starting and final states. Turns between scans are not continuously tracked. Camera footage supports human review of ranked results.",
                  "扫描用于检查起始及最终状态，无法连续追踪两次扫描之间的转动。排名成绩通过录像进行人工审核。",
                )}
              />
            </>
          )}
        </>
      )}
      {!!message && <Notice text={message} />}
      <Card>
        <Txt style={{ fontWeight: "600" }}>{t("This round", "本轮结果")}</Txt>
        {room.results?.length ? (
          room.results.map((r: any) => (
            <Row key={r.id} style={{ justifyContent: "space-between" }}>
              <Txt small>
                {r.userId === user?.id
                  ? t("You", "你")
                  : t("Room participant", "房间成员")}
              </Txt>
              <Txt small>
                {room.mixed ? `${r.input} / ` : ""}
                {r.status}{" "}
                {r.durationMs ? ` / ${(r.durationMs / 1000).toFixed(2)}s` : ""}
              </Txt>
            </Row>
          ))
        ) : (
          <Txt small style={{ color: c.muted }}>
            {t(
              "Results appear here after a submitted attempt.",
              "提交尝试后，结果会显示在这里。",
            )}
          </Txt>
        )}
      </Card>
    </Screen>
  );
}
