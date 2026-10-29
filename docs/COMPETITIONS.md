# Scheduled competitions

Implemented 2026-10-17. This connects the regional database, existing verified attempt/evidence flow, mobile Play screens, guardian controls and MFA staff workspace. It does not create production events, users or scores. Real AI is not involved.

## Schedule and participation

An administrator creates original English and Simplified Chinese titles, descriptions and round titles. A competition has one puzzle (2×2, 3×3, 4×4 or Pyraminx), one input category (virtual, physical scans or smart 3×3), one ranked/casual classification, up to six non-overlapping rounds and at most 100 active participants. Smart schedules use the [gated smart competition workflow](SMART-COMPETITIONS.md); drafts can be prepared, but every real model remains disabled until physical acceptance. Each round lasts one minute to 24 hours; the schedule spans at most seven days and ends within the next 180 days. Registration ends before the first round opens. The regional store admits at most 500 unexpired events and 1,000 historical registrations per event; repeated withdrawal/rejoining retains the original event number.

Staff first save a private draft, inspect the saved schedule and both languages, confirm rules and content rights, then publish that version. Draft content is not returned through player routes. Published definitions and dates are fixed. Cancel and create a replacement to reschedule; cancellation interrupts active attempts, withdraws shared scores, records a private audit and adds a private system notice for current registrants. No external email or push is sent. Draft cancellation requires a staff note too.

The mobile Play list shows upcoming/ongoing competitions in schedule order and a separate **My competitions** view for private history. Listing uses a bounded timestamp/ID keyset, including tied starts and removed page boundaries. Registration is explicit and acknowledges the schedule, attempt limits and private results. Capacity checks, participant numbering and duplicate registration serialize under the competition lock. A child requires current reviewed guardian learning permission; ranked physical entry additionally requires current recording permission.

Round windows are server time, stored in UTC and displayed using the device's local time. Players request attempts in order. Each entrant/round/slot has one private room and one unpredictable attempt nonce; retries return that slot rather than issuing another attempt. All entrants receive the same cryptographically generated scramble for the same round/slot. Scrambles are generated at publication, kept out of schedule/leaderboard/staff schedule responses and released only with an entrant's current attempt during the round. This cannot prevent participants from communicating a scramble to each other; production integrity and operator review remain necessary.

Normal room invitation, host-start and new-attempt routes reject competition rooms. HTTP and WebSocket solve mutations recheck current account/session, guardian policy, active registration, event status and round deadline while holding database locks. A late background sweep cannot extend a round. Withdrawal or cancellation prevents further active writes. Reopening an unfinished inspection/solve/recording on mobile interrupts it; it cannot silently resume with a clean recording or timer. Existing native background, camera and connection handling still applies and requires physical-device acceptance.

## Scoring

These are **Cubers remote competition rules**, not WCA event certification, official records or Stackmat-equivalent timing. The server measures elapsed time; network latency and device access affect remote timing. Inspecting for more than 15 seconds and at most 17 seconds adds 2,000 ms. More than 17 seconds interrupts the attempt. Virtual move streams must reconstruct a solved puzzle. Physical scans verify the scramble and final state; ranked physical attempts also need uninterrupted private footage and human approval.

| Format   | Slots | Score                                                                                                                  |
| -------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| BEST1    | 1     | Best approved time                                                                                                     |
| BEST3    | 3     | Best approved time                                                                                                     |
| MEAN3    | 3     | Mean of three approved times; any DNF/DNS makes the round DNF                                                          |
| AVERAGE5 | 5     | Discard fastest and worst; average the remaining three. One DNF/DNS can be the discarded worst; two make the round DNF |

Open slots and unresolved physical evidence remain pending. After a round closes, an unused slot is DNS and an interrupted/rejected/expired attempt is DNF. Physical final scanning/upload/review may finish after the round deadline only for a solve actually finished in time, within the existing 30-day resolution window. Provisional evidence never receives a placement. Casual scanned results require valid scans; casual smart results require verified telemetry and independent device states. They stay in their respective input categories.

The calculation uses exact integer thirds of a millisecond. Best results multiply milliseconds by three; means and trimmed averages retain the sum of their three components. No decimal rounding decides a place. Overall competition score adds all round scores; every round must have a valid result. Equal scores compare the best single attempt across the selected scope. Identical scores and best singles share a place, with subsequent numerical places skipped. A shared DNF can be displayed with no numerical place. The best/mean/trimmed-average and inspection conventions were checked against [WCA Regulations, Articles 9 and A](https://www.worldcubeassociation.org/regulations/); Cubers' remote timing, permitted puzzle/format combinations, precision and multi-round sum are its own rules.

Competition results never enter the existing generic race/daily rankings. Those older category rankings now omit all minors and unverified adults and return anonymous adult labels, preventing unreviewed profile nicknames or child scores from bypassing the scheduled exact-result sharing workflow. Selecting a generic ranked room discloses this anonymous adult score sharing. A permanent room marker preserves this separation even when event metadata expires. The bilingual [category-ranking screen](CATEGORY-RANKINGS.md) is available separately from Play.

## Private results and sharing

**Every participant starts private.** A player's own schedule shows private slots, result status and per-round/overall totals. No score, account name, age, school, location or recording is automatically published to other entrants.

An optional shared board uses only an event-scoped participant number, category and approved exact result. The event number is a pseudonym, not irreversible anonymization. Someone who already knows that number may recognize the player's score; owner and guardian screens disclose this. Places compare only currently eligible, approved shared results. Private or pending requests cannot affect the displayed places. Round and overall sharing are separate choices.

An owner first inspects a scope and submits its exact server digest with the sharing acknowledgement. All selected rounds must be closed and evidence resolved. A verified eligible adult can share anonymously. Teens require independent staff review. Younger children require current verified guardian approval **then** independent staff MFA review, both bound to the exact preview, digest and request revision. A reviewer cannot review their own or their linked child's request/evidence. Public posting permission and mainland identity/social gates still apply; recording permission is rechecked for ranked physical scores. Approval neither changes profile privacy nor creates a community post or an OS sharing message.

Owner, current linked guardian or independent staff can withdraw sharing. Guardian reads and actions require a current eligible link to a younger child, including after revocation or the child reaching adulthood. Revoking child consent explicitly cancels publication requests. Every board read recomputes current eligibility and the result digest. A changed score/status, relationship, consent document/review, eligibility, event cancellation or withdrawal removes the old approval from the board. Reinstating a corrected result does not restore a withdrawn publication automatically: the owner must request sharing again and obtain required approvals. Meaningful approved/rejected evidence corrections also cancel affected round/overall requests and add a generic private correction notice for other current entrants with shared results. Existing private attempt-review notices continue for the owner.

The exact preview contains anonymous result data, format and slot times/statuses, not other participants' private history or video. API responses omit guardian, moderator and account identifiers from shared boards. MFA role and factor generation are rechecked inside staff write transactions, after account locks; a captured old request cannot retain revoked authority.

## Data lifecycle and deployment

Event, entry and publication metadata expires 180 days after the last round. Maintenance redacts associated competition audit targets and removes event/entry/publication rows. Private approved solve history/replays follow their existing owner lifecycle; room references become null and the permanent competition marker remains. Competition audit records have a maximum 190-day window. Private inbox notices retain their existing 30/90-day read/unread limits. Physical footage keeps the existing seven-day finalized / up-to-30-day appeal or unresolved policy; it is not retained for the event's 180 days.

Account and guardian exports include owned entries, saved publication status and event metadata without another person's guardian/consent digest. Account erasure removes entries/publications/attempts, redacts personal audit targets and removes the departing account from stored room rosters. Deleting an event creator removes the creator reference rather than deleting other entrants' private histories. Regional databases, secrets, communities, events and storage remain independent.

Apply additive migration `202610170007_competitions` and the matching API, worker, admin and mobile versions with private ingress. Stop older play/grading processes first: they do not enforce scheduled windows or the new permanent category marker. Do not run mixed play versions. Existing rooms retain their ordinary semantics. No test events are seeded by migration. A rollback needs closed ingress, interruption of competition attempts and reviewed migration/session state; do not reopen an older play server against scheduled attempt rows.

Mainland game classification/operating approval is required before schedule publication and player participation; staff can prepare a draft while the gate is closed. Sharing additionally obeys mainland social/identity controls. Production ranking still requires verified platform attestation and remains disabled. `PUBLIC_RELEASE_APPROVED=false`, real-device tests, operational moderation, legal/filing/classification review and configured production services remain separate launch gates. Flags and code checks do not prove regulatory compliance.

## API outline

- `GET /v1/competitions[?mine=true&cursor=…]`, `GET /v1/competitions/:id`.
- `POST /v1/competitions/:id/register`, `/withdraw`, `/rounds/:roundId/attempts`.
- `GET /v1/competitions/:id/board?scope=overall|roundUUID`, `POST /v1/competitions/:id/share`.
- `POST /v1/competitions/publications/:id/cancel`.
- `GET/POST /v1/admin/competitions`, `GET /:id`, `POST /:id/publish`, `/:id/cancel`.
- `GET /v1/guardian/competition-publications` and `/v1/admin/competition-publications`; `POST /:id/review` and `/:id/cancel` beneath either prefix.
- Existing `/v1/attempts/:id/*` HTTP and `attempt.moves` WebSocket events perform the real solve, scan, recording, evidence and appeal work.

## Validation limits

The final source suite passed 140 unit and 144 integration tests, including the pagination/roster refinements, UUID-case normalization, a deadline crossed while waiting for an attempt lock, and prevention of legacy rankings exposing minors or unreviewed nicknames. New checks exercise real verified virtual solves for every puzzle, secret shared scrambles, nonce/category/room isolation, concurrent capacity/slot admission, inspection penalties, deadlines through HTTP/WebSocket, pending physical evidence and late authorized evidence submission, exact guardian/staff approval, consent and adulthood changes, corrections, retention, account erasure, multi-round formats and exact tied places, and captured stale staff requests. Test-only clock/known-duration fixtures are confined to reserved databases. Existing simulated AI tests run without real credentials. Final Docker run `71974b7d` passed 30 international / 27 mainland groups, with 23 migrations and no remaining disposable resources. AI was disabled there; no production event was created. Container verification details are recorded separately in DOCKER-VERIFICATION.md.

Mobile iOS/Android/web bundle generation passes. Fresh rendered browser interaction, screen-reader/large-text/narrow layout, physical camera/background/network interruption, recorded evidence duration and actual operator commissioning remain unverified. Browser inspection was denied in this session and was not bypassed. No store submission, public competition or hardware activation is claimed.

The operator privacy review must check the actual purposes, disclosures, retention necessity, separate sharing choice and guardian process against applicable law, including [China PIPL](https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm) and [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions). These references do not certify the implementation or its operation.
