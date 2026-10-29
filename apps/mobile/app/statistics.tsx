import { backOrReplace } from "../src/back-navigation";
import React, { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import {
  StatisticsQuery,
  type SessionCategory,
  type SessionStatistics,
} from "@cubers/core";
import { useApp } from "../src/state";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Button,
  Row,
  Chip,
  Busy,
  Notice,
  useTheme,
} from "../src/ui";

export default function Statistics() {
  const { api, token, user, region, t, locale } = useApp();
  const paper = useTheme();
  const [deviceZone] = useState(() => {
    try {
      return StatisticsQuery.parse({
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }).timeZone;
    } catch {
      return "UTC";
    }
  });
  const [zone, setZone] = useState(deviceZone);
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    result: SessionStatistics;
  }>();
  const owner = JSON.stringify([token, user?.id, region, zone]);
  // Hide an earlier account/view immediately, before focus-effect cleanup runs.
  const data = snapshot?.owner === owner ? snapshot.result : undefined;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0);
  async function refresh() {
    const epoch = ++generation.current;
    setSnapshot(undefined);
    setBusy(true);
    setError("");
    try {
      const result = await api<SessionStatistics>(
        `me/session-statistics?timeZone=${encodeURIComponent(zone)}`,
      );
      if (epoch === generation.current) setSnapshot({ owner, result });
    } catch {
      if (epoch === generation.current)
        setError(
          t(
            "Could not load your sessions. Reconnect and refresh.",
            "暂时无法加载练习时段，请联网后刷新。",
          ),
        );
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      if (token) void refresh();
      return () => {
        generation.current++;
        setSnapshot(undefined);
      };
    }, [api, token, user?.id, region, zone]),
  );
  function date(at: string) {
    try {
      return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
        timeZone: data?.timeZone ?? zone,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(at));
    } catch {
      return at;
    }
  }
  const category = (c: SessionCategory) => (
    <View key={`${c.puzzle}:${c.input}`} style={{ borderTopWidth: 1, borderTopColor: paper.line, paddingVertical: 14, gap: 6 }}>
      <Txt style={{ fontWeight: "600" }}>
        {c.puzzle === "pyraminx"
          ? t("Pyraminx", "金字塔")
          : c.puzzle.replace("x", "×")}{" "}
        /{" "}
        {c.input === "scan"
          ? t("Physical", "实物")
          : c.input === "smart"
            ? t("Smart", "智能")
            : t("Virtual", "虚拟")}
      </Txt>
      <Txt small>
        {t(
          `${c.solves} solves / best ${(c.bestMs / 1000).toFixed(2)}s / mean ${(c.meanMs / 1000).toFixed(2)}s`,
          `${c.solves} 次还原 / 最快 ${(c.bestMs / 1000).toFixed(2)} 秒 / 均值 ${(c.meanMs / 1000).toFixed(2)} 秒`,
        )}
      </Txt>
    </View>
  );
  if (!token) return <Redirect href="/" />;
  return (
    <Screen>
      <Button
        kind="secondary"
        label={t("Back", "返回")}
        onPress={() => backOrReplace(router, "/(tabs)/profile")}
      />
      <Heading>{t("Your practice sessions", "你的练习时段")}</Heading>
      <Card style={{ backgroundColor: paper.lavender }}>
        <Txt>
          {t(
            "Private / approved race and daily solves only. Categories are counted separately. Server-timed results are not official competition records.",
            "私密 / 仅统计已核准的竞速与每日还原，按类别分别统计。服务器计时结果并非官方比赛记录。",
          )}
        </Txt>
        <Txt small>
          {t(
            "A new session starts after more than 30 minutes without a recorded solve. Sessions can cross midnight. Daily totals use each solve's start date in the selected time zone.",
            "超过 30 分钟没有已记录的还原，即划分为新时段；同一时段可跨过午夜。每日汇总按所选时区中还原开始的日期计算。",
          )}
        </Txt>
        <Row>
          <Chip
            selected={zone === deviceZone}
            label={t(`Device time / ${deviceZone}`, `设备时区 / ${deviceZone}`)}
            onPress={() => setZone(deviceZone)}
          />
          {deviceZone !== "UTC" && (
            <Chip
              selected={zone === "UTC"}
              label="UTC"
              onPress={() => setZone("UTC")}
            />
          )}
        </Row>
        <Txt small>
          {t(
            "The time zone comes from your device settings. It does not use location permission or change your community.",
            "时区取自设备设置，不使用定位权限，也不会改变你的社区。",
          )}
        </Txt>
        <Button
          disabled={busy}
          label={t("Refresh", "刷新")}
          onPress={() => void refresh()}
        />
      </Card>
      {!!error && <Notice error text={error} />}
      {busy && <Busy />}
      {data && (
        <>
          <Txt small>
            {t(
              `Based on ${data.window.solves} of your most recent approved solves (limit 1,000).`,
              `基于最近 ${data.window.solves} 次已核准还原（最多一千次）。`,
            )}
          </Txt>
          {!!data.window.estimatedStarts && (
            <Notice
              text={t(
                `${data.window.estimatedStarts} older records have no solve start time; their record creation time is used for grouping and dates.`,
                `${data.window.estimatedStarts} 条旧记录缺少还原开始时间，分组和日期使用记录创建时间。`,
              )}
            />
          )}
          {data.window.hasEarlier && (
            <Notice
              text={t(
                "Earlier solves are outside this window. The oldest visible period may be incomplete.",
                "更早的还原不在本次统计范围内，最早的时段或日期可能不完整。",
              )}
            />
          )}
          {!data.sessions.length && (
            <Card>
              <Txt>
                {t(
                  "Complete a race or daily solve to start a session history.",
                  "完成一次竞速或每日还原，开始积累时段记录。",
                )}
              </Txt>
            </Card>
          )}
          {data.sessions.map((session) => (
            <Card key={session.startedAt}>
              <Txt style={{ fontWeight: "600" }}>
                {date(session.startedAt)} → {date(session.endedAt)}
              </Txt>
              <Txt>
                {t(
                  `${session.solves} solves / ${(session.solvingMs / 60000).toFixed(1)} minutes solving / ${(session.spanMs / 60000).toFixed(1)} minutes elapsed`,
                  `${session.solves} 次还原 / 还原用时合计 ${(session.solvingMs / 60000).toFixed(1)} 分钟 / 时段跨度 ${(session.spanMs / 60000).toFixed(1)} 分钟`,
                )}
              </Txt>
              {session.mayIncludeEarlierSolves && (
                <Txt small>
                  {t(
                    "This session may include earlier solves outside the window.",
                    "本时段可能还有超出统计范围的更早还原。",
                  )}
                </Txt>
              )}
              {session.categories.map(category)}
            </Card>
          ))}
          {!!data.omittedSessions && (
            <Txt small>
              {t(
                `${data.omittedSessions} older sessions in this window are not shown. Only the latest 30 sessions are displayed.`,
                `本统计范围中还有 ${data.omittedSessions} 个更早时段未显示，仅展示最近 30 个时段。`,
              )}
            </Txt>
          )}
          {!!data.days.length && (
            <Heading>{t("Daily totals", "每日汇总")}</Heading>
          )}
          {data.days.map((day) => (
            <Card key={day.day}>
              <Txt style={{ fontWeight: "600" }}>
                {day.day} / {data.timeZone}
              </Txt>
              <Txt>
                {t(
                  `${day.solves} solves / ${(day.solvingMs / 60000).toFixed(1)} minutes solving`,
                  `${day.solves} 次还原 / 还原用时合计 ${(day.solvingMs / 60000).toFixed(1)} 分钟`,
                )}
              </Txt>
              {day.categories.map(category)}
            </Card>
          ))}
          {!!data.omittedDays && (
            <Txt small>
              {t(
                `${data.omittedDays} older active days in this window are not shown. Only the latest 30 active days are displayed.`,
                `本统计范围中还有 ${data.omittedDays} 个更早练习日未显示，仅展示最近 30 个有记录的日期。`,
              )}
            </Txt>
          )}
        </>
      )}
    </Screen>
  );
}
