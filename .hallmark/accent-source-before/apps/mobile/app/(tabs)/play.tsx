import { CompetitionList } from "../../src/CompetitionList";
import React, { useEffect, useState } from "react";
import { View, Switch, Pressable } from "react-native";
import Svg, { Path, Rect, Circle, Line } from "react-native-svg";
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
  },
  {
    id: "pattern",
    en: "Pattern Chase",
    zh: "图案追逐",
    description: "Make the target pattern, turn by turn.",
    descriptionZh: "一步一步，拼出目标图案。",
  },
  {
    id: "relay",
    en: "Cooperative Relay",
    zh: "合作接力",
    description: "Pass the puzzle challenge to a teammate.",
    descriptionZh: "接过挑战，再传递给队友。",
  },
  {
    id: "sprint",
    en: "Algorithm Sprint",
    zh: "公式冲刺",
    description: "A short sequence. Make every move count.",
    descriptionZh: "一段短公式，每一步都准确。",
  },
  {
    id: "daily",
    en: "Daily Challenge",
    zh: "每日挑战",
    description: "The same scramble. A fresh personal goal.",
    descriptionZh: "相同的打乱，全新的个人目标。",
  },
];
export default function Play() {
  const { t, api } = useApp(),
    c = useTheme(),
    [mode, setMode] = useState("race"),
    [optionsOpen, setOptionsOpen] = useState(false),
    [section, setSection] = useState("join"),
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
  const selectedMode = modes.find((item) => item.id === mode)!;
  return (
    <Screen>
      <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
        <Heading>{t("Play", "挑战")}</Heading>
        <Button
          small
          kind="secondary"
          label={t("Room options", "房间设置")}
          onPress={() => setOptionsOpen(!optionsOpen)}
        />
      </Row>
      <Row style={{ gap: 10 }}>
        <Chip
          label={
            puzzle === "pyraminx"
              ? t("Pyraminx", "金字塔")
              : puzzle.replace("x", "×")
          }
          onPress={() => setOptionsOpen(true)}
        />
        <Chip
          label={
            input === "scan"
              ? t("Physical", "实物")
              : input === "smart"
                ? t("Smart", "智能")
                : t("Virtual", "虚拟")
          }
          onPress={() => setOptionsOpen(true)}
        />
        <Txt small style={{ color: c.muted }}>
          {privateRoom
            ? t("Private friend room", "好友私密房间")
            : t("Public room", "公开房间")}
        </Txt>
      </Row>
      {optionsOpen && (
        <Card style={{ gap: 16 }}>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 21, fontWeight: "600" }}
          >
            {t("Choose how to play", "选择挑战方式")}
          </Txt>
          <Row>
            {["2x2", "3x3", "4x4", "pyraminx"].map((p) => (
              <Chip
                key={p}
                label={
                  p === "pyraminx"
                    ? t("Pyraminx", "金字塔")
                    : p.replace("x", "×")
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
            <Txt>{t("Mixed inputs, casual", "混合输入，休闲")}</Txt>
            <Switch
              accessibilityLabel={t("Mixed inputs", "混合输入")}
              value={mixed}
              onValueChange={(value) => {
                setMixed(value);
                if (value) setRanked(false);
              }}
            />
          </Row>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt>{t("Ranked race", "排名竞速")}</Txt>
            <Switch
              accessibilityLabel={t("Ranked race", "排名竞速")}
              value={ranked}
              disabled={mixed}
              onValueChange={setRanked}
            />
          </Row>
          <Button
            small
            kind="secondary"
            label={t("Done", "完成")}
            onPress={() => setOptionsOpen(false)}
          />
        </Card>
      )}
      {mixed && (
        <Notice
          text={t(
            "Each player chooses an input before the room starts. Results stay outside rankings. Scans support races and daily challenges; smart cubes require a verified 3×3 model. Scans do not continuously track turns.",
            "每位玩家在开始前选择输入方式，成绩不计入排名。图像扫描适用于竞速和每日挑战。智能魔方仅限通过验证的三阶型号。扫描不连续追踪转动。",
          )}
        />
      )}
      {ranked && (
        <Notice
          text={t(
            "Ranked play shares an eligible adult’s anonymous verified score in its puzzle/input category. Children and teens can request approved score sharing through scheduled competitions. Physical results need uninterrupted recording and review. Production ranking awaits app attestation.",
            "排名竞速会在对应魔方与输入类别中分享符合资格成年人的匿名核准成绩。儿童与青少年可通过定时比赛申请经审核的成绩分享。实物成绩须连续录像和人工审核；正式排名仍待接入应用真实性验证。",
          )}
        />
      )}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          alignSelf: "center",
          maxWidth: 620,
          gap: 14,
          paddingTop: 8,
          paddingBottom: 8,
        }}
      >
        {modes.map((item) => {
          const selected = mode === item.id;
          return (
            <View
              key={item.id}
              style={{ alignItems: "center", width: 94, gap: 10 }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(item.en, item.zh)}
                accessibilityState={{ selected, disabled: busy }}
                disabled={busy}
                onPress={() => setMode(item.id)}
                style={({ pressed }) => ({
                  width: 76,
                  height: 76,
                  borderRadius: 38,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderBottomWidth: 6,
                  borderColor: selected ? c.buttonEdge : c.edge,
                  backgroundColor: selected ? c.accent : c.paper,
                  transform: [{ translateY: pressed ? 3 : 0 }],
                  opacity: busy ? 0.55 : 1,
                })}
              >
                <ModeGlyph
                  mode={item.id}
                  color={selected ? c.onAccent : c.ink}
                />
              </Pressable>
              <Txt
                small
                style={{
                  fontWeight: selected ? "600" : "500",
                  textAlign: "center",
                  color: selected ? c.ink : c.muted,
                }}
              >
                {item.id === "race"
                  ? t("Race", "竞速")
                  : item.id === "pattern"
                    ? t("Pattern", "图案")
                    : item.id === "relay"
                      ? t("Relay", "接力")
                      : item.id === "sprint"
                        ? t("Sprint", "冲刺")
                        : t("Daily", "每日挑战")}
              </Txt>
            </View>
          );
        })}
      </View>
      <Card style={{ backgroundColor: c.yellow, gap: 12 }}>
        <Txt
          accessibilityRole="header"
          style={{
            fontSize: 25,
            lineHeight: 32,
            fontWeight: "600",
            color: c.onAccent,
          }}
        >
          {t(selectedMode.en, selectedMode.zh)}
        </Txt>
        <Txt small style={{ color: c.onAccent }}>
          {t(selectedMode.description, selectedMode.descriptionZh)}
        </Txt>
        <Button
          label={
            busy ? t("Creating…", "正在创建……") : t("Create a room", "创建房间")
          }
          onPress={() => void create(selectedMode.id)}
          disabled={busy}
        />
      </Card>
      {!!error && <Notice text={error} error />}
      <Row style={{ paddingTop: 12 }}>
        {[
          ["join", "Join a friend", "加入好友"],
          ["rooms", "Open rooms", "公开房间"],
          ["events", "Competitions", "比赛"],
          ["rankings", "Rankings", "成绩榜"],
        ].map(([id, en, zh]) => (
          <Chip
            key={id}
            label={t(en, zh)}
            selected={section === id}
            onPress={() => setSection(id)}
          />
        ))}
      </Row>
      {section === "join" && (
        <Card>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 21, fontWeight: "600" }}
          >
            {t("Join a friend", "加入好友房间")}
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
      )}
      {section === "rankings" && (
        <Card>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 23, lineHeight: 30, fontWeight: "600" }}
          >
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
      )}
      {section === "events" && <CompetitionList />}
      {section === "rooms" && (
        <>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 23, lineHeight: 30, fontWeight: "600" }}
          >
            {t("Open rooms", "公开房间")}
          </Txt>
          {rooms.length ? (
            rooms.map((room) => (
              <Card key={room.id}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Txt
                    style={{ fontSize: 22, lineHeight: 29, fontWeight: "600" }}
                  >
                    {room.puzzle.replace("x", "×")}
                  </Txt>
                  <Txt small>{room.mode}</Txt>
                  <Txt small>
                    {room.mixed ? t("Mixed inputs", "混合输入") : room.input}
                  </Txt>
                </Row>
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
        </>
      )}
    </Screen>
  );
}
function ModeGlyph({ mode, color }: { mode: string; color: string }) {
  return (
    <Svg width={32} height={32} viewBox="0 0 32 32" aria-hidden={true}>
      {mode === "race" ? (
        <>
          <Path
            d="M8 27V5h16l-4 5 4 5H8"
            fill="none"
            stroke={color}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <Line
            x1={5}
            y1={27}
            x2={12}
            y2={27}
            stroke={color}
            strokeWidth={2.4}
          />
        </>
      ) : mode === "pattern" ? (
        <>
          {[5, 18].flatMap((x) =>
            [5, 18].map((y) => (
              <Rect
                key={`${x}:${y}`}
                x={x}
                y={y}
                width={9}
                height={9}
                rx={2}
                fill="none"
                stroke={color}
                strokeWidth={2.2}
              />
            )),
          )}
        </>
      ) : mode === "relay" ? (
        <>
          <Circle
            cx={9}
            cy={10}
            r={4}
            fill="none"
            stroke={color}
            strokeWidth={2.2}
          />
          <Circle
            cx={23}
            cy={22}
            r={4}
            fill="none"
            stroke={color}
            strokeWidth={2.2}
          />
          <Path
            d="M15 8h10v7M17 24H7v-7"
            fill="none"
            stroke={color}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : mode === "sprint" ? (
        <Path
          d="m18 3-11 15h8l-1 11 11-16h-8z"
          fill="none"
          stroke={color}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
      ) : (
        <>
          <Rect
            x={5}
            y={7}
            width={22}
            height={21}
            rx={4}
            fill="none"
            stroke={color}
            strokeWidth={2.2}
          />
          <Path
            d="M5 13h22M11 4v6M21 4v6m-10 11 3 3 7-7"
            fill="none"
            stroke={color}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </Svg>
  );
}
