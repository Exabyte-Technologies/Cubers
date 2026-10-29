# Encrypted media vault

Implemented 2026-10-18. The offline vault captures an encrypted database snapshot and encrypted ready media, verifies them and removes expired/withdrawn copies and their separate keys. [Restoring eligible S3 objects into isolated sealed storage](MEDIA-RESTORE.md) is now connected. [Recurring current-object/key cleanup and private health reporting](MEDIA-MAINTENANCE.md) are now connected. **Actual provider/alert acceptance and service commissioning remain unfinished.** No vault command unseals a database, opens an HTTP listener, sends email or calls AI. Public release remains gated.

## Consistent capture

Close ingress and stop background writers before capture. The protected operator request explicitly confirms maintenance; this is not advertised as a live production backup. A repeatable-read PostgreSQL transaction holds shared locks on account, media, post, consent, attempt and recovery-state tables. Its exported snapshot is used by both metadata selection and the real custom-format `pg_dump`. See PostgreSQL's [snapshot functions](https://www.postgresql.org/docs/17/functions-admin.html) and [pg_dump snapshot option](https://www.postgresql.org/docs/17/app-pgdump.html).

Only `READY` processed `/clean` objects under the exact regional owner prefix are eligible. Processing/upload objects are excluded. Post photos/videos and private signed-consent PDFs are retained with their references; abandoned ready objects expire after one day. Evidence must be bound to a physical ranked attempt, with its original 30-day maximum, current review/appeal deadline and current independent privacy decisions. Account/file erasure and guardian withdrawal exclude the affected objects. Missing owners, cross-region data, invalid bindings/types/keys or an unavailable eligible object fail the capture rather than silently omitting it.

The S3 response length and content type must match the database snapshot. Bytes stream through AES-256-GCM without a plaintext file. A SHA-256 digest authenticates the actual processed bytes; the database's original-upload hash is not mistaken for a sanitized-file hash. Clean keys are immutable in the application workflow; production IAM must also prevent unauthorized replacement. Privacy-history changes during capture prevent accepting the bundle. Final publication serializes with accepted privacy events.

Capture is bounded to 10,000 eligible objects, 256 MiB per object, 64 GiB total and five minutes of database transaction time. The index is limited to 16 MiB. Object reads abort by the effective retention deadline or five minutes. Ordinary producer/transaction failure leaves no accepted bundle, removes its data keys and artifact tree, and retains only authenticated non-content failure metadata. Crash/power-loss handling still requires monitored operator recovery; a crash-held lock is never stolen automatically.

## Separate random keys and inventory

Ciphertext and key roots must be separate owned mode-0700 real directories, outside the independent journal directory. Files are mode 0600; unsafe aliases and links are refused. Physical device/inode ancestry is checked too, so two bind-mount paths to the same underlying directory cannot disguise overlap. Each object receives a fresh random 32-byte key, and the database/index receive a separate random per-bundle key. Keys are not derived from the surviving installation master. Media keys never enter a database dump or artifact index. An encrypted index binds the region, installation, source bucket, original object identity/type/ownership, hashes, byte counts, key identities and retention bounds. Authenticated control metadata lives outside the artifact root. Each separate key record also carries master-authenticated minimal ownership, integrity and expiry metadata; key storage therefore needs the same private/encrypted custody as the keys themselves. Pruning does not depend on the artifact index remaining readable.

Managed storage looks like this:

```text
artifact-root/<bundle UUID>/
  bundle.json                 encrypted media index
  database/<snapshot UUID>/   encrypted PostgreSQL archive + manifest
  media/<opaque UUID>.enc     independently encrypted files

key-root/
  master.json                 installation control key
  bundles/<bundle UUID>/
    control.json              authenticated custody/expiry/tombstone metadata
    database.json             independent database/index key
    media/<opaque UUID>.json  independent file keys
```

The master authenticates control metadata; it cannot derive deleted file/database keys. This does not certify forensic erasure, secure hardware custody or destruction of an operator's extra key copies. Key storage and all replicas/backups must have reviewed encryption, access control and matching expiry. Do not copy secret roots into artifact backups or retain old secret-root snapshots beyond their applicable deadline.

## Verification and pruning

Verification authenticates the encrypted index and database snapshot, validates regional installation/source identity and the current journal prefix, and streams every currently eligible file through GCM/tag, size and processed-content hash checks. Purged, expired or newly withdrawn objects are excluded from the restorable inventory. Verification reports counts; it does not expose plaintext or restore files.

Current captures use version-2 control/index/key-record documents (the encryption envelope and snapshot-key format remain version 1). Early experimental version-1 captures are not silently adopted or treated as corrupt version-2 keys; reviewed migration is required, while authenticated whole-bundle expiry still works.

Pruning evaluates the current independent privacy history. It writes authenticated terminal tombstones before removing the exact object key file and ciphertext, and synchronizes the key directory. An unreadable/tampered artifact index blocks verification but does not block key expiry. A damaged or missing authenticated key record is treated as an unrecoverable copy: its exact trusted object ID is tombstoned and removed. Unsafe filesystem ownership/link errors still require operator investigation. Unrelated objects remain intact. A later valid appeal can extend an unpurged evidence copy only within its hard limit; terminal erasure or an existing purge marker cannot revive an object. Appeal admission rechecks the old deadline while holding the same journal lock used for destructive pruning, so a request that waited past expiry cannot extend it afterward.

At the 30-day bundle deadline, pruning removes the independent database/index key, remaining media keys and complete artifact tree. The surviving master and old ciphertext alone cannot reopen it. Incomplete captures without an active lock are purged instead of adopted. A crash-held lock needs reviewed operator recovery after confirming its process stopped; do not remove a live lock. [Recurring maintenance](MEDIA-MAINTENANCE.md) now invokes these controls with private health reporting and retries. Staffed alert routing, workload/latency acceptance, operator acceptance of the implemented journal and per-file metadata retirement, minimal terminal-custody retention and rollback-resistant off-host custody are still release requirements.

## Operator requests and Docker

Prepare separate regional host directories, owned by UID/GID 1000 and mode 0700. Inside the vault-key host directory, prepare `bundles/` with the same ownership/mode. Set `CUBERS_MEDIA_VAULT_HOST_DIRECTORY` and `CUBERS_MEDIA_VAULT_KEY_HOST_DIRECTORY`; never share them across installations or regions. The existing independent journal must already be initialized and the source database active/bound.

Use a mode-0600 request in an owned mode-0700 request directory:

```json
{
  "operation": "initialize",
  "region": "INTL",
  "databaseHost": "postgres",
  "databaseName": "cubers",
  "directory": "/var/lib/cubers/media-vault",
  "secretDirectory": "/var/lib/cubers/media-vault-keys/bundles",
  "masterKeyFile": "/var/lib/cubers/media-vault-keys/master.json",
  "confirmation": "INITIALIZE MEDIA VAULT"
}
```

Initialization refuses overwriting the master. For capture, use `operation: "capture"`, `maintenanceConfirmed: true`, `confirmation: "CAPTURE PRIVATE MEDIA BUNDLE"`. For verification, use `operation: "verify"`, the returned `bundleId`, and `confirmation: "VERIFY PRIVATE MEDIA BUNDLE"`. For irreversible managed expiry/key removal, use `operation: "prune"`, the exact `bundleId` and `confirmation: "PRUNE EXPIRED MEDIA KEYS"`. For isolated media restoration use the protected `restore-sealed` request in [MEDIA-RESTORE.md](MEDIA-RESTORE.md); it also requires the matching sealed database and a distinct empty private bucket. The CLI always uses its current clock; test clock injection is not a request option. Database host/name, explicit region and confirmation must match the protected environment.

```sh
node apps/api/dist/media-vault-cli.js /private-operator/request.json
```

Combine `infra/compose.media-vault.yml` with production and recovery overlays under the `operations` profile. The operator mounts its journal writable for serialized custody changes, its journal key read-only, artifact and separate vault-key roots writable, and its request read-only. A separate unexposed egress network permits the reviewed regional storage endpoint; it publishes no ports. The inherited unused PostgreSQL data path is tmpfs. The image runs UID/GID 1000 with a read-only root, dropped capabilities and bounded memory/processes.

```sh
docker compose --env-file .env.production -f infra/compose.production.yml -f infra/compose.recovery.yml -f infra/compose.media-vault.yml --profile operations config --quiet
docker compose --env-file .env.production -f infra/compose.production.yml -f infra/compose.recovery.yml -f infra/compose.media-vault.yml --profile operations build media-vault-operator
docker compose --env-file .env.production -f infra/compose.production.yml -f infra/compose.recovery.yml -f infra/compose.media-vault.yml --profile operations run --rm media-vault-operator
```

Do not start source API/worker processes during capture or exercise these commands against live data as a test. No actual production keys, regional storage or operator custody were commissioned here. Exact measured verification is recorded in STATUS and DOCKER-VERIFICATION.

Still required: actual regional cleanup latency/alert/provider acceptance; complete recovery acceptance before fresh credential/consent/moderation/staff commissioning; operator acceptance of implemented vault metadata and standalone snapshot expiry, plus independent minimal terminal-custody retention; independent rollback-resistant custody; real provider IAM, object-version/replica deletion and durability acceptance; production RPO/RTO objectives. The full application goal remains unfinished.

Expired source controls now compact to signed version 3 after target retirement, retaining terminal installation/bundle state while dropping per-object references. Per-file target inventories and cascading restore receipts are removed only after verified empty-bucket cleanup. See [VAULT-METADATA-EXPIRY.md](VAULT-METADATA-EXPIRY.md); coordinate all operator versions before upgrading.
