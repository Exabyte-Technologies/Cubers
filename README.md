# Cubers

![Cubers — connecting people through puzzles. Learn. Play. Connect.](artifacts/branding/cubers-social-preview.png)

<p align="center">
  <strong>Your next solve starts here.</strong><br />
  Learn a new puzzle, practice one turn at a time, and find people to cube with.<br />
  English · 简体中文 &nbsp; | &nbsp; iOS · Android · Web preview
</p>

<p align="center">
  <a href="#learn-one-turn-at-a-time">Explore the app</a> &nbsp; · &nbsp;
  <a href="#try-the-preview">Try the preview</a> &nbsp; · &nbsp;
  <a href="#for-developers">For developers</a>
</p>

## Learn one turn at a time

Cubers brings learning, practice, play and community into one place. Start with your first solve or work on a more advanced technique, with a colorful learning path and an interactive puzzle beside you.

Choose from **3×3, 2×2, 4×4 and Pyraminx**. Follow a pathway, open a unit, and work through its smaller lessons at your own pace. Beginner courses explain how the pieces fit together; advanced lessons help you recognize cases and practice more efficient solutions.

<p align="center">
  <img src="artifacts/screenshots/cubers-android36-learn-path-20261027.png" alt="Cubers beginner 3×3 pathway with a current-unit card and round lesson buttons" width="280" />
  <img src="artifacts/screenshots/cubers-android36-pathways-20261027.png" alt="Pathway selector offering beginner and advanced 3×3 and 2×2, 4×4 and Pyraminx" width="280" />
</p>

_Development screenshots from synthetic test sessions._

### Use the puzzle you have

- **Turn a virtual puzzle.** Explore the 3D view, try a move, undo it, and step through a demonstration.
- **Learn with your own cube.** Scan its colors or enter them manually. Stage lessons check your starting position, explain the next move, and guide you to that lesson’s goal.
- **Take a lesson with you.** Download teaching and supported practice for offline use. Local practice stays local; reconnect for verified progress.

Smart-cube connections are also being developed. Supported models remain disabled in production until physical testing passes.

## More than a solve

| Area         | What you can do                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Discover** | Read puzzle introductions, explore cubing stories, and take part in reviewed posts, discussions and clubs.         |
| **Learn**    | Follow beginner and advanced pathways, practice with interactive puzzles, and revisit lessons when you need them.  |
| **Play**     | Try friendly races, Pattern Chase, Algorithm Sprint, Cooperative Relay and daily challenges.                       |
| **Profile**  | See your own practice activity, solve history and milestones, with privacy controls and settings grouped by topic. |

Cubers supports English and Simplified Chinese, light and dark appearances, and reduced-motion demonstrations. Your profile reflects your own saved practice and milestones.

Community features include reporting, blocking and moderation. Younger learners have guardian-managed access and age-appropriate restrictions. Mainland China and international communities use separate accounts and services.

## Try the preview

**Cubers is in development and has not launched publicly or been approved for app-store distribution.**

The [preview builds and installation guide](docs/DEVELOPMENT-BUILDS.md#current-artifacts) include Android packages and unsigned iPhone review packages. These previews need a running Cubers server for connected features; iPhone installation also requires Apple signing.

AI replies in the preview are clearly labelled simulations. Camera scanning is still being tested on physical phones; smart-cube connections, ranked play and live AI are not enabled for production. See the [current project status](docs/STATUS.md) for progress and remaining work.

For support and privacy questions: **[support@exabyte.org.cn](mailto:support@exabyte.org.cn)**.

---

## For developers

This section covers the codebase, local setup, checks and contribution workflow. Start with the [complete development and production startup guide](docs/STARTUP-GUIDE.md) for the full npm, Docker, database, Redis, storage, mail, worker and deployment instructions.

### Architecture

| Location                         | Responsibility                                               | Main tools                                                   |
| -------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| [`apps/mobile`](apps/mobile)     | iOS, Android and browser app                                 | React Native, Expo Router, TypeScript, Three.js              |
| [`apps/api`](apps/api)           | Regional API, realtime games and background work             | NestJS, Prisma, PostgreSQL, Redis, Socket.IO                 |
| [`apps/admin`](apps/admin)       | Staff review and administration                              | React, TypeScript, role checks and administrator MFA         |
| [`packages/core`](packages/core) | Shared contracts, puzzle logic and authored curriculum       | TypeScript, Zod                                              |
| [`infra`](infra)                 | Containers, service isolation and deployment                 | Docker Compose, regional configuration                       |
| [`docs`](docs)                   | Feature behavior, verification evidence and operating guides | Start with [PLAN](docs/PLAN.md) and [STATUS](docs/STATUS.md) |

Regional installations keep accounts, databases, media, communities and competitions separate. The backend determines the community; client settings cannot override regional access checks. See [REGIONS.md](docs/REGIONS.md).

### Start locally

Use **Node.js 22.14 or newer**, npm and Docker Compose. Host media processing also needs **FFmpeg and FFprobe**. Camera and Bluetooth require a native Expo development build rather than Expo Go; Android builds need JDK 17 and the Android SDK, and iOS builds need Xcode on macOS.

For a fresh checkout:

```sh
npm ci --no-audit
test -f .env.local || cp .env.example .env.local
chmod 600 .env.local
npm run db:generate
npm run build:core
```

Keep an existing `.env.local`. For the Docker development services, set both `S3_ACCESS_KEY` and `S3_SECRET_KEY` in that private file to `S3RVER`. Keep `AI_MODE=mock` and real AI keys empty.

Start the development data services, then apply migrations and seed the authored lessons:

```sh
docker compose -f infra/compose.dev.yml up --build --detach
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma
node --env-file=.env.local --import tsx apps/api/prisma/seed.ts
```

Wait for PostgreSQL and Redis to be ready before migrating. The seed creates authored curriculum and initial settings; it does not create users, engagement or a production administrator. Mailpit captures verification and recovery emails locally. Volumes retain data across normal stops; avoid deleting them when keeping local history.

Run each of these in its own terminal:

```sh
npm run ai:mock
npm run dev:api
npm run dev:admin
```

For the browser app, use a separate terminal:

```sh
EXPO_PUBLIC_REGION=INTL \
EXPO_PUBLIC_API_URL_INTL=http://localhost:3000 \
EXPO_PUBLIC_API_URL_CN=http://localhost:3000 \
EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL=http://localhost:3000 \
npm run web -w @cubers/mobile
```

For a native development client, use `npm run dev:mobile` with the matching public endpoint settings. On a phone, `localhost` points to the phone itself; use a reachable server address. The [development build guide](docs/DEVELOPMENT-BUILDS.md) covers manual origins, standalone packages, Metro and debug controls.

| Local service                   | Default address or port                                    |
| ------------------------------- | ---------------------------------------------------------- |
| App / Metro                     | `http://localhost:8081`                                    |
| Admin                           | `http://localhost:4173`                                    |
| API / development API reference | `http://localhost:3000` / `http://localhost:3000/api-docs` |
| PostgreSQL / Redis              | `127.0.0.1:54329` / `127.0.0.1:6389`                       |
| Development S3 storage          | `http://127.0.0.1:9009`                                    |
| SMTP / Mailpit inbox            | `127.0.0.1:10259` / `http://localhost:8029`                |
| Mock AI                         | `http://127.0.0.1:4010/v1`                                 |

The startup guide also covers an alternative local-process service set, the private consent-document renderer, LAN access with `npm run dev:lan`, production HTTPS, backups and recovery. Run one service set at a time. Keep local services and Metro off the public internet.

### Contribute and verify

1. Read the [plan](docs/PLAN.md), [current status](docs/STATUS.md) and the relevant feature guide before changing behavior.
2. Preserve English/Chinese content, existing routes, saved progress, permissions and regional boundaries. Put synthetic accounts and media in isolated test environments.
3. Add focused checks for meaningful behavior changes, then run the checks appropriate to the affected workspaces.
4. Describe what changed, how it was verified, and any remaining device or operating limits. Do not present simulated-provider or emulator results as production acceptance.

```sh
npm run typecheck
npm test
npm run test:integration
npm run test:docker
npm run test:load
npm run export:web -w @cubers/mobile
```

Integration and load checks require local services and use separate test databases. Docker checks create disposable regional stacks and clean up their own resources. The load harness exercises 100 synthetic concurrent players; its results do not certify a production deployment. See [deployment verification](docs/DEPLOYMENT.md) and [container load checks](docs/CONTAINER-LOAD-TEST.md).

Keep AI credentials server-side. Never place keys in `EXPO_PUBLIC_` variables or commit private environment files. The admin can configure a provider’s API base URL and model, but live access requires credentials, validation and regional approval. See [AI moderation](docs/AI-MODERATION.md). This workspace currently uses mock providers and saved security-audit reports; fresh registry audit uploads are not authorized.

Production staff access uses the [staff enrollment and MFA workflow](docs/STAFF-ACCESS.md). `scripts/dev-reviewer.ts` is a separate local-only reviewer fixture; it must never provision production staff.

### Technical reference library

<details>
<summary><strong>Learning, scanning and puzzle logic</strong></summary>

- [Curriculum validation](docs/CURRICULUM.md), [guided first solves](docs/FIRST-SOLVE.md), [stage lessons](docs/STEP-LESSONS.md) and [placement assessments](docs/ASSESSMENTS.md).
- [Virtual cube controls](docs/VIRTUAL-CUBE-CONTROLS.md), [Pyraminx controls](docs/PYRAMINX-CONTROLS.md), [automatic scanning](docs/AUTOMATIC-SCANNING.md) and [scanner reliability](docs/SCANNER-RELIABILITY.md).
- [Last-layer coaching](docs/LAST-LAYER-COACHING.md), [alternative sequences](docs/LESSON-ALTERNATIVES.md), [lesson lifecycle](docs/LESSON-LIFECYCLE.md) and [learning authority](docs/LEARNING-AUTHORITY.md).
- [Offline lessons and reminders](docs/OFFLINE-LEARNING.md), [offline first-solve guidance](docs/OFFLINE-FIRST-SOLVE.md), [native offline acceptance](docs/OFFLINE-NATIVE-ACCEPTANCE.md) and [course editing](docs/COURSE-EDITING.md).
- [Smart-cube adapters](docs/SMART-CUBES.md), [smart lessons](docs/SMART-LESSONS.md) and [device-test evidence](docs/DEVICE-TEST-EVIDENCE.md).

</details>

<details>
<summary><strong>Community, profiles and play</strong></summary>

- [Discovery readings](docs/DISCOVERY.md), [community behavior](docs/COMMUNITY.md), [invitation continuation](docs/COMMUNITY.md#invitation-continuation), [announcements](docs/ANNOUNCEMENTS.md) and [notifications](docs/NOTIFICATIONS.md).
- [Profile privacy](docs/PROFILES.md), [session statistics](docs/SESSION-STATISTICS.md) and [achievement cards](docs/ACHIEVEMENT-CARDS.md).
- [Server WCA scrambles](docs/WCA-SCRAMBLES.md), [mixed-input rooms](docs/MIXED-ROOMS.md), [cooperative relay](docs/COOPERATIVE-RELAY.md), [competitions](docs/COMPETITIONS.md) and [category rankings](docs/CATEGORY-RANKINGS.md).
- [Smart room games](docs/SMART-PLAY.md), [smart competitions](docs/SMART-COMPETITIONS.md), [virtual replays](docs/REPLAYS.md), [smart replays](docs/SMART-REPLAYS.md) and [anonymous replay sharing](docs/REPLAY-SHARING.md).

</details>

<details>
<summary><strong>Safety, media and service security</strong></summary>

- [Private consent-document review](docs/CONSENT-DOCUMENTS.md), [bilingual service messages](docs/BILINGUAL-SERVICE-MESSAGES.md), [operator details](docs/OPERATOR.md) and [sponsor controls](docs/SPONSORS.md).
- [Attachment labels](docs/MEDIA-AI-LABELS.md), [image/container security](docs/IMAGE-SECURITY.md), [dependency review](docs/DEPENDENCY-SECURITY.md) and [bundled-runtime review](docs/RUNTIME-SECURITY.md).
- [Video and image source labels](docs/VIDEO-AI-PROVENANCE.md), [Apple receipt refresh](docs/APPLE-RECEIPT-REFRESH.md), [periodic receipt updates](docs/APPLE-PERIODIC-RECEIPTS.md) and [certificate status](docs/APPLE-CERTIFICATE-STATUS.md).

</details>

<details>
<summary><strong>Operations, recovery and release</strong></summary>

- [Startup runbook](docs/STARTUP-GUIDE.md), [deployment](docs/DEPLOYMENT.md), [web companion](docs/WEB-COMPANION.md) and [signed alert delivery](docs/OPERATIONAL-DELIVERY.md).
- [Deletion recovery](docs/RECOVERY.md), [database snapshots](docs/DATABASE-SNAPSHOTS.md), [media privacy decisions](docs/MEDIA-RECOVERY.md), [encrypted media vault](docs/MEDIA-VAULT.md) and [isolated media restoration](docs/MEDIA-RESTORE.md).
- [Media maintenance](docs/MEDIA-MAINTENANCE.md), [snapshot expiry](docs/SNAPSHOT-EXPIRY.md), [vault metadata retirement](docs/VAULT-METADATA-EXPIRY.md) and [journal retention](docs/JOURNAL-RETENTION.md).
- [Fresh-source mobile setup](docs/MOBILE-BUILD-SETUP.md), [Android builds](docs/ANDROID-BUILD.md), [iOS builds](docs/IOS-BUILD.md) and [development packages](docs/DEVELOPMENT-BUILDS.md).
- [Store materials](docs/STORE-PACKAGE.md), [release requirements](docs/RELEASE.md) and an [earlier unsigned Android review snapshot](artifacts/android/Cubers-0.1.0-arm64-unsigned-review-20261025.md).

</details>

### Production boundary

Production configurations fail closed until the required services and approvals are configured. Signed builds, real-device camera/Bluetooth acceptance, operator commissioning, privacy and moderation procedures, regional filings and store review remain separate launch requirements. The [release checklist](docs/RELEASE.md) and [implementation status](docs/STATUS.md) are the authoritative places to track them.
