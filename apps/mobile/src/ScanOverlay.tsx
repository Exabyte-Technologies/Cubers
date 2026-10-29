import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Image, StyleSheet, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { COLORS, type Face } from "@cubers/core";
import { SCAN_TURN_MS, type ScanPhase } from "./automatic-scan";
import { scanTurnPolygons, scanTurnProgress } from "./scan-turn-geometry";
import { puzzleRenderPalette } from "./design/tokens";
import { Txt, useTheme } from "./ui";
import { useApp } from "./state";
export type ScanPreview = {
  size: 2 | 3 | 4;
  phase: ScanPhase;
  turnIndex: number;
  imageUri?: string;
  faceColors?: Face[];
};
function TurnDiagram({ preview }: { preview: ScanPreview }) {
  const c = useTheme(),
    { t } = useApp(),
    [progress, setProgress] = useState(0),
    [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  useEffect(() => {
    setProgress(0);
    if (reduced) return;
    let frame = 0,
      start: number | undefined,
      lastDraw = -Infinity,
      active = true;
    const animate = (time: number) => {
      if (!active) return;
      start ??= time;
      const elapsed = time - start;
      // Leave a brief clear starting/finishing pose within the 1.5-second cue.
      if (elapsed - lastDraw >= 1000 / 30) {
        setProgress(scanTurnProgress(elapsed));
        lastDraw = elapsed;
      }
      if (elapsed < SCAN_TURN_MS) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [preview.turnIndex, reduced]);
  const polygons = scanTurnPolygons(preview.size, preview.turnIndex, progress);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={t(
        "Diagram: rotate the whole cube, without turning a layer.",
        "示意图：转动整个魔方，不要拧动单层。",
      )}
      style={{ alignItems: "center", gap: 10 }}
    >
      <Svg width={220} height={220} viewBox="0 0 220 220">
        {polygons.map((polygon) => (
          <Polygon
            key={`${polygon.face}-${polygon.sticker ?? "body"}`}
            points={polygon.points.map(([x, y]) => `${x},${y}`).join(" ")}
            fill={
              polygon.sticker === undefined
                ? puzzleRenderPalette.plastic
                : polygon.face === "F" && preview.faceColors?.[polygon.sticker]
                  ? COLORS[preview.faceColors[polygon.sticker]]
                  : c.paper
            }
            stroke={polygon.sticker === undefined ? c.ink : c.edge}
            strokeWidth={polygon.sticker === undefined ? 1.2 : 0.6}
            strokeLinejoin="round"
          />
        ))}
      </Svg>
      <Txt style={{ color: c.ink, textAlign: "center" }}>
        {t("Turn the whole cube", "转动整个魔方")}
      </Txt>
    </View>
  );
}
export function ScanOverlay({ preview }: { preview: ScanPreview }) {
  const c = useTheme();
  const { size, phase } = preview,
    holding = phase === "holding",
    turning = phase === "turning";
  const border = holding
    ? puzzleRenderPalette.scanAligned
    : puzzleRenderPalette.cameraFrame;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={{
          position: "absolute",
          left: "17.5%",
          top: "17.5%",
          width: "65%",
          aspectRatio: 1,
          borderWidth: holding ? 4 : 2,
          borderColor: border,
        }}
      >
        {Array.from({ length: size - 1 }, (_, i) => (
          <React.Fragment key={i}>
            <View
              style={{
                position: "absolute",
                left: `${((i + 1) * 100) / size}%`,
                top: 0,
                bottom: 0,
                borderLeftWidth: 1,
                borderColor: border,
              }}
            />
            <View
              style={{
                position: "absolute",
                top: `${((i + 1) * 100) / size}%`,
                left: 0,
                right: 0,
                borderTopWidth: 1,
                borderColor: border,
              }}
            />
          </React.Fragment>
        ))}
      </View>
      {turning && preview.imageUri ? (
        <Image
          source={{ uri: preview.imageUri }}
          resizeMode="cover"
          blurRadius={18}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {turning ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: c.dark
                ? puzzleRenderPalette.scanVeilDark
                : puzzleRenderPalette.scanVeil,
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
        >
          <TurnDiagram preview={preview} />
        </View>
      ) : null}
    </View>
  );
}
