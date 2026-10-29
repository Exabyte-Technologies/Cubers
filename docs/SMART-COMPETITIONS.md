# Scheduled smart-cube competitions

Scheduled competitions now connect 3×3 smart input to the existing native game bridge, shared community-generated scrambles, private attempts, recorded evidence, exact scoring and reviewed score sharing. **All real model/platform gates remain off.** Production ranked play still refuses activation until app attestation is integrated. Synthetic verification does not establish hardware authenticity, native camera/radio compatibility, production timing accuracy or release approval.

## Schedule and participation

Administrators can prepare a private bilingual 3×3 smart competition draft while hardware acceptance is pending. Other smart puzzle sizes are rejected. Publication, registration and attempt issuance check the independent smart-play model/platform catalogue and regional game-service gate. Normal regional APIs refuse these operations while no model is accepted; no WCA set is generated or registration issued by a refused publication. The admin screen labels smart input separately from physical scans and disables publication while the server catalogue has no accepted game hardware.

Players see the smart category, current availability and native-device requirement before registration/preparation. Registration acknowledges private results. A supported iOS/Android platform and accepted smart cube are needed to attempt a slot. Existing private results can still be opened without allocating a replacement slot. Drafts, history, withdrawal and sharing controls do not enable hardware. Each entrant/round/slot retains one private room, fresh nonce and its own synchronization epoch; interrupted attempts are never rebound. Slots remain ordered and retries do not mint additional attempts.

All entrants receive the same published WCA community-generator scramble for the same slot. The target is confirmed from the actual device state in a fixed white-up/green-front frame. The native room screen then uses the same bounded bridge and server verifier as [smart room games](SMART-PLAY.md). Recording starts before scramble confirmation for ranked attempts and continues through inspection, solving and final presentation. Reopening a bound setup, active inspection/solve or pending recording interrupts it rather than restoring a clean connection.

## Authority and deadlines

Smart schedule writes recheck current full sessions, account/guardian eligibility and staff MFA under the shared transaction boundary. Publication rechecks hardware and authority after worker generation. Registration and attempt issuance recheck their clocks after staged writes. No database allowlist, report or deployment flag activates an unaccepted model.

Scheduled smart mutations acquire locks in account → competition → entry → room → attempt order. This matches cancellation/withdrawal and avoids an inversion with socket disconnect, which locks room before attempt. Round closing time is registered before later room/attempt waits and checked again after effects; an elapsed deadline rolls back the entire mutation. Connection leases, inspection limits and the solve deadline remain independently enforced.

Cancellation, withdrawal, stream inconsistency or disconnect cannot revive a slot or award a result. Cleanup stays possible after hardware acceptance is withdrawn. A solve actually finished within the round may finish private evidence processing after the round closes; starting or continuing a late solve is refused independently of background maintenance.

## Results and privacy

Casual smart solves are reconstructed and verified before private approval. Ranked smart solves remain awaiting evidence, then provisional, until independent human review approves their attempt-bound recording. Device counters are cross-checked where available; counterless models cannot prove every intermediate physical turn. Telemetry is not a substitute for viewing complete private footage. Remote timing uses the server and includes network/device effects; this is not official WCA event certification or precision timer equivalence.

Scheduled smart results remain in their own event/input category and never enter generic race/daily rankings. The existing best/mean/trimmed-average integer scoring is unchanged. Public event boards include only explicitly shared exact results and event participant numbers, without account identifiers, attempt credentials or footage. Children require current posting consent, exact guardian approval and independent staff MFA approval; revocation removes their shared score. Evidence approval alone never publishes a child result.

The existing competition and smart-attempt storage fields cover this input category; no additional schema migration is required beyond migration 40. Private owner/authorized guardian exports, account deletion, evidence deadlines and competition metadata retention still apply. Encrypted-restore fixtures preserve the smart event category, shared scramble/provenance, permanent slot marker, private connection context and withdrawn publication without reopening the event or unsealing the restored service.

## Verification limits

Source/backend coverage includes authenticated HTTP and the native bridge for all three model formats, exact shared WCA slots, nonce/epoch isolation, provisional evidence and late review, private and child sharing, default regional gate refusal, actual room/attempt/competition lock waits, cancellation/disconnect ordering, hardware withdrawal cleanup and slot ordering. Container and sealed restore results are tracked in STATUS.md.

No real hardware, live AI, public event, native radio/camera session, store submission or regulatory approval was performed. Actual firmware/device testing, recording continuity, accessibility, poor connectivity, production app attestation, native acceptance of the now-connected [casual mixed-input rooms](MIXED-ROOMS.md), native acceptance of connected [private smart replays](SMART-REPLAYS.md) and the complete original release requirements remain open.
