/** Scheduling metadata is never a substitute for the signed receipt or consent. */
export const receiptScheduleOff = {
  receiptAutoRefresh: false,
  receiptRefreshAt: null,
  receiptRefreshLease: null,
  receiptRefreshLeaseUntil: null,
  receiptRefreshFailures: 0,
} as const;
export function receiptRefreshAt(
  receipt: { expiresAt: number; notBefore: number | null },
  now = Date.now(),
  retryAt = 0,
  failures = 0,
) {
  // Always wait at least a minute and strictly after Apple's signed date.
  // Repeated failures back off up to six hours, without extending trust.
  const delay = Math.min(6 * 3600000, 60000 * 2 ** Math.min(10, failures));
  return new Date(
    Math.min(
      receipt.expiresAt,
      Math.max(now + delay, (receipt.notBefore ?? 0) + 1, retryAt),
    ),
  );
}
