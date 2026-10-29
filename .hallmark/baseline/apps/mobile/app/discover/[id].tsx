import React, { useCallback, useRef, useState } from "react";
import {
  router,
  Redirect,
  useLocalSearchParams,
  useFocusEffect,
} from "expo-router";
import { DiscoveryStory, type DiscoveryStoryView } from "@cubers/core";
import { useApp } from "../../src/state";
import { Screen, Heading, Card, Txt, Button, Notice, Busy } from "../../src/ui";
export default function StoryPage() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { token, region, user } = useApp();
  if (!token) return <Redirect href="/" />;
  return (
    <Story
      key={JSON.stringify([id, token, region, user?.permissions?.canLearn])}
      id={id}
    />
  );
}
function Story({ id }: { id: string }) {
  const { api, locale, t } = useApp(),
    [story, setStory] = useState<DiscoveryStoryView>(),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const view = ++generation.current;
    setStory(undefined);
    setError(false);
    setBusy(true);
    try {
      if (typeof id !== "string" || !/^[a-z][a-z0-9-]{1,59}$/.test(id))
        throw Error("Invalid story");
      const story = DiscoveryStory.parse(await api(`discovery/${id}`));
      if (story.id !== id) throw Error("Story mismatch");
      if (view === generation.current) setStory(story);
    } catch {
      if (view === generation.current) setError(true);
    } finally {
      if (view === generation.current) setBusy(false);
    }
  }, [api, id]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        generation.current++;
      };
    }, [load]),
  );
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("← Discover", "← 返回探索")}
        onPress={() => router.replace("/(tabs)")}
      />
      {busy && <Busy />}
      {error && (
        <>
          <Notice
            error
            text={t(
              "This reading is unavailable. Check your connection and current learning permission, then retry.",
              "暂时无法阅读，请检查网络与当前学习授权后重试。",
            )}
          />
          <Button label={t("Try again", "重试")} onPress={() => void load()} />
        </>
      )}
      {story && (
        <>
          <Heading
            eyebrow={
              t("Cubers original · ", "Cubers 原创 · ") +
              (story.puzzle === "pyraminx"
                ? t("Pyraminx", "金字塔魔方")
                : story.puzzle.replace("x", "×"))
            }
          >
            {story.title[locale]}
          </Heading>
          <Txt style={{ fontSize: 20 }}>{story.summary[locale]}</Txt>
          {story.paragraphs.map((paragraph, index) => (
            <Txt key={index}>{paragraph[locale]}</Txt>
          ))}
          <Card>
            <Txt
              accessibilityRole="header"
              style={{ fontSize: 21, fontWeight: "700" }}
            >
              {t("Your small next step", "接下来，试一小步")}
            </Txt>
            <Txt>{story.activity[locale]}</Txt>
            <Txt small>
              {t(
                "Reading this page does not award progress. Lessons check the actual puzzle; use a virtual puzzle or a physical scan where supported. Smart-cube learning is not yet available.",
                "阅读本页不会新增进度。课程会检查实际魔方状态，可使用虚拟魔方或受支持的实物扫描。智能魔方学习暂未开放。",
              )}
            </Txt>
            {story.actions.map((action) => (
              <Button
                key={action.courseId}
                label={action.title[locale] + " →"}
                onPress={() =>
                  router.push({
                    pathname: "/lesson/[id]",
                    params: { id: action.courseId },
                  })
                }
              />
            ))}
            {!story.actions.length && (
              <Notice
                text={t(
                  "The linked lessons are not currently published in this community. You can still read this introduction.",
                  "相关课程暂未在当前社区发布，仍可阅读这篇介绍。",
                )}
              />
            )}
          </Card>
          <Button
            small
            kind="secondary"
            label={t("Refresh lesson availability", "刷新课程可用状态")}
            onPress={() => void load()}
          />
        </>
      )}
    </Screen>
  );
}
