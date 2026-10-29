import React, { useCallback, useRef, useState } from "react";
import { Image, View, AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useApp } from "./state";
import { Button, Notice, Busy, Txt } from "./ui";
function VideoPreview({ url }: { url: string }) {
  const { t } = useApp();
  const player = useVideoPlayer({ uri: url, useCaching: false }, (player) => {
    player.muted = true;
    player.loop = false;
  });
  useFocusEffect(
    useCallback(() => {
      const sub = AppState.addEventListener("change", (state) => {
        if (state !== "active") player.pause();
      });
      return () => {
        player.pause();
        sub.remove();
      };
    }, [player]),
  );
  return (
    <VideoView
      accessibilityLabel={t(
        "Processed silent cubing video",
        "经过处理的无声魔方视频",
      )}
      player={player}
      nativeControls
      contentFit="contain"
      allowsPictureInPicture={false}
      style={{ width: "100%", height: 250, borderRadius: 16 }}
    />
  );
}
export function MediaAttachment({
  id,
  postId,
  onStatus,
}: {
  id: string;
  postId?: string;
  onStatus?: (status: string) => void;
}) {
  const { api, t } = useApp(),
    [media, setMedia] = useState<any>(),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [showVideo, setShowVideo] = useState(false);
  const statusCallback = useRef(onStatus);
  statusCallback.current = onStatus;
  useFocusEffect(
    useCallback(() => {
      setMedia(undefined);
      setError("");
      let active = true,
        timer: ReturnType<typeof setTimeout> | undefined,
        polls = 0;
      async function load() {
        try {
          const next = await api(
            `media/${id}${postId ? `?postId=${postId}` : ""}`,
          );
          if (!active) return;
          setMedia(next);
          setError("");
          statusCallback.current?.(next.status);
          if (next.status === "READY") timer = setTimeout(load, 90000);
          else if (
            ["PENDING", "PROCESSING"].includes(next.status) &&
            polls++ < 40
          )
            timer = setTimeout(load, 1500);
        } catch (error) {
          if (!active) return;
          setMedia(undefined);
          setShowVideo(false);
          setError((error as Error).message);
          statusCallback.current?.("UNAVAILABLE");
        }
      }
      void load();
      return () => {
        active = false;
        clearTimeout(timer);
        setShowVideo(false);
      };
    }, [api, id, postId, retry]),
  );
  return (
    <View style={{ gap: 8 }}>
      {media?.aiDeclared && (
        <Txt small>
          {t(
            "Author-declared: possibly AI-generated attachment",
            "作者声明：可能含 AI 生成内容的附件",
          )}
        </Txt>
      )}
      {error ? (
        <Notice text={error} error />
      ) : !media ? (
        <Busy />
      ) : media.status !== "READY" ? (
        <Txt small>
          {media.status === "REJECTED"
            ? t(
                "This file did not pass media validation.",
                "此文件未通过媒体检查。",
              )
            : media.status === "DELETING"
              ? t("Attachment removed.", "附件已移除。")
              : t("Processing your private upload…", "正在处理私密上传……")}
        </Txt>
      ) : media.type.startsWith("image/") ? (
        <Image
          accessibilityLabel={t("Cubing post photo", "魔方帖子照片")}
          source={{ uri: media.url }}
          style={{ width: "100%", height: 250, borderRadius: 16 }}
          resizeMode="contain"
          resizeMethod="resize"
        />
      ) : showVideo ? (
        <VideoPreview key={media.url} url={media.url} />
      ) : (
        <Button
          kind="secondary"
          label={t(
            `Play silent video${media.durationMs ? ` · ${(media.durationMs / 1000).toFixed(0)}s` : ""}`,
            `播放无声视频${media.durationMs ? ` · ${(media.durationMs / 1000).toFixed(0)} 秒` : ""}`,
          )}
          onPress={() => setShowVideo(true)}
        />
      )}
      {(error ||
        (media && media.status !== "READY" && media.status !== "DELETING")) && (
        <Button
          small
          kind="secondary"
          label={t("Check again", "再次检查")}
          onPress={() => setRetry((value) => value + 1)}
        />
      )}
    </View>
  );
}
