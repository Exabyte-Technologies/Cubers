import type { Locale } from "./contracts";
import { EDGE_PIECES, CORNER_PIECES, type FirstSolveStep } from "./first-solve";
import { facelets, applyMoves, solvedCube, type Face } from "./puzzle";
export function firstSolveTeaching(
  step: FirstSolveStep,
  faces: Record<Face, Face[]>,
  locale: Locale,
) {
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const colors: Record<Face, string> =
    locale === "zh"
      ? { U: "白色", R: "红色", F: "绿色", D: "黄色", L: "橙色", B: "蓝色" }
      : {
          U: "white",
          R: "red",
          F: "green",
          D: "yellow",
          L: "orange",
          B: "blue",
        };
  const piece =
    step.goal === "corner"
      ? CORNER_PIECES[step.target!]
      : step.goal === "middle"
        ? EDGE_PIECES[step.target!]
        : "";
  const two = faces.U.length === 4;
  const scheme = two ? facelets(applyMoves(solvedCube(3), "z2")) : faces;
  const targetColors = piece
    .split("")
    .map((face) => colors[scheme[face as Face][4]])
    .join(locale === "zh" ? "、" : ", ");
  if (two) {
    const frame = t(
      "There are no centers. Keep the same top/front reference as the scan and model. The finished target has white below, yellow above and green in front; face letters name positions.",
      "二阶没有中心，请保持与扫描和模型相同的顶面、正面参照。完成后的目标是白色在下、黄色在上、绿色朝前，面记号始终表示位置。",
    );
    if (step.goal === "corner") {
      const home = [
        t("bottom, front and right", "底面、前面和右面"),
        t("bottom, front and left", "底面、前面和左面"),
        t("bottom, back and left", "底面、后面和左面"),
        t("bottom, back and right", "底面、后面和右面"),
      ][step.target! - 4];
      return {
        frame,
        title: t(
          `Place white corner ${step.target! - 3} of 4`,
          `放好第 ${step.target! - 3} 个白色角块`,
        ),
        why: t(
          `Find the corner with ${targetColors}. Its home is where the ${home} meet. Bring the working slot to the front-right as shown, align the corner above its home with U, then use the sexy move R U R' U'. Repeat the complete four moves as needed; the other white corners return after each complete trigger.`,
          `找到带有${targetColors}的角块，目标位在${home}相交的位置。按模型让工作槽位位于前右方，用 U 把角块对齐到目标上方，再用右手四步 R U R' U' 插入。需要时重复完整四步，整组后其他白角会恢复。`,
        ),
        check: t(
          "This corner and the earlier white corners match the target color frame. After four corners, check the side colors as well as the white face.",
          "这个角块及之前的白角都符合目标配色方向。四个角块完成后，不仅要看白色面，还要检查侧色。",
        ),
      };
    }
    if (step.goal === "yellow-face")
      return {
        frame,
        title: t("Orient the last yellow corners", "调整最后黄色角块的朝向"),
        why: t(
          "The first layer is complete, including its side colors. Use the short corner groups to bring yellow to the top while restoring that layer. Corner positions are checked afterward.",
          "第一层及其侧色已经完成。通过短角块转动组让黄色朝上，并恢复第一层，随后再检查角块的位置。",
        ),
        check: t(
          "The whole top is yellow and the complete white layer is preserved. A 2×2 has no edge-orientation step.",
          "整个顶面均为黄色，完整的白色层保持不变。二阶不需要处理棱块朝向。",
        ),
      };
    return {
      frame,
      title: t("Put the last corners in place", "完成最后的角块位置"),
      why: t(
        "Yellow is on top, but the side colors may be misplaced. Follow the corner exchange groups and final top alignment; the white layer returns after every complete group.",
        "黄色已朝上，但侧色仍可能错位。按指导完成角块交换组及顶层对齐，完整转动组结束后，白色层会恢复。",
      ),
      check: t(
        "All six faces are one color. The shown target has white below and green in front. Check all sides, not just the top.",
        "六个面均恢复同色，展示的目标为白色在下、绿色朝前。请检查各个侧面，而不只是顶面。",
      ),
    };
  }
  const common = t(
    "Keep white down, yellow up and green facing you. R/U/F name positions, not colors. Drag the view to inspect the bottom; check a layer after a complete short group.",
    "保持白色朝下、黄色朝上、绿色朝前。R/U/F 表示位置，不固定代表某种颜色。可拖动画面观察底面，完成一整组短转动后再检查各层。",
  );
  const content = {
    cross: {
      title: t("Build the white cross", "拼好白色十字"),
      why: t(
        "Each white edge has a second color. Match that side color to its center. The guide may reposition more than one edge before the cross is ready.",
        "白色棱块都有另一个颜色，要让侧色与对应中心对齐。指导过程中可能先调整几条棱，再完成整个十字。",
      ),
      check: t(
        "Four white edges are on the bottom and all four side colors match their centers.",
        "四条白棱都在底面，四个侧色也与各自中心对应。",
      ),
    },
    corner: {
      title: t(
        `Place white corner ${step.target! - 3} of 4`,
        `放好第 ${step.target! - 3} 个白色角块`,
      ),
      why: t(
        `Find the corner with ${targetColors}; its three colors identify its home. Hold the working slot at the front-right, align the top corner above it, then use the sexy move R U R' U'. A trapped corner is lifted first with the same trigger. Repeat complete triggers until it fits; the cross and other bottom corners return after each group.`,
        `找到带有${targetColors}的角块，用三个颜色确定目标槽位。让工作槽位位于前右方，把顶层角块对齐到槽位上方，再执行右手四步 R U R' U'。若角块卡在底层，先用同一公式取出。重复完整转动组直到归位，每组结束后十字和其他底角会恢复。`,
      ),
      check: t(
        "This corner and all previously checked white corners match their side centers. Keep the white cross intact.",
        "这个角块及之前检查过的白角都与侧面中心对应，白色十字也保持完成。",
      ),
    },
    middle: {
      title: t(
        `Place middle edge ${step.target! - 7} of 4`,
        `放好第 ${step.target! - 7} 条中层棱`,
      ),
      why: t(
        `Find the edge with ${targetColors}; it has no yellow sticker. Match it to its two side centers. Insertion groups open a slot, place the edge and restore the white layer.`,
        `找到带有${targetColors}的棱块，它不含黄色。让它对应两个侧面中心；插棱转动组会打开槽位、放入棱块，再恢复白色层。`,
      ),
      check: t(
        "The white layer remains solved. This middle edge and previously checked middle edges match both side centers.",
        "白色层仍然完整，这条中层棱及之前检查过的中层棱都与两个侧面中心对应。",
      ),
    },
    "yellow-cross": {
      title: t("Orient the yellow edges", "让黄色棱块朝上"),
      why: t(
        "Look only at the four top edges: you may see a dot, an L, a line or a cross. Corner colors are not the goal yet. The short groups turn the edges while restoring the first two layers.",
        "先只看顶面的四条棱，可能出现点、拐角、直线或十字，此时先不处理角块顶色。短转动组会调整棱块朝向，并恢复前两层。",
      ),
      check: t(
        "All four top edges show yellow upward; the first two layers stay solved.",
        "顶面四条棱的黄色都朝上，前两层保持完成。",
      ),
    },
    "yellow-face": {
      title: t("Orient the yellow corners", "让黄色角块朝上"),
      why: t(
        "The yellow cross is ready. Now use the corner groups to bring yellow to the top. Side colors may still be misplaced; that is handled in the next stages.",
        "黄色十字已经完成，现在通过角块转动组，让黄色全部朝上。侧色此时仍可能错位，接下来的阶段会处理位置。",
      ),
      check: t(
        "The entire top face is yellow, and the first two layers remain solved.",
        "整个顶面同为黄色，前两层仍然完整。",
      ),
    },
    "corner-positions": {
      title: t("Put the top corners in their homes", "让顶层角块回到各自位置"),
      why: t(
        "A corner's side colors must sit between the matching centers. Use the checked corner exchange groups; top edges can move during this stage.",
        "角块的两个侧色应位于对应的中心之间。按指导完成角块交换组；这一阶段顶层棱的位置可能随之改变。",
      ),
      check: t(
        "Every top corner matches its three centers. Yellow stays on top and the first two layers stay solved.",
        "每个顶层角块都与三个中心对应，黄色仍朝上，前两层保持完成。",
      ),
    },
    solved: {
      title: t("Finish the last edges", "完成最后的棱块位置"),
      why: t(
        "The corners are in place. Cycle the remaining top edges with the short groups while keeping everything else restored. Finish the complete group, then check every face.",
        "角块已经归位，接着用短转动组循环调整剩余顶棱，同时恢复其他部分。整组完成后，再核对每一个面。",
      ),
      check: t(
        "All six faces are one color and every side aligns. Check the whole cube, not just the top.",
        "六个面都恢复同色，各个侧面也对齐。请检查整个魔方，而不只是顶面。",
      ),
    },
  }[step.goal];
  return { ...content, frame: common };
}
