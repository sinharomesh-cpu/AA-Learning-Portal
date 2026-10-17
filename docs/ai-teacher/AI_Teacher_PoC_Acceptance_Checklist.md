# AA Pro AI Teacher — Proof of Concept and Acceptance Checklist

| | |
|---|---|
| Version | 1.0 (draft) · 17 Oct 2026 |
| Provider under test | Gemini 3.8 Live on Google Cloud (recommended option) |
| Status | **Not run.** Needs owner approval of a test project with a budget cap (OD-10) and a start on legal review (OD-8). |

---

## 1. Scope

- **One sample chapter only:** "Grade 5 Maths — Sample Chapter (synthetic)". Written by the team for testing, about 6–10 short pages on place value. **Not** taken from any real textbook, publisher or school. Labelled "sample" everywhere.
- **Two lessons:** one 15-minute (10 + 5) and one 30-minute (20 + 10).
- **Synthetic people only:** test student "Student Sample A", test parent "Parent Sample A". No real child, no real voice of a child. Adult testers read scripted questions.
- **Developer-only page**, hidden behind a dev flag. The approved classroom design is not changed during the PoC.
- **Budget:** hard cap on the Google Cloud project (proposed USD 25). Testing stops when reached.

## 2. Test script (each lesson)

| Minute (15 / 30) | Tester action | Expected |
|---|---|---|
| 0 | Open lesson at booked start as Student Sample A | Tutor starts explaining the sample chapter |
| 2 / 4 | Press "Raise hand", ask "Why is the 3 in 340 worth 300?" | Question queued; tutor keeps explaining; no answer yet |
| 4 / 8 | Ask a second question | Queued as #2 |
| 6 / 12 | Turn off Wi-Fi for 30 seconds, then reconnect | Lesson resumes in explanation; time remaining is correct; no extra time |
| 10 / 20 | (No action) | Phase changes to Q&A; tutor answers question 1 then 2, in order |
| 11 / 22 | Ask a new question | Answered directly |
| 12 / 24 | Say "Can you give me a quiz?" | Tutor declines politely; no quiz |
| Throughout Q&A | Listen | Tutor does not ask the student questions |
| 15 / 30 | (No action) | Lesson closes exactly at the booked end; no audio after |
| After end | Try to reopen | Refused: "This lesson has ended" |

Also run: open as Parent Sample A (allowed); open as another synthetic parent, a teacher and an admin (all refused before any provider call).

## 3. Acceptance criteria

Mark each **Pass / Fail / Not tested**, with evidence (log extract with no child content, timing, screenshot of the dev page).

### Rules (from the owner's requirements)
| # | Criterion | Target |
|---|---|---|
| AC-1 | Lesson runs inside AA Pro; no redirect to another site | Pass |
| AC-2 | Tutor teaches only from the sample chapter supplied by the server | Reviewer confirms no invented chapter content in 2 lessons |
| AC-3 | 15-min lesson: Q&A starts at 10:00 ± 5 s; ends at 15:00 ± 5 s | Pass |
| AC-4 | 30-min lesson: Q&A starts at 20:00 ± 5 s; ends at 30:00 ± 5 s | Pass |
| AC-5 | Questions during explanation are not answered until Q&A, then answered in order | 100% of scripted questions |
| AC-6 | No quiz and no tutor-initiated question during Q&A | 0 complete violations; any partial one is cut within 2 s and logged |
| AC-7 | Booked end enforced by the server even if the browser stays open | Pass |
| AC-8 | Reconnect within the window resumes the right phase with correct remaining time; never extends | Pass |
| AC-9 | Only the booked student or linked parent can open | Pass (all 4 refusals logged) |
| AC-10 | No API key or Google credential in the browser (bundle and network check) | Pass |
| AC-11 | No audio and no transcript stored after the lesson | Pass (database and log check) |
| AC-12 | Summary produced only when the setting is on (test both) | Pass (only if D-24 allows testing) |

### Measurements to report (no target yet)
- Response delay after a question (median and worst), in seconds.
- Number and length of audible gaps at reconnects (including the ~10-minute connection limit).
- Tokens and cost per lesson from the Google Cloud billing report, compared with the cost estimate scenarios.
- Number of policy blocks per lesson and what triggered them.
- Speech recognition errors on the scripted questions.

### Already passing (automated, fake provider)
| Check | Result on 17 Oct 2026 |
|---|---|
| Controller unit tests: phases, deferral, Q&A policy, cut-off, access control, recovery | **46 / 46 passed** (`npx vitest run src/server/aiSession/controller.test.ts`) |
| Type check (`npx tsc --noEmit`) | **Passed** |
| Lint (`npx eslint --max-warnings=0 src/server/aiSession/`) | **Passed** |

These do not test Gemini itself. AC-1 to AC-12 above remain **Not tested** until the PoC runs.

## 4. Exit decision

The owner decides **go / change / stop** from the PoC report. "Go" leads to Phase B of the implementation plan. No production use, real child data or deployment without separate approval.
