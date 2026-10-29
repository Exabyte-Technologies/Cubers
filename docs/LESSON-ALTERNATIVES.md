# Shorter last-layer practice sequences

Implemented 2026-10-20. The original 149 courses and 120 case identities remain intact. **66 cases now have an optional shorter sequence** with original English/Simplified Chinese instructions:

| Family | Alternatives | Original turns across those cases | Alternate turns |
| --- | ---: | ---: | ---: |
| OLL | 7 | 137 | 118 |
| PLL | 19 | 553 | 274 |
| CLL | 40 | 972 | 365 |

These counts use outer face turns; a half turn counts once. For example, CLL Cubers case 1 has a 7-turn alternative to its 36-turn composite, and PLL Cubers case 9 has a 17-turn alternative to its 44-turn composite. These are fewer-turn options, not claims of fastest finger tricks, globally optimal solutions or standard case numbering. Cases without a strictly shorter validated candidate retain their original guide. Further OLL optimization and native teaching acceptance remain work.

## Same exercise, preserved history

Each option solves the **exact existing representative**, including its complete color frame. Its inverse creates the identical starting state. The original algorithm, case pattern, exercise identity and recognition prerequisites are unchanged. This is stronger than solving a rotated cube or orienting only its upper face. Some alternatives temporarily disturb completed layers; the complete sequence restores them. Check all six faces after finishing.

Online and downloaded drills offer the original and shorter guides with bilingual instructions, next-move hints and step demonstrations. Choosing another virtual guide resets the model and local moves. Offline practice retains the existing private account/session lease and grants no server progress. New clients explicitly request `includeAlternatives: true`; older strict clients receive the original v1 download content without the extension. Existing packets without alternatives remain valid.

Saved physical practice binds the selected guide when created. A resumed session restores that guide and prevents a mid-session selection change; finish or cancel before choosing another. Scans and server reconstruction still verify the original setup, actual confirmed turns and final state. A selected guide is teaching context, not proof that every physical move was captured.

Migration 37 adds nullable `LessonSession.guideId` and `guideAlgorithm` as a constrained pair. `algorithm` remains the original setup sequence; `moves` contains actual submitted/confirmed moves. The server resolves guide IDs from the current published course, refuses client-supplied algorithms, and retains session/course versions. Historical sessions retain null guide fields and their original moves. Export/deletion and existing history paths include the new session fields through the same owner-bound records.

Tutoring resolves the same published guide before producing an explanation. Under-18 accounts receive its authored teaching. Current account/session/guardian and adult-chat permissions are checked before generation and at delivery. The online lesson stops demonstrations and ignores pending view responses on blur/background; every visible turn retains a matching move prefix. See [LESSON-LIFECYCLE.md](LESSON-LIFECYCLE.md). Mock/disabled providers retain deterministic algorithms and fallback behavior; no live AI credentials or calls were used. Scan recognition continues to return the original case guide; opening its lesson makes any currently published alternative available.

## Authoring and rollout

The admin course editor can load the source-checked option, inspect both languages, remove it, save a draft and publish a reviewed new version. The original setup fields remain protected. Legacy versions may omit alternatives. Built-in alternatives must match the packaged source; custom drill options must independently solve their exact baseline in fewer turns. Unknown/duplicate identities, extra fields, oversized teaching, impossible or changed setups, and fixed alternatives on state-dependent first-solve courses are refused.

Normal seeding creates new courses but does not overwrite existing regional edits or publication decisions. Existing production installations require the ordinary administrator draft/review/publish workflow. A separate `scripts/preview-lesson-alternatives.ts` utility accepts only the fixed international development preview (`127.0.0.1:54329/cubers`, development mode, mock AI, release approval off). It appends the packaged alternatives as new versions, preserves existing bilingual edits and publication state, records old/new revisions and a development audit, and refuses differing existing alternatives. It is not included in application images or a production approval path.

The local preview upgrade added alternatives to 66 courses without rewriting its existing progress. Deploy compatible clients before publishing new teaching. Signed/native release, physical-camera acceptance, operator review and all original regional/privacy/security gates remain separate requirements.

## Generation and validation

`node scripts/generate-algorithm-alternatives.mjs` is offline maintainer tooling. It uses the pinned unmodified cubing.js 0.66.1 complete-state 2×2 and two-phase 3×3 solvers, then independently verifies every result through Cubers' sticker engine. Generation has worker/deadline bounds, excludes unsupported notation and writes its candidate file atomically only after all cases validate. It sends no accounts, state scans or other data to a service. Review regenerated candidates rather than treating solver output as publication approval. The existing [library source/license notice](WCA-SCRAMBLES.md#upstream-attribution) also applies to this dependency.

Unit checks cover all 66 options, exact original states/frames, solved results, bounded bilingual contracts, unchanged legacy content, protected authoring fields, rejected fabricated guides and validated offline packets. Backend checks exercise the three families through real course drafts/publication, virtual and scanned completion, both download formats, selected-guide versus actual-move persistence, stale/forged requests, SQL constraints and authored minor tutoring. Container and encrypted-restore results are recorded in [STATUS.md](STATUS.md). Fresh UI, screen-reader, poor-network and physical teaching acceptance remain unverified under the existing inspection/device restrictions.
