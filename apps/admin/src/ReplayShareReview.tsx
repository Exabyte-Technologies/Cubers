import React, { useEffect, useRef, useState } from "react";
import {
  ReplaySharePreview,
  ReplayTimeline,
  isPyraminx,
  facelets,
  pyraminxFacelets,
  type ReplayShareView,
} from "@cubers/core";
export function ReplayShareReview({
  api,
  locale,
  reloadKey,
}: {
  api: (path: string, body?: unknown) => Promise<any>;
  locale: "en" | "zh";
  reloadKey: number;
}) {
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en),
    epoch = useRef(0),
    live = useRef(true),
    apiRef = useRef(api);
  apiRef.current = api;
  const [rows, setRows] = useState<ReplayShareView[]>([]),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<{
      row: ReplayShareView;
      data: ReplaySharePreview;
      timeline: ReplayTimeline;
    }>(),
    [position, setPosition] = useState(0),
    [checked, setChecked] = useState(false),
    [reason, setReason] = useState("");
  async function load(more = false) {
    const run = ++epoch.current;
    setBusy(true);
    setError("");
    setPreview(undefined);
    setChecked(false);
    try {
      const result = await apiRef.current(
        "admin/replay-shares" +
          (more && next ? `?cursor=${encodeURIComponent(next)}` : ""),
      );
      if (live.current && run === epoch.current) {
        setRows((old) => (more ? [...old, ...result.items] : result.items));
        setNext(result.nextCursor);
      }
    } catch {
      if (live.current && run === epoch.current)
        setError(
          t(
            "Could not load current sharing reviews.",
            "无法加载当前分享审核。",
          ),
        );
    } finally {
      if (live.current && run === epoch.current) setBusy(false);
    }
  }
  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
      epoch.current++;
    };
  }, [reloadKey]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        epoch.current++;
        setPreview(undefined);
        setChecked(false);
        setBusy(false);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  async function inspect(row: ReplayShareView) {
    const run = ++epoch.current;
    setBusy(true);
    setPreview(undefined);
    setChecked(false);
    setPosition(0);
    setError("");
    try {
      const data = ReplaySharePreview.parse(
          await apiRef.current(`admin/replay-shares/${row.id}/preview`, {}),
        ),
        timeline = await ReplayTimeline.create(
          data.packet,
          () => new Promise((resolve) => setTimeout(resolve, 0)),
          () => live.current && run === epoch.current,
        );
      if (live.current && run === epoch.current)
        setPreview({ row, data, timeline });
    } catch {
      if (live.current && run === epoch.current)
        setError(
          t(
            "Preview unavailable or permission changed. Refresh.",
            "预览不可用或权限已变更，请刷新。",
          ),
        );
    } finally {
      if (live.current && run === epoch.current) setBusy(false);
    }
  }
  async function review(approve: boolean) {
    if (!preview || busy) return;
    const run = epoch.current;
    setBusy(true);
    setError("");
    try {
      await apiRef.current(`admin/replay-shares/${preview.row.id}/review`, {
        revision: preview.data.revision,
        packetDigest: preview.data.packetDigest,
        receipt: preview.data.receipt,
        approve,
        packetChecked: checked,
        reason,
      });
      if (live.current && run === epoch.current) {
        await load();
        setReason("");
      }
    } catch {
      if (live.current && run === epoch.current)
        setError(
          t(
            "Review changed, expired, or is no longer authorized. Refresh and inspect again.",
            "审核状态已变更、过期或权限失效，请刷新并重新查看。",
          ),
        );
    } finally {
      if (live.current) setBusy(false);
    }
  }
  const state = preview?.timeline.stateAt(
      Math.min(position, preview.timeline.packet.moves.length),
    ),
    faces = state
      ? isPyraminx(state)
        ? pyraminxFacelets(state)
        : facelets(state)
      : null;
  return (
    <section className="workspace-section">
      <h2>{t("Anonymous replay sharing review", "匿名回放分享审核")}</h2>
      <p>
        {t(
          "Minors' exact anonymous replays need independent review. Young children also need current guardian approval. A ready request still requires its owner to deliberately create a link. No identity, footage, room access or original attempt identifier is shared. Links last up to seven days; withdrawal stops new loads, while already viewed copies cannot be recalled.",
          "未成年人的匿名回放须由独立审核人查看具体内容；儿童还需要当前监护人批准。审核通过后，仍须本人主动生成链接。分享不包含身份、录像、房间权限或原始尝试标识，链接最多有效七天，撤回会停止后续加载，已查看的副本无法收回。",
        )}
      </p>
      <button disabled={busy} onClick={() => void load()}>
        {t("Refresh", "刷新")}
      </button>
      {error && <p role="alert">{error}</p>}
      {rows.map((row) => (
        <article className="card" key={row.id}>
          <h3>{row.subject?.displayName}</h3>
          <p>
            {row.puzzle} / {row.input} / {row.status} /{" "}
            {(row.durationMs / 1000).toFixed(2)}s
          </p>
          <p>
            {t("Expires", "到期")} {new Date(row.expiresAt).toLocaleString()}
          </p>
          {row.reason && <p>{row.reason}</p>}
          <button
            disabled={busy || row.expired}
            onClick={() => void inspect(row)}
          >
            {t("Inspect exact replay", "查看待分享回放")}
          </button>
        </article>
      ))}
      {preview && faces && (
        <article className="card">
          <h3>{t("Exact snapshot preview", "具体快照预览")}</h3>
          <p>
            {preview.data.packet.input === "smart" &&
            preview.data.packet.telemetry.continuity === "net-state"
              ? t(
                  "Received turns only. Counterless telemetry cannot establish hidden extra turns, exact turn counts or turning speed.",
                  "仅含收到的转动。无计数遥测不能确定隐藏的额外转动、准确次数或转速。",
                )
              : t(
                  "Study reconstruction; not a certification of physical performance.",
                  "学习重建，不代表实物表现已获认证。",
                )}
          </p>
          <div className="replay-faces">
            {Object.entries(faces).map(([face, tiles]) => (
              <div key={face}>
                <strong>{face}</strong>
                <div
                  aria-label={face}
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${Math.sqrt(tiles.length)}, 34px)`,
                    gap: "var(--space-3xs)",
                  }}
                >
                  {tiles.map((color, index) => (
                    <span
                      key={index}
                      aria-label={`${face} ${index + 1}: ${color}`}
                      style={{
                        background: `var(--puzzle-${color})`,
                        color: "var(--puzzle-label)",
                        padding: "var(--space-2xs)",
                        border: "1px solid var(--puzzle-edge)",
                      }}
                    >
                      {index + 1}:{color}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p>
            {t("Received turns viewed", "已查看接收转动")} {position} /{" "}
            {preview.timeline.packet.moves.length}
          </p>
          <button
            disabled={position === 0}
            onClick={() => setPosition(Math.max(0, position - 1))}
          >
            {t("Previous", "上一步")}
          </button>
          <button
            disabled={position === preview.timeline.packet.moves.length}
            onClick={() =>
              setPosition(
                Math.min(preview.timeline.packet.moves.length, position + 1),
              )
            }
          >
            {t("Next", "下一步")}
          </button>
          <button
            onClick={() => setPosition(preview.timeline.packet.moves.length)}
          >
            {t("Solved end", "完成状态")}
          </button>
          <p style={{ overflowWrap: "anywhere" }}>
            {preview.timeline.packet.moves.join(" ")}
          </p>
          <label>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            {t(
              "I inspected this exact anonymous replay and its telemetry limits.",
              "我已查看此匿名回放及遥测限制。",
            )}
          </label>
          <label>
            {t("Reason for rejection or withdrawal", "拒绝或撤回理由")}
            <input
              maxLength={400}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            disabled={
              busy || !checked || preview.row.status !== "PENDING_REVIEW"
            }
            onClick={() => void review(true)}
          >
            {t("Approve sharing request", "批准分享申请")}
          </button>
          <button
            disabled={busy || reason.trim().length < 3}
            onClick={() => void review(false)}
          >
            {t("Reject or withdraw", "拒绝或撤回")}
          </button>
        </article>
      )}
      {next && (
        <button disabled={busy} onClick={() => void load(true)}>
          {t("Load more", "加载更多")}
        </button>
      )}
    </section>
  );
}
