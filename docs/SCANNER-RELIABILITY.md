# Scanner alignment and turn-animation correction

The 2026-10-28 correction addresses the owner's physical-test report: cube faces could remain undetected despite reasonable framing, and the turn cue looked like a rotating flat picture.

## What changed

The old cue transformed one already-projected SVG as a plane. The replacement rotates the vertices of all six faces in three dimensions, projects them with perspective, removes hidden faces and orders visible faces by depth. Each sticker stays attached to its face. Yaw and pitch use the puzzle engine's axes; the two-part fourth instruction finishes yaw before beginning pitch. The 180° instruction tips around the horizontal axis. The actual captured front colors remain visible as that face turns away; unobserved faces use neutral paper rather than invented sticker colors. The blur, approximately 1.5-second duration and reduced-motion fallback remain.

The old detector required almost exact guide-line placement, a fixed edge threshold and high hue-classification confidence on every sticker. In particular, plausible warm red/orange camera colors could have a low classification margin and stop alignment entirely. The replacement fits a bounded perspective grid around the guide, samples inside its fitted cells and uses exposure-relative edge evidence. Dim neutral stickers remain white rather than being assigned a hue from tiny channel differences. Modest offset, tilt, glare, defocus and thin stickerless seams are tolerated. All four perimeter sides and the complete internal grid still need evidence; plain fields, wrong framing and extra grid lines are rejected. A 4×4's central cross cannot silently qualify it as a 2×2.

The 500 ms stable hold still needs fresh images. A large change in fitted geometry now restarts it even when the face colors are unchanged. Movement after each capture, duplicate-face guards, logo-center repair and final full-cube validation remain. No image is uploaded, no progress is manufactured, and no backend contract or activation gate changes.

## Verification

The image fixtures are independently rasterized quadrilaterals with photographic color palettes, shading, JPEG compression, blur and optional glare. Their rendering does not call the detector's fitting/sampling functions.

| Check                            | Scope and result                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before/after detector comparison | 24 generated positive cases across 2×2/3×3/4×4: old detector 0 accepted; revised detector 24 accepted with correct sticker correspondence                                       |
| Independent pose/exposure corpus | 180 fixed-seed generated views: accepted with correct sticker correspondence                                                                                                    |
| Negative framing                 | Small, large, clipped/off-center and plain images rejected                                                                                                                      |
| Puzzle-size confusion            | All differing 2×2/3×3/4×4 pairs checked with solid and mixed colors; wrong grids rejected                                                                                       |
| Complete scan sequences          | Camera-image faces pass the actual hold/movement gates and reconstruct the exact validated cube for all three sizes                                                             |
| Animation geometry               | Six instructions × 61 poses; independent Three.js rotation comparison, rigid orthogonal axes, depth/visibility, sticker counts and projected bounds checked for all three sizes |
| Existing protections             | Stability, cooldown, repeated faces, stale camera leases, all 24 initial grips, logo correction and invalid-state refusal retained                                              |

These are generated-image and geometry checks, not a measured physical recognition success rate. The owner's actual camera, cube finish, glare, lighting and phone performance still need a fresh physical retest. Severe glare/occlusion, very dark footage or a face well outside the guide may still require repositioning or manual entry. An accepted alignment does not independently prove the color assignments or a physically legal cube; review and final validation remain mandatory.

## Reviewing the actual cue

A development build adds gear → Diagnostics → **Review scan turn animation**, with all six instructions and Replay turn. It uses the same overlay as the scanner, requires no account/camera/network and creates no records. Pale faces mean unknown colors. This review control remains absent from production UI.

The [automatic-scanning guide](AUTOMATIC-SCANNING.md) describes the complete learner flow. The [development-build guide](DEVELOPMENT-BUILDS.md) distinguishes standalone packages, Metro debug clients and unsigned iPhone installation requirements.

## Runtime and packages

The full source suite passes **472 tests**, workspace types pass, and the Android source proof matches **126 mobile files**. The installed standalone APK runs the real overlay: 16 captures across the fourth instruction show changing 3D poses with yaw followed by pitch. Its native camera completes **247 snapshots** while the non-cube emulator pattern remains at 0/6 faces; the retained log has no fatal exception. This is an emulator test, not a physical cube/phone test.

Current [development APKs and unsigned IPA](DEVELOPMENT-BUILDS.md#current-artifacts) contain the fix. The iPhone package's **125 matching mobile sources** are newly compiled into Hermes bytecode against the unchanged 2026-10-27 native runtime; 87 original files remain unchanged and all 88 archive files match. Its native engine and new bytecode both use version 96. Static inspection passes; this does not establish iPhone runtime acceptance or signing.

![Captured Android turn sequence](../artifacts/screenshots/cubers-scan-turn4-native-20261028.png)

![All six geometric turn instructions](../artifacts/screenshots/cubers-scan-turns-20261028.png)
