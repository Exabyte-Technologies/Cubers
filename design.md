# Cubers Hum design system

Requested by the user on 2026-10-26: full app UI redesign with Hallmark v2 Hum and a playful learning/game feel. This is the shared design lock for all routes and the admin panel.

## Preserve

Keep every existing route, field, id, handler, backend call, data model, permission check, loading/error/empty state, legal/consent wording, language toggle and real statistic. Keep Cubers' original geometric cube-and-connection mark. No invented users, activity, badges, streaks, XP, prices or social proof. No mascot or decorative illustration; the real puzzle and lesson content carry the interface. Do not change puzzle sticker colors or scan-color recognition.

## Material and palette

Hum's warm cream paper with subtle grain/fibre, pale die-cut edges, blue-black ink. Pear-yellow is the primary action; blue is links/focus; coral is one lively accent/error; mint is growth/progress. Never blend accents in a gradient. Use light and equally designed dark modes. Native colors are declared in `apps/mobile/src/design/tokens.ts`; web tokens are in `tokens.css`. All values outside token declarations reference those tokens. Existing useTheme roles stay as compatibility aliases: green is the link/signal, mint the gentle progress well, lavender a sugar-blue well, yellow the pear field, orange a coral-tinted well.

## Type

Chillax Medium 500 and Semibold 600 locally bundled from official Fontshare files, unchanged with their FFL licence. Chinese uses system CJK fallback. Rounded sans everywhere, no serif, no all-cap/tracked labels. Use existing bilingual wording; remove decorative arrows/middle-dot joins only where copy gates require, record changes. Preserve legal/consent content verbatim.

## App surfaces and composition

App-screen scope: no marketing hero, no invented metric cards. Keep the existing four-tab shell. Center and cap the work area. Existing admin sidebar is earned by its many destinations. Main Learn screen leads with the real next lesson/adaptive plan and a curriculum path of real lessons; Discover leads with actual community/course discovery; Play with the real game choice; Profile with the owner's actual progress and controls. Recompose each using clear grouped sections, generous headings and flatter list rows instead of nested cards. No cards inside cards. Shared Card auto-flattens nested legacy containment to preserve wiring. Paper cards use one elevation/edge treatment; 24px outer radius, 16px controls, 14px fields. Primary controls are 54px, with a 5px paper-stock edge and a small press movement. Secondary actions are quieter. Keep all existing capabilities visible/reachable.

## Interaction and accessibility

Every control has keyboard focus, hover, pressed and disabled states; state is not color alone. Native touch targets >=44px; fields/body >=16px. Transforms/opacity for motion, primary-only spring, reduced-motion fallback. Dark mode uses lighter panels and no glow. Use one original SVG geometric nav/icon set or existing icons when functional; no emoji icons. Real interactive puzzle renderers remain interactive, not decorative artwork.

## Scope and ownership

Root: shared mobile UI primitives, design tokens, fonts, global CSS, root layout and tab chrome; token cleanup in src components; integration/build verification.
Mobile learning/community agent: the four `(tabs)` files and their directly related discovery/course presentation components; no shared ui.tsx edits.
Mobile supporting screens agent: sign-in/account screens and all other mobile app routes; no `(tabs)` files or shared ui.tsx edits.
Admin agent: `apps/admin/src/` excluding generated tokens.css/base.css managed by root; full CSS and markup composition, preserving every action and field.
No files or routes are deleted. Preserve a pre-redesign snapshot under `.hallmark/baseline`; the existing authorized in-progress checkout is not stashed or reset.

## User layout correction (2026-10-26)

Learn uses the supplied Duolingo structure: a fixed current-unit banner, rounded lesson nodes following a winding route, and a unit sheet with pathway switching (Beginner/Advanced3×3, Beginner/Advanced2×2,4×4,Pyraminx). Units are published Cubers courses; smaller nodes open their existing authored teaching steps, while verified unit checkpoints remain the source of completion. Guided whole solves retain their validated entry point. Profile leads with a large real avatar, identity, real overview statistics and a private GitHub-style365-day activity calendar. Editable configuration is behind the gear in categorized settings tabs. Discover/Play use compact app headers, rounded task controls and content tabs. No invented currencies, lives, followers or activity. Existing theme/palette and safeguards remain; new navigation/grouping requested by the user overrides earlier flat-list composition.

## Coordinated accent variation (2026-10-26)

Buttons and featured cards use repeated task accents from the Hum palette: pear for default primary actions and the next lesson, mint for the current learning unit and progress, sugar blue for community/profile selection, and coral for the selected play mode and its action. Profile statistics repeat mint for practice activity rather than giving every tile a unique color. Selected navigation takes its section accent. Ordinary paper cards, all unselected controls, waiting lesson nodes, secondary buttons and disabled controls retain their original neutral or existing disabled treatment. No random, index-based or rainbow assignment. Focus remains blue and errors retain their existing distinct wording and treatment. Do not recolor puzzles or change routes, state, permissions or completion logic. Shared native colors and paired foreground/edge colors are declared in design/tokens.ts; admin colors use declared CSS tokens. Accent context changes primary and selected controls only; card tinting is explicit and limited to featured task surfaces.

### Play mode refinement

Only the selected game button, its featured card and Create room action change with mode: Race coral, Pattern sugar blue, Relay mint, Sprint pear and Daily warm sand from Hum's kraft/sand family. The four waiting game buttons remain paper. Join room, room lists, competition/rankings tabs and the lower controls use their original consistent paper/ink/pear treatment, independent of the selected game. Keep the primary Play navigation accent coral as its section identity.

## State-based lesson and choice-row amendment (2026-10-26)

The user's new lesson feature supersedes the earlier presentation-only boundary for this scope. Keep the Hum material, routes and existing progress. Pill-shaped Chip groups use one horizontal scroll row with no label wrapping; ordinary Button groups retain their layout. Move controls use six columns with adjacent inverse pairs and separate half turns, preserving real puzzle moves. Keyboard focus reveals its pill and browser toggle state is explicit. Stage teaching leads with the next-turn explanation and the actual sticker model; fuller explanation, holding guidance and face diagrams remain available through details. Solving-stage guidance is checked server-side and ends at that unit's target; unrelated cases retain their authored method. A narrow smart-guidance constraint extension permits the six supported 3×3 stage IDs. No existing row, legal wording, hardware acceptance or launch gate changes.
