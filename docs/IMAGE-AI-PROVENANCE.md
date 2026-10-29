# Imported image AI source claims

Implemented 2026-10-19. Source, storage/publication integration, regional containers and real encrypted recovery checks pass. This limited JPEG/PNG path does not establish complete labeling compliance or authenticated origin.

This records the original image milestone. The subsequent [video and lossless-decoding extension](VIDEO-AI-PROVENANCE.md) provides the current validation totals and also preserves supported static MP4/MOV claims. The historical checks and limits below remain evidence for this image stage.

The later [attachment-declaration and visible-file-label workflow](MEDIA-AI-LABELS.md) now covers immutable per-file author declarations and visible/embedded labels in newly processed supported files. The original evidence and then-current limits below remain historical. Legacy files, unsupported formats, credentials, native acceptance and operator review remain open.

## Behavior

Before resizing post images, the worker inspects bounded JPEG APP1/APP11/comment segments and PNG text/EXIF chunks for `AIGC` JSON. Source classes remain distinct: generated (`1`), possibly generated (`2`) and suspected generated (`3`). An absent recognized claim does not establish human authorship. No image is sent to an AI provider.

Only standard label, producer, production identifier and reserved/propagation fields are retained. Unknown fields and unrelated EXIF location/device metadata are removed. Generated XMP keeps the source claim and producer reserved field, adds `Cubers` and an opaque media identifier as propagation fields, and clears the previous propagation signature. Neither signatures nor producer identities are authenticated. Authorized image downloaders can read these retained fields in the actual file.

The original recognized fields stay in private media metadata and the owner's account export. Reader JSON APIs expose only the label class. These records follow existing attachment/account deletion and backup limits. Post creation and editing force a label while a source-labelled image is attached, even when the author's declaration is false. The strongest attached class wins in order `1`, `2`, `3`. Reader and staff wording distinguishes source claims from author declarations. Removing an attachment permits a fresh declaration and requires the usual new review. Guardian/moderator controls still apply.

Native selection requests the current representation and full quality, then copies supported image bytes without the previous image-manipulator conversion. Web selection also uploads the chosen file. HEIC/other unsupported photos now receive an explicit format message instead of conversion; preserving the original supported container is necessary for server inspection. OS picker fallback conversion still requires physical-device testing. Videos were outside that initial image milestone; the subsequent extension linked above now handles supported static video metadata.

## Bounds and refusal

Inspection permits 32 KiB per segment, 128 KiB total and 4,096 chunks/markers, with bounded fields, JSON nesting, PNG decompression and generated XMP. Malformed, conflicting, excessive or recognizable unsupported claims are rejected instead of silently stripped; identical repeats are accepted. Recognizable UTF-16 claim markers, credential markers and PNG `caBX` chunks are refused because their full semantics are unsupported. This is conservative refusal, not exhaustive detection.

Sharp keeps the existing pixel limit, orientation correction and 2,048-pixel output boundary. Rejected objects have no download URL and cannot attach to a post. Migration 34 adds nullable fields without rescanning legacy files. Database constraints bind media label/JSON values and prevent a source-labelled post from clearing its general AI flag.

## Current verification

Focused checks pass **13/13**: real Sharp JPEG/PNG round trips, three source classes, Unicode/XML escapes, allowlisting, compressed text, conflicts, malformed containers, size/decompression limits, UTF-16 refusal, credentials and upload selection. Three of these checks invoke the actual worker with simulated storage/database access and verify output metadata, rejected-file cleanup and deletion during processing. They open no sockets and do not establish actual storage/database acceptance. The source-test command now explicitly uses the API TypeScript decorator configuration needed by these worker checks. Workspace types, API/admin builds and web/iOS/Android exports pass. Bundling does not establish native or visual acceptance.

The image milestone passed **198/198** source checks and **188/188** integration checks, including the editable API URL and simulated-provider AI cases. No real AI or key was used. Its historical logs are `.data/image-ai-final-unit.log`, `.data/image-ai-focused.log`, `.data/image-ai-integration.log`, `.data/image-ai-final-types.log`, `.data/image-ai-final-build.log`, `.data/image-ai-final-api-build.log`, `.data/image-ai-bundles.log` and `.data/image-ai-style.log`.

Integration checks cover actual private storage/worker processing, forced labels, edits/reapproval, cross-owner denial, owner exports, rejected sources and database constraints. Docker run `0c83c541` passed **39 INTL / 35 CN groups** on all **34 migrations**. Both regions execute the compiled JPEG/PNG parser/writer; INTL additionally checks actual storage/worker output and forced post labels. Mainland social/game/AI approval gates stay off. Real encrypted recovery drill `12c3f4b8` passed **16/16 groups per region**, including retained source claims and forced pending post labels. Both targets stayed sealed; all owned resources and six inherited anonymous volumes were removed and independently checked. This preserves database metadata, not external origin authentication.

Migration 34 is applied to the restored local preview, whose updated API returns healthy INTL/mock mode. It preserves 149 courses and has zero posts, device reports and source-labelled uploads. Web/admin preview servers are running; there is no fresh visual or physical acceptance.

## Remaining release work

Native picker/playback/accessibility acceptance; HEIC/other containers and encoded EXIF; remaining video metadata/format provenance; complete credential/C2PA handling; author-declared file labels and output/download propagation; visible image/video marks and placement/duration; legacy-file review; independent interoperability fixtures; operator propagation identifiers, trace retention and regional legal acceptance. A post notice and custom XMP alone do not fulfill these requirements. The complete app plan remains active in [STATUS.md](STATUS.md).

The [CAC labeling rules](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm) distinguish source labels, declarations and other indications and prohibit malicious removal. The [official GB 45438-2025 index](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=F32EA2A561F1886CD8D606513512D547&refer=outter) and [government-hosted standard](https://www.xiongan.gov.cn/20250617/99e8309670814bdba91b3bcbfaca4e6c/2025061799e8309670814bdba91b3bcbfaca4e6c_38598ff9004470443c9195f1655adb29a0.pdf) inform field names and unfinished explicit/implicit labeling work. This implementation is not a legal certification.
