import React from "react";
import { router } from "expo-router";
import {
  LessonStageAdvice,
  lessons,
  lessonStage,
  GUIDED_COURSE_IDS,
} from "@cubers/core";
import { useApp } from "./state";
import { Notice, Button, Card, Txt } from "./ui";
export function LessonStageNotice({
  advice,
  input,
  beforeNavigate,
}: {
  advice: LessonStageAdvice;
  input: string;
  beforeNavigate?: () => Promise<unknown>;
}) {
  const { t, locale } = useApp(),
    target = lessons.find((row) => row.id === advice.actualLessonId);
  return (
    <Card>
      <Notice
        error
        text={
          advice.reason === "prerequisite"
            ? t(
                "Your cube is not ready for this lesson yet.",
                "当前魔方尚未达到这节课的前置条件。",
              )
            : t(
                "Your cube has already completed this lesson’s target.",
                "当前魔方已经完成了这节课的目标。",
              )
        }
      />
      <Txt>
        {target
          ? t(
              `Your current step: ${target.title.en}`,
              `你当前的阶段：${target.title.zh}`,
            )
          : t(
              "Your cube is solved. Choose a prepared practice setup to revisit this lesson.",
              "魔方已经还原，可以选择课程预设状态重新练习。",
            )}
      </Txt>
      {target &&
        (lessonStage(target.id) ||
          (GUIDED_COURSE_IDS as readonly string[]).includes(target.id)) && (
          <Button
            label={t("Open the matching lesson", "前往对应课程")}
            onPress={() =>
              void (async () => {
                await beforeNavigate?.();
                router.replace({
                  pathname: "/lesson/[id]",
                  params: { id: target.id, input },
                });
              })()
            }
          />
        )}
    </Card>
  );
}
