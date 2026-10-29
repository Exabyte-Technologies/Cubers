import React, { useEffect, useRef, useState } from "react";
import {
  DeviceTestContent,
  DeviceTestCreate,
  DeviceTestEdit,
  DeviceTestChange,
  DeviceTestReview,
  DeviceTestModel,
  DeviceTestStatus,
  deviceTestChecks,
  deviceTestLabels,
  requiredDeviceChecks,
  deviceTestApprovalProblems,
  SMART_PROFILES,
  type DeviceTestContent as Content,
} from "@cubers/core";
type Props = {
  api: (path: string, body?: unknown) => Promise<any>;
  contextKey: string;
  reloadKey: number;
  locale: "en" | "zh";
};
const empty = (): Content => ({
  model: "gan-356-i3",
  platform: "ios",
  scope: "transport",
  provenance: "synthetic",
  firmware: "",
  phoneModel: "",
  osVersion: "",
  appBuild: "",
  buildSha256: "",
  sourceRevision: "",
  testedAt: new Date().toISOString(),
  caseReference: "",
  custodyReference: "",
  evidenceSha256: "",
  summary: { en: "", zh: "" },
  checks: Object.fromEntries(
    deviceTestChecks.map((key) => [key, { status: "not_run", notes: "" }]),
  ) as Content["checks"],
});
const local = (value: string) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export function DeviceTestManager({
  api,
  contextKey,
  reloadKey,
  locale,
}: Props) {
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const modelLabel = (value: string) =>
    SMART_PROFILES[value as Content["model"]]?.name ||
    t("Unknown model", "未知型号");
  const scopeLabel = (value: Content["scope"]) =>
    ({
      transport: t("Bluetooth transport", "蓝牙连接与数据"),
      learning: t("Guided lessons", "引导课程"),
      ranked: t("Ranked integrity", "排名诚信"),
    })[value];
  const [rows, setRows] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(),
    [content, setContent] = useState<Content>(empty),
    [history, setHistory] = useState<any[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [model, setModel] = useState(""),
    [status, setStatus] = useState(""),
    [canEdit, setCanEdit] = useState(false),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState(""),
    [review, setReview] = useState([false, false, false, false]);
  const epoch = useRef(0),
    bound = useRef(contextKey);
  bound.current = contextKey;
  async function load(next?: string, nextModel = model, nextStatus = status) {
    const run = ++epoch.current,
      scope = bound.current;
    setBusy(true);
    setMessage("");
    setRows([]);
    setSelected(undefined);
    setHistory([]);
    setCanEdit(false);
    const params = new URLSearchParams();
    if (next) params.set("cursor", next);
    if (nextModel) params.set("model", nextModel);
    if (nextStatus) params.set("status", nextStatus);
    try {
      const page = await api(
        `admin/device-tests${params.size ? `?${params}` : ""}`,
      );
      if (run !== epoch.current || scope !== bound.current) return;
      setRows(page.items);
      setCursor(page.nextCursor);
      setCanEdit(page.canEdit);
      setContent(empty());
      setReason("");
      setReview([false, false, false, false]);
    } catch (e) {
      if (run === epoch.current && scope === bound.current)
        setMessage((e as Error).message);
    } finally {
      if (run === epoch.current && scope === bound.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      epoch.current++;
    };
  }, [contextKey, reloadKey]);
  async function choose(row?: any) {
    if (busy) return;
    if (!row) {
      epoch.current++;
      setSelected(undefined);
      setContent(empty());
      setHistory([]);
      setReason("");
      setReview([false, false, false, false]);
      return;
    }
    const run = ++epoch.current,
      scope = bound.current;
    setBusy(true);
    setMessage("");
    try {
      const fresh = await api(`admin/device-tests/${row.id}`);
      if (run !== epoch.current || scope !== bound.current) return;
      setSelected(fresh);
      setContent(DeviceTestContent.parse(fresh.content));
      setHistory([]);
      setReason("");
      setReview([false, false, false, false]);
    } catch (e) {
      if (run === epoch.current && scope === bound.current)
        setMessage((e as Error).message);
    } finally {
      if (run === epoch.current && scope === bound.current) setBusy(false);
    }
  }
  async function act(action: () => Promise<any>) {
    if (busy) return;
    const run = ++epoch.current,
      scope = bound.current;
    setBusy(true);
    setMessage("");
    try {
      const row = await action();
      if (run !== epoch.current || scope !== bound.current) return;
      setSelected(row);
      setContent(DeviceTestContent.parse(row.content));
      setHistory([]);
      setReason("");
      setReview([false, false, false, false]);
      setMessage(
        t(
          "Saved. Hardware activation remains disabled.",
          "已保存，硬件启用仍保持关闭。",
        ),
      );
      setRows((old) =>
        [row, ...old.filter((item) => item.id !== row.id)].filter(
          (item) =>
            (!model || item.model === model) &&
            (!status || item.status === status),
        ),
      );
    } catch (e) {
      if (run === epoch.current && scope === bound.current)
        setMessage((e as Error).message);
    } finally {
      if (run === epoch.current && scope === bound.current) setBusy(false);
    }
  }
  const saved = selected ? DeviceTestContent.safeParse(selected.content) : null,
    unsaved =
      !saved?.success || JSON.stringify(content) !== JSON.stringify(saved.data),
    required = new Set(requiredDeviceChecks(content.scope)),
    problems = deviceTestApprovalProblems(content),
    reasonReady = reason.trim().length >= 10;
  function change(patch: Partial<Content>) {
    setContent((old) => ({ ...old, ...patch }));
    setReview([false, false, false, false]);
  }
  const stateLabel = (value: string) =>
    t(
      value,
      (
        {
          DRAFT: "草稿",
          SUBMITTED: "待独立审核",
          APPROVED: "范围内证据获批",
          REJECTED: "已拒绝",
          WITHDRAWN: "已撤回",
        } as Record<string, string>
      )[value] || value,
    );
  return (
    <>
      <article className="card">
        <h2>{t("Physical device test evidence", "实机测试证据")}</h2>
        <p>
          {t(
            "Record one exact cube, firmware, phone, OS and app build configuration. Review covers only its selected scope. This workflow cannot activate a device or certify compatibility.",
            "按具体魔方型号、固件、手机、系统和应用构建记录。审核仅涵盖所选范围，本流程不能启用设备或认证兼容性。",
          )}
        </p>
        <p>
          {t(
            "Keep evidence in your protected regional case register. Record its reference and SHA-256 digest here; no file or external URL is uploaded or opened. Exclude names, faces, audio, MAC addresses, serial numbers and credentials. Never label synthetic packets as a physical test.",
            "证据保存在受保护的本区域测试档案中，在此填写档案编号与 SHA-256 摘要；此处不上传文件或打开外部链接。请勿记录姓名、人脸、音频、MAC 地址、序列号或密钥；不得将模拟数据标作实机测试。",
          )}
        </p>
        <p>
          {t(
            "Records expire 365 days after the test. Editing cannot extend their original expiry. All three hardware models remain disabled.",
            "记录在测试后 365 天到期，编辑不能延长原到期时间。三个硬件型号均保持禁用。",
          )}
        </p>
        {!!message && <p role="status">{message}</p>}
        <div className="actions">
          <button disabled={busy || !canEdit} onClick={() => void choose()}>
            {t("New report", "新建报告")}
          </button>
          <button disabled={busy} onClick={() => void load()}>
            {t("Refresh current page", "刷新列表首页")}
          </button>
          {cursor && (
            <button disabled={busy} onClick={() => void load(cursor)}>
              {t("Next page", "下一页")}
            </button>
          )}
        </div>
        <label>
          {t("Filter model", "筛选型号")}
          <select
            disabled={busy}
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              void load(undefined, e.target.value, status);
            }}
          >
            <option value="">{t("All models", "全部型号")}</option>
            {DeviceTestModel.options.map((m) => (
              <option key={m} value={m}>
                {modelLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Filter status", "筛选状态")}
          <select
            disabled={busy}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              void load(undefined, model, e.target.value);
            }}
          >
            <option value="">{t("All statuses", "全部状态")}</option>
            {DeviceTestStatus.options.map((s) => (
              <option key={s} value={s}>
                {stateLabel(s)}
              </option>
            ))}
          </select>
        </label>
        {!busy && !rows.length && (
          <p>{t("No reports on this page.", "本页暂无报告。")}</p>
        )}
        {rows.map((row) => (
          <button key={row.id} disabled={busy} onClick={() => void choose(row)}>
            {modelLabel(row.model)} /{" "}
            {row.platform === "ios" ? "iOS" : "Android"} /{" "}
            {scopeLabel(row.scope)} / {stateLabel(row.status)} / v{row.version}
          </button>
        ))}
      </article>
      <article className="card">
        <h2>
          {selected
            ? `${stateLabel(selected.status)} / v${selected.version}`
            : t("New draft", "新建草稿")}
        </h2>
        {!canEdit && (
          <p>
            {t(
              "Read-only staff access. An administrator is required for changes.",
              "当前为只读权限，修改需管理员操作。",
            )}
          </p>
        )}
        {selected && (
          <p>
            {t("Expires", "到期时间")}:{" "}
            {new Date(selected.expiresAt).toLocaleString()} /{" "}
            {t("Reviewed submitted version", "已审核的提交版本")}:{" "}
            {selected.reviewedVersion ?? "—"}
          </p>
        )}
        <fieldset disabled={busy || !canEdit}>
          <legend>
            {t("Test configuration and custody", "测试配置与档案保管")}
          </legend>
          <label>
            {t("Exact cube model", "具体魔方型号")}
            <select
              value={content.model}
              onChange={(e) =>
                change({ model: e.target.value as Content["model"] })
              }
            >
              {DeviceTestModel.options.map((m) => (
                <option key={m} value={m}>
                  {modelLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Phone platform", "手机平台")}
            <select
              value={content.platform}
              onChange={(e) =>
                change({ platform: e.target.value as Content["platform"] })
              }
            >
              <option value="ios">iOS</option>
              <option value="android">Android</option>
            </select>
          </label>
          <label>
            {t("Acceptance scope", "验收范围")}
            <select
              value={content.scope}
              onChange={(e) =>
                change({ scope: e.target.value as Content["scope"] })
              }
            >
              <option value="transport">
                {t("Bluetooth transport", "蓝牙连接与数据")}
              </option>
              <option value="learning">
                {t("Transport and guided lessons", "蓝牙与引导课程")}
              </option>
              <option value="ranked">
                {t(
                  "Transport, lessons and ranked integrity",
                  "蓝牙、课程与排名诚信",
                )}
              </option>
            </select>
          </label>
          <label>
            {t("Evidence provenance", "证据来源")}
            <select
              value={content.provenance}
              onChange={(e) =>
                change({ provenance: e.target.value as Content["provenance"] })
              }
            >
              <option value="synthetic">
                {t("Synthetic / software only", "模拟／仅软件")}
              </option>
              <option value="physical">
                {t("Actual physical hardware test", "真实硬件实机测试")}
              </option>
            </select>
          </label>
          {(
            [
              ["firmware", "Cube firmware version", "魔方固件版本", 80],
              [
                "phoneModel",
                "Phone model (no serial)",
                "手机型号（勿填序列号）",
                80,
              ],
              ["osVersion", "OS version", "系统版本", 80],
              ["appBuild", "App build identifier", "应用构建标识", 80],
              [
                "buildSha256",
                "Tested app artifact SHA-256",
                "受测应用文件 SHA-256",
                64,
              ],
              [
                "sourceRevision",
                "Source revision (40 or 64 hex)",
                "源码版本（40 或 64 位十六进制）",
                64,
              ],
              [
                "caseReference",
                "Protected test case reference",
                "受保护测试档案编号",
                120,
              ],
              [
                "custodyReference",
                "Protected evidence custody reference",
                "受保护证据保管编号",
                120,
              ],
              [
                "evidenceSha256",
                "Evidence bundle SHA-256",
                "证据文件包 SHA-256",
                64,
              ],
            ] as const
          ).map(([key, en, zh, max]) => (
            <label key={key}>
              {t(en, zh)}
              <input
                value={content[key]}
                maxLength={max}
                autoComplete="off"
                onChange={(e) => change({ [key]: e.target.value })}
              />
            </label>
          ))}
          <label>
            {t(
              "Test date and time (your local time)",
              "测试时间（浏览器当地时间）",
            )}
            <input
              type="datetime-local"
              value={local(content.testedAt)}
              onChange={(e) => {
                const date = new Date(e.target.value);
                if (Number.isFinite(date.getTime()))
                  change({ testedAt: date.toISOString() });
              }}
            />
          </label>
          {(["en", "zh"] as const).map((language) => (
            <label key={language}>
              {language === "en" ? "English test summary" : "中文测试摘要"}
              <textarea
                maxLength={2000}
                value={content.summary[language]}
                onChange={(e) =>
                  change({
                    summary: { ...content.summary, [language]: e.target.value },
                  })
                }
              />
            </label>
          ))}
          {deviceTestChecks.map((key) => (
            <fieldset key={key}>
              <legend>
                {deviceTestLabels[key][locale]} /{" "}
                {required.has(key)
                  ? t("Required for this scope", "本范围必测")
                  : t("Outside this scope", "不在本次范围")}
              </legend>
              <label>
                {t("Observed result", "观察结果")}
                <select
                  value={content.checks[key].status}
                  onChange={(e) =>
                    change({
                      checks: {
                        ...content.checks,
                        [key]: {
                          ...content.checks[key],
                          status: e.target
                            .value as Content["checks"][typeof key]["status"],
                        },
                      },
                    })
                  }
                >
                  <option value="not_run">{t("Not run", "未测试")}</option>
                  <option value="passed">
                    {t("Passed with evidence", "有证据支持通过")}
                  </option>
                  <option value="failed">{t("Failed", "未通过")}</option>
                </select>
              </label>
              <label>
                {t(
                  "Reproduction steps and actual observations (10+ characters for a completed check)",
                  "复现步骤与实际观察（已测项目至少 10 字符）",
                )}
                <textarea
                  maxLength={1000}
                  value={content.checks[key].notes}
                  onChange={(e) =>
                    change({
                      checks: {
                        ...content.checks,
                        [key]: {
                          ...content.checks[key],
                          notes: e.target.value,
                        },
                      },
                    })
                  }
                />
              </label>
            </fieldset>
          ))}
          <label>
            {t("Reason for this change/review", "本次修改／审核原因")}
            <textarea
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            disabled={!reasonReady}
            onClick={() =>
              void act(() =>
                selected
                  ? api(
                      `admin/device-tests/${selected.id}/content`,
                      DeviceTestEdit.parse({
                        content,
                        expectedVersion: selected.version,
                        reason,
                      }),
                    )
                  : api(
                      "admin/device-tests",
                      DeviceTestCreate.parse({ content, reason }),
                    ),
              )
            }
          >
            {t("Save draft and clear previous review", "保存草稿并清除原审核")}
          </button>
          {selected && (
            <>
              {unsaved && (
                <p>
                  {t(
                    "Save form changes before submitting or reviewing the resulting version.",
                    "请先保存表单修改，再提交或审核生成的版本。",
                  )}
                </p>
              )}
              {selected.status === "DRAFT" && (
                <button
                  disabled={unsaved || !reasonReady}
                  onClick={() =>
                    void act(() =>
                      api(
                        `admin/device-tests/${selected.id}/submit`,
                        DeviceTestChange.parse({
                          expectedVersion: selected.version,
                          reason,
                        }),
                      ),
                    )
                  }
                >
                  {t(
                    "Submit saved version for independent review",
                    "提交保存版本进行独立审核",
                  )}
                </button>
              )}
              {selected.status !== "WITHDRAWN" && (
                <button
                  disabled={unsaved || !reasonReady}
                  onClick={() =>
                    void act(() =>
                      api(
                        `admin/device-tests/${selected.id}/withdraw`,
                        DeviceTestChange.parse({
                          expectedVersion: selected.version,
                          reason,
                        }),
                      ),
                    )
                  }
                >
                  {t("Withdraw saved report", "撤回保存的报告")}
                </button>
              )}
              {selected.status === "SUBMITTED" && (
                <>
                  {selected.contributedByYou && (
                    <p>
                      {t(
                        "You contributed content. Another administrator must review this report.",
                        "你参与了内容编写，须由另一名管理员审核。",
                      )}
                    </p>
                  )}
                  {!!problems.length && (
                    <p>
                      {t(
                        "Physical acceptance is incomplete for this scope.",
                        "本范围的实机验收尚未完成。",
                      )}
                    </p>
                  )}
                  {(
                    [
                      [
                        "I inspected the protected evidence and verified its digest",
                        "已查看受保护证据并核对摘要",
                      ],
                      [
                        "The evidence comes from the actual physical hardware",
                        "证据来自真实硬件实机测试",
                      ],
                      [
                        "The recorded firmware, phone, OS and app build match the evidence",
                        "固件、手机、系统和应用构建与证据一致",
                      ],
                      [
                        "I am independent of every content contributor",
                        "我未参与本报告任何版本的内容编写",
                      ],
                    ] as const
                  ).map(([en, zh], i) => (
                    <label className="check" key={en}>
                      <input
                        type="checkbox"
                        checked={review[i]}
                        disabled={!selected.canReview || unsaved}
                        onChange={(e) =>
                          setReview((old) =>
                            old.map((value, n) =>
                              n === i ? e.target.checked : value,
                            ),
                          )
                        }
                      />
                      {t(en, zh)}
                    </label>
                  ))}
                  <button
                    disabled={
                      unsaved ||
                      !reasonReady ||
                      !selected.canReview ||
                      problems.length > 0 ||
                      !review.every(Boolean)
                    }
                    onClick={() =>
                      void act(() =>
                        api(
                          `admin/device-tests/${selected.id}/review`,
                          DeviceTestReview.parse({
                            approve: true,
                            expectedVersion: selected.version,
                            reason,
                            evidenceInspected: true,
                            physicalDeviceConfirmed: true,
                            configurationConfirmed: true,
                            independentReview: true,
                          }),
                        ),
                      )
                    }
                  >
                    {t(
                      "Approve evidence for this scope only",
                      "仅批准本范围内的证据",
                    )}
                  </button>
                  <button
                    disabled={unsaved || !reasonReady || !selected.canReview}
                    onClick={() =>
                      void act(() =>
                        api(
                          `admin/device-tests/${selected.id}/review`,
                          DeviceTestReview.parse({
                            approve: false,
                            expectedVersion: selected.version,
                            reason,
                          }),
                        ),
                      )
                    }
                  >
                    {t("Reject with reason", "说明原因并拒绝")}
                  </button>
                </>
              )}
            </>
          )}
        </fieldset>
        {selected && (
          <button
            disabled={busy}
            onClick={() => {
              const run = ++epoch.current,
                scope = bound.current;
              setBusy(true);
              void api(`admin/device-tests/${selected.id}/history`)
                .then((items) => {
                  if (run === epoch.current && scope === bound.current)
                    setHistory(items);
                })
                .catch((e) => {
                  if (run === epoch.current && scope === bound.current)
                    setMessage(e.message);
                })
                .finally(() => {
                  if (run === epoch.current && scope === bound.current)
                    setBusy(false);
                });
            }}
          >
            {t("Load recent 20 revisions", "读取最近 20 个版本")}
          </button>
        )}
        {history.map((row) => (
          <details key={row.id}>
            <summary>
              v{row.version} / {new Date(row.createdAt).toLocaleString()}
            </summary>
            <p>{row.reason}</p>
            <pre>{JSON.stringify(row.snapshot, null, 2)}</pre>
          </details>
        ))}
      </article>
    </>
  );
}
