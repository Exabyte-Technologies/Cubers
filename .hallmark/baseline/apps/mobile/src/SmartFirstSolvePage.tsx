import React, { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { type Lesson, type SmartGuidedView } from "@cubers/core";
import { useApp } from "./state";
import { Screen, Heading, Card, Txt, Button, Notice, Busy, Row } from "./ui";
import { SmartPractice } from "./SmartPractice";
type History = {
  items: {
    id: string;
    status: string;
    stage: number;
    total: number;
    createdAt: string;
  }[];
  active: string | null;
};
export function SmartFirstSolvePage({ puzzle }: { puzzle: string }) {
  const { api, t, locale } = useApp(),
    [course, setCourse] = useState<{ content: Lesson; version: number }>(),
    [history, setHistory] = useState<History>(),
    [past, setPast] = useState<SmartGuidedView>(),
    [error, setError] = useState(""),
    [reading, setReading] = useState(false);
  const generation = useRef(0),
    request = useRef(0);
  useFocusEffect(
    useCallback(() => {
      const epoch = ++generation.current;
      request.current++;
      setCourse(undefined);
      setHistory(undefined);
      setPast(undefined);
      setError("");
      setReading(false);
      if (puzzle === "3x3")
        void Promise.all([
          api<{ content: Lesson; version: number }>("courses/3-first-solve"),
          api<History>("smart-first-solves"),
        ])
          .then(([saved, rows]) => {
            if (epoch === generation.current) {
              setCourse(saved);
              setHistory(rows);
            }
          })
          .catch((e) => {
            if (epoch === generation.current) setError(e.message);
          });
      return () => {
        generation.current++;
        request.current++;
      };
    }, [api, puzzle]),
  );
  async function read(id: string) {
    const epoch = generation.current,
      stamp = ++request.current;
    setReading(true);
    try {
      const row = await api<SmartGuidedView>("smart-first-solves/" + id);
      if (epoch === generation.current && stamp === request.current)
        setPast(row);
    } catch (e) {
      if (epoch === generation.current && stamp === request.current)
        setError((e as Error).message);
    } finally {
      if (epoch === generation.current && stamp === request.current)
        setReading(false);
    }
  }
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("← Learning paths", "← 返回学习路线")}
        onPress={() => router.replace("/(tabs)/learn")}
      />
      <Heading
        eyebrow={t("3×3 · private guided learning", "三阶 · 私密的逐步指导")}
      >
        {t("Your first smart-cube solve.", "用智能魔方，完成首次还原。")}
      </Heading>
      <Txt>
        {t(
          "Connect your unsolved cube, confirm its actual position and work through each validated stage. Stop turning and refresh the device position before each checkpoint. This is learning progress, with no ranking or speed claim.",
          "连接尚未还原的魔方，确认实际状态后逐个完成经过验证的阶段。每个检查点前请停止转动并刷新设备状态。这是学习进度，不参与排名或转速评定。",
        )}
      </Txt>
      <Row>
        <Button
          kind="secondary"
          label={t("Use a virtual puzzle", "使用虚拟魔方")}
          onPress={() =>
            router.replace({
              pathname: "/first-solve",
              params: { input: "virtual", puzzle },
            })
          }
        />
        <Button
          kind="secondary"
          label={t("Scan a normal puzzle", "扫描普通魔方")}
          onPress={() =>
            router.replace({
              pathname: "/first-solve",
              params: { input: "scan", puzzle },
            })
          }
        />
      </Row>
      {puzzle !== "3x3" ? (
        <Notice
          text={t(
            "These smart models support 3×3 only. Choose a virtual puzzle or scanning for this puzzle.",
            "这些智能型号仅支持三阶；当前项目请选择虚拟或扫描练习。",
          )}
        />
      ) : course ? (
        <SmartPractice
          lesson={course.content}
          courseVersion={course.version}
          guided
        />
      ) : !error ? (
        <Busy />
      ) : null}
      {!!error && <Notice text={error} error />}
      {!!history?.items.length && (
        <Card>
          <Txt style={{ fontWeight: "700" }}>
            {t(
              "Private smart first-solve history",
              "私密的智能魔方首次还原记录",
            )}
          </Txt>
          {history.items.map((row) => (
            <Button
              key={row.id}
              small
              kind="secondary"
              disabled={reading}
              label={
                new Date(row.createdAt).toLocaleDateString(
                  locale === "zh" ? "zh-CN" : "en-US",
                ) +
                " · " +
                row.stage +
                "/" +
                row.total +
                " · " +
                (row.status === "COMPLETED"
                  ? t("Verified", "已验证")
                  : row.status === "ACTIVE"
                    ? t("Active connection", "连接中")
                    : t("Ended or interrupted", "已结束或中断"))
              }
              onPress={() => void read(row.id)}
            />
          ))}
          {past && (
            <>
              <Txt>
                {t(
                  "Verified checkpoints: " +
                    past.guidance.stage +
                    "/" +
                    past.guidance.total,
                  "已验证检查点：" +
                    past.guidance.stage +
                    "/" +
                    past.guidance.total,
                )}
              </Txt>
              <Txt small>
                {t(
                  "Saved received turns: " + past.guidance.moveCount,
                  "已保存的接收转动：" + past.guidance.moveCount,
                )}
              </Txt>
              <Notice
                text={
                  past.smart.continuity === "net-state"
                    ? t(
                        "Only received turns and matching net states are known. Complete turn history and turning-speed statistics are unavailable.",
                        "仅能确认接收的转动及一致的净状态，无法提供完整转动历史或转速统计。",
                      )
                    : t(
                        "Received turns were checked against the declared hardware counter; this is not a ranked physical result.",
                        "接收的转动按声明的硬件计数核对，不构成排名实物成绩。",
                      )
                }
              />
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}
