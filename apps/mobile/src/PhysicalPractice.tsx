import { MoveGrid } from "./MoveGrid";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import {
  practiceApply,
  lessonAlgorithmCoaching,
  practiceSetup,
  practiceSolved,
  isPyraminx,
  facelets,
  pyraminxFacelets,
  type Lesson,
  type Puzzle,
  type PracticeState,
} from "@cubers/core";
import { Scanner } from "./Scanner";
import { PyraminxScanner } from "./PyraminxScanner";
import { CubeView } from "./CubeView";
import { useTutorial } from "./TutorialContext";
import { AlgorithmCoach } from "./AlgorithmCoach";
import { PyraminxView } from "./PyraminxView";
import { useApp } from "./state";
import { Card, Row, Button, Txt, Notice, Busy } from "./ui";
type Saved = {
  id: string;
  lessonId: string;
  puzzle: Puzzle;
  algorithm: string;
  status: string;
  moves: string[];
  version: number;
  createdAt: string;
  input: string;
  courseVersion: number;
  guideId?: string | null;
  guideAlgorithm?: string | null;
};
export function PhysicalPractice({
  lesson,
  courseVersion,
  alternativeId,
  onActiveChange,
  onGuideChange,
}: {
  lesson: Lesson;
  courseVersion: number;
  alternativeId?: string;
  onActiveChange?: (active: boolean) => void;
  onGuideChange?: (id?: string) => void;
}) {
  const tutorial = useTutorial();
  const { api, t, locale } = useApp(),
    [session, setSession] = useState<Saved>(),
    [busy, setBusy] = useState(true);
  const [scanning, setScanning] = useState<
      "initial" | "check" | "final" | null
    >(null),
    [message, setMessage] = useState(""),
    [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    const active =
      !!session && !["COMPLETED", "CANCELLED"].includes(session.status);
    onActiveChange?.(busy || active);
    if (active) onGuideChange?.(session.guideId || undefined);
  }, [
    busy,
    session?.id,
    session?.status,
    session?.guideId,
    onActiveChange,
    onGuideChange,
  ]);
  useEffect(() => () => onActiveChange?.(false), [onActiveChange]);
  useEffect(() => {
    let active = true;
    api<Saved[]>("lesson-sessions")
      .then((sessions) => {
        if (!active) return;
        const previous = sessions.find(
          (row) =>
            row.lessonId === lesson.id &&
            row.courseVersion === courseVersion &&
            row.status !== "COMPLETED" &&
            row.status !== "CANCELLED" &&
            row.input === "scan" &&
            Date.now() - new Date(row.createdAt).getTime() < 7 * 86400000,
        );
        setSession(previous);
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [api, lesson.id, courseVersion]);
  async function perform(action: () => Promise<Saved | undefined>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const saved = await action();
      setSession(saved);
      setUncertain(false);
    } catch (error) {
      setMessage((error as Error).message);
      setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  async function checkpoint(state: PracticeState) {
    if (!session || !scanning) return;
    const kind = scanning;
    await perform(async () => {
      const saved = await api<Saved>(
        `lesson-sessions/${session.id}/checkpoint`,
        {
          kind,
          version: session.version,
          faces: isPyraminx(state) ? pyraminxFacelets(state) : facelets(state),
        },
      );
      setScanning(null);
      setMessage(
        kind === "final"
          ? t(
              "Physical checkpoint verified and saved. Your review has been scheduled.",
              "实物检查点已验证并保存，已安排复习。",
            )
          : t(
              "Scan matches the saved practice state.",
              "扫描结果与已保存的练习状态一致。",
            ),
      );
      return saved;
    });
  }
  const expected = practiceApply(
    practiceSetup(
      session?.puzzle || lesson.puzzle,
      session?.algorithm || lesson.algorithm,
    ),
    session?.moves || [],
  );
  const coaching =
    session?.status === "PRACTICING" && !uncertain && !scanning
      ? lessonAlgorithmCoaching(
          lesson,
          session.moves,
          locale,
          session.guideId || undefined,
        )
      : null;
  const turns =
    lesson.puzzle === "pyraminx"
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
          "L'",
          "D'",
          "B'",
          "R2",
          "U2",
          "F2",
          "L2",
          "D2",
          "B2",
        ];
  if (lesson.puzzle === "4x4")
    turns.push(
      "Rw",
      "Rw'",
      "Rw2",
      "Lw",
      "Lw'",
      "Lw2",
      "Uw",
      "Uw'",
      "Uw2",
      "Fw",
      "Fw'",
      "Fw2",
    );
  return (
    <View style={{ gap: 16 }}>
      <Notice
        text={t(
          "Set up your physical puzzle to match the model below. The model follows only turns you confirm. Rescan to check your work; the app cannot see hidden turns. This is practice, not ranked evidence.",
          "请将实物摆成下方模型的状态。模型只根据你确认的转动更新，系统无法识别看不到的转动，请重新扫描核对。这是学习练习，不是排名证据。颜色配置请与课程参照配色一致。",
        )}
      />
      <AlgorithmCoach
        coaching={coaching}
        cursor={session?.moves.length || 0}
        disabled={busy || uncertain || !!scanning}
        onAction={
          session && coaching
            ? () =>
                void perform(() =>
                  api<Saved>(`lesson-sessions/${session.id}/moves`, {
                    version: session.version,
                    moves: [coaching.nextMove],
                  }),
                )
            : undefined
        }
      />
      {isPyraminx(expected) ? (
        <PyraminxView state={expected} cueMove={coaching?.nextMove} />
      ) : (
        <CubeView state={expected} cueMove={coaching?.nextMove} />
      )}
      <Card>
        <Txt style={{ fontWeight: "700", fontSize: 20 }}>
          {t("My physical practice", "我的实物练习")}
        </Txt>
        {busy && <Busy />}
        {!session ? (
          <Button
            label={t("Start a saved practice", "开始并保存练习")}
            disabled={busy}
            onPress={() =>
              void perform(async () => {
                const saved = await api<Saved>(
                  `courses/${lesson.id}/sessions`,
                  {
                    input: "scan",
                    courseVersion,
                    ...(alternativeId ? { alternativeId } : {}),
                  },
                );
                setScanning("initial");
                return saved;
              })
            }
          />
        ) : (
          <>
            <Txt small>
              {session.status === "PREPARING"
                ? t("Preparing the setup", "准备起始状态")
                : session.status === "PRACTICING"
                  ? t("Practicing", "练习中")
                  : session.status === "COMPLETED"
                    ? t("Checkpoint verified", "检查点已验证")
                    : t("Practice ended", "练习已结束")}{" "}
              · {session.moves.length} {t("confirmed turns", "次已确认转动")}
            </Txt>
            {session.status === "PREPARING" && (
              <Button
                label={t("Scan the starting setup", "扫描练习起始状态")}
                onPress={() => setScanning("initial")}
                disabled={busy || uncertain}
              />
            )}
            {session.status === "PRACTICING" && (
              <>
                {!tutorial.observing && (
                  <>
                    <Txt selectable style={{ fontWeight: "700", fontSize: 20 }}>
                      {session.guideAlgorithm || session.algorithm}
                    </Txt>
                    <Txt small>
                      {t(
                        "This saved practice retains its original guide. Finish or cancel it before starting with another sequence.",
                        "本次已保存练习保留创建时的公式。请先完成或取消，再用其他公式创建新练习。",
                      )}
                    </Txt>
                    <Txt small>
                      {t(
                        "After making a physical turn, tap its matching button once.",
                        "实物每转动一次，就点击对应按钮确认一次。",
                      )}
                    </Txt>
                  </>
                )}
                <MoveGrid
                  moves={[
                    ...new Set([
                      ...turns,
                      ...(session.guideAlgorithm || session.algorithm).split(
                        /\s+/,
                      ),
                    ]),
                  ]}
                  disabled={busy || uncertain || !!scanning}
                  onMove={(move) =>
                    void perform(() =>
                      api<Saved>(`lesson-sessions/${session.id}/moves`, {
                        version: session.version,
                        moves: [move],
                      }),
                    )
                  }
                />
                <Row>
                  <Button
                    small
                    kind="secondary"
                    label={t("Rescan this checkpoint", "重新扫描核对")}
                    disabled={busy || uncertain}
                    onPress={() => setScanning("check")}
                  />
                  <Button
                    label={t("Verify final scan", "验证最终扫描")}
                    disabled={busy || uncertain || !practiceSolved(expected)}
                    onPress={() => setScanning("final")}
                  />
                </Row>
              </>
            )}
            {session.status === "COMPLETED" && (
              <Notice
                text={t(
                  "This practice is saved in your learning history.",
                  "本次练习已保存到学习历史。",
                )}
              />
            )}
            {uncertain && (
              <Button
                label={t(
                  "Reload saved state before continuing",
                  "重新载入已保存状态后继续",
                )}
                disabled={busy}
                onPress={() =>
                  void perform(async () => {
                    const saved = await api<Saved>(
                      `lesson-sessions/${session.id}`,
                    );
                    if (saved.status !== "PREPARING") setScanning(null);
                    return saved;
                  })
                }
              />
            )}
            <Button
              small
              kind="secondary"
              label={t(
                "End this practice / start again",
                "结束本次练习／重新开始",
              )}
              disabled={busy}
              onPress={() =>
                void perform(async () => {
                  await api(
                    `lesson-sessions/${session.id}`,
                    undefined,
                    "DELETE",
                  );
                  setScanning(null);
                  return undefined;
                })
              }
            />
          </>
        )}
        {!!message && <Notice text={message} error={uncertain} />}
      </Card>
      {!!scanning && !busy && !uncertain && (
        <>
          <Notice
            text={
              scanning === "initial"
                ? t(
                    "Scan the model's starting state before making turns.",
                    "转动前，请扫描与模型一致的起始状态。",
                  )
                : scanning === "final"
                  ? t(
                      "Scan the solved puzzle to save this checkpoint.",
                      "扫描已完成的实物，保存检查点。",
                    )
                  : t(
                      "Scan all faces to compare with your confirmed turns.",
                      "扫描所有面，与已确认的转动核对。",
                    )
            }
          />
          {lesson.puzzle === "pyraminx" ? (
            <PyraminxScanner onState={(state) => void checkpoint(state)} />
          ) : (
            <Scanner
              size={Number(lesson.puzzle[0]) as 2 | 3 | 4}
              onState={(state) => void checkpoint(state)}
            />
          )}
          <Button
            small
            kind="secondary"
            label={t("Close scanner", "关闭扫描")}
            onPress={() => setScanning(null)}
          />
        </>
      )}
    </View>
  );
}
