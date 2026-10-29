# Independent deletion recovery

Latest replay-sharing drill (2026-10-20): **e101fca2**, **26 groups per region**, all **42 migrations**, on the exact images from Docker **c579172b**. Immutable anonymous snapshots/digests restore exactly; every old link key is cleared alongside sessions/tokens. A withdrawal independently recorded after capture cancels its restored share. Both targets remain sealed, and independent cleanup finds zero owned resources plus six removed anonymous mounts. Withdrawal is a typed encrypted privacy event and is not interpreted as a media deadline. Thirty-day cleanup redacts sharing reviews; account/source erasure cascades to snapshots. These are synthetic local checks; production commissioning and off-host custody acceptance remain outstanding.

Latest smart replay drill (2026-10-20): **5f1cd0c7** passes **25 groups per region**, all **41 migrations**, on the exact images from Docker run **76aa489f**. An approved smart archive retains its source and metadata and reconstructs to solved, exposing model/continuity only. Both targets stay sealed, real hardware stays disabled, and independent cleanup verifies zero owned resources plus six removed anonymous restore mounts. These are synthetic local restores, with production commissioning and off-host custody acceptance still outstanding.

Latest mixed-room drill (2026-10-20): **0c5021e8** passes **24 groups per region**, all **41 migrations**, using the exact images from Docker run **fadedeb6**. Frozen member/attempt inputs, shared WCA provenance and casual-only database guards restore exactly. Both targets remain sealed. Independent cleanup confirms zero owned resources and six removed anonymous restore mounts. These are synthetic local database restores; production commissioning and off-host custody acceptance remain outstanding.

Updated 2026-10-18. The independent deletion-journal and replay layer now has an authenticated record inventory and [media/retention/guardian-withdrawal events](MEDIA-RECOVERY.md). [Encrypted database capture and sealed restores](DATABASE-SNAPSHOTS.md) also pass real regional dump/restore drills. **The complete recovery system remains unfinished:** actual regional cleanup latency/provider/alert acceptance, safe history/control pruning, rollback-resistant independent custody and fresh commissioning remain required. [Encrypted media capture, verification and explicit key/ciphertext pruning](MEDIA-VAULT.md) now pass separate regional drills. Restores stay sealed and public release stays gated.

## What is connected

Confirmed account deletion and current guardian deletion of a linked child can write an encrypted request to storage independent of PostgreSQL before acknowledging success. Account-deletion events contain a random event ID, account UUIDs, request time, region and installation ID. Version-2 media events additionally include bounded private object/attempt identities, append sequence and retention/cutoff times; see MEDIA-RECOVERY.md. It contains no names, email addresses, passwords, MFA seeds, consent documents, posts, recordings or AI content. Each record uses a fresh AES-256-GCM nonce; authenticated data binds the region, installation and key identity. The key is an owned private file outside the journal directory and outside database backups. Region/installation binding also lives in the database so another installation's journal/key cannot be silently adopted.

The API verifies and replays configured deletion history before opening its HTTP listener. The dedicated worker does so before starting a queue worker, and rechecks during maintenance. Existing receipts make repeated replay idempotent; receipt digests must match the encrypted request. Malformed, damaged or missing accepted records are never skipped. The authenticated inventory binds each accepted record ID/digest in append order; removing a whole accepted file is detected. Missing keys/inventories, unsafe permissions, mismatched regional bindings and damaged records prevent a configured recovery process starting. A restored `SEALED` binding prevents API/worker startup even when development journaling is disabled.

Account deletion rechecks the current session, account, guardian relationship and child adulthood under account locks. Managed-child creation also locks and rechecks the parent, preventing creation through a captured deleted-parent session. A change to the family selection produces a conflict before accepting a journal entry. A journal write failure returns a retryable service error and rolls back the account/session mutation. If the external write succeeds but the database transaction later fails, the confirmed deletion request remains authoritative and is applied on reconciliation; an interrupted/error response is not proof that the request was cancelled.

Replay disables matching accounts, revokes sessions/recovery tokens, hides posts, interrupts unfinished attempts, withdraws score/card sharing and queues the existing physical data-erasure work. Deleted accounts cannot log in while cleanup runs. Deletion jobs also retain independent account-prefix removal markers so objects without a surviving `Media` row can be erased. One maintenance pass drains at most 200 keys for each of ten due accounts, with a minute between passes. Each pass starts at the first remaining page: deletion changes list positions, and late arrivals may precede an earlier cursor. A job remains for at least 24 hours and must see an empty prefix before removal. It is not allowed to erase another account/region's prefix.

The application storage role therefore needs regional bucket listing (`s3:ListBucket`, restricted to the regional prefix) and object deletion (`s3:DeleteObject`) in addition to its existing access. Actual IAM, upload-duration limits, object versions/replicas and lifecycle policy must be verified on the production provider. Current-object deletion is not proof that all historic object versions were removed.

## Files and initialization

Production requires `DELETION_JOURNAL_MODE=file`, `DELETION_JOURNAL_DIRECTORY` and `DELETION_JOURNAL_KEY_FILE`. Development/test can explicitly use `disabled` and retain database-only deletion; that mode does **not** provide recovery protection. It cannot be used by a production API/worker. No default production journal key is generated on application startup.

Journal directories must be real absolute directories owned by the runtime operator, mode 0700; symlink paths and world/group writable parents are rejected. Files are private regular files, with symlinks/hard links rejected. Records publish through an exclusive link and directory/file synchronization; an incomplete `.pending` write does not become an acknowledged final record. Key files stay outside the journal directory. Do not put key bytes in shell arguments, environment strings, logs, source control or database rows. Back up keys through independently encrypted and reviewed operator custody; do not initialize a new key over accepted deletion history.

The operator CLI reads a mode-0600 JSON request from an owned mode-0700 directory:

```sh
node apps/api/dist/recovery-cli.js /private/operator/request.json
```

It checks explicit `REGION`, the database hostname/name and operation confirmation. It never starts the API, sends mail or calls AI. It works before release approval by using a non-serving operator configuration; this does not change any API/worker release gate.

A new installation request has this shape (replace target/region deliberately):

```json
{
  "operation": "initialize",
  "region": "INTL",
  "databaseHost": "postgres",
  "databaseName": "cubers",
  "confirmation": "INITIALIZE RECOVERY"
}
```

Prepare empty private journal and key-parent directories first. The key file itself must not already exist. Initialization creates a unique key/installation and binds the migrated database. It refuses an existing database binding; an existing journal with records cannot be adopted as an empty installation. An initialization failure may leave private setup files requiring operator inspection. Never delete accepted history to retry initialization.

For a read/validation check, use `operation: "check"` and `confirmation: "CHECK RECOVERY"`. Output contains only status/counts; pending replay returns exit code 2. For replay, use `operation: "replay"` and `confirmation: "REPLAY DELETIONS"`. Output `deletions-queued` means accounts were disabled and erasure was queued; it does not mean a database backup was restored or every storage object has already been erased. Ordinary worker maintenance completes physical cleanup.

The filesystem journal, current authenticated inventory and private key must be retained independently of the snapshot being recovered. Copying an old journal/inventory over the current copy defeats the mechanism. The current inventory detects missing accepted records and snapshots bind its prefix, allowing newer deletions to extend it. An attacker able to roll back both the entire trusted inventory and its records still needs to be addressed through independent append-only/versioned custody. Local volumes alone do not establish disaster survival or prevent a complete storage rollback.

Writers serialize with a private filesystem lock; readers take a stable inventory snapshot without write permission. Record publication and synchronized atomic inventory replacement precede acknowledgement. A crash-held `.inventory-lock`, an unindexed final record, or an incomplete setup requires operator investigation with ingress closed; the app never steals stale locks, adopts old records or fabricates a replacement inventory. Old foundation journals without an inventory fail closed. Preserve their files and keys for reviewed migration; do not initialize over them.

## Production Compose overlay

Use `infra/compose.recovery.yml` together with the base production file. Set separate absolute host directories for `CUBERS_DELETION_JOURNAL_HOST_DIRECTORY`, `CUBERS_RECOVERY_KEY_HOST_DIRECTORY` and `CUBERS_OPERATOR_REQUEST_HOST_DIRECTORY`. Prepare them owned by the container's node UID/GID (1000:1000 on the supplied Linux image), mode 0700. The operator's request is mode 0600. Do not point these paths at another region's files or at a directory being restored from an old database backup.

The API and worker mount the journal writable and its key read-only. The worker needs journal writes for durable media erasure before deleting storage objects; the snapshot operator remains a read-only journal consumer. A separate `operations` profile grants only the offline operator process access to the private setup directories. Its runtime has no public ports, disabled AI and no SMTP; the supplied network targets the Compose regional database.

With public ingress closed, build/validate the matched images, start only the database/cache and run migrations/seed, then initialize recovery through the operator profile before the API/worker can start:

```sh
docker compose --env-file .env.production -f infra/compose.production.yml -f infra/compose.recovery.yml config --quiet
docker compose --env-file .env.production -f infra/compose.production.yml -f infra/compose.recovery.yml build
docker compose --env-file .env.production -f infra/compose.production.yml -f infra/compose.recovery.yml up --detach postgres redis
docker compose --env-file .env.production -f infra/compose.production.yml -f infra/compose.recovery.yml run --rm seed
docker compose --env-file .env.production -f infra/compose.production.yml -f infra/compose.recovery.yml --profile operations run --rm recovery-operator
```

These commands prepare private services only. Keep `PUBLIC_RELEASE_APPROVED=false`. Full application startup/public ingress remains gated by all release requirements, including the unfinished backup/restore system. The old base-only startup instructions are insufficient for production journaling. Stop old API/worker versions before applying `202610170008_recovery_journal` and `202610170009_account_erasure_batches`; older deletion handlers acknowledge only database-backed requests. Do not run old/new deletion implementations together. The second additive migration removes an unnecessary listing cursor because object erasure drains bounded batches from the start.

No production configuration, key or operator was commissioned by this work. Recovery and snapshot overlays passed quiet configuration validation with temporary synthetic paths. The older general container CLI checks used private tmpfs; the database snapshot drill separately recreates the operator container with independent named volumes. Neither establishes off-host production durability. Stop old services before adding migration `202610170010_sealed_recovery` and deploy matching API/worker/operator images together.

## Validation and remaining work

The source suite passed **170 unit and 168 integration checks**. New vault checks cover independent privacy folding, terminal erase/appeal bounds, post-lock-wait expiry and protected roots/key separation. The additional checks cover complete-record removal, sealed API startup denial in both journal modes, encrypted database stream/manifests, expiry, altered ciphertext/metadata, key/region mismatch, unsafe destinations and failed producer admission. Existing tests cover durable HTTP deletion, database rollback/replay, orphan-prefix erasure and late uploads.

Real database drill `d1aca49f` passed **eleven INTL and eleven CN groups**, with 29 migrations and zero remaining disposable containers, networks or volumes. It captures real PostgreSQL custom-format dumps, accepts a newer deletion, recreates the operator with persistent private volumes, verifies/refuses damaged data, rolls back an authenticated truncated archive, restores into a separate empty database and verifies account/file erasure, evidence deadlines and guardian-withdrawal replay plus the seal. This separate database-only drill restores media metadata/queues; the combined media path is verified separately below. Encrypted archives were 86,005 bytes INTL / 85,975 bytes CN; restore plus verification took 769 ms INTL / 798 ms CN, not a production RTO/RPO certification. Detailed scope is in DATABASE-SNAPSHOTS.md.

S3rver's development-only ListObjectsV2 cursor implementation requires the Node legacy crypto provider, so only the local gateway and the dedicated development-storage process receive that flag. The API/worker production runtime does not. The emulator also orders some prefix-related keys differently from S3; the erasure regression includes those keys at a batch boundary and verifies complete first-page draining. Do not treat this emulator as SigV4/IAM, protocol-conformance or production encryption certification.

The separate media-vault drill `58756ef4` passed ten groups in each region with seven captured objects / 5,122 bytes each, including consistent database capture, independent file keys, physical mount-alias checks, index/ciphertext/key metadata tampering, privacy withdrawal and explicit expiry/key destruction. It restored the matching database into a sealed target but did not restore S3 objects. See [MEDIA-VAULT.md](MEDIA-VAULT.md).

[Isolated S3 restoration](MEDIA-RESTORE.md) now passes real local emulator transfers with quarantined rows, matching sealed-database provenance, durable interruption/resume records, exact ownership/content verification and current privacy filtering. The new vault drill `2faebf13` passed 15 groups per region, including deletion accepted immediately after a real PUT. No service was unsealed.

[Recurring managed-vault and target cleanup](MEDIA-MAINTENANCE.md) now uses independent signed target custody, survives backup-key destruction/missing database file rows and retries ordinary storage failures with private health reporting.

Still required before release: actual regional cleanup latency/provider/alert acceptance, operator acceptance of implemented standalone 30-day snapshot expiry and vault metadata retirement, independent minimal terminal-custody retention, full commissioning and production RPO/RTO objectives, removal from object versions/replicas, rollback-resistant regional off-host custody, monitored journal/queue failure alerts, privacy-policy/operator review and actual storage durability/permission acceptance. [Retired-history admission](JOURNAL-RETENTION.md) now refuses databases and archives whose applied checkpoint is below the authenticated floor. It does not certify arbitrary manually altered source data or a complete rollback of independent custody. Use only the reviewed operator retirement path; do not remove history by hand or reopen an unverified restore.

Latest recurring cleanup evidence: `2676e18c` passed 18 groups in each region, including real maintenance-container outage/retry/health, signed independent inventory/state, cleanup after backup-key destruction, altered retention metadata, missing database file receipts and retained terminal decisions after a deletion failure. Only authenticated hard expiry bypasses an unreadable current journal record; no early privacy decision ignores current history. See [MEDIA-MAINTENANCE.md](MEDIA-MAINTENANCE.md).

Source history retirement is now connected to the existing maintenance worker and protected `retire` command. New inventory version 2, source configuration binding, applied count/digest and snapshot-manifest version 2 are required for the new restore-admission proof. Retirement removes completed 31-day records and associated recovery rows; current backups exclude those recovery-only tables and reconstruct retained state. See [JOURNAL-RETENTION.md](JOURNAL-RETENTION.md) for compatibility limits and remaining independent-custody/metadata-expiry work.

The current campaign/database drill `d9f39bd0` passed twelve groups per region with thirty migrations, preserving campaign versions and their retained metadata while the target stayed sealed and sponsor delivery stayed off. Operator advertiser-register custody remains separate. Prior drill IDs above retain their historical scope. See [SPONSORS.md](SPONSORS.md).

Guided smart first-solve restore check (2026-10-20): drill a8322d7f used the exact images from passing Docker run 77b7943f, applied migration 39 and passed 21 groups in each isolated region. It compared the complete restored GuidedSolve row with its source: thirteen-stage plan, verified checkpoint, actual turns, fixed D/F frame, connection epoch, counter and interrupted status. Historical virtual rows retained null smart fields. Both targets remained sealed; all owned resources and six anonymous mounts were removed. This synthetic local database drill does not establish production off-host custody, regional storage durability or an operational recovery target.

Smart game restore check (2026-10-20): drill 6024ea33 used the exact images from Docker ab5ab56b, applied migration 40 and passed 22 groups per region. It compared the complete restored smart Attempt with its source, including the fixed U/F frame, epoch, counter, relative receipt order, actual received moves and interrupted status. Legacy attempt fields stayed null and both targets remained sealed. All owned resources and six anonymous mounts were removed. This remains a synthetic local database check, without proof of off-host custody or production durability.

Scheduled smart competition restore check (2026-10-20): cbbd0220 used the exact images from Docker 29d72b57 and passed 23 groups per region on the existing 40 migrations. Complete archived smart event/round/entry/publication records and their permanent private room/attempt links matched the source, including WCA provenance, connection epoch/counter and withdrawn sharing. The cancelled event did not reopen and both restored targets remained sealed. Independent cleanup found no owned resources and six anonymous mounts were removed. This synthetic local check does not establish production off-host custody, native compatibility or operational durability.

[Standalone database snapshot expiry](SNAPSHOT-EXPIRY.md) now removes authenticated managed archives at their fixed 30-day deadline through a separate network-disabled worker. Shared live-archive keys remain intact; provider copies, vault control/target inventories and independent custody still require their separate controls and acceptance.

[Vault metadata retirement](VAULT-METADATA-EXPIRY.md) now removes expired per-file target inventories and restore receipt rows after verified empty-bucket cleanup, then compacts source controls. Small signed negative records remain in private independent custody to prevent reconstruction; full-custody rollback, copies and actual provider/operator acceptance remain unresolved.
