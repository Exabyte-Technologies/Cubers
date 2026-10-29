# Last-layer recognition coaching

The 57 OLL, 21 PLL and 42 CLL composite lessons now include an optional recognition question and sticker-based explanations in English and Simplified Chinese. The same teaching is available in downloaded case drills, subject to the existing account/session lease. It does not call AI or save an observation answer as progress.

## What the learner sees

- A labeled top grid and four upper side rows, with text as well as color. The top is viewed from above with the back at the top of the grid; each side row is viewed straight on. White-up/green-front is the fixed reference frame.
- Separate counts of white corners and white edges pointing up. The center is excluded. CLL correctly has no edges or centers.
- Matching nonwhite corner pairs, three-sticker side bars on 3×3, and whether a row actually matches its side reference. A same-color row does not necessarily belong on the side it currently occupies. Two white side stickers describe orientation, rather than a side-color pair.
- Corner destinations for CLL and corner/edge destinations for PLL. For example, `UFR → UFL` means the piece at top/front/right belongs at top/front/left. This is a destination description, not a move instruction. On 2×2, the completed bottom layer supplies the side reference.
- An optional count question with immediate feedback and a “Show recognition clues” action. Counts alone do not identify a case: learners must compare the positions and, for CLL/PLL, the side colors and piece destinations.

Lesson coaching explicitly describes the **starting model**, even after the interactive puzzle has been turned. It does not claim to track a normal physical cube. A scan result can switch between the checked scanned state and the computed state **after the suggested U setup**, preserving the reference frame. Returning from another screen requires a fresh scan; late responses are discarded after blur, account/community changes or a newer request. Scanning again clears the previous guidance.

The demo link opens the lesson's fixed inverse-setup representative of the recognized case. It does not import the scan; its side colors may differ. The sequence shown on the scan screen is the one validated for that scan. Existing final checkpoints remain responsible for learning credit.

## Deterministic contracts

`packages/core/src/last-layer-teaching.ts` observes a legal engine state or a previously validated scan. It requires completed lower layers and the correct puzzle/frame; PLL additionally requires an oriented top. It derives piece identity from the stickers occupying each geometric upper-layer position and compares side rows with their fixed references. It is an observer, not a replacement scan validator or solver.

`POST /v1/last-layer/recognize` still validates the six-face scan, current learning access and published case lesson. Successful case guidance now includes typed `observations.current` and `observations.prepared` alongside the existing before/algorithm/after sequence. Existing request limits and prerequisite/alignment responses remain in place. The response contains no account identifiers, photos or recordings. Nothing is persisted by recognition alone.

The original **composite practice sequences** remain available. The same published course can now include a verified [shorter alternative](LESSON-ALTERNATIVES.md) for 66 cases (7 OLL / 19 PLL / 40 CLL), with the exact same starting model. Scan recognition still returns the original guide; the lesson offers any currently published choice. Cubers case numbers do not correspond to standard numbering, and shorter sequences are not advertised as globally optimal or fastest finger tricks. Further OLL optimization and native teaching acceptance remain work.

## Verification and limits

- The existing exhaustive traversal now checks teaching against independent face-row/column coordinates over 216 OLL orientation patterns, 288 PLL permutations and 648 CLL states, including completed/alignment patterns. This does not mean OLL traverses every possible permutation of all last-layer pieces.
- Every recognized pattern's computed setup observation is compared with the actual geometric result of its U adjustment. Existing reconstruction checks still verify the subsequent orientation/solution and preserved lower layers.
- Fixed examples distinguish side pairs, bars and misaligned rows; verify corner/edge destinations; exclude the center from orientation counts; and reject premature PLL, unfinished layers, wrong sizes and wrong reference frames.
- API integration checks exercise all three published families and compare both observations with the checked scanned/setup states. Disposable regional Docker checks exercise nonempty U setups through the compiled API and verify that recognition grants no credit.
- Web/iOS/Android exports and type checks validate bundling and contracts. Fresh rendered-screen, screen-reader, large-text and physical camera acceptance remain outstanding. Browser security currently prevents fresh local UI inspection. No hardware, real AI or public service was activated.
