# AA Pro — File Storage and the Free Database Allowance

**Version:** 1.0 · 18 Oct 2026 · **Decision:** OC-96 (owner, 18 Oct 2026, 13:07 IST) · **Budget:** $0 (OC-91)

## 1. Does the 1 GB free allowance include uploaded file contents?

**Yes.** AA Pro keeps uploaded files *inside* its database (table `stored_files`, OC-87 Q-9). Neon's Free plan gives "1 GB of Postgres storage per project", measured as the project's data size. That data includes every row and column, the file contents too. Large values are kept in Postgres' overflow (TOAST) storage, which is part of the same database. PDFs and photos are already compressed, so they take about their own size.

AA Pro measures the whole database (`pg_database_size`): all records, file contents and indexes. That figure is at least as large as Neon's own measure, so AA Pro's warnings come a little *early*, never late.

## 2. Where files are physically stored

| What | Where | Status |
|---|---|---|
| Teacher resources, homework uploads (photos, scans, PDFs) | Neon Postgres project for the test environment, table `stored_files` | Store built (H-1); screens come with H-2 and H-4 |
| Teacher profile photos (≤200 KB, re-encoded) | Same Neon database, table `teacher_photos` | Built (OC-85) |
| Parent-uploaded textbooks and scanned textbooks (whole PDFs or chapters) | **Not built yet.** When built, they will use the same `stored_files` store and the same limits. A different store would need your approval | Planned (OC-79) |
| Chapter "images" | None are made. Chapters are page ranges of the original PDF (OC-79), so no extra copies are stored | — |
| Local development and CI tests | A temporary local Postgres, deleted after each run; small synthetic files only | — |
| Vercel (the web host) | **Nothing.** Hosted pages have no lasting disk; no file is kept on Vercel | — |
| Any third-party storage (S3, R2, Vercel Blob, Supabase Storage …) | **None connected** (blocked by OC-91; the CI guard in `src/config/paidServices.ts` fails if one is added) | — |

## 3. Limits and monitoring (OC-96)

These are temporary technical safety limits for development and testing, not business rules. The Super Admin changes them on **Admin → Storage** without a code change, and every change is recorded in the audit log.

| Setting | Default | What happens |
|---|---|---|
| Uploads per account per day | 100 | The next upload is refused with the time when more are allowed |
| Storage per account | 200 MB | The upload is refused with what is used. Removing a file frees space |
| Free database allowance | 1,024 MB | The figure everything below is measured against (Neon Free: 1 GB) |
| Warn at | 75% | Warning banner on the Super Admin home and Storage page; audit event "Storage warning level reached" (at most once a day) |
| Stop new uploads at | 90% | Every new upload is refused safely; files already stored are untouched; audit event "Uploads stopped" |

**How the limits are enforced:**
- Every check runs on the server, one upload at a time across the environment (a database lock), so uploads sent together cannot get past a limit.
- An upload counts towards the daily limit only when the file is saved. Refused, invalid or failed uploads use no quota.
- Parents and teachers see their own meter, for example "85 MB of 200 MB used · 3 of 100 uploads in the last 24 hours".

**About warnings:** real email is still switched off (OC-65), so warnings appear in AA Pro (the Super Admin home page and Admin → Storage) and in the audit log. No message is claimed to have been sent.

## 4. Protection against charges

- **Neon Free plan:** "Neon does not bill overages on the Free plan." At the limit, writes that increase storage fail; data is not deleted. AA Pro stops uploads at 90%, before Neon's own limit is reached.
- **Nothing upgrades automatically.** AA Pro never buys storage, changes plan or switches to a paid service. The code has no paid-storage client, and the CI guard blocks paid SDKs and API hosts.
- **Owner checks (only you can do these):** keep the Neon project on the Free plan with **no payment method**, and keep Vercel on Hobby with no card (E-3 in the Billable Dependency Register).

## 5. If the free allowance is not enough

Uploads stop at the stop level and you are shown the warning. Nothing is upgraded. Before real families upload real textbooks and homework, Claude will present 2–3 storage options with:
- prices;
- expected use;
- free alternatives;
- the worst-case monthly cost.

Nothing is chosen without your written approval (OC-91, CR-07 K-1).

## Sources

- Neon Free plan limits: https://neon.com/faqs/free-plan-limits-and-quotas
- Neon plans: https://neon.com/docs/introduction/plans
