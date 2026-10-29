import React, { useEffect, useRef, useState } from "react";
import { Switch } from "react-native";
import { useApp } from "./state";
import { choosePostMedia } from "./post-media";
import { type MediaDraft, parsePostTags } from "./post-media.shared";
import { MediaAttachment } from "./MediaAttachment";
import { Button, Card, Row, Field, Txt, Notice, Chip } from "./ui";
export type EditablePost = {
  id: string;
  body: string;
  tags: string[];
  mediaIds: string[];
  clubId?: string | null;
  kind: string;
  aiGenerated: boolean;
  revision: number;
};
export function PostComposer({
  clubId,
  canAnnounce = false,
  initial,
  onSubmitted,
  onCancel,
}: {
  clubId?: string;
  canAnnounce?: boolean;
  initial?: EditablePost;
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const { api, t, user } = useApp(),
    [body, setBody] = useState(initial?.body || ""),
    [tags, setTags] = useState(initial?.tags.join(" ") || ""),
    [aiGenerated, setAiGenerated] = useState(initial?.aiGenerated || false),
    [attachmentAi, setAttachmentAi] = useState(false),
    [kind, setKind] = useState(initial?.kind || "DISCUSSION");
  const [media, setMedia] = useState<MediaDraft[]>(
      initial?.mediaIds.map((id) => ({ id, type: "" })) || [],
    ),
    [states, setStates] = useState<Record<string, string>>(
      Object.fromEntries((initial?.mediaIds || []).map((id) => [id, "READY"])),
    );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [discarding, setDiscarding] = useState(false);
  const alive = useRef(true),
    owned = useRef(new Set<string>());
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const id of owned.current)
        void api(`media/${id}`, undefined, "DELETE").catch(() => {});
    };
  }, []);
  async function attach(type: "image" | "video") {
    setBusy(true);
    setMessage("");
    try {
      const item = await choosePostMedia(api, type, attachmentAi);
      if (!item) return;
      if (!alive.current) {
        await api(`media/${item.id}`, undefined, "DELETE").catch(() => {});
        return;
      }
      owned.current.add(item.id);
      setMedia((rows) => [...rows, item]);
      setStates((rows) => ({ ...rows, [item.id]: "PROCESSING" }));
    } catch (error) {
      if (alive.current) setMessage((error as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function remove(id: string) {
    setMedia((rows) => rows.filter((item) => item.id !== id));
    if (owned.current.has(id)) {
      owned.current.delete(id);
      await api(`media/${id}`, undefined, "DELETE").catch(() => {});
    }
  }
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const payload = {
        body,
        tags: parsePostTags(tags),
        mediaIds: media.map((item) => item.id),
        aiGenerated,
        kind,
        ...(clubId || initial?.clubId
          ? { clubId: clubId || initial?.clubId }
          : {}),
        ...(initial ? { revision: initial.revision } : {}),
      };
      await api(
        initial ? `posts/${initial.id}` : "posts",
        payload,
        initial ? "PATCH" : "POST",
      );
      owned.current.clear();
      onSubmitted();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Card>
      <Txt style={{ fontSize: 20, fontWeight: "700" }}>
        {initial
          ? t("Edit your post", "编辑帖子")
          : t("What have you been working on?", "最近在练什么？")}
      </Txt>
      <Notice
        text={t(
          "Keep schools, locations and contact details private. Share only content you have permission to publish. Posts need moderation; younger children's posts also need guardian approval. Editing requires a new review.",
          "请勿公开学校、位置或联系方式，只分享你有权发布的内容。帖子须经审核，低龄儿童的帖子还需监护人批准。编辑后需要重新审核。",
        )}
      />
      {(clubId || initial?.clubId) && canAnnounce && (
        <Row>
          {["DISCUSSION", "ANNOUNCEMENT"].map((value) => (
            <Chip
              key={value}
              label={
                value === "ANNOUNCEMENT"
                  ? t("Club announcement", "社团公告")
                  : t("Discussion", "讨论")
              }
              selected={kind === value}
              onPress={() => setKind(value)}
            />
          ))}
        </Row>
      )}
      <Field
        label={t("Your story", "你的故事")}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={4000}
        style={{ minHeight: 110 }}
      />
      <Field
        label={t("Tags · up to five", "标签 · 最多五个")}
        value={tags}
        onChangeText={setTags}
        maxLength={160}
        placeholder={t("3x3 beginner practice", "三阶 入门 练习")}
      />
      <Row style={{ justifyContent: "space-between" }}>
        <Txt small>
          {t(
            "Contains AI-generated or AI-assisted content",
            "含 AI 生成或 AI 辅助内容",
          )}
        </Txt>
        <Switch
          accessibilityLabel={t("Declare AI content", "声明 AI 内容")}
          value={aiGenerated}
          onValueChange={setAiGenerated}
        />
      </Row>
      <Txt small>
        {t(
          "Up to four attachments. Original JPEG/PNG photos: 10 MB; videos: 50 MB and 90 seconds. Attachments upload privately before submission. Recognized photo/video AI source labels are preserved; other file metadata and video audio are removed. A source label is an unverified claim and stays on the post while that file is attached. Preview before sending.",
          "最多四个附件。原始 JPEG/PNG 照片限 10 MB，视频限 50 MB、90 秒。附件会在提交前私密上传。已识别的照片及视频 AI 来源标识会保留，其他文件元数据和视频音轨会移除。来源标识尚未经认证，保留该文件时，帖子也会保留标识。提交前请预览。",
        )}
      </Txt>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt small>
          {t(
            "Next attachments contain AI-generated content",
            "接下来添加的附件含 AI 生成内容",
          )}
        </Txt>
        <Switch
          accessibilityLabel={t(
            "Declare AI in new attachments",
            "声明新附件中的 AI 内容",
          )}
          value={attachmentAi}
          onValueChange={setAttachmentAi}
          disabled={busy}
        />
      </Row>
      <Txt small>
        {t(
          "Choose this before adding a file. Declared or source-labelled files receive visible and embedded labels, including downloads. Labelled videos are converted to silent H.264 and may hold their final frame to show the label for two seconds. A file's declaration cannot be cleared; remove it and upload a replacement if it was incorrect.",
          "请在添加文件前选择。已声明或带来源标识的文件会添加可见及内嵌标识，下载时也会保留。带标识的视频将转换为无声 H.264；短视频可能定格末帧，使标识至少显示两秒。文件声明不能清除；如声明有误，请移除后重新上传。",
        )}
      </Txt>
      {media.map((item) => (
        <Card key={item.id}>
          <MediaAttachment
            id={item.id}
            onStatus={(status) =>
              setStates((rows) =>
                rows[item.id] === status
                  ? rows
                  : { ...rows, [item.id]: status },
              )
            }
          />
          <Button
            small
            kind="secondary"
            label={t("Remove attachment", "移除附件")}
            disabled={busy}
            onPress={() => void remove(item.id)}
          />
        </Card>
      ))}
      <Row>
        <Button
          small
          kind="secondary"
          label={t("Add photo", "添加照片")}
          disabled={busy || media.length >= 4 || !user?.permissions.canPost}
          onPress={() => void attach("image")}
        />
        <Button
          small
          kind="secondary"
          label={t("Add short video", "添加短视频")}
          disabled={busy || media.length >= 4 || !user?.permissions.canPost}
          onPress={() => void attach("video")}
        />
      </Row>
      <Button
        label={
          busy
            ? t("Please wait…", "请稍候……")
            : t("Send for review", "提交审核")
        }
        disabled={
          busy ||
          !body.trim() ||
          !user?.permissions.canPost ||
          media.some((item) => states[item.id] !== "READY")
        }
        onPress={() => void submit()}
      />
      {discarding ? (
        <Row>
          <Button
            small
            kind="danger"
            label={t("Discard this draft", "放弃此草稿")}
            disabled={busy}
            onPress={onCancel}
          />
          <Button
            small
            kind="secondary"
            label={t("Keep editing", "继续编辑")}
            onPress={() => setDiscarding(false)}
          />
        </Row>
      ) : (
        <Button
          small
          kind="secondary"
          label={t("Close editor", "关闭编辑")}
          disabled={busy}
          onPress={() => {
            if (body.trim() || media.length) setDiscarding(true);
            else onCancel();
          }}
        />
      )}
      {!user?.permissions.canPost && (
        <Notice
          text={t(
            "Posting requires eligibility verification and applicable guardian permission.",
            "发布需要完成相应身份验证，并取得适用的监护人许可。",
          )}
        />
      )}
      {!!message && <Notice text={message} error />}
    </Card>
  );
}
