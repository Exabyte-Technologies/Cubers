import { ConflictException } from "@nestjs/common";
import { lessonStageAdvice, type PracticeState } from "@cubers/core";
export function requireLessonStage(state: PracticeState, lessonId: string) {
  const advice = lessonStageAdvice(state, lessonId);
  if (advice)
    throw new ConflictException({
      code: "LESSON_STAGE_MISMATCH",
      message:
        advice.reason === "prerequisite"
          ? "This cube needs an earlier lesson first."
          : "This lesson target is already complete on this cube.",
      lessonStage: advice,
    });
}
