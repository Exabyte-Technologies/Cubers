# Private placement and adaptive practice

Learn offers an optional placement check for 2×2, 3×3, 4×4 and Pyraminx. Each has three original bilingual questions paired with small virtual-puzzle setups. Topics cover notation, intermediate concepts and a later-stage concept. The server chooses a setup variant, shuffles choices and keeps its answer key out of the active-check API response. Both the question and puzzle must match to pass a check; skips and partial attempts remain distinct.

These recommend a starting focus. They are not full arbitrary-scramble solves, comprehensive method tests, anti-cheating evidence, competitive rankings or skill certificates. They do not write lesson progress, practice repetitions or public achievements. Authored definitions ship with the app and can be inspected; hiding the active-response answer key is not an exam-security claim. All published lessons remain selectable. Only virtual input is used here; no camera/Bluetooth permissions or AI calls are needed.

## Account and state rules

- Authentication, regional session scope and current learning/guardian eligibility apply to every endpoint. Deletion-only sessions cannot access them. Results are private to their owner and authorized linked guardians through existing export/activity routes; they are absent from shared profiles.
- At most one active check per account/puzzle. Starting twice returns the same saved check. Answers/cancellation carry the current version; account-row locking serializes changes, and stale or duplicate submissions return 409. The server reconstructs moves from its persisted setup and never accepts a client score or final-state claim.
- Active checks expire after 24 hours. A learner can resume, skip a task or end a check. Up to three new checks per puzzle are permitted per rolling 24-hour period, including cancelled/expired starts. Answer processing has a 120/hour account limit and at most 300 bounded moves per task, alongside global HTTP limits.
- Required course withdrawal prevents a new check for that puzzle. Existing authored snapshots remain private history; recommendations exclude unpublished courses. Completing a check does not override editorial decisions.
- Completed checks remain until account deletion. Expired checks are removed 30 days after their original expiry deadline; cancelled checks are removed 30 days after cancellation. Late maintenance does not extend expiry retention. Account/linked-child deletion cascades through rows; exports include saved tasks, responses and results.

## Practice queue

`GET /v1/learning-plan?puzzle=...` returns up to six distinct published lessons for that puzzle. Up to three due reviews come first, then gaps in the latest completed placement, then unfinished courses at the suggested focus and later levels. Remaining unfinished lessons fill empty slots. Without placement it starts at foundations. Passing placement does not mark lower lessons completed. Real checkpoint completion updates spaced-review dates and removes that lesson from the unfinished queue. Learn refreshes when it regains focus.

Recommendations use published catalog metadata, private checkpoint/review records and the latest completed check. No social activity, demographic profiling, precise location, third-party recommendation service or provider AI is involved. Labels explain whether each suggestion is a due review, a placement topic or a next lesson.

## API

| Route                              | Behavior                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/assessments`             | Start/resume with `{ "puzzle": "3x3" }`                                                                             |
| `GET /v1/assessments?puzzle=3x3`   | Up to 20 recent owner summaries                                                                                     |
| `GET /v1/assessments/:id`          | Current task and feedback for committed answers                                                                     |
| `POST /v1/assessments/:id/answers` | Commit `{ "kind": "submit", "version": 0, "optionId": "a", "moves": ["R"] }`, or `{ "kind": "skip", "version": 0 }` |
| `DELETE /v1/assessments/:id`       | End with `{ "version": 0 }`                                                                                         |
| `GET /v1/learning-plan?puzzle=3x3` | Private queue, completed-check summary and active-check identifier                                                  |

Response versions advance after each committed answer/end action. Missing and another user's identifiers return the same 404. Unknown fields, puzzles, options, malformed moves and oversized submissions are rejected. All API responses use `private, no-store`.

## Verification and limits

Unit checks exercise every authored setup variant, bilingual content, course references and strict submission bounds. PostgreSQL/Redis integration covers all four puzzles, independently wrong question/puzzle results, skips, concurrent start/answers, ownership, regional boundaries, expiry, quotas, course withdrawal, adaptive updates, guardian access/revocation, retention and deletion. Real AI remains unused.

Bundle export/static typing do not establish native interaction quality. Fresh browser visual QA is blocked; physical-device accessibility/gesture testing remains outstanding. Placement supplements the drill curriculum. Smart-cube adapters, offline downloads and optional reminders remain unfinished. Complete [guided courses for all four puzzles](FIRST-SOLVE.md) are connected separately.
