# Standalone database snapshot expiry

Standalone database-only archives now have an optional, independent expiry worker. At their authenticated 30-day deadline, restoration is already refused; this worker also removes the managed encrypted archive and its manifest. Live archives and the shared snapshot key remain unchanged. Media-vault bundles use their separate maintenance workflow.

## Protected regional configuration

Prepare a mode-0600 `snapshot-expiry.json` inside the operator's private mode-0700 request directory:

```json
{
  "region": "INTL",
  "databaseHost": "postgres",
  "databaseName": "cubers",
  "directory": "/var/lib/cubers/snapshots",
  "keyFile": "/var/lib/cubers/recovery-key/snapshot.json",
  "intervalSeconds": 60,
  "confirmation": "RUN REGIONAL SNAPSHOT EXPIRY"
}
```

Use the actual standalone snapshot key filename. The private environment's region, database hostname/name and signed journal source binding must agree. The worker reads the database URL only to validate its source fingerprint; it creates no database connection, PostgreSQL subprocess, S3 client, email transport, AI client or server. It needs the current journal header/source binding and snapshot key, but no retired journal payloads.

The archive root must be a canonical owned mode-0700 directory, separate from journal and key custody. Files must be owned private regular files with mode 0600, without symlinks or hard links. Use a dedicated standalone snapshot root: arbitrary names, nested media-vault roots and more than 1,000 snapshot directories cause refusal. Capture roots and keys from another region/installation/source cannot be substituted.

```sh
node apps/api/dist/snapshot-expiry-cli.js once /private-operator/snapshot-expiry.json
node apps/api/dist/snapshot-expiry-cli.js daemon /private-operator/snapshot-expiry.json
node apps/api/dist/snapshot-expiry-cli.js health /maintenance-health
```

`once` reports only examined/purged/failure counts and exits unsuccessfully on a failure. Request schemas are strict: no supplied clock, replacement source, retention override or decryption bypass is accepted. The library's test clock is not exposed by the command.

The `maintenance` profile in `infra/compose.snapshot.yml` adds `snapshot-expiry`. Combine it with the normal production and recovery overlays, using separate regional `CUBERS_SNAPSHOT_HOST_DIRECTORY`, `CUBERS_RECOVERY_KEY_HOST_DIRECTORY`, `CUBERS_DELETION_JOURNAL_HOST_DIRECTORY` and `CUBERS_OPERATOR_REQUEST_HOST_DIRECTORY`. Mount sources must already exist. Validate the combined configuration first, then start only this service with `--no-deps`. Do not start the API/proxy/worker to perform expiry.

The worker has `network_mode: none`, UID 1000, a read-only root filesystem, dropped capabilities and no public ports. Key, journal and request mounts are read-only; only the snapshot root and private health tmpfs are writable. Provision directory/file ownership for UID 1000. No production worker or real credential has been commissioned here.

## Removal and recovery

Each completed manifest is checked against its signed installation, region, source fingerprint, key identity, UUID, timestamps and fixed 30-day lifetime. Unexpired archives are retained. Before deleting an expired ciphertext, the worker checks its exact length/hash and safe file identity. It never decrypts or recursively removes a supplied directory.

Archive unlink and directory synchronization precede manifest removal. If interrupted after removing the ciphertext, the retained authenticated manifest allows the next pass to finish. A crash after manifest removal can leave an empty owned UUID directory, which the next pass removes. The key is shared across standalone archives and is deliberately retained for the live ones; this is managed-file deletion, not per-archive key destruction.

Changed/corrupt ciphertext, unknown files, missing manifests, incomplete captures or unsafe custody remain for private operator investigation. A pass may observe a capture still being written and report failure; it retries on the next pass. Normal capture failures already remove their own incomplete files. Do not put unrelated data in the snapshot root or remove a capture that might still be running.

A private `.snapshot-expiry-lock` serializes expiry passes. A live or crash-held lock is never stolen. After a crash, independently confirm that the old worker has stopped before recovering its lock under the private runbook. Do not replace keys or signed journal bindings to obtain a successful pass.

The worker scans at most 1,000 directories per pass with a two-minute work budget and a bounded 64 KiB hash buffer. It checks cancellation between archive/hash operations; blocked host filesystem calls still require host-level monitoring. Shutdown stops further admission and allows current cleanup to settle. Passes never overlap, and run every 30–300 seconds after the preceding pass finishes. Failed passes report degraded health; stopped/stale/failed workers fail the private health probe. Monitor queue age, retained archives, disk use, locks and repeated failures independently; container health alone is not incident response.

This worker does not delete off-host copies, filesystem snapshots, provider object versions, replicas or copied keys, and cannot detect rollback of all independent custody. Those controls, actual cleanup latency and backup RPO/RTO require operator/provider acceptance. Expired restore refusal is immediate; physical removal occurs on a successful pass. Vault control/target-inventory expiry remains separate unfinished work.

## Verification

Synthetic source tests cover exact expiry, preserved live archives/keys, source/key/manifest substitution, interrupted deletion, unexpected files, corruption, hard links, symlinks, FIFO refusal, stale locks, cancellation, the directory bound and authenticated journal retirement. Compiled regional Docker checks run the actual protected command and refuse request clock overrides. The encrypted database drill additionally captures a real PostgreSQL dump and exercises expiry with a library-only test deadline while preserving the live restore archive. Evidence is `.data/snapshot-expiry/verification.json`; local results do not establish real production cleanup or regulatory approval.
