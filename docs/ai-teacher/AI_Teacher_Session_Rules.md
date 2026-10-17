# AA Pro AI Teacher — Session Rules and Classroom Behaviour

**Version:** 1.0 · 17 Oct 2026 · **Decision:** OC-89 (owner, 17 Oct 2026, 23:41 IST)
**Status:** rules implemented and tested on the server, without any AI provider connected. The classroom page itself is not built yet.

## 1. Session length and frequency (OC-89(4))

The rules below replace the 15- or 30-minute choice (OC-22) and the 30-minutes-a-day limit (OC-60).

| # | Rule | Where it is enforced |
|---|---|---|
| 1 | Every AI Teacher session lasts **15 minutes**: 10 minutes of explanation, then 5 minutes of Q&A. | `ai_sessions` length check (database); `PHASE_PLAN` in the session controller |
| 2 | A child may **start one session in any rolling 24 hours**, whatever the subject or chapter. The next session becomes available **exactly 24 hours after the last counted start**. | `startAiSession` (server), plus a database trigger that locks the child's row |
| 3 | A session never runs past 15 minutes, nor past a booked end time if that comes first. | `ends_at` is set by the server; the controller cuts off at the end time |
| 4 | Only **one active session** per child. | A unique index on active sessions |
| 5 | **No duplicates.** A refresh, a second tab, a second browser or a double click rejoins the same session. Each page sends a random request key, so the same key always returns the same session. | `startAiSession` with the child's row locked; tested with 10 starts at once, which produce 1 session |
| 6 | **Interrupted:** a dropped connection or closed tab leaves the session running. The child can rejoin until the end time, and lost time is not given back. **Abandoned:** the session ends at its end time and counts. **Ended early** by the child or parent: it counts. **No service:** if the AI service never produced any output and the server reports the failure within 3 minutes, the session does not count and the child can start again. | `closeExpired`, `endAiSession`, `markNoService` |
| 7 | **Shown to the child and the parent:** "One AI class a day, 15 minutes each", plus "Available now", "Running now, ends at …" or "Next: tomorrow at 5:15 pm", in the viewer's own time zone. | Student home, the parent's Children page and the booking page |
| 8 | **Who can act:** only the child starts a session. The parent sees the allowance and can end a running session. Teachers and admins cannot see or open a child's AI sessions. | `getAiAllowance`, `endAiSession` |
| 9 | **Booking:** the AI booking page offers only 15-minute times. A start within 24 hours of another AI lesson of the same child is shown greyed out as "One AI class a day". The server re-checks this. | `fixtures/aiBooking.ts` (demo); real bookings arrive in Phase 3 and use the same rule |

**Why rolling 24 hours rather than a calendar day:** the owner chose rolling 24 hours (rule 1 of OC-89(4)). As a result, a 5:15 pm lesson today means the next one cannot start before 5:15 pm tomorrow.

**Nothing about the conversation is stored:** no audio and no transcript. `ai_sessions` keeps only the times, the subject and the outcome. Summaries remain subject to D-24.

## 2. Classroom interaction (OC-89(2))

| Control | Behaviour |
|---|---|
| Ask a question (voice or typed) | The student can always ask, including follow-up questions. During the explanation, questions are held and answered at the start of Q&A. During Q&A, they go to the tutor straight away. |
| **Give Me a Hint** | Optional and started by the student. Available during Q&A only (during the explanation, the tutor is already explaining), at most 5 times per session. A hint is about the current question, concept or chapter. It may end with one guiding question, but never a quiz. |
| ~~Next Question~~ | **Removed.** The tutor never starts a quiz, a run of questions or an assessment. The server check blocks quiz wording in both phases and blocks questions from the tutor during Q&A, except inside the answer to a hint. |
| Repeat Explanation | Kept (FRD FR-010). |
| End Class | Kept. Ending early still uses the day's session (the screen tells the child before they confirm). |

Quizzes and assessments are a separate future feature. Teacher homework (CR-07) is not affected.

## 3. Tests (actual results in the pull request)

- **Database tests (`tests/db/aiSessions.test.ts`, 17 tests):**
  - the 15-minute cap, also enforced by the database;
  - the 24-hour window, including the exact boundary;
  - each child having their own allowance;
  - the same request key returning the same session;
  - rejoining;
  - 10 starts at once producing 1 session;
  - one active session, also enforced by the database;
  - interrupted, ended-early and no-service sessions;
  - who can see and act;
  - bad input;
  - the audit trail.
- **Controller tests (`src/server/aiSession/controller.test.ts`, 49 tests):**
  - the 10+5 phases, held questions, Q&A behaviour, the cut-off, access and recovery;
  - hint rules, including a check that no "next question" or quiz action exists.
- **Booking tests (unit and browser):** one length, the one-a-day greying, and a refusal on the server of a 30-minute or within-24-hours request.
