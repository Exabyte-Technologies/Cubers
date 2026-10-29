import type { Locale } from "./contracts";
import type {
  GuidedPuzzle,
  GuidedSolveStep,
  FirstSolveStep,
} from "./first-solve";
import { firstSolveTeaching } from "./first-solve-teaching";
import type { Face } from "./puzzle";
import { fourGuidedTeaching } from "./four-guided-teaching";
import type { FourSolveStep } from "./four-first-solve";
export function guidedTeaching(
  step: GuidedSolveStep,
  faces: Record<string, string[]>,
  locale: Locale,
  puzzle: GuidedPuzzle,
) {
  if (puzzle === "4x4")
    return fourGuidedTeaching(step as FourSolveStep, faces, locale);
  if (puzzle !== "pyraminx")
    return firstSolveTeaching(
      step as FirstSolveStep,
      faces as Record<Face, Face[]>,
      locale,
    );
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const frame = t(
    "Match the model: green reference face in front, red on the right, blue on the left and yellow below. U/L/R/B name the top, lower-left, lower-right and back vertices. Lowercase letters turn only the tiny tips; uppercase turns move the larger layer by 120 degrees.",
    "按模型握持：绿色参照面朝前、红色在右、蓝色在左、黄色在下。U/L/R/B 表示上方、左下、右下、后方四个顶点；小写只转尖角，大写转动较大的一层，每次为 120 度。",
  );
  const vertices = [
    t("top U", "上方 U"),
    t("lower-left L", "左下 L"),
    t("lower-right R", "右下 R"),
    t("back B", "后方 B"),
  ];
  if (step.goal === "pyra-axial")
    return {
      frame,
      title: t(
        `Align the axial pieces at ${vertices[step.target!]}`,
        `对齐${vertices[step.target!]}的轴心色块`,
      ),
      why: t(
        "Look at the three larger center triangles around this vertex, rather than its tiny tip. Turn the whole vertex layer to put these colors on their target faces. The tiny tip can wait; the earlier axial pieces stay aligned.",
        "观察这个顶点周围三个较大的轴心三角，而不是最小的尖角。转动整个顶点层，让这些颜色回到目标面；尖角稍后处理，之前对齐的轴心保持不变。",
      ),
      check: t(
        "These axial colors and the earlier checked axial pieces match the displayed reference faces. If already aligned, verify without adding turns.",
        "这些轴心色块及之前检查的轴心都符合展示的参照面；已经对齐时，可直接验证，无需额外转动。",
      ),
    };
  if (step.goal === "pyra-tip")
    return {
      frame,
      title: t(
        `Match the tiny tip at ${vertices[step.target!]}`,
        `对齐${vertices[step.target!]}的尖角`,
      ),
      why: t(
        "All axial pieces now define the color frame. Turn only this tiny tip to match its three neighboring colors. A lowercase turn leaves the larger pieces and earlier tips unchanged.",
        "所有轴心已经确定配色方向，现在只转动这个最小的尖角，让三个颜色与相邻色块一致。小写转动不会改变大块及之前完成的尖角。",
      ),
      check: t(
        "This tip and the earlier tips match their adjacent axial colors; all axial pieces remain aligned.",
        "这个尖角及之前的尖角都与相邻轴心颜色一致，所有轴心保持对齐。",
      ),
    };
  if (step.goal === "pyra-base-edge") {
    const colors = [
      t("green and yellow", "绿色与黄色"),
      t("blue and yellow", "蓝色与黄色"),
      t("red and yellow", "红色与黄色"),
    ][step.target! - 3];
    return {
      frame,
      title: t(
        `Place base edge ${step.target! - 2} of 3`,
        `放好第 ${step.target! - 2} 条底面棱`,
      ),
      why: t(
        `Find the edge with ${colors}; both colors identify its home. Four-turn groups turn two vertices and reverse them, restoring axial pieces and tips while moving edges. Earlier base edges may move temporarily: finish all groups for this stage before checking them.`,
        `找到带有${colors}的棱块，用两个颜色确定目标位。四步转动组先转动两个顶点，再反向恢复，使轴心和尖角归位，同时移动棱块。之前放好的底棱可能暂时离开，请完成本阶段全部转动组后再检查。`,
      ),
      check: t(
        "This base edge and every earlier checked base edge have matching side colors. All axial pieces and tips are aligned.",
        "这条底棱及之前检查过的底棱都与侧色对应，所有轴心和尖角也保持对齐。",
      ),
    };
  }
  if (step.goal !== "pyra-solved")
    throw new Error("This checkpoint is not a Pyraminx lesson");
  return {
    frame,
    title: t("Finish the remaining three edges", "完成剩余三条棱"),
    why: t(
      "The complete yellow base includes matching side colors. Follow the validated edge groups to finish the remaining pieces. The base can move during the sequence and returns when the entire stage finishes; avoid judging the result halfway through.",
      "完整的黄色底面也包括对应的侧色。按照经过验证的棱块转动组处理剩余块；底面在过程中可能暂时离开，整个阶段完成后会恢复，请不要在中途判断结果。",
    ),
    check: t(
      "All four triangular faces are one color. Check every edge, axial piece and tiny tip, including the underside.",
      "四个三角面均为同色。检查每条棱、每个轴心和尖角，包括底面。",
    ),
  };
}
