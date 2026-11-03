-- TL-4 CONSOLIDATED SQL FOR TECHNICAL REVIEW (local draft, NOT a migration). No number is assigned
-- (0036 is reserved conditionally, not approved) and this file is outside db/migrations, so no migration run, gate
-- or checksum sees it. It implements the signed-off TL-4 specification: Evidence Pack revisions
-- 4.1 to 4.3 (BA sign-off 2 Nov 2026, 22:57 IST; PO decisions D1-D4, Q-A, Q-B, R1-R3, PO-D5 to
-- PO-D8), plus the PO decisions of 3 Nov 2026 (received 21:17 IST): DEF-TL4-07 Option B,
-- DEF-TL4-08 Option B and F-2 (a move's chapters come only with the move). 0036 is reserved for it
-- conditionally (PO, 3 Nov 2026); that is not migration approval. Applying it anywhere other than a
-- throw-away database needs the review, CI, push and apply gates; none is granted by this file.
--
-- 0033 and 0034 are NOT edited. TL-4 adds its OWN triggers (BEFORE triggers fire in name order, so
-- *_tl4 runs after the 0029/0033/0034 trigger of the same table) and replaces exactly two earlier
-- function bodies: lesson_chapters_before_write (0034's body plus one TL-4 block at the top) and
-- lessons_before_insert (0034's body plus one predicate in the busy check; review F-1).
-- Overlap with TU (not yet written): lessons_status_fields, lessons_close_reason_check,
-- lessons_before_insert and lesson_chapters_before_write; whichever is numbered second carries the
-- other's versions.
--
-- Contents:
--   1. lessons: replaces_lesson_id, close reason 'rescheduled', deadline rule, one open change.
--   2. lesson_reschedules: the swap record (swap_xid proof).
--   3. Starting a change: 0034's busy check no longer counts the change's own original (F-1);
--      an overdue open change of the same original is expired first (F-6); same
--      teacher/child/subject; original confirmed, no outcome; deadline at creation, refused if
--      <= the proposal time (so the original must start > 30 min later); 24 h to 4 weeks from the
--      proposal (PO-D5) via 0029's existing rule; projected parent check (C-1).
--   4. The swap: Q-B mapping (M1-M8), per-lesson limit, per-parent rule (PO-D6 to PO-D8, C-2 to C-4:
--      parents locked and counted before, re-counted after the writes, F-7), originals closed
--      'carried_forward', copies with the same logical_request_id, mapping rows.
--   4a. Original cancelled another way: its open change closes as 'original_cancelled' (DEF-TL4-08).
--   5. The two-way rule and mapping completeness, at commit.
--   6. material_requests: logical_request_id (backfilled), one open row per logical request,
--      close reason 'carried_forward'.
--   7. lesson_reschedule_requests: the request mapping (append-only, swap-only).
--   8. lesson_chapters_before_write: 0034 + the swap's chapter copy (only onto a change with no
--      chapters of its own, F-8) + no planned chapters added to a change after it is created (F-2).

-- ---------------------------------------------------------------- the link
ALTER TABLE lessons ADD COLUMN replaces_lesson_id uuid REFERENCES lessons (id);

-- 'rescheduled' as a close reason, only on a cancelled lesson closed by AA Pro at least 30
-- minutes before its start (requirement 9). Every existing branch is unchanged.
ALTER TABLE lessons DROP CONSTRAINT lessons_close_reason_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_close_reason_check
  CHECK (close_reason IN ('time_no_longer_free', 'teacher_deactivated', 'link_ended', 'rescheduled',
                          'original_cancelled'));
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

-- ---------------------------------------------------------------- the busy check (review F-1)
-- 0034's lessons_before_insert, replaced with ONE predicate added to its D-TLS-3 busy check: a change
-- does not conflict with the very lesson it replaces. That lesson is closed in the same transaction
-- that confirms the change, before the replacement row is written, so 0029's no-overlap exclusion
-- constraints still guard the final state. lessons_before_insert_tl4 (fires next, name order)
-- refuses a replaces_lesson_id that is not a confirmed lesson of the same teacher, child and
-- subject, so the exception can't be borrowed. Every other line is 0034's (a test compares them).
CREATE OR REPLACE FUNCTION lessons_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
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
                 AND tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
                 AND x.id IS DISTINCT FROM NEW.replaces_lesson_id) THEN
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
END $$;


-- ---------------------------------------------------------------- starting a change
-- Runs after lessons_before_insert (name order), which has already applied the ordinary request
-- or proposal rules (24 hours to 4 weeks ahead, price snapshot, link, limits: decision 2 "Yes"
-- falls out of these, because a change is an ordinary open request or proposal).
CREATE FUNCTION lessons_before_insert_tl4() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  o lessons%ROWTYPE;
  n_open int;
  n_carry int;
BEGIN
  IF NEW.replaces_lesson_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO o FROM lessons WHERE id = NEW.replaces_lesson_id FOR SHARE;
  IF NOT FOUND OR (o.teacher_id, o.student_id, o.subject) IS DISTINCT FROM (NEW.teacher_id, NEW.student_id, NEW.subject) THEN
    RAISE EXCEPTION 'a change is for a lesson of the same teacher, child and subject' USING ERRCODE = 'check_violation';
  END IF;
  -- F-6: an open change of the same original whose reply deadline has passed but which no sweep has
  -- closed yet would block this one (lessons_one_open_change); expire it first, as 0029 and 0034
  -- do for a request or proposal at the same slot.
  UPDATE lessons SET status = 'expired', closed_by = 'aa_pro'
  WHERE replaces_lesson_id = NEW.replaces_lesson_id AND status IN ('requested', 'proposed')
    AND reply_deadline <= now();
  -- Requirement 3, at initiation.
  IF o.status <> 'confirmed' OR o.outcome IS NOT NULL OR o.starts_at < now() + interval '30 minutes' THEN
    RAISE EXCEPTION 'only a confirmed lesson at least 30 minutes away can be moved' USING ERRCODE = 'check_violation';
  END IF;
  -- A replacement may itself be moved later: it is an ordinary confirmed lesson.
  -- Requirement 6: the earliest of the three.
  NEW.reply_deadline := LEAST(NEW.requested_at + interval '48 hours', NEW.starts_at - interval '2 hours',
                              o.starts_at - interval '30 minutes');
  -- AC-1 / AC-4: the deadline is fixed at creation and must be after it. Only the original's term
  -- can reach it (R >= P + 24 h by 0029), so the original must start MORE than 30 minutes later.
  IF NEW.reply_deadline <= NEW.requested_at THEN
    RAISE EXCEPTION 'the lesson starts too soon to move' USING ERRCODE = 'check_violation';
  END IF;
  -- C-1: the parent rule, projected. The swap closes every open request of the original (closures)
  -- and copies each one that is carried (copies: the same open requests, one for one); both are
  -- counted here as the swap will count them. The authoritative check is at the swap (F-7).
  SELECT count(*)::int INTO n_open FROM material_requests WHERE lesson_id = o.id AND status = 'open';
  SELECT count(*)::int INTO n_carry FROM material_requests m
  WHERE m.lesson_id = o.id AND m.status = 'open' AND m.logical_request_id IS NOT NULL;
  PERFORM tl4_parent_rule_check(o.student_id, n_carry - n_open);
  RETURN NEW;
END $$;
CREATE TRIGGER lessons_before_insert_tl4 BEFORE INSERT ON lessons
  FOR EACH ROW EXECUTE FUNCTION lessons_before_insert_tl4();

-- ---------------------------------------------------------------- the swap
-- Runs when a change (requested or proposed, replaces_lesson_id set) is confirmed. Everything below
-- happens in the accepting transaction; any exception rolls all of it back, so the original stays
-- confirmed with its requests open and no copy, record or mapping remains (atomic swap, AC-6/7).
CREATE FUNCTION lessons_before_update_tl4() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  o lessons%ROWTYPE;
  req record;
  carried jsonb := '[]'::jsonb;
  x jsonb;
  own_chapters boolean;
  tgt smallint;
  n int;
  kind text;
  copies_planned int;
  closures_planned int;
  copies_written int := 0;
  parents_before jsonb;
  rs_id uuid;
  copy_id uuid;
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

  -- Q-B: did the change bring its own chapters (C2), or are the original's carried (C1)?
  own_chapters := EXISTS (SELECT 1 FROM lesson_chapters WHERE lesson_id = NEW.id);

  -- D1 / Q-A / Q-B: capture, lock and MAP every open request of the original BEFORE anything is
  -- written. A parent's answer in flight holds the request row: this waits, then re-reads it, so an
  -- answered request is not carried (M8). Any request that cannot be mapped refuses the move (M4,
  -- M6, M7): nothing is ever dropped, guessed or attached to another chapter.
  FOR req IN SELECT m.id, m.logical_request_id, m.lesson_position, m.description, m.note,
                    c.book_chapter_id, c.topic
             FROM material_requests m
             LEFT JOIN lesson_chapters c ON c.lesson_id = m.lesson_id AND c.position = m.lesson_position
             WHERE m.lesson_id = o.id AND m.status = 'open'
             ORDER BY m.created_at, m.id FOR UPDATE OF m LOOP
    IF req.lesson_position IS NULL THEN
      tgt := NULL; kind := 'description';                                -- M1
    ELSIF NOT own_chapters THEN
      tgt := req.lesson_position; kind := 'same_position';               -- M2 (chapters copied row for row)
    ELSE
      IF req.book_chapter_id IS NOT NULL THEN                            -- M3 / M4: by book chapter id
        SELECT count(*)::int, min(position) INTO n, tgt FROM lesson_chapters
        WHERE lesson_id = NEW.id AND book_chapter_id = req.book_chapter_id;
      ELSIF req.topic IS NOT NULL THEN                                   -- M5 / M6: exact topic only
        SELECT count(*)::int, min(position) INTO n, tgt FROM lesson_chapters
        WHERE lesson_id = NEW.id AND topic = req.topic;
      ELSE
        n := 0;                                                          -- M7: chapter link lost
      END IF;
      IF n <> 1 THEN
        RAISE EXCEPTION 'material_request_unmappable: a material request is about a chapter that is not on the new lesson'
          USING ERRCODE = 'check_violation';
      END IF;
      kind := 'remapped_position';
    END IF;
    carried := carried || jsonb_build_object('id', req.id, 'logical', req.logical_request_id,
      'from', req.lesson_position, 'to', tgt, 'description', req.description, 'note', req.note, 'kind', kind);
  END LOOP;

  -- F-7: counted separately. Copies: what the mapping above plans to write. Closures: every open
  -- request on the original, which 0033 closes with the original.
  copies_planned := jsonb_array_length(carried);
  SELECT count(*)::int INTO closures_planned FROM material_requests WHERE lesson_id = o.id AND status = 'open';

  -- L-MR-lesson (TL2-3): at most five open requests on the replacement, its own plus the carried.
  -- (0034's insert rule enforces the same; this gives the named refusal before any write.)
  IF (SELECT count(*) FROM material_requests WHERE lesson_id = NEW.id AND status = 'open') + copies_planned > 5 THEN
    RAISE EXCEPTION 'material_request_limit: the new lesson would have more than five open material requests'
      USING ERRCODE = 'check_violation';
  END IF;

  -- L-MR-parent (PO-D6 to PO-D8, C-2 to C-4): the move's own effect on every active parent of the
  -- child, under parent locks in id order. Planned first (copies - closures), then (F-7) each
  -- parent's count is measured before any write and again after the last one, still under the same
  -- locks, and after <= max(5, before) is checked on the real counts. The effect is 0 by design
  -- (one copy per closure, both lessons live); the re-count catches any write that breaks that.
  PERFORM tl4_parent_rule_check(o.student_id, copies_planned - closures_planned);
  parents_before := tl4_parent_snapshot(o.student_id);

  -- Close the original. lessons_before_update (0029 rules) sets closed_at and clears
  -- closed_by_account; 0030 drops its meeting link; 0033 closes its open requests, and
  -- material_requests_before_write_tl4 records those closures as 'carried_forward'.
  UPDATE lessons SET status = 'cancelled', closed_by = 'aa_pro', close_reason = 'rescheduled' WHERE id = o.id;

  -- The proof: one record, stamped with this transaction.
  INSERT INTO lesson_reschedules (original_lesson_id, replacement_lesson_id, swap_xid, accepted_by)
  VALUES (o.id, NEW.id, pg_current_xact_id(),
          CASE WHEN NEW.origin = 'teacher_proposal' THEN NEW.confirmed_by ELSE NEW.teacher_id END)
  RETURNING id INTO rs_id;

  -- C1: the original's chapters copied row for row (Q-B); C2: the change's own chapters stay.
  IF NOT own_chapters THEN
    INSERT INTO lesson_chapters (lesson_id, position, source, book_chapter_id, topic, label, intent)
    SELECT NEW.id, position, source, book_chapter_id, topic, label, intent
    FROM lesson_chapters WHERE lesson_id = o.id ORDER BY position;
  END IF;

  -- One open copy per carried request, keeping its logical identity, and one mapping row each.
  -- 0034's insert rules still apply to every copy (linked teacher, limit of five per lesson).
  FOR x IN SELECT * FROM jsonb_array_elements(carried) LOOP
    INSERT INTO material_requests (lesson_id, raised_by, lesson_position, description, note, logical_request_id)
    VALUES (NEW.id, NEW.teacher_id, (x ->> 'to')::smallint, x ->> 'description', x ->> 'note',
            (x ->> 'logical')::uuid)
    RETURNING id INTO copy_id;
    INSERT INTO lesson_reschedule_requests (reschedule_id, logical_request_id, original_request_id,
                                            replacement_request_id, original_position, replacement_position, kind)
    VALUES (rs_id, (x ->> 'logical')::uuid, (x ->> 'id')::uuid, copy_id,
            (x ->> 'from')::smallint, (x ->> 'to')::smallint, x ->> 'kind');
    copies_written := copies_written + 1;
  END LOOP;
  -- F-7: what was written matches what was planned, and the parents' real counts obey the rule.
  IF copies_written <> copies_planned
     OR (SELECT count(*) FROM material_requests WHERE lesson_id = o.id AND status = 'open') <> 0 THEN
    RAISE EXCEPTION 'the move did not carry every open material request' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM tl4_parent_verify(parents_before);
  RETURN NEW;
END $$;
CREATE TRIGGER lessons_before_update_tl4 BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION lessons_before_update_tl4();

-- ---------------------------------------------------------------- original cancelled (DEF-TL4-08)
-- When a confirmed original is cancelled in any other way (by a parent, the teacher, or AA Pro for
-- a deactivated teacher or an ended link), its open change can never be accepted. Close it at once,
-- in the same transaction, as declined by AA Pro with the reason 'original_cancelled'. The change
-- row is kept as history (never deleted); 0033's close trigger closes any material requests raised
-- on the change itself. A move's own swap ('rescheduled') never reaches this: it closes the
-- original only while confirming its one change.
CREATE FUNCTION lessons_after_update_tl4() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'confirmed' AND NEW.status = 'cancelled' AND NEW.close_reason IS DISTINCT FROM 'rescheduled' THEN
    UPDATE lessons SET status = 'declined', closed_by = 'aa_pro', close_reason = 'original_cancelled'
    WHERE replaces_lesson_id = NEW.id AND status IN ('requested', 'proposed');
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER lessons_after_update_tl4 AFTER UPDATE OF status ON lessons
  FOR EACH ROW EXECUTE FUNCTION lessons_after_update_tl4();

-- 'original_cancelled' is only ever the close reason of a change (a lesson that replaces another).
ALTER TABLE lessons ADD CONSTRAINT lessons_original_cancelled_change_only
  CHECK (close_reason IS DISTINCT FROM 'original_cancelled' OR replaces_lesson_id IS NOT NULL);

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
  -- Mapping completeness (Q-B audit): every request carried forward from the original has exactly
  -- one mapping row in this move, and every mapping row belongs to a carried request.
  IF EXISTS (SELECT 1 FROM material_requests m
             WHERE m.lesson_id = NEW.original_lesson_id AND m.close_reason = 'carried_forward'
               AND (SELECT count(*) FROM lesson_reschedule_requests x
                    WHERE x.reschedule_id = NEW.id AND x.original_request_id = m.id) <> 1)
     OR EXISTS (SELECT 1 FROM lesson_reschedule_requests x
                JOIN material_requests m ON m.id = x.original_request_id
                WHERE x.reschedule_id = NEW.id AND m.close_reason IS DISTINCT FROM 'carried_forward') THEN
    RAISE EXCEPTION 'every carried material request needs exactly one mapping in the same step'
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
-- body follows unchanged (checked by tests/db/tl4Prototype.test.ts).

CREATE OR REPLACE FUNCTION lesson_chapters_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  tl3_l lessons%ROWTYPE;
  tl3_c record;
BEGIN
  -- TL-4: a chapter copied by the swap, inside the swap's own transaction.
  IF TG_OP = 'INSERT' AND EXISTS (
       SELECT 1 FROM lesson_reschedules r
       JOIN lesson_chapters x ON x.lesson_id = r.original_lesson_id AND x.position = NEW.position
       WHERE r.replacement_lesson_id = NEW.lesson_id AND r.swap_xid = pg_current_xact_id()
         AND (x.source, x.book_chapter_id, x.topic, x.label, x.intent)
             IS NOT DISTINCT FROM (NEW.source, NEW.book_chapter_id, NEW.topic, NEW.label, NEW.intent))
     -- F-8: only onto a change with no chapters of its own (C1). Its own chapters were written when
     -- it was created, in an earlier transaction; a copy is written now.
     AND NOT EXISTS (SELECT 1 FROM lesson_chapters y WHERE y.lesson_id = NEW.lesson_id AND y.created_at <> now()) THEN
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  -- F-2 (Q-B): a change's chapters are either its own, given when it is created, or the original's,
  -- copied by the swap; never a mix. So no planned chapter is added to a change once it exists
  -- (0034 otherwise lets a teacher plan chapters while accepting a parent's request).
  IF TG_OP = 'INSERT' AND NEW.source = 'planned' AND EXISTS (
       SELECT 1 FROM lessons l WHERE l.id = NEW.lesson_id AND l.replaces_lesson_id IS NOT NULL
         AND NOT (l.status = 'proposed' AND l.requested_at = now())) THEN
    RAISE EXCEPTION 'a moved lesson''s chapters come with the move itself' USING ERRCODE = 'check_violation';
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

-- ---------------------------------------------------------------- material requests (TL-4)
-- 0033's table is changed here, by the new migration; 0033's file and checksum are untouched.

-- History: a request carried to the replacement closes as 'carried_forward', distinct from
-- 'lesson_closed' (no longer needed) and 'lesson_ended'.
ALTER TABLE material_requests DROP CONSTRAINT material_requests_close_reason_check;
ALTER TABLE material_requests ADD CONSTRAINT material_requests_close_reason_check
  CHECK (close_reason IN ('lesson_closed', 'lesson_ended', 'carried_forward'));

-- Q-A: explicit logical identity. A request's own id, except a copy made by a move, which keeps
-- the original's logical id. Never inferred from chapter, topic or description; never changes.
ALTER TABLE material_requests ADD COLUMN logical_request_id uuid;

CREATE FUNCTION material_requests_before_write_tl4() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.logical_request_id IS NULL OR NEW.logical_request_id = NEW.id THEN
      NEW.logical_request_id := NEW.id;           -- an ordinary new request (TL-2 unchanged)
      RETURN NEW;
    END IF;
    -- A copy made by a move, inside the move's own transaction (database state only): the move
    -- record for this lesson carries this transaction's id, and the original request with the
    -- same logical id is on that move's original lesson, closed as carried_forward just now.
    IF NOT EXISTS (
         SELECT 1 FROM lesson_reschedules r
         JOIN material_requests m ON m.lesson_id = r.original_lesson_id
         WHERE r.replacement_lesson_id = NEW.lesson_id AND r.swap_xid = pg_current_xact_id()
           AND m.logical_request_id = NEW.logical_request_id
           AND m.status = 'no_longer_needed' AND m.close_reason = 'carried_forward' AND m.closed_at = now()) THEN
      RAISE EXCEPTION 'a material request keeps another request''s identity only when a lesson move carries it'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: the logical id never changes (the one-time backfill below sets it from NULL to the id).
  IF NEW.logical_request_id IS DISTINCT FROM OLD.logical_request_id
     AND NOT (OLD.logical_request_id IS NULL AND NEW.logical_request_id = NEW.id) THEN
    RAISE EXCEPTION 'a material request''s identity cannot change' USING ERRCODE = 'check_violation';
  END IF;
  -- A closure by AA Pro because the lesson was moved (its lesson closed as 'rescheduled' in this
  -- transaction) is recorded as carried_forward; the move copies every such request.
  IF OLD.status = 'open' AND NEW.status = 'no_longer_needed' AND NEW.closed_by = 'aa_pro'
     AND NEW.close_reason = 'lesson_closed'
     AND EXISTS (SELECT 1 FROM lessons l WHERE l.id = NEW.lesson_id AND l.status = 'cancelled'
                   AND l.close_reason = 'rescheduled' AND l.closed_at = now()) THEN
    NEW.close_reason := 'carried_forward';
  END IF;
  -- carried_forward is written only that way.
  IF NEW.close_reason = 'carried_forward' AND OLD.close_reason IS DISTINCT FROM 'carried_forward'
     AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = NEW.lesson_id AND l.status = 'cancelled'
                       AND l.close_reason = 'rescheduled' AND l.closed_at = now()) THEN
    RAISE EXCEPTION 'carried_forward is set only by a lesson move' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
-- Fires after material_requests_before_write (BEFORE triggers run in name order).
CREATE TRIGGER material_requests_before_write_tl4 BEFORE INSERT OR UPDATE ON material_requests
  FOR EACH ROW EXECUTE FUNCTION material_requests_before_write_tl4();

-- One-time backfill (a data change on every existing row when applied): each existing request is
-- its own logical request. Allowed by 0034's update rule (nothing it checks changes) and by the
-- TL-4 rule above (NULL -> own id only).
UPDATE material_requests SET logical_request_id = id WHERE logical_request_id IS NULL;
ALTER TABLE material_requests ALTER COLUMN logical_request_id SET NOT NULL;

-- A logical request is open at most once, anywhere: no double counting by construction.
CREATE UNIQUE INDEX material_requests_one_open_logical ON material_requests (logical_request_id)
  WHERE status = 'open';

-- ---------------------------------------------------------------- the request mapping (Q-B audit)
CREATE TABLE lesson_reschedule_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reschedule_id           uuid NOT NULL REFERENCES lesson_reschedules (id) ON DELETE CASCADE,
  logical_request_id      uuid NOT NULL,
  original_request_id     uuid NOT NULL UNIQUE REFERENCES material_requests (id) ON DELETE CASCADE,
  replacement_request_id  uuid NOT NULL UNIQUE REFERENCES material_requests (id) ON DELETE CASCADE,
  original_position       smallint,
  replacement_position    smallint,
  kind                    text NOT NULL CHECK (kind IN ('description', 'same_position', 'remapped_position')),
  swap_xid                xid8 NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_reschedule_requests_two_rows CHECK (original_request_id <> replacement_request_id),
  CONSTRAINT lesson_reschedule_requests_kind CHECK (
    (kind = 'description' AND original_position IS NULL AND replacement_position IS NULL)
    OR (kind = 'same_position' AND original_position IS NOT NULL AND replacement_position = original_position)
    OR (kind = 'remapped_position' AND original_position IS NOT NULL AND replacement_position IS NOT NULL))
);

CREATE FUNCTION lesson_reschedule_requests_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r lesson_reschedules%ROWTYPE;
  a material_requests%ROWTYPE;
  b material_requests%ROWTYPE;
  ca lesson_chapters%ROWTYPE;
  cb lesson_chapters%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only with its move or requests (ON DELETE CASCADE, i.e. a lesson being deleted).
    IF EXISTS (SELECT 1 FROM lesson_reschedules WHERE id = OLD.reschedule_id)
       AND EXISTS (SELECT 1 FROM material_requests WHERE id = OLD.original_request_id)
       AND EXISTS (SELECT 1 FROM material_requests WHERE id = OLD.replacement_request_id) THEN
      RAISE EXCEPTION 'a request mapping cannot be removed' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a request mapping cannot change' USING ERRCODE = 'check_violation';
  END IF;
  -- INSERT, inside the move's own transaction, from database state only.
  NEW.swap_xid := pg_current_xact_id();
  NEW.created_at := now();
  SELECT * INTO r FROM lesson_reschedules WHERE id = NEW.reschedule_id;
  SELECT * INTO a FROM material_requests WHERE id = NEW.original_request_id;
  SELECT * INTO b FROM material_requests WHERE id = NEW.replacement_request_id;
  IF r.id IS NULL OR r.swap_xid <> pg_current_xact_id()
     OR a.id IS NULL OR a.lesson_id <> r.original_lesson_id
     OR a.status <> 'no_longer_needed' OR a.close_reason IS DISTINCT FROM 'carried_forward'
     OR b.id IS NULL OR b.lesson_id <> r.replacement_lesson_id OR b.status <> 'open'
     OR a.logical_request_id <> NEW.logical_request_id OR b.logical_request_id <> NEW.logical_request_id
     OR a.lesson_position IS DISTINCT FROM NEW.original_position
     OR b.lesson_position IS DISTINCT FROM NEW.replacement_position
     OR a.description IS DISTINCT FROM b.description OR a.note IS DISTINCT FROM b.note THEN
    RAISE EXCEPTION 'a request mapping is written only by the move that carries the request'
      USING ERRCODE = 'check_violation';
  END IF;
  -- The same chapter identity on both sides: the same book chapter, or exactly the same topic.
  IF NEW.kind <> 'description' THEN
    SELECT * INTO ca FROM lesson_chapters WHERE lesson_id = r.original_lesson_id AND position = NEW.original_position;
    SELECT * INTO cb FROM lesson_chapters WHERE lesson_id = r.replacement_lesson_id AND position = NEW.replacement_position;
    IF ca.lesson_id IS NULL OR cb.lesson_id IS NULL
       OR NOT ((ca.book_chapter_id IS NOT NULL AND cb.book_chapter_id = ca.book_chapter_id)
               OR (ca.book_chapter_id IS NULL AND ca.topic IS NOT NULL AND cb.topic = ca.topic)
               OR (NEW.kind = 'same_position'
                   AND (ca.source, ca.book_chapter_id, ca.topic, ca.label, ca.intent)
                       IS NOT DISTINCT FROM (cb.source, cb.book_chapter_id, cb.topic, cb.label, cb.intent))) THEN
      RAISE EXCEPTION 'a request is mapped only to the same chapter on the new lesson' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lesson_reschedule_requests_before_write BEFORE INSERT OR UPDATE OR DELETE ON lesson_reschedule_requests
  FOR EACH ROW EXECUTE FUNCTION lesson_reschedule_requests_before_write();

-- ---------------------------------------------------------------- the per-parent rule (Q-A)
-- C-2: a parent's open material requests = open requests on LIVE lessons (requested or proposed
-- before their reply deadline, or confirmed and not ended) of every child the parent is actively
-- linked to (PO-D7), exactly as the application counts them (materialRequests.ts openMaterialRequestCount).
CREATE FUNCTION tl4_parent_open_count(p_parent uuid) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT count(*)::int FROM material_requests m JOIN lessons l ON l.id = m.lesson_id
  WHERE m.status = 'open'
    AND ((l.status IN ('requested', 'proposed') AND l.reply_deadline > now())
         OR (l.status = 'confirmed' AND l.ends_at > now()))
    AND EXISTS (SELECT 1 FROM guardian_links g JOIN accounts p ON p.id = g.parent_id
                WHERE g.parent_id = p_parent AND g.student_id = l.student_id AND g.status = 'active'
                  AND p.role = 'parent' AND p.status = 'active')
$$;

-- PO-D6 to PO-D8, C-3, C-4: for every active parent of the child, independently, in parent-id order
-- (a transaction advisory lock per parent): after = before + the move's own effect, and
-- after <= max(5, before). Ordinary TL-2 request creation takes no parent lock and is not capped (PO-D6).
CREATE FUNCTION tl4_parent_rule_check(p_student uuid, p_delta int) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  p record;
  before_n int;
BEGIN
  FOR p IN SELECT g.parent_id FROM guardian_links g JOIN accounts a ON a.id = g.parent_id
           WHERE g.student_id = p_student AND g.status = 'active' AND a.role = 'parent' AND a.status = 'active'
           ORDER BY g.parent_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('aa_pro.tl4_parent:' || p.parent_id::text, 0));
    before_n := tl4_parent_open_count(p.parent_id);
    IF before_n + p_delta > GREATEST(5, before_n) THEN
      RAISE EXCEPTION 'material_request_parent_limit: a parent would have more open material requests than allowed (before %, after %)',
        before_n, before_n + p_delta USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
END $$;

-- F-7: the swap's authoritative check on real counts. tl4_parent_snapshot locks every active parent
-- of the child in parent-id order (the same advisory locks) and returns each one's count before the
-- swap writes anything; tl4_parent_verify re-counts each of them after the writes, in the same
-- transaction and under the same locks, and refuses if after > max(5, before) (C-3).
CREATE FUNCTION tl4_parent_snapshot(p_student uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  p record;
  snap jsonb := '{}'::jsonb;
BEGIN
  FOR p IN SELECT g.parent_id FROM guardian_links g JOIN accounts a ON a.id = g.parent_id
           WHERE g.student_id = p_student AND g.status = 'active' AND a.role = 'parent' AND a.status = 'active'
           ORDER BY g.parent_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('aa_pro.tl4_parent:' || p.parent_id::text, 0));
    snap := snap || jsonb_build_object(p.parent_id::text, tl4_parent_open_count(p.parent_id));
  END LOOP;
  RETURN snap;
END $$;

CREATE FUNCTION tl4_parent_verify(p_before jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  k text;
  before_n int;
  after_n int;
BEGIN
  FOR k IN SELECT jsonb_object_keys(p_before) ORDER BY 1 LOOP
    before_n := (p_before ->> k)::int;
    after_n := tl4_parent_open_count(k::uuid);
    IF after_n > GREATEST(5, before_n) THEN
      RAISE EXCEPTION 'material_request_parent_limit: a parent would have more open material requests than allowed (before %, after %)',
        before_n, after_n USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
END $$;
