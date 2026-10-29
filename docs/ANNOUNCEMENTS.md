# Cubers service and learning announcements

Staff can create bilingual plain-text updates, save drafts, review and publish a particular version, schedule its display window, edit it back to draft, withdraw it and inspect recent revisions. The admin panel has a dedicated Cubers updates page. Discover shows up to three current summaries; Profile links to the full paged reader. Reading creates no posts, engagement, read receipts, email or push notifications.

These are organization-authored service/learning updates. Club announcements keep their existing membership, owner, guardian and moderation controls. Sponsor campaigns keep their separate review and verified-adult delivery controls; the new editorial form provides no advertising destination or external navigation action.

## Publication and access

- Administrator writes require current regional authority, a full MFA-verified session and the same staff factor generation after the account lock is acquired. Moderators can read drafts/history; the editor marks that role read-only. A captured old role/session is insufficient.
- Both language variants, rights and service/learning scope require explicit review confirmations. Every write includes an expected version and a reason. Concurrent edits cannot overwrite one another. An edit withdraws publication and clears the prior lesson-version/review binding.
- A display window spans at most 90 days, begins within one year and must still be unexpired when published. The editor shows browser-local input times; the backend stores and compares UTC. Tests explicitly use Asia/Shanghai and Pacific/Honolulu database sessions, including scheduled visibility and cursor boundaries.
- A learning update may link to an existing lesson. Publishing requires its exact currently published course version. Withdrawal or revision of that course hides the update until staff review and publish the current version again. A service update cannot carry a lesson action.
- Public reads require a fresh full regional account session. Learning text additionally requires current learning/guardian permission. A narrowly scoped GET exception leaves service information readable when learning consent is withdrawn; it does not open courses or other learning routes.
- No production notices are seeded. Regional databases, staff sessions and paging scope remain independent. Mainland service/authored-learning reading does not enable community, competitions, advertising or AI release flags.

## Reader behavior

`GET /v1/announcements` returns at most ten summaries and an opaque next-page marker. Markers expire after five minutes and bind the account, region and current learning eligibility. A deleted boundary record does not break the next page. Readers always recheck publication, schedule and linked-course eligibility.

`GET /v1/announcements/:id?version=N` opens the exact visible version, with the full bilingual body. The response omits staff review metadata, reasons and audit identities. Reads are private/no-store and limited to 600 requests per account/hour. The only action is a current published lesson; the app rechecks the announcement before navigating there.

Every response carries a display lease of at most thirty seconds, further capped by its scheduled end. The app subtracts request time, refreshes every twenty-five seconds, clears expired content, and invalidates old requests on backgrounding, blur and account/community/learning-permission changes. A reader renews the same version while it remains valid, so ordinary refresh does not force a long article closed. A failed refresh cannot extend the previous lease. Full-list paging replaces the ten visible cards rather than accumulating hundreds of views.

All titles, summaries and bodies are ordinary text with text labels. They do not fetch media, execute HTML, embed remote content, interpret URLs or track clicks. Notification preferences remain separate. The English and Chinese privacy documents disclose the short-lived paging markers and editorial retention.

## Storage and retention

Migration 31 adds `Announcement` and `AnnouncementRevision`; it creates no notices and does not change existing publication decisions. Drafts and publication states are durable regional data. Each change writes a revision and audit entry; the latest twenty revisions are retained. This history is controlled by the API, not cryptographically immutable against a database administrator.

The regional catalogue is bounded to 500 updates and editing to 60 writes per account/hour. Updates ending more than ninety days ago become eligible for bounded maintenance deletion, up to 100 per pass, with cascading revision cleanup. Expiry uses the same advisory lock as edits. Recovery-journal reconciliation still precedes maintenance, so a sealed or untrusted recovery state cannot mutate the catalogue through this worker path. Physical cleanup timing and alerts remain operational acceptance requirements.

Encrypted database recovery checks retain a bilingual draft and its revision in a sealed restored target; they do not activate a restored installation. Real custody, service commissioning, native/visual/accessibility acceptance and operator-specific legal review remain release gates.

## Verification

Contract tests cover bilingual text, control characters, schedule bounds, lesson-action scope, explicit literal review checks, exact versions, public-field omission and page/lease limits. Real API tests cover draft/edit/publish/withdraw, concurrent edits, exact history, current lesson binding, future/expired schedules, guardian withdrawal, full-session/regional boundaries, cursor scope/expiry/boundary deletion, actual account-lock authority/session revocation, twenty-version retention and bounded cascading cleanup. Both positive and negative database timezones are exercised.

Regional container checks exercise actual staff MFA and the compiled bilingual lifecycle through HTTPS. Database recovery checks exercise real encrypted dump/restore with editorial records. Type checks and web/iOS/Android exports establish contracts and bundling; fresh rendered-screen and physical-device acceptance remain unverified under the current browser-access restriction.

Final local verification (2026-10-19): the full source suite passed 185 unit / 178 integration checks. Rebuilt application images passed 36 INTL / 33 CN groups in run `7b572bbe`; real encrypted recovery passed 14 groups per region in run `c7558d1a`, with restored drafts/history and sealed targets. Types and final web/iOS/Android exports passed. The preview is healthy with mock AI, 31 migrations / 149 authored courses and zero announcements/revisions. No production notice, live AI call or public deployment was created. See [Docker evidence](DOCKER-VERIFICATION.md) and [remaining work](STATUS.md).
