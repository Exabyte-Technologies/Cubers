# Packaged Linux player-load checks

The existing 100-player runner now supports an isolated container runtime. It exercises the packaged API with its configured two-CPU, 1,536 MiB and 256-PID limits, a non-root user, read-only root filesystem and dropped capabilities. PostgreSQL and Redis are newly created for each run; no host preview, existing database, private environment file or production installation is targeted.

The runner accepts four exact, already cached image IDs for the API, migrations, PostgreSQL and Redis. It never pulls an image or performs an npm audit. Configuration comes from the public `.env.example`, with private random credentials for the disposable database, AI disabled and public-release approval false. A dedicated Docker bridge carries internal traffic, and all published test ports bind to loopback. Each region receives a separate bridge, volumes, accounts and cache. The development preview is left running.

## Reproduce

Use current, independently reviewed local images. The API and migration image must come from the same source/dependency build. No build or dependency update is performed by the load runner. For each region, set all four complete immutable IDs and run from the repository root:

```sh
CUBERS_LOAD_RUNTIME=container \
CUBERS_LOAD_REGION=INTL \
CUBERS_LOAD_API_IMAGE=sha256:YOUR_API_IMAGE_ID \
CUBERS_LOAD_MIGRATIONS_IMAGE=sha256:YOUR_MIGRATIONS_IMAGE_ID \
CUBERS_LOAD_POSTGRES_IMAGE=sha256:YOUR_POSTGRES_IMAGE_ID \
CUBERS_LOAD_REDIS_IMAGE=sha256:YOUR_REDIS_IMAGE_ID \
NPM_CONFIG_AUDIT=false TSX_TSCONFIG_PATH=apps/api/tsconfig.json \
node --import tsx scripts/load-test.ts
```

Replace `INTL` with `CN` for a separate mainland test. The API uses port 3105 internationally and 3106 for mainland tests; an occupied port causes refusal before any service is created. Database/cache ports are assigned by Docker on loopback and verified before use. Complete private diagnostic files and cleanup records go into a new `.data/container-load/<run-id>/` directory. Aggregate results go into a uniquely named `artifacts/load-test-container-<region>-<run-id>.json`. Earlier host-only reports are preserved. The original host test remains the default when `CUBERS_LOAD_RUNTIME` is omitted.

## Workload and shutdown

One hundred synthetic adult accounts connect through real Socket.IO WebSockets across thirteen private virtual 3×3 race rooms. The server generates shared WCA scrambles. Clients reconstruct their solutions, then send a minute of paced turns and room refreshes. The runner requires all one hundred solves to be approved and records request/acknowledgement percentiles and failures. It then creates another one hundred unfinished solves and sends a real termination signal to the specifically owned API container. A passed result requires all unfinished solves to persist as interrupted, all connection leases to disappear, graceful process exit, synthetic-row deletion and removal of all owned test containers, volumes and networks.

The API uses `NODE_ENV=test` for synthetic virtual-ranking permissions. Mainland game approval is enabled only inside that disposable test configuration. This does not activate production rankings, app-attestation providers, smart devices, public release or mainland operation. The load does not use real identity review, minors, camera/video, AI or external services.

## Limits of the evidence

These checks measure one packaged Linux API process, PostgreSQL and Redis in Docker Desktop, with clients on the same Mac. The CPU/memory limits match the API deployment settings; the temporary filesystem is smaller than production. The dedicated bridge can route normally, but this workload requires no external provider. TLS/proxy load, internet delay, media upload/transcoding, operating moderation, real regional infrastructure and physical devices are outside this sample. This is local capacity evidence, not production capacity certification or an availability commitment. Multi-instance WebSocket fanout and sticky routing remain unimplemented; keep the documented single-process/eight-player-per-room limits until a separate scaling design is validated.

The historical 4×4 guidance failure is separate: this workload does not reproduce or resolve it. See [GUIDANCE-DIAGNOSTIC.md](GUIDANCE-DIAGNOSTIC.md).

## Recorded run, 2026-10-25

| Region / run    | Players | Sustained traffic | Operations | Failures | Approved solves |       p95 |       p99 |
| --------------- | ------: | ----------------: | ---------: | -------: | --------------: | --------: | --------: |
| INTL `c6f2ed66` |     100 |           65.24 s |     16,673 |        0 |             100 | 260.16 ms | 402.50 ms |
| CN `5a9a7f59`   |     100 |           65.37 s |     16,661 |        0 |             100 | 265.02 ms | 589.56 ms |

Both runs interrupt all 100 additional unfinished solves during actual API shutdown, leave zero connection leases, remove their synthetic rows and independently leave zero owned containers, networks or volumes. All 13 saved preview history tables match the preceding milestone; migration 46 and zero active preview attempts remain unchanged. Exact image IDs are retained in the aggregate reports. The API and migration images match the preceding certificate-status milestone, so application sources and native builds are unchanged. AI is disabled throughout these tests.

Initial setup attempt `38cc328c` failed before creating accounts because Docker's internal-only network did not publish the requested host ports. Cleanup removed all resources. The final dedicated bridge uses verified loopback-only bindings; no network isolation or public deployment is claimed beyond the stated configuration. The original failure/cleanup record is preserved.

The existing host-mode control also passes with 100 players, 16,667 operations, zero failures and 114.30 ms p95, including the same 100-solve shutdown and zero-lease assertions. Its previous report is retained privately before writing the refreshed aggregate. Strict TypeScript checks of both runner modules and formatting pass. No broad application regression suite is repeated for this runner-only change; the packaged application files still match the preceding verified image hashes.
