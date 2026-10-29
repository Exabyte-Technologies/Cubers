# Profile and settings layout correction

Implemented the requested Duolingo-style profile structure with Hum tokens. Main profile now leads with its actual avatar, identity/privacy state and friendship/club actions. Four genuine summary tiles show the trailing-year streak, current-revision lessons, approved solve count (existing1,000-result window) and trailing-year active days. No follower numbers, XP, badges or activity are fabricated.

The private activity component displays the agreed dense365-day server calendar as GitHub-style daily squares, scrolls toward recent dates, supplies per-date accessible labels and an expandable dated breakdown. It shows actual timezone and a truthful empty state; activity failure displays an error/retry and unavailable metrics remain a dash. Year streaks are not described as all-time records.

Profile section tabs (Overview, History, Goals, Posts) expose real content. History retains puzzle/input filters, pagination, move/input qualification, replay eligibility and original lesson continuation. Overview retains detailed category best/mean/trimmed-mean and telemetry-qualified statistics, practice-session navigation, earned milestones and achievement-card entry. Goals are read-only on the profile, with management in settings. Posts retain their review statuses and edit/navigation actions.

The functional gear opens `/settings`. Five horizontally scrollable category tabs expose Account, Profile & privacy, Learning & devices, Family & safety and Notifications. The tab strip uses tab/selected semantics and arrow/Home/End keyboard support. Editable identity/sharing, goal creation/removal, downloads/reminders, devices, app verification, guardian workflows, policy/support, updates, export, session revocation, sign-out and deletion remain accessible. The exact account-deletion confirmation and backup warning are preserved verbatim. Export/revocation/deletion callbacks retain account checks; page-unmount invalidation prevents a late export from crossing to a different page instance.

## Files

- Changed `apps/mobile/app/(tabs)/profile.tsx`.
- Added `apps/mobile/app/settings.tsx`.
- Added `src/ProfileActivity.tsx`, `ProfileGear.tsx`, `ProfileSectionTabs.tsx` and `ProfileDetails.tsx` under the mobile app.
- Existing profile blocks were moved into ProfileDetails so original statistics/history/goal/post actions and generation/cursor safeguards remain.
- No API, shared UI, token or backend file was edited by this subtask.

## Verification

- Mobile TypeScript check passes.
- Targeted Hallmark static sweep including the shared stylesheet: zero FAIL, REFLEX or WARN across seven files.
- AST comparison finds all34 original API/router call forms retained across the new profile/details/settings files;48 total forms now exist due to new navigation/summary loading. Evidence: `.data/path-layout/profile-preservation.json`.
- Parent owns final rendered captures and browser interaction checks; no screenshot or physical-device pass is claimed here.
