import React, { forwardRef, useImperativeHandle } from "react";
import { Notice } from "./ui";
import { useApp } from "./state";
import type { RecordingHandle } from "./Recording.types";
export const Recording = forwardRef<
  RecordingHandle,
  { onInterrupted: (message: string) => void }
>(function Recording(_, ref) {
  const { t } = useApp();
  useImperativeHandle(
    ref,
    () => ({
      async start() {
        throw new Error(
          t(
            "Ranked physical recording requires the native iOS or Android app.",
            "排名实物录像需要 iOS 或 Android 原生应用。",
          ),
        );
      },
      async stop() {
        throw new Error("Native recording required");
      },
      async cancel() {},
      async capturePhoto() {
        throw new Error("Native camera required");
      },
    }),
    [t],
  );
  return (
    <Notice
      text={t(
        "Use the native iOS or Android app for uninterrupted competition recording. Browser attempts cannot submit ranked physical results.",
        "请使用 iOS 或 Android 原生应用连续录制竞赛录像。浏览器不能提交排名实物成绩。",
      )}
    />
  );
});
