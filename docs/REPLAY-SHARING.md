# Anonymous solve replay sharing

Owners can prepare a share from a complete approved virtual or smart race/daily solve. The request freezes an anonymous, validated snapshot. The owner explicitly acknowledges what is disclosed before creating a link. A link can be forwarded to eligible accounts in the same regional community; viewing requires login and never grants room access, learning credit or ranking eligibility.

The snapshot contains puzzle/input, scramble, received turns, saved server duration, sharing date and any smart model/continuity limitation. It replaces the private attempt identifier with a separate sharing identifier and replaces the source date with the sharing date. Names, account identifiers, recordings, opponents, connection epochs/counters/reference/platform, original attempt credentials and event receipt times are excluded. Counterless smart streams remain labeled received turns only, with no exact physical turn count or turning speed claim. Scanned attempts cannot produce a move replay.

## Owner, guardian and moderator flows

Profile history links to the sharing request screen. Adult owners with current sharing eligibility can deliberately create a link. Teen requests need independent staff review. Younger children also need their current verified guardian to inspect and approve the exact snapshot before staff review. Guardian and moderator screens provide bounded step-through puzzle previews, telemetry limitations and a confirmation. Approval binds the current revision and packet digest plus a two-minute preview receipt scoped to that actor, role and full session. Reviewers require current staff MFA and cannot review their own or their linked child's request as independent staff.

Requests start without a link secret. A READY request still needs its owner's explicit publish action. Creating a fresh link invalidates the previous key; only its SHA-256 hash is stored. Owner link secrets stay in transient interface state and are cleared on navigation/account changes and backgrounding. Links last no more than seven days. Owners can withdraw pending/ready requests; current guardians or independent staff can reject or withdraw eligible reviewed requests. Closed decisions cannot revive, and source changes require a fresh request and review.

Invitation continuation preserves the bounded share identifier, secret and community across sign-in/registration flows. It cannot change the detected community or inject a destination. Opening an invitation does not automatically fetch the replay. The recipient deliberately selects View shared replay. Shared playback drops content on backgrounding and expiry; reloading rechecks access. Withdrawal stops new loads, while copies already viewed cannot be recalled.

## Server authority and privacy

Geometry validation happens in the existing bounded replay worker before database locks. Creation, preview, approval and publishing then recheck current account/guardian/session authority, immutable source fingerprint, snapshot digest, revision and expiry under ordered locks. Recipient reads recheck both accounts, current owner sharing eligibility, guardian conditions, token revision, source state, regional social/game gates and blocking after asynchronous validation. Expiry/session changes while waiting for content locks roll back publication. Token secrets and source identifiers are not accepted as arbitrary replay content from a client.

Migration **42** adds the sharing table without altering existing records. Ownership/source/snapshot/digests/review classification/creation/expiry are immutable. Database checks bound snapshot size, secret hashes, review proofs, seven-day windows and terminal transitions. Limits allow ten active and thirty recent requests, with per-account preparation, preview, publication, review and recipient-read limits.

## Withdrawal, erasure and recovery

The independent privacy journal now supports REPLAY_SHARE_WITHDRAWAL. A durable withdrawal still applies if its database transaction rolls back or an older backup is restored. Current guardian consent withdrawal cancels prior child shares and clears keys. Restore clears every replay-link key before leaving the target sealed, alongside existing session/token invalidation; commissioning does not silently revive old links.

Expired links are refused without relying on maintenance timing. The worker expires requests, clears keys and removes sharing records after thirty days, redacting related review audit targets/details. Owner/current-guardian exports include records without secret hashes, reviewer identity or private source fingerprints. Source/account deletion cascades to the snapshot; erasure also redacts related audits. Database backups follow the existing expiry and sealed-recovery procedures.

## Acceptance limits

Source and authenticated tests cover strict contracts, invitation continuation, all four virtual puzzles, all three synthetic smart formats, anonymous packets, exact guardian/staff approvals, key rotation, blocking, withdrawal, expired-session/expiry lock waits, independent journal replay after rollback, export and erasure. Container checks exercise compiled sharing and moderation workflows in both regions. The encrypted restore drill checks frozen snapshots, key invalidation and a withdrawal recorded after capture.

See STATUS.md and DOCKER-VERIFICATION.md for final run evidence. Native visual/accessibility, cold-start/email continuation, share-sheet and real-device acceptance remain separate release checks. Browser inspection has not been performed. No real AI, real Bluetooth device, hardware activation, app attestation, public sharing event, store publication or legal approval is implied. All tests use isolated synthetic accounts and local services.
