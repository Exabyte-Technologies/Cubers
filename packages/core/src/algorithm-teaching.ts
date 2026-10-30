import type { Locale } from "./contracts";
import type { GuidedPuzzle, GuidedSolveStep } from "./first-solve";
import { guidedInverse, guidedState } from "./guided";
import { practiceApply, practiceSetup, isPyraminx } from "./practice";
import {
  tutorialInstructions,
  type TutorialInstruction,
} from "./tutorial-instructions";
import type { Lesson } from "./curriculum";
import {
  applyMoves,
  inverse,
  solvedCube,
  stateKey,
  turn,
  facelets,
} from "./puzzle";

// A regrip changes how moves are read, not the stored state or device telemetry.
// Derive the translations from the puzzle engine instead of hand-written face
// permutations. The same frame drives notation, the model and turn cues.
const outer = ["U", "R", "F", "D", "L", "B"].flatMap((f) => [
  f,
  f + "'",
  f + "2",
]);
const frames = [[], ["y"], ["y2"], ["y'"]];
const frameMaps = frames.map(
  (rotation) =>
    new Map(
      outer.map((relative) => {
        const expected = stateKey(
          applyMoves(solvedCube(), [
            ...rotation,
            relative,
            ...inverse(rotation),
          ]),
        );
        return [
          outer.find(
            (actual) => stateKey(turn(solvedCube(), actual)) === expected,
          )!,
          relative,
        ];
      }),
    ),
);
export function teachingNotation(move: string, frame = 0) {
  if (/^[URFDLB]w(2|')?$/.test(move)) {
    const relative = frameMaps[frame]?.get(move.replace("w", ""));
    if (relative) return relative[0] + "w" + relative.slice(1);
  }
  return frameMaps[frame]?.get(move) || move;
}
export const teachingRotation = (frame: number) => frames[frame] || [];

const algorithms = [
  ["Sexy move · right-hand trigger", "右手四步（Sexy Move）", "R U R' U'"],
  ["Reverse right-hand trigger", "反向右手四步", "U R U' R'"],
  ["Right middle-edge insertion", "中层右插公式", "U R U' R' U' F' U F"],
  ["Left middle-edge insertion", "中层左插公式", "U' L' U L U F U' F'"],
  ["Yellow-cross algorithm", "黄色十字公式", "F R U R' U' F'"],
  ["Sune", "小鱼公式", "R U R' U R U2 R'"],
  [
    "Corner exchange · T permutation",
    "角块交换（T 公式）",
    "R U R' U' R' F R2 U' R' U' R U R' F'",
  ],
  [
    "Edge cycle · Ua permutation",
    "三棱循环（Ua 公式）",
    "R2 U R U R' U' R' U' R' U R'",
  ],
] as const;

export type AlgorithmCoaching = {
  caseKey?: string;
  instructions?: TutorialInstruction[];
  start: number;
  end: number;
  index: number;
  total: number;
  title: string;
  explanation: string;
  holding: string;
  algorithm: string[];
  nextMove: string;
  frame: number;
};

/** Explanation is computed from the BEGINNING of the complete block. It stays
 * identical as turns arrive; only its move cursor advances. Never describe a
 * case after the learner has departed from the validated guide. */
export function algorithmCoaching(
  step: GuidedSolveStep,
  faces: Record<string, string[]>,
  guideIndex: number,
  puzzle: GuidedPuzzle,
  locale: Locale,
  matched = true,
): AlgorithmCoaching | null {
  if (
    !matched ||
    !Number.isInteger(guideIndex) ||
    guideIndex < 0 ||
    guideIndex >= step.moves.length
  )
    return null;
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  let start = 0,
    index = 0;
  for (; index < step.blocks.length; index++) {
    if (start + step.blocks[index].length > guideIndex) break;
    start += step.blocks[index].length;
  }
  const block = step.blocks[index];
  if (!block?.length) return null;
  const beginning = practiceApply(
    guidedState(puzzle, faces),
    guidedInverse(puzzle, step.moves.slice(start, guideIndex)),
  );
  const goal = "layerGoal" in step ? step.layerGoal : step.goal;
  let frame = 0;
  let name: readonly string[] | undefined;
  let reversed = false;
  if (puzzle !== "pyraminx") {
    // A top setup belongs to the insertion that follows it.
    const reference =
      block.length === 1 && block[0][0] === "U"
        ? step.blocks.slice(index + 1).find((row) => row.length > 1) || block
        : block;
    for (let f = 0; f < 4 && !name; f++) {
      const relative = reference
        .map((move) => teachingNotation(move, f))
        .join(" ");
      for (const candidate of algorithms) {
        if (
          relative === candidate[2] ||
          relative === inverse(candidate[2].split(" ")).join(" ")
        ) {
          name = candidate;
          frame = f;
          reversed = relative !== candidate[2];
          break;
        }
      }
    }
  }
  const algorithm = block.map((move) => teachingNotation(move, frame));
  const colorNames: Record<string, string> =
    locale === "zh"
      ? { U: "白色", D: "黄色", F: "绿色", B: "蓝色", R: "红色", L: "橙色" }
      : {
          U: "white",
          D: "yellow",
          F: "green",
          B: "blue",
          R: "red",
          L: "orange",
        };
  let holding = t(
    "Keep the puzzle in the model’s orientation. Face letters name positions, not colors.",
    "按模型方向握持，面记号表示位置，而不是颜色。",
  );
  if (!isPyraminx(beginning)) {
    const shown = facelets(applyMoves(beginning, teachingRotation(frame)));
    holding =
      beginning.size === 3
        ? t(
            `Hold white underneath, ${colorNames[shown.F[4]]} center facing you and ${colorNames[shown.R[4]]} center on your right. ${frame ? "Turn the whole cube in your hands to match this view; do not twist a layer for this regrip." : "Match the model before starting."}`,
            `白色朝下，${colorNames[shown.F[4]]}中心朝前，${colorNames[shown.R[4]]}中心在右。${frame ? "请在手中转动整个魔方以匹配模型；换握持方向时不要单独拧某一层。" : "开始前先与模型方向一致。"}`,
          )
        : t(
            "Match the model’s top and front colors; this puzzle has no fixed centers. Regrip the whole puzzle to match the view, keeping white underneath during first-layer work.",
            "该魔方没有固定中心，请按模型的顶面、正面配色握持；需要时转动整个魔方来匹配视角，第一层练习时保持白色朝下。",
          );
  }
  const setup = block.length === 1;
  let title = setup
    ? t("Set up the piece", "准备目标块")
    : name
      ? (reversed ? t("Reverse algorithm · ", "逆公式 · ") : "") +
        name[locale === "zh" ? 1 : 0]
      : t("Setup · exchange · restore", "准备 · 交换 · 恢复");
  let explanation: string;
  if (goal === "corner" && !isPyraminx(beginning)) {
    const reference =
      beginning.size === 3
        ? facelets(beginning)
        : facelets(applyMoves(solvedCube(3), "z2"));
    const homes = ["DFR", "DLF", "DBL", "DRB"];
    const colors = homes[(step.target ?? 4) - 4]
      .split("")
      .map((f) => reference[f as keyof typeof reference][4]);
    const piece = beginning.stickers.filter((sticker) => {
      const group = beginning.stickers.filter((other) =>
        other.p.every((v, a) => v === sticker.p[a]),
      );
      return (
        group.length === 3 &&
        group.every((other) => colors.includes(other.color))
      );
    });
    const names = colors
      .map((color) => colorNames[color])
      .join(locale === "zh" ? "、" : ", ");
    const top = piece[0]?.p[1] === beginning.size - 1;
    const white = piece.find((sticker) => sticker.color === "U");
    const orientation =
      white?.normal[1] === 1
        ? t("upward", "朝上")
        : white?.normal[1] === -1
          ? t("downward", "朝下")
          : t("sideways", "朝侧面");
    explanation = setup
      ? t(
          `Find the ${names} corner. It is on the top layer, with white facing ${orientation}. Turn only U to put it directly above its matching bottom slot. The two side colors tell you which slot is correct; keep the completed cross underneath.`,
          `找到带有${names}的角块。它在顶层，白色贴片${orientation}。只转 U，将它移到对应底层槽位正上方；用另外两个侧色确定槽位，保持底面十字。`,
        )
      : name?.[2] === "R U R' U'" && !reversed
        ? top
          ? t(
              `The ${names} corner is above its home, with white facing ${orientation}. Keep that slot at the front-right. Use the sexy move R U R' U' as one complete algorithm. It moves and twists the corner while restoring the cross and other bottom corners. If it is not inserted yet, repeat the entire algorithm; do not stop halfway because the white face temporarily changes.`,
              `${names}角块已在目标位上方，白色贴片${orientation}。让这个槽位保持在前右方，完整执行右手四步 R U R' U'。它会移动并扭转角块，同时恢复十字及其他底角。尚未归位时重复整组，不要因为中途白色面变化而停下。`,
            )
          : t(
              `The ${names} corner is trapped in a bottom slot with the wrong position or twist. Bring that slot to the front-right as shown. Use R U R' U' once to lift it into the top layer. Then we can align it over its own home and insert it with the same algorithm.`,
              `${names}角块卡在底层，位置或朝向不正确。按模型让它所在的槽位位于前右方，完整执行一次 R U R' U'，将它取到顶层；随后对齐它真正的目标位，再用同一公式插入。`,
            )
        : t(
            "Use this complete insertion group to place the corner while restoring earlier work. Finish the group before checking its three colors.",
            "完整执行这组插角转动，使角块归位并恢复之前的部分。整组结束后检查三个颜色。",
          );
  } else {
    const reasons: Record<string, [string, string]> = {
      cross: [
        "Find the white edge and its other color. Match that color to its side center, then bring white underneath. Each setup turn prepares the next white edge; inspect all four side matches at the checkpoint.",
        "找到白棱及另一个侧色，使侧色对齐对应中心，再让白色朝下。每次准备转动都为下一条白棱就位；检查点需检查四个侧色。",
      ],
      middle: [
        "Find a top edge without yellow. Its two colors identify its home between two side centers. This insertion opens that slot, puts the edge in and restores the first layer. If an edge is trapped in the middle, use the complete insertion to lift it out first; the next setup will align it for its own slot.",
        "找到顶层不带黄色的棱，用两个颜色确定对应中心之间的目标位。这组插棱公式会打开槽位、放入棱块，再恢复第一层。若棱卡在错误中层槽位，先完整执行插棱公式取出，再按接下来的准备转动对齐真正目标位。",
      ],
      "yellow-cross": [
        "Look only at the four yellow top edges: dot, L, line or cross. Top setup turns position that pattern for this algorithm. F R U R' U' F' flips edges and restores the first two layers; corners can wait. Finish the full algorithm, then inspect the new pattern before repeating.",
        "只看四条顶棱的黄色：点、拐角、直线或十字。顶层准备转动将图案放到这次公式所需的位置。F R U R' U' F' 调整棱块朝向并恢复前两层，暂不处理角块。整组结束后观察新图案，再决定是否重复。",
      ],
      "yellow-face": [
        "The first layer is already complete. Inspect which last-layer corners show the top color. The Sune family twists corners while restoring the finished layers; their side positions are a later task. Use the exact algorithm shown, including its U2, and inspect only after the whole group.",
        "第一层已经完成，先看末层哪些角块的顶色朝上。小鱼系列公式调整角块朝向并恢复已完成层，侧面位置稍后处理。按所示整组公式执行，包括 U2，整组结束后再观察。",
      ],
      "corner-positions": [
        "The top color is complete; compare each corner’s side colors with its home. Top setup turns select the pair to exchange. Complete the corner-exchange algorithm to restore the finished layers. Edges may move here: they are handled next.",
        "顶色已经完成，请用角块侧色判断其目标位。顶层准备转动选定要交换的角块，完整执行换角公式以恢复已完成层。棱块可能随之移动，下一阶段再处理。",
      ],
      solved: [
        "Corners are in place. Follow the side colors of the remaining edges to see which way they need to cycle. This complete edge-cycle algorithm moves those edges and restores the corners and lower layers. Finish the group, then check all six faces.",
        "角块已归位，沿剩余棱的侧色判断需要循环移动的方向。完整三棱循环公式会移动这些棱并恢复角块及底层。整组完成后检查六个面。",
      ],
      "four-centers": [
        "Find the four centers of the target color. The setup places selected centers into an exchange; the closing inverse setup restores the other blocks. Learn this setup–exchange–restore structure and finish the entire group before checking saved centers.",
        "找到四个目标色中心。准备转动把选定中心送入交换，末尾的逆向准备转动恢复其他块。学习“准备—交换—恢复”结构，整组结束后再检查已完成中心。",
      ],
      "four-pair": [
        "Find the two wings with the same two colors. Setup moves bring them into the exchange, and the restore part returns the centers and earlier pairs. Keep wide and outer turns distinct and check both colors only after the entire group.",
        "找到配色相同的两个棱翼。准备转动将它们送入交换，恢复部分让中心和之前配棱归位。区分双层与外层转动，整组结束后再核对两侧颜色。",
      ],
      "four-even-wings": [
        "The wide turn followed by the reverse outer turn moves only an inner slice. This prepares the wing arrangement; centers will be rebuilt next. Treat the two moves as one preparation.",
        "双层转动后反向转最外层，合起来只改变内层。这是在准备棱翼排列，随后会重建中心，请把两步看作同一项准备。",
      ],
      "pyra-axial": [
        "Look at the three large triangles around this vertex. Turn the large vertex layer until those colors match the reference faces. Ignore the tiny tip until the next lesson.",
        "观察顶点周围三个较大三角，转动整个顶点层，使颜色对应参照面；最小尖角在下一课处理。",
      ],
      "pyra-tip": [
        "Match the tiny tip to the three neighboring axial colors. A lowercase move turns only the tip, preserving the larger pieces.",
        "将最小尖角与相邻三个轴心色块对应。小写记号只转尖角，不会改变较大块。",
      ],
      "pyra-base-edge": [
        "Identify this edge by both colors. The vertex-turn group moves the edge into the base and its reverse turns restore the axial pieces and tips. Finish the complete group before checking the base edges.",
        "用两个颜色确认目标棱。顶点转动组将它送入底面，反向转动恢复轴心和尖角；完整执行整组后再检查底棱。",
      ],
      "pyra-solved": [
        "Keep the completed base as the reference. These complete vertex-turn algorithms cycle the remaining edges while restoring axial pieces and tips. The base may move temporarily; check it after the whole algorithm.",
        "以完成的底面为参照。完整顶点转动公式循环调整剩余棱，并恢复轴心和尖角；底面可能暂时变化，整组结束后再检查。",
      ],
    };
    const reason = reasons[goal || step.goal] || reasons.solved;
    explanation = reason[locale === "zh" ? 1 : 0];
    if (puzzle === "2x2" && (goal === "solved" || goal === "corner-positions"))
      explanation = t(
        "Yellow is already on top. Find matching side-color corner pairs, then use the shown corner-exchange algorithm and top alignments to put every corner in its home. There are no edges or fixed centers on a 2×2. Finish the whole algorithm before checking the white layer and all side colors.",
        "黄色已朝上，观察侧色相同的角块对，再通过所示换角公式和顶层对齐，让每个角块回到目标位。二阶没有棱块或固定中心。完整执行公式后，再检查白色层和所有侧色。",
      );
    if (goal === "yellow-cross" && !isPyraminx(beginning)) {
      const shown = facelets(applyMoves(beginning, teachingRotation(frame))),
        n = beginning.size;
      const yellow = shown.U[Math.floor(n / 2) * n + Math.floor(n / 2)];
      const positions = [
        ["front", "前", (n - 1) * n + 1],
        ["right", "右", n + n - 1],
        ["back", "后", 1],
        ["left", "左", n],
      ] as const;
      const oriented = positions.filter((p) => shown.U[p[2]] === yellow);
      const pattern =
        oriented.length === 0
          ? t("a dot", "点形")
          : oriented.length === 4
            ? t("a cross", "十字")
            : oriented.length === 2 &&
                ((oriented[0][0] === "front" && oriented[1][0] === "back") ||
                  (oriented[0][0] === "right" && oriented[1][0] === "left"))
              ? t("a line", "直线")
              : t("an L", "拐角");
      explanation =
        t(
          `Your top edges show ${pattern}${oriented.length ? ` (yellow toward ${oriented.map((p) => p[0]).join(" and ")})` : ""}. `,
          `当前顶棱为${pattern}${oriented.length ? `（${oriented.map((p) => p[1]).join("、")}方黄色朝上）` : ""}。`,
        ) + explanation;
    }
    if (setup && goal !== "cross")
      explanation =
        t(
          "First make this setup turn so the pieces match the following algorithm’s working position. ",
          "先做这步准备，让目标块进入下一组公式的工作位置。",
        ) + explanation;
    if (puzzle === "pyraminx" && !setup)
      title = t("Vertex-turn algorithm", "顶点转动公式");
  }
  const holdingFaces = !isPyraminx(beginning)
    ? facelets(
        applyMoves(
          beginning.size === 3 ? beginning : applyMoves(solvedCube(3), "z2"),
          teachingRotation(frame),
        ),
      )
    : null;
  const instructions = tutorialInstructions({
    state: beginning,
    moves: block,
    displayMoves: algorithm,
    goal: goal || step.goal,
    target: step.target,
    title,
    holding,
    frame,
    locale,
    afterAlgorithm: start > 0,
    holdingColors: holdingFaces
      ? [holdingFaces.U[4], holdingFaces.F[4], holdingFaces.R[4]]
      : undefined,
  });
  return {
    caseKey: JSON.stringify([
      puzzle,
      goal || step.goal,
      step.target,
      instructions.find((i) => i.id === "colors")?.text,
      "wingTarget" in step ? step.wingTarget : null,
    ]),
    instructions,
    start,
    end: start + block.length,
    index,
    total: step.blocks.length,
    title,
    explanation,
    holding,
    algorithm,
    nextMove: teachingNotation(step.moves[guideIndex], frame),
    frame,
  };
}

/** Fixed authored drills teach their published explanation for the complete
 * sequence. A different turn suppresses the cursor until undo/reset restores
 * the prefix, including for physical confirmations and smart-cube telemetry. */
export function lessonAlgorithmCoaching(
  lesson: Lesson,
  moves: string[],
  locale: Locale,
  alternativeId?: string,
): AlgorithmCoaching | null {
  const option = lesson.alternatives?.find((row) => row.id === alternativeId);
  const algorithm = (option?.algorithm || lesson.algorithm).trim().split(/\s+/);
  if (
    moves.length >= algorithm.length ||
    !moves.every((move, i) => move === algorithm[i])
  )
    return null;
  const lessonGoal =
    lesson.caseFamily ||
    (
      {
        "3-notation": "notation",
        "3-cross": "cross",
        "3-corners": "corner",
        "3-middle": "middle",
        "3-yellow-cross": "yellow-cross",
        "3-sune": "OLL",
        "3-pll": "PLL",
        "3-f2l": "f2l",
        "3-two-look-oll": "OLL",
        "3-oll": "OLL",
        "3-full-pll": "PLL",
        "3-roux": "roux",
        "3-lookahead": "lookahead",
        "3-efficiency": "efficiency",
        "3-timed": "timed",
        "2-beginner": "corner-drill",
        "2-ortega": "orient-corners",
        "2-cll": "CLL",
        "4-reduction": "four-centers",
        "4-parity": "four-even-wings",
        "4-yau": "four-pair",
        "4-efficiency": "efficiency",
        "pyr-beginner": "pyra-axial",
        "pyr-intuitive": "pyra-base-edge",
        "pyr-last-layer": "pyra-solved",
      } as Record<string, string>
    )[lesson.id] ||
    lesson.id;
  const notationLesson = lessonGoal === "notation";
  const teachingAlgorithm = notationLesson
    ? [algorithm[moves.length]]
    : algorithm;
  return {
    caseKey: `${lesson.id}:${alternativeId || "default"}${notationLesson ? `:${moves.length}` : ""}`,
    instructions: tutorialInstructions({
      state: practiceApply(
        practiceSetup(lesson.puzzle, algorithm.join(" ")),
        notationLesson ? moves : [],
      ),
      moves: teachingAlgorithm,
      goal: lessonGoal,
      title: (option?.title || lesson.title)[locale],
      holding:
        locale === "zh"
          ? "将实物的顶面和正面配色与模型一致。"
          : "Match your puzzle’s top and front colors to the model.",
      frame: 0,
      locale,
      afterAlgorithm: notationLesson && moves.length > 0,
      holdingColors: lesson.puzzle === "pyraminx" ? undefined : ["U", "F", "R"],
    }),
    start: notationLesson ? moves.length : 0,
    end: notationLesson ? moves.length + 1 : algorithm.length,
    index: notationLesson ? moves.length : 0,
    total: notationLesson ? algorithm.length : 1,
    title: (option?.title || lesson.title)[locale],
    explanation: [
      lesson.summary[locale],
      ...(option?.steps || lesson.steps)[locale],
    ].join("\n\n"),
    holding:
      locale === "zh"
        ? "开始前，将实物握持方向与课程模型一致。执行整条公式时保持这个方向；面记号始终表示位置。"
        : "Before starting, hold your puzzle like the lesson model. Keep this orientation through the entire algorithm; face letters name positions.",
    algorithm: teachingAlgorithm,
    nextMove: algorithm[moves.length],
    frame: 0,
  };
}
