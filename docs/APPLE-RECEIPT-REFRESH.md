# Apple receipt updates

The account owner can request an Apple App Attest receipt update from Profile → App verification. The bilingual screen explains the transfer before submission and shows the receipt expiry. This is connected software with synthetic verification; no real Apple credential, signed installation or receipt-service acceptance has been commissioned. Ranking remains disabled.

## Server and account behavior

`POST /v1/me/app-attestation/keys/:id/refresh` accepts only `{ "expectedVersion": <current integer> }`. It requires the current owner, full session and learning permission, including current guardian consent where applicable. Each owner has a ten-request daily limit. The server reads its encrypted receipt; the caller cannot supply a receipt, key, endpoint or risk score.

Apple is contacted outside account/key locks. A final transaction rechecks the owner, session, guardian authority, active key, expiry, exact original ciphertext and provider policy before saving. Revocation, expiry, credential/policy changes and a simultaneous receipt replacement discard stale responses. Legitimate action assertions may advance the counter during the request; receipt replacement preserves that current counter and increments the current version. Encrypted storage remains bound to the account, community and key. Existing revocation, erasure and sealed-restore cleanup apply. No new database migration is required beyond migration 44.

Only the stored Base64 receipt and a short-lived ES256 authorization JWT go to Apple's fixed environment-specific receipt endpoint. Names, community posts, recordings and account identifiers are excluded. Redirects and retries are disabled. The complete operation has an eight-second deadline and two admission slots per server process; a transport that ignores cancellation retains its slot until it finishes. Responses and private credential files have strict size limits. A new receipt must independently pass CMS signature, pinned trust chain, purpose, app, key, environment, type, time and signed-field checks, followed by current signed [receipt-chain certificate status](APPLE-CERTIFICATE-STATUS.md). Public certificate lookups add their own bounded work within the outer refresh deadline; they do not send the receipt or authorization credential. Early requests defer without extending trust or contacting Apple; Apple's HTTP 304 also leaves the stored receipt unchanged. Failures never extend its lifetime.

## Operator configuration

Keep `APP_ATTESTATION_APPLE_RECEIPT_ENABLED=false` until commissioning. Enabling it requires the existing Apple integration, `APP_ATTESTATION_APPLE_CREDENTIAL_FILE` and an explicitly reviewed integer `APP_ATTESTATION_APPLE_RISK_MAX`. There is no default risk threshold. Blank, negative, fractional and oversized values are refused. The risk metric approximates attested-key generation and is not proof of cheating. Above-threshold or unassessed receipts cannot authorize protected game actions when this policy is enabled; no automatic ranking approval follows an accepted assessment.

Provision a DeviceCheck-enabled Apple P-256 signing key through the operator's Apple account. Mount a private canonical absolute file outside source, images, database backups and public configuration:

```json
{
  "version": 1,
  "teamId": "YOURTEAMID",
  "keyId": "ABCDE12345",
  "privateKey": "<PKCS#8 PEM P-256 private key>"
}
```

Replace both identifiers with the actual ten-character uppercase alphanumeric identifiers. The sample contains no usable credentials. The file must be a single-link regular file owned by the service user or root, without execute/group/other permissions (for example mode 0600). Symlinks, hard links, FIFOs, directories, extra JSON properties, wrong teams and unsupported keys are refused. Credential changes require a controlled API restart. The JWT uses the raw Authorization header required by Apple; it is never exposed through the account API. This credential differs from the receipt encryption key.

Development and production destinations are fixed in code. Do not route a mainland deployment through an unreviewed provider or transfer; its existing regulatory and operator gates remain required. Configuration checks establish software restrictions, not regulatory approval.

## Verification and remaining work

At the original manual-update milestone, the source suite passed 314 checks and the full authenticated PostgreSQL integration suite passes 297. Synthetic tests cover private credentials/JWTs, actual CMS signatures, fixed/minimal requests, deadlines, cancellation, bounded capacity, early deferral, malformed and wrong-scope responses, high-risk refusal, ownership, consent withdrawal, session expiry, policy/revocation races and concurrent action counters. The retention batch fixture now gives reports distinct expiry times so it checks a deterministic first batch without weakening deletion assertions. Web/iOS/Android JavaScript exports and workspace types pass. Docker run **5423de37** passes **56 INTL / 52 CN** groups with migration 44, including the compiled receipt client against synthetic transport. A separate read-only, network-disabled compiled probe passes. Exact-image encrypted restore **3abc60ee** passes **27 groups per region**, keeps both targets sealed and clears old device trust. Hash checks match 36 API, 34 migration-image and 28 recovery files plus three admin assets. Independent cleanup finds no owned resources; six anonymous restore mounts were removed. The refreshed mock-AI preview preserves all eleven saved-history hashes. Cached OS/runtime bases match all seven dependency manifests but were not refreshed upstream. Private proof is `.data/apple-refresh/verification.json`; the first Docker run, whose new test used `risk` instead of `riskMetric`, remains preserved.

A subsequent cancellation fix (2026-10-22) keeps private proof files and verifier admission until the child process actually closes, including aborts that reject the Node promise before exit. Source regression checks retain the real PID-exit assertion. The regional [AI moderation milestone](AI-MODERATION.md) records current compiled-container coverage and distinguishes this fix from provider commissioning.

[Optional periodic refresh](APPLE-PERIODIC-RECEIPTS.md) now connects explicit per-key opt-in and the background worker. Issuer revocation/status and trust-rollover handling remain unfinished. There has been no real Apple request, real key provisioning, native screen inspection, signed-device acceptance or ranking activation. Native accessibility, background/navigation behavior, actual Apple errors and operator risk policy still require acceptance before enabling the integration. AI remains simulated and unrelated hardware gates remain off.

Protocol reference: [Apple: Assessing fraud risk](https://developer.apple.com/documentation/devicecheck/assessing-fraud-risk). See [APP-ATTESTATION.md](APP-ATTESTATION.md), [DEPLOYMENT.md](DEPLOYMENT.md) and [RELEASE.md](RELEASE.md).
