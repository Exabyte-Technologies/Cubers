# Smart-cube adapters and hardware testing

Updated 2026-10-20. Native adapters target **GAN 356 i3 (Gen2)**, **GoCube Edge** and **GiiKER i3S**. They have synthetic protocol tests and native build checks. **None has passed physical-device testing; all remain disabled for production, lessons and games.**

## Implemented behavior

The shared core decodes each brand separately into Cubers' original geometric 3×3 state. Every full position passes the same piece, orientation and parity validation used for physical scans. The native transport uses `react-native-ble-plx`; the browser has an explicit unavailable implementation and never imports that native module.

| Target      | Initial position                                       | Move continuity                                                                                                                       | Battery                                                           |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| GAN 356 i3  | Encrypted Gen2 state request, device-specific MAC salt | Eight-bit device counter, wrap handling, recovery of at most seven reported quarter turns; larger gaps pause                          | Encrypted request/response                                        |
| GoCube Edge | UART state request, bounded framing and checksum       | Received turns predict state; a fresh independent position must agree within 1.5 seconds. Continued turns cannot extend that deadline | UART request/response                                             |
| GiiKER i3S  | Data-characteristic read; plain or obfuscated position | Each changed position must equal the previous position plus its reported latest turn                                                  | Optional separate service; missing/invalid response means unknown |

GoCube and GiiKER do not expose a hardware move counter in these adapters. A received position can confirm the net state, but cannot prove that every intermediate turn was received. The local event sequence is an application counter, never a hardware counter or match certification. Device timing is retained only when actually present; host receipt timing is labeled separately. Gyroscope packets never count as turns.

A session subscribes before requesting its starting state, waits for a fresh validated position and requires explicit physical confirmation. It never substitutes a solved position for a missing response. Invalid packets, inconsistent positions, excessive notifications, partial-frame expiry or unrecoverable gaps clear the baseline and require synchronization and confirmation again. Subscription setup, reads, writes and disconnects have deadlines; late reads/subscriptions cannot overwrite a new synchronization epoch. Commands are serialized and bounded. No reset-to-solved firmware command is exposed.

## Native development screen

Profile → Device options displays the authenticated regional catalogue. A hardware-test panel appears only in **native development builds**. It requires current learning/guardian permission and a successfully loaded catalogue. Production builds display the disabled models; the native factory also rejects production connection attempts. `/v1/devices` does not trust the legacy database allowlist. Smart-input rooms remain unavailable to normal accounts; the connected [smart game workflow](SMART-PLAY.md) and ordinary smart-drill routes reject every unaccepted model/platform. See [SMART-LESSONS.md](SMART-LESSONS.md).

The user chooses the exact physical model, starts a foreground scan (ten seconds, at most 32 candidates), and selects one cube. Names identify candidates only; mandatory GATT services/characteristics must also match. GoCube X, Rubik's Connected and GiiKER GiC are outside this target list. Other GAN generations are rejected when their Gen2 services are absent; shared names/services still do not establish a particular hardware model.

Android 12+ requests nearby-device scan/connect permission. Older Android versions require the location permission for Bluetooth scanning; Cubers does not read GPS coordinates. Background Bluetooth is disabled. Leaving the screen, backgrounding/locking the phone, signing out or changing regional/account context cancels scans, subscriptions and connections. Candidate IDs, MAC/salt, positions, battery and the last 30 received turns are held only in memory, with no network submission or persistent device history.

GAN uses the Android Bluetooth address when available, or the exact known manufacturer-data format. Otherwise the user must supply the actual six-byte address from the cube/manufacturer tools. The implementation does not guess addresses, probe fingerprints or log identifiers or raw notifications. Session closure zeros the derived protocol key/IV. These vendor protocol keys are transport parameters, not user AI credentials.

The development panel now offers **white up, green front** (device reference) and **white down, green front** (beginner-lesson reference). Both the displayed position and turn letters use the selected reference. The shared mapping supports all 24 adjacent top/front center-color pairs, preserves physical sticker colors and maps outer quarter/prime/half turns in both directions. It does not infer a hold from gyroscope data. Check all six physical faces before confirming; after changing your hold, stop, align and reconnect.

Changing the reference disconnects the old session, clears the two bounded turn histories and requires a fresh connection/position/confirmation. Pending callbacks retain their original connection/reference epoch and are ignored after replacement. New scans await earlier native-manager cleanup. Source counters, timing, recovered-turn flags, provisional integrity and independently verified-state flags remain unchanged by projection. Repeated or multi-turn snapshots do not animate an unrelated last turn.

The reference-comparison development panel stays local and awards no progress or match results. A separate [ordinary smart-drill workflow](SMART-LESSONS.md) now connects the native adapters/bridge to persistent, owner-bound server verification and learning progress behind the unchanged physical-acceptance gates. Synthetic test-process overrides prove software behavior; normal accounts cannot activate a model. Guided 3×3 first-solve input now uses the same bridge with actual-state plans and thirteen verified checkpoints. Smart room telemetry and provisional ranked evidence are now connected behind independent disabled game gates. Scheduled smart competitions now share this verifier and native bridge. Production app attestation and actual physical/native acceptance remain outstanding.

The shared [learning transaction boundary](LEARNING-AUTHORITY.md) now protects existing lesson/checkpoint/placement/download mutations from captured login or guardian permissions, deadline expiry during database waits and cancellation races. The connected ordinary smart-drill controller now uses that boundary, including its account/guardian, session and post-wait deadline checks. All model gates remain off.

## Validation and physical acceptance

`tests/smart-cubes.test.ts` uses only synthetic addresses and packets. Its original 17 checks include independent OpenSSL AES comparison, 100 legal geometric positions reconstructed through all three wire formats, plain/obfuscated GiiKER, CRC/framing/range/reachability rejection, canonical bounded native base64, conservative advertisement matching, explicit confirmation, immutable snapshots, counter wrap/history/gaps, duplicate packets, state mismatch, non-extendable verification deadline, missing initial state, late asynchronous work, coalesced battery subscriptions, notification floods and cleanup. These establish software behavior against the referenced formats, not hardware compatibility.

Seven additional frame checks cover exactly 24 proper holds, 576 scrambled-position projections against an independent coordinate basis, 432 face/prime/half-turn mappings, agreement with the existing first-solve teaching frame, inverse conversion, immutable references, impossible-state refusal and preserved trust metadata. An additional three-adapter session check projects actual synthetic GAN/GoCube/GiiKER wire packets through initial confirmation, 36 received turns, independent position confirmation, counter wrap or mismatch/gap recovery and cleanup. All 25 focused smart-cube/frame checks pass. Fresh web/iOS/Android bundles export successfully; this is not a physical connection or native runtime acceptance result.

The integration suite checks authentication, regional isolation, guardian consent, private/no-store catalogue responses and rejection of a forged database allowlist. Linux Docker tests check all three unavailable models in both regional installations. Mobile bundle exports and the unsigned simulator build are separate from physical runtime evidence.

Before enabling any model, record its actual model/firmware, supported OS/device versions and reproducible results for:

1. Permission denial/retry, powered-off Bluetooth, candidate selection and unsupported-model rejection.
2. Scrambled initial-state synchronization, every face/direction/half turn, fast turns, idle/battery response and frame comparison against the physical cube.
3. Counter wrap and missed notifications where applicable; truncated/corrupt data, disconnect, reconnect and explicit recovery without guessed history or invented solved states.
4. Navigation, account/region change, locking/backgrounding, interrupted operations and complete resource cleanup.
5. Guided-frame mapping and server-bound telemetry; ranked recording interruption, evidence binding/review and platform attestation. Ranked smart play must remain unavailable until its separate integrity requirements pass.

No physical cube was scanned or connected during implementation. Android native compilation and runtime tests still require an Android SDK/test device. Fresh screen inspection is unavailable under the current browser-access restriction.

## Staff evidence workflow

The admin [Device test evidence workflow](DEVICE-TEST-EVIDENCE.md) now records the exact declared cube/firmware, phone/OS/app build and source revision, protected case/custody references, evidence digest, test date and scoped observations. Transport, learning and ranked coverage remain distinct. Synthetic observations and missing required checks cannot receive physical acceptance. Current regional staff MFA, a contributor-independent administrator and exact submitted version are required. Editing clears the previous decision; account associations, bounded history, export and expiry are connected.

The workflow stores references, not uploaded recordings or proof of custody. Actual tests, evidence inspection and protected regional file retention remain human/operator requirements. Approved metadata does not activate a device. Physical/native acceptance of the implemented ordinary smart-drill frame and server telemetry path, guided first-solve and smart game physical/native acceptance, scheduled smart physical/native acceptance and production attestation remain unfinished. No real hardware was tested during this implementation and no report is seeded in the preview.

## Protocol provenance and licenses

Functional wire definitions were adapted from these pinned MIT references. Cubers' geometric state projection, validation and session lifecycle are implemented locally; no upstream `CubieCube` engine was copied.

- [Andy Fedotov, gan-web-bluetooth, revision 65173e2](https://github.com/afedotov/gan-web-bluetooth/tree/65173e2cdd0fa38ef384f237f6da8d76c177ed1e): Gen2 AES key/IV salt, GATT identifiers, bit fields and command values. [License](third-party/gan-web-bluetooth.txt).
- [Pau Oliva / Andy Fedotov, smartcube-web-bluetooth, revision 5dd5337](https://github.com/poliva/smartcube-web-bluetooth/tree/5dd5337004708adf11ddcd7b83eca4b42ddecd75): GoCube/GiiKER wire mappings, obfuscation table and GATT identifiers. [License](third-party/smartcube-web-bluetooth.txt).
- [Seamus Waldron, GoCube protocol frame documentation](https://pkg.go.dev/github.com/SeamusWaldron/gocube_ble_library@v0.0.0-20251223063701-f511d8bef8fa/internal/protocol): UART length/checksum framing reference.
- [Richard Moore, aes-js](https://github.com/ricmoo/aes-js): pinned JavaScript AES dependency 3.1.2, independent OpenSSL comparison in tests. [License](third-party/aes-js.txt).

Full upstream copyright/permission notices ship in `packages/core/src/smart/NOTICE.ts` and are available from the app's Device options screen. Production release still requires the project's separate privacy, security, store and jurisdiction-specific reviews; this implementation does not establish regulatory approval.
