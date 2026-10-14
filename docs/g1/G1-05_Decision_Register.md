# AA Pro — G1-05 Decision Register

**Version:** G1 v1.5 · 14 Oct 2026 · **Baseline:** FRD v1.1 · **Status:** for owner review.
This register replaces section 12 of the Phase 0 Audit Report. Decision IDs are kept from Phase 0 (D-01 … D-31), so nothing is renumbered. New items start at D-32.

**v1.2 changes:**
- D-02, D-12, D-14, D-20, D-27, D-29, D-30 and D-31 are now owner-confirmed (OC-11 to OC-18).
- **D-27 is corrected:** Claude prepares the missing screens.
- New decisions D-32 and D-33 are added.

**v1.5 changes (owner instruction of 14 Oct 2026, 13:11 IST — close the gates before Phase 1):**
- **D-32:** design boards revised for OC-21/22/23 (round 3, canvas version 58). **0 of 52 boards approved.** Per-board status is in G1-09 §1.
- **D-34:** the exact bootstrap package has been prepared and validated **outside the repository**. It is **ready for your approval, not approved** (G1-09 §3). Nothing has been committed or pushed.
- **A-01:** paste-ready text and exact steps are in G1-09 §2. The project settings still contain v1 (re-read 14 Oct 2026).
- **New open decisions:** D-38 (design reference for the Parent and Teacher shells), D-39 (demo access in Phase 1 without real sign-in), D-40 (no hosted preview in Phase 1) and D-41 (Phase 1 technology baseline). All are needed before Phase 1 starts. See G1-10.
- **New owner actions:** A-05 (add the `IDENTIFYING_TERMS` repository secret before the first push) and A-06 (optional tidy-up of stale duplicate docs at the project root).
- **No business rule was decided by Claude.** D-05, D-07, D-08, D-09, D-11b, D-15, D-16, D-17, D-22, D-23a, D-24, D-25, D-26, D-10, D-28, D-35, D-36, D-37 and D-01a remain open.

**v1.4 changes (owner instruction, 14 Oct 2026):**
- **Approved:** D-33 Option B (OC-20), D-11 (OC-21) and D-06 (OC-22).
- **Approved in principle:** D-23 (OC-23). The detailed security spec is now D-23a and is open for your review (G1-08 §3).
- **D-32** remains **in review — not approved**. The designs keep the "Proposed — Not Approved" label until you approve individual screens.
- **D-34** is **conditional**: the exact commit package must be shown and approved before any commit or push.
- **New items:** D-36 (pull-request review rule for a single maintainer) and D-37 (password length policy).
- Action plan with review index, D-23 spec, D-33 file list, A-01 and A-03: see `claude/G1-08_Owner_Action_Plan.md`.

**Columns**
- **Approval?** — **Yes**: your explicit approval is required. **No**: settled by you or by the FRD; recorded only for traceability.
- **Blocks:** the earliest step that cannot start or finish without the decision.

---

## Part A — Owner-confirmed decisions (OC)

| ID | Decision | Source | Effect |
|---|---|---|---|
| **OC-01** | **Branding.** AA Pro is the single umbrella brand for the website and the Student, Parent, Teacher and Super Admin portals. The AI tutor is an integrated AA Pro capability, not a separate product or brand. "Lumina Learn", "Lumina", "AA Lumina", "Tutor Lumina" and "Lumi" are not retained in any form. Interim tutor labels are "AA Pro AI Tutor" and "AI Tutor". Voice interaction, the textbook/PDF viewer, structured page navigation and session summaries sit inside the AA Pro architecture. | Owner, 14 Oct 2026 | Replaces Phase 0 D-01 |
| **OC-02** | FRD v1.1 is the requirements baseline and Stitch is a design reference only. The FRD wins over the project instruction file where they differ. | Owner G1 instruction 1 | Settles Phase 0 D-19, P-01…P-05 |
| **OC-03** | Out of the initial release unless you approve a scope change: Google Classroom, payments/credits, SMS, calendar sync, OCR, AI study-card generation. | Owner G1 instruction 4 | Settles most of Phase 0 D-18 |
| **OC-04** | Demo data is synthetic only. Unsupported security, encryption, accreditation and child-safety claims are removed. | Owner G1 instruction 5 | Settles Phase 0 D-03, C-21 |
| **OC-05** | FRD AI availability model: AI is available 24/7 except blocked periods, existing bookings and parent restrictions. | Owner G1 instruction 3 | Settles Phase 0 D-04 |
| **OC-06** | FRD role permissions; 40-minute maximum for human meetings; students cannot upload files or manage human bookings. | Owner G1 instruction 3 | Settles C-01…C-04 |
| **OC-07** | **Brand separation.** AA Pro and P4Bpay.com are independent brands and projects, with no cross-use in either direction without explicit approval. | Owner, 14 Oct 2026 | All phases |
| **OC-08** | **Repository of record:** `sinharomesh-cpu/AA-Learning-Portal`, default branch `main`. | Owner, 14 Oct 2026 | G1-06 |
| **OC-09** | **Isolation and development controls:** no secrets, `.env`, credentials or student data in Git; no production change or deployment without approval; Stitch exports stay read-only. | Owner, 14 Oct 2026 | G1-06 §3 |
| **OC-10** | **Development gate:** no application implementation or repository commits until you approve the G1 deliverables and the next phase. | Owner, 14 Oct 2026 | Phase 1 blocked pending approval |
| **OC-11** | **D-02 Logo:** temporary "AA Pro" text wordmark in Outfit, primary `#006194`. A final logo is considered separately. | Owner, 14 Oct 2026 | Used on every G1 design board |
| **OC-12** | **D-12 Gamification:** XP, streaks, badges, quests and mastery percentages are deferred from v1. Only learning history and progress supported by the FRD are kept. | Owner, 14 Oct 2026 | G1-04 DC-24 confirmed |
| **OC-13** | **D-14 Classroom extras:** keep Hint, Repeat, Next Question and typed-text fallback. Defer Raise Hand, Lesson Notes and annotation. Replace the type-7 exit lock with a normal confirmation dialog. | Owner, 14 Oct 2026 | G1-04 DC-25 confirmed |
| **OC-14** | **D-20 Canonical screens:** S1 is the desktop Student dashboard; S9 is the mobile Student dashboard; S13 is the dedicated AI booking wizard, linked from S11. Other Stitch screens are references only. Intentional deviations are recorded (G1-04 §5). | Owner, 14 Oct 2026 | G1-01 updated |
| **OC-15** | **D-27 (corrected) Missing screens:** Claude prepares the missing screens from the G1-03 briefs, the existing Stitch designs and FRD v1.1 as reviewable visual designs with responsive layouts and states, and presents them for approval before full implementation. You will not prepare them in Stitch. | Owner, 14 Oct 2026 | Delivered: design canvas "AA Pro — Missing Screens (G1 Review)", awaiting your review |
| **OC-16** | **D-29 Repository structure:** the G1-06 §4 structure and working practices are approved. Before the bootstrap commit, Claude shows the exact file tree and re-confirms the repository state. | Owner, 14 Oct 2026 | G1-06 §6 (bootstrap plan) |
| **OC-17** | **D-30 GitHub contents:** commit the FRD and the selected Stitch HTML/screenshots with checksums. Do not commit the original ZIPs. Keep the original exports read-only outside Git. | Owner, 14 Oct 2026 | See D-33: the selected files themselves contain the demo names |
| **OC-18** | **D-31 Local directory:** `AA-Learning-Portal`, matching the repository. | Owner, 14 Oct 2026 | Applied at bootstrap (G1-06 §6) |
| **OC-19** | **M-31 Integration Health is deferred** and outside the v1 implementation scope. It stays on the design canvas for reference only and is removed from the v1 Super Admin menu. | Owner design review, 14 Oct 2026 | Confirmed again in OC-21 |
| **OC-20** | **D-33 Option B, Stitch references in Git.** Commit redacted copies of the selected Stitch HTML files where useful for development. Do not commit screenshots containing identifying demo data, or the original ZIP files. Keep the untouched original exports outside Git as read-only references, and record their checksums and inventory. **Show the exact proposed file list before committing.** | Owner, 14 Oct 2026 | Draft file list in G1-08 §4. Commit still gated by D-34 |
| **OC-21** | **D-11 Super Admin v1 scope.** Included: MFA sign-in; counts-only dashboard; account create/edit/deactivate with reasons recorded; teacher approval; read-only audit log. Deferred: support-on-behalf booking; audit export; Integration Health (OC-19). **Never:** sign-in-as-user (impersonation) or direct access to children's learning content. | Owner, 14 Oct 2026 | Applies to M-26…M-30 and M-35. Phase 2 and Phase 8 |
| **OC-22** | **D-06 AI session rules.** AI sessions are 15 or 30 minutes and start on 15-minute boundaries. Only one active AI session per child at a time. This is enforced on the server (validation and a database constraint), not only in the UI. Parent restrictions, blocked periods and existing bookings still apply. | Owner, 14 Oct 2026 | S13, M-17, M-18, M-09. Phase 3/5. The "proposed D-06" labels on the boards will be updated in the next design revision |
| **OC-23** | **D-23 Child sign-in, approved in principle.** The Parent creates the child's username and password. The Parent starts or completes resets through an authorised recovery flow. After 5 failed attempts the account is locked for 15 minutes. **Before implementation**, these must be specified and reviewed (D-23a): secure password storage, recovery verification, session invalidation after a reset, rate limiting, unlock behaviour and audit events. The system must never reveal whether a child account exists to an unauthorised person. | Owner, 14 Oct 2026 | Spec drafted in G1-08 §3. Implementation blocked until D-23a is approved |

## Part B — Resolved in favour of the FRD (no approval needed; you may override)

| ID | Item | Resolution |
|---|---|---|
| R-01 | Client-side role switcher; shared parent/teacher sidebar | Removed. Each role has its own authenticated shell. |
| R-02 | Sibling switcher in student view | Removed from student screens; siblings are switched in the Parent portal only |
| R-03 | Zoom Enterprise, vanity domain, recording, E2E claim | Removed. Zoom Basic, external launch, no recording. |
| R-04 | Teacher ratings/reviews | Removed |
| R-05 | Spanish/French subjects | Removed; FRD catalogue only |
| R-06 | Zoom IDs/passcodes/links on dashboards | Only via an authorised Join action |
| R-07 | Timezone display | Each user's IANA timezone; stored as UTC |
| R-08 | Parent-rule detail on student screens (S11 "Parent Authority" card) | Not shown to the child. The student sees open times only; rules stay in the Parent portal (G1-04 DEV-03). |

---

## Part C — Open decisions

### C1. Blocking the next steps

| ID | Question | Recommended option | Alternatives | Impact | Approval? | Blocks |
|---|---|---|---|---|---|---|
| **D-32** | Do you approve the missing-screen designs (canvas "AA Pro — Missing Screens (G1 Review)", 52 boards)? **Status: IN OWNER REVIEW — NOT APPROVED. 0 of 52 boards approved** (round 3 published 14 Oct 2026). | Review screen by screen using the index in G1-09 §1, recording a verdict for each board. The minimum set needed to start Phase 1 is listed in G1-10 §3. I revise, then you approve each screen explicitly. | Approve as-is; reject specific screens | Only boards you have explicitly approved become the reference for Phase 1. No board counts as approved by default. | **Yes, per screen** | Phase 1 build of each screen |
| ~~D-33~~ | **Closed → OC-20 (Option B).** Original question: D-30 says to commit the selected Stitch HTML/screenshots, but **12 of the 13 selected HTML files and most screenshots contain the same demo child names** (and some a real school name) that kept the ZIPs out of Git. How should references go into Git? | **(B)** Commit **redacted copies** of the selected HTML (names → synthetic names, school → "Sample Primary School", brand strings untouched), clearly labelled as derived. Do **not** commit the screenshots. Record checksums of the untouched originals, which stay outside Git. | (A) Commit originals as-is in the private repository, accepting the names. (C) Commit nothing from Stitch; only checksums plus the G1-01 inventory. | Privacy versus visual-reference convenience. Visual baselines for testing come from the approved AA Pro designs instead. | **Yes** | Bootstrap commit |
| **D-34** | Approve the exact bootstrap commit and its first push to `main`. **Status: CONDITIONAL — package prepared and validated, awaiting your approval (G1-09 §3).** You have set the conditions. Before you decide, I must present: the exact tree; the complete file list; exclusions and the redaction approach; confirmation that there are no secrets, `.env` files, credentials, personal student data, identifying demo data or original ZIPs; and the commit summary with validation results. | Approve the package in G1-09 §3 as presented. If any document in it changes before you approve (for example after D-23a), I rebuild the package, re-run every check and present it again. D-32 approval is not required for the bootstrap, because no design is committed as code. | Amend the file list | Creates the repository's first commit | **Yes, explicit approval of that exact commit** | Bootstrap commit and push |
| **D-36** | GitHub does not let the author of a pull request approve it. With a single maintainer, a "1 required approval" rule would block every merge. | Require a pull request and passing CI checks with **0 required approvals** while you are the only maintainer. You review and merge each PR yourself. Raise this to 1 approval when a second reviewer account exists. Never allow bypass of status checks. | Add a second GitHub collaborator as required reviewer now; or allow admin bypass (not recommended) | Branch protection (A-03) | **Yes** | Branch protection, after the first commit |
| **D-38** | No AA Pro adaptation board exists yet for the Parent dashboard (Stitch S19) or the Teacher dashboard (S21). G1-01 selected them, but OC-14 approved only S1, S9 and S13 as canonical. What is the design reference for the Parent and Teacher shells in Phase 1? | **(A)** I add AA Pro adaptation boards for S19 and S21 (desktop and phone) to the canvas for your per-board approval. Phase 1 builds those shells only after approval. | (B) Build directly from the G1-01 selection plus the G1-04 changes, treating them as approved. (C) Phase 1 builds the Student and Super Admin shells first; Parent and Teacher follow later. | Phase 1 scope and sequence | **Yes** | Phase 1, Parent and Teacher shells |
| **D-39** | Phase 1 has no real sign-in (that is Phase 2). How are the four role shells reached with synthetic data? | A **development-only demo sign-in** using the M-01/M-02 layouts. It sets a synthetic persona session on the server, and each role's routes check it. There is **no in-app role switcher** (R-01); changing role means signing out. It is enabled only when `AA_DEMO_MODE=true` and not in production. A production build fails if the flag is set. | Separate local builds per role; start Phase 2 auth before the shells | Role separation, safety of demo code | **Yes** | Phase 1 |
| **D-40** | Where does Phase 1 run? | **Locally and in CI only. No hosted preview deployment** in Phase 1. A preview, even with synthetic data, needs a separate approval and a hosting decision. | A private preview on a hosting provider you choose (needs D-28 thinking and your approval) | Deployment gate | **Yes** | Phase 1 |
| **D-41** | Phase 1 technology baseline (G1-10 §5) | Next.js (App Router) with React and TypeScript in strict mode; Tailwind CSS with the DESIGN.md tokens as CSS variables; Vitest with Testing Library; Playwright with axe-core for end-to-end and accessibility checks; ESLint and Prettier; Node 22 LTS. **Exact versions are pinned at Phase 1 start**: only releases at least 14 days old, after a compatibility check, reported to you. No database, auth provider or external service in Phase 1. | CSS Modules instead of Tailwind; other test runners | Build foundation | **Yes** | Phase 1 |
| **D-23a** | Approve the detailed child sign-in, lockout and recovery specification (G1-08 §3), including the required change to the M-02 lock message | As drafted | Amend any rule | Phase 2 auth design; M-02, M-08 | **Yes** | Phase 2 implementation of child auth |

### C2. Business rules (needed before the phase shown; placeholders are used in designs meanwhile)

| ID | Question | Recommended option | Alternatives | Impact | Approval? | Blocks |
|---|---|---|---|---|---|---|
| **D-05** | Which parent restrictions exist for AI booking? | Recurring blocked periods; one-off blocked dates; maximum AI minutes per day; minimum lead time | Weekly cap; per-subject limits; parent-PIN override | Slot engine; M-09 | **Yes** | Phase 3 |
| **D-07** | Cancel/reschedule policy | AI: student or parent up to start. Human: parent up to 2 h before; teacher may cancel with mandatory parent notice; inside 2 h, contact support. | Other cut-offs; teacher cannot cancel | States, notifications, Zoom updates | **Yes** | Phase 3 |
| **D-08** | Must the parent confirm teacher-proposed meetings? | Yes. Zoom is created only after parent confirmation. | Teacher books directly; parent notified | Child safety; extra state | **Yes** | Phase 3 |
| **D-09** | Who approves teachers and links them to students? | Super Admin approves teachers; a link is created when a parent confirms a booking; the parent can revoke it | Super Admin creates all links; teacher requests links | Relationship model; M-21, M-29 | **Yes** | Phase 2 |
| **D-11b** | How are Super Admin accounts created? (Remainder of D-11 not covered by OC-21) | At least two Super Admins, created by a one-off setup script run by you. MFA is enrolled at first sign-in. There is no self-registration. | One Super Admin; created by hand in the database | Lock-out risk if the single admin loses MFA | **Yes** | Phase 2 |
| **D-15** | Group human sessions | 1:1 only in v1 | Small groups with consent rules | Data model; privacy | **Yes** | Phase 3 |
| **D-16** | Teacher resource sharing and visibility | Teachers share only with assigned students, no parent gate, visible to the parent. Teachers see parent uploads only if shared. | Parent-gated sharing; teacher sees all of the child's files | Resource permissions | **Yes** | Phase 4 |
| **D-17** | Library "needs approval" state | Drop it. Resources are assigned (visible) or not, plus a "not available" state for failed or processing files. | Keep an approval workflow | Library states | **Yes** | Phase 4 |
| **D-22** | Student AI-class reminders | Parent by email (WhatsApp later); student sees an on-screen banner from T−15; children are not messaged | Student email/WhatsApp | Child data collection | **Yes** | Phase 7 |
| **D-37** | Password length policy (part of D-23a) | Adults (Parent, Teacher, Super Admin): at least 12 characters. Child: at least 8 characters, set by the parent; passphrases allowed. Both: maximum 64 characters, checked against a breached-password list, with no forced composition rules (NIST SP 800-63B approach). | The same 12-character minimum for children | M-02, M-03, M-08 copy | **Yes** | Phase 2 |
| **D-24** | Session summaries: source and retention | Summary generated after the session; transcript discarded; summaries kept for a period you set (proposed 12 months) | Keep the transcript; no summaries | Privacy, cost | **Yes** | Phase 5 |
| **D-25** | External invitation content | The email contains the real Zoom join link and no child profile data | Time-limited AA Pro link | M-32 | **Yes** | Phase 6 |
| **D-26** | Rights in uploaded textbooks | The parent confirms permitted use on upload; only lesson pages are sent to the AI Tutor | No attestation; legal review first | Upload flow, legal exposure | **Yes** | Phase 4 |
| **D-10** | Zoom hosting model | Platform-owned account (Server-to-Server OAuth), verified in a spike first | Teacher-owned accounts | Concurrency, cost | **Yes**, after spike | Phase 6 |
| **D-28** | Data residency, hosting region and retention | Decide before any deployment with real data | — | Provider/region, legal | **Yes** | Pre-production |
| **D-35** | When does the Join button become available before a human meeting, and until when after the start? | Recommend: 10 minutes before start until the scheduled end. | 5 or 15 minutes before; until 10 minutes after start | M-10, M-19, M-24, S1; Zoom join-link exposure (FR-020) | **Yes** | Phase 6 |
| **D-01a** | Final AI tutor display name | Keep "AA Pro AI Tutor" / "AI Tutor" | A persona label under AA Pro | Copy only (central config) | **Yes**, non-blocking | None |

## Part D — Actions for you (not decisions)

- **A-01.** Update the project instruction file. The only instruction file is the project-settings text; there is no `CLAUDE.md` (verified 14 Oct 2026). Its current text is preserved verbatim in `claude/Archived_Project_Instructions_v1.md`. The proposed replacement is `claude/Proposed_Project_Instructions_v2.md` (v2.1, with a changes table). You paste the new text into the project settings yourself; I cannot edit them. Until then, this register takes precedence.
- **A-02.** Arrange provider verifications before their phases: Zoom (TV-01/02), email sender domain, WhatsApp (TV-03).
- **A-03.** Enable branch protection on `main` after the bootstrap commit and first CI run (requires repository admin). Step-by-step instructions are in G1-08 §6. The approval rule depends on D-36.
- **A-04.** Share the design canvas with anyone else who should review it. It is private to you until shared from its Share menu.
- **A-05.** Before the first push, add a repository secret named `IDENTIFYING_TERMS` (GitHub → repository → Settings → Secrets and variables → Actions → New repository secret). It holds the identifying demo terms that CI must never find in the repository. This keeps those terms out of Git entirely. The value is given to you in the chat, not in any document. Without the secret, the CI privacy check fails on purpose rather than passing silently.
- **A-06 (optional).** The project root holds stale duplicate copies of several docs (for example a v1.0 G1-04 and older G1-05 copies) next to the current `claude/` versions. The authoritative copies are under `claude/`. You may delete the root duplicates. I will not delete them.

## Summary: what blocks progress now

| ID | State | What clears it |
|---|---|---|
| D-32 Designs | **Pending — in owner review, not approved** | Your per-screen verdicts (G1-08 §2) and explicit approval |
| D-33 Stitch in Git | **Approved — Option B (OC-20)** | Done. The exact file list is shown with the D-34 package |
| D-11 Super Admin scope | **Approved (OC-21)** | Done. D-11b (admin account creation) remains, needed before Phase 2 |
| D-23 Child sign-in | **Approved in principle (OC-23)** | D-23a spec review and D-37 before Phase 2 implementation |
| D-06 AI sessions | **Approved (OC-22)** | Done |
| D-34 Bootstrap commit | **Conditional — package ready for approval** | Your explicit approval of the exact package in G1-09 §3, plus A-05 before the push |
| D-38 Parent/Teacher design reference | **Pending** | Your choice (recommended: A) |
| D-39 Phase 1 demo access | **Pending** | Your approval |
| D-40 Phase 1 hosting | **Pending** | Your approval (recommended: local and CI only) |
| D-41 Phase 1 technology baseline | **Pending** | Your approval of G1-10 §5 |
| Phase 1 start | **Blocked** | D-34 committed, D-38–D-41 decided, the minimum board set approved (G1-10 §3), and your explicit "begin Phase 1" |

Nothing has been committed, pushed or deployed. The repository is still empty (re-verified 14 Oct 2026).
