import { backOrReplace } from "../src/back-navigation";
import React, { useCallback, useRef, useState } from "react";
import {
  router,
  Redirect,
  useLocalSearchParams,
  useFocusEffect,
} from "expo-router";
import {
  type CubeState,
  type LastLayerGuidance,
  type AlgorithmFamily,
} from "@cubers/core";
import { facelets } from "@cubers/core";
import { Scanner } from "../src/Scanner";
import { CubeView } from "../src/CubeView";
import { useApp } from "../src/state";
import { CaseCoach } from "../src/CaseCoach";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Button,
  Chip,
  Row,
  Notice,
  Busy,
} from "../src/ui";
export default function CaseRecognition() {
  const params = useLocalSearchParams<{ family?: string }>(),
    { token, region, user } = useApp();
  if (!token) return <Redirect href="/" />;
  return (
    <RecognitionView
      key={JSON.stringify([
        token,
        region,
        user?.permissions.canLearn,
        params.family,
      ])}
      initialFamily={
        params.family === "CLL"
          ? "CLL"
          : params.family === "PLL"
            ? "PLL"
            : "OLL"
      }
    />
  );
}
function RecognitionView({
  initialFamily,
}: {
  initialFamily: AlgorithmFamily;
}) {
  const { t, api } = useApp();
  const epoch = useRef(0),
    focused = useRef(false);
  const [family, setFamily] = useState<AlgorithmFamily>(initialFamily),
    [scanning, setScanning] = useState(true);
  const [state, setState] = useState<CubeState>(),
    [guidance, setGuidance] = useState<LastLayerGuidance>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      epoch.current++;
      setState(undefined);
      setGuidance(undefined);
      setMessage("");
      setScanning(true);
      setBusy(false);
      return () => {
        focused.current = false;
        epoch.current++;
      };
    }, []),
  );
  async function identify(state: CubeState) {
    if (!focused.current || busy) return;
    const request = ++epoch.current;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<LastLayerGuidance>("last-layer/recognize", {
        family,
        faces: facelets(state),
      });
      if (!focused.current || request !== epoch.current) return;
      setState(state);
      setGuidance(result);
      setScanning(false);
    } catch (error) {
      if (focused.current && request === epoch.current)
        setMessage((error as Error).message);
    } finally {
      if (focused.current && request === epoch.current) setBusy(false);
    }
  }
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("Learning", "返回学习")}
        onPress={() => backOrReplace(router, "/(tabs)/learn")}
      />
      <Heading eyebrow={t("Recognize before you turn", "先观察，再转动")}>
        {t("My last layer", "我的最后一层")}
      </Heading>
      <Notice
        text={t(
          "Hold white up and green toward you. Finish the lower layers first: two layers for OLL/PLL, one for 2×2 CLL. This recognizes a last-layer case, not an arbitrary full-puzzle solution.",
          "白色朝上、绿色朝前。请先完成下层：OLL／PLL 需完成前两层，二阶 CLL 需完成第一层。此处识别最后一层情况，不提供任意状态的整颗复原方案。",
        )}
      />
      <Row>
        {(["OLL", "PLL", "CLL"] as const).map((value) => (
          <Chip
            key={value}
            label={value === "CLL" ? "2×2 CLL" : `3×3 ${value}`}
            selected={family === value}
            onPress={() => {
              if (busy) return;
              setFamily(value);
              setScanning(true);
              setState(undefined);
              setGuidance(undefined);
              setMessage("");
            }}
          />
        ))}
      </Row>
      {busy ? (
        <Busy />
      ) : scanning ? (
        <Scanner
          key={family}
          size={family === "CLL" ? 2 : 3}
          onState={(state) => void identify(state)}
        />
      ) : (
        <Button
          kind="secondary"
          label={t("Scan again", "重新扫描")}
          onPress={() => {
            setScanning(true);
            setState(undefined);
            setGuidance(undefined);
            setMessage("");
          }}
        />
      )}
      {state && <CubeView state={state} />}
      {guidance?.kind === "case" && (
        <CaseCoach
          key={`${family}:${JSON.stringify(guidance.observations.current)}`}
          current={guidance.observations.current}
          prepared={guidance.observations.prepared}
          before={guidance.before}
        />
      )}
      {guidance && (
        <Card>
          {guidance.kind === "case" ? (
            <>
              <Txt style={{ fontSize: 20, fontWeight: "600" }}>
                {t("Validated case guidance", "已验证的情况指导")}
              </Txt>
              <Notice
                text={
                  guidance.target === "oriented"
                    ? t(
                        "This will orient the top while preserving the first two layers. Continue with PLL to finish the side colors.",
                        "本组合将完成顶面朝向并保留前两层，再用 PLL 完成侧面排列。",
                      )
                    : t(
                        "Use this sequence in the displayed orientation to finish the last layer.",
                        "请保持展示的方向，按以下组合完成最后一层。",
                      )
                }
              />
              <Txt selectable>
                {t("Upper-face setup", "先调整顶面")}:{" "}
                {guidance.before.join(" ") || t("None", "无需调整")}
              </Txt>
              <Txt selectable style={{ fontSize: 20, fontWeight: "600" }}>
                {guidance.algorithm.join(" ")}
              </Txt>
              <Txt selectable>
                {t("Final upper-face alignment", "最后调整顶面")}:{" "}
                {guidance.after.join(" ") || t("None", "无需调整")}
              </Txt>
              <Txt small>
                {t(
                  "Authored composite sequence / no AI call. Scan identification alone does not save a completed lesson.",
                  "原创组合公式 / 不调用 AI。识别扫描本身不会保存为已完成课程。",
                )}
              </Txt>
              <Txt small>
                {t(
                  "The demo opens a fixed reference setup for this case; its side colors may differ from your scan. Use the sequence above for your scanned state.",
                  "演示采用这一情况的固定参照状态，侧面颜色可能与扫描结果不同。请用上方组合处理你扫描的状态。",
                )}
              </Txt>
              <Button
                label={t(
                  "Practice this case with a demo",
                  "通过演示练习这一情况",
                )}
                onPress={() => router.push(`/lesson/${guidance.lessonId}`)}
              />
            </>
          ) : guidance.kind === "alignment" ? (
            <>
              <Txt>
                {guidance.moves.length
                  ? t("Only upper-face alignment remains.", "只需调整顶面。")
                  : t("Your puzzle is already solved.", "你的魔方已复原。")}
              </Txt>
              <Txt selectable style={{ fontSize: 24, fontWeight: "600" }}>
                {guidance.moves.join(" ")}
              </Txt>
            </>
          ) : guidance.kind === "stage-complete" ? (
            <Txt>
              {t(
                "Your top is already oriented. Continue with PLL for the side colors.",
                "顶面朝向已完成，请继续 PLL 处理侧面排列。",
              )}
            </Txt>
          ) : (
            <Notice
              text={
                guidance.reason === "FIRST_LAYERS_REQUIRED"
                  ? t(
                      "Check your reference orientation and complete the lower layers before recognizing this case.",
                      "请检查参照方向，并先完成下层再识别此情况。",
                    )
                  : t(
                      "PLL needs an oriented top first. Use OLL before this step.",
                      "PLL 需要先完成顶面朝向，请先进行 OLL。",
                    )
              }
            />
          )}
        </Card>
      )}
      {!!message && <Notice text={message} error />}
    </Screen>
  );
}
