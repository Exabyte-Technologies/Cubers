# Server-enforced community routing

The server assigns Mainland China (`CN`) when FreeIPAPI returns country `CN`; other supported country codes map to International (`INTL`). This routes services by the observed connection, not nationality or proof of residence. There is no client region picker or trusted client country field. The server's `REGION` setting identifies its own independent installation. Accounts, databases, media, feeds, queues, secrets and backups remain separate.

## Production enforcement

The global HTTP security guard checks the server-derived connection IP before ordinary public account handlers and all protected account, course, community, profile, admin and game handlers. Restored sessions receive the same check. A client-selected origin, saved region, register-body region, `X-Region`, country header or token cannot override it. A mismatch returns `409 COMMUNITY_CHANGED`; unknown/private IPs, malformed/failed provider results and exhausted lookup capacity return `503`, with no international fallback. Account-region and session/permission checks remain independent.

The Engine.IO adapter rejects wrong-region initial realtime transports. The actual Play gateway checks again at namespace authentication, every message and lease renewal. It disconnects on failed renewal. A normal session cannot gain access to another installation by changing client storage or endpoint URLs.

Narrow exceptions preserve public health, discovery and legal documents; public email verification/recovery; and password-authenticated deletion-only login, account erasure and logout. They do not permit account/profile/export/course/game reads. Existing deletion-only scope and exact deletion confirmation still apply. These exceptions preserve recovery/erasure while traveling; they do not create a normal cross-region session.

`GET /v1/community-region` is anonymous and `private, no-store`. It returns the selected and serving regions, source, country code when known, provider and attribution, without the IP or detailed vendor data. Discovery can be answered by either region so the client can find its permitted server. Normal business access on that server is still checked independently.

## Connection trust

Express and realtime use the socket address and only explicitly configured `TRUSTED_PROXY_CIDRS`. With no trusted proxy, supplied `X-Forwarded-For` cannot select an address. Do not use hop counts or trust all proxies. Expose only the reviewed HTTPS ingress, keep the API private, and verify the proxy's forwarded-header behavior on the actual host. IP routing cannot detect a user's physical location behind a VPN, roaming gateway or proxy; do not claim VPN circumvention is impossible.

The app uses only its build-configured HTTPS regional origins. Anonymous discovery/confirmation carries no token, email, password, cookies or body, and follows no redirects. The client displays the server's result and cannot authorize a different region. Credentials are submitted only after confirmation. Existing sessions never migrate; a server mismatch clears the local session/offline access and requests fresh server discovery. Verification/recovery/deletion links remain bound to their issuing community.

## FreeIPAPI transport and privacy

The current provider replaces the former local DB-IP runtime. The server calls the documented fixed endpoint `https://free.freeipapi.com/api/v1/json/{ip}`. No provider key is required for this free endpoint. DNS results must all be public and the selected result is pinned to the HTTPS connection, retaining TLS hostname verification. The request sends only the connection IP plus generic JSON headers, no account credentials, device headers, names, email or learning content. Redirects, non-200/non-JSON replies, mismatched IP/version, unsupported countries, oversized headers/bodies and timeout fail closed. The total request deadline is three seconds; the body limit is 16 KiB.

A bounded in-process cache retains only country and expiry indexed by an IP digest for five minutes (at most 10,000 entries). Same-IP concurrent work coalesces; no stale success is accepted after expiry. Failures suppress retries for five seconds and never grant access. Admission limits new lookups to 10 per rolling ten seconds and 60 per rolling minute per process, with at most 32 pending lookups. The vendor's free allowance is **shared by all requests from a server's public outgoing IP**. Multiple processes or deployments sharing egress must coordinate capacity or provision reviewed paid access; provider 429/unavailability still refuses access. This is not a production-capacity certification. See [API documentation](https://freeipapi.com/docs/api-reference/get-ip-info) and [rate limits](https://freeipapi.com/rate-limit).

Unlike the previous offline database, this integration discloses the lookup IP to a separate provider. Cubers does not persist it in account/history tables or retain the returned city/coordinates. FreeIPAPI may keep API request logs under its [privacy policy](https://freeipapi.com/privacy); its [terms](https://freeipapi.com/terms) do not guarantee accuracy or availability. Bilingual in-app privacy text discloses the change. Applicable provider, child-data, cross-border processing, notice/consent and operational review remain release requirements; software checks do not establish legal clearance. No production activation or live-user lookup is performed by the automated tests.

The old DB-IP dataset, refresh utility and licence records are retained only as historical source material; the active runtime does not read them and needs no monthly dataset refresh. They must not be presented as the active provider.

## Development and testing

`NODE_ENV=development` or `test` uses the **server's** `REGION` directly for every connection, without contacting FreeIPAPI. `REGION` defaults to `INTL` in configuration and `.env.example`, as requested. An operator can run an explicit CN test installation with `REGION=CN`; client requests cannot change this setting. Production ignores no-IP fallbacks and always requires a valid lookup for ordinary access.

The region integration harness runs the actual global guard, Engine.IO adapter and Play gateway with real synthetic account sessions and deterministic injected provider replies. It tests both serving regions, IPv4/IPv6/mapped IPv4, spoofed country/forwarded headers, restored sessions, wrong-region account-handler refusal, unknown/provider failures, initial realtime refusal and per-message revalidation. Test injection is in the test dependency graph, with no production environment bypass.

## Deployment requirements

Provide reviewed HTTPS values for `EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL`, `EXPO_PUBLIC_API_URL_CN` and `EXPO_PUBLIC_API_URL_INTL`. Reserved `.invalid` build addresses remain placeholders. A neutral discovery host should route the first request to an appropriate reviewed regional edge; it must expose only anonymous discovery and never forward account credentials. Real DNS, edge routing, certificates, egress capacity, provider acceptance and regional processing/legal commissioning remain separate launch gates. Do not deploy mixed client/server contract versions: detection now identifies `provider: FreeIPAPI` instead of an offline database release.
