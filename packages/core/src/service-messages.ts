import { LessonStageAdvice } from "./lesson-stage";
import type { Locale } from "./contracts";

// Only authored messages reach the interface. Unknown payloads can contain
// validator internals, proxy HTML or private diagnostic details.
const messages: Readonly<Record<string, string>> = {
  "This cube needs an earlier lesson first.":
    "这份魔方状态需要先完成较早的课程阶段。",
  "This lesson target is already complete on this cube.":
    "这份魔方状态已经完成了本课目标。",
  "Sign in required": "请先登录。",
  "Session expired": "登录已过期，请重新登录。",
  "Invalid email or password": "邮箱或密码不正确，请检查后重试。",
  "Verify your email first": "请先通过验证邮件验证邮箱，也可重新发送验证邮件。",
  "Account belongs to another region":
    "此账号属于另一个社区，请检查当前社区后再登录。",
  "Select the matching regional server":
    "当前服务与账号社区不一致，请刷新社区检测后再登录。",
  "Community changed. Submit again.": "社区已切换，请检查当前社区后重新提交。",
  "Account changed; sign in again": "账号状态已更改，请重新登录。",
  "Staff session changed. Refresh.": "管理员登录状态已更改，请刷新页面。",
  "Current session is unavailable": "当前登录状态不可用，请重新登录。",
  "Link expired": "链接已过期，请重新申请邮件链接。",
  "Link already used": "链接已使用，请登录或重新申请邮件链接。",
  "Invalid birth date": "出生日期不正确，请检查后重新填写。",
  "A verified guardian must create and manage this child account":
    "此儿童账号需由已完成验证的监护人创建和管理。",
  "Verified guardian consent is required": "需要先完成监护人同意及审核。",
  "Guardian consent required": "需要先完成监护人同意及审核。",
  "Current guardian eligibility is required":
    "请监护人检查账号资格和同意状态后重试。",
  "Current guardian access required":
    "当前监护人权限不可用，请检查同意状态并刷新页面。",
  "Current linked guardian required": "需要由当前关联的监护人操作。",
  "Approved linked child required": "需要先完成关联儿童账号的同意审核。",
  "This workflow is for younger children":
    "此流程仅适用于需要监护人管理的儿童账号。",
  "Upload a signed consent document first": "请先上传已签署的监护人同意文件。",
  "Child account creation limit reached":
    "已达到儿童账号创建上限，请联系支持。",
  "This account is independently managed":
    "此账号已独立管理，请使用该账号登录后操作。",
  "Account deleted": "账号已删除。",
  "This session can only delete the account or sign out":
    "当前登录仅可用于删除账号或退出，请重新登录以使用其他功能。",
  "Administrator role and MFA are required":
    "需要管理员权限并完成多重身份验证。",
  "A fresh valid administrator MFA code is required; wait for the next code if already used":
    "请输入有效的管理员验证码；若已使用，请等待下一组验证码。",
  "Too many requests": "操作过于频繁，请稍后再试。",
  "Try again later": "请稍后再试。",
  "Practice limit reached; return later":
    "已达到当前练习次数上限，请稍后继续。",
  "Saved course mismatch": "保存的课程版本不一致，请重新打开课程。",
  "Moves do not match this guided puzzle":
    "转动记录与当前引导魔方不一致，请检查状态并重新打开练习。",
  "Practice changed or ended; reload": "练习已更改或结束，请刷新练习状态。",
  "Guidance is busy; try again shortly": "解题引导繁忙，请稍后再试。",
  "Could not validate guidance for this state":
    "无法验证当前状态的解题引导，请检查魔方状态后重试。",
  "Guidance interrupted; retry": "解题引导已中断，请刷新练习状态后重试。",
  "Guidance timed out; retry": "解题引导超时，请刷新练习状态后重试。",
  "Guidance is shutting down": "解题引导暂时不可用，请稍后再试。",
  "Recording consent required": "需要先同意比赛录像。",
  "Recording consent is required": "需要先同意比赛录像。",
  "Current recording permission required":
    "当前录像权限不可用，请检查同意状态。",
  "Room membership required": "请先加入此房间。",
  "Current room membership required": "当前房间成员资格不可用，请刷新房间。",
  "Open room not found": "房间不存在或已关闭，请刷新房间列表。",
  "Room is full": "房间已满，请选择其他房间。",
  "Only the host can start a round": "仅房主可开始本轮比赛。",
  "Host must start the round first": "请等待房主开始本轮比赛。",
  "Wait for your relay turn": "请等待轮到你进行接力。",
  "Relay needs at least two players": "接力至少需要两名玩家。",
  "Round already started": "本轮已开始，请刷新房间状态。",
  "One attempt per player per round":
    "每位玩家每轮仅可尝试一次，请查看已有尝试。",
  "Attempt expired": "本次尝试已过期，请查看房间状态。",
  "Attempt changed or ended": "本次尝试已更改或结束，请刷新状态。",
  "Attempt changed; reload its state": "本次尝试状态已更改，请刷新状态。",
  "This game requires move telemetry":
    "此游戏需要逐步转动记录，请使用兼容的虚拟魔方或智能魔方。",
  "Puzzle is not solved": "魔方尚未还原，请检查当前状态。",
  "Target pattern not reached": "尚未达到目标图案，请检查当前状态。",
  "Algorithm does not match the target":
    "转动序列与目标公式不一致，请检查后再提交。",
  "Missing, incomplete, or unbound evidence":
    "比赛录像缺失、不完整或未与本次尝试关联，无法提交成绩。",
  "Evidence is no longer available": "此录像已不可用，请刷新页面。",
  "Request body exceeds limit": "提交内容过大，请缩小文件或减少内容后重试。",
  "Unsupported request encoding": "不支持此提交格式，请检查文件或内容格式。",
  "Invalid JSON request": "提交内容格式不正确，请刷新页面后重试。",
  "Invalid request": "提交的信息不完整或格式不正确，请检查后重试。",
  "This action conflicts with an existing record":
    "已有记录与此操作冲突，请刷新并检查当前状态。",
  "Request could not be applied": "无法保存此操作，请刷新并检查当前状态。",
};

const fallback: Readonly<Record<number, readonly [string, string]>> = {
  400: ["Check the details and try again.", "请检查填写的信息后重试。"],
  401: [
    "Your session is unavailable. Sign in again.",
    "登录状态不可用，请重新登录。",
  ],
  403: [
    "This action is not permitted. Check your access and consent settings.",
    "当前无法进行此操作，请检查账号权限和同意设置。",
  ],
  404: [
    "This item is unavailable. Refresh the page.",
    "此内容不可用，请刷新页面。",
  ],
  409: [
    "The state has changed. Refresh and check the result before trying again.",
    "状态已更改，请刷新并确认操作结果后再试。",
  ],
  410: [
    "This item or link has expired. Request a new one.",
    "此内容或链接已过期，请重新申请。",
  ],
  413: [
    "The submission is too large. Reduce its size and try again.",
    "提交内容过大，请缩小后重试。",
  ],
  415: [
    "This format is unsupported. Check the file or content format.",
    "不支持此格式，请检查文件或内容格式。",
  ],
  429: [
    "Too many requests. Wait before trying again.",
    "操作过于频繁，请稍后再试。",
  ],
};
const unavailable = [
  "The service is temporarily unavailable. Check the result before trying again later.",
  "服务暂时不可用，请确认操作结果后稍后再试。",
] as const;
const generic = [
  "The request could not be completed. Refresh and check the result.",
  "无法完成请求，请刷新并确认操作结果。",
] as const;

function objectPayload(payload: unknown): Record<string, unknown> | undefined {
  return payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : undefined;
}

export function serviceError(
  status: number,
  payload: unknown,
  locale: Locale,
): Error & { status: number; code?: string; lessonStage?: LessonStageAdvice } {
  const data = objectPayload(payload);
  const message = typeof payload === "string" ? payload : data?.message;
  const translated =
    typeof message === "string" &&
    Object.prototype.hasOwnProperty.call(messages, message)
      ? locale === "zh"
        ? messages[message]
        : message
      : undefined;
  const defaultMessage =
    fallback[status] ??
    (status >= 500 && status <= 599 ? unavailable : generic);
  const error = Object.assign(
    new Error(translated ?? defaultMessage[locale === "zh" ? 1 : 0]),
    { status },
  ) as Error & {
    status: number;
    code?: string;
    lessonStage?: LessonStageAdvice;
  };
  if (
    typeof data?.code === "string" &&
    /^[A-Z][A-Z0-9_]{0,63}(?![\s\S])/.test(data.code)
  )
    error.code = data.code;
  const advice = LessonStageAdvice.safeParse(data?.lessonStage);
  if (advice.success) error.lessonStage = advice.data;
  return error;
}

export function serviceConnectionError(locale: Locale): Error {
  return new Error(
    locale === "zh"
      ? "未能确认操作结果，请检查网络并刷新页面，确认操作是否已成功后再试。"
      : "Could not confirm the result. Check your connection and refresh to see whether the action succeeded before trying again.",
  );
}

// An HTML/non-JSON error must retain its HTTP status (especially 401). A
// malformed success is an unknown outcome and must still reject, never retry.
export async function readServicePayload(response: {
  ok: boolean;
  json(): Promise<unknown>;
}): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (response.ok) throw error;
    return null;
  }
}

const notices: Readonly<Record<string, readonly [string, string]>> = {
  "POST auth/register": [
    "Check your email for a verification link, or use password recovery if you already registered.",
    "请查收验证邮件；若已注册，请使用密码找回。",
  ],
  "POST auth/resend": [
    "If eligible, a verification link has been sent.",
    "若账号符合条件，验证链接已发送，请查收邮件。",
  ],
  "POST auth/forgot": [
    "If this account exists, a reset link has been sent.",
    "若该账号存在，密码重置链接已发送，请查收邮件。",
  ],
  "POST auth/verify": [
    "Email verified. You can sign in.",
    "邮箱验证成功，现在可以登录。",
  ],
  "POST auth/reset": [
    "Password updated; all sessions revoked.",
    "密码已更新，所有登录已失效，请使用新密码重新登录。",
  ],
  "DELETE me": [
    "Account disabled. Content and media are queued for deletion. Encrypted backups expire within 30 days.",
    "账号已停用，相关内容和媒体已排队删除，加密备份将在30天内到期。",
  ],
};

export function localizeServiceSuccess<T>(
  path: string,
  method: string,
  payload: T,
  locale: Locale,
): T {
  const notice = notices[`${method} ${path}`];
  const data = objectPayload(payload);
  // Never translate arbitrary message fields such as posts or moderator notes.
  if (!notice || typeof data?.message !== "string") return payload;
  return { ...data, message: notice[locale === "zh" ? 1 : 0] } as T;
}
