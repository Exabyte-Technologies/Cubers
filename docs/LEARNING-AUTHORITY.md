# Current learning authority and expiry

Implemented 2026-10-20. Ordinary drills, scanned checkpoints, placement checks and guided first solves now use the same current-account transaction boundary. The separately connected [ordinary smart-cube drill workflow](SMART-LESSONS.md) now uses this same boundary. All real hardware activation gates remain off.

Each operation locks the learner and linked guardian accounts in a stable order, then consent and the current login session, before locking course content or writing learning data. It checks verified email, region, deletion state, full login scope, login expiry and current learning/guardian permission both at admission and after staged work. The transaction rejects captured request permissions when the current account or session no longer qualifies. This learning capability does not enable regional social/game features or change any release approval.

| Operation | Additional saved-state checks |
| --- | --- |
| Virtual drill completion / scanned session creation | Current published course and exact loaded version; deterministic reconstruction remains required. |
| Scanned moves / checkpoints | Owner, input, optimistic revision, active status, current published course and seven-day practice deadline. |
| Scanned cancellation | Same learner/account lock order as completion; an already completed session stays completed. |
| Placement start / answers / cancellation | Current full login, bounded current attempts, saved revision/status and check expiry. Starting also locks the referenced courses before checking publication. |
| Guided creation / moves / reset / rescan / checkpoints / cancellation | Current full login and guardian authority, owner, saved revision/status, original expiry and exact current course version. |
| Ordinary / guided downloads | Current account, consent, full login and locked published course; guided packets also require an active unexpired saved checkpoint. |

`learningWrite` registers each existing practice deadline when its row is read and checks it again after the operation's waits and staged writes. If a login or practice expires while a course/row is blocked, the transaction rolls back session changes, answers, checkpoint records and progress together. Expired rows need not be rewritten as a side effect of a denied action; existing read views report expiry, and the normal start/cleanup paths handle their stored status. Request rate-limit consumption is independent of this rollback.

Cancellation and completion serialize under the same account lock. If cancellation commits first, a later checkpoint sees the cancelled status and fails. If completion commits first, cancellation leaves that completed record and its single progress update intact. An admitted final checkpoint cannot read an active session, wait for a course, then overwrite an intervening cancellation.

Solver and scramble generation stay outside these transactions. Course and account/session authority is checked again before their result can alter saved practice. Tutoring retains its separate before/after-provider checks described in [LESSON-LIFECYCLE.md](LESSON-LIFECYCLE.md). No database locks are held across provider generation.

Downloads preserve both the legacy packet format and the explicit shorter-guide extension. Their expiry remains bounded by the login/offline lease and, for guided packets, the saved practice deadline. The new checks govern issuing a packet; they do not remotely erase an already offline device. Existing account/session-bound access, reconnect validation, expiry and cleanup remain described in [OFFLINE-LEARNING.md](OFFLINE-LEARNING.md).

Four new regression cases failed against the preceding implementation: login expiry during a real course lock wait, scanned practice expiry during a real course lock wait, revoked login scope on placement creation, and placement expiry during a blocked row update. Those cases pass after the change. Additional checks cover every ordinary write/download with a captured revoked login, guardian eligibility revocation while ordinary/guided/placement/download actions genuinely wait on the guardian lock, guided expiry, and cancellation versus a blocked final scan. They inspect stored rows and progress after rejection, not only HTTP status. Regional compiled-container checks exercise actual course-lock expiry rollback and revoked placement scope. Final counts and runtime results are in [STATUS.md](STATUS.md).

Physical/native acceptance of the connected ordinary smart-drill workflow, guided first-solve/ranked smart integration, signed native releases and original operator/legal approvals remain unfinished. These authorization checks do not establish complete security or regulatory approval.
