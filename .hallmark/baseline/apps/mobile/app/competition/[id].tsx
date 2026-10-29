import { competitionInputLabel } from "@cubers/core";
import { competitionFormatLabel, competitionStatusLabel } from "@cubers/core";
import React, { useEffect, useRef, useState } from "react";
import { Switch, Platform } from "react-native";
import {
  Redirect,
  router,
  useLocalSearchParams,
  useFocusEffect,
} from "expo-router";
import {
  competitionAttemptCount,
  competitionScoreText,
  type CompetitionFormat,
} from "@cubers/core";
import { useApp } from "../../src/state";
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
} from "../../src/ui";
export default function CompetitionPage() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { token, region } = useApp();
  if (!token) return <Redirect href="/" />;
  return <CompetitionView key={JSON.stringify([id, token, region])} id={id} />;
}
function CompetitionView({ id }: { id: string }) {
  function scoreText(score: Parameters<typeof competitionScoreText>[0]) {
    return competitionScoreText(score, locale);
  }

  const { api, t, locale } = useApp(),
    [event, setEvent] = useState<any>(),
    [smartAvailable, setSmartAvailable] = useState(false),
    [smartPlatform, setSmartPlatform] = useState(false),
    [board, setBoard] = useState<any>(),
    [scope, setScope] = useState("overall"),
    [accepted, setAccepted] = useState(false),
    [sharing, setSharing] = useState(false),
    [withdraw, setWithdraw] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  const live = useRef(true),
    epoch = useRef(0),
    action = useRef(false);
  const selectedScope = useRef(scope);
  selectedScope.current = scope;
  async function load() {
    const run = ++epoch.current,
      s = selectedScope.current;
    try {
      const [e, b, devices] = await Promise.all([
        api(`competitions/${id}`),
        api(`competitions/${id}/board?scope=${s}`),
        api("devices"),
      ]);
      if (!live.current || run !== epoch.current) return;
      setEvent(e);
      setBoard(b);
      const accepted = devices.devices.filter(
        (d: any) =>
          d.enabled &&
          d.physicallyTested &&
          d.playEnabled &&
          d.playPlatforms.length,
      );
      setSmartAvailable(accepted.length > 0);
      setSmartPlatform(
        (Platform.OS === "ios" || Platform.OS === "android") &&
          accepted.some((d: any) => d.playPlatforms.includes(Platform.OS)),
      );
      setError("");
    } catch (e) {
      if (live.current && run === epoch.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    live.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      live.current = false;
      epoch.current++;
      clearInterval(timer);
    };
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), 30000);
      return () => {
        clearInterval(timer);
        epoch.current++;
      };
    }, [api, id, scope]),
  );
  async function act(path: string, body: unknown, enter = false) {
    if (action.current) return;
    action.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await api(path, body);
      if (!live.current) return;
      if (enter) {
        router.push(`/room/${value.roomId}`);
        return;
      }
      setSharing(false);
      setWithdraw(false);
      await load();
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      action.current = false;
      if (live.current) setBusy(false);
    }
  }
  if (!event)
    return (
      <Screen>
        {error ? <Notice text={error} error /> : <Busy />}
        <Button
          label={t("← Play", "← 返回玩耍")}
          onPress={() => router.back()}
        />
      </Screen>
    );
  const visibleBoard = board?.scope === scope ? board : null;
  const current = event.mine?.publications.find((p: any) => p.scope === scope),
    registered = event.mine?.status === "REGISTERED",
    registrationOpen =
      event.status === "PUBLISHED" &&
      now >= Date.parse(event.registrationOpensAt) &&
      now < Date.parse(event.registrationClosesAt);
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("← Play", "← 返回玩耍")}
        onPress={() => router.back()}
      />
      <Heading>{t(event.title.en, event.title.zh)}</Heading>
      <Txt>{t(event.description.en, event.description.zh)}</Txt>
      <Txt small>
        {event.puzzle} · {competitionInputLabel(event.input, locale)} ·{" "}
        {event.ranked ? t("Ranked", "排名") : t("Casual", "休闲")}
      </Txt>
      {event.input === "smart" && (!smartAvailable || !smartPlatform) && (
        <Notice
          text={
            !smartAvailable
              ? t(
                  "Smart competitions are unavailable until hardware and platform acceptance. Your private history and sharing controls remain available.",
                  "智能比赛须等待硬件和平台实机验收；你仍可查看私密记录并管理成绩分享。",
                )
              : t(
                  "Use an accepted iOS or Android device and smart cube for this attempt.",
                  "请使用已通过验收的 iOS 或 Android 设备及智能魔方进行尝试。",
                )
          }
        />
      )}
      <Notice
        text={t(
          "Cubers remote competition rules: server timing; 15–17 seconds of inspection adds 2 seconds; more than 17 seconds interrupts the attempt. Pending physical evidence earns no placement. This is not an official WCA event.",
          "Cubers 远程比赛规则：服务器计时；观察超过 15 秒且不超过 17 秒加罚 2 秒，超过 17 秒中止尝试。待审核实物录像不计入名次。本活动并非 WCA 官方赛事。",
        )}
      />
      {!!error && <Notice text={error} error />}
      <Button
        small
        kind="secondary"
        disabled={busy}
        label={t("Refresh schedule and results", "刷新安排与成绩")}
        onPress={() => void load()}
      />
      <Card>
        <Txt style={{ fontWeight: "700" }}>{t("Registration", "报名")}</Txt>
        <Txt>
          {new Date(event.registrationOpensAt).toLocaleString()} –{" "}
          {new Date(event.registrationClosesAt).toLocaleString()}
        </Txt>
        <Txt small>
          {event.registeredCount}/{event.capacity} ·{" "}
          {event.status === "CANCELLED"
            ? t("Cancelled", "已取消")
            : registered
              ? t(
                  `Registered · participant ${event.mine.number}`,
                  `已报名 · 参赛编号 ${event.mine.number}`,
                )
              : registrationOpen
                ? t("Open", "报名中")
                : t("Not open", "报名未开放")}
        </Txt>
        {!registered && registrationOpen && (
          <>
            <Row>
              <Switch
                accessibilityLabel={t(
                  "Understand private results",
                  "理解成绩默认私密",
                )}
                value={accepted}
                onValueChange={setAccepted}
              />
              <Txt style={{ flex: 1 }}>
                {t(
                  "I understand the schedule, attempt limits and private results. Sharing is a separate choice.",
                  "我已了解比赛安排、尝试次数和成绩默认私密；分享需另行选择。",
                )}
              </Txt>
            </Row>
            <Button
              disabled={
                busy ||
                !accepted ||
                (event.input === "smart" && !smartAvailable)
              }
              label={t("Register", "报名")}
              onPress={() =>
                void act(`competitions/${id}/register`, {
                  expectedVersion: event.version,
                  privateResultsUnderstood: true,
                })
              }
            />
          </>
        )}
        {registered && event.status !== "CANCELLED" && (
          <>
            <Button
              kind="secondary"
              small
              disabled={busy}
              label={t("Withdraw from this competition", "退出本次比赛")}
              onPress={() => setWithdraw((v) => !v)}
            />
            {withdraw && (
              <>
                <Notice
                  text={t(
                    "Withdrawing stops current and future attempts and removes your shared scores. Private solve history remains. Rejoining is possible only while registration is open.",
                    "退出将中止当前及后续尝试，并撤下已分享成绩，私密还原记录保留。仅可在报名开放期间重新报名。",
                  )}
                />
                <Button
                  disabled={busy}
                  label={t("Confirm withdrawal", "确认退出")}
                  onPress={() =>
                    void act(`competitions/${id}/withdraw`, {
                      confirmation: "WITHDRAW",
                    })
                  }
                />
              </>
            )}
          </>
        )}
      </Card>
      {event.rounds.map((round: any) => {
        const open =
            event.status === "PUBLISHED" &&
            now >= Date.parse(round.opensAt) &&
            now < Date.parse(round.closesAt),
          result = event.mine?.results.rounds.find(
            (r: any) => r.roundId === round.id,
          );
        return (
          <Card key={round.id}>
            <Txt style={{ fontSize: 22, fontWeight: "700" }}>
              {t(round.title.en, round.title.zh)}
            </Txt>
            <Txt>
              {new Date(round.opensAt).toLocaleString()} –{" "}
              {new Date(round.closesAt).toLocaleString()}
            </Txt>
            <Txt small>
              {competitionFormatLabel(round.format, locale)} ·{" "}
              {competitionAttemptCount[round.format as CompetitionFormat]}{" "}
              {t("attempts", "次尝试")} ·{" "}
              {open
                ? t("Open now", "进行中")
                : now >= Date.parse(round.closesAt)
                  ? t("Closed", "已结束")
                  : t("Upcoming", "即将开始")}
            </Txt>
            {result && (
              <>
                <Txt>
                  {t("My private result", "我的私密成绩")} ·{" "}
                  {scoreText(result.score)}
                </Txt>
                {Array.from(
                  {
                    length:
                      competitionAttemptCount[
                        round.format as CompetitionFormat
                      ],
                  },
                  (_, index) => {
                    const room = event.mine.rooms.find(
                        (r: any) =>
                          r.competitionRoundId === round.id &&
                          r.competitionIndex === index,
                      ),
                      previous =
                        index === 0
                          ? true
                          : event.mine.rooms.some(
                              (r: any) =>
                                r.competitionRoundId === round.id &&
                                r.competitionIndex === index - 1 &&
                                ![
                                  "CREATED",
                                  "INSPECTION",
                                  "SOLVING",
                                  "AWAITING_EVIDENCE",
                                ].includes(r.attempts[0]?.status),
                            );
                    return (
                      <Row key={index}>
                        <Txt style={{ flex: 1 }}>
                          {t(`Attempt ${index + 1}`, `第 ${index + 1} 次`)} ·{" "}
                          {(room?.attempts[0]?.status
                            ? competitionStatusLabel(
                                room.attempts[0].status,
                                locale,
                              )
                            : "") || t("Not started", "未开始")}
                        </Txt>
                        {(room || (registered && open)) && (
                          <Button
                            small
                            disabled={
                              busy ||
                              (!room &&
                                (!previous ||
                                  !open ||
                                  (event.input === "smart" && !smartPlatform)))
                            }
                            kind="secondary"
                            label={
                              room
                                ? t("Open attempt", "查看尝试")
                                : t("Prepare", "准备")
                            }
                            onPress={() =>
                              room
                                ? router.push(`/room/${room.id}`)
                                : void act(
                                    `competitions/${id}/rounds/${round.id}/attempts`,
                                    { index },
                                    true,
                                  )
                            }
                          />
                        )}
                      </Row>
                    );
                  },
                )}
              </>
            )}
          </Card>
        );
      })}
      <Card>
        <Txt style={{ fontSize: 22, fontWeight: "700" }}>
          {t("Shared leaderboard", "分享榜单")}
        </Txt>
        <Notice
          text={t(
            "Only anonymous, approved shared scores are listed. Placements compare shared scores only. Private results, account names and recordings are never shown here. Overall scores add the scores of all rounds. Ties compare the best single attempt; identical scores and best attempts share a place.",
            "仅显示经批准分享的匿名成绩，名次仅在这些成绩之间比较。此处不显示私密成绩、账号昵称或录像。总成绩为各轮成绩之和；同分时比较单次最佳，用时仍相同则并列。",
          )}
        />
        <Row>
          <Chip
            label={t("Overall", "总成绩")}
            selected={scope === "overall"}
            onPress={() => {
              setScope("overall");
              setSharing(false);
            }}
          />
          {event.rounds.map((r: any) => (
            <Chip
              key={r.id}
              label={t(r.title.en, r.title.zh)}
              selected={scope === r.id}
              onPress={() => {
                setScope(r.id);
                setSharing(false);
              }}
            />
          ))}
        </Row>
        {visibleBoard?.items.map((row: any) => (
          <Row key={row.number}>
            <Txt>
              {row.rank ?? "—"}.{" "}
              {t(`Participant ${row.number}`, `参赛编号 ${row.number}`)} ·{" "}
              {scoreText(row.score)}
            </Txt>
          </Row>
        ))}
        {!visibleBoard && <Busy />}
        {visibleBoard && !visibleBoard.items.length && (
          <Txt small>
            {t(
              "No scores are shared for this selection.",
              "所选范围暂无分享成绩。",
            )}
          </Txt>
        )}
        {registered && event.status === "PUBLISHED" && (
          <>
            <Txt small>
              {current
                ? `${competitionStatusLabel(current.status, locale)}${current.current ? "" : t(" · changed; a new approval is required", " · 成绩或权限已变，需重新申请")}`
                : t("Your results are private.", "你的成绩为私密。")}
            </Txt>
            <Button
              kind="secondary"
              small
              disabled={busy}
              label={t("Review what I would share", "查看将分享的内容")}
              onPress={() => setSharing((v) => !v)}
            />
            {sharing && (
              <>
                <Notice
                  text={t(
                    "Sharing displays your event participant number, puzzle, input and exact result, allowing others at this event to recognize your score. A child needs guardian and independent moderator approval. Teens need moderator approval. You can withdraw sharing at any time.",
                    "分享会显示本场参赛编号、魔方类型、输入方式和准确成绩，知晓你参赛的人可能据此认出你的成绩。儿童须经家长和独立审核员批准；青少年须经审核员批准。可随时撤回分享。",
                  )}
                />
                <Txt>
                  {scoreText(
                    scope === "overall"
                      ? event.mine.results.score
                      : event.mine.results.rounds.find(
                          (r: any) => r.roundId === scope,
                        ).score,
                  )}
                </Txt>
                <Button
                  disabled={busy}
                  label={t(
                    "Request sharing of this exact result",
                    "申请分享这份准确成绩",
                  )}
                  onPress={() =>
                    void act(`competitions/${id}/share`, {
                      scope,
                      sharingUnderstood: true,
                      digest: event.mine.digests[scope],
                    })
                  }
                />
              </>
            )}
            {current && current.status !== "CANCELLED" && (
              <Button
                small
                kind="secondary"
                disabled={busy}
                label={t("Withdraw this shared result", "撤回这份成绩分享")}
                onPress={() =>
                  void act(`competitions/publications/${current.id}/cancel`, {
                    revision: current.revision,
                    digest: current.digest,
                    approve: false,
                    checkedExactResult: true,
                    reason: "Owner withdrew competition score sharing",
                  })
                }
              />
            )}
          </>
        )}
      </Card>
    </Screen>
  );
}
