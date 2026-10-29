import React, { useState, useCallback, useRef } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useApp } from "./state";
import { lessons } from "@cubers/core";
import { Txt, Button, Row, Field, Chip, Notice, Busy, useTheme } from "./ui";
export function ProfileDetails({
  section,
}: {
  section: "overview" | "history" | "goals" | "posts";
}) {
  const { t, user, token, api, reload, region, locale } = useApp(),
    c = useTheme(),
    [storedProgress, setProgress] = useState<any[]>([]),
    [storedPosts, setPosts] = useState<any[]>([]),
    [message, setMessage] = useState(""),
    [storedStatistics, setStatistics] = useState<any>(),
    [storedHistory, setHistory] = useState<any[]>([]),
    [storedLessons, setLessonHistory] = useState<any[]>([]),
    [storedCursor, setHistoryCursor] = useState<string | null>(null),
    [storedGoals, setGoals] = useState<any[]>([]),
    [puzzle, setPuzzle] = useState("3x3"),
    [input, setInput] = useState("virtual"),
    [goalKind, setGoalKind] = useState("solves"),
    [target, setTarget] = useState("10"),
    [busy, setBusy] = useState(false);
  const identity = JSON.stringify([token, user?.id, region, puzzle, input]);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const generation = useRef(0),
    morePending = useRef(false);
  const [loadedFor, setLoadedFor] = useState<string>(),
    [pagingHistory, setPagingHistory] = useState(false);
  const current = loadedFor === identity;
  const progress = current ? storedProgress : [],
    posts = current ? storedPosts : [];
  const statistics = current ? storedStatistics : undefined,
    history = current ? storedHistory : [],
    lessonHistory = current ? storedLessons : [];
  const historyCursor = current ? storedCursor : null,
    goals = current ? storedGoals : [];
  const load = useCallback(() => {
    if (identityRef.current !== identity) return Promise.resolve();
    const epoch = ++generation.current;
    setLoadedFor(undefined);
    morePending.current = false;
    setPagingHistory(false);
    return Promise.all([
      api("progress"),
      api("posts/mine"),
      api("me/statistics"),
      api(`me/history?puzzle=${puzzle}&input=${input}`),
      api("me/goals"),
      api("lesson-sessions"),
    ])
      .then(([p, posts, stats, history, goals, lessons]) => {
        if (epoch !== generation.current || identityRef.current !== identity)
          return;
        setLoadedFor(identity);
        setProgress(p);
        setPosts(posts);
        setStatistics(stats);
        setHistory(history.items);
        setHistoryCursor(history.nextCursor);
        setGoals(goals);
        setLessonHistory(lessons);
      })
      .catch((e) => {
        if (epoch === generation.current && identityRef.current === identity)
          setMessage(e.message);
      });
  }, [api, puzzle, input, identity]);
  useFocusEffect(
    useCallback(() => {
      void load();
      void reload();
      return () => {
        generation.current++;
        morePending.current = false;
        setLoadedFor(undefined);
        setMessage("");
      };
    }, [load, reload]),
  );
  async function addGoal() {
    setBusy(true);
    try {
      await api("me/goals", {
        puzzle,
        input,
        kind: goalKind,
        target:
          goalKind === "time"
            ? Math.round(Number(target) * 1000)
            : Number(target),
      });
      await load();
      setMessage(
        t(
          "Personal goal saved. Progress comes from your verified records.",
          "个人目标已保存，进度将按经过验证的记录计算。",
        ),
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!current)
    return (
      <View style={{ gap: 16 }}>
        {message ? (
          <>
            <Notice text={message} error />
            <Button
              small
              kind="secondary"
              label={t("Try again", "重试")}
              onPress={() => void load()}
            />
          </>
        ) : (
          <Busy />
        )}
      </View>
    );
  return (
    <View style={{ gap: 24 }}>
      {section === "history" && (
        <>
          <Row>
            {["2x2", "3x3", "4x4", "pyraminx"].map((value) => (
              <Chip
                key={value}
                label={
                  value === "pyraminx"
                    ? t("Pyraminx", "金字塔")
                    : value.replace("x", "×")
                }
                selected={puzzle === value}
                onPress={() => setPuzzle(value)}
              />
            ))}
          </Row>
          <Row>
            {[
              ["virtual", "Virtual", "虚拟"],
              ["scan", "Physical", "实物"],
              ["smart", "Smart", "智能"],
            ].map(([value, en, zh]) => (
              <Chip
                key={value}
                label={t(en, zh)}
                selected={input === value}
                onPress={() => setInput(value)}
              />
            ))}
          </Row>
        </>
      )}
      {section === "history" && (
        <View style={{ gap: 18, paddingTop: 20, paddingBottom: 12 }}>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 25, lineHeight: 32, fontWeight: "600" }}
          >
            {t("Your learning history", "你的学习历史")}
          </Txt>
          <Button
            small
            kind="secondary"
            label={t("Guided solve practice history", "查看完整还原练习记录")}
            onPress={() => router.push("/first-solve")}
          />
          <Txt small style={{ color: c.muted }}>
            {t(
              "Private · your latest 30 practices. Physical turns are learner-confirmed and checked by scans; they are separate from ranked results.",
              "私密 · 最近三十次练习。实物转动由本人确认，并通过扫描核对，与排名成绩分开记录。",
            )}
          </Txt>
          {lessonHistory.length ? (
            lessonHistory.slice(0, 8).map((practice) => (
              <View
                key={practice.id}
                style={{
                  gap: 10,
                  paddingVertical: 18,
                  borderTopWidth: 1,
                  borderColor: c.line,
                }}
              >
                <Txt style={{ fontWeight: "600" }}>
                  {practice.puzzle === "pyraminx"
                    ? t("Pyraminx", "金字塔")
                    : practice.puzzle.replace("x", "×")}{" "}
                  /{" "}
                  {practice.input === "scan"
                    ? t("Physical practice", "实物练习")
                    : practice.input === "smart"
                      ? t("Smart-cube practice", "智能魔方练习")
                      : t("Virtual practice", "虚拟练习")}
                </Txt>
                <Txt small>
                  {lessons.find((lesson) => lesson.id === practice.lessonId)
                    ?.title[locale] || t("Learning practice", "学习练习")}
                </Txt>
                <Txt small>
                  {practice.status === "COMPLETED"
                    ? t("Checkpoint verified", "检查点已验证")
                    : practice.status === "CANCELLED"
                      ? t("Ended", "已结束")
                      : practice.status === "INTERRUPTED"
                        ? t(
                            "Interrupted, synchronize a new practice",
                            "已中断，请重新同步练习",
                          )
                        : t("In progress", "进行中")}{" "}
                  / {new Date(practice.createdAt).toLocaleDateString()}
                </Txt>
                {practice.input === "smart" && (
                  <Txt small>
                    {practice.smart?.continuity === "counter"
                      ? t(
                          "Received turns checked with the device counter; this is private learning, not a ranked result.",
                          "接收的转动经过设备计数核对；这是私密学习，不是排名成绩。",
                        )
                      : t(
                          "Device positions agree with the received turns. This model cannot prove that every turn was received; no turning-speed statistic is awarded.",
                          "设备状态与接收的转动一致。此型号无法证明所有转动都已接收，不计转速统计。",
                        )}
                  </Txt>
                )}
                <Button
                  small
                  kind="secondary"
                  label={
                    practice.status === "PREPARING" ||
                    practice.status === "PRACTICING"
                      ? t("Continue lesson", "继续学习")
                      : t("Open lesson", "打开课程")
                  }
                  onPress={() =>
                    router.push({
                      pathname: "/lesson/[id]",
                      params: { id: practice.lessonId, input: practice.input },
                    })
                  }
                />
              </View>
            ))
          ) : (
            <Txt small>
              {t(
                "Finish a lesson drill to start your learning history.",
                "完成课程练习，开始记录学习历史。",
              )}
            </Txt>
          )}
        </View>
      )}
      {section === "overview" && (
        <View style={{ gap: 18, paddingTop: 20, paddingBottom: 12 }}>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 25, lineHeight: 32, fontWeight: "600" }}
          >
            {t("Your solve statistics", "你的还原统计")}
          </Txt>
          <Button
            kind="secondary"
            label={t(
              "Practice sessions and daily totals",
              "练习时段与每日汇总",
            )}
            onPress={() => router.push("/statistics")}
          />
          <Txt small style={{ color: c.muted }}>
            {t(
              "Private · most recent 1,000 approved race and daily solves. Categories stay separate. Times include server timing; these are not official competition records.",
              "私密 · 最近一千次已核准的竞速与每日还原，按类别分别统计。时间含服务器计时，并非官方比赛记录。",
            )}
          </Txt>
          {statistics?.categories.length ? (
            statistics.categories.map((category: any) => (
              <View
                key={`${category.puzzle}:${category.input}`}
                style={{
                  gap: 10,
                  paddingVertical: 18,
                  borderTopWidth: 1,
                  borderColor: c.line,
                }}
              >
                <Txt style={{ fontWeight: "600" }}>
                  {category.puzzle.replace("x", "×")} /{" "}
                  {category.input === "scan"
                    ? t("Physical", "实物")
                    : category.input === "smart"
                      ? t("Smart", "智能")
                      : t("Virtual", "虚拟")}
                </Txt>
                <Row style={{ gap: 26, alignItems: "flex-start" }}>
                  <View style={{ gap: 4 }}>
                    <Txt
                      style={{
                        fontSize: 27,
                        lineHeight: 34,
                        fontWeight: "600",
                      }}
                    >
                      {category.solves}
                    </Txt>
                    <Txt small style={{ color: c.muted }}>
                      {t("Solves", "还原次数")}
                    </Txt>
                  </View>
                  <View style={{ gap: 4 }}>
                    <Txt
                      style={{
                        fontSize: 27,
                        lineHeight: 34,
                        fontWeight: "600",
                      }}
                    >
                      {(category.bestMs / 1000).toFixed(2)}s
                    </Txt>
                    <Txt small style={{ color: c.muted }}>
                      {t("Best", "最快")}
                    </Txt>
                  </View>
                  <View style={{ gap: 4 }}>
                    <Txt
                      style={{
                        fontSize: 27,
                        lineHeight: 34,
                        fontWeight: "600",
                      }}
                    >
                      {(category.meanMs / 1000).toFixed(2)}s
                    </Txt>
                    <Txt small style={{ color: c.muted }}>
                      {t("Mean", "均值")}
                    </Txt>
                  </View>
                </Row>
                {category.latestFiveTrimmedMeanMs !== null && (
                  <Txt small>
                    {t(
                      "Latest five, removing fastest and slowest",
                      "最近五次去掉最快和最慢",
                    )}
                    : {(category.latestFiveTrimmedMeanMs / 1000).toFixed(2)}s
                  </Txt>
                )}
                {category.moveCount !== null && (
                  <Txt small>
                    {t(
                      `${category.moveCount} tracked moves / ${category.turnsPerSecond} turns/s`,
                      `${category.moveCount} 次已追踪转动 / ${category.turnsPerSecond} 次/秒`,
                    )}
                  </Txt>
                )}
              </View>
            ))
          ) : (
            <Txt small style={{ color: c.muted }}>
              {t(
                "Complete a race or daily solve to start your private statistics.",
                "完成一次竞速或每日还原，开始积累私密统计。",
              )}
            </Txt>
          )}
        </View>
      )}
      {section === "goals" && (
        <View style={{ gap: 18, paddingTop: 20, paddingBottom: 12 }}>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 25, lineHeight: 32, fontWeight: "600" }}
          >
            {t("Personal goals", "个人目标")}
          </Txt>
          <Row>
            {["2x2", "3x3", "4x4", "pyraminx"].map((value) => (
              <Chip
                key={value}
                label={
                  value === "pyraminx"
                    ? t("Pyraminx", "金字塔")
                    : value.replace("x", "×")
                }
                selected={puzzle === value}
                onPress={() => setPuzzle(value)}
              />
            ))}
          </Row>
          <Row>
            {[
              ["virtual", "Virtual", "虚拟"],
              ["scan", "Physical", "实物"],
            ].map(([value, en, zh]) => (
              <Chip
                key={value}
                label={t(en, zh)}
                selected={input === value}
                onPress={() => setInput(value)}
              />
            ))}
          </Row>
          <Row>
            {[
              ["solves", "Solve count", "还原次数"],
              ["time", "Personal best", "个人最快"],
              ["lessons", "Lessons", "课程数"],
            ].map(([value, en, zh]) => (
              <Chip
                key={value}
                label={t(en, zh)}
                selected={goalKind === value}
                onPress={() => {
                  setGoalKind(value);
                  setTarget(
                    value === "time" ? "30" : value === "lessons" ? "3" : "10",
                  );
                }}
              />
            ))}
          </Row>
          <Field
            label={
              goalKind === "time"
                ? t("Target time in seconds", "目标秒数")
                : t("Target count", "目标次数")
            }
            value={target}
            onChangeText={setTarget}
            keyboardType="decimal-pad"
          />
          <Button
            label={t("Save personal goal", "保存个人目标")}
            onPress={() => void addGoal()}
            disabled={
              busy || !Number.isFinite(Number(target)) || Number(target) <= 0
            }
          />
          {goals.map((goal) => (
            <View
              key={goal.id}
              style={{
                gap: 12,
                paddingVertical: 18,
                borderTopWidth: 1,
                borderColor: c.line,
              }}
            >
              <Txt style={{ fontWeight: "600" }}>
                {goal.achieved ? "✓ " : ""}
                {goal.puzzle.replace("x", "×")} /{" "}
                {goal.kind === "time"
                  ? t(
                      `Personal best: ${(goal.target / 1000).toFixed(2)}s`,
                      `个人最快：${(goal.target / 1000).toFixed(2)} 秒`,
                    )
                  : goal.kind === "lessons"
                    ? t(`${goal.target} lessons`, `${goal.target} 节课程`)
                    : t(
                        `${goal.target} new ${goal.input} solves`,
                        `${goal.target} 次新 ${goal.input === "scan" ? "实物" : goal.input === "smart" ? "智能" : "虚拟"}还原`,
                      )}
              </Txt>
              <Txt small>
                {goal.kind === "time"
                  ? goal.current
                    ? `${(goal.current / 1000).toFixed(2)}s`
                    : t("No approved solve yet", "尚无核准还原")
                  : `${goal.current} / ${goal.target}`}
              </Txt>
              {goal.kind !== "time" && (
                <View
                  accessibilityRole="progressbar"
                  accessibilityValue={{
                    min: 0,
                    max: goal.target,
                    now: goal.current,
                  }}
                  accessibilityLabel={t(
                    "Personal goal progress",
                    "个人目标进度",
                  )}
                  style={{
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: c.line,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: c.mintDeep,
                      width: `${Math.max(0, Math.min(100, (goal.current / goal.target) * 100))}%`,
                    }}
                  />
                </View>
              )}
              <Button
                small
                kind="secondary"
                label={t("Remove goal", "移除目标")}
                onPress={() => {
                  api(`me/goals/${goal.id}`, undefined, "DELETE")
                    .then(load)
                    .catch((error) => setMessage(error.message));
                }}
              />
            </View>
          ))}
        </View>
      )}
      {section === "history" && (
        <View style={{ gap: 18, paddingTop: 20, paddingBottom: 12 }}>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 25, lineHeight: 32, fontWeight: "600" }}
          >
            {t("Private solve history", "私密还原记录")}
          </Txt>
          <Txt small style={{ color: c.muted }}>
            {puzzle.replace("x", "×")} /{" "}
            {input === "scan"
              ? t("Physical", "实物")
              : input === "smart"
                ? t("Smart", "智能")
                : t("Virtual", "虚拟")}
          </Txt>
          {history.length ? (
            history.map((attempt) => (
              <View
                key={attempt.id}
                style={{
                  paddingVertical: 12,
                  borderTopWidth: 1,
                  borderColor: c.line,
                  gap: 4,
                }}
              >
                <Txt>
                  {attempt.durationMs
                    ? `${(attempt.durationMs / 1000).toFixed(2)}s / `
                    : ""}
                  {attempt.status}
                </Txt>
                <Txt small style={{ color: c.muted }}>
                  {new Date(attempt.createdAt).toLocaleString()} /{" "}
                  {attempt.room.mixed
                    ? t("Mixed inputs, casual", "混合输入，休闲")
                    : attempt.room.ranked
                      ? t("Ranked", "排名")
                      : t("Casual", "休闲")}
                  {attempt.moveCount !== null
                    ? ` / ${attempt.moveCount} ${t("moves", "次转动")}`
                    : ""}
                </Txt>
                {!!attempt.reason && <Txt small>{attempt.reason}</Txt>}
                {attempt.replayAvailable && user?.permissions.canPost && (
                  <Button
                    kind="secondary"
                    label={t("Share anonymous replay", "分享匿名回放")}
                    onPress={() =>
                      router.push({
                        pathname: "/replay-shares",
                        params: { attemptId: attempt.id },
                      })
                    }
                  />
                )}
                {attempt.replayAvailable && user?.permissions.canLearn && (
                  <Button
                    kind="secondary"
                    label={
                      attempt.room.input === "smart"
                        ? t("Replay received turns", "回放收到的转动")
                        : t("Replay virtual solve", "回放虚拟还原")
                    }
                    onPress={() =>
                      router.push({
                        pathname: "/replay/[id]",
                        params: { id: attempt.id },
                      })
                    }
                  />
                )}
              </View>
            ))
          ) : (
            <Txt small style={{ color: c.muted }}>
              {t("No solves in this category yet.", "此类别尚无还原记录。")}
            </Txt>
          )}
          {historyCursor && (
            <Button
              kind="secondary"
              disabled={pagingHistory}
              label={t("Older solves", "较早的还原")}
              onPress={() => {
                if (morePending.current) return;
                const epoch = generation.current;
                morePending.current = true;
                setPagingHistory(true);
                api(
                  `me/history?puzzle=${puzzle}&input=${input}&cursor=${historyCursor}`,
                )
                  .then((result) => {
                    if (
                      epoch !== generation.current ||
                      identityRef.current !== identity
                    )
                      return;
                    setHistory((previous) => [...previous, ...result.items]);
                    setHistoryCursor(result.nextCursor);
                  })
                  .catch((error) => {
                    if (
                      epoch === generation.current &&
                      identityRef.current === identity
                    )
                      setMessage(error.message);
                  })
                  .finally(() => {
                    if (
                      epoch === generation.current &&
                      identityRef.current === identity
                    ) {
                      morePending.current = false;
                      setPagingHistory(false);
                    }
                  });
              }}
            />
          )}
        </View>
      )}
      {section === "overview" && (
        <View style={{ gap: 18, paddingTop: 20, paddingBottom: 12 }}>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 25, lineHeight: 32, fontWeight: "600" }}
          >
            {t("Small wins, well earned.", "小小进步，也值得记录。")}
          </Txt>
          {progress.filter((p) => p.completed).length > 0 ? (
            <>
              <Txt>
                {t(
                  "First checkpoint: Completed a verified practice exercise.",
                  "第一个检查点：完成了经过验证的练习。",
                )}
              </Txt>
            </>
          ) : (
            <Txt small style={{ color: c.muted }}>
              {t(
                "Your first verified practice checkpoint will appear here.",
                "完成第一个经过验证的练习后，会显示在这里。",
              )}
            </Txt>
          )}
        </View>
      )}
      {section === "history" && (
        <Button
          kind="secondary"
          label={t("Replay sharing requests", "回放分享申请")}
          onPress={() => router.push("/replay-shares")}
        />
      )}
      {section === "history" && user?.guardianEligible && (
        <Button
          kind="secondary"
          label={t("Review child's replay sharing", "审核儿童回放分享")}
          onPress={() =>
            router.push({
              pathname: "/replay-shares",
              params: { role: "guardian" },
            })
          }
        />
      )}
      {section === "overview" && (
        <Button
          kind="secondary"
          label={t("Achievement cards", "成就卡片")}
          onPress={() => router.push("/achievement-cards")}
        />
      )}
      {section === "posts" && (
        <View style={{ gap: 18, paddingTop: 20, paddingBottom: 12 }}>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 25, lineHeight: 32, fontWeight: "600" }}
          >
            {t("Your contributions", "你的分享")}
          </Txt>
          <Button
            small
            kind="secondary"
            label={t("My clubs and invitations", "我的社团与邀请")}
            onPress={() => router.push("/clubs")}
          />
          <Button
            small
            kind="secondary"
            label={t("Friends and mentorship", "好友与指导")}
            onPress={() => router.push("/connections")}
          />
          {!!user?.notifications.length && (
            <View style={{ gap: 18, paddingTop: 20, paddingBottom: 12 }}>
              <Txt style={{ fontWeight: "600" }}>
                {t("Recent updates", "最近的消息")}
              </Txt>
              {user.notifications.slice(0, 5).map((notification) => (
                <View key={notification.id} style={{ gap: 4 }}>
                  <Txt small style={{ fontWeight: "600" }}>
                    {notification.title}
                  </Txt>
                  <Txt small>{notification.body}</Txt>
                </View>
              ))}
            </View>
          )}
          <Button
            small
            kind="secondary"
            label={t(
              "All updates & notification settings",
              "全部消息与消息设置",
            )}
            onPress={() => router.push("/notifications")}
          />
          <Button
            small
            kind="secondary"
            label={t(
              "Cubers service & learning updates",
              "Cubers 服务与学习公告",
            )}
            onPress={() => router.push("/announcements")}
          />
          {posts.length ? (
            posts.map((p) => (
              <View
                key={p.id}
                style={{
                  paddingVertical: 9,
                  borderTopWidth: 1,
                  borderColor: c.line,
                  gap: 4,
                }}
              >
                <Txt numberOfLines={2}>{p.body}</Txt>
                <Txt small style={{ color: c.muted }}>
                  {p.status === "PUBLISHED"
                    ? t("Published", "已发布")
                    : p.status === "REJECTED"
                      ? t("Not approved", "未通过审核")
                      : t("Awaiting review", "待审核")}
                  {p.reason ? ` / ${p.reason}` : ""}
                </Txt>
                <Button
                  small
                  kind="secondary"
                  label={t("Open / edit post", "查看／编辑帖子")}
                  onPress={() => router.push(`/post/${p.id}`)}
                />
              </View>
            ))
          ) : (
            <Txt small style={{ color: c.muted }}>
              {t(
                "Stories you submit will appear here with their review status.",
                "提交的帖子会在这里显示审核进度。",
              )}
            </Txt>
          )}
        </View>
      )}
      {!!message && <Notice text={message} />}
    </View>
  );
}
