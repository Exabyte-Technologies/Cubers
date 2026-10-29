# Discover and Play layout follow-through

Updated 2026-10-26 in response to the supplied Duolingo layout references. Only `apps/mobile/app/(tabs)/index.tsx` and `play.tsx` were changed.

## Discover

The oversized slogan/intro banner has been replaced by a compact Discover heading and existing Learn destination. Community is the initial tab, putting actual feed filters, search and post actions before authored reading. Explore cubing retains the full `DiscoveryStories` component; Updates retains `AnnouncementCards`. Community retains Explore/Following/Clubs/Saved, tag filtering, search, composer cancellation/submission/review status, club directory, loading/error/empty states, post cards, pagination and sponsor cards. No community activity was fabricated.

## Play

Five circular, accessible mode selectors lead the screen; custom functional glyphs identify race, pattern, relay, sprint and daily play. A single selected-mode start card uses the original `create()` workflow with the actual selected mode. Puzzle/input/private-room/mixed/ranked controls are in collapsible Room options. The current puzzle/input/private setting stays visible, while the existing mixed/ranked disclosure text stays visible whenever its state applies, even with options collapsed. Mixed still turns ranked off, and ranked remains disabled while mixed is enabled.

Join a friend, Open rooms, Competitions and Rankings are separate content tabs. All existing join code/id paths, input handling for mixed rooms, public room empty/error states, competition component and ranking destination remain reachable. No reward counters, imaginary progress, mascot, copied Duolingo artwork or new backend behavior was added.

## Checks

- TypeScript AST comparison against the original snapshot preserves **2/2 Discover** and **8/8 Play** direct `api()` and `router.push()` calls, including every argument. No missing or added direct calls.
- Both owned TSX files format successfully.
- Mobile type check currently reports only the in-progress other agent's `ActivityCalendar` export errors in `ProfileActivity.tsx`; no errors are reported in either owned tab.
- Targeted Hallmark static check includes the actual shared mobile CSS so keyboard/active/disabled styling is judged in its real context; result recorded in `.data/path-other-tabs-lint.log`.
- Root will perform representative rendered captures and interaction checks after all parallel work integrates.
