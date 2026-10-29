import { backOrReplace } from "../src/back-navigation";
import { MoveGrid } from "../src/MoveGrid";
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { router, Redirect, useLocalSearchParams } from "expo-router";
import {
  lessonStage,
  type Lesson,
  type LessonStageAdvice,
  guidedState,
  guidedFacelets,
  guidedGoal,
  guidedInverse,
  guidedTeaching,
  practiceApply,
  isPyraminx,
  GuidedPuzzle,
  guidedSize,
  guidedCourseId,
  type GuidedSolveView,
  type PracticeState,
} from "@cubers/core";
import { LessonStageNotice } from "../src/LessonStageNotice";
import { guidedMoveText } from "../src/guided-move-text";
import { useApp } from "../src/state";
import { CubeView } from "../src/CubeView";
import { Scanner } from "../src/Scanner";
import { PyraminxView } from "../src/PyraminxView";
import { PyraminxScanner } from "../src/PyraminxScanner";
import { DownloadButton } from "../src/offline/DownloadButton";
import { SmartFirstSolvePage } from "../src/SmartFirstSolvePage";
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
type Summary = {
  id: string;
  input: string;
  puzzle?: string;
  status: string;
  stage: number;
  total: number;
  createdAt: string;
};
type History = {
  items: Summary[];
  active: { id: string; input: string; puzzle?: string }[];
  nextCursor: string | null;
};
export default function FirstSolvePage() {
  const { input, puzzle, lessonId } = useLocalSearchParams<{
      input?: string;
      lessonId?: string;
      puzzle?: string;
    }>(),
    { token, region, user } = useApp();
  if (!token) return <Redirect href="/" />;
  const key = JSON.stringify([
    input,
    puzzle,
    lessonId,
    token,
    region,
    user?.id,
    user?.permissions.canLearn,
  ]);
  return input === "smart" ? (
    <SmartFirstSolvePage
      key={key}
      puzzle={puzzle || "3x3"}
      lessonId={lessonId}
    />
  ) : (
    <OrdinaryFirstSolvePage key={key} />
  );
}
function OrdinaryFirstSolvePage() {
  const {
      input: initialInput,
      puzzle: rawPuzzle,
      lessonId,
    } = useLocalSearchParams<{
      input?: string;
      puzzle?: string;
      lessonId?: string;
    }>(),
    { t, api, locale, token } = useApp(),
    c = useTheme();
  const supported = GuidedPuzzle.safeParse(rawPuzzle || "3x3"),
    puzzle = supported.success ? supported.data : "3x3",
    name =
      puzzle === "pyraminx"
        ? t("Pyraminx", "金字塔魔方")
        : puzzle.replace("x", "×");
  const scope = lessonStage(lessonId),
    courseId = scope?.id || guidedCourseId(puzzle),
    historyPath = `first-solves?puzzle=${puzzle}${scope ? `&lessonId=${scope.id}` : ""}`;
  const [course, setCourse] = useState<{ content: Lesson; version: number }>();
  const [advice, setAdvice] = useState<LessonStageAdvice>();
  const [details, setDetails] = useState(false);
  const [input, setInput] = useState<"virtual" | "scan">(
      initialInput === "scan" ? "scan" : "virtual",
    ),
    [session, setSession] = useState<GuidedSolveView>(),
    [history, setHistory] = useState<History>(),
    [scan, setScan] = useState<
      "start" | "colors" | "checkpoint" | "recover" | null
    >(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [preview, setPreview] = useState<PracticeState | null>(null),
    [lastMove, setLastMove] = useState<string>(),
    [playing, setPlaying] = useState(false);
  const busyRef = useRef(false),
    previewGeneration = useRef(0),
    requestGeneration = useRef(0);
  function setSaved(saved: GuidedSolveView) {
    if ((saved.puzzle || "3x3") !== puzzle)
      throw new Error(
        t(
          "This practice belongs to another puzzle. Open its learning path.",
          "这份练习属于另一类魔方，请返回对应的学习路线。",
        ),
      );
    if ((saved.lessonId || guidedCourseId(puzzle)) !== courseId)
      throw Error(
        t(
          "This practice belongs to another lesson. Open that lesson to continue.",
          "这份练习属于另一节课，请打开对应课程继续。",
        ),
      );
    setSession(saved);
  }
  useEffect(() => {
    let active = true;
    requestGeneration.current++;
    previewGeneration.current++;
    busyRef.current = false;
    setBusy(false);
    setPlaying(false);
    setPreview(null);
    setLoading(true);
    setError("");
    setSession(undefined);
    setScan(null);
    void Promise.all([
      api<History>(historyPath),
      api<{ content: Lesson; version: number }>(`courses/${courseId}`),
    ])
      .then(async ([result, loadedCourse]) => {
        if (active) setCourse(loadedCourse);
        if (!active) return;
        setHistory(result);
        const id = result.active.find(
          (row) => row.input === input && (row.puzzle || "3x3") === puzzle,
        )?.id;
        if (id) {
          const saved = await api<GuidedSolveView>(`first-solves/${id}`);
          if (active) setSaved(saved);
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
      previewGeneration.current++;
      requestGeneration.current++;
    };
  }, [api, input, puzzle, courseId]);
  async function perform(
    action: () => Promise<GuidedSolveView>,
    acceptedMove?: string,
  ) {
    if (busyRef.current || playing) return;
    const generation = requestGeneration.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setAdvice(undefined);
    setPreview(null);
    try {
      const next = await action();
      if (generation !== requestGeneration.current) return;
      setSaved(next);
      setLastMove(acceptedMove);
      setScan(null);
      if (!acceptedMove) {
        const result = await api<History>(historyPath);
        if (generation === requestGeneration.current) setHistory(result);
      }
    } catch (e) {
      if (generation === requestGeneration.current) {
        setError((e as Error).message);
        setAdvice((e as any).lessonStage);
      }
    } finally {
      if (generation === requestGeneration.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  async function reload() {
    if (busyRef.current || playing) return;
    const generation = requestGeneration.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<History>(historyPath);
      if (generation !== requestGeneration.current) return;
      setHistory(result);
      const id =
        session?.id ||
        result.active.find(
          (row) => row.input === input && (row.puzzle || "3x3") === puzzle,
        )?.id;
      if (id) {
        const saved = await api<GuidedSolveView>(`first-solves/${id}`);
        if (generation !== requestGeneration.current) return;
        setSaved(saved);
      }
      setScan(null);
      setLastMove(undefined);
    } catch (e) {
      if (generation === requestGeneration.current)
        setError((e as Error).message);
    } finally {
      if (generation === requestGeneration.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  function turn(move: string) {
    if (!session || busyRef.current || playing) return;
    void perform(
      () =>
        api(`first-solves/${session.id}/moves`, {
          version: session.version,
          moves: [move],
        }),
      move,
    );
  }
  async function scanned(state: PracticeState) {
    if (scan === "start" || scan === "colors")
      return perform(() =>
        api("first-solves", {
          input: scan === "colors" ? "virtual" : "scan",
          ...(scope
            ? { lessonId: scope.id, courseVersion: course?.version }
            : {}),
          puzzle,
          faces: guidedFacelets(state),
        }),
      );
    if (!session) return;
    const path = scan === "checkpoint" ? "checkpoint" : "rescan";
    return perform(() =>
      api(`first-solves/${session.id}/${path}`, {
        version: session.version,
        faces: guidedFacelets(state),
      }),
    );
  }
  async function watch() {
    if (!session?.step || !session.matchedGuide || busyRef.current || playing)
      return;
    busyRef.current = true;
    setPlaying(true);
    const generation = ++previewGeneration.current,
      reduced = await AccessibilityInfo.isReduceMotionEnabled().catch(
        () => true,
      );
    if (generation !== previewGeneration.current) return;
    let offset = 0,
      remaining: string[] = [];
    for (const block of session.step.blocks) {
      if (offset + block.length > session.guideIndex) {
        remaining = block.slice(Math.max(0, session.guideIndex - offset));
        break;
      }
      offset += block.length;
    }
    let current = guidedState(puzzle, session.currentFaces);
    setPreview(current);
    for (const move of remaining) {
      await new Promise((resolve) => setTimeout(resolve, reduced ? 1 : 500));
      if (generation !== previewGeneration.current) return;
      current = practiceApply(current, [move]);
      setPreview(current);
      setLastMove(move);
    }
    await new Promise((resolve) => setTimeout(resolve, reduced ? 1 : 700));
    if (generation === previewGeneration.current) {
      setPreview(null);
      setLastMove(undefined);
      setPlaying(false);
      busyRef.current = false;
    }
  }
  if (!token) return <Redirect href="/" />;
  if (!supported.success || (lessonId && (!scope || scope.puzzle !== puzzle)))
    return (
      <Screen>
        <Notice
          text={t(
            "Choose a supported guided puzzle from Learn.",
            "请从学习页选择支持的完整指导课程。",
          )}
          error
        />
        <Button
          label={t("Back to learning", "返回学习")}
          onPress={() => router.replace("/(tabs)/learn")}
        />
      </Screen>
    );
  const state = session ? guidedState(puzzle, session.currentFaces) : null,
    step = session?.step;
  const teaching =
    step && session
      ? guidedTeaching(step, session.currentFaces, locale, puzzle)
      : null;
  const ready = state && step && guidedGoal(state, step);
  const nextMove = session?.matchedGuide
    ? step?.moves[session.guideIndex]
    : undefined;
  const activeStep = session?.status === "ACTIVE" && !scan;
  const disabled = busy || playing,
    shown = preview || state;
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("Learning paths", "返回学习路线")}
        onPress={() => backOrReplace(router, "/(tabs)/learn")}
      />
      {!activeStep && (
        <>
          <View
            style={{
              backgroundColor: c.lavender,
              borderRadius: 24,
              padding: 24,
              gap: 8,
            }}
          >
            <Heading
              eyebrow={t(
                scope
                  ? `${name} / lesson practice`
                  : `${name} / one complete journey`,
                scope ? `${name} / 分步课程练习` : `${name} / 一次完整的还原`,
              )}
            >
              {scope && course
                ? course.content.title[locale]
                : t("Build your first solve.", "一步一步，完整还原。")}
            </Heading>
            <Txt>
              {scope
                ? t(
                    "Use your cube’s current colors or a prepared lesson setup. We check the previous step, explain each turn and stop when this lesson’s target is complete.",
                    "使用魔方当前颜色，或选择本课预设打乱。先检查前置步骤，再逐步解释每次转动，到本课目标完成即停止。",
                  )
                : t(
                    puzzle === "pyraminx"
                      ? "Align the axial pieces and tips, build the yellow base and finish the remaining edges. Your state chooses the guide. This is private learning, with no ranking or speed claim."
                      : puzzle === "4x4"
                        ? "Build six centers, pair twelve edges and finish as a 3×3. Follow complete exchange groups before checking earlier work. This is private learning, with no ranking or speed claim."
                        : puzzle === "2x2"
                          ? "Build the white layer and finish the last corners. Keep one reference without centers. This is private learning, with no ranking or speed claim."
                          : "Build the white layer, finish the middle, then solve the last layer. Your own cube state chooses the guide. This is private learning, with no ranking or speed claim.",
                    puzzle === "pyraminx"
                      ? "先对齐轴心与尖角，再完成黄色底面和剩余棱块。指导根据你的状态确定；这是私密学习，不参与排名，也不评定速度。"
                      : puzzle === "4x4"
                        ? "先拼六个中心、配十二组棱，再按三阶完成还原。每次完成整组交换转动后，再检查之前的部分；这是私密学习，不参与排名，也不评定速度。"
                        : puzzle === "2x2"
                          ? "先完成白色层，再处理最后的角块。没有中心时，请保持同一参照方向；这是私密学习，不参与排名，也不评定速度。"
                          : "先完成白色层，再拼好中层，最后完成顶层。指导会根据你的魔方状态确定；这是私密学习，不参与排名，也不评定速度。",
                  )}
            </Txt>
          </View>
          {!scope && (
            <Row>
              {GuidedPuzzle.options.map((choice) => (
                <Chip
                  key={choice}
                  label={
                    choice === "pyraminx"
                      ? t("Pyraminx", "金字塔")
                      : choice.replace("x", "×")
                  }
                  selected={puzzle === choice}
                  onPress={() => {
                    if (!disabled && !busyRef.current)
                      router.replace({
                        pathname: "/first-solve",
                        params: { puzzle: choice, input },
                      });
                  }}
                />
              ))}
            </Row>
          )}
          <Row>
            {[
              ["virtual", "Virtual puzzle", "虚拟魔方"],
              ["scan", `My physical ${name}`, `我的 ${name} 实物魔方`],
            ].map(([id, en, zh]) => (
              <Chip
                key={id}
                label={t(en, zh)}
                selected={input === id}
                onPress={() => {
                  if (!disabled && !busyRef.current)
                    setInput(id as "virtual" | "scan");
                }}
              />
            ))}
          </Row>
        </>
      )}
      {loading && <Busy />}
      {!activeStep && puzzle === "3x3" && (
        <Button
          kind="secondary"
          disabled={disabled}
          label={t("Use a smart cube", "使用智能魔方")}
          onPress={() =>
            router.replace({
              pathname: "/first-solve",
              params: {
                input: "smart",
                puzzle,
                ...(scope ? { lessonId: scope.id } : {}),
              },
            })
          }
        />
      )}
      {advice && <LessonStageNotice advice={advice} input={input} />}
      {!!error && (
        <>
          <Notice text={error} error />
          <Button
            kind="secondary"
            label={t("Reload saved practice", "重新读取保存的练习")}
            onPress={() => void reload()}
            disabled={disabled}
          />
        </>
      )}
      {scan && (
        <Card>
          <Notice
            text={
              scan === "colors"
                ? t(
                    "Enter every sticker using the face labels and holding reference below. The guide uses these exact colors after checking that the state is possible.",
                    "按下方的面标记和握持参照输入每个贴纸的颜色。验证状态有效后，指导会使用这些实际颜色。",
                  )
                : t(
                    puzzle === "pyraminx"
                      ? "Scan all four triangular faces using the shown vertex reference, then hold your puzzle to match the model. Face letters and turning vertices are different; follow the labels."
                      : puzzle === "4x4"
                        ? "A 4×4 has no fixed centers. Keep one top/front reference through all six scans and match the model. Once all centers form a recognizable frame, the scan is aligned to the white-down, green-front target."
                        : puzzle === "2x2"
                          ? "A 2×2 has no centers. Keep one top/front reference through all six scans and follow the model afterward. A finished scan is aligned to the shown white-down, green-front target."
                          : "Start scanning from any face and follow the whole-cube turns. After scanning, hold white down and green toward you, as the scanner and lesson model show.",
                    puzzle === "pyraminx"
                      ? "按展示的顶点参照扫描四个三角面，随后按模型握持实物。扫描的面记号与转动的顶点记号不同，请按标注操作。"
                      : puzzle === "4x4"
                        ? "四阶没有固定中心，六面扫描请保持同一套顶面、正面参照，并与模型一致。所有中心形成可识别的参照后，扫描会对齐为白色在下、绿色朝前的目标方向。"
                        : puzzle === "2x2"
                          ? "二阶没有中心，六面扫描请保持同一套顶面、正面参照，之后跟随模型练习。已还原的扫描会对齐为展示的白色在下、绿色朝前的目标方向。"
                          : "可从任意一面开始扫描，并遵循整体转动指引。扫描完成后，将白色朝下、绿色朝前，与扫描器和课程模型一致。",
                  )
            }
          />
          {puzzle === "pyraminx" ? (
            <PyraminxScanner
              manualOnly={scan === "colors"}
              onState={(state) => void scanned(state)}
            />
          ) : (
            <Scanner
              size={guidedSize(puzzle)}
              holdingFrame="white-down"
              manualOnly={scan === "colors"}
              onState={(state) => void scanned(state)}
            />
          )}
          <Button
            kind="secondary"
            label={
              scan === "colors"
                ? t("Cancel color entry", "取消输入颜色")
                : t("Cancel scan", "取消扫描")
            }
            disabled={disabled}
            onPress={() => setScan(null)}
          />
        </Card>
      )}
      {!loading &&
      !scan &&
      session?.status === "ACTIVE" &&
      state &&
      teaching &&
      step ? (
        <>
          <Card>
            <Txt
              small
              style={{
                color: c.green,
                fontWeight: "600",
                alignSelf: "flex-start",
                backgroundColor: c.mint,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 14,
              }}
            >
              {t(
                `Checkpoint ${session.stage + 1} of ${session.total}`,
                `第 ${session.stage + 1} 个检查点，共 ${session.total} 个`,
              )}
            </Txt>
            <Txt style={{ fontSize: 23, fontWeight: "600" }}>
              {teaching.title}
            </Txt>
            {details && <Txt>{teaching.why}</Txt>}
            {nextMove && <Txt>{guidedMoveText(nextMove, locale, puzzle)}</Txt>}

            <Txt small>
              {puzzle === "3x3"
                ? t(
                    "Hold white down and green toward you.",
                    "白色朝下，绿色朝前。",
                  )
                : t(
                    "Keep the model’s reference orientation.",
                    "保持与模型一致的参照方向。",
                  )}
            </Txt>
            {details && <Notice text={teaching.frame} />}
            {session.input === "scan" && (
              <Notice
                text={t(
                  "The model predicts confirmed turns. It cannot see hidden physical moves; scan again at every checkpoint.",
                  "模型仅推算你确认的转动，无法看到实物未记录的变化；每个检查点都需要重新扫描。",
                )}
              />
            )}
            {playing && (
              <Notice
                text={t(
                  "Watching a preview. These turns are not saved; your practice returns afterward.",
                  "正在观看演示，演示转动不会保存，结束后会返回你的练习状态。",
                )}
              />
            )}
            {shown &&
              (isPyraminx(shown) ? (
                <PyraminxView
                  state={shown}
                  lastMove={lastMove}
                  onTurn={
                    session.input === "virtual" && !disabled ? turn : undefined
                  }
                />
              ) : (
                <CubeView
                  showFaces={details}
                  state={shown}
                  lastMove={lastMove}
                  onTurn={
                    session.input === "virtual" && !disabled ? turn : undefined
                  }
                />
              ))}
            {nextMove ? (
              <Button
                label={
                  session.input === "virtual"
                    ? t(
                        `Try the next turn / ${nextMove}`,
                        `试着转下一步 / ${nextMove}`,
                      )
                    : t(
                        `I made this turn / ${nextMove}`,
                        `我已转动这一步 / ${nextMove}`,
                      )
                }
                onPress={() => turn(nextMove)}
                disabled={disabled}
              />
            ) : (
              <Txt small>
                {ready
                  ? t(
                      "The model is ready for this checkpoint.",
                      "模型状态已达到本项检查目标。",
                    )
                  : t(
                      "You used a different route. Check the goal, reset virtual practice, or rescan your physical puzzle.",
                      "你采用了不同的转动路线，请检查目标；也可以重置虚拟阶段，或重新扫描实物状态。",
                    )}
              </Txt>
            )}
            <Button
              small
              kind="secondary"
              label={
                details
                  ? t(
                      "Hide explanation and holding details",
                      "收起原理与握持说明",
                    )
                  : t(
                      "Why this works · holding details",
                      "为什么这样转 · 握持说明",
                    )
              }
              onPress={() => setDetails((v) => !v)}
            />
            {session.setupMoves && (
              <Txt small selectable>
                {t("Lesson setup: ", "课程打乱：") +
                  session.setupMoves.join(" ")}
              </Txt>
            )}
            <Txt small>{teaching.check}</Txt>
            <Button
              small
              kind="secondary"
              label={t("Watch the next short group", "观看下一组短转动")}
              onPress={() => void watch()}
              disabled={disabled || !nextMove || !session.matchedGuide}
            />
            {!!step.moves.length && (
              <Txt small selectable>
                {step.moves.join(" ")}
              </Txt>
            )}
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: c.line,
                paddingTop: 16,
                gap: 12,
              }}
            >
              <DownloadButton
                key={`${session.id}:${session.version}`}
                id={courseId}
                practice={{ id: session.id, version: session.version }}
                disabled={disabled || session.stageMoves.length > 0}
              />
              <Txt small>
                {t(
                  "Download between checkpoints to follow this checked starting state offline. Offline work stays separate from saved progress.",
                  "请在检查点之间、转动前下载，以便离线跟随当前已检查的起始状态。离线练习与已保存进度分开。",
                )}
              </Txt>
            </View>
          </Card>
          {session.input === "virtual" && (
            <Card>
              <Txt small>{t("Try your own turns", "也可以尝试自己的转动")}</Txt>
              <MoveGrid
                moves={
                  puzzle === "pyraminx"
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
                    : puzzle === "4x4"
                      ? ["U", "R", "F", "D", "L", "B"].flatMap((face) =>
                          ["", "w"].flatMap((width) =>
                            ["", "'", "2"].map(
                              (suffix) => face + width + suffix,
                            ),
                          ),
                        )
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
                        ]
                }
                onMove={turn}
                disabled={disabled}
              />
              <Row>
                <Button
                  small
                  kind="secondary"
                  label={t("Undo last turn", "撤销上一步")}
                  disabled={disabled || !session.stageMoves.length}
                  onPress={() =>
                    turn(guidedInverse(puzzle, session.stageMoves.slice(-1))[0])
                  }
                />
                <Button
                  small
                  kind="secondary"
                  label={t("Restart this stage", "重试这一阶段")}
                  disabled={disabled}
                  onPress={() =>
                    void perform(() =>
                      api(`first-solves/${session.id}/reset`, {
                        version: session.version,
                      }),
                    )
                  }
                />
              </Row>
            </Card>
          )}
          <Button
            label={
              session.input === "virtual"
                ? t("Check this stage", "检查这一阶段")
                : t("Scan and check this stage", "扫描并检查这一阶段")
            }
            disabled={disabled || (session.input === "virtual" && !ready)}
            onPress={() =>
              session.input === "scan"
                ? setScan("checkpoint")
                : void perform(() =>
                    api(`first-solves/${session.id}/checkpoint`, {
                      version: session.version,
                    }),
                  )
            }
          />
          {session.input === "scan" && (
            <Button
              kind="secondary"
              label={t("Rescan and update my guide", "重新扫描并更新指导")}
              disabled={disabled}
              onPress={() => setScan("recover")}
            />
          )}
          <Row>
            <Button
              small
              kind="secondary"
              label={t("Reload saved practice", "重新读取练习")}
              disabled={disabled}
              onPress={() => void reload()}
            />
            <Button
              small
              kind="secondary"
              label={t("End this practice", "结束这次练习")}
              disabled={disabled}
              onPress={() =>
                void perform(() =>
                  api(
                    `first-solves/${session.id}`,
                    { version: session.version },
                    "DELETE",
                  ),
                )
              }
            />
          </Row>
        </>
      ) : !loading && !scan ? (
        <Card>
          {session?.status === "COMPLETED" ? (
            <Notice
              text={t(
                scope
                  ? "This lesson target is verified. The guide stops here; the rest of your cube belongs to later lessons."
                  : `All ${session.total} checkpoints were verified. Your complete solve and next review are saved. You can revisit any beginner lesson.`,
                scope
                  ? "本课目标已验证，指导到这里结束，魔方剩余部分留给后续课程。"
                  : `${session.total} 个检查点均已验证，完整还原和下次复习已保存，你仍可回看任何入门课程。`,
              )}
            />
          ) : (
            session && (
              <Notice
                text={t(
                  "This practice ended or expired. Start again when ready.",
                  "这次练习已结束或到期，准备好后可以重新开始。",
                )}
              />
            )
          )}
          {session?.setupMoves && (
            <Txt selectable>
              {t(
                "Prepared setup (from solved in the shown frame): ",
                "预设打乱（从展示朝向的已还原状态开始）：",
              ) + session.setupMoves.join(" ")}
            </Txt>
          )}
          <Txt>
            {t(
              scope
                ? "Choose a setup ready for this lesson, enter all your cube’s colors, or scan your physical cube. Your cube must have completed the previous step. Practice is saved for seven days."
                : "A virtual practice starts with a new server scramble. For a physical puzzle, scan your current unsolved state. Save and return for up to seven days.",
              scope
                ? "可以选择适合本课的预设打乱、输入魔方所有颜色，或扫描实物。你的魔方须先完成上一步，练习可保存七天。"
                : "虚拟练习会从服务器生成的新打乱开始；实物练习请扫描当前未还原状态。保存后可在七天内继续。",
            )}
          </Txt>
          <Button
            label={
              input === "virtual"
                ? scope
                  ? t("Use a lesson-ready scramble", "使用本课预设打乱")
                  : t(
                      "Start a complete virtual solve",
                      "开始一次完整的虚拟还原",
                    )
                : t(`Scan my ${name} to begin`, `扫描我的 ${name}，开始还原`)
            }
            disabled={disabled}
            onPress={() =>
              input === "scan"
                ? setScan("start")
                : void perform(() =>
                    api("first-solves", {
                      input: "virtual",
                      puzzle,
                      ...(scope
                        ? { lessonId: scope.id, courseVersion: course?.version }
                        : {}),
                    }),
                  )
            }
          />
          {input === "virtual" && (
            <Button
              kind="secondary"
              label={t("Enter my cube’s colors", "输入我的魔方颜色")}
              disabled={disabled}
              onPress={() => setScan("colors")}
            />
          )}
        </Card>
      ) : null}
      {!!history?.items.length && (
        <Card>
          <Txt style={{ fontWeight: "600" }}>
            {t("Private guided practice history", "私密的指导练习记录")}
          </Txt>
          {history.items
            .filter(
              (row) => row.input === input && (row.puzzle || "3x3") === puzzle,
            )
            .map((row) => (
              <Button
                key={row.id}
                small
                kind="secondary"
                disabled={disabled}
                label={`${new Date(row.createdAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US")} / ${row.input === "virtual" ? t("Virtual", "虚拟") : t("Scanned", "实物扫描")} / ${row.stage}/${row.total}`}
                onPress={() =>
                  void perform(() => api(`first-solves/${row.id}`))
                }
              />
            ))}
          {history.nextCursor && (
            <Button
              small
              kind="secondary"
              disabled={disabled}
              label={t("More practice history", "查看更多记录")}
              onPress={() => {
                if (busyRef.current) return;
                const generation = requestGeneration.current;
                busyRef.current = true;
                setBusy(true);
                void api<History>(`${historyPath}&cursor=${history.nextCursor}`)
                  .then((next) => {
                    if (generation !== requestGeneration.current) return;
                    setHistory({
                      ...next,
                      items: [...history.items, ...next.items],
                    });
                  })
                  .catch((e) => {
                    if (generation === requestGeneration.current)
                      setError(e.message);
                  })
                  .finally(() => {
                    if (generation === requestGeneration.current) {
                      busyRef.current = false;
                      setBusy(false);
                    }
                  });
              }}
            />
          )}
        </Card>
      )}
    </Screen>
  );
}
