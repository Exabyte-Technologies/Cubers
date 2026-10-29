import { CompetitionList } from "../../src/CompetitionList";
import React, { useEffect, useState } from "react";
import { View, Switch } from "react-native";
import { router } from "expo-router";
import { useApp } from "../../src/state";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Button,
  Row,
  Chip,
  Field,
  Notice,
  Empty,
  useTheme,
} from "../../src/ui";
const modes = [
  {
    id: "race",
    en: "Solve together",
    zh: "一起竞速",
    description: "A shared room. Your own rhythm.",
    descriptionZh: "在同一个房间，各自找到节奏。",
    symbol: "↗",
    color: "mint",
  },
  {
    id: "pattern",
    en: "Pattern Chase",
    zh: "图案追逐",
    description: "Make the target pattern, turn by turn.",
    descriptionZh: "一步一步，拼出目标图案。",
    symbol: "▦",
    color: "lavender",
  },
  {
    id: "relay",
    en: "Cooperative Relay",
    zh: "合作接力",
    description: "Pass the puzzle challenge to a teammate.",
    descriptionZh: "接过挑战，再传递给队友。",
    symbol: "⇄",
    color: "yellow",
  },
  {
    id: "sprint",
    en: "Algorithm Sprint",
    zh: "公式冲刺",
    description: "A short sequence. Make every move count.",
    descriptionZh: "一段短公式，每一步都准确。",
    symbol: "ϟ",
    color: "mint",
  },
  {
    id: "daily",
    en: "Daily Challenge",
    zh: "每日挑战",
    description: "The same scramble. A fresh personal goal.",
    descriptionZh: "相同的打乱，全新的个人目标。",
    symbol: "☀",
    color: "lavender",
  },
];
export default function Play() {
  const { t, api } = useApp(),
    c = useTheme(),
    [puzzle, setPuzzle] = useState("3x3"),
    [input, setInput] = useState("virtual"),
    [mixed, setMixed] = useState(false),
    [ranked, setRanked] = useState(false),
    [privateRoom, setPrivateRoom] = useState(true),
    [rooms, setRooms] = useState<any[]>([]),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("rooms")
      .then(setRooms)
      .catch((e) => setError(e.message));
  }, [api]);
  async function create(mode: string) {
    setBusy(true);
    setError("");
    try {
      const room = await api("rooms", {
        puzzle,
        input,
        mode,
        ranked,
        mixed,
        private: privateRoom,
      });
      router.push(`/room/${room.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Heading eyebrow={t("Better, together", "一起，更有乐趣")}>
        {t("A good kind\nof challenge.", "来一场，\n刚刚好的挑战。")}
      </Heading>
      <Txt style={{ color: c.muted }}>
        {t(
          "Play for the moment it clicks. Compete fairly. Cheer each other on.",
          "享受想通的瞬间，公平比拼，也为彼此加油。",
        )}
      </Txt>
      <Card>
        <Row>
          {["2x2", "3x3", "4x4", "pyraminx"].map((p) => (
            <Chip
              key={p}
              label={
                p === "pyraminx" ? t("Pyraminx", "金字塔") : p.replace("x", "×")
              }
              selected={puzzle === p}
              onPress={() => setPuzzle(p)}
            />
          ))}
        </Row>
        <Row>
          {[
            ["virtual", "Virtual", "虚拟"],
            ["scan", "Physical", "实物"],
            ["smart", "Smart", "智能"],
          ].map(([id, en, zh]) => (
            <Chip
              key={id}
              label={t(en, zh)}
              selected={input === id}
              onPress={() => setInput(id)}
            />
          ))}
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt>{t("Private friend room", "好友私密房间")}</Txt>
          <Switch
            accessibilityLabel={t("Private friend room", "好友私密房间")}
            value={privateRoom}
            onValueChange={setPrivateRoom}
          />
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt>{t("Mixed inputs · casual", "混合输入 · 休闲")}</Txt>
          <Switch
            accessibilityLabel={t("Mixed inputs", "混合输入")}
            value={mixed}
            onValueChange={(value) => {
              setMixed(value);
              if (value) setRanked(false);
            }}
          />
        </Row>
        {mixed && (
          <Notice
            text={t(
              "Each player chooses an input before the room starts. Results stay outside rankings. Scans support races and daily challenges; smart cubes require a verified 3×3 model. Scans do not continuously track turns.",
              "每位玩家在开始前选择输入方式，成绩不计入排名。图像扫描适用于竞速和每日挑战。智能魔方仅限通过验证的三阶型号。扫描不连续追踪转动。",
            )}
          />
        )}
        <Row style={{ justifyContent: "space-between" }}>
          <Txt>{t("Ranked race", "排名竞速")}</Txt>
          <Switch
            accessibilityLabel={t("Ranked race", "排名竞速")}
            value={ranked}
            disabled={mixed}
            onValueChange={setRanked}
          />
        </Row>
        {ranked && (
          <Notice
            text={t(
              "Ranked play shares an eligible adult’s anonymous verified score in its puzzle/input category. Children and teens can request approved score sharing through scheduled competitions. Physical results need uninterrupted recording and review. Production ranking awaits app attestation.",
              "排名竞速会在对应魔方与输入类别中分享符合资格成年人的匿名核准成绩。儿童与青少年可通过定时比赛申请经审核的成绩分享。实物成绩须连续录像和人工审核；正式排名仍待接入应用真实性验证。",
            )}
          />
        )}
      </Card>
      {!!error && <Notice text={error} error />}
      <Card>
        <Txt style={{ fontSize: 23, fontWeight: "700" }}>
          {t("Category rankings", "分类成绩榜")}
        </Txt>
        <Txt small>
          {t(
            "Anonymous verified adult attempts, with separate puzzle and input categories.",
            "匿名核准的成年人单次成绩，按魔方与输入方式分榜。",
          )}
        </Txt>
        <Button
          label={t("View rankings", "查看榜单")}
          onPress={() => router.push("/rankings")}
        />
      </Card>
      <CompetitionList />
      {modes.map((mode) => (
        <Card key={mode.id}>
          <Row>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 18,
                backgroundColor:
                  c[mode.color as "mint" | "lavender" | "yellow"],
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Txt style={{ fontSize: 32, color: "#285c47" }}>
                {mode.symbol}
              </Txt>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt style={{ fontSize: 21, fontWeight: "700" }}>
                {t(mode.en, mode.zh)}
              </Txt>
              <Txt small style={{ color: c.muted }}>
                {t(mode.description, mode.descriptionZh)}
              </Txt>
            </View>
          </Row>
          <Button
            small
            kind="secondary"
            label={t("Create a room →", "创建房间 →")}
            onPress={() => void create(mode.id)}
            disabled={busy}
          />
        </Card>
      ))}
      <Card>
        <Txt style={{ fontWeight: "700", fontSize: 21 }}>
          {t("Got an invitation?", "收到邀请了吗？")}
        </Txt>
        <Field
          label={t("Room code", "房间邀请码")}
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
        />
        <Button
          label={t("Join a friend", "加入好友房间")}
          onPress={() => {
            api("rooms/join", { code })
              .then((r) => router.push(`/room/${r.id}`))
              .catch((e) => setError(e.message));
          }}
          disabled={code.length < 6}
        />
      </Card>
      <Heading>{t("Open rooms", "公开房间")}</Heading>
      {rooms.length ? (
        rooms.map((room) => (
          <Card key={room.id}>
            <Txt style={{ fontWeight: "700" }}>
              {room.puzzle.replace("x", "×")} · {room.mode} ·{" "}
              {room.mixed ? t("Mixed inputs", "混合输入") : room.input}
            </Txt>
            <Button
              small
              label={t("Join room", "加入房间")}
              onPress={() => {
                api("rooms/join", {
                  id: room.id,
                  ...(room.mixed ? { input } : {}),
                })
                  .then(() => router.push(`/room/${room.id}`))
                  .catch((e) => setError(e.message));
              }}
            />
          </Card>
        ))
      ) : (
        <Empty
          title={t("Make the first move.", "迈出第一步。")}
          body={t(
            "No open rooms yet. Invite a friend or begin a personal challenge.",
            "还没有公开房间，邀请好友，或先开始个人挑战。",
          )}
        />
      )}
    </Screen>
  );
}
