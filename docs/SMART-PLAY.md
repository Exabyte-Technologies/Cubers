# Smart-cube game attempts

Implemented behind disabled model/platform gates. **No actual model is accepted or enabled.** Production ranking still refuses activation until real app attestation is integrated. Synthetic checks establish software behavior, not radio/camera compatibility, hardware authenticity, continuous physical history or production anti-cheat certification.

The native room screen connects the existing GAN 356 i3, GoCube Edge and GiiKER i3S adapters to server-bound 3×3 attempts. It supports race, daily, pattern, sprint and casual cooperative relay room workflows. [Scheduled 3×3 smart competitions](SMART-COMPETITIONS.md) now use this same verifier and native bridge, behind the unchanged hardware gates. Casual mixed-input rooms remain unfinished; each current room has a fixed input category. Smart replay remains gated separately.

## Synchronization and integrity

The server issues the attempt ID, single-use nonce and applicable community-generator scramble. The physical cube must match that scramble before inspection; sprint starts solved. The frame stays white-up/green-front (U/F), without changing colors or inferring a hold from a gyroscope. Ranked recording must start before scramble confirmation, and continue through inspection, solving and final presentation. Existing private video processing, attempt binding, review, appeals and retention apply.

Binding a fresh attempt creates a random connection epoch and stores the model/platform, frame, initial hardware counter where available and zero application sequence. A matching independent state is required to inspect, start and finish. Moves before solve start, sequence gaps, counter gaps, excessive recovery or inconsistent positions interrupt the exact current attempt. Stale nonce, revision or epoch commands are rejected without disturbing a newer revision. The virtual move endpoint refuses smart submissions.

Every smart mutation uses current regional session and guardian authority, room membership, attempt revision/status and game-service/model gates. Account and content locks serialize changes; deadlines are checked after waited operations and staged writes. The connection lease is thirty seconds, refreshed every ten seconds while idle. Inspection expires at seventeen seconds, with the existing two-second penalty after fifteen; solving is limited to one hour. Interrupted connections cannot resume or rebind the same attempt. Reopening, changing account/region/permissions, backgrounding, radio or socket loss ends native work and attempts durable interruption. Server leases cover an unavailable final request.

The bridge keeps at most one request in flight and one hundred pending turns, uploading prefixes of at most fifty with exact prefix states. It retains the original epoch and counters throughout inspection and solving. Up to ten thousand received events are accepted. GAN counters wrap at 255 and recovered runs are bounded. GoCube/GiiKER positions and received turns can establish matching net states without proving that every intermediate turn arrived. Their history does not earn turning-speed statistics. Server receipt timing bounds the solve; individual uploaded move timestamps are not presented as precise physical turn timing.

At finish the server reconstructs the issued scramble and received moves, checking solved state, pattern target or exact sprint sequence. Casual smart attempts can finish as approved private results. Ranked smart attempts become AWAITING_EVIDENCE, then PROVISIONAL only with complete, attempt-bound processed video. They gain category ranking credit only after an independent human reviewer approves the evidence. Reviewers see the model, received count and continuity limitation; telemetry does not replace viewing the complete footage. Production ranked play remains disabled regardless of a database device report.

## API and storage

| Route                             | Request or purpose                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /v1/smart-attempts/:id        | Owner's private attempt, revision, state of connection and received moves.                                                                                 |
| POST /v1/smart-attempts/:id/bind  | Current nonce/version, accepted model/platform, complete raw hardware faces and available counter.                                                         |
| POST /v1/smart-attempts/:id/turns | Strict turns command: nonce/version/epoch, up to fifty received events, end faces/counter and independent-state flag. Empty batches refresh state/contact. |
| POST /v1/attempts/:id/inspect     | Existing attempt-bound inspection with smart synchronization/lease checks.                                                                                 |
| POST /v1/attempts/:id/start       | Existing server solve clock with current smart state and inspection deadline.                                                                              |
| POST /v1/attempts/:id/finish      | Existing puzzle/mode result verification with independent smart state.                                                                                     |
| POST /v1/attempts/:id/evidence    | Existing private ranked recording binding and provisional transition.                                                                                      |

Migration 40 adds constrained nullable Attempt.smart and smartSeenAt fields. Unbound and historical virtual/scanned attempts retain nulls. The context excludes Bluetooth addresses, vendor keys, battery readings and raw packets. The existing regional account and authorized guardian exports include private attempt context; account deletion removes it. Telemetry is not sent to AI. Bilingual privacy text describes the data and limitations.

Normal API and native factories check independent playEnabled/playPlatforms gates, in addition to enabled and physicallyTested. All entries remain false with empty platform lists. Learning acceptance never enables game use. Test subclasses are injected only into isolated test processes; no activation endpoint, environment override or fabricated hardware acceptance ships in the application.

## Acceptance still required

Source and backend checks cover all three model formats through authenticated HTTP, the native upload bridge, counter wrap, split batches, early/gapped/forged stream interruption, replay and virtual bypasses, real lock-wait permission/deadline rejection, all five room modes, ranked evidence binding/review and export/deletion. Docker and encrypted-restore evidence is tracked in STATUS.md.

Native permissions, radio notifications, camera/recording continuity, foreground/background behavior, poor connectivity, accessibility, battery and actual firmware variants still need physical iOS/Android acceptance. Browser visual inspection was not performed. Scheduled smart physical/native acceptance, casual mixed-input rooms, smart replay, production app attestation and the complete original release requirements remain unfinished. All real hardware gates stay off.
