# AA Pro — G1-05 Decision Register

**Version:** G1 v1.28 · 16 Oct 2026 · **Baseline:** FRD v1.1 · **Status:** for owner review.
This register replaces section 12 of the Phase 0 Audit Report. Decision IDs are kept from Phase 0 (D-01 … D-31), so nothing is renumbered. New items start at D-32.

**v1.2 changes:**
- D-02, D-12, D-14, D-20, D-27, D-29, D-30 and D-31 are now owner-confirmed (OC-11 to OC-18).
- **D-27 is corrected:** Claude prepares the missing screens.
- New decisions D-32 and D-33 are added.

**v1.28 changes (owner, 16 Oct 2026, 14:41 IST — decisions on P2-R2 textbooks, chapters and reader):**
- **OC-74** records the ten decisions. OC-03 stays in force: no OCR and no AI-made study content in this scope.
- Design boards R1–R6 drawn on the canvas page "Textbooks & chapter reader (proposed, P2-R2)" for approval before any textbook UI is built.
- Points Claude raised with the owner (to confirm or correct):
  1. Board 64 (approved) showed the teacher's book view with Next/Previous page buttons; under OC-74(1) it uses the same continuous scrolling.
  2. Text size works on the **Text** view (PDFs that already contain text); on page pictures A−/A+ zooms the page. Read-aloud reads text, so picture-only pages cannot be read aloud (no OCR).
  3. Original PDF: parents view and download their own uploads; children and teachers view inside AA Pro only (C-10 of P2-R2, not stated in OC-74).
  4. The 30-day removal of archived chapters needs a daily clean-up job; none exists yet. Until one does, archived chapters stay hidden from everyone and are removed when next touched after 30 days.
  5. The test database's free space is small (a few hundred MB), so only a few dozen 20 MB sample files fit.
  6. "View only" for teachers cannot stop screenshots or photos of the screen.
  7. M-14's approved upload dialog (optional chapter, formats "to be configured") is replaced for books by R3 (chapter title required; PDF, PNG, JPG, 20 MB).
  8. Quiz answers are not scored or saved in the first version (proposed on R6).

**v1.27 changes (PR1 teacher profile and approval, 16 Oct 2026):**
- **OC-73** records the owner's answer on re-approval ("Re-review, keep access").
- **OC-72** is built: server checks at child sign-in and on every child request, and a parent's deactivation signs their children out.
- Teacher terms (OC-71) are published at `/teacher-terms`, labelled **DRAFT, not legal advice**, for owner review. Teachers accept version `teacher-terms-draft-2026-10-16` when sending their profile.
- Claude's readings, for the owner to correct (no new business rule is final until confirmed):
  1. A child may sign in while **at least one** of their parents has an active account (OC-72 speaks of "a parent"; families with two linked parents keep access if one is active).
  2. Profile limits: name shown to families 2–80 characters; bio 20–1,000 characters; at least one subject and one grade to send.
  3. A profile that is already sent can still be corrected; it keeps its place in the queue.
  4. A self-registered or admin-created teacher who has not sent a profile can be **rejected** (for example a spam account) but not approved or sent back for changes.
  5. Accepting or declining a subject/grade change needs a decision note, like other approval decisions.
  6. A parent-added teacher approved before filling in the profile: their first subjects and grades go through the same change review.
  7. The contact email on the profile is the sign-in email, shown read-only; changing it goes through support (Accounts tool), because an unconfirmed email must not replace a sign-in address.

**v1.26 changes (owner, 16 Oct 2026, 13:16 IST — decisions on P2-R1 Q-1 to Q-12):**
- **OC-61 to OC-72** record the answers. **D-25** is replaced by OC-61; **D-26** is partly settled by OC-64 (the parent confirms sharing rights).
- Delivery order authorised: teacher profile and approval, parent–teacher linking, teacher directory. External invitations and document sharing: **designs first**, for approval, before building.
- Restrictions: synthetic data only; no paid services, real email, paywalls, real child data, production changes or deployment without approval; a Claude reviewer is never described as a human independent assessment.

**v1.25 changes (WP2-5b Admins and admin tools, built while the owner was away, 16 Oct 2026):**
- Built from approved boards 66, M-27, M-28, M-29/60 and M-30 under OC-21, OC-50 and the owner's "you are working" (15 Oct, 23:36 IST). No business rule was decided; deviations DV-38 to DV-41.
- Claude's readings, for the owner to correct: a deactivated parent's children can still sign in (not decided; D-09 territory); a rejected teacher keeps a sign-in that shows only "not approved"; Admins see the audit log only with the "Audit log" permission; the Super Admin is the only one who manages Admins.

**v1.24 changes (owner, 15 Oct 2026, 23:01 IST: "D-05- 30 Min per day max time a student/parent can book AI tutor"):**
- **OC-60:** daily AI tutor limit of **30 minutes per child per day**. D-05 is partly decided; its other options (blocked periods, one-off blocked dates, minimum lead time) stay open as **D-05b**.
- **A-10 done:** the owner set up the Super Admin on the test site with an authenticator app and recovery codes (15 Oct, 22:36 IST).

**v1.23 changes (WP2-5a Super Admin set-up and security codes):**
- New owner action **A-10**: set `AA_SUPERADMIN_EMAIL` on the test site and run the one-off set-up (`docs/deployment/test-environment.md`).
- New libraries, as planned in P2-00 §2: `otplib` 13.5.0 (security codes); plus `qrcode` 1.5.4 for the set-up QR code (not in the plan; needed so the phone app can scan the key). Both MIT-licensed.

**v1.22 changes (owner, 15 Oct 2026, 20:46 IST — sign-in page gap; choice "Add parent/teacher choice, for guidance only"):**
- **OC-59:** the adult sign-in page (M-01) shows "I am signing in as… A parent / A teacher", like Create an account. It only guides the person and changes the hint text; the account's own role decides which portal opens, so either choice signs in. Deviation DV-35.

**v1.21 changes (owner, 15 Oct 2026, 19:10 IST: "For D-44 yes, you are right"):**
- **OC-58:** D-44 closed. The curriculum list stays as proposed.

**v1.20 changes (15 Oct 2026, evening — WP2-4 child accounts):**
- **A-09 done:** the owner set up the test environment `aa-pro-test` (Neon, Singapore, test data only) and confirmed it works (09:23 IST).
- **New open decision D-44** (non-blocking): the curriculum list offered in the child profile.

**v1.19 changes (owner, 15 Oct 2026, 08:19 IST: "Yes, please proceed with small test database for testing"):**
- **OC-57:** a hosted **test environment** with its own small test database (test data only), as a separate, password-protected Vercel project. The sample-data preview stays as it is. Steps: `docs/deployment/test-environment.md`; owner action **A-09**.

**v1.18 changes (owner, 15 Oct 2026, 07:25 IST):**
- **OC-56:** the 7 password-list entries left in the public Git history (see WP2-2) stay as they are for now; no history rewrite while the repository is public.
- **A-08 (new, waiting for the owner):** the owner will take GitHub Pro and make the repository **private**. **When the owner says GitHub Pro is active, Claude reminds the owner and carries out the private-repository change list in A-08.**

**v1.17 changes (owner, 15 Oct 2026, 06:39 IST: "D42- As you suggest … D-43-Yes, i like, Design Approved, Please proceed"):**
- **OC-53 (D-42)**, **OC-54 (D-43)** and **OC-55**: boards 57–62 and 64–66 approved. All Phase 2 boards (57–66) are now approved.

**v1.16 changes (14 Oct 2026, late evening; Claude, while the owner was away):**
- Boards 57–62 and 64–66 are drawn on the design canvas, page "Phase 2 new screens (proposed)", and are waiting for owner approval.
- New open decision **D-42** (below). Small details proposed on the boards for confirmation are listed as **D-43**.

**v1.15 changes (owner, 14 Oct 2026, 22:22 IST):**
- **OC-51:** D-16 closed: when a teacher shares a resource with a student, the **parent can see it too**.
- **OC-52:** a **"Back to home"** link on both sign-in pages (owner found no way back to the landing page). The AA Pro wordmark there also links home. Logged as DV-28.

**v1.14 changes (owner messages of 14 Oct 2026, 21:56–22:04 IST, plus follow-up answers):**
- **OC-44 (D-35)**, **OC-45 (D-08)**, **OC-46 (D-07)**, **OC-47 (D-15)**, **OC-48 (D-16, change request CR-04: teacher directory)**, **OC-49 (D-22)** and **OC-50 (D-11b revised, change request CR-05: Admins with permissions; replaces OC-37)**. Rules in the rows below.

**v1.13 changes (owner, 14 Oct 2026, 21:47 IST: "All approved"):**
- **OC-43:** landing page text updated for OC-41 as Claude suggested: the fourth Safety card becomes "Your books stay in AA Pro" (teachers read, cannot download), replacing "AI lessons aren't recorded"; a new FAQ "How do teachers get my child's books?". Board 63 updated to match. Boards 57–62 and 64 are not drawn yet and are not covered by this approval.

**v1.12 changes (owner, 14 Oct 2026, 20:38 IST: "I approve the new design"):**
- **OC-42:** board 63 (public landing page, desktop and phone) approved. It was the only Phase 2 board drawn at that moment; boards 57–62 and 64 will be shown for approval separately. Built in WP2-10.

**v1.11 changes (owner, 14 Oct 2026, 20:25–20:35 IST):**
- **OC-41 (change request CR-03, core feature):** teachers see the parent's uploaded materials for the subjects the parent ticked. The owner describes this as the platform's core purpose: replacing WhatsApp and email sharing of books with teachers. Rules in the OC-41 row.
- **D-16** is partly settled by OC-41: how teachers see *parent uploads*. Still open: how teachers share *their own* resources.

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
| **OC-37** | *(Superseded by OC-50.)* **D-11b: two Super Admins at launch**, created by a one-off setup step the owner runs; each enrols MFA at first sign-in; no self-registration. | Owner, 14 Oct 2026 ("Two admins") | Phase 2 |
| **OC-38** | **Teachers can register themselves.** A teacher creates an account (name, email, password), confirms the email, completes the onboarding profile (M-20) and waits for Super Admin approval (M-21, M-29) before reaching the teacher portal. Once approved, they see a child only after a parent links them (OC-36) or confirms a booking (Phase 3). The missing "Create an account" screen becomes board 62. | Owner, 14 Oct 2026, 20:04 IST | Phase 2 (WP2-3, WP2-6) |
| **OC-39** | **Public landing page (CR-02).** Sections: home intro, How it works (parents, students, teachers), Safety and privacy, About us, FAQ, Contact us, plus Sign in and Create an account. Claude drafts the About us text, marked as a draft with no invented company facts; the owner edits it before launch. The owner provides the contact email. | Owner, 14 Oct 2026, 20:08 IST | Phase 2 (board 63, WP2-10) |
| **OC-40** | **Phase 2 authorised:** plan P2-00 v1.2 approved (WP2-1 … WP2-10, boards 57–63). Test data only; no hosted database, email provider or production deployment without separate approval. | Owner, 14 Oct 2026, 20:15 IST | Phase 2 |
| **OC-41** | **Teachers see parent uploads by subject (CR-03).** (1) For each teacher and each child, the parent ticks the subjects that teacher teaches (one, several or all). (2) The teacher can open **every** material the parent uploaded for that child in those subjects, arranged by subject card, then book or chapter; there is no per-file switch. (3) A teacher sees nothing for other subjects, other children or other families. (4) The teacher can open the materials **any time while the student is assigned** to them; access ends at once when the parent removes the teacher or a subject. (5) **View only inside AA Pro: teachers can see books and chapters but cannot download them.** | Owner, 14 Oct 2026 ("parent have the checklist options … only math's will visible to teacher"; 20:31 IST: "Teacher can view the books and chapters but not able to download", "Teacher can open and see the material anytime if they have student assign") | Phase 2: link subjects (migration 0002). Phase 4: uploads and the teacher's material view (board 64) |
| **OC-42** | **Board 63 public landing page approved** (desktop and phone). Boards 57–62 and 64 not yet drawn at the time; to be approved separately. | Owner, 14 Oct 2026, 20:38 IST | WP2-10 |
| **OC-43** | **Landing page wording for OC-41:** "Your books stay in AA Pro" safety card and the FAQ "How do teachers get my child's books?"; board 63 updated. | Owner, 14 Oct 2026, 21:47 IST ("All approved") | WP2-10 |
| **OC-44** | **D-35 Join window:** the Join button for a teacher session opens **10 minutes before the start** and stays available **until the scheduled end**. | Owner, 14 Oct 2026 (21:56 "10 min before"; follow-up "Until the lesson ends") | Phase 3 / Phase 6 |
| **OC-45** | **D-08 Teacher-proposed lessons:** a lesson proposed by a teacher must be **accepted or rejected by the parent**; nothing is scheduled (and no Zoom meeting is created) until the parent accepts. | Owner, 14 Oct 2026 (21:56, 22:01) | Phase 3 |
| **OC-46** | **D-07 Cancel and reschedule:** (1) Teacher sessions: parent and teacher can cancel or reschedule **up to 30 minutes before the start**; inside 30 minutes neither can. (2) A teacher who booked a class may cancel or reschedule it; **a teacher's reschedule needs the parent's approval**; a teacher's **cancellation is notified to the parent**. (3) AI lessons: the student or parent can cancel or move them **any time before the start**. | Owner, 14 Oct 2026 (21:56, 22:01; follow-up "Anytime before start") | Phase 3 |
| **OC-47** | **D-15 Group sessions:** **1:1 only** in v1; group sessions may come in a later phase, depending on demand. | Owner, 14 Oct 2026, 21:56 | Phase 3 data model stays 1:1 |
| **OC-48** | **D-16 and CR-04:** (1) **Teacher directory:** parents can search and view teachers who registered on AA Pro (approved teachers only). (2) Resources a teacher shares are visible to **the teacher and the student** when the teacher is linked to that student. Open detail: whether the parent also sees them. | Owner, 14 Oct 2026, 21:56 | Directory board 65; built with booking in Phase 3 |
| **OC-49** | **D-22 AI-class reminders** go to **both parent and student**: the parent by email (WhatsApp later, after consent and provider approval); the student **on screen in AA Pro** from 15 minutes before, because children have no email or phone (OC-35). | Owner, 14 Oct 2026 (22:01 "Parents and students both"; follow-up "On screen in AA Pro") | Phase 7 (student banner Phase 3) |
| **OC-50** | **D-11b revised (CR-05), replaces OC-37:** (1) The **owner is the only Super Admin**. (2) The Super Admin can **create Admin accounts** and choose, per Admin, **which functions they may manage** (for example accounts, teacher approvals, audit log). (3) Lock-out protection: at Super Admin setup, **10 one-time recovery codes** are issued for the owner to print and keep safe. (4) OC-21 limits apply to every Admin as well: no sign-in-as-user, no access to children's learning content; Admins also sign in with MFA. | Owner, 14 Oct 2026 (22:04; follow-up "Owner + recovery codes") | Phase 2 WP2-5; board 66 |
| **OC-51** | **D-16 closed:** resources a teacher shares with a linked student are visible to the **teacher, the student and the student's parent**. | Owner, 14 Oct 2026, 22:22 IST | Phase 4 |
| **OC-52** | **Back to home** on the adult and child sign-in pages; the wordmark links home too. | Owner, 14 Oct 2026, 22:22 IST | Built (PR "Back to home") |
| **OC-53** | **D-42:** when a parent removes a teacher, booked lessons **more than 30 minutes away are cancelled** and parent and teacher are told; lessons starting within 30 minutes stay. | Owner, 15 Oct 2026, 06:39 IST ("As you suggest") | Phase 3 |
| **OC-54** | **D-43:** set-password link single-use, expires after **72 hours**; email-confirmation link expires after **24 hours**; a parent-added teacher completes their profile after approval with **no second approval**, and the queue offers only Approve or Reject for them; the teacher directory shows only **name, subjects, grades, time zone and bio**, and a teacher can **hide from search**. | Owner, 15 Oct 2026, 06:39 IST ("Yes, i like") | Phase 2, Phase 3 |
| **OC-55** | **Boards 57–62 and 64–66 approved** (My teachers, Add a teacher, Set your password, approval queue update, account emails, Create an account, teacher's book view, Find a teacher, Admins and permissions). | Owner, 15 Oct 2026, 06:39 IST ("Design Approved, Please proceed") | Phase 2 build |
| **OC-56** | **No Git-history rewrite for now:** the 7 common-password entries that matched protected terms remain in the public history of one WP2-2 commit; they were removed from the current files. Revisit with A-08. | Owner, 15 Oct 2026, 07:25 IST ("That is fine due to public") | A-08 |
| **OC-57** | **Hosted test environment approved:** separate Vercel project `aa-pro-test` with a Neon Postgres test database (free plan), test data only; whole site behind an access password; "Test environment" banner; no search indexing; test mailbox instead of real emails; migrations run during the build. Sample-data preview unchanged. Real data stays blocked until D-28. | Owner, 15 Oct 2026, 08:19 IST | A-09 |
| **OC-58** | **Curriculum list (D-44):** the child profile offers CBSE, ICSE, State board, IB, Cambridge (IGCSE), Other, or "Not set". | Owner, 15 Oct 2026, 19:10 IST | WP2-4 |
| **OC-59** | **Sign-in role choice (M-01):** "I am signing in as… A parent / A teacher" radio buttons, for guidance only. The account's own role decides the portal; a wrong pick still signs in. Chosen over a required choice, which would cause failed sign-ins and hint at an email's role. | Owner, 15 Oct 2026, 20:46 IST | DV-35 |
| **OC-60** | **AI tutor daily limit (D-05):** at most **30 minutes of AI lessons per child per day**, however they are booked (by the student or by the parent). Claude's reading, for the owner to correct: the day is the child's own calendar day in the child's time zone; cancelled lessons do not count; with OC-22 (15- or 30-minute lessons) this allows one 30-minute or two 15-minute AI lessons a day; it is a platform limit, checked on the server at booking time. Human-teacher lessons are not affected. | Owner, 15 Oct 2026, 23:01 IST | Phase 3 booking (S13, M-09) |
| **OC-61** | **External teacher invitation (Q-1; replaces the approved M-11 and D-25, amends OC-36(7)).** The parent proposes **up to three** time slots; the external teacher answers through a **secure link** (accept a slot, decline, or suggest another time). **No** booking, Zoom meeting or teacher account is created. Moves into Phase 2. New boards to be approved before building. | Owner, 16 Oct 2026, 13:16 IST | Phase 2 (designs first) |
| **OC-62** | **Linking registered teachers (Q-2):** parents can add an approved teacher **by email** (boards 57–58) **and** search an **approved-teacher directory** (board 65, moved from Phase 3). The directory shows limited profile information only — never email addresses or phone numbers. | Owner, 16 Oct 2026, 13:16 IST | Phase 2 |
| **OC-63** | **Chapter or topic (Q-3):** a free-text field until the parent's uploaded chapter list exists. No invented chapter names. | Owner, 16 Oct 2026, 13:16 IST | Phase 2 |
| **OC-64** | **Chapter material sharing (Q-4), in principle:** secure, **view-only** PDF sharing; max **20 MB**; link expiry **no later than 14 days**; malware scanning, access logging, revocation, and a parent confirmation of sharing rights. **No storage or scanning service is connected or bought** until the owner approves options and prices. | Owner, 16 Oct 2026, 13:16 IST | Designs first; build after provider approval |
| **OC-65** | **Email (Q-5):** real email delivery stays **disabled**. Claude presents 2–3 providers with pricing and sender-domain requirements for decision. | Owner, 16 Oct 2026, 13:16 IST | A-02 |
| **OC-66** | **Test-site password (Q-6):** only the token-protected external-invitation **response route** may bypass the test-site password, and **only on the test environment**. Nothing else is weakened. | Owner, 16 Oct 2026, 13:16 IST | With the invitation build |
| **OC-67** | **Invitation rules (Q-7):** at most **three** proposed slots; **one** reminder; expires when the **last proposed slot passes or after 14 days, whichever is first**; duplicate = same teacher email + same child + same subject with an open invitation. | Owner, 16 Oct 2026, 13:16 IST | Invitation build |
| **OC-68** | **External meeting durations (Q-8): 20, 30 or 40 minutes.** | Owner, 16 Oct 2026, 13:16 IST | Invitation build |
| **OC-69** | **Branch protection (Q-9):** protect `main` (all applicable CI checks required, no direct pushes) if Claude's permissions allow; otherwise Claude gives exact setup steps. | Owner, 16 Oct 2026, 13:16 IST | A-03 |
| **OC-70** | **Security review (Q-10):** a **separate reviewer with no build history** for the Phase 2 review, a written findings report, fixes and retest. Separately, options and pricing for a **human third-party penetration test** before real-user launch. A Claude review is never described as a human independent assessment. | Owner, 16 Oct 2026, 13:16 IST | WP2-9; pre-launch |
| **OC-71** | **Teacher terms (Q-11):** Claude drafts them, clearly labelled as a draft and not legal advice, for owner review. | Owner, 16 Oct 2026, 13:16 IST | M-20 |
| **OC-72** | **Account states (Q-12):** (1) while a parent's account is deactivated, **their children cannot sign in** until access is restored; (2) a **rejected teacher** may sign in **only** to see the status message, with no protected portal access. Server-side checks and tests required. | Owner, 16 Oct 2026, 13:16 IST | Phase 2 (with the teacher profile PR) |
| **OC-73** | **Re-approval after profile changes (D-09 remainder):** an approved teacher's changes to **name, bio or time zone** save at once; a change to **subjects or grades** goes to the approval queue for review, and the teacher **keeps their access** with the approved values until it is accepted or declined. | Owner, 16 Oct 2026 (answer: "Re-review, keep access (Recommended)") | Phase 2 PR1 (M-22) |
| **OC-74** | **Textbooks, chapters and reader (P2-R2), initial scope:** (1) continuous vertical scrolling with original page markers, Go to page where supported, Original PDF separate, text size, browser read-aloud, last reading position remembered per child; no Next/Previous needed. (2) Parents manage books and chapters for their own children; students read-only for assigned content; approved linked teachers view-only for permitted subjects; all enforced on the server. (3) PDF, PNG, JPG up to 20 MB with real file-type checks; parent-typed chapter titles; chapter ordering; confirmed archive with 30-day recovery. (4) Text extracted only from PDFs that already contain text; no OCR; original files, page order and page references preserved. (5) Summaries, vocabulary, flashcards, quizzes and concept diagrams are parent-provided; no AI-made content or paid AI services. (6) A book belongs to its parent and can be assigned to several of that parent's children; no school names; no school/publisher textbooks preloaded without rights; synthetic data only. (7) Test files stored in the test database; 2–3 private storage and malware-scanning options researched with costs; nothing bought without separate approval. (8) Add Book and Chapter Reader designs (desktop and phone) approved before the textbook UI is built. (9) PR2 and PR3 continue; designs in parallel; then R2-2 onward. (10) Evidence for scrolling (desktop, phone), page markers and jumps, Original PDF, reading progress, upload validation, role restrictions and cross-child protection. | Owner, 16 Oct 2026, 14:41 IST | P2-R2 R2-1 to R2-6 |

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
| **D-05b** | Which other parent restrictions exist for AI booking? (The daily limit is decided: OC-60.) | Recurring blocked periods; one-off blocked dates; minimum lead time | Weekly cap; per-subject limits; parent-PIN override | Slot engine; M-09 | **Yes** | Phase 3 |
| ~~D-07~~ | **Closed → OC-46.** | | | | | |
| ~~D-08~~ | **Closed → OC-45.** | | | | | |
| ~~D-09~~ | **Closed → OC-36.** | | | | | |
| ~~D-11b~~ | **Closed → OC-37.** | | | | | |
| ~~D-15~~ | **Closed → OC-47.** | | | | | |
| ~~D-16~~ | **Closed → OC-41, OC-48, OC-51.** | | | | | |
| **D-17** | Library "needs approval" state | Drop it. Resources are assigned (visible) or not, plus a "not available" state for failed or processing files. | Keep an approval workflow | Library states | **Yes** | Phase 4 |
| ~~D-22~~ | **Closed → OC-49.** | | | | | |
| ~~D-37~~ | **Closed → OC-35.** | | | | | |
| **D-24** | Session summaries: source and retention | Summary generated after the session; transcript discarded; summaries kept for a period you set (proposed 12 months) | Keep the transcript; no summaries | Privacy, cost | **Yes** | Phase 5 |
| ~~D-25~~ | **Closed → OC-61** (no Zoom in the invitation). External invitation content | The email contains the real Zoom join link and no child profile data | Time-limited AA Pro link | M-32 | **Yes** | Phase 6 |
| **D-26** | Rights in uploaded textbooks (partly settled by OC-64: the parent confirms sharing rights; licensing questions remain) | The parent confirms permitted use on upload; only lesson pages are sent to the AI Tutor | No attestation; legal review first | Upload flow, legal exposure | **Yes** | Phase 4 |
| **D-10** | Zoom hosting model | Platform-owned account (Server-to-Server OAuth), verified in a spike first | Teacher-owned accounts | Concurrency, cost | **Yes**, after spike | Phase 6 |
| **D-28** | Data residency, hosting region and retention | Decide before any deployment with real data | — | Provider/region, legal | **Yes** | Pre-production |
| ~~D-35~~ | **Closed → OC-44.** | | | | | |
| **D-01a** | Final AI tutor display name | Keep "AA Pro AI Tutor" / "AI Tutor" | A persona label under AA Pro | Copy only (central config) | **Yes**, non-blocking | None |
| ~~D-42~~ | **Closed → OC-53.** | | | | | |
| ~~D-43~~ | **Closed → OC-54.** | | | | | |
| ~~D-44~~ | **Closed → OC-58.** | | | | | |

## Part D — Actions for you (not decisions)

- **A-01.** Update the project instruction file. The only instruction file is the project-settings text; there is no `CLAUDE.md` (verified 14 Oct 2026). Its current text is preserved verbatim in `claude/Archived_Project_Instructions_v1.md`. The proposed replacement is `claude/Proposed_Project_Instructions_v2.md` (v2.1, with a changes table). You paste the new text into the project settings yourself; I cannot edit them. Until then, this register takes precedence.
- **A-02.** Arrange provider verifications before their phases: Zoom (TV-01/02), email sender domain, WhatsApp (TV-03).
- **A-03.** Enable branch protection on `main` after the bootstrap commit and first CI run (requires repository admin). Step-by-step instructions are in G1-08 §6. The approval rule depends on D-36.
- **A-04.** Share the design canvas with anyone else who should review it. It is private to you until shared from its Share menu.
- **A-05.** Before the first push, add a repository secret named `IDENTIFYING_TERMS` (GitHub → repository → Settings → Secrets and variables → Actions → New repository secret). It holds the identifying demo terms that CI must never find in the repository. This keeps those terms out of Git entirely. The value is given to you in the chat, not in any document. Without the secret, the CI privacy check fails on purpose rather than passing silently.
- **A-06 (optional).** The project root holds stale duplicate copies of several docs (for example a v1.0 G1-04 and older G1-05 copies) next to the current `claude/` versions. The authoritative copies are under `claude/`. You may delete the root duplicates. I will not delete them.
- **A-07 (done 14 Oct 2026).** Create the hosting account, choose its plan and import the repository with the two demo settings. Steps: `docs/deployment/hosted-demo-preview.md`. Then send Claude the web address to check.
- **A-03 (owner, now — OC-69).** Claude's GitHub access cannot change repository rules (the API returns "not permitted through this proxy"). Steps in `docs/phase2/P2-S0_Repository_Security_Review.md` §3.
- **A-10 (done 15 Oct).** Set `AA_SUPERADMIN_EMAIL` on `aa-pro-test`, redeploy, then use `/setup` to create the Super Admin with a password, authenticator app and recovery codes.
- **A-09 (done 15 Oct).** Create the test environment: new Vercel project `aa-pro-test`, Neon database, settings and redeploy, as in `docs/deployment/test-environment.md`. Claude supplies the two secret values in the chat, never in Git.
- **A-08 (waiting: owner's GitHub Pro).** The owner will subscribe to GitHub Pro and make `AA-Learning-Portal` private. **Claude reminds the owner when they say GitHub Pro is active**, then:
  1. guides the owner through Settings → General → Danger Zone → Change visibility → Private (only the owner can do this; Claude's session cannot change repository settings);
  2. checks that the Vercel project still deploys from the private repository (Vercel's GitHub app keeps access to selected repositories);
  3. re-checks that all CI checks still run, including the `IDENTIFYING_TERMS` secret;
  4. offers to remove the 7 protected-term password-list entries from the Git history (OC-56), with a backup first and the owner's go-ahead;
  5. applies branch protection on `main` (A-03), which private repositories need GitHub Pro for;
  6. records the change in this register.

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
| Open, not decided | D-05b, D-10, D-17, D-24, D-25, D-26, D-28, D-01a |
