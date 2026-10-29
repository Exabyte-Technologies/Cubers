import React, { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { DiscoveryResponse, type DiscoveryStoryView } from "@cubers/core";
import { useApp } from "./state";
import { Txt, Button, Notice, Row, useTheme } from "./ui";
export function DiscoveryStories() {
  const { api, locale, t, user } = useApp(),
    c = useTheme();
  const allowed = !!user?.permissions?.canLearn;
  const [items, setItems] = useState<DiscoveryStoryView[]>([]),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const view = ++generation.current;
    setBusy(true);
    setFailed(false);
    setItems([]);
    if (!allowed) {
      setBusy(false);
      return;
    }
    try {
      const result = DiscoveryResponse.parse(await api("discovery"));
      if (view === generation.current) setItems(result.items);
    } catch {
      if (view === generation.current) setFailed(true);
    } finally {
      if (view === generation.current) setBusy(false);
    }
  }, [api, allowed]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        generation.current++;
      };
    }, [load]),
  );
  if (!allowed)
    return (
      <Notice
        text={t(
          "Reading and lessons need current guardian learning permission for a child account.",
          "儿童账号阅读短文与课程前，需要当前有效的监护学习授权。",
        )}
      />
    );
  return (
    <>
      <Txt
        style={{ fontSize: 25, lineHeight: 32, fontWeight: "600" }}
        accessibilityRole="header"
      >
        {t("A little curiosity goes a long way", "带着好奇，开始探索")}
      </Txt>
      <Txt small>
        {t(
          "Original Cubers reading and small activities. No timer, audience or equipment needed to explore a virtual puzzle.",
          "Cubers 原创短文与小练习。用虚拟魔方探索，不需要计时、观众或额外设备。",
        )}
      </Txt>
      {items.map((story) => (
        <View
          key={story.id}
          style={{
            backgroundColor: story.kind === "activity" ? c.mint : c.softBlue,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: c.line,
            padding: 20,
            gap: 12,
          }}
        >
          <Txt style={{ fontSize: 23, lineHeight: 30, fontWeight: "600" }}>
            {story.title[locale]}
          </Txt>
          <Row style={{ gap: 12 }}>
            <Txt small style={{ color: c.ink }}>
              {story.kind === "activity"
                ? t("Try something", "动手试试")
                : t("A new perspective", "换个角度看")}
            </Txt>
            <Txt small style={{ color: c.ink }}>
              {t("Cubers", "Cubers 原创")}
            </Txt>
            <Txt small style={{ color: c.ink }}>
              {story.puzzle === "pyraminx"
                ? t("Pyraminx", "金字塔魔方")
                : story.puzzle.replace("x", "×")}
            </Txt>
          </Row>
          <Txt style={{ color: c.ink }}>{story.summary[locale]}</Txt>
          <Row>
            <Button
              small
              kind="secondary"
              label={t("Read and explore", "读一读，试一试")}
              onPress={() => router.push(`/discover/${story.id}`)}
            />
          </Row>
        </View>
      ))}
      {busy && <Txt small>{t("Loading ideas…", "正在寻找灵感……")}</Txt>}
      {failed && (
        <>
          <Notice
            error
            text={t(
              "Could not load Cubers stories. You can still open Learn when connected.",
              "暂时无法载入原创短文，联网后仍可前往学习页。",
            )}
          />
          <Button
            small
            kind="secondary"
            label={t("Try again", "重试")}
            onPress={() => void load()}
          />
        </>
      )}
    </>
  );
}
