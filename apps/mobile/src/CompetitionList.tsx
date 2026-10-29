import { competitionInputLabel } from "@cubers/core";
import React, { useEffect, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { useApp } from "./state";
import { Card, Txt, Button, Notice, Row, Chip } from "./ui";
export function CompetitionList() {
  const { api, t, token, region, locale } = useApp(),
    [rows, setRows] = useState<any[]>([]),
    [mine, setMine] = useState(false),
    [error, setError] = useState(""),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const live = useRef(true),
    context = useRef(""),
    epoch = useRef(0);
  context.current = JSON.stringify([token, region, mine]);
  async function load(append = false) {
    const who = context.current,
      run = ++epoch.current;
    setBusy(true);
    try {
      const page = await api(
        `competitions?${mine ? "mine=true&" : ""}${append && cursor ? `cursor=${cursor}` : ""}`,
      );
      if (!live.current || who !== context.current || run !== epoch.current)
        return;
      setRows((old) =>
        append
          ? [
              ...old,
              ...page.items.filter((x: any) => !old.some((r) => r.id === x.id)),
            ]
          : page.items,
      );
      setCursor(page.nextCursor);
      setError("");
    } catch (e) {
      if (live.current && who === context.current && run === epoch.current)
        setError((e as Error).message);
    } finally {
      if (live.current && who === context.current && run === epoch.current)
        setBusy(false);
    }
  }
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      epoch.current++;
    };
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      void load();
      return () => {
        epoch.current++;
      };
    }, [api, token, region, mine]),
  );
  return (
    <Card>
      <Txt style={{ fontSize: 23, fontWeight: "700" }}>
        {t("Scheduled competitions", "定时比赛")}
      </Txt>
      <Txt small>
        {t(
          "Join a schedule, complete its rounds, and keep results private. Shared boards show only results approved for sharing.",
          "按安排报名并参加各轮比赛，成绩默认私密。榜单仅显示经批准分享的成绩。",
        )}
      </Txt>
      <Row>
        <Chip
          label={t("Upcoming", "即将开始")}
          selected={!mine}
          onPress={() => {
            setMine(false);
            setRows([]);
          }}
        />
        <Chip
          label={t("My competitions", "我的比赛")}
          selected={mine}
          onPress={() => {
            setMine(true);
            setRows([]);
          }}
        />
      </Row>
      {!!error && <Notice text={error} error />}
      {!rows.length && !error && (
        <Txt small>
          {t("No published competitions yet.", "暂无已发布的比赛。")}
        </Txt>
      )}
      {rows.map((row) => (
        <Card key={row.id}>
          <Txt style={{ fontWeight: "700" }}>
            {t(row.title.en, row.title.zh)}
          </Txt>
          <Txt small>
            {row.puzzle} · {competitionInputLabel(row.input, locale)} ·{" "}
            {row.ranked ? t("Ranked", "排名") : t("Casual", "休闲")}
          </Txt>
          <Txt small>
            {new Date(row.startsAt).toLocaleString()} –{" "}
            {new Date(row.endsAt).toLocaleString()}
          </Txt>
          <Button
            small
            kind="secondary"
            label={t("Schedule and my results", "安排与我的成绩")}
            onPress={() => router.push(`/competition/${row.id}`)}
          />
        </Card>
      ))}
      {cursor && (
        <Button
          small
          disabled={busy || rows.length >= 500}
          label={t("More competitions", "更多比赛")}
          onPress={() => void load(true)}
        />
      )}
      <Button
        small
        disabled={busy}
        kind="secondary"
        label={t("Refresh competitions", "刷新比赛")}
        onPress={() => void load()}
      />
    </Card>
  );
}
