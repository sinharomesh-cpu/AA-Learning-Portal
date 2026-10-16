# AA Pro — P2-R3 Two-way teacher discovery, matching and payment planning: gap analysis and plan

**Version:** 1.5 · 16 Oct 2026 (§11 public listings; §12 OC-76; §13 OC-77; C-1 decided as OC-78 and board 65 built in PR3; §14 consolidated decisions OC-79) · **Prepared by:** Claude (business analyst and developer roles) · **Status:** for owner review. Planning and design only; apart from the board 65 directory (PR3), nothing in this document is built.
**Source:** owner requirement "Consolidated Requirement: Two-Way Teacher Discovery, Student Matching and Future Payment Planning" (16 Oct 2026, 17:06 IST), checked against the repository at `main` after PR #39, the decision register v1.30 and the approved design boards.

## 1. What exists today

| Area | In AA Pro now | Source |
|---|---|---|
| Approved teacher profiles | Name, time zone, subjects, grades, bio; subject/grade changes re-reviewed (OC-73) | PR #35 |
| Approval | Every teacher sends a completed profile and is approved by the Super Admin or an Admin (OC-38, OC-75) | PR #35, #39 |
| Parent–teacher links | Add by email, per-child subjects limited to the teacher's approved subjects (OC-75); pending links give no access; one server check `teacherMaySee` | PR #38, #39 |
| Teacher directory | **Approved board 65, built in PR3** (C-1 option (a), OC-78). Search by subject, grade, name; shows name, subjects, grades, time zone, bio; teacher can hide from search (OC-54); "Add as my teacher" links at once (OC-36(6)) | Board 65 |
| Teacher availability | **Approved board M-23, not built** (Phase 3). Weekly one-student times of up to 40 minutes; draft/publish | Board M-23 |
| Booking and calendar | **Demo screens only** (sample data). Real booking is Phase 3; cancellation rules (D-07) and group sessions (D-15) still open | Phase 1 |
| External invitation | **Designs first** (OC-61): parent proposes up to 3 slots, teacher answers through a secure link | OC-61, OC-67 |
| Admin figures | Counts of active parents, active teachers and teachers waiting (M-35) | Admin home |
| Payments | **Out of scope** (OC-03); no paywalls; external invitations free | OC-03 |

**Summary:** none of the new discovery features exist. Profiles, approval, linking and the access check can be reused directly. Availability and booking exist only as approved designs.

## 2. Conflicts with approved requirements (decisions needed before building)

| # | Approved rule | New requirement | Options | Claude's recommendation |
|---|---|---|---|---|
| K-1 | **OC-54:** the directory shows only name, subjects, grades, time zone and bio | Adds curriculum, availability, teaching mode, experience and charges | (a) Extend OC-54 to these fields. (b) Keep OC-54 and show the extra fields only on a teacher's own listing | (a), but only for teachers who **publish a listing**; teachers without one show the OC-54 fields only |
| K-2 | **OC-36(6) and board 65:** a parent can link an approved teacher **at once**, without the teacher agreeing | Parents send an **enquiry** and teachers accept or decline | (a) Keep both: "Add by email" for the child's own teacher, enquiries from the directory. (b) Enquiry first everywhere | (a). From the directory the button becomes "Send an enquiry"; linking happens after the teacher accepts, through the existing linking (OC-75) |
| K-3 | **FR-009, M-19, M-24:** human lessons happen on **Zoom** (online) | In-person teaching mode | (a) Online only for now. (b) Allow in-person, which needs location data (city or area) and safeguarding rules for meeting children at home | (a). In-person needs a separate safeguarding and privacy decision |
| K-4 | **OC-54:** no email or phone in the directory | Payments are arranged **outside AA Pro**, so parent and teacher need to contact each other | (a) Share contact details only after an enquiry is accepted, with both agreeing. (b) Messages only inside AA Pro, no contact details. (c) Never share | (a), with a clear notice that AA Pro does not handle or guarantee payments |
| K-5 | **M-23:** sessions are at most 40 minutes (Zoom basic, FR-009) | Hourly pricing with a session duration | A teacher can state an hourly rate; the session length on a booking is still limited to 40 minutes until Zoom terms change | Keep the 40-minute limit; label the price as "per hour" |
| K-6 | **OC-73:** only subject and grade changes are re-reviewed | New profile claims: curriculum expertise, years of experience | (a) Review them like subjects and grades. (b) Save at once (teacher's own statement, labelled as such) | (b), labelled "as stated by the teacher", plus approver review on first approval |
| K-7 | **Booking (Phase 3)** is not built | "Acceptance does not create a lesson; booking needs agreement on schedule, mode, duration and charges" | The accepted enquiry hands over to the Phase 3 booking flow, where the **agreed price** is recorded on the booking (informational) | Build enquiries now; the "agreed terms" step arrives with booking |
| K-8 | **OC-61** external invitation (slots, secure link) | Enquiry workflow with statuses | Two similar flows | Share one status engine and expiry rules, but keep two entry points (registered teacher vs external teacher) |
| K-9 | **M-22:** no ratings, reviews or badges on teacher profiles | Not asked for | — | Keep: no ratings or reviews |
| K-10 | **OC-75** (16 Oct) amended OC-54's "parent-added teacher completes profile after approval" | — | Register housekeeping | Record that OC-54's sentence is superseded by OC-75 |

## 3. Other decisions needed

| # | Question | Recommendation |
|---|---|---|
| Q-1 | Which teachers appear in "Find a teacher"? | Approved, active teachers who have not hidden themselves (OC-54). Teachers with a **published listing** show their full listing and a "Looking for students" label |
| Q-2 | **Decided (OC-76 1)** — What does a teacher see in an enquiry? | Child's **grade, subjects and curriculum**, preferred times, mode and the parent's message and first name. **Not** the child's name or any learning data until the parent links the teacher |
| Q-3 | **Decided (OC-76 2)** — Enquiry expiry and limits | Expires after **14 days** without an answer (like OC-67); a parent can have at most **5 pending enquiries** at once and one pending enquiry per teacher and child |
| Q-4 | **Decided (OC-76 3)** — Listing expiry | A published listing expires after **60 days** unless renewed; the teacher is reminded 7 days before (queued email) |
| Q-5 | **Decided (OC-76 4)** — Currencies | INR, SGD and USD to start (the time zones seen so far are India and Singapore); amounts stored in the smallest unit |
| Q-6 | How many prices per listing? | Up to **three** pricing options (for example hourly and monthly), each with currency, amount, model, sessions per period and minutes per session |
| Q-7 | Free-text messages in enquiries | Allowed, up to 500 characters, with a notice not to share contact details before acceptance; reports can be sent to the AA Pro team |
| Q-8 | **Decided with changes (OC-76 5)** — "Feedback requesting integrated payments" | A one-time optional question after an accepted enquiry: "Would you like to pay (or be paid) through AA Pro in future?" Yes / No / Not sure. Counted in aggregate only |
| Q-9 | **Decided with changes (OC-76 6)** — Who sees the adoption metrics? | Super Admin, and Admins with a new "Reports" permission; numbers only, never names (OC-21) |
| Q-10 | Order of work | Build the authorised PR3 (board 65) first, as approved; then the new pieces in §8 after design approval |

## 4. User stories and acceptance criteria

**US-D1 Parent searches teachers.** I filter approved teachers by subject, grade, curriculum, day and time, teaching mode, experience and charges.
- Only approved, active, not-hidden teachers appear; pending, rejected, deactivated and hidden ones never do.
- Each result shows only approved subjects and grades, the teacher's stated details and their asking price labelled "asking price, paid directly to the teacher".
- No email, phone, children or other families appear anywhere in the results.

**US-D2 Parent shortlists.** I save teachers to a shortlist that only I can see, and remove them.

**US-D3 Parent views a teacher.** I open a teacher's page: approved subjects and grades, curriculum, experience, mode, weekly availability (in my time zone) and prices.

**US-D4 Parent sends an enquiry.** I choose one of my own children, subjects (only ones both the child studies and the teacher is approved for), preferred times and mode, and write a short message.
- The enquiry records the teacher's asking price at that moment ("asking price"), separate from any later agreed price.
- Sending an enquiry creates no booking, no payment and no access to my child.
- I can withdraw it while pending. It expires after 14 days.

**US-D5 Teacher manages a listing.** As an approved teacher, I create, edit, publish, pause and withdraw my "Looking for students" listing.
- I can choose only my approved subjects and grades; the server refuses anything else.
- Paused, withdrawn and expired listings are not shown to parents.
- A pending, rejected or deactivated teacher cannot publish; deactivating a teacher hides their listing at once.

**US-D6 Teacher answers enquiries.** I see enquiries sent to me, with the child's grade, subjects and curriculum but no name, and accept or decline with an optional note.
- Accepting does not link me to the child or create a lesson. The parent is told and can then add me (OC-75) and book (Phase 3).
- I cannot see other teachers' enquiries or any family I am not linked to.

**US-D7 Prices are information only.** Asking prices are shown with currency, model, sessions and minutes. No button, step or email suggests paying through AA Pro.

**US-D8 Adoption metrics.** The Super Admin sees aggregate counts: registered and active parents and teachers, published listings, enquiries by status, successful matches (accepted enquiries followed by a link), confirmed lessons once booking exists, and answers to the payments question.

## 4a. Proposed screens (design canvas page "Teacher discovery & enquiries (proposed, P2-R3)")

| Board | Screen | Role |
|---|---|---|
| D1 | Find a teacher with filters (child, subject, grade, curriculum, days, time of day, online, experience, price) and shortlist; extends approved board 65 | Parent |
| D2 | Find a teacher on a phone (quick filters, filter sheet) | Parent |
| D3 | Teacher page (approved data, usual free times, asking prices) and Send an enquiry | Parent |
| D4 | My enquiries (waiting, accepted with next steps, declined, expired), shortlist, the one-time payments question | Parent |
| D5 | Looking for students: listing, approved subjects and grades only, curriculum, experience, asking prices (up to 3), publish, pause, withdraw, expiry, hide from search | Teacher |
| D6 | Enquiries: accept or decline with a note; what the teacher never sees | Teacher |
| D7 | Adoption figures (totals only) and the payments note | Super Admin |

All boards use the approved AA Pro design system and are marked PROPOSED, NOT APPROVED.

## 5. Proposed data model (reuses existing tables)

| Table / change | Purpose | Key rules |
|---|---|---|
| `teacher_profiles` + `curricula text[]`, `experience_years smallint`, `teaching_modes text[]`, `listed boolean` | Profile claims and "hide from search" (OC-54) | `teaching_modes` = `{online}` until K-3 is decided |
| `teacher_weekly_times` | Weekly pattern (day, start, minutes, time zone), shared with M-23 availability | Owned by the teacher; ≤ 40 minutes each (K-5) |
| `teacher_listings` | One listing per teacher: subjects, grades, curricula, modes, status (`draft`, `published`, `paused`, `withdrawn`, `expired`), `published_at`, `expires_at` | Database trigger: subjects and grades ⊆ the approved profile; only an approved, active teacher can be `published` |
| `listing_prices` | Up to 3 per listing: model (`hourly`, `weekly`, `biweekly`, `monthly`), currency, amount (smallest unit), sessions per period, minutes per session, note | Information only; never used to charge |
| `parent_shortlist` | Parent ↔ teacher | Visible only to that parent |
| `teacher_enquiries` | Parent, child, teacher, optional listing, subjects, preferred times, mode, message, **asking-price snapshot**, status (`pending`, `accepted`, `declined`, `withdrawn`, `expired`), teacher note, timestamps | Child must be the parent's own; subjects ⊆ child ∩ approved; one pending per teacher and child; no access granted by any status |
| `feedback_answers` | The payments question (Q-8) | Aggregate reporting only |
| *(Phase 3)* `bookings.agreed_price_*` | Agreed price on a confirmed booking | Separate from the asking price; informational |

Every change is written to the audit log. Teachers read enquiries through one server function that checks `teacher_id = session`, the same way `teacherMaySee` works for linked children.

## 6. Workflow

1. Teacher is approved → may create a listing → publishes it (server checks approval and subjects).
2. Parent searches → opens a teacher → shortlists or sends an enquiry (pending).
3. Teacher accepts or declines (or the enquiry is withdrawn or expires).
4. On acceptance the parent sees "Add this teacher for [child]", which opens the existing linking with the enquiry's subjects pre-ticked (OC-75 still decides what is allowed), and, after Phase 3, "Book a lesson", where schedule, mode, duration and the **agreed** price are confirmed.
5. Contact details are shared only after acceptance, if K-4(a) is chosen.

## 7. Security and privacy

- Parents see teachers, never other families or children. Teachers see enquiries addressed to them only, with no child name until linked.
- Listings and the directory use only approved profile data; the database refuses subjects or grades outside the approved profile.
- Every page and request checks the session role and ownership; changing an id in a link returns "not found".
- Free-text fields are length-limited and shown as plain text; a "report" action reaches the AA Pro team.
- Rate limits: enquiries per parent, listing edits per day.
- No payment data is stored; no payment provider is connected.

## 8. Incremental plan (separate pull requests)

| Step | Content | Depends on |
|---|---|---|
| PR3 | Teacher directory as approved on board 65 (search, hide from search, limited profile) | Authorised |
| D-designs | Boards D1–D7 (this document) for approval | — |
| PR-D1 | Profile additions (curriculum, experience, mode, hide from search) and weekly times | Design approval, K-1, K-6 |
| PR-D2 | "Looking for students" listing with prices; publish, pause, withdraw, expiry | PR-D1 |
| PR-D3 | Directory filters, teacher page, shortlist | PR-D2 |
| PR-D4 | Enquiries for parents and teachers, expiry, emails (outbox only), hand-over to linking | PR-D3, K-2, K-4, Q-2, Q-3 |
| PR-D5 | Adoption metrics and the payments question | PR-D4, Q-8, Q-9 |
| Phase 3 | Booking with agreed terms and agreed price | Booking phase |
| Later | Payment-integration proposal when growth and demand justify it (§9) | Owner decision |

## 9. Future payment phase

AA Pro will keep counting the figures in US-D8. When growth and demand justify it, Claude prepares a separate proposal covering providers and payment methods, fees and total costs, business model and any commission, collection, payouts, refunds and reconciliation, legal, tax, security and compliance, and the technical design and effort. **No payment feature is built and no payment service is connected until the owner approves that phase.** No fixed registration threshold is set.

## 10. Test plan (for each PR)

Parent search and filters; listing create, edit, publish, pause, withdraw and expiry; refusal of unapproved subjects and grades (application and database); pending, rejected and deactivated teachers cannot publish or see children; enquiries sent, withdrawn, accepted, declined and expired; acceptance creates no lesson and no access; prices shown with "paid directly to the teacher" and no payment step; cross-family and cross-teacher access refused by direct request; existing booking, calendar, sign-in and regression suites still pass.

## 11. Addition (v1.1): public teacher listings on the homepage

**Source:** owner requirement "Public Teacher Listings on the Homepage" (16 Oct 2026, 17:24 IST). Planning and design only; nothing is built.

### 11.1 Requirements as understood

- The public homepage gets a section **"Teachers looking for students"**, and a public page `/teachers` lists every **published** listing, with search and filters (subject, grade, curriculum, mode, usual days and times, asking price).
- A public listing page shows only approved, public information: public name, approved subjects and grades, curriculum, mode, usual free times, asking prices, experience "as stated", short bio, and **Connect with teacher**.
- **Connect with teacher** needs a parent sign-in. A visitor can sign in or create a parent account; the chosen teacher is kept through sign-up, email confirmation and sign-in, and the parent returns to the enquiry form.
- The enquiry follows the P2-R3 workflow (pending, accepted, declined, withdrawn, expired). It never creates a lesson, a teacher–child link, access to child data or a payment.
- Only approved teachers publish, within their approved subjects and grades. A parent account can never publish. Draft, paused, expired and withdrawn listings, and listings of pending, rejected or deactivated teachers, never appear.
- No payments, commissions or payouts (OC-03).

### 11.2 User journeys

| # | Journey | Steps |
|---|---|---|
| J-1 | Visitor browses | Homepage → "Teachers looking for students" → filters → listing page. No account needed |
| J-2 | Visitor connects, new parent | Listing → Connect → "Create a parent account" (role fixed to parent, teacher named on the page) → confirmation email → link opens sign-in → after sign-in, straight to the enquiry form for that teacher |
| J-3 | Visitor connects, existing parent | Listing → Connect → Sign in → enquiry form for that teacher |
| J-4 | Signed-in parent | Listing → Connect → enquiry form (no extra step) |
| J-5 | Signed-in teacher, student or admin | Listing → Connect → "Only parent accounts can connect with teachers" (nothing sent) |
| J-6 | Listing no longer available | Listing paused, withdrawn, expired or teacher no longer approved → "This teacher isn't taking enquiries now"; the saved choice is cleared |

### 11.3 Access matrix

| Action | Visitor | Parent | Student | Teacher (pending / rejected / deactivated) | Approved teacher | Admin / Super Admin |
|---|---|---|---|---|---|---|
| See public listings and filters | Yes | Yes | Not shown in the child app | Yes (public pages) | Yes | Yes (public pages) |
| Open a public listing | Yes | Yes | No | Yes | Yes | Yes |
| Connect / send an enquiry | Sign in first | Yes (own children or a grade only, see P-4) | No | No | No | No |
| Create, edit, publish, pause, withdraw a listing | No | No | No | No | Own listing only, approved subjects and grades | No (may hide a listing for safety, audited — proposed) |
| See enquiries | — | Own | — | — | Addressed to them | Totals only (D7) |
| See child data or teacher contact details | Never | Own children | Self | Never | Linked children only (OC-75) | Never (OC-21) |

### 11.4 Conflicts and decisions

| # | Topic | Conflict | Recommendation |
|---|---|---|---|
| P-1 | Public visibility | OC-54 shows teacher details to **signed-in parents** only; this makes listings visible to anyone on the internet | Publishing a listing **is** the teacher's consent to public display. The listing editor (D5) says plainly "Anyone on the internet can see this listing"; teacher terms (OC-71 draft) updated. Teachers without a listing stay private |
| P-2 | Test site password | The test site is behind a shared password (A-10, OC-66); real public browsing only works on a production site, which is not authorised | Build and test on the test site behind its password; public access waits for the owner's production decision |
| P-3 | Search engines and copying | Public pages can be indexed and copied by bots | Ask search engines not to index listings until you decide (`noindex`); rate-limit public search; no teacher photos |
| P-4 | Enquiries need a child? | P2-R3 Q-2 uses a child profile; a new parent arriving from a listing would first have to give guardian consent and create a child account | Let the enquiry carry only **the child's grade, curriculum and subjects** (no child account needed). Parents with children may pick one to fill these in. The child is chosen later, when linking |
| P-5 | Keeping the choice through sign-up | Email confirmation may be opened on another device | Remember the chosen listing **on the new account** (for 7 days) as well as in the browser; only a same-site return address is accepted (no open redirects) |
| P-6 | Public name | Today the name shown to families is free text | Guidance and a check: "Teacher" style name with initial and surname (e.g. "Teacher K. Menon"); approver sees it at approval |
| P-7 | Board 63 (approved homepage) | Adds a menu item, a hero button and a new section | Approve boards D8–D11 as an update to board 63; the rest of the homepage is unchanged |
| P-8 | Admin control | Not in the requirement | Proposed: Super Admin can hide a listing that breaks the rules (audited), without editing it |

### 11.5 Server rules (to build after approval)

- One public read function returns only published, unexpired listings of approved, active teachers, with only public fields; listings are addressed by a random public id, never the account id.
- Every filter value is validated; results are paged; public search and connect are rate-limited per address and per account.
- Teacher approval changes, deactivation, subject changes (OC-73) and listing status changes take effect on the next request; there is no cache of private data.
- The enquiry endpoint checks: signed-in parent, listing still public, subjects within the teacher's approved subjects, limits from Q-3.

### 11.6 Acceptance tests (owner's list, mapped)

1–3 public browsing and exclusions → database tests on the public read function plus real-browser tests signed out; 4–6 connect and return through sign-up, email confirmation and sign-in → real-browser tests; 7 privacy → tests that public pages and responses contain no child data, email, phone or account ids; 8–9 publishing and server rules → database and direct-request tests; 10 desktop and phone → browser tests at both sizes with accessibility scans; 11 no payment or production change → reviewed in every pull request.

### 11.7 Boards

D8 homepage section (desktop), D9 public teacher list and listing page (desktop), D10 phone, D11 Connect: sign-in or register and the return to the enquiry. All marked PROPOSED.


## 12. Owner decisions of 16 Oct 2026, 17:29 IST (OC-76) — revised specification

These decisions replace the recommendations they answer. Nothing below is built; the revised scope is presented for review before implementation.

### 12.1 Decisions applied

| # | Decision | Effect on this specification |
|---|---|---|
| 1 | **Enquiry visibility — accepted.** Teachers see the child's grade, curriculum and the enquiry's subjects; never the child's name, contact details, learning data or uploaded materials at enquiry stage. Acceptance grants no access; any link follows OC-36/OC-75 | US-D6, D6, access matrix row "See an enquiry" |
| 2 | **Enquiry limits — accepted.** Expiry 14 days without an answer; at most **5 unanswered** enquiries per parent; **one active** enquiry per teacher–child combination; expired, declined and withdrawn ones don't count; a new enquiry is allowed once the previous one is no longer active, with anti-spam controls; enforced on the server | §12.3 rules E-1 to E-6 |
| 3 | **Listing expiry — accepted.** 60 days, then hidden until renewed; renewal confirms availability, charges and approved subjects are still accurate; expired, paused, withdrawn, rejected or ineligible listings get no enquiries and no search results | §12.3 rules L-1 to L-5, journey J-7 |
| 4 | **Currencies — accepted.** INR, SGD, USD; currency always shown; **no conversion**; packages record period, sessions included and minutes per session | §12.3 rules P-a to P-d |
| 5 | **Payment-interest question — accepted with changes.** After an accepted enquiry, the parent is optionally asked: *"Would you be interested in paying for lessons through AA Pro in the future?"* Optional; market research only; reported as totals; not a purchase, commitment or authorisation to charge | Q-8 replaced; parents only (teachers are not asked); journey J-8; §12.4 |
| 6 | **Reports permission — accepted with changes.** Super Admins see the aggregate marketplace reports; other Admins only with a new **Reports** permission; enforced on the server; report access audited; aggregates only — no child information, no individual payment-interest answers, no private parent–teacher messages | Access matrix, D7, §12.4 |
| 7 | **Public homepage listings — confirmed** (§11) | §11 stands; enquiry steps follow decisions 1–3 |
| 8 | **Payment boundary — confirmed.** No gateway, collection, commissions, payouts, refunds or payment obligations; a future proposal uses registrations, active usage, listings, enquiries, matches and aggregate payment interest; payments need separate explicit approval | §9 stands |

### 12.2 Updated access-control matrix (marketplace)

| Action | Visitor | Parent | Student | Teacher not approved / deactivated | Approved teacher | Admin with Reports | Admin without Reports | Super Admin |
|---|---|---|---|---|---|---|---|---|
| Browse public listings and filters | Yes | Yes | No (child app shows no marketplace) | Public pages only | Yes | Public pages only | Public pages only | Public pages only |
| Send an enquiry | Sign in first | Yes, within E-1–E-6 | No | No | No | No | No | No |
| See an enquiry | — | Own only | — | — | Addressed to them: grade, curriculum, subjects, times, mode, message, parent's first name | No | No | No |
| Accept / decline | — | Withdraw own | — | — | Own enquiries | — | — | — |
| Create / edit / publish / pause / withdraw / renew a listing | No | No | No | No | Own, approved subjects and grades | No | No | Hide only (P-8, audited) |
| Answer the payment-interest question | — | Optional, once per accepted enquiry (at most once a month) | — | — | — | — | — | — |
| See marketplace reports (totals) | No | No | No | No | No | Yes, access audited | No (refused on the server) | Yes, access audited |
| See individual payment-interest answers or private messages | Never | Own answer | — | — | Own enquiries' messages | Never | Never | Never |

### 12.3 Server rules

**Enquiries**
- E-1 Only a signed-in, active parent can send. The listing must be published, unexpired and the teacher approved and active at that moment.
- E-2 At most **5** enquiries in status *pending* per parent; *accepted*, *declined*, *withdrawn* and *expired* don't count.
- E-3 At most **one active** (pending or accepted) enquiry per **teacher + child**. When the enquiry has no child account (P-4), "child" means the parent plus the stated grade and curriculum — *Claude's reading, to confirm*.
- E-4 Pending enquiries become *expired* 14 days after sending. Expiry is applied when anyone views them and by a daily clean-up once a scheduler exists.
- E-5 Anti-spam (proposed): at most **10 new enquiries per parent per day**; after a teacher **declines**, the same parent can ask that teacher again for the same child after **7 days**; message up to 500 characters, plain text; rate limit per network address for signed-out visitors' connect attempts.
- E-6 Subjects must be among the teacher's approved subjects (and the child's subjects when a child account is chosen).

**Listings**
- L-1 Only an approved, active teacher can publish; subjects and grades must be within the approved profile (database check).
- L-2 A published listing expires **60 days** after publishing or last renewal; a reminder is queued 7 days before.
- L-3 **Renewal** requires the teacher to tick three confirmations: usual free times are correct; asking prices are correct; subjects and grades are still the ones they are approved for. Renewal restarts the 60 days.
- L-4 Paused, withdrawn, expired listings, and listings of pending, rejected or deactivated teachers, are excluded from every public and parent query and refuse new enquiries; pending enquiries on such a listing stay answerable by the teacher only while the teacher is approved and active.
- L-5 An approved subject change (OC-73) that removes a listed subject removes it from the listing; a listing left with no subject returns to draft.

**Prices**
- P-a Currencies: INR, SGD, USD. Every displayed price shows its currency; no conversion anywhere.
- P-b Models: hourly (rate + minutes per session), weekly, biweekly, monthly (amount + sessions included + minutes per session; the period is the model).
- P-c Up to 3 prices per listing (P2-R3 Q-6, still to confirm). Amounts stored in the smallest unit; positive; sensible upper bound.
- P-d The enquiry stores a snapshot of the asking price the parent chose; any agreed price is recorded separately at booking (Phase 3).

### 12.4 Reporting specification (D7)

| Figure | Definition |
|---|---|
| Registered parents / teachers | Accounts created, by role (all time and in period) |
| Active parents / teachers | Signed in at least once in the period |
| Approved teachers | Teachers with an approved profile and active account |
| Published listings | Listings shown publicly at the end of the period |
| Enquiries by status | Sent in the period: pending, accepted, declined, withdrawn, expired |
| Successful matches | Accepted enquiries followed by an active teacher–child link for that parent within 30 days |
| Confirmed lessons | After booking exists (Phase 3) |
| Payment interest | Totals of Yes / No / Not sure from parents, in the period |

- Totals only; no names, children, messages or individual answers. **Small numbers below 5 are shown as "fewer than 5"** so that no individual can be singled out — *Claude's proposal, to confirm*.
- Access: Super Admin, and Admins with the **Reports** permission (new value in `admin_permissions`, managed on board 66). Every report view and CSV download is written to the audit log (`REPORT_VIEWED`, `REPORT_DOWNLOADED`).
- The payment-interest answer is stored against the account only so that it is asked once; it is never shown individually and can be deleted with the account.

### 12.5 User journeys (additions)

| # | Journey | Steps |
|---|---|---|
| J-7 | Teacher renews a listing | Reminder email (queued) 7 days before expiry → Looking for students → "Renew for 60 days" → three confirmations → renewed. Not renewed: hidden at day 60; renewing later publishes it again |
| J-8 | Payment-interest question | Parent opens an accepted enquiry → optional card "Would you be interested in paying for lessons through AA Pro in the future?" Yes / No / Not sure / Skip → thank-you line; never asked again for that enquiry, at most once a month |
| J-9 | Enquiry limits | A sixth unanswered enquiry is refused: "You have 5 enquiries waiting for an answer. Withdraw one or wait for answers." A second active enquiry to the same teacher for the same child is refused with a link to the existing one |

### 12.6 Acceptance criteria (marketplace, consolidated)

1. A visitor browses published, eligible listings on the homepage and `/teachers` without signing in, on desktop and phone.
2. Draft, paused, withdrawn, expired listings and listings of pending, rejected or deactivated teachers never appear and refuse enquiries (server and database tests).
3. Connect while signed out leads to sign-in or parent sign-up and back to the same teacher's enquiry form, including after email confirmation on another device.
4. A teacher sees grade, curriculum and subjects of an enquiry, never the child's name, contact details, learning data or materials; acceptance creates no link and no access.
5. Limits E-1 to E-6 hold under direct requests, including a sixth unanswered enquiry, a duplicate active enquiry and re-asking after decline.
6. Listings expire after 60 days; renewal requires the three confirmations; expired listings are hidden.
7. Prices show their currency (INR, SGD, USD) and are never converted; packages show period, sessions and minutes.
8. The payment-interest question is optional, uses the approved wording, and appears in reports only as totals.
9. Reports are refused to Admins without the Reports permission (direct request included); views and downloads are audited; small numbers are suppressed.
10. No payment gateway, collection, commission, payout, refund or payment obligation exists anywhere; no paid service is connected.
11. Teachers can publish only within their approved subjects and grades; parent accounts can never publish.
12. All existing CI checks and regression suites keep passing.

### 12.7 Still open (decisions needed before the matching pull requests)

| # | Topic | Recommendation |
|---|---|---|
| K-1 / P-1 | Public and in-app listing fields beyond OC-54; publishing = consent to public display | As recommended in §2 and §11.4 |
| K-2 | Directory "Add as my teacher" (OC-36(6)) vs enquiry first | Keep "Add by email"; directory uses enquiries |
| K-3 | In-person teaching | Online only for now |
| K-4 | Contact details after acceptance | Shared only if both choose |
| K-6 | Curriculum and experience reviewed or "as stated" | "As stated", reviewed at first approval |
| P-3 | Search-engine indexing | Not indexed until you decide |
| P-4 / E-3 | Enquiry without a child account; what "teacher–child" means then | Parent + stated grade and curriculum |
| Q-6 | Up to 3 prices per listing | Yes |
| Q-7 | Free-text messages and "Report" | 500 characters, plain text, report to the AA Pro team |
| Q-10 | Build PR3 (board 65) now | Yes, as approved; marketplace PRs after design approval |
| New | Anti-spam values in E-5 and small-number suppression in §12.4 | As proposed |

### 12.8 Revised delivery plan

PR3 (approved board 65) → PR-D1 profile additions and weekly times → PR-D2 listings, prices, expiry and renewal → PR-D3 public homepage section, `/teachers`, listing pages, filters (behind the test-site password) → PR-D4 enquiries for parents and teachers with limits, connect-and-return flow → PR-D5 reports with the Reports permission, audit and the payment-interest question. Each pull request: scope summary first, report afterwards, all CI checks green.

### 12.9 Dependencies

- Email delivery (A-02 / OC-65) for reminders and enquiry notices — queued to the outbox until a provider is approved.
- A scheduler for daily expiry clean-up (free Vercel daily cron on the test project, or expiry applied on read until then).
- Production deployment (P-2) for truly public browsing — not authorised.
- Booking (Phase 3) for confirmed lessons and agreed prices.

## 13. Owner decisions of 16 Oct 2026, 18:22 IST on the 11 open clarifications (OC-77)

These decisions close §12.7. Where they differ from earlier sections, this section wins. Nothing here is built; the marketplace features stay gated by approval of their designs and requirements (decision 11).

### 13.1 Decisions applied

| # | Decision | Changes to this specification |
|---|---|---|
| 1 | **Directory fields and consent.** OC-54 fields (name, subjects, grades, time zone, bio) for teachers without a published listing. Publishing needs **explicit consent** to show the public fields exactly as previewed. Never contact details or child data. Teachers can pause or withdraw | Listing editor (D5) gets a consent step under the preview; consent recorded with version and time (§13.2) |
| 2 | **Linking.** "Add by email" stays. Directory and public-listing **enquiries need the teacher's acceptance** before the parent is offered the linking step; acceptance grants no access | US-D4/D6, D4 next steps; see conflict C-1 for PR3 |
| 3 | **Online only.** In-person deferred to a separate safeguarding and privacy decision | Mode is fixed to online; no mode filter until in-person exists; no location data collected |
| 4 | **Contact details.** Never revealed automatically after acceptance; **both** parent and teacher must agree before they are exchanged; a notice says AA Pro does not process or guarantee payments arranged directly | `contact_consents` (§13.2); D4/D6 copy |
| 5 | **Claims.** Curriculum and experience shown as **"As stated by the teacher"**; never "verified" or "certified" without an approved verification process | Copy rule for all boards and pages |
| 6 | **Indexing.** `noindex` on public listing pages; still browseable signed out; indexing revisited separately; normal access controls unchanged | Page metadata and `X-Robots-Tag`; note: the whole site is already `noindex` today (`src/app/layout.tsx`) |
| 7 | **Duplicate enquiries.** With a child profile: check by child id. Without: **parent + teacher + stated grade + curriculum**, subjects recorded on the enquiry. One active enquiry per combination. No child profile is created automatically | Rule E-3 replaced (§13.3); constraint C-2 |
| 8 | **Pricing.** Up to **3** options from hourly, weekly, biweekly, monthly; show currency, amount, period, sessions and duration where applicable; information only | Rule P-c confirmed |
| 9 | **Messages and reports.** Free text ≤ 500 characters, shown as plain text; **Report** action; server validation and anti-abuse; the reporter's identity is **not** shown to the reported person by default | `marketplace_reports` (§13.2); moderation access, constraint C-5 |
| 10 | **Limits (configurable starting values).** 5 pending enquiries per parent; 10 new enquiries per parent per rolling 24 h; 3 reports per account per rolling 24 h; 10 listing edits per teacher per rolling 24 h. Report counts below 5 shown as **"Fewer than 5"** where they could expose individuals. Exact moderation details only for authorised staff | §13.3 rules; constraint C-4 |
| 11 | **PR3** proceeds with the approved board 65 scope; listings, prices, enquiries and reports stay in separate pull requests, gated by design approval | Delivery plan §13.6; conflict C-1 |

The 7-day wait after a decline (my proposal in §12.3 E-5) is **not** part of decision 10 and is dropped unless you ask for it.

### 13.2 Data model changes (proposed, not built)

| Table / column | Purpose |
|---|---|
| `teacher_listings.consent_version`, `consent_at` | The public-display consent given when publishing; asked again when the previewed public fields change (subjects, grades, curriculum, prices, free times, bio) |
| `teacher_listings.mode` = `online` only (check constraint) | Decision 3 |
| `listing_prices` (max 3 per listing, enforced in the database) | Decision 8 |
| `teacher_enquiries.child_id` (nullable), `stated_grade`, `stated_curriculum`, `subjects`, `message` (≤ 500) | Decision 7; a partial unique index on (parent, teacher, child) where active, and another on (parent, teacher, grade, curriculum) where active and `child_id` is null |
| `contact_consents` (enquiry, party, agreed_at) | Decision 4: details shown only when both rows exist |
| `marketplace_reports` (reporter, reported account, enquiry or listing, reason, text ≤ 500, status, handled_by) | Decision 9; reporter never exposed to the reported person |
| `marketplace_limits` (name, value) or code constants with an environment override | Decision 10 "configurable"; see C-4 |
| `rate_events` (account, kind, at) | Rolling 24-hour counts for enquiries, reports and listing edits |

### 13.3 Server rules replaced or added

- **E-2** at most 5 enquiries in *pending* per parent. **E-3 (replaced)** one active (pending or accepted) enquiry per parent + teacher + child id; without a child profile, per parent + teacher + stated grade + curriculum. **E-5 (replaced)** at most 10 new enquiries per parent per rolling 24 hours; messages ≤ 500 characters, plain text.
- **R-1** at most 3 reports per account per rolling 24 hours; a report needs a reason; the reported person never sees who reported.
- **L-6** at most 10 listing saves per teacher per rolling 24 hours (drafts included).
- **L-7** publishing requires the consent of decision 1 against the current preview.
- **C-x** contact details are shown to each party only after both have agreed, per enquiry; agreement can be withdrawn and hides them again.
- **M-1** mode must be `online`.
- Report figures below 5 show as "Fewer than 5".

### 13.4 Access-control matrix (additions to §12.2)

| Action | Visitor | Parent | Student | Teacher not approved | Approved teacher | Admin with Moderation (proposed) | Other Admins | Super Admin |
|---|---|---|---|---|---|---|---|---|
| Agree to share contact details for an enquiry | — | Own accepted enquiries | — | — | Own accepted enquiries | — | — | — |
| See the other party's contact details | Never | Only after both agreed | — | — | Only after both agreed | Never | Never | Never |
| Report a listing or enquiry | Sign in first | Yes, R-1 | No | No | Yes (enquiries they received), R-1 | — | — | — |
| See and handle reports, with reporter identity | No | No | No | No | No | Yes, audited | No | Yes, audited |
| Give public-display consent and publish | No | No | No | No | Own listing | No | No | No |

### 13.5 Acceptance criteria added

13. Publishing is impossible without the consent step; the consent's version and time are stored; changing a public field asks again.
14. Contact details appear only after both parties agree, and disappear if either withdraws.
15. Duplicate checks use the child id when present, otherwise parent + teacher + grade + curriculum; no child profile is created by an enquiry.
16. The four limits of decision 10 hold under direct requests, including the 11th enquiry and the 4th report in 24 hours.
17. A reported person never sees the reporter; only authorised staff see report details, and each view is audited.
18. Listing pages send `noindex`; signed-out browsing still works.
19. Only "online" is accepted as a mode; no in-person option or location field exists.
20. No page or report shows "verified" or "certified" for curriculum or experience.

### 13.6 Implementation conflicts and technical constraints (not resolved silently)

| # | Conflict or constraint | Options | Recommendation |
|---|---|---|---|
| C-1 | **Board 65 vs decision 2.** Approved board 65 has "Add as my teacher" (immediate link, OC-36(6)) and "See available times". Decision 2 says directory enquiries need acceptance first, while decision 11 says build board 65's approved scope | (a) Keep "Add as my teacher" in PR3; it opens the existing Add-by-email form pre-filled (OC-75 subject rules apply); replace it with "Send an enquiry" in the enquiry PR. (b) PR3 shows profiles only, no add button, until enquiries exist | (a), and hide "See available times" until availability exists — **Decided (OC-78, owner 16 Oct 2026): option (a); built in PR3** |
| C-2 | **Fallback duplicate key.** Two siblings with the same grade and curriculum and no profiles collapse into one combination; and a parent may create a child profile later while a fallback enquiry is active | Treat the fallback combination as matching any of that parent's children with the same grade and curriculum | As stated: one active enquiry across both forms |
| C-3 | **Rolling 24-hour limits** need a small event log; counts are checked inside the same transaction to avoid races | — | `rate_events` table, pruned after 7 days |
| C-4 | **"Configurable" limits.** Changing them without a code change needs a settings table and a Super Admin screen, which is new UI | (a) Constants with an environment override (change needs a redeploy). (b) Settings table plus a small admin screen | (a) now; (b) later if tuning is frequent |
| C-5 | **Who moderates reports.** The existing Admin permissions are Accounts, Teacher approvals and Audit log | (a) New "Moderation" permission. (b) Reuse Teacher approvals | (a) |
| C-6 | **Consent re-prompt.** Small edits (a typo in the bio) would ask for consent again | Re-ask only when public fields change; show what changed | As stated |
| C-7 | **Contact details** are the account email; teachers and parents may prefer not to share their sign-in email | Share the sign-in email only, or let each person type a contact email for sharing | Sign-in email only for now |

### 13.7 Proposed screens

D4, D5 and D6 are updated for decisions 1, 4, 5 and 9 (consent step, mutual contact sharing, "As stated by the teacher", Report). D1, D2, D3 and D8–D10 drop the in-person option. No new boards are needed.

### 13.8 Delivery plan

PR3 (board 65, with C-1 option a) → PR-D1 profile additions → PR-D2 listings, consent, prices, expiry → PR-D3 public pages and filters (`noindex`, behind the test-site password) → PR-D4 enquiries, limits, contact consent, reports → PR-D5 reports page with the Reports permission. Each marketplace PR starts only after you approve its designs.

## 14. Consolidated owner decisions (OC-79, 16 Oct 2026, 19:27 IST)

The owner consolidated the marketplace decisions (Part C), the teacher terms (Part D) and the delivery order (Part E) in one message. OC-76, OC-77 and OC-78 stay in force except where amended below.

### 14.1 Status of each item

| Category | Items |
|---|---|
| **Confirmed by the owner** | Part C1–C12 business rules; Part D principles for the draft terms; Part E delivery order |
| **Designs awaiting visual review** | Boards D1–D11, revised for this message, with a read-me board (D0) that gives each board's role, purpose, key actions, states and next screens. The contact-consent step is on D4 (parent) and D6 (teacher); renewal and expiry are on D5. **None is visually approved** |
| **Approved for implementation** | Board 65 basic directory — **built and merged (PR #44)**. Marketplace screens are built only after their boards are approved (C13) |
| **Still needs separate approval** | Real email delivery (OC-65); payment processing, checkout, commission or subscriptions (C9, C12); in-person teaching (C4); ratings or reviews (C11); production deployment; final teacher terms after legal review (Part D) |

### 14.2 Changes from earlier decisions

| # | Rule | Source | Change |
|---|---|---|---|
| M-1 | Renewal reminder **7 days before** a listing expires, through the configured notification mechanism; if real email is not configured, the queued message is reported as queued, not delivered | C3 | **New** (OC-76(3) had expiry and renewal only) |
| M-2 | Enquiry messages carry a **warning not to share contact details** before acceptance | C6 | **New** |
| M-3 | Before linking, the teacher may see the **parent's first name** as well as the child's grade, curriculum, subjects, preferred times, mode and message; never the child's name or learning data | C7 | **Amends OC-76(1)**, which did not mention the parent's first name |
| M-4 | Payment-interest question wording: **"Would you like to pay or be paid through AA Pro in future?"** Choices Yes, No, Not sure; asked after an accepted enquiry; reported in aggregate only. Read as asked of **both** the parent and the teacher, since it says "pay or be paid" | C12 | **Amends OC-76(5)** (old wording asked parents only) |
| M-5 | **No fixed registration threshold** for the future payment phase; a proposal follows when usage, demand and feedback justify it | C12 | Clarified |
| M-6 | No **ratings, reviews or ranking badges** | C11 | Recorded explicitly |
| M-7 | Adoption metrics include registered and active parents and teachers, published listings, enquiries by status, accepted enquiries followed by a teacher link, confirmed lessons (once real booking exists) and the payment-question totals; small counts suppressed | C12 | Lists the metrics; suppression stays "Fewer than 5" (OC-77(10)) |
| M-8 | Rate limits are **configurable**; the values recorded in OC-77(10) are starting values, not fixed rules | C6 | Clarified |
| M-9 | Public pages show the teacher's name, approved subjects and grades, curriculum, experience ("as stated by the teacher"), online mode and asking prices only | C2 | Same as OC-77(1), (5), (6) |
| M-10 | Asking price recorded with the enquiry stays separate from any later agreed lesson price | C5, C10 | Same |

### 14.3 Open items (genuinely not answered)

| # | Item | Smallest decision needed |
|---|---|---|
| ~~C-2 to C-7 (§13.6)~~ **Decided (OC-80): as recommended** | Marketplace technical constraints: duplicate key for siblings without profiles, a small rate-event log, configurable limits as settings, a new Moderation permission, consent re-prompt only when public fields change, sign-in email as the shared contact | Accept the recommendations in §13.6 as written (yes / no, or name the one to change). The owner's Part B "C-2 to C-7" refers to the textbook conflicts in P2-R2 §4, not these |
| ~~Terms tick~~ **Decided (OC-80): keep on the test site, marked draft; no tick for the marketplace terms; replaced before launch** | Teachers already tick the draft general teacher terms (OC-71) when sending their profile. Part D says no mandatory legal acceptance until the final terms are approved | Keep the existing tick on the test site (synthetic accounts only, clearly marked draft), or make it non-binding until the final terms. The new marketplace terms are **not** made mandatory anywhere |

### 14.4 Acceptance criteria added

21. Seven days before expiry the teacher gets a renewal reminder in the outbox, once per listing period; the report says "queued" unless real delivery is configured.
22. The enquiry form shows the contact-details warning next to the message box.
23. A teacher's enquiry view shows the parent's first name and never the child's name; checked by a test that searches the page for the child's name.
24. The payment question offers exactly Yes, No and Not sure, can be ignored, and appears only after an accepted enquiry; reports show totals only.
25. No page shows a rating, review or ranking badge.

### 14.5 Delivery

Boards D0–D11 are presented for visual review. After approval: PR-D1 profile additions → PR-D2 listings, consent, prices, expiry and the 7-day reminder → PR-D3 public pages and filters (`noindex`) → PR-D4 enquiries, limits, contact consent, reports → PR-D5 adoption figures with the Reports permission. Each is a separate pull request with a scope summary first and a report afterwards.

### 14.6 Home page boards (OC-80)

The owner asked for the home page design first. Boards **H1** (desktop) and **H2** (phone) show the whole approved board 63 with the public "Teachers looking for students" section added (C2). D8 showed only that section and is superseded. Both boards are **awaiting visual review**.

Changes from board 63:
- "Find a teacher" is added to the menu and the hero.
- The new section has filters, listing cards, "See all teachers", a short "how connecting works" and an empty state.
- A "Looking for students?" band for teachers.
- Two new FAQs, about finding a teacher and paying one.
- One sentence added to "Every teacher is checked" ("as stated by the teacher").

Listing cards show only the public fields of C2: name, approved subjects and grades, curriculum, experience as stated, online, asking prices. Listing pages carry `noindex`.
