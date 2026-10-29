import { z } from "zod";
import { Puzzle } from "./contracts";
const Bilingual = z
  .object({ en: z.string().min(1).max(1600), zh: z.string().min(1).max(1600) })
  .strict();
export const DiscoveryStory = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,59}$/),
    version: z.literal(1),
    kind: z.enum(["idea", "activity"]),
    puzzle: Puzzle,
    title: Bilingual,
    summary: Bilingual,
    paragraphs: z.array(Bilingual).min(2).max(6),
    activity: Bilingual,
    actions: z
      .array(
        z
          .object({ courseId: z.string().min(1).max(100), title: Bilingual })
          .strict(),
      )
      .max(3),
  })
  .strict();
export type DiscoveryStoryView = z.infer<typeof DiscoveryStory>;
export const DiscoveryResponse = z
  .object({ items: z.array(DiscoveryStory).max(12) })
  .strict();
type AuthoredStory = Omit<DiscoveryStoryView, "actions"> & {
  courseIds: string[];
};
/** Original Cubers teaching, with no fabricated people, engagement or claimed history. */
export const discoveryStories: AuthoredStory[] = [
  {
    id: "one-turn-at-a-time",
    version: 1,
    kind: "activity",
    puzzle: "3x3",
    title: {
      en: "Four moves. Something to notice.",
      zh: "四步转动，发现一点新东西。",
    },
    summary: {
      en: "You can start exploring a cube before you know how to solve it.",
      zh: "还不会还原，也能开始探索魔方。",
    },
    paragraphs: [
      {
        en: "Pick one corner and follow its three stickers. A face turn moves several pieces together. What looked like a wall of colors becomes a set of pieces with places to go.",
        zh: "选中一个角块，跟着它的三个色块一起看。转动一面会同时带动好几块；原本像一片颜色的表面，就变成了各有去处的小块。",
      },
      {
        en: "The notation lesson supplies a starting state and a short sequence: R U R′ U′. Read R from the right face's point of view and U from the top face's point of view. A prime reverses a turn. Four moves are a practice sequence, not a formula for solving every scramble.",
        zh: "转动记号课提供起始状态和一段短序列：R U R′ U′。读 R 时正对右面，读 U 时正对顶面，撇号表示反向。这四步是练习序列，并不是解决所有打乱的通用公式。",
      },
      {
        en: "Slow the demonstration down, watch one move and use Undo to compare. Noticing where a piece came from is useful progress even before a complete solve.",
        zh: "放慢演示，观察一步，再用撤销比较。即使还没完成一次还原，看懂一个块从哪里来，也是进步。",
      },
    ],
    activity: {
      en: "In the notation lesson, follow one corner through the first turn, undo it, then try the supplied four-move exercise. There is no timer or separate challenge score.",
      zh: "打开转动记号课，跟踪一个角块的第一步变化，撤销后再尝试课程提供的四步练习。这里不计时，也没有额外的挑战分数。",
    },
    courseIds: ["3-notation", "3-first-solve"],
  },
  {
    id: "more-than-one-color",
    version: 1,
    kind: "idea",
    puzzle: "2x2",
    title: {
      en: "One color is only part of the story.",
      zh: "拼好一种颜色，只是故事的一部分。",
    },
    summary: {
      en: "A 2×2 is a small place to discover how corners belong together.",
      zh: "小小的二阶，适合认识角块之间的关系。",
    },
    paragraphs: [
      {
        en: "A 2×2 has corners without fixed center pieces. Each corner carries three colors. A white face can look finished while the side colors around it still disagree.",
        zh: "二阶只有角块，没有固定的中心块。每个角块带着三种颜色。白色一面看起来可能拼好了，周围的侧色却还没对齐。",
      },
      {
        en: "Try reading a corner as a three-color name. Its home must match all three neighboring faces. Keep the same top and front reference while comparing the pieces; rotating the whole puzzle changes your view rather than solving a corner by itself.",
        zh: "试着把三种颜色一起当作这个角块的名字。它的目标位置要与相邻三个面的颜色相符。比较时保持同一套顶面、正面参照；整体转动魔方只是改变观察方向，不会单独把一个角块还原。",
      },
      {
        en: "The first-solve guide builds a layer with matching sides, then works on the remaining corners. You can use a virtual puzzle or start from a physical scan. A scan is a snapshot; physical checkpoints need a fresh scan.",
        zh: "完整还原指导会先完成侧色也匹配的一层，再处理剩余角块。可以使用虚拟魔方，也可以从实物扫描开始。扫描只记录当时状态，实物检查点仍须重新扫描。",
      },
    ],
    activity: {
      en: "Open the 2×2 guide. Before checking the first layer, look at its four side-color pairs as well as the face. Let the guide verify the actual state.",
      zh: "打开二阶指导。检查第一层前，除了顶面颜色，也看看周围四组侧色，再让指导验证实际状态。",
    },
    courseIds: ["2-first-solve"],
  },
  {
    id: "a-tip-is-a-small-start",
    version: 1,
    kind: "activity",
    puzzle: "pyraminx",
    title: {
      en: "A tiny tip can be a good first step.",
      zh: "从一个小尖角，迈出第一步。",
    },
    summary: {
      en: "Meet a puzzle with four triangular faces and two sizes of turn.",
      zh: "认识四个三角面，分清大小两种转动。",
    },
    paragraphs: [
      {
        en: "The smallest Pyraminx tips can turn on their own. A larger turn around the same vertex also moves the layer below. The notation keeps them distinct: lowercase for a tip, uppercase for the larger turn.",
        zh: "金字塔魔方最小的尖角可以单独转动。绕同一顶点做较大的转动，还会带动下面一层。记号用小写表示尖角，用大写表示较大的转动。",
      },
      {
        en: "Compare a tip's three colors with the neighboring center colors. One small adjustment can make that local pattern agree. This introduces one part of the puzzle; matching tips alone does not solve its edges.",
        zh: "把尖角的三种颜色与相邻中心颜色比较。一次小调整，就能让这一小片图案对齐。这只是认识魔方的一部分；尖角对齐，并不代表棱块也已还原。",
      },
      {
        en: "The introductory exercise starts with only the tips misaligned. The complete guide can instead start from a general valid scramble and walks through centers, tips, a base and remaining edges.",
        zh: "入门练习的起始状态只有尖角没有对齐。完整还原指导则可以从一般的合法打乱出发，依次处理轴心、尖角、底面和剩余棱块。",
      },
    ],
    activity: {
      en: "Try the supplied tip exercise. Say whether a move is a tip or a whole vertex layer before turning, then compare the adjacent colors. No complete-solve claim is made for this short exercise.",
      zh: "试试课程提供的尖角练习。转动前先说出这是尖角还是整个顶点层，再比较相邻颜色。这段小练习不代表已经掌握完整还原。",
    },
    courseIds: ["pyr-beginner", "pyra-first-solve"],
  },
  {
    id: "a-bigger-puzzle-in-parts",
    version: 1,
    kind: "idea",
    puzzle: "4x4",
    title: {
      en: "A bigger puzzle, one part at a time.",
      zh: "更大的魔方，也可以分步来。",
    },
    summary: {
      en: "Centers, paired edges, then familiar outer turns.",
      zh: "先拼中心、配棱，再做熟悉的外层转动。",
    },
    paragraphs: [
      {
        en: "A 4×4 has no single fixed center on each face. Four center pieces form a color block, and two wing pieces make each paired edge. Reduction gives these smaller parts a useful structure before the outer-layer solve.",
        zh: "四阶的每个面都没有单独固定的中心。四个中心块组成一块颜色区域，两个小棱块配成一组棱。降阶先把这些小块组织起来，再处理外层还原。",
      },
      {
        en: "Some legal 4×4 states look unusual when treated as a 3×3. They need puzzle-specific handling; they are not automatically evidence of a bad scan. Correct uncertain colors first and use the full 4×4 validator.",
        zh: "一些合法四阶状态，在按三阶看待时会显得特殊，需要用四阶的方法处理，不能直接判定为扫描出错。先修正不确定的颜色，再使用完整的四阶状态校验。",
      },
      {
        en: "Cubers' complete guide uses dependable preparation, exchanges and restoration steps. It favors clear checkpoints rather than the fewest turns. With a physical puzzle, confirming turns predicts a state; fresh scans check it.",
        zh: "Cubers 的完整指导使用明确的准备、交换和恢复步骤，优先保证检查点清楚可靠，而不是追求最少转数。使用实物时，确认转动用于推算，重新扫描才用于检查状态。",
      },
    ],
    activity: {
      en: "Open the 4×4 guide and focus on its first center milestone. Finish each displayed preparation/exchange/restore group before judging what changed. A milestone is one step toward the whole solve.",
      zh: "打开四阶指导，先专注于第一个中心阶段。完成展示的整组准备、交换与恢复，再观察变化。一个阶段只是完整还原中的一步。",
    },
    courseIds: ["4-first-solve"],
  },
];
/** Publication is resolved by the regional backend, not embedded client claims. */
export function publishedDiscovery(
  courses: { id: string; title: unknown }[],
): DiscoveryStoryView[] {
  const byId = new Map(courses.map((c) => [c.id, c]));
  return discoveryStories.map(({ courseIds, ...story }) =>
    DiscoveryStory.parse({
      ...story,
      actions: courseIds.flatMap((courseId) => {
        const course = byId.get(courseId),
          title = course && Bilingual.safeParse(course.title);
        return title?.success ? [{ courseId, title: title.data }] : [];
      }),
    }),
  );
}
