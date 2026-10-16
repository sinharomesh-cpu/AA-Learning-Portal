# AA Pro — P2-R3 Two-way teacher discovery, matching and payment planning: gap analysis and plan

**Version:** 1.1 · 16 Oct 2026 (adds §11 public listings) · **Prepared by:** Claude (business analyst and developer roles) · **Status:** for owner review. Planning and design only; nothing in this document is built.
**Source:** owner requirement "Consolidated Requirement: Two-Way Teacher Discovery, Student Matching and Future Payment Planning" (16 Oct 2026, 17:06 IST), checked against the repository at `main` after PR #39, the decision register v1.30 and the approved design boards.

## 1. What exists today

| Area | In AA Pro now | Source |
|---|---|---|
| Approved teacher profiles | Name, time zone, subjects, grades, bio; subject/grade changes re-reviewed (OC-73) | PR #35 |
| Approval | Every teacher sends a completed profile and is approved by the Super Admin or an Admin (OC-38, OC-75) | PR #35, #39 |
| Parent–teacher links | Add by email, per-child subjects limited to the teacher's approved subjects (OC-75); pending links give no access; one server check `teacherMaySee` | PR #38, #39 |
| Teacher directory | **Approved board 65, not built** (authorised as PR3). Search by subject, grade, name; shows name, subjects, grades, time zone, bio; teacher can hide from search (OC-54); "Add as my teacher" links at once (OC-36(6)) | Board 65 |
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
| Q-2 | What does a teacher see in an enquiry? | Child's **grade, subjects and curriculum**, preferred times, mode and the parent's message and first name. **Not** the child's name or any learning data until the parent links the teacher |
| Q-3 | Enquiry expiry and limits | Expires after **14 days** without an answer (like OC-67); a parent can have at most **5 pending enquiries** at once and one pending enquiry per teacher and child |
| Q-4 | Listing expiry | A published listing expires after **60 days** unless renewed; the teacher is reminded 7 days before (queued email) |
| Q-5 | Currencies | INR, SGD and USD to start (the time zones seen so far are India and Singapore); amounts stored in the smallest unit |
| Q-6 | How many prices per listing? | Up to **three** pricing options (for example hourly and monthly), each with currency, amount, model, sessions per period and minutes per session |
| Q-7 | Free-text messages in enquiries | Allowed, up to 500 characters, with a notice not to share contact details before acceptance; reports can be sent to the AA Pro team |
| Q-8 | "Feedback requesting integrated payments" | A one-time optional question after an accepted enquiry: "Would you like to pay (or be paid) through AA Pro in future?" Yes / No / Not sure. Counted in aggregate only |
| Q-9 | Who sees the adoption metrics? | Super Admin, and Admins with a new "Reports" permission; numbers only, never names (OC-21) |
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
