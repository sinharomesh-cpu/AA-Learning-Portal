# CR-12 — Teacher acceptance of parent requests, and optional trial lessons

**Version:** 1.0 · 18 Oct 2026 · **Status:** decisions recorded (OC-97). Designs **TR0–TR7** are drawn and **awaiting owner review**. Nothing is built.
**Source:** owner testing as a parent, 18 Oct 2026, 14:49 IST: "there should be a provision that the teacher accepts or rejects this proposal by parents (no time, personal reason …)", and "the parent asks for a demo to check the comfort between child and teacher; once ok, the parent can link the child". The owner's decisions arrived at 16:12 IST.

## 1. Owner decisions (OC-97)

| # | Topic | Decision |
|---|---|---|
| 1 | Request granularity | The teacher **accepts or declines each child separately**. The request carries the subjects the parent selected for that child. **Acceptance grants access only to that child and those subjects** |
| 2 | Unanswered requests | A request **expires after 14 calendar days** without a response. The parent is notified. **Acceptance is impossible after expiry** |
| 3 | After a decline | The parent waits **7 calendar days** before asking the **same teacher for the same child** again. They may ask another teacher immediately |
| 4 | Existing links | **Existing valid teacher–child links stay active** and need no re-acceptance. The current access relationship is preserved and not interrupted by the new workflow |
| 5 | Trial lesson | **Optional**, never mandatory. The parent can request a trial, or go straight to the normal teacher-acceptance request |
| 6 | Trial rules and pricing | **One trial per teacher–child pair, 20–30 minutes**, with a **parent or responsible guardian present**. AA Pro explains that **the parent and teacher agree any trial price and payment directly**. **AA Pro never collects or processes trial payments** |
| 7 | Trial video call | A **teacher-provided meeting link** may be used as a temporary no-cost option, **subject to parent approval and safeguards**. **Zoom or any paid service is not activated** without explicit written approval (OC-91). **Live scheduling is a Phase 3 dependency** and is never shown as available before it exists |

**Controls set by the owner (same message):**
- Update CR-12, the decision log, the traceability matrix and the acceptance criteria first.
- Then prepare screens for both points for review before implementation.
- Implement Point 1 first, on non-billable infrastructure.
- Keep Point 2 in the Phase 3 backlog until scheduling is available.
- Preserve existing valid links, and apply strict server-side access controls.
- Before acceptance, expose only the minimum request details: no textbooks, homework or private child information.
- During a trial, expose no books, files or homework. The parent must explicitly choose "Link this teacher" afterwards; the link is never made automatically.
- After a decline, expiry or withdrawal, no access is granted through the request.
- No paid integrations, services or usage without explicit prior written approval.

## 2. Earlier decisions this changes (kept for traceability)

The earlier decisions are **not deleted or rewritten**. The register marks them "amended by OC-97 (CR-12)" from the day Point 1 is built.

| Earlier decision | What it said | Change under CR-12 |
|---|---|---|
| **OC-36(6)** | If the email belongs to an approved teacher, "the link to the ticked children starts at once" | **New** requests start as *Waiting for the teacher*. The link becomes active only when the teacher accepts that child |
| **OC-75(3)** | For a teacher awaiting approval, the parent's choices "start automatically on approval" | After AA Pro approval, they become a request the teacher must accept. Nothing starts automatically |
| **OC-36(5)** | A link exists only for children the parent ticked, or through a parent-confirmed booking | Unchanged, plus the teacher's acceptance for links created through a request |
| **OC-54 / board 65** (add from the directory) | An approved teacher found in the directory is linked straight away | Becomes a request the teacher must accept, the same as by email |
| **OC-61** (outside-teacher invitation: up to three times; accept, decline or suggest) | Unchanged | The trial (Point 2) reuses the same pattern |
| **OC-76 / OC-79** (marketplace enquiries) | Accepting an enquiry grants no access; linking is a separate parent step | Unchanged. After an accepted enquiry, the parent's link request still goes to the teacher for acceptance |

**Claude's readings, for the owner to confirm on the boards:**
- **Reading A, links still waiting for AA Pro approval when Point 1 is released.** These are *not* active links today. After the teacher is approved they become requests to the teacher (14-day clock from approval). Only active links are kept as they are (decision 4).
- **Reading B, the minimum request details** (consistent with OC-76 for enquiries). Before accepting, the teacher sees:
  - the child's grade and curriculum;
  - the subjects requested;
  - the parent's first name;
  - an optional message from the parent (up to 500 characters, with a reminder not to share contact details);
  - the date of the request and when it expires.

  The teacher does **not** see the child's name, profile, books, homework, history or anything else until they accept.
- **Reading C, after a trial.** Agreeing to a trial is not agreeing to teach regularly, so "Link this teacher" sends the normal request and the teacher still accepts it (one tap; the request shows "after a trial on …"). Alternative: the link starts at once when the parent chooses it. Claude recommends the first; the owner decides on board TR7.

## 3. Requirements

### FR-038 Teacher acceptance of parent requests (Point 1, buildable now, $0)

| ID | Requirement |
|---|---|
| FR-038.1 | When a parent adds a teacher (by email, or from the teacher directory), one **request per child** is created, carrying the subjects the parent selected for that child (as allowed by OC-75(1)). |
| FR-038.2 | Request states: **Waiting for the teacher → Accepted** (becomes an active link) or **Declined**, **Expired** or **Withdrawn**. A teacher still awaiting AA Pro approval has *Waiting for AA Pro approval* first; the 14 days start at approval. |
| FR-038.3 | The teacher sees "Requests from parents" (dashboard and Students page) with **only** the Reading B details, and accepts or declines **each child separately**. |
| FR-038.4 | **Accept** creates an active link limited to that child and the requested subjects. Only then does the teacher see the child (OC-41 rules apply from that moment). |
| FR-038.5 | **Decline** requires a reason: *No time at the moment*, *Subject or grade is not a good fit*, *Personal reasons*, or *Other*. An optional note goes to the parent (up to 300 characters). No access is ever granted. |
| FR-038.6 | **Expiry:** after 14 calendar days without an answer the request becomes Expired, the parent is notified, and accepting is refused by the server and the database. |
| FR-038.7 | **Withdraw:** the parent can withdraw a waiting request at any time; it can no longer be accepted. |
| FR-038.8 | **Ask again:** after a decline, the parent cannot request the **same teacher for the same child** for 7 calendar days (the screen shows the date). Expired or withdrawn requests can be sent again at once. Other teachers can be asked at any time. |
| FR-038.9 | **Existing active links are untouched** (decision 4). Changing subjects on an active link stays a parent action with no re-acceptance (OC-41(4)); adding a new child to an existing teacher creates a request for that child. |
| FR-038.10 | **Notifications:** shown in AA Pro to the teacher (new request) and the parent (accepted, declined, expired). Emails are queued only, until an email service is approved (OC-65, OC-91); nothing claims an email was delivered. |
| FR-038.11 | **Server and database enforcement:** every access check (`teacherMaySee`, books, resources, homework, files) counts only **active** links. Requests give no access in any state. Accepting re-checks on the server and in a database trigger that the request is waiting and not expired, the teacher is approved and active, the subjects are still on the teacher's approved profile and the child's subjects, and the parent is still the child's guardian. |
| FR-038.12 | **Audit:** requested, accepted, declined (reason only, not the note), expired, withdrawn, and refused attempts. |
| FR-038.13 | Admins and the Super Admin see counts only, never request details (OC-21, OC-90 Q-8). |

### FR-039 Optional trial lesson (Point 2, Phase 3, designs only now)

| ID | Requirement |
|---|---|
| FR-039.1 | Optional: when adding a teacher, the parent chooses **"Send a request"** (FR-038) or **"Ask for a trial lesson first"**. |
| FR-039.2 | **One trial per teacher–child pair**, 20 or 30 minutes. The parent proposes up to three times (OC-61 pattern); the teacher accepts one, suggests another, or declines (with an FR-038.5 reason). |
| FR-039.3 | The parent confirms that **a parent or responsible guardian will be present** throughout. |
| FR-039.4 | **Price and payment:** AA Pro shows "Any price for the trial is agreed between you and the teacher, and paid directly. AA Pro does not collect or handle payments." There are no price or payment fields. |
| FR-039.5 | **Video call:** until a meeting service is approved, the teacher may add **their own meeting link**. Safeguards: <br>• only `https://` links on a short list of known meeting sites, with no shortened links; <br>• the link is shown to the parent **for approval** before the child can see it; <br>• it is visible only to that parent and child, only in the join window (OC-44); <br>• it is removed after the trial; <br>• AA Pro states that the call runs on the teacher's own service, not AA Pro's, and is not recorded (R-03). <br>Zoom is not used without written approval (OC-91). |
| FR-039.6 | **During the trial** the teacher sees only the Reading B details and the child's first name: no books, files, homework or history. |
| FR-039.7 | **After the trial** the parent chooses **"Link this teacher"** or **"Not now"** (ends it). **Never automatic.** If the parent does nothing, nothing is linked. "Link this teacher" sends the normal FR-038 request for that child, which the teacher accepts (see R-3). |
| FR-039.8 | Before scheduling exists (Phase 3), no trial option is shown in the product, so nothing appears available that is not. |

## 4. Acceptance criteria

| # | Criterion | Planned tests |
|---|---|---|
| AC-1 | Adding a teacher creates one waiting request per child; the teacher gets no access to any child before accepting | T-REQ-1 (I), E-REQ-1 (E) |
| AC-2 | The teacher sees only the Reading B details for a waiting request: no child name, books, homework, files or history | T-REQ-2 (I), E-REQ-1 |
| AC-3 | Accepting one child gives access to that child and the requested subjects only; another child in the same family stays waiting | T-REQ-3 (I), E-REQ-2 |
| AC-4 | Decline needs a reason; the parent sees it; no access is granted | T-REQ-4 (I), E-REQ-2 |
| AC-5 | After 14 days a request expires; acceptance is refused by the server and the database; the parent is notified in AA Pro | T-REQ-5 (I) |
| AC-6 | After a decline, the same teacher and child can be requested again only after 7 days; other teachers at once | T-REQ-6 (I) |
| AC-7 | A withdrawn request cannot be accepted | T-REQ-7 (I) |
| AC-8 | Existing active links stay active and accessible, with no re-acceptance | T-REQ-8 (I, migration test) |
| AC-9 | Two answers at the same moment (accept and withdraw, or accept twice) give one result | T-REQ-9 (I, concurrency) |
| AC-10 | Unapproved, deactivated or unlinked teachers, other parents, students, Admins and the Super Admin cannot accept, decline or see requests | T-REQ-10 (I, role matrix) |
| AC-11 | Every state change is in the audit trail, without the parent's message or the decline note | T-REQ-11 (I) |
| AC-12 | Trial (Phase 3): optional; one per pair; guardian-present confirmation; no payment fields; teacher link only after parent approval; no books, files or homework during the trial; linking only after "Link this teacher" | T-TRIAL-1 to T-TRIAL-7 (planned for Phase 3) |

## 5. Designs (for review before building)

Boards **TR0–TR7** are on the design canvas, page "Teacher requests & trial lessons":

| Board | Screen |
|---|---|
| TR0 | Read me: flow, rules, privacy |
| TR1 | Parent: add a teacher, with the request per child and an optional message (trial option shown as Phase 3) |
| TR2 | Parent: My teachers, with every request state |
| TR3 | Teacher: Requests from parents (minimum details), with Accept and Decline |
| TR4 | Teacher: accept confirmation and decline with reason |
| TR5 | Parent (phone): request states and notifications |
| TR6 | Trial (Phase 3), parent: ask for a trial (times, length, guardian present, price note) |
| TR7 | Trial (Phase 3), teacher answer and meeting link with safeguards; parent's "Link this teacher" or "Not now" afterwards |

## 6. Delivery

| Step | Content | Cost |
|---|---|---|
| S-0 | This document, register OC-97, traceability, Phase 3 backlog entry | $0 |
| S-1 | Boards TR0–TR7 for review | $0 |
| S-2 | After approval: Point 1 (migration, server rules, teacher and parent screens, tests) | $0 |
| S-3 | Phase 3: Point 2 with scheduling. Zoom stays **Blocked — Owner Budget Approval Required** | $0 unless a meeting service is approved |
