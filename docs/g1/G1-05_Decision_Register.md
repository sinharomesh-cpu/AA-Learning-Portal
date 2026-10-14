# AA Pro — G1-05 Decision Register

**Version:** G1 v1.10 · 14 Oct 2026 · **Baseline:** FRD v1.1 · **Status:** for owner review.
This register replaces section 12 of the Phase 0 Audit Report. Decision IDs are kept from Phase 0 (D-01 … D-31), so nothing is renumbered. New items start at D-32.

**v1.2 changes:**
- D-02, D-12, D-14, D-20, D-27, D-29, D-30 and D-31 are now owner-confirmed (OC-11 to OC-18).
- **D-27 is corrected:** Claude prepares the missing screens.
- New decisions D-32 and D-33 are added.

**v1.10 changes (owner instruction of 14 Oct 2026, 20:15 IST: "Yes, I approved you can go ahead wit Phase 2"):**
- **OC-40:** Phase 2 plan P2-00 v1.2 approved; Phase 2 authorised. Work starts with WP2-1 (database foundation) and boards 57–63.

**v1.9 changes (owner answers of 14 Oct 2026, about 19:40 IST):**
- **A-07 done:** the owner imported the repository into Vercel (Hobby plan, team "Zeus") and reports the preview working. GitHub records Vercel's deployment of commit `7045b14` as successful. Claude could not open the address from its own session.
- **OC-35:** **D-23a** child sign-in, lockout and recovery specification (G1-08 §3) approved as drafted, including the M-02 lock-message change. **D-37** password policy approved as drafted.
- **OC-36:** **D-09** decided with a new owner use case: **a parent can add a teacher** who does not yet use AA Pro (change request CR-01 to FRD v1.1). Rules in the OC-36 row below.
- **OC-37:** **D-11b** two Super Admin accounts at launch, created by a one-off setup step run by the owner; MFA enrolled at first sign-in; no self-registration.
- **OC-38:** teachers can **register themselves** (owner, 20:04 IST). This confirms FR-004 and M-20. A "Create an account" screen (parent or teacher) was missing from the approved designs and is added as board 62 in P2-00.
- **OC-39 (change request CR-02):** a **public landing page** with information sections (owner, 20:08 IST). Added to P2-00 as board 63 and WP2-10.
- **D-28** stays open: the owner has no preference yet. It must be decided before any real data is stored. Phase 2 uses test data only.

**v1.8 changes (owner instruction of 14 Oct 2026, 19:01 IST: "Approve the preview"):**
- **OC-34:** a hosted demo preview of the prototype is approved, with sample data only. This lifts the OC-28 limit for the demo preview only; production deployment still needs separate approval. The code refuses a hosted demo build unless `AA_HOSTED_DEMO=true` is set, and refuses any demo build that has a real-service setting. Steps are in `docs/deployment/hosted-demo-preview.md`.
- **A-07 (new owner action):** create the hosting account and import the repository (about 5 minutes). Claude cannot create accounts for the owner.
- **Open for the owner, not decided by Claude:** the hosting plan. Vercel's free plan is for non-commercial personal use only; the Pro plan is $20/month (checked 14 Oct 2026).

**v1.7 changes (owner instructions of 14 Oct 2026, 17:59 IST):**
- **OC-31:** the owner made the repository public. Before continuing, Claude scanned all 165 file versions in the Git history, every commit message and every pull-request text for the identifying demo terms: none found.
- **OC-32:** the owner, who is not technical, authorises Claude to make all commits, open and merge pull requests, and manage branches. This settles **D-36**: merges need passing CI checks, not a human approval.
- **OC-33:** the four new boards are approved: P19 Parent dashboard (desktop, phone) and P21 Teacher dashboard (desktop, phone). WP-6 and WP-7 are unblocked.
- **A-03 status:** branch protection cannot be set from Claude's session; the session's GitHub access blocks settings changes. The owner can apply it in the browser (see A-03). Until then, every change still goes through a pull request with all CI checks.

**v1.6 changes (owner instruction of 14 Oct 2026, 13:39 IST: "All approved you can begin with phase 1"):**
- Recorded as owner approvals: **D-32** (all canvas boards except the deferred M-31) → OC-24; **D-34** bootstrap package → OC-25 (executed: commit `0a42216` on `main`, CI green); **D-38 option A** → OC-26; **D-39** → OC-27; **D-40** → OC-28; **D-41** → OC-29. **Phase 1 authorised** → OC-30.
- Claude's reading of "All approved": it covers the items listed as Phase 1 blockers in G1-09 §4. It does **not** decide the Phase 2+ business rules (D-05, D-07, D-08, D-09, D-10, D-11b, D-15, D-16, D-17, D-22, D-23a, D-24, D-25, D-26, D-28, D-35, D-36, D-37, D-01a), which stay open. Board approval does not decide any rule shown on a board as "Pending".
- A-05 confirmed by evidence: the CI privacy job passed, which it can only do when the `IDENTIFYING_TERMS` secret is set.

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

| **OC-24** | **D-32 Design approval.** All boards on the canvas "AA Pro — Missing Screens (G1 Review)" (version 58) are approved as design references, **except M-31** (deferred, OC-19). Boards are relabelled "APPROVED — 14 Oct 2026" (canvas version 60). "Pending D-xx" notes on boards stay undecided. | Owner, 14 Oct 2026, 13:39 IST | Phase 1 WP-1…WP-5, WP-8 unblocked |
| **OC-25** | **D-34 Bootstrap commit.** Package manifest `a5f7f089…3639` approved and executed: commit `0a422163fb88ba6bcaa60b763bfc101f210d2db0` pushed to `main`; CI `privacy-and-brand` and `secret-scan` passed. | Owner, 14 Oct 2026 | Repository bootstrapped |
| **OC-26** | **D-38 option A.** Claude adds AA Pro adaptation boards for the Parent dashboard (S19) and the Teacher dashboard (S21) for per-board approval. WP-6/WP-7 wait for those boards. | Owner, 14 Oct 2026 | New boards are "Proposed" until approved |
| **OC-27** | **D-39 Phase 1 demo access.** Development-only demo sign-in; server-side synthetic persona session; no role switcher; disabled unless `AA_DEMO_MODE=true` outside production; production build fails if set. | Owner, 14 Oct 2026 | WP-3 |
| **OC-28** | **D-40** Phase 1 runs locally and in CI only. No hosted preview without separate approval. | Owner, 14 Oct 2026 | Phase 1 |
| **OC-29** | **D-41** Phase 1 technology baseline as in G1-10 §5 (exact versions pinned at start, ≥ 14 days old, compatibility-checked). | Owner, 14 Oct 2026 | WP-0 |
| **OC-30** | **Phase 1 authorised** (design system and role-separated UI shell with synthetic data, per G1-10). Each work package is a pull request for owner review. | Owner, 14 Oct 2026 | Phase 1 |
| **OC-31** | **Repository visibility:** `sinharomesh-cpu/AA-Learning-Portal` is **public** (owner's decision). Identifying demo data stays out of Git: CI checks every push; the full history was scanned clean on 14 Oct 2026. Secrets stay in GitHub Actions secrets, which are not exposed by a public repository. | Owner, 14 Oct 2026, 17:59 IST | All future work is public; no private material may be committed |
| **OC-32** | **Claude makes all commits and merges.** Claude commits, opens pull requests, and merges each PR once every CI check passes (lint, typecheck, test, build, e2e, privacy-and-brand, secret-scan). The owner is informed by milestone reports. Production deployment still needs the owner's explicit approval (OC-09). | Owner, 14 Oct 2026, 17:59 IST | Settles D-36 (no required human approval) |
| **OC-33** | **Boards P19 and P21 approved:** Parent dashboard (desktop, phone) and Teacher dashboard (desktop, phone), canvas version 61. Their pending notes (D-07, D-08, D-09, D-15, D-16, D-22, D-35) stay undecided. | Owner, 14 Oct 2026 ("Approve all four") | WP-6, WP-7 unblocked |
| **OC-34** | **Hosted demo preview approved** with sample data only (`AA_DEMO_MODE` + `AA_HOSTED_DEMO`, no real-service settings, site-wide demo banner, no search indexing). Lifts OC-28 for this preview only. Production deployment still needs separate approval. | Owner, 14 Oct 2026 ("Approve the preview") | Preview, after A-07 |
| **OC-35** | **D-23a and D-37 approved as drafted.** Child sign-in, lockout and recovery exactly as G1-08 §3 (parent-set credentials, 5 failures → 15-minute lock keyed on the submitted username whether or not it exists, parent-only unlock and reset with step-up, no child email or phone). Passwords: adults ≥ 12, children ≥ 8, all ≤ 64, breached-password check, no composition rules or expiry. | Owner, 14 Oct 2026 ("As drafted") | Phase 2 |
| **OC-36** | **D-09 teacher approval and linking, with parent-added teachers (CR-01).** (1) Every teacher account needs Super Admin approval before the teacher can sign in. (2) **A parent can add a teacher** by name and email, and ticks which of their own children the teacher may work with; the parent can change or remove this later. (3) On adding, the Super Admin gets an approval request and the teacher gets an email saying a parent added them to AA Pro and that a second email follows after approval. (4) After approval, the teacher gets an email with a **one-time set-password link** sent to the address the parent entered; no password is ever sent by email. (5) A teacher-student link exists only for the children the parent ticked, or through a parent-confirmed booking; the parent can remove it. (6) If the email already belongs to an approved teacher, the link to the ticked children starts at once (no second admin approval) and the teacher is emailed that a parent added them. (7) The existing one-lesson invitation without an AA Pro account (M-11, FR-004.2, UC-08) is **kept as well**, and stays in Phase 6 because it needs Zoom. Teacher self-sign-up with approval (M-20) also stays. | Owner, 14 Oct 2026 (D-09 answer; follow-ups "Set-password link", "Parent picks", "Keep both", "Linked straight away") | Phase 2. New screens needed (see P2-00) |
| **OC-37** | **D-11b: two Super Admins at launch**, created by a one-off setup step the owner runs; each enrols MFA at first sign-in; no self-registration. | Owner, 14 Oct 2026 ("Two admins") | Phase 2 |
| **OC-38** | **Teachers can register themselves.** A teacher creates an account (name, email, password), confirms the email, completes the onboarding profile (M-20) and waits for Super Admin approval (M-21, M-29) before reaching the teacher portal. Once approved, they see a child only after a parent links them (OC-36) or confirms a booking (Phase 3). The missing "Create an account" screen becomes board 62. | Owner, 14 Oct 2026, 20:04 IST | Phase 2 (WP2-3, WP2-6) |
| **OC-39** | **Public landing page (CR-02).** Sections: home intro, How it works (parents, students, teachers), Safety and privacy, About us, FAQ, Contact us, plus Sign in and Create an account. Claude drafts the About us text, marked as a draft with no invented company facts; the owner edits it before launch. The owner provides the contact email. | Owner, 14 Oct 2026, 20:08 IST | Phase 2 (board 63, WP2-10) |
| **OC-40** | **Phase 2 authorised:** plan P2-00 v1.2 approved (WP2-1 … WP2-10, boards 57–63). Test data only; no hosted database, email provider or production deployment without separate approval. | Owner, 14 Oct 2026, 20:15 IST | Phase 2 |

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
| ~~D-32~~ | **Closed → OC-24.** All boards approved except M-31 (deferred). | | | | | |
| ~~D-33~~ | **Closed → OC-20 (Option B).** Original question: D-30 says to commit the selected Stitch HTML/screenshots, but **12 of the 13 selected HTML files and most screenshots contain the same demo child names** (and some a real school name) that kept the ZIPs out of Git. How should references go into Git? | **(B)** Commit **redacted copies** of the selected HTML (names → synthetic names, school → "Sample Primary School", brand strings untouched), clearly labelled as derived. Do **not** commit the screenshots. Record checksums of the untouched originals, which stay outside Git. | (A) Commit originals as-is in the private repository, accepting the names. (C) Commit nothing from Stitch; only checksums plus the G1-01 inventory. | Privacy versus visual-reference convenience. Visual baselines for testing come from the approved AA Pro designs instead. | **Yes** | Bootstrap commit |
| ~~D-34~~ | **Closed → OC-25.** Bootstrap commit `0a42216` pushed; CI green. | | | | | |
| ~~D-36~~ | **Closed → OC-32.** Claude merges pull requests after all CI checks pass; no human approval is required. | | | | | |
| ~~D-38~~ | **Closed → OC-26 (option A).** S19/S21 adaptation boards to be added for approval. | | | | | |
| ~~D-39~~ | **Closed → OC-27.** | | | | | |
| ~~D-40~~ | **Closed → OC-28.** | | | | | |
| ~~D-41~~ | **Closed → OC-29.** | | | | | |
| ~~D-23a~~ | **Closed → OC-35.** | | | | | |

### C2. Business rules (needed before the phase shown; placeholders are used in designs meanwhile)

| ID | Question | Recommended option | Alternatives | Impact | Approval? | Blocks |
|---|---|---|---|---|---|---|
| **D-05** | Which parent restrictions exist for AI booking? | Recurring blocked periods; one-off blocked dates; maximum AI minutes per day; minimum lead time | Weekly cap; per-subject limits; parent-PIN override | Slot engine; M-09 | **Yes** | Phase 3 |
| **D-07** | Cancel/reschedule policy | AI: student or parent up to start. Human: parent up to 2 h before; teacher may cancel with mandatory parent notice; inside 2 h, contact support. | Other cut-offs; teacher cannot cancel | States, notifications, Zoom updates | **Yes** | Phase 3 |
| **D-08** | Must the parent confirm teacher-proposed meetings? | Yes. Zoom is created only after parent confirmation. | Teacher books directly; parent notified | Child safety; extra state | **Yes** | Phase 3 |
| ~~D-09~~ | **Closed → OC-36.** | | | | | |
| ~~D-11b~~ | **Closed → OC-37.** | | | | | |
| **D-15** | Group human sessions | 1:1 only in v1 | Small groups with consent rules | Data model; privacy | **Yes** | Phase 3 |
| **D-16** | Teacher resource sharing and visibility | Teachers share only with assigned students, no parent gate, visible to the parent. Teachers see parent uploads only if shared. | Parent-gated sharing; teacher sees all of the child's files | Resource permissions | **Yes** | Phase 4 |
| **D-17** | Library "needs approval" state | Drop it. Resources are assigned (visible) or not, plus a "not available" state for failed or processing files. | Keep an approval workflow | Library states | **Yes** | Phase 4 |
| **D-22** | Student AI-class reminders | Parent by email (WhatsApp later); student sees an on-screen banner from T−15; children are not messaged | Student email/WhatsApp | Child data collection | **Yes** | Phase 7 |
| ~~D-37~~ | **Closed → OC-35.** | | | | | |
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
- **A-07 (done 14 Oct 2026).** Create the hosting account, choose its plan and import the repository with the two demo settings. Steps: `docs/deployment/hosted-demo-preview.md`. Then send Claude the web address to check.

## Summary: status on 14 Oct 2026 (about 19:40 IST)

| ID | State |
|---|---|
| D-32 Designs | **Approved (OC-24)**, except M-31 (deferred). New boards P19/P21 approved (OC-33). |
| D-34 Bootstrap | **Done (OC-25):** commit `0a42216` on `main`; CI green |
| D-38 / D-39 / D-40 / D-41 | **Approved (OC-26 … OC-29)** |
| Phase 1 | **Complete** (P1-02). Hosted demo preview live on Vercel (OC-34, A-07) |
| Phase 2 | **Authorised (OC-40)**; in progress |
| A-01 Project instructions | Still v1 in the project settings (re-read 14 Oct 2026); paste of v2.1 recommended |
| A-03 Branch protection | **Owner action.** The repository is public, so this is free, but Claude's session cannot change repository settings. Required checks (all seven CI jobs): privacy-and-brand, lint, typecheck, test, build, e2e and the secret scan; 0 approvals (OC-32) |
| Open, not decided | D-05, D-07, D-08, D-10, D-15, D-16, D-17, D-22, D-24, D-25, D-26, D-28, D-35, D-01a |
