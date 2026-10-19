# CR-16 — In-app notifications (bell) and dashboard action badges

**Version:** 0.4 · 19 Oct 2026 · **Status:** for owner review — **nothing built.** Decisions D-1 to D-11 and the four §11 assumptions are **resolved** (owner, 19 Oct 2026, 23:51 IST, OC-115). Requirements N-1 to N-11 and acceptance checks AC-1 to AC-54 still **await the owner's final approval** (OC-113 (2)). **Implementation is not authorised.** ₹0 spent; no email or WhatsApp message has been sent.
**Source:** owner requirement "Centralised Notifications and Dashboard Action Badges" (19 Oct 2026, 13:27 IST); decisions OC-106 (14:10 IST), OC-113 (19:21 IST) and OC-115 (23:51 IST). **Budget:** ₹0 — in-app only; no paid service, no new infrastructure, no email or WhatsApp sending.
**Boards:** NB0–NB4 on the design canvas (page "CR-16 Notifications"). They show content and behaviour; the build uses the approved signed-in design (tinted card headers, chip-style All / Unread filters) without changing content, triggers, permissions or behaviour (OC-113 (1)).

**What changed from v0.3:** D-1 to D-11 decided and the four assumptions accepted (§11); requirements and checks updated to match, and twelve checks added (AC-43 to AC-54) — every change is listed in §12; conflicts with existing checks, the current code and the tests are listed in §13, with eight new questions.
**What changed from v0.2 (kept for history):** requirements numbered N-1 to N-10 (the owner's ten principles) and N-11 (design); every acceptance check names its requirement, type and test level (§10); checks added for individual "mark as read", absolute date and time, navigation when access has ended, stale action notifications, worksheet privacy, hidden-tab behaviour, sign-out and the phone sheet; 30 checks became 42; §11 listed every open decision and assumption.

## Resolved and remaining items

| | Item | State |
|---|---|---|
| Resolved | D-1 to D-11 | Decided by the owner, 19 Oct 2026, 23:51 IST (OC-115). All eleven v0.3 proposals accepted, with the owner's added detail (§11). |
| Resolved | Assumptions 1–4 (§11) | Accepted by the owner (OC-115). |
| Remaining | N-1 to N-11, AC-1 to AC-54 | **Await the owner's final approval.** Nothing is built until then. |
| Remaining | Q-1 to Q-8 (§13.4) | New questions found while applying the decisions to the existing code. They are **not** decided here. |

**Commitments for this change (unchanged by the decisions):**
- **Design:** the approved design is reused — tinted card headers, chip-style All / Unread filters, responsive desktop layout and a bottom sheet on phones (OC-113 (1)). No unrelated redesign.
- **Cost:** ₹0 additional spend; no paid services; no new infrastructure or scheduled jobs. No emails or WhatsApp messages are sent — email stays queued-only in `email_outbox`.
- **Existing behaviour:** existing business behaviour, role permissions and security controls are preserved. Notifications are added beside them; they never replace a business record, a permission check or an existing count.

---

## 1. What exists today (code inspection, 19 Oct 2026)

| Area | Found | Gap |
|---|---|---|
| In-app notifications | **None.** No table, bell or panel. The parent menu has a "Notifications" item that opens a placeholder ("Notification settings come with email and WhatsApp reminders"); the parent home card links to it as "Notification settings". | Everything below; see Q-5 |
| Email | `email_outbox` with a unique `dedupe_key`; templates queued at the business event. **Queued only — no email is sent.** Enquiry expiry, enquiry withdrawal and worksheet sharing queue no email. | Used as the event hook where an email exists (§5) |
| Pending counts | Teacher home: link requests waiting (CR-12 TR3), rate proposals waiting (CR-13 RN4), "Enquiries waiting" summary, CR-15 "Finish your learning package" banner. Teacher enquiries page lists pending enquiries. Super Admin home: counts only (including teachers waiting for approval). | Not on menus; not shared across pages |
| Expiry | Enquiries, link requests and rate proposals (14 days each) are expired **when a relevant page is next loaded** (`expireEnquiries`, `expireLinkRequests`, `expireRateNegotiations`), not by a scheduled job. | Run on bell refresh too (D-4, §7) |
| Real time | None (server-rendered pages, no websockets). | 60-second refresh (§7) |

## 2. Requirements

These requirements **await the owner's final approval.** Text added in v0.4 to reflect a decision names that decision.

| ID | Requirement (owner principle, OC-113 (2); refined by OC-115) |
|---|---|
| **N-1** | **Role-based notifications.** Parents, teachers and students receive only notifications relevant to their role and authorised relationships. A teacher awaiting approval receives only approval-status and profile notifications (D-5). Super Admin and Admin have no notifications in CR-16 (D-6). |
| **N-2** | **Action badges ≠ unread notifications.** Menu badges count outstanding actions from the records' state; reading a notification never completes or clears an action. |
| **N-3** | **Security.** Every notification, linked record and count is protected by server-side authorisation; no access to another child's or family's data. |
| **N-4** | **Reliable triggers.** One notification per authorised recipient per event (no duplicates); no stale action labels — an action notification's label follows the current business record (D-1); changes to the underlying record handled correctly. Lesson reminders, cancellations and rescheduling are out of scope for CR-16 (D-10). |
| **N-5** | **Dashboard bell.** Unread count, notification list, date and time, read status; mark one (without leaving the screen) or all as read (D-2). |
| **N-6** | **Navigation.** Clicking a notification opens the record only when the user is still authorised to see it; otherwise a neutral "This is no longer available to you." (D-8). A notification never grants access. |
| **N-7** | **Refresh.** Every 60 seconds while the tab is visible; skipped while hidden; immediate after the user's own actions (including "Mark as read", D-2). Each refresh also runs the existing expiry checks (D-4). |
| **N-8** | **Worksheets.** A new worksheet creates a student notification and a separate notification for each authorised parent, without exposing other students' information. |
| **N-9** | **Retention.** Read notifications kept 90 days after being read; unread kept 180 days after creation (D-3). Clean-up runs during normal requests, at most once an hour (D-9). Retention never deletes, hides, changes or resolves a business record, and never changes a menu badge. |
| **N-10** | **Testing.** Every acceptance check is specific, testable and traceable, with positive, negative-authorisation, duplicate, error and phone cases. |
| **N-11** | **Design.** Approved signed-in design; responsive desktop and phone; accessible; loading, empty and error states (OC-113 (1)). |

## 3. Who gets what — events that exist today

Notifications are created **at the business event, in the same database transaction** as the change (§5). Nobody is notified of their own action. Each authorised recipient gets exactly one notification per event (assumption 1).

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
| Teacher approved / changes requested / not approved | Teacher (including while awaiting approval, D-5) | Update | "Your profile was approved" | /teacher or /teacher/status |

**Not in this change:** lesson bookings, cancellations, rescheduling and 15-minute lesson reminders — out of scope; added when the booking and scheduling phases are built, under the CR-16 principles, and the 15-minute reminder requirement is kept for that workflow (D-10); homework submissions and marking (CR-07 H-3, H-4); package arrangements (CR-15 Phase B); Super Admin / Admin notifications (D-6). No placeholder notification or simulated booking is created for a workflow that doesn't exist.

**Content rules:**
- A teacher's notification never contains a child's name or id — grade, curriculum and the parent's first name only (FR-040.9, CR-12 B).
- A teacher awaiting approval gets approval-status and profile notifications only — no marketplace, enquiry, proposal or student notifications until approved (D-5).
- A student gets learning updates only (today: shared worksheets / resources) in simple, child-friendly wording — never prices, proposals, enquiries, commercial or parent details (D-7).
- A parent gets only their own items and items about their own children (active guardian link).
- A worksheet notification names only that child's own item — never other students it was shared with.
- No free-text message content, no amounts beyond what both parties already see, no email addresses or phone numbers.
- Wording is English only for this release (assumption 4).

## 4. Two counts (N-2)

| | Bell number | Menu badge |
|---|---|---|
| Counts | This user's **unread notifications** | This user's **pending actions** in that menu area |
| Source | `notifications.read_at IS NULL` | The records' business state (§4.1) — never the notifications |
| Changes when | A notification arrives, is marked read (one or all), or is removed by retention | The action is done, withdrawn, expires or a new one arrives |
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

Counts compare expiry times with the current time, so they exclude items whose expiry time has passed even before the lazy expiry has run (§1, D-4). Badges are computed from the business records independently of notifications, so retention never changes them (D-3).

## 5. Data model (migration 0025, additive, existing free database)

`notifications`: `id` uuid · `recipient_id` → accounts (on delete cascade) · `kind` (`action`, `update`, `reminder`) · `type` (e.g. `enquiry_received`) · `title` (≤ 120) · `body` (≤ 300) · `href` (internal path only, checked `^/[a-z]`) · `entity_type`, `entity_id` (the underlying record) · `dedupe_key` (unique) · `created_at` · `read_at`.
Indexes: `(recipient_id, created_at desc)`; partial `(recipient_id) WHERE read_at IS NULL`.
A small stored "last clean-up" time (one row) lets clean-up run at most once an hour across all server instances (D-9).

- Created by one server helper `notify(tx, …)` called in the **same transaction** as the business change — next to the existing `queueEmail(…)` where the event already queues an email, and at the same point for events that queue none (enquiry expired / withdrawn, worksheet shared, package needs details). Unique `dedupe_key` built from the event (never the clock) + `ON CONFLICT DO NOTHING` → a retried or repeated event never duplicates.
- **Two independent channels (D-11):** one in-app notification per authorised recipient, and the existing queued email exactly as today. Each channel has its own de-duplication. No email is sent: `email_outbox` stays queued-only until an email provider and its cost, privacy, security and delivery requirements are approved. A queued email is never shown or reported as delivered. No WhatsApp or other external messaging.
- Read / mark-all: `UPDATE … WHERE recipient_id = <signed-in user>`; another user's id matches nothing.
- List and count queries always filter by the signed-in user; there is no way to request another user's notifications.
- Users can't delete notifications; only retention removes them (§9).

## 6. Screens (boards, built in the approved design)

- **Bell** in the top bar of every signed-in parent, teacher and student page (beside theme and account), including the status and profile pages open to a teacher awaiting approval (D-5); unread number in the primary colour. **No bell** on public pages (assumption 2) or on Super Admin / Admin pages (D-6).
- **Panel** (desktop, ~380 px; phone: bottom sheet) — tinted header "Notifications", **Mark all as read**; parent and teacher: latest 10, newest first; each row: icon by kind, title, one-line message, relative time with full date and time, unread dot, action label (D-1, below), per-row **Mark as read** on unread rows (D-2); **See all notifications** (parent and teacher only).
- **Action label (D-1)** on action notifications, worked out from the current business record (never from read status): "Needs your reply" only while the action still needs this user's response; "Done" when completed; "No longer needed" when expired, withdrawn or otherwise no longer needing a response.
- **Notifications page** (D-7) — parent: replaces today's placeholder menu page; teacher: reached from "See all" in the panel (no new menu item); tinted card header; chip filters **All / Unread (n)**; 20 at a time with **Show older**; per-row **Mark as read**.
- **Student** (D-7) — child-friendly bell and sheet, "Your updates", latest 20, simple wording, no commercial or parent-specific information, "You're all caught up!" when empty. No full page and no "See all" in this change.
- **Menu badges** — amber chip with the count on the menu items in §4.1.
- **Access ended (D-8)** — "This is no longer available to you." and nothing else about the record.
- **CR-15 banner** — the "Finish your learning package" banner on the teacher dashboard stays, alongside its notification (assumption 3).
- **States** — loading skeleton, error with Try again, empty, keyboard and screen-reader support, 9+ cap.

## 7. Refresh and performance (₹0)

- Counts come from the server on every page load (two small indexed queries).
- The panel loads its rows only when opened (10 for parent and teacher, 20 for student); the page loads 20 at a time.
- While the tab is visible the bell re-checks the unread count every 60 seconds; **no requests while the tab is hidden**; one check when it becomes visible again.
- **Each count refresh first runs the existing expiry checks** for enquiries, rate proposals and teacher-link requests, as business pages already do (D-4). An expiry notification therefore reaches an active recipient within about 60 seconds of the expiry time. If nobody is active, it is created on the next appropriate request. Expiry durations and rules are unchanged; no scheduled job or paid service is added.
- After the user's own action the bell updates at once — "Mark as read" and "Mark all as read" change the bell number without a page reload (D-2); other counts are fresh on the next page.
- If notifications fail to load, the bell shows without a number, the panel offers Try again, and the rest of the page and the menu badges still work.

## 8. Security summary (N-3, N-6)

- Every list, count and mark-read request checks the signed-in session on the server; without a session → sign-in; the request only ever touches the session user's rows.
- A notification's link is only a path and **never grants access** (D-8). Opening it re-checks on the server, against current status and permissions, whether the user may still see the linked record; the destination page also applies its own permission checks exactly as today. If access has ended (guardian relationship ended, teacher-child link removed, resource unshared, account deactivated or any other permission revoked), the user sees "This is no longer available to you." and nothing about the record — no title, contents, names or identifiers — and the notification is marked read.
- A teacher awaiting approval: every notification and destination enforces the teacher's current approval status on the server; nothing bypasses approval. The existing approval workflow and status records are the source of truth (D-5).
- Notifications are created only by server code at business events — never from browser input.

## 9. Retention (N-9)

- Read notifications are removed **90 days after they were read**; unread ones **180 days after creation** (D-3). Same rules for parent, teacher and student.
- Removing a notification never deletes, hides, changes or resolves the underlying enquiry, proposal, teacher-link request, assignment, worksheet or booking; those keep their own status and pages, and menu badges keep counting them.
- Clean-up runs as part of normal application requests, **at most once an hour**; the limits are met at the next eligible activity, not at the exact minute. Concurrent requests cannot run it unsafely or twice. No scheduled job, storage service, paid service or new infrastructure (D-9).

## 10. Acceptance checks (for final approval)

These checks **await the owner's final approval.** Checks changed in v0.4 name the decision in brackets; §12 lists the old text.

Types: **P** positive · **N** negative / authorisation · **D** duplicate / reliability · **E** error / state · **M** phone / layout · **A** accessibility. Levels: **DB** database test · **BR** browser test with real (synthetic) accounts · **U** component test.

### Bell, panel and page (N-5, N-11)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-1 | The bell is shown on every signed-in parent, teacher and student page, including the status and profile pages of a teacher awaiting approval (D-5). | N-5 | P | BR |
| AC-2 | The bell number equals that user's unread notifications; shows 1–9 then "9+"; hidden at 0. | N-5 | P | DB + BR |
| AC-3 | Opening the panel lists the latest 10 (parent, teacher) or latest 20 (student sheet, D-7), newest first, each with title, one-line message, relative time **and** full date and time in the user's time zone, kind icon and an unread dot. | N-5 | P | BR |
| AC-4 | Opening the panel does not mark anything as read. | N-5 | P | BR |
| AC-5 | Clicking a row marks only that row read and opens its page. | N-5 | P | BR |
| AC-6 | "Mark as read" on one unread row, in the panel or on the full page, marks only that notification read; the user stays on the same screen; the bell number drops at once; menu badges are unchanged (D-2). | N-5 | P | BR |
| AC-7 | "Mark all as read" marks all of that user's notifications read; the bell shows no number; menu badges are unchanged (D-2). | N-5 | P | DB + BR |
| AC-8 | The parent and teacher Notifications pages show 20 at a time; "Show older" loads the next 20; the Unread chip shows only unread, All shows all (D-7). | N-5 | P | BR |
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
| AC-17 | Each event in §3 creates exactly one notification for each recipient listed and for nobody else; the person who acted is not notified (assumption 1). | N-1 | P / N | DB |
| AC-18 | No teacher notification contains a child's name or id (grade, curriculum, parent's first name only). | N-1 | N | DB |
| AC-19 | A student only receives learning updates — never prices, proposals, enquiries or parent details. | N-1 | N | DB |
| AC-20 | A parent never receives a notification about another family's child; after a guardian link is revoked, no new notifications about that child. | N-1, N-3 | N | DB |
| AC-21 | A worksheet shared with a child creates one student notification and one for **each active parent** of that child. | N-8 | P | DB |
| AC-22 | A worksheet shared with several children: each notification names only that child's own item; no other student's name or count appears. | N-8 | N | DB |
| AC-23 | Reading a worksheet notification never marks the homework or resource as done. | N-8, N-2 | N | DB + BR |
| AC-46 | A teacher awaiting approval receives only approval-status and profile notifications: no enquiry, proposal, link-request, listing or student notification is created for them or listed to them before approval; opening any notification re-checks their current approval status on the server (D-5). | N-1, N-3 | N | DB + BR |
| AC-47 | Super Admin and Admin pages show no bell and make no notification requests; the Super Admin home counts and the approval workflows are unchanged (D-6). | N-1 | N | BR + existing suites |
| AC-48 | The parent "Notifications" menu item opens the full Notifications page (the placeholder is gone); a teacher reaches the full page only from "See all" (teacher menu unchanged); a student has no "See all" and no full page, and the student sheet uses simple wording with no commercial or parent-specific information (D-7). | N-5, N-1 | P / N | BR |
| AC-53 | Public pages show no bell and make no notification requests (assumption 2). | N-3 | N | BR |

### Security (N-3, N-6)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-24 | List, count and page return only the signed-in user's notifications; signed-out requests go to sign-in. | N-3 | N | DB + BR |
| AC-25 | Marking another user's notification (by id) returns "not found" and changes nothing; "Mark all" affects only the signed-in user. | N-3 | N | DB |
| AC-26 | A notification link can only be an internal path; anything else is refused when created. | N-3 | N | DB |
| AC-27 | Opening a notification whose record the user may no longer see — tested for each cause: guardian relationship ended, teacher-child link removed, resource unshared, account deactivated, other permission revoked — shows only "This is no longer available to you.", reveals no title, contents, names, identifiers or other private information, and marks that notification read (D-8). | N-6 | N | BR + DB |
| AC-28 | Opening an authorised notification lands on the right record / page. | N-6 | P | BR |
| AC-49 | A notification never grants access: the destination re-checks permission on the server, and changing the link or record id in the browser shows nothing more than the same page shows today without a notification (D-8). | N-6, N-3 | N | BR + DB |

### Reliable triggers (N-4)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-29 | The same event processed twice (retry, double click, two tabs) creates one notification. | N-4 | D | DB |
| AC-30 | An expiry processed twice, including by two concurrent requests (a page load and a bell refresh), creates one notification per side (D-4). | N-4 | D | DB |
| AC-31 | An action notification's label follows its current business record: "Needs your reply" only while the action still needs this user's response; "Done" once completed; "No longer needed" once expired, withdrawn or otherwise ended (answered elsewhere, listing renewed …). The label never depends on read status (D-1). | N-4 | P | DB + BR |
| AC-32 | An event that fails and rolls back creates no notification (same transaction). | N-4 | D | DB |
| AC-33 | A listing reminder is not created again for the same listing period; renewing starts a new period. | N-4 | D | DB |
| AC-43 | When an action resolves, its notification's read status is unchanged (not marked read automatically); reading or marking a notification read never changes the business record, the action label or the action (D-1). | N-4, N-2 | N | DB + BR |
| AC-44 | Each bell count refresh runs the existing expiry checks for enquiries, rate proposals and teacher-link requests before counting; an item that passes its expiry time while its recipient's tab is visible produces its expiry notification in the bell within about 60 seconds, with no page load and no scheduled job (D-4). | N-4, N-7 | P | DB + BR |
| AC-45 | Expiry durations and rules are unchanged (enquiries, rate proposals, teacher-link requests: 14 days); the existing expiry tests pass unchanged (D-4). | N-4 | P | DB |
| AC-51 | No lesson reminder, cancellation or rescheduling notification, placeholder notification or simulated booking is created in CR-16 (D-10). | N-4 | N | DB + review |
| AC-52 | For each §3 event that already queues an email, the email is queued exactly as before (same template, recipient and de-duplication key) and the in-app notification is created independently; a retry creates no second notification; no email leaves the queue and nothing in the app says an email was sent or delivered; no WhatsApp message is attempted (D-11). | N-4 | D | DB |
| AC-54 | The CR-15 "Finish your learning package" banner shows on the teacher dashboard while the package needs details, whether or not its notification has been read, and clears only when the package is completed or withdrawn (assumption 3). | N-2 | P | DB + BR |

### Refresh (N-7)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-34 | While the tab is visible, a new notification appears in the bell number within 60 s without reloading. | N-7 | P | BR |
| AC-35 | While the tab is hidden, no notification requests are made; one check runs when it becomes visible. | N-7 | N | BR |

### Retention (N-9)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-36 | A read notification is removed once 90 days have passed since it was read, and an unread one once 180 days have passed since it was created, at the next clean-up run; newer ones stay; same for parent, teacher and student (D-3, D-9). | N-9 | P | DB |
| AC-37 | Removing notifications never deletes, hides, changes or resolves the underlying records; menu badges are unchanged by retention (D-3). | N-9 | N | DB |
| AC-50 | Clean-up runs during normal requests at most once an hour; two concurrent requests run it at most once; no scheduled job is added (D-9). | N-9 | D | DB |

### States, phone and accessibility (N-11)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-38 | Loading shows skeleton rows; empty shows "You're all caught up"; the student empty state is child-friendly. | N-11 | E | U + BR |
| AC-39 | If notifications fail to load: bell without a number, panel message with Try again; the page and menu badges still work. | N-11 | E | U + BR |
| AC-40 | Phone (390 px): the panel is a bottom sheet; no sideways scrolling; touch targets ≥ 44 px. | N-11 | M | BR |
| AC-41 | Keyboard: Enter / Space opens, Tab moves through rows, Esc closes and returns focus; bell named "Notifications, N unread"; badges read "N waiting for you"; no serious axe issues. | N-11 | A | BR |
| AC-42 | Existing dashboards, enquiries, proposals, homework and listing pages behave exactly as before (full existing suites pass). | N-11 | P | all |

**Traceability:** N-1 → AC-17–20, 46–48 · N-2 → AC-10–16, 23, 43, 54 · N-3 → AC-20, 24–26, 46, 49, 53 · N-4 → AC-29–33, 43–45, 51–52 · N-5 → AC-1–8, 48 · N-6 → AC-27–28, 49 · N-7 → AC-34–35, 44 · N-8 → AC-21–23 · N-9 → AC-36–37, 50 · N-10 → this table (every check has a requirement, type and level) · N-11 → AC-9, 38–42.

## 11. Decisions (resolved, OC-115) and assumptions

Each decision below was accepted by the owner on 19 Oct 2026, 23:51 IST (OC-115). The v0.3 proposal is kept under "Proposed in v0.3" as history.

**D-1 — Stale action notifications.** **Decided (owner, 19 Oct 2026, OC-115).** Keep the original notification as history. When its underlying action is completed, answered, withdrawn, expired, renewed or otherwise resolved, its action label updates dynamically: "Needs your reply" only while the action genuinely requires the recipient's response; "Done" when completed; "No longer needed" when expired, withdrawn or otherwise no longer requiring a response. The label comes from the current business record, not from read status. Resolving the action does not mark the notification read, and reading never completes or changes the business action.
*Proposed in v0.3:* Keep the notification in the list as history; replace "Needs your reply" with "Done" / "No longer needed", worked out live from the record. Its read state is unchanged. *Alternative:* mark it read automatically. (Why it mattered: N-4 asks for no stale reminders.)

**D-2 — Mark one notification as read.** **Decided (owner, 19 Oct 2026, OC-115).** A separate "Mark as read" control on each unread notification, in the panel and on the full page. It affects only that notification and the user stays on the screen. Opening a row may mark it read and navigate. Opening the panel alone must not mark anything read. "Mark all as read" affects only the signed-in user's notifications. The bell unread count updates. Menu action badges are unchanged unless the business action changes.
*Proposed in v0.3:* Add a small "Mark as read" control on each unread row (panel and page). (Why it mattered: N-5 asks for marking individual notifications; v0.2 only marked on click.)

**D-3 — Retention.** **Decided (owner, 19 Oct 2026, OC-115).** Read notifications: 90 days after being marked read. Unread: 180 days after creation. After that they may be removed through the approved clean-up mechanism (D-9). Retention never deletes, hides, modifies or resolves business records (enquiry, proposal, teacher-link request, assignment, worksheet, booking …). Badges are computed from business records independently of notifications. The same rules apply to parent, teacher and student. No storage or paid clean-up service.
*Proposed in v0.3:* Confirm 180 days for unread (or choose another period). Read: 90 days (confirmed). (Why it mattered: 180 days was proposed in OC-106 (6), "subject to review".)

**D-4 — When "expired" notifications appear.** **Decided (owner, 19 Oct 2026, OC-115).** Run the existing expiry checks when the bell / count refreshes, as well as on business pages, so expiry notifications appear within about 60 seconds while a user is active. No paid service and no new scheduled-job infrastructure. Expiry durations and rules (enquiries, rate proposals, teacher-link requests) do not change. Badges exclude items whose expiry time has passed even if the lazy expiry hasn't run. Expiry processing and notification creation are idempotent (no duplicates). If no user is active, the notification is created on the next appropriate request.
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

## 12. Changes from v0.3 to v0.4

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
- **AC-1, AC-3, AC-6, AC-8, AC-27, AC-31, AC-36:** wording narrower than or different from the decisions; amended (§12). No remaining conflict.
- **AC-24 and D-5:** AC-24 lists all of the user's notifications. D-5 says every notification enforces *current* status. For a teacher who is approved and later suspended or sent back for changes, it is not decided whether earlier marketplace notifications stay in their list or are hidden (Q-4).
- **D-1 and D-8 both talk about read status** — not a conflict: D-1 forbids marking read *when the action resolves*; D-8 marks read only *when the user opens* a notification they can no longer access.
- **AC-52 and existing email keys:** see 13.2 (5).

### 13.2 With the existing implementation (inspected in `src/`)
1. **Enquiry expiry and withdrawal have no event hook.** `expireEnquiries` (src/server/teacherEnquiries.ts) is a plain `UPDATE` with no `RETURNING`, audit or email; `withdrawEnquiry` queues no email. To notify "the other side" (§3), the expiry must return the expired rows. The expiry rule (pending and `expires_at <= now`) stays the same. Worksheet sharing (`shareNewResource`, `shareWithMore` in teacherResources.ts) and the CR-15 package conversion (pricingMigration.ts, migration not applied, OC-106) also queue no email. v0.3 §5 said `notify` sits "next to each existing `queueEmail`" — corrected.
2. **Expiry is not atomic on read paths.** `expireLinkRequests` (teacherLinks.ts) and `expireRateNegotiations` (rateNegotiations.ts) run the `UPDATE … RETURNING`, then the audit and `queueEmail` as separate statements. On page loads they are called with the connection pool, not a transaction (for example `listMyTeachers`). If a request fails after the `UPDATE`, the record is expired but its email — and, once built, its notification — is lost for good, because the next run no longer selects it. §5, AC-32 and D-4 (idempotent) need each expiry sweep wrapped in a transaction. Durations and rules don't change. Concurrent sweeps are already safe: the second `UPDATE` re-checks the status and returns nothing, and the unique key is a backstop.
3. **The bell refresh becomes a write request.** D-4 makes each 60-second refresh run three sweeps across *all* users' records, not only the viewer's. `teacher_enquiries` and `rate_negotiations` have no index on `expires_at` (`teacher_student_links` has a partial index for `requested`). That's fine at today's volume; see Q-8.
4. **No hourly throttle exists.** Nothing in the code limits a task to once an hour. An in-memory timer isn't shared between server instances, so D-9 needs a stored last-run time and a database lock (the `pg_advisory_xact_lock` pattern is already used in src/server/files/limits.ts). This is additive (migration 0025) and free.
5. **Some email keys are time-based.** Most §3 events use event-based email keys (`enquiry_received:<id>`, `link_request_answered:<id>`, `rate_expired:<id>:<address>`). Two don't: `link_request:<teacher>:<time>` (teacherLinks.ts) and `teacher_decision:<teacher>:<time>` (admin.ts, for changes requested / not approved). For these, today's protection against duplicates comes from the status checks under row locks, not from the key. D-11 asks for both "existing email behaviour maintained" and "retries create no duplicate queued emails"; changing these keys would change existing email behaviour (Q-7). Notification keys will be event-based in all cases.
6. **CR-15 banner:** src/app/teacher/page.tsx shows "Finish your learning package" from `packageNeedsDetails`, a business-state value from teacherHome.ts. This matches assumption 3; no change is needed.
7. **Two "waiting" numbers on the teacher home.** The home summary "Enquiries waiting" counts pending enquiries only. The new Enquiries menu badge (§4.1) also counts rate proposals waiting for the teacher. Both are right, but they can differ on the same screen. No change is proposed (existing behaviour preserved); noted so it isn't reported as a bug.
8. **Teachers awaiting approval:** the teacher layout gives a pending teacher the status and profile pages only (`TEACHER_PENDING_MENU`), and gives a **not approved** teacher no menu at all (OC-72). D-5 doesn't say whether a not-approved teacher sees the bell (Q-2). Link requests to a pending teacher are already held until approval (CR-12 Reading A); their "Link request sent" notification must be created in the approval transaction, which matches D-5.
9. **Admin:** the Super Admin home shows counts only (active parents, active teachers, teachers waiting for approval). D-6 leaves this unchanged. No conflict.
10. **The parent placeholder was meant for settings.** /parent/notifications says "Notification settings come with email and WhatsApp reminders (Phase 7)", and the parent home card links to it with a button labelled "Notification settings" beside email and WhatsApp status chips. D-7 replaces the page with the notification list, so that button would open a list, not settings. Where notification preferences go later is undecided (Q-5).
11. **Destination pages can't show the D-8 message today.** Most §3 destinations are list pages (/teacher/enquiries, /student/homework, /parent/teachers) that simply leave out records the user can't see; per-record pages use `notFound()` (a 404). Neither shows "This is no longer available to you." The build needs a server-side "open notification" step that re-checks access to the linked record for each entity type, shows the neutral message itself, and only then redirects. The existing destination checks stay as they are.

### 13.3 Test implications
- **Time:** the server functions already accept `now`, so DB tests can cover 90 / 180 days, the hourly throttle and expiry without waiting.
- **Concurrency:** AC-30 and AC-50 need DB tests with two real parallel connections (two sweeps, two clean-ups), not sequential calls.
- **60-second checks** (AC-34, AC-44) need a controlled browser clock, so the suite doesn't wait in real time.
- **Existing expiry tests** (tests/db/teacherEnquiries, teacherRequests, rateNegotiations, pricingNegotiations, teacherListings) must pass unchanged after the sweeps are wrapped in transactions (AC-45). Tests that count `email_outbox` rows must still give the same counts (AC-52).
- **Labels and access:** AC-31 needs one case for each record state of each action type. AC-27 needs one case for each of the five causes.
- **Negative pages:** AC-47 and AC-53 need browser checks on admin and public pages, including network requests.

### 13.4 New questions (not decided here)
- **Q-1 — D-1 labels per record.** Claude's reading, for confirmation: enquiry — accepted or declined by the teacher = Done; withdrawn or expired = No longer needed. Link request — accepted or declined = Done; withdrawn by the parent or expired = No longer needed. Proposal or counter-offer — answered or countered by the recipient = Done; withdrawn by the other side or expired = No longer needed. Package needs details — completed = Done; withdrawn = No longer needed. Is a decline "Done"? Does the listing-ends reminder (kind *reminder*, but counted as an action by the badge) carry these labels too?
- **Q-2 — Teachers who are not approved.** They see only a status message and no menu (OC-72). Do they get the bell, so they can see "Your profile was not approved"?
- **Q-3 — Profile-change decisions.** D-5 mentions "profile updates". Emails already exist for approved or declined profile changes (`teacher_profile_change_approved` / `_declined`), but §3 lists no such event. Add them to §3?
- **Q-4 — Earlier notifications after status or access changes.** For a teacher later suspended or sent back for changes (D-5), and for a parent whose guardian link has ended (D-8): do earlier notifications stay in the list with their original titles (neutral message on opening), or are they hidden or redacted in the list?
- **Q-5 — Parent "Notification settings".** Should the parent home button be relabelled "Notifications" when the page becomes the list? Where will notification preferences go when email and WhatsApp are approved?
- **Q-6 — Listing reminders.** `queueListingReminders` is also lazy (it runs when teachers open their pages and when public listings are read) but isn't named in D-4. Should it also run on bell refresh, or keep its current triggers?
- **Q-7 — Time-based email keys.** Keep `link_request:` and `teacher_decision:` keys as they are (protection from status checks) or make them event-based? The second option changes existing email behaviour.
- **Q-8 — Sweep frequency.** Run the expiry sweeps on every 60-second refresh as decided, or also limit them to once a minute across all users to save database work? This would not change when an active user sees the notification by more than about a minute.

## 14. What I need from you

Final approval of N-1 to N-11 and AC-1 to AC-54 (or changes), and answers to Q-1 to Q-8 where you want to decide them before the build. Implementation starts only after final approval.
