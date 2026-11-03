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
  -- Review F-4: lock first, so no change or move can commit between the check and the removals; one
  -- in flight is waited for, then seen by the check.
  LOCK TABLE lessons, material_requests, lesson_reschedules, lesson_reschedule_requests, lesson_chapters
    IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM lesson_reschedules)
     OR EXISTS (SELECT 1 FROM lessons WHERE replaces_lesson_id IS NOT NULL OR close_reason = 'rescheduled')
     OR EXISTS (SELECT 1 FROM material_requests WHERE close_reason = 'carried_forward' OR logical_request_id <> id) THEN
    RAISE EXCEPTION 'TL-4 rollback refused: lessons have been moved or changes exist; use a reviewed forward fix'
      USING ERRCODE = 'check_violation';
  END IF;

  DROP TRIGGER lessons_two_way ON lessons;
  DROP TRIGGER lessons_after_update_tl4 ON lessons;
  ALTER TABLE lessons DROP CONSTRAINT lessons_original_cancelled_change_only;
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
  DROP FUNCTION lessons_after_update_tl4();
  DROP FUNCTION lessons_before_insert_tl4();
  DROP FUNCTION lessons_lock_pair(uuid, uuid);
  DROP FUNCTION material_requests_before_write_tl4();
  DROP FUNCTION tl4_parent_rule_check(uuid, integer);
  DROP FUNCTION tl4_parent_verify(jsonb);
  DROP FUNCTION tl4_parent_snapshot(uuid);
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

  -- 0034's lessons_before_insert, exactly as main defines it (review F-1 replaced it).
  EXECUTE $q$CREATE OR REPLACE FUNCTION public.lessons_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  tl3_open int;
  tl3_p record;
BEGIN
  -- TL-3: a teacher's proposal. A parent's request skips this block and runs 0029's rules below.
  IF NEW.status = 'proposed' THEN
    NEW.origin := 'teacher_proposal';
    IF NEW.requested_by IS NOT NULL OR NEW.proposed_by IS NULL OR NEW.proposed_by <> NEW.teacher_id
       OR NEW.confirmed_by IS NOT NULL THEN
      RAISE EXCEPTION 'a proposal is made by the lesson''s own teacher' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Times come from the database clock, never from the caller.
    NEW.requested_at := now();
    NEW.ends_at := NEW.starts_at + make_interval(mins => NEW.minutes);
    -- D-TLS-5 (as D3A-5): any deadline sent by the caller is replaced.
    NEW.reply_deadline := LEAST(NEW.requested_at + interval '48 hours', NEW.starts_at - interval '2 hours');
    -- D-TLS-3: 24 hours to 4 weeks ahead, any 5-minute start, not limited to the usual times.
    IF NEW.starts_at < now() + interval '24 hours' THEN
      RAISE EXCEPTION 'a lesson must be proposed at least 24 hours ahead' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.starts_at > now() + interval '28 days' THEN
      RAISE EXCEPTION 'a lesson can be proposed at most 4 weeks ahead' USING ERRCODE = 'check_violation';
    END IF;
    IF extract(minute FROM NEW.starts_at)::int % 5 <> 0 THEN
      RAISE EXCEPTION 'a proposed lesson starts on a 5-minute step' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = NEW.student_id AND role = 'student' AND status = 'active') THEN
      RAISE EXCEPTION 'lessons are for an active child account' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT lessons_teacher_link_ok(NEW.teacher_id, NEW.student_id, NEW.subject) THEN
      RAISE EXCEPTION 'the teacher must be approved, active and linked to the child in this subject'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- D-TLS-12: the same price snapshot as for a request (0029); no hourly price, no proposal.
    tl3_p := lessons_price_for(NEW.teacher_id, NEW.student_id, NEW.subject, NEW.starts_at, NEW.minutes);
    IF (NEW.price_basis IS NOT NULL AND NEW.price_basis <> tl3_p.basis)
       OR (NEW.rate_minor IS NOT NULL AND NEW.rate_minor <> tl3_p.rate)
       OR (NEW.currency IS NOT NULL AND NEW.currency <> tl3_p.cur)
       OR (NEW.agreement_id IS NOT NULL AND NEW.agreement_id IS DISTINCT FROM tl3_p.agreement)
       OR (NEW.price_minor IS NOT NULL AND NEW.price_minor <> (tl3_p.rate * NEW.minutes * 2 + 60) / 120) THEN
      RAISE EXCEPTION 'the lesson price has changed' USING ERRCODE = 'check_violation';
    END IF;
    NEW.price_basis := tl3_p.basis;
    NEW.rate_minor := tl3_p.rate;
    NEW.currency := tl3_p.cur;
    NEW.agreement_id := tl3_p.agreement;
    NEW.price_minor := (tl3_p.rate * NEW.minutes * 2 + 60) / 120;

    -- An overdue proposal for the same teacher, child and start is expired now, so it never blocks
    -- the slot even if no sweep has run.
    UPDATE lessons SET status = 'expired', closed_by = 'aa_pro'
    WHERE teacher_id = NEW.teacher_id AND student_id = NEW.student_id AND starts_at = NEW.starts_at
      AND status = 'proposed' AND reply_deadline <= now();

    -- D-TLS-3: never over a confirmed lesson of the teacher or of the child, checked after taking
    -- the time locks so an overlapping confirmation still in flight is waited for and then seen.
    -- (After that, a proposal still holds no time, TL3-4: a later confirmation may overlap it, and
    -- its acceptance is then refused by 0029's no-overlap rules.)
    PERFORM lessons_lock_times(NEW.teacher_id, NEW.student_id);
    IF EXISTS (SELECT 1 FROM lessons x
               WHERE x.status = 'confirmed' AND (x.teacher_id = NEW.teacher_id OR x.student_id = NEW.student_id)
                 AND tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')) THEN
      RAISE EXCEPTION 'the time overlaps a confirmed lesson' USING ERRCODE = 'check_violation';
    END IF;

    -- D-TLS-5: at most 10 open proposals per teacher and child. A per-pair transaction lock makes
    -- two proposals sent at the same moment count one after the other. Overdue ones don't count.
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'aa_pro.lesson_proposals:' || NEW.teacher_id::text || ':' || NEW.student_id::text, 0));
    SELECT count(*) INTO tl3_open FROM lessons
    WHERE teacher_id = NEW.teacher_id AND student_id = NEW.student_id AND status = 'proposed'
      AND reply_deadline > now();
    IF tl3_open >= 10 THEN
      RAISE EXCEPTION 'at most 10 open lesson proposals per teacher and child' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- A parent's request: 0029's rules, unchanged (byte for byte), as a labelled sub-block. In
  -- PL/pgSQL a sub-block (DECLARE ... BEGIN ... END;) is itself a statement, so its own DECLARE
  -- section may follow other statements; its variables exist only inside it.
  <<parent_request_0029>>

DECLARE
  open_count int;
  p record;
BEGIN
  IF NEW.status <> 'requested' THEN
    RAISE EXCEPTION 'a lesson starts as a request' USING ERRCODE = 'check_violation';
  END IF;
  -- Times come from the database clock, never from the caller.
  NEW.requested_at := now();
  NEW.ends_at := NEW.starts_at + make_interval(mins => NEW.minutes);
  -- D3A-5: any deadline sent by the caller is replaced.
  NEW.reply_deadline := LEAST(NEW.requested_at + interval '48 hours', NEW.starts_at - interval '2 hours');
  -- D3A-3 and D3A-2: at least 24 hours ahead, at most 4 weeks ahead.
  IF NEW.starts_at < now() + interval '24 hours' THEN
    RAISE EXCEPTION 'a lesson must be requested at least 24 hours ahead' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.starts_at > now() + interval '28 days' THEN
    RAISE EXCEPTION 'a lesson can be requested at most 4 weeks ahead' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = NEW.student_id AND role = 'student' AND status = 'active') THEN
    RAISE EXCEPTION 'lessons are for an active child account' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT lessons_parent_ok(NEW.requested_by, NEW.student_id) THEN
    RAISE EXCEPTION 'only a parent linked to the child can request a lesson' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT lessons_teacher_link_ok(NEW.teacher_id, NEW.student_id, NEW.subject) THEN
    RAISE EXCEPTION 'the teacher must be approved, active and linked to the child in this subject'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT lessons_in_usual_time(NEW.teacher_id, NEW.starts_at, NEW.minutes) THEN
    RAISE EXCEPTION 'the lesson must start on the 30-minute grid and fit inside the teacher''s usual times'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The price is worked out here. A caller may send the price it showed; if any part differs
  -- (the listing or agreement changed meanwhile) the request is refused so it can be shown again.
  p := lessons_price_for(NEW.teacher_id, NEW.student_id, NEW.subject, NEW.starts_at, NEW.minutes);
  IF (NEW.price_basis IS NOT NULL AND NEW.price_basis <> p.basis)
     OR (NEW.rate_minor IS NOT NULL AND NEW.rate_minor <> p.rate)
     OR (NEW.currency IS NOT NULL AND NEW.currency <> p.cur)
     OR (NEW.agreement_id IS NOT NULL AND NEW.agreement_id IS DISTINCT FROM p.agreement)
     OR (NEW.price_minor IS NOT NULL AND NEW.price_minor <> (p.rate * NEW.minutes * 2 + 60) / 120) THEN
    RAISE EXCEPTION 'the lesson price has changed' USING ERRCODE = 'check_violation';
  END IF;
  NEW.price_basis := p.basis;
  NEW.rate_minor := p.rate;
  NEW.currency := p.cur;
  NEW.agreement_id := p.agreement;
  NEW.price_minor := (p.rate * NEW.minutes * 2 + 60) / 120;

  -- D3A-5: an overdue request for the same child, teacher and start is expired now, so it never
  -- blocks the slot even if no sweep has run.
  UPDATE lessons SET status = 'expired', closed_by = 'aa_pro'
  WHERE teacher_id = NEW.teacher_id AND student_id = NEW.student_id AND starts_at = NEW.starts_at
    AND status = 'requested' AND reply_deadline <= now();

  -- At most 10 open requests per parent (D3A-17). A per-parent transaction lock makes two requests
  -- sent at the same moment count one after the other, without locking the account row itself.
  -- Requests past their deadline don't count.
  PERFORM pg_advisory_xact_lock(hashtextextended('aa_pro.lesson_requests:' || NEW.requested_by::text, 0));
  SELECT count(*) INTO open_count FROM lessons
  WHERE requested_by = NEW.requested_by AND status = 'requested' AND reply_deadline > now();
  IF open_count >= 10 THEN
    RAISE EXCEPTION 'at most 10 open lesson requests per parent' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END ;
END $function$
$q$;
END $rb$;
