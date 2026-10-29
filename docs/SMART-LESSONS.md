# Private smart-cube learning

Implemented 2026-10-20 for ordinary 3×3 lessons, including published shorter guides. The native lesson screen, bounded connection bridge, authenticated API, deterministic verification, private history/progress, export/deletion and encrypted-restore fixtures are connected. **Every real model/platform remains disabled.** No physical device was connected, no hardware report was promoted and no public release was enabled.

Guided 3×3 first solves now share this native bridge and authority boundary. Ranked smart play remains unfinished. Both learning workflows remain unavailable on real hardware until model/platform acceptance.

## Connection and practice

After physical acceptance and a reviewed paired client/server release, the learner selects an exact supported model and a foreground Bluetooth candidate. The existing native transport verifies required GATT channels. GAN uses its actual supplied/discovered address for transport decoding; that address and vendor protocol parameters never enter the learning API.

The app first obtains a legal device position and displays the course's fixed top/front center reference and starting setup. It creates a server practice only when the learner explicitly confirms that the physical cube matches the exercise. If the cube changes during that request, the connection is closed rather than starting from an uncertain position.

The teaching reference is derived from the saved exercise's actual centers. Hardware positions and outer face turns are projected into that fixed reference without relabeling physical colors or inferring a hold from gyroscope data. It remains fixed for one connection; a hold/reference change requires stopping and synchronizing again.

Received turns are uploaded in batches of at most 50. The native bridge keeps at most 100 pending turns, sends exact prefix positions for split batches and maintains one request in flight. Only a matching independently reported position can mark the last prefix independently checked. GAN counters wrap at 255 and must advance once per event; recovered runs are bounded to six recovered turns followed by a current turn. Application sequences must be contiguous, and relative receipt order cannot go backward.

For finishing, the learner stops turning and refreshes the device position. The server reconstructs the original saved setup plus received teaching turns, checks the matching device position/counter and solved state, then stores completion and the next review in one current-authority transaction. The selected guide is a version-bound teaching snapshot; received moves are stored separately. Replaying the same completion cannot grant another repetition.

GoCube/GiiKER in these adapters do not expose a hardware move counter. Their received turns and independent positions can agree on net state without proving every intermediate turn arrived. History identifies this limitation and awards no turning-speed statistic. GAN counter consistency is also **not remote hardware attestation**. Client reports are bounded and cross-checked, but do not establish an authentic physical competition result.

## API and lifetime

| Route                               | Purpose                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| POST /v1/courses/:id/smart-sessions | Current published 3×3 drill/version, declared model/platform and optional published guide ID.         |
| GET /v1/smart-lesson-sessions/:id   | Current learner's private saved practice, fixed reference and connection state.                       |
| POST /v1/smart-lesson-sessions/:id  | Strict confirm, turns, finish or interrupt command with current revision and server connection epoch. |

Creation accepts model, ios/android, course version and optional alternative ID. The server supplies a fresh random epoch. Confirmation supplies the complete hardware position and available counter. A turn batch supplies application sequence, outer turn, relative receipt order, available counter and recovered flag, plus its end position/counter and independent-state flag. Unknown fields, raw address additions, unsupported puzzles, stale revisions/epochs, gaps, repeated events, backward time and inconsistent positions are refused.

All mutations use [current learning authority](LEARNING-AUTHORITY.md), including guardian/full-session checks after database waits, exact course revision/publication and practice deadlines. One owner lock also serializes cancellation against completion. A practice has the existing seven-day maximum and a **30-second connection lease**; an idle foreground bridge refreshes contact every ten seconds. At most 500 received turns and 100 starts per account/day are accepted, with bounded command and global request limits.

Backgrounding, disconnect, unrecoverable tracking error, account/region change or API failure closes the native connection and attempts to interrupt that exact saved epoch. An in-flight timed-out write may have committed, so closure reads the original practice before interrupting its current revision. Old callbacks cannot publish into another view or connection. A lost network may prevent that final update; the server lease then expires, reads report interruption and a new start seals the old active row. Recovery starts a fresh synchronized exercise with a new ID/epoch, preserving the interrupted history rather than guessing missing turns. A checkpoint already committed before interruption remains saved.

## Data and gates

Migration 38 adds nullable LessonSession.smart and smartSeenAt, constrained to smart 3×3 rows, a bounded allowlisted context and an owner/input/status index. Context contains declared model/platform, fixed center reference, random connection epoch, next application sequence, last counter/relative receipt order, recovery-run state and continuity flags. Original algorithm, selected guide/version and received turns retain their separate fields. Historical virtual/scanned records retain null smart fields.

Confirmed practice is saved privately in the same regional account as other learning history and included in owner/authorized guardian exports. Deleting the account removes these records through the existing removal workflow and backup-expiry process. Battery readings, addresses, raw Bluetooth notifications and transport keys stay in device memory; color-only positions are submitted for reconstruction. The bilingual privacy draft describes this inventory. No smart lesson data is sent to AI.

SmartLessonAccess checks the compiled model, physical acceptance, learning gate and accepted platform on every non-interruption command. The native factory independently checks the same catalogue, and the screen also requires the regional API catalogue. All current entries remain false with empty accepted-platform lists. A database setting or approved report alone does not activate hardware.

The positive integration tests use a capability override **only inside their isolated test process**, with real authentication, loopback HTTP, PostgreSQL and the production controllers/verifier. No test override, activation endpoint or synthetic hardware setting is shipped. Normal regional routes continue returning 403 for every unaccepted model/platform. This is distinct from the local-only development device-test panel.

## Verification and remaining acceptance

Source checks cover every 3×3 shorter guide for all three model formats, rotated teaching centers, counter wrap, sequence/state/recovery rejection, bounded prefix uploads, delayed creation cancellation, stale events and explicit full-state reads overtaken by notifications. Backend checks cover actual authenticated HTTP from the native bridge to stored progress, all model formats, private ownership, replay rejection, lease recovery, guardian/login revocation after real waits, SQL context constraints, export and account erasure. Regional compiled-container and sealed encrypted-restore results are recorded in [STATUS.md](STATUS.md).

Web/iOS/Android exports establish bundling, not native OS, permission, radio, battery, foreground/background or poor-network behavior. Real model/firmware/phone acceptance, guided first-solve smart integration, ranked recording/attestation, operator custody, independent security review and the original regional/store/legal requirements remain open.

## Guided smart first solves

The 3×3 first-solve route accepts smart input explicitly. The learner confirms the actual unsolved hardware position; the deterministic worker generates all thirteen stages using a fixed white-down/green-front teaching reference (D/F). This position is learner supplied, so it carries no generated-scramble provenance. Other smart puzzle sizes are unsupported, with explicit virtual/scanned choices.

| Route                           | Purpose                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| POST /v1/smart-first-solves     | Create from current published course version, declared model/platform, legal raw hardware faces and available counter. |
| GET /v1/smart-first-solves      | Private latest twenty summaries and current active connection ID.                                                      |
| GET /v1/smart-first-solves/:id  | Owner's saved guidance, stage, actual state and connection context.                                                    |
| POST /v1/smart-first-solves/:id | Strict turns, checkpoint, replan or interrupt command with current revision and epoch.                                 |

Each checkpoint requires the matching independently refreshed hardware state and counter, the deterministic stage goal and current course/authority/lease. The final checkpoint additionally requires a solved cube. Progress is awarded once only after all thirteen checkpoints. Normal manual moves/reset/rescan/checkpoint/download handlers reject smart rows. Owner cancellation can end the row without credit.

Replanning uses the current verified position, resets the guidance cursor and retains cumulative received turns, the application sequence, hardware counter and connection epoch. Planning runs outside learning locks; the transaction rechecks authority, publication, version, state and deadlines before accepting the result. Physical moves received during a checkpoint/planning request remain buffered for the next revision. An incorrect or lost stream requires a new connection rather than a fabricated continuation.

Guided sessions allow at most 2,000 received events, 500 reduced moves within one stage and 100 checkpoint/replan records. Creation is limited to twelve per day and replanning to twenty per hour. The existing ordinary drill limit remains 500 events. Both retain the thirty-second connection lease and ten-second idle contact refresh.

The next stage includes bilingual explanations, state-based next-turn guidance and a read-only animated preview cloned from the actual position. Preview turns never enter telemetry or award credit. A physical move, backgrounding, navigation or account change cancels the preview. Reduced-motion settings skip the animation delays; native presentation still needs device acceptance.

Migration 39 adds nullable GuidedSolve.smart and smartSeenAt with a bounded smart-only context and owner/input/status index. Virtual/scanned history retains null fields. Actual moves, plans, checkpoints and connection context stay private, are included in authorized account/guardian exports and are removed with the account. No device address, transport key, battery history or raw notification is stored here or sent to AI.

Synthetic tests cover the bridge through authenticated HTTP and PostgreSQL across all thirteen stages for each model format, half-turn packet splitting and counter wrap, independent-state rejection, replay/ownership/manual bypasses, actual replanning, authority/course changes during worker planning, real row-lock deadline/revocation checks, export/deletion and the unchanged ordinary drill cap. These establish software behavior only. All hardware gates remain off; ranked telemetry, native radio/camera acceptance and the full original release requirements remain outstanding.
