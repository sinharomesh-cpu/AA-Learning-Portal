# CR-17 — Phase 3A: Human Teaching and Homework (audit and plan)

**Version:** revision 3 · 21 Oct 2026 · **Status:** planning record. Owner approvals so far: OC-123 (01:40 IST: 10–40 minute lessons, teacher-created Zoom links, packages deferred, synthetic data and adults only, in-app notifications as a testing limitation), OC-124 (02:01 IST: Zoom and child-safety review before any real-child session; Vercel free-plan rule as launch dependency; no upgrades or spending) and OC-125 (12:34 IST: D3A-19, the three-layer migration gate, and PR 1 only). **PRs 2–8, migrations M1–M4 and every item marked "awaiting your decision" or "verification required" below are not approved.**

This file is a copy of the owner-reviewed Claude Doc "AA Pro Phase 3A — Human Teaching and Homework: Audit and Plan" (revision 3), kept in the repository for traceability. The decision register (§3) and the plan text are unchanged from that review; the diagram in §4 is described in its table.


**Revision 3 (21 Oct 2026), after your review of 02:01 IST.** The safe ₹0 Friends & Family test of booking, teacher acceptance, starting a class from Join Class, worksheets, student submission and teacher review is achievable with adults and invented child profiles. Nothing has been coded, migrated, merged or deployed for Phase 3A.

- **Migration control (§5.1).** The test database holds exactly 0001–0026, identical to main. 23 of those first arrived through preview builds before merge, and nothing stray or altered is there, so no recovery is needed. A three-layer gate (build script, your Vercel setting, written approval before push) is demonstrated on a throw-away database. No migration will be pushed until it is in place.
- **Reminders (§2.9).** In-app only, as a limited testing solution. Behaviour is listed for an open, background, closed and reopened app. Nothing is delivered while AA Pro is closed.
- **Zoom and children (§6.4, §7).** Adults and invented child profiles only. No real child session until Zoom's terms, account eligibility, meeting settings and child-safety rules are reviewed (V-3, PL-03).
- **Hosting.** Vercel's non-commercial free-plan rule is recorded as launch dependency PL-02; nothing is upgraded.
- **Before PR 6 (§6.5).** I need your /admin/storage and Neon figures. Clean-up deletes nothing without an itemised list you approve.
- **Decision register (§3).** 48 items: 15 previously approved, 27 awaiting your decision (18 with a proposed default), 6 verifications. A proposed default is not treated as approved.
- **Can't be tested safely at ₹0 (§7):** real children on Zoom, real children's work, reminders while the app is closed, proof that a Zoom lesson happened, email sending, package bookings, larger loads. Each has a non-billable alternative.

This revision is planning, evidence and design review only. Implementation, migrations, shared-database changes, merges, deployment and spending wait for your explicit approval.

## 1. Current-state audit

The foundations exist, but no lesson can be booked and no homework can be submitted today. What works: approved teachers linked to children by subject, weekly "usually free" times, hourly and package prices, agreed rates, teacher worksheet sharing, a private file store that already converts iPhone photos, and the CR-16 notification engine. Audited from the code, migrations, tests and decision records on main (commit 212f80f, latest migration 0026), 21 Oct 2026. No test was run for this audit.

**Status key:** Working · Partial · Missing · Blocked (needs an owner decision) · Paid (needs a paid service)

| Area | Requirement | Status | Evidence and note |
| --- | --- | --- | --- |
| A Booking | Parent selects an approved, linked teacher | Working (prerequisite) | Teacher–child links with subjects, enforced in the database; no "book this teacher" screen yet |
| A Booking | Parent views available slots or package schedule | Partial | Only recurring weekly "usually free" ranges, "a guide only: nothing is booked" (migration 0012). No dated slots. Package class times exist on the package. Times show on the public profile, not on the parent's teacher page |
| A Booking | Parent requests a lesson or package booking | Missing | No booking or lesson tables. /parent/book-teacher, /parent/calendar and /teacher/schedule are "Not ready yet" pages |
| A Booking | Teacher accepts or declines | Missing | The link-request accept/decline pattern can be reused |
| A Booking | Parent sees status and notification | Partial | CR-16 engine works; no booking notification types. A new type needs a migration (the allowed list is fixed in the database) |
| A Booking | No conflicting confirmed bookings | Missing | No overlap protection exists; locking patterns exist to reuse |
| A Booking | Status consistent across dashboards | Partial | Lesson lists on dashboards come from sample data; real accounts show empty lists |
| A Booking | Hourly vs package rules respected | Partial / Blocked | Prices, packages and agreed rates built (CR-13, CR-15). How a package booking reserves weekly times and counts classes is not decided (CR-15 Phase B items O-11 to O-16) |
| B Zoom | Teacher adds own Zoom link; protected Join Class | Blocked | Join opens 10 minutes before start (OC-44) — built as a rule. The Join button is always inactive today. **A teacher's own link was approved for trial lessons only (CR-12, OC-97); on 21 Oct you approved teacher-created links for the Friends & Family prototype (OC-123). How parents approve them is D3A-1** |
| B Zoom | Lesson status separate from the link | Missing | Status names exist only in the rules module (proposed, confirmed, booked, declined, cancelled) |
| B Zoom | Zoom API, recording | Paid | Out of scope (OC-91); not proposed |
| C Resources | Teacher shares files with linked students, no parent approval | Working | /teacher/resources, tested (OC-86, OC-87): only in subjects the parent ticked; student and their parents can see them |
| C Resources | Resource types (notes, worksheet, MCQ, fill-in, instructions) | Partial | Every resource is one file plus an optional note; MCQ and fill-in belong to exercises (D) |
| C Resources | Visible only to the intended student, parents, teacher | Working | Server-side file access rules; admins never see children's files (OC-90) |
| D Exercises | Teacher creates questions; student answers and submits; teacher reviews with feedback | Missing (fully specified) | CR-07 FR-022 and designs HW3–HW7 approved (OC-95); build step H-3 |
| E Written homework | Teacher sets instructions | Missing | CR-07 FR-023, build step H-4 |
| E Written homework | Parent uploads photos or scans for the child | Partial | The file store already accepts parent "submission page" uploads; no submission record, link to the assignment, or screen |
| E Written homework | iPhone HEIC and common formats | Working | PDF, JPEG, PNG, WebP, HEIC accepted; photos converted on the server at no cost |
| E Written homework | Teacher reviews and gives feedback; parent and student see it | Missing | Teachers cannot read submission files yet |
| E Written homework | 12-month retention | Missing | Decided (OC-90 Q-6) but not built; needs a clean-up step |
| E Written homework | No administrator access to homework | Working for files | Must also apply to the new answer and feedback records |
| F Dashboards | Action counts and status indicators | Partial | Badges exist for enquiries, links, listing and package. None for bookings or homework; students get no badges. Parent home's resource list uses sample data; the student home's is hard-coded empty |
| F Notifications | Booking and homework notifications | Missing | CR-16 says homework is out of its scope; new types need approval and a migration |
| — | Lesson change rules (30-minute cut-off, 1:1, 40 minutes) | Working (rules only) | OC-44 to OC-47 coded in the rules module and tested; not yet used by any booking |

**Finding: migrations reach the test database before merge.** The test site's build step applies any new migration whenever it builds, and Vercel builds a preview of every pushed branch with the same database connected ("Production and Preview" in the test-environment set-up). GitHub's deployment records show preview builds on the test site for the CR-16 N1 and N2 branch commits (a566e33 at 07:25 UTC and f83ca6d at 10:16 UTC on 20 Oct), before those PRs merged. So migration 0026 most likely reached the test database when the N1 branch was pushed, not at merge. That was within your 11:31 implementation approval, but it means "apply only after approval" is not true today. §5 sets out the gate that fixes it. Not verified: the test database's own migration log, which I cannot reach from here.

## 2. Proposed requirements and rules

Each rule below is tagged with where it comes from: an id like OC-46 is a decision you have already made; **\[D3A-n\]** is a new rule waiting for your decision in §3. Nothing tagged \[D3A-n\] is treated as approved by approving this plan.

### 2.1 One status model for human lessons

The rules module already uses five status names: proposed, confirmed, booked, declined and cancelled. Phase 3A keeps those meanings and adds three. This is the only model; tables and screens will use exactly these values.

| Status | Meaning | Holds the time? | Where the name comes from |
| --- | --- | --- | --- |
| requested | A parent asked for this lesson; the teacher hasn't answered | No \[D3A-4\] | New |
| proposed | A teacher suggested this lesson; the parent hasn't answered | No (OC-45) | Existing; used when teacher proposals are built (later phase) |
| confirmed | Accepted by the other side | Yes | Existing |
| declined | The answering side said no, with a reason | No | Existing |
| expired | Not answered in time \[D3A-5\] | No | New |
| withdrawn | The asking side took it back before an answer | No | New |
| cancelled | A confirmed lesson that will not happen; records who cancelled: parent, teacher, or AA Pro (teacher deactivated, \[D3A-13\]) | No | Existing name, plus "who" |
| booked | An AI lesson booked by a student | Yes | Existing; AI only, not used in Phase 3A |

**After the end time** the teacher records an outcome, kept separately from the status: Taught or Did not take place \[D3A-7\]. Until then it shows "Outcome not recorded". Nothing is ever inferred from Join Class clicks.

**Who can move a lesson between statuses:**

| From | To | Who | When |
| --- | --- | --- | --- |
| — | requested | Parent of the child | At least the minimum notice before the start \[D3A-3\], within the booking window \[D3A-2\] |
| requested | confirmed / declined | Teacher | Before expiry. Confirming re-checks the time (below) |
| requested | withdrawn | Parent | Before an answer |
| requested | expired | AA Pro | When the reply deadline passes \[D3A-5\] |
| requested | declined, reason "time no longer free" | AA Pro | When another lesson is confirmed that overlaps it |
| confirmed | cancelled | Parent or teacher | Up to 30 minutes before the start, not after (OC-46). Students never can (OC-06) |

**Overlap rule.** A lesson occupies its start up to, but not including, its end. Two lessons overlap when each starts before the other ends, so back-to-back lessons are allowed \[D3A-16: no gap required\]. A time is free only if neither the teacher nor the child has a confirmed lesson overlapping it, with any teacher.

**Two accepts at the same moment.** Confirming runs as one database transaction. It first locks the teacher and the child (always in the same order, so two transactions can't block each other), then re-reads their confirmed lessons, then confirms only if the time is still free. A second, simultaneous accept waits for the first, then finds the time taken and is refused. In the same transaction, other open requests that now overlap become declined with the reason "time no longer free".

**Messages when the time is taken:**

- Teacher, on a refused accept: "This time is no longer free, so this request can't be accepted. It has been closed and the parent has been told." No detail of the other lesson is shown (it may belong to another family).
- Parent, in the bell and on the request: "\[Teacher\] couldn't accept this time because it is no longer free. Please choose another time."
- Parent, when their own new request clashes: "That time isn't free any more. Please pick another." The list of free times refreshes.

No message to a teacher ever names another family or child; teachers' notifications never carry a child's name (CR-16, FR-040.9).

### 2.2 Booking an hourly lesson

1. Only an approved, active teacher linked to the child, in a subject ticked on the link (existing links, OC-87).
2. **Lesson length: any length from 10 to 40 minutes, inclusive (OC-123, 21 Oct 2026).** It is chosen per lesson, defaults to the teacher's listed hourly lesson length, and offered in 5-minute steps \[D3A-15\]. The server and the database both refuse anything outside 10–40; it is never fixed at 40.
3. Offered start times: inside the teacher's "usually free" times, in 30-minute steps, with the whole lesson inside one of those ranges, on dates within the booking window \[D3A-2\], at least the minimum notice ahead \[D3A-3\], excluding overlaps (§2.1).
4. Times are stored in UTC and shown in each person's own time zone. Each date is converted separately, so daylight-saving changes (for example a London teacher and an India parent) are correct.
5. The price shown is the agreed rate for that child and subject if one exists (CR-13), otherwise the listed hourly rate, scaled to the chosen length. It is information only; AA Pro takes no payment (OC-03, P-4).
6. One child per lesson (OC-47). A parent may hold at most 10 open requests \[D3A-17\]. The same child, teacher and start time cannot be requested twice.
7. Cancelling is allowed up to 30 minutes before the start (OC-46). Rescheduling in Phase 3A means cancel and request again \[D3A-6\].

### 2.3 Package bookings — deferred

Package bookings stay out of Phase 3A until CR-15 open items O-11 to O-16 are decided (how a class counts as delivered, cancellations, early ending). No package rule is set by this plan.

### 2.4 Teacher's own Zoom link and Join Class

1. The teacher creates the meeting in their own free Zoom account and pastes the participant link into the confirmed lesson. No Zoom API, paid licence or recording.
2. **Parent approval.** For trial lessons, the parent must approve the teacher's own link first (OC-97, CR-12 FR-039.5). For regular lessons I recommend the parent approves **once per teacher**, on the child's teacher page ("Allow \[teacher\] to use their own Zoom meetings for \[child\]"), and can withdraw it at any time; while it isn't approved, Join Class shows "Waiting for you to allow this teacher's meeting links" \[D3A-1\].
3. Checked on the server: `https://` only; Zoom addresses only (zoom.us and its subdomains); no shortened links; at most 500 characters.
4. Never in page source, notifications or emails. Given only through Join Class, only to the teacher, the child's parents and the child, from 10 minutes before the start to the scheduled end (OC-44, R-06).
5. Join Class says: "Opens Zoom — a meeting run by your teacher, not by AA Pro. Not recorded." The parent is told when the link changes. Links are deleted 7 days after the lesson \[D3A-8\].
6. Zoom Basic limits meetings to 40 minutes, matching the longest allowed lesson; a late start shortens it.

### 2.5 Teacher resources

File sharing stays as built (OC-86, OC-87). New: a type label on each file — Notes, Worksheet or Homework instructions \[D3A-9\]. Multiple-choice and fill-in-the-blank questions are built as exercises (§2.6), not files.

### 2.6 Online exercises

| Rule | Source |
| --- | --- |
| Teacher builds multiple-choice, fill-in-the-blank and short-answer questions, with an optional due date, for linked children in ticked subjects | Approved: CR-07 FR-022, designs HW3–HW7 (OC-95), OC-87 Q-1 |
| Short written answers are always marked by the teacher | Approved: OC-90 Q-2 |
| Late submissions allowed, marked Late | Approved: OC-90 Q-10 |
| Typed feedback up to 4,000 characters | Approved: OC-90 Q-7 |
| No administrator access | Approved: OC-90 Q-8 |
| Answer key never sent to the student before the teacher's review is released | Approved: CR-07 test T-A3 |
| Multiple-choice and fill-in answers are checked automatically by exact match, ignoring capitals and extra spaces; the teacher can override | New: D3A-18 |

### 2.7 Written homework

**Already approved:** teacher sets written work with instructions (CR-07 FR-023); parents upload pages, students never do (FR-023.9); PDF, JPEG, PNG, WebP and iPhone HEIC accepted, photos converted on the server (OC-90 Q-4); any allowed viewer may download (OC-90 Q-3); kept 12 months (OC-90 Q-6); no administrator access (OC-90 Q-8); 200 MB and 100 uploads a day per account (OC-96).

**New rules needing your decision** — none is approved by approving this plan:

| # | Proposed rule | Status in CR-07 | Recommended default |
| --- | --- | --- | --- |
| H-N1 | Submitting is final; it reopens only if the teacher asks for a revision | FR-022.5, proposed | Yes |
| H-N2 | A parent can add, remove and reorder pages until submitting | New | Yes |
| H-N3 | At most 10 pages and 50 MB per submission | FR-023.4, proposed | Yes |
| H-N4 | A teacher cannot edit an exercise's questions once any student has started | FR-022.9, proposed | Yes |
| H-N5 | When a teacher is unlinked, unsubmitted work shows "Withdrawn"; submitted work and feedback stay with the family; the teacher loses access at once | FR-027.3, proposed; FR-027.2 approved | Yes |
| H-N6 | When a teacher is deactivated: as H-N5 for homework, and their upcoming lessons are cancelled by AA Pro with notice to parents | D-45, open | Yes |
| H-N7 | The 12 months run from the teacher's review, or from the due date if never reviewed | FR-027.5, proposed | Yes |
| H-N8 | Daily summary of submissions for teachers | FR-026.3, proposed | Leave out of 3A (needs a scheduler) |

### 2.8 Dashboards

| Who | Counts and indicators |
| --- | --- |
| Teacher | Requests awaiting reply; today's and this week's lessons; lessons needing an outcome; homework awaiting review |
| Parent | Requests awaiting the teacher; upcoming lessons; links awaiting approval; homework to upload; new feedback; new resources |
| Student | Next lesson with Join Class; homework to do; new feedback; new resources |

Counts come from the records, never from notifications (CR-16). Sample-data lesson lists on real-account dashboards are replaced with real data.

### 2.9 Notifications and the 15-minute reminder

**In-app only, for testing.** Phase 3A proposes in-app notifications only. That is a limitation of the Friends & Family test, not a product decision. The wider AA Pro requirement for email and WhatsApp notifications (project instructions §10) stays in force; email remains queued, not sent (OC-65), and WhatsApp is not approved (OC-91).

New in-app types \[D3A-10\]: lesson requested; accepted, declined or expired; time no longer free; cancelled; link added or changed; parent approval of links needed; 15-minute reminder; exercise or homework assigned; homework submitted (no child name to the teacher); feedback ready.

**How the 15-minute reminder works (limited testing solution).** It does not use the hourly clean-up timer. It uses the per-user check CR-16 already runs on each bell refresh: every signed-in page refreshes the bell every 60 seconds while it is visible. On each refresh, AA Pro creates the reminder for that person's own confirmed lessons that start within 15 minutes, once per lesson and person. It is never sent outside AA Pro.

| Situation | What the person sees | Guaranteed? |
| --- | --- | --- |
| AA Pro open and on screen | The bell shows "Your lesson with \[teacher\] starts at 4:00 pm" within about 65 seconds after the 15-minute mark; the dashboard shows "Starts in 14 minutes" and Join Class opens at 10 minutes | Yes (tested with a controlled clock, PR 7) |
| AA Pro open in a background tab, or the phone screen locked | Nothing while hidden (CR-16 pauses refreshes then). The reminder appears within seconds of the tab or screen becoming visible again, if the lesson hasn't started | Only on return to the tab |
| AA Pro closed | **Nothing. No reminder is delivered.** AA Pro cannot reach a closed app at ₹0 without email, WhatsApp or phone push, which are not approved | No |
| Reopened before the start | The reminder and the countdown appear straight away | Yes |
| Reopened after the start but before the end | No reminder. The dashboard shows "Your lesson has started" with Join Class | Yes |
| Reopened after the end, or the lesson was cancelled | No reminder | Yes |

**Not approved and not introduced:** email or WhatsApp sending, push notifications, paid schedulers. Vercel's free scheduler runs at most once a day, with ±59 minutes' precision ([Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing)), so it can't be used.

**What Friends & Family testers should be told:** "Reminders appear only while AA Pro is open. Please note your lesson time yourself." (D3A-10)

### 2.10 Security and privacy

Every read and write is checked on the server:

- a parent sees only their own children's records;
- a teacher sees only linked children, in ticked subjects;
- a student sees only their own items;
- administrators never see homework, answers or feedback.

A refusal looks exactly like "not found", and a teacher loses access the moment a link ends (OC-41(4)).

## 3. Phase 3A decision register

The register has **48 items**. My earlier count of 47 missed one: the four migrations M1–M4 count as four items. Status counts:

- **Previously approved: 15.** Your 02:01 message settled D3A-20, so it is now approved.
- **Awaiting your decision: 27.** For 18 of these I propose a default; none is approved until you say so.
- **Verification required: 6.**

Impact key: **F** functional · **S** security and privacy · **DB** database · **₹** cost. "Blocks" names the first pull request or test that can't proceed without the item.

### 3.1 Previously approved (15)

| Id | Decision (wording) | Rationale and impact | Blocks |
| --- | --- | --- | --- |
| OC-123 (1) | Human lessons may last any length from 10 to 40 minutes inclusive, configurable per lesson, validated on the server; never fixed at 40 | Fits Zoom Basic's 40-minute limit. F: length chosen per lesson · DB: check 10–40 on lessons · ₹0 | — |
| OC-123 (2) | Teacher-created Zoom links for the Friends & Family prototype; no paid Zoom plan, Zoom API or recording | F: manual link, protected Join Class · S: link shown only to the lesson's people · ₹0 | — |
| OC-123 (3) | Package bookings deferred until CR-15 O-11–O-16 are decided; synthetic accounts and sample content only; adults and invented child profiles; no real child sessions on this plan alone | F: hourly lessons only · S: no real child data | — |
| OC-123 (4) | Phase 3A notifications are in-app only, as a testing-scope limitation, not a permanent product decision | F: no email or WhatsApp · ₹0 | — |
| D3A-20 | Vercel's free-plan restriction is a launch dependency (PL-02); no hosting upgrade or cost without written approval (21 Oct, 02:01) | ₹: none now | Launch only |
| OC-44 | Join opens 10 minutes before the start and stays open until the scheduled end | F: Join Class window | — |
| OC-45 | A teacher-proposed lesson needs the parent's acceptance and holds no time until then | F: later phase | — |
| OC-46 | Parent or teacher may cancel or reschedule up to 30 minutes before the start; a teacher's reschedule needs parent approval | F: cancel cut-off | — |
| OC-47, OC-06 | One child per lesson; students cannot book, change or cancel human lessons | S: role checks on the server | — |
| OC-03, P-4 | AA Pro collects no payments | F: prices shown for information | — |
| OC-97 | A teacher's own meeting link for a trial lesson needs the parent's approval first | S | — |
| OC-86, OC-87 | Teachers share directly with linked students, only in subjects the parent ticked | S | — |
| OC-90 | Short answers marked by the teacher (Q-2); allowed viewers may download (Q-3); HEIC accepted (Q-4); 12-month retention (Q-6); typed feedback ≤ 4,000 characters (Q-7); no admin access (Q-8); late allowed (Q-10) | S, F | — |
| OC-95, OC-96 | Homework designs HW0–HW9; 200 MB and 100 uploads a day per account; uploads stop at 90% of the database | F, ₹ | — |
| OC-91, CR-16 | ₹0 without written approval; notification rules (same transaction, no duplicates, access re-checked, no child names to teachers, badges from records) | ₹, S | — |

### 3.2 Awaiting your decision, with a proposed default (18)

| Id | Decision (wording) | Recommended option and why | Impact | Blocks |
| --- | --- | --- | --- | --- |
| D3A-2 | How far ahead a parent can book | 4 weeks: enough for weekly planning, few stale requests | F | PR 2 |
| D3A-3 | Minimum notice for a request | 24 hours: gives the teacher a day to answer | F | PR 2 |
| D3A-4 | Whether a request holds the time | No; only confirmed lessons hold time. Simpler, matches OC-45, re-checked on accept | F, DB | PR 2 |
| D3A-5 | When an unanswered request expires | After 48 hours, or 2 hours before the start if sooner; no stale requests | F | PR 2 |
| D3A-6 | Rescheduling in Phase 3A | Cancel and request again; the full flow comes later | F | PR 2 |
| D3A-7 | Recording what happened after a lesson | Teacher records Taught or Did not take place; never inferred from Join clicks | F, DB | PR 2 |
| D3A-8 | When meeting links are deleted | 7 days after the lesson: time to resolve questions, little exposure | S, DB | PR 3 |
| D3A-9 | Type labels on shared files | Notes, Worksheet, Homework instructions; helps families find work | F, DB (one column) | PR 4 |
| D3A-15 | Lesson length steps | 5-minute steps from 10 to 40, defaulting to the teacher's listed length; within OC-123 | F | PR 2 |
| D3A-16 | Gap between lessons | None; back-to-back allowed; teachers can leave gaps themselves | F | PR 2 |
| D3A-17 | Open requests per parent | At most 10; stops spam without limiting real use | F, S | PR 2 |
| D3A-18 | Automatic marking | Exact match ignoring capitals and extra spaces; teacher can override; no AI | F | PR 5 |
| H-N1 | Submitting is final; reopens only on a teacher's revision request | Clear record of what was submitted | F | PR 5 |
| H-N2 | A parent can change pages until submitting | Fix mistakes before the teacher sees them | F | PR 6 |
| H-N3 | At most 10 pages and 50 MB per submission | Protects the 1 GB free database | ₹, DB | PR 6 |
| H-N4 | No question edits once any student has started | Fair marking | F | PR 4 |
| H-N5 | On unlinking: unsubmitted work shows Withdrawn; submitted work and feedback stay with the family; the teacher loses access at once | Matches FR-027.2 (approved) | S | PR 4 |
| H-N7 | The 12 months run from the teacher's review, or from the due date if never reviewed | Applies OC-90 Q-6 | DB | PR 6 |

### 3.3 Awaiting your decision (9)

| Id | Decision (wording) | Recommended option and why | Impact | Blocks |
| --- | --- | --- | --- | --- |
| D3A-19 | Migration gate: migrations apply only on the test site's main build; you untick Preview on the database settings; no migration branch is pushed before your approval | Approve all three layers. Closes the preview gap found in §5.1 | DB, S, ₹0 | PR 1; then everything with a migration |
| M1 | Add the `lessons` table and allow "lesson" notifications (§5.2) | Approve when PR 2 is ready, after reviewing its SQL | DB | PR 2 |
| M2 | Add `lesson_meeting_links` and `meeting_link_permissions` | Approve when PR 3 is ready | DB, S | PR 3 |
| M3 | Add exercise and assignment tables, the file type column, and allow "assignment" notifications | Approve when PR 4 is ready | DB | PR 4 |
| M4 | Add `submission_pages` | Approve when PR 6 is ready, after V-1 | DB, ₹ | PR 6 |
| D3A-1 | How parents approve a teacher's own Zoom links for regular lessons | Once per teacher and child, can be withdrawn. Consistent with OC-97 without a per-lesson burden | S, F, DB | PR 3 |
| D3A-10 | New in-app notification types, and the 15-minute in-app reminder with the limits in §2.9 | Approve both, with testers told reminders work only while AA Pro is open | F | PR 2 (types), PR 7 (reminder) |
| D3A-13 / H-N6 | When a teacher is deactivated (open item D-45) | AA Pro cancels their upcoming lessons and withdraws unsubmitted work, telling parents. Families aren't left waiting | F, S | PR 2 |
| H-N8 | Daily submission summary for teachers | Leave out of 3A: it needs a scheduler that the free plan can't run reliably | F | — |

### 3.4 Verification required (6)

| Id | What to verify | Who | Impact | Blocks |
| --- | --- | --- | --- | --- |
| V-1 | /admin/storage figures and the Neon dashboard (storage, compute, transfer) | You | ₹, DB | PR 6 |
| V-2 | The test database's `schema_migrations` list matches 0001–0026 (SQL in §5.1) | You, in the Neon SQL editor | DB | PR 2 |
| V-3 | Zoom terms, account eligibility, meeting settings and child-safety rules for under-16s | You and your adviser | S | Any real-child session |
| V-4 | Whether the CR-15 pricing switch is on in the test database | You, on /admin | F | PR 2 |
| V-5 | Real size of a converted homework photo | Me, in PR 6 tests | ₹ | Friends & Family test |
| V-6 | Compute and data transfer stay within the stop levels during the test | You (Neon dashboard), with my estimates | ₹ | Friends & Family test |

## 4. Pull-request plan

Eight pull requests, in your suggested order with two changes. **First,** each feature PR adds its own notifications. CR-16 requires a notification to be created in the same database step as its event, so adding them all in PR 7 would mean reopening finished code. **Second,** PR 1 also carries the migration gate (§5), so no later migration can reach the test database before you approve it. A PR that carries a migration is not pushed until you have approved that migration (M1–M4).

&#91;embedded content: Phase 3A pull requests · 8 PRs, 2 tracks\]

The booking track (PRs 2–3) and the homework track (PRs 4–6) don't depend on each other, so either can go first; each PR still merges on its own after all 11 checks pass.

| PR | Scope | Gate before push | Acceptance criteria (summary) |
| --- | --- | --- | --- |
| 1 | Records this plan, your decisions and OC-123 as CR-17. Migration gate: the build applies migrations only on the test site's main build, never on a preview (a small change to the build script) | D3A-19 | Every requirement traced to a check; a preview build of a branch with a dummy migration applies nothing (tested); main builds still apply |
| 2 | Parent requests an hourly lesson of 10–40 minutes; teacher accepts or declines; parent withdraws; either side cancels up to 30 minutes before; teacher records the outcome; notifications; real lesson lists on all three dashboards | M1 | Lengths 9 and 41 minutes refused by the server and the database; only linked, approved teachers in ticked subjects; overlaps refused; two racing accepts — exactly one wins and the other request is closed with the agreed message; expiry per D3A-5; cancel inside 30 minutes refused; correct across time zones and a daylight-saving change; another family gets "not found" |
| 3 | Parent approval of teacher links (D3A-1); teacher adds or changes the link; protected Join Class for teacher, parent and child; link deletion | D3A-1, M2 | Only https Zoom links; link never in page source or notifications; open only 10 minutes before to the end; parent told of changes; deleted per D3A-8; lesson status unaffected by the link or clicks |
| 4 | Type labels on shared files; teacher builds exercises and assigns them; "assigned" notifications | M3, H-N4 | Assign only to linked children in ticked subjects; answer key never reaches the student; no edits after a student starts; existing files keep working |
| 5 | Student answers, saves and submits; automatic marks; teacher reviews, overrides, gives feedback; student and parent see it | D3A-18, H-N1 | Late recorded; marks hidden until review; feedback ≤ 4,000 characters; teacher notifications carry no child name; admins see nothing |
| 6 | Teacher sets written homework; parent uploads pages, including HEIC from a phone; teacher views (zoom, rotate) and gives feedback; 12-month deletion | M4, V-1, H-N2, H-N3, H-N7 | Students cannot upload; per-submission limits; storage limits respected; teacher reads pages only while linked; deleted when due |
| 7 | Dashboard counts; 15-minute in-app reminder (if approved); cross-checks | D3A-10 | Counts equal the records; reminder once per lesson, within 65 s of the 15-minute mark for an open page (clock-controlled test) |
| 8 | Full regression, security, accessibility, Friends & Family script with browser evidence | — | §8.2 script passes in CI; axe clean on new pages; ₹0 and no production change confirmed |

Each PR gets its own scope and acceptance summary before it is opened, and a report afterwards, as usual. Rough size: PRs 2, 4, 5 and 6 are each similar to a CR-16 PR; 3 and 7 are smaller.

## 5. Database migrations and approval gates

Phase 3A needs four additive migrations, M1 to M4. None changes or deletes an existing row. Each is approved by you separately, and none can reach the test database before that approval.

### 5.1 Migration-control evidence (revision 3, 21 Oct 2026)

**Result:** the test database holds exactly migrations 0001 to 0026, identical to main, with no stray or altered migration. 23 of the 26 first reached it through preview builds of unmerged branches. No recovery action is needed. The gate below stops previews from migrating; it is demonstrated locally, not yet committed.

**Which database each build uses**

| Build | Database | Applies migrations today? |
| --- | --- | --- |
| Test site, main deployment (Vercel project aa-pro-test, "Production") | The shared Neon test database | Yes, on every build |
| Test site, preview of any pushed branch (aa-pro-test, "Preview") | **The same shared Neon test database** (the test-environment set-up connects Neon to "Production and Preview", with preview branching off) | **Yes, on every build** |
| Sample-data preview site (aa-learning-portal) | None (sample-data mode) | No |
| CI checks on GitHub (db, e2e-real jobs) | A throw-away Postgres 16 created inside each CI run and discarded after | Yes, to that throw-away database only |
| My local checks | Throw-away local databases | Only those |

**What has been applied to the shared test database, and when.** From GitHub's deployment records (188 test-site builds since 15 Oct) and the migration runner's own rules:

- 0001–0003 arrived with the first main deployment on 15 Oct.
- 0004–0026 each first arrived with a **preview** build of their branch, before merge. Examples: 0025 at 19:44 UTC on 19 Oct (branch commit e4d9877); 0026 at 07:25 UTC on 20 Oct (a566e33).
- The runner records every migration with a fingerprint (SHA-256). A build fails if an applied migration later changed or is missing from the code. The latest main deployment (212f80f, 20 Oct 15:38 UTC) **succeeded**, so the database holds exactly 0001–0026 with the same contents as main: nothing unmerged, nothing altered.
- Only one of the 188 builds failed: a preview on 17 Oct of a homepage styling change with no new migration.
- **What changed:** only what those 26 merged migrations define. No recovery action is needed.
- Not directly verified: the database's own `schema_migrations` table, which I can't reach. You can confirm it in the Neon SQL editor with `SELECT name, applied_at FROM schema_migrations ORDER BY name;` (V-2).

**The gate (PR 1, proposed, D3A-19).** Three layers, so that no single mistake lets a migration through:

1. **Build script.** Migrations run only when the build is the test site's production build of `main`. Every preview, every other branch and the sample-data site skip them. Demonstrated on a throw-away local database with a dummy migration:

   | Simulated build | Migration applied? |
   | --- | --- |
   | Preview of a feature branch | No |
   | Production-type build from a non-main branch | No |
   | Sample-data preview site | No |
   | Main deployment of the test site | Yes |
2. **Your Vercel setting (recommended, ₹0, you do it):** in aa-pro-test → Settings → Environment Variables, untick **Preview** on `DATABASE_URL` and `DATABASE_URL_UNPOOLED`. Previews then have no database at all, so unmerged code can't write test data at runtime either; previews will show errors on pages that need the database, which is acceptable. I can't change Vercel settings myself.
3. **Process.** A branch containing a migration is not pushed until you have approved that migration (M1–M4) in writing. Before then, the SQL, rollback and tests are sent to you as text.

**Until PR 1 is merged and layer 2 is set,** I push no branch that contains a migration. PR 1 itself contains no migration.

**Protecting test data and recovering from a failed migration:**

- Each migration runs inside one transaction. If any statement fails, nothing from it is kept, and the deployment fails visibly while the site keeps running the previous version.
- **Before each approved migration:** you create a free Neon branch (a copy of the database) named, for example, "before-M1". The free plan allows 10.
- **If a migration succeeds but is wrong:**
  1. Run its rollback SQL, with your approval. It removes only what that migration added.
  2. If that isn't enough, Neon can restore the whole database to any point in the last 6 hours, or you can switch back to the "before" branch. Both undo anything else done since, so I'd ask you first.
- Test data is never deleted by a migration: M1–M4 only add tables, columns with defaults, and widened checks.

### 5.2 The four migrations

|  | M1 — Lessons (PR 2) | M2 — Meeting links (PR 3) | M3 — Exercises and assignments (PR 4) | M4 — Homework pages (PR 6) |
| --- | --- | --- | --- | --- |
| Adds | `lessons`: teacher, child, requesting parent, subject, start and end (UTC), minutes, status, who cancelled, decline reason, reply deadline, answered and cancelled times, outcome, price snapshot (currency, amount, agreed or listed) | `lesson_meeting_links` (one per lesson: link, changed at, delete-after); `meeting_link_permissions` (parent allows a teacher's links for a child; granted and withdrawn times) | `assignments` (exercise or written; teacher, subject, title, instructions, due date); `assignment_targets` (one per child: status, submitted, late, reviewed, feedback, delete-after); `questions` (type, prompt, options, answer key); `answers` | `submission_pages` (submission, stored file, page order) |
| Changes to existing tables | Notification record types gain "lesson" (a widened check; existing rows unaffected) | None | `teacher_resources` gains a type column, default "Notes" for existing files; notification record types gain "assignment" | None; the file store already accepts parent submission uploads |
| Rules enforced in the database | Length 10–40 minutes; end = start + length; status only one of the §2.1 values; one child per lesson; only the child's parent can request; confirmed lessons need an active link in that subject; no duplicate open request | Link must be https, a Zoom address, ≤ 500 characters; only the lesson's teacher can write it | Assign only through an active link in a ticked subject; no question edits after a student starts (if H-N4 approved) | At most 10 pages per submission (if H-N3 approved); only a parent of the child can add pages |
| Indexes | Confirmed lessons by teacher and start; by child and start; open requests by parent | By lesson | By teacher, by child, by assignment | By submission |
| Rollback SQL | Delete "lesson" notifications, restore the old check, drop `lessons` | Drop both tables | Delete "assignment" notifications, restore the check, drop the four tables, drop the type column (existing files only lose their label) | Delete submission page files, drop the table |
| Tests (before you approve the merge) | Migration applies on an empty and on a copy-shaped database; every check refuses bad rows; rollback SQL runs cleanly and leaves 0026's schema | Same pattern | Same pattern, plus existing resources keep working with the new default | Same pattern, plus storage limits still counted |

**Storage.** Lessons, links, questions, answers and feedback are text, a few kilobytes per child per week. Homework photos are the only large data (§6).

**Clean-ups** (12-month homework, 7-day links) run during normal signed-in page loads, at most once an hour, on the existing timer table. The 15-minute reminder does not depend on them (§2.9).

**Not touched:** existing users, links, prices, rates, resources, notifications and AA Pro Verified data. PL-01's index is not part of Phase 3A.

## 6. ₹0 assessment

A small adult Friends & Family test of Phase 3A fits within the free plans, with two limits to watch: database storage and database compute hours. I found no blocker that requires spending. The test database's current usage could not be read from here, so V-1 must be checked before PR 6. Limits below were read from the providers' own pages on 21 Oct 2026.

### 6.1 Free-plan limits that apply

| Service | Limit | What happens at the limit | Phase 3A use |
| --- | --- | --- | --- |
| Neon Free (database) | 1 GB storage per project | Writes fail until space is freed; no data is deleted | All records and homework files |
| Neon Free | 100 compute-hours a month per project; compute sleeps after 5 minutes idle | Database suspended until next month | Every open AA Pro page refreshes every 60 s, keeping the database awake |
| Neon Free | 5 GB data transfer out a month | Database suspended until next month | Viewing and downloading homework files |
| Neon Free | Restore to any point in the last 6 hours; 10 branches | — | Migration recovery (§5) |
| Vercel Hobby (hosting) | 1,000,000 function calls and 4 CPU-hours a month; 4.5 MB per request | Features paused for up to 30 days | Bell refreshes, booking, uploads (sent in 3 MB pieces) |
| Vercel Hobby | "Non-commercial, personal use only" | — | See D3A-20 |
| Vercel Hobby scheduler | Once a day, ±59 minutes | — | Not usable for reminders (§2.9) |
| Zoom Basic | 40-minute meetings, 100 participants, no cloud recording | Meeting ends at 40 minutes | Matches the 10–40 minute lesson range |
| Zoom terms | "Not intended for use by individuals under the age of sixteen" (§11.2) | — | Adults only until V-3 is checked |

Sources: [Neon plans](https://neon.com/docs/introduction/plans) · [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) · [Zoom free plan](https://www.zoom.com/en/products/virtual-meetings/features/free-video-conferencing/) · [Zoom terms](https://www.zoom.com/en/trust/terms/)

### 6.2 Headroom for a Friends & Family test

Assumptions, to be replaced by real figures from V-1 and V-5: 5 families, one teacher each, 6 weeks, one written homework a week of 2 pages at about 1 MB a page, each page viewed about 3 times.

| Resource | Estimate for the test | Free limit | Share used |
| --- | --- | --- | --- |
| Homework storage | 5 × 6 × 2 × 1 MB = 60 MB | about 920 MB usable (uploads stop at 90%), minus current use (V-1) | about 7%, plus current use |
| Data transfer | 60 MB × 3 views = 180 MB over 6 weeks | 5 GB a month | about 2% |
| Database compute | 15 people with AA Pro open 2 hours a day keeps the database awake about 2–4 hours a day at 0.25 units ≈ 15–30 compute-hours a month | 100 a month | 15–30% |
| Hosting calls | 15 people × 2 h × 60 refreshes × 30 days ≈ 54,000 | 1,000,000 a month | about 5% |

A larger test (for example 20 families submitting 5 pages a week) would use about 600 MB in 6 weeks and approach the stop, so the test size should stay small or uploads be limited for the test.

### 6.3 Stop conditions

I stop and report to you, without upgrading anything, if any of these is reached during the build or the test:

- database storage above 75% (the existing warning level);
- compute above 70 hours in a month;
- data transfer above 3.5 GB in a month;
- any Vercel usage warning;
- any step that would need a paid plan.

You can see storage on /admin/storage; compute and transfer are on the Neon dashboard (V-6). Nothing in Phase 3A buys, subscribes to, activates or upgrades any service.

### 6.4 Launch dependencies (not Phase 3A work)

These do not block the Friends & Family test but must be resolved before launch. They will be added to the pre-launch action list (PL-02 to PL-04) in PR 1.

| Id | Dependency | Why | Cost decision |
| --- | --- | --- | --- |
| PL-02 | Hosting plan | Vercel's free Hobby plan is "non-commercial, personal use only"; paid lessons with real families would not be | Yours, in writing; nothing is upgraded until then |
| PL-03 | Video lessons with children | Zoom's terms (§11.2) say Zoom "is not intended for use by individuals under the age of sixteen", except schools on Zoom for Education. The account type, meeting settings (waiting room, passcode) and child-safety rules need review | Yours, with your adviser |
| PL-04 | Notifications outside the app | Email and WhatsApp are wider AA Pro requirements; in-app only is a testing limitation | Yours |

### 6.5 Before PR 6 (written homework)

I will not start PR 6 until you send:

1. The figures on /admin/storage (signed in as Super Admin): total used, the warning and stop levels, and the per-account limit.
2. The Neon dashboard's figures for this month: storage, compute-hours and data transfer.

With those I'll send an updated version of the headroom table (§6.2), with your real numbers, before any upload work.

**Test-data clean-up procedure:**

- Automated tests never use the shared test database; they create and discard their own.
- Friends & Family data on the test site belongs to named test accounts. After the test, I list exactly what would be removed: accounts, lessons, exercises, submissions, and files with their sizes.
- Nothing is deleted until you approve that exact list. Deletion uses the app's own removal paths where they exist; otherwise a reviewed SQL script, also approved first.
- Existing data and files outside that list are never touched.

## 7. What can't be tested safely at ₹0, and the alternatives

| Requirement | Why it can't be tested safely now | Non-billable alternative |
| --- | --- | --- |
| A real child joining a Zoom lesson | Zoom's terms for under-16s; no child-safety review yet | Two adults: one as teacher, one signed in as an invented child account. The Zoom meeting itself runs between adults |
| Real children's handwriting and photos | Real child data on a test site; wider retention (D-28) and storage (K-1) still open | Adults upload sample pages (printed worksheets, invented answers), including phone photos in HEIC |
| Reminders when the app is closed | Needs email, WhatsApp or push, plus a scheduler | In-app reminders while open (§2.9); testers keep their own note of lesson times |
| Proof that a Zoom lesson actually started or ended | AA Pro has no Zoom connection (no API at ₹0) | The teacher records Taught or Did not take place; Join Class clicks are never treated as proof |
| Email notifications | Sending not approved (OC-65) | Emails stay queued; a reviewer can inspect them in the test mailbox |
| Package bookings | CR-15 rules O-11 to O-16 not decided | Deferred (OC-123); hourly lessons only |
| Load beyond a small group | Free-plan compute and storage | A small test (§6.2) with the stop conditions in §6.3 |

Everything else in the Friends & Family objective — booking, teacher acceptance, starting a class from Join Class, worksheets, student submission and teacher review — can be tested at ₹0 with adults and invented child profiles.

## 8. ₹0 test strategy

Every Phase 3A test runs in CI or on throw-away local databases, with invented accounts and sample content, at no cost. None runs against the shared test site's data. "Already run" means a test on main that passed in CI on 20 Oct 2026; every Phase 3A test is **planned** until its PR reports real results.

### 8.1 Coverage of the required areas

| Area | Already run (on main) | Planned for Phase 3A (level, PR) |
| --- | --- | --- |
| All three roles | Role menus and page access for parent, teacher and student; CR-16 notification journeys per role | Each journey as parent, teacher and child in the browser (PR 2–7); student never sees request, cancel or upload controls and the server refuses them (DB, PR 2, 6) |
| Cross-family privacy | Files and notifications of another family return "not found" (T-R3, CR-16 AC-24, AC-59) | Lessons, links, exercises, answers, submissions and feedback of another family return "not found" by direct address (DB + browser, PR 2–6) |
| Teacher unlinking | Teacher loses file access at once; notifications redacted (CR-07 T-R1–R5, CR-16 AC-27) | After unlinking: no lesson details, no new bookings, no submission pages; unsubmitted work shows Withdrawn (H-N5) (DB + browser, PR 2, 4, 6) |
| Answer-key protection | — | The key is absent from every page, action response and notification the student receives before release; checked by searching the delivered HTML and responses (DB + browser, PR 4–5) |
| Homework access and deletion | Admin and Super Admin refused files (OC-90 Q-8 test) | Teacher reads pages only while linked; admins refused; 12-month deletion removes records and files, with the clock moved forward (DB, PR 6) |
| Mobile and HEIC uploads | HEIC converted on the server (synthetic HEIC fixture, file store tests) | Parent uploads an iPhone HEIC photo and a PDF on the phone layout, in pieces; teacher views them (browser phone project, PR 6); measured page size recorded for V-5 |
| Lesson length 10–40 | Teacher's listed hourly lesson length limited to 10–40 (CR-15 listing tests); no lesson record exists yet | 9 and 41 minutes refused by the server and the database; 10 and 40 accepted (unit + DB, PR 2) |
| Cancellation cut-off | 30-minute rule (lessonRules unit tests, OC-46) | Cancel at 31 minutes before allowed, at 29 refused, by parent and teacher, with a frozen clock (DB + browser, PR 2) |
| Time zones | Usual times converted to the viewer's time zone on the public profile (single offset; not safe for dated lessons) | Parent in India, teacher in London: offered times, confirmations and reminders show the correct local times (unit + browser, PR 2) |
| Daylight-saving change | — | Bookings across the UK and US clock changes keep the same local wall-clock time for the teacher and correct times for the parent (unit, PR 2) |
| Overlapping bookings | — | Overlap at the edges (touching allowed, 1 minute overlap refused), for the teacher and for the child across two teachers (DB, PR 2) |
| Concurrent acceptance | Concurrency pattern proven for CR-16 (AC-73) | Two accepts for overlapping times started at the same moment on two real database connections: exactly one confirms, the other is refused and its request is closed with the agreed messages (DB, PR 2) |
| Actual reminder timing | Bell refresh within 65 s (CR-16 AC-44) | Clock-controlled browser test: with a page open, the reminder appears between 15:00 and 13:55 before the start, once; a background tab gets it on becoming visible; none for cancelled lessons (browser, PR 7) |
| Migration gate | — | A preview-type build of a branch with a test migration applies nothing; a main-type build applies it (PR 1) |
| No paid services | Existing CI guard against paid SDKs and services | Unchanged guard runs on every PR; the final report confirms ₹0 (PR 8) |
| Accessibility and phone layout | axe checks on existing pages | axe and 48 px touch targets on every new page, desktop and phone (browser, each PR) |

### 8.2 Friends & Family acceptance script (PR 8, browser evidence in CI)

1. A parent requests a 25-minute lesson; the teacher accepts it and declines another. Statuses and free times update on both dashboards.
2. Two parents ask for overlapping times and the teacher accepts both at once: one confirms, the other parent sees "no longer free".
3. A second family cannot see the first family's lesson, link, exercises or homework by any direct address.
4. The parent allows the teacher's links; the teacher adds a link. Join Class is closed before the window and open inside it for the teacher, parent and child only.
5. The teacher assigns an exercise; the child submits; marks stay hidden until review; the teacher overrides one, writes feedback and marks Reviewed; child and parent see it.
6. The teacher assigns written homework; the parent uploads an iPhone photo and a PDF from the phone layout; the teacher reviews; child and parent see the feedback.
7. Bell counts, badges and dashboard counts change at each step without reloading.
8. A cancellation 29 minutes before the start is refused; one at 31 minutes frees the time.
9. The report lists every migration applied with your approval reference, and confirms ₹0 spend and no production change.

**Known limit:** my workspace has too little memory to run the full real-account browser suite in one go, so it runs in parts locally; CI runs it in full and is the evidence of record.
