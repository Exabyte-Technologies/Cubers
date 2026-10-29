import { backOrReplace } from "../src/back-navigation";
import { competitionInputLabel } from "@cubers/core";
import { competitionFormatLabel, competitionStatusLabel } from "@cubers/core";
import React, { useEffect, useRef, useState } from "react";
import { Switch } from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { competitionScoreText } from "@cubers/core";
import { useApp } from "../src/state";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Button,
  Row,
  Notice,
  Field,
} from "../src/ui";
export default function CompetitionReviews() {
  const { token, region } = useApp();
  if (!token) return <Redirect href="/" />;
  return <ReviewView key={JSON.stringify([token, region])} />;
}
function ReviewView() {
  function scoreText(score: Parameters<typeof competitionScoreText>[0]) {
    return competitionScoreText(score, locale);
  }

  const { api, t, locale } = useApp(),
    [rows, setRows] = useState<any[]>([]),
    [next, setNext] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<any>(),
    [checked, setChecked] = useState(false),
    [reason, setReason] = useState("");
  const live = useRef(true),
    epoch = useRef(0),
    acting = useRef(false);
  async function load(append = false) {
    const run = ++epoch.current;
    try {
      const page = await api(
        `guardian/competition-publications${append && next ? `?cursor=${next}` : ""}`,
      );
      if (!live.current || run !== epoch.current) return;
      setRows((old) =>
        append
          ? [
              ...old,
              ...page.items.filter((x: any) => !old.some((o) => o.id === x.id)),
            ]
          : page.items,
      );
      setNext(page.nextCursor);
    } catch (e) {
      if (live.current && run === epoch.current) setError((e as Error).message);
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
      setSelected(undefined);
      setChecked(false);
      void load();
      return () => {
        epoch.current++;
      };
    }, [api]),
  );
  async function review(approve: boolean, cancel = false) {
    if (!selected || acting.current) return;
    acting.current = true;
    setBusy(true);
    setError("");
    try {
      await api(
        `guardian/competition-publications/${selected.id}/${cancel ? "cancel" : "review"}`,
        {
          revision: selected.revision,
          digest: selected.digest,
          approve,
          checkedExactResult: true,
          reason,
        },
      );
      if (live.current) {
        setSelected(undefined);
        setChecked(false);
        setReason("");
        await load();
      }
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      acting.current = false;
      if (live.current) setBusy(false);
    }
  }
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("Guardian controls", "返回家长控制")}
        onPress={() => backOrReplace(router, "/guardian")}
      />
      <Heading>{t("Review score sharing", "审核成绩分享")}</Heading>
      <Notice
        text={t(
          "Scores stay private until both guardian and independent moderator approve this exact result. The board shows an event participant number, never a child's name, age or recording. People who know the participant number may recognize the score.",
          "这份准确成绩须经家长和独立审核员批准后才会分享。榜单显示本场参赛编号，不显示儿童姓名、年龄或录像；知晓该编号的人可能认出成绩。",
        )}
      />
      {!!error && <Notice text={error} error />}
      <Button
        small
        disabled={busy}
        label={t("Refresh requests", "刷新申请")}
        onPress={() => {
          setSelected(undefined);
          setChecked(false);
          void load();
        }}
      />
      {rows.map((row) => (
        <Card key={row.id}>
          <Txt>
            {t(
              `Participant ${row.snapshot.number}`,
              `参赛编号 ${row.snapshot.number}`,
            )}{" "}
            / {row.snapshot.puzzle} /{" "}
            {competitionInputLabel(row.snapshot.input, locale)} /{" "}
            {competitionStatusLabel(row.status, locale)}
          </Txt>
          <Txt>{scoreText(row.snapshot.score)}</Txt>
          {!row.current && (
            <Txt>
              {t(
                "Result or permission changed. A fresh request is required.",
                "成绩或权限已变，须重新申请。",
              )}
            </Txt>
          )}
          <Button
            small
            kind="secondary"
            label={t("Inspect exact result", "核对准确成绩")}
            onPress={() => {
              setSelected(row);
              setChecked(false);
              setReason("");
            }}
          />
        </Card>
      ))}
      {next && (
        <Button
          small
          disabled={busy || rows.length >= 150}
          label={t("More requests", "更多申请")}
          onPress={() => void load(true)}
        />
      )}{" "}
      {!rows.length && (
        <Txt>{t("No score sharing requests.", "暂无成绩分享申请。")}</Txt>
      )}
      {selected && (
        <Card>
          <Txt style={{ fontWeight: "600" }}>
            {t("Exact result preview", "准确成绩预览")}
          </Txt>
          <Txt>
            {selected.snapshot.puzzle} /{" "}
            {competitionInputLabel(selected.snapshot.input, locale)} /{" "}
            {t(
              `Participant ${selected.snapshot.number}`,
              `参赛编号 ${selected.snapshot.number}`,
            )}{" "}
            /{" "}
            {selected.scope === "overall"
              ? t("Overall", "总成绩")
              : t("Selected round", "所选轮次")}
          </Txt>
          {selected.snapshot.rounds.map((round: any) => (
            <Card key={round.roundId}>
              <Txt>
                {t(round.title.en, round.title.zh)} /{" "}
                {competitionFormatLabel(round.format, locale)} /{" "}
                {scoreText(round.score)}
              </Txt>
              {round.slots.map((slot: any, index: number) => (
                <Txt key={index}>
                  {index + 1}.{" "}
                  {slot.status === "APPROVED"
                    ? `${(slot.durationMs / 1000).toFixed(3)} s`
                    : competitionStatusLabel(slot.status, locale)}
                </Txt>
              ))}
            </Card>
          ))}
          <Txt>
            {t("Total", "合计")} / {scoreText(selected.snapshot.score)}
          </Txt>
          <Row>
            <Switch
              accessibilityLabel={t(
                "Checked this exact result",
                "已核对准确成绩",
              )}
              value={checked}
              onValueChange={setChecked}
            />
            <Txt style={{ flex: 1 }}>
              {t(
                "I checked every displayed result and understand anonymous score sharing.",
                "我已核对全部成绩，并了解匿名成绩分享。",
              )}
            </Txt>
          </Row>
          <Field
            label={t(
              "Review note (10–1000 characters)",
              "审核说明（10–1000 字符）",
            )}
            value={reason}
            onChangeText={setReason}
            maxLength={1000}
          />
          <Row>
            <Button
              small
              disabled={
                busy ||
                !checked ||
                reason.trim().length < 10 ||
                !selected.current ||
                selected.status !== "PENDING_GUARDIAN"
              }
              label={t("Approve for moderator review", "同意并交审核员复核")}
              onPress={() => void review(true)}
            />
            <Button
              small
              kind="secondary"
              disabled={busy || !checked || reason.trim().length < 10}
              label={t("Withdraw sharing", "撤回分享")}
              onPress={() => void review(false, true)}
            />
          </Row>
        </Card>
      )}
    </Screen>
  );
}
