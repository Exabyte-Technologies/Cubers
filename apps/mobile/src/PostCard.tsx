import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import type { CommunityPost } from "./community.shared";
import { useApp } from "./state";
import { MediaAttachment } from "./MediaAttachment";
import { Button, Card, Row, Txt, Chip, Notice, useTheme } from "./ui";
export function PostCard({
  post,
  onChanged,
  onTag,
  onEdit,
  detail = false,
}: {
  post: CommunityPost;
  onChanged?: () => void;
  onTag?: (tag: string) => void;
  onEdit?: () => void;
  detail?: boolean;
}) {
  const { api, t, user, locale } = useApp(),
    c = useTheme(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function social(kind: string, enabled: boolean) {
    setBusy(true);
    setMessage("");
    try {
      await api("social", {
        targetId: ["like", "save"].includes(kind) ? post.id : post.author.id,
        kind,
        enabled,
      });
      onChanged?.();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const own = post.author.id === user?.id;
  return (
    <Card style={{ padding: 24, gap: 18 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            t("View profile: ", "查看个人页：") + post.author.displayName
          }
          style={({ pressed }) => ({
            minHeight: 44,
            opacity: pressed ? 0.7 : 1,
          })}
          onPress={() =>
            router.push({
              pathname: "/profile/[id]",
              params: { id: post.author.id },
            })
          }
        >
          <Row>
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 17,
                backgroundColor: c.lavender,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Txt style={{ fontWeight: "600" }}>
                {post.author.displayName.slice(0, 1)}
              </Txt>
            </View>
            <View>
              <Txt style={{ fontWeight: "600" }}>{post.author.displayName}</Txt>
              <Txt small style={{ color: c.muted }}>
                {new Date(post.createdAt).toLocaleDateString(
                  locale === "zh" ? "zh-CN" : "en-US",
                )}
              </Txt>
            </View>
          </Row>
        </Pressable>
        {!own && (
          <Button
            small
            kind="secondary"
            label={t("Connect", "建立关系")}
            onPress={() =>
              router.push({
                pathname: "/connections",
                params: {
                  targetId: post.author.id,
                  ...(post.clubId ? { clubId: post.clubId } : {}),
                },
              })
            }
          />
        )}
        {!own && (
          <Button
            small
            kind={post.viewer.following ? "primary" : "secondary"}
            label={
              post.viewer.following
                ? t("Following", "已关注")
                : t("Follow", "关注")
            }
            disabled={busy}
            onPress={() => void social("follow", !post.viewer.following)}
          />
        )}
      </Row>
      {post.kind === "ANNOUNCEMENT" && (
        <Txt small style={{ fontWeight: "600", color: c.green }}>
          {t("Club announcement", "社团公告")}
        </Txt>
      )}
      {post.aiGenerated && (
        <Notice
          text={
            post.aiSourceLabel === "1"
              ? t(
                  "The source file labels this as AI-generated. Origin has not been authenticated.",
                  "源文件标注为 AI 生成，来源尚未经认证。",
                )
              : post.aiSourceLabel === "2"
                ? t(
                    "The source file labels this as possibly AI-generated. Origin has not been authenticated.",
                    "源文件标注为可能的 AI 生成内容，来源尚未经认证。",
                  )
                : post.aiSourceLabel === "3"
                  ? t(
                      "The source file labels this as suspected AI-generated content. Origin has not been authenticated.",
                      "源文件标注为疑似 AI 生成内容，来源尚未经认证。",
                    )
                  : t(
                      "Author-declared: possibly AI-generated or AI-assisted content.",
                      "作者声明：可能含 AI 生成或 AI 辅助内容。",
                    )
          }
        />
      )}
      {own && post.status !== "PUBLISHED" && (
        <Notice
          text={
            post.status === "REJECTED"
              ? `${t("Not approved", "未通过审核")}${post.reason ? `: ${post.reason}` : ""}`
              : t(
                  "Awaiting review and any required guardian approval.",
                  "等待审核及适用的监护人批准。",
                )
          }
        />
      )}
      <Txt selectable>{post.body}</Txt>
      {(post.mediaIds || []).map((id) => (
        <MediaAttachment key={id} id={id} postId={post.id} />
      ))}
      <Row>
        {post.tags.map((tag) => (
          <Chip
            key={tag}
            label={`#${tag}`}
            onPress={() =>
              onTag
                ? onTag(tag)
                : router.push({ pathname: "/(tabs)", params: { tag } })
            }
          />
        ))}
      </Row>
      {post.clubId && (
        <Button
          small
          kind="secondary"
          label={t("Open club", "查看社团")}
          onPress={() => router.push(`/club/${post.clubId}`)}
        />
      )}
      <Row>
        {post.status === "PUBLISHED" && (
          <>
            <Button
              small
              kind={post.viewer.liked ? "primary" : "secondary"}
              label={`${post.viewer.liked ? t("Liked", "已点赞") : t("Like", "点赞")} (${post.likes})`}
              disabled={busy}
              onPress={() => void social("like", !post.viewer.liked)}
            />
            {!detail && (
              <Button
                small
                kind="secondary"
                label={`${t("Discuss", "讨论")} (${post._count.comments})`}
                onPress={() => router.push(`/post/${post.id}`)}
              />
            )}
            <Button
              small
              kind={post.viewer.saved ? "primary" : "secondary"}
              label={
                post.viewer.saved ? t("Saved", "已收藏") : t("Save", "收藏")
              }
              disabled={busy}
              onPress={() => void social("save", !post.viewer.saved)}
            />
          </>
        )}
        {own ? (
          <Button
            small
            kind="secondary"
            label={t("Edit", "编辑")}
            onPress={() =>
              onEdit
                ? onEdit()
                : router.push({
                    pathname: "/post/[id]",
                    params: { id: post.id, edit: "1" },
                  })
            }
          />
        ) : (
          <>
            <Button
              small
              kind="secondary"
              label={t("Mute", "静音")}
              disabled={busy}
              onPress={() => void social("mute", true)}
            />
            <Button
              small
              kind="secondary"
              label={t("Block", "屏蔽")}
              disabled={busy}
              onPress={() => void social("block", true)}
            />
            {!detail && (
              <Button
                small
                kind="secondary"
                label={t("Report", "举报")}
                onPress={() => router.push(`/post/${post.id}`)}
              />
            )}
          </>
        )}
      </Row>
      {!!message && <Notice text={message} error />}
    </Card>
  );
}
