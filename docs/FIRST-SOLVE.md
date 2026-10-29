# Complete guided learning for all four puzzles

`3-first-solve` is a complete, state-dependent layer-by-layer course for ordinary six-color 3×3 cubes using Cubers' color scheme. It accepts a server-scrambled virtual cube or an arbitrary valid physical scan. Its 13 checkpoints cover the white cross, four white corners, four middle edges, yellow edge orientation, yellow corner orientation, top corner positions and the remaining top edges.

The bilingual app explains each stage, identifies target pieces by their actual colors, shows short move groups and provides animated previews. White stays down and green toward the learner. Face letters name positions rather than fixed colors. Scanner capture uses the existing white-up instructions; afterward the learner returns to the displayed white-down holding frame. Dragging changes the view rather than puzzle state. Previews respect reduced motion and never save turns or earn checkpoint credit.

## Six-stage 2×2 course

`2-first-solve` accepts arbitrary valid physical scans or server-scrambled virtual states. Its six cumulative checkpoints place four white corners, orient the yellow face and position the remaining corners. Bilingual instruction identifies pieces and their homes without referring to nonexistent centers or edges. The original planner preserves each completed corner and replays every proposed stage. Tests complete 200 seeded legal scrambles, rigidly rotated references and a valid odd corner permutation; corner twist and mirrored states are rejected. A 3×3 edge/corner parity rule is never applied to 2×2.

An unsolved 2×2 scan retains the captured top/front reference throughout guidance; with no centers, rotating its colors to infer a frame would change the task. The displayed finished target is white down, green front. A completely solved checkpoint scan is recognized in any rigid orientation and normalized to that target. A solved initial scan cannot earn a course completion.

All four courses share the bounded worker, saved practice controls and permission checks below. Separate stored puzzle/course identifiers, per-puzzle active slots and scoped histories prevent one puzzle from earning another course's credit. Migration `202610160006_guided_puzzles` preserves existing sessions as 3×3. Requests omitting `puzzle` retain the original 3×3 behavior; unsupported puzzle names and mismatched scan dimensions are rejected.

## Twelve-stage Pyraminx course

`pyra-first-solve` aligns four axial groups with full 120-degree vertex turns, matches four independent tips, places three yellow base edges and finishes the remaining edges. It accepts arbitrary valid four-face scans and server-scrambled virtual states. The geometric validator uses the axial color triples to normalize all twelve rigid holding orientations into the displayed reference: green front, red right, blue left and yellow below. Vertex letters U/L/R/B name turning vertices; lowercase letters turn only tiny tips. The scanner's four face labels describe a different thing and are explained separately.

The original planner derives twelve four-turn edge groups from the tetrahedral model: turn two vertices, then reverse those turns. Each whole group restores every axial and tip orientation while moving edges. Enumeration proves these groups span all 11,520 legal even edge permutations/orientations, with maximum distance seven groups. This is the edge component, rather than enumeration of the full puzzle's combined states. The four edge stages therefore need at most 112 turns, plus at most eight axial/tip turns; the implementation enforces a 200-turn plan ceiling. Searches never exceed 11,520 states, and every stage is replayed against its cumulative goal. No remembered scramble or external solver is used.

The groups prioritize dependable original guidance over speed. Previously placed base edges can move during subsequent edge work; the bilingual lesson explicitly asks learners to finish **all groups in a stage** before checking that the base is restored. A single four-turn preview is not necessarily the whole stage. The final scan must include all edges, axial pieces and tips. A solved initial scan cannot earn completion.

Checks cover 200 arbitrary scrambles across all twelve holding references, impossible flips/reflected tips, virtual reset/undo, cross-puzzle notation/history/credit, concurrent finalization, fresh rotated physical checkpoints, alternative paths and recovery scans, publication changes, guardian activity/consent and erasure. Physical scans establish checkpoints without claiming continuous hidden-turn tracking or reliable move telemetry. Native camera and gesture behavior remain unverified.

## Thirty-two-stage 4×4 reduction

`4-first-solve` accepts arbitrary valid standard-color 4×4 scans or server scrambles. Its 32 cumulative checkpoints prepare the wing arrangement when needed, complete six center blocks, pair twelve edges and finish thirteen 3×3 layer goals. The target holding frame is white down and green front. Mixed-center scans retain the captured top/front reference; once all six monochromatic centers form a recognizable rigid color frame, scans normalize to that target. A legal but unusual center-color arrangement is kept and solved rather than rejected.

This is an original constructive reduction method. Geometry verifies one pure three-center cycle and one pure three-wing cycle: all other pieces return after the complete group. Setup tables span all 24 × 23 × 22 = **12,144 ordered triples** independently for centers and wings, with maximum setup lengths six and five geometric turns. Conjugating a cycle with a setup and its inverse supplies a validated exchange for any three positions. Centers of the same color receive interchangeable internal labels, chosen to allow an even sorting permutation without disturbing completed color blocks. These labels are planning aids, not inferred physical identifiers or extra scan data.

An odd wing permutation receives a wide turn followed by an opposite outer turn, together moving only the inner layer, before centers are built. Pairing then chooses an arrangement compatible with the actual corner parity; a valid already-reduced arrangement is retained. The reduced state must pass full 3×3 reachability before layer guidance starts. Legal paired-edge flips, odd visible corner permutations and center swaps therefore receive complete solutions; impossible individual wing flips and twisted/mirrored corners remain refused. This does not apply a 3×3 parity rule to the original 4×4 scan.

Every exchange and final checkpoint is replayed. Searches use bounded setup tables rather than exploring the full 4×4 state space. Plans have a 2,500-command ceiling; setup/restore sequences can be lengthy, so this dependable teaching method is not a short or speed-optimized solution. The app introduces wide turns (`Rw` means both right layers), shows complete exchange groups and explains when earlier work is restored. After reduction, only outer-layer turns are instructed. Independent-solving coaching and shorter advanced alternatives remain separate unfinished work.

Checks solve 200 legal scrambles through all 32 goals, verify pure-cycle effects and complete setup orbits, exercise all checkpoint replans, and test legal parity cases and scan-frame handling. Real API tests complete virtual/physical journeys, wide-turn undo/reset, alternate center and reduced-layer routes, recovery scans, fresh rotated scans after centers, independent history/credit, concurrent finalization, guardian/publication changes and child erasure. Guidance remains usable if free virtual turns disrupt reduction: the lesson stays visible while completion requires restoring the goal or restarting/rescanning. Native interaction and camera accuracy still require device tests.

## 3×3 deterministic planner

The original planner derives piece-coordinate transitions from Cubers' geometric engine. It uses an exact cross-distance table and bounded searches over insertion, orientation and permutation groups. Every generated checkpoint is replayed and checked. It does not reverse a remembered scramble or use an external/AI solver.

| Component                                       |                 Verified coverage |
| ----------------------------------------------- | --------------------------------: |
| White-cross edge configurations                 | 190,080, maximum eight face turns |
| Successive white-corner positions/orientations  |                 24 / 21 / 18 / 15 |
| Successive middle-edge positions/orientations   |                 16 / 14 / 12 / 10 |
| Last-layer edge configurations                  |                               192 |
| Last-layer corner orientation-goal reachability |                               648 |
| Oriented top-corner permutations                |                                24 |
| Final even edge permutations                    |                                12 |

Corner orientation coverage starts from all 24 oriented permutation goals, covering the distinct Sune/U components. These are constrained component spaces, not enumeration of every full-cube state. End-to-end checks additionally solve 200 seeded legal scrambles, rotations and slice/wide-derived states through all 13 goals. Impossible states and unsupported sizes are rejected. These 3×3 plans have a 500-move ceiling. Familiar groups favor dependable teaching over speed optimization; no shortest full-solution claim is made.

Planning runs in a dedicated Node worker with a 64 MiB old-generation limit, three-second job deadline and at most six active/queued jobs. The deadline includes cold startup and table generation. A retiring thread retains its capacity until exit, including after timeout; construction/dispatch failures release jobs, and shutdown waits for termination. Busy/failed jobs return retryable errors without automatic retry. Admission, late results and interruption/recovery are tested. Only color facelets enter the thread; no account tokens, names, questions or images are provided.

## Saved practice

- Each account has at most one active virtual and one active scanned session per puzzle. Starts are limited to 12 attempts/day, replanning to 20/hour and move requests to 1,200/hour (3,600/hour for 4×4), alongside HTTP limits. Session versions serialize changes and reject stale/duplicate advancement.
- Virtual 2×2/3×3 cubes accept only outer face turns; 4×4 additionally accepts wide turns; Pyraminx accepts uppercase U/L/R/B vertex turns and lowercase tips, each optionally primed. Cross-puzzle notation, half-turns on Pyraminx and cube rotations are refused: at most 100/request, 500 in the stage undo path and 2,000 recorded turns for 2×2/3×3/Pyraminx, or 6,000 for the longer 4×4 method. Clients cannot upload replacement virtual states. Undo cancels inverse pairs in the stage path while retaining actual turns in global history. The guidance cursor matches current state against planned prefixes, supporting undo/equivalent turns. Restart applies and records the inverse path to the saved checkpoint.
- Watching a group is a local preview; mutation/checkpoint controls stay disabled. Actual virtual turns use the API and checkpoints verify the reconstructed server state.
- Physical practice requires a full validated six-face cube or four-face triangular scan at every checkpoint. Confirmed turns predict state but are not continuous telemetry. Alternative valid routes reaching the current goal are accepted and future guidance regenerated. Recovery scans update guidance after unrecorded changes, restart the checklist and preserve the earlier journal. Physical records can have no confirmed-move telemetry and never become turning-speed or ranking evidence.
- A solved initial scan does not mint completion. All six 2×2, thirteen 3×3, thirty-two 4×4 or twelve Pyraminx goals must pass to write course progress once and schedule review. No race attempt or leaderboard credit is created. Legacy drill completion/session/tutor endpoints reject these courses, including empty move lists.
- Current learning/guardian eligibility, regional sessions, course publication/version and ownership are enforced. Ending an unexpired session remains possible after course withdrawal. Missing/another owner's identifiers share 404. Deletion-only credentials cannot access this workflow.
- Active practice expires after seven days. Completed history remains until account deletion; expired sessions are purged 30 days after original expiry, cancelled sessions 30 days after cancellation. Expired sessions cannot be cancelled to restart retention. Owner/authorized-guardian export/activity include guided records; account deletion cascades through them.

Learn opens `/first-solve?puzzle=2x2` or `/first-solve?puzzle=3x3` or `/first-solve?puzzle=4x4` or `/first-solve?puzzle=pyraminx`; Profile links to private paginated history with puzzle controls. Session state, history cursors and course credit stay scoped to their puzzle. Active identifiers are separate from recent summaries, keeping older active sessions resumable. Recovery alone never awards progress.

## API and deployment

| Route                                        | Request                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /v1/first-solves?puzzle=2x2&cursor=...` | Private summaries, cursor and active identifiers                                   |
| `POST /v1/first-solves`                      | `{ "puzzle": "2x2", "input": "virtual" }`, or add `"faces"` with `"input": "scan"` |
| `GET /v1/first-solves/:id`                   | Saved state/stage, guidance cursor and checkpoint summary                          |
| `POST /v1/first-solves/:id/moves`            | `{ "version": 0, "moves": ["R"] }`                                                 |
| `POST /v1/first-solves/:id/checkpoint`       | `{ "version": 1 }` for virtual; add `faces` for scanned input                      |
| `POST /v1/first-solves/:id/reset`            | `{ "version": 1 }`, virtual only                                                   |
| `POST /v1/first-solves/:id/rescan`           | `{ "version": 1, "faces": { ... } }`, scanned only                                 |
| `DELETE /v1/first-solves/:id`                | `{ "version": 1 }`                                                                 |

The `puzzle` field and list filter accept `2x2`, `3x3`, `4x4` or `pyraminx`, with `3x3` as the backward-compatible default. Responses are private/no-store; unknown body fields are rejected. Stop old API/worker processes before migration/initialization and deploy a consistent image: older generic drill handlers do not understand the new course's restrictions. Initialization adds authored content while preserving operator edits. Public release stays disabled.

## Limits

Fresh browser visual QA is blocked. Native gestures, camera lighting/capture, accessibility and interruption still need device testing. Synthetic facelets do not establish camera accuracy. Smart input remains disabled pending hardware acceptance; the separate [guided smart 3×3 workflow](SMART-LESSONS.md#guided-smart-first-solves) now connects actual-state planning, native telemetry and all thirteen verified checkpoints. This milestone supplies complete virtual/scanned **all four puzzles** with virtual/scanned guidance; independent-solving coaching and optimized advanced alternatives remain unfinished.

A later regional container run (`33fbb789`) returned HTTP 503 when creating a mainland virtual 4×4 session; its specific worker error was not retained. A fresh run (`efbaced1`) passed both regions with unchanged solver limits and no automatic retry. The failed run remains recorded, and cold-start/resource/latency investigation is still required; the cause and a fix remain unproven. See [Docker evidence](DOCKER-VERIFICATION.md#intermediate-44-failure).

The [separate worker diagnostic](GUIDANCE-DIAGNOSTIC.md) now covers all four puzzles: 2,012 synthetic jobs and 38,384 teaching checkpoints pass under the existing limits. Direct table indexing reduces measured cold startup cost while preserving complete lookup tables and sampled plans byte for byte. Worker retirement and construction/dispatch recovery are also hardened. These changes did not reproduce or establish the cause of the earlier HTTP failure; production latency acceptance remains open.
