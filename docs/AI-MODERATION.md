# Regional tutor moderation

Implemented 2026-10-22 with local/synthetic providers only. No real key was created, reused or written, and no real AI call was made. The operator can still change the approved API base URL and generation model in the MFA-protected admin connection page. Production AI remains disabled pending real commissioning.

## International workflow

Before enabling a connection, the server checks the configured generation model and makes a harmless text probe to the same approved base URL's `/moderations` route. `AI_MODERATION_MODEL` defaults to `omni-moderation-latest` and is server configuration. A compatible endpoint must support the complete text-category moderation contract; a successful model-list request alone cannot enable the connection.

Each eligible adult request separately screens minimized lesson context before generation and the candidate explanation before delivery. The raw question is locally classified into a small learning-intent enum and is never sent to moderation or generation. Names, account identifiers, posts, recordings and scan photos are excluded. Existing deterministic lesson/algorithm checks and output restrictions remain in place. Minors, disabled deployments and disabled connections return authored teaching without provider requests.

The parser requires one result, an overall boolean flag, all expected text categories and finite bounded category scores. Missing/malformed data, errors and any flagged category fail closed to authored teaching, including an inconsistent false overall flag. Scores do not establish authorship, solve validity or ranking eligibility. Cubers does not retain scores or generated explanations. Provider retention terms still apply.

Model-connection validation is cached for five minutes using the region, mode, URL, generation/moderation model and credential/policy scope. Content approvals are not cached. Every candidate is screened. A changed setting cannot inherit another connection's cached validation.

## Mainland workflow

Mainland tutoring requests Alibaba's documented `X-DashScope-DataInspection` header with both `input` and `output` set to `cip`. It does not send mainland lesson content to an OpenAI moderation route. Live use additionally requires `AI_CN_GUARDRAILS_APPROVED=true`, alongside the existing regional AI approval and key/host requirements. The new flag defaults to false and cannot be changed through the connection form.

Before setting that flag, the operator must activate and authorize the relevant Alibaba guardrail service in its own account, review its terms/billing/data handling and verify actual input/output blocking. These actions have not occurred. Sending a header or setting a local approval flag does not prove that a provider or proxy enforces the service. Custom approved proxies require independent acceptance. No billing service or cloud role was activated during this work.

Filtered, refused, truncated or incomplete generation responses return authored teaching. Provider failures are not exposed as raw error bodies. The app does not automatically retry through a different region or unmoderated provider.

## Bounds and authority

`AI_TIMEOUT_MS` is one shared deadline for provider work: DNS/model validation, moderation, generation and response reads. Eight underlying operations per API process bound admission; a transport that ignores cancellation retains capacity until it actually settles, and its late result cannot reach the reader. Response/header limits, pinned DNS connection addresses, HTTPS/approved-host checks, redirect refusal and the mock-only loopback restriction remain enforced. No real credential is sent in mock mode.

Provider work runs outside account/session/database locks. Final delivery rechecks account, guardian, session and course authority. Provider-derived replies also compare the current AI setting under a short settings lock shared with admin saves; a disabled/replaced connection cannot deliver its pending reply. Authored teaching remains independent of AI-setting changes. Admin saves retain their current staff/MFA checks before and after provider work. A failed moderation probe changes neither the connection nor its audit record.

The admin page displays the regional moderation model or operator guardrail-review state and explains these checks in both languages. Privacy disclosures describe minimized screening and provider retention limits. No database migration was added; the schema remains at migration 45.

## Verification and remaining work

Synthetic checks cover the full international request sequence, input/output flags, malformed/oversized/redirected responses, category consistency, model/policy cache isolation, shared deadlines, retained admission slots, mainland headers, refused completions and no-request cases. Real authenticated PostgreSQL/local-HTTP cases cover settings changes, session withdrawal during the final moderation response and refusal to enable a failed service. Current checks pass **328 source / 301 backend** cases (backend run as the 282-case API suite plus 19 staff/recovery/journal/migration cases). Workspace types, API/core/admin builds and formatting pass. Final Docker **7b063400** passes **58 INTL / 54 CN** groups on migration **45**, including compiled regional screening and actual receipt-child cancellation. Read-only, network-disabled hash comparisons match **46 API / 44 migration-image / 37 recovery** files and **three admin assets**. Independent cleanup finds no owned test containers, networks or volumes. Cached OS/runtime bases match all seven dependency manifests but were not refreshed upstream.

The receipt fix waits for actual child close before releasing private proof files or admission. Its source regression checks actual process exit, and both regional compiled probes confirm cancellation of a real stalled process. The first container attempt (**29c5f12a**, 52 international groups reached) exposed a fixture trying to execute from protected API tmpfs. A read-only mount in the local smoke override now supplies that executable; the fixture remains absent from production images and existing temporary-folder protections remain enforced. An earlier daemon-unavailable attempt (**f8f76a24**) ran zero groups. Both reports are retained. The source suite also exposed the real receipt lifecycle defect and a too-short non-timeout AI fixture; the former is fixed in production code and the latter has an independent budget, with the explicit timeout assertion preserved. A backend launcher omitted its required TypeScript configuration before tests started; the corrected full suite passes.

The preview's JSON checks pass login, simulated tutoring, bilingual screening/privacy text and all device/provider/ranking refusals. All **thirteen** saved history/post/media tables match a fresh baseline; there are no active attempts, new events or migration changes. The preview runs at `http://localhost:8081/`. No browser/UI inspection, fresh native compile, mobile export, live AI call or hardware connection was performed in this phase. Private proof: `.data/ai-moderation/verification.json`.

Real provider/key commissioning, model quality and false-positive evaluation, mainland service activation/acceptance, operator/regulatory review and the original native/hardware/release requirements remain open. Moderation is a signal, not a guarantee that every unsafe response is detected. Prior encrypted-restoration acceptance remains the migration-45 media-label milestone; this change adds no stored moderation data or new restore workflow, and no new encrypted restore drill is claimed.

Protocol references: [OpenAI moderation guide](https://developers.openai.com/api/docs/guides/moderation), [moderation API contract](https://developers.openai.com/api/reference/resources/moderations/methods/create), [Alibaba input/output guardrails](https://help.aliyun.com/en/model-studio/content-security). See [DEPLOYMENT.md](DEPLOYMENT.md), [RELEASE.md](RELEASE.md) and [STATUS.md](STATUS.md).
