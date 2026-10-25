-- AA Pro · 0033 material requests (TL-2).
-- Owner approval in principle of TL2-1 to TL2-8 (25 Oct 2026, 23:30 IST), with safeguards 1-6.
-- This SQL is for review: applying it anywhere shared, and any TL-2 code, need the owner's
-- separate written approval.
--
-- Additive only: one table, its trigger functions, one AFTER trigger on lessons, one sweep
-- function, two read-only helper functions, and one value added to the notifications
-- entity_type list. No existing table, column, function, trigger or row changes. 0029's
-- lesson rules, 0030's meeting links, 0031's kept lessons, 0032's lesson chapters and the
-- books tables (0028) are only read.
--
-- A teacher asks the parents for a book or chapter for one lesson. A parent answers with a book
-- or chapter the teacher can ALREADY view, or says it is unavailable; the teacher may withdraw
-- the request; AA Pro closes open requests when their lesson closes or ends.
--
-- Whatever the application sends, the database:
--  * never changes a lesson, a book, a book assignment, a teacher link or a meeting link
--    (safeguards 1 and 3): nothing here writes those tables;
--  * accepts a new request only from the lesson's own teacher, while the teacher is active,
--    approved and linked to the child in the lesson's subject, on a lesson that is requested or
--    confirmed and has not ended (TL2-2, TL2-6);
--  * allows at most five OPEN requests per lesson (TL2-3, safeguard 2), serialised on the
--    lesson row, so two requests sent at the same moment cannot make a sixth;
--  * moves a request only from open to one final state, never back (TL2-1):
--      shared            an active parent of the child, linking a published, live book (or a
--                        complete, live chapter of it) that is assigned to the child, in the
--                        lesson's subject, owned by an active parent of the child, AND that the
--                        lesson's teacher can view now (active, approved, linked in the
--                        subject). Otherwise refused: a request never widens access
--                        (TL2-4, safeguard 1). The label is written by the database;
--      unavailable       an active parent of the child, optional note;
--      no_longer_needed  the lesson's teacher (withdraw), or AA Pro, only when the lesson has
--                        closed (declined, withdrawn, expired, cancelled) or ended (TL2-7);
--    parents answer only while the lesson is still requested or confirmed and has not ended;
--  * closes open requests itself when their lesson closes (trigger below). Lessons kept under
--    OC-53 stay confirmed, so their requests stay open until the lesson ends; ended lessons are
--    closed by the sweep function (safeguard 4);
--  * keeps every request for the life of its lesson; rows go only with the lesson.
--
-- Concurrency: the checks used when answering read without row locks, so an answer can never
-- deadlock with a parent removing a teacher (which locks the link, then the lesson). Access to a
-- shared book is re-checked by the reader on every open, so an answer racing a removal grants
-- nothing. Only a new request locks its lesson row (FOR NO KEY UPDATE) to count open requests.
--
-- Notifications (TL2-8, safeguard 5) are written by application code into the existing in-app
-- table; this migration only lets them point at a material request. Nothing here sends email or
-- WhatsApp.

CREATE TABLE material_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id          uuid NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
  -- History only (who asked): the lesson's teacher at the time.
  raised_by          uuid REFERENCES accounts (id) ON DELETE SET NULL,
  -- What is asked for: one of the lesson's requested chapters (TL-1), or a short description.
  lesson_position    smallint,
  description        text CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 200),
  note               text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 300),
  status             text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'shared', 'unavailable', 'no_longer_needed')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- The answer.
  shared_book_id     uuid REFERENCES books (id) ON DELETE SET NULL,
  shared_chapter_id  uuid REFERENCES book_chapters (id) ON DELETE SET NULL,
  shared_label       text CHECK (shared_label IS NULL OR char_length(shared_label) BETWEEN 1 AND 420),
  answer_note        text CHECK (answer_note IS NULL OR char_length(answer_note) BETWEEN 1 AND 300),
  closed_at          timestamptz,
  closed_by          text CHECK (closed_by IN ('parent', 'teacher', 'aa_pro')),
  closed_by_account  uuid REFERENCES accounts (id) ON DELETE SET NULL,
  close_reason       text CHECK (close_reason IN ('lesson_closed', 'lesson_ended')),

  FOREIGN KEY (lesson_id, lesson_position) REFERENCES lesson_chapters (lesson_id, position) ON DELETE CASCADE,
  CONSTRAINT material_requests_what CHECK ((lesson_position IS NULL) <> (description IS NULL)),
  -- What each state must, and must not, carry.
  CONSTRAINT material_requests_status_fields CHECK (
    (status = 'open' AND closed_at IS NULL AND closed_by IS NULL AND closed_by_account IS NULL
       AND close_reason IS NULL AND shared_book_id IS NULL AND shared_chapter_id IS NULL
       AND shared_label IS NULL AND answer_note IS NULL)
    OR (status = 'shared' AND closed_at IS NOT NULL AND closed_by = 'parent' AND close_reason IS NULL
       AND shared_label IS NOT NULL AND answer_note IS NULL)
    OR (status = 'unavailable' AND closed_at IS NOT NULL AND closed_by = 'parent' AND close_reason IS NULL
       AND shared_book_id IS NULL AND shared_chapter_id IS NULL AND shared_label IS NULL)
    OR (status = 'no_longer_needed' AND closed_at IS NOT NULL AND shared_book_id IS NULL
       AND shared_chapter_id IS NULL AND shared_label IS NULL AND answer_note IS NULL AND (
         (closed_by = 'teacher' AND close_reason IS NULL)
         OR (closed_by = 'aa_pro' AND closed_by_account IS NULL AND close_reason IS NOT NULL)))
  )
);
CREATE INDEX material_requests_lesson ON material_requests (lesson_id);
CREATE INDEX material_requests_open ON material_requests (lesson_id) WHERE status = 'open';

-- An active parent of the child (as lessons_parent_ok in 0029, but without row locks).
CREATE FUNCTION material_requests_parent_ok(p_parent uuid, p_student uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT p_parent IS NOT NULL AND EXISTS (
    SELECT 1 FROM guardian_links g JOIN accounts a ON a.id = g.parent_id
    WHERE g.parent_id = p_parent AND g.student_id = p_student AND g.status = 'active'
      AND a.role = 'parent' AND a.status = 'active')
$$;

-- The teacher can view this book NOW, for this child and subject: the rule of
-- listBooksForTeacher (OC-41) plus the owner check of 0032. Read-only; no row locks.
CREATE FUNCTION material_requests_teacher_can_view(p_teacher uuid, p_student uuid, p_subject text, p_book uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM books b
    JOIN book_children k ON k.book_id = b.id AND k.student_id = p_student
    JOIN teacher_student_links tl ON tl.teacher_id = p_teacher AND tl.student_id = p_student
      AND tl.status = 'active' AND p_subject = ANY (tl.subjects)
    JOIN accounts ta ON ta.id = p_teacher AND ta.role = 'teacher' AND ta.status = 'active'
    JOIN teacher_profiles tp ON tp.account_id = p_teacher AND tp.approval_status = 'approved'
    WHERE b.id = p_book AND b.status = 'published' AND b.archived_at IS NULL AND b.subject = p_subject
      AND material_requests_parent_ok(b.owner_id, p_student))
$$;

CREATE FUNCTION material_requests_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  l lessons%ROWTYPE;
  c record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Serialise new requests on the lesson row, so the limit of five holds under concurrency.
    SELECT * INTO l FROM lessons WHERE id = NEW.lesson_id FOR NO KEY UPDATE;
    IF NOT FOUND OR l.status NOT IN ('requested', 'confirmed') OR now() >= l.ends_at THEN
      RAISE EXCEPTION 'material can be requested only for a lesson that is requested or confirmed and not yet ended'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.raised_by IS DISTINCT FROM l.teacher_id OR NOT EXISTS (
         SELECT 1 FROM teacher_student_links tl
         JOIN accounts a ON a.id = tl.teacher_id AND a.role = 'teacher' AND a.status = 'active'
         JOIN teacher_profiles tp ON tp.account_id = tl.teacher_id AND tp.approval_status = 'approved'
         WHERE tl.teacher_id = l.teacher_id AND tl.student_id = l.student_id AND tl.status = 'active'
           AND l.subject = ANY (tl.subjects)) THEN
      RAISE EXCEPTION 'only the lesson''s linked teacher can request material' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF (SELECT count(*) FROM material_requests WHERE lesson_id = NEW.lesson_id AND status = 'open') >= 5 THEN
      RAISE EXCEPTION 'at most five open material requests per lesson' USING ERRCODE = 'check_violation';
    END IF;
    NEW.status := 'open';
    NEW.created_at := now();
    NEW.description := btrim(NEW.description);  -- an empty text then fails its length check
    NEW.note := btrim(NEW.note);
    RETURN NEW;
  END IF;

  -- UPDATE. Nothing about the request itself ever changes. A reference may become NULL only when
  -- the row it points to no longer exists, which is exactly when ON DELETE SET NULL runs (it runs
  -- after the delete, in the same transaction). A direct UPDATE that clears a reference to an
  -- account, book or chapter that still exists is refused, so history cannot be blanked.
  IF (NEW.id, NEW.lesson_id, NEW.lesson_position, NEW.description, NEW.note, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.lesson_id, OLD.lesson_position, OLD.description, OLD.note, OLD.created_at)
     OR (NEW.raised_by IS DISTINCT FROM OLD.raised_by
         AND (NEW.raised_by IS NOT NULL OR EXISTS (SELECT 1 FROM accounts WHERE id = OLD.raised_by))) THEN
    RAISE EXCEPTION 'a material request cannot be edited' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status <> 'open' OR NEW.status = 'open' THEN
    -- Final (or still open): only the database clearing a reference to a deleted account, book
    -- or chapter (ON DELETE SET NULL; see above) is allowed; the label stays as history.
    IF NEW.status = OLD.status
       AND (NEW.closed_at, NEW.closed_by, NEW.close_reason, NEW.shared_label, NEW.answer_note)
           IS NOT DISTINCT FROM (OLD.closed_at, OLD.closed_by, OLD.close_reason, OLD.shared_label, OLD.answer_note)
       AND (NEW.closed_by_account IS NOT DISTINCT FROM OLD.closed_by_account
            OR (NEW.closed_by_account IS NULL AND NOT EXISTS (SELECT 1 FROM accounts WHERE id = OLD.closed_by_account)))
       AND (NEW.shared_book_id IS NOT DISTINCT FROM OLD.shared_book_id
            OR (NEW.shared_book_id IS NULL AND NOT EXISTS (SELECT 1 FROM books WHERE id = OLD.shared_book_id)))
       AND (NEW.shared_chapter_id IS NOT DISTINCT FROM OLD.shared_chapter_id
            OR (NEW.shared_chapter_id IS NULL AND NOT EXISTS (SELECT 1 FROM book_chapters WHERE id = OLD.shared_chapter_id))) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'an answered or closed material request cannot change' USING ERRCODE = 'check_violation';
  END IF;

  -- open -> a final state. Read the lesson without locking it (see the header).
  SELECT * INTO l FROM lessons WHERE id = NEW.lesson_id;
  NEW.closed_at := now();
  NEW.close_reason := NULL;

  IF NEW.status IN ('shared', 'unavailable') THEN
    IF NEW.closed_by IS DISTINCT FROM 'parent' OR NOT material_requests_parent_ok(NEW.closed_by_account, l.student_id) THEN
      RAISE EXCEPTION 'only a parent of the child can answer a material request' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF l.status NOT IN ('requested', 'confirmed') OR now() >= l.ends_at THEN
      RAISE EXCEPTION 'the lesson has closed or ended' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'shared' THEN
    NEW.answer_note := NULL;
    IF NEW.shared_book_id IS NULL
       OR NOT material_requests_teacher_can_view(l.teacher_id, l.student_id, l.subject, NEW.shared_book_id) THEN
      RAISE EXCEPTION 'only a book the lesson''s teacher can already view can be shared' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.shared_chapter_id IS NULL THEN
      SELECT b.title AS book INTO c FROM books b WHERE b.id = NEW.shared_book_id;
      NEW.shared_label := c.book;
    ELSE
      SELECT b.title AS book, ch.number, ch.title INTO c
      FROM book_chapters ch JOIN books b ON b.id = ch.book_id
      WHERE ch.id = NEW.shared_chapter_id AND ch.book_id = NEW.shared_book_id
        AND ch.archived_at IS NULL AND ch.complete;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'only a complete, live chapter of that book can be shared' USING ERRCODE = 'insufficient_privilege';
      END IF;
      NEW.shared_label := format('%s · %s. %s', c.book, c.number, c.title);
    END IF;
  ELSIF NEW.status = 'unavailable' THEN
    NEW.shared_book_id := NULL;
    NEW.shared_chapter_id := NULL;
    NEW.shared_label := NULL;
    NEW.answer_note := btrim(NEW.answer_note);
  ELSE -- no_longer_needed
    NEW.shared_book_id := NULL;
    NEW.shared_chapter_id := NULL;
    NEW.shared_label := NULL;
    NEW.answer_note := NULL;
    IF NEW.closed_by = 'teacher' THEN
      IF NEW.closed_by_account IS DISTINCT FROM l.teacher_id THEN
        RAISE EXCEPTION 'only the lesson''s teacher can withdraw a material request' USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF NEW.closed_by = 'aa_pro' THEN
      NEW.closed_by_account := NULL;
      IF l.status NOT IN ('requested', 'confirmed') THEN
        NEW.close_reason := 'lesson_closed';
      ELSIF now() >= l.ends_at THEN
        NEW.close_reason := 'lesson_ended';
      ELSE
        RAISE EXCEPTION 'AA Pro closes a material request only when its lesson has closed or ended'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      RAISE EXCEPTION 'a parent answers with shared or unavailable' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER material_requests_before_write BEFORE INSERT OR UPDATE ON material_requests
  FOR EACH ROW EXECUTE FUNCTION material_requests_before_write();

-- Kept with the lesson: a request goes only together with its lesson (ON DELETE CASCADE).
CREATE FUNCTION material_requests_before_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM lessons WHERE id = OLD.lesson_id) THEN
    RAISE EXCEPTION 'material requests are kept with the lesson' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER material_requests_before_delete BEFORE DELETE ON material_requests
  FOR EACH ROW EXECUTE FUNCTION material_requests_before_delete();

-- TL2-7: when a lesson closes (declined, withdrawn, expired, cancelled; including the closures
-- made when a teacher link ends or a teacher is deactivated), its open requests are no longer
-- needed. A lesson kept under OC-53 stays confirmed, so this does not fire for it.
CREATE FUNCTION lessons_close_material_requests() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE material_requests SET status = 'no_longer_needed', closed_by = 'aa_pro'
  WHERE lesson_id = NEW.id AND status = 'open';
  RETURN NULL;
END $$;
CREATE TRIGGER lessons_close_material_requests AFTER UPDATE OF status ON lessons
  FOR EACH ROW WHEN (NEW.status IN ('declined', 'withdrawn', 'expired', 'cancelled')
                     AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION lessons_close_material_requests();

-- TL2-7: open requests on lessons that have ended (including kept lessons) are closed by the
-- existing CR-16 shared sweep (no paid scheduler); returns their ids. Safe to run twice at once.
CREATE FUNCTION material_requests_close_ended(p_limit int DEFAULT 200) RETURNS SETOF uuid LANGUAGE sql AS $$
  UPDATE material_requests SET status = 'no_longer_needed', closed_by = 'aa_pro'
  WHERE id IN (SELECT m.id FROM material_requests m JOIN lessons l ON l.id = m.lesson_id
               WHERE m.status = 'open' AND l.ends_at <= now()
               ORDER BY l.ends_at LIMIT p_limit FOR UPDATE OF m SKIP LOCKED)
  RETURNING id
$$;

-- TL2-8: in-app notifications may point at a material request.
ALTER TABLE notifications DROP CONSTRAINT notifications_entity_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_entity_type_check CHECK (entity_type IN (
  'enquiry', 'link_request', 'rate_proposal', 'resource_share', 'listing', 'learning_package', 'teacher_profile',
  'assignment', 'lesson', 'material_request'));
