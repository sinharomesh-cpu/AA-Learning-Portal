-- TL-4 ROLLBACK (local draft, NOT a migration; unnumbered; for technical review with
-- db/drafts/tl4_lesson_changes.sql). Decision D4 (PO-approved business rule): refuse unsafe rollback;
-- controlled forward-fix recovery. This script removes every TL-4 object and restores what TL-4
-- replaced, ONLY while no lesson has ever been moved; otherwise it refuses and changes nothing.
-- It is ONE DO block, so the refusal and the removals can never be separated, whatever the client
-- (plain psql -f, --single-transaction, ON_ERROR_STOP or the migration runner): the F-1b lesson.
-- The restore statements below were generated from a database at main (0001-0034), unchanged.
-- Running it on any shared database needs its own written approval and a restore point.
DO $rb$
BEGIN
  IF EXISTS (SELECT 1 FROM lesson_reschedules)
     OR EXISTS (SELECT 1 FROM lessons WHERE replaces_lesson_id IS NOT NULL OR close_reason = 'rescheduled')
     OR EXISTS (SELECT 1 FROM material_requests WHERE close_reason = 'carried_forward' OR logical_request_id <> id) THEN
    RAISE EXCEPTION 'TL-4 rollback refused: lessons have been moved or changes exist; use a reviewed forward fix'
      USING ERRCODE = 'check_violation';
  END IF;

  DROP TRIGGER lessons_two_way ON lessons;
  DROP TRIGGER lessons_before_update_tl4 ON lessons;
  DROP TRIGGER lessons_before_insert_tl4 ON lessons;
  DROP TRIGGER material_requests_before_write_tl4 ON material_requests;
  DROP TABLE lesson_reschedule_requests;
  DROP TABLE lesson_reschedules;
  DROP FUNCTION lesson_reschedule_requests_before_write();
  DROP FUNCTION lesson_reschedules_two_way();
  DROP FUNCTION lesson_reschedules_before_write();
  DROP FUNCTION lessons_two_way();
  DROP FUNCTION lessons_before_update_tl4();
  DROP FUNCTION lessons_before_insert_tl4();
  DROP FUNCTION lessons_lock_pair(uuid, uuid);
  DROP FUNCTION material_requests_before_write_tl4();
  DROP FUNCTION tl4_parent_rule_check(uuid, integer);
  DROP FUNCTION tl4_parent_open_count(uuid);

  DROP INDEX material_requests_one_open_logical;
  ALTER TABLE material_requests DROP COLUMN logical_request_id;
  ALTER TABLE material_requests DROP CONSTRAINT material_requests_close_reason_check;
  EXECUTE $q$ALTER TABLE material_requests ADD CONSTRAINT material_requests_close_reason_check CHECK ((close_reason = ANY (ARRAY['lesson_closed'::text, 'lesson_ended'::text])))$q$;

  DROP INDEX lessons_one_open_change;
  DROP INDEX lessons_one_replacement;
  ALTER TABLE lessons DROP CONSTRAINT lessons_deadline;
  EXECUTE $q$ALTER TABLE lessons ADD CONSTRAINT lessons_deadline CHECK (((reply_deadline = LEAST((requested_at + '48:00:00'::interval), (starts_at - '02:00:00'::interval))) AND (reply_deadline > requested_at)))$q$;
  ALTER TABLE lessons DROP CONSTRAINT lessons_status_fields;
  EXECUTE $q$ALTER TABLE lessons ADD CONSTRAINT lessons_status_fields CHECK ((((status = 'requested'::text) AND (origin = 'parent_request'::text) AND (confirmed_at IS NULL) AND (closed_at IS NULL) AND (closed_by IS NULL) AND (close_reason IS NULL) AND (close_note IS NULL)) OR ((status = 'proposed'::text) AND (origin = 'teacher_proposal'::text) AND (confirmed_at IS NULL) AND (closed_at IS NULL) AND (closed_by IS NULL) AND (closed_by_account IS NULL) AND (close_reason IS NULL) AND (close_note IS NULL)) OR ((status = 'confirmed'::text) AND (confirmed_at IS NOT NULL) AND (closed_at IS NULL) AND (closed_by IS NULL) AND (close_reason IS NULL) AND (close_note IS NULL)) OR ((status = 'declined'::text) AND (confirmed_at IS NULL) AND (closed_at IS NOT NULL) AND (((closed_by = 'teacher'::text) AND (close_reason IS NULL) AND (origin = 'parent_request'::text)) OR ((closed_by = 'parent'::text) AND (close_reason IS NULL) AND (origin = 'teacher_proposal'::text)) OR ((closed_by = 'aa_pro'::text) AND (close_reason IS NOT NULL) AND (close_note IS NULL)))) OR ((status = 'withdrawn'::text) AND (confirmed_at IS NULL) AND (closed_at IS NOT NULL) AND (close_reason IS NULL) AND (close_note IS NULL) AND (((closed_by = 'parent'::text) AND (origin = 'parent_request'::text)) OR ((closed_by = 'teacher'::text) AND (origin = 'teacher_proposal'::text)))) OR ((status = 'expired'::text) AND (confirmed_at IS NULL) AND (closed_by = 'aa_pro'::text) AND (close_reason IS NULL) AND (close_note IS NULL) AND (closed_at >= reply_deadline)) OR ((status = 'cancelled'::text) AND (confirmed_at IS NOT NULL) AND (closed_at IS NOT NULL) AND (((closed_by = ANY (ARRAY['parent'::text, 'teacher'::text])) AND (close_reason IS NULL) AND (closed_at <= (starts_at - '00:30:00'::interval))) OR ((closed_by = 'aa_pro'::text) AND (close_reason = ANY (ARRAY['teacher_deactivated'::text, 'link_ended'::text])) AND (close_note IS NULL) AND (closed_at < ends_at))))))$q$;
  ALTER TABLE lessons DROP CONSTRAINT lessons_close_reason_check;
  EXECUTE $q$ALTER TABLE lessons ADD CONSTRAINT lessons_close_reason_check CHECK ((close_reason = ANY (ARRAY['time_no_longer_free'::text, 'teacher_deactivated'::text, 'link_ended'::text])))$q$;
  ALTER TABLE lessons DROP COLUMN replaces_lesson_id;

  -- 0034's lesson_chapters_before_write, exactly as main defines it.
  EXECUTE $q$CREATE OR REPLACE FUNCTION public.lesson_chapters_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  tl3_l lessons%ROWTYPE;
  tl3_c record;
BEGIN
  -- WF-10: the intent never changes once written. 0032's rules below allow one update, the
  -- database clearing a missing chapter, and compare every other column but this new one.
  IF TG_OP = 'UPDATE' AND NEW.intent IS DISTINCT FROM OLD.intent THEN
    RAISE EXCEPTION 'a lesson''s chapters cannot change' USING ERRCODE = 'check_violation';
  END IF;

  -- TL-3: a chapter the TEACHER plans. Parent-requested chapters skip this block and run 0032's
  -- rules below (which also refuse any change or deletion afterwards, for both kinds).
  IF TG_OP = 'INSERT' AND NEW.source = 'planned' THEN
    -- TL3-2: no free-text from the teacher to the family; chapters only.
    IF NEW.book_chapter_id IS NULL OR NEW.topic IS NOT NULL THEN
      RAISE EXCEPTION 'a teacher plans chapters from books, not a free-text topic' USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := now();
    -- D-E2E-3 (b): only together with the proposal (the transaction that creates it), or when the
    -- teacher accepts a parent's request (the transaction that confirms it).
    SELECT * INTO tl3_l FROM lessons WHERE id = NEW.lesson_id FOR SHARE;
    IF NOT FOUND OR NOT ((tl3_l.status = 'proposed' AND tl3_l.requested_at = now())
                         OR (tl3_l.status = 'confirmed' AND tl3_l.origin = 'parent_request'
                             AND tl3_l.confirmed_at = now())) THEN
      RAISE EXCEPTION 'planned chapters are added only with the proposal, or when the teacher accepts a request'
        USING ERRCODE = 'check_violation';
    END IF;
    -- 0032's rule: chapters or one topic, never both.
    IF EXISTS (SELECT 1 FROM lesson_chapters x WHERE x.lesson_id = NEW.lesson_id AND x.topic IS NOT NULL) THEN
      RAISE EXCEPTION 'either up to five chapters or one topic' USING ERRCODE = 'check_violation';
    END IF;
    -- Only a chapter of a book the lesson's teacher can already view (OC-41; 0033's rule).
    SELECT b.title AS book, ch.number, ch.title INTO tl3_c
    FROM book_chapters ch JOIN books b ON b.id = ch.book_id
    WHERE ch.id = NEW.book_chapter_id AND ch.archived_at IS NULL AND ch.complete
      AND material_requests_teacher_can_view(tl3_l.teacher_id, tl3_l.student_id, tl3_l.subject, b.id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'only a chapter of a book the teacher can already view' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.label := format('%s · %s. %s', tl3_c.book, tl3_c.number, tl3_c.title);
    RETURN NEW;   -- D-E2E-2: at most five in total, by 0032's positions 1 to 5.
  END IF;

  -- Parent-requested chapters and every change: 0032's rules, unchanged (byte for byte), as a
  -- labelled sub-block.
  <<requested_chapters_0032>>

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
END ;
END $function$
$q$;
END $rb$;
