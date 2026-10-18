# CR-13 — Teacher rate negotiation in the marketplace

**Version:** 1.4 · 19 Oct 2026 · **Status:** requirement (OC-98), all ten decisions (OC-99) and the decline-wait clarification (OC-100) recorded. Designs **RN0–RN7** **approved (OC-101)**. **Built** (PR #82, see §10; owner go-ahead 19 Oct 2026, 02:09 IST).
**Source:** owner requirement "AA Pro — Teacher Rate Negotiation Feature", 18 Oct 2026, 16:47 IST, recorded here in full as sections A–G. Owner decisions on Q-1 to Q-10 and additional rules, 18 Oct 2026, 18:31 IST (OC-99).

## 1. Summary

A parent may propose a different rate for one of a teacher's published prices. The teacher accepts, declines or makes a counter-offer, and the two sides can go back and forth until one accepts or the negotiation ends.

Teachers decide whether they accept proposals at all, and for which prices. AA Pro records the offers and the agreed rate. It does not collect or process payments.

An agreed rate does **not** link the teacher to a child, give access to anything, or create a booking. Linking stays with the separate CR-12 request, which the teacher accepts.

## 2. The owner's requirement (sections A–G)

**A. Public teacher directory**
1. Show the teacher's published hourly, weekly and monthly charges, where provided.
2. Show subjects, eligible grades, relevant profile information and listed packages.
3. Show "Propose a Rate" only when negotiation is enabled for that pricing option.
4. If negotiation is disabled, still show the published charge, with no negotiation.
5. Never fabricate credentials, verification, ratings or reviews.

**B. Parent proposal workflow**
1. A registered, signed-in parent selects a teacher and a pricing option.
2. The parent selects hourly, weekly or monthly pricing.
3. The parent enters the proposed amount and the pricing details, including lesson duration and frequency where applicable.
4. An optional short message.
5. A visitor who chooses "Propose a Rate" is asked to register or sign in. The teacher and pricing option are kept through registration where feasible.
6. The status and the teacher's responses show on the parent's dashboard.

**C. Teacher negotiation controls** (a "Rate Negotiation" section on the teacher dashboard)
1. Enable or disable rate proposals globally.
2. Where feasible, enable or disable each pricing option separately.
3. Changes show on the public profile.
4. Disabling stops new proposals but never deletes or alters proposals already submitted. These stay manageable in their current state.
5. View incoming proposals, and accept, decline or counter-propose.
6. Notify the parent of the response, with existing free notification capabilities only.

**D. Negotiation rules**
1. Statuses: Pending, Counter-Proposed, Accepted, Declined, Withdrawn, Expired.
2. Counter-proposals are allowed until a party accepts or the negotiation ends.
3. Unanswered proposals expire after 14 calendar days.
4. Parents can withdraw any proposal that is not yet accepted.
5. No duplicate active proposals for the same parent, teacher, child and pricing basis. A new proposal is allowed after the previous one ended and any restriction has passed.
6. Record the amounts, pricing basis, lesson terms, timestamps, responses and the final agreed rate.
7. Always distinguish the teacher's published rate from a negotiated rate.

**E. Privacy and access control**
1. Teachers get only the information needed to assess a proposal.
2. No textbooks, homework, private learning records or unrelated personal information.
3. Accepting does not link the teacher to the child, grant access, create a booking or schedule a lesson.
4. Access only through the separately approved linking and acceptance workflow (CR-12).

**F. Payments and budget**
1. AA Pro does not collect or process payments.
2. Parents and teachers arrange payment directly.
3. No paid APIs, subscriptions, cloud resources, messaging services or other billable dependencies without explicit prior written approval.
4. Existing non-billable infrastructure and free options only.
5. Anything with a potential cost is marked **Blocked — Owner Budget Approval Required**, with costs and alternatives presented.

**G. Review and delivery:** present screens, the lifecycle, rules, acceptance criteria, privacy controls and tests. Wait for the owner's review before implementation. Keep the feature configurable, with server-side authorisation and validation.

## 3. How it fits existing decisions (nothing overwritten)

| Existing decision | Relation to CR-13 | Handling |
|---|---|---|
| **OC-77(8):** up to 3 prices (hourly, weekly, **biweekly**, monthly), "information only" | The requirement names hourly, weekly and monthly; listings also allow biweekly. Prices stay information only: AA Pro never bills | **Resolved, OC-99 (1):** every-two-weeks is included. The "information only" wording is kept; agreed rates are information only too (F1–F2) |
| **OC-76(4):** INR, SGD, USD; currency always shown; **no conversion** | A proposal uses the currency of the price it answers | Proposed: fixed currency, no conversion |
| **OC-79 marketplace:** max 40-minute sessions; sessions per period 1–31 | Lesson terms in a proposal | The same limits apply |
| **OC-76(1), OC-77(7):** teachers never see a child's name in an enquiry; duplicate check by child, else parent + grade + curriculum | "Only the information needed" (E1) | The same minimum details; the same duplicate rule (D5) |
| **OC-76(2), OC-77(10):** enquiry limits (5 pending per parent, 10 new a day, 14-day expiry) | Spam protection for proposals | **Resolved, OC-99 (7):** the same values, configurable |
| **Enquiries (PR-D4a, built)** | Proposals and enquiries both start from a listing | **Resolved, OC-99 (2):** a separate "Rate Proposals" tab |
| **OC-97 / CR-12** (teacher accepts each child before any access) | E3–E4 | An agreed rate offers a "Ask this teacher to teach [child]" step, which is the CR-12 request |
| **OC-77(4), OC-76(8):** no payment features; a notice that AA Pro does not process payments | F1–F2 | The same notice on every proposal screen |
| **OC-82(3), OC-77(5):** no unverified claims | A5 | Unchanged |

## 4. Requirements (FR-040), updated with OC-99

| ID | Requirement |
|---|---|
| FR-040.1 | **Default off (OC-99 (9)):** negotiation is **disabled for every teacher, including existing teachers**, until the teacher turns it on. Asking prices stay visible when it is off. |
| FR-040.2 | **Controls (OC-99 (10)):** a **global control** on the teacher dashboard ("Rate negotiation" panel), and a **switch beside each price** in the listing editor (board D5). A price can receive proposals only when **both** are on. Changes show on the public profile at once. |
| FR-040.3 | **Turning off** (global or one price) stops **new** proposals only. Open negotiations are never deleted, cancelled or changed; they continue under the normal rules (C4). |
| FR-040.4 | **Public profile and directory:** each asking price is shown with its terms. "Propose a rate" appears only for prices where FR-040.2 allows it; other prices are labelled "Fixed price". A signed-out visitor goes through the connect gate (board D11) and returns to the same teacher and price where feasible (OC-76(7)). |
| FR-040.5 | **Pricing types (OC-99 (1)):** **hourly, weekly, every two weeks and monthly**. The pricing basis and the **currency of the chosen asking price** stay the same for every offer in a negotiation; they cannot be changed and are never converted (OC-76(4)). |
| FR-040.6 | **Child (OC-99 (6)):** the parent chooses **one of their own children**, or a **prospective child** described by grade and curriculum. The teacher sees **grade and curriculum only**, never the child's name or other identifying details. Each negotiation is private to that parent and that teacher. |
| FR-040.7 | **Offer form:** <br>• the amount, in the asking price's currency; <br>• minutes per lesson (10–40); <br>• lessons per period (1–31) for weekly, every-two-weeks and monthly prices; <br>• an optional message (up to 500 characters, with a reminder not to share contact details or the child's name). <br>The asking price and the offer are shown side by side. |
| FR-040.8 | **Amounts (OC-99 (8)):** any **positive** amount in the price's currency, with at most two decimal places and no minimum or maximum. Zero, negative, malformed or non-numeric amounts are refused with a clear message. Nothing is converted. |
| FR-040.9 | **Teacher view:** grade, curriculum, subject, the parent's first name, the asking price, the offers and the messages. Never the child's name, books, homework, history or contact details (E1–E2). |
| FR-040.10 | **Turns:** the side whose turn it is can **Accept**, **Decline** (optional reason, from the CR-12 list) or **Counter**. The parent can **Withdraw** at any time before acceptance. |
| FR-040.11 | **Offer limit (OC-99 (3)):** at most **six offers** per negotiation, **counting the initial proposal** and every counter-offer. After offer 6, its recipient can only **accept or decline**; a 7th offer is refused by the server and the database. Both sides always see **"Offer N of 6"**. |
| FR-040.12 | **Expiry (OC-99 (4)):** **each new valid offer resets the 14-calendar-day expiry**. If the side whose turn it is does not answer within 14 days, the negotiation becomes **Expired**. |
| FR-040.13 | **Statuses:** **Pending** (the initial proposal, the teacher's turn) → **Counter-proposed** (a later offer, the other side's turn) → … → **Accepted**, or **Declined**, **Withdrawn** or **Expired**. These four are **final**: no further offers or answers. |
| FR-040.14 | **One active negotiation** per parent, teacher, child (or grade and curriculum for a prospective child) and pricing basis. |
| FR-040.15 | **Decline wait (OC-99 (5), clarified by OC-100):** when a negotiation ends **Declined**, whoever declined (the teacher, or the parent, including a decline of the teacher's counter-offer or of the sixth and final offer), the same parent cannot start a **new** negotiation with the same teacher for the same child (or the same grade and curriculum for a prospective child) and the same pricing basis for **7 calendar days** from the decline. **No wait** after a parent withdrawal, an expiry or an acceptance. The rule is enforced on the server and in the database at the moment a negotiation is created, whichever screen or route the request comes from and however often it is repeated. The parent sees the **next eligible date** wherever they could start one: on the public profile's price, on the proposal form, and on the declined negotiation in Rate Proposals. |
| FR-040.16 | **Limits (OC-99 (7)):** <br>• **Active** means **Pending** or **Counter-proposed**. At most **5 active negotiations per parent**. <br>• At most **10 new proposals per parent per calendar day**. A calendar day runs from midnight to midnight in the parent's own time zone (set on their account). Counter-offers are not new proposals. <br>• Both values are changed by the Super Admin (Admin → settings, like OC-96) and enforced on the server. |
| FR-040.17 | **Record:** every offer (sequence number, amount, currency, basis, minutes, lessons per period, who, when, message) and every response (who, what, when, reason) is kept as an unchangeable history, together with the final agreed rate and the end reason. |
| FR-040.18 | **Agreed rate:** shown to both sides as "Agreed rate", next to the asking price, with its terms and date. It is not changed by later edits to the teacher's prices. **It does not book a lesson, link the teacher to the child, grant access to learning materials, or start any payment.** The parent sees a separate "Ask this teacher to teach [child]" step (CR-12). |
| FR-040.19 | **Notices:** shown in AA Pro (new proposal, counter-offer, accepted, declined, withdrawn, expired). Emails are queued only until an email service is approved (OC-65, OC-91); nothing claims an email was sent. |
| FR-040.20 | **Server and database enforcement:** <br>• authentication, roles and privacy: only that parent and that teacher see or act on a negotiation; everyone else, including Admins and the Super Admin, gets "not found" (Admins see counts only); <br>• the price exists and is negotiable when a proposal is created; <br>• turn order, the offer limit, final statuses, expiry, one active negotiation, the decline wait and the limits are checked on the server and, where possible, in the database. |
| FR-040.21 | **Payments:** every proposal screen says "AA Pro does not collect or process payments. You and the teacher agree payment directly." There are no payment fields and no paid service (F). |
| FR-040.22 | **Audit:** created, countered, accepted, declined, withdrawn, expired and refused attempts, recorded without the message text. |

## 5. Lifecycle

```
Parent proposes (offer 1) ──► Pending — teacher's turn, 14 days
   teacher: Accept ─► Accepted · Decline ─► Declined · Counter (offer 2) ─► Counter-proposed — parent's turn, 14 days
   parent:  Accept ─► Accepted · Decline ─► Declined · Counter (offer 3) ─► Counter-proposed — teacher's turn …
   … offer 6: its recipient can only Accept or Decline
Parent, any time before acceptance: Withdraw ─► Withdrawn
No answer within 14 days of the latest offer ─► Expired
Final: Accepted · Declined · Withdrawn · Expired (no more offers)
```

## 6. Owner decisions (OC-99) and one reading to confirm

| # | Decision (owner, 18 Oct 2026, 18:31 IST) |
|---|---|
| 1 | Hourly, weekly, every-two-weeks and monthly negotiation; the basis and currency are kept throughout |
| 2 | A "Rate Proposals" tab next to "My Enquiries" (parents) and next to "Enquiries" (teachers) |
| 3 | At most six offers, including the first proposal. After offer 6 the recipient can only accept or decline; no 7th offer. Both sides see the offer number |
| 4 | Each new valid offer resets the 14-day expiry; final statuses close the negotiation |
| 5 | 7 calendar days after a decline before the same parent proposes again to the same teacher for the same child and basis; none after an expiry or a withdrawal. **Clarified by OC-100:** a decline by either party counts; acceptance creates no wait |
| 6 | An existing child, or a prospective child by grade and curriculum; the teacher sees only grade and curriculum; private to that parent and teacher |
| 7 | 5 active proposals per parent and 10 new per parent per calendar day by default; configurable by the Super Admin; enforced on the server. Active statuses and the daily reset are defined (FR-040.16) |
| 8 | Any positive amount in the listing price's currency; no minimum or maximum; zero, negative, malformed or invalid amounts refused; no conversion |
| 9 | Disabled by default for all teachers, including existing ones; asking prices stay visible |
| 10 | A global control on the teacher dashboard and a switch beside each price in the listing editor; both must be on |

**Additional rules (same message):**
- Turning negotiation off never deletes or cancels existing negotiations.
- A complete offer history is kept: amounts, currency, basis, timestamps, sequence and responses.
- An accepted proposal records the agreed rate only. It does not book, link, grant access or start payment.
- Authentication, authorisation, privacy and limits are enforced on the server.
- Existing non-billable infrastructure only. No paid service or expenditure without prior written approval.

**Decision 5 clarified (OC-100, owner, 18 Oct 2026, 19:16 IST):** the seven-calendar-day wait applies whenever **either party declines**, including the parent declining a teacher's counter-offer or the sixth and final offer. It applies to a **new** negotiation between the same parent and teacher, for the same child and pricing basis. Exceptions: parent withdrawal, expiry and acceptance create no wait. It is enforced on the server, shows the next eligible date, and cannot be bypassed through another screen or by repeating the request. Purpose: repeated negotiations must not get round the six-offer limit.

## 7. Acceptance criteria

| # | Criterion | Tests (planned) |
|---|---|---|
| AC-1 | Negotiation is off for every teacher at first, existing teachers included; asking prices always show; "Propose a rate" appears only when the global and price switches are both on | T-RN-1 (I), E-RN-1 (E) |
| AC-2 | A signed-out visitor is sent to sign up or sign in and returns to the same teacher and price | E-RN-2 |
| AC-3 | All four pricing types work; basis and currency stay fixed across every offer; nothing is converted | T-RN-2 |
| AC-4 | A proposal for an own child or a prospective child; the teacher sees only grade and curriculum; nobody else sees the negotiation | T-RN-3, E-RN-1 |
| AC-5 | Accept, decline, counter and withdraw follow the turn order; final statuses accept no action | T-RN-4 (full transition matrix) |
| AC-6 | Offers are numbered 1–6 on both sides; after offer 6 only accept or decline; a 7th offer is refused by the server and the database | T-RN-5 |
| AC-7 | Each new offer resets the 14 days; with no answer for 14 days the negotiation expires and later answers are refused | T-RN-6 |
| AC-8 | One active negotiation per parent, teacher, child and basis. After a decline by **either side** (teacher; parent declining a counter-offer; parent declining offer 6), a new negotiation for the same teacher, child and basis is refused for 7 calendar days and the parent sees the next eligible date. It is allowed at once after a withdrawal, an expiry or an acceptance, and at once for another child, another basis or another teacher. Repeating the request, sending it from another screen, or calling the server directly is refused the same way. Two simultaneous attempts on the 7th day boundary give a consistent result | T-RN-7 (I, every route and both deciders), T-RN-7b (concurrency), E-RN-4 (next-eligible date shown) |
| AC-9 | At most 5 active (Pending or Counter-proposed) and 10 new a day (the parent's time zone); the Super Admin can change both; the server refuses beyond them with a clear message | T-RN-8 |
| AC-10 | Zero, negative, malformed and over-precise amounts are refused; any positive amount is accepted | T-RN-9 (U and I) |
| AC-11 | Turning negotiation off stops new proposals; open negotiations continue unchanged | T-RN-10 |
| AC-12 | The full offer history and the agreed rate are recorded; asking and agreed rates are shown separately | T-RN-11, E-RN-3 |
| AC-13 | Accepting creates no link, access, booking or payment; teacher access still needs CR-12 | T-RN-12 |
| AC-14 | Other parents, other teachers, students, Admins and the Super Admin cannot see or act; refusals look like "not found" | T-RN-13 (role matrix) |
| AC-15 | Two answers at the same moment give one result; two proposals at the same moment respect the limits | T-RN-14 (concurrency) |
| AC-16 | No payment fields or paid services; notices are in-app; emails are queued only | T-RN-15, review |

## 8. Designs (for review)

The boards are on the design canvas, page "Rate negotiation (RN0–RN7)":

| Board | Screen |
|---|---|
| RN0 | Read me: lifecycle, rules, privacy, open questions |
| RN1 | Public teacher page: published rates, "Propose a rate" or "Fixed price", signed-out prompt |
| RN2 | Parent: propose a rate (published vs proposed) |
| RN3 | Parent: Rate proposals (statuses and offer history; accept, counter, withdraw) |
| RN4 | Teacher: the global control on the dashboard, and the per-price switches in the listing editor |
| RN5 | Teacher: incoming proposals (accept, decline, counter) |
| RN6 | Counter-offer form and the final agreed rate (published vs agreed; separate "Ask this teacher to teach" step) |
| RN7 | Parent (phone): a proposal's status and response |

## 9. Cost

$0: AA Pro's own database and pages, with in-app notices. Real email stays **Blocked — Owner Budget Approval Required** (OC-91).

## 10. As built (PR #82)

| Item | Where |
|---|---|
| Teacher switches: `rate_negotiation_on` (dashboard) and `negotiable_models` (listing editor), both off for every teacher | migration `0021_rate_negotiations.sql`, `teacher_profiles` |
| Limits `rate_active_per_parent` (5) and `rate_new_per_day` (10), changed by the Super Admin on Admin → Rate proposals | `platform_settings`, `/admin/rate-proposals` |
| `rate_negotiations` (fixed basis, currency and asking price; status; turn; offer count; 14-day expiry; agreed rate) and `rate_offers` (unchangeable history) | migration 0021 |
| Database rules: first offer by the parent; turn order; at most 6 offers; final statuses unchangeable; answers before expiry; one active per parent, teacher, child and basis; 7-day wait after a decline by either side; fixed facts never change | triggers `rate_negotiations_check`, `rate_offers_check`, unique index |
| Server rules (every route): propose, counter, accept, decline (optional reason), withdraw, lazy expiry, limits in the parent's time zone, privacy (others get "not found") | `src/server/rateNegotiations.ts` |
| Screens: public prices with "Propose a rate" or "Fixed price" (RN1); propose page with sign-in gate returning to the same price (RN2); parent Rate proposals tab (RN3, RN7); dashboard control and price switches (RN4); teacher Rate proposals tab (RN5); counter-offer and agreed rate (RN6) | `/teachers/[id]`, `/teachers/[id]/propose`, `/parent/enquiries/rates`, `/teacher/enquiries/rates`, `/teacher`, `/teacher/listing` |
| Emails, queued only: `rate_proposal_received`, `rate_counter_offer`, `rate_proposal_accepted`, `rate_proposal_declined`, `rate_proposal_withdrawn`, `rate_proposal_expired` | `src/server/auth/outbox.ts` |
| Tests: T-RN-1 to T-RN-15 (`tests/db/rateNegotiations.test.ts`, 20 tests), amount unit tests, real e2e E-RN-1 to E-RN-3 | |

**Build readings (Claude's, consistent with the approved boards; open to owner change):**
1. A price's "Proposals" switch applies to its **basis** (hourly, weekly …), which is also the basis the one-active and wait rules use. If a teacher lists two prices on the same basis, they share the switch.
2. The proposal carries **one subject**, from the subjects the teacher lists (and, for an own child, the child studies), so the teacher can see what the rate is for (FR-040.9).
3. Amounts may have up to 12 digits before the decimal point; "no maximum" is otherwise kept.
4. "Ask this teacher to teach [child]" opens the existing add-a-teacher page for that teacher (CR-12 request). For a prospective child it says "Add your child first".
5. A parent who creates a new account from the "Propose a rate" gate returns to the teacher's connect page after confirming, with a "Propose a rate instead" link; signing in returns to the same price directly.

Known limit: expiry is applied when a page loads (no scheduler yet), so the expiry email is queued then.
