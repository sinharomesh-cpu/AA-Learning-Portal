# CR-16 — In-app notifications (bell) and dashboard action badges

**Version:** 0.2 · 19 Oct 2026 · **Status:** for owner review — nothing built. Retention, refresh and worksheet notifications decided (OC-106 (6)–(8)); the board definitions below (§10) await final approval. Boards **NB0–NB4** on the design canvas (page "CR-16 Notifications").
**Source:** owner requirement "Centralised Notifications and Dashboard Action Badges" (19 Oct 2026, 13:27 IST). **Budget:** ₹0 — in-app only; no paid service, no new infrastructure.

## 1. What exists today (inspection of the code, 19 Oct 2026)

| Area | Found | Gap |
|---|---|---|
| In-app notifications | **None.** No table, no bell, no panel. Parent menu has a "Notifications" item that opens a placeholder ("settings come with email and WhatsApp reminders"). | Everything in §3–§6 |
| Email | `email_outbox` with a unique `dedupe_key`; 24 templates queued at the business event (enquiry received/answered, link request sent/answered/expired, rate proposal received/countered/answered/expired, listing reminder, account emails). **Queued only — no email is sent** until a provider is approved. | Reused as the event hook (§5) |
| Pending counts already computed | Teacher dashboard: link requests waiting (TR3), rate proposals waiting for the teacher (RN4). Teacher enquiries page lists pending enquiries. Parent "My teachers": answers shown as "New for you" for 7 days (CR-12 H-5 reading). | Not shown on menus; not shared across pages |
| Real-time | None (server-rendered pages, no websockets). | Proportionate refresh (§7) |

## 2. Categories that exist now (only these get badges)

| Role | Menu item | Badge = items that still need **this user's** action | Clears when |
|---|---|---|---|
| Teacher | **Students** | Teacher link requests in `requested` status and not expired (CR-12) | Accepted, declined, withdrawn by parent, or expired |
| Teacher | **Enquiries** | Enquiries `pending` (not expired) **+** rate proposals open with `turn = teacher` | Enquiry answered / withdrawn / expired; proposal answered or countered (turn passes), withdrawn or expired |
| Teacher | **Looking for students** | 1 when the listing ends within 7 days, has ended (renewal due), or a learning package is in *Needs review* | Renewed / package completed or withdrawn |
| Parent | **My enquiries** | Rate proposals open with `turn = parent` (counter-offers waiting) | Accepted, declined, countered, withdrawn or expired |
| Parent | **Teachers** | — (no parent action is pending on link requests; answers are informational) | — |
| Student | — | No student action is defined yet (homework submission is CR-07 H-3, not built) | — |

**Later, when those features are built (not now):** homework submissions awaiting review (teacher, H-4), assignments requiring the student (student/parent, H-3), upcoming confirmed lessons, cancellations/rescheduling, package arrangements awaiting confirmation (Phase B). The design reserves these; no badge or notification is shown for a workflow that does not exist.

## 3. Notification events (created at the business event, same database transaction)

| Event (existing code) | Recipient | Kind | Title (example) | Opens |
|---|---|---|---|---|
| Enquiry sent | Teacher | Action | "New enquiry from Anita" | /teacher/enquiries |
| Enquiry accepted / declined | Parent | Update | "Teacher B accepted your enquiry" | /parent/enquiries |
| Link request sent (after approval) | Teacher | Action | "Anita asked you to teach a Grade 5 child" | /teacher/students |
| Link request accepted / declined / expired | Parent | Update | "Teacher B accepted your request for Kiran" | /parent/teachers |
| Rate proposal received (hourly / package / earlier price) | Teacher | Action | "New package price proposal" | /teacher/enquiries/rates |
| Counter-offer | The other side | Action | "Teacher B made a counter-offer (offer 2 of 6)" | the side's Rate proposals page |
| Proposal accepted / declined / withdrawn / expired | The other side (both for expiry) | Update | "Anita accepted ₹550 per hour" | Rate proposals |
| Teacher shares a resource / worksheet with a child (CR-07) | Student **and** parent | Update | "New worksheet from Teacher B: Fractions" | /student/homework · /parent/homework |
| Listing ends in 7 days (existing L-2 reminder) | Teacher | Reminder | "Your listing ends on 26 Oct" | /teacher/listing |
| Converted package needs review (CR-15 A5 apply) | Teacher | Action | "Your monthly price became a learning package — please complete it" | /teacher/listing |
| Teacher approved / changes requested / not approved | Teacher | Update | "Your profile was approved" | /teacher |

**Privacy rules:** a teacher's notification never contains a child's name (grade and curriculum, parent's first name only — FR-040.9, CR-12 B). A student only gets learning notifications (shared resources; later assignments, lessons); never prices, proposals, enquiries or parent details. A parent sees only their own and their children's items. Messages hold no amounts beyond what both parties already see, and no free-text message content.

## 4. Two different counts (critical rule)

- **Bell badge = unread notifications** for this user. Opening the panel does not mark anything read; clicking a notification marks *that one* read; "Mark all as read" marks all read.
- **Menu badge = items still needing this user's action**, computed from the records' business state (§2), never from notifications. Reading a notification never changes a menu badge; completing the action does, whether or not the notification was read.
- Labels: menu badges are read by screen readers as "Enquiries, 3 waiting for you"; the bell as "Notifications, 2 unread".

## 5. Data model (migration 0025, additive)

`notifications`: `id uuid`, `recipient_id uuid → accounts` (on delete cascade), `kind` (`action`, `update`, `reminder`), `type` text (e.g. `enquiry_received`), `title` (≤ 120), `body` (≤ 300), `href` (internal path only, validated `^/[a-z]`), `entity_type`, `entity_id`, `dedupe_key` (unique), `created_at`, `read_at`. Indexes: `(recipient_id, created_at desc)`, partial `(recipient_id) where read_at is null`. Retention: read notifications deleted after 90 days, unread after 180 (R-proposal, §9).

- Created by a server helper `notify(tx, …)` called next to each existing `queueEmail(…)` in the same transaction, with the same dedupe key → retries never duplicate (unique index; `ON CONFLICT DO NOTHING`).
- Read / mark-all only for the signed-in recipient: `UPDATE … WHERE id = $1 AND recipient_id = session` — another user's id simply matches nothing ("not found").
- No delete by users (only retention).
- Email remains a separate channel (outbox, queued only); WhatsApp not involved.

## 6. Screens (boards)

- **NB1** Teacher desktop: bell in the top bar (beside the theme switch and account), unread badge in the primary colour (#006194, white number, 18 px), menu badges on Students / Enquiries / Looking for students in a contrasting amber chip with the count; panel (380 px) with rows: icon by kind (action = blue dot + "Needs your reply", update, reminder), title, one-line message, relative time, unread dot; "Mark all as read"; "See all" → full page.
- **NB2** Parent desktop + phone: same bell; phone opens a full-height sheet; the "Notifications" menu item becomes the full notifications page (paginated, 20 at a time) with "Settings for email and WhatsApp come later".
- **NB3** Student (child-friendly): bell in the student top bar, simple wording ("Teacher B shared a new worksheet"), no prices or proposals; empty state "You're all caught up!".
- **NB4** States: loading, empty, error ("Notifications can't load right now — everything else works"), keyboard focus, many notifications (pagination), menu badge with 9+ cap.

## 7. Refresh and performance (₹0)

- Counts are computed on the server for every page load (two small indexed queries per page).
- The panel loads the latest 10 only when opened; the full page paginates (20).
- While a tab is visible, the bell re-checks the unread count every 60 seconds and after the user's own actions; nothing runs in hidden tabs. No websockets, no paid service. (On the free hosting plan this stays far inside the free allowance at test-site volumes; it can be turned to "on page load only" if needed.)
- Errors never break the dashboard: the bell shows without a count and the panel shows a retry message.

## 8. Tests (planned)

Database: notification created once per event (retry → still one); recipient-only read/mark-all (another user's id → not found); role scoping (no teacher notification names a child; no student notification about prices); menu counts per §2 rise and fall with the business state, not with reading; retention. Browser (real accounts): bell visible for parent, teacher, student; unread count; panel opens; clicking marks read and opens the authorised page; reading does not clear the Enquiries badge; answering does; phone sheet; empty and error states; accessibility (axe), keyboard; existing dashboards unchanged.

## 9. Decisions recorded (OC-106, 19 Oct 2026, 14:10 IST)

- **Retention (6):** read notifications are removed after **90 days**; unread after a proposed **180 days**, subject to a retention review. Removing a notification **never** removes, hides or changes the underlying enquiry, proposal, request, assignment or booking — those keep their own status and pages, and menu badges keep counting them.
- **Refresh (7):** the bell re-checks the unread count every **60 seconds while the tab is visible**; it pauses while hidden and checks once when the tab becomes visible again; after the user's own action (answer, accept, mark read) the counts update immediately on the next page.
- **Worksheets (8):** when a teacher shares a worksheet or resource with a child, the **student** gets one notification and **each authorised parent** of that child gets a separate one. Reading either never marks anything done.

## 10. Exact definitions and acceptance criteria per board (for final approval)

### Definitions used everywhere
- **Notification:** a stored message for exactly one recipient account, created once per business event (dedupe key), with kind *action* (someone needs this user's response), *update* (something happened; nothing to do) or *reminder* (a dated event is coming).
- **Unread:** `read_at` is empty. **Read:** the recipient opened that notification (clicked it) or used "Mark all as read". Opening the panel alone reads nothing.
- **Pending action:** a record whose business state requires this user's next step (§2). Computed from the record, never from notifications.
- **Bell count:** number of the user's unread notifications, shown 1–9, then "9+".
- **Menu badge:** number of pending actions for that menu area, shown 1–9, then "9+"; absent at 0.

### NB0 — read me / matrix
| Users | Content | Acceptance |
|---|---|---|
| Owner (review only) | §1–§9 of this document | Every badge category and event in NB0 exists in the app today; nothing for unbuilt workflows. |

### NB1 — teacher (desktop)
| Item | Definition | Trigger / source | Acceptance criteria |
|---|---|---|---|
| Bell | Teacher's unread notifications | Events in §3 for teachers | AC-1 bell visible on every teacher page; AC-2 count equals unread rows for this teacher only; AC-3 "9+" above 9 |
| Panel | Latest 10 notifications, newest first | Opened by bell click / Enter | AC-4 shows title, one-line message, time, kind, unread dot; AC-5 clicking a row marks only that row read and opens its page; AC-6 "Mark all as read" sets all to read and the bell shows no count; AC-7 Esc closes and returns focus to the bell |
| Students badge | Link requests `requested`, not expired | `teacher_student_links` | AC-8 increases on a new request; decreases on accept / decline / parent withdrawal / expiry; unchanged by reading the notification |
| Enquiries badge | Pending enquiries + open rate proposals with turn = teacher | `teacher_enquiries`, `rate_negotiations` | AC-9 enquiry answered → −1; counter-offer sent → −1 (turn passes); parent counter → +1; expiry → −1 |
| Looking for students badge | Listing ending ≤ 7 days or ended, plus a package in Needs review | `teacher_listings`, `learning_packages` | AC-10 renew clears the listing part; completing or withdrawing the package clears its part |
| Privacy | — | — | AC-11 no teacher notification contains a child's name or id; only grade, curriculum and the parent's first name |

### NB2 — parent (desktop page + phone sheet)
| Item | Definition | Trigger / source | Acceptance criteria |
|---|---|---|---|
| Bell + panel | As NB1, for the parent's own notifications | Events in §3 for parents | AC-12 bell on every parent page; count only the parent's own |
| Notifications page | Replaces the placeholder; All / Unread filter; 20 per page; "Show older" | — | AC-13 pagination loads 20 more; AC-14 filter Unread shows only unread |
| Phone sheet | Same panel as a bottom sheet below 768 px | — | AC-15 no horizontal scroll at 390 px; targets ≥ 44 px |
| My enquiries badge | Rate proposals with turn = parent | `rate_negotiations` | AC-16 teacher counter → +1; parent answer/counter/withdraw or expiry → −1 |
| Child scope | Notifications about a child only for that child's authorised parents | `guardian_links` active | AC-17 a parent never sees another family's notifications; links removed → no new notifications about that child |

### NB3 — student
| Item | Definition | Trigger / source | Acceptance criteria |
|---|---|---|---|
| Bell + sheet | Student's unread learning updates | Worksheet / resource shared with this child (§9 (8)); later: assignments, lessons | AC-18 bell in the student top bar on every student page; AC-19 only learning updates — never prices, proposals, enquiries or parent details; AC-20 reading never marks homework done |
| Empty state | "You're all caught up!" | — | AC-21 shown when there are no notifications |

### NB4 — states
| State | Definition | Acceptance criteria |
|---|---|---|
| Loading | Panel waiting for the latest 10 | AC-22 skeleton rows; no layout jump |
| Error | Notifications can't load | AC-23 message + Try again; the page and menu badges still work |
| Empty | No notifications | AC-24 "You're all caught up" |
| Keyboard / screen readers | — | AC-25 bell named "Notifications, N unread"; menu badge read as "N waiting for you"; panel is a labelled dialog; axe shows no serious issues |
| Refresh | §9 (7) | AC-26 count refreshes within 60 s while visible; no requests while the tab is hidden |

### Security and data acceptance (all boards)
- AC-27 Marking read / mark-all only affects the signed-in user's rows; another user's notification id returns "not found" and changes nothing.
- AC-28 The same event processed twice creates one notification (unique dedupe key).
- AC-29 Retention job removes only notifications, never the underlying records; pending badges unchanged by retention.
- AC-30 Existing dashboards, enquiries, proposals and homework pages behave exactly as before.
