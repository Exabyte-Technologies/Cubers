import { z } from "zod";
import { scopedLessonOrder, lessonStage } from "./lesson-stage";
import { GuidedPuzzle } from "./first-solve";

const layerGoals = [
  "cross",
  "corner",
  "middle",
  "yellow-cross",
  "yellow-face",
  "corner-positions",
  "solved",
] as const;
const move = z.string().min(1).max(3);
const step = z
  .object({
    goal: z.enum([
      ...layerGoals,
      "pyra-axial",
      "pyra-tip",
      "pyra-base-edge",
      "pyra-solved",
      "four-even-wings",
      "four-centers",
      "four-pair",
      "four-layer",
    ]),
    target: z.number().int().min(0).max(11).optional(),
    layerGoal: z.enum(layerGoals).optional(),
    wingTarget: z.array(z.number().int().min(0).max(23)).length(24).optional(),
    cornerParity: z.number().int().min(0).max(1).optional(),
    moves: z.array(move).max(2500),
    blocks: z.array(z.array(move).min(1).max(2500)).max(500),
  })
  .strict();
const layers = (two: boolean) => [
  ...(!two ? [{ goal: "cross" }] : []),
  ...[4, 5, 6, 7].map((target) => ({ goal: "corner", target })),
  ...(!two ? [8, 9, 10, 11].map((target) => ({ goal: "middle", target })) : []),
  ...(!two ? [{ goal: "yellow-cross" }] : []),
  { goal: "yellow-face" },
  ...(!two ? [{ goal: "corner-positions" }] : []),
  { goal: "solved" },
];
function stageOrder(
  puzzle: GuidedPuzzle,
): { goal: string; target?: number; layerGoal?: string }[] {
  if (puzzle === "pyraminx")
    return [
      ...[0, 1, 2, 3].map((target) => ({ goal: "pyra-axial", target })),
      ...[0, 1, 2, 3].map((target) => ({ goal: "pyra-tip", target })),
      ...[3, 4, 5].map((target) => ({ goal: "pyra-base-edge", target })),
      { goal: "pyra-solved" },
    ];
  if (puzzle === "4x4")
    return [
      { goal: "four-even-wings" },
      ...Array.from({ length: 6 }, (_, target) => ({
        goal: "four-centers",
        target,
      })),
      ...Array.from({ length: 12 }, (_, target) => ({
        goal: "four-pair",
        target,
      })),
      ...layers(false).map((stage) => ({
        ...stage,
        goal: "four-layer",
        layerGoal: stage.goal,
      })),
    ];
  return layers(puzzle === "2x2");
}

// A bounded, frozen suffix of one server-validated plan. It grants no credit
// and contains no token, photograph, recording or user-authored text.
export const OfflineGuidedSnapshot = z
  .object({
    lessonId: z.string().max(80).optional(),
    sourceId: z.string().uuid(),
    sourceVersion: z.number().int().nonnegative(),
    puzzle: GuidedPuzzle,
    input: z.enum(["virtual", "scan"]),
    startingStage: z.number().int().min(0).max(31),
    startingFaces: z.record(z.array(z.string().length(1)).min(4).max(16)),
    steps: z.array(step).min(1).max(32),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const reject = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (
      snapshot.lessonId &&
      lessonStage(snapshot.lessonId)?.puzzle !== snapshot.puzzle
    )
      reject("Invalid lesson target");
    const order = scopedLessonOrder(
      stageOrder(snapshot.puzzle),
      snapshot.lessonId,
    ).slice(snapshot.startingStage);
    if (!order.length || order.length !== snapshot.steps.length)
      reject("Incomplete downloaded guidance suffix");
    const pattern =
      snapshot.puzzle === "pyraminx"
        ? /^[ULRBulrb]'?$/
        : snapshot.puzzle === "4x4"
          ? /^[URFDLB]w?(2|')?$/
          : /^[URFDLB](2|')?$/;
    let count = 0;
    snapshot.steps.forEach((current, index) => {
      const expected = order[index];
      if (
        !expected ||
        current.goal !== expected.goal ||
        current.target !== expected.target ||
        current.layerGoal !== expected.layerGoal
      )
        reject("Downloaded checkpoints do not match this method");
      if (current.goal === "four-pair") {
        if (
          !current.wingTarget ||
          new Set(current.wingTarget).size !== 24 ||
          current.cornerParity === undefined
        )
          reject("Missing downloaded wing reference");
      } else if (
        current.wingTarget !== undefined ||
        current.cornerParity !== undefined
      )
        reject("Unexpected downloaded wing reference");
      count += current.moves.length;
      if (!current.moves.every((value) => pattern.test(value)))
        reject("Downloaded turns do not match this puzzle");
      if (
        JSON.stringify(current.blocks.flat()) !== JSON.stringify(current.moves)
      )
        reject("Downloaded turn groups do not match the sequence");
    });
    if (count > (snapshot.puzzle === "4x4" ? 2500 : 500))
      reject("Downloaded guidance exceeds its turn budget");
    const faces =
      snapshot.puzzle === "pyraminx"
        ? ["D", "F", "L", "R"]
        : ["B", "D", "F", "L", "R", "U"];
    const size =
      snapshot.puzzle === "pyraminx" ? 9 : Number(snapshot.puzzle[0]) ** 2;
    if (
      Object.keys(snapshot.startingFaces).sort().join() !== faces.join() ||
      Object.values(snapshot.startingFaces).some((row) => row.length !== size)
    )
      reject("Downloaded faces do not match this puzzle");
  });
export type OfflineGuidedSnapshot = z.infer<typeof OfflineGuidedSnapshot>;
