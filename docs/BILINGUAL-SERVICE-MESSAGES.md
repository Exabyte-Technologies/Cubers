# Bilingual service and recovery messages

Updated: 2026-10-26. This is software and package verification; device, production-service, operational and publication acceptance remain open.

The mobile app and administrator panel now use shared English/Simplified Chinese service messages. Known sign-in, verification, guardian-permission, practice and common room/attempt failures retain their specific recovery guidance. Other failures use an authored message for the HTTP status. Raw validator details, unexpected server strings and proxy content are not shown in either language. HTTP status and bounded machine codes remain available to existing session/community handling.

Error responses with malformed or non-JSON bodies keep their HTTP meaning, including authentication failures. Malformed successful responses and connection interruptions report an uncertain result and advise checking the current state before repeating an action. No automatic retry is introduced. Existing mobile offline-course/reminder cleanup and administrator session checks remain in place.

Registration, resend, forgotten-password, email-verification, password-reset and account-deletion success notices are localized only for their exact endpoint and method. User-authored posts, moderation notes, login tokens and unrelated response fields are not translated or rewritten. Recovery notices retain the existing protections against revealing whether an email has an account.

Verification and password-reset emails include both languages, one link bound to the original community, and the existing 30-minute expiry and unsolicited-request instructions. Links remain single use; reset continues to revoke all sessions. No recipient-language preference, new personal-data collection or external mail service is added. Tests deliver only to local email capture.

## Preview configuration correction

The recovered preview had been started with `/v1` in its public API settings. `communityEndpoint` requires an origin and the request helper adds `/v1/` itself. The corrected local settings are `http://localhost:3000` for each development community endpoint. Strict URL validation remains in place. Real production addresses are still unknown and review packages retain reserved `.invalid` addresses.

## Validation and limits

Five focused source checks exercise actual Nest string/object exceptions, unknown and malformed payloads, status/code preservation, non-JSON authentication failures, uncertain outcomes without retries, and narrow success-notice translation. The authenticated registration/recovery integration additionally decodes actual captured MIME email, checks both languages and link uniqueness, verifies one-use links and confirms session revocation after password reset. Full-suite and package results are recorded in the accompanying implementation status and private local verification record.

No app UI or native interaction was inspected. AI is simulated; no real provider key is used. No new npm audit is requested. Native review packages are unsigned, use reserved service addresses and require signing and real-device acceptance. Previous artifacts remain preserved. Regional deployments, hardware acceptance, operator services, legal/filing review and store approval are separate unfinished requirements of the full project.

## Preserved final packages

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `artifacts/android/Cubers-0.1.0-arm64-unsigned-review-20261026-bilingual.apk` | 49,594,680 | `27fb68e867b0dd3ca4d8bfee8435b146b0636ac2ea56a372e5a6b91afa79f6f8` |
| `artifacts/ios/Cubers-0.1.0-iphone-release-unsigned-20261026-bilingual.app.zip` | 14,371,178 | `6814a5227853a41e65a945153c0488dcfa3335686f6864eb6877cd9813218d06` |

Both embedded Hermes bundles contain the bilingual service messages and all three reserved service origins. All 86 iPhone app files match the archive. The Android review package is unsigned, non-debuggable and passes 24 native-library layout checks. The iPhone archive has no team signature. Static package checks do not establish installation, native interaction or accessibility acceptance. A fresh unapproved store candidate is `artifacts/store/2026-10-26-bilingual-messages`, with 33 current source hashes and the same five artwork files; nothing is submitted.

The first container run (`8fae2a43`) is preserved as failed: INTL completed 66 groups; CN stopped at synthetic certificate-status verification after 54. Its frozen clock was 00:17:00.994 UTC while the lazily generated responder became valid at 00:17:01 UTC. Exact network-disabled Linux replay rejects that response at the old clock and accepts the same signed bytes at the later clock. The test runner now captures its evaluation clock after generating the responses. Production certificate validity/signature checks and time limits are unchanged. An iPhone rebuild also hit a shared Metro-cache deletion conflict during parallel builds; a retry with a private temporary cache succeeds. These failed attempts are retained with their logs.

## Final results

- All **403 source checks** and **317 backend/database checks** pass, together with workspace types, API/admin builds, three-platform JavaScript exports, formatting and strict typing of the changed container runner.
- Final regional Docker run **32e4345d** passes **66 INTL / 62 CN** groups, including certificate-status verification. The failed first run remains preserved.
- Final packages match **65 API / 63 migration-image / 54 recovery files and three administrator assets**. The web image records **194 current source hashes / 41 packaged files**, with three proxy hosts validated.
- Local preview health and passive community-detection JSON pass with the corrected origin; strict rejection of `/v1` in the configured origin remains. No login or app UI was inspected.
- All 13 saved history tables match their pre-interruption hashes, migration count remains 46 and no active attempts exist. Disposable resources are independently checked for both container runs.

Private local evidence is under `.data/bilingual-errors/`; full regional results remain under `.data/docker-smoke/32e4345d/`. Full-goal production, native-device, operations and publication gates remain open.
