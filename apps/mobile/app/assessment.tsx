import { backOrReplace } from "../src/back-navigation";
import { MoveGrid } from "../src/MoveGrid";
import React, { useEffect, useState } from "react";
import { router, Redirect, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import {
  Puzzle,
  practiceApply,
  practiceSolved,
  solvedPuzzle,
  isPyraminx,
  type AssessmentView,
  type LearningPlan,
} from "@cubers/core";
import { useApp } from "../src/state";
import { CubeView } from "../src/CubeView";
import { PyraminxView } from "../src/PyraminxView";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Button,
  Row,
  Chip,
  Notice,
  Busy,
  useTheme,
} from "../src/ui";

function Check({
  assessment,
  onSave,
  busy,
}: {
  assessment: AssessmentView;
  onSave: (body: unknown) => void;
  busy: boolean;
}) {
  const { t, locale } = useApp(),
    c = useTheme(),
    task = assessment.current!;
  const [moves, setMoves] = useState<string[]>([]),
    [optionId, setOption] = useState<string>();
  const initial = () =>
    practiceApply(solvedPuzzle(assessment.puzzle), task.setup);
  const [state, setState] = useState(initial),
    [lastMove, setLastMove] = useState<string>();
  function turn(move: string) {
    if (busy || moves.length >= 300) return;
    setState(practiceApply(state, [move]));
    setMoves([...moves, move]);
    setLastMove(move);
  }
  function reset(next: string[] = []) {
    setState(practiceApply(initial(), next));
    setMoves(next);
    setLastMove(undefined);
  }
  const controls =
    assessment.puzzle === "pyraminx"
      ? [
          "U",
          "U'",
          "L",
          "L'",
          "R",
          "R'",
          "B",
          "B'",
          "u",
          "u'",
          "l",
          "l'",
          "r",
          "r'",
          "b",
          "b'",
        ]
      : [
          "U",
          "U'",
          "U2",
          "R",
          "R'",
          "R2",
          "F",
          "F'",
          "F2",
          "L",
          "L'",
          "L2",
          "B",
          "B'",
          "B2",
          "D",
          "D'",
          "D2",
          ...(assessment.puzzle === "2x2"
            ? []
            : [
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
              ]),
        ];
  return (
    <>
      <Card style={{ backgroundColor: c.lavender }}>
        <Txt small style={{ color: c.muted }}>
          {t(
            `Check ${assessment.feedback.length + 1} of ${assessment.total}`,
            `第 ${assessment.feedback.length + 1} 项，共 ${assessment.total} 项`,
          )}
        </Txt>
        <Txt style={{ fontWeight: "600", fontSize: 22 }}>
          {task.title[locale]}
        </Txt>
        <Txt>{task.question[locale]}</Txt>
        <Row>
          {task.choices.map((choice) => (
            <Chip
              key={choice.id}
              label={choice.text[locale]}
              selected={optionId === choice.id}
              onPress={() => {
                if (!busy) setOption(choice.id);
              }}
            />
          ))}
        </Row>
      </Card>
      <Card>
        <Txt style={{ fontWeight: "600" }}>
          {t("Now solve this small virtual setup", "再试着还原这个虚拟小练习")}
        </Txt>
        <Txt small>
          {t(
            "Make every face one color. There is no timer. You can undo, reset, or skip; a skipped check helps us suggest practice.",
            "让每个面恢复同色。不计时，可以撤销、重置或跳过；跳过也能帮助我们推荐练习。",
          )}
        </Txt>
        {isPyraminx(state) ? (
          <PyraminxView state={state} lastMove={lastMove} onTurn={turn} />
        ) : (
          <CubeView state={state} lastMove={lastMove} onTurn={turn} />
        )}
        <MoveGrid
          moves={controls}
          onMove={turn}
          disabled={busy || moves.length >= 300}
        />
        <Row>
          <Button
            small
            kind="secondary"
            label={t("Undo", "撤销")}
            onPress={() => reset(moves.slice(0, -1))}
            disabled={busy || !moves.length}
          />
          <Button
            small
            kind="secondary"
            label={t("Reset puzzle", "重置魔方")}
            onPress={() => reset()}
            disabled={busy}
          />
        </Row>
        <Txt small accessibilityLiveRegion="polite">
          {practiceSolved(state)
            ? t("All faces match.", "各面已恢复同色。")
            : t(`${moves.length} turns tried`, `已尝试 ${moves.length} 次转动`)}
        </Txt>
        {!!moves.length && (
          <Txt small selectable>
            {moves.join(" ")}
          </Txt>
        )}
      </Card>
      <Button
        label={t("Save this check", "保存本项结果")}
        disabled={busy || !optionId}
        onPress={() =>
          onSave({
            kind: "submit",
            version: assessment.version,
            optionId,
            moves,
          })
        }
      />
      <Txt small>
        {t(
          "Saving records this attempt and moves to the next check. Reset first if you want another try.",
          "保存后会记录这次尝试并进入下一项；如果想再试一次，请先重置魔方。",
        )}
      </Txt>
      <Button
        kind="secondary"
        label={t(
          "I’m not sure yet / skip this check",
          "暂时还不确定，跳过本项",
        )}
        disabled={busy}
        onPress={() => onSave({ kind: "skip", version: assessment.version })}
      />
    </>
  );
}

export default function AssessmentPage() {
  const { puzzle: rawPuzzle } = useLocalSearchParams<{ puzzle?: string }>(),
    parsed = Puzzle.safeParse(rawPuzzle || "3x3");
  const { t, api, locale, token } = useApp(),
    c = useTheme();
  const [assessment, setAssessment] = useState<AssessmentView>(),
    [plan, setPlan] = useState<LearningPlan>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const puzzle = parsed.success ? parsed.data : "3x3";
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setAssessment(undefined);
    void api<LearningPlan>(`learning-plan?puzzle=${puzzle}`)
      .then(async (result) => {
        if (!active) return;
        setPlan(result);
        const id = result.activeAssessmentId || result.assessment?.id;
        if (id) {
          const saved = await api<AssessmentView>(`assessments/${id}`);
          if (active) setAssessment(saved);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, puzzle, refresh]);
  if (!token) return <Redirect href="/" />;
  async function start() {
    setBusy(true);
    setError("");
    try {
      setAssessment(await api("assessments", { puzzle }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(body: unknown) {
    if (!assessment) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<AssessmentView>(
        `assessments/${assessment.id}/answers`,
        body,
      );
      setAssessment(result);
      if (result.status === "COMPLETED")
        setPlan(await api(`learning-plan?puzzle=${puzzle}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    if (!assessment) {
      setRefresh((value) => value + 1);
      return;
    }
    setBusy(true);
    try {
      setAssessment(await api(`assessments/${assessment.id}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!assessment) return;
    setBusy(true);
    setError("");
    try {
      setAssessment(
        await api(
          `assessments/${assessment.id}`,
          { version: assessment.version },
          "DELETE",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const name =
    puzzle === "pyraminx" ? t("Pyraminx", "金字塔") : puzzle.replace("x", "×");
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("Learning paths", "返回学习路线")}
        onPress={() => backOrReplace(router, "/(tabs)/learn")}
      />
      <Card style={{ backgroundColor: c.lavender }}>
        <Heading eyebrow={name}>
          {t("Find a comfortable starting point.", "找到适合自己的起点。")}
        </Heading>
        <Txt>
          {t(
            "Three private checks pair a question with a virtual puzzle. They suggest a practice focus, not a skill certificate. Lessons stay open, and no public achievement or completed lesson is awarded.",
            "三项私密小测，每项包含一道问题和一个虚拟练习。结果用于推荐练习方向，不是水平认证；课程仍可自由选择，也不会因此获得公开成就或已完成课程。",
          )}
        </Txt>
      </Card>
      {!parsed.success ? (
        <Notice
          text={t(
            "Choose a supported puzzle from Learn.",
            "请在学习页选择支持的魔方类型。",
          )}
          error
        />
      ) : loading ? (
        <Busy />
      ) : (
        <>
          {!!error && (
            <>
              <Notice text={error} error />
              <Button
                kind="secondary"
                label={t("Reload saved check", "重新读取已保存的小测")}
                onPress={() => void reload()}
                disabled={busy}
              />
            </>
          )}
          {assessment?.status === "ACTIVE" && assessment.current ? (
            <>
              <Check
                key={`${assessment.id}:${assessment.version}`}
                assessment={assessment}
                busy={busy}
                onSave={(body) => void save(body)}
              />
              <Button
                kind="secondary"
                label={t("End this check", "结束这份小测")}
                disabled={busy}
                onPress={() => void cancel()}
              />
            </>
          ) : (
            <Card>
              <Txt style={{ fontWeight: "600" }}>
                {assessment?.status === "COMPLETED"
                  ? t("Your next practice is ready", "接下来的练习已准备好")
                  : t("Take a short placement check", "试试简短的起点小测")}
              </Txt>
              {assessment?.status === "COMPLETED" && (
                <Txt>
                  {t(
                    `${assessment.feedback.filter((f) => f.knowledge && f.puzzle).length} of ${assessment.total} checks matched both the question and puzzle. You can revisit any topic.`,
                    `${assessment.total} 项中，有 ${assessment.feedback.filter((f) => f.knowledge && f.puzzle).length} 项的问题与魔方任务都已完成，你仍可复习任何主题。`,
                  )}
                </Txt>
              )}
              {assessment && assessment.status !== "COMPLETED" && (
                <Notice
                  text={t(
                    "This saved check ended. Start a new one when ready.",
                    "这份小测已结束，准备好后可以重新开始。",
                  )}
                />
              )}
              {plan?.queue[0] && (
                <Button
                  label={t("Open suggested practice", "开始推荐练习")}
                  onPress={() =>
                    router.push(`/lesson/${plan.queue[0].lessonId}`)
                  }
                />
              )}
              <Button
                kind="secondary"
                label={
                  assessment
                    ? t("Check again", "重新测一测")
                    : t("Start / about 5–10 minutes", "开始 / 约五到十分钟")
                }
                onPress={() => void start()}
                disabled={busy}
              />
            </Card>
          )}
          {assessment?.feedback.map((feedback, index) => (
            <Card key={`${assessment.id}-${index}`}>
              <Txt style={{ fontWeight: "600" }}>{feedback.title[locale]}</Txt>
              <Txt small style={{ color: c.muted }}>
                {feedback.skipped
                  ? t(
                      "Skipped / a useful place to practice",
                      "已跳过，可以从这里练起",
                    )
                  : t(
                      `Question: ${feedback.knowledge ? "matched" : "review"} / Puzzle: ${feedback.puzzle ? "solved" : "practice"}`,
                      `问题：${feedback.knowledge ? "答对" : "待复习"} / 魔方：${feedback.puzzle ? "已还原" : "待练习"}`,
                    )}
              </Txt>
              <Txt small>{feedback.question[locale]}</Txt>
              <Txt>{feedback.correctAnswer[locale]}</Txt>
              <Txt small>{feedback.explanation[locale]}</Txt>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
