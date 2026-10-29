# Downloaded first-solve guidance

An active first-solve practice can download the remaining validated plan **between checkpoints, before the next turn**. This works for virtual and scanned 2×2, 3×3, 4×4 and Pyraminx practice. The Downloaded lessons screen distinguishes a checked-state copy from ordinary teaching notes.

The download contains the published bilingual course, the checked color-only starting state, remaining turn groups/checkpoints, input type and source practice identifier/version. It replaces the previous download of that course. It uses the existing account/community/session binding, private cache and removal actions; no second credential store or background download is added.

## Access and server behavior

`POST /v1/first-solves/:id/download` accepts only `{ version }`. It requires the owner, an active full login session, current learning/guardian permission, an active unexpired practice at the requested revision and the same currently published course revision. Account locking serializes the snapshot with confirmed moves and checkpoints. Session validity is rechecked after obtaining the lock. Pending turns or a changed checkpoint require reloading/completing the checkpoint first.

The response is private/no-store. The access deadline is the earliest of 24 hours, the login-session expiry and the source-practice expiry. Downloads are limited to 60 per account/hour. They do not advance the source session, create practice history or award course credit. The downloaded copy is a frozen reference: later online turns, replanning or cancelling the source practice do not rewrite that copy. Current account/session/permission denials and course publication/version refresh remove local access through the existing library rules; disconnected revocation remains bounded by the lease.

`DownloadedLesson` schema 1 adds an optional strict `guidedPractice` field. Ordinary notes/drill downloads keep their existing shape. The snapshot requires the correct suffix of the original six/thirteen/thirty-two/twelve-stage method, matching puzzle/lesson, bounded exact move groups and valid four-puzzle notation. 4×4 wing targets include a complete permutation and corner parity. Total turns are bounded at 2,500 for 4×4 and 500 for the other puzzles. Existing 200-lesson/600,000-character library and native file limits apply.

## Local coaching

Opening reconstructs every remaining checkpoint with the deterministic puzzle engine, verifies its goal and the final solved state, and builds a bounded prefix index. Reconstruction yields to the event loop after at most sixteen turns and each checkpoint, accepts cancellation and has a fifteen-second admission deadline. This is linear replay of a downloaded plan, not a planner search on the mobile UI thread. Physical-device responsiveness still requires acceptance testing.

The reader shows the current checkpoint's bilingual explanation, reference frame, check, labeled 3D model, manual/next-turn controls, optional full sequence and user-paced turns. A virtual stage can be undone/reset and advances only at the expected checked state. A scanned stage requires an initial scan and a fresh full scan at each checkpoint; confirmed turns alone cannot advance it. The model never claims to see hidden physical turns.

Physical resume checks the scan against the admitted path's exact states, including internal move prefixes. It chooses the latest matching prefix, so reopening can continue without saving local activity to disk. Zero-turn stages and repeated states are handled by the same rule. After backgrounding, physical controls require a new scan. If a valid scan has a different state, the app asks the learner to check orientation/colors or reconnect for a new state-specific plan. It does not invent an offline solution or skip a mismatched checkpoint.

Local activity lives in memory and is discarded on leaving the screen. A periodic library refresh with the same frozen download does not reset active practice. Expiry, account/community/session changes, detected permission withdrawal, download replacement/removal and screen changes close access or discard the active controller. No offline completion queue, delayed upload, AI request, competitive result or server learning credit exists. Finishing locally is labeled accordingly; reconnect for a new server-verified practice.

Photos stay within the existing on-device scanner and are discarded after color reading. Only the frozen color-state plan and source metadata are cached, alongside the ordinary authored course and account identifier. The English and Chinese privacy documents describe this additional cache content and its lifetime.

## Evidence and acceptance

Source checks cover all four complete downloaded plans and partial suffixes; physical initial/checkpoint scans, internal-prefix and solved-state resume, background suspension, wrong-state denial, immutable admitted state, malformed order/notation/wing references, geometric corruption, cancellation and expiry. Real API tests cover all four plans, private response headers, unchanged online sessions/progress, ownership/regional boundaries, publication and revision changes, checkpoint restrictions, source/session expiry capping, guardian withdrawal and actual lock-wait session revocation.

Disposable regional Docker checks download all four plans through the compiled API, complete their remaining stages locally, compare unchanged source sessions/progress and verify both privacy languages. Type checks and web/iOS/Android exports validate contracts and packaging. These checks do not prove native camera lighting/orientation, permission/background behavior, storage eviction, large-text/screen-reader usability or low-end-device performance. Fresh browser UI inspection remains blocked by the current browser security policy. Real-device offline acceptance remains a release requirement.
