# AA Pro — Project Status, Architecture and Roadmap

**Version:** 1.0 · 11 Nov 2026 · **Status:** for owner review (Roadmap Phase 0, housekeeping; OC-146).
**Source:** read-only assessment of `main` at `379701a` (Merge PR #134, 31 Oct 2026), reconciled with the decision register G1-05 v1.98.
**Scope:** documentation only. Nothing in the application, database, configuration, hosting or settings was changed to produce this document.

This is the single place that describes **what is actually built today**, how it fits together, what is missing and the proposed order of work. Business rules stay in the decision register (`docs/g1/G1-05_Decision_Register.md`), which remains the authority where the two differ.

> **Two phase numbering schemes.** The *delivery phases* (Phase 0 audit … Phase 8 live readiness) come from the Phase 0 audit and G1-10 and are kept unchanged for history. The forward plan in §8 uses **Roadmap Phases RP-0 … RP-7**. When the owner says "Phase 0" or "Phase 1" from 11 Nov 2026 onwards, it means RP-0 / RP-1.

---

## 1. Architecture overview

```
 Browser: student · parent · teacher · admin · public visitor
                         │
 Vercel ── Next.js 16 App Router (React 19, TypeScript strict)
 │   src/proxy.ts        shared access password on the test site only
 │   src/app/**          pages, server actions and route handlers, one area per role
 │   src/server/**       business logic, raw SQL, authorisation, email, files
 │   src/config/**       demo gate, test-site gate, paid-service guard, brand, menus
 │   src/components/**   shared UI kit (design tokens in src/styles/)
 │
 ├── PostgreSQL 16 (Neon free plan, test data only)
 │     ~50 tables · ~90 plpgsql functions and triggers · file contents in bytea
 └── Resend email API (free plan; the only outbound service call in the code)
```

**Key characteristics**

| Aspect | How it works today | Where |
|---|---|---|
| Application shape | One Next.js application. There is no separate backend service or public REST API. Server logic runs in server components, server actions and a few route handlers (`/files`, `/lessons/[id]/join`, `/teacher-photo`, `/teachers/count`, admin backup). | `src/app`, `src/server` |
| Data access | Raw SQL tagged templates with the `postgres` package (postgres.js). No ORM. One lazy pool per server process (default 5 connections; prepared statements off for pooled Neon hosts). Transactions with `sql.begin`. | `src/server/db/client.ts` |
| Database as second line of defence | Role checks, link rules, the lesson state machine, reply deadlines, overlap prevention (`EXCLUDE USING gist`), the append-only audit log and data clean-up are enforced in triggers and functions, behind the application checks. No row-level security. | `db/migrations/*.sql` |
| Authorisation | Every page calls `requireRole` / `requireAdmin`; unknown or unauthorised records look like "not found". Admin permissions are stored in the database. | `src/server/authz.ts`, `src/server/admin.ts` |
| Three run modes | **Demo** (sample people, no real services; refused if any real-service setting exists), **test environment** (password-protected, real test database), **real**. Enforced at build time. | `next.config.ts`, `src/config/demoGate.ts`, `src/config/testEnv.ts` |
| $0 budget guard | Every paid service is listed with `approvedBy`. A unit test fails CI if a paid SDK or API host appears without a recorded approval. Only Resend is approved (OC-133). | `src/config/paidServices.ts` |
| Migrations | Plain SQL files applied in name order with checksums (`schema_migrations`), one advisory lock, one outer transaction with a savepoint per file. On Vercel they run only on the production build of `main` for the test site (three-layer gate, D3A-19). | `scripts/db-migrate.mjs`, `scripts/migration-gate.mjs`, `scripts/vercel-build.mjs` |
| Background work | No scheduler. Sweeps (lesson expiry, meeting-link purge, material-request close, notifications) run on signed-in page loads at most once a minute; email is dispatched after the response. | `src/server/notifications/sweep.ts`, `src/server/email/schedule.ts` |

## 2. Technology stack

| Layer | Technology (exact versions pinned in `package.json`) |
|---|---|
| Runtime | Node.js 22 (`.nvmrc`), npm 11.20.0; install scripts blocked unless listed in `allowScripts` |
| Frontend | Next.js 16.3.8 (App Router), React 19.3, TypeScript 6 (strict), Tailwind CSS 4 |
| Design system | Tokens in `src/styles/tokens.css` (generated, `npm run tokens:check`), themes in `theme.css` / `public-theme.css`. See `docs/design/Design_Ownership_and_Brand_Guardrails.md` |
| Validation | Zod 4 |
| Database | PostgreSQL 16 via postgres.js 3.4.9; hand-written SQL migrations 0001–0034 |
| Authentication | Custom: Argon2id passwords (`@node-rs/argon2`), server-side sessions with hashed ids, TOTP two-factor codes (`otplib`, `qrcode`), keyed-hash sign-in throttling, common-password list |
| Files | `sharp` (re-encode, strip metadata), `heic-decode` / `libheif-js`, `pdfjs-dist`; file contents stored in Postgres |
| Email | Resend REST API via `fetch` (no SDK) through the `email_outbox` table |
| Tests | Vitest + Testing Library (unit/component), Vitest against a throw-away Postgres (`tests/db`), Playwright demo, hosted-demo and real-account suites, axe-core accessibility checks |
| CI | GitHub Actions: `ci.yml` (lint, typecheck, test, build, hosted-demo, db, e2e-real, e2e) and `repo-hygiene.yml` (privacy-and-brand, secret-scan) |
| Hosting | Vercel (Hobby plan) and Neon Postgres (Free plan) |

## 3. Implementation status (as of `379701a`)

Legend: **Built** = real database logic in real mode · **Partial** = built with a stated limitation · **Sample only** = uses sample data even for real accounts · **Placeholder** = page exists, function not built · **Not built**.

| Area | Status | Notes / evidence |
|---|---|---|
| Design system and role shells, light and dark themes | Built | Phase 1 (P1-02); later restyle DV-92 |
| Public homepage, teacher directory and profiles, teacher terms | Built | `/`, `/teachers`, `/teachers/[publicId]`, `/teacher-terms` |
| Accounts: parent/teacher sign-up, email confirmation, sign-in, password reset | Built | `src/server/auth/*` |
| Child accounts with username and three-word passwords | Built | `/sign-in/child`, OC-35 |
| Super Admin set-up, MFA, recovery codes | Built | `/setup`, `/security-check`, OC-50 |
| Admin: accounts, admins, approvals, audit log, security, storage, verification, pricing migration, rate proposals | Built | `src/app/admin/*` |
| Guardian links, teacher–child links and requests (CR-12 point 1) | Built | 0002, 0004, 0020 |
| Parent restrictions page | Placeholder | `/parent/children/[childId]/restrictions` (D-05b open) |
| Teacher profile, photo, listings, packages, "AA Pro Verified", search (CR-15 Phase A) | Built | 0007–0013, 0022–0025 |
| Enquiries and rate negotiation (CR-13) | Built | Agreed rates are information only; no payment |
| Human-teacher lessons: availability, booking requests, teacher proposals, kept lessons, lesson chapters, material requests (CR-17 / Phase 3A) | Built | 0029, 0031–0034; PRs #122, #125, #129, #130, #133, #134, #137 |
| Zoom meeting links | Partial | Teacher pastes their own Zoom link; parent permission per teacher and child; Join redirect inside the join window; links purged 7 days after the lesson. No Zoom API (0030, OC-123) |
| In-lesson reminders | Partial | Best-effort, in-app only (CR-17 PR 7, D3A-10) |
| Teacher resources, worksheets, homework assign/answer/mark/release (CR-07) | Built | 0019, 0027 |
| Parents' books and reader (whole PDF, page-range chapters, page photos, HEIC) | Built | 0028 |
| In-app notifications and badges (CR-16) | Built | 0026; AC-75 deferred to PL-01 |
| Email | Partial | Resend wired; only the Super Admin address receives real mail (OC-142); others use `/dev/mailbox` on the test site |
| File uploads, quotas and storage meter | Built | In Postgres; uploads stop at 90% of the 1 GB allowance (OC-96) |
| AI Tutor session rules and allowance | Partial | Server-side allowance (one 15-minute session per rolling 24 hours, OC-89) and a provider-independent controller with a fake provider. **No provider, no classroom page** |
| Student AI booking (`/student/book`) | Sample only | Banner "Nothing is really booked" |
| Student history (`/student/history`) | Sample only | Real students see an empty list (D-24 open) |
| Parent "Schedule an AI class" (`/parent/book-ai`), parent history (`/parent/history`) | Placeholder | `rolePlaceholder` |
| Whiteboard and lesson notes (CR-09), lesson review/recording (CR-10), grammar and dictionary (CR-11) | Not built | Specifications only |
| Payments and subscriptions | Not built | Out of scope (OC-03); future direction recorded in OC-143 |
| Google services (Calendar, Drive, Classroom, Google sign-in) | Not built | Google Classroom out of scope (OC-03). Fonts are self-hosted |
| WhatsApp / SMS | Not built | PL-04 |
| Error monitoring, analytics, structured logging | Not built | `console.error` only |

**Database tables by domain (0001–0034):** identity and auth (`accounts`, `sessions`, `one_time_tokens`, `sign_in_throttle`, `mfa_factors`, `recovery_codes`, `consents`, `rate_events`); family (`student_profiles`, `guardian_links`); teachers and marketplace (`teacher_profiles`, `teacher_photos`, `teacher_usual_times`, `teacher_student_links`, `teacher_listings`, `listing_prices`, `pending_connects`, `teacher_enquiries`, `rate_negotiations`, `rate_offers`, `learning_packages`, `pricing_migration_log`, `teacher_verification_requests`, `teacher_verification_decisions`); lessons (`lessons` including proposals, `meeting_link_permissions`, `lesson_meeting_links`, `lessons_kept`, `lesson_chapters`, `material_requests`); content and homework (`teacher_resources`, `resource_shares`, `worksheets`, `worksheet_questions`, `assignments`, `assignment_resources`, `questions`, `assignment_targets`, `answers`, `assignment_events`, `books`, `book_children`, `book_chapters`, `book_chapter_files`); files (`stored_files`, `upload_parts`, `platform_settings`); messaging (`notifications`, `notification_throttles`, `email_outbox`); AI (`ai_sessions`); admin (`admin_permissions`, `audit_events`); bookkeeping (`schema_migrations`). `db/README.md` describes the earlier groups in more detail.

## 4. Environments and hosting

| Environment | Where | Data | Notes |
|---|---|---|---|
| Local | Developer machine | Throw-away local Postgres or demo mode | See §7 |
| CI | GitHub Actions | Throw-away Postgres 16 service per run | Evidence of record for every pull request |
| Sample-data preview | Vercel project `aa-learning-portal` | Built-in sample people only | `AA_DEMO_MODE=true`, `AA_HOSTED_DEMO=true` (OC-34); `docs/deployment/hosted-demo-preview.md` |
| Test environment | Vercel project `aa-pro-test`, `test.aaprolearn.com`, Neon Free (Singapore) | Test data only | Shared access password; migrations on the `main` production build only (D3A-19); previews get no database; `docs/deployment/test-environment.md` |
| Launch page | Vercel project `aa-pro-launch` (Root Directory `launch/`), `www.aaprolearn.com` | None | Static "Launching Soon" page (OC-135, OC-137) |
| Production | Not created | — | Needs D-28, PL-02 and the owner's explicit go-live approval |

The applied migration state of the hosted test database was not checked for this document (no database access was used).

## 5. Integrations

| Integration | State |
|---|---|
| Authentication | Custom, built in; no third-party identity provider |
| Email (Resend) | Built; free plan; recipient allow-list (OC-133, OC-139 to OC-142) |
| Zoom | Teacher-pasted links only; `ZOOM_*` settings are names only; D-10 and PL-03 open |
| AI providers | None integrated. Research in `docs/ai-teacher/`: no provider is cleared for children (R-AI-1); legal checklist L-1 to L-10 open |
| Object storage | None; `STORAGE_*` settings are names only (OC-87, OC-96) |
| Google services | None |
| Payments | None (OC-03, OC-79, OC-143) |
| WhatsApp / SMS | None |

## 6. Gaps, technical debt and risks

### 6.1 Owner decisions that block work
- **D-28** data residency, hosting region and retention: blocks any real child data.
- **AI provider eligibility for children** (R-AI-1, OD-1 to OD-12, legal checklist L-1 to L-10) and a test budget (OD-10).
- **PL-03 / D-10** Zoom for under-16s and the Zoom hosting model.
- **PL-02** hosting plan for commercial use (Vercel Hobby is non-commercial only).
- **PL-04** notification channels for launch; **PL-05** reliable scheduled 12-month homework deletion.
- Business rules **D-05b**, **D-45**, **D-17**, **D-24**, **D-26**, **OD-B**; new **D-46** (commercial model detail, future phase).

### 6.2 Technical debt and risks (no change made; for planning)

| # | Item | Risk | Suggested direction (needs approval) |
|---|---|---|---|
| T-1 | File contents in Postgres (up to 20 MB each; 200 MB per account; 1 GB allowance) and one global upload lock | Allowance exhausted by a few families; backups grow; uploads serialised | Object store behind the existing `FileBodies` interface (budget approval) |
| T-2 | No scheduler | Expiry, purges, reminders and PL-05 deletion depend on site traffic | Approved scheduler (PL-05) |
| T-3 | Migrations run in one outer transaction; constraints widened by drop and re-add | Long locks on a live production database; `CONCURRENTLY` impossible | Revisit runner and use `NOT VALID` + `VALIDATE` before production |
| T-4 | Rollback scripts only for 0027–0033 | Recovery relies on database restore points | Keep forward-fix policy; document restore procedure |
| T-5 | No `statement_timeout` / `lock_timeout` | A stuck lock can hold requests until the function timeout | Set conservative timeouts |
| T-6 | No Content-Security-Policy or HSTS on the application (the launch page has both) | Weaker browser-side protection | Add headers in RP-1 |
| T-7 | No error monitoring or structured logging | Production faults invisible | Free or approved monitoring |
| T-8 | `Asia/Kolkata` hard-coded in 18 places outside tests; email templates ignore the recipient's time zone | Wrong times for users elsewhere (R-07) | Use each recipient's IANA zone |
| T-9 | Large modules (`src/server/lessons.ts` 1,683 lines, `teacherLinks.ts` 1,271, `assignments.ts` 1,155) and a repeated page guard block | Review and change cost | Incremental extraction, no behaviour change |
| T-10 | Large plpgsql trigger functions replaced across migrations | Hard to review | Keep byte-for-byte tests; document current function owners |
| T-11 | Sample-only screens reachable by real students (`/student/book`, `/student/history`) | Confusing for testers | Clearly labelled today; replace when AI booking is built |
| T-12 | Public repository (kept public for free CI, E-1; A-08 pending) | Code visibility for a children's product | Owner decision A-08 |
| T-13 | `accounts.time_zone` length-checked only, not validated as an IANA zone | Invalid zone fails inside lesson triggers | Validate in application and database |

### 6.3 Documentation drift corrected in RP-0
See `docs/status/RP-0_Housekeeping_Report.md`.

## 7. Development setup

### 7.1 Local
1. Node.js 22 and npm 11.20.0; Docker or a local PostgreSQL 16.
2. `npx -y npm@11.20.0 ci` installs exactly what the lockfile pins.
3. Start a throw-away database, for example `docker run -d --name aapro-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:16`.
4. Copy `.env.example` to `.env.local` (never committed) and set `DATABASE_URL` (local throw-away database), `AUTH_SECRET` (32+ random characters), `AA_DEV_MAILBOX=true` and `AA_SUPERADMIN_EMAIL` (an `example.com` address).
5. `npm run db:migrate`, then `npm run dev` and open http://localhost:3000. Use `/setup`, then the link in `/dev/mailbox`, to create the local Super Admin.
6. **Without a database:** set only `AA_DEMO_MODE=true` (no `DATABASE_URL` or `AUTH_SECRET`) to use the sample accounts.
7. Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`, `npm run test:e2e`, `npm run test:e2e:real`, `npm run build`, `npm run hygiene` (needs `--terms-file` locally).

### 7.2 Cloud (current)
Keep the three Vercel projects in §4. Work goes through feature branches and pull requests; CI is the evidence of record; migrations reach the test database only through the gated `main` build after written approval.

### 7.3 Production (proposed, each item needs written approval under OC-91)
A separate production project and database in the region decided by D-28, with new secrets; a commercial hosting plan (PL-02); object storage (T-1); a scheduler (PL-05, T-2); error monitoring (T-7); CSP and HSTS (T-6); database timeouts (T-5); a private repository with branch protection (A-08, A-03).

## 8. Roadmap (Roadmap Phases)

Each phase starts only after the owner's explicit approval. Phases build on the existing implementation; nothing is rebuilt.

| Phase | Scope | Gate | Status |
|---|---|---|---|
| **RP-0 Housekeeping** | Documentation reflects the real implementation, decisions and ownership; no code changes | OC-146 | **Done on branch, awaiting owner review** |
| **RP-1 Hardening** | CSP and HSTS headers; database timeouts; structured logging; recipient time zones in email; shared page-guard helper; module extraction without behaviour change; upload clean-up index; PL-01 review | Owner approval; ₹0 | Not started |
| **RP-2 Complete Phase 3A** | Parent restrictions page; D-45 and OD-B rules; trial lesson (CR-12 point 2); real student history; student-page design refresh (gap report priority 1) | D-45, OD-B, D-05b, D-24 | Not started |
| **RP-3 AI Teacher proof of concept** | Provider adapter behind `TutorProvider`; AI booking for parent and student; classroom page with push-to-talk and hard cost caps; adults and synthetic data only | Provider choice, R-AI-1, L-1 to L-10, OD-10 budget | Blocked — owner decisions |
| **RP-4 Library and lesson tools** | Whiteboard and lesson notes (CR-09); grammar and dictionary (CR-11); D-17 library state | Design boards (e.g. EG0–EG5) | Not started |
| **RP-5 Launch services** | Object storage; scheduler (PL-05); email for real users and WhatsApp decision (PL-04); Zoom approach for children (PL-03, D-10) | Budget approvals; adviser review | Blocked — budget |
| **RP-6 Commercial model** | Academy subscriptions and payments as recorded in OC-143 (first two chapters free; quarterly, half-yearly and yearly plans) | Separate business decision and change request; D-46 | **Deferred by owner (OC-143)** |
| **RP-7 Production readiness** | D-28 residency; production environment; secret rotation; private repository; monitoring; security review; go-live | D-28, PL-02, explicit go-live approval | Not started |

## 9. Future commercial direction (recorded, not in scope)

Per OC-143, the long-term direction is an **Academy subscription model**: the first two chapters free, then quarterly, half-yearly or yearly subscription options. OC-03 (payments out of the initial release) and OC-79 (survey question only) stay in force. No payment, subscription, pricing or entitlement functionality is designed or built until a separate business decision and approval. Open questions are tracked as D-46 in the decision register.
