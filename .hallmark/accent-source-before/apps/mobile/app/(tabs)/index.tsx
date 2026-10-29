import { SponsorCards } from "../../src/SponsorCards";
import { AnnouncementCards } from "../../src/Announcements";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { DiscoveryStories } from "../../src/DiscoveryStories";
import { PostComposer } from "../../src/PostComposer";
import { PostCard } from "../../src/PostCard";
import { ClubDirectory } from "../../src/ClubDirectory";
import type { CommunityPost } from "../../src/community.shared";
import { useApp } from "../../src/state";
import {
  Screen,
  Heading,
  Txt,
  Button,
  Row,
  Chip,
  Field,
  Busy,
  Empty,
  Notice,
} from "../../src/ui";
export default function Discover() {
  const { token, region, user } = useApp();
  return (
    <DiscoverView
      key={JSON.stringify([
        token,
        region,
        user?.permissions?.canLearn,
        user?.permissions?.canPost,
      ])}
    />
  );
}
function DiscoverView() {
  const params = useLocalSearchParams<{ tag?: string }>();
  const { t, api, user } = useApp(),
    [section, setSection] = useState("community"),
    [kind, setKind] = useState("explore"),
    [posts, setPosts] = useState<CommunityPost[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [tag, setTag] = useState(params.tag || ""),
    [q, setQ] = useState(""),
    [compose, setCompose] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    async (append = false) => {
      setBusy(true);
      try {
        const result = await api(
          `feed?kind=${kind}&q=${encodeURIComponent(q)}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}${append && cursor ? `&cursor=${cursor}` : ""}`,
        );
        setPosts((previous) =>
          append
            ? [
                ...previous,
                ...result.items.filter(
                  (item: CommunityPost) =>
                    !previous.some((old) => old.id === item.id),
                ),
              ]
            : result.items,
        );
        setCursor(result.nextCursor);
        setError("");
      } catch (error) {
        setError((error as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [api, kind, q, tag, cursor],
  );
  const latestLoad = useRef(load);
  latestLoad.current = load;
  useEffect(() => {
    if (params.tag) {
      setTag(params.tag);
      setKind("explore");
    }
  }, [params.tag]);
  useFocusEffect(
    useCallback(() => {
      void latestLoad.current();
    }, [api, kind, tag]),
  );
  return (
    <Screen>
      <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
        <Heading>{t("Discover", "发现")}</Heading>
        <Button
          small
          kind="secondary"
          label={t("Keep learning", "继续学习")}
          onPress={() => router.push("/(tabs)/learn")}
        />
      </Row>
      <Row style={{ gap: 10 }}>
        {[
          ["community", "Community", "社区"],
          ["ideas", "Explore cubing", "探索魔方"],
          ["updates", "Updates", "公告"],
        ].map(([id, en, zh]) => (
          <Chip
            key={id}
            label={t(en, zh)}
            selected={section === id}
            onPress={() => setSection(id)}
          />
        ))}
      </Row>
      {section === "ideas" && <DiscoveryStories />}
      {section === "updates" && <AnnouncementCards />}
      {section === "community" && (
        <>
          <Row style={{ justifyContent: "space-between", paddingTop: 8 }}>
            <Txt
              accessibilityRole="header"
              style={{ fontSize: 22, lineHeight: 29, fontWeight: "600" }}
            >
              {t("Around the community", "看看社区新鲜事")}
            </Txt>
            <Button
              small
              label={
                compose
                  ? t("Close composer", "关闭编辑")
                  : t("Share a moment", "分享此刻")
              }
              onPress={() => setCompose(!compose)}
            />
          </Row>
          <Row>
            {[
              ["explore", "Explore", "探索"],
              ["following", "Following", "关注"],
              ["clubs", "Clubs", "社团"],
              ["saved", "Saved", "收藏"],
            ].map(([id, en, zh]) => (
              <Chip
                key={id}
                label={t(en, zh)}
                selected={kind === id}
                onPress={() => setKind(id)}
              />
            ))}
          </Row>
          <Row style={{ alignItems: "flex-end" }}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field
                label={t("Search conversations", "搜索讨论")}
                maxLength={100}
                value={q}
                onChangeText={setQ}
                onSubmitEditing={() => void load()}
                placeholder={t(
                  "An idea, a puzzle, a little inspiration…",
                  "一种想法，一款魔方，一点灵感……",
                )}
              />
            </View>
            <Button
              small
              kind="secondary"
              label={t("Search", "搜索")}
              onPress={() => void load()}
            />
          </Row>
          {!!tag && (
            <Row>
              <Chip selected label={`#${tag}`} onPress={() => setTag("")} />
              <Button
                small
                kind="secondary"
                label={t("Clear tag", "清除标签")}
                onPress={() => setTag("")}
              />
            </Row>
          )}
          {compose && (
            <PostComposer
              onCancel={() => setCompose(false)}
              onSubmitted={() => {
                setCompose(false);
                setMessage(
                  t(
                    "Your post is in the review queue. Check its status in Profile.",
                    "帖子已进入审核队列，请在个人页查看状态。",
                  ),
                );
                void load();
              }}
            />
          )}
          {kind === "clubs" && <ClubDirectory />}
          {!!message && <Notice text={message} />}
          {!!error && <Notice text={error} error />}
          {busy && posts.length === 0 ? (
            <Busy />
          ) : posts.length === 0 ? (
            <Empty
              title={t("There’s room for your story.", "这里期待你的故事。")}
              body={t(
                "No published posts here yet. Conversations appear after community review.",
                "暂时还没有已发布的帖子，审核通过的讨论会显示在这里。",
              )}
            />
          ) : (
            posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onChanged={() => void load()}
                onTag={(tag) => {
                  setKind("explore");
                  setTag(tag);
                }}
              />
            ))
          )}
          {cursor && (
            <Button
              kind="secondary"
              label={
                busy
                  ? t("Loading…", "加载中……")
                  : t("More conversations", "更多讨论")
              }
              disabled={busy}
              onPress={() => void load(true)}
            />
          )}
          <SponsorCards />
        </>
      )}
    </Screen>
  );
}
