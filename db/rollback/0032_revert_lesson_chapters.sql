-- AA Pro · rollback for 0032_lesson_chapters.sql (TL-1). NOT a migration: it is kept outside
-- db/migrations and is used only with the owner's separate written approval.
--
-- The table and its rows are dropped as a whole (DROP TABLE does not run the delete guard).
-- Order: TL-1 is reverted BEFORE 0031, 0030, 0029 and 0028 if any of those is ever reverted too
-- (lesson_chapters refers to lessons and to book_chapters).
--
-- PERMANENTLY DELETES, with no way back except a database backup: every chapter or topic a parent
-- chose on a lesson request (lesson_chapters). Lessons, books, chapters, links, permissions and
-- notifications are untouched; lessons simply show no chapters again.
-- LEAVES BEHIND, on purpose: 0032's row in schema_migrations (the runner never re-applies it).

DROP TRIGGER lesson_chapters_before_delete ON lesson_chapters;
DROP TRIGGER lesson_chapters_before_write ON lesson_chapters;
DROP TABLE lesson_chapters;
DROP FUNCTION lesson_chapters_before_delete();
DROP FUNCTION lesson_chapters_before_write();
