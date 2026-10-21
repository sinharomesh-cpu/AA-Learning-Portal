# Database

PostgreSQL 16. Phase 2 uses **test data only** until D-28 (data residency) is decided.

- `migrations/` — SQL files applied in name order by `npm run db:migrate` (`scripts/db-migrate.mjs`).
  Each file runs once in a transaction and is recorded with a checksum. Never edit an applied
  file; add a new one.
- `npm run test:db` — integration tests. Set `DATABASE_URL` to an admin connection; each run
  creates a throwaway database, migrates it, runs `tests/db` and drops it.

## Tables (0001_foundation)

| Table | Purpose |
|---|---|
| `accounts` | Parents, students, teachers and Super Admins. Children have a username and never an email (OC-35). |
| `student_profiles`, `teacher_profiles` | Grade and subjects; teacher subjects, grades, origin (self-registered or parent-added) and approval state (OC-36, OC-38). |
| `guardian_links` | Parent ↔ child. Every parent permission goes through an active link. |
| `teacher_student_links` | Teacher ↔ child, created only by that child's parent (OC-36), with the subjects the parent ticked (OC-41, migration 0002). |
| `one_time_tokens` | Email confirmation, password reset and set-password links; hashes only. |
| `sessions` | Server-side sessions; hashed ids; revocable at once. |
| `sign_in_throttle` | Lockout counters keyed on HMACs, whether or not the account exists (G1-08 §3.2). |
| `audit_events` | Append-only audit log (OC-21). |
| `email_outbox` | Every email; nothing is sent until a provider is approved (A-02). |

The database also enforces role rules with triggers, as a second line of defence behind the
application checks: for example, a teacher can be linked only to a child of the linking
parent, and only a Super Admin can approve a teacher.

## Worksheets and homework (0027, M3)

| Table | Purpose |
|---|---|
| `worksheets`, `worksheet_questions` | A Human Teacher's own library (CR-17 PR 4). Never shown to students or parents. A Ready worksheet is complete (checked at commit). |
| `assignments`, `questions` | The frozen copy given to one student (PR 5). Later library edits never change it. |
| `assignment_targets` | That one student and the CR-07 status; only allowed status changes; needs an active link in the subject. |
| `answers`, `assignment_events` | Exercise answers (only while the work is open) and the status history. |

`teacher_resources.resource_type` labels shared files (notes, worksheet, slides, other), and
`notifications.entity_type` accepts `assignment`.

## Rollbacks (`db/rollback/`)

The runner never runs a migration backwards and refuses a changed or removed one. Each larger
migration therefore has a prepared revert in `db/rollback/`, tested on a throw-away database
(`tests/db/m3Rollback.test.ts`). It is used only with the owner's written approval, by copying
it into `db/migrations` under the next free number. It deletes the records the migration added.
