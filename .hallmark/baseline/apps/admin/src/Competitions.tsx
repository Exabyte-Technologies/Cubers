import {
  competitionFormatLabel,
  competitionStatusLabel,
  competitionInputLabel,
} from "@cubers/core";
import React, { useEffect, useRef, useState } from "react";
import {
  CompetitionDefinition,
  competitionScoreText,
  competitionAttemptCount,
  type CompetitionFormat,
} from "@cubers/core";
type Props = {
  api: (path: string, body?: unknown) => Promise<any>;
  locale: "en" | "zh";
  contextKey: string;
  reloadKey: number;
};
const blankRound = () => ({
  title: { en: "", zh: "" },
  format: "BEST1" as CompetitionFormat,
  opensAt: "",
  closesAt: "",
});
export function CompetitionAdmin({
  api,
  locale,
  contextKey,
  reloadKey,
}: Props) {
  function scoreText(score: Parameters<typeof competitionScoreText>[0]) {
    return competitionScoreText(score, locale);
  }
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const [rows, setRows] = useState<any[]>([]),
    [next, setNext] = useState<string | null>(null),
    [current, setCurrent] = useState<any>(),
    [canManage, setCanManage] = useState(false),
    [smartAvailable, setSmartAvailable] = useState(false),
    [cancelReason, setCancelReason] = useState(""),
    [reviews, setReviews] = useState<any[]>([]),
    [reviewNext, setReviewNext] = useState<string | null>(null),
    [selected, setSelected] = useState<any>(),
    [reason, setReason] = useState(""),
    [checked, setChecked] = useState(false),
    [checks, setChecks] = useState<Record<string, boolean>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState({
      title: { en: "", zh: "" },
      description: { en: "", zh: "" },
      puzzle: "3x3",
      input: "virtual",
      ranked: false,
      capacity: 100,
      registrationOpensAt: "",
      registrationClosesAt: "",
      rounds: [blankRound()],
    });
  const live = useRef(true),
    owner = useRef(contextKey),
    epoch = useRef(0),
    acting = useRef(false),
    apiRef = useRef(api);
  owner.current = contextKey;
  apiRef.current = api;
  async function load(append = false, reviewAppend = false) {
    const who = contextKey,
      run = ++epoch.current;
    try {
      const [events, pubs, devices] = await Promise.all([
        apiRef.current(
          `admin/competitions${append && next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
        ),
        apiRef.current(
          `admin/competition-publications${reviewAppend && reviewNext ? `?cursor=${reviewNext}` : ""}`,
        ),
        apiRef.current("devices"),
      ]);
      if (!live.current || who !== owner.current || run !== epoch.current)
        return;
      setRows((old) =>
        append
          ? [
              ...old,
              ...events.items.filter(
                (x: any) => !old.some((o) => o.id === x.id),
              ),
            ]
          : events.items,
      );
      setNext(events.nextCursor);
      setCanManage(events.canManage === true);
      setSmartAvailable(
        devices.devices.some(
          (d: any) =>
            d.enabled &&
            d.physicallyTested &&
            d.playEnabled &&
            d.playPlatforms.length,
        ),
      );
      setReviews((old) =>
        reviewAppend
          ? [
              ...old,
              ...pubs.items.filter((x: any) => !old.some((o) => o.id === x.id)),
            ]
          : pubs.items,
      );
      setReviewNext(pubs.nextCursor);
    } catch (e) {
      if (live.current && who === owner.current && run === epoch.current)
        setError((e as Error).message);
    }
  }
  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
      epoch.current++;
    };
  }, [contextKey, reloadKey]);
  async function run(work: () => Promise<void>) {
    if (acting.current) return;
    const who = contextKey;
    acting.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
      if (live.current && who === owner.current) await load();
    } catch (e) {
      if (live.current && who === owner.current) setError((e as Error).message);
    } finally {
      acting.current = false;
      if (live.current && who === owner.current) setBusy(false);
    }
  }
  const dateField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
  ) => (
    <label>
      {label}
      <input
        type="datetime-local"
        value={value}
        required
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
  return (
    <>
      <article className="card">
        <h2>{t("Prepare a competition", "准备比赛")}</h2>
        <p>
          {t(
            "Create a reviewed bilingual schedule with separate puzzle and input categories. Published schedules are fixed; cancel and create a replacement to change them. Ranked production play stays unavailable until app attestation is integrated.",
            "按魔方和输入方式分别创建双语比赛安排。发布后安排不可更改；如需变更，请取消并创建新比赛。接入应用真实性验证前，正式排名仍不可用。",
          )}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const definition = CompetitionDefinition.parse({
                ...form,
                registrationOpensAt: new Date(
                  form.registrationOpensAt,
                ).toISOString(),
                registrationClosesAt: new Date(
                  form.registrationClosesAt,
                ).toISOString(),
                rounds: form.rounds.map((r) => ({
                  ...r,
                  opensAt: new Date(r.opensAt).toISOString(),
                  closesAt: new Date(r.closesAt).toISOString(),
                })),
              });
              const saved = await apiRef.current(
                "admin/competitions",
                definition,
              );
              if (live.current) {
                setCurrent(saved);
                setChecks({});
              }
            });
          }}
        >
          <fieldset disabled={busy || !canManage}>
            <legend>
              {t("Administrator schedule editor", "管理员比赛编辑")}
            </legend>
            <div className="form-grid">
              {(["en", "zh"] as const).map((lang) => (
                <React.Fragment key={lang}>
                  <label>
                    {lang === "en" ? "English title" : "中文标题"}
                    <input
                      maxLength={120}
                      required
                      value={form.title[lang]}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          title: { ...form.title, [lang]: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    {lang === "en"
                      ? "English description and rules"
                      : "中文说明与规则"}
                    <textarea
                      maxLength={2000}
                      required
                      value={form.description[lang]}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          description: {
                            ...form.description,
                            [lang]: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </React.Fragment>
              ))}
              <label>
                {t("Puzzle", "魔方")}
                <select
                  value={form.puzzle}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      puzzle: e.target.value,
                      input:
                        form.input === "smart" && e.target.value !== "3x3"
                          ? "virtual"
                          : form.input,
                    })
                  }
                >
                  {["2x2", "3x3", "4x4", "pyraminx"].map((x) => (
                    <option key={x} value={x}>
                      {Object.hasOwn(competitionAttemptCount, x)
                        ? competitionFormatLabel(x, locale)
                        : x}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Input", "输入方式")}
                <select
                  value={form.input}
                  onChange={(e) => setForm({ ...form, input: e.target.value })}
                >
                  <option value="virtual">{t("Virtual", "虚拟")}</option>
                  <option value="scan">
                    {t("Physical scans", "实物扫描")}
                  </option>
                  <option value="smart" disabled={form.puzzle !== "3x3"}>
                    {t("Smart cube · 3×3", "智能魔方 · 三阶")}
                  </option>
                </select>
              </label>
              <label>
                {t("Capacity (1–100)", "人数上限（1–100）")}
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.capacity}
                  onChange={(e) =>
                    setForm({ ...form, capacity: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.ranked}
                  onChange={(e) =>
                    setForm({ ...form, ranked: e.target.checked })
                  }
                />
                {t(
                  "Ranked; physical attempts require uninterrupted private video review",
                  "排名比赛；实物尝试须连续私密录像并经审核",
                )}
              </label>
              {dateField(
                t(
                  "Registration opens (your local time)",
                  "报名开始（你的本地时间）",
                ),
                form.registrationOpensAt,
                (v) => setForm({ ...form, registrationOpensAt: v }),
              )}
              {dateField(
                t(
                  "Registration closes (your local time)",
                  "报名结束（你的本地时间）",
                ),
                form.registrationClosesAt,
                (v) => setForm({ ...form, registrationClosesAt: v }),
              )}
            </div>
            {form.rounds.map((round, index) => (
              <fieldset key={index}>
                <legend>{t(`Round ${index + 1}`, `第 ${index + 1} 轮`)}</legend>
                {(["en", "zh"] as const).map((lang) => (
                  <label key={lang}>
                    {lang === "en" ? "English round title" : "中文轮次标题"}
                    <input
                      required
                      maxLength={80}
                      value={round.title[lang]}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          rounds: form.rounds.map((r, i) =>
                            i === index
                              ? {
                                  ...r,
                                  title: { ...r.title, [lang]: e.target.value },
                                }
                              : r,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                <label>
                  {t("Scoring format", "计分方式")}
                  <select
                    value={competitionFormatLabel(round.format, locale)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        rounds: form.rounds.map((r, i) =>
                          i === index
                            ? {
                                ...r,
                                format: e.target.value as CompetitionFormat,
                              }
                            : r,
                        ),
                      })
                    }
                  >
                    {Object.keys(competitionAttemptCount).map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                {dateField(t("Round opens", "本轮开始"), round.opensAt, (v) =>
                  setForm({
                    ...form,
                    rounds: form.rounds.map((r, i) =>
                      i === index ? { ...r, opensAt: v } : r,
                    ),
                  }),
                )}
                {dateField(t("Round closes", "本轮结束"), round.closesAt, (v) =>
                  setForm({
                    ...form,
                    rounds: form.rounds.map((r, i) =>
                      i === index ? { ...r, closesAt: v } : r,
                    ),
                  }),
                )}
                {form.rounds.length > 1 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setForm({
                        ...form,
                        rounds: form.rounds.filter((_, i) => i !== index),
                      })
                    }
                  >
                    {t("Remove round", "移除此轮")}
                  </button>
                )}
              </fieldset>
            ))}
            <button
              type="button"
              disabled={busy || form.rounds.length >= 6}
              onClick={() =>
                setForm({ ...form, rounds: [...form.rounds, blankRound()] })
              }
            >
              {t("Add round", "增加轮次")}
            </button>
            <button disabled={busy} type="submit">
              {t("Save draft", "保存草稿")}
            </button>
          </fieldset>
        </form>
      </article>
      <article className="card">
        <h2>{t("Saved competitions", "已保存的比赛")}</h2>
        {rows.map((row) => (
          <div key={row.id} className="review-item">
            <strong>{t(row.title.en, row.title.zh)}</strong>
            <p>
              {row.puzzle} · {competitionInputLabel(row.input, locale)} ·{" "}
              {row.ranked ? t("Ranked", "排名") : t("Casual", "休闲")} ·{" "}
              {competitionStatusLabel(row.status, locale)} ·{" "}
              {new Date(row.startsAt).toLocaleString()}
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const value = await apiRef.current(
                    `admin/competitions/${row.id}`,
                  );
                  if (live.current) {
                    setCurrent(value);
                    setCancelReason("");
                    setChecks({});
                    setReason("");
                  }
                })
              }
            >
              {t("Review saved schedule", "核对已保存安排")}
            </button>
          </div>
        ))}
        {next && (
          <button
            disabled={busy || rows.length >= 500}
            onClick={() => void load(true)}
          >
            {t("More competitions", "更多比赛")}
          </button>
        )}
        {current && (
          <section>
            <h3>{t("Saved schedule preview", "已保存安排预览")}</h3>
            <h4>
              {current.title.en} / {current.title.zh}
            </h4>
            <p style={{ whiteSpace: "pre-wrap" }}>{current.description.en}</p>
            <p style={{ whiteSpace: "pre-wrap" }}>{current.description.zh}</p>
            <p>
              {current.puzzle} · {competitionInputLabel(current.input, locale)}{" "}
              · {current.capacity} ·{" "}
              {competitionStatusLabel(current.status, locale)} · v
              {current.version}
            </p>
            <p>
              {t("Registration", "报名")}{" "}
              {new Date(current.registrationOpensAt).toLocaleString()} –{" "}
              {new Date(current.registrationClosesAt).toLocaleString()}
            </p>
            {current.rounds.map((r: any) => (
              <p key={r.id}>
                {r.title.en} / {r.title.zh} ·{" "}
                {competitionFormatLabel(r.format, locale)} ·{" "}
                {new Date(r.opensAt).toLocaleString()} –{" "}
                {new Date(r.closesAt).toLocaleString()}
              </p>
            ))}
            {current.input === "smart" && !smartAvailable && (
              <div className="notice">
                {t(
                  "Smart hardware acceptance is pending. You can prepare a private draft, but publication and participation remain unavailable.",
                  "智能硬件尚待实机验收，可准备私密草稿；目前不能发布或参与此类比赛。",
                )}
              </div>
            )}
            {canManage && current.status === "DRAFT" && (
              <>
                {[
                  "englishReviewed",
                  "chineseReviewed",
                  "rulesReviewed",
                  "rightsConfirmed",
                ].map((key, i) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={!!checks[key]}
                      onChange={(e) =>
                        setChecks({ ...checks, [key]: e.target.checked })
                      }
                    />
                    {
                      [
                        t("English content reviewed", "已核对英文"),
                        t("Chinese content reviewed", "已核对中文"),
                        t(
                          "Schedule, scoring, inspection and privacy rules reviewed",
                          "已核对时间、计分、观察及隐私规则",
                        ),
                        t(
                          "Content and event rights confirmed",
                          "已确认内容与活动权利",
                        ),
                      ][i]
                    }
                  </label>
                ))}
                <button
                  disabled={
                    busy ||
                    Object.values(checks).filter(Boolean).length !== 4 ||
                    (current.input === "smart" && !smartAvailable)
                  }
                  onClick={() =>
                    void run(async () => {
                      await apiRef.current(
                        `admin/competitions/${current.id}/publish`,
                        { expectedVersion: current.version, ...checks },
                      );
                      const saved = await apiRef.current(
                        `admin/competitions/${current.id}`,
                      );
                      if (live.current) setCurrent(saved);
                    })
                  }
                >
                  {t("Publish saved competition", "发布这份已保存的比赛")}
                </button>
              </>
            )}
            {canManage && current.status !== "CANCELLED" && (
              <>
                <label>
                  {t(
                    "Cancellation reason (10–1000 characters)",
                    "取消原因（10–1000 字符）",
                  )}
                  <textarea
                    maxLength={1000}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy || cancelReason.trim().length < 10}
                  onClick={() =>
                    void run(async () => {
                      await apiRef.current(
                        `admin/competitions/${current.id}/cancel`,
                        {
                          expectedVersion: current.version,
                          reason: cancelReason,
                        },
                      );
                      const saved = await apiRef.current(
                        `admin/competitions/${current.id}`,
                      );
                      if (live.current) setCurrent(saved);
                    })
                  }
                >
                  {t(
                    "Cancel this competition and notify registrants",
                    "取消比赛并通知已报名者",
                  )}
                </button>
              </>
            )}
          </section>
        )}
      </article>
      <article className="card">
        <h2>{t("Anonymous score sharing review", "匿名成绩分享审核")}</h2>
        <p>
          {t(
            "An independent reviewer must inspect the exact score. Sharing never includes account names, recordings or other participants’ private results.",
            "须由独立审核员核对准确成绩。分享不包含账号昵称、录像或其他参赛者的私密成绩。",
          )}
        </p>
        {reviews.map((row) => (
          <div key={row.id} className="review-item">
            <p>
              {t(
                `Participant ${row.snapshot.number}`,
                `参赛编号 ${row.snapshot.number}`,
              )}{" "}
              · {row.snapshot.puzzle} ·{" "}
              {competitionInputLabel(row.snapshot.input, locale)} ·{" "}
              {competitionStatusLabel(row.status, locale)} ·{" "}
              {scoreText(row.snapshot.score)}
            </p>
            <button
              disabled={busy}
              onClick={() => {
                setSelected(row);
                setReason("");
                setChecked(false);
              }}
            >
              {t("Inspect result", "核对成绩")}
            </button>
          </div>
        ))}
        {reviewNext && (
          <button
            disabled={busy || reviews.length >= 150}
            onClick={() => void load(false, true)}
          >
            {t("More reviews", "更多审核")}
          </button>
        )}
        {selected && (
          <section>
            <h3>{t("Exact result preview", "准确成绩预览")}</h3>
            <p>
              {selected.snapshot.competitionId} · {selected.scope} ·{" "}
              {selected.snapshot.puzzle} ·{" "}
              {competitionInputLabel(selected.snapshot.input, locale)} ·{" "}
              {t(
                `Participant ${selected.snapshot.number}`,
                `参赛编号 ${selected.snapshot.number}`,
              )}
            </p>
            {selected.snapshot.rounds.map((r: any) => (
              <div key={r.roundId}>
                <h4>
                  {r.title.en} / {r.title.zh} ·{" "}
                  {competitionFormatLabel(r.format, locale)} ·{" "}
                  {scoreText(r.score)}
                </h4>
                <ol>
                  {r.slots.map((slot: any, index: number) => (
                    <li key={index}>
                      {slot.status === "APPROVED"
                        ? `${(slot.durationMs / 1000).toFixed(3)} s`
                        : competitionStatusLabel(slot.status, locale)}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            <p>
              {t("Total", "合计")} · {scoreText(selected.snapshot.score)}
            </p>
            {!selected.current && (
              <p role="status">
                {t(
                  "This request is stale; a new request is required.",
                  "该申请已失效，须重新申请。",
                )}
              </p>
            )}
            <label>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              {t(
                "I inspected this exact result and anonymous sharing eligibility",
                "已核对准确成绩与匿名分享资格",
              )}
            </label>
            <label>
              {t(
                "Review note (10–1000 characters)",
                "审核说明（10–1000 字符）",
              )}
              <textarea
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {[
              { label: t("Approve", "通过"), approve: true, cancel: false },
              { label: t("Reject", "拒绝"), approve: false, cancel: false },
              {
                label: t("Withdraw sharing", "撤回分享"),
                approve: false,
                cancel: true,
              },
            ].map((option) => (
              <button
                key={option.label}
                disabled={
                  busy ||
                  !selected.canReview ||
                  !checked ||
                  reason.trim().length < 10 ||
                  (!option.cancel &&
                    (!selected.current || selected.status !== "PENDING_REVIEW"))
                }
                onClick={() =>
                  void run(async () => {
                    await apiRef.current(
                      `admin/competition-publications/${selected.id}/${option.cancel ? "cancel" : "review"}`,
                      {
                        revision: selected.revision,
                        digest: selected.digest,
                        approve: option.approve,
                        checkedExactResult: true,
                        reason,
                      },
                    );
                    if (live.current) {
                      setSelected(undefined);
                      setChecked(false);
                    }
                  })
                }
              >
                {option.label}
              </button>
            ))}
          </section>
        )}
      </article>
    </>
  );
}
