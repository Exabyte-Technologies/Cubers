import React, { useState } from "react";
import { View } from "react-native";
import { solvedCube, applyMoves, facelets } from "@cubers/core";
import { ScanOverlay } from "../ScanOverlay";
import { scanTurnInstruction } from "../scan-turn-geometry";
import { Button, Chip, Heading, Row, Screen, Txt, useTheme } from "../ui";
import { useApp } from "../state";

/** Developer-only inspection of the actual scanner overlay, without camera
 * permissions, synthetic capture, saved progress or a network request. */
export function ScanTurnReview({
  size,
  close,
}: {
  size: 2 | 3 | 4;
  close: () => void;
}) {
  const { t } = useApp(),
    c = useTheme();
  const [step, setStep] = useState(0),
    [replay, setReplay] = useState(0);
  const instruction = scanTurnInstruction(step);
  const colors = facelets(applyMoves(solvedCube(size), "R U F2 L D")).F;
  return (
    <Screen>
      <Button
        kind="secondary"
        label={t("Close turn preview", "关闭转动预览")}
        onPress={close}
      />
      <Heading>{t("Scan turn preview", "扫描转动预览")}</Heading>
      <Txt>
        {t(
          "Sample cube colors. Pale faces are unknown, not a scan of your cube.",
          "示例魔方颜色，浅色面表示尚未知晓，并非你的魔方扫描结果。",
        )}
      </Txt>
      <Row>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Chip
            key={index}
            label={t(`Turn ${index + 1}`, `转动 ${index + 1}`)}
            selected={step === index}
            onPress={() => setStep(index)}
          />
        ))}
      </Row>
      <Txt>{t(instruction.en, instruction.zh)}</Txt>
      <View
        key={`${size}-${step}-${replay}`}
        style={{
          width: "100%",
          aspectRatio: 1,
          backgroundColor: c.field,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <ScanOverlay
          preview={{
            size,
            turnIndex: step,
            phase: "turning",
            faceColors: colors,
          }}
        />
      </View>
      <Button
        kind="secondary"
        label={t("Replay turn", "重播转动")}
        onPress={() => setReplay((value) => value + 1)}
      />
    </Screen>
  );
}
