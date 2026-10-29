# Retired privacy history and restore admission

Current journals use an authenticated rolling prefix instead of retaining every accepted event identifier forever. A source worker can retire a contiguous prefix after **31 days**, after each decision has been applied and its associated erasure work has completed. Restores that need history below this floor are refused. Actual provider/latency/alert acceptance, independent rollback-resistant custody and the remaining recovery commissioning gates still apply. Test evidence is in [STATUS](STATUS.md) and [Docker verification](DOCKER-VERIFICATION.md).

## Stable absolute checkpoints

The key/header and encrypted record envelope remain version 1; account events remain version 1 and media events version 2. The **inventory is version 2**. Its authenticated body contains:

- `baseCount` and one aggregate `baseDigest` for retired history, with no retired account, media or event identifiers;
- a retirement eligibility cutoff;
- the current bounded event-ID/digest list;
- a temporary list of exact retired files awaiting physical removal after an interrupted unlink.

Each new event extends a domain-separated hash chain. Event positions remain absolute after pruning; a new media event never reuses an old sequence number. The current prefix digest and every still-admissible older prefix remain stable when the base moves. Requests below the retired base fail. The retained catalogue is limited to 100,000 events and 8 MiB; absolute positions are bounded to the PostgreSQL integer range and never wrap. Capacity failures reject acceptance rather than silently dropping events.

The `source.json` file is independently authenticated and binds the regional installation to the source database fingerprint. Password rotation does not change this fingerprint. Another configured address/name cannot silently adopt the source's authority to retire shared history. This is a binding to the reviewed connection configuration, not certification of physical database identity across aliases, proxies or copied deployment networks. Endpoint/name changes require reviewed migration; do not overwrite this file to make an accidental target pass. Sealed targets can read current history for reconciliation but cannot retire the source's journal.

## Database replay proof

Migration `202610180003_journal_floor` adds the applied absolute count/digest and observed retirement floor to `RecoveryBinding`. Reconciliation validates the independent prefix before advancing this marker; individual decisions and marker advancement commit together. Existing retained receipts are still checked, and missing retained receipts cause replay rather than permission restoration. A database whose marker predates the retired base fails before API/worker startup. An observed database floor ahead of independent history also fails, even when there are no retained events to replay. The read-only operator check verifies source authority and the applied prefix before reporting success. Altering only an active/sealed flag cannot supply missing history or matching source authority.

Retirement serializes with reconciliation through a database advisory lock. It considers at most 500 old prefix events per pass, stopping at the first unapplied or unfinished one. Account deletion requires the old accounts, owned media and account/object erasure jobs to be gone. Individual media/evidence decisions require the media, evidence reference and object-removal job to be gone. Guardian withdrawal requires no remaining pre-cutoff evidence or relevant erasure jobs. A receipt must match the authenticated event digest, and the database's applied checkpoint must cover the candidate prefix.

The proof phase acquires no account/media row locks under the filesystem mutex. The authenticated floor and retry list are synchronized before exact old record files are unlinked. A partial filesystem failure therefore cannot replay a retired event or lose the removal list. The directory is synchronized before retry identifiers are removed. A failure after floor publication leaves source data already applied/clean; reconciliation repairs the observed database floor, while a later retirement pass completes unlink and metadata cleanup. Never steal a crash-held lock.

After retirement, bounded cleanup removes expired, retired receipts and old media/withdrawal recovery state only where related media and erasure work are absent. A newer state sequence is preserved. Receipt cleanup examines at most 1,000 expired rows per pass; backlog is drained by later passes. This is recovery metadata cleanup, not a claim that every application audit or every provider replica has the same retention purpose or deadline.

## Backups remain usable at the boundary

**Database snapshot manifests are version 2** and authenticate both the independent capture checkpoint and the database's applied checkpoint. Verification checks both against the current floor before any archived SQL reaches a target. An archive captured now with an unapplied old event cannot masquerade as a recent safe snapshot. A fully applied snapshot at the floor remains admissible, restores sealed and replays newer retained events.

New dumps omit data from `RecoveryBinding`, `DeletionReceipt`, `MediaRecoveryState`, `ConsentWithdrawalRecovery`, `MediaRestoreBatch` and `MediaRestoreFile`. This prevents recovery-only event identifiers and state from being copied repeatedly into later database backups. The schema remains present; the binding is recreated sealed, and current independent events rebuild retained recovery state. Applied deletion flags, deadlines and erasure queues remain part of the consistent database archive. The matching media bundle still excludes expired/erased/withdrawn objects. Quarantine, fresh credentials/permissions and full reconciliation remain required before service commissioning.

The 30-day maximum archive lifetime and 31-day retirement buffer are different controls. Applied-checkpoint admission is required even when an archive's creation timestamp is recent. No old copy is accepted merely because its timestamp looks new. This does not detect rolling back the **entire** independent custody plus database to a mutually consistent earlier state; that still requires an external, independently accepted custody/witness design. Do not claim full rollback resistance from local signatures alone.

## Operator command and automatic work

The existing application maintenance worker calls retirement after current account/media/object erasure passes. Deferred expired work fails that maintenance job for operator attention and retry; it may reflect unfinished erasure or the per-pass retirement backlog. The worker does not bypass source or cleanup checks to meet a deadline.

For a reviewed one-shot operation, use an owned mode-0600 request in a mode-0700 directory:

```json
{
  "operation": "retire",
  "region": "INTL",
  "databaseHost": "postgres",
  "databaseName": "cubers",
  "confirmation": "RETIRE COMPLETED PRIVACY HISTORY"
}
```

```sh
node apps/api/dist/recovery-cli.js /private-operator/request.json
```

The exact target/region must match the protected environment and independently bound source. AI/mail/listeners remain disabled. Output contains only safe counts and the floor; nonzero deferred work returns exit code 2. There is no request field for overriding the clock. Synthetic tests inject old timestamps through library-only fixtures, not production requests. Use synchronized clocks and actual regional job/latency alerts.

## Deployment compatibility and unfinished scope

Deploy migration 29 and matching API, worker, snapshot and operator images together; stop old readers/writers before changing journal formats. New installations initialize inventory version 2 and the source binding. Experimental version-1 inventories and version-1 database snapshot manifests are **not silently migrated or accepted**. A reviewed offline compatibility procedure is required for any such existing data. Never initialize a new key, empty catalogue or source binding over accepted history; retain the old tools/data isolated until that review is complete. No production history was migrated by this work, and the development preview still has journaling explicitly disabled.

Safe expiry of vault control/target-inventory metadata and standalone snapshot keys, provider object versions/replicas, independently witnessed full-history rollback protection, actual alerting/RPO/RTO acceptance and fresh recovery commissioning remain unfinished. The full Cubers app also retains its separate native, hardware, security and publication gates.
