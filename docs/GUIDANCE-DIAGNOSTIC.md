# Guidance worker diagnostic

Regional run `33fbb789` returned HTTP 503 while creating a mainland 4×4 lesson. Its specific worker error was not captured. A subsequent full regional run passed with unchanged production limits; the intermittent failure is still open. The runner now preserves an allowlisted error classification for a future failure.

## Current record review, 2026-10-25

The original private report retains only `503 !== 201`; its container log contains no specific guidance-worker error or saved failing puzzle state. It cannot distinguish startup timeout, interruption, capacity admission or state validation, so a root cause cannot be recovered from that record. The existing 2,012-job diagnostic already covers the planning path. Current full regional runs **2e0e15c2** and **3edc08b8** each pass **66 INTL / 62 CN** groups, including creation and all 32 checkpoints of the 4×4 lesson. No fresh reproduction or evidence justifies a longer deadline, automatic retry or speculative solver change. The historical failure and production-latency acceptance remain open; the allowlisted error message in the runner will distinguish a future occurrence.

## Reliability changes, 2026-10-20

Cross-distance and 4×4 setup-table generation now uses direct base-24 indexing in the search loops, avoiding millions of temporary arrays. The entire cross-distance array and both center/wing parent and move arrays match the previous compiled implementation byte for byte: 190,080 reachable cross states and 12,144 ordered triples per 4×4 piece type. The move order, distances, guidance and resource limits are unchanged.

Worker failure handling now reserves the thread's capacity until termination completes. A timeout, crash or dispatch failure cannot start a replacement while the old thread is still retiring. Construction failures release the affected job instead of leaving it in the queue. Shutdown waits for retirement and rejects pending work; late messages cannot settle another request. Idle workers are unreferenced and active workers are referenced. Four controlled lifecycle tests cover timeout, late delivery, capacity, construction/dispatch errors and shutdown. There is no automatic retry or longer deadline.

A separate comparison used twelve fresh pinned cubing.js WCA 4×4 scrambles, each once with a new worker and once in a reused worker, in the same network-disabled two-CPU / 1,536 MiB / 256-PID runtime. All 24 complete plan hashes match the previous image, and every checkpoint reconstructs. Cold median was **444 ms before / 376 ms after**, with maxima **450 / 383 ms**. Warm medians were **37 / 36 ms**, including each series' first cold job. Measurements exclude the independent reconstruction. This small local sample supports lower startup cost; it does not explain `33fbb789` or establish production latency acceptance.

The expanded diagnostic passed **2,012 jobs**, including **812 4×4, 400 3×3, 400 2×2 and 400 Pyraminx**, with **38,384 independently reconstructed checkpoints**. Maximum 4×4 time was **448 ms**, median **35 ms**; other puzzle maxima were 7 / 3 / 7 ms. This ran concurrently with other local validation and is still not a production load test. The three-second deadline includes worker startup and first-use table generation, as before.

Validation passes **262 source / 263 integration tests**, workspace type checks, API/admin builds, and rebuilt regional Docker run **39a0257c** (**52 INTL / 48 CN**, 42 migrations). Four compiled solver files match the rebuilt image. Its API image is `sha256:8d2daa7057a8c3cad194ed2cb76b3526aaea6023ccde9273a997b672c8a4fdb4`; cached dependency/runtime bases were used without an upstream OS refresh. The preview API was refreshed with no active solve, all eleven recorded history-table hashes unchanged, and simulated tutoring and disabled hardware verified. Private evidence is in `.data/guidance-reliability/` and `.data/docker-smoke/39a0257c/report.json`.

## Earlier diagnostic

A separate synthetic probe used the actual compiled `FirstSolveSolver` in local API image `sha256:4ee485949a6951f1ab25dab5be2dcc5e664426fea7a70d9e4a00b4d86e5e1582`, Node 24.22.0, Linux/arm64, with no network, database, AI, ports or production data. The container retained the deployment's 1,536 MiB / two-CPU / 256-PID limits; worker limits stayed 64 MiB old generation, 16 MiB young generation, 4 MiB stack, six jobs and a three-second active deadline.

An initial 112 jobs passed. The expanded fixed-seed sample passed **2,012 jobs**: 12 new-worker 4×4 jobs and 2,000 sequential warm-worker jobs mixed between 4×4, 3×3 and 2×2. Every returned sequence was reconstructed independently from its starting facelets and had to reach a solved state. Expanded cold-job maximum was **434 ms** (median 425 ms); warm maximum was **418 ms**, p99 **37 ms**, median **17 ms**. These measurements are from an otherwise lightly loaded local container and exclude the caller's independent reconstruction time. They do not explain the earlier failure, certify physical scan accuracy, test production load/host pressure or establish an SLA. No production timeout, memory, queue limit or automatic retry was changed.

Reproduce against a locally built runtime image, redirecting the synthetic JSON report to a private file:

```sh
docker run --rm -i --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --pids-limit 256 \
  --memory 1536m --cpus 2 --entrypoint node YOUR_LOCAL_API_IMAGE - \
  < scripts/guidance-probe.cjs > /private/path/guidance-report.json
```

The current probe includes all four puzzles and checks every teaching checkpoint as well as the final solved state. It exits nonzero if any job fails and destroys every worker. It prints counts/timings, synthetic case indices, puzzles and safe worker errors; it loads no environment file. Earlier raw reports remain in ignored `.data/guidance-probe-*.json`; the current report is `.data/guidance-reliability/four-puzzle-probe.json`. The diagnostic does not replace production-load, native or physical-device acceptance.
