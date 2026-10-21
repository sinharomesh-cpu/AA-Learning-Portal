# AA Pro — Hosted test environment (OC-57)

**Approved:** owner, 15 Oct 2026, 08:19 IST ("Yes, please proceed with small test database for testing").
**Purpose:** let the owner try real accounts (sign-up, email confirmation, sign-in, password reset, and later
children, teachers and admins) online, with **test data only**.

## How it is set up

| | Sample-data preview (existing) | Test environment (new) |
|---|---|---|
| Vercel project | `aa-learning-portal` | `aa-pro-test` (a second import of the same repository) |
| Data | Built-in sample people | Its own Neon Postgres database, test data only |
| Access | Anyone with the link | Password-protected (browser sign-in box) |
| Emails | None | Not sent; shown in the test mailbox at `/dev/mailbox` |
| Updates | Every merge to `main` | Every merge to `main`; database changes (migrations) applied during the **main** build only, after the owner has approved each migration (D3A-19, OC-125) |

Safety rules, enforced in code (`src/config/testEnv.ts`, `src/proxy.ts`, `next.config.ts`):
- `AA_TEST_ENVIRONMENT=true` without `AA_TEST_ACCESS_PASSWORD` (16+ characters) refuses to build.
- It cannot be combined with demo mode.
- Every page needs the access password (user `aapro`), shows a "Test environment — test data only" banner and
  tells search engines not to list it.
- The test mailbox works only in development or in this password-protected environment, never on a real site.

## Settings for `aa-pro-test` (Environment Variables, all environments)

| Name | Value |
|---|---|
| `AA_TEST_ENVIRONMENT` | `true` |
| `AA_TEST_ACCESS_PASSWORD` | given to the owner in the chat (not stored in Git) |
| `AUTH_SECRET` | given to the owner in the chat (not stored in Git) |
| `AA_DEV_MAILBOX` | `true` |
| `AA_SUPERADMIN_EMAIL` | the owner's own email address (A-10); turns on the one-off `/setup` page until the Super Admin has a password |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | added automatically when the Neon database is connected |

Do **not** add `AA_DEMO_MODE` or `AA_HOSTED_DEMO` to this project.

## Owner steps (A-09)

1. **New project.** Vercel → **Add New… → Project** → find **AA-Learning-Portal** → **Import**.
   Change **Project Name** to `aa-pro-test`. Open **Environment Variables** and add the four rows above.
   Click **Deploy** (the first build works without a database; sign-in says it is not available yet).
2. **Database.** In the `aa-pro-test` project: **Storage → Create Database → Neon** → choose the region closest
   to India that is offered (Mumbai if listed, otherwise Singapore) → **Free** plan → name `aa-pro-test-db` →
   **Create**. Then **Connect Project** → `aa-pro-test`, tick **Production** and **Preview**, leave
   preview branching off → **Connect**. *(Changed 21 Oct 2026, D3A-19: Preview is now unticked; see
   "Preview deployments and the database" below.)*
3. **Redeploy.** `aa-pro-test` → **Deployments** → the latest one → **⋯ → Redeploy**. The build sets up the
   database tables.
4. Send Claude the `aa-pro-test` web address. Open it; the browser asks for a user name (`aapro`) and the
   access password.

## Preview deployments and the database (D3A-19, OC-125, 21 Oct 2026)

Until 21 Oct 2026 every preview build of a pushed branch was connected to the same test database and applied
any new migration before review or merge (migrations 0004–0026 all first arrived that way; the main build of
212f80f confirmed the database matches `main` exactly). Three layers now stop that:

1. **Build script** (`scripts/migration-gate.mjs`, used by `scripts/vercel-build.mjs`): migrations run only when
   `VERCEL=1`, `VERCEL_ENV=production` and `VERCEL_GIT_COMMIT_REF=main`. Every other build logs why it skipped
   and never opens a database connection to migrate. Tested in `tests/unit/migrationGate.test.ts` and
   `tests/db/migrationGate.test.ts`.
2. **Owner setting:** the Neon connection for `aa-pro-test` is limited to **Production**; previews get no database
   variables at all.
3. **Process:** a branch containing a migration is pushed only after the owner has approved that migration in
   writing.

**What this changes for previews.** Preview deployments of `aa-pro-test` still build, but without a database:
pages that need accounts or data (sign-in, dashboards, teacher pages, admin) show the app's "not available"
or error state there. Public pages that need no data still render. This is expected, and it means unmerged code
can neither change the schema nor read or write test data.

**Safe ways to test before merge (all ₹0):**
- **CI (every pull request):** the `db`, `e2e` and `e2e-real` jobs run every test against a throw-away Postgres
  created inside the CI run and discarded afterwards. This is the evidence of record.
- **Local run:** a throw-away local database (`npm run db:migrate` against a local Postgres, then `npm run dev`),
  with invented accounts only.
- **Screenshots and browser evidence** from those runs, attached to the pull request report for review.
- **After merge:** the test site itself, once the main build has applied any approved migration.
- *Not used without separate approval:* a dedicated Neon branch for previews. It would cost nothing within the
  free plan's 10 branches, but it is a second database to keep in step and would need its own decision.

## Data and region

Test data only. D-28 (where real data is stored, and for how long) is still open and must be decided before any
real child's data is entered anywhere. Rotate `AUTH_SECRET` and the access password before any launch; the
production site will use its own database and secrets.

## Switching it off

Vercel → `aa-pro-test` → Settings → Delete Project; and Storage → the Neon database → Delete.

## Owner steps (A-10): Super Admin on the test site

1. Vercel → `aa-pro-test` → **Settings → Environment Variables** → add `AA_SUPERADMIN_EMAIL` = your own email
   address (Production and Preview) → **Save** → **Deployments → ⋯ → Redeploy**.
2. Open `/setup` on the test site, type your name and that email → **Send set-up link**.
3. Open `/dev/mailbox`, open the "owner_set_password" email's link and choose a password (12+ characters).
4. Sign in. Install Google Authenticator or Microsoft Authenticator, scan the QR code, type the 6-digit code.
5. Print or write down the ten recovery codes, then **I've saved them**.

After step 3 the `/setup` page no longer exists. There is only ever one Super Admin.

