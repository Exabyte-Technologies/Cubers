import { VerificationError } from "./client";
export function verificationMessage(error: unknown, locale: string) {
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  if (error instanceof VerificationError)
    switch (error.code) {
      case "UNAVAILABLE":
        return t(
          "Verification is not available on this device or in this community yet.",
          "此设备或当前社区暂未开放应用验证。",
        );
      case "SETUP":
        return t(
          "Open App verification in Profile to verify this device first.",
          "请先在个人资料的“应用验证”中验证此设备。",
        );
      case "RECOVERY":
        return t(
          "Reset verification on this device before trying again.",
          "请先重置此设备的验证，再重新尝试。",
        );
      case "CANCELLED":
        return t(
          "Verification was interrupted. Keep the app open and try again.",
          "验证已中断，请保持应用在前台后重试。",
        );
      case "EXPIRED":
        return t(
          "The verification request expired. Please try again.",
          "验证请求已过期，请重试。",
        );
      case "CONSENT":
        return t(
          "Current guardian learning permission is required.",
          "需要当前有效的监护人学习授权。",
        );
    }
  return t(
    "Verification could not finish. Check your connection and try again.",
    "验证未能完成，请检查网络后重试。",
  );
}
