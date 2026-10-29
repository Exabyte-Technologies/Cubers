import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import Svg, { Path } from "react-native-svg";
import type { LearningPlan } from "@cubers/core";
import { useApp } from "../../src/state";
import {
  buildLearningPathways,
  type PathCourse,
  type PathLesson,
} from "../../src/learning-paths";
import { DownloadButton } from "../../src/offline/DownloadButton";
import {
  Screen,
  Txt,
  Button,
  Row,
  Chip,
  Notice,
  Busy,
  useTheme,
  LocaleButton,
  Logo,
} from "../../src/ui";

export default function Learn() {
  const { t, api, locale, token, region } = useApp(),
    c = useTheme();
  const { width, height } = useWindowDimensions();
  const owner = JSON.stringify([token, region]);
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const generation = useRef(0);
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    courses: PathCourse[];
    progress: any[];
  }>();
  const [pathId, setPathId] = useState("beginner-3x3"),
    [unitId, setUnitId] = useState<string>();
  const [picker, setPicker] = useState<"units" | "pathways" | null>(null),
    [selected, setSelected] = useState<PathLesson>();
  const [tools, setTools] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  const [storedPlan, setPlan] = useState<{
    owner: string;
    data: LearningPlan;
  }>();
  const current = snapshot?.owner === owner;
  const courses = current ? snapshot.courses : [],
    progress = current ? snapshot.progress : [];
  const pathways = useMemo(() => buildLearningPathways(courses), [courses]);
  const pathway = pathways.find((p) => p.id === pathId) || pathways[0];
  const puzzle = pathway?.puzzle || "3x3";
  const complete = (id: string) =>
    progress.some((p) => p.lessonId === id && p.currentCompleted);
  const unit =
    pathway?.units.find((u) => u.id === unitId) ||
    pathway?.units.find((u) => !complete(u.id)) ||
    pathway?.units[0];
  const unitIndex = unit ? pathway.units.indexOf(unit) : 0;
  const nextUnit = pathway?.units[unitIndex + 1];
  const plan =
    storedPlan?.owner === owner && storedPlan.data.puzzle === puzzle
      ? storedPlan.data
      : undefined;
  const completedUnits =
    pathway?.units.filter((u) => complete(u.id)).length || 0;
  const cardWidth = Math.min(520, Math.max(240, width - 48));
  useFocusEffect(
    useCallback(() => {
      const epoch = ++generation.current;
      setBusy(true);
      setError("");
      Promise.all([api<PathCourse[]>("courses"), api<any[]>("progress")])
        .then(([courses, progress]) => {
          if (epoch === generation.current && ownerRef.current === owner)
            setSnapshot({ owner, courses, progress });
        })
        .catch((e) => {
          if (epoch === generation.current && ownerRef.current === owner)
            setError(e.message);
        })
        .finally(() => {
          if (epoch === generation.current && ownerRef.current === owner)
            setBusy(false);
        });
      return () => {
        generation.current++;
        setSelected(undefined);
        setPicker(null);
      };
    }, [api, owner, retry]),
  );
  useFocusEffect(
    useCallback(() => {
      let active = true;
      api<LearningPlan>(`learning-plan?puzzle=${puzzle}`)
        .then((data) => {
          if (active && ownerRef.current === owner) setPlan({ owner, data });
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [api, puzzle, owner]),
  );
  const changePath = (id: string) => {
    setPathId(id);
    setUnitId(undefined);
    setSelected(undefined);
    setPicker("units");
  };
  const openLesson = (lesson: PathLesson) => {
    setSelected(undefined);
    router.push({
      pathname: "/lesson/[id]",
      params: { id: lesson.courseId, step: String(lesson.stepIndex) },
    });
  };
  const done = unit ? complete(unit.id) : false;
  const detail = selected
    ? selected.instruction[locale].startsWith(selected.title[locale])
      ? selected.instruction[locale].slice(selected.title[locale].length).trim()
      : selected.instruction[locale]
    : "";
  const offsets = [0, -68, 0, 68];
  const nodeX = (index: number) =>
    offsets[index % offsets.length] * Math.min(1, cardWidth / 340);
  const nodeY = (index: number) => 54 + index * 128;
  const mapWidth = Math.min(cardWidth, 360),
    mapHeight = (unit?.lessons.length || 1) * 128 + 28;
  const route = unit?.lessons
    .map((_, i) => {
      const x = mapWidth / 2 + nodeX(i),
        y = nodeY(i);
      if (!i) return `M${x} ${y}`;
      const previousX = mapWidth / 2 + nodeX(i - 1),
        previousY = nodeY(i - 1);
      return `C${previousX} ${previousY + 64} ${x} ${y - 64} ${x} ${y}`;
    })
    .join(" ");
  function sheet(content: React.ReactNode, close: () => void) {
    return (
      <Modal visible transparent animationType="none" onRequestClose={close}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Close dialog", "关闭窗口")}
            onPress={close}
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: c.shadow,
              opacity: 0.55,
            }}
          />
          <View
            accessibilityViewIsModal
            style={{
              width: "100%",
              maxWidth: 560,
              maxHeight: Math.max(260, height - 64),
              backgroundColor: c.paper,
              borderRadius: 24,
              borderWidth: 1,
              borderBottomWidth: 5,
              borderColor: c.edge,
              padding: 22,
              gap: 16,
            }}
          >
            {content}
          </View>
        </View>
      </Modal>
    );
  }
  return (
    <Screen
      stickyHeader={
        <View
          style={{ width: "100%", maxWidth: 560, alignSelf: "center", gap: 12 }}
        >
          <Row
            style={{
              justifyContent: "space-between",
              flexWrap: "nowrap",
              gap: 12,
            }}
          >
            <Pressable
              testID="pathway-picker"
              accessibilityRole="button"
              accessibilityLabel={t("Switch learning pathway", "切换学习路线")}
              onPress={() => setPicker("pathways")}
              style={{ flex: 1, minHeight: 44, justifyContent: "center" }}
            >
              <Row style={{ flexWrap: "nowrap", gap: 10 }}>
                <Logo size={30} />
                <View style={{ flex: 1 }}>
                  <Txt
                    style={{ fontWeight: "600", fontSize: 17 }}
                    numberOfLines={1}
                  >
                    {pathway?.title[locale] || t("Learning paths", "学习路线")}
                  </Txt>
                  <Txt small>
                    {current
                      ? t(
                          `${completedUnits} ${completedUnits === 1 ? "unit" : "units"} complete`,
                          `已完成 ${completedUnits} 个单元`,
                        )
                      : t("Loading your progress…", "正在加载进度……")}
                  </Txt>
                </View>
                <Txt style={{ color: c.blue, fontSize: 23 }}>⌄</Txt>
              </Row>
            </Pressable>
            <LocaleButton />
          </Row>
          {unit && (
            <Pressable
              testID="unit-picker"
              accessibilityRole="button"
              accessibilityLabel={t(
                `Choose a unit. Current unit: ${unit.course.content.title.en}`,
                `选择学习单元。当前单元：${unit.course.content.title.zh}`,
              )}
              onPress={() => setPicker("units")}
              style={({ pressed }) => ({
                backgroundColor: c.accent,
                borderColor: c.buttonEdge,
                borderWidth: 1,
                borderBottomWidth: pressed ? 2 : 5,
                borderRadius: 20,
                paddingHorizontal: 20,
                paddingVertical: 15,
                gap: 5,
              })}
            >
              <Row
                style={{ justifyContent: "space-between", flexWrap: "nowrap" }}
              >
                <Txt
                  accessibilityRole="header"
                  style={{
                    color: c.onAccent,
                    fontWeight: "600",
                    fontSize: 22,
                    lineHeight: 29,
                    flex: 1,
                  }}
                >
                  {unit.course.content.title[locale]}
                </Txt>
                <Svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
                  <Path
                    d="M5 6h14M5 12h14M5 18h14"
                    stroke={c.onAccent}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </Svg>
              </Row>
              <Txt small style={{ color: c.onAccent }}>
                {t(
                  `Unit ${unitIndex + 1} of ${pathway.units.length}`,
                  `第 ${unitIndex + 1} / ${pathway.units.length} 单元`,
                )}{" "}
                /{" "}
                {done
                  ? t("Completed", "已完成")
                  : t(
                      `${unit.lessons.length} ${unit.lessons.length === 1 ? "lesson" : "lessons"}`,
                      `${unit.lessons.length} 节小课`,
                    )}
              </Txt>
            </Pressable>
          )}
        </View>
      }
    >
      {!!error && (
        <>
          <Notice text={error} error />
          <Button
            kind="secondary"
            label={t("Try again", "重试")}
            onPress={() => setRetry((v) => v + 1)}
          />
        </>
      )}
      {busy && <Busy />}
      {!busy && !unit && (
        <Notice
          text={t(
            "No published lessons in this pathway yet. Choose another pathway.",
            "这条路线暂时没有已发布课程，请选择其他路线。 ",
          )}
        />
      )}
      {unit && (
        <View
          testID="lesson-path"
          style={{
            width: "100%",
            maxWidth: 560,
            alignSelf: "center",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View
            style={{ width: mapWidth, height: mapHeight, position: "relative" }}
          >
            <Svg
              pointerEvents="none"
              aria-hidden
              width={mapWidth}
              height={mapHeight}
              style={{ position: "absolute", top: 0, left: 0 }}
            >
              <Path
                d={route || ""}
                stroke={c.line}
                strokeWidth={3}
                strokeDasharray="5 10"
                fill="none"
              />
            </Svg>
            {unit.lessons.map((lesson, index) => (
              <View
                key={lesson.id}
                style={{
                  position: "absolute",
                  top: nodeY(index) - 36,
                  left: mapWidth / 2 + nodeX(index) - 88,
                  width: 176,
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Pressable
                  testID={`lesson-node-${lesson.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("Lesson", "小课")} ${index + 1}: ${lesson.title[locale]}${done ? t(", unit completed", "，单元已完成") : ""}`}
                  onPress={() => setSelected(lesson)}
                  style={({ pressed }) => ({
                    width: 74,
                    height: 74,
                    borderRadius: 999,
                    borderWidth: 2,
                    borderBottomWidth: pressed ? 2 : 7,
                    borderColor: done
                      ? c.mintDeep
                      : index === 0
                        ? c.buttonEdge
                        : c.edge,
                    backgroundColor: done
                      ? c.mint
                      : index === 0
                        ? c.accent
                        : c.paper,
                    justifyContent: "center",
                    alignItems: "center",
                    transform: [{ translateY: pressed ? 4 : 0 }],
                  })}
                >
                  {done ? (
                    <Svg width={29} height={29} viewBox="0 0 24 24" aria-hidden>
                      <Path
                        d="m5 12 4 4L19 6"
                        fill="none"
                        stroke={c.ink}
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  ) : (
                    <Txt
                      style={{
                        fontSize: 27,
                        lineHeight: 33,
                        fontWeight: "600",
                        color: index === 0 ? c.onAccent : c.muted,
                      }}
                    >
                      {index + 1}
                    </Txt>
                  )}
                </Pressable>
                <Txt
                  small
                  numberOfLines={1}
                  style={{
                    textAlign: "center",
                    maxWidth: 176,
                    fontWeight: index === 0 ? "600" : "500",
                  }}
                >
                  {t(`Lesson ${index + 1}`, `第 ${index + 1} 小课`)}
                </Txt>
              </View>
            ))}
          </View>
          <Txt small style={{ textAlign: "center", color: c.muted }}>
            {t(
              "Finish this unit’s practice checkpoint to complete its lessons.",
              "完成这个单元的练习检查点，即可完成其中的小课。",
            )}
          </Txt>
          {unit.course.content.caseFamily && (
            <Notice
              text={t(
                "Complete case coverage through original composite drills. Cubers IDs are separate from standard case numbers; these combinations favor familiar triggers and are not optimized speed algorithms.",
                "使用原创组合练习覆盖全部情况。Cubers 编号与通行情况编号分开；这些组合侧重常见转动，并非经过速拧优化的公式。",
              )}
            />
          )}
          {puzzle === "pyraminx" && (
            <Notice
              text={t(
                "Pyraminx uses 120° turns and four triangular faces. These focused drills cover tips, edge placement and one last-layer case.",
                "金字塔采用 120° 转动与四个三角面。这组专项练习涵盖尖角、棱块插入和一种最后一层情况。",
              )}
            />
          )}
          {nextUnit && (
            <View
              style={{
                width: "100%",
                borderTopWidth: 2,
                borderColor: c.line,
                paddingTop: 24,
                marginTop: 12,
                gap: 12,
              }}
            >
              <Txt
                style={{
                  fontSize: 23,
                  lineHeight: 30,
                  fontWeight: "600",
                  textAlign: "center",
                }}
              >
                {nextUnit.course.content.title[locale]}
              </Txt>
              <Txt small style={{ textAlign: "center", color: c.muted }}>
                {t(
                  `Next: unit ${unitIndex + 2}`,
                  `下一站：第 ${unitIndex + 2} 单元`,
                )}
              </Txt>
              <Button
                kind="secondary"
                label={t("Explore this unit", "探索这个单元")}
                onPress={() => {
                  setUnitId(nextUnit.id);
                  setSelected(undefined);
                }}
              />
            </View>
          )}
          {!nextUnit && (
            <Button
              kind="secondary"
              label={t("Explore another pathway", "探索其他路线")}
              onPress={() => setPicker("pathways")}
            />
          )}
          <Button
            small
            kind="secondary"
            label={
              tools
                ? t("Hide practice tools", "收起练习工具")
                : t("Practice & downloads", "练习与下载")
            }
            onPress={() => setTools((v) => !v)}
          />
          {tools && (
            <View
              style={{
                width: "100%",
                gap: 16,
                borderTopWidth: 1,
                borderColor: c.line,
                paddingTop: 20,
              }}
            >
              <Txt style={{ fontWeight: "600", fontSize: 21 }}>
                {t("Your practice queue", "适合你的练习")}
              </Txt>
              {plan?.queue.map((item) => {
                const course = courses.find((c) => c.id === item.lessonId);
                return course ? (
                  <Button
                    key={item.lessonId}
                    kind="secondary"
                    small
                    label={course.content.title[locale]}
                    onPress={() => router.push(`/lesson/${item.lessonId}`)}
                  />
                ) : null;
              })}
              {!plan?.queue.length && (
                <Txt small>
                  {t(
                    "Choose any lesson on your pathway to practice.",
                    "可以选择路线中的任意一课开始练习。",
                  )}
                </Txt>
              )}
              <Button
                kind="secondary"
                label={t("Find my starting point", "找到我的学习起点")}
                onPress={() =>
                  router.push({ pathname: "/assessment", params: { puzzle } })
                }
              />
              <Button
                kind="secondary"
                label={t("Downloaded lessons", "已下载课程")}
                onPress={() => router.push("/downloads")}
              />
              {puzzle === "3x3" || puzzle === "2x2" ? (
                <>
                  <Txt small>
                    {t("Physical last-layer recognition", "实物最后一层识别")}
                  </Txt>
                  <Row>
                    {(puzzle === "3x3" ? ["OLL", "PLL"] : ["CLL"]).map(
                      (family) => (
                        <Button
                          key={family}
                          small
                          kind="secondary"
                          label={family}
                          onPress={() =>
                            router.push({
                              pathname: "/case-recognition",
                              params: { family },
                            })
                          }
                        />
                      ),
                    )}
                  </Row>
                </>
              ) : null}
              {unit && <DownloadButton id={unit.id} />}
              <Txt small>
                {t(
                  "Completion uses the current published unit revision. Earlier practice stays in your private history.",
                  "完成标记使用当前发布的单元版本，早期练习仍保留在你的私密历史中。",
                )}
              </Txt>
            </View>
          )}
        </View>
      )}
      {picker &&
        sheet(
          <>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt
                accessibilityRole="header"
                style={{ fontSize: 26, lineHeight: 33, fontWeight: "600" }}
              >
                {picker === "pathways"
                  ? t("Your pathways", "你的学习路线")
                  : t("Your units", "你的学习单元")}
              </Txt>
              <Button
                small
                kind="secondary"
                label={t("Close", "关闭")}
                onPress={() => setPicker(null)}
              />
            </Row>
            <Row>
              <Chip
                label={t("Units", "单元")}
                selected={picker === "units"}
                onPress={() => setPicker("units")}
              />
              <Chip
                label={t("Switch pathway", "切换路线")}
                selected={picker === "pathways"}
                onPress={() => setPicker("pathways")}
              />
            </Row>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
            >
              {picker === "pathways"
                ? pathways.map((path) => (
                    <Pressable
                      key={path.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: path.id === pathway.id }}
                      onPress={() => changePath(path.id)}
                      style={{
                        padding: 18,
                        borderRadius: 18,
                        borderWidth: 2,
                        borderColor: path.id === pathway.id ? c.blue : c.line,
                        backgroundColor:
                          path.id === pathway.id ? c.lavender : c.paper,
                        gap: 5,
                      }}
                    >
                      <Txt style={{ fontWeight: "600", fontSize: 20 }}>
                        {path.title[locale]}
                      </Txt>
                      <Txt small>
                        {t(
                          `${path.units.length} ${path.units.length === 1 ? "unit" : "units"}`,
                          `${path.units.length} 个单元`,
                        )}
                      </Txt>
                    </Pressable>
                  ))
                : pathway.units.map((u, index) => (
                    <Pressable
                      key={u.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: unit?.id === u.id }}
                      onPress={() => {
                        setUnitId(u.id);
                        setPicker(null);
                      }}
                      style={{
                        padding: 16,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: unit?.id === u.id ? c.blue : c.line,
                        backgroundColor: complete(u.id) ? c.mint : c.paper,
                        gap: 5,
                      }}
                    >
                      <Txt style={{ fontWeight: "600", fontSize: 19 }}>
                        {u.course.content.title[locale]}
                      </Txt>
                      <Txt small>
                        {t(`Unit ${index + 1}`, `第 ${index + 1} 单元`)} /{" "}
                        {complete(u.id)
                          ? t("Completed", "已完成")
                          : t(
                              `${u.lessons.length} ${u.lessons.length === 1 ? "lesson" : "lessons"}`,
                              `${u.lessons.length} 节小课`,
                            )}
                      </Txt>
                    </Pressable>
                  ))}
            </ScrollView>
          </>,
          () => setPicker(null),
        )}
      {selected &&
        sheet(
          <>
            <Txt
              accessibilityRole="header"
              style={{ fontWeight: "600", fontSize: 25, lineHeight: 32 }}
            >
              {selected.title[locale]}
            </Txt>
            {!!detail && <Txt>{detail}</Txt>}
            <Button
              label={t("Start lesson", "开始小课")}
              onPress={() => openLesson(selected)}
            />
            <Button
              kind="secondary"
              label={t("Back to path", "返回学习路线")}
              onPress={() => setSelected(undefined)}
            />
          </>,
          () => setSelected(undefined),
        )}
    </Screen>
  );
}
