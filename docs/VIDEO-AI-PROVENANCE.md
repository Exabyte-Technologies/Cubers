# Video source labels and lossless claim decoding

Implemented 2026-10-19. This extends [image source claims](IMAGE-AI-PROVENANCE.md) to supported static MP4/MOV metadata. It does not authenticate origin or complete all AI-labeling requirements. No real AI provider or credential is used.

The later [attachment-declaration and visible-file-label workflow](MEDIA-AI-LABELS.md) now covers immutable per-file author declarations and visible/embedded labels in newly processed supported files. The original evidence and then-current limits below remain historical. Legacy files, unsupported formats, credentials, native acceptance and operator review remain open.

## Connected behavior

Before processing a post video, the worker inspects its movie/track/media metadata and user-data atoms, including indexed metadata keys/items, freeform values and bounded UUID/XMP packets. It supports typed UTF-8 and UTF-16BE values and the existing three source classes. Encoded audio/video sample payloads are not searched for JSON.

The source claim is stored in the existing private media fields and owner export. Readers receive its class, and source-labelled videos force the post label on creation/edit even when the author declaration is false. Retaining an attachment retains its source label. Edits require fresh approval. The reader explicitly distinguishes an unverified source claim from the author's declaration.

Output is a silent MP4 with the selected video stream copied, unrelated global/stream metadata and chapters removed, and one canonical `AIGC` metadata value. The allowlisted source fields retain their meanings; Cubers supplies its propagation name/opaque media ID and clears the previous propagation signature. The worker reparses the completed output and compares it with the expected propagation record **before upload or READY status**. A dropped or changed claim therefore fails processing. Producer identities and signature claims are not verified.

The native picker now requests passthrough video instead of transcoding before inspection. It permits the OS to retrieve a selected cloud-only asset; it does not send media to AI. Native/OS fallback behavior and playback compatibility still require physical acceptance. The existing MP4/MOV, H.264/HEVC, size, duration and geometry admission limits remain. Private competition evidence keeps its separate authorization/retention workflow; these post-source fields are not an authenticity check for competition footage.

## Bounds and decoding

- At most 8,192 atoms, depth 12, 1,024 metadata keys and 256 bytes per key. Metadata values/key packets are limited to 32 KiB each and 128 KiB in aggregate. Normal, extended-size and end-of-parent atoms have checked boundaries.
- Conflicting/malformed claims, missing recognized values, unsupported recognized encodings and known compressed movie/binary-XML structures are refused rather than silently stripped.
- Recognized C2PA UUIDs, JUMBF atoms and credential markers are refused because the app cannot preserve/authenticate their full semantics. This is not complete credential detection or C2PA verification.
- Shared image/video claim parsing rejects duplicate JSON keys, including escaped duplicates. Escaped outer `AIGC` keys are recognized. Malformed UTF-8 cannot silently replace a retained identifier.
- Plain JSON entity-like text stays literal. XML packets decode predefined/numeric entities once; invalid code points and unknown entities are refused without resolving external resources. Canonical output remains bounded ASCII-escaped JSON.

No migration was added: the existing migration-34 fields and constraints cover post media. Existing ready uploads are not rescanned, and previously stripped information cannot be recovered automatically. Metadata follows the attachment/account deletion and backup limits. Authorized downloaders can read the retained claim fields in the file, as disclosed by the bilingual privacy text.

## Verification

Focused checks pass **21/21**, including actual FFmpeg processing with simulated persistence, source classes across MP4/MOV, typed encodings, malformed/conflicting claims, box bounds, private global/stream fields, silent output, credential refusal and image-regression cases. Full source checks pass **206/206**, workspace types and API/admin builds pass, and fresh web/iOS/Android exports pass. Exports are not physical or visual acceptance.

The final full storage/publication integration suite passes **189/189**. It includes actual private uploads/downloads, MP4/MOV processing, label coercion despite false declarations, exact-version review/edit withdrawal, owner export and malformed-source refusal. An old physical-ranking fixture assumption was corrected: a newly approved result need not enter a top-100 board that already contains faster results. The test verifies stored approval and correct bounded/category-separated order; production ranking behavior is unchanged.

Final Docker run **22c7c834** passes **40 INTL / 36 CN** groups on all **34 migrations**, including compiled metadata/credential checks in both regions and actual video storage/worker/publication checks internationally. Mainland social/game/AI and public-release approvals remain off. Encrypted recovery **fff0dbe3** passes **17 groups per region**, preserving image/video source fields and pending post labels without publishing or unsealing either target. Six inherited anonymous volumes and all owned resources were removed; independent checks found zero remaining containers/networks/volumes and zero dangling volumes, including the preceding intermediate run.

The updated preview returns healthy INTL/mock mode and current English/Chinese disclosure, with 34 migrations, 149 courses and zero posts/device reports/source-labelled uploads. No community activity was manufactured. The recorded source logs are `.data/video-ai-final-unit.log`, `.data/video-ai-verified-integration.log`, `.data/video-ai-final-types.log`, `.data/video-ai-final-build.log`, `.data/video-ai-final-api-build.log`, `.data/video-ai-bundles.log` and `.data/video-ai-style.log`. Private run reports remain under `.data/docker-smoke/22c7c834/` and `.data/recovery-drill/fff0dbe3/`; do not publish synthetic credentials from raw artifacts.

## Remaining work

Native/cloud-picker and playback/accessibility acceptance; timed metadata, compressed/other containers and encodings, HEIC and complete content credentials; legacy-file handling; metadata and visible marks for user-declared files and all exports; actual source/operator identifiers, independent interoperability fixtures and regional legal review. Production ranking/hardware/regional approval gates remain unchanged. See the full [implementation status](STATUS.md).

The [CAC rules](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm) and [GB 45438-2025](https://www.xiongan.gov.cn/20250617/99e8309670814bdba91b3bcbfaca4e6c/2025061799e8309670814bdba91b3bcbfaca4e6c_38598ff9004470443c9195f1655adb29a0.pdf) inform the source/declaration distinction and propagation fields. Container handling follows [Apple metadata structure](https://developer.apple.com/documentation/quicktime-file-format/metadata_atoms_and_types) and [data-value fields](https://developer.apple.com/documentation/quicktime-file-format/value_atom); the refused UUID comes from the [C2PA BMFF specification](https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html). Processing uses FFmpeg's documented [metadata mapping](https://www.ffmpeg.org/ffmpeg.html) and [MOV/MP4 muxer options](https://www.ffmpeg.org/ffmpeg-formats.html). These references do not certify the app or its operators.
