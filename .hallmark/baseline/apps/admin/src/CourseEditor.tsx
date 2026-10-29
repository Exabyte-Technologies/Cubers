import React, { useEffect, useRef, useState } from "react";
import {
  CourseCreate,
  CourseEdit,
  CourseLesson,
  CoursePublish,
  lessons,
  type EditableLesson,
} from "@cubers/core";
type Row = {
  id: string;
  puzzle: string;
  level: string;
  version: number;
  published: boolean;
  title: { en: string; zh: string };
  summary: { en: string; zh: string };
};
type Saved = {
  id: string;
  version: number;
  published: boolean;
  content: EditableLesson;
};
type Props = {
  api: (path: string, body?: unknown) => Promise<any>;
  contextKey: string;
  reloadKey: number;
  locale: "en" | "zh";
};
const empty = (): EditableLesson => ({
  id: "",
  puzzle: "3x3",
  kind: "drill",
  level: "beginner",
  title: { en: "", zh: "" },
  summary: { en: "", zh: "" },
  steps: { en: [""], zh: [""] },
  algorithm: "",
  minutes: 5,
});
export function CourseEditor({ api, contextKey, reloadKey, locale }: Props) {
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en),
    apiRef = useRef(api);
  apiRef.current = api;
  const heading = useRef<HTMLHeadingElement | null>(null);
  const owner = useRef(contextKey);
  owner.current = contextKey;
  const generation = useRef(0),
    view = useRef(0),
    mounted = useRef(true),
    acting = useRef(false);
  const [rows, setRows] = useState<Row[]>([]),
    [next, setNext] = useState<string | null>(null),
    [q, setQ] = useState(""),
    [query, setQuery] = useState(""),
    [canEdit, setCanEdit] = useState(false),
    [current, setCurrent] = useState<Saved>(),
    [form, setForm] = useState<EditableLesson>(),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [paging, setPaging] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [checks, setChecks] = useState({ en: false, zh: false, rights: false }),
    [preview, setPreview] = useState(false),
    [history, setHistory] = useState<
      {
        version: number;
        published: boolean;
        createdAt: string;
        digest: string;
      }[]
    >([]),
    [fromVersion, setFromVersion] = useState<number>();
  const valid = (who: string, epoch: number) =>
    mounted.current && owner.current === who && view.current === epoch;
  function changed(next: EditableLesson) {
    setForm(next);
    setChecks({ en: false, zh: false, rights: false });
    setPreview(false);
    setMessage("");
  }
  async function library(append = false) {
    const who = contextKey,
      epoch = ++generation.current;
    setError("");
    if (append) setPaging(true);
    else {
      setBusy(true);
      setRows([]);
      setNext(null);
    }
    try {
      const response = await apiRef.current(
        `admin/course-library?q=${encodeURIComponent(query)}${append && next ? `&cursor=${encodeURIComponent(next)}` : ""}`,
      );
      if (
        !mounted.current ||
        owner.current !== who ||
        epoch !== generation.current
      )
        return;
      setRows((old) =>
        append
          ? [
              ...old,
              ...response.items.filter(
                (item: Row) => !old.some((row) => row.id === item.id),
              ),
            ].slice(0, 150)
          : response.items,
      );
      setNext(response.nextCursor);
      setCanEdit(response.canEdit);
    } catch (e) {
      if (
        mounted.current &&
        owner.current === who &&
        epoch === generation.current
      )
        setError((e as Error).message);
    } finally {
      if (
        mounted.current &&
        owner.current === who &&
        epoch === generation.current
      ) {
        setBusy(false);
        setPaging(false);
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      view.current++;
    };
  }, []);
  useEffect(() => {
    view.current++;
    setCurrent(undefined);
    setForm(undefined);
    setHistory([]);
    setPreview(false);
    acting.current = false;
    void library();
  }, [contextKey, reloadKey, query]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) {
        view.current++;
        generation.current++;
        acting.current = false;
        setBusy(false);
        setPaging(false);
        setCurrent(undefined);
        setForm(undefined);
        setPreview(false);
        setHistory([]);
      } else void library();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [contextKey, query]);
  async function open(id: string) {
    const who = contextKey,
      epoch = ++view.current;
    setBusy(true);
    setError("");
    setForm(undefined);
    setHistory([]);
    setPreview(false);
    setFromVersion(undefined);
    setReason("");
    try {
      const saved = await apiRef.current(`admin/courses/${id}`);
      if (!valid(who, epoch)) return;
      const content = CourseLesson.parse(saved.content);
      setCurrent({ ...saved, content });
      changed(content);
    } catch (e) {
      if (valid(who, epoch)) setError((e as Error).message);
    } finally {
      if (valid(who, epoch)) setBusy(false);
    }
  }
  async function act(publish?: boolean) {
    if (!form || !canEdit || acting.current) return;
    acting.current = true;
    const who = contextKey,
      epoch = view.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let saved: Saved;
      if (publish !== undefined) {
        if (!current) throw Error(t("Save the draft first.", "请先保存草稿。"));
        const body = publish
          ? {
              expectedVersion: current.version,
              published: true,
              reviewed: true,
              englishReviewed: checks.en,
              chineseReviewed: checks.zh,
              rightsConfirmed: checks.rights,
            }
          : { expectedVersion: current.version, published: false };
        CoursePublish.parse(body);
        saved = await apiRef.current(`admin/courses/${current.id}`, body);
      } else if (current) {
        const body = { expectedVersion: current.version, lesson: form, reason };
        CourseEdit.parse(body);
        saved = await apiRef.current(
          `admin/courses/${current.id}/content`,
          body,
        );
      } else {
        const { id, ...lesson } = form;
        const body = { lesson, reason };
        CourseCreate.parse(body);
        saved = await apiRef.current("admin/courses", body);
      }
      if (!valid(who, epoch)) return;
      setCurrent({ ...saved, content: CourseLesson.parse(saved.content) });
      changed(CourseLesson.parse(saved.content));
      setHistory([]);
      setReason("");
      setFromVersion(undefined);
      setMessage(
        saved.published
          ? t("This reviewed revision is published.", "此审核版本已发布。")
          : t(
              "Draft saved. Review both languages before publishing.",
              "草稿已保存，请审核两种语言后再发布。",
            ),
      );
      void library();
    } catch (e) {
      if (valid(who, epoch))
        setError(
          e instanceof Error ? e.message : t("Could not save.", "保存失败。"),
        );
    } finally {
      if (valid(who, epoch)) {
        acting.current = false;
        setBusy(false);
      }
    }
  }
  async function revisions(version?: number) {
    if (!current || acting.current) return;
    const who = contextKey,
      epoch = view.current;
    acting.current = true;
    setBusy(true);
    setError("");
    try {
      if (version === undefined) {
        const result = await apiRef.current(
          `admin/courses/${current.id}/revisions`,
        );
        if (valid(who, epoch)) setHistory(result.items);
      } else {
        const result = await apiRef.current(
          `admin/courses/${current.id}/revisions/${version}`,
        );
        if (!valid(who, epoch)) return;
        changed(CourseLesson.parse(result.content));
        setFromVersion(version);
        setReason("");
        setMessage(
          t(
            "Earlier text loaded for a new draft. Saving never overwrites a historical revision.",
            "已载入早期内容作为新草稿，保存不会覆盖历史版本。",
          ),
        );
      }
    } catch (e) {
      if (valid(who, epoch)) setError((e as Error).message);
    } finally {
      if (valid(who, epoch)) {
        acting.current = false;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    if (form) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start" });
    }
  }, [form?.id, fromVersion]);
  const canonical = form
      ? lessons.some((lesson) => lesson.id === form.id)
      : false,
    dirty =
      !!form &&
      (!current || JSON.stringify(form) !== JSON.stringify(current.content));
  const sourceAlternatives = lessons.find(
    (lesson) => lesson.id === form?.id,
  )?.alternatives;
  const puzzleName = (value: string) =>
    value === "pyraminx"
      ? t("Pyraminx", "金字塔魔方")
      : value.replace("x", "×");
  const levelName = (value: string) =>
    value === "beginner"
      ? t("Beginner", "入门")
      : value === "intermediate"
        ? t("Intermediate", "进阶")
        : t("Advanced", "高级");
  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    max: number,
    multiline = false,
    disabled = false,
  ) => (
    <label>
      {label}
      {multiline ? (
        <textarea
          rows={4}
          maxLength={max}
          value={value}
          disabled={!canEdit || busy || disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          value={value}
          maxLength={max}
          disabled={!canEdit || busy || disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
  return (
    <>
      <article className="card">
        <h2>{t("Learning library", "课程库")}</h2>
        <p className="muted">
          {t(
            "Create original bilingual drills, revise teaching and publish only the exact reviewed revision. Existing learning history is retained.",
            "创建原创双语练习，修订教学内容，仅发布已审核的准确版本，并保留已有学习历史。",
          )}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query === q.trim()) void library();
            else setQuery(q.trim());
          }}
          style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
        >
          <label style={{ flex: 1 }}>
            {t(
              "Search ID or title in either language",
              "按编号或中英文标题搜索",
            )}
            <input
              maxLength={100}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <button disabled={busy || paging}>{t("Search", "搜索")}</button>
        </form>
        {canEdit && (
          <button
            className="secondary"
            disabled={busy || acting.current}
            onClick={() => {
              view.current++;
              setCurrent(undefined);
              changed(empty());
              setReason("");
              setHistory([]);
              setFromVersion(undefined);
            }}
          >
            {t("+ Create a drill", "+ 创建练习")}
          </button>
        )}
        {!canEdit && (
          <p>
            {t(
              "Moderator access can inspect courses. An administrator is required to change or publish them.",
              "审核员可查看课程，修改与发布需由管理员操作。",
            )}
          </p>
        )}
      </article>
      {!!error && (
        <div
          className="notice error"
          role="alert"
          style={{ overflowWrap: "anywhere" }}
        >
          {error}
        </div>
      )}
      {!!message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <div className="course-grid">
        {rows.map((row) => (
          <article className="card" key={row.id}>
            <span className="pill">
              {puzzleName(row.puzzle)} · {levelName(row.level)}
            </span>
            <h3>{row.title?.[locale] || row.id}</h3>
            <p>{row.summary?.[locale]}</p>
            <p className="fine">
              {row.published ? t("Published", "已发布") : t("Draft", "草稿")} ·
              v{row.version}
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void open(row.id)}
            >
              {t("Inspect / edit", "查看 / 编辑")}
            </button>
          </article>
        ))}
      </div>
      {next && rows.length < 150 && (
        <button disabled={paging || busy} onClick={() => void library(true)}>
          {t("More courses", "更多课程")}
        </button>
      )}
      {next && rows.length >= 150 && (
        <p>
          {t(
            "Refine the search to inspect more than 150 matches.",
            "如需查看超过 150 条结果，请缩小搜索范围。",
          )}
        </p>
      )}
      {form && (
        <article className="card" style={{ overflowWrap: "anywhere" }}>
          <h2 ref={heading} tabIndex={-1}>
            {current
              ? t("Course revision", "课程修订")
              : t("New original drill", "新原创练习")}
          </h2>
          <p className="fine">
            {current
              ? `${current.id} · v${current.version}`
              : t(
                  "An identity will be assigned when saved.",
                  "保存时会分配课程编号。",
                )}
            {fromVersion
              ? ` · ${t("proposed from", "引用版本")} v${fromVersion}`
              : ""}
          </p>
          {current?.published && (
            <div className="notice">
              {t(
                "Saving changes withdraws the current lesson and creates a draft. Active practice and downloads may need a refresh. Historical milestones are retained.",
                "保存修改会撤下当前课程并形成草稿，进行中的练习与下载可能需要刷新，历史里程碑会保留。",
              )}
            </div>
          )}
          {canonical && (
            <p>
              {t(
                "Built-in puzzle methods and verification sequences stay fixed. You can revise their bilingual teaching. Create a separate drill for a different sequence.",
                "内置课程的魔方方法与校验序列保持固定，可修订双语教学内容。如需不同序列，请另建练习。",
              )}
            </p>
          )}
          <label>
            {t("Puzzle", "魔方类型")}
            <select
              value={form.puzzle}
              disabled={!!current || busy || !canEdit}
              onChange={(e) =>
                changed({
                  ...form,
                  puzzle: e.target.value as EditableLesson["puzzle"],
                })
              }
            >
              {["2x2", "3x3", "4x4", "pyraminx"].map((p) => (
                <option key={p} value={p}>
                  {puzzleName(p)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Level", "级别")}
            <select
              value={form.level}
              disabled={canonical || busy || !canEdit}
              onChange={(e) =>
                changed({
                  ...form,
                  level: e.target.value as EditableLesson["level"],
                })
              }
            >
              {["beginner", "intermediate", "advanced"].map((p) => (
                <option key={p} value={p}>
                  {levelName(p)}
                </option>
              ))}
            </select>
          </label>
          {field(
            t("Turn sequence", "转动序列"),
            form.algorithm,
            (value) => changed({ ...form, algorithm: value }),
            4000,
            true,
            canonical,
          )}
          {!!sourceAlternatives?.length && (
            <section>
              <h3>
                {t("Reviewed-source shorter alternatives", "内置备选公式")}
              </h3>
              <p>
                {t(
                  "The original setup stays fixed. Load the checked alternative, review both languages, save a new draft and publish its new version. Existing sessions and historical progress retain their original version.",
                  "起始状态保持不变。可载入已校验的备选公式，审阅双语内容，保存新草稿并发布新版本。已有练习与历史进度保留原版本。",
                )}
              </p>
              <button
                disabled={busy || !canEdit}
                onClick={() =>
                  changed({ ...form, alternatives: sourceAlternatives })
                }
              >
                {t(
                  "Load built-in alternatives for review",
                  "载入内置备选公式以供审核",
                )}
              </button>
              {!!form.alternatives?.length && (
                <button
                  disabled={busy || !canEdit}
                  onClick={() => {
                    const { alternatives, ...baseline } = form;
                    changed(baseline);
                  }}
                >
                  {t("Keep only the original guide", "仅保留原公式")}
                </button>
              )}
            </section>
          )}
          {form.alternatives?.map((option) => (
            <section key={option.id}>
              <h4>{option.title[locale]}</h4>
              <code>{option.algorithm}</code>
              {(["en", "zh"] as const).map((language) => (
                <div key={language} lang={language}>
                  <strong>{language === "en" ? "English" : "简体中文"}</strong>
                  {option.steps[language].map((step, index) => (
                    <p key={index}>{step}</p>
                  ))}
                </div>
              ))}
            </section>
          ))}
          <label>
            {t("Suggested minutes", "建议用时（分钟）")}
            <input
              type="number"
              min={1}
              max={240}
              value={form.minutes}
              disabled={busy || !canEdit}
              onChange={(e) =>
                changed({ ...form, minutes: Number(e.target.value) })
              }
            />
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(min(100%,280px),1fr))",
              gap: 20,
            }}
          >
            {(["en", "zh"] as const).map((language) => (
              <section key={language}>
                <h3>{language === "en" ? "English" : "简体中文"}</h3>
                {field(
                  t("Title", "标题"),
                  form.title[language],
                  (value) =>
                    changed({
                      ...form,
                      title: { ...form.title, [language]: value },
                    }),
                  200,
                )}
                {field(
                  t("Introduction", "简介"),
                  form.summary[language],
                  (value) =>
                    changed({
                      ...form,
                      summary: { ...form.summary, [language]: value },
                    }),
                  2000,
                  true,
                )}
                {field(
                  t(
                    "Teaching steps · one paragraph per line",
                    "教学步骤 · 每行一个段落",
                  ),
                  form.steps[language].join("\n"),
                  (value) =>
                    changed({
                      ...form,
                      steps: { ...form.steps, [language]: value.split("\n") },
                    }),
                  30000,
                  true,
                )}
              </section>
            ))}
          </div>
          {canEdit && (
            <>
              {field(
                t(
                  "Reason for this edit · at least 10 characters",
                  "修改原因 · 至少 10 个字符",
                ),
                reason,
                setReason,
                1000,
                true,
              )}
              <button
                disabled={busy || !dirty || reason.trim().length < 10}
                onClick={() => void act()}
              >
                {current?.published
                  ? t(
                      "Save draft and withdraw current lesson",
                      "保存草稿并撤下当前课程",
                    )
                  : t("Save draft", "保存草稿")}
              </button>
            </>
          )}
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setPreview(!preview)}
          >
            {t("Read both language previews", "阅读两种语言的预览")}
          </button>
          {preview && (
            <div>
              {(["en", "zh"] as const).map((language) => (
                <section key={language}>
                  <h3>{form.title[language]}</h3>
                  <p>{form.summary[language]}</p>
                  <ol>
                    {form.steps[language].map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}
          {current && (
            <>
              <p>
                {t(
                  "Publishing uses the saved revision. Save changes first, then inspect both languages and check content rights.",
                  "发布使用已保存版本。请先保存修改，再核对两种语言及内容权利。",
                )}
              </p>
              {canEdit &&
                !current.published &&
                (
                  [
                    [
                      "en",
                      "I reviewed the saved English lesson",
                      "已审核保存的英文课程",
                    ],
                    [
                      "zh",
                      "I reviewed the saved Chinese lesson",
                      "已审核保存的中文课程",
                    ],
                    [
                      "rights",
                      "Rights, accuracy and audience suitability reviewed",
                      "已核对内容权利、准确性与受众适宜性",
                    ],
                  ] as const
                ).map(([key, en, zh]) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      checked={checks[key]}
                      disabled={busy || dirty || !preview}
                      onChange={(e) =>
                        setChecks({ ...checks, [key]: e.target.checked })
                      }
                    />
                    {t(en, zh)}
                  </label>
                ))}
              {canEdit && (
                <button
                  disabled={
                    busy ||
                    dirty ||
                    (!current.published &&
                      (!checks.en || !checks.zh || !checks.rights))
                  }
                  onClick={() => void act(!current.published)}
                >
                  {current.published
                    ? t("Withdraw saved revision", "撤下保存的版本")
                    : t("Publish reviewed revision", "发布已审核版本")}
                </button>
              )}
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void revisions()}
              >
                {t(
                  "Recent revision history · up to 50",
                  "近期版本记录 · 最多 50 条",
                )}
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void open(current.id)}
              >
                {t("Discard local changes and refresh", "放弃本地修改并刷新")}
              </button>
              {history.map((row) => (
                <p key={row.version}>
                  v{row.version} ·{" "}
                  {row.published
                    ? t("Published snapshot", "发布快照")
                    : t("Draft snapshot", "草稿快照")}{" "}
                  ·{" "}
                  {new Date(row.createdAt).toLocaleString(
                    locale === "zh" ? "zh-CN" : "en-US",
                  )}{" "}
                  <button
                    className="secondary"
                    disabled={busy || !canEdit}
                    onClick={() => void revisions(row.version)}
                  >
                    {t("Use as a new draft", "引用为新草稿")}
                  </button>
                </p>
              ))}
            </>
          )}
        </article>
      )}
    </>
  );
}
