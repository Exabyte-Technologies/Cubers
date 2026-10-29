# Regional service monitoring

The admin **Service health / 服务健康** page reads `GET /v1/admin/operations`. Full, current staff authorization and MFA are checked before sampling and again before delivery. Ordinary accounts, deletion-only sessions, revoked staff sessions and other communities cannot read it. Responses are private and uncached by browsers/proxies. The sampler coalesces concurrent reads and caches a completed sample for ten seconds; the page refreshes every minute and displays its actual sample time. Failed refreshes clear the displayed result.

Only fixed signal names, states, counts and timestamps leave the sampler. It does not return account identifiers, email addresses, posts, evidence, object keys, tokens, raw errors, job payloads or provider responses. Each community reads its own PostgreSQL database and Redis queue/telemetry namespace. Monitoring does not grant gameplay, hardware or public-release eligibility.

## Signals and interpretation

- PostgreSQL aggregate queries have a 2.5-second statement timeout inside a five-second transaction. An unavailable database marks its dependent counts **unknown**, rather than zero.
- Redis inspection uses a separate bounded connection. It reports waiting/active/delayed jobs, whether the queue is paused, and retained failed-job counts. Retained failures are historical records and do not alone mark an active outage.
- Background workers publish anonymous process heartbeats every ten seconds. A worker is current for 45 seconds; graceful shutdown removes its heartbeat. Missing workers or a paused queue require attention. Stale records cannot qualify a worker as available.
- Maintenance/media jobs publish fixed success/failure outcomes. Maintenance needs a successful sweep within three minutes and media within five minutes; missing observations are unknown. A failed maintenance sweep is critical; a failed media sweep or latest failed email send needs attention. Email observations describe past sends, without asserting current provider reachability. Telemetry expires after two days. Recording an outcome has a 750-millisecond caller deadline; a telemetry failure cannot turn a completed send/job into a retry. A timed-out Redis command may settle later, without retrying the user operation.
- Processing media older than five minutes, reports older than one day, pending posts/guardian requests older than two days and provisional/appealed evidence older than one day need staff attention. Rejected media are counted separately; rejection can be deliberate validation rather than an infrastructure fault.
- Evidence still referenced two minutes after its deletion deadline and unresolved attempts more than two minutes past their thirty-day expiry are critical. Account-storage/object removal retries overdue by five minutes are critical. Freshly due repeat erasures are routine even when the original request is old. Soft-deleted accounts still awaiting row erasure are also counted.
- The authenticated API additionally reports its own competition reconciliation state. The separate monitor cannot certify another process's in-memory state; continue checking the public `/v1/health` endpoint independently.

These are initial operational response targets. They do not change permission, retention, moderation or legal deadlines. Successful cleanup telemetry means a sweep returned successfully; it does not certify external storage durability, all backup copies or regulatory compliance.

## Monitor process and alerts

The production Compose stack includes an unexposed, read-only `monitor` service using the same API image and private network. It does not start a web server, a worker, email transport, storage client or AI provider. It checks every thirty seconds without overlapping samples. Its database activity is aggregate reads; Redis queue initialization may write BullMQ metadata. Use the configured regional database/Redis and keep its deployment separate from the other community.

Run the compiled command directly for a local probe:

```sh
node --env-file=.env.production apps/api/dist/operations-main.js once
```

`once` prints an aggregate snapshot and returns zero only when all observed checks are OK; warning, critical or unknown returns one. Omit `once` to run continuously. SIGTERM/SIGINT stop the loop and close its connections. The command uses the normal deployment configuration validation and cannot approve a closed production deployment.

The loop writes JSON `cubers.operational.alert` events for new warning/critical/unknown states, reminders every fifteen minutes while they persist, and `cubers.operational.recovery` when they return to OK. Each sample also writes a small `cubers.operational.sample` heartbeat. Alerts include only community, signal, state, sample time and aggregate count. A process failure emits a fixed `cubers.operational.monitor-failed` event. Compose rotates local logs at 10 MiB with three files.

Optional signed HTTPS delivery with an independent durable queue is implemented and tested against a local simulated receiver; see [OPERATIONAL-DELIVERY.md](OPERATIONAL-DELIVERY.md). It stays off until the operator supplies private regional credentials, an approved receiver and a persistent queue. Configure the actual regional log collector and staffed incident destination before release. A monitor can itself fail: independently alert on container restarts, missing sample events, unavailable `/v1/health` and missing log ingestion. Test an outage and its recovery through the actual incident destination before commissioning.

## Coverage still required

Host CPU/memory/disk, PostgreSQL pool pressure and slow queries, Redis memory/evictions, precise oldest queued-job age, external storage/IAM/lifecycle, real SMTP deliverability, backup/vault custody and actual alert delivery need infrastructure monitoring and commissioning. Aggregate API checks do not replace those controls. The separate media-vault maintenance process retains its own private health probe; see [MEDIA-MAINTENANCE.md](MEDIA-MAINTENANCE.md). Independent production security, native/hardware and release acceptance remain open.

## Verification record

2026-10-21: **296 source tests / 285 backend checks** and workspace types/builds pass. Five focused operational backend cases exercise current MFA authority before/after sampling, anonymous aggregate projection, community isolation, heartbeat expiry/recovery, private retention/erasure counts, bounded Redis failure and reconnection. A source regression verifies that stalled telemetry returns without repeating a completed user operation.

Final Docker **e1bcc39e** passes **54 INTL / 50 CN** groups with all **43 migrations**, including the actual worker, staff API and separate monitor process. Thirty current API, twenty-eight migration-image and twenty-three recovery files and all three admin assets match read-only, network-disabled hashes. Independent cleanup confirms zero owned disposable resources. The final compiled local probe returns OK, and saved preview history remains unchanged with simulated AI. Cached OS/runtime bases were reused; there was no new database migration/restore drill, browser/visual acceptance, real provider/device call, external alert delivery, public release or regulatory acceptance. Private evidence is `.data/operations/verification.json`.

2026-10-24 optional delivery verification: **351 source / 314 backend** checks and types/builds pass. Docker **78b42c27** passes **62 INTL / 58 CN** groups, including compiled SQLite restart recovery and actual signed local TLS fixture delivery. The separate compiled `once` probe ignores nonexistent alert credentials and opens no queue, with networking disabled. No real receiver is commissioned. See [OPERATIONAL-DELIVERY.md](OPERATIONAL-DELIVERY.md).
