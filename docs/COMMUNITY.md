# Community implementation and checks

Discover now connects to persistent posts, media, social actions and club records. No users, engagement or community conversations are seeded in production. Test accounts and fixtures remain in separate local test databases.

## Posts and files

- Following, Explore, Clubs and Saved feeds use chronological pagination. Search includes post text and normalized tags. Likes, follows and saves reflect real stored actions and can be undone.
- The composer accepts a story, up to five Unicode tags, an AI-content declaration and up to four attachments. Adding a file uploads it privately for processing before post submission; this is disclosed beside the picker controls. New or edited posts enter moderation, and young-child posts require approval from their linked guardian for the exact revision as well.
- Native selection requests the original JPEG/PNG and MP4/MOV file; supported photos no longer pass through a converting editor. The server bounds dimensions, removes unrelated metadata and preserves supported source claims. Browser selection accepts JPEG/PNG. HEIC and other photo formats currently require an explicit supported-file selection. Photos are limited to 10 MB. Native photo selection and video playback use SDK-compatible Expo modules; device behavior still needs physical testing.
- MP4 and MOV post uploads are limited to 50 MB and 90 seconds. The worker validates actual duration/streams, writes an MP4 container, removes audio and container metadata, and records the processed MIME type and duration. Native video selection requests a compatible H.264 export. Device-specific codecs, embedded bitstream metadata and playback failures still need release testing; container validation does not establish every device's decoding support.
- Owner previews use authorized, expiring download URLs. Published attachment reads recheck author eligibility, the exact post context, club access and blocks. Linked guardians can inspect their child's attachments for review, including in a club the guardian has not joined. Evidence and consent documents remain outside public post access.
- Attachment removal cannot delete a file still referenced by a post. Unattached-file cleanup locks the owner while reserving an old file for deletion, preventing a concurrent post from acquiring a file that cleanup removes. Failed/abandoned uploads and unreferenced ready files expire after one day. Already delivered files or cached copies cannot be recalled merely by expiring a URL.
- Ordinary authorized photos may be uploaded independently by different users. Only competition clips use a unique evidence fingerprint, so a duplicate evidence upload cannot become a second ready clip. These checks do not prove that different encodings of a clip represent different performances.

## Clubs and discussions

Verified adults can create clubs, subject to moderation. Private clubs require an invitation to request membership and owner approval before private discussions open. Invitation rotation invalidates the old code. A removed member cannot bypass that decision by leaving and reusing an invitation.

Owners can edit club details, manage requests and publish announcements. Club edits pause discussions and require review of the new revision; stale approvals fail. Announcements require both current owner eligibility and ordinary post moderation. Moderators can withdraw a club, which also closes its post and attachment access. Archived clubs preserve other members' private history after an owner's account deletion.

Replies record their parent, support up to five nested reply levels, and require moderation. Blocked, ineligible or removed parents and their descendants are hidden. The mobile discussion loads 20 chronological candidates per page and offers **More replies**. Later pages include only the authorized parent context needed to render their visible replies; repeated parents merge without duplicate cards. Each request rechecks current post/club access, blocks, email verification and posting permissions for every reply and ancestor. A page can contain fewer than 20 visible replies, or none, while still offering the next page. Refresh checks previously loaded content and starts again.

`GET /v1/posts/:id/comments/page?cursor=...` returns `{ items, context, nextCursor }`. Ancestor lookup is bounded to five generations; context adds at most 100 distinct parent rows to a 20-candidate page. The old `/comments` array remains capped at 100 for older development clients. No public, unbounded comment endpoint is introduced.

Feeds and reply pages use separate opaque Redis cursors that expire after 15 minutes. Reply cursors belong to the viewer and post; feed cursors also bind the feed kind, club, post kind, normalized tag and search. Date/id keyset positions survive deletion or withdrawal of the boundary record, handle timestamp ties, and do not depend on exposing a hidden record's identifier. Invalid, expired or differently scoped cursors return 400; revoked private-club or post access still fails before cursor processing. Both workflows have 60-read-per-minute account limits and private/no-store responses. Refresh after an expired cursor or to see newly published content. Cursor records contain only view identifiers and a position, never reply/post text, and expire automatically.

Club announcements and discussions have independent **More announcements** / **More discussions** controls. Async generation checks and paging guards prevent late page responses from overwriting another discussion, club or signed-in account. A later-page access denial clears the already loaded discussion or club data. Expired page positions show a bilingual message beside explicit refresh controls. Additive migration `202610160007_comment_pages` indexes comment and club-post pagination; it does not modify content or approvals.

Posts and club membership/review changes create generic private in-app updates. Profile displays recent updates and links to owned posts and clubs. Friendship acceptance and controlled mentorship are connected; [CONNECTIONS.md](CONNECTIONS.md) describes approvals, current eligibility, private records and tests. Full notification preferences remain unfinished. Signed-out invitation continuation is described below; an unrelated email opened in a new app/browser session still requires reopening the original invitation.

## Evidence and remaining release work

Local integration tests exercise actual signed image uploads, JPEG metadata removal, MOV processing, audio removal, duration rejection, scoped attachment access, saved/tagged feeds, edit reapproval, invitation rotation, bans, club revision review, nested replies, 125-row discussions, parent context across page boundaries, tied timestamps, removed boundary records, cursor scope/expiry, current ancestry eligibility and private-club withdrawal, child private-club approval, duplicate evidence and cleanup races. Synthetic guardian documents and evidence rows in workflow tests are not evidence of real parental verification or real camera performance.

The iOS simulator compiles with the photo-picker and video-player modules linked, and iOS/Android/web bundles export. Android native compilation now passes. Physical picker/player tests and the invitation-specific native acceptance below remain outstanding; general native and browser checks are recorded in STATUS.md.

Limited imported JPEG/PNG and static MP4/MOV AI source claims are now preserved, force post labels and survive export/restore. See [IMAGE-AI-PROVENANCE.md](IMAGE-AI-PROVENANCE.md) and [VIDEO-AI-PROVENANCE.md](VIDEO-AI-PROVENANCE.md). Native acceptance, remaining formats/credentials, declaration file labels, visible marks, interoperability and regulatory review remain required. General metadata stripping or a visible AI label does not establish complete compliance. Operator-specific legal documents, staff, privacy contacts, filings and region approvals remain release gates.

## Invitation continuation

Regional club and open-room sharing now creates cubers://invitation links with a bounded code, action and community. A public bilingual landing screen discloses the action, preserves an allowlisted destination through sign-in and requires a separate join/request button. The link never changes passive community detection, signs in to another region, auto-joins a club or starts a solve. A mismatched community is explained and blocked; legacy club links without a community are checked only against the current regional service. Club membership approval, rotated codes, room state/capacity, current permissions and mainland gates remain server-enforced.

Only scalar query values, UUID club codes and bounded base64url room codes are accepted. Caller-supplied return URLs are ignored. Invitation continuation stays in the local route parameters, not an analytics service or server user profile; do not publish private codes. Registration, resend and recovery modes keep the current sign-in route parameters. Opening an unrelated email link in a new app/browser session requires reopening the original invitation afterward; no background pending-invitation store is introduced. Dismissing clears the route. Club and room screens remount on account/community changes so an old private code is not left in the new view.

Two focused unit cases verify malformed/array/oversized/redirect query rejection and preserved destinations without arbitrary navigation. Full software checks and bundle evidence are recorded in STATUS.md. Cold-start deep links, email round trips, real share choosers, accessibility and account/connection changes still need native/runtime acceptance. No invitation was sent to a person.

## Authored introductions

[Original discovery readings and activities](DISCOVERY.md) now appear separately from real community posts. All four launch puzzles have bilingual teaching with current regional course links. Reading creates no post, engagement metric or progress, and does not enable gated mainland social/game services. The content is versioned with application releases; editable editorial announcements remain administration work.

## Current write authority

[Current community write authority](COMMUNITY-AUTHORITY.md) covers session/guardian/account changes after initial request authentication, expiry during real content-row waits, current staff MFA, independent child reviews and UUID normalization. Database effects roll back together when final authority fails; AI connection probing holds no account lock.
