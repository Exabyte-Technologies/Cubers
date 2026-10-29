import React, { useState } from "react";
import { View } from "react-native";
import {
  PYRA_FACES,
  PYRA_COLORS,
  pyraminxFromFacelets,
  validatePyraminx,
  type PyraFace,
  type PyraColor,
  type PyraminxState,
} from "@cubers/core";
import { FacePhoto } from "./FacePhoto";
import { PyraminxNet } from "./PyraminxView";
import { Card, Row, Button, Txt, Notice } from "./ui";
import { useApp } from "./state";
import type { TriangularSample } from "./scan";
const orientations = {
  F: [
    "Top U; lower left L; lower right R. This is the green reference face.",
    "上顶点 U、左下 L、右下 R。这是绿色参照面。",
  ],
  R: [
    "Top U; lower left R; lower right B. This is the red reference face.",
    "上顶点 U、左下 R、右下 B。这是红色参照面。",
  ],
  L: [
    "Top U; lower left B; lower right L. This is the blue reference face.",
    "上顶点 U、左下 B、右下 L。这是蓝色参照面。",
  ],
  D: [
    "View the underside: top B; lower left R; lower right L. This is the yellow reference face.",
    "观察底面：上顶点 B、左下 R、右下 L。这是黄色参照面。",
  ],
} as const;
export function PyraminxScanner({
  onState,
  externalCapture,
}: {
  onState: (state: PyraminxState) => void;
  externalCapture?: () => Promise<string>;
}) {
  const { t } = useApp(),
    [index, setIndex] = useState(0),
    [faces, setFaces] = useState<Partial<Record<PyraFace, PyraColor[]>>>({});
  const [samples, setSamples] = useState<TriangularSample[]>([]),
    [message, setMessage] = useState("");
  const face = PYRA_FACES[index],
    reference: PyraColor = face === "L" ? "B" : face;
  function accept() {
    const next = { ...faces, [face]: samples.map((sample) => sample.color) };
    setFaces(next);
    setSamples([]);
    setMessage("");
    const missing = PYRA_FACES.findIndex((key) => !next[key]);
    if (missing !== -1) {
      setIndex(missing);
      return;
    }
    try {
      const state = pyraminxFromFacelets(next as Record<PyraFace, PyraColor[]>),
        result = validatePyraminx(state);
      if (!result.valid) throw new Error(result.reason);
      onState(state);
    } catch (error) {
      setMessage(
        (error as Error).message ||
          t("Check all four faces.", "请核对四个面。"),
      );
    }
  }
  return (
    <Card>
      <Txt style={{ fontSize: 20, fontWeight: "700" }}>
        {t("Scan four triangular faces", "扫描四个三角面")} · {face}
      </Txt>
      <Txt small>{t(orientations[face][0], orientations[face][1])}</Txt>
      <Txt small>
        {t(
          "Keep the triangle upright inside the guide. Colors use the green/red/blue/yellow scheme. Photos stay on your device and are deleted after recognition; only checked color values are sent for verification.",
          "将三角面正放在取景框内，使用绿、红、蓝、黄配色。照片仅在本机识别后删除，只有核对后的颜色数据会发送用于检查。",
        )}
      </Txt>
      <FacePhoto onSamples={setSamples} externalCapture={externalCapture} />
      <Button
        kind="secondary"
        label={t("Enter this face manually", "手动输入这一面")}
        onPress={() =>
          setSamples(
            (faces[face] || Array<PyraColor>(9).fill(reference)).map(
              (color) => ({ color, confidence: 1, rgb: [0, 0, 0] }),
            ),
          )
        }
      />
      {!!samples.length && (
        <>
          <Txt small>
            {t(
              "Tap each triangle to change its color. Check all nine stickers; uncertain samples are listed below.",
              "点击三角色块修改颜色。请核对九块贴片，下方会列出识别不确定的贴片。",
            )}
          </Txt>
          <View style={{ alignItems: "center" }}>
            <PyraminxNet
              size={60}
              colors={samples.map((sample) => sample.color)}
              onSticker={(i) =>
                setSamples((previous) =>
                  previous.map((sample, j) =>
                    i === j
                      ? {
                          ...sample,
                          confidence: 1,
                          color:
                            PYRA_COLORS[
                              (PYRA_COLORS.indexOf(sample.color) + 1) % 4
                            ],
                        }
                      : sample,
                  ),
                )
              }
            />
          </View>
          {samples.some((sample) => sample.confidence < 0.45) && (
            <Notice
              text={t(
                `Check stickers: ${samples.flatMap((sample, i) => (sample.confidence < 0.45 ? [i + 1] : [])).join(", ")}`,
                `请重点核对贴片：${samples.flatMap((sample, i) => (sample.confidence < 0.45 ? [i + 1] : [])).join("、")}`,
              )}
            />
          )}
          <Button
            label={t("Confirm this face", "确认这一面")}
            onPress={accept}
          />
        </>
      )}
      <Row>
        {PYRA_FACES.map((key, i) => (
          <Button
            key={key}
            small
            kind="secondary"
            label={`${faces[key] ? "✓ " : ""}${key}`}
            onPress={() => {
              setIndex(i);
              setSamples(
                faces[key]?.map((color) => ({
                  color,
                  confidence: 1,
                  rgb: [0, 0, 0],
                })) || [],
              );
            }}
          />
        ))}
      </Row>
      {!!message && <Notice text={message} error />}
    </Card>
  );
}
