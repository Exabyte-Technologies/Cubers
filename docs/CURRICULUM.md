# Curriculum and verified case libraries

Cubers currently has 25 original bilingual foundation drills and 120 original composite case exercises: 57 OLL, 21 PLL and 42 CLL. The definitions and expected case counts are described by [CubeSkills OLL](https://cubeskills.com/tutorials/oll-algorithms), [CubeSkills PLL](https://www.cubeskills.com/uploads/pdf/tutorials/pll-algorithms.pdf) and [J Perm's CLL introduction](https://jperm.net/2x2/faster). No case sheet, illustration, explanation or algorithm collection was copied from those sources.

The case exercises combine a small set of common cubing triggers. An offline generator derives position permutations from Cubers' geometric puzzle engine, searches reachable last-layer states, groups equivalent cases and writes `packages/core/src/algorithm-cases.json`. Run `npm run cases:generate` to reproduce the data. Its output is deterministic and contains no user data or generated timestamp.

The checks establish:

| Family |       Reachable patterns | Nontrivial classes | Preserved portion                    |
| ------ | -----------------------: | -----------------: | ------------------------------------ |
| OLL    | 216 orientation patterns |                 57 | First two layers                     |
| PLL    |         288 permutations |                 21 | First two layers and top orientation |
| CLL    |        648 corner states |                 42 | Completed 2×2 first layer            |

The solved class is excluded. OLL classes identify upper-color sticker patterns under top turns. PLL and CLL also account for relative side-color frames and final upper-face alignment. These are case-space counts, not the total number of 3×3 puzzle states. Tests enumerate the complete pattern spaces, recognize each pattern, execute the selected sequence and check its target and preserved layers.

**Cubers case IDs do not correspond to standard OLL numbers or named PLL algorithms.** Sequences favor familiar trigger combinations. They are often longer than dedicated speed algorithms; there is no optimal-move, finger-trick or speed claim. Detailed recognition coaching and optimized alternatives remain curriculum work.

## Practice inputs

- Virtual exercises start from the inverse of the authored sequence. The server reconstructs submitted turns, checks the result and saves a private practice history and spaced review date.
- Physical 2×2, 3×3, 4×4 and Pyraminx exercises use persistent lesson sessions. The learner first matches the displayed setup and scans all faces, confirms each subsequent turn, optionally rescans intermediate checkpoints, and supplies a final scan. The server checks colors, reachability, expected state, session owner/version and course version. Duplicate final submissions save progress once. These are learning records, not anti-cheating evidence or ranked results.
- Pyraminx has four nine-sticker triangular faces, independent tip turns, 120° layer turns, an animated renderer and on-device photo sampling with manual correction. The four-face recognition geometry has synthetic-image tests; physical cameras and varied lighting still need device testing.
- Last-layer recognition accepts a scanned 3×3 with completed first two layers, or a 2×2 with a completed first layer, in the displayed white-up/green-front frame. It returns a validated case, required upper-face adjustments and the authored sequence. It identifies already-oriented or already-solved states and refuses unfinished lower layers. Recognition alone does not mark a lesson complete.
- Standard six-color 4×4 scans now check corner twist, 24 distinct wing identities/orientations, and four centers per color. Legal parity states are accepted. These checks apply to ordinary unmarked cubes, not picture/supercubes with distinguishable center orientations. Smart-cube input remains gated.

Complete [guided 2×2, 3×3, 4×4 and Pyraminx first-solve courses](FIRST-SOLVE.md) handle arbitrary valid standard-color scans and server-scrambled virtual states through six, thirteen, thirty-two and twelve validated teaching checkpoints. These are separate from the 25 foundation drills and 120 case exercises, making 149 authored lessons. The 4×4 course uses original constructive center/wing exchanges and validated 3×3 reduction; shorter independent-solving and advanced alternatives remain unfinished. Smart-cube input and physical-camera accuracy remain unverified.

## Placement and practice

Optional private [placement checks and adaptive practice](ASSESSMENTS.md) now connect all four puzzles to server-validated virtual tasks, question feedback, saved sessions and a queue of due reviews/placement topics/unfinished lessons. They do not certify full-solve proficiency or award lesson completion. Offline downloads and optional reminders remain unfinished.

## AI boundary

The AI tutor explains reviewed lesson material; deterministic puzzle logic selects and validates moves. Only a learning-intent category and authored lesson content reach the configured provider. Raw questions and identifying account information are excluded. Unverified/minor users receive authored explanations. Current tests use a local simulator with no real key. Provider output containing move instructions, links, markup or selected unsafe content falls back to authored text. A real moderation integration and provider validation remain release requirements.

## 4×4 reachability basis

The validator follows the standard color-state consequences of [Bonzio, Loi and Peruzzi, Theorem 3.1](https://arxiv.org/pdf/1611.07437): corner twist is constrained, each wing identity has a fixed relation between position and orientation, and labeled center/corner permutations have matching parity. Cubers identifies wings by their two colors and geometric handedness. Ordinary same-color centers are indistinguishable, so their hidden labels can meet the parity condition; a 3×3 corner/edge parity rule would wrongly reject legal 4×4 states. Tests cover seeded legal scrambles and rigid rotations, every single-wing flip, twisted/mirrored corners, center permutations, legal paired-edge flips and odd visible corner permutations. These checks establish state validation; the separate complete [4×4 reduction planner](FIRST-SOLVE.md) supplies guidance. Neither establishes camera accuracy.

## Regional authoring and editions

The [course editor](COURSE-EDITING.md) now supports persistent original bilingual drills and teaching revisions, with explicit saved-version review, recent history and withdrawal. Built-in puzzle/method/case verification fields remain fixed to this tested library; specialized guided-stage explanations and placement/recognition definitions remain versioned core source. They are not replaced by arbitrary editor code. Historical practice retains its algorithm/version, while current-completion marks and new practice/tutor requests bind the current published edition.
