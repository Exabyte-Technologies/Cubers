# Pathway and profile layout correction

Updated: 2026-10-26. The supplied Duolingo screenshots now guide the actual app composition while Cubers retains Hum's cream paper, rounded Chillax, pear actions, blue focus and mint progress. This supersedes the earlier lesson-list/long-profile composition.

## Learn

The fixed top area shows the chosen pathway and current unit. Tapping the unit opens all its units; the sheet also switches pathways. Beginner/Advanced3×3, Beginner/Advanced2×2,4×4 and Pyraminx use the existing published catalog, including algorithm-case collections. The main view is a narrow winding trail of round lesson controls, with the following unit preview below. No pretend currency, hearts, locks or rewards were introduced.

A published course is the unit; each ordinary unit's authored teaching steps become finer lesson nodes. A node's sheet presents that authored instruction and opens `/lesson/:id?step=N` at the matching step, with the instruction visible above the puzzle. Invalid/out-of-range steps safely select the first step. Guided whole solves retain their one validated entry point and never jump into unverified stages. Canonical unit checkpoints still verify completion: visiting or opening a node awards nothing; the UI explains that completing the unit's practice completes its smaller lessons. This is not a claim of separately persisted per-step grades.

Practice recommendations, placement, downloads, physical case recognition and the existing case/puzzle disclosures remain reachable through Practice & downloads and unit selection. Previously completed revisions remain in private history; current completion follows the published revision. No invented yellow-daisy course is advertised: the existing white-cross/first-layer/middle-layer/last-layer units retain their actual authored content.

## Profile and settings

Profile leads with the real avatar, identity/privacy state, top-right gear and friendship/club actions. Overview shows real streak, current-revision lessons, approved solves and active days. The year calendar contains365 daily squares with count intensity, dated accessible labels, timezone and an optional textual daily breakdown. A successful verified practice was exercised through the UI and appeared in this calendar using the isolated review account.

Overview/History/Goals/Posts tabs retain detailed solve statistics, history filters/pagination, earned milestones, replay actions, contribution status and goals. Configuration is behind the gear at `/settings`, with keyboard-accessible Account, Profile & privacy, Learning & devices, Family & safety and Notifications tabs. Editable identity/sharing, goal management, downloads/reminders, device options, guardian controls, policy/support, export, session revocation, sign-out and confirmed account deletion remain. Selected tabs expose explicit web selected-state semantics. Destructive actions and warnings were preserved; no deletion or session-revocation action was executed during layout checks.

Discover now groups Community, Explore cubing and Updates; Play uses round mode selectors, a selected-mode action, grouped room options and content tabs. Existing safety notices and backend room payloads remain.

## Private activity API

`GET /v1/me/activity?timeZone=<named IANA zone>` adds the typed `ActivityCalendar` response. Authentication, regional ownership, strict query validation, rate limits and private/no-store caching apply. It aggregates actual completed lesson sessions, completed guided solves and approved race/daily solves over365 local calendar days. Zero days are explicit; future/incomplete/provisional/rejected activity is excluded. Civil-day handling covers DST and leap days; streaks cover this same trailing-year window. The query groups in PostgreSQL rather than fetching unbounded move histories. No identities, moves, source records or caller-selected owner IDs are returned. No schema or migration change was needed.

## Verification

- **416/416 source tests pass**, including five activity-calendar and three pathway/deep-link cases. The final eight focused cases also pass after the final copy fixes.
- **299/299 authenticated backend cases pass** in `tests/integration/backend.test.ts`, including actual timezone/ownership/privacy aggregation with more than1000 fixture events. Other integration files were not rerun for this UI/read-endpoint change.
- Workspace type checks pass. **Nine isolated browser scenarios pass**: pinned header and round nodes; all-unit selection; advanced/4×4 switching; exact lesson step; mock AI; verified practice/calendar; gear/categories; settings keyboard controls; Discover/Play navigation. No real AI or protected saved credentials were used.
- **15 screen configurations /33 overlapping screen captures** cover1440px desktop and375px phone, English/Chinese, light/dark, full scroll content and the three chooser dialogs. Page errors, resource warnings and document horizontal overflow are zero in this capture set. Intended tab/calendar areas scroll horizontally.
- Hallmark: **0 FAIL /0 REFLEX /0 WARN** across79 mobile source files and the original preview URL; two preserved date-range punctuation notes remain. The sampled sign-in retains3/3 links,2/2 fields,16/16 handlers and1/1 headings. These counts describe that sampled baseline, not every screen.
- Independent finish review confirms the requested reference layout matches. Its two copy findings (repeated instruction and singular counts) were fixed and visually confirmed. No open Floor or Reflex finding remains.
- All34 original Profile API/router forms are retained across Profile/details/settings. Discover and Play retain their2+8 original direct API/router forms. Unit/course coverage tests ensure every published course is represented once.
- All13 main saved-history tables match this task's starting hashes, with migration46 and no active attempts. Interface/lesson activity tests used a separate synthetic review database. No existing history was reset or reverted.
- Web/iOS/Android exports and unsigned native builds pass. Android and iPhone static inspections pass, both unchanged bundled fonts are present, and the iPhone archive exactly matches its built files. All five native/export source maps match107 current mobile source files each.

## Outputs

- [Learn preview](http://localhost:8081/learn), [Profile preview](http://localhost:8081/profile), [Settings preview](http://localhost:8081/settings).
- [Layout comparison](../.hallmark/pathway-compare.html), [captured screens](../.hallmark/pathway-captures/), [independent review](../.hallmark/pathway-finish-review.md).
- [Android unsigned review APK](../artifacts/android/Cubers-0.1.0-arm64-unsigned-review-20261026-pathways.apk).
- [Unsigned iPhone app archive](../artifacts/ios/Cubers-0.1.0-iphone-release-unsigned-20261026-pathways.app.zip).
- Exports: `apps/mobile/dist-pathways-20261026`. Private machine-readable evidence/hashes: `.data/pathway-layout/verification.json`.

Builds retain reserved `.invalid` service addresses. Physical-device camera/Bluetooth/accessibility acceptance, signing, production deployment, real AI credentials, store submission and regulatory clearance remain separate release requirements; their gates were not activated.
