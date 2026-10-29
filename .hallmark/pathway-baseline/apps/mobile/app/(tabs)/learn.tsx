import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { Lesson, LearningPlan } from "@cubers/core";
import { useApp } from "../../src/state";
import { DownloadButton } from "../../src/offline/DownloadButton";
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
} from "../../src/ui";
export default function Learn() {
  const { t, api, locale } = useApp(),
    c = useTheme(),
    [courses, setCourses] = useState<{ id: string; content: Lesson }[]>([]),
    [progress, setProgress] = useState<any[]>([]),
    [plan, setPlan] = useState<LearningPlan>(),
    [puzzle, setPuzzle] = useState("3x3"),
    [level, setLevel] = useState("all"),
    [collection, setCollection] = useState("path"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setBusy(true);
      setError("");
      Promise.all([
        api("courses"),
        api("progress"),
        api<LearningPlan>(`learning-plan?puzzle=${puzzle}`),
      ])
        .then(([courses, progress, plan]) => {
          if (!active) return;
          setCourses(courses);
          setProgress(progress);
          setPlan(plan);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setBusy(false);
        });
      return () => {
        active = false;
      };
    }, [api, puzzle]),
  );
  const completed = progress.filter((p) => p.currentCompleted).length,
    review = progress.filter((p) => new Date(p.reviewAt) <= new Date()),
    queue = plan?.puzzle === puzzle ? plan.queue : [],
    next = courses.find((c) => c.id === queue[0]?.lessonId);
  return (
    <Screen>
      <Heading
        eyebrow={t("Curiosity, one turn at a time", "带着好奇，慢慢转动")}
      >
        {t("Make it click.", "让每一步，都想得明白。")}
      </Heading>
      <Card style={{ backgroundColor: c.yellow, padding: 26, gap: 20 }}>
        <Row
          style={{ justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <View style={{ flex: 1, minWidth: 190, gap: 8 }}>
            <Txt
              style={{
                fontSize: 23,
                lineHeight: 30,
                fontWeight: "600",
                color: c.onAccent,
              }}
            >
              {t("Your own kind of progress", "按照自己的节奏进步")}
            </Txt>
            {next && (
              <Txt style={{ fontSize: 19, lineHeight: 28, color: c.onAccent }}>
                {next.content.title[locale]}
              </Txt>
            )}
          </View>
          <Row style={{ gap: 24, alignItems: "flex-start" }}>
            <View style={{ gap: 2 }}>
              <Txt
                style={{
                  fontSize: 36,
                  lineHeight: 43,
                  fontWeight: "600",
                  color: c.onAccent,
                }}
              >
                {completed}
              </Txt>
              <Txt small style={{ color: c.onAccent }}>
                {t("Lessons completed", "课已完成")}
              </Txt>
            </View>
            <View style={{ gap: 2 }}>
              <Txt
                style={{
                  fontSize: 36,
                  lineHeight: 43,
                  fontWeight: "600",
                  color: c.onAccent,
                }}
              >
                {review.length}
              </Txt>
              <Txt small style={{ color: c.onAccent }}>
                {t("Ready to review", "课待复习")}
              </Txt>
            </View>
          </Row>
        </Row>
        {next && (
          <Button
            label={t("Continue learning", "继续学习")}
            onPress={() => router.push(`/lesson/${next.id}`)}
          />
        )}
      </Card>
      <Txt small style={{ color: c.muted }}>
        {t(
          "Completion marks refer to the current published revision. Earlier practice stays in your private history and milestones.",
          "完成标记对应当前已发布版本，早期练习仍保留在私密历史与里程碑中。",
        )}
      </Txt>
      <Button
        kind="secondary"
        label={t("Downloaded lessons", "已下载课程")}
        onPress={() => router.push("/downloads")}
      />
      <Row>
        {["2x2", "3x3", "4x4", "pyraminx"].map((p) => (
          <Chip
            key={p}
            label={
              p === "pyraminx" ? t("Pyraminx", "金字塔") : p.replace("x", "×")
            }
            selected={puzzle === p}
            onPress={() => {
              setPuzzle(p);
              setCollection("path");
            }}
          />
        ))}
      </Row>
      <View style={{ gap: 16, paddingVertical: 12 }}>
        <Txt
          accessibilityRole="header"
          style={{ fontWeight: "600", fontSize: 24 }}
        >
          {t("Your practice queue", "适合你的练习")}
        </Txt>
        <Txt small>
          {t(
            "Due reviews, placement topics, and your next unfinished lessons. Everything stays optional.",
            "根据复习日期、小测结果和未完成课程安排，你也可以自由选择其他内容。",
          )}
        </Txt>
        {queue.map((item) => {
          const lesson = courses.find((c) => c.id === item.lessonId)?.content;
          return lesson ? (
            <View
              key={item.lessonId}
              style={{
                gap: 8,
                paddingVertical: 14,
                borderTopWidth: 1,
                borderColor: c.line,
              }}
            >
              <Txt small style={{ color: c.muted }}>
                {item.reason === "review"
                  ? t("Ready to review", "到了复习时间")
                  : item.reason === "placement"
                    ? t("From your placement check", "根据起点小测推荐")
                    : t("Next in your path", "接着学这一课")}
              </Txt>
              <Button
                small
                kind="secondary"
                label={lesson.title[locale]}
                onPress={() => router.push(`/lesson/${item.lessonId}`)}
              />
            </View>
          ) : null;
        })}
        {!busy && !queue.length && (
          <Txt small>
            {t(
              "No suggested practice right now. Explore any lesson below.",
              "暂时没有待推荐的练习，可以自由探索下方课程。",
            )}
          </Txt>
        )}
        <Button
          small
          label={t("Find my starting point", "找到我的学习起点")}
          onPress={() =>
            router.push({ pathname: "/assessment", params: { puzzle } })
          }
        />
      </View>
      <Row>
        <Chip
          label={t("Learning path", "学习路线")}
          selected={collection === "path"}
          onPress={() => setCollection("path")}
        />
        {(puzzle === "3x3"
          ? ["OLL", "PLL"]
          : puzzle === "2x2"
            ? ["CLL"]
            : []
        ).map((family) => (
          <Chip
            key={family}
            label={`${family} (${family === "OLL" ? 57 : family === "PLL" ? 21 : 42})`}
            selected={collection === family}
            onPress={() => {
              setCollection(family);
              setLevel("all");
            }}
          />
        ))}
      </Row>
      {collection !== "path" && (
        <>
          <Notice
            text={t(
              "Complete case coverage through original composite drills. Cubers IDs are separate from standard case numbers; these combinations favor familiar triggers and are not optimized speed algorithms.",
              "使用原创组合练习覆盖全部情况。Cubers 编号与通行情况编号分开；这些组合侧重常见转动，并非经过速拧优化的公式。",
            )}
          />
          <Button
            kind="secondary"
            label={t("Identify my physical last layer", "识别我的实物最后一层")}
            onPress={() =>
              router.push({
                pathname: "/case-recognition",
                params: { family: collection },
              })
            }
          />
        </>
      )}
      <Row>
        {[
          ["all", "All levels", "全部"],
          ["beginner", "First steps", "入门"],
          ["intermediate", "Build confidence", "进阶"],
          ["advanced", "Go deeper", "深入"],
        ].map(([id, en, zh]) => (
          <Chip
            key={id}
            label={t(en, zh)}
            selected={level === id}
            onPress={() => setLevel(id)}
          />
        ))}
      </Row>
      {!!error && <Notice text={error} error />}
      {busy && <Busy />}
      {puzzle === "pyraminx" && (
        <Notice
          text={t(
            "Pyraminx uses 120° turns and four triangular faces. These focused drills cover tips, edge placement and one last-layer case.",
            "金字塔采用 120° 转动与四个三角面。这组专项练习涵盖尖角、棱块插入和一种最后一层情况。",
          )}
        />
      )}
      {courses
        .filter(
          ({ content: l }) =>
            l.puzzle === puzzle &&
            (level === "all" || l.level === level) &&
            (collection === "path"
              ? !l.caseFamily
              : l.caseFamily === collection),
        )
        .map(({ id, content: l }, index) => {
          const done = progress.some(
            (p) => p.lessonId === id && p.currentCompleted,
          );
          const isNext = next?.id === id;
          return (
            <View
              key={id}
              style={{
                flexDirection: "row",
                gap: 18,
                alignItems: "stretch",
              }}
            >
              <View style={{ width: 48, alignItems: "center" }}>
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 18,
                    backgroundColor: done
                      ? c.mint
                      : isNext
                        ? c.yellow
                        : c.paper,
                    borderWidth: 2,
                    borderColor: done ? c.mintDeep : isNext ? c.edge : c.line,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Txt style={{ fontWeight: "600", fontSize: 19 }}>
                    {done ? "✓" : String(index + 1).padStart(2, "0")}
                  </Txt>
                </View>
                <View
                  style={{
                    width: 2,
                    flex: 1,
                    minHeight: 20,
                    backgroundColor: c.line,
                    marginTop: 8,
                  }}
                />
              </View>
              <View
                style={{ flex: 1, minWidth: 0, gap: 10, paddingBottom: 24 }}
              >
                <Txt
                  style={{ fontWeight: "600", fontSize: 22, lineHeight: 29 }}
                >
                  {l.title[locale]}
                </Txt>
                <Row style={{ gap: 12 }}>
                  <Txt small style={{ color: c.muted }}>
                    {l.level === "beginner"
                      ? t("First steps", "入门")
                      : l.level === "intermediate"
                        ? t("Build confidence", "进阶")
                        : t("Go deeper", "深入")}
                  </Txt>
                  <Txt small style={{ color: c.muted }}>
                    {l.minutes} {t("min", "分钟")}
                  </Txt>
                  {done && (
                    <Txt small style={{ color: c.mintDeep }}>
                      {t("Completed", "已完成")}
                    </Txt>
                  )}
                </Row>
                <Txt small style={{ color: c.muted }}>
                  {l.summary[locale]}
                </Txt>
                <Row>
                  <Button
                    small
                    kind={isNext ? "primary" : "secondary"}
                    label={t("Open lesson", "开始学习")}
                    onPress={() => router.push(`/lesson/${id}`)}
                  />
                  <DownloadButton id={id} />
                </Row>
              </View>
            </View>
          );
        })}
    </Screen>
  );
}
