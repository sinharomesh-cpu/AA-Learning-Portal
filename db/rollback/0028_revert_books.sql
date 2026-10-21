-- AA Pro · rollback for 0028_books.sql (M6). NOT a migration: it is kept outside db/migrations
-- and is used only with the owner's separate written approval, because it deletes the parents'
-- books and their files created since M6 (synthetic test data only on the test site).
--
-- Use: as for the M3 rollback, copy this file into db/migrations under the next free number,
-- together with the code change that switches the Books pages back off. 0028 stays recorded in
-- schema_migrations; this file undoes it in its own transaction. Revert M6 before M3.

-- 1. Worksheet and assignment links to book chapters; the source-pages rule as 0027 left it.
ALTER TABLE assignments DROP COLUMN book_chapter_id;
UPDATE worksheets SET source_from_page = NULL, source_to_page = NULL
  WHERE source_chapter_id IS NOT NULL AND source_resource_id IS NULL;
ALTER TABLE worksheets DROP CONSTRAINT worksheets_source_pages;
ALTER TABLE worksheets DROP CONSTRAINT worksheets_one_source;
ALTER TABLE worksheets DROP COLUMN source_chapter_id;
ALTER TABLE worksheets ADD CONSTRAINT worksheets_source_pages
  CHECK (source_from_page IS NULL OR source_resource_id IS NOT NULL);

-- 2. Books, newest dependants first.
DROP TABLE book_chapter_files;
DROP TABLE book_chapters;
DROP TABLE book_children;
DROP TABLE books;
DROP FUNCTION book_chapter_files_check();
DROP FUNCTION book_chapters_check();
DROP FUNCTION book_children_check();
DROP FUNCTION books_check();

-- 3. The book files themselves (bytes included), then the file purposes as before.
DROP INDEX stored_files_owner_book_sha;
DELETE FROM stored_files WHERE purpose = 'book';
ALTER TABLE stored_files DROP CONSTRAINT stored_files_purpose_check;
ALTER TABLE stored_files ADD CONSTRAINT stored_files_purpose_check
  CHECK (purpose IN ('teacher_resource', 'submission_page'));
