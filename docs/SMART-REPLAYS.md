# Private smart-cube solve replays

An owner can reconstruct saved, approved 3×3 smart-cube race and daily solves. This also works for the actual smart input in a casual mixed room and for eligible scheduled solve archives. Scanned attempts do not have a continuous turn record. Pattern, sprint and relay game histories remain outside the saved solve replay route.

A replay reads an archive without connecting to a cube or creating a new attempt. Actual GAN 356 i3, GoCube Edge and GiiKER i3S hardware/platform gates remain disabled until physical acceptance. Reading an existing archive does not bypass those gates, enable live Bluetooth, grant progress or publish a result.

## Reconstruction and limits

The bounded worker reconstructs the puzzle from the stored server scramble and ordered received turns and requires a solved final state. Smart archives must be 3×3 with a complete saved model context, fixed U/F frame, matching sequence count, independent final state, no recovery run, appropriate counter/continuity combination and saved scramble/start/finish/contact proofs. Invalid, interrupted, provisional, rejected, unsupported or incomplete archives cannot become a replay.

GAN archives identify counter continuity. GoCube Edge and GiiKER i3S archives identify net-state continuity: they reconstruct received turns only. Extra physical turns between matching positions may be missing; exact physical turn counts and turning speed cannot be established. The interface and bilingual privacy text state this limitation. A replay does not certify physical performance or replace recorded-evidence review.

Playback uses a study pace rather than original turn timing. Previous/next/start/end controls, speed choices, reduced motion, bounded seeking and cancellation work for both virtual and smart packets. Navigation, account/community changes, backgrounding and current learning authority retain their existing protections.

## Privacy and current authority

Only the approved attempt's current owner can read it, with a full current session, learning/guardian permission and the regional game-service gate. The endpoint rechecks the complete source snapshot after worker validation; changed moves, smart context, category, timing, version or approval status invalidate the response. It then rechecks session and current guardian permission.

Packets include the puzzle, scramble, received moves, saved duration/date and model/continuity label. They exclude the connection epoch, counter, reference, platform, nonce, video, reviewer and other participants. The history endpoint uses private proof fields for eligibility without returning the smart context or contact proofs. Replay data is not sent to AI or stored as a new device archive. Existing owner export/account-deletion behavior applies to the source records. The private route stays owner-only. Separately approved anonymous snapshots can now be shared through [Replay sharing](REPLAY-SHARING.md), with expiring links and current recipient checks.

## Verification

Source tests cover all three model contexts, packet privacy, impossible input/model/continuity combinations, missing/recovered context, strict turn vocabulary, sequence/time validation, bounded seeking and cancellation. Authenticated integration tests exercise real verified synthetic smart streams, private owner-only archives, current guardian/session checks and source changes during asynchronous work. Container verification uses compiled workers in both regions, including the actual input of a mixed room. Encrypted restore verification retains a complete approved smart archive and reconstructs it without unsealing the target.

All smart acceptance overrides remain isolated test fixtures. No real AI call, physical device, hardware activation, native camera/radio acceptance, app-attestation activation, public deployment, store publication or regulatory approval is established by these software checks. See [STATUS.md](STATUS.md) for final verification results and remaining original-plan work.
