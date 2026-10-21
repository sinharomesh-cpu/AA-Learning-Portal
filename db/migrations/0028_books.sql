-- AA Pro · 0028 Parents' books and chapters (M6).
-- CR-17 PR B1 (and the book links used by PR B2); OC-74 as amended by B-1; owner decisions
-- OC-127 to OC-129: "Use as it is" or "Split in Chapters" for a complete book (B-8: split later),
-- or a book of separate chapters, each one PDF or 1–30 page photos (B-6, B-7, B-9 proposed);
-- 20 MB per file (B-3); duplicates checked within the same parent only (B-4); no administrator
-- access (W-5); teachers view only, never download (OC-41(5)). Additive only.

-- A book file is a parent's file.
ALTER TABLE stored_files DROP CONSTRAINT stored_files_purpose_check;
ALTER TABLE stored_files ADD CONSTRAINT stored_files_purpose_check
  CHECK (purpose IN ('teacher_resource', 'submission_page', 'book'));
-- B-4: finding a parent's own earlier copy of the same file.
CREATE INDEX stored_files_owner_book_sha ON stored_files (owner_id, sha256)
  WHERE purpose = 'book' AND deleted_at IS NULL;

CREATE TABLE books (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  subject      text NOT NULL CHECK (valid_subjects(ARRAY[subject])),
  -- B-6: one complete PDF, or a set of separate chapters. Never both.
  form         text NOT NULL CHECK (form IN ('single_pdf', 'chapter_files')),
  -- Complete PDF only: shown as it is, or split into chapters (page ranges; B-8 allows later).
  split        text CHECK (split IN ('none', 'chapters')),
  -- How the chapters were first found (B-1: always confirmed by the parent).
  method       text CHECK (method IN ('bookmarks', 'contents', 'manual')),
  file_id      uuid UNIQUE REFERENCES stored_files (id) ON DELETE RESTRICT,
  page_count   smallint CHECK (page_count BETWEEN 1 AND 3000),
  -- Printed page 1 of the book is this PDF page (to show "book page 14 = PDF page 18").
  page_offset  smallint CHECK (page_offset BETWEEN 1 AND 3000),
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz,
  CHECK ((form = 'single_pdf') = (file_id IS NOT NULL)),
  CHECK ((form = 'single_pdf') = (split IS NOT NULL)),
  CHECK ((form = 'single_pdf') = (page_count IS NOT NULL)),
  CHECK (page_offset IS NULL OR form = 'single_pdf')
);
CREATE INDEX books_owner ON books (owner_id, updated_at DESC);
CREATE TRIGGER books_touch BEFORE UPDATE ON books FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE FUNCTION books_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.owner_id, 'parent');
  IF TG_OP = 'UPDATE' AND (NEW.owner_id <> OLD.owner_id OR NEW.form <> OLD.form
       OR NEW.file_id IS DISTINCT FROM OLD.file_id) THEN
    RAISE EXCEPTION 'a book keeps its owner, form and file' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.file_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM stored_files WHERE id = NEW.file_id AND owner_id = NEW.owner_id AND purpose = 'book'
      AND media_type = 'application/pdf'
  ) OR (NEW.file_id IS NOT NULL AND EXISTS (SELECT 1 FROM book_chapter_files WHERE file_id = NEW.file_id)) THEN
    RAISE EXCEPTION 'the book file must be the parent''s own PDF' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER books_check BEFORE INSERT OR UPDATE ON books FOR EACH ROW EXECUTE FUNCTION books_check();

-- OC-74(6): which of the owner's own children may read the book.
CREATE TABLE book_children (
  book_id     uuid NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, student_id)
);
CREATE INDEX book_children_student ON book_children (student_id);
CREATE FUNCTION book_children_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM books b JOIN guardian_links g ON g.parent_id = b.owner_id AND g.student_id = NEW.student_id
    WHERE b.id = NEW.book_id AND g.status = 'active'
  ) THEN
    RAISE EXCEPTION 'only the parent''s own children can be given a book' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER book_children_check BEFORE INSERT OR UPDATE ON book_children
  FOR EACH ROW EXECUTE FUNCTION book_children_check();

CREATE TABLE book_chapters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id       uuid NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  number        smallint NOT NULL CHECK (number BETWEEN 1 AND 999),
  -- Typed or confirmed by the parent; never invented (OC-63, B-1).
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description   text CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 500),
  title_origin  text NOT NULL DEFAULT 'typed' CHECK (title_origin IN ('typed', 'file_name', 'bookmarks', 'contents')),
  -- Split complete book: a page range inside its one PDF.
  first_page    smallint CHECK (first_page BETWEEN 1 AND 3000),
  last_page     smallint CHECK (last_page BETWEEN 1 AND 3000),
  -- A separate chapter's files arrive one at a time (the free host takes 4.5 MB per request and
  -- 40 MB waiting per parent): the chapter stays hidden from readers until the parent finishes.
  complete      boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz,
  CHECK ((first_page IS NULL) = (last_page IS NULL)),
  CHECK (last_page IS NULL OR last_page >= first_page),
  CHECK (complete OR first_page IS NULL)
);
CREATE UNIQUE INDEX book_chapters_number ON book_chapters (book_id, number) WHERE archived_at IS NULL;

-- A chapter fits its book: page ranges only in split complete books (inside the page count,
-- never overlapping another live chapter); no page range in books of separate chapters.
CREATE FUNCTION book_chapters_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  b books%ROWTYPE;
BEGIN
  SELECT * INTO b FROM books WHERE id = NEW.book_id;
  IF b.form = 'single_pdf' THEN
    IF NEW.first_page IS NULL OR b.split <> 'chapters' THEN
      RAISE EXCEPTION 'chapters of a complete book are page ranges of a split book' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.last_page > b.page_count THEN
      RAISE EXCEPTION 'the chapter ends after the last page' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.archived_at IS NULL AND EXISTS (
      SELECT 1 FROM book_chapters c
      WHERE c.book_id = NEW.book_id AND c.id <> NEW.id AND c.archived_at IS NULL
        AND c.first_page <= NEW.last_page AND c.last_page >= NEW.first_page
    ) THEN
      RAISE EXCEPTION 'chapters may not share pages' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.first_page IS NOT NULL THEN
    RAISE EXCEPTION 'separate chapters have their own files, not page ranges' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER book_chapters_check BEFORE INSERT OR UPDATE ON book_chapters
  FOR EACH ROW EXECUTE FUNCTION book_chapters_check();

-- B-7: a separate chapter is one PDF or 1–30 page photos (converted JPEGs), in the parent's order.
CREATE TABLE book_chapter_files (
  chapter_id  uuid NOT NULL REFERENCES book_chapters (id) ON DELETE CASCADE,
  position    smallint NOT NULL CHECK (position BETWEEN 1 AND 30),
  file_id     uuid NOT NULL UNIQUE REFERENCES stored_files (id) ON DELETE RESTRICT,
  PRIMARY KEY (chapter_id, position) DEFERRABLE INITIALLY DEFERRED
);
CREATE FUNCTION book_chapter_files_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cid uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.chapter_id ELSE NEW.chapter_id END;
  pdfs int;
  pics int;
BEGIN
  IF TG_OP <> 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM book_chapters c JOIN books b ON b.id = c.book_id
    JOIN stored_files f ON f.id = NEW.file_id AND f.owner_id = b.owner_id AND f.purpose = 'book'
    WHERE c.id = NEW.chapter_id AND b.form = 'chapter_files'
  ) OR (TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM books WHERE file_id = NEW.file_id)) THEN
    RAISE EXCEPTION 'chapter files belong to the parent''s book of separate chapters' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) FILTER (WHERE f.media_type = 'application/pdf'), count(*) FILTER (WHERE f.media_type <> 'application/pdf')
    INTO pdfs, pics
  FROM book_chapter_files x JOIN stored_files f ON f.id = x.file_id WHERE x.chapter_id = cid;
  IF (pdfs > 1) OR (pdfs = 1 AND pics > 0) THEN
    RAISE EXCEPTION 'a chapter is one PDF or page photos, not both' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER book_chapter_files_check AFTER INSERT OR UPDATE OR DELETE ON book_chapter_files
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION book_chapter_files_check();

-- PR B2: a worksheet may work from a book chapter the teacher can see; a student's copy keeps the
-- link only if that student may read the book (checked in code when assigning).
ALTER TABLE worksheets
  ADD COLUMN source_chapter_id uuid REFERENCES book_chapters (id) ON DELETE SET NULL,
  ADD CONSTRAINT worksheets_one_source CHECK (source_chapter_id IS NULL OR source_resource_id IS NULL);
-- Pages may now come from either source (a resource or a book chapter).
ALTER TABLE worksheets DROP CONSTRAINT worksheets_source_pages;
ALTER TABLE worksheets ADD CONSTRAINT worksheets_source_pages
  CHECK (source_from_page IS NULL OR source_resource_id IS NOT NULL OR source_chapter_id IS NOT NULL);
ALTER TABLE assignments ADD COLUMN book_chapter_id uuid REFERENCES book_chapters (id) ON DELETE SET NULL;
