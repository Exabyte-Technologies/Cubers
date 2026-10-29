import React, { useEffect, useRef, useState } from "react";
import { CardImage, achievementCardText, type ReviewCard } from "@cubers/core";
type Props = {
  api: (path: string, body?: unknown) => Promise<any>;
  contextKey: string;
  reloadKey: number;
  locale: "en" | "zh";
};
export function AchievementCardReview({
  api,
  contextKey,
  reloadKey,
  locale,
}: Props) {
  const apiRef = useRef(api);
  apiRef.current = api;
  const context = useRef(contextKey);
  context.current = contextKey;
  const generation = useRef(0),
    acting = useRef(false),
    morePending = useRef(false);
  const [snapshot, setSnapshot] = useState<{
      owner: string;
      rows: ReviewCard[];
      nextCursor: string | null;
    }>(),
    [preview, setPreview] = useState<{
      owner: string;
      row: ReviewCard;
      image: CardImage;
    }>();
  const data = snapshot?.owner === contextKey ? snapshot : undefined,
    shown = preview?.owner === contextKey ? preview : undefined;
  const [checked, setChecked] = useState(false),
    [lookup, setLookup] = useState(""),
    [reasons, setReasons] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState(""),
    [paging, setPaging] = useState(false),
    [error, setError] = useState("");
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  async function refresh() {
    const epoch = ++generation.current,
      owner = contextKey;
    setSnapshot(undefined);
    setPreview(undefined);
    setChecked(false);
    setReasons({});
    setBusy(true);
    setError("");
    acting.current = false;
    morePending.current = false;
    setAction("");
    setPaging(false);
    try {
      const result = await apiRef.current("admin/achievement-cards");
      if (epoch === generation.current && context.current === owner)
        setSnapshot({
          owner,
          rows: result.items,
          nextCursor: result.nextCursor,
        });
    } catch {
      if (epoch === generation.current && context.current === owner)
        setError(
          t(
            "Could not load the current card queue. Refresh; your staff session or permissions may have changed.",
            "无法加载当前卡片队列，请刷新；工作人员会话或权限可能已变化。",
          ),
        );
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [contextKey, reloadKey]);
  useEffect(() => {
    const change = () => {
      if (document.visibilityState === "hidden") {
        setPreview(undefined);
        setChecked(false);
      } else void refresh();
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, [contextKey]);
  async function inspect(row: ReviewCard) {
    if (acting.current || busy) return;
    const epoch = generation.current,
      owner = contextKey;
    acting.current = true;
    setAction(row.id);
    setError("");
    setPreview(undefined);
    setChecked(false);
    try {
      const image = CardImage.parse(
        await apiRef.current(`admin/achievement-cards/${row.id}/preview`, {}),
      );
      if (epoch !== generation.current || context.current !== owner) return;
      if (
        image.cardId !== row.id ||
        image.watermarked ||
        image.imageDigest !== row.imageDigest ||
        image.approvalDigest !== row.imageDigest
      )
        throw Error("Image changed");
      setPreview({ owner, row, image });
    } catch {
      if (epoch === generation.current && context.current === owner)
        setError(
          t(
            "The exact image is no longer available. Ask for a fresh request if rendering, identity or permission changed.",
            "此具体图片已不可用；若渲染、身份或权限已变化，须重新提交申请。",
          ),
        );
    } finally {
      if (epoch === generation.current) {
        acting.current = false;
        setAction("");
      }
    }
  }
  async function findReference() {
    if (acting.current || busy || !lookup.trim()) return;
    const epoch = generation.current,
      owner = contextKey;
    acting.current = true;
    setAction("lookup");
    setError("");
    setPreview(undefined);
    setChecked(false);
    try {
      const row = await apiRef.current(
        `admin/achievement-cards/${encodeURIComponent(lookup.trim())}`,
      );
      if (epoch !== generation.current || context.current !== owner) return;
      setSnapshot((old) => ({
        owner,
        rows: [
          row,
          ...(old?.owner === owner
            ? old.rows.filter((p) => p.id !== row.id)
            : []),
        ].slice(0, 100),
        nextCursor: old?.owner === owner ? old.nextCursor : null,
      }));
    } catch {
      if (epoch === generation.current && context.current === owner)
        setError(
          t(
            "This reference is unavailable or needs a different independent reviewer.",
            "此申请编号不可用，或需要其他独立审核人员处理。",
          ),
        );
    } finally {
      if (epoch === generation.current) {
        acting.current = false;
        setAction("");
      }
    }
  }
  async function review(row: ReviewCard, approve: boolean) {
    if (
      acting.current ||
      busy ||
      (approve &&
        (row.status !== "PENDING_REVIEW" ||
          !checked ||
          shown?.row.id !== row.id ||
          shown.image.approvalDigest !== row.imageDigest)) ||
      (!approve && (reasons[row.id] || "").trim().length < 3)
    )
      return;
    const epoch = generation.current,
      owner = contextKey;
    acting.current = true;
    setAction(row.id);
    setError("");
    try {
      await apiRef.current(`admin/achievement-cards/${row.id}/review`, {
        revision: row.revision,
        imageDigest: row.imageDigest,
        approve,
        imageChecked: approve && checked,
        reason: approve ? "" : reasons[row.id].trim(),
      });
      if (epoch === generation.current && context.current === owner)
        await refresh();
    } catch {
      if (epoch === generation.current && context.current === owner)
        setError(
          t(
            "Review was not saved. Refresh; an independent reviewer and current image, eligibility, revision and MFA session are required.",
            "审核未保存，请刷新；需要独立审核人员、当前图片与资格、正确审批版本及有效 MFA 会话。",
          ),
        );
    } finally {
      if (epoch === generation.current) {
        acting.current = false;
        setAction("");
      }
    }
  }
  async function more() {
    if (!data?.nextCursor || morePending.current || acting.current || busy)
      return;
    const epoch = generation.current,
      owner = contextKey;
    morePending.current = true;
    setPaging(true);
    setPreview(undefined);
    setChecked(false);
    try {
      const page = await apiRef.current(
        `admin/achievement-cards?cursor=${encodeURIComponent(data.nextCursor)}`,
      );
      if (epoch !== generation.current || context.current !== owner) return;
      setSnapshot((old) =>
        old?.owner === owner
          ? {
              ...old,
              rows: [
                ...old.rows,
                ...page.items.filter(
                  (r: ReviewCard) => !old.rows.some((p) => p.id === r.id),
                ),
              ].slice(-100),
              nextCursor: page.nextCursor,
            }
          : old,
      );
    } catch {
      if (epoch === generation.current && context.current === owner)
        setError(
          t(
            "Could not load older requests. Refresh the queue.",
            "无法加载较早申请，请刷新队列。",
          ),
        );
    } finally {
      if (epoch === generation.current) {
        morePending.current = false;
        setPaging(false);
      }
    }
  }
  const text = shown
    ? achievementCardText(shown.row.achievementId, shown.row.locale)
    : null;
  return (
    <section style={{ overflowWrap: "anywhere" }}>
      <article className="panel">
        <h2>{t("Achievement-card review", "成就卡片审核")}</h2>
        <p>
          {t(
            "Review the exact PNG. Anonymous adult cards use authored content; named adult and minor cards require this review. Younger-child requests enter this queue only after current guardian approval.",
            "请审核具体的 PNG 图片。匿名成年人卡片使用原创固定内容；含昵称的成年人卡片和未成年人卡片须接受本审核。低龄儿童申请须先获当前监护人批准，才会进入此队列。",
          )}
        </p>
        <p>
          {t(
            "Approving permits the owner to save/share this image outside Cubers for its remaining export window. It does not publish a Discover post, and exported copies cannot be recalled. You cannot review your own card or one you approved as guardian.",
            "批准后，账号本人可在剩余有效期内将图片保存或分享到 Cubers 外，不会自动发布发现页帖子；已导出的副本无法撤回。你不能审核自己的卡片，或以监护人身份批准过的卡片。",
          )}
        </p>
        <button disabled={busy || !!action} onClick={() => void refresh()}>
          {t("Refresh queue", "刷新队列")}
        </button>
        <label>
          {t("Reported card request reference", "被举报卡片的申请编号")}
          <input value={lookup} onChange={(e) => setLookup(e.target.value)} />
        </label>
        <button
          disabled={!!action || busy || !lookup.trim()}
          onClick={() => void findReference()}
        >
          {t(
            "Find request or withdraw approved export",
            "查找申请或撤回核准导出",
          )}
        </button>
      </article>
      {!!error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">{t("Loading…", "加载中……")}</p>}
      {shown && text && (
        <article className="panel">
          <h3>
            {shown.row.subject.displayName} / {t("Exact image", "具体图片")}
          </h3>
          <img
            src={`data:image/png;base64,${shown.image.base64}`}
            alt={`${text.title}. ${text.description}. ${text.footer}. ${shown.row.namedLabel || t("Anonymous image", "匿名图片")}`}
            style={{
              display: "block",
              width: "100%",
              maxWidth: 480,
              aspectRatio: "4 / 5",
              objectFit: "contain",
            }}
          />
          {shown.row.status === "PENDING_REVIEW" && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                {t(
                  "I inspected this image and confirm its content is suitable for this owner's external sharing.",
                  "我已查看此图片，确认其内容适合由该账号本人在应用外分享。",
                )}
              </label>
              <button
                disabled={!!action || !checked}
                onClick={() => void review(shown.row, true)}
              >
                {t("Approve this image", "批准此图片")}
              </button>
            </>
          )}
          {shown.row.status === "READY" && (
            <p>
              {t(
                "This image is already approved. You may withdraw future clean exports below; copies already exported cannot be recalled.",
                "此图片已获批准。你可在下方撤回今后的无水印导出；已导出的副本无法撤回。",
              )}
            </p>
          )}
        </article>
      )}
      {data && !data.rows.length && (
        <article className="panel">
          {t(
            "No current cards need content review.",
            "暂无需要内容审核的有效卡片。",
          )}
        </article>
      )}
      {data?.rows.map((row) => (
        <article className="panel" key={row.id}>
          <h3>
            {row.subject.displayName} /{" "}
            {achievementCardText(row.achievementId, locale).title}
          </h3>
          <p>
            {row.namedLabel
              ? t(
                  `Nickname included: ${row.namedLabel}`,
                  `包含昵称：${row.namedLabel}`,
                )
              : t("Anonymous image", "匿名图片")}{" "}
            / {row.locale === "zh" ? "简体中文" : "English"}
          </p>
          <p>
            {t("Expires", "有效期至")}{" "}
            {new Date(row.expiresAt).toLocaleString()}
          </p>
          {row.independentReviewer === false && (
            <p className="notice">
              {t(
                "Another independent reviewer must handle this request.",
                "此申请须由其他独立审核人员处理。",
              )}
            </p>
          )}
          <p>
            {t("Status", "状态")}: {row.status} / {t("Reference", "申请编号")}:{" "}
            {row.id}
          </p>
          <button
            disabled={
              !!action ||
              busy ||
              row.independentReviewer === false ||
              row.expired ||
              !["PENDING_REVIEW", "READY"].includes(row.status)
            }
            onClick={() => void inspect(row)}
          >
            {t("Inspect image", "查看图片")}
          </button>
          <label>
            {t("Reason if rejecting or withdrawing", "拒绝或撤回时请说明原因")}
            <textarea
              value={reasons[row.id] || ""}
              maxLength={400}
              onChange={(e) =>
                setReasons((old) => ({ ...old, [row.id]: e.target.value }))
              }
            />
          </label>
          <button
            disabled={
              !!action ||
              row.independentReviewer === false ||
              row.expired ||
              !["PENDING_REVIEW", "READY"].includes(row.status) ||
              (reasons[row.id] || "").trim().length < 3
            }
            onClick={() => void review(row, false)}
          >
            {row.status === "READY"
              ? t("Withdraw future exports", "撤回今后的导出")
              : t("Reject this request", "拒绝本申请")}
          </button>
        </article>
      ))}
      {data?.nextCursor && (
        <button disabled={paging || !!action} onClick={() => void more()}>
          {paging ? t("Loading…", "加载中……") : t("Older requests", "较早申请")}
        </button>
      )}
      {!!data?.rows.length && (
        <p>
          {t(
            "At most 100 loaded requests are shown. Refresh returns to the newest.",
            "最多显示已加载的 100 条申请，刷新可返回最新记录。",
          )}
        </p>
      )}
    </section>
  );
}
