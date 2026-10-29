fix

1. Gate 69, repeated copy: `lesson-sheet-phone-app.png` prints “Find a white edge and its second color.” as both heading and body (`apps/mobile/app/(tabs)/learn.tsx:678–680`); omit the body when it duplicates the heading, preserving all authored information and both actions.
2. Plain copy defect: Learn and Profile show “1 units complete” and “1 active days” (`learn.tsx:221`, `ProfileActivity.tsx:53`); select singular English labels when the count is one. Keep the existing values and Chinese copy.

Reference match: yes. The requested structure is now visibly present: Learn has a pinned current-unit card above small circular nodes on a winding route; its unit sheet and pathway switch are clear. Profile has the large avatar panel, top-right gear, identity, overview statistics, a horizontally explorable year calendar, and solve statistics. Settings has categorized tabs. Discover and Play use compact task-oriented headers and round controls. This is a substantial match to the supplied references while retaining Cubers’ identity, rather than the previous dashboard composition.

Theme answer: Hum describes the page in front of me. The cream paper, grain, rounded Chillax, pear actions, blue links, mint progress and physical lower edges hold across desktop, phone and dark Chinese screens. No large gap. The deliberate app-screen composition does not owe the marketing hero or illustrative landscape of the theme picture.

Old page: downloads and profile customization had direct first-screen actions. They now take an extra grouping step through practice/download tools or the gear; that tradeoff follows the user’s explicit layout correction. I found no other visible capability that became harder to locate. Do not remove the retained practice/download entry or the categorized account, safety and privacy actions.

Review evidence: inspected every supplied current screenshot, including each desktop and phone scroll sequence, English light and Chinese dark states, the unit/pathway/lesson sheets, lesson practice screens, plus all four before screenshots and the cited source. The pinned unit card remains visible in the scrolled captures. No unintended overlap or wrapped action label is visible at the supplied sizes. Phone tab rows and the year grid intentionally scroll horizontally. Source confirms explicit selected-tab semantics and arrow/Home/End navigation. This review inspected screenshots and source only; it did not exercise live interactions or inspect credentials/user data.

Must not be diluted while fixing: the fixed unit banner and winding small-node path, avatar/gear hierarchy, real private activity data, honest unit-checkpoint completion explanation, existing actions and legal wording, and the consistent Hum materials in both themes.


Root follow-through after the independent review

Both findings are resolved in the single fix batch. The selected lesson sheet now removes its heading prefix from the body and omits an empty body, preserving the full instruction once; `lesson-sheet-phone-app.png` visibly confirms no repeated sentence. Learn shows “1 unit complete” and the activity header shows “1 active day”; guided one-lesson units and pathway/unit counts also use singular forms. Refreshed Learn/Profile/sheet captures confirm these states. Existing values, Chinese text, both lesson actions and verified-unit completion semantics remain. No new general review was performed.
