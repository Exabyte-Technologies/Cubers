# Starting Cubers: development and production

Run commands from the repository root unless a step says otherwise. Cubers is a Node/npm workspace: `apps/api` is the NestJS API and background worker, `apps/admin` is the staff web panel, `apps/mobile` is the Expo app and web companion, and `packages/core` is shared code. PostgreSQL stores accounts/content/progress; Redis backs queues and short-lived coordination; an S3-compatible service stores media; SMTP sends verification and recovery mail. AI can stay on the local mock in development and disabled in production. Scrambles are generated in the Node API; no Java scramble server is required.

**Release state:** the two regional backends are not deployed. This guide explains how to prepare and start a reviewed installation; it does not authorize changing `PUBLIC_RELEASE_APPROVED`, mainland feature flags, signing or store submission. Use [STATUS.md](STATUS.md) and [RELEASE.md](RELEASE.md) to track the remaining device, service, legal and operator gates.

## 1. Prerequisites and layout

| Purpose           | Development                                                            | Production                                                                          |
| ----------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Runtime           | Node.js **22.14+**, npm, Git                                           | Docker Engine with Compose; the Dockerfiles provide Node, FFmpeg/FFprobe and Prisma |
| Data              | Docker Compose PostgreSQL 17 and Redis 7, or the local service scripts | Separate PostgreSQL 17 and Redis 7 containers for **each** regional installation    |
| Media and mail    | Development S3 emulator and Mailpit, or the local gateway script       | Operator-managed private regional S3-compatible bucket and SMTP provider            |
| Video processing  | FFmpeg and FFprobe available on the API/worker host's `PATH`           | Included in the API/worker Docker image                                             |
| Consent PDFs      | Docker plus the private document renderer bridge for the host API      | Isolated `documents` container and its private socket volume                        |
| Browser/native UI | Expo web, Expo development build, Vite admin                           | Reviewed web/admin images plus separately signed native builds                      |

Install a working Docker Engine and `docker compose` if using containers. Native iOS builds additionally require macOS/Xcode; Android builds require the Android SDK/JDK described in [ANDROID-BUILD.md](ANDROID-BUILD.md). Expo Go cannot run this app's camera and Bluetooth modules. Use a development build for those features.

Host development media workers need **both** `ffmpeg` and `ffprobe`; the development Compose services do not install them on your host. Install the FFmpeg package through your operating system's trusted package manager (`brew install ffmpeg` on a Mac already using Homebrew, or `sudo apt-get install ffmpeg` on Debian/Ubuntu), then check both commands:

```sh
ffmpeg -version
ffprobe -version
docker version
docker compose version
```

On Docker Desktop, start the desktop application and wait for its engine to be ready before the Compose commands. `docker version` must show a Server section as well as the client. A Docker socket/daemon error is an environment problem to resolve before starting containers.

The examples use port **3000** for the API, **4173** for admin, **8081** for Expo web, **54329** for development PostgreSQL, **6389** for development Redis, **9009** for development S3, **10259** for development SMTP and **8029** for Mailpit's browser inbox. Development services bind to loopback. Do not expose them or Metro to the public internet.

## 2. Local development: install and configure

```sh
cd /path/to/Cubers
node --version                    # Must satisfy package.json: >=22.14
npm --version
npm ci --no-audit
cp .env.example .env.local
chmod 600 .env.local
npm run db:generate
npm run build:core
```

The root lockfile and all workspaces must stay together. `npm ci --no-audit` installs locked dependencies and does not request a fresh npm security audit. Do not paste `.env.local`, tokens or database URLs into logs or chat. The example is for **INTL** development; `REGION=INTL` makes the server choose its configured development community without a production IP-provider call.

For the recommended Docker development services, edit **only your private** `.env.local` to set both `S3_ACCESS_KEY` and `S3_SECRET_KEY` to `S3RVER`. Keep the example database URL (`127.0.0.1:54329/cubers`), Redis URL (`127.0.0.1:6389`), SMTP URL (`127.0.0.1:10259`) and S3 endpoint (`127.0.0.1:9009`). `AI_MODE=mock`, `AI_BASE_URL=http://127.0.0.1:4010/v1` and empty AI keys use the local simulator.

### 2A. Start PostgreSQL, Redis, media and mail with Docker

```sh
docker compose -f infra/compose.dev.yml config --quiet
docker compose -f infra/compose.dev.yml up --build --detach
docker compose -f infra/compose.dev.yml ps
docker compose -f infra/compose.dev.yml exec postgres pg_isready -U cubers -d cubers
docker compose -f infra/compose.dev.yml exec redis redis-cli ping
```

This starts PostgreSQL (`cubers` database, user `cubers`), Redis with append-only persistence, a development S3 emulator with separate `cubers-intl` and `cubers-cn` buckets, and Mailpit. Its volumes retain data across a normal stop. The `.env.example` password is **development-only** and must never be reused for production. In another terminal, start the simulated AI endpoint:

```sh
npm run ai:mock
```

Mailpit's local inbox is `http://localhost:8029`. Verification/reset links are captured there; no public mail is sent by this development stack. On restart, use `docker compose -f infra/compose.dev.yml up --detach`; avoid `down --volumes` if you want to keep local data.

### 2B. Alternative: local processes instead of Docker services

On a supported development host with `redis-server` available, use **two other terminals**:

```sh
node scripts/local-services.mjs
node --openssl-legacy-provider scripts/local-gateways.mjs
```

The first script runs embedded PostgreSQL 17 in ignored `.data/postgres` and Redis on loopback. The second runs filesystem-backed S3, SMTP capture and mock AI; messages are private files under ignored `.data/mail`. Set both S3 credentials in `.env.local` to `S3RVER` for this option too. Stop these processes cleanly before switching to option 2A; they use the same ports. Do not run both service sets together. This local option is a development aid, not a production substitute for PostgreSQL, Redis, object storage, SMTP or backup custody.

### 2C. Create the schema and authored curriculum

After the selected service set is ready:

```sh
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma
node --env-file=.env.local --import tsx apps/api/prisma/seed.ts
```

The first command applies the checked-in Prisma migrations. The second creates/updates authored lessons and initial settings; it does **not** create a normal user or a production administrator. Do not run migrations or the seed against an unreviewed existing database. To inspect local data without altering it, connect a PostgreSQL client to `127.0.0.1:54329` using the values in your own `.env.local`.

### Private consent-document service

For the complete guardian/staff consent-document workflow, build the isolated renderer and start its host bridge in another terminal. Docker remains required for this service even if you chose local PostgreSQL/Redis processes:

```sh
docker build -f infra/Dockerfile.documents -t cubers-documents:local .
node scripts/local-document-review.mjs
```

Wait for `Private local document review ready`. Set `CONSENT_REVIEW_SOCKET` in your private `.env.local` to the **absolute** socket path it prints (normally `/path/to/Cubers/.data/local-documents.sock`) before starting the API. The renderer accepts private requests through this Unix socket and has no public port. If it is omitted, ordinary app features can run, but PDF page review is unavailable and consent approval cannot complete. The bridge refuses an existing socket; inspect its owning process/container before recovering an interrupted run. Stop the bridge normally when finished. See [CONSENT-DOCUMENTS.md](CONSENT-DOCUMENTS.md) for its isolation and recovery details.

### LAN development on this Mac

After the local-process prerequisites and private `.env.local` are ready, `npm run dev:lan` starts the saved local data services, gateways, compiled API, admin and app/Metro together. Stop an existing service set first: this launcher refuses occupied ports. It uses the current LAN IPv4 address, binds only the API/app/admin/development storage for LAN clients, and leaves PostgreSQL, Redis, SMTP and mock AI on loopback. It keeps AI mocked and release flags off, and never seeds the saved database. Keep its terminal running; Control-C stops its own children and retains data. The private PDF bridge above is still started separately.

Use the printed LAN web URL on the Mac as well as phones so browser origins match the configured API origins. Rebuild the compiled API after backend edits before restarting. This is a development-only alternative to running the local services and clients separately below; do not run both service sets together. Manual address entry and the standalone/Metro APK and unsigned IPA are described in [DEVELOPMENT-BUILDS.md](DEVELOPMENT-BUILDS.md). The outside, machine-specific guide is `/Users/jingwen.hu/Downloads/Cubers-Local-Development.md`.

### 2D. Start the API, staff panel and app

Use separate terminals, all from the repository root:

```sh
npm run dev:api
npm run dev:admin
```

For a browser preview, in another terminal set **public development addresses** and start Expo web:

```sh
EXPO_PUBLIC_REGION=INTL \
EXPO_PUBLIC_API_URL_INTL=http://localhost:3000 \
EXPO_PUBLIC_API_URL_CN=http://localhost:3000 \
EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL=http://localhost:3000 \
npm run web -w @cubers/mobile
```

Open `http://localhost:8081` for Cubers and `http://localhost:4173` for admin. Vite proxies admin `/v1` requests to `127.0.0.1:3000`. API documentation is at `http://localhost:3000/api-docs`; verify readiness with:

```sh
curl --fail http://localhost:3000/v1/health
```

The response should report `status: ok`, `region: INTL` and `aiMode: mock`. Browser registration sends a verification message to the local inbox. A regular account must register and verify; there is no fixed public default password. An optional **development-only** reviewer fixture is documented in [STAFF-ACCESS.md](STAFF-ACCESS.md) and `scripts/dev-reviewer.ts`. It writes random credentials to ignored `.data/reviewer.json` and must never be run against production.

To test native iOS/Android, build a development client as described in [IOS-BUILD.md](IOS-BUILD.md) or [ANDROID-BUILD.md](ANDROID-BUILD.md). Start Metro from `apps/mobile` using `expo start --dev-client`. If web already occupies 8081, choose another Metro port such as 8091. Point all three public API/discovery variables to an address reachable **from the device**: an iOS simulator can use host `localhost`; an Android emulator can use `10.0.2.2`; a physical phone needs a trusted private-network host and firewall. These are public **origins**, not API-key locations. Keep mock AI on the server. Do not put any secret in an `EXPO_PUBLIC_` variable.

For example, with the API on the host's port 3000 and an Android emulator, start Metro from the repository root like this, then open the installed development client and enter `exp://10.0.2.2:8091` if automatic server discovery finds nothing:

```sh
cd apps/mobile
EXPO_PUBLIC_REGION=INTL \
EXPO_PUBLIC_API_URL_INTL=http://10.0.2.2:3000 \
EXPO_PUBLIC_API_URL_CN=http://10.0.2.2:3000 \
EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL=http://10.0.2.2:3000 \
npx expo start --dev-client --port 8091
```

An iOS simulator can use `localhost` in place of `10.0.2.2`. Use the matching address when compiling the native development build as well; an unsigned review package is not an installable development client. The exact native build, SDK/signing and real-device procedures are in the platform runbooks linked above.

The [Android 36 development smoke check](ANDROID-RUNTIME-20261027.md) exercised this manual Metro connection with a separately isolated API on port 3104. The normal setup in this guide uses port 3000; use the actual port consistently in your client addresses.

### 2E. Stop and check development

Stop the API, Vite, Expo, mock AI and local-service terminals with their normal interrupt. For Docker services:

```sh
docker compose -f infra/compose.dev.yml down
```

`down` preserves named data volumes; `down --volumes` destroys them. To recheck code before a change or build, run `npm run typecheck`, `npm test` and `npm run test:integration` with the selected local services running. `npm run test:docker` creates **disposable** regional test stacks; it is separate from the persistent development services. The full checks and their limits are in [DEPLOYMENT.md](DEPLOYMENT.md) and [STATUS.md](STATUS.md).

## 3. Production: one isolated deployment per community

Repeat the following preparation independently on one **INTL** host and one **CN** host. Use distinct DNS names, PostgreSQL and Redis volumes, S3 buckets/IAM credentials, SMTP credentials, AI/provider accounts if later enabled, recovery journals, encryption keys, backups and operator access. Never point both communities at one database or bucket. The production Compose file runs PostgreSQL, Redis, one-shot `migrate` and `seed` services, API, background worker, separate monitor, private document renderer, admin, web and Caddy HTTPS proxy. Only Caddy publishes host ports 80/443; S3 and SMTP are external. The API/worker images include FFmpeg/FFprobe and the Node scramble generator.

### 3A. Commission prerequisites before public traffic

1. Provide regional hosts, DNS and HTTPS names for **app**, **API**, **admin** and the neutral community-discovery service. Point DNS to the intended hosts and verify routing/TLS. The supplied `exabyte.org.cn` and `juyuanqin.com` are corporate sites, not deployed Cubers API endpoints. The neutral discovery edge is **not** created by either regional Compose project; commission it separately as described in [REGIONS.md](REGIONS.md).
2. Provision separate private S3-compatible buckets with encryption, least-privilege access, version/replica lifecycle and tested deletion; provision regional SMTP with actual deliverability. Keep database and Redis private. Configure firewall rules and reviewed egress, including the production IP-location provider described in [REGIONS.md](REGIONS.md).
3. Set up backups, independent deletion-journal/key custody, monitoring, alert recipients and operator MFA. Test restoration into an isolated sealed target and deletion replay before public use. See [RECOVERY.md](RECOVERY.md), [DATABASE-SNAPSHOTS.md](DATABASE-SNAPSHOTS.md), [MEDIA-VAULT.md](MEDIA-VAULT.md) and [OPERATIONS.md](OPERATIONS.md).
4. Finish the actual device, legal, filing, moderation, service and store gates in [RELEASE.md](RELEASE.md). A working Compose stack is not approval to expose the product.

### 3B. Create one private environment file on each host

```sh
cp .env.production.example .env.production
chmod 600 .env.production
```

Edit `.env.production` privately. Set `REGION` to exactly `INTL` or `CN`. Replace **every** `REPLACE_WITH_`, `example.invalid` and sample credential with that installation's actual reviewed value. In particular:

| Configuration                                                                               | Required relationship                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`, `DATABASE_URL`                                                         | The URL uses user `cubers`, host `postgres`, port `5432`, database `cubers` and the **same password**, URL-encoded in the URL. Use a unique secret per region.                                    |
| `REDIS_URL`                                                                                 | `redis://redis:6379` reaches only that Compose project's private Redis. Do not publish it.                                                                                                        |
| `API_DOMAIN`, `ADMIN_DOMAIN`, `APP_ORIGIN`, `ADMIN_ORIGIN`, `TLS_EMAIL`                     | Use owned HTTPS/DNS names; `APP_ORIGIN` is the public Cubers web host, separate from API/admin. Caddy obtains certificates only when DNS/ports/issuer access work.                                |
| `EXPO_PUBLIC_API_URL_INTL`, `EXPO_PUBLIC_API_URL_CN`, `EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL` | Public, real HTTPS origins for both independent APIs and discovery. They are embedded when building the web/native clients, so rebuild clients after a change. Never include a key or a URL path. |
| `SMTP_URL`, `MAIL_FROM`                                                                     | Real regional mail transport and verified sender. Test verification, recovery, deletion and invitation mail.                                                                                      |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_SSE`         | Private regional bucket and scoped credentials, with lifecycle/erasure checks. Do not use development S3rver.                                                                                     |
| `DELETION_JOURNAL_*`, `CUBERS_*_HOST_DIRECTORY`                                             | Distinct owned absolute directories/key files outside the DB backup. Initialize/bind them once using the recovery operator before API/worker startup.                                             |
| `AI_MODE`, `AI_BASE_URL`, `AI_MODEL`, allowed-host lists and AI keys                        | Keep `AI_MODE=disabled` while the user has not supplied a real key/provider. A future live provider needs separate commissioning and moderation checks; keep keys server-side.                    |
| `PUBLIC_RELEASE_APPROVED`, `CN_*_APPROVED`, `SPONSORS_APPROVED`, app-attestation flags      | Keep false until the corresponding **actual** approval and technical acceptance. Setting a flag is not evidence of approval.                                                                      |

The full parameter list and optional alert/attestation settings are in [`.env.production.example`](../.env.production.example). The API validates production HTTPS, non-mock AI, recovery journaling and the public-release gate on startup. Leave `PUBLIC_RELEASE_APPROVED=false` during preparation; API and worker refusal is then expected. Keep the file out of Git, container images, tickets and logs. If the file is outside the repo, set `CUBERS_ENV_FILE` to its absolute path as well as passing it to Compose with `--env-file`.

### 3C. Prepare recovery and validate Compose

Create the journal, key and operator-request directories named in that host's environment file as real private directories. The containers run as UID/GID **1000:1000** for these paths; match ownership and mode `0700`, and use `0600` for private request/key files. Do not use symlink paths or mount a key inside the journal. Prepare a region-specific `initialize` request with the exact fields and confirmation in [RECOVERY.md](RECOVERY.md). Review the target database and region before invoking it; do not initialize over existing accepted history.

Check syntax **without printing expanded secrets**:

```sh
docker compose --env-file .env.production \
  -f infra/compose.production.yml -f infra/compose.recovery.yml config --quiet
```

Pin and review base/image digests and build the matching API, migrations, worker, admin, web, documents and proxy images before release. The Dockerfiles use `npm ci --no-audit`; this does not perform a fresh npm audit. The base tags in the example are starting points, not an approved image provenance decision.

```sh
docker compose --env-file .env.production \
  -f infra/compose.production.yml -f infra/compose.recovery.yml build --pull
```

Compose normally orders healthy PostgreSQL → one-shot Prisma migrations → one-shot authored seed → worker/API. **Migrations can alter the database even if the release gate later blocks API startup.** On a new installation, prepare only the private data services first, then run the matching one-shot images:

```sh
docker compose --env-file .env.production \
  -f infra/compose.production.yml -f infra/compose.recovery.yml \
  up --detach --no-build --wait postgres redis
docker compose --env-file .env.production \
  -f infra/compose.production.yml -f infra/compose.recovery.yml \
  run --rm --no-deps migrate
docker compose --env-file .env.production \
  -f infra/compose.production.yml -f infra/compose.recovery.yml \
  run --rm --no-deps seed
```

Create an owned, mode-`0600` `request.json` in the configured `CUBERS_OPERATOR_REQUEST_HOST_DIRECTORY`. For a **new, empty INTL installation only**, the request is:

```json
{
  "operation": "initialize",
  "region": "INTL",
  "databaseHost": "postgres",
  "databaseName": "cubers",
  "confirmation": "INITIALIZE RECOVERY"
}
```

Use `CN` instead on the separate mainland installation. Confirm the target host, empty journal and absence of an existing binding before running the operator; initialization creates the private key file and regional database binding. The key and journal must live outside the database snapshot and have independent custody.

```sh
docker compose --profile operations --env-file .env.production \
  -f infra/compose.production.yml -f infra/compose.recovery.yml \
  run --rm --no-deps recovery-operator
```

For a subsequent **read-only validation**, replace that private request with `{"operation":"check","region":"INTL","databaseHost":"postgres","databaseName":"cubers","confirmation":"CHECK RECOVERY"}` (or `CN` on its own host) and run the same operator command. A pending replay returns a nonzero status and needs operator review. [RECOVERY.md](RECOVERY.md) explains that status, replay and pre-start reconciliation; do not replace a key or clear accepted history to resolve an error. On an upgrade, stop old API/worker processes, take a verified regional backup, review new migrations and never run incompatible old/new handlers together.

### 3D. Start only after the release review

After the operator has actually completed the checks in [RELEASE.md](RELEASE.md), approved the regional configuration and set the appropriate flags, start the **reviewed** matched images:

```sh
docker compose --env-file .env.production \
  -f infra/compose.production.yml -f infra/compose.recovery.yml \
  up --detach --no-build --wait --wait-timeout 180
docker compose --env-file .env.production \
  -f infra/compose.production.yml -f infra/compose.recovery.yml ps
```

Check the intended host's HTTPS `https://<API_DOMAIN>/v1/health`, the web host's `/legal/privacy` and `/delete-account`, admin sign-in, verified registration/recovery email, S3 upload/delete, regional account isolation and current worker/monitor health. Confirm Caddy certificates, firewall/port exposure, DNS and trusted-proxy client IPs through the real ingress. Use the private staff enrollment procedure in [STAFF-ACCESS.md](STAFF-ACCESS.md): start with existing email-verified adult accounts and independent operator review; **never** use `scripts/dev-reviewer.ts` or copied development credentials. Real AI may stay disabled and no API key is needed until a separately approved provider is configured.

For a private first check, use the same `--env-file` and both `-f` options from the start command with `ps`, then `exec postgres pg_isready -U cubers -d cubers` and `exec redis redis-cli ping`. Inspect bounded service logs with `logs --tail=100 api worker monitor https`; logs may contain operational details, so keep them private. A healthy database/cache alone does not prove email, S3, recovery or external HTTPS behavior.

Monitor `/v1/health`, container restarts, PostgreSQL, Redis, worker queue age/failures, media/S3/SMTP, deletion backlog, backup freshness and alerts as described in [OPERATIONS.md](OPERATIONS.md). Record the actual image digests, migration level and backup/recovery result for each deployment. Do not use `docker compose down --volumes`: it deletes persistent database/cache/TLS volumes. Do not treat a successful local health response as device, legal, provider or public-release acceptance.

## 4. Common setup failures

| Symptom                                    | Check                                                                                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API cannot start in development            | Confirm PostgreSQL/Redis/S3/SMTP ports, `.env.local`, migrations, and `npm run build:core`; read the API error without copying secrets.                                                  |
| Media upload fails                         | The Docker development storage credentials must both be `S3RVER`; confirm bucket/endpoint and local port 9009.                                                                           |
| Verification mail does not arrive          | Check Mailpit at `localhost:8029` for Docker development, or ignored `.data/mail` for the local gateway; production needs actual SMTP and a verified sender.                             |
| App detects the wrong community            | Confirm server `REGION` and the actual discovery/region API origins. Production uses the server-observed connection IP; client headers cannot override it. See [REGIONS.md](REGIONS.md). |
| Native app cannot reach `localhost`        | A phone's localhost is the phone. Use a device-reachable development address and trusted private network; Android emulator host is `10.0.2.2`.                                           |
| Production API/worker refuses startup      | With `PUBLIC_RELEASE_APPROVED=false`, refusal is intentional. Also check HTTPS origins and initialized independent journal; do not bypass the gate to make a demo work.                  |
| Database/Redis appears empty after restart | Confirm the correct Compose project/region and persistent volumes; never start a second region against the first region's data.                                                          |

For deeper release, recovery, provider and security procedures, follow the linked specialist runbooks. This page is the entry point and intentionally leaves operator-specific secrets, public endpoints and approval decisions blank.
