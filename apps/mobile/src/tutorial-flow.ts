import type { AlgorithmCoaching } from "@cubers/core";
export type TutorialFlow = {
  coaching: AlgorithmCoaching;
  index: number;
  key: string;
  cursor: number;
  seen: string[];
};
export function registerTutorial(
  previous: TutorialFlow | null,
  coaching: AlgorithmCoaching | null,
  cursor: number,
): TutorialFlow | null {
  if (!coaching?.instructions?.length) return null;
  const key = JSON.stringify([
    coaching.caseKey,
    coaching.start,
    coaching.instructions,
  ]);
  if (previous?.key === key && previous.cursor === cursor) return previous;
  if (previous?.key === key && cursor >= previous.cursor)
    return {
      ...previous,
      cursor,
      index:
        cursor > coaching.start
          ? previous.coaching.instructions!.findIndex(
              (i) => i.kind === "perform",
            )
          : previous.index,
      coaching: { ...coaching, instructions: previous.coaching.instructions },
    };
  const sameCase =
    !!previous &&
    previous.coaching.caseKey === coaching.caseKey &&
    !!coaching.caseKey &&
    cursor >= previous.cursor;
  const seen = sameCase ? previous.seen : [];
  const established = new Set(["objective", "inspect", "colors", "home"]);
  const instructions =
    cursor > coaching.start
      ? coaching.instructions.filter((i) => i.kind === "perform")
      : coaching.instructions.filter(
          (i) =>
            !(
              seen.includes(i.id) &&
              (established.has(i.id) ||
                (i.id === "holding" &&
                  previous?.coaching.frame === coaching.frame))
            ),
        );
  return {
    coaching: { ...coaching, instructions },
    key,
    cursor,
    seen,
    index: 0,
  };
}
export function advanceTutorial(
  flow: TutorialFlow | null,
): TutorialFlow | null {
  if (!flow) return null;
  return {
    ...flow,
    seen: [
      ...new Set([
        ...flow.seen,
        flow.coaching.instructions?.[flow.index].id || "",
      ]),
    ],
    index: Math.min(
      flow.index + 1,
      (flow.coaching.instructions?.length || 1) - 1,
    ),
  };
}
