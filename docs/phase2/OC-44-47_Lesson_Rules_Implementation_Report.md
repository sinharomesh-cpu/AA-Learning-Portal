# Confirmed Lesson Rules (OC-44 to OC-47) — Implementation and Gap Report

**Date:** 18 Oct 2026 · **Trigger:** owner correction, 18 Oct 2026, 01:07 IST. The decisions were recorded on 14 Oct 2026 as OC-44 to OC-47, but screens still showed "Not decided yet" notices for them.

## 1. Confirmed rules (unchanged, as recorded)

| Decision | Rule |
|---|---|
| OC-44 (D-35) | The Join button for a teacher session opens **10 minutes before the start** and stays available **until the scheduled end** |
| OC-45 (D-08) | A teacher-proposed lesson needs the **parent to accept or reject** it. Nothing is scheduled, and no Zoom meeting is created, until the parent accepts |
| OC-46 (D-07) | Teacher lessons: the parent or teacher can cancel or reschedule **up to 30 minutes before the start**, and neither can inside 30 minutes. A teacher's reschedule needs the **parent's approval**, and a teacher's cancellation is **notified to the parent**. AI lessons: the parent or student can cancel or move them **any time before the start** |
| OC-47 (D-15) | **1:1 only** in version 1. Group sessions may come in a later phase, depending on demand |

## 2. What was wrong, and what was fixed (PR-R1)

| # | Where | Problem | Fix |
|---|---|---|---|
| G-1 | Teacher dashboard | Four "Not decided yet" notes (D-35, D-08, D-07, D-15) | Replaced by a "Lesson rules" box stating the confirmed rules |
| G-2 | Parent family home | Notes for D-08, D-07 and D-22, and "Not decided yet (D-22)" in the reminder column | A "Lesson rules" box. AI reminders follow OC-49: email to the parent, on screen for the child, 15 minutes before. Emails are shown as queued, not sent |
| G-3 | Student home and design-system page | "Not decided yet (D-35)" | Removed. The Join button now follows OC-44 |
| G-4 | Join button | "Join opens before start", with no rule | Uses OC-44: "Join opens 10 min before the start". Inside the window it shows "Zoom not connected yet"; after the end, "Lesson ended". It never shows a link, because Zoom is not connected (Phase 7, and blocked by budget under OC-91) |
| G-5 | Teacher's proposed lesson card | "Zoom meeting not created yet" (no reason given) | "No Zoom meeting until the parent accepts" (OC-45) |
| G-6 | **AI booking times** | **A teacher-proposed lesson blocked the child's AI booking times, which contradicts OC-45** (a proposal is not scheduled) | Only booked lessons hold the child's time. When a parent accepts a proposal, the server must re-check that the time is still free (Phase 3) |
| G-7 | Parent booking details page | Said the cut-offs and confirmation were "still being decided (D-07, D-08)" | States the confirmed rules |
| G-8 | Other stale notices found in the same review | "Not decided yet" for D-09 (closed by OC-36), D-22 (closed by OC-49) and D-11b (closed by OC-37/OC-50) | Removed or reworded. The booking page's remaining note is relabelled **D-05b** (minimum booking lead time), which is genuinely still open |
| G-9 | Code comments | "D-08 pending", "D-09 undecided" | Updated |

**Shared rules module:** `src/lib/lessonRules.ts` holds the join window, the cancel and reschedule decision, proposal acceptance, "holds time", "may create a meeting" and the 1:1 limit. The screens use it now, and the Phase 3 booking server will call the same functions. Unit tests (`lessonRules.test.ts`) cover every boundary: the 10 minutes, the end time, the 30-minute cut-off, who may act, approval and notification flags, and acceptance or rejection.

## 3. Not built yet: these follow the rules when they are built

| Area | Status | Rule it must follow |
|---|---|---|
| Real teacher-lesson booking, proposals, acceptance, cancel and reschedule (server, database, state changes) | **Phase 3**, not started. Today, only screens with sample data exist | `lessonRules.ts`; states proposed → confirmed or declined; cancelled; the reschedule-request state for teacher reschedules waits for the parent |
| Zoom meetings | **Phase 7; blocked: owner budget approval required (OC-91)** | Created only after the parent accepts (OC-45) and only for 1:1 lessons. Cancelled or updated when the lesson changes |
| Notifications (proposal to the parent, teacher cancellation to the parent, reminders) | Queued in the outbox only. **Real email is blocked: owner budget approval required** (OC-65, OC-91) | OC-46(2): a teacher's cancellation always queues a parent notification; OC-49 reminders |
| Group lessons | Not planned (OC-47) | The data model stays 1:1 |

## 4. Points that need owner input

None for OC-44 to OC-47: no genuine conflict was found.

One adjacent point is **not** covered by these decisions and is left open, not decided: what happens to a deactivated teacher's upcoming lessons. The admin screen previously referred to it as "D-07/D-09". It now only says there are no lessons yet. It will come up with Phase 3.
