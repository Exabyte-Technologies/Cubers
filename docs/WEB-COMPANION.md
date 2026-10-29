# Web companion deployment

Latest local image (2026-10-26): `cubers-web:public-b4e9f72b`, digest `sha256:3ed9bb04889f0f7438413b9f6d7115000b65e1fdaf2634c2eabcbed9eea5d450`. Its 221 current source hashes and 27 served-file hashes match; six SPA routes, health and security headers pass in a network-isolated local container. It has reserved `.invalid` service origins. See [SESSION-NAVIGATION.md](SESSION-NAVIGATION.md).

Previous local image (2026-10-26): `cubers-web:public-d4bbb20b`, digest `sha256:71d7ee3fa2d3e00b6a2cf0cdd6db88c36a9e9d1f9d51130a0e9c4da9fb9f532f`. Its 218 build-source hashes match the current workspace; all 27 served files match their packaged hashes. A disposable container with no external network passes health, security headers and six SPA-route checks. The shaded cube and guided-turn browser regression also pass against the isolated local review API. Reserved service addresses and production gates remain unchanged. See [NATIVE-REVIEW.md](NATIVE-REVIEW.md) for the exact evidence and limits.

The production Compose package now serves the existing Expo web app at `APP_ORIGIN`. This provides a deployment target for the app's public legal, support, registration, verification, recovery and deletion routes, and preserves its existing invitation and replay-sharing continuations. The same mobile sources produce this web bundle; there is no second, reduced account-management interface to maintain.

The owner confirmed on **2026-10-25** that neither regional backend is deployed. All supplied public addresses remain reserved `.invalid` examples. The local image is a packaging candidate, not a commissioned service or a store-ready hosted URL.

## Regional configuration

Set three separate hostnames for each installation:

| Setting        | Purpose                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`   | Canonical HTTPS origin for the user-facing app, legal/support pages and account email links |
| `API_DOMAIN`   | Regional API hostname, without a scheme                                                     |
| `ADMIN_DOMAIN` | Separate staff interface hostname, without a scheme                                         |

Keep `APP_ORIGIN` distinct from the other two hosts and without a path, query, fragment or trailing slash. Configure actual DNS, certificates, proxy trust, CORS, mail links and regional services before opening ingress. Corporate websites supplied as publisher contacts are not assumed to be app servers.

The `web` build receives `REGION` as `EXPO_PUBLIC_REGION`, plus `EXPO_PUBLIC_API_URL_INTL`, `EXPO_PUBLIC_API_URL_CN` and `EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL`. Supply actual reviewed HTTPS addresses for all three through the regional Compose environment. The discovery endpoint supports the existing passive IP-country community routing; the app must show the detected community and confirm it before credentials are sent. See [REGIONS.md](REGIONS.md).

These values are **public and compiled into the web bundle**. Changing only a running container's environment does not change them: rebuild and replace the web image when addresses or the initial region change. Never put keys, credentials, private service addresses or personal information in an `EXPO_PUBLIC_` variable. API/AI/storage/mail secrets remain server-side. AI can remain disabled until the owner supplies a key.

Use the full regional [deployment and recovery procedure](DEPLOYMENT.md), including its release gates and recovery overlay. `docker compose ... build` now builds `web` alongside the existing services. `CUBERS_WEB_IMAGE` selects the resulting image; select immutable reviewed image IDs/digests for commissioning. A CN build and an INTL build need their own approved configuration and acceptance records.

## Container and proxy

`infra/Dockerfile.web` performs a lockfile-based Linux install with npm audit uploads disabled, compiles the shared core and exports the Expo web app. Its final unprivileged Nginx image contains static assets and local build evidence, without the Node builder or server credentials. The runtime is read-only with a bounded temporary directory, memory/process limits, dropped capabilities and no published host port.

Caddy serves the configured app host through `infra/Caddyfile.public`, shared by production and local verification. `/v1/*` and Socket.IO requests reach the existing regional API with its existing authorization. Other paths reach Nginx's app-route fallback. The staff host retains its separate admin image and login requirements. `/healthz` returns an empty 204 response for readiness.

The web server applies no-store, no-referrer, frame refusal and content-type protection. Its content policy permits scripts from the app host, local inline styles and HTTPS/WSS API/media connections; it is not an endpoint allowlist. Narrow the connection/media policy to the commissioned hosts after testing the actual installation. Camera permission is same-origin; microphone and geolocation are disabled. Hardware/recording features still require their supported native app and physical acceptance.

## Verification and limits

The Linux/ARM64 web image builds successfully. Its latest 191 recorded source hashes match the current workspace and its 41 packaged files are inventoried by hash. Production Caddy adaptation confirms the app, API and staff hosts and their upstreams. Local isolated regional checks verify the app-host certificate against a private test authority, web readiness/security headers, six anonymous regional legal/support JSON documents, unauthorized course refusal, deletion-only session limits, logout/revocation and exact-confirmation account erasure.

This work does not inspect or run the browser UI, retrieve app HTML bodies, use real AI, contact a real regional deployment, or establish native/device, store or regulatory acceptance. The test bundle contains example endpoints and therefore cannot establish real browser-to-service routing. Stage both regional builds with actual addresses and complete browser/native accessibility, link-continuation, mail, camera, poor-connectivity and operational checks before publication. All production approval and hardware/provider gates remain closed.

Final Docker run `4cf8cf27` passes **65 INTL / 61 CN** groups. Both disposable stacks use the same source-matched INTL-default example web image; this does not validate a commissioned CN frontend configuration. Workspace types and six focused security-comparison tests pass. The new web image has 70 Alpine packages and no matched findings against the saved 2026-10-24 OS snapshot; 24 source packages are unlisted in that snapshot, and its distribution-only coverage does not establish overall security. No new npm audit or private inventory upload is performed.

The subsequent Android review-build plugin and Metro cache-configuration changes are included in a refreshed local web image and its 191 source hashes. All 41 packaged public files have the exact same hashes as the regionally tested image. Production proxy adaptation and the saved OS comparison pass again. This refresh does not claim another regional runtime, browser or native-device acceptance run; final private evidence is under `.data/android-review/web-final/`.

The later fresh-source mobile hook/profile update is also included in a current 191-input web image. Its dependency install and export run from the locally validated Linux builder. The 41 public asset hashes remain unchanged; private current proof is under `.data/cloud-build/web/`. The store candidate and build setup are described in [MOBILE-BUILD-SETUP.md](MOBILE-BUILD-SETUP.md).

Private build/proxy/source inventories and test reports are retained under ignored `.data/public-pages/` and `.data/docker-smoke/`. They are local evidence, not signed provenance or publisher approval. Initial prototype and failed test-run evidence is preserved and explicitly superseded; the full original product goal remains open.
