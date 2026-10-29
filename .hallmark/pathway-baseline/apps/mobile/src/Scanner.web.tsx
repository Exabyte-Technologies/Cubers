import { puzzleRenderPalette } from "./design/tokens";
import React, { useState } from "react";
import { View, Pressable } from "react-native";
import {
  FACES,
  COLORS,
  fromFacelets,
  validateScan,
  type Face,
  type CubeState,
} from "@cubers/core";
import { useApp } from "./state";
import { Button, Card, Txt, Notice, Row } from "./ui";
import { scanInstructions } from "./scan";
export function Scanner({
  size,
  onState,
}: {
  size: 2 | 3 | 4;
  onState: (s: CubeState) => void;
  externalCapture?: () => Promise<string>;
}) {
  const { t, locale } = useApp(),
    [index, setIndex] = useState(0),
    [message, setMessage] = useState(""),
    [faces, setFaces] = useState<Record<Face, Face[]>>(
      () =>
        Object.fromEntries(
          FACES.map((f) => [f, Array(size * size).fill(f)]),
        ) as Record<Face, Face[]>,
    ),
    face = FACES[index];
  return (
    <Card>
      <Txt style={{ fontWeight: "700", fontSize: 20 }}>
        {t("Enter your puzzle colors", "输入实物魔方颜色")} · {face}
      </Txt>
      <Notice
        text={t(
          "Camera recognition is available in native development builds. This browser view supports manual correction.",
          "相机识别需要原生开发版。浏览器中可以手动输入和校正颜色。",
        )}
      />
      <Txt small>{scanInstructions(size, face)[locale]}</Txt>
      <Row>
        {FACES.map((f, i) => (
          <Button
            small
            key={f}
            label={f}
            kind={i === index ? "primary" : "secondary"}
            onPress={() => setIndex(i)}
          />
        ))}
      </Row>
      <View
        style={{
          width: size * 60,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 4,
        }}
      >
        {faces[face].map((color, i) => (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`Sticker ${i + 1}: ${color}`}
            onPress={() =>
              setFaces((prev) => ({
                ...prev,
                [face]: prev[face].map((p, j) =>
                  j === i ? FACES[(FACES.indexOf(p) + 1) % 6] : p,
                ),
              }))
            }
            style={{
              backgroundColor: COLORS[color],
              width: 56,
              height: 56,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: puzzleRenderPalette.cameraBorder,
            }}
          >
            <Txt
              style={{
                color: puzzleRenderPalette.cameraInk,
                fontWeight: "700",
              }}
            >
              {color}
            </Txt>
          </Pressable>
        ))}
      </View>
      <Button
        label={
          index < 5
            ? t("Next face", "下一面")
            : t("Validate starting state", "验证起始状态")
        }
        onPress={() => {
          if (index < 5) {
            setIndex(index + 1);
            return;
          }
          const state = fromFacelets(size, faces),
            r = validateScan(state);
          if (r.valid) {
            onState(state);
            setMessage(
              t(
                "Starting state recorded. Use confirmation and rescans at checkpoints.",
                "已记录起始状态，请在检查点确认并重新扫描。",
              ),
            );
          } else setMessage(r.reason || "Invalid state");
        }}
      />
      {!!message && <Notice text={message} />}
    </Card>
  );
}
