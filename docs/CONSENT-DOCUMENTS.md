# Private consent-document review

Guardian consent review now uses page images from an isolated PDF renderer. Signed originals remain unchanged in the existing private consent-media archive. The normal media endpoint no longer returns a raw PDF URL, including for legacy consent records. Background `READY` status means the file was archived; it is not proof of safe content, a valid signature, guardian identity or approved consent.

Guardians should upload an unencrypted PDF of one to eight pages, no larger than 10 MiB. Staff open **View document pages / 查看文件页面**, inspect every page, and independently check the signed document, guardian identity and relationship. The page viewer explicitly states that digital signatures are not validated. A file's SHA-256 binds its bytes, not its authenticity. Unreadable or unsupported documents can be rejected without asserting that identity or signature checks succeeded. Consent, posting and recording permissions remain separate decisions.

## Access and approval

`GET /v1/media/:id/document-review` accepts only the current owner or current staff with MFA. Before reading storage and again before delivering images, ordered account/guardian/session checks verify the community, live full session, owner state and unchanged media identity, size, key, digest and readiness. No account locks cross storage or renderer work. The archive bytes must match both recorded size and SHA-256.

Staff previews create a private audit receipt bound to the document digest, staff account, hashed session identifier, MFA generation and community. Approval includes its `documentReviewId`; the server requires a matching receipt less than ten minutes old, the same current guardian's document, current authority and all three human confirmations. A receipt records preview preparation, not proof that a human read it. Owner previews do not create staff receipts. Rejection does not require a preview receipt. Expired, changed-document, other-session and revoked-authority results cannot authorize approval.

The viewer holds only JPEG data in component memory. Closing it, changing accounts/tabs or hiding the page discards the images; late results cannot repopulate a closed viewer. Responses use `private, no-store`. The original is neither rewritten nor flattened, and no preview objects are added to storage or backups. Original archival retrieval requires separately controlled operator handling; routine app review never opens the original PDF. Existing consent retention, account deletion and media recovery continue to govern the archived object.

## Isolation and bounds

The production Compose stack adds a `documents` service. It has **no network**, application credentials, database, storage or Docker-socket mount. It runs as UID/GID 1000 with a read-only root, dropped capabilities, no new privileges, an init process, a 32-process limit, 512 MiB memory and one CPU. Private scratch uses bounded temporary memory. Only the API and its community's renderer share the one-MiB Unix-socket volume; the socket is mode 0600. Regional Compose projects retain separate volumes and services.

Poppler first determines the page count and refuses encrypted or overlong documents, then renders JPEG pages at a maximum 1600 pixels on the longer edge. The renderer admits one job, caps input/output bytes, limits upload time and parser runtime, kills timed-out/cancelled process groups and waits for actual child close before scratch cleanup and releasing admission. Parser diagnostics are bounded and never logged. The API admits at most two underlying previews, limits each account to twelve requests per minute, bounds archive reads to three seconds and renderer response size, then decodes and reencodes each JPEG with pixel, dimension and byte limits. It accepts no HTML, SVG, embedded links or executable PDF objects as viewer output. Service outages return a retryable unavailable response.

Rendering reduces the attack surface of routine review; it is not a malware-free certificate, signature verifier or guarantee against parser or image-library vulnerabilities. Keep the image patched and independently assess document fidelity and infrastructure isolation before real intake. Poppler rendering options are described in its [upstream manual](https://skia.googlesource.com/third_party/poppler/+/master/utils/pdftoppm.1); deployment isolation uses [Compose network controls](https://docs.docker.com/compose/how-tos/networking/) and [service constraints](https://docs.docker.com/reference/compose-file/services/).

## Running it

Production builds use `infra/Dockerfile.documents`, and `compose.production.yml` starts the isolated service before the API. Keep `CONSENT_REVIEW_SOCKET=/run/cubers-documents/review.sock` consistent with the socket mount and health check. Continue using the required recovery overlay and private regional deployment configuration described in [RELEASE.md](RELEASE.md). No public renderer port is exposed.

For a host development API, Docker Desktop's Linux socket cannot be used directly from macOS. Build the renderer, then start the provided private bridge in another terminal:

```sh
docker build -f infra/Dockerfile.documents -t cubers-documents:local .
node scripts/local-document-review.mjs
```

Start the development API with its host socket:

```sh
CONSENT_REVIEW_SOCKET="$PWD/.data/local-documents.sock" npm run dev:api
```

The bridge creates one owned no-network container with the same resource constraints, verifies its renderer-source hash and sends bytes through a private host socket and Docker standard input. It mounts neither host files nor credentials in the parser. It bounds requests/results, waits for the underlying client process to close, and removes its own container/socket on shutdown. It refuses to overwrite an existing socket. Metadata in `.data/local-documents.json` identifies the owned container; inspect that ownership and live processes before recovering an interrupted bridge. These are development tools, not a production Docker-control service.

## Verification record

2026-10-24: **338 source checks**, **314 backend checks**, workspace types/builds and web/iOS/Android JavaScript exports pass. Six new backend cases cover private images and unchanged evidence, current owner/staff/MFA access, digest and image-contract failures, revocation during rendering, stale/other-session receipts and rejecting unreadable documents. Three transport groups cover exact private bytes, redirects/busy/malformed results and truncated responses.

Docker **582e11bb** passes **61 INTL / 57 CN** groups on all **46 migrations**, including real no-network Poppler rendering, invalid/nine-page refusal, unchanged archived bytes, receipt-required approval and actual container isolation constraints. The private host bridge also renders a synthetic two-page document into two nonblank 1237 × 1600 JPEGs. A separate actual HTTP flow through a temporary API and the test database verifies private/no-store image delivery, missing-preview approval refusal, receipt-bound approval and unchanged archived bytes, then removes its synthetic accounts and object. Packaged hashes match **52 API / 50 migration-image / 42 recovery files** and **three admin assets**; independent inspection finds no regional test containers, networks or volumes. Two inactive sockets from the failed fixture setup were removed after checking ownership, creation time and absence of listeners. The intentional preview renderer remains running with empty private scratch. All thirteen saved preview table hashes remain unchanged, login and simulated tutoring pass, and activation gates stay off. No browser, admin-screen, accessibility or real-document acceptance is claimed. All AI remains simulated or disabled; no real provider, guardian identity, signature or device was used.

The initial Debian package download failed with HTTP 500/502; bounded retries completed the package image. A later registry metadata lookup timed out, so the corrected renderer source was copied onto that exact completed local package image, with source hashes recorded. API images retain their recorded dependency and OS/runtime bases; no current upstream OS refresh or security audit is claimed. The interrupted host services were restarted using their preserved directories. A new test fixture initially reused synthetic emails and leaked a socket on setup failure; unique identities and unconditional cleanup fix it. A failed full run also exposed old synthetic receipt schedules outliving their private fixture keys; fixture-owned schedule cleanup fixes reruns without changing production workers. Failed logs are retained. No dependency-audit upload was made.

No database migration, new backup object type, native compilation or new encrypted restore drill is needed for this review path. Native/visual/accessibility acceptance, independent security and operator document handling, real services, legal review and the original full release scope remain open. Evidence is retained privately in `.data/consent-documents/` and [STATUS.md](STATUS.md).
