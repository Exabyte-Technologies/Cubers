# Cooperative Relay

Play → Cooperative Relay creates a casual virtual room for 2–8 teammates. All four puzzles are supported. Each teammate completes one full solve from a fresh server-generated scramble, in a fixed server-owned order. The roster preview is provisional until the host starts. No player can take another leg, repeat their own attempt, submit someone else's moves or advance the team with an unverified solve. Physical scans cannot provide continuous move telemetry; smart models remain disabled pending real hardware acceptance. Relays do not enter public rankings.

The bilingual room view shows numbered legs, which leg is yours, completed legs, the current inspection/solve and the exact verified solve subtotal. It shows a team total only when every leg is approved. Totals include server inspection penalties and exclude inspection and handoff waiting, so they are not elapsed race time or official competition results. The progress object has no account or attempt identifiers. Existing room membership controls still protect the room, results and each owner's saved attempt.

## Durable handoff and interruption

The room row serializes attempt admission, active relay writes, verified completion, handoff, host ending and realtime interruption. Active writes recheck the current user, full session and learning permission after acquiring the account lock. A verified attempt and the next leg commit in one database transaction. Concurrent retries cannot issue two attempts or advance twice. A failure while writing the handoff rolls back the attempt approval.

An authorized room refresh checks the approved contiguous prefix under the room lock. It can repair a prior release's approved-attempt/separate-handoff gap without repeating a solve. A non-prefix approval, impossible observed round, unsupported legacy input or failed leg closes the active relay rather than granting a team result. This is ordinary application-state recovery, not certification of arbitrary manually altered database rows.

HTTP interruption and realtime disconnection during inspection/solving stop the team session. Other active/prepared attempts are interrupted in the same closing transaction. A finished player's later disconnection does not stop the next leg. Reopening an in-progress saved attempt interrupts it rather than resuming continuity; a merely prepared, untouched attempt can still be opened. API restart marks ongoing attempts interrupted, and startup plus bounded maintenance reconcile affected relays. Authorized room refresh also reconciles them. The host can explicitly end an open/active relay; the app asks before ending it for everyone. Other players cannot use that host action. Finished rooms cannot restart.

Already approved legs remain in the member-only room record. They do not enter the existing race/daily personal-best, session-statistics or replay views. Account export/deletion and shared-room identity removal keep their existing behavior. No new personal identifiers, evidence files, advertising or AI calls are introduced.

## API and realtime

- `GET /v1/rooms/:id` includes `relay` progress for relay rooms and the current viewer's `ownAttempt`. It repairs legacy relay handoff/terminal state before returning a coherent locked view.
- `POST /v1/rooms/:id/relay/end` requires current host membership and current learning/session access; it closes an open or active relay and interrupts unfinished attempts.
- Existing attempt endpoints and WebSocket `attempt.moves` continue to reconstruct validated puzzle turns. `room.state` and authorized refresh include the same progress.
- Only ready players see the preparation action. Delayed HTTP loads are ignored after a newer room delivery, category/account navigation or unmount. Account/community changes remount the room view.

No schema migration was needed: the fixed roster, round and persistent attempt statuses already provide the required state. Deploy matching API, worker and mobile code. The current deployment still supports one realtime API process; this does not add multi-process Socket.IO coordination.

## Evidence and limits

The complete source suites passed **165 unit / 162 integration** checks. New source checks cover numbered private progress, exact subtotals, all four puzzles through actual HTTP move verification, concurrent preparation and finishing, transactional handoff failure/rollback, legacy repair, host-only ending, captured expired-session denial and real database disconnect persistence. Some duration/interruption fixtures use the reserved test database; they do not establish native timing or camera continuity. Fresh web/iOS/Android bundle exports and regional Docker evidence are recorded in [STATUS](STATUS.md) and [Docker verification](DOCKER-VERIFICATION.md).

Browser inspection remains denied and has not been bypassed. Native visual, screen-reader, touch/background and poor-connectivity acceptance remain required. Real smart input, broader native acceptance and production game/attestation/operator approvals remain unfinished. Mainland game gates and public release approval stay off. No real AI, hardware activation or public deployment was used.
