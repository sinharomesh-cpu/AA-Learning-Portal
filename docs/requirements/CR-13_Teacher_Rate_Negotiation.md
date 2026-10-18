# CR-13 — Teacher rate negotiation in the marketplace

**Version:** 1.0 · 18 Oct 2026 · **Status:** requirement recorded (OC-98). Designs **RN0–RN7** are drawn and **awaiting owner review**. Ten questions are open (§6). Nothing is built.
**Source:** owner requirement "AA Pro — Teacher Rate Negotiation Feature", 18 Oct 2026, 16:47 IST, recorded here in full as sections A–G.

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
| **OC-77(8):** up to 3 prices (hourly, weekly, **biweekly**, monthly), "information only" | The requirement names hourly, weekly and monthly; listings also allow biweekly. Prices stay information only: AA Pro never bills | **Q-1** (include biweekly?). The "information only" wording is kept; agreed rates are information only too (F1–F2) |
| **OC-76(4):** INR, SGD, USD; currency always shown; **no conversion** | A proposal uses the currency of the price it answers | Proposed: fixed currency, no conversion |
| **OC-79 marketplace:** max 40-minute sessions; sessions per period 1–31 | Lesson terms in a proposal | The same limits apply |
| **OC-76(1), OC-77(7):** teachers never see a child's name in an enquiry; duplicate check by child, else parent + grade + curriculum | "Only the information needed" (E1) | The same minimum details; the same duplicate rule (D5) |
| **OC-76(2), OC-77(10):** enquiry limits (5 pending per parent, 10 new a day, 14-day expiry) | Spam protection for proposals | **Q-7** (same values, configurable) |
| **Enquiries (PR-D4a, built)** | Proposals and enquiries both start from a listing | **Q-2** (a separate "Rate proposals" area, or part of the enquiry) |
| **OC-97 / CR-12** (teacher accepts each child before any access) | E3–E4 | An agreed rate offers a "Ask this teacher to teach [child]" step, which is the CR-12 request |
| **OC-77(4), OC-76(8):** no payment features; a notice that AA Pro does not process payments | F1–F2 | The same notice on every proposal screen |
| **OC-82(3), OC-77(5):** no unverified claims | A5 | Unchanged |

## 4. Requirements (FR-040)

| ID | Requirement |
|---|---|
| FR-040.1 | **Settings (teacher):** one global switch, "Accept rate proposals", plus one switch per published price. Default **off**. Changes appear on the public profile at once. Turning off stops new proposals only; open ones continue (C4). |
| FR-040.2 | **Public profile and directory:** each published price shows "Published rate" with its terms. "Propose a rate" appears only when both the global and that price's switch are on; otherwise the price is labelled "Fixed price". |
| FR-040.3 | **Signed-out visitors** choosing "Propose a rate" go through the existing connect gate (board D11), keeping the teacher and price through sign-up and sign-in (OC-76(7)). |
| FR-040.4 | **Proposal form (parent):** <br>• the price it answers (basis: hourly, weekly, monthly, and biweekly if Q-1); <br>• which child (own child, or grade + curriculum for a child not yet added; Q-6); <br>• the proposed amount, in the price's currency; <br>• minutes per lesson (10–40); <br>• lessons per period (1–31) where the basis needs it; <br>• an optional message (up to 500 characters, with a reminder not to share contact details or the child's name). <br>A summary shows the published rate next to the proposed rate. |
| FR-040.5 | **Teacher view:** grade, curriculum, subject(s) from the listing, the parent's first name, the published price, the offer history and the message. Never the child's name, books, homework, history or contact details (E1–E2). |
| FR-040.6 | **Responses:** the party whose turn it is can **Accept**, **Decline** (a reason is optional, from the same list as CR-12) or **Counter** (a new amount, and optionally new lesson terms). The parent can **Withdraw** at any time before acceptance. |
| FR-040.7 | **Statuses:** **Pending** (waiting for the teacher) → **Counter-proposed** (waiting for the other party) ↔ … → **Accepted**, or **Declined**, **Withdrawn** or **Expired**. Ended statuses are final. |
| FR-040.8 | **Expiry:** 14 calendar days without an answer to the latest offer (**Q-4**). The server refuses answers after expiry, and both sides see "Expired". |
| FR-040.9 | **One active negotiation** per parent, teacher, child (or grade + curriculum) and pricing basis. A new one is allowed after the previous one ends, subject to the wait in **Q-5**. |
| FR-040.10 | **Record:** every offer (amount, currency, basis, minutes, lessons per period, who, when), every response, the final agreed rate and the end reason. These are kept as history and never edited. |
| FR-040.11 | **Agreed rate:** shown to both sides as "Agreed rate with [teacher/parent]", separate from the published rate, with the terms and the date. It is not changed by later edits to the teacher's prices. It creates no link, access, booking or lesson. The parent sees a separate "Ask this teacher to teach [child]" button (CR-12). |
| FR-040.12 | **Notifications:** shown in AA Pro (new proposal, counter, accepted, declined, expired). Emails are queued only until an email service is approved (OC-65, OC-91); nothing claims an email was sent. |
| FR-040.13 | **Server and database enforcement:** <br>• only an active parent can propose, and only an approved, active teacher with an active listing receives proposals; <br>• the price must exist and be negotiable at the moment of proposing; <br>• the turn order, the status transitions, the expiry and the uniqueness rule are checked in the database as well; <br>• amounts must be positive with at most 2 decimals. |
| FR-040.14 | **Limits (configurable, Q-7):** active proposals per parent, new proposals per parent per 24 hours, and offers per negotiation (**Q-3**). |
| FR-040.15 | **Payments:** every proposal screen says "AA Pro does not collect or process payments. You and the teacher agree payment directly." There are no payment fields. |
| FR-040.16 | **Audit and admin:** created, countered, accepted, declined, withdrawn, expired and refused attempts are audited without the message text. Admins see counts only (OC-76(6)). |

## 5. Lifecycle

```
Parent proposes ──► Pending (teacher's turn)
                      │  Accept ─────────────► Accepted (agreed rate recorded)
                      │  Decline ────────────► Declined
                      │  Counter ──► Counter-proposed (parent's turn)
                      │                 │ Accept ─► Accepted
                      │                 │ Decline ─► Declined
                      │                 │ Counter ─► Counter-proposed (teacher's turn) … (up to the offer limit, Q-3)
Any time before acceptance: parent Withdraw ─► Withdrawn
No answer to the latest offer for 14 days ─► Expired
```

## 6. Open questions for the owner (recommendations in brackets)

| # | Question | Recommendation |
|---|---|---|
| Q-1 | Listings also allow a **biweekly** price (OC-77(8)). Can it be negotiated too? | Yes: every published price can be negotiable |
| Q-2 | Where do proposals live? | A separate "Rate proposals" tab next to "My enquiries" (parent) and "Enquiries" (teacher). An enquiry and a proposal can exist side by side |
| Q-3 | Limit on back-and-forth offers? | At most **6 offers** in one negotiation; then the last one can only be accepted or declined |
| Q-4 | What starts the 14-day expiry? | The **latest offer**: whoever must answer has 14 days |
| Q-5 | Wait before proposing again to the same teacher, child and basis after a **decline**? | **7 days** (as CR-12 and E-5). None after an expiry or withdrawal |
| Q-6 | Which child? | The parent picks their own child, or gives a grade and curriculum for a child not yet added (as enquiries, OC-77(7)). The teacher sees grade and curriculum only |
| Q-7 | Limits? | The same as enquiries: 5 active proposals per parent and 10 new per 24 hours, configurable by the Super Admin |
| Q-8 | Allowed amounts? | Any positive amount in the price's currency, with no minimum or maximum |
| Q-9 | Default for teachers? | **Off** until the teacher turns it on (C1). The listing editor reminds them it exists |
| Q-10 | Where are the teacher's controls? | A "Rate negotiation" panel on the dashboard (C) with the switches, plus a switch beside each price in the listing editor (board D5), kept in sync |

## 7. Acceptance criteria

| # | Criterion | Tests (planned) |
|---|---|---|
| AC-1 | "Propose a rate" appears only for prices with negotiation on; other prices show as fixed; the published rate is always shown | T-RN-1 (I), E-RN-1 (E) |
| AC-2 | A signed-out visitor is sent to sign up or sign in and returns to the same teacher and price | E-RN-2 |
| AC-3 | A parent proposes; the teacher sees only the minimum details; no child name, books or homework | T-RN-2, E-RN-1 |
| AC-4 | Accept, decline, counter and withdraw follow the turn order; ended negotiations accept no action | T-RN-3 (full transition matrix) |
| AC-5 | After 14 days without an answer the negotiation expires and answers are refused | T-RN-4 |
| AC-6 | No second active negotiation for the same parent, teacher, child and basis; a new one is allowed after the end and the wait | T-RN-5 |
| AC-7 | Turning negotiation off stops new proposals; existing ones continue unchanged | T-RN-6 |
| AC-8 | Every offer, response, timestamp and the agreed rate are recorded; published and agreed rates are shown separately | T-RN-7, E-RN-3 |
| AC-9 | Accepting creates no link, access, booking or lesson; teacher access still needs CR-12 | T-RN-8 |
| AC-10 | Other parents, other teachers, students, Admins and the Super Admin cannot see or act on a negotiation; refusals look like "not found" | T-RN-9 (role matrix) |
| AC-11 | Two answers at the same moment give one result | T-RN-10 (concurrency) |
| AC-12 | No payment fields or paid services; notices are in-app, and emails are queued only | T-RN-11, review |

## 8. Designs (for review)

The boards are on the design canvas, page "Rate negotiation (RN0–RN7)":

| Board | Screen |
|---|---|
| RN0 | Read me: lifecycle, rules, privacy, open questions |
| RN1 | Public teacher page: published rates, "Propose a rate" or "Fixed price", signed-out prompt |
| RN2 | Parent: propose a rate (published vs proposed) |
| RN3 | Parent: Rate proposals (statuses and offer history; accept, counter, withdraw) |
| RN4 | Teacher: Rate negotiation settings (global switch and per-price switches) |
| RN5 | Teacher: incoming proposals (accept, decline, counter) |
| RN6 | Counter-offer form and the final agreed rate (published vs agreed; separate "Ask this teacher to teach" step) |
| RN7 | Parent (phone): a proposal's status and response |

## 9. Cost

$0: AA Pro's own database and pages, with in-app notices. Real email stays **Blocked — Owner Budget Approval Required** (OC-91).
