import type { Locale } from "./contracts";
import {
  applyMoves,
  facelets,
  solvedCube,
  type CubeState,
  type Sticker,
} from "./puzzle";
import { cubePieces, CORNER_PIECES, EDGE_PIECES } from "./first-solve";
import { isPyraminx, practiceApply, type PracticeState } from "./practice";

export type TutorialSticker = { position: number[]; normal?: number[] };
export type TutorialInstruction = {
  id: string;
  kind: "observe" | "regrip" | "perform";
  text: string;
  highlights: TutorialSticker[];
  viewTarget?: number[];
  frame: number;
};
const colorWords = {
  en: { U: "white", D: "yellow", F: "green", B: "blue", R: "red", L: "orange" },
  zh: { U: "白色", D: "黄色", F: "绿色", B: "蓝色", R: "红色", L: "橙色" },
};
export const tutorialColor = (color: string, locale: Locale) =>
  colorWords[locale][color as keyof typeof colorWords.en] || color;
export function tutorialPosition(p: number[], size: number, locale: Locale) {
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  return [
    p[1] === size - 1
      ? t("top", "上")
      : p[1] === 0
        ? t("bottom", "下")
        : t("middle", "中"),
    p[2] === size - 1 ? t("front", "前") : p[2] === 0 ? t("back", "后") : "",
    p[0] === size - 1 ? t("right", "右") : p[0] === 0 ? t("left", "左") : "",
  ]
    .filter(Boolean)
    .join(locale === "zh" ? "" : "-");
}
const selector = (s: Sticker): TutorialSticker => ({
  position: [...s.p],
  normal: [...s.normal],
});
export function tutorialInstructions(input: {
  state: PracticeState;
  moves: string[];
  goal: string;
  target?: number;
  title: string;
  holding: string;
  frame: number;
  locale: Locale;
  displayMoves?: string[];
  afterAlgorithm?: boolean;
  holdingColors?: string[];
}): TutorialInstruction[] {
  const { state, moves, goal, target, title, holding, frame, locale } = input;
  const notation = input.displayMoves || moves;
  let setupText = "";
  let algorithmPurpose = "";
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const result: TutorialInstruction[] = [];
  const add = (
    id: string,
    text: string,
    highlights: TutorialSticker[] = [],
    kind: TutorialInstruction["kind"] = "observe",
  ) => {
    highlights = [...highlights].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
    result.push({
      id,
      text,
      highlights,
      kind,
      frame,
      ...(highlights[0]
        ? {
            viewTarget: highlights[0].normal
              ? highlights.reduce(
                  (sum, h) => sum.map((v, i) => v + (h.normal?.[i] || 0)),
                  [0, 0, 0],
                )
              : highlights[0].position,
          }
        : {}),
    });
  };
  const objectives: Record<string, [string, string]> = {
    corner: [
      "Find a white corner to place in the bottom layer.",
      "找到一个要放入底层的白色角块。",
    ],
    cross: [
      "Find a white edge to add to the white cross.",
      "找到一条要放入白色十字的白色棱块。",
    ],
    middle: [
      "Find the edge that belongs between two middle-layer faces.",
      "找到要放入两个中层侧面之间的棱块。",
    ],
    "yellow-cross": [
      "Look at the yellow edge stickers on top.",
      "观察顶面棱块上的黄色贴片。",
    ],
    "yellow-face": [
      "Find the top corners whose yellow stickers are facing sideways.",
      "找到黄色贴片朝侧面的顶层角块。",
    ],
    "corner-positions": [
      "Find which top corners need to change places.",
      "找到需要交换位置的顶层角块。",
    ],
    solved: [
      "Find the last pieces that do not match their neighboring faces.",
      "找到与相邻面配色不一致的最后几个色块。",
    ],
    "four-centers": [
      "Find the center stickers needed for this center group.",
      "找到这组中心所需的中心贴片。",
    ],
    "four-pair": [
      "Find the two wing edges that must be paired.",
      "找到需要配对的两条翼棱。",
    ],
    "four-even-wings": [
      "Look at the edge pair affected by parity.",
      "观察受特殊情况影响的棱对。",
    ],
    "pyra-tip": [
      "Find the tip that does not match the pieces beneath it.",
      "找到与下方色块不一致的尖角。",
    ],
    "pyra-axial": [
      "Find the axial pieces that need to match their neighboring colors.",
      "找到需要与相邻颜色对齐的轴心块。",
    ],
    "pyra-base-edge": [
      "Find the edge needed for this part of the base.",
      "找到这一部分底面所需的棱块。",
    ],
    "pyra-solved": [
      "Find the remaining edges that need to change places.",
      "找到最后需要交换位置的棱块。",
    ],
    OLL: [
      "Find the top-color stickers that are still facing sideways.",
      "找到仍朝向侧面的顶色贴片。",
    ],
    PLL: [
      "Compare the top-layer side stickers with the centers beneath them.",
      "比较顶层侧面贴片与下方中心的配色。",
    ],
    CLL: [
      "Compare the top corners’ top colors and their two side colors.",
      "观察顶层角块的顶色及另外两个侧色。",
    ],
    notation: [
      "Find the face named by the next move.",
      "找到下一步转动记号所指的面。",
    ],
    f2l: [
      "Find the corner and edge that belong in the same first-two-layer slot.",
      "找到属于同一个前两层槽位的角块和棱块。",
    ],
    roux: [
      "Find the pieces needed for the side block.",
      "找到侧面区块所需的色块。",
    ],
    lookahead: [
      "Find the piece to watch while performing this algorithm.",
      "找到执行本组公式时需要持续观察的目标块。",
    ],
    efficiency: [
      "Find the pieces changed by this short sequence.",
      "找到这条短序列会改变的色块。",
    ],
    timed: [
      "Identify this case before starting the timed practice.",
      "计时练习前，先识别当前情况。",
    ],
    "corner-drill": [
      "Find the corner moved by this trigger.",
      "找到这组四步转动会调整的角块。",
    ],
    "orient-corners": [
      "Find the top-layer corners whose top-color stickers face sideways.",
      "找到顶色贴片朝向侧面的顶层角块。",
    ],
  };
  add(
    "objective",
    objectives[goal]?.[locale === "zh" ? 1 : 0] ||
      t(`Our objective: ${title}.`, `本次目标：${title}。`),
  );
  if (goal === "notation" && !isPyraminx(state)) {
    const move = notation[0],
      face = move[0];
    const faceName = (
      {
        U: t("top", "顶"),
        D: t("bottom", "底"),
        R: t("right", "右"),
        L: t("left", "左"),
        F: t("front", "前"),
        B: t("back", "后"),
      } as Record<string, string>
    )[face];
    const normal = (
      {
        U: [0, 1, 0],
        D: [0, -1, 0],
        R: [1, 0, 0],
        L: [-1, 0, 0],
        F: [0, 0, 1],
        B: [0, 0, -1],
      } as Record<string, number[]>
    )[face];
    const stickers = state.stickers.filter(
      (s) => s.normal.join() === normal.join(),
    );
    add(
      "face",
      t(`${face} names the ${faceName} face.`, `${face} 表示${faceName}面。`),
      stickers.map(selector),
    );
    const center = stickers.find(
      (s) => s.p.filter((v) => v === 0 || v === state.size - 1).length === 1,
    );
    if (center)
      add(
        "center",
        t(
          `Its center sticker is ${tutorialColor(center.color, locale)}.`,
          `它的中心贴片是${tutorialColor(center.color, locale)}。`,
        ),
        [selector(center)],
      );
    const direction = move.endsWith("'")
      ? t("counterclockwise", "逆时针")
      : move.endsWith("2")
        ? t("half a turn", "半圈")
        : t("clockwise", "顺时针");
    add(
      "direction",
      t(
        `Looking directly at this face, ${move} means ${direction}.`,
        `正对这个面观察，${move} 表示${direction}转动。`,
      ),
      stickers.map(selector),
    );
    if (!input.afterAlgorithm) add("holding", holding, [], "regrip");
    add(
      "perform",
      t(
        `Make ${move}: turn the ${faceName} face ${direction}.`,
        `执行 ${move}：将${faceName}面${direction}转动。`,
      ),
      [],
      "perform",
    );
    return result;
  }
  if (!isPyraminx(state)) {
    const end = applyMoves(state, moves),
      after = facelets(end),
      before = facelets(state);
    const changed = state.stickers.filter((s) => {
      const other = end.stickers.find(
        (x) =>
          x.p.every((v, i) => v === s.p[i]) &&
          x.normal.every((v, i) => v === s.normal[i]),
      );
      return other?.color !== s.color;
    });
    const reference =
      state.size === 3 ? before : facelets(applyMoves(solvedCube(3), "z2"));
    if (
      goal === "yellow-cross" ||
      goal === "OLL" ||
      goal === "yellow-face" ||
      goal === "orient-corners"
    ) {
      const topColor = goal === "OLL" || goal === "orient-corners" ? "U" : "D";
      const oriented = state.stickers.filter(
        (s) => s.normal[1] === 1 && s.color === topColor,
      );
      const edges = oriented.filter(
        (s) =>
          cubePieces(state).find((g) => g.some((x) => x === s))?.length === 2,
      );
      const pattern =
        edges.length === 0
          ? t("a dot", "点形")
          : edges.length === 4
            ? t("a cross", "十字")
            : edges.length === 2 &&
                edges[0].p[0] + edges[1].p[0] === state.size - 1 &&
                edges[0].p[2] + edges[1].p[2] === state.size - 1
              ? t("a line", "一字形")
              : t("an L", "拐角形");
      add(
        "top-pattern",
        goal === "yellow-cross"
          ? t(
              `Your yellow top edges form ${pattern}.`,
              `当前顶面黄色棱块呈${pattern}。`,
            )
          : t(
              `There are ${oriented.length} ${tutorialColor(topColor, locale)} stickers facing up.`,
              `目前有 ${oriented.length} 个${tutorialColor(topColor, locale)}贴片朝上。`,
            ),
        oriented.map(selector),
      );
    }
    let homeName =
      goal === "corner"
        ? CORNER_PIECES[target ?? 4]
        : goal === "middle"
          ? EDGE_PIECES[target ?? 8]
          : goal === "four-pair"
            ? EDGE_PIECES[target ?? 0]
            : undefined;
    let colors = homeName
      ?.split("")
      .map((f) => reference[f as keyof typeof reference][4]);
    const groups = cubePieces({
      size: state.size,
      stickers: [...state.stickers].sort((a, b) =>
        JSON.stringify(selector(a)).localeCompare(JSON.stringify(selector(b))),
      ),
    });
    const affected = (g: Sticker[]) => g.some((s) => changed.includes(s));
    if (goal === "cross") {
      const edge = groups.find(
        (g) => g.length === 2 && g.some((s) => s.color === "U") && affected(g),
      );
      if (edge) {
        colors = edge.map((s) => s.color);
        homeName = colors
          .map(
            (color) =>
              Object.keys(reference).find(
                (f) => reference[f as keyof typeof reference][4] === color,
              ) || "",
          )
          .join("") as typeof homeName;
      }
    }
    let piece =
      colors &&
      (groups.find(
        (g) =>
          g.length === colors!.length &&
          g.every((s) => colors!.includes(s.color)) &&
          affected(g),
      ) ||
        groups.find(
          (g) =>
            g.length === colors!.length &&
            g.every((s) => colors!.includes(s.color)),
        ));
    if (goal === "four-centers") {
      const face = ["D", "F", "R", "L", "B", "U"][
        target ?? 0
      ] as keyof typeof reference;
      const color = reference[face][4];
      piece = groups.find(
        (g) => g.length === 1 && g[0].color === color && affected(g),
      );
    }
    if (goal === "four-even-wings")
      piece = groups.find((g) => g.length === 2 && affected(g));
    if (["corner-drill", "orient-corners", "CLL", "f2l"].includes(goal))
      piece = groups.find((g) => g.length === 3 && affected(g));
    if (!piece)
      piece =
        groups.find((g) => g.some((s) => changed.includes(s))) || groups[0];
    piece = [...piece].sort((a, b) => a.color.localeCompare(b.color));
    const names = piece
      .map((s) => tutorialColor(s.color, locale))
      .join(t(", ", "、"));
    const rotation = [[], ["y"], ["y2"], ["y'"]][frame] || [];
    const displayed = applyMoves(
      { size: state.size, stickers: piece },
      rotation,
    );
    const pos = tutorialPosition(displayed.stickers[0].p, state.size, locale);
    const destination = applyMoves(
      applyMoves({ size: state.size, stickers: piece }, moves),
      rotation,
    );
    setupText = t(
      `Turn only ${notation[0]}. This moves the ${names} piece from ${pos} to ${tutorialPosition(destination.stickers[0].p, state.size, locale)}.`,
      `只转动 ${notation[0]}；这会把${names}色块从${pos}移到${tutorialPosition(destination.stickers[0].p, state.size, locale)}。`,
    );
    const trigger =
      notation.join(" ") === "R U R' U'"
        ? t("Sexy move", "右手四步（Sexy Move）")
        : t("This group", "这组公式");
    if (goal === "corner")
      algorithmPurpose =
        piece[0].p[1] === 0
          ? t(
              `${trigger}: lift the ${names} corner into the top layer.`,
              `${trigger}：将${names}角块从底层取到顶层。`,
            )
          : t(
              `${trigger}: insert the ${names} corner at front-right.`,
              `${trigger}：将${names}角块插入前右下方。`,
            );
    add(
      "identify",
      input.afterAlgorithm
        ? t(
            `After that group, the ${names} piece is now at ${pos}.`,
            `上一组结束后，${names}色块现在位于${pos}。`,
          )
        : t(
            `This is the ${names} piece at the ${pos}.`,
            `这是位于${pos}的${names}色块。`,
          ),
      piece.map(selector),
    );
    add(
      "inspect",
      goal === "corner"
        ? t(
            "Look at this corner’s two stickers other than white.",
            "观察这个角块上除白色以外的两个贴片。",
          )
        : t(
            "Look at the colors on this highlighted piece.",
            "观察高亮色块上的颜色。",
          ),
    );
    const sides =
      goal === "corner" ? piece.filter((s) => s.color !== "U") : piece;
    add(
      "colors",
      t(
        `These stickers are ${sides.map((s) => tutorialColor(s.color, locale)).join(" and ")}.`,
        `这些贴片是${sides.map((s) => tutorialColor(s.color, locale)).join("、")}。`,
      ),
      sides.map(selector),
    );
    if (goal === "f2l") {
      const colors = piece
        .filter((s) => s.color !== "U" && s.color !== "D")
        .map((s) => s.color);
      const edge = groups.find(
        (g) => g.length === 2 && g.every((s) => colors.includes(s.color)),
      );
      if (edge)
        add(
          "partner",
          t(
            `Its matching edge is ${edge.map((s) => tutorialColor(s.color, locale)).join(" and ")}, at ${tutorialPosition(edge[0].p, state.size, locale)}.`,
            `对应的棱块是${edge.map((s) => tutorialColor(s.color, locale)).join("、")}色，位于${tutorialPosition(edge[0].p, state.size, locale)}。`,
          ),
          edge.map(selector),
        );
    }
    if (goal === "four-pair") {
      const partner = groups.find(
        (g) =>
          g !== piece &&
          g.length === 2 &&
          g[0].p.join() !== piece![0].p.join() &&
          g.every((s) => piece!.some((p) => p.color === s.color)),
      );
      if (partner)
        add(
          "partner",
          t(
            `The matching ${names} wing is at ${tutorialPosition(partner[0].p, state.size, locale)}. These two wings form one edge pair.`,
            `另一个同为${names}的翼棱位于${tutorialPosition(partner[0].p, state.size, locale)}；这两条翼棱需要组成一对。`,
          ),
          partner.map(selector),
        );
    }
    if (homeName && colors) {
      const home = cubePieces(state).find(
        (g) =>
          g.length === colors.length &&
          homeName.split("").every((f) => {
            const axis = "RL".includes(f) ? 0 : "UD".includes(f) ? 1 : 2;
            return g[0].p[axis] === ("RUF".includes(f) ? state.size - 1 : 0);
          }),
      );
      const sideNames = colors
        .filter((c) => goal !== "corner" || c !== "U")
        .map((c) => tutorialColor(c, locale));
      add(
        "home",
        t(
          `Its home is between the ${sideNames.join(" and ")} faces. Match those side colors here.`,
          `它的目标位在${sideNames.join("、")}面之间；这两个侧色需要在这里匹配。`,
        ),
        (home || []).map(selector),
      );
    } else {
      // Describe each affected face separately, rather than list an entire case at once.
      for (const face of Object.keys(before) as (keyof typeof before)[]) {
        const indices = before[face].flatMap((c, i) =>
          c !== after[face][i] ? [i] : [],
        );
        if (!indices.length) continue;
        const stickers = changed.filter((s) => {
          const n = s.normal;
          return face === "U"
            ? n[1] === 1
            : face === "D"
              ? n[1] === -1
              : face === "R"
                ? n[0] === 1
                : face === "L"
                  ? n[0] === -1
                  : face === "F"
                    ? n[2] === 1
                    : n[2] === -1;
        });
        add(
          `pattern-${face}`,
          t(
            `On face ${face}, inspect the highlighted ${indices.map((i) => `${Math.floor(i / state.size) + 1},${(i % state.size) + 1}`).join(" / ")} row,column positions.`,
            `观察 ${face} 面高亮的位置（行,列）：${indices.map((i) => `${Math.floor(i / state.size) + 1},${(i % state.size) + 1}`).join(" / ")}。`,
          ),
          stickers.map(selector),
        );
      }
    }
    if (goal === "corner") {
      const white = piece.find((s) => s.color === "U");
      const shownWhite = displayed.stickers.find((s) => s.color === "U");
      const direction =
        shownWhite?.normal[1] === 1
          ? t("up", "上")
          : shownWhite?.normal[1] === -1
            ? t("down", "下")
            : shownWhite?.normal[0] === 1
              ? t("right", "右")
              : shownWhite?.normal[0] === -1
                ? t("left", "左")
                : shownWhite?.normal[2] === 1
                  ? t("toward you", "前")
                  : t("away from you", "后");
      add(
        "orientation",
        t(
          `The white sticker faces ${direction}; this corner is in the ${pos} position.`,
          `白色贴片朝${direction}，角块位于${pos}。`,
        ),
        white ? [selector(white)] : [],
      );
    }
  } else {
    const end = practiceApply(state, moves);
    if (isPyraminx(end)) {
      const changed = state.stickers
        .filter(
          (s) =>
            end.stickers.find((x) =>
              x.position.every((v, i) => v === s.position[i]),
            )?.color !== s.color,
        )
        .sort((a, b) =>
          a.position.join(",").localeCompare(b.position.join(",")),
        );
      for (const [i, s] of changed.entries()) {
        const face = [
          t("bottom", "底"),
          t("right", "右"),
          t("left", "左"),
          t("front", "前"),
        ][s.position.indexOf(0)];
        const vertex = [
          t("top", "上"),
          t("left", "左"),
          t("right", "右"),
          t("back", "后"),
        ][s.position.indexOf(Math.max(...s.position))];
        add(
          `piece-${i}`,
          t(
            `This ${tutorialColor(s.color, locale)} sticker is on the ${face} face, near the ${vertex} vertex.`,
            `这个${tutorialColor(s.color, locale)}贴片位于${face}面、靠近${vertex}顶点。`,
          ),
          [{ position: [...s.position] }],
        );
      }
    }
  }
  const grip = input.holdingColors?.map((color) =>
    tutorialColor(color, locale),
  );
  add(
    "holding",
    grip
      ? t(
          `Hold ${grip[0]} above, ${grip[1]} in front and ${grip[2]} on your right.`,
          `${grip[0]}朝上，${grip[1]}朝前，${grip[2]}在右。`,
        )
      : holding,
    [],
    "regrip",
  );
  const purposes: Record<string, [string, string]> = {
    middle: [
      "Use this insertion to place the edge between its matching side colors, restoring the completed first layer.",
      "用这组插棱公式把目标棱放入对应侧色之间，同时恢复已完成的第一层。",
    ],
    "yellow-cross": [
      "Use this algorithm to turn the top edges’ yellow stickers upward while restoring the first two layers.",
      "用这组公式让顶棱的黄色贴片朝上，同时恢复前两层。",
    ],
    "yellow-face": [
      "Use this algorithm to turn the top corners’ yellow stickers upward while restoring the finished layer.",
      "用这组公式让顶角的黄色贴片朝上，同时恢复已完成的层。",
    ],
    OLL: [
      "Use this algorithm to orient the highlighted top-color stickers while restoring the first two layers.",
      "用这组公式调整高亮顶色贴片的朝向，同时恢复前两层。",
    ],
    PLL: [
      "Use this algorithm to exchange the highlighted last-layer pieces while keeping their top stickers facing up.",
      "用这组公式交换高亮的末层色块，同时保持顶色贴片朝上。",
    ],
    CLL: [
      "Use this algorithm to orient and exchange these last-layer corners while restoring the first layer.",
      "用这组公式调整这些末层角块的朝向及位置，同时恢复第一层。",
    ],
    "orient-corners": [
      "Use this group to bring the highlighted top-color corner stickers upward while restoring the opposite layer.",
      "用这组公式让高亮角块的顶色贴片朝上，同时恢复另一层。",
    ],
    "corner-drill": [
      "Use this complete trigger to move and twist the highlighted corner; inspect it after all four moves.",
      "完整执行这组四步来移动并扭转高亮角块；四步结束后再观察。",
    ],
    f2l: [
      "Use this group to join the corner and edge in their matching slot while restoring the completed neighboring slots.",
      "用这组公式把角块和棱块放入对应槽位，同时恢复相邻的已完成槽位。",
    ],
    roux: [
      "Use this group to place the highlighted pieces in the side block.",
      "用这组公式把高亮色块放入侧面区块。",
    ],
    lookahead: [
      "Follow the highlighted piece through this complete group; inspect its new position at the end.",
      "在整组转动中跟踪高亮目标块，结束后观察它的新位置。",
    ],
    efficiency: [
      "Perform this complete group and compare the highlighted pieces with their starting positions.",
      "完整执行这组转动，再比较高亮色块与起始位置。",
    ],
    timed: [
      "Perform this complete group in the displayed order; speed comes after a correct completion.",
      "按所示顺序完整执行这组转动，先正确完成，再练速度。",
    ],
    "pyra-tip": [
      "Turn this tip to match the three colors directly beneath it.",
      "转动这个尖角，使它与正下方的三个颜色一致。",
    ],
    "pyra-axial": [
      "Use this group to align the highlighted axial colors with their neighboring faces.",
      "用这组转动使高亮轴心颜色与相邻面一致。",
    ],
    "pyra-base-edge": [
      "Use this group to insert the highlighted edge into its matching base colors.",
      "用这组转动把高亮棱块插入对应底面配色之间。",
    ],
    "pyra-solved": [
      "Use this group to cycle the remaining highlighted edges while restoring the completed base.",
      "用这组公式循环调整剩余高亮棱块，同时恢复已完成的底面。",
    ],
    "four-centers": [
      "Use this exchange to gather the highlighted center colors without losing the completed center groups.",
      "用这组交换汇集高亮的中心色，同时恢复已完成的中心组。",
    ],
    "four-pair": [
      "Use this exchange to bring the matching wings together while restoring the center groups.",
      "用这组交换将同色翼棱配在一起，同时恢复中心组。",
    ],
    "four-even-wings": [
      "Use this group to correct the wing permutation before continuing with center and edge groups.",
      "用这组转动修正翼棱排列，再继续处理中心与棱组。",
    ],
  };
  const purpose = purposes[goal]?.[locale === "zh" ? 1 : 0];
  add(
    "perform",
    moves.length === 1
      ? setupText ||
          t(
            `Make ${notation[0]} to align the highlighted part.`,
            `转动 ${notation[0]}，对齐高亮部分。`,
          )
      : algorithmPurpose || purpose
        ? algorithmPurpose || purpose
        : t(
            `Perform the complete ${title} algorithm below, keeping this holding direction.`,
            `保持当前握持方向，完整执行下方的${title}公式。`,
          ),
    [],
    "perform",
  );
  return result;
}
