import React from "react";
import type { Puzzle, PracticeState } from "@cubers/core";
import { Scanner } from "./Scanner";
import { PyraminxScanner } from "./PyraminxScanner";
export function PuzzleScanner({
  puzzle,
  onState,
  externalCapture,
}: {
  puzzle: Puzzle;
  onState: (state: PracticeState) => void;
  externalCapture?: () => Promise<string>;
}) {
  return puzzle === "pyraminx" ? (
    <PyraminxScanner onState={onState} externalCapture={externalCapture} />
  ) : (
    <Scanner
      size={Number(puzzle[0]) as 2 | 3 | 4}
      onState={onState}
      externalCapture={externalCapture}
    />
  );
}
