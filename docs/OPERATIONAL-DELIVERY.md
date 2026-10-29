# Optional regional alert delivery

The monitor can deliver its fixed aggregate alert/recovery events to an operator-approved HTTPS receiver. Delivery is **off by default**. No real receiver, credentials or paging service are provisioned by the app. Commission an independently monitored, staffed destination in each community before relying on it.

## Configuration

Use a separate endpoint, secret and persistent queue for CN and INTL. The operator must assess the destination's regional data processing and access controls. Only the monitor needs these settings; the API, worker and mobile app do not send alerts.

For a continuous monitor, configure all three:

- `OPERATIONS_ALERT_FILE`: canonical absolute path to a private JSON credential file.
- `OPERATIONS_ALERT_OUTBOX_DIRECTORY`: canonical absolute path to an existing private, owned directory dedicated to this queue.
- `OPERATIONS_ALERT_ALLOWED_HOSTS`: comma-separated exact approved DNS hostnames, without wildcards.

The credential file has this structure; the placeholder is not a working secret:

```json
{
  "version": 1,
  "region": "INTL",
  "endpoint": "https://alerts.example.invalid/cubers",
  "keyId": "regional-2026-01",
  "key": "REPLACE_WITH_CANONICAL_BASE64_OF_32_RANDOM_BYTES"
}
```

Keep the file mode 0600 and its directory private. The queue directory must be owned by the monitor UID with mode 0700; queue files are 0600. The production container runs as UID 1000: provision readable credentials and a writable queue for that UID. Root-owned mode 0400 credentials cannot be read by the default monitor. Symlinks, hard links, nonregular files and unknown queue-directory entries are refused. Never use this directory for other secrets or files.

The optional `infra/compose.alerts.yml` overlay mounts only the monitor's credential file and independent queue directory and adds its outbound network. Supply `CUBERS_ALERT_ALLOWED_HOSTS`, `CUBERS_ALERT_KEY_HOST_DIRECTORY` (containing `operational-alerts.json`) and `CUBERS_ALERT_OUTBOX_HOST_DIRECTORY` alongside the normal production configuration and required recovery overlays. Mount sources must already exist. Validate the combined configuration before deployment. The base stack has no alert credentials or outbound alert connection.

`operations-main.js once` remains a read-only aggregate probe: it does not load the credential, open the queue or deliver events. Normal configuration validation still applies. Continuous startup refuses partial configuration and wrong-region credentials.

## Delivery contract

Each UTF-8 JSON envelope contains version 1, a stable UUID `id`, `createdAt`, `expiresAt` and `alert`. The alert contains only its fixed event name, community, signal, state, sample timestamp and aggregate count (or null). It excludes account identifiers, media, object paths, raw errors and provider responses.

The sender posts to HTTPS on the default port only. The endpoint must have an approved exact DNS hostname and a plain path, without credentials, query parameters or fragments. Every attempt validates all DNS answers as public unicast addresses, pins the selected address, and retains the original hostname for TLS certificate verification/SNI. Private or mixed public/private DNS answers fail closed. No proxy, redirect or automatic transport retry is used. Acknowledgements must be 2xx, with at most 8 KiB of response headers and 4 KiB of body.

Headers include `x-cubers-event-id`, `x-cubers-key-id`, `x-cubers-sent-at` and `x-cubers-signature`. The signature is `sha256=` followed by lowercase hexadecimal HMAC-SHA256 using the decoded 32-byte secret over these exact bytes (LF separators, no final LF):

```text
CubersOperationalAlerts1\n<keyId>\n<sentAt>\n<raw request body>
```

The receiver must verify the signature over the original bytes using a constant-time comparison, require the expected key/community, validate the event schema and expiry, check a bounded clock-skew window, and durably deduplicate by envelope UUID before acknowledging. Retries preserve the ID and body but use a fresh send timestamp/signature. A lost acknowledgement can cause duplicate delivery; this is not exactly-once transport. Keep receiver deduplication records for at least the 72-hour envelope lifetime plus the accepted clock skew.

## Queue and failure behavior

The queue uses Node's built-in SQLite independently of PostgreSQL and Redis. Its private WAL database uses full synchronous writes; alert transitions and their authenticated observation checkpoint commit together. A restart can therefore produce the recovery for an earlier alert without losing the previous state. This does not replace filesystem durability, independent backups or host monitoring.

The queue holds at most 5,000 envelopes, expires them after 72 hours and preserves FIFO ordering. A failed alert stays ahead of its recovery. Capacity failure rolls back the checkpoint so the next sample can retry; a full queue can still prevent later observations from being captured. Expired events are removed and counted. Per-event leases last 30 seconds, and stale acknowledgements cannot remove a newly leased event. Failed sends back off from 30 seconds to at most 15 minutes. Each drain handles at most 20 events within an eight-second budget; each attempt has at most four seconds, bounded further by envelope expiry. There is one active drain per process. Shutdown aborts delivery and waits for the underlying transport to close before closing the queue.

Queue bodies and observation checkpoints have keyed integrity checks. The queue is bound to its region, endpoint and secret identity; changing any of those refuses the old queue. Drain or explicitly archive the old queue under the old configuration, then provision a new empty private directory for a reviewed rotation. Never silently retarget pending regional events. An expired or corrupt queue needs operator attention; integrity failure does not silently discard its head entry.

Redacted `cubers.operational.delivery` logs report pending/attempted/delivered/failed counts, the oldest queued timestamp and cumulative `expiredTotal`. Queue failures emit a fixed critical delivery-failed record; sampling continues to local logs. Independently monitor missing samples, monitor restarts, disk exhaustion, queue growth/expiry, ingestion failure and destination reachability. This monitor cannot report its own total host failure through the same failed host.

## Verification scope

The implementation is tested with synthetic credentials and a local TLS receiver. Test-only dependency injection supplies a local address and fixture certificate; production configuration cannot enable that bypass. No real outbound destination or user information is sent. The verification record is `.data/operational-delivery/verification.json`. Local success does not establish receiver commissioning, incident response, public deployment, native-device acceptance or legal approval. Existing release gates remain in force.
