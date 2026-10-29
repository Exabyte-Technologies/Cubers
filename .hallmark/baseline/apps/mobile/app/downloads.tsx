import React, { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  DownloadedLesson,
  practiceSetup,
  practiceApply,
  practiceSolved,
  isPyraminx,
  inverse,
  pyraminxInverse,
  type PracticeState,
} from "@cubers/core";
import { useApp } from "../src/state";
import { offlineLibrary } from "../src/offline/storage";
import { Screen, Heading, Card, Txt, Button, Row, Notice } from "../src/ui";
import { CubeView } from "../src/CubeView";
import { PyraminxView } from "../src/PyraminxView";
import { ReminderSettings } from "../src/reminders/Settings";
import { LessonCaseCoach } from "../src/CaseCoach";
import { LessonSequences } from "../src/LessonSequences";
import { OfflineFirstSolve } from "../src/offline/FirstSolve";

function OfflinePractice({ packet }: { packet: DownloadedLesson }) {
  return packet.guidedPractice ? (
    <OfflineFirstSolve packet={packet} />
  ) : (
    <OfflineDrill packet={packet} />
  );
}
function OfflineDrill({ packet }: { packet: DownloadedLesson }) {
  const { t, locale } = useApp(),
    lesson = packet.lesson;
  const [state, setState] = useState<PracticeState>(() =>
    practiceSetup(lesson.puzzle, lesson.algorithm),
  );
  const [moves, setMoves] = useState<string[]>([]),
    [last, setLast] = useState<string>();
  const [alternativeId, setAlternativeId] = useState<string>();
  const demonstration =
      lesson.alternatives?.find((row) => row.id === alternativeId)?.algorithm ||
      lesson.algorithm,
    sequence = demonstration.trim().split(/\s+/).filter(Boolean);
  const [expired, setExpired] = useState(Date.now() >= packet.expiresAt);
  useEffect(() => {
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, packet.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [packet.expiresAt]);
  const [demoStep, setDemoStep] = useState(0);
  function turn(move: string) {
    if (moves.length >= 2000 || Date.now() >= packet.expiresAt) return;
    try {
      setState((s) => practiceApply(s, [move]));
      setMoves((m) => [...m, move]);
      setLast(move);
    } catch {}
  }
  function reset() {
    setState(practiceSetup(lesson.puzzle, lesson.algorithm));
    setMoves([]);
    setLast(undefined);
    setDemoStep(0);
  }
  if (expired)
    return (
      <Notice
        text={t(
          "Reconnect and download again to renew access.",
          "请联网重新下载以更新使用权限。",
        )}
      />
    );
  return (
    <Card>
      <Txt style={{ fontSize: 23, fontWeight: "700" }}>
        {lesson.title[locale]}
      </Txt>
      <Txt>{lesson.summary[locale]}</Txt>
      {lesson.steps[locale].map((step, i) => (
        <Txt key={i}>
          {i + 1}. {step}
        </Txt>
      ))}
      <LessonCaseCoach lesson={lesson} />
      <LessonSequences
        lesson={lesson}
        selected={alternativeId}
        onSelect={(value) => {
          reset();
          setAlternativeId(value);
        }}
      />
      {lesson.kind === "guided-first-solve" ? (
        <Notice
          text={t(
            "The teaching notes are available offline. Reconnect for state-specific first-solve guidance and saved checkpoints.",
            "可离线阅读教学笔记。根据当前状态的首次还原指导和保存检查点需要联网。",
          )}
        />
      ) : (
        <>
          {isPyraminx(state) ? (
            <PyraminxView state={state} lastMove={last} onTurn={turn} />
          ) : (
            <CubeView state={state} lastMove={last} onTurn={turn} />
          )}
          <Txt selectable>{demonstration}</Txt>
          <Row>
            {Array.from(
              new Set([
                ...(lesson.puzzle === "pyraminx"
                  ? [
                      "U",
                      "L",
                      "R",
                      "B",
                      "U'",
                      "L'",
                      "R'",
                      "B'",
                      "u",
                      "l",
                      "r",
                      "b",
                    ]
                  : [
                      "U",
                      "R",
                      "F",
                      "D",
                      "L",
                      "B",
                      "U'",
                      "R'",
                      "F'",
                      "D'",
                      "L'",
                      "B'",
                      "U2",
                      "R2",
                      "F2",
                    ]),
                ...sequence,
              ]),
            ).map((move) => (
              <Button
                small
                kind="secondary"
                key={move}
                label={move}
                onPress={() => turn(move)}
              />
            ))}
          </Row>
          <Button
            kind="secondary"
            label={t("Show the next turn", "演示下一步")}
            disabled={demoStep >= sequence.length}
            onPress={() => {
              turn(sequence[demoStep]);
              setDemoStep((i) => i + 1);
            }}
          />
          <Button
            kind="secondary"
            label={t("Undo", "撤销")}
            disabled={!moves.length}
            onPress={() => {
              const previous = moves.at(-1)!;
              const move = (
                isPyraminx(state)
                  ? pyraminxInverse([previous])
                  : inverse([previous])
              )[0];
              setState((s) => practiceApply(s, [move]));
              setMoves((m) => m.slice(0, -1));
              setLast(move);
              setDemoStep(0);
            }}
          />
          <Button
            kind="secondary"
            label={t("Reset practice", "重置练习")}
            onPress={reset}
          />
          {practiceSolved(state) && (
            <Notice
              text={t(
                "Local practice solved. No progress or result was submitted.",
                "本地练习已还原，未提交学习进度或成绩。",
              )}
            />
          )}
        </>
      )}
    </Card>
  );
}
export default function Downloads() {
  const { token, region, user } = useApp();
  return (
    <DownloadsView
      key={JSON.stringify([
        token,
        region,
        user?.id,
        user?.permissions.canLearn,
      ])}
    />
  );
}
function DownloadsView() {
  const { t, token, region, user, locale, api } = useApp();
  const [items, setItems] = useState<DownloadedLesson[]>([]),
    [selected, setSelected] = useState<string>(),
    [error, setError] = useState("");
  const load = useCallback(
    async (check = true) => {
      offlineLibrary.setContext(
        token && (!user || user.permissions.canLearn)
          ? { token, region, ownerId: user?.id }
          : null,
      );
      const local = await offlineLibrary.list();
      if (!token || !local.length || !check) return local;
      let manifest: { courses: { id: string; version: number }[] };
      try {
        manifest = await api<{
          courses: { id: string; version: number }[];
        }>("course-download-manifest");
      } catch (error) {
        if ([401, 403].includes((error as any).status)) return [];
        if ((error as any).status) return [];
        return local;
      }
      if (!Array.isArray(manifest.courses))
        throw Error("Invalid publication manifest");
      return offlineLibrary.reconcilePublished(manifest.courses, token, region);
    },
    [token, region, user?.id, user?.permissions.canLearn, api],
  );
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setItems([]);
      setSelected(undefined);
      setError("");
      const refresh = () =>
        void load(false)
          .then((local) => {
            if (active) setItems(local);
            return load();
          })
          .then((result) => {
            if (active) setItems(result);
          })
          .catch(() => {
            if (active) {
              setItems([]);
              setError(
                t(
                  "Downloads could not be read. Remove them and download again.",
                  "无法读取下载内容，请移除后重新下载。",
                ),
              );
            }
          });
      refresh();
      const timer = setInterval(refresh, 30000);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [load]),
  );
  const current = items.find(
    (p) => p.lesson.id === selected && p.expiresAt > Date.now(),
  );
  return (
    <Screen>
      <Button
        kind="secondary"
        label={t("Back", "返回")}
        onPress={() => router.back()}
      />
      <Heading>{t("Downloaded lessons", "已下载课程")}</Heading>
      <ReminderSettings />
      <Notice
        text={t(
          "Downloads stay with this account and session for up to 24 hours. Reconnect to renew access and receive corrections. Offline practice saves no server progress, recordings, AI requests or competitive results.",
          "下载内容仅供当前账号和会话使用，最长 24 小时。联网后可更新使用权限及课程修订。离线练习不保存服务器进度、录像、AI 请求或比赛成绩。",
        )}
      />
      {Platform.OS === "web" && (
        <Notice
          text={t(
            "Browser downloads last only for this tab's session. Native app downloads also survive restarting the app while access remains valid.",
            "浏览器下载仅在当前标签页会话内有效。原生应用下载可在有效期内重启应用后继续使用。",
          )}
        />
      )}
      {!items.length && (
        <Card>
          <Txt>
            {t(
              "No available downloads. Open a lesson online and choose Download this lesson.",
              "暂无可用下载。请联网打开课程，选择“下载本课”。",
            )}
          </Txt>
        </Card>
      )}
      {!!error && <Notice text={error} error />}
      {items.map((packet) => (
        <Card key={packet.lesson.id}>
          <Txt>{packet.lesson.title[locale]}</Txt>
          {packet.guidedPractice && (
            <Txt small>
              {t(
                `Checked starting state · from checkpoint ${packet.guidedPractice.startingStage + 1}`,
                `已检查的起始状态 · 从第 ${packet.guidedPractice.startingStage + 1} 个检查点开始`,
              )}
            </Txt>
          )}
          <Txt small>
            {t("Version", "版本")} {packet.courseVersion} ·{" "}
            {t("Available until", "有效期至")}{" "}
            {new Date(packet.expiresAt).toLocaleString(
              locale === "zh" ? "zh-CN" : "en",
            )}
          </Txt>
          <Button
            kind="secondary"
            label={t("Open offline", "离线打开")}
            onPress={() => setSelected(packet.lesson.id)}
          />
          <Button
            kind="secondary"
            label={t("Remove download", "移除下载")}
            onPress={() =>
              void offlineLibrary
                .remove(packet.lesson.id)
                .then(() => load())
                .then(setItems)
                .catch(() =>
                  setError(
                    t("Could not remove the download.", "暂时无法移除下载。"),
                  ),
                )
            }
          />
        </Card>
      ))}
      {current && (
        <OfflinePractice
          key={`${current.lesson.id}:${current.courseVersion}:${current.downloadedAt}`}
          packet={current}
        />
      )}
      <Button
        kind="secondary"
        label={t("Remove all downloads", "移除所有下载")}
        onPress={() =>
          void offlineLibrary
            .clear()
            .then(() => {
              setItems([]);
              setSelected(undefined);
            })
            .catch(() =>
              setError(t("Could not clear downloads.", "暂时无法清除下载。")),
            )
        }
      />
    </Screen>
  );
}
