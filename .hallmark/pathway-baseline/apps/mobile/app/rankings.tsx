import React, { useCallback, useRef, useState } from "react";
import { Redirect, router, useFocusEffect } from "expo-router";
import { useApp } from "../src/state";
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
import {
  categoryAttemptScores,
  type AnonymousAttemptScore,
  type RankingCategory,
} from "../src/category-rankings";

export default function RankingsPage() {
  const { token, region } = useApp();
  if (!token) return <Redirect href="/" />;
  return <RankingsView key={JSON.stringify([token, region])} />;
}
function RankingsView() {
  const { api, t, region } = useApp();
  const c = useTheme();
  const [category, setCategory] = useState<RankingCategory>({
    puzzle: "3x3",
    input: "virtual",
    mode: "race",
  });
  const [result, setResult] = useState<{
    key: string;
    rows: AnonymousAttemptScore[];
  }>();
  const [failure, setFailure] = useState<{ key: string; message: string }>();
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const key = JSON.stringify(category);
  const selected = useRef(key);
  selected.current = key;
  const load = useCallback(async () => {
    const run = ++epoch.current;
    setBusy(true);
    setResult(undefined);
    setFailure(undefined);
    try {
      const response = await api(
        `rankings?puzzle=${category.puzzle}&input=${category.input}&mode=${category.mode}`,
      );
      const rows = categoryAttemptScores(response, category);
      if (run === epoch.current && key === selected.current)
        setResult({ key, rows });
    } catch (error) {
      if (run === epoch.current && key === selected.current)
        setFailure({
          key,
          message:
            (error as Error).message === "Invalid category rankings"
              ? t(
                  "The rankings could not be read. Please refresh.",
                  "暂时无法读取榜单，请刷新。",
                )
              : (error as Error).message,
        });
    } finally {
      if (run === epoch.current && key === selected.current) setBusy(false);
    }
  }, [api, key, t]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        epoch.current++;
        setResult(undefined);
        setFailure(undefined);
      };
    }, [load]),
  );
  const rows = result?.key === key ? result.rows : undefined;
  const error = failure?.key === key ? failure.message : undefined;
  return (
    <Screen>
      <Button
        small
        label={t("Back to Play", "返回游玩")}
        onPress={() => router.replace("/(tabs)/play")}
      />
      <Heading
        eyebrow={
          region === "CN"
            ? t("China community", "中国社区")
            : t("International community", "国际社区")
        }
      >
        {t("Verified attempts", "核准成绩榜")}
      </Heading>
      <Txt>
        {t(
          "Up to 100 fastest approved adult attempts, separated by puzzle, input and mode. One person may have several attempts. Names and profiles are hidden; equal times share a place.",
          "按魔方、输入方式和模式分别展示最多 100 条成年人的最快核准成绩。同一人可能有多次成绩；不展示姓名与个人资料，相同用时并列。",
        )}
      </Txt>
      <Card style={{ backgroundColor: c.lavender }}>
        <Txt>{t("Puzzle", "魔方")}</Txt>
        <Row>
          {(["2x2", "3x3", "4x4", "pyraminx"] as const).map((puzzle) => (
            <Chip
              key={puzzle}
              label={
                puzzle === "pyraminx"
                  ? t("Pyraminx", "金字塔")
                  : puzzle.replace("x", "×")
              }
              selected={category.puzzle === puzzle}
              onPress={() => setCategory((old) => ({ ...old, puzzle }))}
            />
          ))}
        </Row>
        <Txt>{t("Input", "输入方式")}</Txt>
        <Row>
          {(
            [
              ["virtual", "Virtual", "虚拟"],
              ["scan", "Physical", "实物"],
              ["smart", "Smart", "智能"],
            ] as const
          ).map(([input, en, zh]) => (
            <Chip
              key={input}
              label={t(en, zh)}
              selected={category.input === input}
              onPress={() => setCategory((old) => ({ ...old, input }))}
            />
          ))}
        </Row>
        <Txt>{t("Mode", "模式")}</Txt>
        <Row>
          {(
            [
              ["race", "Race", "竞速"],
              ["daily", "Daily challenges", "每日挑战"],
            ] as const
          ).map(([mode, en, zh]) => (
            <Chip
              key={mode}
              label={t(en, zh)}
              selected={category.mode === mode}
              onPress={() => setCategory((old) => ({ ...old, mode }))}
            />
          ))}
        </Row>
        <Txt small>
          {t(
            "These are all-time attempts in this category. Daily challenges from different dates may use different scrambles.",
            "此处展示该类别的历史成绩；不同日期的每日挑战可能使用不同打乱。",
          )}
        </Txt>
      </Card>
      <Notice
        text={t(
          "Physical and smart-cube scores require uninterrupted recording and reviewer approval. Children and teens share reviewed results through scheduled competitions. Ranked production play remains unavailable pending release checks.",
          "实物与智能魔方成绩均须连续录像和人工审核。儿童与青少年通过定时比赛分享经审核的成绩。正式排名功能仍待完成上线验收。",
        )}
      />
      {busy && <Busy />}
      {!!error && <Notice text={error} error />}
      {!busy && rows?.length === 0 && (
        <Txt>
          {t(
            "No eligible approved attempts in this category yet.",
            "此类别暂无符合条件的核准成绩。",
          )}
        </Txt>
      )}
      {rows?.map((score, index) => (
        <Card key={index} style={{ backgroundColor: c.paper, borderRadius: 16, borderWidth: 0, borderBottomWidth: 1 }} >
          <Row style={{ justifyContent: "space-between" }}>
            <Txt style={{ fontWeight: "600" }}>{t(`Place ${score.place}`, `第 ${score.place} 名`)}</Txt>
            <Txt style={{ fontSize: 25, lineHeight: 32, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
              {t(
                `${(score.durationMs / 1000).toFixed(3)} seconds`,
                `${(score.durationMs / 1000).toFixed(3)} 秒`,
              )}
            </Txt>
          </Row>
          <Txt small>{t("Anonymous adult attempt", "匿名成年人单次成绩")}</Txt>
        </Card>
      ))}
      <Button
        label={t("Refresh rankings", "刷新榜单")}
        disabled={busy}
        onPress={() => void load()}
      />
    </Screen>
  );
}
