# Account notification preferences and inbox

Updated 2026-10-17. Profile → **All updates & notification settings / 全部消息与消息设置** opens a private paged inbox and account preferences. Local practice reminders remain a separate device setting described in [OFFLINE-LEARNING.md](OFFLINE-LEARNING.md).

## Categories and delivery

| Category     | Behavior                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `SYSTEM`     | Required account/safety status; cannot be muted                                                           |
| `REVIEW`     | Required post, reply, profile, club, guardian-consent and physical-attempt review status; cannot be muted |
| `CONNECTION` | Optional friend/mentorship updates, including controlled guardian/club requests                           |
| `CLUB`       | Optional club membership updates                                                                          |

Mainland connection/club updates stay hidden while `CN_SOCIAL_APPROVED=false`, including Profile previews and unread counts. Required account/review status remains available. The API returns `communityUpdatesAvailable`; preferences can be saved while social services are unavailable. Cursor scope includes this regional availability gate. This flag records operator review and does not establish regulatory approval.

Only connection and club categories can be changed. These in-app categories start enabled; they do not create emails, remote push or native practice reminders. Muting stops optional producers and hides retained category history in the inbox, unread count and Profile preview. Re-enabling reveals retained history again. Required notices remain available even when both optional categories are off. Notices contain generic bilingual status text; no sender names, guardian documents, private question, contact information, review reason, recording, target identifier or externally supplied navigation link is included by these producers.

Notification records point only to their receiving account. They do not replace authoritative post, consent, relationship, club or attempt status and cannot approve any action. Opening the corresponding feature still applies its current permissions. Pending/revoked young-child accounts may read their own generic account notices and preferences through the `/me` routes without gaining learning, publishing, relationship or recording access.

## API and storage

- `GET /v1/me/notification-settings`: resolved preferences, current revision, regional community availability and the required categories.
- `PUT /v1/me/notification-settings`: strict `{revision, settings:{connections, clubs}}`; an outdated/concurrent revision conflicts instead of silently overwriting another device's settings. Unknown fields and attempts to mute required categories are rejected. Thirty changes per hour/account.
- `GET /v1/me/notifications`: up to twenty records, global visible unread count and an opaque next cursor. Optional `unread=true|false` and fixed `category` filters are validated. One hundred reads per minute/account.
- `POST /v1/me/notifications/read`: strict list of one to one hundred owned, visible UUIDs. Duplicate/case-equivalent IDs normalize; a foreign/unavailable member rejects the whole batch. A concurrent deletion that prevents a complete update rolls back the batch. Recent read markers are idempotent.
- `DELETE /v1/me/notifications/:id`: dismiss one owned update. Unknown/foreign IDs are indistinguishable. Read/dismiss mutations share a 120/minute/account quota.

All routes require a full current regional account session; deletion-only travel credentials cannot access them. Responses are private/no-store. Pages use descending creation time plus UUID, so equal timestamps and deletion of a page boundary do not lose the next page. Redis holds viewer/region/filter/preference-revision-bound cursor positions for fifteen minutes. A different viewer/filter is rejected; expired cursors or preference changes require refresh. Cursor JSON, dates and UUIDs are validated. Muted categories are checked again on every new request.

The mobile page clears old state on account/region/filter/navigation changes, prevents duplicate paging requests and ignores late responses from an earlier view. At most one hundred loaded records stay rendered while older pages can still be browsed; Refresh returns to the newest records. Read/dismiss actions use server unread counts, and a changed or missing record refreshes the inbox. There is no offline inbox cache or queued mutation.

An additive migration preserves accounts and existing notification records. Known legacy producer titles are assigned their categories; unknown legacy notices conservatively remain required system updates. Preferences are included in owner/authorized guardian account exports. Account deletion cascades inbox records; generic notices already received by other accounts contain no deleted person's identity.

Read records older than thirty days from creation and other records older than ninety days are hidden by read queries even before cleanup. The maintenance worker deletes them physically; operator monitoring must ensure that job runs. Read-time expiry also applies to Profile previews and unread counts. These limits do not remove the underlying review, consent, appeal or audit records, whose own retention rules still apply.

## Verification

Local unit checks cover strict optional preferences, legacy defaults, malformed stored settings and required-category invariants. Database/API tests exercise concurrent settings updates, exports, privacy headers, regional/authentication boundaries, tie-safe multi-page history, boundary deletion, cursor theft/filter/revision/expiry, owner-only atomic read/dismiss actions, muted real connection producers, required notices, pending-child isolation, read-time expiry, cleanup and account deletion. Regional Docker checks also exercise default optional notice visibility versus the mainland social gate, required status after muting, stale revision rejection, inbox access and persistence across database restart.

All notifications in tests are synthetic. No message was sent to a person and no push service was contacted. Native bundles check integration; fresh screen/accessibility/device QA remains a release requirement under the current browser-access restriction. Server-side tests and permission gates do not establish regulatory approval or store acceptance.
