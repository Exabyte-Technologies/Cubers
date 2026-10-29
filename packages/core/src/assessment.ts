import { z } from "zod";
import { Puzzle, type Locale } from "./contracts";
export type AssessmentText = Record<Locale, string>;
const text = (en: string, zh: string): AssessmentText => ({ en, zh });
export type AssessmentStage = {
  id: string;
  lessonId: string;
  title: AssessmentText;
  question: AssessmentText;
  choices: AssessmentText[];
  correct: number;
  explanation: AssessmentText;
  algorithms: string[];
};
const stage = (
  id: string,
  lessonId: string,
  title: AssessmentText,
  question: AssessmentText,
  choices: AssessmentText[],
  correct: number,
  explanation: AssessmentText,
  algorithms: string[],
): AssessmentStage => ({
  id,
  lessonId,
  title,
  question,
  choices,
  correct,
  explanation,
  algorithms,
});
export const ASSESSMENT_VERSION = "2026-10-16.1";
export const assessmentDefinitions: Record<Puzzle, AssessmentStage[]> = {
  "3x3": [
    stage(
      "notation",
      "3-notation",
      text("Read a turn", "读懂转动"),
      text(
        "From which view is an R turn clockwise?",
        "判断 R 的顺时针方向时，应正对哪个面？",
      ),
      [
        text("Looking directly at the right face", "正对右面"),
        text("Always looking at the front face", "始终正对前面"),
        text("Looking down from above", "始终从上向下看"),
      ],
      0,
      text(
        "Each face turn is read while looking directly at that face. The cube keeps the same holding frame.",
        "判断各面的转向时，要想象正对那个面观察，同时保持魔方的握持方向。",
      ),
      ["R", "U'", "F2"],
    ),
    stage(
      "pair",
      "3-f2l",
      text("Connect a pair", "理解一组角棱"),
      text(
        "In intuitive F2L, what belongs in one slot?",
        "直观 F2L 中，一个槽位需要放入什么？",
      ),
      [
        text("Any two yellow pieces", "任意两个黄色块"),
        text(
          "A matching corner and middle-layer edge",
          "颜色对应的角块与中层棱块",
        ),
        text("Two center pieces", "两个中心块"),
      ],
      1,
      text(
        "A matching corner and edge form a pair. Insert it into its slot while preserving completed pairs.",
        "角块与对应的棱块组成一对，放入目标槽位时要保护已完成的其他角棱对。",
      ),
      ["U R U' R'", "R U R' U'"],
    ),
    stage(
      "orientation",
      "3-oll",
      text("Recognize the next stage", "判断下一阶段"),
      text(
        "After F2L, the top face has one color but side pieces are misplaced. What remains?",
        "F2L 完成后，顶面已经同色，但侧面的块还没对齐，还需要做什么？",
      ),
      [
        text("Orient every top piece again", "重新调整所有顶层块的朝向"),
        text("Break the first two layers", "拆开前两层"),
        text("Permute and align the last layer", "调整最后一层的位置并对齐"),
      ],
      2,
      text(
        "Orientation gives the top its color. Permutation puts those pieces in their correct positions; a final U alignment may also be needed.",
        "定向让顶面同色，换位让各块回到正确位置，最后还可能需要转动 U 层对齐。",
      ),
      ["Rw U R' U' Rw' F R F'", "R2 U R U R' U' R' U' R' U R'"],
    ),
  ],
  "2x2": [
    stage(
      "frame",
      "2-beginner",
      text("Find your frame", "确定观察方向"),
      text(
        "A 2×2 has no centers. How can you name its faces consistently?",
        "二阶没有中心块，怎样保持各面名称一致？",
      ),
      [
        text(
          "Keep a chosen color frame while turning",
          "确定配色方向，转动时保持这一方向",
        ),
        text("Rename the front after every move", "每转一步就重命名前面"),
        text("Use edge centers", "寻找棱块中心"),
      ],
      0,
      text(
        "Use the corner colors to choose a frame, then keep it consistent. Whole-puzzle rotation changes your view.",
        "根据角块配色确定方向，并保持一致；整体旋转会改变观察视角。",
      ),
      ["R", "U'", "F2"],
    ),
    stage(
      "layer",
      "2-ortega",
      text("Check a layer", "检查第一层"),
      text(
        "What distinguishes a solved layer from a face of one color?",
        "完整的一层与仅仅同色的一个面有什么区别？",
      ),
      [
        text("Nothing; they are always the same", "没有区别，两者总是一样"),
        text(
          "A layer also has matching side colors",
          "完整一层的侧面颜色也要对应",
        ),
        text("A layer needs center pieces", "完整一层必须有中心块"),
      ],
      1,
      text(
        "A face can have one color while its corners are permuted incorrectly. Check the side colors before treating the layer as solved.",
        "一个面同色时，角块的位置仍可能不对；确认一层完成前，还要检查侧面配色。",
      ),
      ["R U R' U'", "U R U' R'"],
    ),
    stage(
      "cll",
      "2-cll",
      text("Keep what is solved", "保护已完成部分"),
      text(
        "What does a CLL case solve while preserving the first layer?",
        "CLL 在保护第一层的同时，解决哪一部分？",
      ),
      [
        text("The centers", "中心块"),
        text("The missing edges", "不存在的棱块"),
        text(
          "Last-layer corner orientation and permutation",
          "最后一层角块的朝向与位置",
        ),
      ],
      2,
      text(
        "CLL handles the last-layer corners together after a solved first layer. Read both top and side colors to recognize a case.",
        "完成第一层后，CLL 一起处理最后一层角块的朝向与位置；识别时要同时看顶色与侧色。",
      ),
      ["R U R' U R U2 R'", "R U2 R' U' R U' R'"],
    ),
  ],
  "4x4": [
    stage(
      "wide",
      "4-reduction",
      text("Read a wide turn", "认识宽层转动"),
      text(
        "What does Rw turn on a 4×4 in Cubers notation?",
        "Cubers 记号中，四阶的 Rw 转动哪些层？",
      ),
      [
        text("The two rightmost layers together", "最右侧两层一起转"),
        text("Only the right outer face", "仅最右侧外层"),
        text("The whole cube", "整个魔方"),
      ],
      0,
      text(
        "Rw is a two-layer wide turn. It differs from R, which turns only the outer layer.",
        "Rw 表示右侧两层一起转，与仅转动外层的 R 不同。",
      ),
      ["Rw", "Uw'", "Fw2"],
    ),
    stage(
      "reduction",
      "4-yau",
      text("Prepare for reduction", "准备降阶"),
      text(
        "Before using a 3×3 method after reduction, what needs to be built?",
        "四阶降阶后使用三阶方法前，要先完成什么？",
      ),
      [
        text("Only one solid face", "只完成一个同色面"),
        text("Six centers and twelve paired edges", "六组中心和十二组配对棱"),
        text("Eight identical corners", "八个相同的角块"),
      ],
      1,
      text(
        "Build the centers in the correct color scheme and pair the wings into twelve edges. Parity may still need a 4×4-specific step.",
        "按正确配色完成中心，再把棱块配成十二组；之后仍可能需要四阶专用的特殊情况处理。",
      ),
      ["Rw U2 Rw'", "Rw U Rw'"],
    ),
    stage(
      "parity",
      "4-parity",
      text("Understand parity", "理解特殊情况"),
      text(
        "One paired edge appears flipped after legal 4×4 reduction. What does that tell you?",
        "四阶通过合法转动降阶后，有一组配对棱看起来翻转了，这说明什么？",
      ),
      [
        text("Every such scan is impossible", "这种扫描一定不合法"),
        text("A 3×3 move must always fix it", "一定能仅用三阶转动解决"),
        text("It can be a legal 4×4 parity case", "这可能是四阶的合法特殊情况"),
      ],
      2,
      text(
        "A reduced 4×4 can have parity that a normal 3×3 cannot. Validate the physical state before selecting the matching parity procedure.",
        "降阶后的四阶可能出现普通三阶不会出现的特殊情况；应先验证状态，再选择对应处理方法。",
      ),
      ["Rw2 B2 U2 Lw U2 Rw' U2 Rw U2 F2 Rw F2 Lw' B2 Rw2"],
    ),
  ],
  pyraminx: [
    stage(
      "tips",
      "pyr-beginner",
      text("Separate tips and layers", "区分尖角与主层"),
      text(
        "How does lowercase u differ from uppercase U?",
        "小写 u 与大写 U 有什么区别？",
      ),
      [
        text(
          "u turns only the tip; U turns a main layer",
          "u 仅转尖角，U 转动主层",
        ),
        text("They are identical", "两者完全一样"),
        text("u means a half turn", "u 表示半圈"),
      ],
      0,
      text(
        "Lowercase letters turn tips independently. Main-layer turns and tip turns are both 120° moves in this notation.",
        "小写字母表示独立的尖角转动；此处尖角与主层的基本转动均为 120°。",
      ),
      ["u", "l'", "r b'"],
    ),
    stage(
      "edges",
      "pyr-intuitive",
      text("Read an edge", "观察棱块"),
      text(
        "Which colors identify a Pyraminx edge's home?",
        "哪些颜色能帮助判断金字塔棱块的目标位置？",
      ),
      [
        text("Only one sticker", "只看一个贴片"),
        text(
          "Both stickers and their adjacent faces",
          "两个贴片与对应的相邻面",
        ),
        text("A hidden center sticker", "隐藏的中心贴片"),
      ],
      1,
      text(
        "Use both edge colors to match adjacent faces. Preserve a completed base while placing the remaining edges.",
        "根据棱块的两个颜色对应相邻面，插入其他棱块时注意保护已完成的底层。",
      ),
      ["R U R'", "L' U' L"],
    ),
    stage(
      "last-layer",
      "pyr-last-layer",
      text("Verify the finish", "检查是否完成"),
      text(
        "The main puzzle is solved but a tip is twisted. What remains?",
        "金字塔主层已经完成，但有一个尖角没对齐，还需要做什么？",
      ),
      [
        text("Rebuild all edges", "重新拼全部棱块"),
        text("Ignore it; the puzzle is finished", "忽略它，已经全部完成"),
        text("Align that independent tip", "对齐这个独立尖角"),
      ],
      2,
      text(
        "Tips turn independently, but they still belong in a completed puzzle. Check all four faces and tips before finishing.",
        "尖角虽然独立转动，仍属于完整还原的一部分；结束前要检查四个面及所有尖角。",
      ),
      ["R U R' U R U R'", "L' U' L U' L' U' L"],
    ),
  ],
};
export const AssessmentAnswer = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("submit"),
      version: z.number().int().min(0),
      optionId: z.enum(["a", "b", "c"]),
      moves: z.array(z.string().max(8)).max(300),
    })
    .strict(),
  z
    .object({ kind: z.literal("skip"), version: z.number().int().min(0) })
    .strict(),
]);
export const StartAssessment = z.object({ puzzle: Puzzle }).strict();
export type AssessmentTask = {
  id: string;
  lessonId: string;
  title: AssessmentText;
  question: AssessmentText;
  choices: { id: "a" | "b" | "c"; text: AssessmentText }[];
  setup: string[];
  correctOptionId: "a" | "b" | "c";
  explanation: AssessmentText;
};
export type AssessmentResult = {
  taskId: string;
  kind: "submit" | "skip";
  optionId?: string;
  moves: string[];
  knowledge: boolean;
  puzzle: boolean;
  passed: boolean;
};
export type AssessmentView = {
  id: string;
  puzzle: Puzzle;
  status: string;
  version: number;
  definitionVersion: string;
  createdAt: string;
  expiresAt: string;
  finishedAt: string | null;
  total: number;
  current: Omit<
    AssessmentTask,
    "correctOptionId" | "explanation" | "lessonId"
  > | null;
  feedback: {
    title: AssessmentText;
    question: AssessmentText;
    correctAnswer: AssessmentText;
    explanation: AssessmentText;
    knowledge: boolean;
    puzzle: boolean;
    skipped: boolean;
    lessonId: string;
  }[];
};
export type LearningPlan = {
  puzzle: Puzzle;
  queue: { lessonId: string; reason: "review" | "placement" | "next" }[];
  activeAssessmentId: string | null;
  assessment: {
    id: string;
    completedAt: string;
    checksPassed: number;
    total: number;
  } | null;
};
