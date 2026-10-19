# CR-15 — Marketplace pricing (hourly lessons and learning packages), teacher-controlled negotiation, verification and feedback badges

**Version:** 1.0 · 19 Oct 2026 · **Status:** **approved implementation baseline** (owner, "CR-15 Final Implementation Instructions", 19 Oct 2026, 11:53 IST — OC-104). Phase A is being built in small pull requests; Phase B waits for scheduling. No production deployment, production data change or spending without separate written approval.
**Sources (owner, 19 Oct 2026, IST):** time-slot negotiation brief (09:36); consolidated brief "AA Pro Final Requirements and Claude Brief" with the listing-card mockup (10:24); "Hourly Pricing and Monthly Packages" addition (10:34); **PK0 decisions P-1 to P-10 (10:55)** and the **final P-7 clarification (10:58)**, which supersede conflicting earlier assumptions.
**Designs:** design canvas pages "CR-15 Marketplace" (MK0–MK8), "CR-15 addition" (PK0–PK4) and **"CR-15 final pricing model" (PM0–PM9, this version)**. Earlier CR-14 boards SL0–SL5 are superseded.
**Budget:** ₹0. No paid service, API, infrastructure or billable test. Synthetic data only.

Legend: **[Confirmed]** = owner decision. Items marked **[Recommended]** in v0.4 were approved by OC-104 unless §9 says otherwise; Phase B items (O-11 to O-16) stay open until re-presented.

---

## 1. Final business rules (P-1 to P-10) — [Confirmed]

| # | Rule |
|---|---|
| **P-1 Completion period** | The teacher sets it; default **6 weeks**. Minimum = ⌈classes ÷ classes per week⌉ weeks (22 at 5 a week → 5 weeks); longer is allowed, shorter is refused by the server and the database. Never described as "one calendar month". Shown before confirmation with class count, frequency and schedule. A package is **never completed because time passed** — only by delivered classes under the agreed terms. |
| **P-2 Class count** | Default **22**; the teacher may set more; **fewer than 22 is refused** unless the owner approves an exception. Fixed once both confirm; later change only by an explicitly agreed amendment (both parties). Shown on the listing, proposal, confirmation and progress. |
| **P-3 Missed classes and rescheduling** | One owner-approved **terms template** (draft in §7) covering parent/student absence, teacher absence, notice, late cancellation and no-show, rescheduling and make-ups, holidays and exceptional circumstances, early termination and outstanding classes. Only an **actually delivered** class increases the completed count. Both parties review and explicitly accept the terms before confirmation. No final legal wording invented; clauses needing legal review are flagged. |
| **P-4 Refunds** | AA Pro does not process or guarantee refunds, does not collect or initiate payments, and is not presented as a payment processor, refund provider or dispute-resolution service. Cancellation, termination and refund-related terms are disclosed before confirmation. Draft wording in §7.3, for legal review. |
| **P-5 Renewal** | **Never automatic**: no renewal, no new commitment, no charge. After completion or the end of the period the parent may choose "Arrange another package", which starts a new agreement and confirmation. |
| **P-6 Package negotiation** | Price only. Classes, lesson length, completion period, weekly frequency, schedule/times and terms are set by the teacher and **cannot** change in negotiation; a counter-offer changes the price only. Flow: parent proposes → teacher accepts / declines / counters → parent accepts / declines a counter; withdrawal and expiry. The teacher independently chooses **Fixed package price** or **Negotiation available**. Other changes need an amendment or a new arrangement. |
| **P-7 Hourly vs package (final clarification, 10:58)** | Two **independent** pricing and teaching models. **Hourly lessons — flexible:** the teacher publishes an hourly rate and available slots; each slot is Fixed rate or Negotiation available; parents book **individual lessons with no 22-class commitment**; a lesson's price = agreed hourly rate × lesson length ÷ 60; parents and teachers can arrange more lessons whenever needed. **Learning packages — structured:** default 22 classes (more allowed); the teacher sets lesson length, weekly frequency, completion period (default 6 weeks, minimum check) and usual schedule; the teacher sets the package price **independently — never calculated from the hourly rate**; Fixed price or Negotiation available; price-only negotiation; explicit agreement; no automatic renewal. **Independence:** a teacher may publish hourly, a package, or both; changing or negotiating one price never changes the other; booking hourly lessons never creates a package; arranging a package never creates separate hourly bookings; listing cards show the two side by side for comparison. The former 22-class minimum for hourly lessons (O-18, MK7) is withdrawn. |
| **P-8 Independent rules** | Hourly slots have their own Fixed/Negotiable setting and show date, time, duration, currency and rate. Packages use the teacher's usual times, their own schedule and completion period, and their own Fixed/Negotiable setting. Slot labels never appear to control the package. Changing one never changes the other. |
| **P-9 Migration** | Hide weekly and fortnightly prices from public listings; convert monthly prices to **fixed-price learning packages**, keeping the published price as entered; default **Fixed**; never publish a package that fails P-1/P-2; flag what cannot be mapped for review; delete nothing; keep profiles, times and other listing data. Mapping, rollback and integrity in §6. |
| **P-10 Limits and cooldown** | Separate for each type: at most **one open hourly** and **one open package** proposal per parent, teacher and child context; neither blocks the other; a decline starts a **7-calendar-day** wait for a new proposal **of the same type** for the same parent, teacher and child; withdrawal and expiry do not. Lifecycle kept: Pending, Counter-proposed, Accepted, Declined, Withdrawn, Expired. Enforced on the server and in the database; duplicates and simultaneous requests handled safely. |

**Expiry rule (checked against the built CR-13):** a negotiation expires **14 calendar days after the latest valid offer**; each new offer resets it (FR-040.12). Unchanged.
**Other CR-13 rules kept [Confirmed earlier, OC-99]:** at most 6 offers including the first; after offer 6 only accept or decline; offer numbers shown; limits of 5 open and 10 new per parent per calendar day (parent's time zone), configurable by the Super Admin, counted across both types [Approved R-7]; minimum child data (grade and curriculum for a prospective child); an agreed price is a record only — no booking, link, access to learning materials or payment.

## 2. Conflicts with earlier requirements and how they are resolved

| # | Earlier rule | Conflict | Resolution |
|---|---|---|---|
| C-1 | OC-77(8), OC-79 C, OC-99(1): up to 3 prices — hourly, weekly, every two weeks, monthly | P-7/P-8 define two offers only | **[Confirmed P-9]** One hourly rate + one learning package per listing; weekly/fortnightly hidden (kept in history); monthly → package. OC-77(8) and OC-99(1) marked "amended by CR-15" (text kept). |
| C-2 | OC-99(10), FR-040.2: dashboard control **and** a switch per price | Hourly negotiability is now per slot; the package has its own setting | **[Confirmed P-8]** per-slot and package settings replace the per-price switch. **[Approved R-8]** the dashboard control stays as a master pause for new proposals of both types. |
| C-3 | FR-040.7: an offer may change minutes and lessons per period | P-6 price only | **[Confirmed]** Package offers: amount only. **[Approved]** hourly offers: amount only (rate per hour). |
| C-4 | FR-040.14/.15: one active and the 7-day wait per child and **pricing basis** (4 bases) | P-10: per type (hourly, package) | **[Confirmed]** Key = parent, teacher, child context, **type**. Not per slot (so changing slot cannot reset the wait). |
| C-5 | MK7 / O-18 (this morning): 22-class minimum for hourly arrangements | P-7 | **[Confirmed]** Withdrawn; hourly is commitment-free. |
| C-6 | OC-79 / K-5: **40-minute maximum** session length (Zoom free tier) | Packages and hourly lessons are described in 60-minute examples | **[Open R-6]** keep 40 min, or allow up to 60/90 min when the teacher uses their own meeting link (CR-12 Point 2 safeguards). Zoom paid plan stays Blocked — Owner Budget Approval Required. |
| C-7 | OC-79 C / OC-77(5) / OC-82(3): "no ratings, reviews or ranking badges"; no "verified" claims without a process | The consolidated brief asks for a verification tick and Gold/Silver/Bronze | **[Confirmed by the brief]** allowed only through the defined process (§5) and eligible reviews; until then "Not yet rated" and no tick. OC-79 C and OC-82(3) marked "amended by CR-15 for verification and eligible-review badges". |
| C-8 | `listing_prices` minutes 10–40, sessions 1–31 | P-2 needs ≥ 22 classes, no 31 cap stated | **[Approved R-3]** package class count 22 to 60. |
| C-9 | CR-14 (SL boards) and MK2/MK7 | Superseded | PM boards replace them; their slot rules carry over. |
| C-10 | Name "Monthly learning package" | P-1 forbids "one calendar month" | Public name **"Learning package"**; period always shown as "complete within N weeks". |
| C-11 | CR-13 stored an agreed rate per pricing basis and used one asking price per basis | P-7: hourly lesson price = rate × length; package price stands alone | **[Confirmed]** Hourly: the agreed or fixed **rate per hour** is stored; each lesson's price is calculated from it and the lesson length at booking, and shown before the parent confirms. Package: one total price, never derived from the hourly rate; no "per class" or "saving" figure is calculated by AA Pro [Approved R-13]. |
| C-12 | MK boards: an agreed slot price became a recurring weekly slot | P-7: hourly lessons are individual | **[Confirmed]** An hourly agreement is a rate for that teacher, child and slot; each lesson is booked individually (Phase B); nothing recurring is created. |

## 3. Screens (design canvas, page "CR-15 final pricing model")

| Board | Covers (owner's list) |
|---|---|
| PM0 | Read me: rules, conflicts, open decisions |
| PM1 | (1) Listing cards: verification tick, eligible rating, **Hourly lessons** and **Learning package** as separate boxes; hourly-only, package-only and both; desktop and phone |
| PM2 | (2) Teacher: hourly rate and per-slot Fixed/Negotiable |
| PM3 | (3) Teacher: learning package configuration (classes ≥ 22, length, frequency, completion period with minimum check, usual times, terms template, Fixed/Negotiable) and validation errors |
| PM4 | (4) Parent proposals: hourly (slot) and package (price only), with summaries and refusal states; phone |
| PM5 | (5) Teacher proposal management: accept, decline, counter, withdrawn, expired, cooldown and limit states, both types |
| PM6 | (6) Confirmation: parent and teacher accept the package terms and schedule; hourly lesson booking and confirmation (individual, price = rate × length, no commitment, never creates a package) |
| PM7 | (7) Package progress: completed / remaining / missed / rescheduled, completion period, "Arrange another package"; phone |
| PM8 | (8) Migration: teacher notice, needs-review states, Super Admin review list |
| PM9 | Draft terms template with legal-review flags (P-3, P-4) |

## 4. Data model, API behaviour and state transitions

### 4.1 Phase A (buildable before scheduling)

**`teacher_listings`** (existing) — add:
- `hourly_rate_minor bigint NULL CHECK (> 0)`, `hourly_currency text NULL` (INR/SGD/USD), `hourly_offered boolean NOT NULL DEFAULT false`.
- The published copy (`published` jsonb) gains `hourly` and `package` sections; the old `prices` array stays in stored history and is no longer shown.

**`teacher_usual_times`** (existing) — add `negotiable boolean NOT NULL DEFAULT false` (hourly only). Saving times keeps each slot's setting by matching weekday and hours (today the save replaces all rows).

**`learning_packages`** (new):
`id`, `teacher_id`, `status` (`draft`, `published`, `paused`, `needs_review`, `retired`), `price_minor bigint > 0`, `currency`, `classes smallint` (≥ 22, ≤ R-3 maximum), `classes_per_week smallint` (2–7, R-5), `lesson_minutes smallint` (R-6 range), `completion_weeks smallint` (≥ ceil(classes ÷ per week); ≤ R-4 maximum), `times jsonb` (list of weekday/start/end from the teacher's usual times; count = classes per week; no overlaps), `negotiable boolean DEFAULT false`, `terms_version text` (approved template version), `terms_additions text NULL` (teacher's own extra notes, ≤ 1,000 characters, never overriding the template), `legacy_price_id uuid NULL` (link to the converted `listing_prices` row), `review_issue text NULL`, timestamps. One package per teacher (build reading 6). Database checks enforce every numeric rule and the completion minimum.

**`rate_negotiations`** (existing, CR-13) — add:
- `kind text` (`hourly`, `package`, `legacy`) — existing rows become `legacy` (weekly/biweekly/monthly) and continue to their end; no new legacy negotiations.
- Hourly: `slot jsonb` (weekday, start, end, teacher time zone) copied at proposal time.
- Package: `package_id`, `package_terms jsonb` (classes, minutes, per week, completion weeks, times, terms version) copied at proposal time.
- Unique index "one open" on (parent, teacher, child key, **kind**); decline-wait check per **kind**; offers: amount only (sessions/minutes copied from the snapshot, unchanged by counters).

**`teacher_verifications`** (new, §5): status, checks, reviewer, decided/expires dates, note; no ID images.

**`pricing_migration_reviews`** (new): one row per legacy price that could not be mapped (issue code, status open/resolved, resolver, dates).

### 4.2 Phase B (needs scheduling, Phase 3)

- **`hourly_lessons`** (individual bookings, P-7): parent, teacher, child, subject, slot date and time, lesson minutes, `rate_minor` per hour (published fixed rate, or the accepted hourly negotiation for that child), `price_minor` = round(rate × minutes ÷ 60) to the currency's smallest unit, currency, source (`fixed` / negotiation id), status (`requested`, `confirmed`, `declined`, `cancelled`, `completed`, `missed_student`, `missed_teacher`). No link to any package; no minimum count; each further lesson is a new row.
- **`arrangements`** (packages only): `kind` (hourly_lesson, package), parent, teacher, child, subject, agreed price and currency (from the proposal or the published price), terms snapshot and version, schedule, start date, completion period end (packages), status (`awaiting_teacher`, `confirmed`, `in_progress`, `completed`, `ended_early`, `declined`, `withdrawn`), both acceptances (who, when, terms version).
- **`slot_allocations`**: teacher, weekday, start, end, from date, to date, arrangement; a database exclusion constraint prevents two confirmed allocations overlapping for the same teacher and time.
- **`class_sessions`**: arrangement, scheduled start, status (`scheduled`, `held_pending_parent`, `completed`, `missed_student`, `missed_teacher`, `cancelled_notice`, `cancelled_late`, `rescheduled`, `make_up`), links between a rescheduled class and its make-up, who marked, who confirmed, timestamps. **Only `completed` counts.**
- **`reviews`** and the computed rating summary (§5).

### 4.3 Server functions and validation (all server-side, re-checked in the database where possible)

| Action | Who | Checks |
|---|---|---|
| Save hourly rate | Approved, active teacher (session) | amount > 0, ≤ 2 decimals, currency in list; changes show after publish |
| Set slot Fixed/Negotiable | Same | slot belongs to the teacher; applies at once |
| Save package | Same | classes ≥ 22 (≤ R-3); per week 2–7; minutes in R-6 range; completion ≥ minimum (≤ R-4); times exist in usual times, count = per week, no overlap; price > 0; currency; terms version is the approved one |
| Publish / pause package | Same | passes all checks; `needs_review` packages cannot be published |
| Propose (hourly) | Active parent | listing live; hourly offered; **slot exists and is negotiable now**; master switch on; one open hourly per child context; 7-day hourly wait; limits; amount valid; child is the parent's (or prospective grade/curriculum) |
| Propose (package) | Active parent | package published and **negotiable now**; one open package; 7-day package wait; limits; amount valid; terms copied |
| Counter / accept / decline / withdraw | The two parties only, by turn | CR-13 rules (turn, 6 offers, expiry, final states); amount only; others get "not found" |
| Book hourly lesson (Phase B) | Active parent; teacher confirms | slot free on that date (allocation check under lock); rate = slot's fixed rate, or an accepted hourly negotiation for this parent/teacher/child; lesson price calculated server-side and shown before confirm; **never creates or changes a package** |
| Confirm package (Phase B) | Parent, then teacher | price = published (fixed) or agreed (accepted negotiation, same terms snapshot); terms accepted by both; allocation conflict check under a lock; child relationship; then allocation is created in the same transaction |
| Mark class held / confirm / report missed (Phase B) | Teacher marks; parent confirms or reports | one action per class, locked; parent silence for 72 h confirms [Open O-15, Phase B] |

### 4.4 State transitions

- **Negotiation** (unchanged): Pending → Counter-proposed ↔ … → Accepted | Declined | Withdrawn (parent) | Expired.
- **Learning package (listing)**: draft → published ↔ paused; any → retired; legacy conversion → `published` (valid) or `needs_review`.
- **Arrangement (Phase B)**: awaiting_teacher → confirmed → in_progress → completed (delivered classes = classes) | ended_early (by agreement or notice); awaiting_teacher → declined | withdrawn. **No time-based completion and no renewal.**
- **Class session (Phase B)**: scheduled → held_pending_parent → completed; scheduled → missed_* | cancelled_* | rescheduled (→ new make_up session).

### 4.5 Authorisation, privacy, audit, concurrency

- Session-derived identities only; teachers see grade, curriculum and the parent's first name, never the child's name, before a confirmed relationship; Admins and the Super Admin see counts only for negotiations; migration review list visible to the Super Admin only.
- Audit events (no message text): package saved/published/paused, slot setting changed, proposal created/countered/accepted/declined/withdrawn/expired/refused, arrangement confirmed/declined/ended, class marked/confirmed/disputed, migration converted/flagged/resolved, verification decided.
- Concurrency: per-parent advisory lock for proposals (as CR-13); row locks for answers; unique indexes for one-open; database exclusion constraint for allocations; idempotent confirmation (second confirm returns "already confirmed").

## 5. Verification and badges (from the consolidated brief; decisions O-9, O-10 still open)

- **Verification [proposed policy O-9; workflow may be built, public tick hidden until its wording is approved — OC-104 §6]:** Super Admin checklist — government photo ID **seen on a video call, not stored**; email and phone confirmed; profile reviewed; qualifications only if separately checked and named. Valid 12 months. States: not started, waiting, verified, not verified, expired, revoked. Tick shown only while verified; its explanation lists exactly what was checked.
- **Badges [thresholds approved as the baseline, OC-104 §6; eligibility rules re-confirmed before Phase B]:** eligible review = parent of a child with ≥ 4 completed classes with that teacher (hourly or package), one per child per teacher, editable 30 days, reportable, moderated by the Super Admin with a reason. Bronze ≥ 4.0 from ≥ 5; Silver ≥ 4.3 from ≥ 15; Gold ≥ 4.6 from ≥ 30; else "Not yet rated". Unrounded average; recalculated on every change. Reviews require Phase B class records, so all teachers show "Not yet rated" until then.

## 6. Migration and rollback plan (P-9)

### 6.1 Mapping

| Old field (today) | New field | Rule | Invalid / incomplete handling |
|---|---|---|---|
| `listing_prices` model `hourly`: currency, amount, minutes | `teacher_listings.hourly_rate_minor`, `hourly_currency`, `hourly_offered = true` | Copy the amount as entered (no conversion). If several hourly rows, take position 1 and flag the others | Second hourly price → review item "multiple hourly prices" |
| model `weekly` | none (hidden) | Not shown publicly; row kept | Teacher notice: "weekly price no longer shown" |
| model `biweekly` | none (hidden) | Same | Same |
| model `monthly`: amount, currency, sessions, minutes | `learning_packages`: price = amount (unchanged), currency, classes = sessions, lesson_minutes = minutes, **negotiable = false**, `legacy_price_id` | Converted only if all package rules can be met **without inventing values** | sessions < 22 → `needs_review` "fewer than 22 classes" (not published). Classes per week, completion period and times **don't exist today** → `needs_review` "complete package details" until the teacher adds them (R-1). Never published while `needs_review`. |
| `teacher_profiles.negotiable_models`, `rate_negotiation_on` (CR-13) | slot settings / package `negotiable` | Not carried over: all slots Fixed, packages Fixed (P-9) | Teacher notice explains how to turn negotiation on |
| Open `rate_negotiations` (any basis) | `kind = legacy` | Continue to their natural end under CR-13 rules; shown "earlier price type" | No new legacy proposals |
| Published copy `prices` | `published.hourly`, `published.package` | Rebuilt from the mapped values; the old array kept in history | Listing stays published with whatever is valid |

### 6.2 Procedure
1. **Dry run** (read-only script) against the test database: counts per outcome (converted, hidden, needs review) and a list of review items; the report goes to the owner before anything changes.
2. Apply in one database transaction per teacher (additive: new columns/tables and new rows only; no deletes, no updates to `listing_prices`).
3. Post-checks: every published listing has a valid public copy; no `needs_review` package is public; counts match the dry run.
4. Teacher notices in AA Pro (emails queued only).

### 6.3 Rollback and integrity
- Additive design: rolling back = deploying the previous code and dropping the new tables/columns; legacy `listing_prices` rows and published history are untouched, so the old listing display returns unchanged.
- Each converted row keeps `legacy_price_id`; a reverse report can list every conversion.
- The migration is idempotent (re-running skips converted rows).
- Test environment only; there is no production deployment (production stays unchanged until separately approved).

## 7. Draft terms template (P-3, P-4) — **for owner approval; ⚖ = needs legal review**

7.1 **Classes and schedule.** The package contains *N* classes of *M* minutes, *F* a week at the times shown, to be completed within *W* weeks of the start date. The completion period is a planning window, not a calendar month. ⚖ (enforceability of a minimum commitment)
7.2 **Absences and cancellations.**
- Parent/student cancels with at least *24 hours'* notice through AA Pro: the class is rescheduled within the period.
- Later cancellation or no-show: recorded as *missed (student)*; whether it is made up is agreed between parent and teacher. ⚖
- Teacher cancels or is absent: recorded as *missed (teacher)*; the teacher offers a make-up within the period, or both agree to extend it.
- Holidays and exceptional circumstances (illness, emergencies, outages): classes are rescheduled by agreement; the period may be extended by agreement.
- A missed, cancelled or unheld class never counts as completed.
7.3 **Payment and refunds.** Payment is agreed and made directly between the parent and the teacher. AA Pro does not collect, hold, process or refund payments and does not resolve payment disputes. Any refund for classes not delivered is a matter between the parent and the teacher under applicable law. ⚖ (consumer-protection review, e.g. India's Consumer Protection Act 2019 and the E-Commerce Rules 2020; similar rules elsewhere)
7.4 **Ending early.** Either party may end the arrangement with *7 days'* notice through AA Pro; delivered classes stay recorded; outstanding classes are settled between the parties. ⚖
7.5 **No automatic renewal.** The arrangement ends when the classes are delivered or it is ended; nothing renews or is charged automatically.
7.6 **Changes.** Any change to classes, length, frequency, times or period needs an amendment accepted by both.
7.7 **Status of this record.** AA Pro records what both parties confirmed; it does not describe itself as a party to the arrangement. ⚖

If legal review needs a paid lawyer: **Blocked — Owner Budget Approval Required**.

## 8. Test matrix (₹0: local Postgres, CI, synthetic people)

| Area | Positive | Negative | Edge | Security | Concurrency |
|---|---|---|---|---|---|
| Hourly rate | save, publish, shows with currency | 0, negative, 3 decimals, unknown currency | change rate with open proposals (copies unchanged) | other teacher cannot edit | two saves → last wins, audited |
| Slot setting | negotiable slot shows Propose | fixed slot refuses proposal (server + DB) | slot moved/deleted with open proposal; times crossing midnight in parent zone | — | toggle during proposal submit → consistent refusal or creation |
| Package config | 22 at 5/wk, 6 wks; 30 classes | 21 classes; completion < minimum; times ≠ per week; overlapping times; price 0 | exactly the minimum (22 at 5 → 5 wks); max values (R-3, R-4) | other teacher cannot edit/publish | publish vs edit race |
| Package negotiation | propose, counter, accept, decline, withdraw, expire | fixed package refuses; counter changing classes refused; 7th offer refused | package edited during negotiation → snapshot kept | non-parties get "not found"; Admins counts only | accept vs withdraw; accept twice |
| P-10 separation | hourly + package open together | second open of same type refused; wait after decline per type | decline hourly → package still allowed; withdraw/expire → no wait | direct database insert refused | two proposals of same type at once → one |
| Limits | 5 open / 10 a day across types | 6th open; 11th today | day boundary in parent's time zone | Super Admin only changes limits | parallel submits respect limits |
| Migration | monthly ≥ 22 with full details → published package (Fixed) | sessions < 22 → needs review; missing frequency/times → needs review; weekly/biweekly hidden | multiple hourly rows; open legacy negotiations continue | review list Super Admin only | re-run is idempotent; per-teacher transaction |
| Confirmation (B) | parent then teacher confirm → allocation | terms not accepted; allocation conflict; price ≠ agreed | negotiation agreed then package edited → confirm uses agreed snapshot | only parent of that child; teacher of that package | two parents confirm the same time → one |
| Progress (B) | held + confirmed → completed count | missed/cancelled never counted | make-up of a rescheduled class; period passes with classes left → not completed | parties only | mark vs confirm race |
| Independence (P-7) | hourly only, package only, both published | package price never equals/derives from rate × classes automatically; no 22-class rule on hourly | change hourly rate → package price unchanged (and reverse); accept hourly negotiation → package untouched (and reverse); book hourly → no package row; confirm package → no hourly_lessons rows | — | hourly and package actions at the same moment stay independent |
| Hourly lesson price (B) | ₹600/h × 40 min = ₹400 | booking at a fixed slot with a non-agreed rate refused | rounding of odd amounts (e.g. ₹555/h × 40 min = ₹370); agreed rate used only for that child | parent cannot set the price in the request | two bookings of the same slot/date → one |
| No auto-renew | "Arrange another package" starts a new proposal/confirmation | nothing created or charged automatically | completion exactly at last class | — | — |
| Verification/badges | states and tick; thresholds at 4.0/4.3/4.6 and 5/15/30 | registration alone → no tick; 1 five-star review → no Gold | expiry/revocation hides tick; badge drops | reviews never show child data | concurrent reviews recalc |

All existing tests (database, unit, demo and real browser) must keep passing.

## 9. Decisions — approved by the owner (OC-104, 19 Oct 2026, 11:53 IST)

| # | Decision | Approved direction |
|---|---|---|
| R-1 | Incomplete legacy monthly packages | Unpublished in **Needs review**; the teacher completes the missing details; values are never invented |
| R-2 | Hourly lessons before scheduling | Phase A: listing and negotiation only. Individual booking comes with scheduling (Phase B) |
| R-3 | Maximum classes | **60** |
| R-4 | Maximum completion period | **26 weeks** |
| R-5 | Minimum classes a week (packages) | **2** — 22 classes therefore need at least 11 weeks at the lowest frequency |
| R-6 | Lesson length | **10–40 minutes** until a compliant no-cost meeting arrangement is confirmed |
| R-7 | Proposal limits | 5 open and 10 new per day per parent, **shared** across hourly and package |
| R-8 | Master negotiation control | Kept as a master pause for **new** proposals of both types; never cancels existing proposals |
| R-9 | Prospective child | First proposal may use grade and curriculum only; a child must be added and the relationship authorised before any lesson confirmation |
| R-10 | Terms template | Versioned draft template; legal approval remains a **launch prerequisite** |
| R-13 | Price comparison | Prices and terms shown separately; no savings or discount claims |
| R-14 | Rounding | To the **minor unit of each currency** (paise, cents), once, at the final amount — not to whole units |

**Default completion period (P-1, OC-104):** the greater of 6 weeks and the calculated minimum. Examples: 22 at 5 a week → 6 weeks (minimum 5); 22 at 4 → 6; 22 at 2 → 11; 60 at 3 → 20; 60 at 2 → 30 weeks, which exceeds 26, so 60 classes need at least 3 a week.

**Earlier open items (O-9 to O-16).** O-11, O-12 and O-14 to O-16 concern confirmation, time reservation, cancellation, class counting and early ending — **Phase B only**; they are re-presented before Phase B and do not block Phase A. O-9 (verification) and O-10 (badges) follow §5 and OC-104 §6: the Super Admin verification workflow may be built; the public tick stays hidden until the owner approves the wording of what it means; badges need genuine completed lessons (Phase B), so every teacher shows "Not yet rated" until then.

## 10. Build readings for Phase A (Claude, Phase 0 report, 19 Oct 2026 — owner may change)

1. **Release switch.** A Super Admin platform setting **"New pricing model"** (`pricing_model_v2`, off by default). While off, listings, editor and proposals behave exactly as today. Turning it on for the test site waits for the owner's approval of the finished Phase A and of the migration report (OC-104 §10: no unfinished marketplace features published).
2. **Slots.** Teachers' usual times are weekly ranges in 30-minute steps; each range is an hourly "slot" with its own Fixed rate / Negotiation available setting. Dated slots arrive with Phase B booking; Phase A shows weekday, time, lesson length and lesson price.
3. **Hourly lesson length.** One length for the teacher's hourly lessons (10–40 min), shown on each slot with the lesson price = rate × length ÷ 60, rounded once to the currency's minor unit (half up).
4. **Saving usual times** keeps each range's setting when the range is unchanged (same weekday, start and end); new ranges start Fixed. A save that would remove a time used by the published package is refused with a message naming it.
5. **Package times.** Each package class time is a weekday and start time (30-minute steps) whose class fits inside one of the teacher's usual ranges; number of times = classes a week; no two overlap.
6. **One package per teacher** (draft, published, paused, needs review). Teachers may offer hourly only, package only, or both.
8. **Negotiation types (A4).** Each negotiation has a kind: `hourly` (copies the time and rate), `package` (copies the package terms) or `legacy` (earlier prices, continuing to their end). One-open and the 7-day wait are per type through the existing per-model rules, so an open *legacy hourly* negotiation also counts as the open hourly one for that parent, teacher and child. The time chosen does not create a separate type, so changing time cannot bypass the wait.
9. **Search (A3b, OC-105).** No "Not yet rated" chip until a rating system exists; the parent "Find a teacher" directory keeps its own form (DV-89).
7. **Migration** of old prices is a separate script (dry run, then apply), never an automatic database migration, because every merge to main migrates the test database.

## 11. Delivery

- **Phase A, ₹0, one pull request each, all CI checks green:** A1 documents; A2 database and server rules for hourly rate, slot settings, packages and the switch; A3 teacher editor, public cards and profile; A4 separate hourly and package negotiations; A5 migration dry-run script and report (applied only after owner review); A6 Super Admin verification workflow (tick hidden).
- **Phase B (with scheduling):** individual hourly booking, package confirmation and terms acceptance, calendar allocation, class records, progress, reviews and badges.
