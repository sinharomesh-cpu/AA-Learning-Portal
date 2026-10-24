-- AA Pro · 0029 Human Teacher lesson booking (M1), revision 2.
-- CR-17 PR 2, with the owner's business-scope approval of 23 Oct 2026 (16 defaults: D3A-2 to
-- D3A-7, D3A-10, D3A-13, D3A-15 to D3A-17, D3A-21 to D3A-25) and the clarifications in the scope
-- document. Revision 2 answers the owner's M1 review of 23 Oct 20:52: the database now works out
-- the reply deadline, availability and price itself, and overdue requests no longer hold a slot.
-- Additive only: one new table, one widened list (notification record types) and the standard
-- btree_gist extension. No existing row changes.
--
-- Six statuses only: requested, confirmed, declined, withdrawn, expired, cancelled. "Time no
-- longer free", "teacher deactivated" and "link ended" are REASONS on a decline or cancellation
-- by AA Pro, never statuses. The outcome after the lesson is kept apart from the status.
--
-- The database is the second line of defence behind the server. Whatever the code sends, it:
--  * accepts a request only from a parent with an ACTIVE link to the child, for a child with an
--    ACTIVE teacher link in that subject, with an approved, active teacher;
--  * accepts a start at least 24 hours and at most 4 weeks ahead (D3A-3, D3A-2), on the
--    teacher's 30-minute grid, with the whole lesson inside one of the teacher's usual-time
--    ranges, in the teacher's time zone; it re-checks the usual times when the teacher accepts;
--  * sets the reply deadline itself: 48 hours after the request, or 2 hours before the start if
--    that is sooner (D3A-5); any deadline sent by the caller is replaced;
--  * works out the price itself (D3A-21): the agreed hourly rate when the whole lesson lies in the
--    slot of an accepted hourly agreement for the same teacher, child and subject; otherwise the
--    teacher's listed hourly rate and currency. A caller value that differs is refused;
--  * allows only requested -> confirmed | declined | withdrawn | expired, and confirmed ->
--    cancelled; every time stamp comes from the database clock;
--  * never confirms a request at or after its deadline; an overdue request is expired by AA Pro,
--    either by lessons_expire_overdue() (called from the existing free CR-16 sweep, no paid
--    scheduler) or at once when someone requests the same child, teacher and start again;
--  * lets a parent or teacher cancel only while at least 30 minutes remain (30:00 allowed, 29:59
--    refused); AA Pro (teacher deactivated, link ended) until the lesson ends;
--  * never lets two confirmed lessons overlap for the same teacher, nor for the same child;
--  * keeps one open request per child, teacher and start, and at most 10 open requests per parent;
--  * never lets the request or its price snapshot be edited.
-- Human Teacher module only: nothing here is used by, or calls, any AI provider.

-- Needed for the "no overlap" rules (an equality on teacher or child combined with a time-range
-- overlap). A standard PostgreSQL contrib extension, marked "trusted" since PostgreSQL 13, so the
-- database owner can install it. If it is unavailable this whole migration fails and nothing changes.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE lessons (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id         uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  student_id         uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  -- History only (who asked). Access always goes through the CURRENT parent-child link (D3A-25).
  requested_by       uuid REFERENCES accounts (id) ON DELETE SET NULL,
  subject            text NOT NULL CHECK (valid_subjects(ARRAY[subject])),
  starts_at          timestamptz NOT NULL CHECK (starts_at = date_trunc('minute', starts_at)),
  minutes            smallint NOT NULL CHECK (minutes BETWEEN 10 AND 40 AND minutes % 5 = 0),
  ends_at            timestamptz NOT NULL,
  status             text NOT NULL DEFAULT 'requested'
                     CHECK (status IN ('requested', 'confirmed', 'declined', 'withdrawn', 'expired', 'cancelled')),
  requested_at       timestamptz NOT NULL DEFAULT now(),
  -- Set by the database (D3A-5).
  reply_deadline     timestamptz NOT NULL,
  confirmed_at       timestamptz,
  -- Who closed a request or cancelled a lesson, and when (database clock).
  closed_at          timestamptz,
  closed_by          text CHECK (closed_by IN ('parent', 'teacher', 'aa_pro')),
  closed_by_account  uuid REFERENCES accounts (id) ON DELETE SET NULL,
  close_reason       text CHECK (close_reason IN ('time_no_longer_free', 'teacher_deactivated', 'link_ended')),
  close_note         text CHECK (close_note IS NULL OR char_length(close_note) BETWEEN 1 AND 200),
  -- After the lesson (D3A-7).
  outcome            text CHECK (outcome IN ('taught', 'not_taken_place')),
  outcome_at         timestamptz,
  -- Price snapshot (D3A-21), set by the database; information only: AA Pro takes no payment (OC-03).
  currency           text NOT NULL CHECK (currency IN ('INR', 'SGD', 'USD')),
  rate_minor         bigint NOT NULL CHECK (rate_minor > 0),
  price_minor        bigint NOT NULL,
  price_basis        text NOT NULL CHECK (price_basis IN ('agreed', 'listed')),
  agreement_id       uuid REFERENCES rate_negotiations (id) ON DELETE SET NULL,

  CONSTRAINT lessons_end CHECK (ends_at = starts_at + make_interval(mins => minutes)),
  -- rate x minutes / 60, rounded once, half up, to paise or cents (CR-15, lessonPriceMinor).
  CONSTRAINT lessons_price CHECK (price_minor = (rate_minor * minutes * 2 + 60) / 120),
  -- 48 hours after the request, or 2 hours before the start if sooner (D3A-5).
  CONSTRAINT lessons_deadline CHECK (
    reply_deadline = LEAST(requested_at + interval '48 hours', starts_at - interval '2 hours')
    AND reply_deadline > requested_at),
  -- What each status must, and must not, carry.
  CONSTRAINT lessons_status_fields CHECK (
    (status = 'requested' AND confirmed_at IS NULL AND closed_at IS NULL AND closed_by IS NULL
       AND close_reason IS NULL AND close_note IS NULL)
    OR (status = 'confirmed' AND confirmed_at IS NOT NULL AND closed_at IS NULL AND closed_by IS NULL
       AND close_reason IS NULL AND close_note IS NULL)
    OR (status = 'declined' AND confirmed_at IS NULL AND closed_at IS NOT NULL AND (
         (closed_by = 'teacher' AND close_reason IS NULL)
         OR (closed_by = 'aa_pro' AND close_reason IS NOT NULL AND close_note IS NULL)))
    OR (status = 'withdrawn' AND confirmed_at IS NULL AND closed_at IS NOT NULL AND closed_by = 'parent'
       AND close_reason IS NULL AND close_note IS NULL)
    OR (status = 'expired' AND confirmed_at IS NULL AND closed_by = 'aa_pro' AND close_reason IS NULL
       AND close_note IS NULL AND closed_at >= reply_deadline)
    OR (status = 'cancelled' AND confirmed_at IS NOT NULL AND closed_at IS NOT NULL AND (
         (closed_by IN ('parent', 'teacher') AND close_reason IS NULL
            AND closed_at <= starts_at - interval '30 minutes')
         OR (closed_by = 'aa_pro' AND close_reason IN ('teacher_deactivated', 'link_ended')
            AND close_note IS NULL AND closed_at < ends_at)))
  ),
  -- A request is answered before its deadline, or not at all (D3A-5).
  CONSTRAINT lessons_confirm_in_time CHECK (confirmed_at IS NULL OR (confirmed_at >= requested_at AND confirmed_at < reply_deadline)),
  CONSTRAINT lessons_outcome CHECK (
    (outcome IS NULL AND outcome_at IS NULL)
    OR (outcome IS NOT NULL AND status = 'confirmed' AND outcome_at >= ends_at)
  ),
  -- Two confirmed lessons never overlap for the same teacher, nor for the same child, with any
  -- teacher. [start, end) ranges, so back-to-back lessons are allowed (D3A-16).
  CONSTRAINT lessons_teacher_no_overlap EXCLUDE USING gist (
    teacher_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'confirmed'),
  CONSTRAINT lessons_child_no_overlap EXCLUDE USING gist (
    student_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'confirmed')
);

-- One open request per child, teacher and start time, whichever parent asks. An overdue request
-- is expired before a new one for the same slot is saved (lessons_before_insert), so it never
-- blocks the slot.
CREATE UNIQUE INDEX lessons_one_open_request ON lessons (teacher_id, student_id, starts_at) WHERE status = 'requested';
CREATE INDEX lessons_teacher_start ON lessons (teacher_id, starts_at);
CREATE INDEX lessons_child_start ON lessons (student_id, starts_at);
CREATE INDEX lessons_open_by_parent ON lessons (requested_by) WHERE status = 'requested';
CREATE INDEX lessons_open_deadline ON lessons (reply_deadline) WHERE status = 'requested';

-- ---------------------------------------------------------------- shared checks
-- The acting parent holds an ACTIVE link to the child right now. The link row is share-locked, so
-- a revocation running at the same moment waits for this change, or this change sees it.
CREATE FUNCTION lessons_parent_ok(p_parent uuid, p_student uuid) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  RETURN p_parent IS NOT NULL AND EXISTS (
    SELECT 1 FROM guardian_links g JOIN accounts a ON a.id = g.parent_id
    WHERE g.parent_id = p_parent AND g.student_id = p_student AND g.status = 'active'
      AND a.role = 'parent' AND a.status = 'active'
    FOR SHARE OF g);
END $$;

-- The teacher is active and approved, and has an ACTIVE link to the child in this subject.
CREATE FUNCTION lessons_teacher_link_ok(p_teacher uuid, p_student uuid, p_subject text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM teacher_student_links l
    JOIN accounts a ON a.id = l.teacher_id AND a.role = 'teacher' AND a.status = 'active'
    JOIN teacher_profiles tp ON tp.account_id = l.teacher_id AND tp.approval_status = 'approved'
    WHERE l.teacher_id = p_teacher AND l.student_id = p_student AND l.status = 'active'
      AND p_subject = ANY (l.subjects)
    FOR SHARE OF l);
END $$;

-- Minutes after local midnight, and the ISO weekday (1 = Monday), of an instant in a time zone.
CREATE FUNCTION lessons_local_minute(p_at timestamptz, p_zone text) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT (extract(hour FROM p_at AT TIME ZONE p_zone) * 60 + extract(minute FROM p_at AT TIME ZONE p_zone))::int
$$;
CREATE FUNCTION lessons_local_weekday(p_at timestamptz, p_zone text) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT extract(isodow FROM p_at AT TIME ZONE p_zone)::int
$$;

-- The start is on the teacher's 30-minute grid and the whole lesson fits inside one of the
-- teacher's usual-time ranges on that day, in the teacher's time zone (scope clarification 3).
CREATE FUNCTION lessons_in_usual_time(p_teacher uuid, p_start timestamptz, p_minutes int) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM accounts a
    CROSS JOIN LATERAL (SELECT lessons_local_minute(p_start, a.time_zone) AS m,
                               lessons_local_weekday(p_start, a.time_zone) AS d) l
    JOIN teacher_usual_times u ON u.teacher_id = a.id AND u.weekday = l.d
    WHERE a.id = p_teacher AND l.m % 30 = 0
      AND u.start_minute <= l.m AND l.m + p_minutes <= u.end_minute)
$$;

-- The whole lesson lies inside an agreed slot {weekday, start, end, timeZone} (CR-15 C-12).
CREATE FUNCTION lessons_in_slot(p_slot jsonb, p_start timestamptz, p_minutes int) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT p_slot IS NOT NULL
     AND lessons_local_weekday(p_start, p_slot->>'timeZone') = (p_slot->>'weekday')::int
     AND (p_slot->>'start')::int <= lessons_local_minute(p_start, p_slot->>'timeZone')
     AND lessons_local_minute(p_start, p_slot->>'timeZone') + p_minutes <= (p_slot->>'end')::int
$$;

-- The price that applies (D3A-21): the latest accepted hourly agreement for this teacher, child
-- and subject whose slot holds the whole lesson; otherwise the teacher's listed hourly rate.
CREATE FUNCTION lessons_price_for(p_teacher uuid, p_student uuid, p_subject text, p_start timestamptz, p_minutes int,
                                  OUT basis text, OUT rate bigint, OUT cur text, OUT agreement uuid)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  SELECT 'agreed', r.agreed_amount_minor, r.currency, r.id INTO basis, rate, cur, agreement
  FROM rate_negotiations r
  WHERE r.teacher_id = p_teacher AND r.child_id = p_student AND r.subject = p_subject
    AND r.status = 'accepted' AND r.kind = 'hourly' AND r.agreed_amount_minor IS NOT NULL
    AND lessons_in_slot(r.slot, p_start, p_minutes)
  ORDER BY r.ended_at DESC, r.id
  LIMIT 1;
  IF FOUND THEN
    RETURN;
  END IF;
  SELECT 'listed', l.hourly_rate_minor, l.hourly_currency, NULL INTO basis, rate, cur, agreement
  FROM teacher_listings l WHERE l.teacher_id = p_teacher AND l.hourly_offered;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the teacher has no hourly rate' USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- ---------------------------------------------------------------- new requests
CREATE FUNCTION lessons_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
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
END $$;
CREATE TRIGGER lessons_before_insert BEFORE INSERT ON lessons FOR EACH ROW EXECUTE FUNCTION lessons_before_insert();

-- ---------------------------------------------------------------- changes
CREATE FUNCTION lessons_before_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- The request and its price snapshot never change. (requested_by and agreement_id may only be
  -- cleared, which happens when that account or agreement is deleted.)
  IF NEW.teacher_id <> OLD.teacher_id OR NEW.student_id <> OLD.student_id OR NEW.subject <> OLD.subject
     OR NEW.starts_at <> OLD.starts_at OR NEW.minutes <> OLD.minutes OR NEW.ends_at <> OLD.ends_at
     OR NEW.requested_at <> OLD.requested_at OR NEW.reply_deadline <> OLD.reply_deadline
     OR NEW.currency <> OLD.currency OR NEW.rate_minor <> OLD.rate_minor OR NEW.price_minor <> OLD.price_minor
     OR NEW.price_basis <> OLD.price_basis
     OR (NEW.requested_by IS DISTINCT FROM OLD.requested_by AND NEW.requested_by IS NOT NULL)
     OR (NEW.agreement_id IS DISTINCT FROM OLD.agreement_id AND NEW.agreement_id IS NOT NULL) THEN
    RAISE EXCEPTION 'the lesson request and its price cannot be changed' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status = 'requested' AND NEW.status IN ('confirmed', 'declined', 'withdrawn', 'expired'))
            OR (OLD.status = 'confirmed' AND NEW.status = 'cancelled')) THEN
      RAISE EXCEPTION 'a lesson cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.outcome IS DISTINCT FROM OLD.outcome THEN
      RAISE EXCEPTION 'the outcome is recorded separately' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'confirmed' THEN
      NEW.confirmed_at := now();
      -- Re-checked at the moment of acceptance (D3A-4, scope clarification 3); the deadline is
      -- checked by lessons_confirm_in_time with the same clock.
      IF NOT lessons_teacher_link_ok(NEW.teacher_id, NEW.student_id, NEW.subject) THEN
        RAISE EXCEPTION 'the teacher must be approved, active and linked to the child in this subject'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NOT lessons_in_usual_time(NEW.teacher_id, NEW.starts_at, NEW.minutes) THEN
        RAISE EXCEPTION 'the time is no longer inside the teacher''s usual times' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      NEW.closed_at := now();
      IF NEW.closed_by = 'parent' THEN
        IF NOT lessons_parent_ok(NEW.closed_by_account, NEW.student_id) THEN
          RAISE EXCEPTION 'only a parent linked to the child can do this' USING ERRCODE = 'insufficient_privilege';
        END IF;
      ELSIF NEW.closed_by = 'teacher' THEN
        IF NEW.closed_by_account IS DISTINCT FROM NEW.teacher_id THEN
          RAISE EXCEPTION 'only the lesson''s teacher can do this' USING ERRCODE = 'insufficient_privilege';
        END IF;
      ELSIF NEW.closed_by = 'aa_pro' THEN
        NEW.closed_by_account := NULL;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Same status: only the outcome may be recorded, once, on a confirmed lesson after its end.
  IF NEW.outcome IS DISTINCT FROM OLD.outcome THEN
    IF OLD.outcome IS NOT NULL THEN
      RAISE EXCEPTION 'the outcome has already been recorded' USING ERRCODE = 'check_violation';
    END IF;
    NEW.outcome_at := now();
  ELSIF NEW.outcome_at IS DISTINCT FROM OLD.outcome_at THEN
    RAISE EXCEPTION 'the outcome time comes from the database' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
     OR NEW.closed_by IS DISTINCT FROM OLD.closed_by OR NEW.close_reason IS DISTINCT FROM OLD.close_reason
     OR NEW.close_note IS DISTINCT FROM OLD.close_note
     OR (NEW.closed_by_account IS DISTINCT FROM OLD.closed_by_account AND NEW.closed_by_account IS NOT NULL) THEN
    RAISE EXCEPTION 'this lesson''s history cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lessons_before_update BEFORE UPDATE ON lessons FOR EACH ROW EXECUTE FUNCTION lessons_before_update();

-- ---------------------------------------------------------------- expiry without a scheduler
-- Expires overdue requests and returns their ids so the caller can notify each once. Meant to be
-- called from the existing CR-16 shared sweep, which runs on signed-in page loads at most once a
-- minute (no paid scheduler). Safe to run twice at once: rows another sweep holds are skipped.
CREATE FUNCTION lessons_expire_overdue(p_limit int DEFAULT 200) RETURNS SETOF uuid LANGUAGE sql AS $$
  UPDATE lessons SET status = 'expired', closed_by = 'aa_pro'
  WHERE id IN (SELECT id FROM lessons WHERE status = 'requested' AND reply_deadline <= now()
               ORDER BY reply_deadline LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING id
$$;

-- ---------------------------------------------------------------- widened list
-- CR-16 / D3A-10: lesson notifications point at a lesson record.
ALTER TABLE notifications DROP CONSTRAINT notifications_entity_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_entity_type_check CHECK (entity_type IN (
  'enquiry', 'link_request', 'rate_proposal', 'resource_share', 'listing', 'learning_package', 'teacher_profile',
  'assignment', 'lesson'));
