# Profile activity calendar backend

Implemented a read-only owner endpoint, `GET /v1/me/activity?timeZone=<named IANA zone>`, with an exported `ActivityCalendar` contract. Existing authentication and community guards apply; caller-supplied owner IDs and other unknown query fields are rejected. Responses are private/no-store and rate-limited.

The response contains exactly365 chronological local civil dates (today plus364 prior dates), zero-filled rather than fabricated. Each day exposes completed lesson sessions, completed guided solves, approved race/daily solves, and their total. Totals, active days, current streak (today or yesterday if today is unfinished), and longest streak cover the same365-day window. Local calendar arithmetic handles DST and leap days; server aggregation maps stored UTC timestamps into the named zone. Future events, incomplete/rejected/provisional results, invalid durations, other game modes and other owners are excluded.

One parameterized PostgreSQL aggregate reads the three independent completion ledgers. Guided completion controllers update Progress but do not create mirrored LessonSession entries, so those counts are not duplicated. Progress snapshots are not used to reconstruct missing activity. No move sequences, IDs, personal details or source rows leave the endpoint; no schema or migration change is required.

Files:

- `packages/core/src/activity-calendar.ts` and its index export.
- `apps/api/src/profile.controller.ts`.
- `tests/activity-calendar.test.ts` (five pure behavior cases).
- `tests/helpers/activity-calendar-cases.ts` registered once in the existing integration harness.

Validation:

- Core build passes.
- API build passes.
- Five source cases pass (365 dense dates/leap day, local date/DST, count categories/window clipping, streak behavior, malformed/unbounded data).
- One authenticated PostgreSQL/API integration case passes. It checks timezone midnight boundaries, absence/cross-region ownership, strict query validation, incomplete/future/old/result exclusions, private no-store, no identity/telemetry and activity from more than1000 underlying events.
- Focused integration command: `TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test --test-name-pattern='private activity calendar' tests/integration/backend.test.ts`.
- Local logs: `.data/hum-design/activity-{core-build,api-build,source-tests,integration}.log`.

No real AI, protected saved credentials, production activation or main-app history was used. The integration harness used its reserved local test databases and cleaned its temporary3101/3102 API processes. The normal local API needs its usual restart to serve the newly compiled route.
