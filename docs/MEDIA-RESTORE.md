# Isolated media restoration

Implemented as an offline operator path, with acceptance results recorded in [STATUS](STATUS.md) and [Docker verification](DOCKER-VERIFICATION.md). This stage restores eligible encrypted-vault objects into separate storage and keeps every restored database sealed. It does not commission services or grant users, guardians, moderators or workers access.

## Required target

Use a matching [media-vault bundle](MEDIA-VAULT.md), its independently held keys and the current independent privacy journal. First restore that bundle's database archive into a separate empty database using [the sealed database restore](DATABASE-SNAPSHOTS.md). New captures contain migration `202610180002_media_restore`; database restoration records the exact snapshot UUID and source fingerprint in `RecoveryBinding`. A different snapshot, an active/source database, another region or a source bucket is refused. Experimental earlier archives require reviewed compatibility/migration work; do not manually manufacture the provenance marker.

Prepare a **new, empty, private regional bucket** with a different name from the source. Use dedicated credentials and deny public access and all other writers, including the API/worker. The operator needs list/get/put/delete rights for this isolated bucket. Keep ingress closed and source/target workers stopped for the operation. The command checks emptiness, matching database provenance, key/owner/type/size/creation/attempt bindings and regional installation identity; it cannot prove a provider's public-access/IAM/replica configuration. Those controls need actual provider acceptance before using real data.

Set the protected operator environment's `DATABASE_URL` and `S3_BUCKET` to those isolated targets. Set `S3_ENDPOINT`, `S3_REGION` and dedicated credentials deliberately. Do not reuse a live bucket or silently switch the endpoint of an existing batch. Keys, journal and encrypted artifacts remain outside the target database and bucket.

## Protected request

The mode-0600 request must be in an owned mode-0700 directory. The database hostname/name and explicit region must match the environment:

```json
{
  "operation": "restore-sealed",
  "region": "INTL",
  "databaseHost": "isolated-postgres",
  "databaseName": "sealed-cubers",
  "directory": "/var/lib/cubers/media-vault",
  "secretDirectory": "/var/lib/cubers/media-vault-keys/bundles",
  "masterKeyFile": "/var/lib/cubers/media-vault-keys/master.json",
  "bundleId": "REPLACE_WITH_CAPTURED_BUNDLE_UUID",
  "temporaryDirectory": "/recovery-tmp",
  "isolatedTarget": true,
  "maintenanceConfirmed": true,
  "confirmation": "RESTORE MEDIA TO SEALED ISOLATED TARGET"
}
```

```sh
node apps/api/dist/media-vault-cli.js /private-operator/request.json
```

Use the existing production/recovery/media-vault Compose overlays and operations profile, explicitly configured for the isolated database and storage. The overlay now provides private Linux tmpfs at `/recovery-tmp`. No service/proxy is started by this command. AI and mail remain disabled. No unseal command is provided.

## Authentication, interruption and privacy

Each encrypted file is fully authenticated and checked against its processed-byte SHA-256 and exact size in an immediately unlinked private Linux tmpfs file **before** any plaintext reaches S3. Ordinary disk staging is refused. The descriptor remains owned by the operator until transfer completes and closes on success or failure. Default tmpfs is 128 MiB; larger objects require deliberate staging/memory sizing, within the vault's 256 MiB per-object bound. The operation has a four-minute storage budget and five-minute database-lock budget; larger collections can require repeated resumptions. No plaintext staging path survives an ordinary failure.

A dedicated database transaction serializes restore jobs while separate committed transactions record batch/file ownership before writes. Vault locking also prevents key pruning during the job. The target bucket and storage endpoint are bound to the batch. All restored ready rows become `RECOVERY_QUARANTINED`; ineligible upload/processing rows become `RECOVERY_EXCLUDED`. Nothing becomes `READY`. Batch ownership survives operator-container recreation, including a PUT accepted by storage whose response was lost.

Uploads send `If-None-Match: *` to avoid replacement. The provider must implement and enforce [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html); the local emulator does not certify this. Resume accepts an existing object only when its opaque batch/bundle/object metadata, content type, length and downloaded SHA-256 all match the durable receipt. Foreign keys, changed ownership/content and an unexpectedly missing previously completed object require investigation; they are not overwritten or adopted. Deletion checks exact ownership and sends the current ETag precondition. Exclusive target IAM remains necessary to prevent competing writers.

Current account/file erasure, guardian withdrawal, evidence deadlines and terminal vault purges filter each upload and are rechecked after transfers. Excluded receipt state is terminal. Privacy accepted during a long transfer is reconciled before reporting success; a changing journal or crossed deadline prevents accepting the batch and requires resume. A later valid appeal cannot recreate an already excluded copy. Unrelated files remain intact. This filtering covers current objects, not historical versions or replicas.

`media-restored-sealed` / batch `STAGED` means the transfer was checked against the accepted privacy history at that time. It is **not** service activation or a permanent authorization/retention decision. API/worker startup also refuses the restored-snapshot provenance marker if someone only changes `state` to `ACTIVE`. Do not remove markers or manually grant access.

## Remaining acceptance

[Recurring target cleanup](MEDIA-MAINTENANCE.md) now runs while the database remains sealed, using signed independent inventories after backup keys expire. It retries ordinary storage failures and reports private health. Actual alert routing/latency acceptance and provider version/replica expiry remain unfinished. Do not leave a staged target unattended or treat a successful transfer as meeting the retention policy. Vault control/target-inventory pruning, rollback-resistant custody, fresh credentials, guardian/owner permissions, moderation/staff commissioning and actual provider/RPO/RTO acceptance remain required before public service recovery. The full application goal remains unfinished.

After the hard bundle expiry and verified target cleanup, [metadata retirement](VAULT-METADATA-EXPIRY.md) replaces per-file custody with a minimal signed terminal record and deletes matching restore batch/file rows. Current terminal custody blocks a new restore batch for that destination, including when old inventory/database rows or live index/control/key material are replayed. Whole independent-custody rollback remains outside that guarantee.
