import React, { useLayoutEffect, useEffect } from "react";
import { View, ScrollView } from "react-native";
import type { AlgorithmCoaching } from "@cubers/core";
import { Txt, Button, useTheme } from "./ui";
import { useApp } from "./state";
import { useTutorialLayout } from "./useTutorialLayout";
import { useTutorial } from "./TutorialContext";

export function AlgorithmCoach({
  coaching,
  cursor,
  notice,
  fallback,
  externalAction = false,
  onAction,
  disabled = false,
}: {
  coaching: AlgorithmCoaching | null;
  cursor: number;
  notice?: string;
  fallback?: string;
  externalAction?: boolean;
  onAction?: () => void;
  disabled?: boolean;
}) {
  const { t } = useApp(),
    c = useTheme(),
    layout = useTutorialLayout(),
    tutorial = useTutorial();
  useLayoutEffect(() => {
    tutorial.register(coaching, cursor);
  }, [coaching, cursor, tutorial.register]);
  useEffect(() => () => tutorial.register(null, 0), [tutorial.register]);
  if (!coaching && !fallback) return null;
  const instruction = tutorial.instruction || coaching?.instructions?.[0];
  const performing = instruction?.kind === "perform";
  return (
    <View
      style={{
        gap: 8,
        padding: layout.compact ? 12 : 16,
        height: layout.largeText
          ? undefined
          : layout.compact
            ? layout.coachingHeight
            : 260,
        minHeight: 0,
        borderRadius: 20,
        backgroundColor: c.softBlue,
        borderWidth: 1,
        borderColor: c.line,
      }}
    >
      <ScrollView
        key={instruction?.id}
        scrollEnabled={!tutorial.focused}
        nestedScrollEnabled
        style={{ flex: layout.largeText ? undefined : 1, minHeight: 0 }}
      >
        <Txt
          accessibilityLiveRegion="polite"
          style={{
            fontSize: layout.compact ? 17 : 21,
            lineHeight: layout.compact ? 24 : 29,
          }}
        >
          {instruction?.text || fallback || coaching?.title}
        </Txt>
      </ScrollView>
      {performing && coaching && (
        <>
          <ScrollView
            horizontal
            scrollEnabled={!tutorial.focused}
            style={{ flexGrow: 0 }}
            accessibilityLabel={t("Complete algorithm", "完整公式")}
          >
            <Txt
              selectable
              style={{ fontSize: 23, lineHeight: 32, fontWeight: "700" }}
            >
              {coaching.algorithm.map((move, i) => (
                <Txt
                  key={i}
                  style={{
                    fontSize: 23,
                    color: coaching.start + i === cursor ? c.blue : c.ink,
                    textDecorationLine:
                      coaching.start + i === cursor ? "underline" : "none",
                  }}
                >
                  {move}
                  {i + 1 < coaching.algorithm.length ? "  " : ""}
                </Txt>
              ))}
            </Txt>
          </ScrollView>
          <Txt small>
            {t(`Next: ${coaching.nextMove}`, `下一步：${coaching.nextMove}`)}
          </Txt>
        </>
      )}
      {!!notice && !instruction && <Txt small>{notice}</Txt>}
      {!externalAction && performing && onAction && (
        <Button
          tutorialAction
          label={t("I’ve made this turn", "我已转动这一步")}
          onPress={onAction}
          disabled={disabled}
        />
      )}
      {!externalAction && instruction && instruction.kind !== "perform" && (
        <Button
          tutorialAction
          label={t("Next", "下一步")}
          onPress={tutorial.next}
        />
      )}
    </View>
  );
}
