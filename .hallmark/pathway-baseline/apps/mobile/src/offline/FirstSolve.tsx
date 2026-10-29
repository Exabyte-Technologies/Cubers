import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  openOfflineGuidance,
  OfflineGuidanceError,
  guidedTeaching,
  guidedFacelets,
  guidedSize,
  guidedState,
  isPyraminx,
  type OfflineGuidance,
  type DownloadedLesson,
  type PracticeState,
} from "@cubers/core";
import { useApp } from "../state";
import { Button, Card, Row, Txt, Notice, Busy } from "../ui";
import { CubeView } from "../CubeView";
import { PyraminxView } from "../PyraminxView";
import { Scanner } from "../Scanner";
import { PyraminxScanner } from "../PyraminxScanner";

type View = ReturnType<OfflineGuidance["view"]>;
export function OfflineFirstSolve({ packet }: { packet: DownloadedLesson }) {
  const { t, locale } = useApp();
  const controller = useRef<OfflineGuidance | undefined>(undefined);
  const pending = useRef<AbortController | undefined>(undefined);
  const focused = useRef(false),
    foreground = useRef(AppState.currentState === "active");
  const [view, setView] = useState<View>(),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [expired, setExpired] = useState(false),
    [visible, setVisible] = useState(foreground.current),
    [scan, setScan] = useState<"resume" | "checkpoint" | null>(null),
    [lastMove, setLastMove] = useState<string>(),
    [sequence, setSequence] = useState(false);
  function failure(error: unknown) {
    if (error instanceof OfflineGuidanceError) {
      if (error.code === "EXPIRED") {
        setExpired(true);
        return;
      }
      if (error.code === "STATE_DIFFERS") {
        setError(
          t(
            "This state differs from the downloaded path. Check the reference frame and colors. Reconnect to prepare guidance for a different state.",
            "当前状态与下载的路线不同。请检查参照方向和颜色；如需为其他状态重新生成指导，请联网。",
          ),
        );
        return;
      }
      if (error.code === "SCAN_REQUIRED") {
        setError(
          t(
            "Scan your physical puzzle before continuing and at every checkpoint.",
            "请先扫描实物再继续，每个检查点都需要重新扫描。",
          ),
        );
        return;
      }
    }
    setError(
      t(
        "This downloaded practice could not continue. Open it again, or reconnect and download a fresh copy.",
        "这份离线练习暂时无法继续。请重新打开，或联网后重新下载。",
      ),
    );
  }
  function refresh() {
    if (!controller.current) return;
    try {
      setView(controller.current.view());
    } catch (error) {
      failure(error);
    }
  }
  useFocusEffect(
    useCallback(() => {
      let active = true;
      focused.current = true;
      const abort = new AbortController();
      pending.current = abort;
      controller.current = undefined;
      setView(undefined);
      setScan(null);
      setError("");
      setBusy(true);
      setExpired(false);
      setLastMove(undefined);
      setSequence(false);
      void openOfflineGuidance(packet, { signal: abort.signal })
        .then((session) => {
          if (!active || abort.signal.aborted) return;
          controller.current = session;
          if (!foreground.current) session.suspend();
          setView(session.view());
        })
        .catch((error) => {
          if (active && !abort.signal.aborted) failure(error);
        })
        .finally(() => {
          if (active) setBusy(false);
        });
      const expiry = setTimeout(
        () => {
          if (active) {
            abort.abort();
            setExpired(true);
            controller.current = undefined;
            setView(undefined);
            setScan(null);
          }
        },
        Math.max(0, packet.expiresAt - Date.now()),
      );
      return () => {
        active = false;
        focused.current = false;
        abort.abort();
        clearTimeout(expiry);
        controller.current = undefined;
      };
    }, [
      packet.lesson.id,
      packet.courseVersion,
      packet.downloadedAt,
      packet.expiresAt,
      packet.guidedPractice?.sourceId,
      packet.guidedPractice?.sourceVersion,
      reload,
    ]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      foreground.current = state === "active";
      setVisible(foreground.current);
      if (!foreground.current) {
        setScan(null);
        controller.current?.suspend();
        if (!controller.current) pending.current?.abort();
      } else if (focused.current) {
        if (controller.current) refresh();
        else setReload((value) => value + 1);
      }
    });
    return () => subscription.remove();
  }, []);
  function act(action: (session: OfflineGuidance) => void) {
    if (
      !focused.current ||
      !foreground.current ||
      !controller.current ||
      expired
    )
      return;
    setError("");
    try {
      action(controller.current);
      refresh();
    } catch (error) {
      failure(error);
    }
  }
  function turn(move: string) {
    act((session) => {
      session.turn(move);
      setLastMove(move);
    });
  }
  function scanned(state: PracticeState) {
    act((session) => {
      if (scan === "resume") session.resumePhysical(guidedFacelets(state));
      else if (scan === "checkpoint") session.checkpoint(guidedFacelets(state));
      else return;
      setScan(null);
      setLastMove(undefined);
      setSequence(false);
    });
  }
  if (expired)
    return (
      <Notice
        text={t(
          "Offline access expired. Reconnect and download again.",
          "离线使用已到期，请联网重新下载。",
        )}
      />
    );
  if (!visible) return <Notice text={t("Practice paused.", "练习已暂停。")} />;
  const state = view ? guidedState(view.puzzle, view.faces) : null;
  const teaching = view?.step
    ? guidedTeaching(view.step, view.faces, locale, view.puzzle)
    : null;
  const moves = view
    ? view.puzzle === "pyraminx"
      ? ["U", "L", "R", "B", "u", "l", "r", "b"].flatMap((move) => [
          move,
          move + "'",
        ])
      : ["U", "R", "F", "D", "L", "B"].flatMap((face) => [
          face,
          face + "'",
          face + "2",
          ...(view.puzzle === "4x4"
            ? [face + "w", face + "w'", face + "w2"]
            : []),
        ])
    : [];
  return (
    <Card>
      <Txt style={{ fontSize: 23, fontWeight: "700" }}>
        {packet.lesson.title[locale]}
      </Txt>
      <Notice
        text={t(
          "Downloaded guidance for a checked starting state. Local checkpoints and confirmed turns stay on this screen; no progress, results or AI requests are uploaded. Leaving the screen discards local activity. A fresh scan can resume a physical puzzle at a state on this downloaded path.",
          "这是针对已检查起始状态下载的指导。本页的本地检查点与已确认转动不会上传进度、成绩或 AI 请求，离开后不会保存本地活动。实物可通过重新扫描，在下载路线中的状态继续。表明完成仅代表本地检查。仅扫描颜色，不上传照片。",
        )}
      />
      {busy && <Busy />}
      {!!error && <Notice text={error} error />}
      {!busy && !view && (
        <Button
          label={t("Open downloaded practice again", "重新打开离线练习")}
          onPress={() => setReload((value) => value + 1)}
        />
      )}
      {view && state && (
        <>
          {view.completed ? (
            <Notice
              text={t(
                "Downloaded path completed locally. No course credit or result was saved. Reconnect for a new server-verified practice.",
                "下载路线已在本地完成，未保存课程进度或成绩。请联网开始新的服务器验证练习。",
              )}
            />
          ) : (
            <>
              <Txt small>
                {t(
                  `Checkpoint ${view.sourceStage + view.stage + 1} of ${view.sourceStage + view.total}`,
                  `第 ${view.sourceStage + view.stage + 1} 个检查点，共 ${view.sourceStage + view.total} 个`,
                )}
              </Txt>
              <Txt style={{ fontWeight: "700", fontSize: 21 }}>
                {teaching?.title}
              </Txt>
              <Txt>{teaching?.why}</Txt>
              <Notice text={teaching?.frame || ""} />
              {view.input === "scan" && (
                <Notice
                  text={t(
                    "This model follows only turns you confirm. It cannot see hidden moves. Scan every checkpoint; a different state needs a new connected plan.",
                    "模型只根据你确认的转动更新，无法看到未记录的实物变化。每个检查点都需扫描；其他状态需要联网重新生成方案。",
                  )}
                />
              )}
            </>
          )}
          {isPyraminx(state) ? (
            <PyraminxView
              state={state}
              lastMove={lastMove}
              onTurn={
                view.input === "virtual" && !view.completed ? turn : undefined
              }
            />
          ) : (
            <CubeView
              state={state}
              lastMove={lastMove}
              onTurn={
                view.input === "virtual" && !view.completed ? turn : undefined
              }
            />
          )}
          {!view.completed && (
            <>
              {view.needsScan ? (
                <Button
                  label={t(
                    "Scan to start or resume this downloaded path",
                    "扫描以开始或继续下载路线",
                  )}
                  onPress={() => setScan("resume")}
                />
              ) : (
                <>
                  <Txt small>{teaching?.check}</Txt>
                  {view.nextMove && (
                    <Button
                      label={
                        view.input === "virtual"
                          ? t(
                              `Next turn · ${view.nextMove}`,
                              `下一步 · ${view.nextMove}`,
                            )
                          : t(
                              `I made this turn · ${view.nextMove}`,
                              `我已转动这一步 · ${view.nextMove}`,
                            )
                      }
                      onPress={() => turn(view.nextMove!)}
                    />
                  )}
                  <Row>
                    {moves.map((move) => (
                      <Button
                        key={move}
                        small
                        kind="secondary"
                        label={move}
                        onPress={() => turn(move)}
                      />
                    ))}
                  </Row>
                  <Button
                    small
                    kind="secondary"
                    disabled={!view.canUndo}
                    label={
                      view.input === "virtual"
                        ? t("Undo", "撤销")
                        : t(
                            `I undid the last turn · ${view.undoMove || ""}`,
                            `我已撤销上一步 · ${view.undoMove || ""}`,
                          )
                    }
                    onPress={() =>
                      act((session) => {
                        session.undo();
                        setLastMove(view.undoMove);
                      })
                    }
                  />
                  {view.input === "virtual" ? (
                    <>
                      <Button
                        kind="secondary"
                        label={t(
                          "Reset this local checkpoint",
                          "重置此本地阶段",
                        )}
                        onPress={() =>
                          act((session) => {
                            session.resetVirtual();
                            setLastMove(undefined);
                          })
                        }
                      />
                      <Button
                        disabled={!view.ready}
                        label={t("Check this local stage", "检查此本地阶段")}
                        onPress={() =>
                          act((session) => {
                            session.checkpoint();
                            setLastMove(undefined);
                            setSequence(false);
                          })
                        }
                      />
                    </>
                  ) : (
                    <Button
                      label={t(
                        "Scan and check this checkpoint locally",
                        "扫描并在本地检查此阶段",
                      )}
                      onPress={() => setScan("checkpoint")}
                    />
                  )}
                  {view.input === "scan" && (
                    <Button
                      small
                      kind="secondary"
                      label={t(
                        "Rescan a state on the downloaded path",
                        "重新扫描下载路线中的状态",
                      )}
                      onPress={() => setScan("resume")}
                    />
                  )}
                </>
              )}
              <Button
                small
                kind="secondary"
                label={
                  sequence
                    ? t("Hide stage sequence", "收起本阶段组合")
                    : t("Show stage sequence", "查看本阶段组合")
                }
                onPress={() => setSequence((value) => !value)}
              />
              {sequence && (
                <Txt selectable>
                  {view.step?.moves.join(" ") ||
                    t(
                      "No turns needed for this checkpoint.",
                      "此检查点无需转动。",
                    )}
                </Txt>
              )}
            </>
          )}
          {!!scan && (
            <Card>
              <Notice
                text={t(
                  scan === "resume"
                    ? "Scan all faces. The state must lie on this downloaded path; this does not create a new plan."
                    : "Scan every face to compare with this stage's expected result.",
                  scan === "resume"
                    ? "请扫描所有面。状态必须位于下载路线中，此操作不会生成新方案。"
                    : "请扫描所有面，与本阶段的预期结果比较。",
                )}
              />
              {view.puzzle === "pyraminx" ? (
                <PyraminxScanner onState={scanned} />
              ) : (
                <Scanner size={guidedSize(view.puzzle)} onState={scanned} />
              )}
              <Button
                kind="secondary"
                label={t("Close scanner", "关闭扫描")}
                onPress={() => setScan(null)}
              />
            </Card>
          )}
        </>
      )}
    </Card>
  );
}
