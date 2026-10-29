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
