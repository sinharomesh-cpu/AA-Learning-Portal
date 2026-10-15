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
| Updates | Every merge to `main` | Every merge to `main`; database changes applied automatically during the build |

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
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | added automatically when the Neon database is connected |

Do **not** add `AA_DEMO_MODE` or `AA_HOSTED_DEMO` to this project.

## Owner steps (A-09)

1. **New project.** Vercel → **Add New… → Project** → find **AA-Learning-Portal** → **Import**.
   Change **Project Name** to `aa-pro-test`. Open **Environment Variables** and add the four rows above.
   Click **Deploy** (the first build works without a database; sign-in says it is not available yet).
2. **Database.** In the `aa-pro-test` project: **Storage → Create Database → Neon** → choose the region closest
   to India that is offered (Mumbai if listed, otherwise Singapore) → **Free** plan → name `aa-pro-test-db` →
   **Create**. Then **Connect Project** → `aa-pro-test`, tick **Production** and **Preview**, leave
   preview branching off → **Connect**.
3. **Redeploy.** `aa-pro-test` → **Deployments** → the latest one → **⋯ → Redeploy**. The build sets up the
   database tables.
4. Send Claude the `aa-pro-test` web address. Open it; the browser asks for a user name (`aapro`) and the
   access password.

## Data and region

Test data only. D-28 (where real data is stored, and for how long) is still open and must be decided before any
real child's data is entered anywhere. Rotate `AUTH_SECRET` and the access password before any launch; the
production site will use its own database and secrets.

## Switching it off

Vercel → `aa-pro-test` → Settings → Delete Project; and Storage → the Neon database → Delete.
