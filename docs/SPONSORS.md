# Sponsor campaigns

Cubers uses optional first-party text cards, explicitly labeled **Advertisement / 广告**, for currently verified adults. Cards are the same scheduled regional selection rather than personal recommendations. No advertiser SDK, remote creative, user profiling, impression counter or click-history table is added. Minors and unverified adults receive no card or website-opening response. Mainland adults additionally require current identity verification and approved mainland social service operation.

## Regional controls

`SPONSORS_APPROVED=false` is the deployment default. It represents actual regional advertising and protected archive-custody review, not a software test result. Keep it false until the operator completes that review. The separate persistent regional switch is also off by default. Global approval, the switch, exact content approval, a campaign's enabled state and its current schedule must all permit delivery. The server rechecks the full current session, account, region, age and verification. A stale client or captured request cannot supply eligibility.

The admin **Sponsor campaigns** area connects to the real regional database. Administrators with current MFA can create bilingual drafts, edit, approve, withdraw approval, enable/disable a campaign and change the global switch. Current MFA staff can read paged metadata and archived versions; moderators cannot write. Each write checks current role, factor generation, full session and expiry after taking the account lock. Expected versions reject stale changes; edits always disable the campaign and remove prior approval and archive reference. An approval remains off until a separate enable action. Staff confirmation is a manual workflow, not automated legal certification.

Campaigns are limited to cubing equipment, education or events. English and Chinese titles/descriptions, a reviewed HTTPS landing page and a bounded schedule are required. The operator reviews both languages, claims, rights, advertiser identity/qualifications/permissions and the destination including redirects. Approval requires a protected advertiser-register reference. The app does not fetch the destination, process a private advertiser proof upload or independently verify external custody. The operator's register must actually contain the business documents, linked review evidence and actual publication records; metadata in this database alone does not establish compliant advertising operation.

## Destinations and mobile behavior

A shared portable parser accepts conservative ASCII DNS HTTPS addresses and encoded paths. It rejects credentials, literal IP/local/reserved hosts, nonstandard ports, query parameters, fragments, malformed escapes, controls and ambiguous dot paths. It preserves the reviewed path across Node, browsers and React Native; the latter's built-in URL implementation can otherwise add a slash. This grammar is not DNS pinning or a guarantee against changed sites, DNS aliases or redirects; human destination review remains necessary.

Discover shows at most three eligible cards, ordered by schedule with a stable tie-break. No third-party page or image is prefetched. Each response has at most a 30-second lease, capped by the campaign's end. The client subtracts request time and clears cards during refresh, background/hidden state, navigation and account/community changes. Delivery is a short-lived snapshot; withdrawal is reflected at refresh/lease expiry, not instantaneous remote erasure from an offline screen. Before opening, the server rechecks the exact current version and eligibility. A changed, stopped or expired campaign cannot supply a new opening response.

The user reviews the external address and explicitly confirms leaving Cubers. No account/puzzle data is appended. Native uses the OS link handoff; web uses same-tab navigation with `noreferrer` and `no-referrer` after validation, avoiding asynchronous popup blocking and referrer disclosure. The external site's own privacy rules apply. Interactive browser/native acceptance is still unverified.

## Records and expiry

Migration **30**, `202610180004_sponsor_campaigns`, adds bilingual content, current versions/review metadata and `CampaignRevision`. Every new saved state is archived with its content, schedule, enabled/reviewed state, protected register reference, reason and retention deadline. Versions are append-only through this service, not signed or tamper-proof against database administrators or full storage rollback. The archive adds no viewer/account identifiers or business proof files. Do not paste personal identifiers or proof documents into campaign copy or reasons. Staff actions retain the existing audit trail; ordinary account erasure can redact that separate trail. Operator records must therefore independently establish responsible review and actual publication history.

Archive retention runs for three UTC calendar years after the later of the scheduled end or state change; leap days are conservatively extended. Bounded maintenance removes expired revisions and then old campaign rows with no remaining archive. Expiry and campaign writes share a transaction-level advisory lock, preventing cleanup from deleting a concurrent new revision. Cleanup is periodic, not a forensic deletion or production latency guarantee. Existing encrypted database/backup rules still apply. Actual protected-register custody, regional retention/hold procedures, alerting and capacity acceptance remain operator release requirements.

The migration archives legacy metadata and its prior global setting before suspending legacy publication, then records that suspension. It does not invent a Chinese translation or proof reference. Legacy campaigns require current bilingual review; the global switch resets off. Deploy migration and matching API/worker/admin/mobile together. The old create-and-enable payload and unversioned global toggle are rejected. Nothing was published or enabled in the local preview.

## API

- `GET/POST /v1/admin/campaigns`: paged library/current regional controls; create disabled draft.
- `POST /v1/admin/campaigns/:id/content`, `/review`, `/enabled`: expected-version content, exact review/withdrawal and enable/disable operations.
- `GET /v1/admin/campaigns/:id/history`: paged retained versions.
- `POST /v1/admin/settings/sponsors`: expected-version regional switch.
- `GET /v1/sponsors`: bounded short-lived adult-only cards.
- `POST /v1/sponsors/:id/open`: current eligibility/version validation; JSON destination, never an HTTP redirect or a fetch of that website.

## Verification and legal context

Five new unit checks cover content/URL contracts, bounded public responses, exact native URL behavior and calendar retention. Five new backend checks cover persistent versions/concurrent edits, current adult access, approval withdrawal/stale opens, factor changes after real database lock waits, concurrent expiry and independent mainland denial. A separate real PostgreSQL migration check upgrades a database containing legacy enabled records, proves both archives survived and confirms all 30 migrations. Final source, regional container, bundle and sealed-backup results are recorded in [STATUS](STATUS.md) and [Docker verification](DOCKER-VERIFICATION.md). No real AI, advertiser, business-document review or production approval was used.

The official [2023 Internet Advertising Measures](https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2023/art_d93a579afd45413e8576e4623fab348f.html) address recognizable advertising and advertiser review/archives, including at least three years after publication ends. The [2024 identification guidance](https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/ggjgs/art/2024/art_89824524f2804c5594e95408fbdf8602.html) further explains labeling. These official sources informed this workflow; operator role/classification, actual advertiser materials, other regional rules and current legal approval are separate checks. Do not treat a checkbox, reference string, passing test or this implementation note as regulatory certification.
