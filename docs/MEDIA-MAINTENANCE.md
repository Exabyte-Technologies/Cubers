# Regional backup and sealed-target cleanup

The independent maintenance worker runs without opening the API or unsealing a restored database. It repeats expiry/privacy cleanup, retries ordinary storage failures and exposes a private health file plus a command suitable for container monitoring. Actual provider lifecycle/version/replica enforcement, alert routing and operator acceptance remain required. Current test evidence is recorded in [STATUS](STATUS.md) and [Docker verification](DOCKER-VERIFICATION.md).

## Independent target custody

Before any [sealed media restore](MEDIA-RESTORE.md) writes a file, it publishes an immutable, master-authenticated inventory in the separate private vault-key root:

```text
bundles/<bundle UUID>/restores/<batch UUID>/
  inventory.json   matching installation/snapshot/target/storage and media bounds
  state.json       authenticated terminal exclusions, bound to that inventory
```

This inventory contains private ownership, object, processed-content hash and retention metadata, including each original hard expiry. It contains **no media bytes or media/database decryption keys**. Protect it with the same encrypted storage, UID ownership, mode-0700 directories, mode-0600 files and regional custody as the keys. Do not place it in the public artifact bucket or delete it with the database/index key. It is not a substitute for independent rollback-resistant custody: deleting/replaying all current control storage still requires separately accepted safeguards.

Target cleanup authenticates the current regional journal binding, bundle control, inventory and exclusion state. The target database must remain sealed with the exact snapshot/source provenance; the configured bucket/endpoint must match. Accepted account/file erasure, guardian withdrawal, evidence deadlines and terminal vault purges drive exclusion. The decision is recorded outside PostgreSQL before object deletion, serialized with appeal admission. Missing/damaged custody or a missing accepted state is not silently regenerated. Experimental previously staged batches need one reviewed resume from the still-authenticated bundle to establish the new inventory before unattended cleanup.

Once a copy is excluded, an older restored database row or a later appeal cannot make this tool recreate it. Deletion checks exact opaque batch/bundle/object ownership, type and size, sends the current ETag precondition and checks absence afterward. A foreign/changed object causes a failure for investigation rather than an overwrite or broad prefix deletion. Mutable database receipt deadlines cannot extend the signed bounds; missing database file rows do not lose the independent cleanup inventory.

Cleanup does not need the encrypted artifact index or any file/database/index decryption key. Whole-bundle hard expiry and an already authenticated `PURGED` bundle can remove the target copies even when an accepted journal record is currently unreadable: no appeal can extend those hard limits. Early per-file privacy decisions still require the complete current journal. Unavailable journal headers/master keys or unsafe custody fail and require operator recovery; provider-side lifecycle limits remain necessary too.

## Separate worker scope

Run one `backups` worker for each installation's managed vault roots. It scans all its authenticated bundles and removes expired keys/ciphertext or newly withdrawn copies. It does not need the source database to be online. It never steals a live or crash-held vault lock.

Run a separate `target` worker for **each isolated restored database/bucket pair**, with that pair's dedicated protected environment. It checks independent inventories even after backup-key destruction, retries exact owned-file deletion and marks fully removed batches `PRUNED`. It also detects database batches without matching independent custody. It does not activate the target or run normal queues. Do not switch its endpoint/bucket or reuse it for a commissioned live service.

A sweep accepts at most 1,000 bundle directories and 1,000 target inventories per bundle. Oversized/unsafe inventories fail closed for operator review. Ordinary per-bundle failures are counted while other known bundles continue. The target transfer/deletion storage budget is four minutes per job, with a five-minute database advisory-lock budget. Capacity, cleanup latency and health thresholds need acceptance against the actual regional workload. This is current-object cleanup; object versions/replicas and off-host key copies need provider controls.

## Protected request and Compose

Use a mode-0600 request in an owned mode-0700 directory. For a source backup worker:

```json
{
  "region": "INTL",
  "databaseHost": "postgres",
  "databaseName": "cubers",
  "directory": "/var/lib/cubers/media-vault",
  "secretDirectory": "/var/lib/cubers/media-vault-keys/bundles",
  "masterKeyFile": "/var/lib/cubers/media-vault-keys/master.json",
  "scope": "backups",
  "intervalSeconds": 60,
  "confirmation": "RUN REGIONAL MEDIA EXPIRY"
}
```

For a sealed target, set `scope: "target"`, `isolatedTarget: true`, the isolated database hostname/name and its exact `DATABASE_URL`, `S3_BUCKET`, `S3_ENDPOINT`, region and dedicated credentials in the protected environment. The request and environment must agree. Intervals are 30–300 seconds; the next pass starts after the previous pass finishes, so passes never overlap. Commands use the current clock; there is no request option to move the clock forward.

```sh
node apps/api/dist/media-maintenance-cli.js once /private-operator/request.json
node apps/api/dist/media-maintenance-cli.js daemon /private-operator/request.json
node apps/api/dist/media-maintenance-cli.js health /maintenance-health
```

`once` prints safe counts and exits unsuccessfully on any failure. `daemon` requires an owned mode-0700 `/maintenance-health`, repeats ordinary failures and publishes private health status atomically. It never logs credentials, user/file identifiers, raw storage errors or document contents.

The `maintenance` profile in `infra/compose.media-vault.yml` provides `media-vault-maintenance`. It inherits the private regional mounts and non-root, read-only-root, dropped-capability and no-public-port controls. It uses private tmpfs for health data and the unused PostgreSQL data path, a health probe every 30 seconds, restart-on-process-exit and a six-minute graceful stop allowance. Shutdown finishes the current bounded job and starts no further bundle/target jobs. Source and each sealed target use **separate Compose project/environment/request configuration**, with explicitly shared regional journal/key custody and isolated target storage as appropriate.

```sh
docker compose --env-file .env.production -f infra/compose.production.yml -f infra/compose.recovery.yml -f infra/compose.media-vault.yml --profile maintenance config --quiet
docker compose --env-file .env.production -f infra/compose.production.yml -f infra/compose.recovery.yml -f infra/compose.media-vault.yml --profile maintenance build media-vault-maintenance
docker compose --env-file .env.production -f infra/compose.production.yml -f infra/compose.recovery.yml -f infra/compose.media-vault.yml --profile maintenance up -d --no-deps media-vault-maintenance
```

These commands intentionally start only the cleanup worker. Keep public release approval false; do not start proxy/API/worker services for a sealed target.

## Health and remaining acceptance

A completed failing pass reports `degraded`, even if an earlier pass succeeded. An uncompleted first pass, stale/future clock, stopped worker or damaged health file fails the probe. During a running pass, the last completed pass must remain recent: the threshold is ten minutes plus two configured intervals. Configure actual alert routing for container failure, unhealthy/stale status, excessive pass latency and repeated locks; Docker health alone is not staffed incident response. An unhealthy container remains alive to retry; a health failure alone does not restart it. Failure to publish health causes the process to fail rather than continue silently.

Use synchronized clocks. Key/file removal runs on the next completed pass after the deadline; cryptographic verification denies expired bundles immediately. This does not establish an exact-second physical-erasure SLA. Crash-held locks, altered ownership and broken independent custody require private operator investigation; never delete locks or replace keys merely to obtain green status.

[Source journal retirement](JOURNAL-RETENTION.md) now removes completed 31-day history and associated recovery state, with applied-checkpoint restore admission. [Standalone snapshot expiry](SNAPSHOT-EXPIRY.md) now has its own network-disabled worker. [Expired per-file target inventories and source control references](VAULT-METADATA-EXPIRY.md) now retire after verified target cleanup. Still required: independent minimal terminal-custody retention and acceptance, independent full-history rollback detection and custody, real provider version/replica/key-copy expiry, actual regional alert/latency/RPO/RTO acceptance and fresh credential/guardian/owner/moderation/staff commissioning. No production worker, real key or cloud account was commissioned by this work. The full app remains gated for its other native, hardware, security and release requirements.

## Expired private inventory retirement

After the bundle deadline, the existing target scope publishes a minimal signed terminal receipt only after exact object cleanup and an empty-bucket check, then removes matching restore rows and private per-file inventories. Source backup scope compacts expired PURGED controls after every target has completed that sequence. Terminal records retain no owner/file keys and block reconstruction. See [VAULT-METADATA-EXPIRY.md](VAULT-METADATA-EXPIRY.md) for ordering, interrupted cleanup, compatibility and rollback limits.
