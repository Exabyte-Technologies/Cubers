# Pyraminx virtual controls

Updated: 2026-10-26. The existing 3D Pyraminx now selects the turn from the displayed geometry. Tapping a tip turns only that tip (`u`, `l`, `r`, `b`); tapping a center sticker turns its corresponding main layer clockwise (`U`, `L`, `R`, `B`). Edge stickers have two adjacent turning axes and do not choose one automatically. Background, exposed body and invalid-coordinate taps cannot turn a hidden sticker. English and Chinese instructions are visible alongside the existing labelled move controls, which retain prime turns, undo, hints and replay in their existing flows.

Drag rotation uses the shared single-pointer gesture tracker. Cancelled gestures, multiple touches, a drag that returns to its starting point and repeated release cannot create a tap. Picking uses layout coordinates rather than display pixels and follows the rotated view. Read-only views rotate without making turns; animation and renderer failure block picking. Renderer failure cancels interaction and releases scene resources while preserving the labelled flat face view.

Animations now require the claimed single turn to reconstruct the next actual puzzle state. Snapshots that do not match that transition rebuild directly. A legitimate inverse can animate when it actually reaches the next state. Reduced-motion preference skips turn animation and completes an in-flight animation on the next frame.

The shared Pyraminx view connects these controls to the existing online and downloaded lessons, assessments, guided first solves and virtual games. The existing callbacks continue to validate availability and submit their usual move records; pointer coordinates and ray intersections stay local. No API, database schema, native dependency, protocol, service credential or production activation setting is changed.

## Verification

Five focused tests use actual Three.js triangle geometry and projection, without rendering or UI inspection:

- 972 picks across solved/scrambled/reoriented states, all four faces, multiple view rotations and three viewport sizes.
- Body/background/edge occlusion and invalid coordinates.
- All 16 main-layer/tip/prime animations finish at the exact independently reconstructed sticker positions and colors.
- Repeated, recovered and mismatched snapshots do not invent a turn.
- Actual picking composes with gesture cancellation, multi-touch, returning drags and single release.

All **408 source checks** pass, with mobile types, strict interaction-test types and formatting. Eight selected authenticated Pyraminx integration checks pass with local PostgreSQL and simulated AI. The new check selects real tip and main-layer meshes, submits their moves through authenticated course-completion routes, verifies incomplete work is refused and confirms exact virtual history and completed progress persist. Existing selected checks cover tutoring, races, relay and physical/guided permission boundaries. Other backend groups are unchanged and were not rerun in this milestone.

These checks do not prove touch behavior, visual quality, accessibility or native-device acceptance. No app UI was inspected. AI remains simulated; real hardware/provider/ranking and public-release gates remain off. Deployment, signing, native acceptance, operating/legal review and store approval remain requirements of the full project.

## Preserved packages

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `artifacts/android/Cubers-0.1.0-arm64-unsigned-review-20261026-pyraminx-controls.apk` | 49,596,752 | `8ad50737512008776cb9ea1ebfd9ff181fae5daf9a85392c39537af4be5e4523` |
| `artifacts/ios/Cubers-0.1.0-iphone-release-unsigned-20261026-pyraminx-controls.app.zip` | 14,372,929 | `e17abb0ecca05a48f4ba1500f0fbdd16cfce4f055846c2a1e857994d2111354f` |

Web, iOS and Android exports pass. The web image records 195 current source hashes and 41 packaged files; the production three-host proxy configuration adapts successfully. Android review and unsigned iPhone Release compilation pass with independent temporary caches. Actual embedded Hermes code in both native packages and both exported native bundles contains the new English/Chinese controls and reserved service addresses. All 86 iPhone files match the archive. Android static inspection verifies signature absence, non-debuggable configuration and all 24 native-library layouts. The iPhone archive has no team signature; its 12 native privacy manifests remain subject to acceptance. These are review packages, not installable signed releases. Earlier artifacts are preserved.

No backend runtime, database migration, provider/hardware approval or public-release flag changes. Existing API/admin/container and store data-flow evidence remains historical evidence for unchanged sources; no new full backend/load/recovery/real-provider acceptance is claimed. Private proof is in `.data/pyraminx-controls/`.
