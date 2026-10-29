# Friends and controlled mentorship

Implemented 2026-10-16. This feature uses persistent regional accounts, clubs, consent, notifications and audit records. It does not fabricate members or open a private messaging channel.

## App experience

Open **Profile → Friends and mentorship**, or **Connect** on a post/approved club member. A request names the other cuber, its purpose and an optional shared club. It contains no free-text note, contact details, recording or photo.

Users can accept, decline, cancel or end a connection and browse private paginated history. Request settings default to shared club members; adults may opt into requests from any cuber, and everyone may close new requests. Closing new requests keeps existing connections. Verified adults may opt into offering guidance and choose one to twenty places. Adult verification does not certify teaching skill.

Guardians open a linked child's **Review friends and mentorship** screen. Club owners have a mentorship review screen; independent MFA-protected administrators/moderators have the matching admin queue. A mentor who owns the club cannot approve their own mentorship.

## Acceptance and current permissions

- Friendship requires the recipient's explicit acceptance; the requester cannot accept it for them.
- Any connection involving an under-18 account requires both people to be approved members of the same approved club. Adult participants in these connections must have current adult verification.
- Each younger child needs their own verified, linked guardian's per-request approval: under 13 in the international configuration and under 14 in mainland China. This is separate from public-post and recording permissions. Older teens give their own acceptance and remain subject to the shared-club rules.
- Mentorship requires an opted-in, currently verified adult mentor. A minor learner also needs independent club-owner or moderator review. Younger learners need their guardian as well. Guardian approval does not replace the recipient's acceptance.
- Approvals bind the exact request version, current consent fingerprint and club revision. A changed club revision requires new independent minor-mentorship review. Current membership, guardian eligibility, adult verification and consent are rechecked when returning connection status.
- A stored accepted connection can be paused by lost permissions or membership. No private access or messaging is granted by the stored flag alone. Requests made in a club retain that club context even when a participant later turns 18.
- Blocking ends both friendship and mentorship, under the same ordered account locks used for acceptance. Unblocking does not restore an ended relationship. Account IDs are canonicalized, and preserved mixed-case block records are still enforced.
- Mainland social-service approval remains a separate deployment gate, and identity eligibility is checked on both accounts. Regional accounts cannot request connections to another installation's accounts.

Pending requests expire after 14 days. Declines impose a seven-day resend delay; cancellations/ordinary endings impose one day; blocking imposes seven days. New requests are capped at ten per account per rolling day, and pending inbox/backlog size is bounded. Concurrent mentor acceptance cannot exceed capacity; accepted requests awaiting approvals already reserve a place. End unwanted or paused mentorship to free a reserved place.

## Privacy and retention

Lists are private to participants and authorized linked guardians/reviewers. Responses contain nicknames, minimal relationship/club information and approval requirements; they exclude date of birth, email, contact details, consent documents, raw guardian fingerprints and authentication secrets. Guardians lose linked-account access when the child turns 18. A guardian may decline or end an eligible linked minor's connection; per-request approval is only required for the younger age band.

Private club context is shown only through the relevant participant/guardian/reviewer access path. Lost club eligibility masks its current name. Notifications use generic bilingual text without names, request notes, age or media. Exports include the person's own connection views and request preferences. Deleting either participant removes both directions through database foreign keys.

Closed connection rows expire after 90 days. Minimized connection security audit entries have a separate 190-day retention period and remain restricted to authorized staff; they contain actor/action references, kind, status and version, without contact details or messages. Active relationship records remain until ended or an account is deleted. Existing audit redaction on account deletion still applies. The operator must review the complete deployed logging/retention system: these application records do not establish compliant network-security monitoring or log preservation. China's [current Cybersecurity Law](https://www.cac.gov.cn/2025-12/29/c_1768735112911946.htm) includes a minimum retention requirement for applicable network logs. Operational logging, incident response and legal review remain release gates.

Legacy `Social.friend` and `Social.mentorship` rows are preserved by the additive migration and remain inert. They do not become accepted connections. The old one-sided mutation remains disabled; only the controlled request APIs can establish a relationship.

## REST contracts

All endpoints are under `/v1`, use the selected regional bearer session and enforce the regional social-service gate. Bodies reject extra fields; request messages cannot be smuggled into this workflow.

| Endpoint | Purpose |
| --- | --- |
| `GET/POST me/connection-settings` | Read/save `requests`, `offerMentoring`, `mentorCapacity` |
| `GET connection-targets/:id` | Minimal eligible target preview and approved shared clubs |
| `POST connections` | `{targetId, kind: FRIEND or MENTORSHIP, clubId?}` |
| `GET connections?filter=current or history&cursor=...` | Thirty items per page; cursors must belong to the caller |
| `POST connections/:id/action` | `{action: ACCEPT, DECLINE, CANCEL or END, version}` |
| `GET guardian/connections?childId=...&cursor=...` | Current linked-minor authority, private paginated inspection |
| `POST guardian/connections/:id/review` | `{childId, approve, version}` |
| `GET clubs/:clubId/connections?cursor=...` | Independent owner review queue |
| `POST clubs/:clubId/connections/:id/review` | `{approve, version}` |
| `GET admin/connections?cursor=...` | Independent MFA reviewer queue |
| `POST admin/connections/:id/review` | `{approve, version}` |

Shared validation and response types are in `packages/core/src/connections.ts`. `active` is computed from current permissions, rather than trusting `status=ACCEPTED`. Stale versions return a conflict. Unauthorized callers cannot probe versions through mutation errors. The request UUID may be reused for a later permitted request between the same pair, but the version increases and all approvals reset.

## Evidence and remaining checks

Local integration checks use real isolated PostgreSQL/Redis and synthetic account/consent fixtures. They exercise acceptance/roles, both guardians, younger and older learners, independent owner/admin review, MFA, concurrent mentor capacity and blocking, consent withdrawal, club revisions, account deletion, regional/CN age rules, canonical IDs, preservation of legacy records, private pagination, exports and retention.

TypeScript checks, API/admin builds and iOS/Android/web exports validate the connected code and bundles. New UI has not received fresh visual inspection because browser access was denied by the browser security policy; physical-device accessibility/navigation/network checks remain outstanding. No real AI provider or key has been used. Production remains disabled pending the full release checklist, operational moderation, hardware verification and operator-specific legal review.
