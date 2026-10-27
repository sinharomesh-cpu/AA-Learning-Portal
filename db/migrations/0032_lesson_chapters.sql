-- AA Pro · 0032 chapters requested on a lesson (TL-1).
-- Owner decisions for TL-1 only (25 Oct 2026, 21:18 IST): D-TLS-6 (up to five chapters from books
-- already published and shared with the child in the lesson's subject, or one free-text topic),
-- D-TLS-7 (optional, chosen when the parent requests the lesson), D-TLS-10 (children see chapter
-- titles on confirmed lessons only), D-TLS-15 (labels kept for the life of the lesson record),
-- D-TLS-19 (teacher visibility derived from existing book sharing; "No longer shared" otherwise).
-- Applying this migration to the shared test database needs the owner's separate written approval.
--
-- Additive only: one table, one trigger function, two indexes. No existing table, function,
-- trigger or row changes; 0029's lesson rules (lessons_before_insert, lessons_before_update) and
-- the books tables (0028) are only read. Nothing here changes a lesson's status, time, price or
-- notifications, or anyone's access to a book.
--
-- Whatever the application sends, the database:
--  * accepts chapters or a topic only inside the transaction that creates the request: the lesson
--    is still 'requested' and its requested_at (set by 0029 from the database clock) equals now(),
--    so they come with the requesting parent's own request, never later, never from a teacher,
--    a student or another family;
--  * accepts a chapter only if it is a live, complete chapter of a live, published book that is
--    assigned to this child (book_children), in the lesson's subject, and owned by an active
--    parent of the child: the same books the lesson's teacher can already view (OC-41);
--  * takes either up to five chapters or exactly one topic, never both;
--  * writes the label itself from the parent's own book and chapter titles (OC-63: never invented);
--  * never lets a row change afterwards: only the database clears the chapter reference if that
--    chapter is ever deleted, and the label stays as history;
--  * never lets a row be deleted while its lesson exists (D-TLS-15: kept for the life of the
--    lesson record); rows go only with their lesson (ON DELETE CASCADE).

CREATE TABLE lesson_chapters (
  lesson_id        uuid NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
  position         smallint NOT NULL CHECK (position BETWEEN 1 AND 5),
  -- TL-1: parent-requested only. Teacher-planned chapters (a later phase) need their own approval.
  source           text NOT NULL DEFAULT 'requested' CHECK (source = 'requested'),
  book_chapter_id  uuid REFERENCES book_chapters (id) ON DELETE SET NULL,
  topic            text CHECK (topic IS NULL OR char_length(topic) BETWEEN 1 AND 120),
  -- What people see; set by the database (book title · number. chapter title, or the topic).
  label            text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 420),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lesson_id, position),
  CHECK (topic IS NULL OR book_chapter_id IS NULL)
);
CREATE UNIQUE INDEX lesson_chapters_once ON lesson_chapters (lesson_id, book_chapter_id)
  WHERE book_chapter_id IS NOT NULL;
CREATE INDEX lesson_chapters_chapter ON lesson_chapters (book_chapter_id) WHERE book_chapter_id IS NOT NULL;

CREATE FUNCTION lesson_chapters_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  l lessons%ROWTYPE;
  c record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- The chapter itself was deleted (ON DELETE SET NULL): keep the row and its label as history.
    -- Only then: a direct UPDATE that clears the reference while the chapter still exists is refused.
    IF OLD.book_chapter_id IS NOT NULL AND NEW.book_chapter_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM book_chapters WHERE id = OLD.book_chapter_id)
       AND (NEW.lesson_id, NEW.position, NEW.source, NEW.topic, NEW.label, NEW.created_at)
           IS NOT DISTINCT FROM (OLD.lesson_id, OLD.position, OLD.source, OLD.topic, OLD.label, OLD.created_at) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'a lesson''s chapters cannot change' USING ERRCODE = 'check_violation';
  END IF;

  IF (NEW.book_chapter_id IS NULL) = (NEW.topic IS NULL) THEN
    RAISE EXCEPTION 'give either a chapter or a topic' USING ERRCODE = 'check_violation';
  END IF;
  NEW.source := 'requested';
  NEW.created_at := now();

  SELECT * INTO l FROM lessons WHERE id = NEW.lesson_id FOR SHARE;
  IF NOT FOUND OR l.status <> 'requested' OR l.requested_at <> now() THEN
    RAISE EXCEPTION 'chapters are chosen only together with the lesson request' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT lessons_parent_ok(l.requested_by, l.student_id) THEN
    RAISE EXCEPTION 'only a parent of the child can choose chapters' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- D-TLS-6: up to five chapters, or one topic; never both.
  IF EXISTS (SELECT 1 FROM lesson_chapters x WHERE x.lesson_id = NEW.lesson_id
             AND (NEW.topic IS NOT NULL OR x.topic IS NOT NULL)) THEN
    RAISE EXCEPTION 'either up to five chapters or one topic' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.book_chapter_id IS NOT NULL THEN
    SELECT b.title AS book, ch.number, ch.title INTO c
    FROM book_chapters ch
    JOIN books b ON b.id = ch.book_id
    JOIN book_children k ON k.book_id = b.id AND k.student_id = l.student_id
    WHERE ch.id = NEW.book_chapter_id AND ch.archived_at IS NULL AND ch.complete
      AND b.status = 'published' AND b.archived_at IS NULL AND b.subject = l.subject
      AND lessons_parent_ok(b.owner_id, l.student_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'only a published chapter shared with this child in the lesson''s subject'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.label := format('%s · %s. %s', c.book, c.number, c.title);
  ELSE
    NEW.topic := btrim(NEW.topic);    -- an empty topic then fails the length check
    NEW.label := NEW.topic;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lesson_chapters_before_write BEFORE INSERT OR UPDATE ON lesson_chapters
  FOR EACH ROW EXECUTE FUNCTION lesson_chapters_before_write();

-- D-TLS-15: a chapter row goes only together with its lesson (the cascade runs after the lesson
-- row is gone, so it passes; a direct delete while the lesson exists is refused).
CREATE FUNCTION lesson_chapters_before_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM lessons WHERE id = OLD.lesson_id) THEN
    RAISE EXCEPTION 'a lesson''s chapters are kept with the lesson' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER lesson_chapters_before_delete BEFORE DELETE ON lesson_chapters
  FOR EACH ROW EXECUTE FUNCTION lesson_chapters_before_delete();
