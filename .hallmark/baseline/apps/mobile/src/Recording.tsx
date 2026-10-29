import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
} from "react";
import { View } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from "react-native-vision-camera";
import { Button, Card, Txt, Notice } from "./ui";
import { useApp } from "./state";
import type { RecordingHandle, RecordedVideo } from "./Recording.types";
export const Recording = forwardRef<
  RecordingHandle,
  { onInterrupted: (message: string) => void }
>(function Recording({ onInterrupted }, ref) {
  const { t } = useApp(),
    device = useCameraDevice("back"),
    permission = useCameraPermission(),
    format = useCameraFormat(device, [
      { videoResolution: { width: 1280, height: 720 } },
      { photoResolution: { width: 1600, height: 1200 } },
      { fps: 30 },
    ]),
    camera = useRef<Camera>(null),
    [ready, setReady] = useState(false),
    [recording, setRecording] = useState(false),
    capture = useRef<{
      promise: Promise<RecordedVideo>;
      resolve: (video: RecordedVideo) => void;
      reject: (error: Error) => void;
    } | null>(null),
    interrupted = useRef(onInterrupted);
  interrupted.current = onInterrupted;
  useImperativeHandle(
    ref,
    () => ({
      async start() {
        if (!ready || !camera.current || !permission.hasPermission)
          throw new Error(
            t(
              "Allow the camera and wait for the preview before recording.",
              "请允许相机权限，并等待预览画面出现后再录制。",
            ),
          );
        if (capture.current)
          throw new Error(t("Recording already started.", "录像已经开始。"));
        let resolve!: (v: RecordedVideo) => void, reject!: (e: Error) => void;
        const promise = new Promise<RecordedVideo>((yes, no) => {
          resolve = yes;
          reject = no;
        });
        // A camera failure may arrive before the user reaches the stop button.
        void promise.catch(() => {});
        capture.current = { promise, resolve, reject };
        camera.current.startRecording({
          fileType: "mp4",
          videoCodec: "h264",
          flash: "off",
          onRecordingFinished(video) {
            setRecording(false);
            resolve(video);
          },
          onRecordingError() {
            setRecording(false);
            const error = new Error(
              t(
                "Recording interrupted. This attempt cannot be ranked.",
                "录像中断，本次尝试不能计入排名。",
              ),
            );
            reject(error);
            interrupted.current(error.message);
          },
        });
        setRecording(true);
      },
      async stop() {
        if (!capture.current || !camera.current)
          throw new Error(
            t("No recording is active.", "当前没有正在进行的录像。"),
          );
        await camera.current.stopRecording();
        return capture.current.promise;
      },
      async cancel() {
        if (capture.current && camera.current) {
          await camera.current.cancelRecording().catch(() => {});
          capture.current = null;
          setRecording(false);
        }
      },
      async capturePhoto() {
        if (!camera.current || !ready)
          throw new Error("Camera preview unavailable");
        return (await camera.current.takePhoto({ flash: "off" })).path;
      },
    }),
    [ready, permission.hasPermission, t],
  );
  useEffect(
    () => () => {
      void camera.current?.cancelRecording().catch(() => {});
    },
    [],
  );
  return (
    <Card>
      <Txt style={{ fontWeight: "700", fontSize: 20 }}>
        {t("Private competition recording", "私密竞赛录像")}
      </Txt>
      <Txt small>
        {t(
          "Keep the cube and both hands visible. Record the scramble, inspection, solve, and final state without pausing. Faces and audio are not needed. Footage goes only to reviewers and is deleted seven days after finalization; appeals may retain it up to 30 days.",
          "请保持魔方与双手可见，连续录制打乱、观察、还原及最终状态，不要暂停。无需拍摄面部或录制声音。录像仅供审核人员查看，结案七日后删除，申诉最长保留三十日。",
        )}
      </Txt>
      {!permission.hasPermission ? (
        <Button
          label={t("Allow camera for this attempt", "允许本次尝试使用相机")}
          onPress={() => void permission.requestPermission()}
        />
      ) : device ? (
        <View style={{ height: 250, borderRadius: 16, overflow: "hidden" }}>
          <Camera
            ref={camera}
            device={device}
            format={format}
            fps={format ? Math.min(30, format.maxFps) : undefined}
            photo
            video
            audio={false}
            isActive
            style={{ flex: 1 }}
            onInitialized={() => setReady(true)}
            onError={() => {
              setReady(false);
              if (capture.current)
                interrupted.current(
                  t(
                    "Camera unavailable. Attempt interrupted.",
                    "相机不可用，尝试已中止。",
                  ),
                );
            }}
          />
        </View>
      ) : (
        <Notice
          text={t("No back camera is available.", "没有可用的后置相机。")}
        />
      )}
      {recording && (
        <Notice
          text={t(
            "● Recording continuously · no audio",
            "● 连续录像中 · 无声音",
          )}
        />
      )}
    </Card>
  );
});
