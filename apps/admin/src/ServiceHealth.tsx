import React, { useEffect, useState, useRef } from "react";
import { OperationalSnapshot, type OperationalSignal } from "@cubers/core";
const names: Record<OperationalSignal, [string, string]> = {
  database: ["Database", "数据库"],
  redis: ["Redis and job queue", "Redis 与任务队列"],
  worker: ["Available background workers", "可用后台工作进程"],
  maintenance: ["Last successful cleanup", "最近成功清理"],
  media: ["Last successful media sweep", "最近成功媒体处理"],
  smtp: ["Last email delivery outcome", "最近邮件投递结果"],
  "media-processing": ["Media waiting for processing", "等待处理的媒体"],
  "media-failed": ["Rejected media", "已拒绝的媒体"],
  reports: ["Open reports", "待处理举报"],
  posts: ["Posts awaiting review", "待审帖子"],
  consents: ["Guardian requests awaiting review", "待审监护授权"],
  "evidence-review": ["Solve evidence awaiting review", "待审比赛证据"],
  "evidence-retention": [
    "Evidence past its deletion deadline",
    "已过删除期限的证据",
  ],
  "attempt-expiry": ["Unresolved attempts past expiry", "到期未结束的尝试"],
  "account-erasure": ["Due account-storage erasures", "到期账号存储清理"],
  "object-erasure": ["Due storage-object erasures", "到期存储对象清理"],
  "play-reconciliation": [
    "Competition integrity reconciliation",
    "竞赛一致性检查",
  ],
};
const stateNames = {
  ok: ["OK", "正常"],
  warning: ["Needs attention", "需要关注"],
  critical: ["Action required", "需要处理"],
  unknown: ["Not yet verified", "尚未验证"],
};
export function ServiceHealth({
  api,
  locale,
  refresh,
}: {
  api: (path: string) => Promise<unknown>;
  locale: "en" | "zh";
  refresh: number;
}) {
  const [snapshot, setSnapshot] = useState<OperationalSnapshot | null>(null),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const apiRef = useRef(api);
  apiRef.current = api;
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  useEffect(() => {
    let active = true,
      pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      setBusy(true);
      try {
        const value = OperationalSnapshot.parse(
          await apiRef.current("admin/operations"),
        );
        if (active) {
          setSnapshot(value);
          setError(false);
        }
      } catch {
        if (active) {
          setSnapshot(null);
          setError(true);
        }
      } finally {
        pending = false;
        if (active) setBusy(false);
      }
    }
    void load();
    const interval = setInterval(() => void load(), 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [refresh]);
  return (
    <section aria-label={t("Service health", "服务健康")}>
      <p className="muted">
        {t(
          "Regional aggregate signals only. Refreshes every minute; samples may be cached for ten seconds. External storage, SMTP delivery, backups, host resources and alert routing still need operator checks.",
          "仅展示本社区汇总信号。每分钟刷新，采样最多缓存十秒。外部存储、邮件实际投递、备份、主机资源和告警接收仍须运维验证。",
        )}
      </p>
      {busy && <p role="status">{t("Checking services…", "正在检查服务……")}</p>}
      {error && (
        <p role="alert" className="notice error">
          {t(
            "Service health is unavailable. Refresh or sign in again; no previous healthy result is being shown.",
            "服务健康暂不可用。请刷新或重新登录；不会显示先前的正常结果。",
          )}
        </p>
      )}
      {snapshot && (
        <>
          <div
            className={`notice ${snapshot.state === "critical" ? "error" : ""}`}
            role="status"
          >
            <strong>
              {t(...(stateNames[snapshot.state] as [string, string]))}
            </strong>{" "}
            / {snapshot.region} /{" "}
            {new Date(snapshot.sampledAt).toLocaleString(
              locale === "zh" ? "zh-CN" : "en-US",
            )}
          </div>
          {snapshot.queue && (
            <p>
              {t("Job queue", "任务队列")}: {t("waiting", "等待")}{" "}
              {snapshot.queue.waiting} / {t("active", "运行")}{" "}
              {snapshot.queue.active} / {t("scheduled", "延迟")}{" "}
              {snapshot.queue.delayed} /{" "}
              {t("retained failures", "保留失败记录")}{" "}
              {snapshot.queue.failedRetained} /{" "}
              {snapshot.queue.paused
                ? t("Paused", "已暂停")
                : t("Running", "未暂停")}
            </p>
          )}
          <div className="card table-card">
            <table>
              <caption>{t("Current service signals", "当前服务信号")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("Signal", "信号")}</th>
                  <th scope="col">{t("Status", "状态")}</th>
                  <th scope="col">{t("Count", "数量")}</th>
                  <th scope="col">
                    {t("Oldest item / last success", "最早任务／最近成功")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.checks.map((check) => (
                  <tr key={check.signal}>
                    <th scope="row">{t(...names[check.signal])}</th>
                    <td>
                      {t(...(stateNames[check.state] as [string, string]))}
                    </td>
                    <td>{check.count ?? "—"}</td>
                    <td>
                      {check.oldestAt
                        ? new Date(check.oldestAt).toLocaleString(
                            locale === "zh" ? "zh-CN" : "en-US",
                          )
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine">
            {t(
              "Queue failures include retained historical jobs; they do not by themselves mean a current outage. Unknown means no recent verified success. Review counts and ages are operational targets, not legal conclusions.",
              "队列失败数包含历史保留记录，单凭此数不能判断当前故障。尚未验证表示没有近期成功记录。审核数量与时长为运维目标，不代表法律结论。",
            )}
          </p>
        </>
      )}
    </section>
  );
}
