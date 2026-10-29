import { z } from "zod";

export const DeviceTestModel = z.enum([
  "gan-356-i3",
  "gocube-edge",
  "giiker-i3s",
]);
export const DeviceTestScope = z.enum(["transport", "learning", "ranked"]);
export const DeviceTestStatus = z.enum([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
]);
export const deviceTestChecks = [
  "permissions",
  "bluetooth_unavailable",
  "model_selection",
  "initial_sync",
  "turn_mapping",
  "battery_status",
  "move_gaps",
  "disconnect_recovery",
  "background_cleanup",
  "account_region_cleanup",
  "guided_frame",
  "lesson_telemetry",
  "ranked_recording",
  "platform_attestation",
] as const;
export type DeviceTestCheck = (typeof deviceTestChecks)[number];
export const deviceTestLabels: Record<
  DeviceTestCheck,
  { en: string; zh: string }
> = {
  permissions: { en: "Permission denial and retry", zh: "权限拒绝与重试" },
  bluetooth_unavailable: {
    en: "Bluetooth off or unavailable",
    zh: "蓝牙关闭或不可用",
  },
  model_selection: {
    en: "Exact model selection and unsupported models",
    zh: "准确选择型号与拒绝不支持的型号",
  },
  initial_sync: {
    en: "Scrambled initial-state synchronization",
    zh: "打乱状态下的初始同步",
  },
  turn_mapping: {
    en: "All faces, directions, half turns and fast turns",
    zh: "各面、方向、半转与快速转动",
  },
  battery_status: {
    en: "Battery response or honestly unknown status",
    zh: "电量响应或明确显示未知",
  },
  move_gaps: {
    en: "Missing/corrupt moves, counters and honest history limits",
    zh: "漏步、损坏数据、计数器与真实历史限制",
  },
  disconnect_recovery: {
    en: "Disconnect, reconnect and explicit recovery",
    zh: "断连、重连与明确恢复",
  },
  background_cleanup: {
    en: "Navigation, locking and background cleanup",
    zh: "页面切换、锁屏与后台清理",
  },
  account_region_cleanup: {
    en: "Account/community changes and pending operations",
    zh: "账号、社区切换与未完成操作",
  },
  guided_frame: {
    en: "Physical frame matches guided lessons",
    zh: "实物参照方向与课程一致",
  },
  lesson_telemetry: {
    en: "Server-bound lesson telemetry and interrupted recovery",
    zh: "服务端课程步数验证与中断恢复",
  },
  ranked_recording: {
    en: "Uninterrupted recording, evidence binding and review",
    zh: "连续录像、证据绑定与审核",
  },
  platform_attestation: {
    en: "Server-verified app attestation and forged-result rejection",
    zh: "服务端应用证明与拒绝伪造成绩",
  },
};
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(s),
      "Use ordinary text",
    );
const label = (max: number) =>
  text(1, max).refine((s) => !/[\r\n\t]/.test(s), "Use one line");
const bilingual = z.object({ en: text(20, 2000), zh: text(20, 2000) }).strict();
const Check = z
  .object({
    status: z.enum(["not_run", "passed", "failed"]),
    notes: text(0, 1000),
  })
  .strict()
  .refine(
    (c) => c.status === "not_run" || c.notes.length >= 10,
    "Describe the observation for a completed check",
  );
const Checks = z
  .object(
    Object.fromEntries(deviceTestChecks.map((k) => [k, Check])) as Record<
      DeviceTestCheck,
      typeof Check
    >,
  )
  .strict();
const Reference = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
export const DeviceTestContent = z
  .object({
    model: DeviceTestModel,
    platform: z.enum(["ios", "android"]),
    scope: DeviceTestScope,
    provenance: z.enum(["physical", "synthetic"]),
    firmware: label(80),
    phoneModel: label(80),
    osVersion: label(80),
    appBuild: label(80),
    buildSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceRevision: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
    testedAt: z.string().datetime(),
    caseReference: Reference,
    custodyReference: Reference,
    evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    summary: bilingual,
    checks: Checks,
  })
  .strict();
export type DeviceTestContent = z.infer<typeof DeviceTestContent>;
const reason = text(10, 500);
const expectedVersion = z.number().int().min(1).max(2147483646);
export const DeviceTestCreate = z
  .object({ content: DeviceTestContent, reason })
  .strict();
export const DeviceTestEdit = z
  .object({ content: DeviceTestContent, reason, expectedVersion })
  .strict();
export const DeviceTestChange = z.object({ reason, expectedVersion }).strict();
export const DeviceTestReview = z.discriminatedUnion("approve", [
  z.object({ approve: z.literal(false), reason, expectedVersion }).strict(),
  z
    .object({
      approve: z.literal(true),
      reason,
      expectedVersion,
      evidenceInspected: z.literal(true),
      physicalDeviceConfirmed: z.literal(true),
      configurationConfirmed: z.literal(true),
      independentReview: z.literal(true),
    })
    .strict(),
]);
export function requiredDeviceChecks(scope: z.infer<typeof DeviceTestScope>) {
  return deviceTestChecks.slice(
    0,
    scope === "transport" ? 10 : scope === "learning" ? 12 : 14,
  );
}
export function deviceTestApprovalProblems(content: DeviceTestContent) {
  const errors: string[] = [];
  if (content.provenance !== "physical")
    errors.push("Physical-device evidence is required");
  if (
    ["unknown", "unavailable", "n/a", "未知"].includes(
      content.firmware.toLowerCase(),
    )
  )
    errors.push("Record the actual firmware version");
  for (const check of requiredDeviceChecks(content.scope))
    if (content.checks[check].status !== "passed")
      errors.push(deviceTestLabels[check].en);
  return errors;
}
