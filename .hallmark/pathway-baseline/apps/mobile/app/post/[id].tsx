import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  router,
  useLocalSearchParams,
  useFocusEffect,
  Redirect,
} from "expo-router";
import { useApp } from "../../src/state";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Field,
  Button,
  Notice,
  Row,
  Busy,
} from "../../src/ui";
import { PostCard } from "../../src/PostCard";
import { PostComposer } from "../../src/PostComposer";
import {
  commentTree,
  mergeCommentPage,
  type CommentPage,
  type CommunityPost,
  type ThreadComment,
} from "../../src/community.shared";
export default function Discussion() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>(),
    { api, t, token, user } = useApp();
  const [post, setPost] = useState<CommunityPost>(),
    [comments, setComments] = useState<ThreadComment[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loadingReplies, setLoadingReplies] = useState(false),
    [body, setBody] = useState(""),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(edit === "1"),
    [replyTo, setReplyTo] = useState<ThreadComment>(),
    [deleting, setDeleting] = useState(false);
  const generation = useRef(0),
    paging = useRef(false);
  useEffect(() => {
    setBody("");
    setReason("");
    setDeleting(false);
    setEditing(edit === "1");
  }, [id, token, edit]);
  const load = useCallback(async () => {
    const current = ++generation.current;
    paging.current = false;
    setLoadingReplies(false);
    setBusy(false);
    setMessage("");
    setPost(undefined);
    setComments([]);
    setCursor(null);
    setReplyTo(undefined);
    try {
      const post = await api<CommunityPost>(`posts/${id}`);
      const page =
        post.status === "PUBLISHED"
          ? await api<CommentPage>(`posts/${id}/comments/page`)
          : { items: [], context: [], nextCursor: null };
      if (current !== generation.current) return;
      setPost(post);
      setComments(mergeCommentPage([], page));
      setCursor(page.nextCursor);
    } catch (error) {
      if (current !== generation.current) return;
      setPost(undefined);
      setComments([]);
      setCursor(null);
      setMessage((error as Error).message);
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
  async function moreReplies() {
    if (!cursor || paging.current) return;
    const current = generation.current;
    paging.current = true;
    setLoadingReplies(true);
    try {
      const page = await api<CommentPage>(
        `posts/${id}/comments/page?cursor=${encodeURIComponent(cursor)}`,
      );
      if (current !== generation.current) return;
      setComments((rows) => mergeCommentPage(rows, page));
      setCursor(page.nextCursor);
      setMessage("");
    } catch (error) {
      if (current === generation.current) {
        const failure = error as Error & { status?: number };
        if (failure.status === 403 || failure.status === 404) {
          setPost(undefined);
          setComments([]);
          setCursor(null);
          setReplyTo(undefined);
        }
        setMessage(
          failure.status === 400
            ? t(
                "This saved page expired or changed. Refresh the discussion to continue.",
                "保存的分页位置已过期或发生变化，请刷新讨论后继续。",
              )
            : failure.message,
        );
      }
    } finally {
      if (current === generation.current) {
        paging.current = false;
        setLoadingReplies(false);
      }
    }
  }
  async function send() {
    const current = generation.current;
    setBusy(true);
    try {
      await api(`posts/${id}/comments`, {
        body,
        ...(replyTo ? { parentId: replyTo.id } : {}),
      });
      if (current !== generation.current) return;
      setBody("");
      setReplyTo(undefined);
      setMessage(t("Reply submitted for review.", "回复已提交审核。"));
    } catch (error) {
      if (current === generation.current) setMessage((error as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  if (!token) return <Redirect href="/" />;
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("Back", "返回")}
        onPress={() => router.back()}
      />
      <Heading>{t("Keep the conversation going.", "继续聊聊。")}</Heading>
      {!post ? (
        message ? (
          <Notice text={message} error />
        ) : (
          <Busy />
        )
      ) : (
        <>
          <PostCard
            post={post}
            detail
            onChanged={() => void load()}
            onEdit={() => setEditing(true)}
          />
          {editing && post.author.id === user?.id && (
            <PostComposer
              key={post.revision}
              initial={post}
              onCancel={() => setEditing(false)}
              onSubmitted={() => {
                setEditing(false);
                setMessage(
                  t("Changes sent for a fresh review.", "修改已提交重新审核。"),
                );
                void load();
              }}
            />
          )}
          {post.author.id === user?.id && (
            <Row>
              <Button
                small
                kind="secondary"
                disabled={busy}
                label={
                  deleting
                    ? t("Confirm deleting this post", "确认删除此帖子")
                    : t("Delete my post", "删除我的帖子")
                }
                onPress={() => {
                  if (!deleting) setDeleting(true);
                  else {
                    setBusy(true);
                    void api(`posts/${id}`, undefined, "DELETE")
                      .then(() => router.back())
                      .catch((error) => {
                        setMessage(error.message);
                        setBusy(false);
                      });
                  }
                }}
              />
            </Row>
          )}
          {post.status === "PUBLISHED" && (
            <>
              {commentTree(comments).map(({ comment, depth }) => (
                <View
                  key={comment.id}
                  style={{ marginLeft: Math.min(depth, 4) * 12 }}
                >
                  <Card>
                    <Button
                      small
                      kind="secondary"
                      label={comment.author.displayName}
                      onPress={() =>
                        router.push({
                          pathname: "/profile/[id]",
                          params: { id: comment.author.id },
                        })
                      }
                    />
                    <Txt>{comment.body}</Txt>
                    {depth < 5 &&
                      user?.permissions.canPost &&
                      !user.permissions.needsPostApproval && (
                        <Button
                          small
                          kind="secondary"
                          label={t("Reply", "回复")}
                          onPress={() => setReplyTo(comment)}
                        />
                      )}
                  </Card>
                </View>
              ))}
              {cursor && (
                <Button
                  kind="secondary"
                  label={t("More replies", "更多回复")}
                  disabled={loadingReplies || busy}
                  onPress={() => void moreReplies()}
                />
              )}
              <Button
                small
                kind="secondary"
                label={t("Refresh discussion", "刷新讨论")}
                disabled={loadingReplies || busy}
                onPress={() => void load()}
              />
              {user?.permissions.canPost &&
              !user.permissions.needsPostApproval ? (
                <Card>
                  {replyTo && (
                    <Row>
                      <Txt small>
                        {t("Replying to", "回复给")}{" "}
                        {replyTo.author.displayName}
                      </Txt>
                      <Button
                        small
                        kind="secondary"
                        label={t("Cancel reply", "取消回复")}
                        onPress={() => setReplyTo(undefined)}
                      />
                    </Row>
                  )}
                  <Field
                    label={t("Your reply", "你的回复")}
                    value={body}
                    onChangeText={setBody}
                    multiline
                    maxLength={1000}
                  />
                  <Button
                    label={t("Send for moderation", "提交审核")}
                    onPress={() => void send()}
                    disabled={busy || !body.trim()}
                  />
                </Card>
              ) : (
                <Notice
                  text={t(
                    "Younger-child contributions use a guardian-reviewed post. Replying also requires posting eligibility.",
                    "低龄儿童请使用经监护人审核的帖子参与。回复也需要相应的发布资格。",
                  )}
                />
              )}
            </>
          )}
          <Card>
            <Field
              label={t("Report a concern", "举报问题")}
              value={reason}
              onChangeText={setReason}
              maxLength={1000}
              multiline
            />
            <Button
              kind="secondary"
              label={t("Send report", "提交举报")}
              onPress={() => {
                setBusy(true);
                void api("reports", { targetId: id, reason })
                  .then(() => {
                    setReason("");
                    setMessage(t("Report received.", "已收到举报。"));
                  })
                  .catch((error) => setMessage(error.message))
                  .finally(() => setBusy(false));
              }}
              disabled={busy || reason.trim().length < 5}
            />
          </Card>
          {!!message && <Notice text={message} />}
        </>
      )}
    </Screen>
  );
}
