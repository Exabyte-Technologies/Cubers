# Device test evidence and independent review

Implemented 2026-10-19. The administrator's Device test evidence page records tests for GAN 356 i3, GoCube Edge and GiiKER i3S. Records are persistent regional operational data; no hardware test or report is seeded. All models remain disabled in the public catalogue, native production factory, lesson sessions and games. An approved report does not change that catalogue or create an activation setting.

## What a report establishes

Each report records one declared cube/firmware, phone platform/model, OS, app build identifier, source revision and tested artifact SHA-256. It distinguishes actual physical evidence from synthetic/software evidence. The original test time determines a hard expiry no later than 365 days later. An edit may shorten expiry but cannot extend it.

Evidence stays in the operator's separate protected regional case register. Cubers records case/custody identifiers and the SHA-256 of the evidence bundle. It does not upload, open, fetch, authenticate the custody of or independently verify those files. The independent reviewer must inspect the protected originals and compare hashes and the actual tested configuration. References accept bounded identifiers, not URLs or paths. Exclude names, faces, audio, serial/MAC identifiers and credentials from the report and the test material. Actual regional custody, evidence access and retention acceptance remain operational requirements.

Three scopes make the coverage explicit:

| Scope | Required observations |
| --- | --- |
| Transport | Permission denial/retry, Bluetooth unavailable, exact/unsupported model selection, scrambled initial synchronization, face/direction/half/fast turns, battery or honestly unknown status, missing/corrupt moves and history limits, disconnect/recovery, navigation/background cleanup, account/community/pending-operation cleanup |
| Learning | All transport checks plus physical teaching-frame mapping and server-bound lesson telemetry/interrupted recovery |
| Ranked | All learning checks plus continuous recording/evidence binding/review and server-verified platform attestation/forged-result denial |

A passed transport test cannot imply lesson or ranked acceptance. GoCube/GiiKER observations must describe their history limitations; this workflow does not turn an application sequence number into a hardware counter. Every completed check needs actual observations/reproduction notes. Unrun/failed required checks, unknown firmware and synthetic provenance prevent physical acceptance. Actual truth of a staff declaration cannot be established from text or a digest alone.

## States and staff authority

Administrators create drafts, edit, submit one exact version, withdraw, or independently approve/reject a submitted version. Every write has an expected version and reason. Editing any state returns it to draft and clears the prior decision. Competing changes serialize; only one request can change the same version.

Every content contributor remains ineligible to approve or reject that report, even after their early content revision has left the twenty-version history. Up to twenty contributors are retained. Reviewers make explicit evidence-inspected, physical-device, exact-configuration and independent-review confirmations. A rejection needs a reason. Moderators can read reports and history but cannot write or review.

The server acquires the regional write lock before rechecking the account and full session. Account and session share locks serialize against factor/role changes and session deletion. It checks current verification, regional staff role, MFA factor generation, full MFA session, session expiry and report expiry. A revoked session, changed factor or expired report cannot survive a lock wait. Reads are private/no-store and expose no contributor/reviewer IDs.

## Retention, export and deletion

The library is bounded to 500 regional reports, twenty recent revisions and twenty content contributors per report. Writes are limited to 60 per staff account/hour. The staff library pages twenty summaries and loads detailed observations separately, with model/status filters. Expired records are unavailable through the API. Maintenance runs only after recovery-journal reconciliation, deletes up to 100 expired reports per pass and cascades their revisions and contributor associations. Physical cleanup latency/alerts need operator acceptance.

Account exports include metadata for associated reports without other staff identities or protected evidence content. Current reviewer/contributor associations use database `ON DELETE SET NULL`; content snapshots omit those account IDs. The existing account-removal worker clears audit actors/targets. Operational test descriptions must exclude personal information. The English and Chinese privacy drafts describe these records and their retention; actual legal/operator review is still required.

Migrations 32 and 33 add the tables and enforce decided-state review/version constraints, without modifying existing data or seeding tests. The separate constraint correction preserves the applied table migration.

## API

All routes require current regional staff MFA:

- `GET /v1/admin/device-tests?model=...&status=...&cursor=...`
- `GET /v1/admin/device-tests/:id`
- `GET /v1/admin/device-tests/:id/history`
- `POST /v1/admin/device-tests` with content/reason
- `POST /v1/admin/device-tests/:id/content` with content/expectedVersion/reason
- `POST /v1/admin/device-tests/:id/submit` or `withdraw` with expectedVersion/reason
- `POST /v1/admin/device-tests/:id/review` with exact version, reason and decision; approval requires literal confirmations

There is no device activation endpoint. Future activation still requires accepted physical iOS/Android configurations, physical acceptance of the implemented reference mapping and ordinary smart-drill telemetry, completion of guided first-solve/ranked smart integration, recorded-match integrity/attestation, independent operator approval and the original release/security/legal gates. These records prepare the review process; they do not replace [physical acceptance](SMART-CUBES.md).

## Verification boundaries

Automated fixtures exercise reported declarations and independent-review transitions in disposable databases only. Even a fixture that declares a physical test explicitly says its evidence is synthetic; it is never hardware certification. Source/integration checks cover contracts, scopes, concurrency, current authorization, retention, exports and real foreign-key erasure. Container and encrypted recovery checks establish runtime/persistence behavior. Fresh rendered admin, accessibility, actual evidence-register custody and physical hardware acceptance remain unverified.

Final local evidence (2026-10-19): 189 unit / 187 integration checks passed, with current workspace types, API/admin builds and final web/iOS/Android exports. Docker run `866ee38b` passed 37 INTL / 34 CN groups; real encrypted recovery `069f6bae` passed 15 groups per region on 33 migrations. Both restored targets stayed sealed. All owned containers/networks/volumes and six inherited anonymous volumes were removed and independently confirmed absent. The refreshed preview is healthy in mock AI mode, has 149 authored courses and zero device report/revision/contributor rows. No real cube was tested or enabled. See [Docker verification](DOCKER-VERIFICATION.md) and [remaining full-plan work](STATUS.md).
