# Cubers — React Native App and Backend

User amendments (2026-10-26): keep the implemented Hum/Duolingo pathway and profile layout. Use coordinated Hum accent colors on key buttons and cards, repeating colors by task while preserving original idle/unselected surfaces. On Play, the selected game, main card and creation action change accent by game; Join Room and everything below retain a consistent original paper/ink/pear scheme.

Community selection and enforcement belong to the server. Use [FreeIPAPI](https://freeipapi.com/) for production connection-IP lookup, with the server blocking normal API and realtime access to the wrong regional installation, including restored sessions. Client settings/headers cannot override this. Development/test runs use the server's configured region without external lookup, default **International (`REGION=INTL`)**. Preserve narrow public legal, account recovery and erasure access. These amendments supersede earlier manual selection, offline DB-IP lookup and travel-session wording; see [REGIONS.md](REGIONS.md).

Latest lesson/layout amendment (2026-10-26): only pill-shaped choice groups stay on one horizontally scrollable line; other action layouts remain. Move controls use six-column rows, grouping three moves with their inverse directions, with half turns in separate six-cell rows. Solving-stage lessons accept actual scanned, connected-smart or manually entered colors, check the previous milestone, explain the next turn and stop at the selected lesson target. Virtual learners may instead choose an authored setup ready for that target. The server identifies a mismatched stage and the app offers the matching lesson. Algorithm/case drills retain their specific authored exercises; they are not relabeled as generic beginner guidance. This feature adds optional backward-compatible stage fields and migration47, extending only the existing smart-guidance course constraint. See [STEP-LESSONS.md](STEP-LESSONS.md).

Automatic-scanning amendment (2026-10-27): native cube scans start from any face, use a square puzzle-sized grid, require a stable 500 ms alignment hold with a green outline, and show a blurred approximately 1.5-second whole-cube turn cue after each capture. Require observed movement before the next face and reject matching repeats. Sample around center logos and permit only a unique physically valid white-center correction after all six faces. Review actual accepted colors and explain the lesson's holding frame before continuation. Keep manual entry, separate Pyraminx handling, continuous-recording authority, backend prerequisites and physical acceptance gates. See [AUTOMATIC-SCANNING.md](AUTOMATIC-SCANNING.md).

## 1. Product and architecture

Build **Cubers**, a colorful, clean cubing app for iOS and Android, with English and Simplified Chinese interfaces. The four tabs are **Discover, Learn, Play, and Profile**.

Deliver a complete mobile app, backend, browser-based admin panel, original branding, deployment configuration, and store submission materials. Production features must use persistent data and real integrations; demonstration content stays confined to development.

Use:

- **Mobile:** React Native, TypeScript, Expo development builds, Expo Router, native Bluetooth integration, VisionCamera, and an interactive 3D puzzle renderer.
- **Backend:** NestJS, PostgreSQL, Prisma, Redis, background workers, and S3-compatible media storage.
- **Admin:** React and TypeScript, with role-based access and mandatory administrator MFA.
- **Deployment:** Containers behind HTTPS, with independent mainland China and international installations.

Native development builds support the custom camera and Bluetooth modules required here. [Expo documentation](https://docs.expo.dev/workflow/customizing/).

Regional installations have separate accounts, databases, media, feeds, competitions, secrets, and backups. The app displays the server-assigned community during registration and login. The current connection must match the serving installation for ordinary account use; account data is never migrated by changing a client setting.

## 2. Mobile experience

### Discover

Combine community content and puzzle discovery in an Instagram-style feed with forum-style discussions.

- Following, Explore, and Clubs feeds.
- Text, photo, and short video posts; comments, likes, saves, tags, and search.
- Public clubs, private clubs, membership approval, announcements, and threaded discussions.
- Friends, follows, mentorship requests, and beginner-friendly community challenges.
- Curated introductions, cubing stories, and links directly into relevant lessons or games.
- Reporting, blocking, muting, posting limits, and moderation status.

Start with chronological and topic-based feeds. Do not manufacture users, engagement, or community activity.

### Learn

Provide original, bilingual courses with demonstrations, practice, checkpoints, and explanations:

| Puzzle       | Launch curriculum                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **3×3**      | First solve, notation, beginner method, intuitive F2L, two-look and full OLL/PLL, Roux foundations, lookahead, efficiency, and timed practice |
| **2×2**      | Beginner method, Ortega, and CLL training                                                                                                     |
| **4×4**      | Reduction, parity, Yau foundations, and efficiency drills                                                                                     |
| **Pyraminx** | Beginner method, intuitive solving, and advanced last-layer practice                                                                          |

Support three input methods:

- **Virtual puzzle:** Touch-controlled 3D puzzle with animated turns, orientation controls, undo, hints, and replay.
- **Normal physical puzzle:** Guided face scanning with on-device color recognition, orientation instructions, confidence indicators, manual correction, and puzzle-specific state validation. Cubes use six faces; Pyraminx uses four triangular faces.
- **Smart cube:** Native Bluetooth connection, initial-state synchronization, move tracking, battery information where supported, and explicit recovery after missing moves or disconnection.

A normal cube’s scan establishes its current state. Subsequent guidance uses user confirmation and rescanning at lesson checkpoints; it does not claim continuous tracking of hidden turns.

Use deterministic puzzle logic for move sequences and lesson completion. AI explains validated guidance rather than inventing solutions.

Additional learning features include placement assessments, adaptive practice queues, spaced algorithm review, downloadable lessons, optional reminders, and reduced-motion demonstrations.

### Play

Provide:

- Live solve races and private friend rooms.
- Scheduled competitions with rounds and leaderboards.
- Pattern Chase: reproduce a target pattern.
- Cooperative Relay: teammates complete successive puzzle tasks.
- Algorithm Sprint: execute a target sequence accurately.
- Daily Challenges with shared scrambles and personal improvement goals.

Virtual and smart cubes support move-level games. Normal cubes use scans at checkpoints and recorded timed attempts; games requiring continuous move telemetry clearly identify compatible input methods.

Keep competitive rankings separate by puzzle and input category. Casual mixed-input rooms are allowed, but their results do not enter ranked leaderboards.

### Profile

Combine identity, connection, and progress:

- Bio, avatar, favorite puzzles, skills, friends, clubs, and selected achievements.
- Private solve history, personal bests, session statistics, goals, learning milestones, and practice history.
- Move counts and turning statistics only when the input method provides reliable data.
- Shareable achievement cards and solve replays.
- Public/private controls for each profile section.
- Notification settings, connected devices, account export, and deletion.

Use **Cubers** branding with the original geometric cube-and-connection logo, a matching app icon and the locked Hallmark Hum system: textured cream paper, rounded Chillax type, repeated pear/mint/blue/coral/sand task accents, dark mode, accessible contrast and text labels alongside color cues. Keep unselected/standby controls in their original paper treatment. Profile has real activity squares/statistics and categorized settings behind the gear. Learn shows a fixed current-unit card, real units/pathway switching and round finer lesson nodes on a winding path; verified unit checkpoints remain the completion authority.

## 3. Competition integrity and child protections

### Fair play

The server controls match membership, scrambles, round transitions, result verification, and ranking updates.

- Generate unpredictable, single-use attempt identifiers and scrambles.
- Validate virtual move streams by reconstructing the puzzle server-side.
- Check smart-cube telemetry for sequence gaps, inconsistent states, and replayed submissions.
- Require uninterrupted in-app camera recording for **all ranked physical attempts**, including smart cubes.
- Record scramble verification, inspection, solving, and final-state presentation. Keep the cube and hands visible; do not require faces or audio.
- Bind uploaded evidence to the attempt and use platform app-attestation signals where available.
- Flag interruptions, missing footage, mismatched scrambles, duplicate evidence, and suspicious timing.
- Treat physical results as provisional until a reviewer approves the evidence. Automated checks assist review.
- Provide rejection reasons, appeals, moderator audit trails, and ranking corrections.

Disconnected, interrupted, or incomplete attempts cannot silently become ranked results. Reconnecting may restore the room, but does not resume an interrupted ranked solve.

No remote competition system can promise complete prevention of cheating. Marketing will describe the verification process accurately.

Competition recordings are private to authorized reviewers. Delete them seven days after finalization; appealed cases may retain evidence for up to 30 days. Unresolved attempts expire without ranking credit after 30 days.

### Children and guardians

Include children through parent-managed accounts and verified consent, rather than treating an email confirmation as sufficient parental verification.

- Apply regional age rules, including US under-13 and mainland China under-14 requirements. [FTC guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions), [China’s Personal Information Protection Law](https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm).
- Implement a manually reviewed parental-consent workflow using signed consent documentation, with separate permissions for public posting and competition recording.
- Require guardian approval **and** moderator approval for each younger child’s public post. Editing an approved post requires reapproval.
- Default child profiles to private; hide age, location, school, and contact details.
- Disable private messaging for minors. Use moderated discussions and controlled mentorship requests.
- Give guardians controls to revoke permissions, inspect activity, export information, and delete linked child accounts.
- Provide safety reminders before enabling social sharing.
- Give younger children authored, adaptive tutoring without open-ended cloud chat.

Ads are prohibited for all accounts under 18 and for accounts whose adult eligibility has not been established. These controls also support Google Play’s requirements for social features involving children. [Families policy](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en).

## 4. Backend, integrations, and administration

Require login for core app features. Keep registration, consent, support, privacy documents, and account-deletion information accessible before login.

Implement verified email/password registration, password recovery, protected sessions, session revocation, and guardian-linked child access. Store passwords securely and mobile credentials in platform secure storage.

Expose versioned REST APIs and documented WebSocket events for:

- Accounts, guardian consent, profiles, friendships, and clubs.
- Posts, media, comments, moderation, and notifications.
- Courses, lesson sessions, puzzle states, practice history, and achievements.
- Matchmaking, rooms, attempts, evidence, appeals, and rankings.
- Administrative configuration and sponsor campaigns.

Share typed puzzle-state, move, lesson-session, device-capability, and attempt-status contracts between client and server. Enforce authorization, age permissions, regional boundaries, and ranking eligibility on the server.

**AI integration**

- OpenAI internationally and Alibaba Qwen through its mainland endpoint.
- Keep credentials server-side; securely provision the OpenAI key during implementation with separate confirmation.
- Send only necessary lesson context and puzzle state; exclude names, recordings, and social content.
- Enable conversational AI for adults initially. Under-18 accounts receive validated hints and authored explanations.
- Apply usage limits, moderation, timeouts, and authored fallback explanations.
- Configure model identifiers through deployment settings and validate them before enabling chat. [OpenAI documentation](https://developers.openai.com/api/docs/quickstart), [Alibaba regional endpoints](https://www.alibabacloud.com/help/en/model-studio/base-url).

**Smart-cube integration**

Implement separate adapters targeting GAN 356 i3, GoCube Edge, and GiiKER i3S. Normalize their capabilities without assuming identical protocols. These are initial 3×3 targets; other puzzle types use virtual or scanned input.

Keep every hardware model disabled in production until physical testing passes. Browser Bluetooth libraries provide protocol references, but require native transport adaptation. [cubing.js Bluetooth documentation](https://js.cubing.net/cubing/bluetooth/).

**Admin panel**

Provide user and club management, content review, guardian-consent review, competition verification, appeals, course publishing, device allowlists, announcements, service health, and audit logs.

Advertising uses **first-party contextual sponsor cards**, off by default. Admins can manage campaigns and enable them per region for eligible adults. Include clear sponsorship labels, reviewed destinations, and no third-party advertiser SDK or behavioral targeting.

Add upload limits, media validation, metadata removal, background processing, rate limiting, backups, restoration procedures, monitoring, and server-side deletion jobs.

## 5. Validation and publication

Implement in this order: authentication and regional backend → puzzle engine and learning → community and profiles → multiplayer and evidence review → administration and release packaging. Every milestone must connect to the real backend.

Acceptance checks include:

- Every launch course completes using its supported input methods.
- Puzzle engines handle legal moves, orientation changes, impossible states, and valid 4×4 parity cases correctly.
- Scanning handles different lighting, stickerless puzzles, uncertain colors, correction, and denied camera permission.
- Rankings reject forged results, replayed attempts, unauthorized events, incomplete evidence, and cross-category submissions.
- Child accounts cannot bypass consent, publishing approval, messaging restrictions, or advertising exclusions.
- Regional installations cannot access each other’s private data.
- Account deletion removes associated posts and media and follows documented backup-expiry rules.
- Native iOS and Android testing covers recording, Bluetooth, background interruption, accessibility, and poor connectivity.
- Each smart-cube model passes real-device synchronization, move tracking, disconnect, recovery, and recorded-match testing before activation.
- Load tests support an initial target of 100 concurrent players per regional deployment, with documented scaling limits.

Prepare signed-build instructions, release configurations, app icons, screenshots, bilingual store descriptions, reviewer access, support pages, privacy disclosures, community standards, and account-deletion pages. Account deletion must meet both stores’ requirements. [Apple](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/), [Google Play](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Release remains gated on real-device testing, configured production services, operational moderation, name and asset rights checks, developer accounts, and applicable mainland filings and approvals. Include a mainland classification review for the competition/game features; do not assume ordinary app filing alone is sufficient. [Apple’s mainland distribution information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/).

The deliverable is a production-oriented application and deployment package. Store acceptance, hardware certification, and regulatory approval are separate outcomes that must be verified before publication.
