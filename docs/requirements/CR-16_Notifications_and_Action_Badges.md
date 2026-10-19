# CR-16 — In-app notifications (bell) and dashboard action badges

**Version:** 0.3 · 19 Oct 2026 · **Status:** for owner review — **nothing built, not approved.** Updated design approved (OC-113 (1)); the requirements and acceptance checks below await final approval (OC-113 (2)). Open decisions are listed in §11 and are **not** resolved in this document.
**Source:** owner requirement "Centralised Notifications and Dashboard Action Badges" (19 Oct 2026, 13:27 IST); decisions OC-106 (14:10 IST) and OC-113 (19:21 IST). **Budget:** ₹0 — in-app only; no paid service, no new infrastructure, no email or WhatsApp sending.
**Boards:** NB0–NB4 on the design canvas (page "CR-16 Notifications"). They show content and behaviour; the build uses the approved signed-in design (tinted card headers, chip-style All / Unread filters) without changing content, triggers, permissions or behaviour (OC-113 (1)).

**What changed from v0.2:** requirements numbered N-1 to N-10 (the owner's ten principles) and N-11 (design); every acceptance check now names its requirement, type and test level (§10); checks added for gaps found in review (individual "mark as read", absolute date and time, navigation when access has ended, stale action notifications, worksheet privacy, hidden-tab behaviour, sign-out, phone sheet); 30 checks became **42**; §11 lists every open decision and assumption.

---

## 1. What exists today (code inspection, 19 Oct 2026)

| Area | Found | Gap |
|---|---|---|
| In-app notifications | **None.** No table, bell or panel. The parent menu has a "Notifications" item that opens a placeholder. | Everything below |
| Email | `email_outbox` with a unique `dedupe_key`; 24 templates queued at the business event. **Queued only — no email is sent.** | Used as the event hook (§5) |
| Pending counts | Teacher home: link requests waiting (CR-12 TR3), rate proposals waiting (CR-13 RN4). Teacher enquiries page lists pending enquiries. | Not on menus; not shared across pages |
| Expiry | Link requests (14 days) and rate proposals (14 days) are expired **when a relevant page is next loaded** (`expireLinkRequests`, `expireRateNegotiations`), not by a scheduled job. | Affects when "expired" notifications appear (§11 D-4) |
| Real time | None (server-rendered pages, no websockets). | 60-second refresh (§7) |

## 2. Requirements

| ID | Requirement (owner principle, OC-113 (2)) |
|---|---|
| **N-1** | **Role-based notifications.** Parents, teachers and students receive only notifications relevant to their role and authorised relationships. |
| **N-2** | **Action badges ≠ unread notifications.** Menu badges count outstanding actions from the records' state; reading a notification never completes or clears an action. |
| **N-3** | **Security.** Every notification, linked record and count is protected by server-side authorisation; no access to another child's or family's data. |
| **N-4** | **Reliable triggers.** One notification per event (no duplicates); no stale reminders; cancellation, rescheduling and changes to the underlying record handled correctly. |
| **N-5** | **Dashboard bell.** Unread count, notification list, date and time, read status; mark one or all as read. |
| **N-6** | **Navigation.** Clicking a notification opens the record only when the user is still authorised to see it. |
| **N-7** | **Refresh.** Every 60 seconds while the tab is visible; skipped while hidden; immediate after the user's own actions. |
| **N-8** | **Worksheets.** A new worksheet creates a student notification and a separate notification for each authorised parent, without exposing other students' information. |
| **N-9** | **Retention.** Read notifications kept 90 days; unread a proposed 180 days (to confirm, D-3). Retention never removes, hides or changes an unresolved underlying action. |
| **N-10** | **Testing.** Every acceptance check is specific, testable and traceable, with positive, negative-authorisation, duplicate, error and phone cases. |
| **N-11** | **Design.** Approved signed-in design; responsive desktop and phone; accessible; loading, empty and error states (OC-113 (1)). |

## 3. Who gets what — events that exist today

Notifications are created **at the business event, in the same database transaction** as the change (§5). Nobody is notified of their own action.

| Event (existing code) | Recipient | Kind | Title (example) | Opens |
|---|---|---|---|---|
| Enquiry sent | Teacher | Action | "New enquiry from Anita" | /teacher/enquiries |
| Enquiry accepted / declined | Parent | Update | "Teacher B accepted your enquiry" | /parent/enquiries |
| Enquiry expired / withdrawn | The other side | Update | "Your enquiry to Teacher B expired" | Enquiries page |
| Link request sent (after teacher approval) | Teacher | Action | "Anita asked you to teach a Grade 5 child" | /teacher/students |
| Link request accepted / declined / expired | Parent | Update | "Teacher B accepted your request for Kiran" | /parent/teachers |
| Rate proposal received (hourly / package / earlier price) | Teacher | Action | "New package price proposal" | /teacher/enquiries/rates |
| Counter-offer | The other side | Action | "Teacher B made a counter-offer (offer 2 of 6)" | that side's Rate proposals |
| Proposal accepted / declined / withdrawn | The other side | Update | "Anita accepted ₹550 per hour" | Rate proposals |
| Proposal expired | Both sides | Update | "Your proposal to Teacher B expired" | Rate proposals |
| Teacher shares a worksheet / resource with a child (CR-07) | That **student** and **each active authorised parent** of that child (separately) | Update | "New worksheet from Teacher B: Fractions" | /student/homework · /parent/homework |
| Listing ends in 7 days (existing L-2 reminder) | Teacher | Reminder | "Your listing ends on 26 Oct" | /teacher/listing |
| Converted package needs details (CR-15 A5) | Teacher | Action | "Finish your learning package" | /teacher/listing |
| Teacher approved / changes requested / not approved | Teacher | Update | "Your profile was approved" | /teacher or /teacher/status |

**Not in this change (no workflow exists yet):** lesson bookings, cancellations, rescheduling and 15-minute lesson reminders (Phase 3 / Phase 5); homework submissions and marking (CR-07 H-3, H-4); package arrangements (CR-15 Phase B); Super Admin / Admin notifications (D-6). The design reserves room for them; nothing is shown for a workflow that doesn't exist.

**Content rules:**
- A teacher's notification never contains a child's name or id — grade, curriculum and the parent's first name only (FR-040.9, CR-12 B).
- A student gets learning updates only (today: shared worksheets / resources) — never prices, proposals, enquiries or parent details.
- A parent gets only their own items and items about their own children (active guardian link).
- A worksheet notification names only that child's own item — never other students it was shared with.
- No free-text message content, no amounts beyond what both parties already see, no email addresses or phone numbers.

## 4. Two counts (N-2)

| | Bell number | Menu badge |
|---|---|---|
| Counts | This user's **unread notifications** | This user's **pending actions** in that menu area |
| Source | `notifications.read_at IS NULL` | The records' business state (§4.1) — never the notifications |
| Changes when | A notification arrives, is read, or "Mark all as read" | The action is done, withdrawn, expires or a new one arrives |
| Reading a notification | Lowers it | **No change** |
| Display | 1–9, then "9+"; hidden at 0 | 1–9, then "9+"; hidden at 0 |
| Screen readers | "Notifications, 2 unread" | "Enquiries, 3 waiting for you" |

### 4.1 Menu badges that exist now

| Role | Menu item | Counts | Clears when |
|---|---|---|---|
| Teacher | Students | Link requests `requested` and not past their expiry time | Accepted, declined, withdrawn by the parent, or expired |
| Teacher | Enquiries | Enquiries `pending` and not expired **+** rate proposals open with `turn = teacher` and not expired | Answered, withdrawn, expired; proposal answered or countered (turn passes) |
| Teacher | Looking for students | 1 if the listing ends within 7 days or has ended (renewal due); 1 if a learning package is in *Needs review* | Renewed; package completed or withdrawn |
| Parent | My enquiries | Rate proposals open with `turn = parent` and not expired | Accepted, declined, countered, withdrawn, expired |
| Parent | Teachers | none (no parent action is pending on link requests) | — |
| Student | — | none (no student action exists yet) | — |

Counts compare expiry times with the current time, so they are correct even before the lazy expiry has run (§1).

## 5. Data model (migration 0025, additive, existing free database)

`notifications`: `id` uuid · `recipient_id` → accounts (on delete cascade) · `kind` (`action`, `update`, `reminder`) · `type` (e.g. `enquiry_received`) · `title` (≤ 120) · `body` (≤ 300) · `href` (internal path only, checked `^/[a-z]`) · `entity_type`, `entity_id` (the underlying record) · `dedupe_key` (unique) · `created_at` · `read_at`.
Indexes: `(recipient_id, created_at desc)`; partial `(recipient_id) WHERE read_at IS NULL`.

- Created by one server helper `notify(tx, …)` called next to each existing `queueEmail(…)` in the **same transaction**; unique `dedupe_key` + `ON CONFLICT DO NOTHING` → a retried or repeated event never duplicates.
- Read / mark-all: `UPDATE … WHERE recipient_id = <signed-in user>`; another user's id matches nothing.
- List and count queries always filter by the signed-in user; there is no way to request another user's notifications.
- Users can't delete notifications; only retention removes them (§9).
- Email stays a separate, queued-only channel; WhatsApp not involved.

## 6. Screens (boards, built in the approved design)

- **Bell** in the top bar of every signed-in parent, teacher and student page (beside theme and account); unread number in the primary colour.
- **Panel** (desktop, ~380 px; phone: bottom sheet) — tinted header "Notifications", **Mark all as read**; latest 10, newest first; each row: icon by kind, title, one-line message, relative time with full date and time, unread dot, "Needs your reply" tag while the action is still pending (D-1), per-row **Mark as read** (D-2); **See all notifications**.
- **Notifications page** — parent: replaces today's placeholder menu page; teacher: reachable from "See all" (D-7); tinted card header; chip filters **All / Unread (n)**; 20 at a time with **Show older**.
- **Menu badges** — amber chip with the count on the menu items in §4.1.
- **Student** — child-friendly bell and sheet, "Your updates", simple wording, "You're all caught up!" when empty.
- **States** — loading skeleton, error with Try again, empty, keyboard and screen-reader support, 9+ cap.

## 7. Refresh and performance (₹0)

- Counts come from the server on every page load (two small indexed queries).
- The panel loads the latest 10 only when opened; the page loads 20 at a time.
- While the tab is visible the bell re-checks the unread count every 60 seconds; **no requests while the tab is hidden**; one check when it becomes visible again; after the user's own action the counts are fresh on the next page.
- If notifications fail to load, the bell shows without a number, the panel offers Try again, and the rest of the page and the menu badges still work.

## 8. Security summary (N-3, N-6)

- Every list, count and mark-read request checks the signed-in session on the server; without a session → sign-in; the request only ever touches the session user's rows.
- A notification's link is only a path; **the destination page applies its own permission checks** exactly as today. If access has ended (link removed, child moved, resource unshared, account deactivated), the page shows "This is no longer available to you" (D-8) and nothing about the record.
- Notifications are created only by server code at business events — never from browser input.

## 9. Retention (N-9)

- Read notifications are removed **90 days** after they were read; unread ones **180 days** after creation (180 to confirm, D-3).
- Removing a notification never removes, hides or changes the underlying enquiry, proposal, request, assignment or booking; those keep their own status and pages, and menu badges keep counting them.
- Clean-up runs as part of normal requests (no scheduled job, no new infrastructure; D-4 / D-9).

## 10. Acceptance checks (for final approval)

Types: **P** positive · **N** negative / authorisation · **D** duplicate / reliability · **E** error / state · **M** phone / layout · **A** accessibility. Levels: **DB** database test · **BR** browser test with real (synthetic) accounts · **U** component test.

### Bell, panel and page (N-5, N-11)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-1 | The bell is shown on every signed-in parent, teacher and student page (pending-approval teacher: D-5). | N-5 | P | BR |
| AC-2 | The bell number equals that user's unread notifications; shows 1–9 then "9+"; hidden at 0. | N-5 | P | DB + BR |
| AC-3 | Opening the panel lists the latest 10, newest first, each with title, one-line message, relative time **and** full date and time in the user's time zone, kind icon and an unread dot. | N-5 | P | BR |
| AC-4 | Opening the panel does not mark anything as read. | N-5 | P | BR |
| AC-5 | Clicking a row marks only that row read and opens its page. | N-5 | P | BR |
| AC-6 | "Mark as read" on one row marks only that row read without leaving the panel (D-2). | N-5 | P | BR |
| AC-7 | "Mark all as read" marks all of that user's notifications read; the bell shows no number. | N-5 | P | DB + BR |
| AC-8 | The Notifications page shows 20 at a time; "Show older" loads the next 20; the Unread chip shows only unread, All shows all. | N-5 | P | BR |
| AC-9 | The panel and page use the approved design (tinted header, chip filters) and match the rest of the app. | N-11 | P | BR (screenshot review) |

### Action badges (N-2)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-10 | Teacher **Students** badge: +1 on a new link request; −1 on accept, decline, parent withdrawal or expiry. | N-2 | P | DB + BR |
| AC-11 | Teacher **Enquiries** badge: +1 new enquiry; −1 answered / withdrawn / expired; proposal: +1 when the turn passes to the teacher, −1 when the teacher answers or counters. | N-2 | P | DB |
| AC-12 | Teacher **Looking for students** badge: present while the listing ends within 7 days / has ended or a package needs details; cleared by renewing or completing / withdrawing the package. | N-2 | P | DB |
| AC-13 | Parent **My enquiries** badge: +1 on a teacher counter-offer; −1 on the parent's answer, counter, withdrawal or expiry. | N-2 | P | DB |
| AC-14 | Reading the matching notification (one or all) leaves every menu badge unchanged. | N-2 | N | DB + BR |
| AC-15 | Completing the action clears the badge even if the notification was never read. | N-2 | P | DB |
| AC-16 | A past-expiry item is not counted even before the lazy expiry has run. | N-2 | P | DB |

### Role and data scope (N-1, N-3, N-8)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-17 | Each event in §3 notifies exactly the recipients listed and nobody else; the person who acted is not notified. | N-1 | P / N | DB |
| AC-18 | No teacher notification contains a child's name or id (grade, curriculum, parent's first name only). | N-1 | N | DB |
| AC-19 | A student only receives learning updates — never prices, proposals, enquiries or parent details. | N-1 | N | DB |
| AC-20 | A parent never receives a notification about another family's child; after a guardian link is revoked, no new notifications about that child. | N-1, N-3 | N | DB |
| AC-21 | A worksheet shared with a child creates one student notification and one for **each active parent** of that child. | N-8 | P | DB |
| AC-22 | A worksheet shared with several children: each notification names only that child's own item; no other student's name or count appears. | N-8 | N | DB |
| AC-23 | Reading a worksheet notification never marks the homework or resource as done. | N-8, N-2 | N | DB + BR |

### Security (N-3, N-6)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-24 | List, count and page return only the signed-in user's notifications; signed-out requests go to sign-in. | N-3 | N | DB + BR |
| AC-25 | Marking another user's notification (by id) returns "not found" and changes nothing; "Mark all" affects only the signed-in user. | N-3 | N | DB |
| AC-26 | A notification link can only be an internal path; anything else is refused when created. | N-3 | N | DB |
| AC-27 | Opening a notification whose record the user may no longer see (link ended, resource unshared, account deactivated) shows "This is no longer available to you" and nothing about the record (D-8). | N-6 | N | BR |
| AC-28 | Opening an authorised notification lands on the right record / page. | N-6 | P | BR |

### Reliable triggers (N-4)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-29 | The same event processed twice (retry, double click, two tabs) creates one notification. | N-4 | D | DB |
| AC-30 | An expiry processed twice creates one notification per side. | N-4 | D | DB |
| AC-31 | When the underlying item is resolved some other way (answered elsewhere, withdrawn, expired, listing renewed), the old notification no longer says "Needs your reply" (D-1). | N-4 | P | DB + BR |
| AC-32 | An event that fails and rolls back creates no notification (same transaction). | N-4 | D | DB |
| AC-33 | A listing reminder is not created again for the same listing period; renewing starts a new period. | N-4 | D | DB |

### Refresh (N-7)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-34 | While the tab is visible, a new notification appears in the bell number within 60 s without reloading. | N-7 | P | BR |
| AC-35 | While the tab is hidden, no notification requests are made; one check runs when it becomes visible. | N-7 | N | BR |

### Retention (N-9)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-36 | Read notifications older than 90 days and unread older than 180 days (D-3) are removed; newer ones stay. | N-9 | P | DB |
| AC-37 | Removing notifications never removes or changes the underlying records; menu badges are unchanged by retention. | N-9 | N | DB |

### States, phone and accessibility (N-11)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-38 | Loading shows skeleton rows; empty shows "You're all caught up"; the student empty state is child-friendly. | N-11 | E | U + BR |
| AC-39 | If notifications fail to load: bell without a number, panel message with Try again; the page and menu badges still work. | N-11 | E | U + BR |
| AC-40 | Phone (390 px): the panel is a bottom sheet; no sideways scrolling; touch targets ≥ 44 px. | N-11 | M | BR |
| AC-41 | Keyboard: Enter / Space opens, Tab moves through rows, Esc closes and returns focus; bell named "Notifications, N unread"; badges read "N waiting for you"; no serious axe issues. | N-11 | A | BR |
| AC-42 | Existing dashboards, enquiries, proposals, homework and listing pages behave exactly as before (full existing suites pass). | N-11 | P | all |

**Traceability:** N-1 → AC-17–20 · N-2 → AC-10–16, 23 · N-3 → AC-20, 24–26 · N-4 → AC-29–33 · N-5 → AC-1–8 · N-6 → AC-27–28 · N-7 → AC-34–35 · N-8 → AC-21–23 · N-9 → AC-36–37 · N-10 → this table (every check has a requirement, type and level) · N-11 → AC-9, 38–42.

## 11. Conflicts, gaps and decisions needed (not resolved here)

| # | Topic | Why it matters | Proposal (for your decision) |
|---|---|---|---|
| D-1 | **Stale action notifications** — an action notification ("Needs your reply") whose item is later answered elsewhere, withdrawn, expired or renewed. | N-4 asks for no stale reminders. | Keep the notification in the list as history; replace "Needs your reply" with "Done" / "No longer needed", worked out live from the record. Its read state is unchanged. *Alternative:* mark it read automatically. |
| D-2 | **Mark one as read without opening it.** | N-5 asks for marking individual notifications. v0.2 only marked on click. | Add a small "Mark as read" control on each unread row (panel and page). |
| D-3 | **Unread retention 180 days.** | Proposed in OC-106 (6), "subject to review". | Confirm 180 days (or choose another period). Read: 90 days (confirmed). |
| D-4 | **When "expired" notifications appear.** Expiries run lazily when a relevant page is next loaded (§1). | An expiry notification can arrive later than the exact deadline; badges are still correct (AC-16). | Also run the expiry check when the bell count is refreshed, so it appears within about a minute of anyone being active; no scheduled job (₹0). *Alternative:* a free daily scheduled job on the hosting plan — a new scheduled component, needs your approval. |
| D-5 | **Teachers waiting for approval.** | They can only open their status and profile pages. | Show the bell on those pages with approval notifications only. |
| D-6 | **Super Admin / Admin.** | Not in the original brief. | No bell for admins in CR-16 (e.g. "new teacher waiting for approval" stays on the admin home counts). |
| D-7 | **Full page for teachers and students.** | The boards show "See all" for teachers; the menu item exists only for parents. | Teacher: full page reached from "See all" (no new menu item). Student: panel / sheet only, latest 20. |
| D-8 | **Navigation after access ends.** | N-6. | Destination pages keep their own checks; when the record is no longer available, show "This is no longer available to you" and mark the notification read. |
| D-9 | **Retention timing.** | No scheduled jobs exist (₹0, no new infrastructure). | Clean-up runs during normal requests, at most once an hour; the 90 / 180-day limits are met at the next activity, not at the exact minute. |
| D-10 | **Lesson reminders, cancellation and rescheduling.** | Named in N-4 and the master project instruction (15-minute reminder). | Out of scope now — no bookings exist. They'll be added with booking (Phase 3 / Phase 5) under these same rules. Confirm. |
| D-11 | **Duplicate channels.** | Emails are queued for the same events. | In-app notification and queued email are independent; one of each per event. No email is sent until a provider is approved. |

**Assumptions (tell me if any is wrong):** one in-app notification per recipient per event; notifications are never shown on public pages; the existing CR-15 "Finish your learning package" banner stays alongside its notification; notification wording is English only (as the rest of the app).

**What I need from you:** decisions on D-1 to D-11 (accept the proposal or choose otherwise), then final approval of N-1 to N-11 and AC-1 to AC-42.
