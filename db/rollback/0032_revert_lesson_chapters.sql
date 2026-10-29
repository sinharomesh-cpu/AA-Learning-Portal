-- AA Pro · rollback for 0032_lesson_chapters.sql (TL-1). NOT a migration: it is kept outside
-- db/migrations and is used only with the owner's separate written approval.
--
-- The table and its rows are dropped as a whole (DROP TABLE does not run the delete guard).
-- Order: TL-2 (0033, material_requests) is reverted FIRST; this file refuses to run while any other
-- table still refers to lesson_chapters. TL-1 is also reverted BEFORE 0031, 0030, 0029 and 0028 if
-- any of those is ever reverted too (lesson_chapters refers to lessons and to book_chapters).
--
-- PERMANENTLY DELETES, with no way back except a database backup: every chapter or topic a parent
-- chose on a lesson request (lesson_chapters). Lessons, books, chapters, links, permissions and
-- notifications are untouched.
-- The application reads lesson_chapters on the family calendar, the teacher's schedule and the
-- child's schedule, so this SQL must ship together with the code change that removes those reads;
-- on its own it breaks those pages.
-- LEAVES BEHIND, on purpose: 0032's row in schema_migrations (the runner never re-applies it). To
-- apply 0032 again later, that row is deleted in the same approved change.
--
-- Use: copy this file into db/migrations under the next free number, together with the code change
-- that removes the TL-1 reads; it then runs in the migration runner's single transaction, so it
-- applies completely or not at all. If it is ever run by hand, run it as one transaction that stops
-- at the first error (psql --single-transaction -v ON_ERROR_STOP=1). Before using it on the shared
-- test database, take a Neon restore point or branch.

DO $$
BEGIN
  -- TL-3 (0034) ships no rollback (TL3-6 Option D, owner 29 Oct 2026): once 0034 is applied this
  -- file must not run, because it would delete proposal history (planned chapters and material
  -- requests on proposals). Fix forward with a new reviewed migration, or use the before-TL3
  -- restore point under the recovery procedure.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'lessons' AND column_name = 'origin') THEN
    RAISE EXCEPTION 'TL-3 (0034) is applied: this rollback is closed; fix forward (TL3-6 Option D)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE contype = 'f' AND confrelid = 'lesson_chapters'::regclass
               AND conrelid <> 'lesson_chapters'::regclass) THEN
    RAISE EXCEPTION 'another table still refers to lesson_chapters: revert 0033 (TL-2) first';
  END IF;
END $$;

-- The table goes first: dropping it also drops its two guard triggers, so the guards can never be
-- removed while the table stays.
DROP TABLE lesson_chapters;
DROP FUNCTION lesson_chapters_before_delete();
DROP FUNCTION lesson_chapters_before_write();
