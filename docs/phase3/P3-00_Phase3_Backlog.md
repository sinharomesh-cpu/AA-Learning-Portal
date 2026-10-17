# AA Pro — Phase 3 (Scheduling and Calendar) Backlog

**Version:** 0.1 · 18 Oct 2026 · **Status:** backlog only. Phase 3 planning has not started, and nothing here is built or decided unless it says so.

## 1. Open owner decisions to present at Phase 3 planning

For each item, Claude presents the options and their implications for the owner's approval **before** implementing anything.

| ID | Topic | Status | Current implementation | Decision needed |
|---|---|---|---|---|
| **D-45** | **Upcoming lessons of a deactivated teacher** | **Open — Owner Decision Required** (deferred by the owner, 18 Oct 2026) | **No policy is assumed or introduced.** There are no real lessons yet, and the admin screen states that factually. That statement does not resolve the rule | What happens to already-booked and upcoming lessons when a teacher is deactivated: notifications to parents and teachers, cancellation or reassignment, and any rescheduling requirements |
| D-05b | Other parent restrictions for AI booking (blocked periods, one-off blocked dates, minimum lead time) | Open | Booking page shows "Not decided yet (D-05b)" | Which restrictions exist and their limits |

## 2. Confirmed rules Phase 3 must implement (already decided — do not reopen)

- OC-44 to OC-47: join window, teacher proposals, cancel and reschedule, 1:1 only (`src/lib/lessonRules.ts`; see `docs/phase2/OC-44-47_Lesson_Rules_Implementation_Report.md`). When a parent accepts a teacher's proposal, the server checks that the time is still free.
- OC-89(4): one 15-minute AI session per child in any rolling 24 hours (`server/aiSessions.ts`). AI bookings follow the same rule.
- OC-49: AI lesson reminders go to the parent by email and to the child on screen. Emails stay queued until an email service is approved (OC-91).
- OC-91: no paid service. Zoom and real email remain **Blocked — Owner Budget Approval Required**.
