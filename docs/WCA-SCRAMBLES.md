# Server scramble generation

Cubers uses **cubing.js 0.66.1**, pinned in the server lockfile, for random-state scrambles for 2×2 (`222`), 3×3 (`333`), 4×4 (`444`) and Pyraminx (`pyram`). Generation runs locally inside each regional Node server in native ESM workers. Java, TNoodle downloads, extra service ports and a remote scramble service are no longer deployment dependencies.

[cubing.js documents random-state support for these events](https://js.cubing.net/cubing/scramble/), including 4×4. Its documentation also notes a filtering gap. Cubers therefore applies an additional, versioned minimum-distance filter using the library's independent puzzle transformations:

| Puzzle | Rejected states |
| --- | --- |
| 2×2 | Within three face turns of any solved orientation |
| 3×3 | Solved or within one face turn of any solved orientation |
| 4×4 | Solved or within one outer/wide turn of any solved orientation |
| Pyraminx | Body solvable in five or fewer turns, regardless of tips |

The filter enumerates these small neighborhoods once per worker/event. Rejection sampling draws a fresh upstream random state, with a bounded retry count. Pyraminx tip moves cannot disguise an easy body. The minimums follow [WCA regulation 4b3](https://www.worldcubeassociation.org/regulations/#4b3); this implementation does not claim official program approval or prove the upstream distribution statistically. **Cubers competitions are not official WCA competitions.** Official events require the current WCA-approved program, as the upstream documentation explains. The replacement provides equivalent event notation and filtered random-state behavior, not identical Java random strings.

## Connected behavior

The generator supplies new race, pattern, daily and relay starts, scheduled competition rounds at publication, and virtual first-solve starting states. Algorithm Sprint and authored teaching algorithms retain their task-specific sequences. Scanned learning starts use the user's state. Failures return an unavailable response without falling back to random moves.

Four workers and at most 128 waiting jobs bound admission. Batches contain 1–30 scrambles; `SCRAMBLE_TIMEOUT_MS` defaults to 30,000 and includes queue time. Timeout terminates the worker before capacity is reused. Shutdown rejects pending work and awaits worker termination. Performance logs and upstream prefetching are disabled. Only event codes, counts and internal job identifiers reach the workers; no account information or AI provider is involved.

Generation occurs outside database locks. Before writing an attempt or publishing rounds, transactions recheck current account/session/guardian/membership/room or staff authority. Daily sets share a generator/version/filter/puzzle/date namespace. Failed admission cannot publish a daily set. Public release, mainland game, physical ranking and device acceptance gates remain unchanged.

Migrations 35–36 add nullable source metadata to attempts, rounds and guided solves and accept separately identified historical TNoodle records. New rows record `cubing.js`, version `0.66.1`, filter `cubers-min-distance-v1`, event and the verified npm tarball SHA-256 `b3303fa3ae3eddb59e99f9bd4ae17acb30ba7e713132fe08e8da836291961a0a`. The lockfile separately checks npm's SHA-512 integrity. Already issued sequences and null historical provenance are preserved. Generator updates require explicit provenance and cache-version review.

## Verification and limits

The source suite passes 217 cases and the backend suite passes 204, including actual community generation for every puzzle, all game modes, shared challenges, scheduled rounds, source constraints, invalid output, capacity, deadlines and permission changes during generation. Eleven focused scramble tests also pass. Independent fixtures retain **96 sticker-state comparisons** captured from unmodified TNoodle-WCA 1.2.3, including every supported face/wide/tip move and two sample sequences per puzzle. The historical reference identity stays separate from new output provenance; routine tests do not run Java or regenerate their expected states. `scripts/wca-state-oracle.ts` is an optional historical fixture-maintenance tool only.

The 2026-10-19 production server dependency audit reports no known advisories in the API/core scope; it is not an independent security review or a statement about the separate mobile toolchain. Native presentation, physical orientations and hardware acceptance remain release work. Current container/load/recovery results are recorded in [STATUS.md](STATUS.md).

## Upstream attribution

The exact source revision is [8544249ff1e662557df912065a26b5f90f4df574](https://github.com/cubing/cubing.js/tree/8544249ff1e662557df912065a26b5f90f4df574). Cubers uses the unmodified dependency under its MPL-2.0 option. The [license](third-party/cubing-MPL-2.0.txt) and a source/package notice are also shipped in `apps/api/assets/third-party/`. Preserve upstream notices and transitive dependency licenses when redistributing images; complete release license and image review remains required.
