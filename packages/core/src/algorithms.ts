import data from "./algorithm-cases.json";
import shorter from "./algorithm-alternatives.json";
import type { Lesson } from "./curriculum";
import { stateKey, type CubeState } from "./puzzle";
import {
  algorithmPermutation,
  canonicalShape,
  permuteColors,
  preservesFirstLayers,
  shapeKey,
  solvedColors,
  type AlgorithmFamily,
} from "./algorithm-shapes";
export type AlgorithmCase = {
  id: string;
  family: AlgorithmFamily;
  puzzle: "2x2" | "3x3";
  pattern: string;
  representative: string;
  algorithm: string;
};
export const algorithmCases = data.families.flatMap(
  (family) => family.cases,
) as AlgorithmCase[];
export type RecognizedCase = {
  entry: AlgorithmCase;
  before: string[];
  algorithm: string[];
  after: string[];
  target: "oriented" | "solved";
};
const auf: string[][] = [[], ["U"], ["U2"], ["U'"]];
export function caseFirstLayersComplete(
  state: CubeState,
  family: AlgorithmFamily,
) {
  return (
    state.size === (family === "CLL" ? 2 : 3) &&
    preservesFirstLayers(stateKey(state), family)
  );
}
// Recognition assumes the displayed white-up, green-front reference frame and
// completed lower layers. It does not claim to solve arbitrary cube states.
export function recognizeAlgorithmCase(
  state: CubeState,
  family: AlgorithmFamily,
): RecognizedCase | null {
  const size = family === "CLL" ? 2 : 3;
  if (state.size !== size) return null;
  const colors = stateKey(state);
  if (!preservesFirstLayers(colors, family)) return null;
  if (
    family === "PLL" &&
    !colors
      .slice(0, 9)
      .split("")
      .every((color) => color === "U")
  )
    return null;
  const pattern = canonicalShape(colors, family),
    entry = algorithmCases.find(
      (candidate) =>
        candidate.family === family && candidate.pattern === pattern,
    );
  if (!entry) return null;
  for (const before of auf) {
    const prepared = permuteColors(
      colors,
      algorithmPermutation(size, before.join(" ")),
    );
    if (
      family === "OLL" &&
      shapeKey(prepared, family) !== shapeKey(entry.representative, family)
    )
      continue;
    const result = permuteColors(
      prepared,
      algorithmPermutation(size, entry.algorithm),
    );
    if (family === "OLL") {
      if (
        result.slice(0, 9) !== "U".repeat(9) ||
        !preservesFirstLayers(result, family)
      )
        continue;
      return {
        entry,
        before,
        algorithm: entry.algorithm.split(" "),
        after: [],
        target: "oriented",
      };
    }
    for (const after of auf) {
      if (
        permuteColors(result, algorithmPermutation(size, after.join(" "))) ===
        solvedColors(size)
      )
        return {
          entry,
          before,
          algorithm: entry.algorithm.split(" "),
          after,
          target: "solved",
        };
    }
  }
  return null;
}
export const algorithmLessons: Lesson[] = algorithmCases.map((entry) => {
  const orient = entry.family === "OLL",
    corners = entry.family === "CLL",
    number = Number(entry.id.split("-").at(-1));
  const alternative = shorter.entries.find(
    (row) =>
      row.lessonId === entry.id &&
      row.baselineAlgorithm === entry.algorithm &&
      row.puzzle === entry.puzzle &&
      row.family === entry.family,
  );
  return {
    id: entry.id,
    puzzle: entry.puzzle,
    level: "advanced",
    caseFamily: entry.family,
    algorithm: entry.algorithm,
    ...(alternative
      ? {
          alternatives: [
            {
              id: "shorter-v1",
              title: { en: "Fewer-turn alternative", zh: "更少转动的备选公式" },
              algorithm: alternative.algorithm,
              steps: {
                en: [
                  `Use the same starting model and white-up, green-front reference. This sequence uses ${alternative.algorithm.split(" ").length} outer face turns instead of ${entry.algorithm.split(" ").length}; a half turn counts once.`,
                  "Read the whole sequence before turning, including any back, left or bottom turns. Follow the next-turn demonstration slowly and check all six faces at the end.",
                  "The shorter sequence solves this same representative. Fewer turns do not prove easier finger tricks, greater speed or a globally shortest algorithm. The original composite remains available.",
                ],
                zh: [
                  `使用相同起始模型，保持白色朝上、绿色朝前。本序列使用 ${alternative.algorithm.split(" ").length} 次外层转动，原序列为 ${entry.algorithm.split(" ").length} 次；半转计为一次。`,
                  "转动前先读完整个公式，留意后面、左面或底面的转动。慢慢跟随下一步演示，结束后检查全部六个面。",
                  "这条备选公式可还原同一起始例。转动更少不代表指法更容易、速度更快或公式全局最短，仍可选择原来的组合练习。",
                ],
              },
            },
          ],
        }
      : {}),
    minutes: 8,
    title: {
      en: `${entry.family} · Cubers case ${number}`,
      zh: `${entry.family} · Cubers 情况 ${number}`,
    },
    summary: {
      en: orient
        ? "Recognize the upper-face pattern and orient the last layer."
        : corners
          ? "Recognize and solve the four last-layer corners."
          : "Recognize the last-layer permutation and align every side.",
      zh: orient
        ? "识别顶面图案，完成最后一层朝向。"
        : corners
          ? "识别并复原最后一层的四个角块。"
          : "识别最后一层排列，对齐每个侧面。",
    },
    steps: {
      en: [
        corners
          ? "Keep the completed first layer on the bottom. Hold white up and green toward you in this reference exercise."
          : "Keep the completed first two layers on the bottom. Hold white up and green toward you in this reference exercise.",
        orient
          ? "Look at all upper-color stickers on the top and upper side rows. Their positions identify the orientation case; the side colors may still need PLL afterward."
          : "Compare the upper side rows with the side centers or completed bottom layer. Identify matching pairs and each piece's destination before turning.",
        "This is an original composite drill built from validated familiar triggers. Cubers case IDs are not standard case numbers, and the sequence is not advertised as an optimal speed algorithm.",
        "Use the displayed inverse setup, practice slowly and verify the solved representative. On other equivalent cases, adjust the upper face first; PLL/CLL may also need a final upper-face adjustment.",
      ],
      zh: [
        corners
          ? "将已完成的第一层保持在底部。本例采用白色朝上、绿色朝前的参照方向。"
          : "将已完成的前两层保持在底部。本例采用白色朝上、绿色朝前的参照方向。",
        orient
          ? "观察顶面及侧面上排的所有顶色贴片，根据位置识别朝向情况。完成后，侧面排列可能仍需 PLL。"
          : "将侧面上排与中心块或已完成底层对比，先判断匹配色对及各块的目标位置。",
        "这是用已验证的常见转动组合生成的原创练习。Cubers 情况编号不对应通行编号，本公式也不作为最优速拧公式宣传。",
        "按展示的逆公式起始状态慢慢练习，验证本例还原结果。遇到同类其他状态时，需要先调整顶面；PLL／CLL 结束后也可能需要再调整顶面。",
      ],
    },
  };
});
