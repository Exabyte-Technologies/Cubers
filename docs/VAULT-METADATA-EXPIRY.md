# Expired vault metadata retirement

The existing regional media-vault workers now retire per-file cleanup inventories and restore database receipts after the bundle's fixed 30-day deadline and successful target cleanup. They retain small authenticated terminal markers so ordinary retries and partial rollback cannot recreate a retired target. No production worker, key, bucket or database has been commissioned by this change.

## Target ordering

A target worker still requires the exact regional journal/master identity, source/snapshot provenance, isolated destination database/storage binding and a **SEALED** database. It retains the existing bounded storage calls, database advisory lock and private filesystem lock. Before the whole-bundle deadline, normal privacy cleanup continues to retain its signed per-file inventory for future reconciliation.

After the deadline, each known restored object must be excluded and confirmed absent through the existing ownership/type/size/ETag checks. The worker then lists the isolated bucket with a one-object bound and requires it to be empty. Unrelated objects, a storage failure or an uncertain response prevent retirement; the worker never deletes unrelated objects merely to make this check pass.

Only then does it publish `restores/<batch UUID>/retired.json` atomically in private independent custody. That signed record contains regional installation/bundle/batch/snapshot identities, source/index/target/storage hashes, the bucket, original hard expiry, completion time and aggregate object count. It contains no owner IDs, media IDs, object IDs, object paths, per-file hashes or per-file retention history. It remains private, mode 0600, under the same controlled custody as the other records; it is not a public or anonymous-data claim.

Publication precedes deletion of the matching `MediaRestoreBatch` and its cascading `MediaRestoreFile` rows, followed by the private `inventory.json` and `state.json` files. Other restore batches and source media/account rows are outside this metadata-retirement operation. Original encrypted backup keys/ciphertexts are handled by the existing backup cleanup, not this step.

If interrupted after publishing the terminal marker, a later target pass verifies it, checks the current SEALED destination and empty bucket again, and finishes exact metadata removal. Replayed old restore rows and private inventory files cannot override the terminal marker. A matching terminal marker also refuses a new restore batch for that same destination before object reconstruction. A changed marker/signature, conflicting batch binding, unsafe file or unexpected private filename fails for operator investigation.

A bucket that gains an object after retirement fails the next empty-bucket check. The terminal record deliberately has no object identities with which to adopt or delete such a new object. Keep the target isolated, investigate provider lifecycle/rollback and do not remove terminal custody to retry a restore.

## Source control compaction

Backup workers continue removing expired data keys and ciphertext first. After the full bundle deadline and `PURGED` state, source control compaction additionally requires every registered target to have a valid terminal marker and no remaining per-file inventory/state file. Until all targets finish, the original control references remain available for their cleanup.

The resulting signed **control version 3** retains only installation/bundle identity, source fingerprint, original creation/expiry and `PURGED` state with an empty compatibility list. Per-object references, journal checkpoint and index digest are removed from that control. Version 3 cannot be used for index verification or restoration. Target markers remain independently authenticated when the compact control no longer contains an index digest.

The source does not connect to target databases or buckets to infer completion: it relies on each target worker's independently published terminal record. Run the source backup worker and **each isolated target worker** until cleanup and metadata removal have completed. An offline/unavailable target keeps the needed custody rather than silently losing its deletion plan. Private locks are never stolen; a crash-held lock still requires reviewed operator recovery.

## Operation and compatibility

No new migration, package, credential, public endpoint, command or clock override is added. The existing `media-maintenance-cli.js` `backups` and `target` scopes perform retirement. Use their protected request schemas and private health/alert commissioning instructions in [MEDIA-MAINTENANCE.md](MEDIA-MAINTENANCE.md).

Coordinate upgrades across capture, restore and maintenance operators; do not run mixed operator versions after enabling the new images. Old software does not understand compact version-3 controls. Preserve the independent regional master and journal binding, and never restore their old copies from a database/media archive. Production commands use the current clock; accelerated expiry in tests is a library-only fixture.

Minimal terminal custody is retained to refuse reconstruction; this change does not delete every historical identifier or solve independent custody retention. Off-host copies, object versions/replicas, source/target database lifecycle, copied keys, full-custody rollback detection, eventual storage consistency, actual latency/RPO/RTO and operator/legal acceptance still require separate controls. Removing/replaying all current independent custody is outside the partial-rollback guarantee. Provider lifecycle and independent alerts remain necessary.

## Verification scope

Source tests cover the minimal strict receipt schema, signature/key/source/region substitution, unsafe links, expired/live controls, pending target metadata and unknown-file preservation. The current-image encrypted media-vault drill uses real regional PostgreSQL databases and local S3 emulators to exercise unrelated-object refusal, a storage-probe outage, metadata retirement/cascades, replayed rows/files, altered terminal signatures, source compaction and refusal of a deliberately replayed live encrypted index/control/key while terminal custody remains current. Existing capture, privacy, target cleanup and sealed-restore checks remain in that drill. Evidence is `.data/vault-metadata-expiry/verification.json`.

These tests use synthetic accounts/media and accelerated library deadlines. They do not establish real provider IAM/conditional semantics, production elapsed retention, native/UI acceptance, public deployment or regulatory approval.
