# Casual mixed-input rooms

A room can now allow each player to choose a virtual puzzle, physical scans, or a supported smart cube. The creator selects their own input while creating the room. Invitation recipients start with virtual input unless they explicitly select another option. They can change that choice from the open room; the host's start locks every player's choice. Rejoining does not reset it.

Mixed rooms are always casual. They never enter category rankings or scheduled competitions. Race and Daily Challenge support scans on all four puzzles. Pattern Chase, Algorithm Sprint and Cooperative Relay require virtual or supported smart input because they need turn tracking. Smart input remains limited to 3×3, and every actual model/platform remains disabled pending physical acceptance.

## Shared scrambles and integrity

Race, pattern, relay and daily mixed attempts use a shared room scramble from the existing pinned community WCA generator. Generation happens outside database locks. The first committed attempt freezes the scramble and its provenance under the room lock; later players receive that exact set. Daily rooms also retain the challenge date, including when another player enters after midnight. Sprint retains its authored starting state and sequence; it does not invent a generated scramble source.

The room's cached scramble is excluded from lobby/room responses. A member receives their scramble through their issued attempt. Attempts retain fresh identifiers and nonces. Every player gets one attempt, with its actual input frozen separately from the creator's original choice. The server routes virtual moves, scan checkpoints and smart telemetry using that frozen category.

Migration **41** is additive: older rooms remain single-input rooms, and older membership/attempt input fields remain null and inherit the ordinary room category. Database constraints prohibit mixed ranked/competition rooms. Triggers reject room reclassification, input changes after start, incompatible member inputs and attempt input/ownership changes. They retain compatibility with ordinary scheduled membership and cleanup writes.

Mixed writes recheck current full sessions and account/guardian authority, then room/membership/attempt state. Timed attempt changes recheck deadlines after lock waits and staged writes. Smart connection leases, sequence/counter/state checks, non-resumable interruption and default hardware refusal still apply. A request through the wrong input route cannot submit a solve.

## History and privacy

Private history filters, goals, session statistics, achievements and shared-profile eligibility resolve each attempt's actual input. An approved mixed virtual race/daily solve can use the existing private replay validator. Complete approved smart archives can also use [private smart replay](SMART-REPLAYS.md), labeled with their actual model and continuity limits. Physical and smart attempts cannot masquerade as virtual replay data. Mixed history is labeled casual and mixed in the profile.

Scans do not provide turn counts. Smart connections that establish only net-state continuity do not provide reliable exact turn counts or turning speed; these statistics remain unavailable. Shared profiles retain their existing visibility/eligibility rules, and casual physical results do not acquire reviewed ranking eligibility. Export and deletion continue to include these ordinary room/attempt records under existing ownership rules.

## Verification and remaining acceptance

Source and real authenticated integration checks cover all four virtual/scanned puzzles, shared scramble/provenance, private category filtering/replay, smart game and relay streams using isolated synthetic acceptance, actual room-lock races, expired sessions, authority changes during generation, nonce/route rejection and database immutability. The container runner exercises all three inputs in both regions; the encrypted restore drill checks the frozen category and guards after restoration.

See [STATUS.md](STATUS.md) and [DOCKER-VERIFICATION.md](DOCKER-VERIFICATION.md) for recorded results. Synthetic smart acceptance exists only in test fixtures. No real AI, real hardware, native radio/camera acceptance, app-attestation activation, store publication or legal approval follows from these checks. Native interaction, accessibility, camera/Bluetooth continuity and poor-network acceptance remain necessary before release.
