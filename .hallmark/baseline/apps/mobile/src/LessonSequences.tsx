import React from "react";
import type { Lesson } from "@cubers/core";
import { useApp } from "./state";
import { Card, Chip, Row, Txt } from "./ui";

export function LessonSequences({
  lesson,
  selected,
  onSelect,
  disabled = false,
}: {
  lesson: Lesson;
  selected?: string;
  onSelect: (id?: string) => void;
  disabled?: boolean;
}) {
  const { t, locale } = useApp();
  if (!lesson.alternatives?.length) return null;
  const option = lesson.alternatives.find((row) => row.id === selected);
  return (
    <Card>
      <Txt style={{ fontWeight: "700" }}>
        {t("Choose a practice sequence", "选择练习公式")}
      </Txt>
      <Txt small>
        {t(
          "Both sequences use the same starting model. Changing a virtual sequence restarts the drill. A saved physical practice keeps the guide it started with.",
          "两条公式采用相同起始模型。切换虚拟公式会重新开始练习；已保存的实物练习保留创建时选择的公式。",
        )}
      </Txt>
      <Row>
        <Chip
          label={t("Original composite", "原组合公式")}
          selected={!option}
          disabled={disabled}
          onPress={() => onSelect(undefined)}
        />
        {lesson.alternatives.map((row) => (
          <Chip
            key={row.id}
            label={`${row.title[locale]} · ${row.algorithm.split(" ").length}`}
            selected={option?.id === row.id}
            disabled={disabled}
            onPress={() => onSelect(row.id)}
          />
        ))}
      </Row>
      {option?.steps[locale].map((step, index) => (
        <Txt small key={index}>
          {step}
        </Txt>
      ))}
    </Card>
  );
}
