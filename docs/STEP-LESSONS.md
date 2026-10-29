# Scrolling choices and state-based lessons

Implemented 2026-10-26. This amendment preserves Cubers’ existing Hum theme, game accents, routes, real progress, bilingual legal pages, permissions and launch gates.

## Interface changes

- Rows containing only pill-shaped `Chip` choices stay on one horizontal line. Labels do not wrap; overflowing rows scroll. Keyboard focus reveals the focused pill immediately, with an explicit browser pressed state. Ordinary action-button rows retain their existing layout.
- Shared move controls form six-column rows: three moves with their inverses, followed by separate half-turn rows. All available moves remain reachable. Width and spacing adapt to retain 44-point targets and six visible controls at the reviewed 375px phone width. Smaller available spaces scroll; incomplete Pyraminx rows leave empty cells rather than invent moves.
- Active stage lessons lead with the current target, a bilingual explanation of the next turn, and the actual colored model. The next-turn action follows the cube. Fuller teaching and holding explanations, plus cube face diagrams, remain available through details. Compact models retain text access to their colors.

[Before/reference and current screenshots](../.hallmark/step-lessons-compare.html).

## State-based teaching

Camera and manual color entry validate a legal complete puzzle state before planning. Guidance normalizes the holding frame without recoloring stickers. Only face colors reach the learning API; this feature does not upload camera photos. The browser retains its existing manual-entry fallback; native camera recognition is packaged but has not been accepted on physical devices.

The smart path uses the connected device’s independent position and existing frame, counter, epoch, ordering and freshness checks. It never substitutes a solved cube when a snapshot is absent. Shipping hardware acceptance remains disabled; tests use an isolated synthetic capability override, not a production change.

Virtual learners choose either all-face color entry or an authored setup that already meets the lesson prerequisite. Its displayed setup is distinct from a competition scramble. Existing WCA room scrambles are unchanged.

The server checks that the preceding milestone is complete and the selected target is unfinished. If the cube is earlier or later, a structured response names the matching lesson; the app offers navigation there. Solved cubes are identified separately. Every initial plan, rescan and replan is cropped to the selected target. Completion saves that unit’s progress, never whole-solve or competition credit for a partial unit. Physical learning checkpoints still require fresh scans; smart checkpoints still require fresh independent device positions.

| Unit | Target | Required previous milestone |
| --- | --- | --- |
| 3-cross | White cross | None |
| 3-corners | White-layer corners | White cross |
| 3-middle | Middle edges | White layer |
| 3-yellow-cross | Yellow cross | First two layers |
| 3-sune | Yellow face | Yellow cross |
| 3-pll | Last-layer permutation | Yellow face |
| 2-beginner | First layer | None |
| 4-reduction | Centers, paired edges and valid reduction | None |
| pyr-beginner | Axial pieces and tips | None |
| pyr-intuitive | Yellow base edges | Axials and tips |
| pyr-last-layer | Remaining edges | Yellow base |

Algorithm, notation and advanced case drills retain their specific authored exercises. They are not misrepresented as adaptive beginner-method lessons. Finer pathway entries into a solving-stage unit now adapt to the actual unsolved pieces; the unit remains the verified progress authority.

Downloaded stage guidance admits only the matching unit’s structurally valid checkpoint suffix, checks each goal and the final unit target, retains expiration/owner isolation, and cannot award online progress.

## Compatibility and persistence

Optional `lessonId` and virtual color input extend the guided APIs; requests without a lesson ID retain whole-solve behavior. Stage history is separated from whole-solve history. Existing private ownership, publication/version, consent, session and concurrency checks remain.

Migration **47**, `202610260001_stage_smart_guidance`, extends only the existing `GuidedSolve_smart_pair` check to six supported 3×3 stage course IDs. All context shape, size, model/platform, ordering and continuity checks remain. No row data is rewritten. Both test communities, the isolated review database and local preview have the migration.

## Verification

- **430 source tests** and **301 backend tests** pass; workspace types and API/admin builds pass. Backend tests cover prepared and custom-color sessions, all four puzzle families, prerequisite refusal without creating a session, cropped rescan plans, owner/history isolation, fresh physical checkpoints and simulated smart counter/position checkpoints. Full-solve regressions still pass. AI checks use the mock provider only.
- Browser checks exercise EN/light and ZH/dark at 375px, plus EN/light desktop at 1440px, with reduced motion. They verify one-line pills, real horizontal scrolling, six-column moves, manual colors without a camera, a wrong-stage refusal, matching-lesson navigation, legal manual color submission, prepared setups and next-turn controls. Keyboard Tab/Enter reveals and selects the final pill with a visible focus outline. No runtime errors or page overflow were recorded in these scenarios.
- **18** restored/absent/invalid-session and public-route cases pass, including both new stage links and existing legal/account routes. Valid stage destinations survive restoration; unauthorized pages render no puzzle.
- Hallmark static checks have no failures or warnings. Final rendered move-grid/stage pages report **0 FAIL /1 WARN**, plus two unrelated competition date-range notes. The warning counts the actual puzzle stickers and pear next-turn action as5.8% viewport accent; their functional colors are deliberately preserved, as requested, and the surface is accepted in the scoped review. The broad Discover render reports one gate73 false positive: it samples footer text outside React Native’s scroll clip as if painted under navigation. Geometry records show the text outside the 808px clip before scrolling; afterward its bottom is751px, fully inside the clip, and hit testing reaches the link. The checker log is retained; no claim of a clean broad render is made. This is a self-review, not a new independent full-app design review.
- All **13** preview history-table hashes matched immediately after migration47 and API restart. Later concurrent preview activity added rooms, attempts and practice sessions and updated one existing progress entry. Seven full-table hashes remain equal; a UTC-bounded comparison confirms every pre-existing row in the five append-only tables still matches. The progress count remains4, with one row practiced after the baseline; its earlier values cannot be proven from the aggregate hash. No data was reset to force a match. The isolated review actors do not exist in the preview database. Evidence records the migration count46→47 and zero active solve attempts at the checks.
- Final web/iOS/Android exports and unsigned native packages include the bundled Chillax fonts. Source-map comparison verifies **112 current mobile files and55 shared core files per each of five variants**, with zero mismatches. Android static inspection checks non-debuggable/unsigned status, backup settings and16KiB alignment; iOS checks arm64 device metadata, permissions and embedded JavaScript. These are build/static checks, not physical-device acceptance.

Private evidence: `.data/step-lessons/` contains test, browser, history, build, inspection, Hallmark and package/source-proof records. `.hallmark/step-lessons/` contains the screenshots; the comparison labels the supplied teaching image as a reference rather than a previous Cubers implementation.

## Current review outputs

- [Unsigned Android review APK](../artifacts/android/Cubers-0.1.0-arm64-unsigned-review-20261026-step-lessons-final.apk)
- [Unsigned iPhone app ZIP](../artifacts/ios/Cubers-0.1.0-iphone-release-unsigned-20261026-step-lessons-final.app.zip)
- Three-platform export: `apps/mobile/dist-step-lessons-final-20261026/`.

The local preview uses the updated code and mock AI. Production addresses in review outputs remain reserved `.invalid` placeholders. Device/camera/Bluetooth acceptance, signed installation packages, deployment, store approval and regulatory clearance remain separate launch requirements. No fresh registry audit, real AI call, signing, publishing or gate activation was performed.
