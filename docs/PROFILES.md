# Profiles and sharing

Updated 2026-10-17. Profiles use the real regional database and authenticated APIs; there are no seeded people or fabricated milestones.

## Identity and customization

The Profile tab opens a bilingual editor for nickname, bio, original geometric avatar (cube, orbit or pyramid with four named palettes), favorite puzzles, learning interests and selected achievements. Interests are explicitly self-described, not certifications. Avatars use fixed original vector geometry and do not introduce a photo-upload path.

Achievements derive from completed lesson drills, verified practice repetitions, approved virtual race/daily solves, and evidence-reviewed ranked physical solves. A lesson checkpoint is not described as a complete first solve. Unapproved, pattern/sprint and unreviewed physical attempts do not create solve milestones. Newly selected achievements must be earned; withdrawn eligibility is checked again before display. Existing selections can remain stored privately without preventing a user from withdrawing sharing, but unavailable achievements are never displayed.

## Section permissions

About (including favorites/interests), selected achievements, aggregate solve statistics, friendships and clubs each support Only me, Accepted friends and Signed-in cubers. Defaults are Only me. The entire-profile private setting overrides every section. New disclosure or an increased audience requires explicit confirmation that nickname/avatar accompany shared sections and others may copy shared information. Users can withdraw sharing without giving that confirmation again.

Every profile read checks regional service availability, current account/adult/identity eligibility, privacy, moderation and bilateral blocks. All accounts under 18 remain private even if their stored settings are manipulated. Missing, private, blocked and ineligible profiles use the same unavailable response. Following, legacy one-sided social rows and mentorship do not grant friendship access: an accepted, currently eligible friendship is required, with its guardian and club conditions still valid.

A friendship appears only if both participants allow that relationship to be visible to the viewer. Private/minor/unavailable peers and blocked accounts do not appear. Private clubs require the viewer's approved membership; current subject membership, club publication and owner eligibility also apply. Club invitation codes are never returned. Lists scan bounded pages of twenty records; a page can contain fewer or no visible entries and still offer the next page. There is no count that exposes hidden relationships. Opaque Redis cursors expire after fifteen minutes and are bound to the viewer, subject, region and section; they do not encode relationship identifiers. Every page rechecks permissions.

Shared statistics contain only category counts and personal bests over the most recent 1,000 eligible approved race/daily results. Detailed histories, dates, scrambles, move streams, recordings, contact information and birth dates stay outside shared-profile responses. API responses use private/no-store cache controls. Already downloaded or copied information cannot be recalled by changing sharing settings.

## Content review

A shared nickname and an exposed bio need independent moderator/admin review with mandatory MFA. Approval applies to the current profile revision; concurrent edits invalidate stale reviews. Reviewers cannot approve their own profiles. The admin Profile review tab provides a paginated queue and inspection/removal of a reported shared profile by account ID.

Private bios, favorite puzzles and learning interests are omitted from moderation views when About is private. A name-only approval does not approve the bio: enabling About later triggers review. Changing a private bio preserves an otherwise approved shared nickname while keeping that bio hidden. Profile status/reason and review scope are visible to the owner. Generic in-app notifications disclose no biography or relationship details.

Changing any author's nickname also requeues published/pending posts and actual published replies, so a new identity cannot silently appear on already reviewed content. Historical legacy APPROVED comments are requeued too. Review/update audits omit bio text, expire after 190 days and are redacted during account deletion. The profile fields/review scope are included in private account and guardian-authorized child exports (schema version 3), and removed with the account.

## APIs

- `GET/POST /v1/me/profile`: private editor state and revision-checked save.
- `POST /v1/me`: existing identity update route, subject to the same sharing/review controls.
- `GET /v1/profiles/:id`: only the sections currently visible to this authenticated viewer.
- `GET /v1/profiles/:id/friends` and `/clubs`: permission-checked pagination.
- `GET /v1/admin/profiles`, `GET /v1/admin/profiles/:id`, `POST /v1/admin/profiles/:id/review`: MFA-protected moderation queue, inspection and decision.

Two additive migrations preserve existing users and text. Existing sections become private and unreviewed; applying migrations does not publish old bios. No real AI/provider call is used for profiles or moderation.

## Validation and remaining work

The PostgreSQL/Redis integration suite covers default privacy, forged achievements/customization, explicit confirmation, stale review, MFA/self-review rejection, friend-only sections, mutual relationship consent, pagination/cursor binding, private clubs, identity edits, private review scope, blocking, adult eligibility, regional boundaries, deletion and export. Build and runtime evidence is recorded in STATUS.md after verification completes.

[Shareable achievement cards](ACHIEVEMENT-CARDS.md) now connect earned-only PNG preparation, owner sharing, guardian exact-image approval and independent staff MFA review/withdrawal. Cards default to anonymous and do not automatically publish a post. Fresh visual/native-device QA is still required; browser inspection is currently blocked. Software safeguards and review flags do not establish legal approval or permission to operate a mainland social/game service.

Account notification preferences and a private paged inbox are connected through Profile. See [NOTIFICATIONS.md](NOTIFICATIONS.md).

Private practice sessions and device-zone/UTC daily totals are connected to the regional backend without adding dates to shared profiles. See [SESSION-STATISTICS.md](SESSION-STATISTICS.md).

Private virtual solve replay is connected to eligible approved race/daily history for all four puzzles. Physical/scanned and unaccepted smart records do not advertise replay. Profile sections and paging render only their current account/view snapshot, and late account-export/deletion callbacks cannot affect a different signed-in account. See [REPLAYS.md](REPLAYS.md).
