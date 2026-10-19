# CR-16 — In-app notifications (bell) and dashboard action badges

**Version:** 0.5 · 20 Oct 2026 · **Status:** documentation-only revision at the owner's request (20 Oct 2026, 00:07 IST, OC-116) — **nothing built.** Decisions D-1 to D-11 and the four §11 assumptions stay **resolved** (owner, 19 Oct 2026, 23:51 IST, OC-115) and are unchanged. Requirements N-1 to N-11 and acceptance checks AC-1 to AC-66 **await the owner's final approval** (OC-113 (2)). **Implementation is not authorised.** ₹0 spent; no email or WhatsApp message has been sent; no application code, migration, test, test data or deployment was changed for this revision.
**Source:** owner requirement "Centralised Notifications and Dashboard Action Badges" (19 Oct 2026, 13:27 IST); decisions OC-106 (14:10 IST), OC-113 (19:21 IST) and OC-115 (23:51 IST); documentation review request OC-116 (20 Oct 2026, 00:07 IST). **Budget:** ₹0 — in-app only; no paid service, no new infrastructure, no email or WhatsApp sending.
**Boards:** NB0–NB4 on the design canvas (page "CR-16 Notifications"). They show content and behaviour; the build uses the approved signed-in design (tinted card headers, chip-style All / Unread filters, responsive desktop layout, bottom sheet on phones) without changing content, triggers, permissions or behaviour (OC-113 (1)).

**What changed from v0.4:** review of the requirement-to-check links (OC-116). No business rule, decision or approved design was changed. Terms are defined once (§0); badge calculations (§4.1), action labels (§6.1), pagination (§6.2), refresh after the user's own action (§7.1), the listing-reminder trigger and timing (§7.3), error and offline behaviour (§7.4) and retention timestamps (§9) are now exact; eleven checks were tightened and twelve added (AC-55 to AC-66, 54 → 66 checks); a full traceability matrix replaces the one-line list (§15). Every change is listed in §14.
**What changed from v0.3 (kept for history):** D-1 to D-11 decided and the four assumptions accepted (§11); requirements and checks updated to match, and twelve checks added (AC-43 to AC-54) — every change is listed in §12; conflicts with existing checks, the current code and the tests are listed in §13, with eight new questions.
**What changed from v0.2 (kept for history):** requirements numbered N-1 to N-10 (the owner's ten principles) and N-11 (design); every acceptance check names its requirement, type and test level (§10); checks added for individual "mark as read", absolute date and time, navigation when access has ended, stale action notifications, worksheet privacy, hidden-tab behaviour, sign-out and the phone sheet; 30 checks became 42; §11 listed every open decision and assumption.

## Resolved and remaining items

| | Item | State |
|---|---|---|
| Resolved | D-1 to D-11 | Decided by the owner, 19 Oct 2026, 23:51 IST (OC-115). All eleven v0.3 proposals accepted, with the owner's added detail (§11). Unchanged in v0.5. |
| Resolved | Assumptions 1–4 (§11) | Accepted by the owner (OC-115). |
| Resolved (documentation) | Q-1 — action labels per record | Answered by reading D-1 literally; the full per-record table is §6.1 and is tested by AC-31. Approving AC-31 confirms it; the owner may change any row. |
| Remaining | N-1 to N-11, AC-1 to AC-66 | **Await the owner's final approval.** Nothing is built until then. |
| Remaining | Q-2 to Q-5, Q-7, Q-8 (§13.4) | Business decisions; **not** decided here. |
| Remaining | Q-6 — listing-reminder trigger (§7.3) | The documentation gap is closed (what is created, by which code, once per period, worst-case timing). The owner's choice remains: keep today's trigger (option A, the default until decided) or also run the reminder sweep on the bell refresh (option B, recommended). |
| Remaining | Clarifications C-1 to C-4 (§13.5) | Made in v0.5 so that the checks are testable; each follows from an existing decision or repository rule, and the owner may change them on approval. |

**Commitments for this change (unchanged by the decisions):**
- **Design:** the approved design is reused — tinted card headers, chip-style All / Unread filters, responsive desktop layout and a bottom sheet on phones (OC-113 (1)). No unrelated redesign.
- **Cost:** ₹0 additional spend; no paid services; no new infrastructure or scheduled jobs. No emails or WhatsApp messages are sent — email stays queued-only in `email_outbox`.
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
| **Clean-up** | The retention run that removes notifications (§9, D-9). |
| **Now** | The server's current time. All stored times are `timestamptz` (an absolute instant, stored in UTC); comparisons never depend on a time zone. Times are **shown** in the account's own time zone (`accounts.time_zone`). |

## 1. What exists today (code inspection, 19 and 20 Oct 2026)

| Area | Found | Gap |
|---|---|---|
| In-app notifications | **None.** No table, bell or panel. The parent menu has a "Notifications" item that opens a placeholder ("Notification settings come with email and WhatsApp reminders"); the parent home card links to it as "Notification settings". | Everything below; see Q-5 |
| Email | `email_outbox` with a unique `dedupe_key`; templates queued at the business event. **Queued only — no email is sent.** Enquiry expiry, enquiry withdrawal and worksheet sharing queue no email. | Used as the event hook where an email exists (§5) |
| Pending counts | Teacher home: link requests waiting (CR-12 TR3), rate proposals waiting (CR-13 RN4), "Enquiries waiting" summary, CR-15 "Finish your learning package" banner. Teacher enquiries page lists pending enquiries. Super Admin home: counts only (including teachers waiting for approval). | Not on menus; not shared across pages |
| Expiry | Enquiries, link requests and rate proposals (14 days each) are expired **when a relevant page is next loaded** (`expireEnquiries`, `expireLinkRequests`, `expireRateNegotiations`), not by a scheduled job. | Run on bell refresh too (D-4, §7) |
| Listing reminder (v0.5) | `queueListingReminders` (src/server/teacherListings.ts) queues one `listing_expiry_reminder` email per listing period, 7 days before the end, for published listings of active, approved teachers. It sweeps **all** teachers' listings (up to 100 per run). It is called **only** when a teacher opens /teacher/listing (src/app/teacher/listing/page.tsx); the code comment's "and when public listings are read" is not implemented (§13.2 (12)). | No in-app reminder; trigger and timing defined in §7.3 |
| Real time | None (server-rendered pages, no websockets). | 60-second refresh (§7) |

## 2. Requirements

These requirements **await the owner's final approval.** Text added in v0.4 to reflect a decision names that decision. v0.5 changed wording only where marked "(v0.5)"; no requirement's business meaning changed.

| ID | Requirement (owner principle, OC-113 (2); refined by OC-115) |
|---|---|
| **N-1** | **Role-based notifications.** Parents, teachers and students receive only notifications relevant to their role and authorised relationships. A teacher awaiting approval receives only approval-status and profile notifications (D-5). Super Admin and Admin have no notifications in CR-16 (D-6). |
| **N-2** | **Action badges ≠ unread notifications.** Menu badges count outstanding actions from the records' state (§4.1, v0.5); reading a notification never completes or clears an action. |
| **N-3** | **Security.** Every notification, linked record and count is protected by server-side authorisation; no access to another child's or family's data. |
| **N-4** | **Reliable triggers.** One notification per authorised recipient per event (no duplicates); no stale action labels — an action notification's label follows the current business record (D-1); changes to the underlying record handled correctly. Lesson reminders, cancellations and rescheduling are out of scope for CR-16 (D-10). |
| **N-5** | **Dashboard bell.** Unread count, notification list, date and time, read status; mark one (without leaving the screen) or all as read (D-2). |
| **N-6** | **Navigation.** Clicking a notification opens the record only when the user is still authorised to see it; otherwise a neutral "This is no longer available to you." (D-8). A notification never grants access. |
| **N-7** | **Refresh.** Every 60 seconds while the tab is visible; skipped while hidden; immediate after the user's own actions (including "Mark as read", D-2) — the bell number and the affected menu badges (§7.1, v0.5). Each refresh also runs the existing expiry checks (D-4). |
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
| Enquiry expired / withdrawn | The other side | Update | "Your enquiry to Teacher B expired" | Enquiries page |
| Link request sent (after teacher approval) | Teacher | Action | "Anita asked you to teach a Grade 5 child" | /teacher/students |
| Link request accepted / declined / expired | Parent | Update | "Teacher B accepted your link request for Kiran" | /parent/teachers |
| Rate proposal received (hourly / package / earlier price) | Teacher | Action | "New package price proposal" | /teacher/enquiries/rates |
| Counter-offer | The other side | Action | "Teacher B made a counter-offer (offer 2 of 6)" | that side's Rate proposals |
| Rate proposal accepted / declined / withdrawn | The other side | Update | "Anita accepted ₹550 per hour" | Rate proposals |
| Rate proposal expired | Both sides | Update | "Your proposal to Teacher B expired" | Rate proposals |
| Teacher shares a worksheet / resource with a child (CR-07) | That **student** and **each active authorised parent** of that child (separately) | Update | "New worksheet from Teacher B: Fractions" | /student/homework · /parent/homework |
| Listing ends in 7 days (existing L-2 reminder; trigger and timing §7.3) | Teacher | Reminder | "Your listing ends on 26 Oct" | /teacher/listing |
| Converted package needs details (CR-15 A5) | Teacher | Action | "Finish your learning package" | /teacher/listing |
| Teacher approved / changes requested / not approved | Teacher (including while awaiting approval, D-5) | Update | "Your profile was approved" | /teacher or /teacher/status |

**Not in this change:** lesson bookings, cancellations, rescheduling and 15-minute lesson reminders — out of scope; added when the booking and scheduling phases are built, under the CR-16 principles, and the 15-minute reminder requirement is kept for that workflow (D-10); homework submissions and marking (CR-07 H-3, H-4); package arrangements (CR-15 Phase B); Super Admin / Admin notifications (D-6). No placeholder notification or simulated booking is created for a workflow that doesn't exist.

**Content rules:**
- A teacher's notification never contains a child's name or id — grade, curriculum and the parent's first name only (FR-040.9, CR-12 B). This applies whether or not a teacher–child link exists, and to the title, message, link path and every response the browser receives.
- A teacher awaiting approval gets approval-status and profile notifications only — no marketplace, enquiry, rate proposal, link request or student notifications until approved (D-5).
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
- Counts compare `expires_at` with now, so an item whose expiry time has passed is excluded even before an expiry sweep has changed its status (§1, D-4).
- A badge counts only the signed-in user's records; an id in a URL or request body is never used to choose whose records are counted.
- The "Looking for students" listing term matches the existing listing-page rule (`renewalDue`); the reminder notification (§7.3) and the badge are independent: the badge can show without a reminder notification (for example, when no reminder sweep ran in the window).
- **Known difference, preserved:** the teacher home summary "Enquiries waiting" counts pending enquiries only, while the Enquiries badge also counts rate proposals waiting for the teacher (§13.2 (7)).

## 5. Data model (migration 0025, additive, existing free database)

`notifications`: `id` uuid · `recipient_id` → accounts (on delete cascade) · `kind` (`action`, `update`, `reminder`) · `type` (e.g. `enquiry_received`) · `title` (≤ 120) · `body` (≤ 300) · `href` (internal path only, checked `^/[a-z]`) · `entity_type`, `entity_id` (the underlying record) · `dedupe_key` (unique) · `created_at` (`timestamptz`, set once at insert) · `read_at` (`timestamptz`, empty until first read; set once, never moved or cleared).
Indexes: `(recipient_id, created_at desc, id desc)`; partial `(recipient_id) WHERE read_at IS NULL`.
A small stored "last clean-up" time (one row) lets clean-up run at most once an hour across all server instances (D-9).

- Created by one server helper `notify(tx, …)` called in the **same transaction** as the business change — next to the existing `queueEmail(…)` where the event already queues an email, and at the same point for events that queue none (enquiry expired / withdrawn, worksheet shared, package needs details). Unique `dedupe_key` built from the event (never the clock) + `ON CONFLICT DO NOTHING` → a retried or repeated event never duplicates. Examples (v0.5): `enquiry_received:<enquiry id>:<recipient id>`; `rate_offer:<rate proposal id>:<offer number>:<recipient id>`; `listing_reminder:<listing id>:<expires_at ISO>:<recipient id>`; `worksheet_shared:<share id>:<recipient id>`.
- Rate proposal action notifications record the offer number they announce (in the key above), so the action label (§6.1) can tell the current offer from earlier ones.
- **Two independent channels (D-11):** one in-app notification per authorised recipient, and the existing queued email exactly as today. Each channel has its own de-duplication. No email is sent: `email_outbox` stays queued-only until an email provider and its cost, privacy, security and delivery requirements are approved. A queued email is never shown or reported as delivered. No WhatsApp or other external messaging.
- Read / mark-all: `UPDATE … SET read_at = now WHERE recipient_id = <signed-in user> AND read_at IS NULL [AND id = …]` — one statement, so "Mark all" changes all or nothing; another user's id matches nothing; an already-read row keeps its first `read_at`.
- List and count queries always filter by the signed-in user; there is no way to request another user's notifications.
- Users can't delete notifications; only retention removes them (§9).

## 6. Screens (boards, built in the approved design)

- **Bell** in the top bar of every signed-in parent, teacher and student page (beside theme and account), including the status and profile pages open to a teacher awaiting approval (D-5); unread number in the primary colour. **No bell** on public pages (assumption 2) or on Super Admin / Admin pages (D-6).
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
| Teacher (incl. awaiting approval) | Latest **10**; "See all notifications" link | **20** per load; All / Unread chips; reached only from "See all" | As parent |
| Student | Latest **20**, all notifications, child-friendly sheet | **None** in CR-16 | **None.** Older notifications are not reachable by the student in CR-16; they remain stored until retention removes them (§9) |

- **Order:** newest first by `created_at`, then `id` (both descending) so equal times have a stable order.
- **"Show older"** continues from the last row shown (keyset on `created_at`, `id`), so notifications that arrive meanwhile never cause a row to repeat or be skipped; new arrivals appear at the top on the next refresh or reload.
- **Unread chip:** shows unread rows only, paged the same way; the chip's (n) is the bell number. A row marked read while the Unread chip is active stays visible (shown as read) until the filter is changed or the page reloads, so rows don't jump under the pointer.
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

- While the tab is visible the bell re-checks every 60 seconds; the same request returns the unread count **and** the user's menu badges (clarification C-1); **no requests while the tab is hidden**; one check when it becomes visible again.
- **Each count refresh first runs the existing expiry sweeps** for enquiries, rate proposals and link requests, as business pages already do (D-4). An expiry notification therefore reaches an active recipient within about 60 seconds of the expiry time. If nobody is active, it is created on the next appropriate request. Expiry durations and rules are unchanged; no scheduled job or paid service is added.
- Clean-up (§9) may run as part of the same request, at most once an hour.

### 7.3 Listing-reminder notification: trigger and timing (v0.5; Q-6 option open)

- **What:** one in-app reminder notification ("Your listing ends on …", kind `reminder`) per listing period, to the listing's teacher, when the existing L-2 rule selects the listing: status `published`, `expires_at > now`, `expires_at ≤ now + 7 days`, teacher account active and approved, and `reminder_queued_for` differs from `expires_at`.
- **How:** created by `queueListingReminders` inside the **same transaction** that sets `reminder_queued_for` and queues the existing `listing_expiry_reminder` email, keyed `listing_reminder:<listing id>:<expires_at ISO>:<teacher id>`. The email is queued exactly as today (same template, recipient, payload and key); it is not sent. Renewing sets a new `expires_at`, so the next period gets its own single reminder. A paused, withdrawn or ended listing gets none (unchanged rule).
- **When — option A (today's trigger, the default until Q-6 is decided):** the sweep runs when **any** teacher opens /teacher/listing; it covers all teachers' due listings. The reminder appears at the first such page load at or after `expires_at − 7 days`. **Worst case:** if no teacher opens that page during the 7 days before the end, no reminder is created (the same is true of the email today); the "Looking for students" badge still shows that renewal is due.
- **When — option B (recommended, ₹0, Q-6):** the reminder sweep also runs on each bell refresh and signed-in page load, beside the expiry sweeps (D-4 pattern; no scheduler). The reminder then appears within about 60 seconds of becoming due while **any** signed-in user has a visible tab, otherwise at the next signed-in request by anyone. **Worst case:** if no signed-in user makes any request during the whole 7-day window, none is created. Option B queues the existing email earlier than today in some cases (same email, same key), which is why the owner decides.
- **Inactive teacher (both options):** the reminder is created by whoever triggers the sweep; the teacher sees it in the bell at their next sign-in, if it was created before the listing ended. Nothing is sent outside the app.

### 7.4 Errors and offline (N-11, v0.5)

- **Load failure:** the bell shows without a number, the panel shows an error with **Try again**, and the rest of the page and the menu badges still work.
- **Offline** (the existing `OfflineBanner`): the existing offline banner shows; the bell keeps its last number; no repeated error messages; one check runs when the connection returns.
- **Mark as read fails:** the row stays unread, the bell number goes back to its previous value, and the row shows "Couldn't mark as read. Try again." with a retry control. **Mark all fails:** nothing changes (one statement, §5) and the same message shows once.
- **"Show older" fails:** rows already shown stay; a Try again control appears under them.
- **Opening a notification fails** (server error): the user stays on the current screen with an error and Try again; the notification is not marked read.
- No error message names a record, child or other user.

## 8. Security summary (N-3, N-6)

- Every list, count, mark-read, open and "Show older" request checks the signed-in session on the server; without a session → sign-in; the request only ever touches the session user's rows.
- A notification id or "Show older" position that is not the user's own gives exactly the same result as one that does not exist ("not found", nothing changed, no extra data) — no way to discover other users' notifications.
- A notification's link is only a path and **never grants access** (D-8). Opening goes through one server-side "open notification" step that re-checks, against current status and permissions, whether the user may still see the linked record; the destination page also applies its own permission checks exactly as today. If access has ended (guardian relationship ended, teacher–child link removed, resource unshared, account deactivated or any other permission revoked), the user sees "This is no longer available to you." and nothing about the record — no title, contents, names or identifiers, in the page, the browser address or any response — and the notification is marked read (the bell number drops by one if it was unread).
- A teacher awaiting approval: every notification and destination enforces the teacher's current approval status on the server; nothing bypasses approval. The existing approval workflow and status records are the source of truth (D-5).
- Notifications are created only by server code at business events — never from browser input.
- Public pages never load notification data (assumption 2).

## 9. Retention (N-9)

- Read notifications are removed **90 days after they were read**; unread ones **180 days after creation** (D-3). Same rules for parent, teacher and student.
- **Clocks (v0.5):** the read clock starts at `read_at` (the first time the notification was read — opened, marked read or included in "Mark all"; never moved later). The unread clock starts at `created_at`. Both are absolute instants (`timestamptz`), so time zones and daylight-saving changes don't matter.
- **"After 90 / 180 days"** means a fixed duration of exactly 90 × 24 hours (or 180 × 24 hours) from that timestamp. A notification becomes **eligible** for removal when `now ≥ read_at + 90 days` (read) or `now ≥ created_at + 180 days` while `read_at` is still empty (unread). It is removed by the first clean-up run that starts at or after that moment; before that it stays visible.
- A notification read late keeps its new clock: for example, one read on day 170 after creation is eligible 90 days after that reading (day 260), not on day 180.
- Removing a notification never deletes, hides, changes or resolves the underlying enquiry, rate proposal, link request, assignment, worksheet or booking; those keep their own status and pages, and menu badges keep counting them.
- Clean-up runs as part of normal signed-in requests (page loads and bell refreshes), **at most once an hour** across all server instances (stored last-run time and a database lock, §13.2 (4)); the limits are met at the next eligible activity, not at the exact minute. Concurrent requests cannot run it unsafely or twice. No scheduled job, storage service, paid service or new infrastructure (D-9).

## 10. Acceptance checks (for final approval)

These checks **await the owner's final approval.** Checks changed in v0.4 name the decision in brackets; checks changed or added in v0.5 are marked **(v0.5)** and listed in §14 with their old text.

Types: **P** positive · **N** negative / authorisation · **D** duplicate / reliability · **E** error / state · **M** phone / layout · **A** accessibility · **R** review. Levels: **DB** database test · **BR** browser test with real (synthetic) accounts · **U** component test · **review** document or code review.

### Bell, panel and page (N-5, N-11)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-1 | The bell is shown on every signed-in parent, teacher and student page, including the status and profile pages of a teacher awaiting approval (D-5). | N-5 | P | BR |
| AC-2 | The bell number equals that user's unread notifications; shows 1–9 then "9+"; hidden at 0. | N-5 | P | DB + BR |
| AC-3 **(v0.5)** | Opening the panel lists, newest first (`created_at`, then `id`, descending): parent and teacher — the latest 10; student sheet — the latest 20 (D-7). Tested with 25 notifications: parent / teacher see exactly items 1–10, the student exactly items 1–20, and the 21st is not shown. Each row shows title, one-line message, relative time **and** full date and time in the account's time zone (`accounts.time_zone`), kind icon and an unread dot. | N-5 | P | BR |
| AC-4 | Opening the panel does not mark anything as read. | N-5 | P | BR |
| AC-5 | Clicking a row marks only that row read and opens its page (through the server-side open step, §8). | N-5 | P | BR |
| AC-6 | "Mark as read" on one unread row, in the panel or on the full page, marks only that notification read; the user stays on the same screen; the bell number drops at once; menu badges are unchanged (D-2). | N-5 | P | BR |
| AC-7 | "Mark all as read" marks all of that user's notifications read; the bell shows no number; menu badges are unchanged (D-2). | N-5 | P | DB + BR |
| AC-8 **(v0.5)** | The parent and teacher Notifications pages show 20 at a time, newest first; "Show older" loads the next 20 of the active filter and is hidden when none are older; the Unread chip shows only unread and its (n) equals the bell number; All shows all (D-7, §6.2). | N-5 | P | BR |
| AC-9 | The panel and page use the approved design (tinted header, chip filters, responsive desktop, phone bottom sheet) and match the rest of the app. | N-11 | P | BR (screenshot review) |
| AC-63 **(v0.5)** | Paging is stable: with 45 notifications, two "Show older" loads return items 21–40 and 41–45 with no repeat and no gap, also when 3 new notifications arrive between loads and when several share the same `created_at`; the panel never offers "Show older"; the student has no "Show older", no "See all" and no page (§6.2). | N-5 | P | DB + BR |

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
| AC-17 | Each event in §3 creates exactly one notification for each recipient listed and for nobody else; the person who acted is not notified (assumption 1). | N-1 | P / N | DB |
| AC-18 **(v0.5)** | No teacher notification contains a child's name or id (grade, curriculum, parent's first name only) — checked in the stored title, message and link, and in the panel, page and network responses, for teachers with and without a teacher–child link to that child. | N-1, N-3 | N | DB + BR |
| AC-19 | A student only receives learning updates — never prices, rate proposals, enquiries or parent details. | N-1 | N | DB |
| AC-20 | A parent never receives a notification about another family's child; after a guardian link is revoked, no new notifications about that child. | N-1, N-3 | N | DB |
| AC-21 | A worksheet shared with a child creates one student notification and one for **each active parent** of that child. | N-8 | P | DB |
| AC-22 | A worksheet shared with several children: each notification names only that child's own item; no other student's name or count appears. | N-8 | N | DB |
| AC-23 | Reading a worksheet notification never marks the homework or resource as done. | N-8, N-2 | N | DB + BR |
| AC-46 | A teacher awaiting approval receives only approval-status and profile notifications: no enquiry, rate proposal, link request, listing or student notification is created for them or listed to them before approval; opening any notification re-checks their current approval status on the server (D-5). | N-1, N-3 | N | DB + BR |
| AC-47 | Super Admin and Admin pages show no bell and make no notification requests; the Super Admin home counts and the approval workflows are unchanged (D-6). | N-1 | N | BR + existing suites |
| AC-48 **(v0.5)** | The parent "Notifications" menu item opens the full Notifications page (the placeholder is gone); a teacher reaches the full page only from "See all" (teacher menu unchanged); a student has no "See all", no "Show older" and no full page (the student URL for a full page, if tried, shows nothing more than today), and the student sheet uses simple wording with no commercial or parent-specific information and no action labels (D-7). | N-5, N-1 | P / N | BR |
| AC-53 **(v0.5)** | Public pages show no bell, make no notification requests, and contain no notification data in their HTML (assumption 2). | N-3 | N | BR |

### Security (N-3, N-6)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-24 | List, count and page return only the signed-in user's notifications; signed-out requests go to sign-in. | N-3 | N | DB + BR |
| AC-25 | Marking another user's notification (by id) returns "not found" and changes nothing; "Mark all" affects only the signed-in user. | N-3 | N | DB |
| AC-26 | A notification link can only be an internal path; anything else is refused when created. | N-3 | N | DB |
| AC-27 **(v0.5)** | Access ended (D-8). For **each** of the five causes — (1) guardian relationship ended, (2) teacher–child link removed, (3) resource unshared, (4) account deactivated, (5) another permission revoked (for example, a teacher's approval suspended or sent back for changes) — seed an **unread** notification whose record the user can open, then remove access, then open the notification. Assert: (a) the screen shows exactly "This is no longer available to you." and no other content about the record; (b) the page HTML, the browser address and every network response contain no title, contents, names or identifiers of the record; (c) the notification's `read_at` is set; (d) the bell number in that response is exactly one lower; (e) menu badges are unchanged; (f) the server re-checked access at the time of opening (removing access after the list was shown still gives the message) and the destination page was not rendered. Repeat with an already-read notification: same message, `read_at` unchanged. Where the existing destination rules keep a record visible after a cause, the test asserts the record still opens (no false message). | N-6, N-3 | N | BR + DB |
| AC-28 | Opening an authorised notification lands on the right record / page. | N-6 | P | BR |
| AC-49 | A notification never grants access: the destination re-checks permission on the server, and changing the link or record id in the browser shows nothing more than the same page shows today without a notification (D-8). | N-6, N-3 | N | BR + DB |
| AC-59 **(v0.5)** | No cross-account leakage by id: opening, marking read or paging ("Show older" position) with another user's notification id gives the same response as a non-existent id and changes nothing; list, count and badge responses contain only the signed-in user's data; across a parent, a second parent, a linked teacher, an unlinked teacher and a student, no response names another family's child. | N-3 | N | DB + BR |

### Reliable triggers (N-4)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-29 | The same event processed twice (retry, double click, two tabs) creates one notification. | N-4 | D | DB |
| AC-30 | An expiry processed twice, including by two concurrent requests (a page load and a bell refresh), creates one notification per side (D-4). | N-4 | D | DB |
| AC-31 **(v0.5)** | Each action notification's label follows its current business record exactly as in §6.1 — one test case for each cell of that table: enquiry (pending; accepted; declined; withdrawn; expired; pending past `expires_at`), link request (requested; accepted; accepted then link ended; declined; withdrawn; expired; requested past `expires_at`), rate proposal offer *n* for each side (current offer awaiting X; X accepted; X declined; X countered; withdrawn by either side; expired; open past `expires_at`), learning package (needs details; completed; withdrawn; pricing model v2 off). For each, the label is the same whether the notification is read or unread; update and reminder notifications and the student sheet show no label (D-1). | N-4 | P | DB + BR |
| AC-32 | An event that fails and rolls back creates no notification (same transaction). | N-4 | D | DB |
| AC-33 | A listing reminder is not created again for the same listing period; renewing starts a new period. | N-4 | D | DB |
| AC-43 | When an action resolves, its notification's read status is unchanged (not marked read automatically); reading or marking a notification read never changes the business record, the action label or the action (D-1). | N-4, N-2 | N | DB + BR |
| AC-44 | Each bell count refresh runs the existing expiry checks for enquiries, rate proposals and link requests before counting; an item that passes its expiry time while its recipient's tab is visible produces its expiry notification in the bell within about 60 seconds, with no page load and no scheduled job (D-4). | N-4, N-7 | P | DB + BR |
| AC-45 | Expiry durations and rules are unchanged (enquiries, rate proposals, link requests: 14 days); the existing expiry tests pass unchanged (D-4). | N-4 | P | DB |
| AC-51 | No lesson reminder, cancellation or rescheduling notification, placeholder notification or simulated booking is created in CR-16 (D-10). | N-4 | N | DB + review |
| AC-52 | For each §3 event that already queues an email, the email is queued exactly as before (same template, recipient and de-duplication key) and the in-app notification is created independently; a retry creates no second notification; no email leaves the queue and nothing in the app says an email was sent or delivered; no WhatsApp message is attempted (D-11). | N-4 | D | DB |
| AC-54 | The CR-15 "Finish your learning package" banner shows on the teacher dashboard while the package needs details, whether or not its notification has been read, and clears only when the package is completed or withdrawn (assumption 3). | N-2 | P | DB + BR |
| AC-57 **(v0.5)** | Listing reminder (§7.3): one run of the reminder sweep for a due listing creates, in one transaction, exactly one reminder notification for its teacher **and** the existing `listing_expiry_reminder` email with its unchanged key; two concurrent sweeps create one of each; none is created for a paused, withdrawn or ended listing, for a listing more than 7 days from its end, or for a teacher who is inactive or not approved; after renewal, the next period gets exactly one new reminder; a failure inside the transaction creates neither. | N-4 | D | DB |
| AC-58 **(v0.5)** | Listing reminder timing (§7.3): the reminder is created by the first reminder sweep that runs at or after `expires_at − 7 days` (and before `expires_at`) at the triggers approved under Q-6 — option A: a /teacher/listing page load by any teacher; option B: additionally any bell refresh or signed-in page load; when the listing's teacher has made no request in that time, the reminder is in their bell at their next sign-in; if no sweep runs in the window, no reminder is created and the "Looking for students" badge still shows renewal due. | N-4, N-7 | P | DB + BR |

### Refresh (N-7)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-34 | While the tab is visible, a new notification appears in the bell number within 60 s without reloading. | N-7 | P | BR |
| AC-35 | While the tab is hidden, no notification requests are made; one check runs when it becomes visible. | N-7 | N | BR |
| AC-55 **(v0.5)** | Immediate after the user's own action, with the browser clock frozen so no 60-second refresh can run: (a) "Mark as read" and "Mark all as read" change the bell number in the same tab with no reload; (b) after each business action in §7.1 — teacher answers an enquiry, accepts and declines a link request, answers and counters a rate proposal, renews the listing, completes the package; parent answers, counters and withdraws a rate proposal — the response that completes the action shows the affected menu badge already lowered (or raised) and the related action label already updated; (c) opening a notification shows the lowered bell number on the next page. | N-7, N-2 | P | BR |
| AC-56 **(v0.5)** | The 60-second refresh returns the bell number and the user's menu badges in one request; a change made in another tab of the same user (for example, answering an enquiry) appears in this tab's bell and badges within 60 s while it is visible, with no reload (C-1). | N-7 | P | BR |

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
| AC-40 **(v0.5)** | Phone (390 px): the panel is a bottom sheet; no sideways scrolling; every control (bell, rows, Mark as read, Mark all, chips, Show older, close) is at least 48 × 48 px with at least 8 px between targets (AX-04; replaces 44 px). | N-11 | M | BR |
| AC-41 **(v0.5)** | Keyboard: Enter / Space opens the bell; Tab moves through rows and controls in visual order; Esc closes and returns focus to the bell; the phone sheet is a dialog that keeps focus inside while open (AX-08); every control shows the approved visible focus ring; bell named "Notifications, N unread"; badges read "N waiting for you"; no serious or critical axe issues on the panel, sheet and page. | N-11 | A | BR |
| AC-42 | Existing dashboards, enquiries, rate proposals, homework and listing pages behave exactly as before (full existing suites pass). | N-11 | P | all |
| AC-60 **(v0.5)** | Errors without partial updates (§7.4): offline shows the existing offline banner, keeps the last bell number, shows no repeated errors and checks once on reconnect; a failed "Mark as read" leaves the row unread, restores the bell number and offers retry, which then succeeds; a failed "Mark all" changes no row; a failed "Show older" keeps the shown rows and offers Try again; a failed open leaves the notification unread; no error message names a record, child or other user. | N-11, N-5 | E | U + BR + DB |
| AC-61 **(v0.5)** | Screen readers and visual access: a change of the bell number after a refresh or own action is announced once through a polite live region (not on first page load, at most once per refresh, AX-10); decorative icons are hidden from screen readers and icon-only buttons are named (AX-06); unread state and action labels are given in text, not by colour alone (AX-07); text meets 4.5:1 and badges, dots and focus rings 3:1, with the amber badge using `#684000` on `#fea619` (AX-01, AX-02); with reduced motion requested, the panel and sheet open without animation and the badge does not animate (AX-13); text is at least 12 px (AX-03). | N-11 | A | U + BR |

### Testing and traceability (N-10)
| # | Check | Req | Type | Level |
|---|---|---|---|---|
| AC-65 **(v0.5)** | Every check AC-1 to AC-66 names at least one requirement, a type and a level; every requirement N-1 to N-11 is verified by at least one check (§15); positive, negative-authorisation, duplicate, error, phone and accessibility types are each present. | N-10 | R | review |
| AC-66 **(v0.5)** | The build report lists, for each check, the test file(s) and test name(s) that verify it and the result of the run; a check without a passing test is reported as not met, never as passed. | N-10 | R | review |

Numbering note: AC-55 to AC-66 are new in v0.5; existing numbers are not changed so earlier references stay valid.

## 11. Decisions (resolved, OC-115) and assumptions

Each decision below was accepted by the owner on 19 Oct 2026, 23:51 IST (OC-115). The v0.3 proposal is kept under "Proposed in v0.3" as history. v0.5 changes no decision.

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
- **AC-24 and D-5:** AC-24 lists all of the user's notifications. D-5 says every notification enforces *current* status. For a teacher who is approved and later suspended or sent back for changes, it is not decided whether earlier marketplace notifications stay in their list or are hidden (Q-4). Opening one is covered by AC-27 cause (5) either way.
- **D-1 and D-8 both talk about read status** — not a conflict: D-1 forbids marking read *when the action resolves*; D-8 marks read only *when the user opens* a notification they can no longer access.
- **AC-52 and existing email keys:** see 13.2 (5).
- **AC-40 (v0.4: 44 px) and the repository rule AX-04 (48 px, G1-04):** v0.5 uses the stricter repository rule (C-3).

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
12. **(v0.5) Listing reminders run from one page only.** `queueListingReminders` is called only from src/app/teacher/listing/page.tsx; its code comment ("when teachers open their pages and when public listings are read") describes more triggers than exist. The sweep covers all teachers' listings (up to 100 per run) and is not limited to the viewer. It runs outside a single transaction for the selection, but each listing's update and email are in one transaction with a re-check (`reminder_queued_for IS DISTINCT FROM expires_at`), so concurrent runs are already safe. §7.3 documents today's behaviour as option A; option B is Q-6. Correcting the comment is a code change and is not made here.
13. **(v0.5) Badge rule and reminder rule differ by design.** The listing-page `renewalDue` rule (used for the badge) includes `paused` listings and listings that have already ended; the reminder rule selects `published` listings that have not yet ended. Both are existing behaviour and are kept; §4.1 and §7.3 state each exactly.

### 13.3 Test implications
- **Time:** the server functions already accept `now`, so DB tests can cover 90 / 180 days (including the one-second boundaries in AC-36), the hourly throttle and expiry without waiting.
- **Concurrency:** AC-30, AC-50 and AC-57 need DB tests with two real parallel connections (two sweeps, two clean-ups), not sequential calls.
- **60-second checks** (AC-34, AC-44, AC-56) and the frozen-clock check (AC-55) need a controlled browser clock, so the suite doesn't wait in real time.
- **Existing expiry tests** (tests/db/teacherEnquiries, teacherRequests, rateNegotiations, pricingNegotiations, teacherListings) must pass unchanged after the sweeps are wrapped in transactions (AC-45). Tests that count `email_outbox` rows must still give the same counts (AC-52, AC-57).
- **Labels and access:** AC-31 needs one case for each cell of the §6.1 table. AC-27 needs one case for each of the five causes, plus the already-read case.
- **Negative pages:** AC-47 and AC-53 need browser checks on admin and public pages, including network requests and page HTML.
- **Badges:** AC-64 needs a seeded fixture with every status for two users of each role.
- **Accessibility:** AC-41 and AC-61 reuse the existing axe browser checks and the AX rules in G1-04; reduced motion is tested with the browser's reduced-motion setting.

### 13.4 Questions
- **Q-1 — D-1 labels per record.** **Resolved in v0.5 as a documentation reading** (§6.1, AC-31): a decline is the recipient's answer and so "Done"; withdrawals and expiries are "No longer needed"; reminder notifications (including the listing reminder) carry no label — the badge shows the outstanding renewal. The owner may change any row of §6.1 when approving AC-31. *(v0.4 text: "Is a decline 'Done'? Does the listing-ends reminder … carry these labels too?")*
- **Q-2 — Teachers who are not approved.** *Open.* They see only a status message and no menu (OC-72). Do they get the bell, so they can see "Your profile was not approved"?
- **Q-3 — Profile-change decisions.** *Open.* D-5 mentions "profile updates". Emails already exist for approved or declined profile changes (`teacher_profile_change_approved` / `_declined`), but §3 lists no such event. Add them to §3?
- **Q-4 — Earlier notifications after status or access changes.** *Open.* For a teacher later suspended or sent back for changes (D-5), and for a parent whose guardian link has ended (D-8): do earlier notifications stay in the list with their original titles (neutral message on opening), or are they hidden or redacted in the list?
- **Q-5 — Parent "Notification settings".** *Open.* Should the parent home button be relabelled "Notifications" when the page becomes the list? Where will notification preferences go when email and WhatsApp are approved?
- **Q-6 — Listing-reminder trigger.** *Narrowed in v0.5; owner choice open.* What is created, by which code, once per listing period, with which key and in which transaction, and the worst-case timing, are now defined (§7.3, AC-57, AC-58). Remaining choice: **option A** — keep today's trigger (a /teacher/listing page load; worst case no reminder if no teacher opens that page in the 7-day window); or **option B (recommended)** — also run the reminder sweep on the bell refresh and signed-in page loads (₹0, no scheduler; reminder within about 60 s while anyone is active; the existing email may be queued earlier than today, same template and key). Until decided, option A applies.
- **Q-7 — Time-based email keys.** *Open.* Keep `link_request:` and `teacher_decision:` keys as they are (protection from status checks) or make them event-based? The second option changes existing email behaviour.
- **Q-8 — Sweep frequency.** *Open.* Run the expiry sweeps on every 60-second refresh as decided, or also limit them to once a minute across all users to save database work? This would not change when an active user sees the notification by more than about a minute. (If option B of Q-6 is chosen, the same limit would apply to the reminder sweep.)

### 13.5 Clarifications made in v0.5 (owner may change on approval)
- **C-1 — The 60-second refresh also returns menu badges.** N-7 says "refresh"; v0.4 §7 refreshed the bell number only, so a badge for an item that expired by time, or that was answered in another tab, stayed until the next page. Returning both in the same request adds no request and no cost (§7.2, AC-56). Alternative: bell only; badges on page load and after own actions.
- **C-2 — Keyset paging.** "Show older" continues from the last row shown rather than by page number, so new notifications never cause repeats or gaps (§6.2, AC-63). No visible difference from the approved design.
- **C-3 — Touch targets 48 px.** The repository rule AX-04 (G1-04) is 48 × 48 px with 8 px spacing; v0.4 AC-40 said 44 px. v0.5 uses 48 px (AC-40).
- **C-4 — Unread rows stay in place under the Unread chip** after "Mark as read" until the filter changes or the page reloads (§6.2), so rows don't move under the pointer.

## 14. Changes in v0.5 (OC-116, documentation only)

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

## 15. Traceability matrix (v0.5)

### 15.1 Requirements → checks

| Req | Requirement (summary) | Verified by | Test levels | Gaps |
|---|---|---|---|---|
| N-1 | Role-based notifications; awaiting-approval teachers only approval / profile; no admin notifications | AC-17, AC-18, AC-19, AC-20, AC-46, AC-47, AC-48 | DB, BR | Q-2 (not-approved teachers) and Q-3 (profile-change events) undecided; checks follow the answer |
| N-2 | Badges from business records; reading never clears an action | AC-10–AC-16, AC-23, AC-43, AC-54, AC-55 (b), AC-64 | DB, BR | None |
| N-3 | Server-side authorisation; no cross-family data | AC-18, AC-20, AC-24, AC-25, AC-26, AC-27, AC-46, AC-49, AC-53, AC-59, AC-64 | DB, BR | Q-4 (earlier notifications after access changes) undecided; opening is covered by AC-27 either way |
| N-4 | One per recipient per event; labels follow the record; lesson items out of scope | AC-29–AC-33, AC-43, AC-44, AC-45, AC-51, AC-52, AC-57, AC-58 | DB, BR, review | Q-6 option decides AC-58's trigger set; Q-7 (time-based email keys) undecided |
| N-5 | Bell: count, list, date and time, read status, mark one / all | AC-1–AC-8, AC-48, AC-60, AC-63 | DB, BR, U | None |
| N-6 | Navigation only when authorised; neutral message; never grants access | AC-27, AC-28, AC-49 | DB, BR | None |
| N-7 | 60-s refresh when visible; none when hidden; immediate after own actions; refresh runs expiry sweeps | AC-34, AC-35, AC-44, AC-55, AC-56, AC-58 | DB, BR | C-1 (badges in the refresh) to be confirmed; Q-8 (sweep frequency) undecided |
| N-8 | Worksheet: student + each parent; no other students' information | AC-21, AC-22, AC-23 | DB, BR | None |
| N-9 | Retention 90 days from `read_at`, 180 from `created_at`; hourly clean-up; business records and badges untouched | AC-36, AC-37, AC-50, AC-62 | DB | None |
| N-10 | Every check specific, testable, traceable; all test types | AC-65, AC-66 (and this matrix) | review | Verified by review, not by an automated test (by nature) |
| N-11 | Approved design; responsive; accessible; loading / empty / error states | AC-9, AC-38–AC-42, AC-60, AC-61 | U, BR, all suites | Visual match (AC-9) is a screenshot review, not automated |

### 15.2 Checks → requirements

| Check | Req | Check | Req | Check | Req |
|---|---|---|---|---|---|
| AC-1 | N-5 | AC-23 | N-8, N-2 | AC-45 | N-4 |
| AC-2 | N-5 | AC-24 | N-3 | AC-46 | N-1, N-3 |
| AC-3 | N-5 | AC-25 | N-3 | AC-47 | N-1 |
| AC-4 | N-5 | AC-26 | N-3 | AC-48 | N-5, N-1 |
| AC-5 | N-5 | AC-27 | N-6, N-3 | AC-49 | N-6, N-3 |
| AC-6 | N-5 | AC-28 | N-6 | AC-50 | N-9 |
| AC-7 | N-5 | AC-29 | N-4 | AC-51 | N-4 |
| AC-8 | N-5 | AC-30 | N-4 | AC-52 | N-4 |
| AC-9 | N-11 | AC-31 | N-4 | AC-53 | N-3 |
| AC-10 | N-2 | AC-32 | N-4 | AC-54 | N-2 |
| AC-11 | N-2 | AC-33 | N-4 | AC-55 | N-7, N-2 |
| AC-12 | N-2 | AC-34 | N-7 | AC-56 | N-7 |
| AC-13 | N-2 | AC-35 | N-7 | AC-57 | N-4 |
| AC-14 | N-2 | AC-36 | N-9 | AC-58 | N-4, N-7 |
| AC-15 | N-2 | AC-37 | N-9 | AC-59 | N-3 |
| AC-16 | N-2 | AC-38 | N-11 | AC-60 | N-11, N-5 |
| AC-17 | N-1 | AC-39 | N-11 | AC-61 | N-11 |
| AC-18 | N-1, N-3 | AC-40 | N-11 | AC-62 | N-9 |
| AC-19 | N-1 | AC-41 | N-11 | AC-63 | N-5 |
| AC-20 | N-1, N-3 | AC-42 | N-11 | AC-64 | N-2, N-3 |
| AC-21 | N-8 | AC-43 | N-4, N-2 | AC-65 | N-10 |
| AC-22 | N-8 | AC-44 | N-4, N-7 | AC-66 | N-10 |

**Orphans:** none. Every check AC-1 to AC-66 maps to at least one requirement, and every requirement N-1 to N-11 has at least one check. N-10 is verified by review (AC-65, AC-66) rather than by an automated test. AC-42 (existing suites unchanged) is mapped to N-11 as in v0.4; it also protects the "existing behaviour preserved" commitment.

## 16. What I need from you

Final approval of N-1 to N-11 and AC-1 to AC-66 (or changes), confirmation of the §6.1 label table (Q-1) and of clarifications C-1 to C-4, the Q-6 choice (option A or B), and answers to Q-2 to Q-5, Q-7 and Q-8 where you want to decide them before the build. Implementation starts only after final approval.
