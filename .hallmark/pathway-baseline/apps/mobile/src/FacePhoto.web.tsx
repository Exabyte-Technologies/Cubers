import React from "react";
import { Notice } from "./ui";
import { useApp } from "./state";
import type { TriangularSample } from "./scan";
export function FacePhoto(_props: {
  onSamples: (samples: TriangularSample[]) => void;
  externalCapture?: () => Promise<string>;
}) {
  const { t } = useApp();
  return (
    <Notice
      text={t(
        "Camera color recognition is available in the native app. Enter and check each face below.",
        "原生应用支持相机颜色识别。此处请逐面手动输入并核对颜色。",
      )}
    />
  );
}
