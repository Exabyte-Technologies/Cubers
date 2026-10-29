import { ReplayShareReview } from "./ReplayShareReview";
import { ConsentDocumentViewer } from "./ConsentDocumentViewer";
import { ServiceHealth } from "./ServiceHealth";
import { CampaignManager } from "./CampaignManager";
import { AnnouncementManager } from "./AnnouncementManager";
import { DeviceTestManager } from "./DeviceTestManager";
import { CompetitionAdmin } from "./Competitions";
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  ShieldCheck,
  Users,
  BookOpen,
  Settings,
  ClipboardList,
  LogOut,
  Box,
  Check,
  RefreshCw,
  Eye,
  Globe,
  Activity,
  Menu,
  X,
} from "lucide-react";
import "./style.css";
import { CourseEditor } from "./CourseEditor";
import { AchievementCardReview } from "./AchievementCardReview";
import {
  ProfileSkills,
  ProfileSettings,
  CommunityDetection,
  serviceError,
  serviceConnectionError,
  readServicePayload,
  localizeServiceSuccess,
} from "@cubers/core";
type Tab =
  | "overview"
  | "review"
  | "users"
  | "courses"
  | "settings"
  | "audit"
  | "connections"
  | "profiles";
type CardTab =
  | "operations"
  | "replay-shares"
  | "achievement-cards"
  | "competitions"
  | "campaigns"
  | "announcements"
  | "device-tests";
function App() {
  const [token, setToken] = useState(
      () => sessionStorage.getItem("cubers-admin-token") || "",
    ),
    [tab, setTab] = useState<Tab | CardTab>("overview"),
    [locale, setLocale] = useState<"en" | "zh">("en"),
    [data, setData] = useState<any>(),
    [queue, setQueue] = useState<any>(),
    [settings, setSettings] = useState<any>(),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [reason, setReason] = useState(""),
    [baseUrl, setBaseUrl] = useState(""),
    [model, setModel] = useState(""),
    [enabled, setEnabled] = useState(false),
    [checks, setChecks] = useState<Record<string, boolean>>({});
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentReviews, setDocumentReviews] = useState<
    Record<string, string>
  >({});
  useEffect(() => {
    setDocumentId(null);
    setDocumentReviews({});
    const hide = () => {
      if (document.hidden) {
        setDocumentId(null);
        setDocumentReviews({});
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [token, tab]);
  const [profileLookup, setProfileLookup] = useState("");
  const [cardRefresh, setCardRefresh] = useState(0);
  const [courseRefresh, setCourseRefresh] = useState(0);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const [community, setCommunity] = useState<CommunityDetection | null>(null);
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  async function detectCommunity() {
    try {
      const response = await fetch("/v1/community-region", {
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error();
      const detected = CommunityDetection.parse(await response.json());
      if (!import.meta.env.DEV && detected.source !== "ip") throw new Error();
      setCommunity(detected);
      return detected;
    } catch {
      throw new Error(
        t(
          "Community detection is unavailable. Retry before signing in.",
          "暂时无法检测社区，请重试后再登录。",
        ),
      );
    }
  }
  useEffect(() => {
    if (!token) void detectCommunity().catch((e) => setError(e.message));
  }, [token]);
  async function api(path: string, body?: unknown, method?: string) {
    const staleSession = () =>
      serviceError(409, "Staff session changed. Refresh.", locale);
    if (token && tokenRef.current !== token) throw staleSession();
    const requestMethod = method || (body === undefined ? "GET" : "POST");
    let response: Response, data: unknown;
    try {
      response = await fetch(`/v1/${path}`, {
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(
          path.endsWith("/document-review") ? 25000 : 15000,
        ),
        method: requestMethod,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      data = await readServicePayload(response);
    } catch {
      if (token && tokenRef.current !== token) throw staleSession();
      throw serviceConnectionError(locale);
    }
    if (token && tokenRef.current !== token) throw staleSession();
    if (!response.ok) {
      if (response.status === 401) {
        sessionStorage.removeItem("cubers-admin-token");
        setToken("");
      }
      throw serviceError(response.status, data, locale);
    }
    return localizeServiceSuccess(path, requestMethod, data, locale) as any;
  }
  async function load() {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      if (tab === "overview") {
        setData(await api("admin/overview"));
        setQueue(await api("admin/queue"));
      } else if (tab === "courses") {
        setCourseRefresh((value) => value + 1);
      } else if (
        tab === "campaigns" ||
        tab === "announcements" ||
        tab === "device-tests" ||
        tab === "operations"
      ) {
        setCourseRefresh((value) => value + 1);
      } else if (tab === "competitions") {
        setCourseRefresh((value) => value + 1);
      } else if (tab === "achievement-cards" || tab === "replay-shares") {
        setCardRefresh((value) => value + 1);
      } else if (tab === "review") {
        setQueue(await api("admin/queue"));
      } else if (tab === "settings") {
        const s = await api("admin/settings");
        setSettings(s);
        setBaseUrl(s.ai?.value?.baseUrl || s.baseUrl || "");
        setModel(s.ai?.value?.model || s.model || "");
        setEnabled(s.ai?.value?.enabled ?? false);
      } else setData(await api(`admin/${tab}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setData(undefined);
    void load();
  }, [tab, token]);
  async function act(path: string, body: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(path, body);
      setMessage(
        t("Saved. The audit trail has been updated.", "已保存并记录审核日志。"),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const detected = await detectCommunity();
      if (
        !community ||
        community.region !== detected.region ||
        detected.region !== detected.serverRegion
      ) {
        setPassword("");
        setOtp("");
        throw new Error(
          t(
            "Check the community below. Use its regional administrator site before signing in.",
            "请核对下方社区，并使用该社区的管理员入口登录。",
          ),
        );
      }
      const r = await api("auth/login", { email, password, otp });
      if (!["ADMIN", "MODERATOR"].includes(r.user.role))
        throw new Error("An administrator or moderator account is required");
      sessionStorage.setItem("cubers-admin-token", r.token);
      setToken(r.token);
      setPassword("");
      setOtp("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOtp("");
      setBusy(false);
    }
  }
  const check = (id: string, label: string) => (
    <label className="check">
      <input
        type="checkbox"
        checked={!!checks[id]}
        onChange={(e) => setChecks({ ...checks, [id]: e.target.checked })}
      />
      {label}
    </label>
  );
  const button = (
    label: string,
    onClick: () => void,
    secondary = false,
    disabled = false,
  ) => (
    <button
      className={secondary ? "secondary" : ""}
      onClick={onClick}
      disabled={busy || disabled}
    >
      {label}
    </button>
  );
  async function media(id: string) {
    try {
      const result = await api(`media/${id}`);
      if (result.type === "application/pdf" && result.status === "READY") {
        setDocumentReviews((previous) => {
          const next = { ...previous };
          delete next[id];
          return next;
        });
        setDocumentId(id);
        return;
      }
      if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
      else setError(`Media status: ${result.status}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!token)
    return (
      <div className="login">
        <div className="login-story">
          <img src="/logo.svg" width="100" alt="Cubers" />
          <p className="login-wordmark">Cubers Studio</p>
          <h1>
            {t(
              "A thoughtful space\nfor a growing community.",
              "为不断成长的社区，\n留一份用心。",
            )}
          </h1>
          <p>
            {t(
              "Care for the conversations. Celebrate fair play. Keep learning a good place to be.",
              "守护每一次交流，支持公平竞赛，让学习始终安心。",
            )}
          </p>
        </div>
        <form onSubmit={login} className="login-form">
          <div className="pill">
            <ShieldCheck size={16} />{" "}
            {t("Protected administrator access", "受保护的管理员入口")}
          </div>
          <h2>{t("Welcome back.", "欢迎回来。")}</h2>
          <p className="muted">
            {t(
              "Use your administrator account and authenticator code.",
              "请使用管理员账号与身份验证器验证码。",
            )}
          </p>
          <label>
            {t("Email", "邮箱")}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            {t("Password", "密码")}
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label>
            {t("Six-digit MFA code", "六位 MFA 验证码")}
            <input
              inputMode="numeric"
              required
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              autoComplete="one-time-code"
            />
          </label>
          <p className="muted">
            {t(
              "Each authenticator code can be used once. After setup or a recent login, wait for the next code.",
              "每个身份验证器验证码只能使用一次。刚完成设置或登录后，请等待下一组验证码。",
            )}
          </p>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <button
            disabled={
              busy || !community || community.region !== community.serverRegion
            }
            type="submit"
          >
            {t("Enter Studio", "进入管理台")}
          </button>
          <p className="fine" aria-live="polite">
            {community
              ? t("Community: ", "所属社区：") +
                (community.region === "CN"
                  ? t("Mainland China", "中国大陆")
                  : t("International", "国际社区"))
              : t("Determining community…", "正在确定社区……")}
            {community &&
              community.region !== community.serverRegion &&
              t(
                " / Open the administrator site for this community.",
                " / 请使用此社区的管理员入口。",
              )}
          </p>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setError("");
              setBusy(true);
              void detectCommunity()
                .catch((e) => {
                  setCommunity(null);
                  setError(e.message);
                })
                .finally(() => setBusy(false));
            }}
          >
            {t("Refresh community", "刷新所属社区")}
          </button>
          <a className="fine" href="https://freeipapi.com" rel="noreferrer">
            IP Geolocation by FreeIPAPI
          </a>
          <button
            type="button"
            className="text-button"
            onClick={() => setLocale(locale === "en" ? "zh" : "en")}
          >
            {locale === "en" ? "简体中文" : "English"}
          </button>
          <p className="fine">
            {t(
              "Administrator MFA is mandatory. User accounts cannot access this workspace.",
              "管理员必须使用 MFA，普通用户账号无法访问此工作区。",
            )}
          </p>
        </form>
      </div>
    );
  const nav: [Tab | CardTab, React.ElementType, string, string][] = [
    ["overview", LayoutDashboard, "Overview", "概览"],
    ["operations", Activity, "Service health", "服务健康"],
    ["review", ShieldCheck, "Review queue", "审核队列"],
    ["connections", Users, "Mentorship review", "指导关系审核"],
    ["profiles", Users, "Profile review", "个人页审核"],
    ["achievement-cards", ShieldCheck, "Card review", "卡片审核"],
    ["replay-shares", ShieldCheck, "Replay sharing", "回放分享"],
    ["users", Users, "People", "用户"],
    ["courses", BookOpen, "Learning library", "课程库"],
    ["competitions", ClipboardList, "Competitions", "比赛"],
    ["campaigns", ClipboardList, "Sponsor campaigns", "赞助活动"],
    ["announcements", ClipboardList, "Cubers updates", "Cubers 公告"],
    ["device-tests", ShieldCheck, "Device test evidence", "设备测试证据"],
    ["settings", Settings, "Configuration", "配置"],
    ["audit", ClipboardList, "Audit trail", "审核日志"],
  ];
  return (
    <div
      className="shell"
      data-accent={
        tab === "courses"
          ? "mint"
          : tab === "competitions"
            ? "coral"
            : [
                  "review",
                  "connections",
                  "profiles",
                  "achievement-cards",
                  "replay-shares",
                  "users",
                  "announcements",
                ].includes(tab)
              ? "blue"
              : "pear"
      }
    >
      <aside className={navigationOpen ? "navigation-open" : ""}>
        <div className="brand">
          <img src="/logo.svg" width="40" alt="" />
          <span>
            cubers<span className="studio">Studio</span>
          </span>
        </div>
        <div className="workspace">
          {t("Community workspace", "社区管理工作区")}
        </div>
        <button
          className="navigation-toggle secondary"
          aria-expanded={navigationOpen}
          aria-controls="workspace-navigation"
          onClick={() => setNavigationOpen((open) => !open)}
        >
          {navigationOpen ? <X size={18} /> : <Menu size={18} />}
          {t("Browse workspace", "浏览工作区")}
        </button>
        <nav id="workspace-navigation" aria-label={t("Workspace", "工作区")}>
          {nav.map(([id, Icon, en, zh]) => (
            <button
              key={id}
              className={tab === id ? "nav active" : "nav"}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setTab(id);
                setNavigationOpen(false);
                setError("");
                setMessage("");
              }}
            >
              <Icon size={19} />
              {t(en, zh)}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p>
            <ShieldCheck size={16} />
            {t("MFA-protected session", "MFA 保护的会话")}
          </p>
          <button
            className="nav"
            onClick={() => {
              void api("auth/logout", {});
              sessionStorage.removeItem("cubers-admin-token");
              setToken("");
            }}
          >
            <LogOut size={18} />
            {t("Sign out", "退出")}
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumbs">
            Cubers <span>/</span>{" "}
            {t(
              nav.find((n) => n[0] === tab)![2],
              nav.find((n) => n[0] === tab)![3],
            )}
          </div>
          <div className="header-actions">
            <button
              className="text-button"
              onClick={() => setLocale(locale === "en" ? "zh" : "en")}
            >
              <Globe size={16} />
              {locale === "en" ? "中文" : "EN"}
            </button>
            <button
              className="icon-button"
              aria-label="Refresh"
              onClick={() => void load()}
            >
              <RefreshCw size={18} />
            </button>
            <span className="avatar">C</span>
          </div>
        </header>
        <section className="content">
          <div className="page-title">
            <h1>
              {tab === "overview"
                ? t("Community workspace", "社区管理工作区")
                : t(
                    nav.find((n) => n[0] === tab)![2],
                    nav.find((n) => n[0] === tab)![3],
                  )}
            </h1>
            <span className="pill">
              {data?.region || "REGIONAL"} /{" "}
              {t("Live service data", "实时服务数据")}
            </span>
          </div>
          <p className="muted">
            {t(
              "A little attention here makes a better experience everywhere.",
              "这里多一分用心，每一位用户就多一分安心。",
            )}
          </p>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="notice" role="status">
              {message}
            </div>
          )}
          {busy && (
            <p className="fine" role="status">
              {t("Working…", "处理中……")}
            </p>
          )}
          {tab === "operations" && (
            <ServiceHealth
              key={token}
              api={api}
              locale={locale}
              refresh={courseRefresh}
            />
          )}
          {tab === "overview" && data && (
            <>
              <div className="metrics">
                {[
                  [data.pendingPosts, "Posts to review", "待审帖子", "mint"],
                  [
                    data.pendingConsent,
                    "Guardian requests",
                    "监护人申请",
                    "lavender",
                  ],
                  [
                    data.provisionalAttempts,
                    "Solve verifications",
                    "成绩核验",
                    "yellow",
                  ],
                  [data.openReports, "Open reports", "待处理举报", "peach"],
                ].map(([value, en, zh, color]) => (
                  <article className={`metric ${color}`} key={String(en)}>
                    <span>{t(String(en), String(zh))}</span>
                    <strong>{value}</strong>
                    <span className="fine">
                      {t("Awaiting your attention", "等待你的处理")}
                    </span>
                  </article>
                ))}
              </div>
              <div className="columns">
                <article className="card">
                  <div className="card-title">
                    <h2>
                      {t(
                        "The human side of the queue",
                        "审核队列的背后，是每一个人",
                      )}
                    </h2>
                    <ShieldCheck size={22} />
                  </div>
                  <p className="muted">
                    {t(
                      "Read the context, record a clear reason, and protect personal information. Children’s posts need both guardian and moderator approval.",
                      "阅读上下文，记录清晰原因，保护个人信息。儿童帖子须同时获得监护人和管理员批准。",
                    )}
                  </p>
                  <div className="list-row">
                    <span>{t("Community contributions", "社区投稿")}</span>
                    <b>{data.pendingPosts}</b>
                  </div>
                  <div className="list-row">
                    <span>{t("Accounts in this region", "本地区账号")}</span>
                    <b>{data.users}</b>
                  </div>
                  {button(t("Open review queue", "打开审核队列"), () =>
                    setTab("review"),
                  )}
                </article>
                <article className="card green-card">
                  <Box size={36} />
                  <h2>
                    {t("Fair play is a process.", "公平竞赛，靠用心核验。")}
                  </h2>
                  <p>
                    {t(
                      "Recorded physical solves stay provisional until a reviewer checks the scramble, continuity and final state.",
                      "实物成绩在核验打乱、录像连续性和最终状态前，保持待审核状态。",
                    )}
                  </p>
                  <p className="fine">
                    {t(
                      "No footage is public. No faces or audio required.",
                      "录像不公开，不要求拍摄人脸或录音。",
                    )}
                  </p>
                </article>
              </div>
            </>
          )}
          {tab === "replay-shares" && (
            <ReplayShareReview
              key={JSON.stringify([token, community?.region])}
              api={api}
              locale={locale}
              reloadKey={cardRefresh}
            />
          )}
          {tab === "achievement-cards" && (
            <AchievementCardReview
              key={JSON.stringify([token, community?.region])}
              api={api}
              contextKey={JSON.stringify([token, community?.region])}
              reloadKey={cardRefresh}
              locale={locale}
            />
          )}
          {tab === "review" && queue && (
            <>
              <article className="card">
                <h2>
                  {t(
                    "Every decision needs a reason.",
                    "每一次决定，都留下原因。",
                  )}
                </h2>
                <label>
                  {t(
                    "Review note / minimum 10 characters",
                    "审核说明 / 至少 10 个字符",
                  )}
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t(
                      "Explain the evidence and your decision…",
                      "请说明证据与处理理由……",
                    )}
                  />
                </label>
              </article>
              {Object.values(queue).every(
                (x) => Array.isArray(x) && x.length === 0,
              ) && (
                <article className="card empty">
                  <Check size={32} />
                  <h2>{t("All caught up.", "暂时都处理完了。")}</h2>
                  <p className="muted">
                    {t(
                      "New submissions will appear here.",
                      "新的申请会显示在这里。",
                    )}
                  </p>
                </article>
              )}
              {queue.posts.map((p: any) => (
                <article className="card" key={p.id}>
                  <div className="card-title">
                    <h2>{p.author.displayName}</h2>
                    <span className="pill">
                      {t("Post", "帖子")} / v{p.revision}
                    </span>
                  </div>
                  <p className="pre-wrap">{p.body}</p>
                  <p className="fine">
                    {t("Guardian approval", "监护人批准")}:{" "}
                    {p.guardianApproved ? "✓" : "—"}{" "}
                    {p.aiGenerated
                      ? p.aiSourceLabel === "1"
                        ? " / Source file: AI-generated (unverified)"
                        : p.aiSourceLabel === "2"
                          ? " / Source file: possibly AI-generated"
                          : p.aiSourceLabel === "3"
                            ? " / Source file: suspected AI-generated"
                            : " / User-declared AI involvement"
                      : ""}
                  </p>
                  <div className="actions">
                    {p.mediaIds.map((id: string) =>
                      button(
                        t("View media", "查看媒体"),
                        () => void media(id),
                        true,
                      ),
                    )}
                    {button(
                      t("Approve", "批准"),
                      () =>
                        void act(`admin/posts/${p.id}/review`, {
                          approve: true,
                          revision: p.revision,
                          reason,
                        }),
                    )}
                    {button(
                      t("Reject", "拒绝"),
                      () =>
                        void act(`admin/posts/${p.id}/review`, {
                          approve: false,
                          revision: p.revision,
                          reason,
                        }),
                      true,
                    )}
                  </div>
                </article>
              ))}
              {queue.consents.map((p: any) => (
                <article className="card" key={p.id}>
                  <h2>{t("Guardian consent request", "监护人同意申请")}</h2>
                  <p className="fine">{p.id}</p>
                  <div className="actions">
                    {button(
                      t("View document pages", "查看文件页面"),
                      () => void media(p.documentId),
                      true,
                    )}
                  </div>
                  {check(
                    `${p.id}-doc`,
                    t(
                      "Signed consent documentation checked",
                      "已核验签署同意书",
                    ),
                  )}
                  {check(
                    `${p.id}-identity`,
                    t("Guardian identity checked", "已核验监护人身份"),
                  )}
                  {check(
                    `${p.id}-relationship`,
                    t("Guardian relationship checked", "已核验监护关系"),
                  )}
                  <div className="actions">
                    {button(
                      t("Approve", "批准"),
                      () =>
                        void act(`admin/consents/${p.id}/review`, {
                          approve: true,
                          reason,
                          signedDocumentChecked: !!checks[`${p.id}-doc`],
                          guardianIdentityChecked: !!checks[`${p.id}-identity`],
                          relationshipChecked: !!checks[`${p.id}-relationship`],
                          documentReviewId: documentReviews[p.documentId],
                        }),
                    )}
                    {button(
                      t("Reject", "拒绝"),
                      () =>
                        void act(`admin/consents/${p.id}/review`, {
                          approve: false,
                          reason,
                          signedDocumentChecked: !!checks[`${p.id}-doc`],
                          guardianIdentityChecked: !!checks[`${p.id}-identity`],
                          relationshipChecked: !!checks[`${p.id}-relationship`],
                        }),
                      true,
                    )}
                  </div>
                </article>
              ))}
              {queue.attempts.map((p: any) => (
                <article className="card" key={p.id}>
                  <h2>
                    {p.room.puzzle} / {p.room.input} /{" "}
                    {p.appealed
                      ? t("Appeal", "申诉")
                      : t("Physical solve", "实物还原")}
                  </h2>
                  <p className="fine">
                    {p.id} / {p.status}
                  </p>
                  {p.smart && (
                    <div className="notice">
                      <p>
                        {p.smart.model} / {p.smart.platform} /{" "}
                        {p.smart.nextSequence}{" "}
                        {t("received turns", "次接收转动")}
                      </p>
                      <p>
                        {p.smart.continuity === "counter"
                          ? t(
                              "Hardware counters checked; this is not hardware attestation.",
                              "已核对硬件计数；这不构成硬件真实性证明。",
                            )
                          : t(
                              "Net states agree; this model cannot prove every intermediate turn.",
                              "净状态相符；此型号无法证明每次中间转动。",
                            )}
                      </p>
                      <p>
                        {t(
                          "Verify the complete private footage before approving any ranked result.",
                          "批准任何排名成绩前，须核验完整私密录像。",
                        )}
                      </p>
                    </div>
                  )}
                  <p className="algorithm">{p.scramble.join(" ")}</p>
                  {p.evidenceId ? (
                    button(
                      t("Open private evidence", "打开私人证据"),
                      () => void media(p.evidenceId),
                      true,
                    )
                  ) : (
                    <div className="notice error">
                      {t(
                        "Evidence missing. Do not approve.",
                        "缺少证据，请勿批准。",
                      )}
                    </div>
                  )}
                  {[
                    "evidenceChecked",
                    "uninterrupted",
                    "scrambleMatches",
                    "cubeAndHandsVisible",
                    "finalStateSolved",
                  ].map((k) =>
                    check(
                      `${p.id}-${k}`,
                      (
                        {
                          evidenceChecked: t("Footage reviewed", "已审阅录像"),
                          uninterrupted: t(
                            "No recording interruption",
                            "录像连续完整",
                          ),
                          scrambleMatches: t(
                            "Scramble matches server record",
                            "打乱符合服务器记录",
                          ),
                          cubeAndHandsVisible: t(
                            "Cube and hands visible throughout",
                            "魔方和手始终可见",
                          ),
                          finalStateSolved: t(
                            "Final puzzle state is solved",
                            "最终魔方已还原",
                          ),
                        } as any
                      )[k],
                    ),
                  )}
                  <div className="actions">
                    {[true, false].map((approve) =>
                      button(
                        approve
                          ? t("Approve result", "批准成绩")
                          : t("Reject result", "拒绝成绩"),
                        () =>
                          void act(`admin/attempts/${p.id}/review`, {
                            approve,
                            reason,
                            ...Object.fromEntries(
                              [
                                "evidenceChecked",
                                "uninterrupted",
                                "scrambleMatches",
                                "cubeAndHandsVisible",
                                "finalStateSolved",
                              ].map((k) => [k, !!checks[`${p.id}-${k}`]]),
                            ),
                          }),
                        !approve,
                      ),
                    )}
                  </div>
                </article>
              ))}
              {["comments", "clubs", "reports"].flatMap((kind) =>
                queue[kind].map((p: any) => (
                  <article className="card" key={p.id}>
                    <span className="pill">{kind}</span>
                    <h2>{p.name || p.body || p.reason}</h2>
                    <p>{p.description}</p>
                    <div className="actions">
                      {button(
                        t("Resolve / approve", "处理 / 批准"),
                        () =>
                          void act(
                            `admin/review/${kind === "comments" ? "comment" : kind === "clubs" ? "club" : "report"}/${p.id}`,
                            {
                              approve: true,
                              reason,
                              ...(kind === "clubs"
                                ? { revision: p.revision }
                                : {}),
                            },
                          ),
                      )}
                      {kind !== "reports" &&
                        button(
                          t("Reject", "拒绝"),
                          () =>
                            void act(
                              `admin/review/${kind === "comments" ? "comment" : "club"}/${p.id}`,
                              {
                                approve: false,
                                reason,
                                ...(kind === "clubs"
                                  ? { revision: p.revision }
                                  : {}),
                              },
                            ),
                          true,
                        )}
                    </div>
                  </article>
                )),
              )}
            </>
          )}
          {tab === "connections" && data && (
            <>
              <p>
                {t(
                  "Review the shared club context, current membership and mentor suitability. Participants cannot approve their own mentorship. Communication remains in moderated club discussions.",
                  "请核实共同社团背景、当前成员身份和指导者是否适任。关系双方不能审核自己的指导申请，交流仍须在受审核的社团讨论中进行。",
                )}
              </p>
              {!data.items.length && (
                <div className="panel">
                  {t(
                    "No mentorship requests currently need independent review.",
                    "暂时没有需要独立审核的指导申请。",
                  )}
                </div>
              )}
              {data.items.map((row: any) => (
                <div className="panel" key={row.id}>
                  <h3>
                    {row.requester.displayName} → {row.recipient.displayName}
                  </h3>
                  <p>
                    {row.club?.name} / {row.status}
                  </p>
                  {row.unavailable && (
                    <p className="notice">
                      {t(
                        "Permissions or membership are currently unavailable. Approval is paused.",
                        "当前权限或成员身份不可用，暂不能批准。",
                      )}
                    </p>
                  )}
                  <div className="actions">
                    {!row.unavailable &&
                      button(
                        t(
                          "Approve supervised mentorship",
                          "批准社团内的指导关系",
                        ),
                        () =>
                          void act(`admin/connections/${row.id}/review`, {
                            approve: true,
                            version: row.version,
                          }),
                      )}
                    {button(
                      t("Decline", "拒绝"),
                      () =>
                        void act(`admin/connections/${row.id}/review`, {
                          approve: false,
                          version: row.version,
                        }),
                      true,
                    )}
                  </div>
                </div>
              ))}
              {data.nextCursor &&
                button(
                  t("Load more", "加载更多"),
                  () =>
                    void api(`admin/connections?cursor=${data.nextCursor}`)
                      .then((next) =>
                        setData({
                          items: [...data.items, ...next.items],
                          nextCursor: next.nextCursor,
                        }),
                      )
                      .catch((error) => setError(error.message)),
                  true,
                )}
            </>
          )}
          {tab === "profiles" && data && (
            <>
              <article className="card">
                <h2>{t("Review shared profiles", "审核分享的个人页")}</h2>
                <p className="muted">
                  {t(
                    "Review the current nickname and bio. Edits invalidate old reviews. Only independently reviewed eligible adult profiles can be shared.",
                    "审核当前昵称与简介，修改后原审核失效。仅通过独立审核且符合资格的成年人的个人页可分享。",
                  )}
                </p>
                <label>
                  {t("Decision reason", "处理理由")}
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                  />
                </label>
                <label>
                  {t(
                    "Profile account ID from a report",
                    "举报中的个人页账号 ID",
                  )}
                  <input
                    value={profileLookup}
                    onChange={(e) => setProfileLookup(e.target.value)}
                  />
                </label>
                {button(
                  t("Inspect reported profile", "查看被举报的个人页"),
                  () =>
                    void api(
                      "admin/profiles/" +
                        encodeURIComponent(profileLookup.trim()),
                    )
                      .then((row) =>
                        setData({
                          ...data,
                          items: [
                            row,
                            ...data.items.filter(
                              (item: any) => item.id !== row.id,
                            ),
                          ],
                        }),
                      )
                      .catch((e) => setError(e.message)),
                  true,
                  !profileLookup.trim(),
                )}
              </article>
              {!data.items.length && (
                <article className="card">
                  <p>
                    {t(
                      "No profiles are awaiting review.",
                      "目前没有待审核的个人页。",
                    )}
                  </p>
                </article>
              )}
              {data.items.map((row: any) => {
                const settings = ProfileSettings.parse(row.profileSettings);
                return (
                  <article className="card" key={row.id}>
                    <h2>{row.displayName}</h2>
                    {row.bioSubmitted ? (
                      <p>{row.bio}</p>
                    ) : (
                      <p className="muted">
                        {t(
                          "About is private. Its bio and interests are not submitted for this review.",
                          "简介为私密，个人介绍与学习方向不属于此次审核内容。",
                        )}
                      </p>
                    )}
                    <p className="muted">
                      {t("Revision", "版本")} {row.profileRevision} /{" "}
                      {row.profileStatus === "APPROVED"
                        ? t("Approved", "已通过")
                        : row.profileStatus === "REJECTED"
                          ? t("Not approved", "未通过")
                          : t("Awaiting review", "待审核")}
                    </p>
                    <p>
                      {t("Favorite puzzles", "喜爱的魔方")}:{" "}
                      {settings.favorites
                        .map((p) =>
                          p === "pyraminx"
                            ? t("Pyraminx", "金字塔")
                            : p.replace("x", "×"),
                        )
                        .join(" / ")}
                    </p>
                    <p>
                      {t("Learning interests", "学习方向")}:{" "}
                      {settings.skills
                        .map(
                          (id) =>
                            ProfileSkills.find((s) => s.id === id)?.[locale],
                        )
                        .join(" / ")}
                    </p>
                    <div className="actions">
                      {row.profileStatus === "PENDING" &&
                        button(
                          t("Approve current revision", "批准当前版本"),
                          () =>
                            void act("admin/profiles/" + row.id + "/review", {
                              approve: true,
                              revision: row.profileRevision,
                              reason,
                            }),
                          false,
                          reason.trim().length < 3,
                        )}
                      {["PENDING", "APPROVED"].includes(row.profileStatus) &&
                        button(
                          row.profileStatus === "APPROVED"
                            ? t("Hide shared profile", "下架分享的个人页")
                            : t("Decline", "不通过"),
                          () =>
                            void act("admin/profiles/" + row.id + "/review", {
                              approve: false,
                              revision: row.profileRevision,
                              reason,
                            }),
                          true,
                          reason.trim().length < 3,
                        )}
                    </div>
                  </article>
                );
              })}
              {data.nextCursor &&
                button(
                  t("Load more", "加载更多"),
                  () =>
                    void api("admin/profiles?cursor=" + data.nextCursor)
                      .then((next) =>
                        setData({
                          items: [...data.items, ...next.items],
                          nextCursor: next.nextCursor,
                        }),
                      )
                      .catch((e) => setError(e.message)),
                  true,
                )}
            </>
          )}
          {tab === "users" && Array.isArray(data) && (
            <>
              <article className="card">
                <label>
                  {t("Verification evidence note", "核验证据说明")}
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                {check(
                  "eligibility-proof",
                  t(
                    "Independent proof has been reviewed; do not rely on self-declared age alone.",
                    "已独立审阅证明材料，不能仅凭用户申报年龄。",
                  ),
                )}
              </article>
              <article className="card table-card">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Person", "用户")}</th>
                      <th>{t("Role", "角色")}</th>
                      <th>{t("Eligibility", "资格")}</th>
                      <th>{t("Actions", "操作")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((u: any) => (
                      <tr key={u.id}>
                        <td>
                          <b>{u.displayName}</b>
                          <small>
                            {u.id.slice(0, 8)} / {u.region}
                          </small>
                        </td>
                        <td>{u.role}</td>
                        <td>
                          {u.identityVerified ? "Identity ✓" : "Identity —"}
                          <small>
                            {u.adultVerified ? "Adult ✓" : "Adult —"}
                          </small>
                        </td>
                        <td>
                          <div className="actions">
                            {button(
                              t("Verify adult + identity", "验证成人与身份"),
                              () =>
                                void act(`admin/users/${u.id}/eligibility`, {
                                  identityVerified: true,
                                  adultVerified: true,
                                  proofReviewed: !!checks["eligibility-proof"],
                                  reason,
                                }),
                              true,
                            )}
                            {button(
                              t("Revoke eligibility", "撤销资格"),
                              () =>
                                void act(`admin/users/${u.id}/eligibility`, {
                                  identityVerified: false,
                                  adultVerified: false,
                                  proofReviewed: !!checks["eligibility-proof"],
                                  reason,
                                }),
                              true,
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            </>
          )}
          {tab === "campaigns" && (
            <CampaignManager
              key={token}
              contextKey={token}
              locale={locale}
              api={api}
              reloadKey={courseRefresh}
            />
          )}
          {tab === "announcements" && (
            <AnnouncementManager
              key={token}
              api={api}
              contextKey={token}
              reloadKey={courseRefresh}
              locale={locale}
            />
          )}
          {tab === "device-tests" && (
            <DeviceTestManager
              key={token}
              api={api}
              contextKey={token}
              reloadKey={courseRefresh}
              locale={locale}
            />
          )}
          {tab === "competitions" && (
            <CompetitionAdmin
              key={token}
              contextKey={token}
              locale={locale}
              api={api}
              reloadKey={courseRefresh}
            />
          )}
          {tab === "courses" && (
            <CourseEditor
              key={token}
              contextKey={token}
              reloadKey={courseRefresh}
              locale={locale}
              api={api}
            />
          )}
          {tab === "settings" && settings && (
            <>
              <article className="card">
                <div className="card-title">
                  <h2>{t("AI tutor connection", "AI 导师连接")}</h2>
                  <span className="pill">{settings.mode}</span>
                </div>
                <p className="muted">
                  {t(
                    "Change the OpenAI-compatible API base URL and model here. Enabling checks model availability and the regional moderation requirements. International tutoring screens minimized context and generated text; mainland tutoring requests Alibaba input/output guardrails and requires operator review. Credentials stay on the server. Local simulated tests need no real key.",
                    "可在此修改兼容 OpenAI 的 API 基础地址和模型。启用时会核验模型及地区内容安全要求。国际社区核验最小化课程上下文和生成文本；中国大陆社区请求阿里云输入、输出安全防护，并须运营方审核。凭据保存在服务器，本地模拟测试无需真实密钥。",
                  )}
                </p>
                <div className="notice">
                  {t("Mode", "模式")}: {settings.mode} /{" "}
                  {t("Key configured", "已配置密钥")}:{" "}
                  {settings.keyConfigured ? "✓" : "—"}
                  <br />
                  {t("Approved hosts", "已批准的域名")}:{" "}
                  {settings.allowedHosts ||
                    t("Local mock only", "仅限本地模拟服务")}
                  <br />
                  {settings.moderationModel
                    ? `${t("Moderation model", "内容安全模型")}: ${settings.moderationModel}`
                    : `${t("Alibaba guardrail review", "阿里云安全防护审核")}: ${settings.guardrailReviewApproved ? t("Operator confirmed", "运营方已确认") : t("Pending", "待完成")}`}
                </div>
                {settings.ai?.value?.validatedAt && (
                  <p className="muted">
                    {t("Last connection validation", "上次连接验证")}:{" "}
                    {new Date(settings.ai.value.validatedAt).toLocaleString()}
                  </p>
                )}
                <label>
                  API base URL
                  <input
                    type="url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
                <label>
                  {t("Model identifier", "模型标识")}
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  {t(
                    "Enable tutor connection for eligible adults",
                    "为符合条件的成年人启用导师连接",
                  )}
                </label>
                {button(
                  t("Save connection", "保存连接"),
                  () =>
                    void act("admin/settings/ai", { baseUrl, model, enabled }),
                )}
              </article>
              <article className="card">
                <h2>{t("Contextual sponsors", "情境赞助卡片")}</h2>
                <p className="muted">
                  {t(
                    "Off by default. Only verified adults can see reviewed first-party sponsor cards.",
                    "默认关闭。仅经过验证的成年人可看到审核后的第一方赞助卡片。",
                  )}
                </p>
                {button(
                  t("Open sponsor campaign management", "打开赞助活动管理"),
                  () => setTab("campaigns"),
                )}
              </article>
              <article className="card">
                <h2>{t("Smart-cube availability", "智能魔方可用状态")}</h2>
                <p className="muted">
                  {t(
                    "GAN 356 i3, GoCube Edge and GiiKER i3S remain disabled pending physical acceptance, lesson telemetry and release review. Evidence approval does not activate hardware.",
                    "GAN 356 i3、GoCube Edge 和 GiiKER i3S 仍保持禁用，等待实机验收、课程步数验证与发布审核。证据获批不会启用硬件。",
                  )}
                </p>
                <pre>
                  {JSON.stringify(settings.devices?.value || [], null, 2)}
                </pre>
                {button(
                  t("Open device test evidence", "打开设备测试证据"),
                  () => setTab("device-tests"),
                )}
              </article>
            </>
          )}
          {tab === "audit" && Array.isArray(data) && (
            <article className="card table-card">
              <table>
                <thead>
                  <tr>
                    <th>{t("Time", "时间")}</th>
                    <th>{t("Action", "操作")}</th>
                    <th>{t("Target", "对象")}</th>
                    <th>{t("Evidence", "记录")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((a: any) => (
                    <tr key={a.id}>
                      <td>{new Date(a.createdAt).toLocaleString()}</td>
                      <td>
                        <b>{a.action}</b>
                      </td>
                      <td className="mono">{a.targetId.slice(0, 16)}</td>
                      <td>
                        <pre>{JSON.stringify(a.detail, null, 2)}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          )}
        </section>
        <footer>
          {t(
            "Built for people who turn curiosity into connection.",
            "让好奇，转动成连接。",
          )}
          <span>Cubers Studio / v0.1</span>
        </footer>
      </main>
      {documentId && (
        <ConsentDocumentViewer
          key={documentId}
          id={documentId}
          api={api}
          t={t}
          close={() => setDocumentId(null)}
          reviewed={(reviewId) =>
            setDocumentReviews((previous) => ({
              ...previous,
              [documentId]: reviewId,
            }))
          }
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
