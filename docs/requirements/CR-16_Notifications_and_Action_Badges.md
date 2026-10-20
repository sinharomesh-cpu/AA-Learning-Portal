# CR-16 — In-app notifications (bell) and dashboard action badges

**Version:** 0.8 · 20 Oct 2026 · **Status:** **built on the free test site** — the engine (PR #106, N1) and the bell, panel, pages and badges (PR #107, N2) are merged on main. All 11 CI checks passed on each pull request. The test site auto-deploys and auto-applies migration 0026 on merge; that deploy has **not** been independently confirmed from the build workspace, which cannot reach the site. Verification status per check is in **§20**: of the 78 checks, AC-9 is design-approved (visual design only), **76 are fully verified** (AC-1–AC-8, AC-10–AC-74, AC-76–AC-78; the last parts of AC-44, AC-54, AC-55, AC-58, AC-60 and AC-77 passed locally (3/3) on 20 Oct 2026, all 11 CI checks passed on PR #109 (20 Oct 2026)) and **AC-75 is partially verified (open)** pending the owner's index decision. Owner decisions OC-120 and OC-121 (20 Oct 2026, 17:41–17:42 IST) are recorded; they approve requirement and verification-record changes only. **No further implementation, migration, test-data change or deployment is authorised** until the owner's separate approval. ₹0 spent; no email or WhatsApp message has been sent; no application code or migration was changed for this revision; the verification tests for the open checks were added as test files only (branch cr16-open-check-tests).
**Approval:** **Approved requirements baseline** — the owner approved v0.7, requirements N-1 to N-11 and acceptance checks AC-1 to AC-75, with B-1 (option C) and B-2 confirmed (20 Oct 2026, 11:14 IST, OC-119). This approves requirements, business rules, design and acceptance criteria only. **Implementation, the CR-16 migration, test data changes, data migration and deployment are not authorised** until separate explicit approval. ₹0; no paid services, new infrastructure, email sending or WhatsApp. Editorial note (OC-119): the planned CR-16 migration is renumbered from 0025 to **0026**, because 0025 was used by the separately approved "AA Pro Verified" change (PR #103); no requirement changed.

**Source:** owner requirement "Centralised Notifications and Dashboard Action Badges" (19 Oct 2026, 13:27 IST); decisions OC-106 (14:10 IST), OC-113 (19:21 IST) and OC-115 (23:51 IST); documentation review request OC-116 (20 Oct 2026, 00:07 IST); resolutions OC-117 (20 Oct 2026, 00:56 IST); business decisions OC-118 (20 Oct 2026, 09:56 IST). **Budget:** ₹0 — in-app only; no paid service, no new infrastructure, no email or WhatsApp sending.
**Boards:** NB0–NB4 on the design canvas (page "CR-16 Notifications"). They show content and behaviour; the build uses the approved signed-in design (tinted card headers, chip-style All / Unread filters, responsive desktop layout, bottom sheet on phones) without changing content, triggers, permissions or behaviour (OC-113 (1)).

**What changed from v0.7:** implementation status and owner decisions only (OC-120, OC-121). AC-9's design review is approved (design only). Four implementation choices are approved as requirements: no bell in the sample-data preview (AC-77), the access of teachers awaiting approval and of not-approved teachers (§6.2, AC-78), 48 px filter chips (AC-40, consistent with C-3), and parent-only notification of an unanswered enquiry's expiry (§3, AC-76). AC-44, AC-54, AC-55, AC-58, AC-60 and AC-75 stayed partially verified, each with its remaining verification method (§20); the remaining browser tests for AC-44, AC-54, AC-55, AC-58, AC-60 and AC-77 were then added (test files only) and passed locally (3/3), so only AC-75 remains open. The AC-75 review was carried out on an isolated, seeded review database (§20.2). No business rule other than the four recorded decisions was changed; privacy, authorisation, idempotency and ₹0 rules are unchanged.

**What changed from v0.6 (kept for history):** the owner decided B-1 and B-2 (OC-118). **B-1 — option C:** each bell refresh also runs a **user-scoped expiry check** over only the signed-in user's own, authorised enquiries, link requests and rate proposals, beside the unchanged once-a-minute shared sweep, so an active user sees an expiry notification within about 60 seconds of the expiry, as D-4 says (§0, §7.2, §7.5, §7.6). The earlier "about 2 minutes" worst case now applies only to the listing reminder, not to expiry notifications for active users. **B-2 — existing behaviour kept:** no listing reminder is created after the listing has ended (§7.3). Four checks were added (AC-72 to AC-75, 71 → 75 checks) and five changed (AC-30, AC-44, AC-58, AC-65, AC-71). The final consistency review is recorded in §18. Every change is listed in §17.
**What changed from v0.5 (kept for history):** the owner decided Q-2 to Q-8 and accepted C-1 to C-4 (OC-117). Not-approved teachers keep today's restricted access with no bell (§3, §6); the existing profile-change decisions are added as events (§3); notifications whose record the user may no longer see are kept but shown redacted (§8.1); the parent home button becomes "Notifications" (§6); the expiry and listing-reminder sweeps run on bell refreshes and signed-in page loads through one shared once-a-minute throttle (§7.2, §7.3, §7.5); existing email behaviour is unchanged (§5). Five checks were added (AC-67 to AC-71, 66 → 71 checks) and fourteen changed. The Q-8 timing check found that the worst case for an expiry notification becomes about 2 minutes, not D-4's "approximately 60 seconds"; this is **not** decided here and is listed as business decision B-1. *(B-1 and B-2 were decided in v0.7, OC-118: the 2-minute figure no longer applies to expiry notifications for active users.)* Every change is listed in §16; the final quality checks are now in §18 (renumbered in v0.7).
**What changed from v0.4 (kept for history):** review of the requirement-to-check links (OC-116). No business rule, decision or approved design was changed. Terms are defined once (§0); badge calculations (§4.1), action labels (§6.1), pagination (§6.2), refresh after the user's own action (§7.1), the listing-reminder trigger and timing (§7.3), error and offline behaviour (§7.4) and retention timestamps (§9) are now exact; eleven checks were tightened and twelve added (AC-55 to AC-66, 54 → 66 checks); a full traceability matrix replaces the one-line list (§15). Every change is listed in §14.
**What changed from v0.3 (kept for history):** D-1 to D-11 decided and the four assumptions accepted (§11); requirements and checks updated to match, and twelve checks added (AC-43 to AC-54) — every change is listed in §12; conflicts with existing checks, the current code and the tests are listed in §13, with eight new questions.
**What changed from v0.2 (kept for history):** requirements numbered N-1 to N-10 (the owner's ten principles) and N-11 (design); every acceptance check names its requirement, type and test level (§10); checks added for individual "mark as read", absolute date and time, navigation when access has ended, stale action notifications, worksheet privacy, hidden-tab behaviour, sign-out and the phone sheet; 30 checks became 42; §11 listed every open decision and assumption.

## Resolved and remaining items

**(a) Fully specified** — nothing more is needed from the owner except final approval of N-1 to N-11 and AC-1 to AC-75 (and, later and separately, approval to implement):

| | Item | State |
|---|---|---|
| Resolved | D-1 to D-11 | Decided by the owner, 19 Oct 2026, 23:51 IST (OC-115). All eleven v0.3 proposals accepted, with the owner's added detail (§11). Unchanged in v0.5 and v0.6. |
| Resolved | Assumptions 1–4 (§11) | Accepted by the owner (OC-115). |
| Resolved (documentation) | Q-1 — action labels per record | Answered by reading D-1 literally; the full per-record table is §6.1 and is tested by AC-31. Approving AC-31 confirms it; the owner may change any row. |
| Resolved | Q-2 — teachers awaiting approval vs not approved | Decided — OC-117. Awaiting approval: bell on the status and profile pages, approval-status notifications only. Not approved (rejected): today's restricted access (OC-72) — status message, no menu, **no bell**, no notifications (§3, §6, AC-46, AC-68). |
| Resolved | Q-3 — profile-change decisions | Decided — OC-117. The existing approved / declined events (`decideProfileChange`) notify the teacher (§3, AC-69). No new workflow. |
| Resolved | Q-4 — earlier notifications after access changes | Decided — OC-117. Kept, shown redacted in the list ("Notification no longer available"); opening shows only "This is no longer available to you."; checked on the server at display and open time (§8.1, AC-27, AC-67). |
| Resolved | Q-5 — parent home button | Decided — OC-117. Renamed "Notifications"; no preferences in CR-16 (§6, AC-70). |
| Resolved | Q-6 — listing-reminder trigger | Decided — OC-117: option B. The reminder sweep runs on bell refreshes and signed-in page loads, through the shared throttle (§7.3, AC-58). |
| Resolved | Q-7 — email keys | Decided — OC-117. Existing email keys, templates, recipients and queued-email behaviour are preserved exactly; no email sent (§5, AC-52). |
| Resolved | Q-8 — sweep frequency | Decided — OC-117. One shared global throttle: sweeps run at most once a minute across all users and server instances, with a database claim and idempotent, catch-up selection (§7.5, AC-71). Unchanged by B-1 (option C adds a separate user-scoped check, §7.6). |
| Resolved | C-1 to C-4 | Accepted — OC-117 (§13.5): badges in the same refresh response; keyset paging; 48 × 48 px targets with 8 px spacing; unread rows stay in place under the Unread filter. |
| Resolved (v0.7) | **B-1 — Expiry timing under the Q-8 throttle** | Decided — OC-118: **option C.** Each bell refresh also runs a user-scoped expiry check over only the signed-in user's own authorised enquiries, link requests and rate proposals (§7.6), beside the unchanged once-a-minute shared sweep. An active user sees an expiry notification within about 60 seconds of the expiry (D-4 met as written; AC-44: at most 65 s). Efficient, idempotent, concurrency-safe, server-derived identity only; expiry durations and rules unchanged (AC-72 to AC-75). |
| Resolved (v0.7) | **B-2 — Listing reminder after the period has ended** | Decided — OC-118: **existing behaviour approved.** If no qualifying application activity occurs during the listing's final 7 days, no reminder is created after the listing expires. No scheduler or new infrastructure. The "Looking for students" badge still shows renewal due (§7.3, AC-58). |
| Resolved (v0.8) | **AC-9 — design review** | **Approved — OC-120** (owner, 20 Oct 2026, 17:41 IST) from four screenshots: desktop panel, phone sheet, parent Notifications page, redacted row. Covers the visual design only — not functionality, accessibility, authorisation, privacy or any other check. |
| Resolved (v0.8) | **Verification of partially covered checks** | **OC-120:** AC-44, AC-54, AC-55, AC-58 and AC-60 stay partially verified until their remaining checks pass; AC-75 review to be completed and documented (§20). **Done:** the remaining checks of AC-44, AC-54, AC-55, AC-58 and AC-60 (and AC-77) passed locally (3/3) — fully verified, all 11 CI checks passed on PR #109 (20 Oct 2026); the AC-75 review is documented (§20.2). |
| Resolved (v0.8) | **Sample-data preview** | **Approved — OC-121 (1):** no bell, panel or badges in the sample-data preview; the actual application is unchanged (AC-77, DV-95). |
| Resolved (v0.8) | **Teachers awaiting approval** | **Approved — OC-121 (2):** approval-status notifications only, in the bell panel on the permitted status and profile pages; no full Notifications page and no "See all" link. Not-approved (rejected) or otherwise restricted teachers gain no notification access beyond their permissions (§6.2, AC-78, DV-96). |
| Resolved (v0.8) | **Filter chip height** | **Approved — OC-121 (3):** All / Unread chips 48 px high, consistent with the agreed 48 × 48 px targets and 8 px spacing (C-3, AC-40, DV-97). |
| Resolved (v0.8) | **Unanswered enquiry expiry** | **Approved — OC-121 (4):** notify only the parent who raised the enquiry, once; no teacher notification; the enquiry status becomes expired (§3, AC-76). |

**(b) Still needing a decision:**

| | Item | State |
|---|---|---|
| Resolved | N-1 to N-11, AC-1 to AC-75 | Approved as the requirements baseline (OC-119). AC-76 to AC-78 added in v0.8 to record OC-121. |
| Resolved | Tests for the open checks | Added with the owner's approval as test files only (branch cr16-open-check-tests): AC-44, AC-54, AC-55, AC-58, AC-60 and AC-77 are fully verified (§20). |
| Remaining | **AC-75 — teacher-side rate-proposal index** | Open, pending the owner's index decision (options presented to the owner on 20 Oct 2026: (a) accept AC-75 as met with the growth note recorded; (b) approve migration 0027 adding `rate_negotiations_teacher_open (teacher_id) WHERE status IN ('pending','countered')`; (c) accept now and revisit before launch. Measured at 60,000 open proposals on an isolated review database: teacher expiry check 10.9 → 5.9 ms, teacher with nothing expired 2.6 → 0.08 ms, teacher Enquiries badge count 8.6 → 0.55 ms; index 440 kB; no measurable write overhead; §20.1, §20.2). Any index would be a new migration (0027), which is **not approved**. Any other further change also needs the owner's separate approval (OC-120, OC-121). |

No other business decision is open (§18.8).

**Commitments for this change (unchanged by the decisions):**
- **Design:** the approved design is reused — tinted card headers, chip-style All / Unread filters, responsive desktop layout and a bottom sheet on phones (OC-113 (1)). No unrelated redesign.
- **Cost:** ₹0 additional spend; no paid services; no new infrastructure or scheduled jobs (the throttles, the shared sweep and the user-scoped expiry check all use the existing database). No emails or WhatsApp messages are sent — email stays queued-only in `email_outbox`.
- **Existing behaviour:** existing business behaviour, role permissions and security controls are preserved. Notifications are added beside them; they never replace a business record, a permission check or an existing count.

---

## 0. Terms (v0.5)

Each term is defined once here and used with this meaning everywhere in this document.

| Term | Meaning |
|---|---|
| **Notification** | One row in `notifications` for one recipient (§5). Shown in the bell panel, the student sheet or the Notifications page. |
| **Unread** | A notification whose `read_at` is empty. **Read** = `read_at` is set. |
| **Bell number** | The count of the signed-in user's unread notifications (§4). |
| **Action notification** | A notification of kind `action`: it tells the recipient that a business record waits for their response. Only action notifications show an **action label** (§6.1). |
| **Action label** | "Needs your reply", "Done" or "No longer needed", worked out from the current business record (D-1, §6.1). |
| **Menu badge** (also "action badge") | The number on a menu item counting the signed-in user's **pending actions** in that area, worked out from business records only (§4.1). |
| **Enquiry** | A parent's enquiry to a teacher (`teacher_enquiries`, E-1 to E-4). |
| **Link request** | A parent's request, per child, that a teacher accept that child (CR-12, FR-038): a `teacher_student_links` row with status `requested` (or `pending` while it is held until the teacher's approval). **Replaces** the v0.4 synonyms "teacher-link request" and "request" used alone. |
| **Teacher–child link** | An accepted link request (`teacher_student_links` status `active`) — the relationship that lets a teacher see a child (`teacherMaySee`). Distinct from a link request. |
| **Rate proposal** | A rate negotiation (`rate_negotiations`, CR-13 / CR-15): a price proposal and its counter-offers, open while `pending` or `countered`; `turn` names the side that must answer. "Counter-offer" is one offer within a rate proposal. |
| **Listing period** | One display period of a teacher's "Looking for students" listing, identified by the listing id and its current `expires_at`. Renewing sets a new `expires_at` and so starts a new period (L-2, L-3). |
| **Learning package needing details** | A `learning_packages` row in status `needs_review` created by the CR-15 conversion, while pricing model v2 is on (`packageNeedsDetails`). |
| **Expiry sweep** | One of the existing lazy expiry functions `expireEnquiries`, `expireLinkRequests`, `expireRateNegotiations` (D-4). |
| **Reminder sweep** | The existing function `queueListingReminders` (L-2), §7.3. |
| **Shared sweep** (v0.6) | The expiry sweeps and the reminder sweep run together by the CR-16 triggers (bell refresh, signed-in page load), at most once a minute across all users and server instances (§7.5, Q-8). Existing calls inside business pages and actions are not part of it and are unchanged. |
| **User-scoped expiry check** (v0.7) | The three expiry sweeps limited to the signed-in user's own authorised enquiries, link requests and rate proposals, run on **every** bell refresh with no throttle (§7.6, B-1 option C, OC-118). It never runs the reminder sweep and never touches another user's records except to notify the other party of a record it expires. |
| **Active user** (v0.7) | A signed-in user with an AA Pro tab visible and online, so the bell refreshes every 60 seconds (§7.2). |
| **Awaiting approval** (v0.6) | A teacher account in status `pending_approval` whose profile `approval_status` is `draft`, `submitted` or `changes_requested`. They may open only /teacher/status and /teacher/profile (`TEACHER_PENDING_MENU`, OC-38). |
| **Not approved** (v0.6) | A teacher whose profile `approval_status` is `rejected`. They see only the status message, with no menu (OC-72, src/app/teacher/layout.tsx, src/app/teacher/status/page.tsx); the profile page redirects them to the status page. The decision is final (`decideTeacher` accepts only `draft` or `submitted` profiles). |
| **Redacted** (v0.6) | A notification whose linked record the user may no longer see: still stored, but listed only as "Notification no longer available" (§8.1). |
| **Clean-up** | The retention run that removes notifications (§9, D-9). |
| **Now** | The server's current time. All stored times are `timestamptz` (an absolute instant, stored in UTC); comparisons never depend on a time zone. Times are **shown** in the account's own time zone (`accounts.time_zone`). |

## 1. What exists today (code inspection, 19 and 20 Oct 2026)

| Area | Found | Gap |
|---|---|---|
| In-app notifications | **None.** No table, bell or panel. The parent menu has a "Notifications" item that opens a placeholder ("Notification settings come with email and WhatsApp reminders"); the parent home card links to it as "Notification settings". | Everything below; the button is renamed "Notifications" (Q-5, decided) |
| Teacher decisions (v0.6) | `decideTeacher` (src/server/admin.ts) queues `teacher_approved` (or `teacher_approved_set_password`), `teacher_changes_requested` or `teacher_not_approved`. `decideProfileChange` (src/server/admin.ts) queues `teacher_profile_change_approved` or `teacher_profile_change_declined` (templates listed in src/server/auth/outbox.ts; covered by tests/db/teacherProfile.test.ts, "an approver accepts or declines the change; the teacher is emailed and sees the note"). | No in-app notification; events added in §3 (Q-2, Q-3) |
| Email | `email_outbox` with a unique `dedupe_key`; templates queued at the business event. **Queued only — no email is sent.** Enquiry expiry, enquiry withdrawal and worksheet sharing queue no email. | Used as the event hook where an email exists (§5) |
| Pending counts | Teacher home: link requests waiting (CR-12 TR3), rate proposals waiting (CR-13 RN4), "Enquiries waiting" summary, CR-15 "Finish your learning package" banner. Teacher enquiries page lists pending enquiries. Super Admin home: counts only (including teachers waiting for approval). | Not on menus; not shared across pages |
| Expiry | Enquiries, link requests and rate proposals (14 days each) are expired **when a relevant page is next loaded or a related action runs** (`expireEnquiries`, `expireLinkRequests`, `expireRateNegotiations`, called inside src/server/teacherEnquiries.ts, teacherLinks.ts and rateNegotiations.ts), not by a scheduled job. | Also run by the shared sweep (D-4, §7.2, §7.5) and, for the viewer's own records, by the user-scoped expiry check on each bell refresh (B-1 option C, §7.6); existing calls unchanged |
| Listing reminder (v0.5) | `queueListingReminders` (src/server/teacherListings.ts) queues one `listing_expiry_reminder` email per listing period, 7 days before the end, for published listings of active, approved teachers. It sweeps **all** teachers' listings (up to 100 per run). It is called **only** when a teacher opens /teacher/listing (src/app/teacher/listing/page.tsx); the code comment's "and when public listings are read" is not implemented (§13.2 (12)). | No in-app reminder; also run by the shared sweep (Q-6 option B, §7.3) |
| Real time | None (server-rendered pages, no websockets). | 60-second refresh (§7) |

## 2. Requirements

These requirements **await the owner's final approval.** Text added in v0.4 to reflect a decision names that decision. v0.5 changed wording only where marked "(v0.5)"; no requirement's business meaning changed. v0.6 changed N-1, N-6 and N-7 to apply the owner's resolutions (OC-117), marked "(v0.6)". v0.7 changed N-7 to apply B-1 option C (OC-118), marked "(v0.7)".

| ID | Requirement (owner principle, OC-113 (2); refined by OC-115) |
|---|---|
| **N-1** | **Role-based notifications.** Parents, teachers and students receive only notifications relevant to their role and authorised relationships. A teacher awaiting approval receives only approval-status and profile notifications (D-5). (v0.6) A not-approved teacher keeps today's restricted access — status message, no menu — and has no bell and no notifications (Q-2). Super Admin and Admin have no notifications in CR-16 (D-6). |
| **N-2** | **Action badges ≠ unread notifications.** Menu badges count outstanding actions from the records' state (§4.1, v0.5); reading a notification never completes or clears an action. |
| **N-3** | **Security.** Every notification, linked record and count is protected by server-side authorisation; no access to another child's or family's data. |
| **N-4** | **Reliable triggers.** One notification per authorised recipient per event (no duplicates); no stale action labels — an action notification's label follows the current business record (D-1); changes to the underlying record handled correctly. Lesson reminders, cancellations and rescheduling are out of scope for CR-16 (D-10). |
| **N-5** | **Dashboard bell.** Unread count, notification list, date and time, read status; mark one (without leaving the screen) or all as read (D-2). |
| **N-6** | **Navigation.** Clicking a notification opens the record only when the user is still authorised to see it; otherwise a neutral "This is no longer available to you." (D-8). A notification never grants access. (v0.6) Such a notification stays stored but is listed redacted, as "Notification no longer available", decided on the server each time the list is shown (Q-4, §8.1). |
| **N-7** | **Refresh.** Every 60 seconds while the tab is visible; skipped while hidden; immediate after the user's own actions (including "Mark as read", D-2) — the bell number and the affected menu badges (§7.1, v0.5). (v0.6) Each refresh and signed-in page load **triggers** the shared sweep (existing expiry checks, D-4, and the listing-reminder sweep, Q-6), which runs at most once a minute across all users (Q-8, §7.5); a refresh that falls inside the minute does not run it. (v0.7) Each bell refresh also runs the user-scoped expiry check over the signed-in user's own authorised records, with no throttle, so an active user sees an expiry notification within about 60 seconds of the expiry (D-4; B-1 option C, §7.6). |
| **N-8** | **Worksheets.** A new worksheet creates a student notification and a separate notification for each authorised parent, without exposing other students' information. |
| **N-9** | **Retention.** Read notifications kept 90 days after being read; unread kept 180 days after creation (D-3); clocks as defined in §9 (v0.5). Clean-up runs during normal requests, at most once an hour (D-9). Retention never deletes, hides, changes or resolves a business record, and never changes a menu badge. |
| **N-10** | **Testing.** Every acceptance check is specific, testable and traceable, with positive, negative-authorisation, duplicate, error and phone cases (traceability matrix, §15). |
| **N-11** | **Design.** Approved signed-in design; responsive desktop and phone; accessible (repository rules AX-01 to AX-13, G1-04); loading, empty and error states (OC-113 (1)). |

## 3. Who gets what — events that exist today

Notifications are created **at the business event, in the same database transaction** as the change (§5). Nobody is notified of their own action. Each authorised recipient gets exactly one notification per event (assumption 1).

| Event (existing code) | Recipient | Kind | Title (example) | Opens |
|---|---|---|---|---|
| Enquiry sent | Teacher | Action | "New enquiry from Anita" | /teacher/enquiries |
| Enquiry accepted / declined | Parent | Update | "Teacher B accepted your enquiry" | /parent/enquiries |
| Enquiry expired (v0.8, OC-121 (4)) | The parent who raised it — once; the teacher gets no expiry notification | Update | "Your enquiry to Teacher B expired" | Enquiries page |
| Enquiry withdrawn | The teacher it was sent to | Update | "Anita withdrew their enquiry" | Enquiries page |
| Link request sent (after teacher approval) | Teacher | Action | "Anita asked you to teach a Grade 5 child" | /teacher/students |
| Link request accepted / declined / expired | Parent | Update | "Teacher B accepted your link request for Kiran" | /parent/teachers |
| Rate proposal received (hourly / package / earlier price) | Teacher | Action | "New package price proposal" | /teacher/enquiries/rates |
| Counter-offer | The other side | Action | "Teacher B made a counter-offer (offer 2 of 6)" | that side's Rate proposals |
| Rate proposal accepted / declined / withdrawn | The other side | Update | "Anita accepted ₹550 per hour" | Rate proposals |
| Rate proposal expired | Both sides | Update | "Your proposal to Teacher B expired" | Rate proposals |
| Teacher shares a worksheet / resource with a child (CR-07) | That **student** and **each active authorised parent** of that child (separately) | Update | "New worksheet from Teacher B: Fractions" | /student/homework · /parent/homework |
| Listing ends in 7 days (existing L-2 reminder; trigger and timing §7.3) | Teacher | Reminder | "Your listing ends on 26 Oct" | /teacher/listing |
| Converted package needs details (CR-15 A5) | Teacher | Action | "Finish your learning package" | /teacher/listing |
| Teacher approved / changes requested (`decideTeacher`) | Teacher (including while awaiting approval, D-5) | Update | "Your profile was approved" · "Please update your profile" | /teacher (approved) · /teacher/status (changes requested) |
| Teacher not approved (`decideTeacher`, reject) — **(v0.6) no in-app notification** | — | — | — | — |
| (v0.6) Profile change approved / declined (`decideProfileChange`, OC-73) | Teacher (approved, active) | Update | "Your profile change was approved" · "Your profile change was not accepted" | /teacher/profile |

**(v0.6) Teacher approval status (Q-2, decided — OC-117):**
- **Awaiting approval** (§0): the bell shows on /teacher/status and /teacher/profile, the only pages open to them (D-5). They receive approval-status notifications only ("changes requested"; the "approved" notification is created in the same transaction that makes them active, so they read it with the full menu). No marketplace, enquiry, rate proposal, link request, listing or student notification is created for them.
- **Not approved** (§0): access stays exactly as today (OC-72) — the status page with "Your profile was not approved" and no menu. **No bell** is shown and no notification request is made on that page. No notification is created by the rejection (the status page already says it, and the existing `teacher_not_approved` email is queued exactly as today). Any notification created earlier (for example "changes requested") stays stored until retention removes it but is never displayed. They get no marketplace or student-related notifications. No new page, menu item or access is granted.
- A **suspended** or **deactivated** account cannot sign in (src/server/auth/accounts.ts), so it sees no notifications at all.

**(v0.6) Profile changes (Q-3, decided — OC-117):** only the two existing events are added — `decideProfileChange` with decision `approved` or `declined`, which already queue `teacher_profile_change_approved` / `teacher_profile_change_declined` in the same transaction (src/server/admin.ts). The notification is created beside that `queueEmail` call. No other profile workflow is added; a teacher's own profile edits and the initial submission notify nobody. The approver is a Super Admin or Admin, who is not notified (D-6).

**Not in this change:** lesson bookings, cancellations, rescheduling and 15-minute lesson reminders — out of scope; added when the booking and scheduling phases are built, under the CR-16 principles, and the 15-minute reminder requirement is kept for that workflow (D-10); homework submissions and marking (CR-07 H-3, H-4); package arrangements (CR-15 Phase B); Super Admin / Admin notifications (D-6). No placeholder notification or simulated booking is created for a workflow that doesn't exist.

**Content rules:**
- A teacher's notification never contains a child's name or id — grade, curriculum and the parent's first name only (FR-040.9, CR-12 B). This applies whether or not a teacher–child link exists, and to the title, message, link path and every response the browser receives.
- A teacher awaiting approval gets approval-status and profile notifications only — no marketplace, enquiry, rate proposal, link request or student notifications until approved (D-5). A not-approved teacher gets none (Q-2).
- A student gets learning updates only (today: shared worksheets / resources) in simple, child-friendly wording — never prices, rate proposals, enquiries, commercial or parent details (D-7).
- A parent gets only their own items and items about their own children (active guardian link).
- A worksheet notification names only that child's own item — never other students it was shared with.
- No free-text message content, no amounts beyond what both parties already see, no email addresses or phone numbers.
- Wording is English only for this release (assumption 4).

## 4. Two counts (N-2)

| | Bell number | Menu badge |
|---|---|---|
| Counts | This user's **unread notifications** | This user's **pending actions** in that menu area |
| Source | `notifications` where `recipient_id` = the signed-in user and `read_at IS NULL` | The records' business state (§4.1) — never the notifications |
| Changes when | A notification arrives, is marked read (one or all), is opened (§8), or is removed by retention | The action is done, withdrawn, expires (by time, §4.2) or a new one arrives |
| Reading a notification | Lowers it | **No change** |
| Display | 1–9, then "9+"; hidden at 0 | 1–9, then "9+"; hidden at 0 |
| Screen readers | "Notifications, 2 unread" | "Enquiries, 3 waiting for you" |

### 4.1 Menu badge calculations (v0.5: exact)

Each badge is a count of business records, computed on the server for the signed-in user only, at page render and on each 60-second refresh (§7.2). "Not past expiry" means `expires_at > now` (§4.2).

| Role | Menu item | Counts exactly | Clears when |
|---|---|---|---|
| Teacher (approved, active) | Students | Link requests with `teacher_id` = the user, `status = 'requested'` and `expires_at > now`. Link requests held in `pending` until the teacher's approval are **not** counted. | Accepted (→ teacher–child link), declined, withdrawn by the parent, or `expires_at ≤ now` |
| Teacher (approved, active) | Enquiries | **(a)** enquiries with `teacher_id` = the user, `status = 'pending'` and `expires_at > now`, **plus (b)** rate proposals with `teacher_id` = the user, `status IN ('pending', 'countered')`, `turn = 'teacher'` and `expires_at > now`. Each record counts once. | (a) accepted, declined, withdrawn or `expires_at ≤ now`; (b) the teacher accepts, declines or counters (turn passes), either side withdraws, or `expires_at ≤ now` |
| Teacher (approved, active) | Looking for students | **0 to 2:** +1 if the teacher's listing is due for renewal — status `published` or `paused` (including one already shown as ended because `expires_at ≤ now`) and `expires_at − now ≤ 7 days` (the existing `renewalDue` rule); +1 if the teacher has a learning package needing details (§0). | Renewed (new listing period); package completed or withdrawn |
| Parent (active) | My enquiries | Rate proposals with `parent_id` = the user, `status IN ('pending', 'countered')`, `turn = 'parent'` and `expires_at > now`. | The parent accepts, declines or counters; either side withdraws; or `expires_at ≤ now` |
| Parent | Teachers | none — no parent action is pending on link requests | — |
| Student | — | none — no student action exists yet | — |
| Teacher awaiting approval or not approved; Super Admin; Admin | — | **No badges** (their menus have no counted item, D-5, D-6) | — |

### 4.2 Badge rules

- Badges are counted from the business records above, **never** from notifications: reading, marking read, opening, or retention removal of a notification never changes a badge (N-2, D-3).
- Counts compare `expires_at` with now, so an item whose expiry time has passed is excluded even before an expiry sweep has changed its status (§1, D-4). (v0.6) Badges therefore never wait for the shared sweep or its throttle (§7.5): a badge is correct at every page render and refresh, whether or not a sweep ran in that minute. (v0.7) The same holds for the user-scoped expiry check (§7.6): it changes no badge value, because the records it expires were already excluded by `expires_at ≤ now`.
- A badge counts only the signed-in user's records; an id in a URL or request body is never used to choose whose records are counted.
- The "Looking for students" listing term matches the existing listing-page rule (`renewalDue`); the reminder notification (§7.3) and the badge are independent: the badge can show without a reminder notification (for example, when no reminder sweep ran in the window).
- **Known difference, preserved:** the teacher home summary "Enquiries waiting" counts pending enquiries only, while the Enquiries badge also counts rate proposals waiting for the teacher (§13.2 (7)).

## 5. Data model (migration 0026, additive, existing free database)

`notifications`: `id` uuid · `recipient_id` → accounts (on delete cascade) · `kind` (`action`, `update`, `reminder`) · `type` (e.g. `enquiry_received`) · `title` (≤ 120) · `body` (≤ 300) · `href` (internal path only, checked `^/[a-z]`) · `entity_type`, `entity_id` (the underlying record) · `dedupe_key` (unique) · `created_at` (`timestamptz`, set once at insert) · `read_at` (`timestamptz`, empty until first read; set once, never moved or cleared).
Indexes: `(recipient_id, created_at desc, id desc)`; partial `(recipient_id) WHERE read_at IS NULL`.
A small stored "last clean-up" time (one row) lets clean-up run at most once an hour across all server instances (D-9). (v0.6) A second row of the same kind, "last sweep", lets the shared sweep run at most once a minute (§7.5, Q-8). Both are rows in the existing database; no new service. (v0.7) The user-scoped expiry check (§7.6) needs no stored row and no new table; it uses the existing business tables and their existing indexes. Implementation note (not a migration now): `teacher_student_links` has no index on `created_by_parent_id`, so the parent side of the link-request check would use a partial index such as `(created_by_parent_id, expires_at) WHERE status = 'requested'`, to be added with migration 0026 only when implementation is approved (§7.6).

- Created by one server helper `notify(tx, …)` called in the **same transaction** as the business change — next to the existing `queueEmail(…)` where the event already queues an email, and at the same point for events that queue none (enquiry expired / withdrawn, worksheet shared, package needs details). Unique `dedupe_key` built from the event (never the clock) + `ON CONFLICT DO NOTHING` → a retried or repeated event never duplicates. Examples (v0.5): `enquiry_received:<enquiry id>:<recipient id>`; `rate_offer:<rate proposal id>:<offer number>:<recipient id>`; `listing_reminder:<listing id>:<expires_at ISO>:<recipient id>`; `worksheet_shared:<share id>:<recipient id>`. (v0.6) Teacher decisions: `teacher_decision:<teacher id>:<submitted_at ISO>:<decision>`; profile changes: `profile_change:<teacher id>:<change_submitted_at ISO>:<decision>` — the submission being decided identifies the event (both values are read under the existing row lock before they change).
- **(v0.6) Existing email unchanged (Q-7, decided — OC-117):** every existing `queueEmail` call keeps its template, recipient, payload and `dedupe_key` exactly, including the two time-based keys `link_request:<teacher>:<time>` and `teacher_decision:<teacher>:<time>` and the profile-change key `teacher_profile_change:<teacher>:<time>` (src/server/admin.ts); their protection against duplicates stays the status re-check under row locks. No email is sent. The only change to email in CR-16 is **when** an existing email may be queued: under Q-6 option B the same `listing_expiry_reminder` email (same template, recipient, payload and key) can be queued by the shared sweep rather than only at a /teacher/listing page load — the owner accepted this with option B (v0.5 Q-6 text); and (v0.7 clarification) the existing expiry emails `parent_link_request_expired` (key `link_request_expired:<id>`) and `rate_proposal_expired` (key `rate_expired:<id>:<address>`) can be queued by the shared sweep (D-4, Q-8) or the user-scoped expiry check (B-1 option C) rather than only at a business page load or action. Template, recipient, payload and key stay exactly as today, and each expiry still queues each email at most once (the expiry `UPDATE` changes a row once and the keys are unique).
- Rate proposal action notifications record the offer number they announce (in the key above), so the action label (§6.1) can tell the current offer from earlier ones.
- **Two independent channels (D-11):** one in-app notification per authorised recipient, and the existing queued email exactly as today. Each channel has its own de-duplication. No email is sent: `email_outbox` stays queued-only until an email provider and its cost, privacy, security and delivery requirements are approved. A queued email is never shown or reported as delivered. No WhatsApp or other external messaging.
- Read / mark-all: `UPDATE … SET read_at = now WHERE recipient_id = <signed-in user> AND read_at IS NULL [AND id = …]` — one statement, so "Mark all" changes all or nothing; another user's id matches nothing; an already-read row keeps its first `read_at`.
- List and count queries always filter by the signed-in user; there is no way to request another user's notifications.
- Users can't delete notifications; only retention removes them (§9).

## 6. Screens (boards, built in the approved design)

- **Bell** in the top bar of every signed-in parent, teacher and student page (beside theme and account), including the status and profile pages open to a teacher awaiting approval (D-5); unread number in the primary colour. **No bell** on public pages (assumption 2), on Super Admin / Admin pages (D-6), or (v0.6) for a not-approved teacher (Q-2).
- **(v0.6) Parent home button** — the parent home card's "Notification settings" button is renamed **"Notifications"** and opens the Notifications page (Q-5, decided — OC-117). The email and WhatsApp status chips beside it are unchanged. No notification preferences are built in CR-16; where preferences go is a future, separately approved change.
- **Panel** (desktop, ~380 px; phone: bottom sheet) — tinted header "Notifications", **Mark all as read**; content and size per §6.2; each row: icon by kind, title, one-line message, relative time with full date and time, unread dot (with the text "Unread" for screen readers, AX-07), action label (§6.1), per-row **Mark as read** on unread rows (D-2); **See all notifications** (parent and teacher only).
- **Notifications page** (D-7) — parent: replaces today's placeholder menu page; teacher: reached from "See all" in the panel (no new menu item); tinted card header; chip filters **All / Unread (n)**; paging per §6.2; per-row **Mark as read**.
- **Student** (D-7) — child-friendly bell and sheet, "Your updates", latest 20 (§6.2), simple wording, no commercial or parent-specific information, no action labels, "You're all caught up!" when empty. No full page and no "See all" in this change.
- **Menu badges** — amber chip with the count on the menu items in §4.1, using the approved amber pair (`on-secondary-container` `#684000` on `#fea619`, 4.60:1; never white on amber, AX-01).
- **Access ended (D-8)** — "This is no longer available to you." and nothing else about the record (§8).
- **CR-15 banner** — the "Finish your learning package" banner on the teacher dashboard stays, alongside its notification (assumption 3).
- **States** — loading skeleton, error with Try again, empty, offline (§7.4), keyboard and screen-reader support, 9+ cap.

### 6.1 Action labels (D-1; v0.5: exact per record)

A label is shown only on **action notifications** (kind `action`) in the parent and teacher panel and page. It is worked out on the server from the current business record **each time the list is shown**, never from read status, and showing it never changes the record or the read status. Update and reminder notifications (including the listing reminder) show no label; the outstanding renewal is shown by the "Looking for students" badge. The student sheet shows no labels (students have no actions).

| Action notification (recipient) | "Needs your reply" | "Done" | "No longer needed" |
|---|---|---|---|
| Enquiry received (teacher) | Enquiry `pending` and `expires_at > now` | `accepted` or `declined` (the teacher answered) | `withdrawn`, `expired`, or still `pending` with `expires_at ≤ now` |
| Link request received (teacher) | Link request `requested` and `expires_at > now` | Accepted (became a teacher–child link — stays "Done" even if that link later ends) or declined by the teacher (`ended_as = 'declined'`) | Withdrawn by the parent or expired (`ended_as` = `withdrawn` / `expired`), or still `requested` with `expires_at ≤ now` |
| Rate proposal or counter-offer received — offer *n*, recipient side X (teacher or parent) | Status `pending` or `countered`, `turn = X`, the current offer is offer *n*, and `expires_at > now` | X accepted or declined offer *n*, or X made a counter-offer to it (a later offer exists) | Withdrawn (by either side), `expired`, or still open with `expires_at ≤ now` |
| Learning package needs details (teacher) | Package in `needs_review` and pricing model v2 on | Completed — the package left `needs_review` as an offered package | Withdrawn or removed, or pricing model v2 turned off, while not completed |

A decline counts as "Done" because it is the recipient's own answer (D-1 "completed"); "No longer needed" covers every way the action ended without the recipient's answer. This closes Q-1 as a documentation reading; the owner may change any row when approving AC-31.

### 6.2 Lists, order and paging (v0.5: per role)

| Role | Panel / sheet | Full page | "Show older" |
|---|---|---|---|
| Parent | Latest **10**, all notifications (read and unread); "See all notifications" link | **20** per load; All / Unread chips | On the page only: loads the next 20 older items of the active filter; hidden when none are older |
| Teacher (approved) | Latest **10**; "See all notifications" link | **20** per load; All / Unread chips; reached only from "See all" | As parent |
| Teacher awaiting approval (v0.8, OC-121 (2)) | Latest **10**, approval-status and profile notifications only, on the status and profile pages; **no** "See all" link | **None** — /teacher/notifications sends them to /teacher/status | As parent |
| Student | Latest **20**, all notifications, child-friendly sheet | **None** in CR-16 | **None.** Older notifications are not reachable by the student in CR-16; they remain stored until retention removes them (§9) |

- **Order:** newest first by `created_at`, then `id` (both descending) so equal times have a stable order.
- **"Show older"** continues from the last row shown (keyset on `created_at`, `id`), so notifications that arrive meanwhile never cause a row to repeat or be skipped; new arrivals appear at the top on the next refresh or reload (C-2, accepted — OC-117).
- **Unread chip:** shows unread rows only, paged the same way; the chip's (n) is the bell number. A row marked read while the Unread chip is active stays visible (shown as read) until the filter is changed or the page reloads, so rows don't jump under the pointer (C-4, accepted — OC-117).
- **(v0.6) Redacted rows** (§8.1) take part in order and paging like any other row.
- The panel loads its rows only when opened; the panel never offers "Show older".

## 7. Refresh and performance (₹0)

- Counts come from the server on every page load (the unread count and the user's menu badges — small indexed queries).
- The panel loads its rows only when opened (§6.2); the page loads 20 at a time.

### 7.1 After the user's own action (N-7, v0.5)

- **Mark as read / Mark all as read** (D-2): the bell number changes in the same tab without a page reload, as soon as the server confirms; menu badges stay as they are (N-2).
- **Business actions** (answering or withdrawing an enquiry, accepting or declining a link request, answering, countering or withdrawing a rate proposal, renewing a listing, completing a learning package): the response that completes the action — the server action's re-render or the page it redirects to — shows the bell number, every affected menu badge and the affected action labels computed **after** the change. The user never waits for the 60-second refresh to see their own action reflected.
- **Opening a notification** (§8): it is marked read before navigation; the next page shows the lowered bell number.
- Other open tabs of the same user catch up at their next 60-second refresh (§7.2).

### 7.2 Periodic refresh (N-7)

- While the tab is visible the bell re-checks every 60 seconds; the same request returns the unread count **and** the user's menu badges (C-1, accepted — OC-117); **no requests while the tab is hidden**; one check when it becomes visible again.
- **(v0.6) Each count refresh, before counting, triggers the shared sweep** (§7.5): if no sweep has run in the last minute, this request runs the expiry sweeps for enquiries, rate proposals and link requests and the listing-reminder sweep; otherwise it skips them and only counts. Signed-in page loads trigger it the same way. Not every refresh runs the shared sweep. Expiry durations and rules are unchanged; no scheduled job or paid service is added.
- **(v0.7) Each bell refresh also runs the user-scoped expiry check** (§7.6, B-1 option C — OC-118): before counting, with no throttle, over only the signed-in user's own authorised enquiries, link requests and rate proposals. "Bell refresh" means every count request the bell makes: the 60-second refresh, the one check when the tab becomes visible and the one check when the connection returns (§7.4). Signed-in page loads trigger the shared sweep only, as in v0.6; the bell's next refresh runs the user-scoped check.
- **Timing (v0.7, B-1 decided):** for an **active user** (§0), an expiry notification is in their bell within about **60 seconds** of the expiry time: the user's next refresh, at most 60 s after the expiry, runs the user-scoped check, which expires the record and creates the notification before the same response counts the bell (D-4 met as written; tested by AC-44 with a bound of 65 s — 60 s refresh interval plus 5 s for that one refresh request to complete). The shared sweep's once-a-minute throttle does not affect this. For a user who is **not active** (no visible tab, offline or signed out), the notification is created by whichever comes first — the shared sweep on anyone's request, the other party's user-scoped check, or an existing business-page or action call — and, if none has run, on their own next request: their first bell refresh after sign-in or page load (within 60 s of that page load) runs the user-scoped check (D-4 "created on the next appropriate request"). Badges and action labels do not wait for any of this (§4.2, §6.1).
- Clean-up (§9) may run as part of the same request, at most once an hour.

### 7.3 Listing-reminder notification: trigger and timing (v0.5; v0.6: option B decided; v0.7: B-2 decided)

- **What:** one in-app reminder notification ("Your listing ends on …", kind `reminder`) per listing period, to the listing's teacher, when the existing L-2 rule selects the listing: status `published`, `expires_at > now`, `expires_at ≤ now + 7 days`, teacher account active and approved, and `reminder_queued_for` differs from `expires_at`.
- **How:** created by `queueListingReminders` inside the **same transaction** that sets `reminder_queued_for` and queues the existing `listing_expiry_reminder` email, keyed `listing_reminder:<listing id>:<expires_at ISO>:<teacher id>`. The email is queued exactly as today (same template, recipient, payload and key); it is not sent. Renewing sets a new `expires_at`, so the next period gets its own single reminder. A paused, withdrawn or ended listing gets none (unchanged rule).
- **When — option B (decided — OC-117, Q-6):** the reminder sweep runs (1) when any teacher opens /teacher/listing, exactly as today, and (2) as part of the shared sweep (§7.5), triggered by any bell refresh or signed-in page load and run at most once a minute across all users. The reminder is created within about 2 minutes of becoming due while **any** signed-in user has a visible tab (the throttle allows a run 60 s after the previous one, and the next trigger comes within one more refresh interval), otherwise at the next signed-in request by anyone after the throttle allows a sweep; the teacher sees it at their next bell refresh. (v0.7) This timing is for the listing reminder only, whose window is 7 days; it is not covered by D-4, and the user-scoped expiry check (§7.6) does not run the reminder sweep.
- **Never permanently skipped while the period runs (v0.6):** each run selects **every** published listing whose reminder window has started (`expires_at − 7 days ≤ now < expires_at`) and whose current period has no reminder yet (`reminder_queued_for` differs from `expires_at`), however late the run is. The selection does not depend on when the previous run happened, so a skipped minute, a failed run or a quiet day is caught up by the next run. The existing limit of 100 listings per run is kept; any remaining due listings are taken by the next run (building note: ordering the selection by `expires_at` serves the earliest-ending first and changes no email).
- **Worst case — B-2 decided (OC-118, existing behaviour approved):** if no qualifying application activity occurs during the listing's final 7 days (no signed-in request that triggers the shared sweep, and no /teacher/listing page load), no reminder is created before the listing ends, and **no reminder is created after the listing expires** (existing rule: only `published` listings with `expires_at > now` are selected). No scheduler or new infrastructure is added for this case. The "Looking for students" badge still shows that renewal is due (§4.1).
- *Option A (v0.5 text, kept as history):* the sweep ran only when any teacher opened /teacher/listing; worst case no reminder if no teacher opened that page in the 7-day window.
- **Inactive teacher:** the reminder is created by whoever triggers the sweep; the teacher sees it in the bell at their next sign-in, if it was created before the listing ended. Nothing is sent outside the app.

### 7.4 Errors and offline (N-11, v0.5)

- **Load failure:** the bell shows without a number, the panel shows an error with **Try again**, and the rest of the page and the menu badges still work.
- **Offline** (the existing `OfflineBanner`): the existing offline banner shows; the bell keeps its last number; no repeated error messages; one check runs when the connection returns.
- **Mark as read fails:** the row stays unread, the bell number goes back to its previous value, and the row shows "Couldn't mark as read. Try again." with a retry control. **Mark all fails:** nothing changes (one statement, §5) and the same message shows once.
- **"Show older" fails:** rows already shown stay; a Try again control appears under them.
- **Opening a notification fails** (server error): the user stays on the current screen with an error and Try again; the notification is not marked read.
- No error message names a record, child or other user.

### 7.5 Shared sweep throttle (v0.6; Q-8 decided — OC-117)

**Rule.** The shared sweep (§0) — the three expiry sweeps and the listing-reminder sweep — runs **at most once per minute across all users and all server instances**. It is triggered by bell refreshes and signed-in page loads (N-7, Q-6). It uses only the existing database: no scheduler, no new service, ₹0.

**How a run is claimed (concurrency).** One stored row holds `last_sweep_at`. A request claims the run with one conditional statement, using the database clock (so server clocks don't matter): `UPDATE … SET last_sweep_at = now() WHERE last_sweep_at <= now() − interval '60 seconds' RETURNING …`. The row lock makes concurrent claims wait for each other; the second re-checks the condition after the first commits, finds it false and returns nothing. Only the request that got a row back runs the sweep. The claim is committed in its own short transaction before the sweep starts, so other requests never wait for the sweep. (An equivalent `pg_try_advisory_xact_lock` guard, the pattern already used in src/server/files/limits.ts and src/server/teacherLinks.ts, is acceptable; the conditional update alone is enough.) A request that does not claim the run simply counts.

**Idempotency.** Each expiry sweep runs in its own transaction (§13.2 (2)) and selects only rows still open and past `expires_at`; its `UPDATE … RETURNING` re-checks the status, so a second runner gets nothing back. Each notification has a unique event-based key with `ON CONFLICT DO NOTHING` (§5) as a backstop. The reminder sweep re-checks `reminder_queued_for` inside each listing's transaction (existing code) and uses the unique reminder key. So if two sweeps ever overlap (for example, a business page's own expiry call and the shared sweep), no record is changed twice and no notification or email is created twice.

**Catch-up.** Every sweep re-selects **all** due rows (past `expires_at` and still open; reminder window started and no reminder for the period), not only rows that became due since the last run. A minute with no traffic, a claimed run that then fails, or a run that stops at the 100-listing limit is caught up by the next successful run. A due item is never permanently skipped while it is still due.

**Existing calls are not throttled.** The expiry calls already inside business functions (for example `listMyTeachers`, enquiry and rate-proposal pages and actions) and the /teacher/listing reminder call keep running exactly as today, without the throttle, so business pages and actions behave as before (AC-42, AC-45). (v0.7) The user-scoped expiry check (§7.6) is also outside the throttle: it neither reads nor claims `last_sweep_at`, and the shared sweep still runs at most once a minute.

**Timing check (requested by the owner, OC-117; v0.7: B-1 decided, OC-118).** Let the throttle be 60 s and the refresh 60 s. An item expires at time *E*.
- **Shared sweep alone (v0.6 analysis, kept as the reason for B-1):** a shared sweep that ran just before *E* allows the next one only at about *E* + 60 s, and the recipient's own refresh may then fall up to 60 s later, so the shared sweep alone would give a worst case of about 120 s. That exceeded D-4's "within about 60 seconds while a user is active".
- **With the user-scoped check (option C, decided):** the active recipient's next refresh comes at most 60 s after *E* and runs the user-scoped check over that recipient's own records, whether or not the throttle allows a shared sweep. The check expires the record and creates the notification(s) in one transaction before the same response counts the bell. **Worst case for an active user ≈ 60 s** (plus the time of one refresh request; AC-44 asserts at most 65 s). D-4 is met as written and is not changed.
- **User who is not active:** created on the next appropriate request (D-4) — by the shared sweep on anyone's request, by the other party's user-scoped check, by an existing business-page or action call, or by the user's own first bell refresh after sign-in or page load (§7.2).
- Options (A) accept ≈ 2 min and (B) 30-second throttle were not chosen (OC-118).
- **Badges and action labels are not affected**: both are computed from `expires_at` directly (§4.1, §4.2, §6.1), so they are correct at every render and refresh regardless of whether a sweep or check ran.
- The listing reminder is run only by the shared sweep and the /teacher/listing page (not by the user-scoped check); its 7-day window means the throttle adds at most about a minute, and it is never skipped while the period runs (§7.3).

### 7.6 User-scoped expiry check (v0.7; B-1 option C decided — OC-118)

**Purpose.** Keep D-4's "within approximately 60 seconds while a user is active" without increasing the shared sweep's frequency (§7.5 stays once a minute).

**When it runs.** On every bell refresh of an active parent or an approved, active teacher (§7.2: the 60-second refresh, the check on becoming visible, the check on reconnect), before the unread count and badges are computed for the same response. It is **not** throttled. It is not run for a student or a teacher awaiting approval (they have no enquiries, link requests or rate proposals that can expire: held link requests stay `pending` and do not expire), and a not-approved teacher has no bell (Q-2). It does not run the reminder sweep or the retention clean-up.

**What it covers — the signed-in user's own authorised records only.** The user's identity comes only from the server-side session; the check takes **no** record id, user id or other selection from the browser, and a request body or URL id is ignored. It applies the existing expiry rule with one extra condition that limits it to records where the user is a party and may see the record under the existing permission rules:
- **Enquiries** (`teacher_enquiries`): `status = 'pending' AND expires_at <= now AND (teacher_id = <user> OR parent_id = <user>)`.
- **Link requests** (`teacher_student_links`): `status = 'requested' AND expires_at <= now AND (teacher_id = <user> OR created_by_parent_id = <user>)`; for a parent, only while they still have an active guardian link to that child.
- **Rate proposals** (`rate_negotiations`): `status IN ('pending', 'countered') AND expires_at <= now AND (teacher_id = <user> OR parent_id = <user>)`.
Records the user is not a party to, or may no longer see, are left to the shared sweep and the existing business-page calls, which handle them exactly as today.

**Business rules unchanged.** Same statuses, same 14-day durations, same transitions (`expired`; for link requests `removed` with `ended_as = 'expired'`), same audit entries and same existing emails with the same keys (§5) as the shared sweep and the existing functions. Building note: the existing functions gain an optional "only this user's records" condition; nothing else in them changes (AC-45).

**Concurrency-safe and idempotent.** For each record type, one transaction holds a conditional `UPDATE … SET status = <expired> WHERE <open status> AND expires_at <= now AND <user condition> RETURNING …` and, in the same transaction, the audit row, the existing queued email and the notification insert for **every** recipient of that expiry (`notify(tx, …)` with the same event-based `dedupe_key` as the shared sweep and `ON CONFLICT DO NOTHING`). Under the database's default isolation (read committed), a second statement touching the same row waits for the first to commit, re-checks the open status and returns nothing. So two concurrent refreshes of the same user, both parties refreshing at once, or a refresh racing the shared sweep or a business page's own expiry call, produce **exactly one** status transition and **exactly one** notification per recipient (and at most one queued email per existing key). A failure rolls back the transition and the notifications together, so a record is never expired without its notifications (AC-32, AC-73).

**The other party.** When the check expires a record, the notifications for **every** recipient listed in §3 — including the other party (for example both sides of a rate proposal) — are created in that same transaction, by the same rule as the shared sweep. Recipients' notifications are therefore the same whoever triggered the transition; the other party sees theirs at their next bell refresh.

**Efficient.** It is bounded to the user's own rows and uses indexed predicates on the owner or recipient id: `teacher_enquiries (teacher_id, status, …)` and `(parent_id, status, …)`; `rate_negotiations (teacher_id, …)` and `(parent_id, …)`; `teacher_student_links (teacher_id, requested_at) WHERE status = 'requested'`. When nothing has expired (the usual case) the three statements change no row and write nothing. Implementation note (not a migration now): the parent side of link requests has no index on `created_by_parent_id`; a partial index such as `(created_by_parent_id, expires_at) WHERE status = 'requested'` would be added with migration 0026 once implementation is approved, and adding `expires_at` to the existing owner indexes may be considered if volumes grow. No new table, service, scheduler or cost.

**After the check.** The same refresh response returns the unread count (including any notification just created for this user) and the menu badges (unchanged by the check, §4.2) (AC-74).

## 8. Security summary (N-3, N-6)

- Every list, count, mark-read, open and "Show older" request checks the signed-in session on the server; without a session → sign-in; the request only ever touches the session user's rows.
- A notification id or "Show older" position that is not the user's own gives exactly the same result as one that does not exist ("not found", nothing changed, no extra data) — no way to discover other users' notifications.
- A notification's link is only a path and **never grants access** (D-8). Opening goes through one server-side "open notification" step that re-checks, against current status and permissions, whether the user may still see the linked record; the destination page also applies its own permission checks exactly as today. If access has ended (guardian relationship ended, teacher–child link removed, resource unshared, account deactivated or any other permission revoked), the user sees "This is no longer available to you." and nothing about the record — no title, contents, names or identifiers, in the page, the browser address or any response — and the notification is marked read (the bell number drops by one if it was unread).
- A teacher awaiting approval: every notification and destination enforces the teacher's current approval status on the server; nothing bypasses approval. The existing approval workflow and status records are the source of truth (D-5).
- Notifications are created only by server code at business events — never from browser input.
- Public pages never load notification data (assumption 2).

### 8.1 Notifications the user may no longer see (v0.6; Q-4 decided — OC-117)

- **Kept:** the notification row stays stored; retention (§9) removes it on its usual clock. Nothing is deleted when access changes.
- **Checked at display time:** each time the panel, sheet or page lists rows (and on "Show older"), the server runs, for each row shown, the same access check as the "open notification" step (§8) against the current status and permissions.
- **Redacted in the list:** a row that fails the check is returned as title **"Notification no longer available"**, with no message, a neutral icon, no action label, no link and no record type or identifier. Only the date and time, the unread state and the row's own id (needed for "Mark as read") are kept. The original title, message, link and record details are never sent to the browser for that row.
- **Opening it** shows only "This is no longer available to you." and marks it read (D-8, §8); the check is repeated at open time, so access removed after the list was shown is still caught.
- **Unread redacted rows** still count in the bell number until marked read or opened (N-2: badges are unaffected).
- **Access restored** (for example, a resource shared again): the next list shows the row normally again, because the check is made each time.
- Applies to all roles and to each D-8 cause. A not-approved teacher has no bell (Q-2); a suspended or deactivated account cannot sign in.

## 9. Retention (N-9)

- Read notifications are removed **90 days after they were read**; unread ones **180 days after creation** (D-3). Same rules for parent, teacher and student.
- **Clocks (v0.5):** the read clock starts at `read_at` (the first time the notification was read — opened, marked read or included in "Mark all"; never moved later). The unread clock starts at `created_at`. Both are absolute instants (`timestamptz`), so time zones and daylight-saving changes don't matter.
- **"After 90 / 180 days"** means a fixed duration of exactly 90 × 24 hours (or 180 × 24 hours) from that timestamp. A notification becomes **eligible** for removal when `now ≥ read_at + 90 days` (read) or `now ≥ created_at + 180 days` while `read_at` is still empty (unread). It is removed by the first clean-up run that starts at or after that moment; before that it stays visible.
- A notification read late keeps its new clock: for example, one read on day 170 after creation is eligible 90 days after that reading (day 260), not on day 180.
- Removing a notification never deletes, hides, changes or resolves the underlying enquiry, rate proposal, link request, assignment, worksheet or booking; those keep their own status and pages, and menu badges keep counting them.
- Clean-up runs as part of normal signed-in requests (page loads and bell refreshes), **at most once an hour** across all server instances (stored last-run time and a database lock, §13.2 (4)); the limits are met at the next eligible activity, not at the exact minute. Concurrent requests cannot run it unsafely or twice. No scheduled job, storage service, paid service or new infrastructure (D-9).

## 10. Acceptance checks (for final approval)

These checks **await the owner's final approval.** Checks changed in v0.4 name the decision in brackets; checks changed or added in v0.5 are marked **(v0.5)** and listed in §14 with their old text; checks changed or added in v0.6 are marked **(v0.6)** and listed in §16 with their old text; checks changed or added in v0.7 are marked **(v0.7)** and listed in §17 with their old text. Planned test files, test names and results for every check are in §18.2.

Types: **P** positive · **N** negative / authorisation · **D** duplicate / reliability · **E** error / state · **M** phone / layout · **A** accessibility · **R** review. Levels: **DB** database test · **BR** browser test with real (synthetic) accounts · **U** component test · **review** document or code review.

### Bell, panel and page (N-5, N-11)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-1 **(v0.6)** | The bell is shown on every signed-in parent, teacher and student page, including the status and profile pages of a teacher awaiting approval (D-5); it is not shown to a not-approved teacher (Q-2, AC-68). | N-5 | P | BR |
| AC-2 | The bell number equals that user's unread notifications; shows 1–9 then "9+"; hidden at 0. | N-5 | P | DB + BR |
| AC-3 **(v0.5)** | Opening the panel lists, newest first (`created_at`, then `id`, descending): parent and teacher — the latest 10; student sheet — the latest 20 (D-7). Tested with 25 notifications: parent / teacher see exactly items 1–10, the student exactly items 1–20, and the 21st is not shown. Each row shows title, one-line message, relative time **and** full date and time in the account's time zone (`accounts.time_zone`), kind icon and an unread dot. | N-5 | P | BR |
| AC-4 | Opening the panel does not mark anything as read. | N-5 | P | BR |
| AC-5 | Clicking a row marks only that row read and opens its page (through the server-side open step, §8). | N-5 | P | BR |
| AC-6 | "Mark as read" on one unread row, in the panel or on the full page, marks only that notification read; the user stays on the same screen; the bell number drops at once; menu badges are unchanged (D-2). | N-5 | P | BR |
| AC-7 | "Mark all as read" marks all of that user's notifications read; the bell shows no number; menu badges are unchanged (D-2). | N-5 | P | DB + BR |
| AC-8 **(v0.5, v0.6)** | The parent and teacher Notifications pages show 20 at a time, newest first; "Show older" loads the next 20 of the active filter and is hidden when none are older; the Unread chip shows only unread and its (n) equals the bell number; All shows all (D-7, §6.2). (v0.6) Under the Unread chip, a row marked read stays in place, shown as read, until the filter changes or the page reloads; after either, it is gone from the Unread list (C-4). | N-5 | P | BR |
| AC-9 | The panel and page use the approved design (tinted header, chip filters, responsive desktop, phone bottom sheet) and match the rest of the app. | N-11 | P | BR (screenshot review) |
| AC-63 **(v0.5, v0.6)** | Paging is stable (keyset, C-2 accepted): with 45 notifications, two "Show older" loads return items 21–40 and 41–45 with no repeat and no gap, also when 3 new notifications arrive between loads and when several share the same `created_at`; the panel never offers "Show older"; the student has no "Show older", no "See all" and no page (§6.2). | N-5 | P | DB + BR |

### Action badges (N-2)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-10 | Teacher **Students** badge: +1 on a new link request; −1 on accept, decline, parent withdrawal or expiry. | N-2 | P | DB + BR |
| AC-11 | Teacher **Enquiries** badge: +1 new enquiry; −1 answered / withdrawn / expired; rate proposal: +1 when the turn passes to the teacher, −1 when the teacher answers or counters. | N-2 | P | DB |
| AC-12 | Teacher **Looking for students** badge: present while the listing ends within 7 days / has ended or a package needs details; cleared by renewing or completing / withdrawing the package. | N-2 | P | DB |
| AC-13 | Parent **My enquiries** badge: +1 on a teacher counter-offer; −1 on the parent's answer, counter, withdrawal or expiry. | N-2 | P | DB |
| AC-14 | Reading the matching notification (one or all) leaves every menu badge unchanged. | N-2 | N | DB + BR |
| AC-15 | Completing the action clears the badge even if the notification was never read. | N-2 | P | DB |
| AC-16 | A past-expiry item is not counted even before the lazy expiry has run. | N-2 | P | DB |
| AC-64 **(v0.5)** | Each badge equals its §4.1 definition exactly: a DB test seeds, for one user, records in every status (including link requests held in `pending`, open items with `expires_at ≤ now` not yet swept, rate proposals whose turn is the other side's) plus the same records for a second user, and the badge counts only the first user's qualifying records; "Looking for students" is never above 2; a teacher awaiting approval or not approved, a student, a Super Admin and an Admin have no badges; deleting every notification leaves every badge unchanged. | N-2, N-3 | P / N | DB |

### Role and data scope (N-1, N-3, N-8)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-17 **(v0.6)** | Each event in §3 (including the v0.6 teacher-decision and profile-change rows) creates exactly one notification for each recipient listed and for nobody else; the person who acted is not notified (assumption 1); the "not approved" decision creates none (Q-2). | N-1 | P / N | DB |
| AC-18 **(v0.5)** | No teacher notification contains a child's name or id (grade, curriculum, parent's first name only) — checked in the stored title, message and link, and in the panel, page and network responses, for teachers with and without a teacher–child link to that child. | N-1, N-3 | N | DB + BR |
| AC-19 | A student only receives learning updates — never prices, rate proposals, enquiries or parent details. | N-1 | N | DB |
| AC-20 | A parent never receives a notification about another family's child; after a guardian link is revoked, no new notifications about that child. | N-1, N-3 | N | DB |
| AC-21 | A worksheet shared with a child creates one student notification and one for **each active parent** of that child. | N-8 | P | DB |
| AC-22 | A worksheet shared with several children: each notification names only that child's own item; no other student's name or count appears. | N-8 | N | DB |
| AC-23 | Reading a worksheet notification never marks the homework or resource as done. | N-8, N-2 | N | DB + BR |
| AC-46 **(v0.6)** | A teacher awaiting approval (`draft`, `submitted` or `changes_requested`, §0) sees the bell on /teacher/status and /teacher/profile and receives only approval-status and profile notifications: no enquiry, rate proposal, link request, listing or student notification is created for them or listed to them before approval; opening any notification re-checks their current approval status on the server (D-5). | N-1, N-3 | N | DB + BR |
| AC-47 | Super Admin and Admin pages show no bell and make no notification requests; the Super Admin home counts and the approval workflows are unchanged (D-6). | N-1 | N | BR + existing suites |
| AC-48 **(v0.5, v0.6)** | The parent "Notifications" menu item and the parent home button, now labelled "Notifications" (Q-5), open the full Notifications page (the placeholder is gone); a teacher reaches the full page only from "See all" (teacher menu unchanged); a student has no "See all", no "Show older" and no full page (the student URL for a full page, if tried, shows nothing more than today), and the student sheet uses simple wording with no commercial or parent-specific information and no action labels (D-7). | N-5, N-1 | P / N | BR |
| AC-53 **(v0.5)** | Public pages show no bell, make no notification requests, and contain no notification data in their HTML (assumption 2). | N-3 | N | BR |

### Security (N-3, N-6)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-24 | List, count and page return only the signed-in user's notifications; signed-out requests go to sign-in. | N-3 | N | DB + BR |
| AC-25 | Marking another user's notification (by id) returns "not found" and changes nothing; "Mark all" affects only the signed-in user. | N-3 | N | DB |
| AC-26 | A notification link can only be an internal path; anything else is refused when created. | N-3 | N | DB |
| AC-27 **(v0.5, v0.6)** | Access ended (D-8). For **each** of the five causes — (1) guardian relationship ended, (2) teacher–child link removed, (3) resource unshared, (4) account deactivated, (5) another permission revoked (for example, a teacher's approval suspended or sent back for changes) — seed an **unread** notification whose record the user can open, then remove access, then open the notification. Assert: (a) the screen shows exactly "This is no longer available to you." and no other content about the record; (b) the page HTML, the browser address and every network response contain no title, contents, names or identifiers of the record; (c) the notification's `read_at` is set; (d) the bell number in that response is exactly one lower; (e) menu badges are unchanged; (f) the server re-checked access at the time of opening (removing access after the list was shown still gives the message) and the destination page was not rendered. Repeat with an already-read notification: same message, `read_at` unchanged. (v0.6) Before opening, the list shows that row redacted as in AC-67 (Q-4). Where the existing destination rules keep a record visible after a cause, the test asserts the record still opens and is listed normally (no false message, no false redaction). Cause (5) is tested with a profile change and with a guardian or link removal; a suspended or deactivated account cannot sign in and is checked by sign-in refusal. | N-6, N-3 | N | BR + DB |
| AC-28 | Opening an authorised notification lands on the right record / page. | N-6 | P | BR |
| AC-49 | A notification never grants access: the destination re-checks permission on the server, and changing the link or record id in the browser shows nothing more than the same page shows today without a notification (D-8). | N-6, N-3 | N | BR + DB |
| AC-59 **(v0.5)** | No cross-account leakage by id: opening, marking read or paging ("Show older" position) with another user's notification id gives the same response as a non-existent id and changes nothing; list, count and badge responses contain only the signed-in user's data; across a parent, a second parent, a linked teacher, an unlinked teacher and a student, no response names another family's child. | N-3 | N | DB + BR |

### Reliable triggers (N-4)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-29 | The same event processed twice (retry, double click, two tabs) creates one notification. | N-4 | D | DB |
| AC-30 **(v0.6, v0.7)** | An expiry processed twice, including by two concurrent requests (a business page's own expiry call and the shared sweep, two shared sweeps forced past the throttle, and (v0.7) the user-scoped check racing the shared sweep — detailed in AC-73), creates one notification per side (D-4, §7.5, §7.6). | N-4 | D | DB |
| AC-31 **(v0.5)** | Each action notification's label follows its current business record exactly as in §6.1 — one test case for each cell of that table: enquiry (pending; accepted; declined; withdrawn; expired; pending past `expires_at`), link request (requested; accepted; accepted then link ended; declined; withdrawn; expired; requested past `expires_at`), rate proposal offer *n* for each side (current offer awaiting X; X accepted; X declined; X countered; withdrawn by either side; expired; open past `expires_at`), learning package (needs details; completed; withdrawn; pricing model v2 off). For each, the label is the same whether the notification is read or unread; update and reminder notifications and the student sheet show no label (D-1). | N-4 | P | DB + BR |
| AC-32 | An event that fails and rolls back creates no notification (same transaction). | N-4 | D | DB |
| AC-33 | A listing reminder is not created again for the same listing period; renewing starts a new period. | N-4 | D | DB |
| AC-43 | When an action resolves, its notification's read status is unchanged (not marked read automatically); reading or marking a notification read never changes the business record, the action label or the action (D-1). | N-4, N-2 | N | DB + BR |
| AC-44 **(v0.6, v0.7)** | Expiry timing for an active user (D-4; B-1 option C, §7.2, §7.6). A bell refresh or signed-in page load triggers the shared sweep, which runs only when the throttle allows (§7.5); every bell refresh also runs the user-scoped check before counting. With the browser clock controlled and the shared sweep held inside its minute (stored `last_sweep_at` set to the expiry time *E*, so no shared sweep may run), an enquiry, a link request and a rate proposal of the active user each pass `expires_at` at *E*; with no page load and no scheduled job, the expiry notification is in that user's bell number and list **at most 65 s after *E*** (60 s refresh interval plus 5 s for that one refresh request to complete), shown by the first refresh at or after *E*; the shared sweep did not run in that time. Repeated for a parent and a teacher, and with the refresh just before *E* (worst case) and just after *E*. | N-4, N-7 | P | DB + BR |
| AC-45 | Expiry durations and rules are unchanged (enquiries, rate proposals, link requests: 14 days); the existing expiry tests pass unchanged (D-4). | N-4 | P | DB |
| AC-51 | No lesson reminder, cancellation or rescheduling notification, placeholder notification or simulated booking is created in CR-16 (D-10). | N-4 | N | DB + review |
| AC-52 **(v0.6)** | For each §3 event that already queues an email (including `teacher_profile_change_approved` / `_declined` and the time-based keys `link_request:`, `teacher_decision:`, `teacher_profile_change:`, Q-7), the email is queued exactly as before (same template, recipient, payload and de-duplication key) and the in-app notification is created independently; a retry creates no second notification; no email leaves the queue and nothing in the app says an email was sent or delivered; no WhatsApp message is attempted (D-11). | N-4 | D | DB |
| AC-54 | The CR-15 "Finish your learning package" banner shows on the teacher dashboard while the package needs details, whether or not its notification has been read, and clears only when the package is completed or withdrawn (assumption 3). | N-2 | P | DB + BR |
| AC-57 **(v0.5)** | Listing reminder (§7.3): one run of the reminder sweep for a due listing creates, in one transaction, exactly one reminder notification for its teacher **and** the existing `listing_expiry_reminder` email with its unchanged key; two concurrent sweeps create one of each; none is created for a paused, withdrawn or ended listing, for a listing more than 7 days from its end, or for a teacher who is inactive or not approved; after renewal, the next period gets exactly one new reminder; a failure inside the transaction creates neither. | N-4 | D | DB |
| AC-58 **(v0.5, v0.6, v0.7)** | Listing reminder timing (§7.3, Q-6 option B): the reminder is created by the first reminder sweep that runs at or after `expires_at − 7 days` (and before `expires_at`) — triggered by a /teacher/listing page load (unthrottled, as today) or by any bell refresh or signed-in page load through the shared sweep; a first sweep on day 6 of the window still creates it (catch-up); with 101 due listings, the 101st is created by the next run; when the listing's teacher has made no request in that time, the reminder is in their bell at their next sign-in; (v0.7, B-2 decided) if no sweep runs before `expires_at`, no reminder notification and no `listing_expiry_reminder` email is created for that period — neither then nor by any later sweep after the listing has expired — and the "Looking for students" badge still shows renewal due; the user-scoped check never creates a reminder. | N-4, N-7 | P | DB + BR |

### Refresh (N-7)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-34 | While the tab is visible, a new notification appears in the bell number within 60 s without reloading. | N-7 | P | BR |
| AC-35 | While the tab is hidden, no notification requests are made; one check runs when it becomes visible. | N-7 | N | BR |
| AC-55 **(v0.5)** | Immediate after the user's own action, with the browser clock frozen so no 60-second refresh can run: (a) "Mark as read" and "Mark all as read" change the bell number in the same tab with no reload; (b) after each business action in §7.1 — teacher answers an enquiry, accepts and declines a link request, answers and counters a rate proposal, renews the listing, completes the package; parent answers, counters and withdraws a rate proposal — the response that completes the action shows the affected menu badge already lowered (or raised) and the related action label already updated; (c) opening a notification shows the lowered bell number on the next page. | N-7, N-2 | P | BR |
| AC-56 **(v0.5, v0.6)** | The 60-second refresh returns the bell number and the user's menu badges in the same response (C-1 accepted); a change made in another tab of the same user (for example, answering an enquiry) appears in this tab's bell and badges within 60 s while it is visible, with no reload (C-1). | N-7 | P | BR |

### Retention (N-9)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-36 **(v0.5)** | With a controlled `now`: a read notification is kept at `read_at + 90 days − 1 second` and removed by the next clean-up run at or after `read_at + 90 days`; an unread one is kept at `created_at + 180 days − 1 second` and removed by the next clean-up run at or after `created_at + 180 days`; newer ones stay; same for parent, teacher and student (D-3, D-9, §9). | N-9 | P | DB |
| AC-37 | Removing notifications never deletes, hides, changes or resolves the underlying records; menu badges are unchanged by retention (D-3). | N-9 | N | DB |
| AC-50 | Clean-up runs during normal requests at most once an hour; two concurrent requests run it at most once; no scheduled job is added (D-9). | N-9 | D | DB |
| AC-62 **(v0.5)** | `read_at` is set once: marking an already-read notification read again, "Mark all", or opening it does not move `read_at`; an unread notification read on day 170 after creation is kept on day 180 and becomes eligible at `read_at + 90 days`; time zone of the account has no effect on eligibility. | N-9 | P | DB |

### States, phone and accessibility (N-11)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-38 | Loading shows skeleton rows; empty shows "You're all caught up"; the student empty state is child-friendly. | N-11 | E | U + BR |
| AC-39 | If notifications fail to load: bell without a number, panel message with Try again; the page and menu badges still work. | N-11 | E | U + BR |
| AC-40 **(v0.5, v0.6)** | Phone (390 px): the panel is a bottom sheet; no sideways scrolling; every control (bell, rows, Mark as read, Mark all, chips, Show older, close) is at least 48 × 48 px with at least 8 px between targets (AX-04; replaces 44 px; C-3 accepted). | N-11 | M | BR |
| AC-41 **(v0.5)** | Keyboard: Enter / Space opens the bell; Tab moves through rows and controls in visual order; Esc closes and returns focus to the bell; the phone sheet is a dialog that keeps focus inside while open (AX-08); every control shows the approved visible focus ring; bell named "Notifications, N unread"; badges read "N waiting for you"; no serious or critical axe issues on the panel, sheet and page. | N-11 | A | BR |
| AC-42 | Existing dashboards, enquiries, rate proposals, homework and listing pages behave exactly as before (full existing suites pass). | N-11 | P | all |
| AC-60 **(v0.5)** | Errors without partial updates (§7.4): offline shows the existing offline banner, keeps the last bell number, shows no repeated errors and checks once on reconnect; a failed "Mark as read" leaves the row unread, restores the bell number and offers retry, which then succeeds; a failed "Mark all" changes no row; a failed "Show older" keeps the shown rows and offers Try again; a failed open leaves the notification unread; no error message names a record, child or other user. | N-11, N-5 | E | U + BR + DB |
| AC-61 **(v0.5)** | Screen readers and visual access: a change of the bell number after a refresh or own action is announced once through a polite live region (not on first page load, at most once per refresh, AX-10); decorative icons are hidden from screen readers and icon-only buttons are named (AX-06); unread state and action labels are given in text, not by colour alone (AX-07); text meets 4.5:1 and badges, dots and focus rings 3:1, with the amber badge using `#684000` on `#fea619` (AX-01, AX-02); with reduced motion requested, the panel and sheet open without animation and the badge does not animate (AX-13); text is at least 12 px (AX-03). | N-11 | A | U + BR |

### Testing and traceability (N-10)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-65 **(v0.5, v0.6, v0.7)** | Every check AC-1 to AC-75 names at least one requirement, a type and a level; every requirement N-1 to N-11 is verified by at least one check (§15); positive, negative-authorisation, duplicate, error, phone and accessibility types are each present. | N-10 | R | review |
| AC-66 **(v0.5)** | The build report lists, for each check, the test file(s) and test name(s) that verify it and the result of the run; a check without a passing test is reported as not met, never as passed. | N-10 | R | review |

### Owner resolutions (v0.6, OC-117)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-67 **(v0.6)** | Redacted list display (Q-4, §8.1): for each D-8 cause, after access is removed the panel, sheet, page and "Show older" responses list the row with title exactly "Notification no longer available", no message, no action label, no link, no record type or identifier, and only its date and time, unread state and own id; the HTML and every network response contain none of the original title, message, link or names; the row keeps its place in order and paging; an unread redacted row still counts in the bell; when access is restored the next list shows it normally; the row is still stored. | N-6, N-3 | N | DB + BR |
| AC-68 **(v0.6)** | Not-approved teacher (Q-2): on /teacher/status the "Your profile was not approved" message and no menu are shown exactly as today; no bell is shown and no notification request is made; /teacher/profile and every other teacher page still redirect as today; rejecting a teacher creates no notification for them and queues `teacher_not_approved` exactly as today; a notification created while they were awaiting approval is never displayed; no marketplace or student notification is ever created for them. | N-1, N-3 | N | DB + BR |
| AC-69 **(v0.6)** | Profile-change decisions (Q-3): `decideProfileChange` with `approve` and with `decline` each creates exactly one notification for that teacher, in the same transaction as the existing email, opening /teacher/profile; a second call for the same change (already decided) creates none; a failed decision creates neither; the approver is not notified; no other profile edit creates a notification. | N-1, N-4 | P / D | DB |
| AC-70 **(v0.6)** | Parent home button (Q-5): the button reads "Notifications" (not "Notification settings"), opens the Notifications page and keeps the email and WhatsApp status chips beside it unchanged; no notification-preference control appears anywhere in the app. | N-5, N-11 | P | BR |
| AC-71 **(v0.6, v0.7)** | Shared sweep throttle (Q-8, §7.5), with a controlled database clock and two or more real parallel connections: (a) many concurrent triggers within one minute run the sweep exactly once; (b) a trigger 60 s or more after the last run runs it again; (c) a trigger inside the minute does not run it and returns counts without waiting; (d) a claimed run that fails is caught up by the next run, and due items from a minute with no traffic are processed by the next run (none skipped); (e) no record changes twice and no notification or email is duplicated when the shared sweep overlaps a business page's own expiry call; (f) existing business-page and action expiry calls and the /teacher/listing reminder call still run unthrottled; (g) badges and action labels are correct while no sweep has run (`expires_at` passed, status not yet changed); (h) (v0.7) user-scoped checks (§7.6) on many refreshes within the minute neither read nor move `last_sweep_at`, and the shared sweep still runs exactly once in that minute. | N-4, N-7, N-2 | D / P | DB |

### User-scoped expiry check (v0.7, B-1 option C, OC-118)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-72 **(v0.7)** | Scope and authorisation (§7.6): a DB test seeds past-expiry open enquiries, link requests and rate proposals for the viewer (as teacher, and as parent on both sides of a record) and for two other users, plus a link request for a child whose guardian link with the viewer has ended. After one user-scoped check for the viewer: only records where the viewer is a party and still authorised are expired; every other user's records, and the ended-guardian child's request, are unchanged (left to the shared sweep); a record id or user id sent in the refresh request (body, query or URL) is ignored and changes nothing; a student's and an awaiting-approval teacher's refresh runs no expiry statement; no listing reminder or clean-up is run by the check; expiry statuses, durations, audit entries and existing email templates, recipients, payloads and keys are exactly those of the existing functions. | N-3, N-4 | N / P | DB |
| AC-73 **(v0.7)** | Concurrency and idempotency (§7.6), with two or more real parallel connections: (a) two concurrent refreshes of the same user; (b) teacher and parent refreshing at the same moment for the same expired rate proposal and the same expired enquiry; (c) a user-scoped check racing the shared sweep; (d) a user-scoped check racing a business page's own expiry call. In each case each record has **exactly one** status transition, **exactly one** notification per recipient (including the other party, created in the same transaction whoever triggered it), at most one queued email per existing key and one audit row; a failure injected after the `UPDATE` rolls back the transition, the notifications and the email together, and the next check or sweep then expires the record with its notifications. | N-4 | D | DB |
| AC-74 **(v0.7)** | Counts after the check (§7.2, §7.6): the refresh response that ran the check returns an unread count that already includes the notification just created for the viewer, and menu badges equal their §4.1 values (the same before and after the check); the other party's bell number is correct at their next refresh without any sweep of their own; the related action labels show "No longer needed" (§6.1); when nothing has expired, the counts are unchanged and no row is written. | N-2, N-5, N-7 | P | DB + BR |
| AC-75 **(v0.7)** | Efficiency (§7.6): a review of the build shows that each user-scoped statement filters by the viewer's id on an indexed column (`EXPLAIN` on a seeded database with other users' rows shows an index scan on the owner or recipient index for each of the three tables, with the parent-side link-request index added in migration 0026 when implementation is approved), touches only the viewer's rows, and adds no table, service, scheduler or stored throttle row; with nothing expired the check writes no row. | N-4, N-7 | R / P | DB + review |

### Owner decisions (v0.8, OC-121)

| Check | Statement | Req | Type | Level |
|---|---|---|---|---|
| AC-76 **(v0.8)** | Unanswered enquiry expiry (OC-121 (4)): when a pending enquiry passes `expires_at`, its status becomes `expired` and exactly one `enquiry_expired` notification is created, for the parent who raised it; the teacher receives none; repeated or concurrent sweeps and user-scoped checks create no second notification. | N-1, N-4 | P / D | DB |
| AC-77 **(v0.8)** | Sample-data preview (OC-121 (1)): with the sample-data mode on, no bell, notification panel or menu badge is shown on any parent, teacher or student page, and no notification request is made; the actual application's behaviour is unchanged. | N-11 | N | BR |
| AC-78 **(v0.8)** | Teachers awaiting approval and restricted teachers (OC-121 (2)): a teacher awaiting approval sees the bell only on the status and profile pages, with approval-status and profile notifications only, no "See all" link, and /teacher/notifications sends them to /teacher/status; a not-approved or otherwise restricted teacher sees no bell and makes no notification request. Checked on the server, not only hidden in the page. | N-1, N-3 | N | BR + DB |

Numbering note: AC-55 to AC-66 are new in v0.5, AC-67 to AC-71 in v0.6 and AC-72 to AC-75 in v0.7; existing numbers are not changed so earlier references stay valid.

## 11. Decisions (resolved, OC-115) and assumptions

Each decision below was accepted by the owner on 19 Oct 2026, 23:51 IST (OC-115). The v0.3 proposal is kept under "Proposed in v0.3" as history. v0.5, v0.6 and v0.7 change no decision; v0.7 records how D-4 is met under the Q-8 throttle (B-1 option C, OC-118).

**D-1 — Stale action notifications.** **Decided (owner, 19 Oct 2026, OC-115).** Keep the original notification as history. When its underlying action is completed, answered, withdrawn, expired, renewed or otherwise resolved, its action label updates dynamically: "Needs your reply" only while the action genuinely requires the recipient's response; "Done" when completed; "No longer needed" when expired, withdrawn or otherwise no longer requiring a response. The label comes from the current business record, not from read status. Resolving the action does not mark the notification read, and reading never completes or changes the business action.
*Proposed in v0.3:* Keep the notification in the list as history; replace "Needs your reply" with "Done" / "No longer needed", worked out live from the record. Its read state is unchanged. *Alternative:* mark it read automatically. (Why it mattered: N-4 asks for no stale reminders.)

**D-2 — Mark one notification as read.** **Decided (owner, 19 Oct 2026, OC-115).** A separate "Mark as read" control on each unread notification, in the panel and on the full page. It affects only that notification and the user stays on the screen. Opening a row may mark it read and navigate. Opening the panel alone must not mark anything read. "Mark all as read" affects only the signed-in user's notifications. The bell unread count updates. Menu action badges are unchanged unless the business action changes.
*Proposed in v0.3:* Add a small "Mark as read" control on each unread row (panel and page). (Why it mattered: N-5 asks for marking individual notifications; v0.2 only marked on click.)

**D-3 — Retention.** **Decided (owner, 19 Oct 2026, OC-115).** Read notifications: 90 days after being marked read. Unread: 180 days after creation. After that they may be removed through the approved clean-up mechanism (D-9). Retention never deletes, hides, modifies or resolves business records (enquiry, proposal, teacher-link request, assignment, worksheet, booking …). Badges are computed from business records independently of notifications. The same rules apply to parent, teacher and student. No storage or paid clean-up service.
*Proposed in v0.3:* Confirm 180 days for unread (or choose another period). Read: 90 days (confirmed). (Why it mattered: 180 days was proposed in OC-106 (6), "subject to review".)

**D-4 — When "expired" notifications appear.** **Decided (owner, 19 Oct 2026, OC-115).** Run the existing expiry checks when the bell / count refreshes, as well as on business pages, so expiry notifications appear within about 60 seconds while a user is active. No paid service and no new scheduled-job infrastructure. Expiry durations and rules (enquiries, rate proposals, teacher-link requests) do not change. Badges exclude items whose expiry time has passed even if the lazy expiry hasn't run. Expiry processing and notification creation are idempotent (no duplicates). If no user is active, the notification is created on the next appropriate request.
*How it is met (v0.7, B-1 option C — OC-118):* the shared sweep runs at most once a minute (Q-8, §7.5) and every bell refresh also runs the user-scoped expiry check over the signed-in user's own authorised records (§7.6), so an active user sees an expiry notification within about 60 seconds (AC-44: at most 65 s); a user who is not active gets it on the next appropriate request (§7.2). D-4's text is unchanged.
*Proposed in v0.3:* Also run the expiry check when the bell count is refreshed, so it appears within about a minute of anyone being active; no scheduled job (₹0). *Alternative:* a free daily scheduled job on the hosting plan — a new scheduled component, needing approval. (Why it mattered: expiries run lazily, so an expiry notification can arrive later than the deadline; badges are still correct, AC-16.)

**D-5 — Teachers awaiting approval.** **Decided (owner, 19 Oct 2026, OC-115).** Show the bell on the signed-in teacher pages available to teachers awaiting approval, with content restricted to profile and approval-status updates. No marketplace, enquiry, proposal or student notifications before the teacher is authorised. Every notification and destination enforces current status and permissions on the server; nothing bypasses approval. The existing approval workflow and status records are the source of truth.
*Proposed in v0.3:* Show the bell on those pages with approval notifications only. (Why it mattered: they can only open their status and profile pages.)

**D-6 — Super Admin / Admin.** **Decided (owner, 19 Oct 2026, OC-115).** No bell and no admin notification workflow under CR-16. The existing admin dashboard counts and approval workflows stay unchanged and are not replaced. Any admin notifications would be a future, separately approved change.
*Proposed in v0.3:* No bell for admins in CR-16 (e.g. "new teacher waiting for approval" stays on the admin home counts). (Why it mattered: not in the original brief.)

**D-7 — Full Notifications page.** **Decided (owner, 19 Oct 2026, OC-115).** Parent: the full page replaces the existing Notifications placeholder. Teacher: full page reached from "See all" in the panel; no new menu item. Student: panel / bottom sheet with the latest 20 only; no full page in this change. Teacher and parent pages support All and Unread chip filters, pagination and "Show older". The student view is child-friendly, in simple language, with no commercial or parent-specific information. Approved signed-in design (tinted card headers, chip filters). Business logic and permissions preserved.
*Proposed in v0.3:* Teacher: full page reached from "See all" (no new menu item). Student: panel / sheet only, latest 20. (Why it mattered: the boards show "See all" for teachers; the menu item exists only for parents.)

**D-8 — Navigation after access ends.** **Decided (owner, 19 Oct 2026, OC-115).** If the user no longer has permission for the linked record, show the neutral message "This is no longer available to you." and mark the notification read. Do not reveal the title, contents, names, identifiers or other private information. Access is re-checked server-side on the destination page; a notification never grants access. Applies when a guardian relationship has ended, a teacher-child link is removed, a resource is unshared, an account is deactivated or another permission is revoked. Existing destination security checks are kept.
*Proposed in v0.3:* Destination pages keep their own checks; when the record is no longer available, show "This is no longer available to you" and mark the notification read. (Why it mattered: N-6.)

**D-9 — Clean-up timing.** **Decided (owner, 19 Oct 2026, OC-115).** Clean-up runs during normal application requests, at most once an hour, with no scheduled job or new infrastructure. It enforces the 90 / 180-day limits and may happen at the next eligible activity. Concurrent requests cannot cause unsafe or repeated clean-up. No change to business records or action counts. No paid services, infrastructure or expenditure.
*Proposed in v0.3:* Clean-up runs during normal requests, at most once an hour; the 90 / 180-day limits are met at the next activity, not at the exact minute. (Why it mattered: no scheduled jobs exist — ₹0, no new infrastructure.)

**D-10 — Lesson reminders, cancellations and rescheduling.** **Decided (owner, 19 Oct 2026, OC-115): out of scope for CR-16**, because the booking workflow is not available. They are added when the booking and scheduling phases are built, reusing the CR-16 principles (recipient permissions, de-duplication, privacy, read status, badge separation). The 15-minute reminder requirement is kept for the future lesson workflow. No placeholder notifications or simulated bookings. No change to the scheduling requirements and no new reminder service under CR-16.
*Proposed in v0.3:* Out of scope now — no bookings exist; added with booking (Phase 3 / Phase 5) under the same rules. Confirm. (Why it mattered: named in N-4 and the master project instruction.)

**D-11 — In-app notification and queued email.** **Decided (owner, 19 Oct 2026, OC-115).** Separate channels. For each applicable event: one in-app notification per authorised recipient, and the existing email-queue behaviour maintained independently. De-duplication per channel, so retries create no duplicate notifications or queued emails. No emails are sent in CR-16: `email_outbox` stays queued-only until an email provider and its cost, privacy, security and delivery requirements are approved. No WhatsApp, external messaging, paid services or new infrastructure. A queued email is not proof of delivery.
*Proposed in v0.3:* In-app notification and queued email are independent; one of each per event. No email is sent until a provider is approved. (Why it mattered: emails are queued for the same events.)

**Assumptions — accepted (owner, 19 Oct 2026, OC-115):**
1. One in-app notification per authorised recipient per business event. — **Accepted.**
2. Notifications never appear on public pages. — **Accepted.**
3. The CR-15 "Finish your learning package" banner remains alongside its related notification. — **Accepted.**
4. Notification wording is English only for this release. — **Accepted.**

(The decision texts above are quoted as recorded in OC-115 and keep their original wording, including "teacher-link request" and "teacher-child link"; in this document those terms mean **link request** and **teacher–child link**, §0.)

## 12. Changes from v0.3 to v0.4 (history)

| ID | Before (v0.3) | After (v0.4) | Reason |
|---|---|---|---|
| Status | Open decisions in §11, not resolved | Decisions resolved; N and AC still await final approval; implementation not authorised | OC-115 |
| §1 Expiry | Link requests and rate proposals expire lazily | Enquiries too (`expireEnquiries`, 14 days) — correction from code inspection | Accuracy (D-4) |
| N-1 | Role and relationship only | + awaiting-approval teachers get approval and profile notifications only; no admin notifications | D-5, D-6 |
| N-4 | "One notification per event … no stale reminders; cancellation, rescheduling … handled" | One per authorised recipient per event; action label follows the record; lesson reminders, cancellations, rescheduling out of scope | Assumption 1, D-1, D-10 |
| N-5 | "mark one or all as read" | Mark one without leaving the screen, or all | D-2 |
| N-6 | Open only when still authorised | + neutral message otherwise; a notification never grants access | D-8 |
| N-7 | 60-s refresh; immediate after own actions | + "Mark as read" updates the bell at once; each refresh runs the existing expiry checks | D-2, D-4 |
| N-9 | Read 90 days; unread "a proposed 180 days (to confirm, D-3)" | Read 90 days after being read; unread 180 days after creation; clean-up at most hourly; business records and badges never changed | D-3, D-9 |
| §5 | `notify` "next to each existing `queueEmail`" | Next to `queueEmail` where one exists, at the same point where none exists; event-based keys; two independent channels; stored last clean-up time | D-11, D-9, §13 (b) |
| §6 | Panel latest 10 for all; tag "Needs your reply" (D-1 open) | Parent / teacher 10, student 20; three action labels; no bell on public or admin pages; student has no full page | D-1, D-5, D-6, D-7, assumption 2 |
| §7 | Fresh "on the next page" after own action | Bell updates at once after mark-as-read; refresh runs expiry checks | D-2, D-4 |
| AC-1 | Bell on every signed-in page ("pending-approval teacher: D-5") | Includes the status and profile pages of a teacher awaiting approval | D-5 |
| AC-3 | Latest 10 | Latest 10 (parent, teacher) or 20 (student sheet) | D-7 |
| AC-6 | Marks only that row without leaving the panel | Panel or full page; stays on screen; bell drops at once; badges unchanged | D-2 |
| AC-7 | Marks all; bell shows no number | + menu badges unchanged | D-2 |
| AC-8 | "The Notifications page" | The parent and teacher Notifications pages | D-7 |
| AC-17 | Notifies exactly the recipients listed | Exactly one notification for each recipient listed | Assumption 1 |
| AC-27 | Shows the message and nothing about the record | + tested for each cause; no title, contents, names or identifiers; notification marked read | D-8 |
| AC-30 | An expiry processed twice → one per side | + including two concurrent requests (page load and bell refresh) | D-4 |
| AC-31 | No longer says "Needs your reply" | Three labels from the current record; never from read status | D-1 |
| AC-36 | Read > 90 days, unread > 180 days (D-3) removed | 90 days from reading, 180 from creation, at the next clean-up run, all roles | D-3, D-9 |
| AC-37 | Never removes or changes underlying records | Never deletes, hides, changes or resolves them | D-3 |
| AC-43 (new) | — | Resolution doesn't mark read; reading never changes the record or label | D-1 |
| AC-44 (new) | — | Bell refresh runs expiry checks; expiry notification within ~60 s; no scheduled job | D-4 |
| AC-45 (new) | — | Expiry durations and rules unchanged; existing expiry tests pass | D-4 |
| AC-46 (new) | — | Awaiting-approval teacher: approval and profile notifications only; status re-checked | D-5 |
| AC-47 (new) | — | No bell on admin pages; admin counts and approvals unchanged | D-6 |
| AC-48 (new) | — | Parent menu opens full page; teacher via "See all"; no student full page | D-7 |
| AC-49 (new) | — | A notification never grants access | D-8 |
| AC-50 (new) | — | Clean-up at most hourly, concurrency-safe, no scheduled job | D-9 |
| AC-51 (new) | — | No lesson notifications, placeholders or simulated bookings | D-10 |
| AC-52 (new) | — | Email queued exactly as before, independently; no sending; no delivery claims | D-11 |
| AC-53 (new) | — | No bell or notification requests on public pages | Assumption 2 |
| AC-54 (new) | — | CR-15 banner stays, independent of read status | Assumption 3 |
| Traceability | AC-1 to AC-42 | AC-1 to AC-54 | All of the above |

Assumption 4 (English only) needs no new check; it is recorded in the §3 content rules.

## 13. Conflicts and items needing attention

### 13.1 With the existing acceptance checks
- **AC-1, AC-3, AC-6, AC-8, AC-27, AC-31, AC-36:** wording narrower than or different from the decisions; amended in v0.4 (§12) and made exact in v0.5 (§14). No remaining conflict.
- **AC-24 and D-5:** AC-24 lists all of the user's notifications. D-5 says every notification enforces *current* status. For a teacher who is approved and later suspended or sent back for changes, it is not decided whether earlier marketplace notifications stay in their list or are hidden (Q-4). Opening one is covered by AC-27 cause (5) either way. **(v0.6) Resolved by Q-4:** they stay listed but redacted (§8.1, AC-67). Code check: an approved teacher cannot be "sent back for changes" (`decideTeacher` accepts only `draft` or `submitted` profiles), and a suspended or deactivated account cannot sign in; the redaction covers the remaining causes.
- **D-1 and D-8 both talk about read status** — not a conflict: D-1 forbids marking read *when the action resolves*; D-8 marks read only *when the user opens* a notification they can no longer access.
- **AC-52 and existing email keys:** see 13.2 (5).
- **AC-40 (v0.4: 44 px) and the repository rule AX-04 (48 px, G1-04):** v0.5 uses the stricter repository rule (C-3).

### 13.2 With the existing implementation (inspected in `src/`)
1. **Enquiry expiry and withdrawal have no event hook.** `expireEnquiries` (src/server/teacherEnquiries.ts) is a plain `UPDATE` with no `RETURNING`, audit or email; `withdrawEnquiry` queues no email. To notify "the other side" (§3), the expiry must return the expired rows. The expiry rule (pending and `expires_at <= now`) stays the same. Worksheet sharing (`shareNewResource`, `shareWithMore` in teacherResources.ts) and the CR-15 package conversion (pricingMigration.ts, migration not applied, OC-106) also queue no email. v0.3 §5 said `notify` sits "next to each existing `queueEmail`" — corrected.
2. **Expiry is not atomic on read paths.** `expireLinkRequests` (teacherLinks.ts) and `expireRateNegotiations` (rateNegotiations.ts) run the `UPDATE … RETURNING`, then the audit and `queueEmail` as separate statements. On page loads they are called with the connection pool, not a transaction (for example `listMyTeachers`). If a request fails after the `UPDATE`, the record is expired but its email — and, once built, its notification — is lost for good, because the next run no longer selects it. §5, AC-32 and D-4 (idempotent) need each expiry sweep wrapped in a transaction. Durations and rules don't change. Concurrent sweeps are already safe: the second `UPDATE` re-checks the status and returns nothing, and the unique key is a backstop.
3. **The bell refresh becomes a write request.** D-4 makes each 60-second refresh run three sweeps across *all* users' records, not only the viewer's. `teacher_enquiries` and `rate_negotiations` have no index on `expires_at` (`teacher_student_links` has a partial index for `requested`). That's fine at today's volume. **(v0.6)** Q-8 limits this to one sweep a minute across all users (§7.5). **(v0.7)** B-1 option C adds, on each refresh, a check limited to the viewer's own rows (§7.6); it uses the existing owner indexes, with one parent-side link-request index noted for migration 0026 (implementation note only).
4. **No hourly throttle exists.** Nothing in the code limits a task to once an hour. An in-memory timer isn't shared between server instances, so D-9 needs a stored last-run time and a database lock (the `pg_advisory_xact_lock` pattern is already used in src/server/files/limits.ts). This is additive (migration 0026) and free. **(v0.6)** The same mechanism, with a one-minute interval, is used for the shared sweep (§7.5).
5. **Some email keys are time-based.** Most §3 events use event-based email keys (`enquiry_received:<id>`, `link_request_answered:<id>`, `rate_expired:<id>:<address>`). Two don't: `link_request:<teacher>:<time>` (teacherLinks.ts) and `teacher_decision:<teacher>:<time>` (admin.ts, for changes requested / not approved). For these, today's protection against duplicates comes from the status checks under row locks, not from the key. D-11 asks for both "existing email behaviour maintained" and "retries create no duplicate queued emails"; changing these keys would change existing email behaviour (Q-7). Notification keys will be event-based in all cases.
6. **CR-15 banner:** src/app/teacher/page.tsx shows "Finish your learning package" from `packageNeedsDetails`, a business-state value from teacherHome.ts. This matches assumption 3; no change is needed.
7. **Two "waiting" numbers on the teacher home.** The home summary "Enquiries waiting" counts pending enquiries only. The new Enquiries menu badge (§4.1) also counts rate proposals waiting for the teacher. Both are right, but they can differ on the same screen. No change is proposed (existing behaviour preserved); noted so it isn't reported as a bug.
8. **Teachers awaiting approval:** the teacher layout gives a pending teacher the status and profile pages only (`TEACHER_PENDING_MENU`), and gives a **not approved** teacher no menu at all (OC-72). D-5 doesn't say whether a not-approved teacher sees the bell (Q-2). **(v0.6) Resolved:** no bell; access unchanged (§3, AC-68). Link requests to a pending teacher are already held until approval (CR-12 Reading A); their "Link request sent" notification must be created in the approval transaction, which matches D-5.
9. **Admin:** the Super Admin home shows counts only (active parents, active teachers, teachers waiting for approval). D-6 leaves this unchanged. No conflict.
10. **The parent placeholder was meant for settings.** /parent/notifications says "Notification settings come with email and WhatsApp reminders (Phase 7)", and the parent home card links to it with a button labelled "Notification settings" beside email and WhatsApp status chips. D-7 replaces the page with the notification list, so that button would open a list, not settings. Where notification preferences go later is undecided (Q-5). **(v0.6) Resolved:** the button is renamed "Notifications"; preferences are a separate future change (§6, AC-70).
11. **Destination pages can't show the D-8 message today.** Most §3 destinations are list pages (/teacher/enquiries, /student/homework, /parent/teachers) that simply leave out records the user can't see; per-record pages use `notFound()` (a 404). Neither shows "This is no longer available to you." The build needs a server-side "open notification" step that re-checks access to the linked record for each entity type, shows the neutral message itself, and only then redirects. The existing destination checks stay as they are.
12. **(v0.5) Listing reminders run from one page only.** `queueListingReminders` is called only from src/app/teacher/listing/page.tsx; its code comment ("when teachers open their pages and when public listings are read") describes more triggers than exist. The sweep covers all teachers' listings (up to 100 per run) and is not limited to the viewer. It runs outside a single transaction for the selection, but each listing's update and email are in one transaction with a re-check (`reminder_queued_for IS DISTINCT FROM expires_at`), so concurrent runs are already safe. §7.3 documents today's behaviour as option A; option B is Q-6 (**v0.6: option B decided**). Correcting the comment is a code change and is not made here.
13. **(v0.5) Badge rule and reminder rule differ by design.** The listing-page `renewalDue` rule (used for the badge) includes `paused` listings and listings that have already ended; the reminder rule selects `published` listings that have not yet ended. Both are existing behaviour and are kept; §4.1 and §7.3 state each exactly.

### 13.3 Test implications
- **Time:** the server functions already accept `now`, so DB tests can cover 90 / 180 days (including the one-second boundaries in AC-36), the hourly throttle and expiry without waiting.
- **Concurrency:** AC-30, AC-50 and AC-57 need DB tests with two real parallel connections (two sweeps, two clean-ups), not sequential calls.
- **60-second checks** (AC-34, AC-44, AC-56) and the frozen-clock check (AC-55) need a controlled browser clock, so the suite doesn't wait in real time.
- **Existing expiry tests** (tests/db/teacherEnquiries, teacherRequests, rateNegotiations, pricingNegotiations, teacherListings) must pass unchanged after the sweeps are wrapped in transactions (AC-45). Tests that count `email_outbox` rows must still give the same counts (AC-52, AC-57).
- **Labels and access:** AC-31 needs one case for each cell of the §6.1 table. AC-27 needs one case for each of the five causes, plus the already-read case.
- **Negative pages:** AC-47 and AC-53 need browser checks on admin and public pages, including network requests and page HTML.
- **Badges:** AC-64 needs a seeded fixture with every status for two users of each role.
- **(v0.6) Throttle and redaction:** AC-71 needs a controllable database clock for the claim (`now()` is the database's), so the test sets the stored `last_sweep_at` directly rather than waiting; AC-67 reuses the AC-27 fixtures and checks list responses as well as open responses.
- **(v0.7) User-scoped check:** AC-73 needs real parallel connections (two refreshes, both parties, the check against the shared sweep and against a business page's call) and an injected failure after the `UPDATE`; AC-44 holds the shared sweep inside its minute by setting `last_sweep_at` and controls the browser clock; AC-72 seeds two other users and an ended guardian link; AC-75 is checked with `EXPLAIN` on a seeded database plus code review.
- **Accessibility:** AC-41 and AC-61 reuse the existing axe browser checks and the AX rules in G1-04; reduced motion is tested with the browser's reduced-motion setting.

### 13.4 Questions
- **Q-1 — D-1 labels per record.** **Resolved in v0.5 as a documentation reading** (§6.1, AC-31): a decline is the recipient's answer and so "Done"; withdrawals and expiries are "No longer needed"; reminder notifications (including the listing reminder) carry no label — the badge shows the outstanding renewal. The owner may change any row of §6.1 when approving AC-31. *(v0.4 text: "Is a decline 'Done'? Does the listing-ends reminder … carry these labels too?")*
- **Q-2 — Teachers who are not approved.** **Decided — OC-117.** Awaiting-approval teachers see approval-status notifications on the status and profile pages only; not-approved (rejected) teachers keep today's restricted access — status message, no menu — with no bell and no notifications (§0, §3, AC-46, AC-68). *(v0.5 text: "Open. They see only a status message and no menu (OC-72). Do they get the bell, so they can see 'Your profile was not approved'?")*
- **Q-3 — Profile-change decisions.** **Decided — OC-117.** The existing approved / declined events are added to §3 (verified: `decideProfileChange` in src/server/admin.ts queues both templates, listed in src/server/auth/outbox.ts). No new workflow (AC-69). *(v0.5 text: "Open. D-5 mentions 'profile updates'. Emails already exist for approved or declined profile changes (`teacher_profile_change_approved` / `_declined`), but §3 lists no such event. Add them to §3?")*
- **Q-4 — Earlier notifications after status or access changes.** **Decided — OC-117.** Records are kept; the list shows them redacted ("Notification no longer available"); opening shows only "This is no longer available to you."; access is enforced on the server at display and open time (§8.1, AC-27, AC-67). *(v0.5 text: "Open. For a teacher later suspended or sent back for changes (D-5), and for a parent whose guardian link has ended (D-8): do earlier notifications stay in the list with their original titles (neutral message on opening), or are they hidden or redacted in the list?")*
- **Q-5 — Parent "Notification settings".** **Decided — OC-117.** Renamed "Notifications"; no preferences built in CR-16 (separate future approval) (§6, AC-70). *(v0.5 text: "Open. Should the parent home button be relabelled 'Notifications' when the page becomes the list? Where will notification preferences go when email and WhatsApp are approved?")*
- **Q-6 — Listing-reminder trigger.** **Decided — OC-117: option B**, subject to the Q-8 throttle (§7.3, AC-58). *(v0.5 text follows.)* *Narrowed in v0.5; owner choice open.* What is created, by which code, once per listing period, with which key and in which transaction, and the worst-case timing, are now defined (§7.3, AC-57, AC-58). Remaining choice: **option A** — keep today's trigger (a /teacher/listing page load; worst case no reminder if no teacher opens that page in the 7-day window); or **option B (recommended)** — also run the reminder sweep on the bell refresh and signed-in page loads (₹0, no scheduler; reminder within about 60 s while anyone is active; the existing email may be queued earlier than today, same template and key). Until decided, option A applies.
- **Q-7 — Time-based email keys.** **Decided — OC-117.** Existing email keys, templates, recipients and queued-email behaviour are preserved exactly; no email sending; email workflow unchanged (§5, AC-52). *(v0.5 text: "Open. Keep `link_request:` and `teacher_decision:` keys as they are (protection from status checks) or make them event-based? The second option changes existing email behaviour.")*
- **Q-8 — Sweep frequency.** **Decided — OC-117.** One shared global throttle: the expiry and reminder sweeps run at most once a minute across all users and instances, with a database claim, idempotent processing and catch-up selection (§7.5, AC-71). The timing check (§7.5) showed that the shared sweep alone would give a worst case of about 2 minutes, exceeding D-4's "about 60 seconds" — business decision B-1, **decided in v0.7 (OC-118): option C**, a user-scoped check on each refresh, so active users see expiry notifications within about 60 seconds (§7.6). *(v0.5 text: "Open. Run the expiry sweeps on every 60-second refresh as decided, or also limit them to once a minute across all users to save database work? This would not change when an active user sees the notification by more than about a minute. (If option B of Q-6 is chosen, the same limit would apply to the reminder sweep.)")*

### 13.5 Clarifications made in v0.5 — accepted (OC-117)

All four were accepted by the owner on 20 Oct 2026, 00:56 IST (OC-117). The v0.5 text is kept below.
- **C-1 — The 60-second refresh also returns menu badges.** N-7 says "refresh"; v0.4 §7 refreshed the bell number only, so a badge for an item that expired by time, or that was answered in another tab, stayed until the next page. Returning both in the same request adds no request and no cost (§7.2, AC-56). Alternative: bell only; badges on page load and after own actions. **Accepted — OC-117.**
- **C-2 — Keyset paging.** "Show older" continues from the last row shown rather than by page number, so new notifications never cause repeats or gaps (§6.2, AC-63). No visible difference from the approved design. **Accepted — OC-117.**
- **C-3 — Touch targets 48 px.** The repository rule AX-04 (G1-04) is 48 × 48 px with 8 px spacing; v0.4 AC-40 said 44 px. v0.5 uses 48 px (AC-40). **Accepted — OC-117:** at least 48 × 48 px with at least 8 px spacing.
- **C-4 — Unread rows stay in place under the Unread chip** after "Mark as read" until the filter changes or the page reloads (§6.2), so rows don't move under the pointer. **Accepted — OC-117** (AC-8).

## 14. Changes in v0.5 (OC-116, documentation only; history)

Review items (owner, 20 Oct 2026, 00:07 IST): **1** student panel 20 vs AC-3 · **2** N-7 immediate refresh check · **3** D-8 navigation and read state in AC-27 · **4** D-1 labels and AC-31 · **5** listing-reminder trigger and timing (₹0) · **6** badges, link-request terms, retention timestamps, role pagination, privacy / error / accessibility gaps.

| Item | Where | Before (v0.4) | After (v0.5) |
|---|---|---|---|
| — | Status | v0.4; AC-1 to AC-54 await approval | v0.5, documentation-only revision (OC-116); AC-1 to AC-66 await approval; implementation not authorised; ₹0; no email or WhatsApp |
| 1 | AC-3 | "latest 10 (parent, teacher) or latest 20 (student sheet)" — no ordering tie-break, no boundary case | Ordering defined (`created_at`, `id`); tested with 25 items: exactly 10 / 20 shown, 21st not shown; time zone = `accounts.time_zone` |
| 1 | §6.2 (new), §6, §7 | Panel sizes stated in three places | One per-role table: parent / teacher panel 10, student sheet 20 with no "Show older", no page |
| 1 | AC-48 | Student has no "See all" and no page | + no "Show older"; no action labels in the student sheet |
| 2 | N-7 | "immediate after the user's own actions" | + "the bell number and the affected menu badges (§7.1)" — wording only |
| 2 | §7.1 (new) | "other counts are fresh on the next page" | Bell, affected badges and labels are computed after the change in the response that completes the action |
| 2 | AC-55 (new) | No check for immediate update after own action | Frozen-clock browser check for mark-read, mark-all, each business action and opening |
| 2 | AC-56 (new), §7.2 | Refresh returns the bell number only | Refresh returns bell and badges (C-1); other tabs converge within 60 s |
| 3 | §8 | Neutral message; marked read | + one server-side open step; nothing in the address or responses; bell drops by one; foreign ids behave as not found |
| 3 | AC-27 | Five causes; message; nothing revealed; marked read | + exact text; HTML / address / network checked; `read_at` set; bell exactly one lower; badges unchanged; server re-check at open time; destination not rendered; already-read case; no false message where access remains |
| 4 | §6.1 (new) | Three labels described in prose | Per-record table: which states give "Needs your reply", "Done", "No longer needed"; labels only on action notifications |
| 4 | AC-31 | Labels "follow the record" with examples | One test case per §6.1 cell (enquiry, link request, rate proposal per side and offer, learning package); read status irrelevant; no label on update / reminder / student |
| 4 | §5 | Rate proposal key not defined | Notification records the offer number (`rate_offer:<id>:<n>:<recipient>`) so earlier offers show "Done" |
| 4 | Q-1 | Open | Resolved as a documentation reading (§6.1); owner may change on approval |
| 5 | §1 | No row for listing reminders | Row added: today's code, trigger (/teacher/listing only), global sweep |
| 5 | §7.3 (new) | Not specified (Q-6 open) | What, how (same transaction as the email, key per listing period), option A (default) and option B timings, worst cases, inactive teacher |
| 5 | AC-57, AC-58 (new) | Only AC-33 (no duplicate per period) | Same-transaction creation, concurrency, exclusions, renewal; timing at the Q-6 triggers and the no-sweep worst case |
| 5 | §13.2 (12), (13) | — | Code comment names triggers that don't exist; badge and reminder rules differ by design |
| 5 | Q-6 | "Should it also run on bell refresh?" | Narrowed to the owner's choice of option A or B; A applies until decided |
| 6a | §4.1, §4.2 | Short "Counts" column | Exact record, status, owner and `expires_at > now` conditions per role and menu item; held `pending` link requests excluded; "Looking for students" 0–2; no badges for unapproved teachers, students, admins |
| 6a | AC-64 (new) | — | Seeded every-status, two-user DB check of each badge |
| 6b | §0 (new), whole document | "link request", "teacher-link request", "request" mixed; "teacher-child link" | One term **link request** (defined once, §0); **teacher–child link** for the accepted relationship; synonyms replaced in §3, §4, §7, §8, §9, AC-19, AC-45, AC-46 (decision texts in §11 kept verbatim with a note) |
| 6c | §9, §5 | "90 days after they were read", "180 days after creation" | Clocks = `read_at` (set once) and `created_at`; UTC instants; fixed 90 × 24 h / 180 × 24 h; eligible at `≥`; removed by the next run; late-read example |
| 6c | AC-36 | 90 / 180 days at the next run | + one-second boundaries with controlled `now` |
| 6c | AC-62 (new) | — | `read_at` never moves; late read; time zone has no effect |
| 6d | §6.2, AC-8 | "20 at a time with Show older" | Per-role table; keyset paging; Unread chip count = bell; "Show older" hidden at the end |
| 6d | AC-63 (new) | — | Stable paging with new arrivals and equal times |
| 6e privacy | §3, AC-18, AC-53 | Stored text only; no bell on public pages | + rendered panel / page / network responses, linked and unlinked teachers; no notification data in public HTML |
| 6e privacy | AC-59 (new) | AC-25 covers mark-read by id only | Open, mark-read and paging with another user's id; five-account leakage check |
| 6e errors | §7.4 (new), AC-60 (new) | AC-39 load failure only | Offline, mark-read failure and retry, mark-all all-or-nothing, "Show older" and open failures; no names in errors |
| 6e access | AC-40 | 44 px | 48 × 48 px and 8 px spacing (AX-04, C-3) |
| 6e access | AC-41 | Keyboard, names, axe | + visual tab order, sheet focus kept inside, visible focus ring, serious and critical axe issues |
| 6e access | AC-61 (new), §6 | — | Live-region announcements (AX-10), icon names (AX-06), not colour alone (AX-07), contrast and amber pair (AX-01, AX-02), reduced motion (AX-13), text size (AX-03) |
| N-10 | AC-65, AC-66 (new), §15 | One-line traceability; N-10 had no check | Full matrix both ways; review checks for completeness and for reporting real test results |
| — | §13.5 (new) | — | Clarifications C-1 to C-4 listed for the owner |

**Check count:** v0.4 had 54 checks (AC-1 to AC-54); v0.5 has **66** (12 added: AC-55 to AC-66; 11 tightened: AC-3, AC-8, AC-18, AC-27, AC-31, AC-36, AC-40, AC-41, AC-48, AC-53, plus AC-5 clarified to name the open step; AC-9, AC-11, AC-19, AC-42, AC-44, AC-45 and AC-46 changed in wording only — design terms or the §0 terms). No check was removed or renumbered. The owner's request refers to "AC-1 to AC-42" (the v0.3 numbering); all of those are kept with their numbers.

## 15. Traceability matrix (v0.7)

### 15.1 Requirements → checks

| Req | Requirement (summary) | Verified by | Test levels | Gaps |
|---|---|---|---|---|
| N-1 | Role-based notifications; awaiting-approval teachers only approval / profile; not-approved teachers none; no admin notifications | AC-17, AC-18, AC-19, AC-20, AC-46, AC-47, AC-48, AC-68, AC-69, AC-76, AC-78 | DB, BR | None (Q-2 and Q-3 decided, v0.6) |
| N-2 | Badges from business records; reading never clears an action | AC-10–AC-16, AC-23, AC-43, AC-54, AC-55 (b), AC-64, AC-71 (g), AC-74 | DB, BR | None |
| N-3 | Server-side authorisation; no cross-family data | AC-18, AC-20, AC-24, AC-25, AC-26, AC-27, AC-46, AC-49, AC-53, AC-59, AC-64, AC-67, AC-68, AC-72, AC-78 | DB, BR | None (Q-4 decided, v0.6; user-scoped check limited to authorised records, v0.7) |
| N-4 | One per recipient per event; labels follow the record; lesson items out of scope | AC-29–AC-33, AC-43, AC-44, AC-45, AC-51, AC-52, AC-57, AC-58, AC-69, AC-71, AC-72, AC-73, AC-75, AC-76 | DB, BR, review | None (B-2 decided, v0.7: AC-58 tests the approved existing rule) |
| N-5 | Bell: count, list, date and time, read status, mark one / all | AC-1–AC-8, AC-48, AC-60, AC-63, AC-70, AC-74 | DB, BR, U | None |
| N-6 | Navigation only when authorised; neutral message; redacted list; never grants access | AC-27, AC-28, AC-49, AC-67 | DB, BR | None |
| N-7 | 60-s refresh when visible; none when hidden; immediate after own actions; refresh triggers the throttled shared sweep and runs the user-scoped expiry check | AC-34, AC-35, AC-44, AC-55, AC-56, AC-58, AC-71, AC-74, AC-75 | DB, BR, review | None (B-1 decided, v0.7: AC-44 bound 65 s) |
| N-8 | Worksheet: student + each parent; no other students' information | AC-21, AC-22, AC-23 | DB, BR | None |
| N-9 | Retention 90 days from `read_at`, 180 from `created_at`; hourly clean-up; business records and badges untouched | AC-36, AC-37, AC-50, AC-62 | DB | None |
| N-10 | Every check specific, testable, traceable; all test types | AC-65, AC-66 (and this matrix, and §18) | review | Verified by review, not by an automated test (by nature) |
| N-11 | Approved design; responsive; accessible; loading / empty / error states | AC-9, AC-38–AC-42, AC-60, AC-61, AC-70, AC-77 | U, BR, all suites | Visual match (AC-9) is a screenshot review, not automated — approved by the owner (OC-120) |

### 15.2 Checks → requirements

| Check | Req | Check | Req | Check | Req |
|---|---|---|---|---|---|
| AC-1 | N-5 | AC-25 | N-3 | AC-49 | N-6, N-3 |
| AC-2 | N-5 | AC-26 | N-3 | AC-50 | N-9 |
| AC-3 | N-5 | AC-27 | N-6, N-3 | AC-51 | N-4 |
| AC-4 | N-5 | AC-28 | N-6 | AC-52 | N-4 |
| AC-5 | N-5 | AC-29 | N-4 | AC-53 | N-3 |
| AC-6 | N-5 | AC-30 | N-4 | AC-54 | N-2 |
| AC-7 | N-5 | AC-31 | N-4 | AC-55 | N-7, N-2 |
| AC-8 | N-5 | AC-32 | N-4 | AC-56 | N-7 |
| AC-9 | N-11 | AC-33 | N-4 | AC-57 | N-4 |
| AC-10 | N-2 | AC-34 | N-7 | AC-58 | N-4, N-7 |
| AC-11 | N-2 | AC-35 | N-7 | AC-59 | N-3 |
| AC-12 | N-2 | AC-36 | N-9 | AC-60 | N-11, N-5 |
| AC-13 | N-2 | AC-37 | N-9 | AC-61 | N-11 |
| AC-14 | N-2 | AC-38 | N-11 | AC-62 | N-9 |
| AC-15 | N-2 | AC-39 | N-11 | AC-63 | N-5 |
| AC-16 | N-2 | AC-40 | N-11 | AC-64 | N-2, N-3 |
| AC-17 | N-1 | AC-41 | N-11 | AC-65 | N-10 |
| AC-18 | N-1, N-3 | AC-42 | N-11 | AC-66 | N-10 |
| AC-19 | N-1 | AC-43 | N-4, N-2 | AC-67 | N-6, N-3 |
| AC-20 | N-1, N-3 | AC-44 | N-4, N-7 | AC-68 | N-1, N-3 |
| AC-21 | N-8 | AC-45 | N-4 | AC-69 | N-1, N-4 |
| AC-22 | N-8 | AC-46 | N-1, N-3 | AC-70 | N-5, N-11 |
| AC-23 | N-8, N-2 | AC-47 | N-1 | AC-71 | N-4, N-7, N-2 |
| AC-24 | N-3 | AC-48 | N-5, N-1 | AC-72 | N-3, N-4 |
|  |  |  |  | AC-73 | N-4 |
|  |  |  |  | AC-74 | N-2, N-5, N-7 |
|  |  |  |  | AC-75 | N-4, N-7 |
|  |  |  |  | AC-76 | N-1, N-4 |
|  |  |  |  | AC-77 | N-11 |
|  |  |  |  | AC-78 | N-1, N-3 |

**Orphans:** none. Every check AC-1 to AC-75 maps to at least one requirement, and every requirement N-1 to N-11 has at least one check (verified in §18.1). N-10 is verified by review (AC-65, AC-66) rather than by an automated test. AC-42 (existing suites unchanged) is mapped to N-11 as in v0.4; it also protects the "existing behaviour preserved" commitment.

## 16. Changes in v0.6 (OC-117, documentation only)

Owner's resolutions of 20 Oct 2026, 00:56 IST: **Q-2 to Q-8 decided; C-1 to C-4 accepted** (OC-117). Final approval of N-1 to N-11 and the checks is still pending.

| Item | Where | Before (v0.5) | After (v0.6) | Reason |
|---|---|---|---|---|
| — | Status, Resolved and remaining items | v0.5; Q-2–Q-8 and C-1–C-4 open; AC-1 to AC-66 | v0.6; Q-2–Q-8 decided, C-1–C-4 accepted; items split into (a) fully specified and (b) needing a business decision (B-1, B-2); AC-1 to AC-71 await approval | OC-117 |
| Q-2 | §0, §3, §6, N-1, AC-1, AC-46, AC-68 (new) | Not-approved teachers undecided; "awaiting approval" not defined | "Awaiting approval" and "not approved" defined from the code; awaiting: bell on status and profile pages, approval-status notifications only; not approved: today's access (status message, no menu), no bell, no notifications, rejection creates none | OC-117; OC-72 kept; no new access |
| Q-3 | §1, §3, §5, AC-17, AC-52, AC-69 (new) | Profile-change events not listed | `decideProfileChange` approved / declined (existing, verified in src/server/admin.ts and src/server/auth/outbox.ts) notify the teacher; event-based notification keys; no new workflow | OC-117 |
| Q-4 | §8.1 (new), N-6, §6.2, AC-27, AC-67 (new) | Opening gave the neutral message; list showed original titles (undecided) | Records kept; list redacts to "Notification no longer available" (no message, link, label or identifiers); opening shows only "This is no longer available to you."; server check at display and open time | OC-117 |
| Q-5 | §1, §6, AC-48, AC-70 (new) | Button "Notification settings"; preferences undecided | Button "Notifications"; no preferences in CR-16 | OC-117 |
| Q-6 | §1, §7.3, AC-58 | Option A default; option B recommended | Option B decided; runs through the shared sweep; never skipped while the period runs (catch-up selection); 100-per-run limit caught up next run; option A kept as history | OC-117 |
| Q-7 | §5, AC-52 | Time-based email keys undecided | All existing keys, templates, recipients, payloads and queued-only behaviour kept exactly (keys listed); only the listing reminder email's queue time can be earlier, under option B | OC-117 |
| Q-8 | §0, §5, §7.2, §7.5 (new), N-7, AC-30, AC-44, AC-71 (new) | "Each refresh runs the expiry sweeps"; no throttle | Shared sweep at most once a minute across all users and instances (stored `last_sweep_at`, conditional update on the database clock); idempotent; catch-up; existing business-page and action calls unthrottled; no wording claims every refresh runs a sweep | OC-117 |
| Q-8 timing | §7.2, §7.5, AC-44 | "Within about 60 seconds" | Verified worst case ≈ 120 s; exceeds D-4's "about 60 seconds"; D-4 not changed; B-1 options A / B / C; AC-44 bound follows B-1 | OC-117 asked for the check |
| C-1 | §7.2, AC-56 | Clarification | Accepted: bell and badges in the same refresh response | OC-117 |
| C-2 | §6.2, AC-63 | Clarification | Accepted: keyset paging for "Show older" | OC-117 |
| C-3 | AC-40 | Clarification | Accepted: at least 48 × 48 px, at least 8 px spacing | OC-117 |
| C-4 | §6.2, AC-8 | Clarification (not in AC-8) | Accepted; AC-8 now tests that read rows stay in place under Unread until the filter changes or the page reloads | OC-117 |
| Quality | §15, §17 (new; §18 since v0.7), AC-65 | Matrix to AC-66 | Matrix to AC-71; per-check planned test file, name, level and actual result; sweep, badge and unchanged-scope verification | OC-117 (3) |

**Check count:** v0.5 had 66 checks (AC-1 to AC-66); v0.6 has **71** (5 added: AC-67 to AC-71; 14 changed: AC-1, AC-8, AC-17, AC-27, AC-30, AC-40, AC-44, AC-46, AC-48, AC-52, AC-56, AC-58, AC-63, AC-65). No check was removed or renumbered.

## 17. Changes in v0.7 (OC-118, documentation only)

Owner's business decisions of 20 Oct 2026, 09:56 IST (OC-118): **B-1 option C approved; B-2 existing behaviour approved;** the owner is prepared to approve N-1–N-11 and AC-1–AC-71 after the final consistency review (§18.8). This is **not** authorisation to implement, migrate, modify test data or deploy.

| Item | Where | Before (v0.6) | After (v0.7) | Reason |
|---|---|---|---|---|
| — | Status, "What changed", Resolved and remaining items | v0.6; B-1 and B-2 open; AC-1 to AC-71 await approval | v0.7; B-1 and B-2 decided; AC-1 to AC-75 await approval; approval wording to cover AC-72–AC-75; implementation, migration, test data and deployment not authorised | OC-118 |
| B-1 | §0 (new terms "User-scoped expiry check", "Active user") | — | Terms defined once | OC-118 |
| B-1 | §1 Expiry row | Shared sweep only | + user-scoped check on each bell refresh for the viewer's own records | OC-118 |
| B-1 | N-7 | Refresh triggers the throttled shared sweep | + every bell refresh runs the user-scoped expiry check, unthrottled; active user within about 60 s (D-4) | OC-118 |
| B-1 | §4.2 | Badges never wait for the shared sweep | + nor for the user-scoped check, which changes no badge | Consistency |
| B-1 | §5 | Two stored throttle rows | + the user-scoped check needs no stored row; parent-side link-request index recorded as an implementation note for migration 0026 (not a migration now) | OC-118 ("note any index needed later") |
| — | §5 email | "The only change to email is when `listing_expiry_reminder` may be queued" | + the existing expiry emails (`link_request_expired:`, `rate_expired:`) can be queued by the shared sweep or the user-scoped check; templates, recipients, payloads and keys unchanged | Correction found in the consistency review (true since v0.6 for the shared sweep) |
| B-1 | §7.2 | Timing: worst case about 2 minutes for an active recipient | Each bell refresh runs the user-scoped check; active user ≈ 60 s (AC-44: at most 65 s); not-active user: created on the next appropriate request (exact sources listed) | OC-118 |
| B-2 | §7.3 | "Worst case … (B-2)", open; reminder "within about 2 minutes" | B-2 decided: no reminder after the listing expires if no qualifying activity in the final 7 days; no scheduler; the 2-minute figure stated as listing-reminder-only, not D-4 | OC-118 |
| B-1 | §7.5 | Timing check ending in options A / B / C (open) | Shared-sweep-alone analysis kept as the reason; option C result ≈ 60 s for active users; user-scoped check outside the throttle; A and B not chosen | OC-118 |
| B-1 | §7.6 (new) | — | User-scoped expiry check: when it runs, exact scope per table, server-derived identity only, rules unchanged, conditional `UPDATE … RETURNING` in one transaction with all recipients' notifications, `ON CONFLICT DO NOTHING`, other party notified in the same transaction, indexes used, implementation note | OC-118 |
| B-1 | §11 D-4 | Decision text | Unchanged; note added on how D-4 is met | OC-118 |
| B-1 | §13.2 (3), §13.3, §13.4 Q-8 | B-1 open | Notes and test implications for the user-scoped check; Q-8 records B-1 decided | OC-118 |
| B-1 | AC-30 | Two concurrent expiry paths | + the user-scoped check racing the shared sweep (detail in AC-73) | OC-118 |
| B-1 | AC-44 | Bound open (120 / 90 / 60 s; asserted ≤ 120 s) | Active user: at most 65 s after expiry (60 s refresh + 5 s for one refresh request), with the shared sweep held inside its minute; parent and teacher; worst-case and best-case refresh timing | OC-118 ("≤ 60 s + one refresh tolerance, state exactly") |
| B-2 | AC-58 | "if no sweep runs before `expires_at`, no reminder … (B-2)" | B-2 decided; no reminder notification or email for that period, then or later; the user-scoped check never creates a reminder | OC-118 |
| — | AC-65 | AC-1 to AC-71 | AC-1 to AC-75 | Range |
| B-1 | AC-71 | (a)–(g) | + (h) user-scoped checks neither read nor move `last_sweep_at`; shared sweep still once a minute | OC-118 |
| B-1 | AC-72 (new) | — | Scope and authorisation of the user-scoped check | OC-118 |
| B-1 | AC-73 (new) | — | Concurrency and idempotency: same user twice, both parties, race with the shared sweep and with a business page's call; rollback | OC-118 |
| B-1 | AC-74 (new) | — | Counts after the check: unread count includes the new notification; badges unchanged; other party correct | OC-118 |
| B-1 | AC-75 (new) | — | Efficiency: indexed owner predicates, no write when nothing expired, no new infrastructure | OC-118 |
| Quality | §15 | Matrix to AC-71; gaps B-1 (N-7), B-2 (N-4) | Matrix to AC-75; no gaps | OC-118 |
| Quality | §17 → §18, §18 → §19 | Final quality checks were §17 | Renumbered to §18 (this section inserted as §17); references updated; §18.8 consistency review added | OC-118 |
| — | §19 | Asked for B-1 and B-2 | Asks only for final approval of N-1–N-11 and AC-1–AC-75 | OC-118 |

**Check count:** v0.6 had 71 checks (AC-1 to AC-71); v0.7 has **75** (4 added: AC-72 to AC-75; 5 changed: AC-30, AC-44, AC-58, AC-65, AC-71). No check was removed or renumbered. **Note on the approval wording:** the owner's OC-118 statement covers "AC-1–AC-71"; the final approval needs to include **AC-72, AC-73, AC-74 and AC-75**, which test the B-1 option C behaviour the owner approved.

## 18. Final quality checks (v0.7)

### 18.1 Traceability

- **Requirements → checks:** each of N-1 to N-11 maps to at least one check (§15.1). Counts (v0.7): N-1 9, N-2 14, N-3 14, N-4 17, N-5 13, N-6 4, N-7 9, N-8 3, N-9 4, N-10 2, N-11 9.
- **Checks → requirements:** each of AC-1 to AC-75 maps to at least one requirement (§15.2), and the requirement column of every check in §10 matches §15.2 exactly (checked row by row for all 75 checks in v0.7).
- **Orphans:** none either way. **Result: met (document review).**
- **Types present:** P, N, D, E, M, A and R each appear at least once (AC-65).
- **Planned tests:** every check AC-1 to AC-75 has a planned test file, test name and level in §18.2 (75 rows); none has been run.

### 18.2 Planned test for every check

(v0.8) CR-16 is built (N1 #106, N2 #107). The actual-result column records real results only; parts not run are stated as not run (AC-66). **The verification status of every check — design-approved, fully verified, partially verified or open — is in §20.** The text below this paragraph is kept from v0.7 for the planned file names.

| Check | Planned test file(s) | Planned test name | Level | Actual result |
|---|---|---|---|---|
| AC-1 | tests/e2e/notifications.spec.ts | "bell shows on every parent, teacher and student page and on the awaiting-approval status and profile pages" | BR | Passed (N2) — tests/real/notifications.spec.ts "AC-1, AC-2 …" (every menu page of parent, teacher, student) · tests/real/notifications-access.spec.ts "AC-27 causes 4 and 5, AC-46 …" (awaiting-approval status and profile pages) · tests/real/notifications-access.spec.ts "AC-68 …" (no bell when not approved) |
| AC-2 | tests/db/notifications.test.ts · tests/e2e/notifications.spec.ts | "bell number equals unread count; 1–9 then 9+; hidden at 0" | DB + BR | Passed — DB part tests/db/notifications.test.ts (N1); browser part tests/real/notifications.spec.ts "AC-1, AC-2 …" and tests/unit/NotificationPanel.test.tsx (N2) |
| AC-3 | tests/e2e/notifications.spec.ts | "panel lists latest 10 (adult) / 20 (student) newest first with full date and time" | BR | Passed (N2) — tests/real/notifications.spec.ts "AC-3, AC-4 …" (25 rows: parent 1–10, student 1–20, full date and time in Asia/Kolkata) |
| AC-4 | tests/e2e/notifications.spec.ts | "opening the panel marks nothing read" | BR | Passed (N2) — tests/real/notifications.spec.ts "AC-3, AC-4 …" · tests/unit/NotificationPanel.test.tsx |
| AC-5 | tests/e2e/notifications.spec.ts | "clicking a row marks only that row read and opens its page through the open step" | BR | Passed (N2) — tests/real/notifications.spec.ts "AC-5, AC-28, AC-55 (c) …" · tests/unit/NotificationPanel.test.tsx "AC-5 …" · tests/db/notificationView.test.ts |
| AC-6 | tests/e2e/notifications.spec.ts | "Mark as read on one row keeps the screen, lowers the bell, leaves badges" | BR | Passed (N2) — tests/real/notifications.spec.ts "AC-6, AC-7, AC-14, AC-55 (a), AC-43 …" (panel) · tests/real/notifications.spec.ts "AC-8, AC-63 …" (page) · tests/unit/NotificationPanel.test.tsx |
| AC-7 | tests/db/notifications.test.ts · tests/e2e/notifications.spec.ts | "Mark all as read clears the bell and leaves badges" | DB + BR | Passed — DB part tests/db/notifications.test.ts (N1); browser part tests/real/notifications.spec.ts "AC-6, AC-7, …" and tests/db/notificationView.test.ts (N2) |
| AC-8 | tests/e2e/notifications.spec.ts | "Notifications page: 20 per load, Show older, chips, unread rows stay in place (C-4)" | BR | Passed (N2) — tests/real/notifications.spec.ts "AC-8, AC-63 …" (45 rows, Show older ×2, Unread chip = bell number, C-4) |
| AC-9 | tests/e2e/notifications.spec.ts | "panel and page match the approved design (screenshot review)" | BR (screenshot review) | Screenshots captured for owner review (N2) — tests/real/notifications-phone-a11y.spec.ts (N2_SHOTS: desktop panel, phone sheet, parent page, redacted row); **design approved by the owner, 20 Oct 2026, 17:41 IST (OC-120)** — visual design only; not a pass of functionality, accessibility, authorisation or privacy checks |
| AC-10 | tests/db/notificationBadges.test.ts · tests/e2e/notifications.spec.ts | "Students badge rises and falls with link requests" | DB + BR | Passed — DB part tests/db/notificationBadges.test.ts (N1); browser part (N2) tests/real/notifications.spec.ts "AC-44, AC-74 …" (Students badge 1, then 0 after the link request expires, no reload) and tests/real/notifications-phone-a11y.spec.ts "AC-41, AC-61 …" (badge read as "Students, 1 waiting for you"). Accept, decline and parent withdrawal in the browser — passed locally (3/3); all 11 CI checks passed on PR #109 (20 Oct 2026): tests/real/notifications-actions.spec.ts "AC-55 (b): the teacher accepts and declines link requests …" (badge 2 → 1 → 0 in the completing response) and "AC-10: the parent withdraws a link request …" (the teacher's badge 1 → 0 at their next refresh, no reload; label "No longer needed") |
| AC-11 | tests/db/notificationBadges.test.ts | "Enquiries badge counts enquiries and rate proposals on the teacher’s turn" | DB | Passed — tests/db/notificationBadges.test.ts (N1) |
| AC-12 | tests/db/notificationBadges.test.ts | "Looking for students badge: renewal due and package needing details, 0–2" | DB | Passed — tests/db/notificationBadges.test.ts (N1) |
| AC-13 | tests/db/notificationBadges.test.ts | "My enquiries badge follows the parent’s turn" | DB | Passed — tests/db/notificationBadges.test.ts (N1) |
| AC-14 | tests/db/notificationBadges.test.ts · tests/e2e/notifications.spec.ts | "reading notifications never changes a badge" | DB + BR | Passed — DB part tests/db/notificationBadges.test.ts (N1); browser part tests/real/notifications.spec.ts "AC-6, AC-7, AC-14, …" (N2) |
| AC-15 | tests/db/notificationBadges.test.ts | "completing the action clears the badge without reading" | DB | Passed — tests/db/notificationBadges.test.ts (N1) |
| AC-16 | tests/db/notificationBadges.test.ts | "past-expiry item not counted before any sweep" | DB | Passed — tests/db/notificationBadges.test.ts · tests/db/notificationSweeps.test.ts (N1) |
| AC-17 | tests/db/notifications.test.ts | "each §3 event notifies exactly the listed recipients once; rejection notifies nobody" | DB | Passed — tests/db/notifications.test.ts · tests/db/notificationLabels.test.ts (N1) |
| AC-18 | tests/db/notifications.test.ts · tests/e2e/notifications-access.spec.ts | "teacher notifications never contain a child’s name or id" | DB + BR | Passed — DB part (N1); browser part tests/real/notifications-access.spec.ts "AC-27 (f), AC-67 cause 2 …" (no child name or id in HTML or any action response) (N2) |
| AC-19 | tests/db/notifications.test.ts | "student receives learning updates only" | DB | Passed — tests/db/notifications.test.ts (N1) |
| AC-20 | tests/db/notifications.test.ts | "parent never notified about another family’s child or after guardian link ends" | DB | Passed — tests/db/notifications.test.ts · tests/db/notificationAccess.test.ts (N1) |
| AC-21 | tests/db/notifications.test.ts | "worksheet share notifies the student and each active parent" | DB | Passed — tests/db/notifications.test.ts (N1) |
| AC-22 | tests/db/notifications.test.ts | "multi-child worksheet share names only each child’s own item" | DB | Passed — tests/db/notifications.test.ts (N1) |
| AC-23 | tests/db/notifications.test.ts · tests/e2e/notifications.spec.ts | "reading a worksheet notification never marks the homework done" | DB + BR | Passed — DB part (N1); browser part tests/real/notifications-access.spec.ts "AC-27, AC-67 cause 3 …" (opening the worksheet notification leaves the share unchanged) (N2) |
| AC-24 | tests/db/notifications.test.ts · tests/e2e/notifications-access.spec.ts | "list, count and page return only the signed-in user’s rows; signed-out goes to sign-in" | DB + BR | Passed — DB part (N1); browser part tests/real/notifications-access.spec.ts "AC-24, AC-49, AC-53, AC-59 …" and tests/db/notificationView.test.ts "signed-out requests go to sign-in" (N2) |
| AC-25 | tests/db/notifications.test.ts | "marking another user’s notification is not found and changes nothing" | DB | Passed — tests/db/notifications.test.ts (N1) |
| AC-26 | tests/db/notifications.test.ts | "notification link must be an internal path" | DB | Passed — tests/db/notifications.test.ts (N1) |
| AC-27 | tests/db/notificationAccess.test.ts · tests/e2e/notifications-access.spec.ts | "access ended: five causes plus already-read case show only the neutral message" | BR + DB | Passed — DB part (N1); browser part tests/real/notifications-access.spec.ts causes 1, 2 (removed after the list was shown), 3 (student and parent), 4 (sign-in refused), 5 (sent back for changes), already-read case (N2) |
| AC-28 | tests/e2e/notifications-access.spec.ts | "opening an authorised notification lands on the right page" | BR | Passed (N2) — tests/real/notifications.spec.ts "AC-5, AC-28, AC-55 (c) …" |
| AC-29 | tests/db/notifications.test.ts | "same event twice creates one notification" | DB | Passed — tests/db/notifications.test.ts (N1) |
| AC-30 | tests/db/notificationSweeps.test.ts | "expiry processed twice or concurrently (including the user-scoped check) creates one notification per side" | DB | Passed — tests/db/notificationSweeps.test.ts · tests/db/notificationUserExpiry.test.ts (N1) |
| AC-31 | tests/db/notificationLabels.test.ts · tests/e2e/notifications.spec.ts | "action label per §6.1 cell, independent of read status" | DB + BR | Passed — DB part tests/db/notificationLabels.test.ts (N1); browser part (label shown and updated; none on the student sheet) tests/real/notifications.spec.ts "AC-6 …", "AC-55 (b) …", tests/real/notifications-access.spec.ts cause 3, tests/unit/NotificationPanel.test.tsx (N2) |
| AC-32 | tests/db/notifications.test.ts | "rolled-back event creates no notification" | DB | Passed — tests/db/notifications.test.ts (N1) |
| AC-33 | tests/db/notificationSweeps.test.ts | "listing reminder once per period; renewal starts a new one" | DB | Passed — tests/db/notificationSweeps.test.ts (N1) |
| AC-34 | tests/e2e/notifications.spec.ts | "new notification appears within 60 s while visible" | BR | Passed (N2) — tests/real/notifications.spec.ts "AC-34, AC-35 …" (controlled browser clock) |
| AC-35 | tests/e2e/notifications.spec.ts | "hidden tab makes no requests; one check on return" | BR | Passed (N2) — tests/real/notifications.spec.ts "AC-34, AC-35 …" |
| AC-36 | tests/db/notifications.test.ts | "retention 90 / 180 days at one-second boundaries" | DB | Passed — tests/db/notifications.test.ts (N1) |
| AC-37 | tests/db/notifications.test.ts | "retention never changes business records or badges" | DB | Passed — tests/db/notifications.test.ts (N1) |
| AC-38 | tests/unit/NotificationPanel.test.tsx · tests/e2e/notifications.spec.ts | "loading skeleton and empty states, child-friendly student empty state" | U + BR | Passed (N2) — tests/unit/NotificationPanel.test.tsx (skeleton, empty, child-friendly empty) · tests/real/notifications-phone-a11y.spec.ts "AC-38, AC-41 …" |
| AC-39 | tests/unit/NotificationPanel.test.tsx · tests/e2e/notifications.spec.ts | "load failure: bell without number, Try again, badges still work" | U + BR | Passed (N2) — tests/unit/NotificationPanel.test.tsx "AC-39 …" · tests/real/notifications.spec.ts "AC-39, AC-60 …" (bell without number, Try again, menu still works) |
| AC-40 | tests/e2e/notifications-phone-a11y.spec.ts | "phone 390 px: bottom sheet, no sideways scroll, 48 × 48 px targets, 8 px spacing" | BR | Passed (N2) — tests/real/notifications-phone-a11y.spec.ts "AC-40, AC-9 …" (phone project, 375 px: modal bottom sheet, no sideways scroll, every control ≥ 48 × 48 px and ≥ 8 px apart) |
| AC-41 | tests/e2e/notifications-phone-a11y.spec.ts | "keyboard, focus, names and axe on panel, sheet and page" | BR | Passed (N2) — tests/real/notifications-phone-a11y.spec.ts "AC-41, AC-61 …" (desktop and phone; axe on panel, sheet and page) · tests/real/notifications-phone-a11y.spec.ts "AC-38, AC-41 …" |
| AC-42 | all existing suites | "existing dashboards, enquiries, rate proposals, homework and listing behave as before" | all | Passed (N2, local run) — unit (vitest), the full DB suite, the demo e2e suite (desktop and phone), the hosted-demo suite and every existing real-accounts e2e test passed. The real suite was run in parts on a fresh dev server each (the sandbox’s shared memory limit stopped single whole-suite runs, also on main); a few existing tests passed only on retry (slow first compiles), as on main — see the N2 build report |
| AC-43 | tests/db/notificationLabels.test.ts · tests/e2e/notifications.spec.ts | "resolving an action does not mark read; reading never changes the record" | DB + BR | Passed — DB part (N1); browser part tests/real/notifications.spec.ts "AC-6, …, AC-43 …" and "AC-55 (b) …" (N2) |
| AC-44 | tests/db/notificationSweeps.test.ts · tests/e2e/notifications.spec.ts | "active user sees an expiry notification within 65 s while the shared sweep is held (user-scoped check)" | DB + BR | Passed — DB part (N1); browser part tests/real/notifications.spec.ts "AC-44, AC-74 …" (parent and teacher, shared sweep held, ≤ 65 s) (N2). Timing variants passed locally (3/3); all 11 CI checks passed on PR #109 (20 Oct 2026): tests/real/notifications.spec.ts "AC-44 (refresh just before E, worst case) …" and "AC-44 (refresh just after E) …" — a parent and a teacher, each with an enquiry, a link request and a rate proposal expiring at E (other party never signed in), browser clocks frozen, shared sweep held: the last refresh before E shows nothing and leaves the records open; the next refresh, exactly 60 s (browser clock) later — or the first refresh just after E — shows the notification in the bell number and the list, its request completing in ≤ 5 s; the stored shared-sweep time unchanged |
| AC-45 | tests/db/notificationSweeps.test.ts | "expiry durations and rules unchanged" | DB | Passed — tests/db/notificationSweeps.test.ts (N1) |
| AC-46 | tests/db/notifications.test.ts · tests/e2e/notifications.spec.ts | "awaiting-approval teacher: bell on status and profile pages, approval and profile notifications only" | DB + BR | Passed — DB part (N1); browser part tests/real/notifications-access.spec.ts "AC-27 causes 4 and 5, AC-46 …" (N2) |
| AC-47 | tests/e2e/notifications.spec.ts | "admin pages: no bell, no notification requests" | BR + existing suites | Passed (N2) — tests/real/superadmin.spec.ts (Super Admin and Admin: no bell, no notification requests); existing admin suites unchanged |
| AC-48 | tests/e2e/notifications.spec.ts | "parent menu item and home button open the page; teacher via See all; no student page" | BR | Passed (N2) — tests/real/notifications.spec.ts "AC-48, AC-70 …" · tests/real/notifications.spec.ts "AC-3, AC-4 …" |
| AC-49 | tests/db/notificationAccess.test.ts · tests/e2e/notifications-access.spec.ts | "a notification never grants access; changed ids show nothing more" | BR + DB | Passed — DB part (N1); browser part tests/real/notifications-access.spec.ts "AC-24, AC-49, AC-53, AC-59 …" (N2) |
| AC-50 | tests/db/notifications.test.ts | "clean-up at most hourly; concurrent requests run it once" | DB | Passed — tests/db/notifications.test.ts (N1) |
| AC-51 | tests/db/notifications.test.ts | "no lesson, placeholder or simulated booking notification exists" | DB + review | Passed — DB part tests/db/notifications.test.ts (N1); review part (N2): the N2 code adds no notification type, lesson, reminder, placeholder or simulated booking — it only lists, counts, marks and opens existing rows |
| AC-52 | tests/db/notifications.test.ts | "existing emails queued exactly as before, independently; nothing sent" | DB | Passed — tests/db/notifications.test.ts (N1) |
| AC-53 | tests/e2e/notifications-access.spec.ts | "public pages: no bell, no requests, no notification data in HTML" | BR | Passed (N2) — tests/real/notifications-access.spec.ts "AC-24, AC-49, AC-53, AC-59 …" (signed out and signed in) |
| AC-54 | tests/db/notifications.test.ts · tests/e2e/notifications.spec.ts | "CR-15 banner independent of the notification’s read status" | DB + BR | Passed — DB part tests/db/notificationLabels.test.ts (N1); browser part passed locally (3/3); all 11 CI checks passed on PR #109 (20 Oct 2026): tests/real/superadmin.spec.ts "CR-16 AC-54, AC-55 (b): \"Finish your learning package\" …" — banner on /teacher while the package needs details, before and after the notification is read; gone after the package is completed (teacher 1) or withdrawn (teacher 2, notification never read) |
| AC-55 | tests/e2e/notifications.spec.ts | "own actions update bell, badges and labels with the clock frozen" | BR | Passed — (a) tests/real/notifications.spec.ts "AC-6 …"; (c) "AC-5 …" (N2); (b) every §7.1 action, each in the browser with the clock frozen: teacher answers an enquiry — tests/real/notifications.spec.ts "AC-55 (b): answering an enquiry …" (N2); the following passed locally (3/3); all 11 CI checks passed on PR #109 (20 Oct 2026) each: accepts and declines a link request — tests/real/notifications-actions.spec.ts "AC-55 (b): the teacher accepts and declines link requests …"; answers a rate proposal (accepts; declines) and counters — "AC-55 (b): the teacher answers and counters rate proposals …", "AC-55 (b): the teacher declines a rate proposal …"; renews the listing — "AC-55 (b): the teacher renews the listing …" (badge cleared; a renewal has no action notification, and the listing reminder shows no label, §6.1); completes the package — tests/real/superadmin.spec.ts "CR-16 AC-54, AC-55 (b) …"; parent answers (accepts; declines), counters and withdraws a rate proposal — tests/real/notifications-actions.spec.ts "AC-55 (b): the parent answers, counters and withdraws …", "AC-55 (b): the parent declines a counter-offer …". In each, the badge is already lowered in the response that completes the action, and the related label (opened in the panel, still with the clock frozen) is "Done" ("No longer needed" after a withdrawal) while the notification stays unread |
| AC-56 | tests/e2e/notifications.spec.ts | "refresh returns bell and badges in one response; other tab converges in 60 s" | BR | Passed (N2) — tests/real/notifications.spec.ts "AC-56 …" |
| AC-57 | tests/db/notificationSweeps.test.ts | "reminder and email in one transaction; concurrency; exclusions; renewal" | DB | Passed — tests/db/notificationSweeps.test.ts (N1) |
| AC-58 | tests/db/notificationSweeps.test.ts · tests/e2e/notifications.spec.ts | "reminder timing under option B, catch-up, 100-per-run limit; none after the listing expires (B-2)" | DB + BR | Passed — DB part tests/db/notificationSweeps.test.ts (N1); browser part passed locally (3/3); all 11 CI checks passed on PR #109 (20 Oct 2026): tests/real/notifications.spec.ts "AC-58 (browser): a listing in its final 7 days …" (reminder created by another user's page load through the shared sweep, with its queued email; in the teacher's bell at their next sign-in, no label, renewal-due badge) and "AC-58 (browser, B-2) …" (listing ended with no sweep in its final week: after a shared sweep and the teacher's own /teacher/listing load, no reminder notification and no reminder email; badge shows renewal due) |
| AC-59 | tests/db/notificationAccess.test.ts · tests/e2e/notifications-access.spec.ts | "no cross-account leakage by id across five accounts" | DB + BR | Passed — DB part (N1); browser part tests/real/notifications-access.spec.ts "AC-24, AC-49, AC-53, AC-59 …", cause 2 and tests/db/notificationView.test.ts (N2) |
| AC-60 | tests/unit/NotificationPanel.test.tsx · tests/e2e/notifications.spec.ts · tests/db/notifications.test.ts | "offline, failed mark read, mark all, Show older and open" | U + BR + DB | Passed — DB part (N1); component tests/unit/NotificationPanel.test.tsx and browser tests/real/notifications.spec.ts "AC-39, AC-60 …" (offline, failed mark read and retry, failed refresh, failed list) (N2). Remaining browser cases passed locally (3/3); all 11 CI checks passed on PR #109 (20 Oct 2026): tests/real/notifications-actions.spec.ts "AC-60: failed Show older, Mark all and open …" (request forced to fail by intercepting the Server Action in the browser): failed Show older keeps the 20 rows and offers Try again, which then loads the rest; failed Mark all (page and panel) changes no row and keeps the bell at 25 unread; failed open stays on the page with Try again and leaves the notification unread; no message contains the child's or teacher's name, a title or an email |
| AC-61 | tests/unit/NotificationPanel.test.tsx · tests/e2e/notifications-phone-a11y.spec.ts | "live region, names, not colour alone, contrast, reduced motion, text size" | U + BR | Passed (N2) — tests/unit/NotificationPanel.test.tsx · tests/real/notifications-phone-a11y.spec.ts "AC-41, AC-61 …" (live region, names, words not colour, amber pair, reduced motion, ≥ 12 px) |
| AC-62 | tests/db/notifications.test.ts | "read_at set once; late read keeps its clock; time zone irrelevant" | DB | Passed — tests/db/notifications.test.ts (N1) |
| AC-63 | tests/db/notifications.test.ts · tests/e2e/notifications.spec.ts | "keyset paging stable with new arrivals and equal times" | DB + BR | Passed — DB part (N1); browser part tests/real/notifications.spec.ts "AC-8, AC-63 …" and "AC-3, AC-4 …" (N2) |
| AC-64 | tests/db/notificationBadges.test.ts | "each badge equals its §4.1 definition for two users of each role" | DB | Passed — tests/db/notificationBadges.test.ts (N1) |
| AC-65 | review of the build report | "traceability and test-type coverage" | review | Met — document review (N2, 20 Oct 2026): §10 and §15 unchanged by N2; every AC-1 to AC-75 still names a requirement, type and level; N-1 to N-11 each verified by at least one check; types P, N, D, E, M, A and R all present |
| AC-66 | review of the build report | "build report lists test file, name and real result for every check" | review | Met — review (N2): this column lists, for every check run so far, the test file(s) and test name(s) and the real result; checks or parts not run are stated as not run (never as passed) |
| AC-67 | tests/db/notificationAccess.test.ts · tests/e2e/notifications-access.spec.ts | "redacted list display after access ends; restored when access returns" | DB + BR | Passed — DB part (N1); browser part tests/real/notifications-access.spec.ts causes 1–3 and 5, tests/unit/NotificationPanel.test.tsx (N2) |
| AC-68 | tests/db/notifications.test.ts · tests/e2e/notifications-access.spec.ts | "not-approved teacher: status page as today, no bell, no notifications" | DB + BR | Passed — DB part (N1); browser part tests/real/notifications-access.spec.ts "AC-68 …" (N2) |
| AC-69 | tests/db/notifications.test.ts | "profile change approved / declined notifies the teacher once" | DB | Passed — tests/db/notifications.test.ts (N1) |
| AC-70 | tests/e2e/notifications.spec.ts | "parent home button reads Notifications; no preference controls" | BR | Passed (N2) — tests/real/notifications.spec.ts "AC-48, AC-70 …" |
| AC-71 | tests/db/notificationSweeps.test.ts | "shared sweep runs once a minute across concurrent requests; catch-up; idempotent; user-scoped checks do not touch the throttle" | DB | Passed — tests/db/notificationSweeps.test.ts (N1) |
| AC-72 | tests/db/notificationUserExpiry.test.ts | "user-scoped check expires only the viewer's authorised records; client ids ignored" | DB | Passed — tests/db/notificationUserExpiry.test.ts (N1) |
| AC-73 | tests/db/notificationUserExpiry.test.ts | "concurrent refreshes, both parties and races with the shared sweep give one transition and one notification per recipient" | DB | Passed — tests/db/notificationUserExpiry.test.ts (N1) |
| AC-74 | tests/db/notificationUserExpiry.test.ts · tests/e2e/notifications.spec.ts | "refresh response counts include the new notification; badges unchanged; other party correct" | DB + BR | Passed — DB part (N1); browser part tests/real/notifications.spec.ts "AC-44, AC-74 …" and tests/db/notificationView.test.ts (N2) |
| AC-75 | tests/db/notificationUserExpiry.test.ts · review of the build | "user-scoped statements use owner indexes and write nothing when nothing has expired" | DB + review | DB part passed — tests/db/notificationUserExpiry.test.ts (N1); review carried out 20 Oct 2026 on an isolated seeded review database (§20.2): every statement uses an index scan with the viewer's id; no write when nothing has expired; no other user's row changed. **Finding:** the teacher-side rate-proposal statement scans the whole active-proposals index rather than a teacher-keyed range — **partially verified, open** (§20) |
| AC-76 | tests/db/notificationSweeps.test.ts · tests/db/notificationUserExpiry.test.ts · tests/db/notifications.test.ts | "enquiry expiry notifies the parent once; never the teacher" | DB | Passed (N1) — recipients equal [parent] and exactly one `enquiry_expired` per enquiry across sweeps, user-scoped checks and a retried failure |
| AC-77 | — | "no bell in the sample-data preview" | BR | Passed locally (3/3); all 11 CI checks passed on PR #109 (20 Oct 2026) (desktop and phone) — tests/e2e/notifications-demo.spec.ts "AC-77: sample-data parent / teacher / student pages have no bell, no menu badge and make no notification request" (every parent, teacher and student menu page plus the two Notifications pages; browser clock moved on 3 minutes per page; no Server Action request at all). Runs in the demo e2e job |
| AC-78 | tests/real/notifications-access.spec.ts | awaiting-approval test (bell on status and profile pages; only approval-status rows; no "See all"; /teacher/notifications → /teacher/status) · "AC-68: a not-approved teacher sees the status message as today, no bell and makes no notification requests" | BR + DB | Passed (N2, CI on PR #107) — every part asserted in the browser; server-side refusal also in tests/db/notificationAccess.test.ts (N1). "Otherwise restricted" accounts (suspended or closed) cannot sign in, so they reach no page with a bell |

**Existing tests that must keep passing** (they cover behaviour CR-16 must not change):

| Existing test (unchanged behaviour) | Protects | Last known result |
|---|---|---|
| tests/db/teacherEnquiries.test.ts — "waiting enquiries expire after 14 days and can no longer be answered or withdrawn" | AC-45, AC-42 | Passing — CI `db` job on PR #101 (head eff722d) and PR #100 (head df6be43), the last two merged PRs |
| tests/db/rateNegotiations.test.ts — "each offer resets the expiry; with no answer the negotiation expires and later answers are refused" | AC-45, AC-42 | Passing — same CI runs |
| tests/db/teacherRequests.test.ts — "expires; acceptance is refused by the server and the database; the parent is told" | AC-45, AC-42 | Passing — same CI runs |
| tests/db/teacherListings.test.ts — "queues one reminder 7 days before the end of each period (queued, not sent)" | AC-52, AC-57 | Passing — same CI runs |
| tests/db/teacherProfile.test.ts — "an approver accepts or declines the change; the teacher is emailed and sees the note" | AC-52, AC-69 | Passing — same CI runs |
| tests/db/admin.test.ts — "an Admin with the permission approves; the teacher becomes active and is emailed"; "reject and request changes keep the teacher out of the portal" | AC-17, AC-52, AC-68 | Passing — same CI runs |
| tests/db/teacherProfile.test.ts — "a rejected teacher, a parent or an unknown id cannot save anything (OC-72)" | AC-68 | Passing — same CI runs |
| tests/db/pricingMigration.test.ts — "OC-107 (2): the teacher home asks the teacher to finish a converted package, only while the model is on" | AC-54 | Passing — same CI runs |
| tests/db/pricingNegotiations.test.ts, tests/db/teacherLinks.test.ts (whole files) | AC-42, AC-45 | Passing — same CI runs |
| tests/e2e/roles.spec.ts, tests/e2e/shells.spec.ts, tests/e2e/keyboard.spec.ts, tests/e2e/design-system.spec.ts (whole files) | AC-42, AC-47, AC-41 | Passing — CI `e2e` job on the same two PRs |

These are the results of the last CI runs before this branch; they were **not** re-run for this documentation-only revision, and none of them yet exercises any CR-16 behaviour.

### 18.3 Sweeps: no duplicates, no permanent skips, safe under concurrency

- **No duplicates.** Expiry: each sweep's `UPDATE … WHERE status is open AND expires_at <= now RETURNING` changes a row once; a second runner gets nothing back. Each notification has a unique event-based `dedupe_key` inserted with `ON CONFLICT DO NOTHING` (§5). Reminder: the existing per-listing transaction re-checks `reminder_queued_for IS DISTINCT FROM expires_at` (src/server/teacherListings.ts) and the notification key `listing_reminder:<listing id>:<expires_at ISO>:<teacher id>` is unique. Existing email keys are unchanged and keep their own protection (Q-7). Tested by AC-29, AC-30, AC-33, AC-57, AC-71 (e).
- **No permanent skip.** Each run re-selects all rows that are due now, not rows that became due since the last run (§7.5 "Catch-up"); a failed or skipped minute, or the 100-listing limit, is caught up by the next run. Expiry notifications are created in the same transaction as the expiry (§13.2 (2) fix), so an expiry is never recorded without its notification. Limit: a listing reminder is not created after the listing has ended (existing rule; B-2, approved by the owner, OC-118). Tested by AC-58, AC-71 (d).
- **(v0.7) User-scoped expiry check.** Same conditional `UPDATE … RETURNING` and the same notification keys with `ON CONFLICT DO NOTHING`, in one transaction with the notifications for every recipient (including the other party); limited to the viewer's own authorised records by server-derived identity; not throttled and independent of `last_sweep_at`. Whichever of the user-scoped check, the shared sweep or a business page's own call reaches a row first makes the one transition; the others get nothing back (§7.6). Tested by AC-72, AC-73, AC-74, AC-75, AC-71 (h).
- **Concurrency.** The conditional update on the stored `last_sweep_at` lets exactly one request per minute claim the run; others skip without waiting. If two sweeps ever run together (a business page's own unthrottled call and the shared sweep), the re-checks and unique keys above keep the result identical to one run. Tested by AC-30, AC-57, AC-71 (a)–(c), (e) with real parallel connections (§13.3).

### 18.4 Badges

Every badge in §4.1 counts business records only — `teacher_student_links`, `teacher_enquiries`, `rate_negotiations`, `teacher_listings`, `learning_packages` — filtered by the signed-in user and by `expires_at > now` (or `renewalDue`, `packageNeedsDetails`). None reads `notifications`. Therefore badges stay correct regardless of notification read status (§4.2; AC-14, AC-15), retention clean-up (§9; AC-37, AC-64), reminder or expiry sweep processing or its throttle (§4.2, §7.5; AC-16, AC-71 (g)), and the user-scoped expiry check (§7.6; AC-74). **Result: met by definition (document review); not yet tested.**

### 18.5 Unchanged

- **Role permissions:** unchanged; the bell adds no page, menu item or access for any role; not-approved teachers keep OC-72 access (AC-42, AC-47, AC-49, AC-68).
- **Child privacy:** teacher notifications never name a child; students see no commercial or parent details; redaction hides records the user may no longer see (AC-18, AC-19, AC-22, AC-59, AC-67).
- **Business workflows:** expiry rules and durations, approval, profile-change, enquiry, link-request, rate-proposal, listing and worksheet workflows unchanged; existing business-page expiry calls unthrottled (AC-42, AC-45, AC-71 (f)); the user-scoped expiry check applies the same expiry rules, statuses, durations, audit entries and email keys to the viewer's own records only (§7.6; AC-45, AC-72).
- **Approved notification design:** tinted card headers, chip-style All / Unread filters, responsive desktop layout, bottom sheet on phones (OC-113 (1); AC-9, AC-40). The only label change is the parent home button text (Q-5).
- **Decisions D-1 to D-11 and the four assumptions:** unchanged (§11).

### 18.6 Cost and sending

₹0. No paid service. No new infrastructure or scheduled job: both throttles are rows in the existing database (§5, §7.5), and the shared sweep and the user-scoped expiry check (§7.6) both run inside normal requests against the existing database (the user-scoped check needs no stored row; one later index is an implementation note for migration 0026, not a migration now). No email is sent and no WhatsApp message is sent or attempted; `email_outbox` stays queued-only (AC-52).

### 18.7 Scope of this revision

This revision (v0.7) changed **documentation only**: this document and the decision register (OC-118). No application code, migration, test, test data or deployment was changed. src/ and db/migrations/ were read to verify facts only (the expiry functions in src/server/teacherEnquiries.ts, teacherLinks.ts and rateNegotiations.ts, and the existing indexes in db/migrations/0001, 0014, 0020 and 0021).

### 18.8 Final consistency review (v0.7, OC-118)

**1. Stale statements (whole document searched for "2 minutes", "120", "approximately 60", "about 60", "once a minute", "every refresh", "each refresh", "B-1", "B-2").**
- "About 2 minutes" / "120 s" for expiry notifications to active users — **removed or rewritten** in: Resolved items (B-1 row), §7.2 timing, §7.5 timing check (kept only as the shared-sweep-alone analysis that led to B-1), AC-44 (old "asserts ≤ 120 s"), §15.1 N-7 gap, §19. Annotated as history in the v0.6 "What changed" line and §13.4 Q-8; §16 (v0.6 change log) is history and unchanged. The only current "about 2 minutes" is the **listing reminder** (§7.3), which is not covered by D-4 and is stated as such. "120" otherwise appears only as the 120-character title limit (§5).
- "Approximately / about 60 seconds" — D-4 (verbatim, unchanged), N-7, §7.2, §7.5, §7.6, D-4 note, AC-44: all now say an active user sees expiry notifications within about 60 s; AC-44 states the exact test bound (65 s).
- "Once a minute" — used only for the shared sweep (§0, §5, §7.2, §7.3, §7.5, N-7, Q-8, AC-71); the user-scoped check is described as unthrottled everywhere it appears (§0, N-7, §7.2, §7.5, §7.6, AC-71 (h)).
- "Every / each refresh" — every bell refresh runs the user-scoped check; the shared sweep runs only when the throttle allows (§7.2). Consistent with the v0.6 rule that no wording claims every refresh runs the shared sweep.
- "B-1" / "B-2" — all current references say decided (OC-118); open-state wording remains only in history (§16, v0.6 line, annotated).
- **Other corrections found:** §5 said the listing reminder was the only email whose queue time could change; the existing expiry emails can also be queued by the shared sweep (since v0.6) and now the user-scoped check — corrected, keys unchanged. §19 still asked for B-1 / B-2 — rewritten. §15.1 gaps for N-4 and N-7 — cleared.
- **Checked, not changed:** AC-34 and AC-56 ("within 60 s") measure the refresh interval with a controlled browser clock; AC-44 uses the same 60 s interval and adds an explicit 5 s allowance for the one refresh request in its end-to-end measurement. Not contradictory.

**2. Traceability** (§15, §18.1): every N-1 to N-11 maps to its checks and every AC-1 to AC-75 to at least one requirement; the requirement column of each check in §10 matches §15.2 row by row; every check has a planned test in §18.2. No orphans. Every CR-16 check: **Not run — not implemented (awaiting approval).**

**3. No contradictory rules** — each rule family and the sections checked:

| Rule family | Sections checked | Result |
|---|---|---|
| Timing (refresh, expiry, reminder, retention) | §0, N-7, §7.1–§7.6, §9, §11 D-4 and D-9, AC-34, AC-35, AC-36, AC-44, AC-50, AC-55, AC-56, AC-58, AC-71 | Consistent: 60 s refresh while visible; expiry ≈ 60 s for active users (≤ 65 s test); not-active users on the next appropriate request; reminder ≈ 2 min while anyone is active and never after expiry (B-2); clean-up hourly |
| Notification creation and de-duplication | §3, §5, §7.3, §7.5, §7.6, §18.3, AC-17, AC-29, AC-30, AC-32, AC-33, AC-57, AC-69, AC-73 | Consistent: same transaction as the business change; event-based keys with `ON CONFLICT DO NOTHING`; one per recipient; the other party notified in the same transaction whoever triggers the expiry |
| Badges | §4, §4.1, §4.2, §6.1, §18.4, AC-10–AC-16, AC-64, AC-71 (g), AC-74 | Consistent: business records only; unaffected by reading, retention, sweeps, the throttle and the user-scoped check |
| Access control and privacy | §3 content rules, §5, §7.6, §8, §8.1, AC-18, AC-24–AC-27, AC-46, AC-49, AC-53, AC-59, AC-67, AC-68, AC-72 | Consistent: server-derived identity only; no client-supplied ids; user-scoped check limited to authorised records; redaction and neutral message unchanged |
| Retention | §9, N-9, §7.6, AC-36, AC-37, AC-50, AC-62 | Consistent and unchanged; the user-scoped check does not run clean-up |
| Email and WhatsApp | §5, §7.3, §11 D-11, AC-52, AC-57, §18.6 | Consistent: existing templates, recipients, payloads and keys unchanged; queued only; no sending; no WhatsApp |
| Throttles and infrastructure | §5, §7.5, §7.6, §9, AC-50, AC-71, AC-75 | Consistent: two stored rows (clean-up, shared sweep) in the existing database; the user-scoped check needs none |

**4. Cost and channels:** ₹0; no new infrastructure, service or scheduler — the shared sweep and the user-scoped check both run inside normal requests on the existing database; no email sending; no WhatsApp (§18.6).

**5. Remaining unresolved decisions:** none besides the owner's **final approval** of N-1 to N-11 and AC-1 to AC-75 (covering AC-72 to AC-75) and, later, a separate **approval to implement** (including migration 0026, test data and deployment).

## 19. What I need from you

One decision only: **AC-75** — the owner's decision on the teacher-side rate-proposal index (options presented to the owner on 20 Oct 2026: (a) accept AC-75 as met with the growth note recorded; (b) approve migration 0027 adding `rate_negotiations_teacher_open (teacher_id) WHERE status IN ('pending','countered')`; (c) accept now and revisit before launch. Measured at 60,000 open proposals on an isolated review database: teacher expiry check 10.9 → 5.9 ms, teacher with nothing expired 2.6 → 0.08 ms, teacher Enquiries badge count 8.6 → 0.55 ms; index 440 kB; no measurable write overhead; §20.1, §20.2). Adding an index would be a new migration (0027), which is **not approved**; it is not required for correctness. Until then AC-75 stays partially verified (open). AC-44, AC-54, AC-55, AC-58, AC-60 and AC-77 are fully verified (§20; passed locally (3/3), all 11 CI checks passed on PR #109 (20 Oct 2026)). Counts: 1 design-approved (AC-9), 76 fully verified, 1 partially verified (AC-75), 0 open — 78 checks.

## 20. Verification status (v0.8, OC-120)

Categories: **Design-approved** — the owner approved the visual design only (OC-120); **Fully verified** — every part of the check has a passing automated test or a completed review, run locally and in CI on PRs #106 and #107; **Partially verified (open)** — some parts passed, others not yet run; **Open** — not yet verified. No check is shown as passed on partial evidence.

| Status | Checks | Count |
|---|---|---|
| Design-approved | AC-9 (visual design only; OC-120, 20 Oct 2026, 17:41 IST) | 1 |
| Fully verified | AC-1–AC-8, AC-10–AC-74, AC-76–AC-78 (the last parts of AC-44, AC-54, AC-55, AC-58, AC-60 and AC-77 passed locally (3/3) on 20 Oct 2026, branch cr16-open-check-tests, test files only; all 11 CI checks passed on PR #109 (20 Oct 2026) — §20.1) | 76 |
| Partially verified (open) | AC-75 | 1 |
| Open | — | 0 |
| **Total** | AC-1 to AC-78 | **78** |

AC-42 counts as fully verified on the CI evidence: the complete existing suites (unit, DB, demo e2e, hosted demo and real-account e2e) passed in CI on PR #107; locally the real-account suite had to run in parts because of the build workspace's memory limit. AC-65 and AC-66 are reviews, recorded as met in §18.2.

### 20.1 Partially verified and open checks

| Check | Tested so far, and result | Not yet verified | Verification still required | Evidence and result once done |
|---|---|---|---|---|
| AC-44 | DB: expiry notification created by the user-scoped check for an enquiry, link request and rate proposal while the shared sweep is held — passed (tests/db/notificationUserExpiry.test.ts, notificationSweeps.test.ts). Browser: parent and teacher, shared sweep held, notification in the bell ≤ 65 s after expiry — passed (tests/real/notifications.spec.ts "AC-44, AC-74 …"). Browser timing variants — passed locally (3/3); all 11 CI checks passed on PR #109 (20 Oct 2026): tests/real/notifications.spec.ts "AC-44 (refresh just before E, worst case) …" and "AC-44 (refresh just after E) …", each for a parent and a teacher with an enquiry, a link request and a rate proposal expiring at *E*, browser clocks frozen, shared sweep held and unchanged. | Nothing. | all 11 CI checks passed on PR #109 (20 Oct 2026). | Fully verified |
| AC-54 | DB: the "Finish your learning package" banner condition is independent of the notification's read status and clears only on completion or withdrawal — passed (tests/db/notificationLabels.test.ts). Browser — passed locally (3/3); all 11 CI checks passed on PR #109 (20 Oct 2026): tests/real/superadmin.spec.ts "CR-16 AC-54, AC-55 (b) …" — banner on /teacher before and after the notification is read; gone after completion; for a second teacher (notification never read) gone after withdrawal. | Nothing. | all 11 CI checks passed on PR #109 (20 Oct 2026). | Fully verified |
| AC-55 | Browser with the clock frozen: (a) Mark as read / Mark all change the bell with no reload — passed; (c) opening a notification shows the lowered number — passed; (b) teacher answers an enquiry — passed (N2). (b) remaining actions — passed locally (3/3); all 11 CI checks passed on PR #109 (20 Oct 2026) each: teacher accepts and declines a link request, accepts, declines and counters a rate proposal, renews the listing (tests/real/notifications-actions.spec.ts); completes the package (tests/real/superadmin.spec.ts "CR-16 AC-54, AC-55 (b) …"); parent accepts, declines, counters and withdraws a rate proposal (tests/real/notifications-actions.spec.ts). Badge lowered in the completing response; label "Done" ("No longer needed" after a withdrawal); a renewal has no action label (§6.1). | Nothing. | all 11 CI checks passed on PR #109 (20 Oct 2026). | Fully verified |
| AC-58 | DB: reminder created by the first sweep in the final 7 days, day-6 catch-up, 100-per-run limit with the 101st in the next run, none after the listing has expired (B-2), never by the user-scoped check — passed (tests/db/notificationSweeps.test.ts). Browser — passed locally (3/3); all 11 CI checks passed on PR #109 (20 Oct 2026): tests/real/notifications.spec.ts "AC-58 (browser) …" (reminder created by another user's request; in the teacher's bell at their next sign-in) and "AC-58 (browser, B-2) …" (ended listing: no reminder or reminder email after a shared sweep and a /teacher/listing load; badge shows renewal due). | Nothing. | all 11 CI checks passed on PR #109 (20 Oct 2026). | Fully verified |
| AC-60 | DB: failed mark read / mark all / open change no row — passed. Component: all error states — passed (tests/unit/NotificationPanel.test.tsx). Browser: offline banner and one check on reconnect, failed mark read with restored number and retry, failed refresh, failed list — passed (tests/real/notifications.spec.ts "AC-39, AC-60 …"). Browser — passed locally (3/3); all 11 CI checks passed on PR #109 (20 Oct 2026): tests/real/notifications-actions.spec.ts "AC-60: failed Show older, Mark all and open …" (Server Action request failed by browser route interception): Show older keeps the shown rows and offers Try again; Mark all (page and panel) changes no row and keeps the bell number; open leaves the notification unread; no message names a record, child or other user. | Nothing. | all 11 CI checks passed on PR #109 (20 Oct 2026). | Fully verified |
| AC-75 | DB: the user-scoped check writes nothing when nothing has expired and only touches the viewer's rows — passed (tests/db/notificationUserExpiry.test.ts). Review: §20.2 — completed 20 Oct 2026. | The teacher-side rate-proposal statement does not use a teacher-keyed index range (see finding). | Owner decision: accept the current plan (cost grows with the number of open proposals platform-wide, ≈ 4 ms at 6,000 open proposals), or approve a partial index `(teacher_id) WHERE status IN ('pending','countered')` in a new migration, then re-run the EXPLAIN. | Pending — partially verified |
| AC-77 | Implemented: in sample-data mode `shellNotifications` returns nothing, so no bell, panel or badge renders (DV-95). Browser — passed locally (3/3); all 11 CI checks passed on PR #109 (20 Oct 2026), desktop and phone: tests/e2e/notifications-demo.spec.ts "AC-77: sample-data parent / teacher / student pages have no bell, no menu badge and make no notification request" (in the demo e2e job). | Nothing. | all 11 CI checks passed on PR #109 (20 Oct 2026). | Fully verified |

### 20.2 AC-75 review (20 Oct 2026)

**Database used.** A new, disposable database `cr16_ac75_review` on the build workspace's local PostgreSQL 16 server (127.0.0.1), created for this review, given the schema with the application's normal migration step (26 migrations, as the DB test suite does), seeded with synthetic rows only, and dropped afterwards. No existing, shared or production database was touched, and no migration was run anywhere else. Migration 0025 (AA Pro Verified) and 0026 (CR-16) were already merged earlier; nothing was applied to the test site for this review.

**Seed (synthetic).** 2,000 parents, 500 teachers, 3,000 children with guardian links; 100,000 enquiries (5 % pending, half of those past expiry); 60,000 teacher–child link rows (10 % requested, half past expiry); 60,000 rate proposals (10 % open, half past expiry). Statistics refreshed with `ANALYZE`. The planner's normal choices were used (sequential scans **not** disabled).

**Statements reviewed** — the six user-scoped `UPDATE`s run by `userScopedExpiryCheck` (src/server/notifications/sweep.ts) through `expireEnquiries`, `expireLinkRequests` and `expireRateNegotiations` with a teacher or parent scope. Results of `EXPLAIN (ANALYZE, BUFFERS)` inside a rolled-back transaction:

| # | Table, scope | Plan | Index used | Rows expired | Time |
|---|---|---|---|---|---|
| 1 | Enquiries, teacher | Bitmap index scan | `teacher_enquiries_teacher (teacher_id, status, sent_at)` — teacher and status in the index condition | 100 | 2.4 ms |
| 2 | Enquiries, parent | Index scan | `teacher_enquiries_parent (parent_id, status, sent_at)` | 0 | 0.02 ms |
| 3 | Link requests, teacher | Bitmap index scan | `teacher_student_links_requested (teacher_id, requested_at) WHERE status = 'requested'` (migration 0020) | 5 | 2.6 ms |
| 4 | Link requests, parent | Index scan, then guardian-link check by primary key | `teacher_student_links_parent_requested (created_by_parent_id) WHERE status = 'requested'` — **added in migration 0026** | 0 | 0.03 ms |
| 5 | Rate proposals, teacher | Index scan | `rate_negotiations_one_active` (partial, open proposals only), with `teacher_id` as a non-leading column | 120 | 3.9 ms (80 index/heap pages read) |
| 6 | Rate proposals, parent | Index scan | `rate_negotiations_one_active` with `parent_id` as the leading column | 0 | 0.06 ms |

**Migration 0026's index.** The parent-side link-request index is the one the parent statement uses (row 4); without it that statement would have no parent-keyed index. Note on numbering: the CR-16 index is in **migration 0026**, not 0025; 0025 is the AA Pro Verified migration.

**Writes.** (a) For a teacher with nothing expired, running the three teacher-scope statements wrote **0 rows** (PostgreSQL transaction statistics: 0 inserts, updates or deletes). (b) For a teacher with expired records, 225 of that teacher's rows were updated and a before/after fingerprint of all **219,561** other users' rows in the three tables showed **0 changed**. The check adds no table, service, scheduler or throttle row (§7.6): `userScopedExpiryCheck` calls only the three existing expiry functions.

**Finding.** Statement 5 uses an index scan, but `teacher_id` is not the index's leading column, so PostgreSQL reads the whole partial index of open proposals platform-wide rather than one teacher's range. It is fast at this scale and correct; its cost grows with the total number of open proposals. AC-75 therefore stays **partially verified** until the owner accepts this plan or approves an index (§19).

**Scripts and output** were kept in the build workspace only (not committed): seed, EXPLAIN and write-check SQL with their outputs.
