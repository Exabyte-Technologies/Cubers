import React, { useEffect, useRef, useState } from "react";
import {
  CampaignContent,
  CampaignCreate,
  CampaignEdit,
  CampaignReview,
  type CampaignContent as Content,
} from "@cubers/core";
type Props = {
  api: (path: string, body?: unknown) => Promise<any>;
  contextKey: string;
  reloadKey: number;
  locale: "en" | "zh";
};
const empty = (): Content => ({
  title: { en: "", zh: "" },
  summary: { en: "", zh: "" },
  category: "cubing-equipment",
  destination: "",
  startsAt: new Date(Date.now() + 3600000).toISOString(),
  endsAt: new Date(Date.now() + 86400000).toISOString(),
});
const local = (v: string) => {
  const d = new Date(v);
  return Number.isFinite(d.getTime())
    ? new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
};
const iso = (v: string) =>
  v && Number.isFinite(new Date(v).getTime()) ? new Date(v).toISOString() : "";
export function CampaignManager({ api, contextKey, reloadKey, locale }: Props) {
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const ref = useRef(api);
  ref.current = api;
  const owner = useRef(contextKey);
  owner.current = contextKey;
  const live = useRef(true),
    epoch = useRef(0),
    flight = useRef(0),
    acting = useRef(false);
  const [rows, setRows] = useState<any[]>([]),
    [next, setNext] = useState<string | null>(null),
    [current, setCurrent] = useState<any>(),
    [form, setForm] = useState<Content>(empty),
    [canEdit, setCanEdit] = useState(false),
    [setting, setSetting] = useState({ enabled: false, version: 1 }),
    [approved, setApproved] = useState(false),
    [region, setRegion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [reason, setReason] = useState(""),
    [archive, setArchive] = useState(""),
    [checks, setChecks] = useState({
      identity: false,
      link: false,
      text: false,
    }),
    [history, setHistory] = useState<any[]>([]),
    [before, setBefore] = useState<number | null>(null);
  const valid = (who: string, run: number) =>
    live.current && owner.current === who && epoch.current === run;
  async function list(append = false) {
    const who = contextKey,
      run = epoch.current,
      request = ++flight.current;
    setBusy(true);
    try {
      const p = await ref.current(
        `admin/campaigns${append && next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
      );
      if (!valid(who, run) || request !== flight.current) return;
      setRows((old) =>
        append
          ? [
              ...old,
              ...p.items.filter((x: any) => !old.some((y) => y.id === x.id)),
            ]
          : p.items,
      );
      setNext(p.nextCursor);
      setCanEdit(p.canEdit);
      setSetting(p.setting);
      setApproved(p.deliveryApproved);
      setRegion(p.region);
      setError("");
    } catch (e) {
      if (valid(who, run) && request === flight.current)
        setError((e as Error).message);
    } finally {
      if (valid(who, run) && request === flight.current) setBusy(false);
    }
  }
  useEffect(() => {
    live.current = true;
    epoch.current++;
    setRows([]);
    setCurrent(undefined);
    setForm(empty());
    setHistory([]);
    setError("");
    void list();
    return () => {
      live.current = false;
      epoch.current++;
    };
  }, [contextKey, reloadKey]);
  function select(row?: any) {
    epoch.current++;
    flight.current++;
    setCurrent(row);
    const p = CampaignContent.safeParse(row?.content);
    setForm(
      p.success
        ? p.data
        : { ...empty(), title: { en: row?.title || "", zh: "" } },
    );
    setReason("");
    setArchive("");
    setChecks({ identity: false, link: false, text: false });
    setHistory([]);
    setBefore(null);
    setError("");
    setMessage("");
  }
  function edit(nextForm: Content) {
    setForm(nextForm);
    setChecks({ identity: false, link: false, text: false });
    setMessage("");
  }
  async function act(path: string, body: unknown) {
    if (acting.current) return;
    const who = contextKey,
      run = epoch.current;
    acting.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await ref.current(path, body);
      if (!valid(who, run)) return;
      if (value.id) {
        setCurrent(value);
        const p = CampaignContent.safeParse(value.content);
        if (p.success) setForm(p.data);
        setReason("");
        setArchive("");
        setChecks({ identity: false, link: false, text: false });
        setHistory([]);
        setBefore(null);
      }
      setMessage(
        t(
          "Saved with a new audited version.",
          "已保存新的版本并记录审核日志。",
        ),
      );
      await list();
    } catch (e) {
      if (valid(who, run)) setError((e as Error).message);
    } finally {
      acting.current = false;
      if (valid(who, run)) setBusy(false);
    }
  }
  async function revisions(append = false) {
    if (!current) return;
    const who = contextKey,
      run = epoch.current;
    setBusy(true);
    try {
      const p = await ref.current(
        `admin/campaigns/${current.id}/history${append && before ? `?before=${before}` : ""}`,
      );
      if (!valid(who, run)) return;
      setHistory((old) => (append ? [...old, ...p.items] : p.items));
      setBefore(p.nextBefore);
    } catch (e) {
      if (valid(who, run)) setError((e as Error).message);
    } finally {
      if (valid(who, run)) setBusy(false);
    }
  }
  const original = CampaignContent.safeParse(current?.content),
    checked = CampaignContent.safeParse(form),
    dirty =
      !current ||
      !original.success ||
      !checked.success ||
      JSON.stringify(original.data) !== JSON.stringify(checked.data);
  const changeBody = {
    expectedVersion: current?.version,
    content: form,
    reason,
  };
  const saveValid = current
    ? CampaignEdit.safeParse(changeBody).success
    : CampaignCreate.safeParse({ content: form, reason }).success;
  const reviewBody = {
    expectedVersion: current?.version,
    decision: "approve",
    archiveReference: archive,
    advertiserRecordReviewed: checks.identity,
    destinationReviewed: checks.link,
    bilingualReviewed: checks.text,
    reason,
  };
  return (
    <>
      <article className="card">
        <h2>{t("Sponsor campaigns", "赞助活动")}</h2>
        <p className="muted">
          {t(
            "First-party, clearly labeled advertising for verified adults only. No viewer profiling, advertiser SDK or engagement tracking. Editing withdraws approval and switches the campaign off.",
            "仅向经过验证的成年人展示有明确标识的第一方广告，不使用用户画像、广告商 SDK 或互动追踪。编辑内容会撤销审核并停用该活动。",
          )}
        </p>
        <p>
          {region} · {t("Regional cards", "本社区卡片")}:{" "}
          {setting.enabled ? t("On", "已开启") : t("Off", "已关闭")}
        </p>
        {!approved && (
          <p className="notice">
            {t(
              "Regional advertising and archive-custody review has not been approved. Drafts and review are available; delivery stays off.",
              "本社区尚未通过广告及档案保管审核，可编辑与审核草稿，但不能投放。",
            )}
          </p>
        )}
        <div className="actions">
          <button
            disabled={busy || !canEdit || (!setting.enabled && !approved)}
            onClick={() =>
              void act("admin/settings/sponsors", {
                expectedVersion: setting.version,
                enabled: !setting.enabled,
              })
            }
          >
            {setting.enabled
              ? t("Turn regional cards off", "关闭本社区卡片")
              : t("Enable reviewed regional cards", "启用本社区已审核卡片")}
          </button>
          <button disabled={busy} onClick={() => void list()}>
            {t("Refresh", "刷新")}
          </button>
        </div>
      </article>
      {!!error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {!!message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <article className="card">
        <h3>{t("Campaign library", "活动库")}</h3>
        <button disabled={busy || !canEdit} onClick={() => select()}>
          {t("New draft", "新建草稿")}
        </button>
        {!rows.length && !busy && (
          <p>
            {t(
              "No campaigns. Nothing is created or enabled automatically.",
              "暂无活动，系统不会自动创建或启用广告。",
            )}
          </p>
        )}
        {rows.map((row) => (
          <div key={row.id} className="card">
            <b>{row.content?.title?.[locale] || row.title}</b>
            <p>
              {t(`Version ${row.version}`, `第 ${row.version} 版`)} ·{" "}
              {row.reviewed
                ? t("Reviewed", "已审核")
                : t("Needs review", "待审核")}{" "}
              ·{" "}
              {row.enabled
                ? t("Enabled in schedule", "按排期开启")
                : t("Off", "已停用")}
            </p>
            <button disabled={busy} onClick={() => select(row)}>
              {t("Open campaign", "打开活动")}
            </button>
          </div>
        ))}
        {next && (
          <button disabled={busy} onClick={() => void list(true)}>
            {t("More campaigns", "更多活动")}
          </button>
        )}
      </article>
      <article className="card">
        <h3>
          {current
            ? t(
                `Campaign version ${current.version}`,
                `活动第 ${current.version} 版`,
              )
            : t("New campaign draft", "新活动草稿")}
        </h3>
        <fieldset disabled={busy || !canEdit}>
          {(["en", "zh"] as const).map((lang) => (
            <React.Fragment key={lang}>
              <label>
                {lang === "en"
                  ? t("English title", "英文标题")
                  : t("Chinese title", "中文标题")}
                <input
                  maxLength={100}
                  value={form.title[lang]}
                  onChange={(e) =>
                    edit({
                      ...form,
                      title: { ...form.title, [lang]: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                {lang === "en"
                  ? t("English description", "英文说明")
                  : t("Chinese description", "中文说明")}
                <textarea
                  maxLength={300}
                  value={form.summary[lang]}
                  onChange={(e) =>
                    edit({
                      ...form,
                      summary: { ...form.summary, [lang]: e.target.value },
                    })
                  }
                />
              </label>
            </React.Fragment>
          ))}
          <label>
            {t("Cubing category", "魔方相关类别")}
            <select
              value={form.category}
              onChange={(e) =>
                edit({
                  ...form,
                  category: e.target.value as Content["category"],
                })
              }
            >
              <option value="cubing-equipment">{t("Equipment", "器材")}</option>
              <option value="cubing-education">{t("Education", "教学")}</option>
              <option value="cubing-event">{t("Event", "活动")}</option>
            </select>
          </label>
          <label>
            {t("Reviewed HTTPS landing page", "待审核的 HTTPS 落地页")}
            <input
              type="url"
              value={form.destination}
              maxLength={2000}
              onChange={(e) => edit({ ...form, destination: e.target.value })}
            />
          </label>
          <p className="muted">
            {t(
              "No credentials, query parameters or fragments. Review the advertiser and all redirects; the server does not visit the website.",
              "网址不得包含凭据、查询参数或片段。请人工核查广告主与所有跳转，服务器不会代为访问网站。",
            )}
          </p>
          <p>
            {t("Schedule time zone", "排期时区")}:{" "}
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </p>
          <label>
            {t("Starts", "开始时间")}
            <input
              type="datetime-local"
              value={local(form.startsAt)}
              onChange={(e) => edit({ ...form, startsAt: iso(e.target.value) })}
            />
          </label>
          <label>
            {t("Ends", "结束时间")}
            <input
              type="datetime-local"
              value={local(form.endsAt)}
              onChange={(e) => edit({ ...form, endsAt: iso(e.target.value) })}
            />
          </label>
          <label>
            {t("Reason for this action", "本次操作原因")}
            <textarea
              value={reason}
              minLength={10}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={!dirty || !saveValid}
            onClick={() =>
              void act(
                current
                  ? `admin/campaigns/${current.id}/content`
                  : "admin/campaigns",
                current ? changeBody : { content: form, reason },
              )
            }
          >
            {t(
              "Save as unapproved, disabled draft",
              "保存为待审核且停用的草稿",
            )}
          </button>
        </fieldset>
        {checked.success && (
          <section className="card">
            <h4>{t("Advertisement preview", "广告预览")}</h4>
            <b>{t("Advertisement · Sponsor", "广告 · 赞助内容")}</b>
            <p>{checked.data.title[locale]}</p>
            <p>{checked.data.summary[locale]}</p>
            <code>{checked.data.destination}</code>
          </section>
        )}
        {current && (
          <fieldset disabled={busy || !canEdit || dirty}>
            <legend>
              {t("Review the exact saved version", "审核当前已保存版本")}
            </legend>
            <label>
              {t(
                "Protected advertiser archive reference",
                "受保护的广告主档案编号",
              )}
              <input
                maxLength={120}
                value={archive}
                placeholder="REGISTER/2026/001"
                onChange={(e) => setArchive(e.target.value)}
              />
            </label>
            <p className="muted">
              {t(
                "The operator's protected register must contain advertiser identity/contact, required qualifications, permissions and the reviewed landing-page evidence. Store documents there, not in these text fields. Reviewed versions are retained for three calendar years after their schedule or later change.",
                "运营方受保护的档案应保存广告主身份及联系方式、所需资质与许可、落地页审核证据。证明材料应存入该档案，不要粘贴到这些文本字段中。审核版本保留至排期或后续变更后的三个日历年。",
              )}
            </p>
            {(
              [
                [
                  "identity",
                  t(
                    "I checked advertiser identity, qualifications, permissions and archive custody.",
                    "已核查广告主身份、资质、许可与档案保管。",
                  ),
                ],
                [
                  "link",
                  t(
                    "I reviewed the exact landing page and redirects.",
                    "已审核当前落地页及跳转。",
                  ),
                ],
                [
                  "text",
                  t(
                    "I reviewed both languages, claims, category and ad labeling.",
                    "已审核两种语言、宣传内容、类别及广告标识。",
                  ),
                ],
              ] as const
            ).map(([key, label]) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  checked={checks[key]}
                  onChange={(e) =>
                    setChecks({ ...checks, [key]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
            <div className="actions">
              <button
                disabled={!CampaignReview.safeParse(reviewBody).success}
                onClick={() =>
                  void act(`admin/campaigns/${current.id}/review`, reviewBody)
                }
              >
                {t(
                  "Approve this version, keep it off",
                  "审核通过此版本，暂不启用",
                )}
              </button>
              <button
                disabled={reason.trim().length < 10}
                onClick={() =>
                  void act(`admin/campaigns/${current.id}/review`, {
                    expectedVersion: current.version,
                    decision: "withdraw",
                    reason,
                  })
                }
              >
                {t("Withdraw approval and stop", "撤销审核并停用")}
              </button>
              <button
                disabled={
                  reason.trim().length < 10 ||
                  (!current.enabled && !current.reviewed)
                }
                onClick={() =>
                  void act(`admin/campaigns/${current.id}/enabled`, {
                    expectedVersion: current.version,
                    enabled: !current.enabled,
                    reason,
                  })
                }
              >
                {current.enabled
                  ? t("Disable campaign", "停用活动")
                  : t("Enable within schedule", "按排期启用")}
              </button>
            </div>
          </fieldset>
        )}
        {current && (
          <>
            <button disabled={busy} onClick={() => void revisions()}>
              {t("Read archived versions", "查看归档版本")}
            </button>
            {history.map((h) => (
              <details key={h.id}>
                <summary>
                  {t(`Version ${h.version}`, `第 ${h.version} 版`)} ·{" "}
                  {new Date(h.createdAt).toLocaleString(locale)} ·{" "}
                  {t("Retained until", "保留至")}{" "}
                  {new Date(h.retainUntil).toLocaleString(locale)}
                </summary>
                <p>{h.reason}</p>
                <pre>{JSON.stringify(h.snapshot, null, 2)}</pre>
              </details>
            ))}
            {before && (
              <button disabled={busy} onClick={() => void revisions(true)}>
                {t("Older versions", "更早版本")}
              </button>
            )}
          </>
        )}
      </article>
    </>
  );
}
