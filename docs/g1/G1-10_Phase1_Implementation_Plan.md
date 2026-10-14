# AA Pro — G1-10 Phase 1 Implementation Plan: Design System and Role-Separated UI Shell

**Version:** 1.0 · 14 Oct 2026 · **Status: PLAN FOR APPROVAL — not started.**
- No application code has been written. No dependency has been installed and nothing has been committed.
- Phase 1 begins only after your explicit "begin Phase 1" and once the gates in §9 are clear.

**Baseline:** FRD v1.1; decision register G1-05 v1.5; traceability G1-02; canonical screens G1-01; design changes G1-04.

**Design-approval rule (D-32).** Only boards you have explicitly approved are design references. **Today 0 of 52 boards are approved.** Every work package below names the boards it needs, and it stays **blocked** until those boards are approved. Approving this plan does **not** approve any board.

---

## 1. Phase 1 goal

Produce a running, accessible, responsive web front end that:
- implements the AA Pro design system;
- provides one **separate shell per role** (Student, Parent, Teacher, Super Admin), each with its own navigation;
- uses **synthetic data only**;
- connects the principal navigation flows;
- shows the common loading, empty, error, success, offline and access-denied states.

## 2. Scope

| In Phase 1 | Not in Phase 1 (later phase) |
|---|---|
| Design tokens from the DESIGN.md front-matter, plus the corrections on the Tokens board (focus ring, `#707881` control borders, minimum text sizes) | Real authentication, sessions, MFA, password storage (Phase 2; D-23a, D-37, D-11b) |
| Central brand configuration ("AA Pro", "AA Pro AI Tutor" / "AI Tutor"); interim text wordmark (OC-01, OC-11) | Database and persisted data (Phase 2+) |
| Shared components (§6) with keyboard, focus and screen-reader behaviour | Booking rules, slot engine, conflict checks (Phase 3; D-05, D-07, D-08, D-15) |
| Four role shells and their dashboards, on desktop and phone | Uploads and library storage (Phase 4; D-16, D-17, D-26) |
| Development-only demo sign-in to reach each shell (D-39) | AI classroom and ElevenLabs (Phase 5) |
| Synthetic fixtures (G1-04 §4) and time display in each user's IANA timezone (FR-019) | Zoom (Phase 6; D-10, D-35), email and WhatsApp (Phase 7; D-22, D-25) |
| Route-level role guard on the server, using the demo session | Any hosted deployment (D-40) |
| Lint, type-check, unit, end-to-end and accessibility tests in CI | Super Admin actions beyond viewing shells (Phase 8) |

**Undecided rules stay visibly pending** in the UI, exactly as on the boards. Phase 1 does not show:
- a join-window time (D-35);
- cancellation cut-offs (D-07);
- daily limits or lead times (D-05).

**One inconsistency to correct.** G1-04 §4 says demo Join shows "Available 10 minutes before start". That presumes D-35, which is still open. Phase 1 will show "Join opens before start" with no figure. I will align G1-04 in the next documentation PR.

## 3. Minimum board approvals needed to start, and approval order

| Priority | Boards (numbers from G1-09 §1) | Why |
|---|---|---|
| **1. Needed to start** | **2** Tokens · **9, 10** Common states · **5, 6** S1/S9 Student dashboard | The design system, the shared states and the first shell |
| 2 | **11, 45** M-01 sign-in · **12, 13** M-02 child sign-in | The look of the demo sign-in (D-39). Their real behaviour comes in Phase 2. |
| 3 | **37** M-26/35 Super Admin home · **38, 52** M-27 accounts list | Super Admin shell |
| 4 | New S19 and S21 adaptation boards (D-38 option A) · **17, 46** M-07 children list | Parent and Teacher shells |
| 5 (optional in Phase 1) | **7, 8** S13 booking wizard · **28, 49** M-17 outcomes · **26, 27** M-16 history | Navigation-complete flows with fixture data only, no booking logic |

Boards 1, 3 and 4 are review aids; approving them is not required. Boards for later phases (M-03…M-34 except those above) can be approved whenever you are ready.

## 4. Work packages

Each package is one pull request. Each PR has its own milestone report (§8) and needs your approval to merge.

| WP | Deliverable | Needs boards | Needs decisions | FRD / decision mapping | Acceptance criteria |
|---|---|---|---|---|---|
| **WP-0** Foundation | App scaffold (Next.js App Router, TypeScript strict); lint, format, test and CI jobs added to the bootstrap workflow; brand config; folder structure per G1-06 §4; `.nvmrc` | none (no visual design) | D-41 | NFR-12, OC-01, OC-08/09 | `lint`, `typecheck`, `test`, `build` and the hygiene jobs all pass in CI. No brand string outside the brand config. No external service called. |
| **WP-1** Design tokens and type | `tokens.css` and Tailwind theme generated from the DESIGN.md front-matter by a script, with a test that fails if they drift. Tokens-board corrections applied and logged as deviations. Outfit / Plus Jakarta Sans. | **2** | — | NFR-09 (AX-01…AX-04, AX-08), G1-04 §2–3 | Every colour pair used for text is ≥ 4.5:1, or ≥ 3:1 for large text and UI parts (automated). Focus ring visible on every interactive component. Minimum text 12 px. |
| **WP-2** Core components | CMP-Brand, Button (primary, secondary, danger, disabled), StatusChip (text plus icon, never colour alone), Card, Field/Input, ConfirmDialog (focus trap and return), TimeDisplay (IANA), SubjectCard, SessionCard (AI vs Teacher chips), JoinButton (disabled "opens before start" state only), ResultState, EmptyState, ErrorState, OfflineBanner, AccessDenied | **2, 9, 10** | — | FR-019, FR-009.2 (visual), NFR-09, R-06 | Each component has unit tests and an axe check (0 serious or critical issues). Keyboard operable. Targets ≥ 48 px, and 56 px for primary child actions. |
| **WP-3** Demo access and role guard | Development-only demo sign-in pages styled from M-01/M-02. A server-side demo session sets a synthetic persona. `requireRole()` runs on every role route group. There is no role switcher. | **11, 45, 12, 13** | **D-39** | FR-002.1, FR-002.2 (route level), R-01, OC-23 (copy only) | A student persona gets the access-denied state on parent, teacher and admin routes, and the same holds for each role (E2E). A production build fails if `AA_DEMO_MODE` is set. No password is stored or checked. |
| **WP-4** Student shell | Top nav (desktop) and bottom nav with AI button (phone). Dashboard per S1/S9. Subjects from fixtures (IT off for Kiran, as on the boards). No gamification. | **5, 6** | — | FR-002.1, FR-003.2, FR-008.2, OC-12, OC-14, R-02 | No control to book, cancel or reschedule a human meeting exists in the student shell (E2E text and role scan). Layout passes at 375, 768 and 1280 px with no horizontal scroll. |
| **WP-5** Super Admin shell | Sidebar shell (CMP-ShellAdult admin menu). Counts-only home. Read-only accounts list from fixtures. No Integration Health. No sign-in-as-user. No child content. | **37, 38, 52** | — | FR-017.1 (view only), OC-19, OC-21 | The admin menu has no Integration Health and no impersonation entry (test). No child learning content reachable from admin routes (E2E). |
| **WP-6** Parent shell | Sidebar shell (parent menu). Dashboard per the approved S19 adaptation. Children list (M-07). | S19 board (D-38) · **17, 46** | **D-38** | FR-002.1, FR-003.1 (view), FR-007.1 entry point | Parent sees only the synthetic children linked to the demo parent. Sibling switching exists only here (R-02). |
| **WP-7** Teacher shell | Sidebar shell (teacher menu). Dashboard per the approved S21 adaptation. No static Zoom room or passcode. 40-minute sessions shown. | S21 board (D-38) | **D-38** | FR-002.1, FR-004.1 (status view), FR-009.1, R-06 | No meeting ID, link or passcode is rendered anywhere (test). |
| **WP-8** (optional) Navigation-complete flows | S13 booking wizard UI and M-17 outcome states with fixtures; M-16 history. **No booking is made or validated.** | **7, 8, 28, 49, 26, 27** | — | FR-006.1 (UI only), OC-22 (15/30 min, one at a time shown), FR-016.1 (view) | Wizard offers only 15 and 30 minutes. Undecided limits are shown as pending. A banner says "Demo — nothing is booked". |
| **WP-9** Phase 1 verification | Full accessibility pass: axe on every page, manual keyboard check of each shell, screen-reader spot check. Responsive and visual review against the approved boards. Milestone report. | all approved boards used | — | NFR-03, NFR-09 | 0 serious or critical axe issues. The keyboard walk-through is recorded. Every deviation from an approved board is logged with its reason. |

## 5. Technology baseline (D-41) — candidates checked on the npm registry on 14 Oct 2026

| Package | Latest found | Released | Proposed handling |
|---|---|---|---|
| next | 16.4.0 | 6 Oct 2026 | Use the newest 16.x that is at least 14 days old at install time |
| react / react-dom | 19.3.0 | 9 Sep 2026 | Pin exact |
| typescript | 7.0.2 | 8 Jul 2026 | **Compatibility spike first.** Use 7.0.x only if Next.js type-checking and ESLint work with it; otherwise use the newest 6.0.x (6.0.3, 16 Apr 2026) |
| tailwindcss / @tailwindcss/postcss | 4.3.3 | 16 Jul 2026 | Pin exact. Tokens as CSS variables. The Stitch files use the Tailwind CDN with an inline config; the token values are ported, not the CDN set-up. |
| vitest | 5.0.4 | 12 Oct 2026 | Too new (under 14 days). Use the newest release at least 14 days old. |
| @playwright/test / @axe-core/playwright | 1.64.0 / 4.13.0 | 7 Oct / 9 Oct 2026 | Use the pre-installed Chromium. Pin the version that matches it. |
| eslint / eslint-config-next | 10.12.0 / 16.4.0 | 2 Oct / 6 Oct 2026 | Match the chosen Next.js minor |
| Node.js | 22 LTS | — | `.nvmrc` = 22. Next.js requires ≥ 20.9. |

Rules for versions:
- exact versions with a committed lockfile;
- no `latest` or caret ranges for runtime dependencies;
- every new dependency is justified in its PR;
- `npm audit` results are reported;
- no package from or related to any other project of yours.

No database, auth provider, analytics, fonts-as-a-service beyond Google Fonts, or external API in Phase 1.

## 6. Architecture for Phase 1 (follows G1-06 §4, approved as OC-16)

```
src/
  app/
    (auth)/        demo sign-in pages (development only, D-39)
    (student)/     student layout + routes      ── requireRole('student')
    (parent)/      parent layout + routes       ── requireRole('parent')
    (teacher)/     teacher layout + routes      ── requireRole('teacher')
    (admin)/       super-admin layout + routes  ── requireRole('superadmin')
  components/      CMP-* (G1-02 Appendix A)
  config/brand.ts  the only place brand strings live
  styles/          tokens.css (generated from DESIGN.md front-matter) + globals
  server/          session.ts (demo source now; real auth replaces it in Phase 2), authz.ts (requireRole)
  fixtures/        synthetic data only (G1-04 §4)
tests/             unit, e2e, a11y
```

- **Role guard.** `requireRole` is written as the server-side check that Phase 2 keeps. Only the session source changes in Phase 2, so the guard is not rewritten.
- **Demo mode safety (D-39).** The demo sign-in exists only when `AA_DEMO_MODE=true` and `NODE_ENV !== 'production'`. `next.config` throws during a production build if the flag is set. The demo cookie is HttpOnly and SameSite=Lax, and holds only a persona ID such as `demo-student-kiran`.
- **No role switcher.** To change role you sign out and sign in again (R-01).

## 7. Synthetic data (OC-04, G1-04 §4)

- **People:** Demo Parent (`parent@example.com`); Kiran (Grade 5) and Meera (Grade 4); Teacher A. Rao (Science, `Asia/Singapore` for FR-019 testing), Teacher B. Iyer (Maths), Teacher C. Das (Social Studies); Demo Admin (`admin@example.com`).
- **School:** Sample Primary School.
- **Never in fixtures:** meeting IDs, links, phone numbers, photos or real titles.
- **Enforcement:** the repository-hygiene CI job checks every file for the identifying terms (secret `IDENTIFYING_TERMS`).

## 8. Testing, CI and reporting

CI jobs, each a required status check once branch protection is on (A-03):
- `privacy-and-brand` and `secret-scan` (from bootstrap);
- `lint`, `typecheck`, `test` (Vitest), `e2e` (Playwright with axe);
- `build`.

Each WP report gives:
- features;
- files changed;
- deviations from approved boards;
- commands run, with **actual** output summaries;
- known limitations;
- security notes.

Every item is labelled **planned / implemented / tested**. Nothing in Phase 1 is "externally verified", because no external service is used.

Visual comparison: approved boards are viewed in the design canvas, which this session cannot render to images. Comparison is by side-by-side screenshots (375, 768, 1280 px) attached to each PR, reviewed by you.

## 9. Gates before Phase 1 can start

1. **D-34:** you approve the exact bootstrap package (G1-09 §3), A-05 secret added, the commit is pushed and CI is green. **A-03** branch protection is recommended before the first Phase 1 PR.
2. **D-38, D-39, D-40, D-41** decided.
3. **Priority-1 boards approved:** 2, 5, 6, 9, 10. Further WPs wait for their own boards.
4. Your explicit instruction: **"begin Phase 1"**.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Very recent major versions (TypeScript 7, ESLint 10, Vitest 5) may not work together with Next.js 16 | Spike in WP-0; 14-day minimum age; fall back to the previous major; report findings before continuing |
| Demo sign-in leaking into a deployed build | Build-time guard and test; no deployment in Phase 1 (D-40) |
| Board approvals arrive piecemeal, stalling WPs | WPs are ordered so each depends only on its own boards; WP-0 needs none |
| Boards were never visually rendered by me (round 2 and 3 checks were source-level) | You review them in the canvas. Phase 1 PR screenshots give the first rendered comparison. |
| Tailwind v4 differs from the Stitch CDN set-up | Port the token values, not the configuration; token drift test |
| Accidental decision of an open business rule in UI copy | PR checklist item; pending notes kept verbatim from the boards |
