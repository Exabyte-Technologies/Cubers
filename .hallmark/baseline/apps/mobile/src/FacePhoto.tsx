import React, { useRef, useState } from "react";
import { View } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCameraFormat,
} from "react-native-vision-camera";
import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import jpeg from "jpeg-js";
import Svg, { Polygon } from "react-native-svg";
import { sampleTriangular, type TriangularSample } from "./scan";
import { Button, Notice } from "./ui";
import { useApp } from "./state";
export function FacePhoto({
  onSamples,
  externalCapture,
}: {
  onSamples: (samples: TriangularSample[]) => void;
  externalCapture?: () => Promise<string>;
}) {
  const { t } = useApp(),
    camera = useRef<Camera>(null),
    device = useCameraDevice("back"),
    permission = useCameraPermission();
  const format = useCameraFormat(device, [
    { photoResolution: { width: 1600, height: 1200 } },
  ]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function capture() {
    if (!camera.current && !externalCapture) return;
    setBusy(true);
    setMessage("");
    let original: File | undefined, normalized: File | undefined;
    try {
      const photo = externalCapture
        ? { path: await externalCapture() }
        : await camera.current!.takePhoto({ flash: "off" });
      original = new File(`file://${photo.path}`);
      const image = await manipulateAsync(
        original.uri,
        [{ resize: { width: 1200 } }],
        { format: SaveFormat.JPEG, compress: 0.9 },
      );
      normalized = new File(image.uri);
      const decoded = jpeg.decode(await normalized.bytes(), {
        useTArray: true,
        maxResolutionInMP: 16,
        maxMemoryUsageInMB: 128,
      });
      onSamples(sampleTriangular(decoded.data, decoded.width, decoded.height));
    } catch {
      setMessage(
        t(
          "Could not read the face. Try even lighting or enter the colors manually.",
          "无法识别这一面，请调整光线或手动输入颜色。",
        ),
      );
    } finally {
      for (const file of [original, normalized]) {
        try {
          if (file?.exists) file.delete();
        } catch {}
      }
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      {externalCapture ? (
        <Notice
          text={t(
            "Use the recording preview above. Center an upright triangular face in the middle 65% of the image; recording continues during scans.",
            "请使用上方录像预览，将正放的三角面居中，宽度占画面中间约 65%，扫描时录像会持续进行。",
          )}
        />
      ) : !permission.hasPermission ? (
        <Button
          label={t("Allow camera", "允许使用相机")}
          onPress={() => void permission.requestPermission()}
        />
      ) : device ? (
        <View
          style={{ aspectRatio: 3 / 4, overflow: "hidden", borderRadius: 16 }}
        >
          <Camera
            ref={camera}
            device={device}
            format={format}
            isActive
            photo
            style={{ flex: 1 }}
          />
          <Svg
            pointerEvents="none"
            viewBox="0 0 300 400"
            style={{ position: "absolute", width: "100%", height: "100%" }}
          >
            <Polygon
              points="150,115.56 52.5,284.44 247.5,284.44"
              stroke="white"
              strokeWidth={2}
              fill="none"
            />
          </Svg>
        </View>
      ) : (
        <Notice
          text={t(
            "No back camera is available. Enter colors manually below.",
            "没有可用的后置相机，请在下方手动输入颜色。",
          )}
        />
      )}
      <Button
        label={
          busy
            ? t("Reading…", "识别中……")
            : t("Capture triangular face", "拍摄三角面")
        }
        onPress={() => void capture()}
        disabled={
          busy || (!externalCapture && (!permission.hasPermission || !device))
        }
      />
      {!!message && <Notice text={message} error />}
    </View>
  );
}
