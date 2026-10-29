import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, AccessibilityInfo, AppState } from "react-native";
import {
  router,
  useLocalSearchParams,
  Redirect,
  useFocusEffect,
} from "expo-router";
import {
  practiceSetup,
  GUIDED_COURSE_IDS,
  guidedPuzzleForCourse,
  practiceApply,
  practiceSolved,
  isPyraminx,
  solvedCube,
  inverse,
  type Lesson,
  type PracticeState,
} from "@cubers/core";
import { useApp } from "../../src/state";
import { DownloadButton } from "../../src/offline/DownloadButton";
import { CubeView } from "../../src/CubeView";
import { PyraminxView } from "../../src/PyraminxView";
import { PhysicalPractice } from "../../src/PhysicalPractice";
import { SmartPractice } from "../../src/SmartPractice";
import { LessonCaseCoach } from "../../src/CaseCoach";
import { LessonSequences } from "../../src/LessonSequences";
import { LessonWork, demonstrateLesson } from "../../src/lesson-work";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Button,
  Row,
  Chip,
  Notice,
  Field,
  Busy,
  useTheme,
} from "../../src/ui";
export default function LessonPage() {
  const { id, input } = useLocalSearchParams<{ id: string; input?: string }>(),
    { token, region, user } = useApp();
  if (!token) return <Redirect href="/" />;
  return (
    <LessonView
      key={JSON.stringify([
        id,
        input,
        token,
        region,
        user?.permissions?.canLearn,
        user?.permissions?.canChat,
      ])}
      id={id}
      initialInput={input}
    />
  );
}
function LessonView({
  id,
  initialInput,
}: {
  id: string;
  initialInput?: string;
}) {
  const { t, api, locale, token, user } = useApp(),
    c = useTheme(),
    [lesson, setLesson] = useState<Lesson>(),
    [courseVersion, setCourseVersion] = useState(0),
    [state, setState] = useState<PracticeState>(solvedCube()),
    [moves, setMoves] = useState<string[]>([]),
    [lastMove, setLastMove] = useState<string>(),
    [input, setInput] = useState("virtual"),
    [message, setMessage] = useState(""),
    [reply, setReply] = useState<any>(),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [step, setStep] = useState(0),
    [replaying, setReplaying] = useState(false);
  const [alternativeId, setAlternativeId] = useState<string>();
  const [physicalActive, setPhysicalActive] = useState(false);
  const work = useRef(new LessonWork()).current;
  useEffect(() => {
    setInput(
      initialInput === "scan" || initialInput === "smart"
        ? initialInput
        : "virtual",
    );
  }, [id, initialInput]);
  useFocusEffect(
    useCallback(() => {
      let loaded = false;
      work.focus(true);
      work.activate(AppState.currentState === "active");
      setLesson(undefined);
      setBusy(false);
      setReplaying(false);
      setReply(undefined);
      setMessage("");
      function load() {
        const task = work.begin();
        if (!task) return;
        void api(`courses/${id}`)
          .then((course: any) => {
            if (!task.current()) return;
            const l = course.content as Lesson;
            loaded = true;
            setLesson(l);
            setAlternativeId(undefined);
            setCourseVersion(course.version);
            setState(practiceSetup(l.puzzle, l.algorithm));
            setMoves([]);
            setLastMove(undefined);
            setStep(0);
            setMessage("");
          })
          .catch((e) => {
            if (task.current()) setMessage(e.message);
          })
          .finally(() => task.finish());
      }
      load();
      const subscription = AppState.addEventListener("change", (state) => {
        work.activate(state === "active");
        if (state !== "active") {
          setBusy(false);
          setReplaying(false);
          setReply(undefined);
        } else if (!loaded) load();
      });
      return () => {
        subscription.remove();
        work.focus(false);
      };
    }, [id, api, work]),
  );
  if (!token) return <Redirect href="/" />;
  if (
    lesson?.kind === "guided-first-solve" ||
    (GUIDED_COURSE_IDS as readonly string[]).includes(id)
  )
    return (
      <Redirect
        href={{
          pathname: "/first-solve",
          params: {
            input:
              initialInput === "scan" || initialInput === "smart"
                ? initialInput
                : "virtual",
            puzzle: guidedPuzzleForCourse(id) || lesson?.puzzle || "3x3",
          },
        }}
      />
    );
  if (!lesson)
    return (
      <Screen>{message ? <Notice text={message} error /> : <Busy />}</Screen>
    );
  const size = Number(lesson.puzzle[0]) as 2 | 3 | 4,
    selectedGuide = lesson.alternatives?.find(
      (row) => row.id === alternativeId,
    ),
    demonstration = selectedGuide?.algorithm || lesson.algorithm,
    teachingSteps = (selectedGuide?.steps || lesson.steps)[locale],
    teachingStep = Math.min(step, teachingSteps.length - 1),
    sequence = demonstration.split(" ");
  function execute(move: string) {
    if (!work.ready || input !== "virtual") return;
    try {
      setState((s) => practiceApply(s, [move]));
      setMoves((m) => [...m, move]);
      setLastMove(move);
      setMessage("");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function reset() {
    if (!work.ready) return;
    setState(practiceSetup(lesson!.puzzle, lesson!.algorithm));
    setMoves([]);
    setLastMove(undefined);
    setMessage("");
  }
  async function replay() {
    const task = work.begin();
    if (!task) return;
    setReplaying(true);
    try {
      const reduced = await AccessibilityInfo.isReduceMotionEnabled();
      await demonstrateLesson(
        lesson!,
        sequence,
        task,
        (frame) => {
          setState(frame.state);
          setMoves(frame.moves);
          setLastMove(frame.lastMove);
        },
        reduced,
      );
    } catch (e) {
      if (task.current()) setMessage((e as Error).message);
    } finally {
      if (task.finish()) setReplaying(false);
    }
  }
  async function tutor() {
    const task = work.begin();
    if (!task) return;
    setBusy(true);
    setReply(undefined);
    try {
      const result = await api("tutor", {
        lessonId: id,
        courseVersion,
        ...(alternativeId ? { alternativeId } : {}),
        locale,
        moves,
        question,
      });
      if (task.current()) setReply(result);
    } catch (e) {
      if (task.current()) setMessage((e as Error).message);
    } finally {
      if (task.finish()) setBusy(false);
    }
  }
  async function complete() {
    const task = work.begin();
    if (!task) return;
    setBusy(true);
    try {
      await api(`progress/${id}`, {
        moves,
        courseVersion,
        ...(alternativeId ? { alternativeId } : {}),
      });
      if (task.current())
        setMessage(
          t(
            "Checkpoint verified. Nice work! Your next review has been scheduled.",
            "检查点已验证，做得不错！已安排下一次复习。",
          ),
        );
    } catch (e) {
      if (task.current()) setMessage((e as Error).message);
    } finally {
      if (task.finish()) setBusy(false);
    }
  }
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("Learning paths", "返回学习路线")}
        onPress={() => router.back()}
      />
      <View style={{ backgroundColor: c.lavender, padding: 24, borderRadius: 24, gap: 8 }}>
      <Heading
        eyebrow={`${lesson.puzzle.replace("x", "×")} / ${t("A little practice", "练习一点点")}`}
      >
        {lesson.title[locale]}
      </Heading>
      <Txt style={{ color: c.muted }}>{lesson.summary[locale]}</Txt>
      <DownloadButton key={lesson.id} id={lesson.id} />
      </View>
      <LessonCaseCoach lesson={lesson} />
      <LessonSequences
        lesson={lesson}
        selected={alternativeId}
        disabled={
          busy ||
          replaying ||
          (["scan", "smart"].includes(input) && physicalActive)
        }
        onSelect={(value) => {
          if (!work.ready) return;
          reset();
          setStep(0);
          setReply(undefined);
          setAlternativeId(value);
        }}
      />
      <Row>
        {[
          ["virtual", "Virtual puzzle", "虚拟魔方"],
          ["scan", "My physical puzzle", "实物魔方"],
          ["smart", "Smart cube", "智能魔方"],
        ].map(([id, en, zh]) => (
          <Chip
            key={id}
            label={t(en, zh)}
            selected={input === id}
            disabled={busy || replaying}
            onPress={() => {
              if (work.ready) setInput(id);
            }}
          />
        ))}
      </Row>
      {input === "scan" && (
        <PhysicalPractice
          key={`${lesson.id}:${courseVersion}`}
          lesson={lesson}
          courseVersion={courseVersion}
          alternativeId={alternativeId}
          onActiveChange={setPhysicalActive}
          onGuideChange={setAlternativeId}
        />
      )}
      {input === "smart" && (
        <SmartPractice
          key={JSON.stringify([lesson.id, courseVersion, alternativeId])}
          lesson={lesson}
          courseVersion={courseVersion}
          alternativeId={alternativeId}
          onActiveChange={setPhysicalActive}
        />
      )}
      {input === "virtual" && (
        <Card style={{ gap: 20 }}>
          {isPyraminx(state) ? (
            <PyraminxView state={state} lastMove={lastMove} onTurn={execute} />
          ) : (
            <CubeView state={state} lastMove={lastMove} onTurn={execute} />
          )}
          <View style={{ gap: 16, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 20 }}>
            <Txt small style={{ fontWeight: "600", color: c.green }}>
              {t("Practice the moves", "跟着转一转")}
            </Txt>
            <Txt
              selectable
              style={{ fontSize: 22, fontWeight: "600", letterSpacing: 0 }}
            >
              {demonstration}
            </Txt>
            <Row>
              {Array.from(
                new Set([
                  ...(lesson.puzzle === "pyraminx"
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
                      ]),
                  ...sequence,
                ]),
              ).map((m) => (
                <Button
                  small
                  key={m}
                  kind="secondary"
                  label={m}
                  onPress={() => execute(m)}
                  disabled={input !== "virtual" || replaying || busy}
                />
              ))}
            </Row>
            {size === 4 && (
              <Row>
                {["Rw", "Uw", "Rw'"].map((m) => (
                  <Button
                    small
                    key={m}
                    kind="secondary"
                    label={m}
                    onPress={() => execute(m)}
                    disabled={busy || replaying}
                  />
                ))}
              </Row>
            )}
            <Row>
              <Button
                small
                kind="secondary"
                label={t("Undo", "撤销")}
                onPress={() => {
                  if (!work.ready) return;
                  const last = moves.at(-1);
                  if (last) {
                    const m = inverse([last])[0];
                    setState((s) => practiceApply(s, [m]));
                    setMoves((prev) => prev.slice(0, -1));
                    setLastMove(m);
                  }
                }}
                disabled={!moves.length || replaying || busy}
              />
              <Button
                small
                kind="secondary"
                label={t("Reset drill", "重置练习")}
                onPress={reset}
                disabled={replaying || busy}
              />
              <Button
                small
                kind="secondary"
                label={t("Watch a demo", "观看演示")}
                onPress={() => void replay()}
                disabled={replaying || busy}
              />
              <Button
                small
                label={t("Hint: next move", "提示：下一步")}
                disabled={busy || replaying}
                onPress={() =>
                  setMessage(
                    practiceSolved(state)
                      ? t(
                          "The checkpoint is solved; you can verify it now.",
                          "检查点已完成，现在可以验证。",
                        )
                      : moves.every((move, index) => sequence[index] === move)
                        ? t(
                            `Next in the authored sequence: ${sequence[moves.length]}.`,
                            `课程公式的下一步：${sequence[moves.length]}。`,
                          )
                        : t(
                            "Your turns differ from the authored example. Undo to the matching point or reset before using the next-move hint.",
                            "当前转动与课程示例不同。请撤销到对应步骤或重置后，再使用下一步提示。",
                          ),
                  )
                }
              />
            </Row>
            <Txt small style={{ color: c.muted }}>
              {t(
                lesson.puzzle === "pyraminx"
                  ? "Uppercase turns move two layers by 120°. Lowercase turns move only a tip. Drag to orbit; tap for U."
                  : "Drag to change the view. Tap the cube for a front turn. The labeled face net is available when 3D is unavailable.",
                lesson.puzzle === "pyraminx"
                  ? "大写记号表示两层转动 120°，小写只转尖角。拖动改变视角，点击转 U。"
                  : "拖动可改变观察角度，点击魔方可转动正面。无法显示 3D 时，可使用带记号的六面图。",
              )}
            </Txt>
            <Button
              label={t("Verify practice checkpoint", "验证练习检查点")}
              onPress={() => void complete()}
              disabled={
                busy ||
                !practiceSolved(state) ||
                input !== "virtual" ||
                replaying
              }
            />
          </View>
        </Card>
      )}
      <Card style={{ backgroundColor: c.mint }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt style={{ fontWeight: "600", fontSize: 20 }}>
            {t("Understand the why", "想明白，为什么")}
          </Txt>
          <Txt small>
            {teachingStep + 1} / {teachingSteps.length}
          </Txt>
        </Row>
        <Txt>{teachingSteps[teachingStep]}</Txt>
        <Row>
          <Button
            small
            kind="secondary"
            label={t("Previous", "上一步")}
            onPress={() => setStep(Math.max(0, teachingStep - 1))}
            disabled={!teachingStep}
          />
          <Button
            small
            label={t("Next step", "下一步")}
            onPress={() =>
              setStep(Math.min(teachingSteps.length - 1, teachingStep + 1))
            }
            disabled={teachingStep === teachingSteps.length - 1}
          />
        </Row>
      </Card>
      <Card>
        <Txt style={{ fontWeight: "600", fontSize: 20 }}>
          {t("A little extra guidance", "再来一点讲解")}
        </Txt>
        <Txt small style={{ color: c.muted }}>
          {user?.permissions.canChat
            ? t(
                "Ask about notation, reasoning or practice. Only a learning-intent category and approved lesson content reach the provider.",
                "可询问记号、原理或练习方法。仅学习意图分类和已审核课程内容会发送给服务商。",
              )
            : t(
                "You’ll receive authored, validated explanations. Open-ended AI is restricted to verified adults.",
                "你将获得经过验证的课程讲解。开放式 AI 仅面向通过验证的成年人。",
              )}
        </Txt>
        <Field
          label={t("What would help?", "你想了解什么？")}
          value={question}
          onChangeText={setQuestion}
          maxLength={600}
        />
        <Button
          kind="secondary"
          label={
            busy
              ? t("Thinking…", "请稍候……")
              : t("Explain this lesson", "讲解这一课")
          }
          onPress={() => void tutor()}
          disabled={busy || replaying}
        />
        {reply && (
          <>
            <Notice text={reply.label} />
            <Txt>{reply.explanation}</Txt>
          </>
        )}
      </Card>
      {!!message && <Notice text={message} />}
    </Screen>
  );
}
