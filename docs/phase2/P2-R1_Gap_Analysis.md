# AA Pro — P2-R1 Phase 2 Consolidated Requirements: Baseline Review and Gap Analysis

**Version:** 1.0 · 16 Oct 2026 · **Status:** for owner review — nothing in this document is approved yet.
**Input:** owner's *Consolidated Phase 2 Master Requirements and Delivery Instructions* (16 Oct 2026, 09:41 IST, in the project chat).
**Prepared by:** Claude, acting as both Business Analyst and Developer for this project (see §1.2).

---

## 1. Acknowledgement

### 1.1 Scope accepted

I accept the consolidated document as the single Phase 2 baseline, alongside the decision register G1-05 (v1.25) and the approved boards. Where the new baseline and an earlier owner decision disagree, I have **not** picked one. Each disagreement is listed in §4 for your decision.

These rules stay in force:
- Synthetic data only.
- No production data, configuration or deployment without your approval.
- No paywall or charges.
- No claims without evidence.
- AA Pro stays separate from P4Bpay.com.

### 1.2 One person, two roles

The Business Analyst and the Developer are the same Claude session. That works for requirements and building. It does **not** satisfy Requirement G: a reviewer must be independent of the build. §4, item Q-10, proposes how to meet that requirement.

### 1.3 Status words used below

| Status | Meaning |
|---|---|
| **Complete** | Built, merged to `main`, covered by automated tests that pass in CI. Owner checks on the test site are noted where they exist. |
| **Partial** | Some of it is built and tested; the gap is named. |
| **Not started** | Nothing built. |
| **Blocked** | Needs an outside service, account or cost that is not approved. |
| **Owner decision** | Cannot be built correctly until you decide (§4). |

---

## 2. Baseline reviewed (evidence)

| Item | Current state | Evidence |
|---|---|---|
| Repository | `sinharomesh-cpu/AA-Learning-Portal` (public), `main` at `3ce7b35` | Merged PRs #20–#32 (Phase 2) |
| Database | Postgres 16, migrations `0001`–`0006` | `db/migrations/` |
| Test environment | `aa-pro-test.vercel.app`, Neon database (Singapore), password-protected, test mailbox | Owner verified 15 Oct, 09:23 IST; Vercel status "success" for `3ce7b35` |
| Sample-data preview | `aa-learning-portal` Vercel project, unchanged | Vercel status "success" for `3ce7b35` |
| CI | **11 checks**, not 7: privacy-and-brand, secret-scan, lint, typecheck, test, build, e2e (demo), db, e2e-real, hosted-demo, Vercel Preview Comments | All 11 "success" on PR #32 head |
| Tests | 147 unit · 106 database · 100 demo browser · 31 real-account browser (desktop and phone) | Local run 16 Oct, and CI on PR #32 |
| Branch protection | **None on `main`** (GitHub returns "Branch not protected"). A-03 has not been done. | `gh api …/branches/main/protection` → 404 |
| Email | Not sent anywhere. Every email is written to an outbox and shown at `/dev/mailbox` on the test site. No provider (A-02). | `src/server/auth/outbox.ts` |
| File storage | None yet. Uploads were planned for Phase 4. | — |
| Data in test site | Synthetic only (example.com addresses, made-up names) | Owner and Claude test accounts only |

**About the CI baseline (Requirement H).** The new baseline lists seven checks. The repository runs eleven: the seven plus a database test job, a real-accounts browser job, a hosted-preview job and Vercel's own check. I will keep all eleven unless you say otherwise.

---

## 3. Gap analysis

### Requirement A — Registered-teacher registration and onboarding

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| A1 | Registration (name, email, password) | **Complete** | Board 62, WP2-3 (PR #24). Real browser test "a teacher signs up…"; database tests in `tests/db/accounts.test.ts` |
| A2 | Validation: mandatory fields, formats, duplicates | **Complete** for sign-up | The same answer is given for an email already in use (no account enumeration); tests cover it |
| A3 | Email verification | **Complete in test mode** | 24-hour single-use link, confirmed by a button press. Emails only go to the test mailbox: **Blocked** for real delivery until an email provider is approved (A-02) |
| A4 | Profile form (subjects, grades, bio, time zone, terms) — M-20 | **Not started** | The M-20 board is approved. The data columns exist (`teacher_profiles`). No form, so `approval_status` stays `draft` |
| A5 | States: registered → verified → profile complete → approved | **Partial** | `pending_email` → `pending_approval` (draft) → approved, rejected or changes requested all exist. **Gap:** "submitted" can only be reached through the profile form (A4) |
| A6 | Super Admin approval before protected access | **Complete** | Every teacher page sends a waiting teacher to `/teacher/status`; server check in `authz.ts`; approval page M-29 (PR #32); tests in `tests/db/admin.test.ts` and real browser test "approves a teacher" |
| A7 | Status messages: pending, rejected, changes requested, deactivated | **Partial** | Pending, rejected and changes requested pages exist (PR #32). A deactivated teacher sees "account not active" at sign-in. **Gap:** wording for "profile incomplete" (needs A4) |
| A8 | No bypass through direct requests | **Partial** | Pages and server actions check on the server. **Gap:** no teacher data pages exist yet to attack. Tests must be added as each one is built (B, F) |
| A9 | Only authorised admins approve; actions audited | **Complete** | `mayAct()` checks the role and the "Teacher approvals" permission against the database; `TEACHER_DECISION` audit event; tests "an Admin without the permission, or a parent, cannot decide" |
| A10 | Teacher terms text | **Owner decision** | The M-20 board shows "[Terms to be supplied]" (Q-11) |

### Requirement B — Parent links registered teachers, with subject permissions

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| B1 | Parent-facing linking workflow | **Not started** | Boards 57 (My teachers), 58 (Add a teacher), 59–61 approved (OC-36, OC-55) |
| B2 | Show eligible registered teachers | **Not started**, **Owner decision** | OC-36 links by **email**. A searchable list is OC-48 / board 65, planned for Phase 3. Bringing it into Phase 2 needs your agreement (Q-2) |
| B3 | Pick one or more of the parent's own children | **Not started** | Server isolation helpers exist (`getChild`, guardian links) |
| B4 | Subject checklist (6 subjects) | **Partial** | Table column exists (`teacher_student_links.subjects`, migration 0002, OC-41). No UI or server logic yet |
| B5 | Persist, update, remove links and subjects | **Not started** | — |
| B6 | Permissions applied to calendars, classes, resources and APIs | **Partial / dependency** | Calendars (Phase 3) and resources (Phase 4) don't exist yet. In Phase 2 I can enforce links on the teacher's Students list and student page, and build **one shared server check** that later features must call |
| B7 | Revoke access on removal | **Not started** | OC-41(4): access ends at once. OC-53: future lessons more than 30 minutes away are cancelled (Phase 3) |
| B8 | Negative tests: cross-parent, cross-child, cross-subject | **Not started** | Same test style as `tests/db/children.test.ts` "isolation" |

### Requirement C — External teacher invitation

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| C1 | Invite form: name, email, child, subject, chapter/topic, several proposed slots, duration ≤ 40 min, message, review | **Not started**, **Owner decision** | **Conflicts with the approved M-11 and OC-36(7)** (Q-1) |
| C2 | Email with details; teacher responds without an account (accept a slot, decline, suggest a time) | **Not started**, **Blocked** for real delivery | No response page is designed (Q-1). Real email needs a provider (Q-5). **The test site's access password would stop an outside teacher from opening the response link** (Q-6) |
| C3 | Parent sees status, reminds, cancels; history persists | **Not started** | Status list and transitions proposed in §5 |
| C4 | Business rules: no booking, no Zoom, no account, no child data | **Not started** | Directly opposite to the approved M-11 (which creates a Zoom meeting) — Q-1 |
| C5 | Secure, single-purpose, expiring response link; audit | **Not started** | The same hashed-token method as the existing set-password links can be reused |
| C6 | Chapter or topic list | **Owner decision** | There are no uploaded books yet, so there are no real chapter names. Do not invent chapters (master instructions §7) — Q-3 |

### Requirement D — Share chapter material with the external teacher

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| D1 | Find the material for the chosen chapter | **Not started**, **Blocked** | Needs parent uploads and file storage (planned for Phase 4) — Q-4 |
| D2 | Attachment or secure time-limited link | **Owner decision** | Conflicts with OC-41(5): registered teachers may **view but not download**. An email attachment can't be withdrawn — Q-4 |
| D3 | Malware scanning, file types and size limits | **Blocked** | Needs a scanning service and limits (Q-4) |
| D4 | Content rights (copyright, textbook licences) | **Owner decision** | D-26 is still open |
| D5 | Record what was shared, and when | **Not started** | — |

### Requirement E — Free now, subscription-ready later

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| E1 | Free in the first release; no paywall | **Not started** (no feature yet) | — |
| E2 | Server-side feature flag or entitlement check, kept apart from the workflow | **Not started** | Proposed: one `canSendExternalInvites(parent)` check, controlled by a server setting that defaults to "free for all". Test both settings. No charges and no plan logic |
| E3 | Commercial rules (plan, quota, price, expiry) | **Owner decision, deferred** | Not needed now; listed so they are not invented |

### Requirement F — Persistent data on every applicable page

| Area | Status | Evidence / gap |
|---|---|---|
| Sign-in, accounts, children, Super Admin, Admins, approvals, audit log | **Complete** | Database-backed, with real browser tests (PRs #24–#32) |
| Parent home, Children list | **Partial** | Children are real. Lessons, resources and notifications are empty because bookings and uploads don't exist yet |
| Student home | **Partial** | Name and subjects are real. Lessons and books are empty, with honest empty states |
| Teacher dashboard and student pages | **Not started** (sample data or "not ready") | Becomes real with B |
| Bookings, calendars, AI booking, history, content, notifications, availability | **Not started — later phases** | Phase 3 (booking), Phase 4 (uploads, AI classroom), Phase 7 (notifications). Each shows an honest "not ready yet" page in real mode, never sample data |

I will produce a page-by-page register (functional / intentionally static / waiting on a provider) as the first step of F.

### Requirement G — Independent security review

**Not started.** The plan (P2-00, WP2-9) proposes a reviewer that has not seen the build. Who that should be is your decision (Q-10).

### Requirement H — Regression testing and CI

**Partial.** All 11 checks run and pass on every merge (evidence in §2). **Gap:** `main` has no branch protection (A-03). Nothing technically stops a merge that skips CI; I simply never merge without passing checks (Q-9).

---

## 4. Conflicts and decisions I need from you

| ID | Question | Why it matters | My recommendation |
|---|---|---|---|
| **Q-1** | The new Requirement C replaces the approved M-11 (one date, Zoom meeting created, invitation sent only after Zoom confirms; kept in Phase 6 by OC-36(7) and D-25). Do you confirm the new version: several proposed slots, **no Zoom**, the teacher replies through a secure link, and it moves into **Phase 2**? | They can't both be built; the approved board says the opposite | **Yes, confirm.** I then draw three new boards (invite form, the teacher's response page, the parent's invitation list) for your approval before building |
| **Q-2** | For Requirement B, may parents **pick from a list** of approved teachers (directory, board 65, planned for Phase 3), or only **add by email** (boards 57–58, OC-36)? | Changes the scope and what parents can see about teachers | **Both, in Phase 2:** add by email as approved, plus the board 65 search (name, subjects, grades, short bio — never email or phone) |
| **Q-3** | Until books are uploaded, what does "chapter or learning topic" offer in the invite form? | We must not invent chapter names | A free-text "Chapter or topic" box. When uploads exist, a list from the parent's own books |
| **Q-4** | Chapter material (Requirement D): (a) bring **uploads and storage** forward from Phase 4; (b) **secure view link only**, or email attachments too; (c) file types and size limit; (d) link lifetime; (e) a malware-scanning service; (f) content rights (D-26) | Needs a storage service (cost), a scanning service (cost), and conflicts with OC-41(5) "view, not download" | (a) Yes, a small upload feature for PDF only. (b) **Secure link only, no attachments**: links can be withdrawn and logged, attachments can't. (c) PDF, up to 20 MB. (d) Until the invitation ends, at most 14 days. (e) Choose a provider when I bring you priced options. (f) Parent ticks "I have the right to share this" on upload |
| **Q-5** | Email provider for real delivery (A-02) | Without one, outside teachers never receive anything; the test site shows emails only in the test mailbox | I bring 2–3 priced options. Until then, test mode, clearly labelled |
| **Q-6** | The test site is behind an access password. Should the external-teacher response page (only `/invite/…` with its secret token) skip that password, so a real outside person can test it? | Otherwise only you can act as the outside teacher | **Yes, only that path**, and only on the test site. The token alone protects it |
| **Q-7** | Invitation rules: maximum proposed slots; expiry; how many reminders; what counts as a duplicate | Needed for statuses and tests | Up to 3 slots; expires when the last proposed slot passes, or after 14 days; 1 reminder; duplicate = same teacher email + same child + same subject still open |
| **Q-8** | Durations for external classes | The baseline says "≤ 40 minutes" | Offer 20, 30 or 40 minutes |
| **Q-9** | Turn on branch protection for `main` (require all CI checks; no direct pushes)? | Requirement 2.7 assumes it exists | **Yes.** I can set it up if my GitHub access allows it, or give you click-by-click steps |
| **Q-10** | Independent security review (Requirement G): who? | A reviewer must be separate from the build | **For Phase 2 sign-off:** a separate Claude reviewer agent with no build history, working from a written brief and the code only, with a findings report, fixes and retest. **Before any real-user launch:** a human, third-party penetration test (paid; quotes needed). The first is not a substitute for the second |
| **Q-11** | Teacher terms text for M-20 | The board shows "[Terms to be supplied]" | You supply it, or I draft it marked "DRAFT — not legal text", as with the privacy notice |
| **Q-12** | Confirm my readings from 15–16 Oct: a deactivated parent's children can still sign in; a rejected teacher can still sign in but sees only "not approved" | Requirement A asks for approved account-state rules | Confirm, or tell me the rule |

---

## 5. Proposed external-invitation states (for Q-1 and Q-7)

| From | To | By | Rule |
|---|---|---|---|
| Draft | Sent | Parent | Server checks: own child, flag allows, no duplicate open invite. "Sent" means **queued**, not delivered |
| Sent | Response received | Teacher (link) | Teacher suggested another time or wrote a note |
| Sent / Response received | Time agreed | Teacher accepts a slot, or parent confirms the suggested time | Not a booking; no calendar or Zoom entry |
| Sent / Response received | Declined | Teacher | Final |
| Sent / Response received | Cancelled | Parent | Final; link stops working; material link withdrawn |
| Sent / Response received | Expired | System | Last slot passed, or 14 days; link stops working |

---

## 6. Dependencies and possible costs

| Item | Needed for | Cost | Status |
|---|---|---|---|
| Email provider and sender domain | A3, C2 real delivery | Usually a free tier at low volume, then paid | **Not approved** (A-02, Q-5) |
| File storage | D | Small at test volume; paid as it grows | **Not approved** (Q-4) |
| Malware scanning | D | Paid per scan or per month | **Not approved** (Q-4) |
| Human penetration test | G (before launch) | Paid engagement | **Not approved** (Q-10) |
| Branch protection | H | Free | Owner action / approval (Q-9) |

No paid service will be connected without your approval and a price.

---

## 7. Proposed delivery order (after your decisions)

Each step is one pull request, merged only after all CI checks pass, and is then live on the test site for you to try.

| # | Pull request | Covers | Waits for |
|---|---|---|---|
| 1 | Teacher profile form M-20/M-22, "submitted" state, approval review | A4, A5, A7, A10 | Q-11 (a draft is fine) |
| 2 | Parent links teachers: My teachers, Add a teacher by email, subject checklist, set-password after approval, real teacher Students pages, shared access check, negative tests | B1, B3–B8 | — (boards approved) |
| 3 | Teacher directory (board 65), if approved | B2 | Q-2 |
| 4 | New boards for external invitations | C (design) | Q-1 |
| 5 | External invitations: form, statuses, secure response page, reminders, cancel, expiry, free-entitlement check | C, E | Q-1, Q-3, Q-6, Q-7, Q-8; board approval |
| 6 | PDF uploads and secure chapter links | D | Q-4 |
| 7 | Page register and remaining real-data work | F | — |
| 8 | Independent security review, fixes, retest; completion report P2-01 | G, H | Q-9, Q-10 |

**Size, honestly:** steps 1–3 are well-defined and can start as soon as you say so. Steps 4–6 depend on your answers and on outside services. I will not commit to dates for those until the decisions are made.

---

## 8. What I will not do without your approval

- Activate any charge, plan or paywall.
- Connect a paid service.
- Send real email.
- Use real child data.
- Change production configuration, or deploy to production.
- Merge a pull request with a failing or skipped check.
- Describe CI or my own testing as an independent security review.
