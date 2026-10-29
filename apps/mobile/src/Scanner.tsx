import React, { useEffect, useRef, useState, useMemo } from "react";
import { AppState as Lifecycle, Linking, Pressable, View } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from "react-native-vision-camera";
import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import jpeg from "jpeg-js";
import { FACES, COLORS, turn, type Face, type CubeState } from "@cubers/core";
import {
  AutomaticScanGate,
  ScanReadLease,
  inspectScanFrame,
  resolveAutomaticScan,
  SCAN_FACE_ORDER,
  type ScanUpdate,
  SCAN_TURN_MS,
} from "./automatic-scan";
import { ScanOverlay, type ScanPreview } from "./ScanOverlay";
import { scanTurnInstruction } from "./scan-turn-geometry";
import { ManualCubeEntry } from "./ManualCubeEntry";
import { CubeView } from "./CubeView";
import type { Sample } from "./scan";
import { Button, Card, Notice, Row, Txt, useTheme } from "./ui";
import { useApp } from "./state";
import { puzzleRenderPalette } from "./design/tokens";

export type ScannerProps = {
  size: 2 | 3 | 4;
  onState: (state: CubeState) => void;
  externalCapture?: () => Promise<string>;
  manualOnly?: boolean;
  holdingFrame?: "white-up" | "white-down";
  onPreviewChange?: (preview: ScanPreview | null) => void;
};
const fileUri = (path: string) =>
  path.startsWith("file://") ? path : "file://" + path;
export function Scanner(props: ScannerProps) {
  return props.manualOnly ? (
    <ManualCubeEntry size={props.size} onState={props.onState} manualOnly />
  ) : (
    <AutomaticCubeScanner {...props} />
  );
}
function AutomaticCubeScanner({
  size,
  onState,
  externalCapture,
  holdingFrame = "white-up",
  onPreviewChange,
}: ScannerProps) {
  const { t } = useApp(),
    c = useTheme(),
    device = useCameraDevice("back"),
    permission = useCameraPermission(),
    format = useCameraFormat(device, [
      { videoResolution: { width: 640, height: 480 } },
      { fps: 15 },
    ]);
  const camera = useRef<Camera>(null),
    reader = useRef(new ScanReadLease()),
    foreground = useRef(Lifecycle.currentState === "active"),
    gate = useRef(new AutomaticScanGate(size)),
    capture = useRef(externalCapture),
    notify = useRef(onPreviewChange);
  capture.current = externalCapture;
  notify.current = onPreviewChange;
  const [ready, setReady] = useState(false),
    [permissionDenied, setPermissionDenied] = useState(false),
    [active, setActive] = useState(Lifecycle.currentState === "active"),
    [paused, setPaused] = useState(false),
    [manual, setManual] = useState(false),
    [revision, setRevision] = useState(0),
    [review, setReview] = useState<Sample[][] | null>(null),
    [update, setUpdate] = useState<ScanUpdate>({
      phase: "searching",
      index: 0,
    }),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<ScanPreview>({
      size,
      phase: "searching",
      turnIndex: 0,
    });
  const retained = useRef<(() => void) | null>(null),
    turnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const disposeRetained = () => {
    retained.current?.();
    retained.current = null;
  };
  useEffect(() => {
    const sub = Lifecycle.addEventListener("change", (state) => {
      foreground.current = state === "active";
      reader.current.invalidate();
      gate.current.resetHold();
      setActive(state === "active");
      setUpdate({ phase: "searching", index: gate.current.captured.length });
      setPreview((p) => ({ ...p, phase: "searching", imageUri: undefined }));
      if (state !== "active") {
        disposeRetained();
        setPreview((p) => ({ ...p, imageUri: undefined }));
      }
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    notify.current?.(manual || review || !active ? null : preview);
  }, [preview, manual, review, active]);
  useEffect(
    () => () => {
      clearTimeout(turnTimer.current);
      disposeRetained();
      notify.current?.(null);
    },
    [],
  );
  useEffect(() => {
    reader.current.invalidate();
    clearTimeout(turnTimer.current);
    disposeRetained();
    gate.current = new AutomaticScanGate(size);
    setUpdate({ phase: "searching", index: 0 });
    setPreview({ size, phase: "searching", turnIndex: 0 });
    setReview(null);
    setMessage("");
  }, [size, revision]);
  useEffect(() => {
    if (
      manual ||
      review ||
      paused ||
      !active ||
      (!externalCapture && (!ready || !permission.hasPermission || !device))
    )
      return;
    let running = true,
      timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      const lease = reader.current.begin();
      if (!lease) {
        if (running) timer = setTimeout(() => void tick(), 120);
        return;
      }
      let dispose: (() => void) | undefined;
      try {
        const photo = capture.current
          ? { path: await capture.current() }
          : await camera.current!.takeSnapshot({ quality: 85 });
        const original = new File(fileUri(photo.path));
        let normalized: File | undefined,
          keepFrame = false;
        try {
          const image = await manipulateAsync(
            original.uri,
            [{ resize: { width: 400 } }],
            { format: SaveFormat.JPEG, compress: 0.95 },
          );
          normalized = new File(image.uri);
          const decoded = jpeg.decode(await normalized.bytes(), {
            useTArray: true,
            maxResolutionInMP: 4,
            maxMemoryUsageInMB: 48,
          });
          const frame = inspectScanFrame(
            decoded.data,
            decoded.width,
            decoded.height,
            size,
            performance.now(),
          );
          const file = normalized;
          dispose = () => {
            try {
              file.delete();
            } catch {}
          };
          if (
            !running ||
            !foreground.current ||
            !reader.current.isCurrent(lease)
          ) {
            dispose();
            return;
          }
          const next = gate.current.feed(frame);
          setUpdate((old) =>
            old.phase === next.phase && old.index === next.index ? old : next,
          );
          if (next.captured) {
            disposeRetained();
            keepFrame = true;
            retained.current = dispose;
            dispose = undefined;
            setPreview({
              size,
              phase: "turning",
              turnIndex: next.index - 1,
              imageUri: image.uri,
              faceColors: next.captured.map((s) => s.color),
            });
            clearTimeout(turnTimer.current);
            turnTimer.current = setTimeout(() => {
              disposeRetained();
              setPreview((p) => ({
                ...p,
                phase: "move-away",
                imageUri: undefined,
              }));
              if (gate.current.captured.length === 6)
                setReview(
                  gate.current.captured.map((face) =>
                    face.map((s) => ({
                      ...s,
                      rgb: [...s.rgb] as [number, number, number],
                    })),
                  ),
                );
            }, SCAN_TURN_MS);
          } else if (next.phase !== "turning")
            setPreview((old) =>
              old.phase === next.phase
                ? old
                : {
                    size,
                    phase: next.phase,
                    turnIndex: Math.max(0, next.index - 1),
                  },
            );
          setMessage("");
        } finally {
          try {
            original.delete();
          } catch {}
          if (normalized && !keepFrame) {
            try {
              normalized.delete();
            } catch {}
          }
        }
      } catch {
        if (running) {
          gate.current.resetHold();
          setUpdate({
            phase: "searching",
            index: gate.current.captured.length,
          });
          setPreview((p) =>
            p.phase === "turning" ? p : { ...p, phase: "searching" },
          );
          setMessage(
            t(
              "Camera reading paused. Keep the app open and try even lighting, or use manual entry.",
              "相机读取暂不可用，请保持应用在前台、改善光线，或手动输入。",
            ),
          );
        }
      } finally {
        reader.current.finish(lease);
        dispose?.();
        if (running && gate.current.captured.length < 6)
          timer = setTimeout(() => void tick(), 120);
      }
    }
    void tick();
    return () => {
      running = false;
      reader.current.invalidate();
      clearTimeout(timer);
      gate.current.resetHold();
    };
  }, [
    size,
    revision,
    manual,
    review,
    paused,
    active,
    ready,
    permission.hasPermission,
    device?.id,
    !!externalCapture,
  ]);
  const resolution = useMemo(() => {
    if (!review) return null;
    try {
      return { value: resolveAutomaticScan(size, review), error: "" };
    } catch (error) {
      return { value: null, error: (error as Error).message };
    }
  }, [review, size]);
  if (manual)
    return (
      <>
        <Button
          kind="secondary"
          label={t("Return to automatic scan", "返回自动扫描")}
          onPress={() => {
            setManual(false);
            setRevision((v) => v + 1);
          }}
        />
        <ManualCubeEntry size={size} onState={onState} manualOnly />
      </>
    );
  const instruction = scanTurnInstruction(Math.max(0, update.index - 1)),
    turnText = t(instruction.en, instruction.zh);
  return (
    <Card>
      <Txt style={{ fontSize: 20, fontWeight: "700" }}>
        {t("Automatic cube scan", "自动扫描魔方")}
      </Txt>
      {!review ? (
        <>
          <Txt>
            {paused
              ? t(
                  "Scanning paused. Resume when you are ready.",
                  "扫描已暂停，准备好后可继续。",
                )
              : update.phase === "turning"
                ? turnText
                : update.phase === "move-away"
                  ? t(
                      "Move the cube briefly out of the square while turning it, then align the next face.",
                      "转动时让魔方短暂离开方框，再将下一面对齐。",
                    )
                  : update.phase === "duplicate"
                    ? t(
                        "This looks like a face already scanned. Show the next side, not the same face again.",
                        "这看起来是已经扫描过的一面，请展示下一面。",
                      )
                    : update.phase === "holding"
                      ? t(
                          "Aligned. Hold still for half a second…",
                          "已对齐，请保持静止半秒……",
                        )
                      : update.index === 0
                        ? t(
                            "Start with any face. Fill the square exactly, with every sticker inside its cell. Keep one edge at the top.",
                            "可从任意一面开始，让魔方面完整填满方框，每个色块对齐格子，并保持一条边朝上。",
                          )
                        : t(
                            "Align the next face with the grid. Follow the whole-cube turn shown.",
                            "将下一面对齐网格，并遵循展示的整体转动方向。",
                          )}
          </Txt>
          {update.index > 0 &&
          update.index < 6 &&
          update.phase !== "turning" ? (
            <Txt small>{turnText}</Txt>
          ) : null}
          <Txt small>
            {t(
              `${Math.min(update.index, 6)} of 6 faces scanned. Photos stay on this device and are deleted after reading or the turn animation.`,
              `已扫描 ${Math.min(update.index, 6)}/6 面。照片只在本机识别，在识别或转动动画后删除。`,
            )}
          </Txt>
          {externalCapture ? (
            <Notice
              text={t(
                "Use the continuous recording preview above; scanning does not stop the recording.",
                "请对准上方连续录像的取景框，扫描不会停止录像。",
              )}
            />
          ) : !permission.hasPermission ? (
            <>
              <Button
                label={t("Allow camera", "允许使用相机")}
                onPress={() => {
                  void permission
                    .requestPermission()
                    .then((granted) => {
                      setPermissionDenied(!granted);
                      if (!granted)
                        setMessage(
                          t(
                            "Camera access was not allowed. Enable it in this app's settings or enter the colors manually.",
                            "尚未允许相机权限，请在本应用设置中启用，或手动输入颜色。",
                          ),
                        );
                    })
                    .catch(() => setPermissionDenied(true));
                }}
              />
              {permissionDenied ? (
                <Button
                  kind="secondary"
                  label={t("Open app camera settings", "打开应用相机权限设置")}
                  onPress={() => {
                    void Linking.openSettings().catch(() =>
                      setMessage(
                        t(
                          "Open Cubers' camera permission in your device Settings.",
                          "请在设备设置中打开 Cubers 的相机权限。",
                        ),
                      ),
                    );
                  }}
                />
              ) : null}
            </>
          ) : device ? (
            <View
              style={{
                width: "100%",
                aspectRatio: 1,
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              <Camera
                key={revision}
                ref={camera}
                device={device}
                format={format}
                video
                audio={false}
                isActive={active && !paused}
                resizeMode="cover"
                outputOrientation="preview"
                style={{ flex: 1 }}
                onInitialized={() => setReady(true)}
                onError={() => {
                  setReady(false);
                  gate.current.resetHold();
                  setMessage(
                    t(
                      "Camera unavailable. Retry or enter colors manually.",
                      "相机不可用，请重试或手动输入颜色。",
                    ),
                  );
                }}
              />
              <ScanOverlay preview={preview} />
            </View>
          ) : (
            <Notice
              text={t("No back camera is available.", "没有可用的后置相机。")}
            />
          )}
          {update.phase === "duplicate" && size !== 3 ? (
            <Button
              kind="secondary"
              label={t(
                "I turned to a different face with the same pattern",
                "我已转到图案相同的另一个面",
              )}
              onPress={() => {
                gate.current.confirmDistinctFace();
                setUpdate({
                  phase: "searching",
                  index: gate.current.captured.length,
                });
              }}
            />
          ) : null}
          <Row>
            <Button
              kind="secondary"
              label={
                paused
                  ? t("Resume scanning", "继续扫描")
                  : t("Pause scanning", "暂停扫描")
              }
              onPress={() => {
                reader.current.invalidate();
                gate.current.resetHold();
                setUpdate({
                  phase: "searching",
                  index: gate.current.captured.length,
                });
                setPreview((p) => ({ ...p, phase: "searching" }));
                setPaused((v) => !v);
              }}
            />
            <Button
              kind="secondary"
              label={t("Enter colors manually", "手动输入颜色")}
              onPress={() => {
                reader.current.invalidate();
                gate.current.resetHold();
                clearTimeout(turnTimer.current);
                disposeRetained();
                setManual(true);
              }}
            />
          </Row>
        </>
      ) : (
        <>
          <Txt>
            {t(
              "Review the scanned colors. Face labels describe your initial grip; sticker letters name colors. Tap to correct a sticker. Only a physically valid cube can continue.",
              "请核对扫描颜色。面标记表示初始握持位置，贴片字母表示颜色。点击色块可修改，只有符合物理规则的状态才能继续。",
            )}
          </Txt>
          {review.map((samples, fi) => (
            <View key={fi} style={{ gap: 8 }}>
              <Txt>
                {t(
                  `Scan ${fi + 1} · ${SCAN_FACE_ORDER[fi]}`,
                  `第 ${fi + 1} 面 · ${SCAN_FACE_ORDER[fi]}`,
                )}
              </Txt>
              <View
                style={{
                  width: size * 48,
                  alignSelf: "center",
                  flexDirection: "row",
                  flexWrap: "wrap",
                }}
              >
                {samples.map((sample, si) => {
                  const shownColor =
                    si === 4 &&
                    resolution?.value?.correctedCenter === SCAN_FACE_ORDER[fi]
                      ? "U"
                      : sample.color;
                  return (
                    <Pressable
                      key={si}
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        `Scan ${fi + 1}, sticker ${si + 1}: ${shownColor}. Tap to change.`,
                        `第 ${fi + 1} 面，第 ${si + 1} 个色块：${shownColor}。点击修改。`,
                      )}
                      onPress={() =>
                        setReview((previous) =>
                          previous!.map((face, i) =>
                            i !== fi
                              ? face
                              : face.map((s, j) =>
                                  j !== si
                                    ? s
                                    : {
                                        ...s,
                                        color:
                                          FACES[
                                            (FACES.indexOf(shownColor) + 1) % 6
                                          ],
                                        confidence: 1,
                                      },
                                ),
                          ),
                        )
                      }
                      style={{
                        width: 44,
                        height: 44,
                        margin: 2,
                        borderWidth: sample.confidence < 0.45 ? 3 : 1,
                        borderColor:
                          sample.confidence < 0.45
                            ? puzzleRenderPalette.scanError
                            : c.line,
                        backgroundColor: COLORS[shownColor],
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Txt style={{ color: puzzleRenderPalette.netInk }}>
                        {shownColor}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          {resolution?.error ? (
            <Notice
              text={t(
                "The scanned state could not be validated. Check the colors and turn order, or restart the scan.",
                "扫描状态无法通过验证，请核对颜色与整体转动顺序，或重新扫描。",
              )}
            />
          ) : null}
          {resolution?.value?.correctedCenter ? (
            <Notice
              text={t(
                "A logo-covered white center was identified uniquely from all six faces and cube legality. Its correction is shown in the model.",
                "通过六面颜色和魔方物理规则，唯一识别出了被标志遮挡的白色中心，模型已显示校正结果。",
              )}
            />
          ) : null}
          {resolution?.value ? (
            <>
              <Txt>
                {size === 3
                  ? holdingFrame === "white-down"
                    ? t(
                        "Before starting the lesson, hold white underneath and green toward you. Match this model.",
                        "开始课程前，请将白色面朝下、绿色面朝向自己，与模型一致。",
                      )
                    : t(
                        "Before continuing, hold white up and green toward you. Match this model.",
                        "继续前，请将白色面朝上、绿色面朝向自己，与模型一致。",
                      )
                  : t(
                      "Return to your starting grip using the final turn shown. Keep that same top and front, and match the model.",
                      "按最后的翻转指引回到起始握持方向，保持同一个顶面和正面，并与模型一致。",
                    )}
              </Txt>
              <CubeView
                state={
                  size === 3 && holdingFrame === "white-down"
                    ? turn(resolution.value.state, "z2")
                    : resolution.value.state
                }
              />
              <Button
                label={t(
                  "Colors and holding position confirmed",
                  "确认颜色与握持方向",
                )}
                onPress={() => onState(resolution.value!.state)}
              />
            </>
          ) : null}
        </>
      )}
      {message ? <Notice text={message} /> : null}
      <Button
        kind="secondary"
        label={t("Restart all six faces", "重新扫描六个面")}
        onPress={() => {
          reader.current.invalidate();
          clearTimeout(turnTimer.current);
          disposeRetained();
          setReady(false);
          setRevision((v) => v + 1);
        }}
      />
    </Card>
  );
}
