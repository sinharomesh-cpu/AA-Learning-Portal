-- TL-4 PROTOTYPE (local draft, NOT a migration). No number is assigned and this file is outside
-- db/migrations, so no migration run, gate or checksum ever sees it. It exists to prove the
-- integrity and locking mechanism of the TL-4 design notes (revision 2, §3-§5) on throw-away
-- databases before final SQL is written. Rules marked [PROPOSED] wait for the owner (decisions
-- 1-4 and the migration order); nothing here is approved for the shared database.
--
-- Design choice in this prototype (differs from rev 2 §3.2, which edited lessons_before_update):
-- the swap runs in its OWN trigger, lessons_before_update_tl4, which fires after
-- lessons_before_update (BEFORE triggers fire in name order). lessons_before_insert and
-- lessons_before_update are NOT replaced, so the TU/TL-4 shared-function conflict (§8) shrinks to
-- lessons_status_fields and lesson_chapters_before_write. To be confirmed when TU is designed.

-- ---------------------------------------------------------------- the link
ALTER TABLE lessons ADD COLUMN replaces_lesson_id uuid REFERENCES lessons (id);

-- 'rescheduled' as a close reason, only on a cancelled lesson closed by AA Pro at least 30
-- minutes before its start (requirement 9). Every existing branch is unchanged.
ALTER TABLE lessons DROP CONSTRAINT lessons_close_reason_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_close_reason_check
  CHECK (close_reason IN ('time_no_longer_free', 'teacher_deactivated', 'link_ended', 'rescheduled'));
ALTER TABLE lessons DROP CONSTRAINT lessons_status_fields;
ALTER TABLE lessons ADD CONSTRAINT lessons_status_fields CHECK (
  (status = 'requested' AND origin = 'parent_request' AND confirmed_at IS NULL AND closed_at IS NULL
     AND closed_by IS NULL AND close_reason IS NULL AND close_note IS NULL)
  OR (status = 'proposed' AND origin = 'teacher_proposal' AND confirmed_at IS NULL AND closed_at IS NULL
     AND closed_by IS NULL AND closed_by_account IS NULL AND close_reason IS NULL AND close_note IS NULL)
  OR (status = 'confirmed' AND confirmed_at IS NOT NULL AND closed_at IS NULL AND closed_by IS NULL
     AND close_reason IS NULL AND close_note IS NULL)
  OR (status = 'declined' AND confirmed_at IS NULL AND closed_at IS NOT NULL AND (
       (closed_by = 'teacher' AND close_reason IS NULL AND origin = 'parent_request')
       OR (closed_by = 'parent' AND close_reason IS NULL AND origin = 'teacher_proposal')
       OR (closed_by = 'aa_pro' AND close_reason IS NOT NULL AND close_reason <> 'rescheduled' AND close_note IS NULL)))
  OR (status = 'withdrawn' AND confirmed_at IS NULL AND closed_at IS NOT NULL AND close_reason IS NULL
     AND close_note IS NULL AND (
       (closed_by = 'parent' AND origin = 'parent_request')
       OR (closed_by = 'teacher' AND origin = 'teacher_proposal')))
  OR (status = 'expired' AND confirmed_at IS NULL AND closed_by = 'aa_pro' AND close_reason IS NULL
     AND close_note IS NULL AND closed_at >= reply_deadline)
  OR (status = 'cancelled' AND confirmed_at IS NOT NULL AND closed_at IS NOT NULL AND (
       (closed_by IN ('parent', 'teacher') AND close_reason IS NULL
          AND closed_at <= starts_at - interval '30 minutes')
       OR (closed_by = 'aa_pro' AND close_reason IN ('teacher_deactivated', 'link_ended')
          AND close_note IS NULL AND closed_at < ends_at)
       -- TL-4: the original of a completed move.
       OR (closed_by = 'aa_pro' AND close_reason = 'rescheduled' AND close_note IS NULL
          AND closed_at <= starts_at - interval '30 minutes')))
);

-- Requirement 6: a change's deadline is also no later than 30 minutes before the original
-- starts. A CHECK can't read the original, so for change rows only the upper bound is checked
-- here; lessons_before_insert_tl4 sets the exact value. Every other row keeps 0029's exact rule.
ALTER TABLE lessons DROP CONSTRAINT lessons_deadline;
ALTER TABLE lessons ADD CONSTRAINT lessons_deadline CHECK (
  reply_deadline > requested_at AND (
    (replaces_lesson_id IS NULL
       AND reply_deadline = LEAST(requested_at + interval '48 hours', starts_at - interval '2 hours'))
    OR (replaces_lesson_id IS NOT NULL
       AND reply_deadline <= LEAST(requested_at + interval '48 hours', starts_at - interval '2 hours'))));

-- One open change per lesson; at most one confirmed replacement.
CREATE UNIQUE INDEX lessons_one_open_change ON lessons (replaces_lesson_id)
  WHERE replaces_lesson_id IS NOT NULL AND status IN ('requested', 'proposed');
CREATE UNIQUE INDEX lessons_one_replacement ON lessons (replaces_lesson_id)
  WHERE replaces_lesson_id IS NOT NULL AND status = 'confirmed';

-- ---------------------------------------------------------------- the swap record
CREATE TABLE lesson_reschedules (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_lesson_id     uuid NOT NULL UNIQUE REFERENCES lessons (id) ON DELETE CASCADE,
  replacement_lesson_id  uuid NOT NULL UNIQUE REFERENCES lessons (id) ON DELETE CASCADE,
  -- The top-level transaction that did the swap (pg_current_xact_id(), set by the database).
  swap_xid               xid8 NOT NULL,
  swapped_at             timestamptz NOT NULL DEFAULT now(),
  accepted_by            uuid REFERENCES accounts (id) ON DELETE SET NULL,
  CONSTRAINT lesson_reschedules_two_lessons CHECK (original_lesson_id <> replacement_lesson_id)
);

CREATE FUNCTION lesson_reschedules_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  o lessons%ROWTYPE;
  r lessons%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only with a lesson (ON DELETE CASCADE): never on its own.
    IF EXISTS (SELECT 1 FROM lessons WHERE id = OLD.original_lesson_id)
       AND EXISTS (SELECT 1 FROM lessons WHERE id = OLD.replacement_lesson_id) THEN
      RAISE EXCEPTION 'a lesson move record cannot be removed' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Only the database clearing a deleted account.
    IF (NEW.id, NEW.original_lesson_id, NEW.replacement_lesson_id, NEW.swap_xid, NEW.swapped_at)
       IS DISTINCT FROM (OLD.id, OLD.original_lesson_id, OLD.replacement_lesson_id, OLD.swap_xid, OLD.swapped_at)
       OR (NEW.accepted_by IS NOT NULL AND NEW.accepted_by IS DISTINCT FROM OLD.accepted_by)
       OR (NEW.accepted_by IS NULL AND EXISTS (SELECT 1 FROM accounts WHERE id = OLD.accepted_by)) THEN
      RAISE EXCEPTION 'a lesson move record cannot change' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- INSERT: database state only, never a session setting. The swap (lessons_before_update_tl4)
  -- closes the original just before writing this, while the replacement is still open.
  NEW.swap_xid := pg_current_xact_id();
  NEW.swapped_at := now();
  SELECT * INTO o FROM lessons WHERE id = NEW.original_lesson_id;
  SELECT * INTO r FROM lessons WHERE id = NEW.replacement_lesson_id;
  IF o.id IS NULL OR r.id IS NULL
     OR r.replaces_lesson_id IS DISTINCT FROM o.id
     OR (r.teacher_id, r.student_id, r.subject) IS DISTINCT FROM (o.teacher_id, o.student_id, o.subject)
     OR o.status <> 'cancelled' OR o.close_reason IS DISTINCT FROM 'rescheduled'
     OR r.status NOT IN ('requested', 'proposed') THEN
    RAISE EXCEPTION 'a lesson move record is written only by the move itself' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lesson_reschedules_before_write BEFORE INSERT OR UPDATE OR DELETE ON lesson_reschedules
  FOR EACH ROW EXECUTE FUNCTION lesson_reschedules_before_write();

-- ---------------------------------------------------------------- deterministic row locks
-- The application locks the teacher-child link first (FOR SHARE, as TL-3), then calls this, then
-- confirms the change. Two separate statements, lower id first: the order does not depend on a
-- plan's sort or on the order the ids are passed in.
CREATE FUNCTION lessons_lock_pair(p_a uuid, p_b uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM lessons WHERE id = LEAST(p_a, p_b) FOR UPDATE;
  PERFORM 1 FROM lessons WHERE id = GREATEST(p_a, p_b) FOR UPDATE;
END $$;

-- ---------------------------------------------------------------- starting a change
-- Runs after lessons_before_insert (name order), which has already applied the ordinary request
-- or proposal rules (24 hours to 4 weeks ahead, price snapshot, link, limits: decision 2 "Yes"
-- falls out of these, because a change is an ordinary open request or proposal).
CREATE FUNCTION lessons_before_insert_tl4() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  o lessons%ROWTYPE;
BEGIN
  IF NEW.replaces_lesson_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO o FROM lessons WHERE id = NEW.replaces_lesson_id FOR SHARE;
  IF NOT FOUND OR (o.teacher_id, o.student_id, o.subject) IS DISTINCT FROM (NEW.teacher_id, NEW.student_id, NEW.subject) THEN
    RAISE EXCEPTION 'a change is for a lesson of the same teacher, child and subject' USING ERRCODE = 'check_violation';
  END IF;
  -- Requirement 3, at initiation.
  IF o.status <> 'confirmed' OR o.outcome IS NOT NULL OR o.starts_at < now() + interval '30 minutes' THEN
    RAISE EXCEPTION 'only a confirmed lesson at least 30 minutes away can be moved' USING ERRCODE = 'check_violation';
  END IF;
  -- A replacement may itself be moved later: it is an ordinary confirmed lesson.
  -- Requirement 6: the earliest of the three.
  NEW.reply_deadline := LEAST(NEW.requested_at + interval '48 hours', NEW.starts_at - interval '2 hours',
                              o.starts_at - interval '30 minutes');
  IF NEW.reply_deadline <= NEW.requested_at THEN
    RAISE EXCEPTION 'the lesson starts too soon to move' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lessons_before_insert_tl4 BEFORE INSERT ON lessons
  FOR EACH ROW EXECUTE FUNCTION lessons_before_insert_tl4();

-- ---------------------------------------------------------------- the swap
CREATE FUNCTION lessons_before_update_tl4() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  o lessons%ROWTYPE;
  req record;
  reqs jsonb := '[]'::jsonb;
BEGIN
  IF NEW.replaces_lesson_id IS DISTINCT FROM OLD.replaces_lesson_id THEN
    RAISE EXCEPTION 'which lesson a change replaces cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.replaces_lesson_id IS NULL OR NEW.status <> 'confirmed' OR OLD.status NOT IN ('requested', 'proposed') THEN
    RETURN NEW;
  END IF;

  -- The original, locked (no new wait if the caller used lessons_lock_pair first) and re-checked
  -- now that it can no longer change underneath (requirement 3, at acceptance).
  SELECT * INTO o FROM lessons WHERE id = NEW.replaces_lesson_id FOR UPDATE;
  IF o.status <> 'confirmed' THEN
    RAISE EXCEPTION 'the lesson was cancelled or changed meanwhile' USING ERRCODE = 'check_violation';
  END IF;
  IF o.outcome IS NOT NULL OR o.starts_at < now() + interval '30 minutes' THEN
    RAISE EXCEPTION 'only a confirmed lesson at least 30 minutes away can be moved' USING ERRCODE = 'check_violation';
  END IF;

  -- [PROPOSED, decision 1, option R] The original's OPEN material requests, captured and locked
  -- BEFORE the original closes (0033's trigger closes them as "no longer needed" the moment it
  -- does). A parent's answer in flight holds the request row: this waits, then re-reads it, so an
  -- answered request is not captured.
  FOR req IN SELECT id, raised_by, lesson_position, description, note FROM material_requests
             WHERE lesson_id = o.id AND status = 'open' ORDER BY created_at, id FOR UPDATE LOOP
    reqs := reqs || jsonb_build_object('raised_by', req.raised_by, 'lesson_position', req.lesson_position,
                                       'description', req.description, 'note', req.note);
  END LOOP;

  -- Close the original. lessons_before_update (0029 rules) sets closed_at and clears
  -- closed_by_account; 0030 drops its meeting link; 0033 closes its open requests.
  UPDATE lessons SET status = 'cancelled', closed_by = 'aa_pro', close_reason = 'rescheduled' WHERE id = o.id;

  -- The proof: one record, stamped with this transaction.
  INSERT INTO lesson_reschedules (original_lesson_id, replacement_lesson_id, swap_xid, accepted_by)
  VALUES (o.id, NEW.id, pg_current_xact_id(),
          CASE WHEN NEW.origin = 'teacher_proposal' THEN NEW.confirmed_by ELSE NEW.teacher_id END);

  -- Requirement 12: chapters copied, unless the change brought its own (§5.1, [PROPOSED]).
  IF NOT EXISTS (SELECT 1 FROM lesson_chapters WHERE lesson_id = NEW.id) THEN
    INSERT INTO lesson_chapters (lesson_id, position, source, book_chapter_id, topic, label, intent)
    SELECT NEW.id, position, source, book_chapter_id, topic, label, intent
    FROM lesson_chapters WHERE lesson_id = o.id ORDER BY position;
  END IF;

  -- [PROPOSED, decision 1, option R] One open copy per captured request. A request that names a
  -- chapter is copied only if the replacement has the same chapter at that position. 0033's
  -- insert rules apply, including the limit of five open requests per lesson.
  INSERT INTO material_requests (lesson_id, raised_by, lesson_position, description, note)
  SELECT NEW.id, (x ->> 'raised_by')::uuid, (x ->> 'lesson_position')::smallint, x ->> 'description', x ->> 'note'
  FROM jsonb_array_elements(reqs) x
  WHERE x ->> 'lesson_position' IS NULL
     OR EXISTS (SELECT 1 FROM lesson_chapters a JOIN lesson_chapters b
                  ON b.lesson_id = o.id AND b.position = a.position
                 AND a.book_chapter_id IS NOT DISTINCT FROM b.book_chapter_id AND a.topic IS NOT DISTINCT FROM b.topic
                WHERE a.lesson_id = NEW.id AND a.position = (x ->> 'lesson_position')::smallint);
  RETURN NEW;
END $$;
CREATE TRIGGER lessons_before_update_tl4 BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION lessons_before_update_tl4();

-- ---------------------------------------------------------------- the two-way rule, at commit
-- Fires only for an update that CHANGED status or close reason (the transition guard, for both
-- directions): later updates of an already-moved original or an already-confirmed replacement
-- (an outcome, a deleted account set to NULL) never re-run it. It re-reads the row as it will be
-- committed, because NEW may be stale if the row changed again later in the transaction.
CREATE FUNCTION lessons_two_way() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cur lessons%ROWTYPE;
  rec lesson_reschedules%ROWTYPE;
  other lessons%ROWTYPE;
BEGIN
  SELECT * INTO cur FROM lessons WHERE id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  -- Direction A: this transaction closed the row as moved.
  IF NEW.status = 'cancelled' AND NEW.close_reason = 'rescheduled'
     AND (OLD.status IS DISTINCT FROM 'cancelled' OR OLD.close_reason IS DISTINCT FROM 'rescheduled')
     AND cur.status = 'cancelled' AND cur.close_reason = 'rescheduled' THEN
    SELECT * INTO rec FROM lesson_reschedules WHERE original_lesson_id = cur.id AND swap_xid = pg_current_xact_id();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a lesson closed as moved needs its replacement, confirmed in the same step'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    SELECT * INTO other FROM lessons WHERE id = rec.replacement_lesson_id;
    IF other.status IS DISTINCT FROM 'confirmed' OR other.replaces_lesson_id IS DISTINCT FROM cur.id
       OR (other.teacher_id, other.student_id, other.subject) IS DISTINCT FROM (cur.teacher_id, cur.student_id, cur.subject) THEN
      RAISE EXCEPTION 'a lesson closed as moved needs its replacement, confirmed in the same step'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  -- Direction B: this transaction confirmed a change.
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' AND cur.replaces_lesson_id IS NOT NULL
     AND cur.status = 'confirmed' THEN
    SELECT * INTO rec FROM lesson_reschedules WHERE replacement_lesson_id = cur.id AND swap_xid = pg_current_xact_id();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a confirmed change needs its original closed as moved in the same step'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    SELECT * INTO other FROM lessons WHERE id = rec.original_lesson_id;
    IF other.id IS DISTINCT FROM cur.replaces_lesson_id OR other.status IS DISTINCT FROM 'cancelled'
       OR other.close_reason IS DISTINCT FROM 'rescheduled'
       OR (other.teacher_id, other.student_id, other.subject) IS DISTINCT FROM (cur.teacher_id, cur.student_id, cur.subject) THEN
      RAISE EXCEPTION 'a confirmed change needs its original closed as moved in the same step'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER lessons_two_way AFTER UPDATE ON lessons
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.close_reason IS DISTINCT FROM NEW.close_reason)
  EXECUTE FUNCTION lessons_two_way();

-- The same rule from the record's side: a record whose lessons don't match at commit is refused.
CREATE FUNCTION lesson_reschedules_two_way() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM lessons o JOIN lessons r ON r.id = NEW.replacement_lesson_id
       WHERE o.id = NEW.original_lesson_id AND o.status = 'cancelled' AND o.close_reason = 'rescheduled'
         AND r.status = 'confirmed' AND r.replaces_lesson_id = o.id
         AND (r.teacher_id, r.student_id, r.subject) = (o.teacher_id, o.student_id, o.subject))
     OR NEW.swap_xid <> pg_current_xact_id() THEN
    RAISE EXCEPTION 'a lesson move record needs both lessons moved in the same step'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER lesson_reschedules_two_way AFTER INSERT ON lesson_reschedules
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lesson_reschedules_two_way();

-- ---------------------------------------------------------------- copied chapters
-- 0034's lesson_chapters_before_write with ONE block added at the top: a copy written by the
-- swap. Accepted only when a move record for this lesson carries THIS transaction's id and the
-- row matches one of the original's chapters exactly (database state only). The 0034 function
-- body follows unchanged (checked by the prototype tests).

CREATE OR REPLACE FUNCTION lesson_chapters_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  tl3_l lessons%ROWTYPE;
  tl3_c record;
BEGIN
  -- TL-4 (prototype): a chapter copied by the swap, inside the swap's own transaction.
  IF TG_OP = 'INSERT' AND EXISTS (
       SELECT 1 FROM lesson_reschedules r
       JOIN lesson_chapters x ON x.lesson_id = r.original_lesson_id AND x.position = NEW.position
       WHERE r.replacement_lesson_id = NEW.lesson_id AND r.swap_xid = pg_current_xact_id()
         AND (x.source, x.book_chapter_id, x.topic, x.label, x.intent)
             IS NOT DISTINCT FROM (NEW.source, NEW.book_chapter_id, NEW.topic, NEW.label, NEW.intent)) THEN
    NEW.created_at := now();
    RETURN NEW;
  END IF;

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
END $$;
