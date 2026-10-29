import React, { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { StatisticsQuery, type ActivityCalendar } from "@cubers/core";
import { useApp } from "../../src/state";
import { ProfileAvatar } from "../../src/ProfileAvatar";
import { ProfileGear } from "../../src/ProfileGear";
import { ProfileActivity } from "../../src/ProfileActivity";
import { ProfileDetails } from "../../src/ProfileDetails";
import { ProfileSectionTabs } from "../../src/ProfileSectionTabs";
import { Screen, Txt, Button, Row, Notice, Busy, useTheme } from "../../src/ui";

type Summary = {
  owner: string;
  progress: any[];
  statistics: any;
  profile: any;
  goals: any[];
  activity?: ActivityCalendar;
  activityError?: string;
};
export default function Profile() {
  const { api, user, token, region, t, reload } = useApp(),
    c = useTheme();
  const owner = JSON.stringify([token, user?.id, region]);
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const generation = useRef(0);
  const [stored, setStored] = useState<Summary>();
  const [section, setSection] = useState<
    "overview" | "history" | "goals" | "posts"
  >("overview");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [zone] = useState(() => {
    try {
      return StatisticsQuery.parse({
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }).timeZone;
    } catch {
      return "UTC";
    }
  });
  const data = stored?.owner === owner ? stored : undefined;
  const load = useCallback(() => {
    const epoch = ++generation.current;
    setLoading(true);
    setError("");
    return Promise.all([
      api("progress"),
      api("me/statistics"),
      api("me/profile"),
      api("me/goals"),
      api<ActivityCalendar>(`me/activity?timeZone=${encodeURIComponent(zone)}`)
        .then((activity) => ({
          activity,
          activityError: undefined as string | undefined,
        }))
        .catch((e: Error) => ({
          activity: undefined,
          activityError: e.message,
        })),
    ])
      .then(([progress, statistics, profile, goals, activity]) => {
        if (generation.current !== epoch || ownerRef.current !== owner) return;
        setStored({ owner, progress, statistics, profile, goals, ...activity });
      })
      .catch((e: Error) => {
        if (generation.current === epoch && ownerRef.current === owner)
          setError(e.message);
      })
      .finally(() => {
        if (generation.current === epoch && ownerRef.current === owner)
          setLoading(false);
      });
  }, [api, owner, zone]);
  useFocusEffect(
    useCallback(() => {
      void load();
      void reload();
      return () => {
        generation.current++;
        setStored(undefined);
        setError("");
      };
    }, [load, reload]),
  );
  const completed =
    data?.progress.filter((item) => item.currentCompleted).length ?? 0;
  const approvedSolves =
    data?.statistics.categories.reduce(
      (sum: number, category: any) => sum + category.solves,
      0,
    ) ?? 0;
  const overview = [
    [data?.activity?.currentStreak, t("Day streak", "连续练习天数"), c.orange],
    [
      data ? completed : undefined,
      t("Lessons learned", "已学课程"),
      c.lavender,
    ],
    [
      data ? approvedSolves : undefined,
      t("Approved solves", "已核准还原"),
      c.mint,
    ],
    [
      data?.activity?.totals.activeDays,
      t("Active days this year", "一年内活跃天数"),
      c.field,
    ],
  ] as const;
  const privateProfile = user?.privateProfile ?? true;
  const sharingProfile =
    !privateProfile &&
    data?.profile.sharingEligible &&
    data.profile.review.status === "APPROVED" &&
    Object.values(data.profile.settings.visibility).some(
      (value) => value !== "PRIVATE",
    );
  return (
    <Screen>
      <View
        style={{
          borderBottomWidth: 1,
          borderColor: c.line,
          paddingBottom: 24,
          gap: 18,
        }}
      >
        <View
          style={{
            minHeight: 190,
            borderRadius: 26,
            backgroundColor: c.lavender,
            padding: 22,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View style={{ alignSelf: "flex-end", marginBottom: 4 }}>
            <ProfileGear onPress={() => router.push("/settings")} />
          </View>
          <View style={{ marginTop: -12, marginBottom: 12 }}>
            <ProfileAvatar avatar={data?.profile.settings.avatar} size={116} />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 31, lineHeight: 39, fontWeight: "600" }}
          >
            {user?.displayName}
          </Txt>
          <Txt small style={{ color: c.muted }}>
            {region === "CN"
              ? t("Mainland China community", "中国大陆社区")
              : t("International community", "国际社区")}
          </Txt>
          <Txt small style={{ color: c.muted }}>
            {sharingProfile
              ? t("Sharing selected sections", "分享所选部分")
              : t("Private profile", "私密个人页")}
          </Txt>
          {!!user?.bio && <Txt>{user.bio}</Txt>}
        </View>
        <Row style={{ gap: 12 }}>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Button
              kind="secondary"
              label={t("Friends & mentorship", "好友与指导")}
              onPress={() => router.push("/connections")}
            />
          </View>
          <Button
            kind="secondary"
            label={t("My clubs", "我的社团")}
            onPress={() => router.push("/clubs")}
          />
          {sharingProfile && (
            <Button
              small
              kind="secondary"
              label={t("View shared profile", "查看分享的个人页")}
              onPress={() =>
                router.push({
                  pathname: "/profile/[id]",
                  params: { id: user!.id },
                })
              }
            />
          )}
        </Row>
        {data?.profile.review.status === "PENDING" && (
          <Notice
            text={t(
              "Your shared profile is awaiting content review.",
              "分享的个人页正在等待内容审核。",
            )}
          />
        )}
      </View>
      <ProfileSectionTabs
        label={t("Profile sections", "个人页栏目")}
        value={section}
        onChange={setSection}
        items={[
          { value: "overview", label: t("Overview", "概览") },
          { value: "history", label: t("History", "历史") },
          { value: "goals", label: t("Goals", "目标") },
          { value: "posts", label: t("Posts", "分享") },
        ]}
      />
      {!!error && <Notice text={error} error />}
      {loading && <Busy />}
      {section === "overview" && (
        <>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 24, lineHeight: 31, fontWeight: "600" }}
          >
            {t("Your progress", "你的进步")}
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {overview.map(([value, label, color]) => (
              <View
                key={label}
                style={{
                  flexBasis: "46%",
                  flexGrow: 1,
                  minWidth: 125,
                  borderWidth: 1,
                  borderColor: c.line,
                  borderRadius: 20,
                  padding: 18,
                  gap: 10,
                }}
              >
                <View
                  style={{
                    alignSelf: "flex-start",
                    backgroundColor: color,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                  }}
                >
                  <Txt
                    style={{ fontSize: 28, lineHeight: 36, fontWeight: "600" }}
                  >
                    {value ?? "—"}
                  </Txt>
                </View>
                <Txt small style={{ color: c.muted }}>
                  {label}
                </Txt>
              </View>
            ))}
          </View>
          <Txt small style={{ color: c.muted }}>
            {t(
              "Streaks use completed practice in your time zone. Solve totals cover your most recent 1,000 approved race and daily results.",
              "连续天数按所在时区内完成的练习计算，还原总数覆盖最近一千次已核准竞速与每日结果。",
            )}
          </Txt>
          {data?.activity && <ProfileActivity data={data.activity} />}
          {!!data?.activityError && <Notice text={data.activityError} error />}
          {data?.activityError && (
            <Button
              small
              kind="secondary"
              label={t("Retry activity", "重新加载活动")}
              onPress={() => void load()}
            />
          )}
          <ProfileDetails key={owner + ":overview"} section="overview" />
        </>
      )}
      {section === "history" && (
        <ProfileDetails key={owner + ":history"} section="history" />
      )}
      {section === "posts" && (
        <ProfileDetails key={owner + ":posts"} section="posts" />
      )}
      {section === "goals" && (
        <View style={{ gap: 18 }}>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 24, fontWeight: "600" }}
          >
            {t("Personal goals", "个人目标")}
          </Txt>
          <Button
            kind="secondary"
            label={t("Manage goals in settings", "前往设置管理目标")}
            onPress={() =>
              router.push({
                pathname: "/settings",
                params: { tab: "learning" },
              })
            }
          />
          {data?.goals.length ? (
            data.goals.map((goal) => (
              <View
                key={goal.id}
                style={{
                  borderWidth: 1,
                  borderColor: c.line,
                  borderRadius: 20,
                  padding: 18,
                  gap: 8,
                }}
              >
                <Txt style={{ fontWeight: "600" }}>
                  {goal.puzzle.replace("x", "×")} /{" "}
                  {goal.kind === "time"
                    ? t("Personal best", "个人最快")
                    : goal.kind === "lessons"
                      ? t("Lessons", "课程")
                      : t("Solves", "还原次数")}
                </Txt>
                <Txt>
                  {goal.kind === "time"
                    ? `${goal.current ? (goal.current / 1000).toFixed(2) : "—"} / ${(goal.target / 1000).toFixed(2)}s`
                    : `${goal.current} / ${goal.target}`}
                </Txt>
                <Txt
                  small
                  style={{ color: goal.achieved ? c.mintDeep : c.muted }}
                >
                  {goal.achieved
                    ? t("Goal reached", "目标已达成")
                    : t("Keep going at your pace", "按照你的节奏，继续练习")}
                </Txt>
              </View>
            ))
          ) : (
            <Txt small>
              {t(
                "Your saved personal goals will appear here.",
                "保存的个人目标将显示在这里。",
              )}
            </Txt>
          )}
        </View>
      )}
    </Screen>
  );
}
