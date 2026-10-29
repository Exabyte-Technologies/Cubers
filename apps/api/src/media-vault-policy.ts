import type { DeletionRecord } from "./deletion-journal";
export type BackupPrivacy = {
  deletedAccounts: Set<string>;
  erasedMedia: Set<string>;
  deadlines: Map<string, { sequence: number; deadline: number }>;
  withdrawals: Map<string, number>;
};
export function backupPrivacy(
  records: readonly DeletionRecord[],
): BackupPrivacy {
  const p: BackupPrivacy = {
    deletedAccounts: new Set(),
    erasedMedia: new Set(),
    deadlines: new Map(),
    withdrawals: new Map(),
  };
  for (const r of records) {
    if (r.version === 1) {
      for (const id of r.ids) p.deletedAccounts.add(id);
      continue;
    }
    if (r.kind === "MEDIA_ERASE") p.erasedMedia.add(r.mediaId);
    else if (r.kind === "CONSENT_WITHDRAWAL")
      p.withdrawals.set(
        r.ids[0],
        Math.max(p.withdrawals.get(r.ids[0]) || 0, Date.parse(r.cutoff)),
      );
    else if (r.kind === "EVIDENCE_DEADLINE") {
      const old = p.deadlines.get(r.mediaId);
      if (!old || old.sequence < r.sequence)
        p.deadlines.set(r.mediaId, {
          sequence: r.sequence,
          deadline: Date.parse(r.deadline),
        });
    }
  }
  return p;
}
export type MediaExpiry = {
  mediaId: string;
  userId: string;
  purpose: string;
  createdAt: string;
  hardExpiresAt: string;
  initialDeadline: string;
  policySequence: number;
};
export function mediaBackupExpiry(e: MediaExpiry, p: BackupPrivacy) {
  if (p.deletedAccounts.has(e.userId) || p.erasedMedia.has(e.mediaId)) return 0;
  if (
    e.purpose === "evidence" &&
    (p.withdrawals.get(e.userId) || 0) >= Date.parse(e.createdAt)
  )
    return 0;
  const newer = p.deadlines.get(e.mediaId);
  return Math.min(
    Date.parse(e.hardExpiresAt),
    e.purpose === "evidence" && newer && newer.sequence > e.policySequence
      ? newer.deadline
      : Date.parse(e.initialDeadline),
  );
}
