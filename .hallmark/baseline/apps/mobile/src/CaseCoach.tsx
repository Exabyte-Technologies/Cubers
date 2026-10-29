import React, { useMemo, useState } from "react";
import { View } from "react-native";
import {
  COLORS,
  observeLastLayer,
  practiceSetup,
  isPyraminx,
  type Face,
  type LastLayerObservation,
  type Lesson,
} from "@cubers/core";
import { useApp } from "./state";
import { Button, Card, Chip, Notice, Row, Txt } from "./ui";

const colorLabels: Record<Face, [string, string]> = {
  U: ["White", "白"],
  R: ["Red", "红"],
  F: ["Green", "绿"],
  D: ["Yellow", "黄"],
  L: ["Orange", "橙"],
  B: ["Blue", "蓝"],
};
const faceLabels = {
  F: ["Front", "前面"],
  R: ["Right", "右面"],
  B: ["Back", "后面"],
  L: ["Left", "左面"],
} as const;

function StickerRow({ colors, label }: { colors: Face[]; label: string }) {
  const { t } = useApp();
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {colors.map((color, i) => (
        <View
          key={i}
          accessible
          accessibilityLabel={`${label} · ${i + 1} · ${t(...colorLabels[color])}`}
          style={{
            width: 42,
            minHeight: 42,
            paddingVertical: 8,
            backgroundColor: COLORS[color],
            borderWidth: 1,
            borderColor: "#283b31",
            borderRadius: 6,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Txt small style={{ color: "#0b1811", fontWeight: "700" }}>
            {t(colorLabels[color][0][0], colorLabels[color][1])}
          </Txt>
        </View>
      ))}
    </View>
  );
}

function Observation({
  observation: o,
}: {
  observation: LastLayerObservation;
}) {
  const { t } = useApp();
  const [answer, setAnswer] = useState<number>(),
    [revealed, setRevealed] = useState(false);
  const correct =
    o.family === "PLL"
      ? o.sides.filter((side) => side.matchingCorners).length
      : o.orientedCorners;
  return (
    <View style={{ gap: 12 }}>
      <Txt small>
        {t(
          "Top face viewed from above: back at the top, front at the bottom. W = white, R = red, G = green, Y = yellow, O = orange, B = blue.",
          "从上方看顶面：上方是后侧，下方是前侧。贴片上的文字标明颜色。",
        )}
      </Txt>
      {Array.from({ length: o.size }, (_, row) => (
        <StickerRow
          key={row}
          colors={o.top.slice(row * o.size, (row + 1) * o.size)}
          label={t(`Top row ${row + 1}`, `顶面第 ${row + 1} 排`)}
        />
      ))}
      <Txt small>
        {t(
          "Each side row below is viewed straight on. Keep white up and the completed green side toward you. Turn your view, not the cube's layers, to inspect the back.",
          "下方各侧面上排按正视方向展示。保持白色朝上、已完成的绿色侧面朝前；观察后面时可改变视角，不要转动魔方层。",
        )}
      </Txt>
      {o.sides.map((side) => (
        <View key={side.face} style={{ gap: 4 }}>
          <Txt small>
            {side.face} ·{" "}
            {t(faceLabels[side.face][0], faceLabels[side.face][1])}
          </Txt>
          <StickerRow
            colors={side.stickers}
            label={`${side.face} ${t("upper row", "上排")}`}
          />
        </View>
      ))}
      <Txt style={{ fontWeight: "700" }}>
        {o.family === "PLL"
          ? t(
              "How many sides have matching upper corners?",
              "有几个侧面的上排两角同色？",
            )
          : t(
              "How many white corner stickers point up?",
              "有几个角块的白色贴片已朝上？",
            )}
      </Txt>
      <Row>
        {[0, 1, 2, 3, 4].map((value) => (
          <Chip
            key={value}
            label={String(value)}
            selected={answer === value}
            onPress={() => {
              setAnswer(value);
              setRevealed(true);
            }}
          />
        ))}
      </Row>
      {answer !== undefined && (
        <Notice
          text={
            answer === correct
              ? t(
                  "Yes. Now compare the clues below.",
                  "答对了。再对照下方线索观察。",
                )
              : t(
                  `There are ${correct}. Check the labeled stickers below and try again.`,
                  `共有 ${correct} 个。请对照下方带文字的贴片再观察一次。`,
                )
          }
        />
      )}
      {!revealed && (
        <Button
          small
          kind="secondary"
          label={t("Show recognition clues", "查看识别线索")}
          onPress={() => setRevealed(true)}
        />
      )}
      {revealed && (
        <>
          <Txt>
            {t("White corners pointing up", "白色已朝上的角块")} ·{" "}
            {o.orientedCorners}/4
          </Txt>
          {o.orientedEdges !== null && (
            <Txt>
              {t("White edges pointing up", "白色已朝上的棱块")} ·{" "}
              {o.orientedEdges}/4
            </Txt>
          )}
          <Txt small>
            {o.family === "OLL"
              ? t(
                  "Count corners and edges separately. The center does not count. Equal counts can still form different cases: compare their exact positions on the top and side rows. OLL finishes orientation; it may leave the side colors permuted.",
                  "角块与棱块分别数，中心块不计入。数量相同也可能是不同情况，还需比较顶面及侧面上排的具体位置。OLL 只完成朝向，侧面排列可能仍需处理。",
                )
              : o.family === "CLL"
                ? t(
                    "A 2×2 has no centers or edges. Use the completed bottom layer as the side reference. Corner orientation alone does not identify CLL: also compare side pairs and the corner destinations below.",
                    "二阶没有中心块和棱块，请用已完成的底层判断侧面参照色。仅看角块朝向不能确定 CLL，还要比较侧面色对及下方角块的目标位置。",
                  )
                : t(
                    "The top is already oriented. Compare matching corner pairs, three-sticker bars and destinations. A same-color bar may still need a U adjustment to match its side center.",
                    "顶面朝向已完成。请比较同色角对、三片同色条及各块目标位置。同色条也可能尚未与侧面中心对齐，需要 U 调整。",
                  )}
          </Txt>
          {o.sides.map((side) => (
            <Txt small key={side.face}>
              {side.face} ·{" "}
              {t(faceLabels[side.face][0], faceLabels[side.face][1])}:{" "}
              {side.matchingCorners
                ? t("matching corner pair", "两角同色")
                : t("no side-color corner pair", "无侧色同色角对")}
              {o.size === 3 && side.solidBar
                ? t(" · three-sticker bar", " · 三片同色条")
                : ""}
              {side.aligned ? t(" · aligned to its side", " · 已对齐本侧") : ""}
            </Txt>
          ))}
          {o.family !== "OLL" && (
            <>
              <Txt small>
                {t(
                  "Destination map: U = top, F = front, R = right, B = back, L = left. UFR → UFL means the corner now at top/front/right belongs at top/front/left. Read colors against the fixed side references; these arrows describe destinations, not moves.",
                  "目标位置表：U 顶、F 前、R 右、B 后、L 左。UFR → UFL 表示当前在右前上方的角块应归位到左前上方。根据固定侧面参照色判断，箭头表示归位目标，不是转动步骤。",
                )}
              </Txt>
              {[...o.corners, ...(o.family === "PLL" ? o.edges : [])].map(
                (piece) => (
                  <Txt small key={piece.slot}>
                    {piece.slot} → {piece.destination} ·{" "}
                    {piece.oriented
                      ? t("white up", "白色朝上")
                      : t("white on a side", "白色在侧面")}
                  </Txt>
                ),
              )}
            </>
          )}
          <Txt small>
            {t(
              "This observation question saves no learning credit. Complete the verified practice checkpoint to save progress.",
              "此观察题不计入学习进度，完成经过验证的练习检查点后才会保存进度。",
            )}
          </Txt>
        </>
      )}
    </View>
  );
}

export function CaseCoach({
  current,
  prepared,
  before = [],
  setup = false,
}: {
  current: LastLayerObservation;
  prepared?: LastLayerObservation;
  before?: string[];
  setup?: boolean;
}) {
  const { t } = useApp();
  const [showPrepared, setShowPrepared] = useState(false);
  const observation = showPrepared && prepared ? prepared : current;
  return (
    <Card>
      <Txt style={{ fontSize: 20, fontWeight: "700" }}>
        {t("Read the case", "读懂这一情况")} · {current.family}
      </Txt>
      <Txt small>
        {setup
          ? t(
              "The lesson's starting model, before any practice turns. This is a reference snapshot, not live tracking of your physical puzzle.",
              "这是本课转动前的起始模型，供观察对照，不会实时追踪实物转动。",
            )
          : showPrepared
            ? t(
                `After the suggested top setup: ${before.join(" ")}. Keep the same reference frame.`,
                `按建议调整顶面后：${before.join(" ")}。保持参照方向不变。`,
              )
            : t(
                "Your checked scan, before the suggested top setup. Rescan after physical changes.",
                "这是调整顶面前已检查的扫描状态。实物发生变化后请重新扫描。",
              )}
      </Txt>
      {prepared && before.length > 0 && (
        <Row>
          <Chip
            label={t("Scanned view", "扫描时的状态")}
            selected={!showPrepared}
            onPress={() => setShowPrepared(false)}
          />
          <Chip
            label={`${t("After", "调整后")} ${before.join(" ")}`}
            selected={showPrepared}
            onPress={() => setShowPrepared(true)}
          />
        </Row>
      )}
      <Observation
        key={JSON.stringify(observation)}
        observation={observation}
      />
    </Card>
  );
}

export function LessonCaseCoach({ lesson }: { lesson: Lesson }) {
  const { t } = useApp();
  const [expanded, setExpanded] = useState(false);
  const observation = useMemo(() => {
    if (!lesson.caseFamily) return null;
    const state = practiceSetup(lesson.puzzle, lesson.algorithm);
    return isPyraminx(state)
      ? null
      : observeLastLayer(state, lesson.caseFamily);
  }, [lesson]);
  return observation ? (
    <View style={{ gap: 12 }}>
      <Button
        small
        kind="secondary"
        label={
          expanded
            ? t("Hide recognition coaching", "收起识别指导")
            : t("Learn how to recognize this case", "学习识别这一情况")
        }
        onPress={() => setExpanded((value) => !value)}
      />
      {expanded && (
        <CaseCoach
          key={`${lesson.id}:${lesson.algorithm}`}
          current={observation}
          setup
        />
      )}
    </View>
  ) : null;
}
