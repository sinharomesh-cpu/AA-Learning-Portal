# AA Pro

AA Pro is a private learning portal for children, their parents, approved teachers and platform administrators. It brings together:
- AI Tutor lessons booked by the student or the parent;
- human-teacher meetings booked by the parent;
- the family's learning resources.

## Status

**Built and running on a password-protected test site with test data only; not launched.** Summary on 11 Nov 2026 (full detail: `docs/status/AA_Pro_Project_Status_and_Roadmap.md`):
- Real accounts for parents, children, teachers and the Super Admin (custom sign-in, MFA for admins); PostgreSQL 16 with migrations 0001–0034.
- Teacher marketplace (profiles, listings, packages, verification, enquiries, rate negotiation; no payments), human-teacher lesson booking and proposals, teacher-pasted Zoom links with parent permission, homework, parents' books and in-app notifications.
- AI Tutor: session rules only; no AI provider is integrated yet. Email: Resend free plan, Super Admin address only.
- Environments: sample-data preview, password-protected test site (`aa-pro-test`) and the static "Launching Soon" page. No production deployment.
- Forward plan: Roadmap Phases RP-0 … RP-7. RP-0 (documentation housekeeping) is the current step.

## Architecture in brief

- One Next.js 16 application (App Router, React 19, TypeScript): pages, server actions and route handlers in `src/app`; business logic and raw SQL in `src/server`.
- PostgreSQL 16 through the `postgres` package (no ORM). Plain SQL migrations in `db/migrations`; the database also enforces role and lesson rules with triggers (`db/README.md`).
- Demo, test-environment and real modes are enforced at build time (`src/config/demoGate.ts`, `src/config/testEnv.ts`). Paid services are blocked by a CI guard (`src/config/paidServices.ts`; budget $0 under OC-91).
- Hosting: Vercel (Hobby) and Neon Postgres (Free), test data only.

## Local development

Requirements: Node.js 22 (see `.nvmrc`), npm 11.20.0 (`packageManager` in `package.json`) and, for real accounts, a throw-away PostgreSQL 16.

```bash
npx -y npm@11.20.0 ci        # install exactly what the lockfile pins
npm run dev                  # http://localhost:3000
npm run lint                 # ESLint (no warnings allowed)
npm run typecheck            # route types + TypeScript strict
npm test                     # unit and component tests (Vitest)
npm run test:e2e             # end-to-end and accessibility tests, sample data (Playwright + axe)
npm run build                # production build
```

**Sample data only:** put `AA_DEMO_MODE=true` in `.env.local` and leave the database and secret settings empty.

**Real accounts against a local database:**

```bash
docker run -d --name aapro-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:16
# .env.local (never committed): DATABASE_URL (the local throw-away database),
#   AUTH_SECRET (32+ random characters), AA_DEV_MAILBOX=true, AA_SUPERADMIN_EMAIL (an example.com address)
npm run db:migrate           # apply db/migrations to the local database
npm run dev                  # then open /setup and use the set-up link in /dev/mailbox
npm run test:db              # database integration tests (throw-away database per run)
npm run test:e2e:real        # real-account end-to-end tests
```

In this workspace the pre-installed Chromium is used for end-to-end tests: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e`.

Hosted environments and their safety rules: `docs/deployment/hosted-demo-preview.md` and `docs/deployment/test-environment.md`.

## Where to start

| Document | Purpose |
|---|---|
| `docs/status/AA_Pro_Project_Status_and_Roadmap.md` | **Current state:** architecture, what is built, gaps, environments and roadmap |
| `docs/requirements/AA_Pro_FRD_v1.1.pdf` | Functional requirements, the baseline |
| `docs/g1/G1-05_Decision_Register.md` | Owner decisions and the decisions still open |
| `docs/g1/G1-02_Requirements_Traceability_Matrix.md` | Requirement → screen → test mapping |
| `docs/g1/G1-01_Canonical_Screen_Inventory.md` | Which design reference is used for each screen |
| `docs/design/missing-screens.md` | Design canvas link and the per-screen approval record |
| `docs/design/Design_Ownership_and_Brand_Guardrails.md` | Design ownership, brand identity and design-change rules |
| `design-reference/README.md` | What the design references are, and what is excluded |
| `docs/README.md` | Full documentation index |

## Rules for everyone working here

- **No secrets in Git.**
  - Never commit `.env` files, API keys, tokens, passwords or credentials.
  - `.env.example` lists variable names only.
- **No real personal data.**
  - Demo and test data are synthetic.
  - Never commit real children's names, school names, contact details, meeting links, recordings or uploaded learning material.
- **Approval gates.**
  - No commit to `main`, deployment, production connection or infrastructure change without the owner's explicit approval for that step.
  - Work goes through feature branches and pull requests.
- **Design references are read-only.**
  - The files in `design-reference/stitch-selected/` are redacted derivatives kept for reference.
  - They are not production code and are not edited.
- **Design ownership (RPD-3).**
  - Google Stitch was used only for the initial design and is not an ongoing design dependency.
  - Claude owns ongoing UI/UX design and frontend implementation; the owner approves designs and decisions.
  - The brand identity and design tokens are preserved unless the owner approves a change (RPD-2): Outfit headings, Plus Jakarta Sans portal body text, Inter on public pages, primary colour `#006194`.
- **Commercial scope (OC-03, RPD-1).** No payments or subscriptions are built in the current scope. The future Academy subscription direction is recorded in the decision register only.
- **CI must pass.** Every push and pull request runs `.github/workflows/repo-hygiene.yml` (identifying data, brand strings, forbidden files, secret scan) and `.github/workflows/ci.yml` (lint, type-check, unit tests, build, end-to-end and accessibility tests).
- **Dependencies** are pinned to exact versions, released at least 14 days before adoption (OC-29). Install scripts are blocked unless listed in `allowScripts`.
