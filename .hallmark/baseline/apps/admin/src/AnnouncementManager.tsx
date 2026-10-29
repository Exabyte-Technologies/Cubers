import React, { useEffect, useRef, useState } from "react";
import {
  AnnouncementContent,
  AnnouncementCreate,
  AnnouncementEdit,
  AnnouncementPublish,
  type AnnouncementContent as Content,
} from "@cubers/core";
type Props = {
  api: (path: string, body?: unknown) => Promise<any>;
  contextKey: string;
  reloadKey: number;
  locale: "en" | "zh";
};
const empty = (): Content => ({
  kind: "service",
  title: { en: "", zh: "" },
  summary: { en: "", zh: "" },
  body: { en: "", zh: "" },
  startsAt: new Date(Date.now() + 600000).toISOString(),
  endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
});
const local = (value: string) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export function AnnouncementManager({
  api,
  contextKey,
  reloadKey,
  locale,
}: Props) {
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const [rows, setRows] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(),
    [content, setContent] = useState<Content>(empty),
    [cursor, setCursor] = useState<string | null>(null),
    [history, setHistory] = useState<any[]>([]),
    [courses, setCourses] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [reason, setReason] = useState(""),
    [checks, setChecks] = useState([false, false, false, false]);
  const [canEdit, setCanEdit] = useState(false);
  const epoch = useRef(0),
    scope = useRef(contextKey);
  scope.current = contextKey;
  async function load(next?: string) {
    const run = ++epoch.current,
      bound = scope.current;
    setBusy(true);
    setMessage("");
    try {
      const [page, published, me] = await Promise.all([
        api(
          `admin/announcements${next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
        ),
        api("courses"),
        api("me"),
      ]);
      if (run !== epoch.current || scope.current !== bound) return;
      setRows(page.items);
      setCursor(page.nextCursor);
      setCourses(published);
      setCanEdit(me.role === "ADMIN");
      setSelected(undefined);
      setContent(empty());
      setHistory([]);
      setChecks([false, false, false, false]);
      setReason("");
    } catch (error) {
      if (run === epoch.current && scope.current === bound)
        setMessage((error as Error).message);
    } finally {
      if (run === epoch.current && scope.current === bound) setBusy(false);
    }
  }
  useEffect(() => {
    setRows([]);
    setSelected(undefined);
    setContent(empty());
    setHistory([]);
    void load();
    return () => {
      epoch.current++;
    };
  }, [contextKey, reloadKey]);
  function choose(row?: any) {
    if (busy) return;
    epoch.current++;
    setSelected(row);
    setContent(row ? AnnouncementContent.parse(row.content) : empty());
    setHistory([]);
    setChecks([false, false, false, false]);
    setReason("");
    setMessage("");
  }
  async function act(action: () => Promise<any>) {
    if (busy) return;
    const run = ++epoch.current,
      bound = scope.current;
    setBusy(true);
    setMessage("");
    try {
      const row = await action();
      if (run !== epoch.current || bound !== scope.current) return;
      setSelected(row);
      setContent(AnnouncementContent.parse(row.content));
      setHistory([]);
      setRows((old) => [row, ...old.filter((item) => item.id !== row.id)]);
      setChecks([false, false, false, false]);
      setReason("");
      setMessage(t("Saved current version.", "已保存当前版本。"));
    } catch (error) {
      if (run === epoch.current && bound === scope.current)
        setMessage((error as Error).message);
    } finally {
      if (run === epoch.current && bound === scope.current) setBusy(false);
    }
  }
  const linked = courses.find((course) => course.id === content.courseId);
  const saved = selected
    ? AnnouncementContent.safeParse(selected.content)
    : null;
  const unsaved =
    !saved?.success || JSON.stringify(content) !== JSON.stringify(saved.data);
  const reasonReady = reason.trim().length >= 10;
  return (
    <>
      <article className="panel">
        <h2>
          {t("Cubers service and learning updates", "Cubers 服务与学习公告")}
        </h2>
        <p>
          {t(
            "Plain text in both languages. Edits return a published update to draft. Sponsor campaigns use their separate review and adult-delivery controls.",
            "使用双语纯文字。编辑已发布公告会将其撤回为草稿。赞助活动使用独立的审核与成人投放控制。",
          )}
        </p>
        {message && <p role="status">{message}</p>}
        <div className="actions">
          <button disabled={busy || !canEdit} onClick={() => choose()}>
            {t("New draft", "新建草稿")}
          </button>
          <button disabled={busy} onClick={() => void load()}>
            {t("First page / refresh", "首页／刷新")}
          </button>
          {cursor && (
            <button disabled={busy} onClick={() => void load(cursor)}>
              {t("Next page", "下一页")}
            </button>
          )}
        </div>
        {!rows.length && (
          <p>{t("No updates on this page.", "本页暂无公告。")}</p>
        )}
        {rows.map((row) => (
          <button key={row.id} disabled={busy} onClick={() => choose(row)}>
            {row.content.title[locale]} · v{row.version} ·{" "}
            {row.published
              ? t("Published/scheduled", "已发布／已排期")
              : t("Draft", "草稿")}
          </button>
        ))}
      </article>
      <article className="panel">
        <h3>
          {selected
            ? `${selected.content.title[locale]} · v${selected.version}`
            : t("New update", "新公告")}
        </h3>
        {!canEdit && (
          <p>
            {t(
              "Your role can read updates and their history. Editing requires an administrator.",
              "当前角色可以查看公告和历史，编辑需要管理员权限。",
            )}
          </p>
        )}
        <fieldset disabled={busy || !canEdit}>
          <label>
            {t("Type", "类型")}
            <select
              value={content.kind}
              onChange={(event) =>
                setContent({
                  ...content,
                  kind: event.target.value as Content["kind"],
                  courseId: undefined,
                })
              }
            >
              <option value="service">{t("Service update", "服务公告")}</option>
              <option value="learning">
                {t("Authored learning update", "原创学习公告")}
              </option>
            </select>
          </label>
          {(["en", "zh"] as const).map((language) => (
            <div key={language}>
              <h4>{language === "en" ? "English" : "简体中文"}</h4>
              <label>
                {t("Title", "标题")}
                <input
                  maxLength={120}
                  value={content.title[language]}
                  onChange={(event) =>
                    setContent({
                      ...content,
                      title: {
                        ...content.title,
                        [language]: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                {t("Summary", "摘要")}
                <input
                  maxLength={300}
                  value={content.summary[language]}
                  onChange={(event) =>
                    setContent({
                      ...content,
                      summary: {
                        ...content.summary,
                        [language]: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                {t("Body", "正文")}
                <textarea
                  rows={7}
                  maxLength={4000}
                  value={content.body[language]}
                  onChange={(event) =>
                    setContent({
                      ...content,
                      body: { ...content.body, [language]: event.target.value },
                    })
                  }
                />
              </label>
            </div>
          ))}
          <p>
            {t(
              "Schedule uses this browser's local time. Each window may span up to 90 days.",
              "排期使用浏览器所在时区，每次展示窗口最长为 90 天。",
            )}
          </p>
          <label>
            {t("Starts", "开始")}
            <input
              type="datetime-local"
              value={local(content.startsAt)}
              onChange={(event) => {
                if (Number.isFinite(new Date(event.target.value).getTime()))
                  setContent({
                    ...content,
                    startsAt: new Date(event.target.value).toISOString(),
                  });
              }}
            />
          </label>
          <label>
            {t("Ends", "结束")}
            <input
              type="datetime-local"
              value={local(content.endsAt)}
              onChange={(event) => {
                if (Number.isFinite(new Date(event.target.value).getTime()))
                  setContent({
                    ...content,
                    endsAt: new Date(event.target.value).toISOString(),
                  });
              }}
            />
          </label>
          {content.kind === "learning" && (
            <label>
              {t("Optional published lesson", "可选的已发布课程")}
              <select
                value={content.courseId || ""}
                onChange={(event) =>
                  setContent({
                    ...content,
                    courseId: event.target.value || undefined,
                  })
                }
              >
                <option value="">{t("No lesson link", "不关联课程")}</option>
                {content.courseId && !linked && (
                  <option value={content.courseId}>
                    {content.courseId} ·{" "}
                    {t(
                      "unavailable; refresh or remove",
                      "不可用，请刷新或移除",
                    )}
                  </option>
                )}
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.content.title[locale]} · v{course.version}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {t(
              "Reason for this change (10–500 characters)",
              "变更原因（10–500 字符）",
            )}
            <textarea
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button
            disabled={!reasonReady}
            onClick={() =>
              void act(() =>
                selected
                  ? api(
                      `admin/announcements/${selected.id}/content`,
                      AnnouncementEdit.parse({
                        expectedVersion: selected.version,
                        content,
                        reason,
                      }),
                    )
                  : api(
                      "admin/announcements",
                      AnnouncementCreate.parse({ content, reason }),
                    ),
              )
            }
          >
            {selected?.published
              ? t("Save edit and withdraw publication", "保存编辑并撤回发布")
              : t("Save draft", "保存草稿")}
          </button>
          {selected && (
            <>
              <h4>
                {t(
                  "Review the saved version before publishing",
                  "发布前审核已保存版本",
                )}
              </h4>
              <p>
                {t(
                  "Unsaved form edits are not published. Save them first, then review the resulting version.",
                  "发布仅针对已保存版本。请先保存表单修改，再审核生成的新版本。",
                )}
              </p>
              {[
                t("English reviewed", "已审核英文"),
                t("Chinese reviewed", "已审核中文"),
                t("Rights confirmed", "已确认内容权利"),
                t(
                  "Service/learning content only; no advertising",
                  "仅服务／学习内容，不含广告",
                ),
              ].map((label, index) => (
                <label key={index}>
                  <input
                    type="checkbox"
                    checked={checks[index]}
                    onChange={(event) =>
                      setChecks((old) =>
                        old.map((value, i) =>
                          i === index ? event.target.checked : value,
                        ),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
              <button
                disabled={
                  !reasonReady ||
                  !checks.every(Boolean) ||
                  unsaved ||
                  (!!content.courseId && !linked)
                }
                onClick={() =>
                  void act(() =>
                    api(
                      `admin/announcements/${selected.id}/publication`,
                      AnnouncementPublish.parse({
                        expectedVersion: selected.version,
                        published: true,
                        englishReviewed: true,
                        chineseReviewed: true,
                        rightsConfirmed: true,
                        serviceOrLearningOnly: true,
                        ...(linked ? { courseVersion: linked.version } : {}),
                        reason,
                      }),
                    ),
                  )
                }
              >
                {t("Publish reviewed saved version", "发布已审核的保存版本")}
              </button>
              <button
                disabled={!reasonReady}
                onClick={() =>
                  void act(() =>
                    api(
                      `admin/announcements/${selected.id}/publication`,
                      AnnouncementPublish.parse({
                        expectedVersion: selected.version,
                        published: false,
                        reason,
                      }),
                    ),
                  )
                }
              >
                {t("Withdraw publication", "撤回发布")}
              </button>
            </>
          )}
        </fieldset>
        {selected && (
          <button
            disabled={busy}
            onClick={async () => {
              const run = ++epoch.current,
                bound = scope.current;
              setBusy(true);
              try {
                const items = await api(
                  `admin/announcements/${selected.id}/history`,
                );
                if (run === epoch.current && bound === scope.current)
                  setHistory(items);
              } catch (error) {
                if (run === epoch.current && bound === scope.current)
                  setMessage((error as Error).message);
              } finally {
                if (run === epoch.current && bound === scope.current)
                  setBusy(false);
              }
            }}
          >
            {t("Recent version history", "最近版本历史")}
          </button>
        )}
        {!!history.length && (
          <>
            <p>
              {t(
                "Only the most recent 20 versions are retained. Updates and their revisions become eligible for cleanup 90 days after their end date.",
                "仅保留最近 20 个版本。公告及其修订记录在结束日期满 90 天后纳入清理。",
              )}
            </p>
            {history.map((revision) => (
              <details key={revision.id}>
                <summary>
                  v{revision.version} ·{" "}
                  {revision.snapshot.published
                    ? t("Published", "已发布")
                    : t("Draft", "草稿")}{" "}
                  · {revision.reason}
                </summary>
                <p>{revision.snapshot.content.title[locale]}</p>
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {revision.snapshot.content.body[locale]}
                </p>
              </details>
            ))}
          </>
        )}
      </article>
    </>
  );
}
