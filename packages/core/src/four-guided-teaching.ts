import type { Locale } from "./contracts";
import {
  FOUR_CENTER_ORDER,
  FOUR_CENTER_COLORS,
  FOUR_CENTER_FACES,
  FOUR_WING_COLORS,
  FOUR_PAIR_SLOTS,
  type FourSolveStep,
} from "./four-first-solve";
import { EDGE_PIECES } from "./first-solve";
import { firstSolveTeaching } from "./first-solve-teaching";
import { solvedCube, applyMoves, facelets, type Face } from "./puzzle";
export function fourGuidedTeaching(
  step: FourSolveStep,
  faces: Record<string, string[]>,
  locale: Locale,
) {
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const colors: Record<Face, string> =
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
  const frame = t(
    "A 4×4 has no fixed centers. Keep the displayed top/front reference through all scans. The target is white below, yellow above and green in front. Rw turns both right layers; R turns only the outer layer. Finish a complete exchange group before checking earlier work.",
    "四阶没有固定中心，六面扫描请保持展示的顶面、正面参照。目标方向是白色在下、黄色在上、绿色朝前。Rw 转动右侧两层，R 只转最外层；完成一整组交换转动后，再检查之前的部分。",
  );
  if (step.goal === "four-even-wings")
    return {
      frame,
      title: t("Prepare the wing arrangement", "准备棱翼排列"),
      why: t(
        "Some valid 4×4 positions need an extra inner-layer change before pairing. If shown, make the two turns together: the wide turn followed by the opposite outer turn moves just the inner layer. Center colors may change now; we rebuild them next. If no turn is needed, continue after checking the model.",
        "部分合法四阶状态在配棱前需要一次额外的内层调整。若显示两步，请连续完成：先转两层，再反向转最外层，合起来只改变内层。中心颜色此时可能变化，接下来会重新整理；不需要转动时，核对模型后继续。",
      ),
      check: t(
        "The server has verified a reachable wing arrangement for the coming reduction. This is preparation, not a solved face.",
        "服务器已验证后续降阶可处理的棱翼排列。这是准备步骤，并不代表某个面已经还原。",
      ),
    };
  if (step.goal === "four-centers") {
    const face = FOUR_CENTER_ORDER[step.target!],
      color = colors[FOUR_CENTER_COLORS[FOUR_CENTER_FACES.indexOf(face)]];
    return {
      frame,
      title: t(`Build the ${color} center block`, `拼好${color}中心块`),
      why: t(
        `Find the four ${color} center stickers. Setup turns bring three chosen centers into an exchange, then undo the setup. A whole group moves only those centers; previously completed center blocks return after each group.`,
        `找到四个${color}中心贴片。准备转动会将选中的三个中心带入交换，再撤回准备转动；整组结束后只改变这三个中心，之前完成的中心块也会恢复。`,
      ),
      check: t(
        "These four center stickers occupy the shown face, and every earlier center block is complete. Side wings and corners do not need to match yet.",
        "这四个中心贴片位于展示的目标面，之前的中心块也保持完成。此时棱翼和角块不必已经对应。",
      ),
    };
  }
  if (step.goal === "four-pair") {
    const slot = FOUR_PAIR_SLOTS[step.target!][0],
      identity = step.wingTarget![slot],
      names = FOUR_WING_COLORS[identity]
        .map((color) => colors[color])
        .join(locale === "zh" ? "、" : " and ");
    return {
      frame,
      title: t(
        `Pair edge ${step.target! + 1} of 12`,
        `配好第 ${step.target! + 1} 组棱，共十二组`,
      ),
      why: t(
        `Find the two small wings with ${names}. The guide brings them together at ${EDGE_PIECES[step.target!]}. Setup, exchange and restore groups preserve completed centers and earlier pairs when each group finishes. Their final alignment with side centers comes during the 3×3 stage.`,
        `找到带有${names}的两个小棱翼，指导会把它们配到 ${EDGE_PIECES[step.target!]} 位置。完成每一组“准备、交换、恢复”后，中心块和之前的配棱都会保持完成；它们与侧面中心的最终对应会在三阶阶段处理。`,
      ),
      check: t(
        "Both wings have matching colors on both sides, in the displayed position. All centers and previously checked pairs remain complete.",
        "两个棱翼的两侧颜色都一致，并处于展示的位置。所有中心及之前检查的配棱保持完成。",
      ),
    };
  }
  if (step.goal !== "four-layer" || !step.layerGoal)
    throw new Error("Invalid 4×4 teaching stage");
  const reduced = applyMoves(solvedCube(3), "z2");
  const teaching = firstSolveTeaching(
    {
      goal: step.layerGoal,
      target: step.target,
      moves: step.moves,
      blocks: step.blocks,
    },
    facelets(reduced),
    locale,
  );
  return {
    ...teaching,
    frame:
      t(
        "Centers and wing pairs now behave as a 3×3. Use only outer-layer turns from here; preserve each pair. ",
        "中心和配棱现在组成一个三阶结构。从这里开始只转最外层，并保持每组配棱。",
      ) + teaching.frame,
  };
}
