import React, { useRef, useState } from "react";
import { View, Platform, Pressable } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCameraFormat,
} from "react-native-vision-camera";
import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import jpeg from "jpeg-js";
import {
  FACES,
  COLORS,
  fromFacelets,
  validateScan,
  type Face,
  type CubeState,
} from "@cubers/core";
import { sampleGrid, scanInstructions, type Sample } from "./scan";
import { useApp } from "./state";
import { Txt, Notice, Button, Row, Card, useTheme } from "./ui";
export function Scanner({
  size,
  onState,
  externalCapture,
}: {
  size: 2 | 3 | 4;
  onState: (s: CubeState) => void;
  externalCapture?: () => Promise<string>;
}) {
  const { t, locale } = useApp(),
    device = useCameraDevice("back"),
    format = useCameraFormat(device, [
      { photoResolution: { width: 1600, height: 1200 } },
    ]),
    permission = useCameraPermission(),
    camera = useRef<Camera>(null),
    c = useTheme(),
    [index, setIndex] = useState(0),
    [faces, setFaces] = useState<Partial<Record<Face, Face[]>>>({}),
    [samples, setSamples] = useState<Sample[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const face = FACES[index];
  async function capture() {
    if (!camera.current && !externalCapture) return;
    setBusy(true);
    try {
      const p = externalCapture
        ? { path: await externalCapture() }
        : await camera.current!.takePhoto({ flash: "off" });
      const normalized = await manipulateAsync(
        `file://${p.path}`,
        [{ resize: { width: 1200 } }],
        {
          format: SaveFormat.JPEG,
          compress: 0.9,
        },
      );
      const file = new File(normalized.uri),
        original = new File(`file://${p.path}`);
      try {
        const image = jpeg.decode(await file.bytes(), {
          useTArray: true,
          maxResolutionInMP: 16,
          maxMemoryUsageInMB: 128,
        });
        setSamples(sampleGrid(image.data, image.width, image.height, size));
      } finally {
        file.delete();
        original.delete();
      }
    } catch (e) {
      setMessage(
        t(
          "Could not read the photo. Try brighter, even lighting.",
          "无法读取照片，请在更明亮、均匀的光线下重试。",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  function accept() {
    const next = { ...faces, [face]: samples.map((s) => s.color) };
    setFaces(next);
    setSamples([]);
    const missing = FACES.findIndex((f) => !next[f]);
    if (missing !== -1) {
      setIndex(missing);
      return;
    }
    const state = fromFacelets(size, next as Record<Face, Face[]>),
      result = validateScan(state);
    if (!result.valid) {
      setMessage(
        result.reason || t("Check all six faces.", "请检查六个面的颜色。"),
      );
      return;
    }
    setMessage(
      t(
        "Starting state confirmed. Confirm turns or rescan at checkpoints; hidden turns are not tracked.",
        "起始状态已确认。请逐步确认转动，或在检查点重新扫描；系统无法追踪看不到的转动。",
      ),
    );
    onState(state);
  }
  return (
    <Card>
      <Txt style={{ fontSize: 20, fontWeight: "700" }}>
        {t("Scan your puzzle", "扫描实物魔方")} · {face}
      </Txt>
      <Txt small>{scanInstructions(size, face)[locale]}</Txt>
      {externalCapture ? (
        <Notice
          text={t(
            "Use the recording preview above to frame each face. Recording continues during scans.",
            "请使用上方录像预览对准每一面，扫描时录像会持续进行。",
          )}
        />
      ) : Platform.OS === "web" ? (
        <Notice
          text={t(
            "Camera scanning requires the iOS or Android development build. You can still enter colors manually here.",
            "相机扫描需要 iOS 或 Android 开发版；此处仍可手动输入颜色。",
          )}
        />
      ) : !permission.hasPermission ? (
        <Button
          label={t("Allow camera", "允许使用相机")}
          onPress={() => void permission.requestPermission()}
        />
      ) : device ? (
        <View style={{ height: 280, borderRadius: 16, overflow: "hidden" }}>
          <Camera
            ref={camera}
            device={device}
            format={format}
            isActive
            photo
            style={{ flex: 1 }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: "65%",
              height: "65%",
              left: "17.5%",
              top: "17.5%",
              borderWidth: 2,
              borderColor: "white",
              borderRadius: 10,
            }}
          />
        </View>
      ) : (
        <Notice text={t("No back camera available.", "没有可用的后置相机。")} />
      )}
      <Row>
        <Button
          small
          label={
            busy ? t("Reading…", "识别中……") : t("Capture face", "拍摄这一面")
          }
          onPress={() => void capture()}
          disabled={busy || !permission.hasPermission || Platform.OS === "web"}
        />
        <Button
          small
          kind="secondary"
          label={t("Enter manually", "手动输入")}
          onPress={() =>
            setSamples(
              Array.from({ length: size * size }, () => ({
                color: face,
                confidence: 1,
                rgb: [0, 0, 0],
              })),
            )
          }
        />
      </Row>
      {samples.length > 0 && (
        <>
          <Txt small>
            {t(
              "Tap a sticker to correct its color. Low-confidence samples are marked “?”. Verify every sticker.",
              "点击色块可修改颜色；低置信度标有“?”，请逐块确认。",
            )}
          </Txt>
          <View
            style={{
              width: size * 61,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 5,
              alignSelf: "center",
            }}
          >
            {samples.map((s, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`Sticker ${i + 1}, ${s.color}, confidence ${Math.round(s.confidence * 100)} percent. Tap to change color.`}
                onPress={() =>
                  setSamples((prev) =>
                    prev.map((p, j) =>
                      j === i
                        ? {
                            ...p,
                            color: FACES[(FACES.indexOf(p.color) + 1) % 6],
                            confidence: 1,
                          }
                        : p,
                    ),
                  )
                }
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 8,
                  backgroundColor: COLORS[s.color],
                  borderWidth: 2,
                  borderColor: s.confidence < 0.45 ? "#a12e28" : c.line,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Txt style={{ color: "#17271d", fontWeight: "800" }}>
                  {s.color}
                  {s.confidence < 0.45 ? " ?" : ""}
                </Txt>
              </Pressable>
            ))}
          </View>
          <Button
            label={t("Confirm this face", "确认这一面")}
            onPress={accept}
          />
        </>
      )}
      {!!message && <Notice text={message} />}
      <Row>
        {FACES.map((f, i) => (
          <Button
            small
            key={f}
            kind="secondary"
            label={`${faces[f] ? "✓ " : ""}${f}`}
            onPress={() => {
              setIndex(i);
              setSamples(
                faces[f]?.map((color) => ({
                  color,
                  confidence: 1,
                  rgb: [0, 0, 0],
                })) || [],
              );
            }}
          />
        ))}
      </Row>
    </Card>
  );
}
