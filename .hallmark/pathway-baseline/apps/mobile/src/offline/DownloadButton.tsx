import React, { useEffect, useRef, useState } from "react";
import { useApp } from "../state";
import { Button, Notice } from "../ui";
import { offlineLibrary } from "./storage";
export function DownloadButton({
  id,
  practice,
  disabled,
}: {
  id: string;
  practice?: { id: string; version: number };
  disabled?: boolean;
}) {
  const { t, api, token, region, user } = useApp();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const identity = useRef("");
  identity.current = `${token}:${region}:${id}:${practice?.id}:${practice?.version}`;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function download() {
    if (!token || !user?.permissions.canLearn || busy || disabled) return;
    const key = identity.current,
      active = () => mounted.current && identity.current === key;
    offlineLibrary.setContext({ token, region, ownerId: user.id });
    setBusy(true);
    setMessage("");
    try {
      const packet = await api(
        practice
          ? `first-solves/${encodeURIComponent(practice.id)}/download`
          : `courses/${encodeURIComponent(id)}/download`,
        practice
          ? { version: practice.version }
          : { includeAlternatives: true },
      );
      if (!active()) return;
      await offlineLibrary.save(packet);
      if (active())
        setMessage(
          t(
            "Downloaded for up to 24 hours. Find it in Downloaded lessons.",
            "已下载，最多可使用 24 小时，可在“已下载课程”中打开。",
          ),
        );
    } catch (error) {
      if (active()) {
        setMessage(
          t(
            "Could not download. Reconnect and check your account permission.",
            "下载失败，请联网并检查账号使用权限。",
          ),
        );
        if ([401, 403].includes((error as any).status))
          await offlineLibrary.clear().catch(() => {});
      }
    } finally {
      if (active()) setBusy(false);
    }
  }
  return (
    <>
      <Button
        small
        kind="secondary"
        label={
          busy
            ? t("Downloading…", "下载中…")
            : practice
              ? t("Download remaining guidance", "下载剩余指导")
              : t("Download this lesson", "下载本课")
        }
        disabled={busy || !!disabled || !user?.permissions.canLearn}
        onPress={() => void download()}
      />
      {!!message && <Notice text={message} />}
    </>
  );
}
