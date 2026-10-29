-- AA Pro · 0034 teacher proposals (TL-3).
-- Owner approval of the TL-3 business decisions (29 Oct 2026, 14:25 IST): D-TLS-1, D-TLS-2, D-TLS-3,
-- D-TLS-5, D-TLS-12, D-TLS-13, D-E2E-2, D-E2E-3 (b), D-E2E-4, TL3-1 to TL3-5, and TL3-6 = Option D
-- (no rollback script: a defect is corrected by a new, reviewed forward migration; the
-- `before-TL3` restore point is the last resort). There is therefore NO db/rollback/0034 file.
-- This SQL is TEXT FOR REVIEW: pushing it, merging it and applying it to any shared database each
-- need the owner's separate written approval.
--
-- What changes (and nothing else):
--  * lessons: three new columns (origin, proposed_by, confirmed_by), one new status ('proposed'),
--    the status check and the status-fields rule widened, one new rule (lessons_origin), two
--    indexes;
--  * lessons_before_insert, lessons_before_update, lessons_expire_overdue (0029): replaced. The
--    first two keep 0029's text for a parent's request BYTE FOR BYTE, as an inner block reached
--    only when the row is not a proposal (a test compares the function bodies);
--  * lesson_chapters (0032): source may now be 'planned'; lesson_chapters_before_write replaced,
--    keeping 0032's text byte for byte for parent-requested chapters;
--  * material_requests_before_write (0033): replaced; three status lists gain 'proposed' (the
--    only edits, also checked by a test).
-- No existing row changes: every existing lesson becomes origin = 'parent_request', with
-- proposed_by and confirmed_by empty. Tables 0030 (meeting links) and 0031 (kept lessons) are
-- unchanged and still accept confirmed lessons only, so a proposal never gets a meeting link.
--
-- Whatever the application sends, the database:
--  * accepts a proposal only from the lesson's own teacher (proposed_by = teacher_id, no
--    requested_by), approved, active and ACTIVELY linked to an active child in a ticked subject
--    (D-TLS-2);
--  * accepts a start 24 hours to 4 weeks ahead, on any 5-minute step, NOT limited to the teacher's
--    usual times, for 10 to 40 minutes in 5-minute steps (D-TLS-3; the minutes rule is 0029's);
--  * refuses a proposal that overlaps a confirmed lesson of the teacher or of the child (D-TLS-3);
--    an open proposal holds no time (TL3-4): requests and other proposals for the same time stay
--    possible, and the first one confirmed wins through 0029's no-overlap rules;
--  * sets the reply deadline itself: 48 hours after the proposal, or 2 hours before the start if
--    sooner (D-TLS-5, as D3A-5), and keeps one open proposal per teacher, child and start time
--    and at most 10 open proposals per teacher and child, serialised so two sent at once can't
--    make an 11th (D-TLS-5);
--  * works out the price snapshot exactly as for a request; no hourly price, no proposal
--    (D-TLS-12; information only, OC-03);
--  * lets only an active parent of the child accept (recorded in confirmed_by) or decline (with
--    an optional reason of up to 200 characters), only the proposing teacher withdraw, and only
--    AA Pro expire a proposal or close it ("time no longer free", "link ended", "teacher
--    deactivated"); a student can do none of these (D-TLS-2, OC-06);
--  * re-checks the teacher's link when a parent accepts, and never confirms at or after the
--    deadline (0029's lessons_confirm_in_time); a confirmed proposal is then an ordinary
--    confirmed lesson: cancellation, outcome, meeting links and OC-53 apply unchanged;
--  * never lets who started a lesson (origin, proposed_by) or who accepted it (confirmed_by) be
--    changed or blanked while that account exists (proposal history, TL3-6 Option D);
--  * accepts teacher-planned chapters only from books the teacher can already view, never a
--    free-text topic (TL3-2), only in the transaction that creates the proposal or in the one
--    where the teacher accepts a parent's request (D-E2E-3 (b)), and at most five chapters in
--    total per lesson (D-E2E-2: 0032's positions 1 to 5);
--  * accepts material requests on open proposals (TL3-1); 0033's close trigger already closes
--    them when the proposal is declined, withdrawn or expires.
-- Notifications stay in-app, written by application code; nothing here sends email or WhatsApp.

-- ---------------------------------------------------------------- lessons: who started it
ALTER TABLE lessons
  ADD COLUMN origin       text NOT NULL DEFAULT 'parent_request'
                          CHECK (origin IN ('parent_request', 'teacher_proposal')),
  -- History only: the teacher who proposed. Always equals teacher_id when written; teacher_id
  -- (0029, ON DELETE CASCADE) keeps the teacher's identity for as long as the lesson row exists.
  ADD COLUMN proposed_by  uuid REFERENCES accounts (id) ON DELETE SET NULL,
  -- History only: the parent who accepted a proposal. Empty for requests (the teacher accepts those).
  -- ON DELETE SET NULL, like requested_by (0029): if a parent account were ever erased, the fact
  -- that a parent accepted (status, confirmed_at, origin) stays and only the identity goes. AA Pro
  -- has no account-deletion path today, and an account named in audit_events cannot be deleted
  -- (0001's append-only guard), so in practice the identity is kept.
  ADD COLUMN confirmed_by uuid REFERENCES accounts (id) ON DELETE SET NULL;

ALTER TABLE lessons ADD CONSTRAINT lessons_origin CHECK (
  (origin = 'parent_request' AND proposed_by IS NULL AND confirmed_by IS NULL)
  OR (origin = 'teacher_proposal' AND requested_by IS NULL));

ALTER TABLE lessons DROP CONSTRAINT lessons_status_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_status_check
  CHECK (status IN ('requested', 'proposed', 'confirmed', 'declined', 'withdrawn', 'expired', 'cancelled'));

-- 0029's rule with the proposal branches added. Every branch for a parent's request is unchanged;
-- each existing row is a parent's request, so every existing row still passes.
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
       OR (closed_by = 'aa_pro' AND close_reason IS NOT NULL AND close_note IS NULL)))
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
          AND close_note IS NULL AND closed_at < ends_at)))
);

-- D-TLS-5: one open proposal per teacher, child and start time (an overdue one is expired first,
-- in lessons_before_insert, so it never blocks the slot). Also serves the per-child count.
CREATE UNIQUE INDEX lessons_one_open_proposal ON lessons (teacher_id, student_id, starts_at) WHERE status = 'proposed';
CREATE INDEX lessons_open_proposal_deadline ON lessons (reply_deadline) WHERE status = 'proposed';

-- ---------------------------------------------------------------- new proposals (and requests)
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
    -- D-TLS-3: never over a confirmed lesson of the teacher or of the child. (A proposal holds no
    -- time, TL3-4: acceptance is protected by 0029's no-overlap rules.)
    IF EXISTS (SELECT 1 FROM lessons x
               WHERE x.status = 'confirmed' AND (x.teacher_id = NEW.teacher_id OR x.student_id = NEW.student_id)
                 AND tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')) THEN
      RAISE EXCEPTION 'the time overlaps a confirmed lesson' USING ERRCODE = 'check_violation';
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

-- ---------------------------------------------------------------- changes
CREATE OR REPLACE FUNCTION lessons_before_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- TL-3: who started a lesson, and who accepted a proposal, never change. A reference becomes
  -- empty only when that account is deleted (ON DELETE SET NULL); a direct UPDATE that blanks it
  -- while the account exists is refused, so history can't be erased (TL3-6 Option D).
  IF NEW.origin IS DISTINCT FROM OLD.origin
     OR (NEW.proposed_by IS DISTINCT FROM OLD.proposed_by
         AND (NEW.proposed_by IS NOT NULL OR EXISTS (SELECT 1 FROM accounts WHERE id = OLD.proposed_by)))
     OR (NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
         AND NOT (OLD.status = 'proposed' AND NEW.status = 'confirmed')
         AND (NEW.confirmed_by IS NOT NULL OR EXISTS (SELECT 1 FROM accounts WHERE id = OLD.confirmed_by))) THEN
    RAISE EXCEPTION 'who started or accepted a lesson cannot be changed' USING ERRCODE = 'check_violation';
  END IF;

  -- TL-3: an open proposal. Anything else runs 0029's rules below, unchanged; a proposal once
  -- confirmed is an ordinary confirmed lesson there (cancellation, outcome).
  IF OLD.status = 'proposed' THEN
    -- The proposal and its price snapshot never change (as 0029 for a request).
    IF NEW.teacher_id <> OLD.teacher_id OR NEW.student_id <> OLD.student_id OR NEW.subject <> OLD.subject
       OR NEW.starts_at <> OLD.starts_at OR NEW.minutes <> OLD.minutes OR NEW.ends_at <> OLD.ends_at
       OR NEW.requested_at <> OLD.requested_at OR NEW.reply_deadline <> OLD.reply_deadline
       OR NEW.currency <> OLD.currency OR NEW.rate_minor <> OLD.rate_minor OR NEW.price_minor <> OLD.price_minor
       OR NEW.price_basis <> OLD.price_basis OR NEW.requested_by IS NOT NULL
       OR (NEW.agreement_id IS DISTINCT FROM OLD.agreement_id AND NEW.agreement_id IS NOT NULL) THEN
      RAISE EXCEPTION 'the lesson proposal and its price cannot be changed' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = OLD.status THEN
      -- Still open: only the database clearing a deleted agreement or account is allowed.
      IF (to_jsonb(NEW) - 'agreement_id' - 'proposed_by') IS DISTINCT FROM (to_jsonb(OLD) - 'agreement_id' - 'proposed_by') THEN
        RAISE EXCEPTION 'an open proposal is only accepted, declined, withdrawn or expired' USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.outcome IS NOT NULL OR NEW.outcome_at IS NOT NULL THEN
      RAISE EXCEPTION 'the outcome is recorded separately' USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'confirmed' THEN
      -- D-TLS-2: an active parent of the child accepts; checked now, with the teacher's link
      -- (D3A-4). Not re-checked against the usual times (D-TLS-3). The deadline is enforced by
      -- lessons_confirm_in_time with the same clock; overlaps by 0029's no-overlap rules.
      NEW.confirmed_at := now();
      IF NOT lessons_parent_ok(NEW.confirmed_by, NEW.student_id) THEN
        RAISE EXCEPTION 'only a parent linked to the child can accept a proposal' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NOT lessons_teacher_link_ok(NEW.teacher_id, NEW.student_id, NEW.subject) THEN
        RAISE EXCEPTION 'the teacher must be approved, active and linked to the child in this subject'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.confirmed_by IS NOT NULL THEN
      RAISE EXCEPTION 'only an accepted proposal records who accepted it' USING ERRCODE = 'check_violation';
    END IF;
    NEW.closed_at := now();
    IF NEW.status = 'declined' AND NEW.closed_by = 'parent' THEN
      IF NOT lessons_parent_ok(NEW.closed_by_account, NEW.student_id) THEN
        RAISE EXCEPTION 'only a parent linked to the child can decline a proposal' USING ERRCODE = 'insufficient_privilege';
      END IF;
      NEW.close_note := NULLIF(btrim(NEW.close_note), '');
    ELSIF NEW.status = 'withdrawn' AND NEW.closed_by = 'teacher' THEN
      IF NEW.closed_by_account IS DISTINCT FROM NEW.teacher_id THEN
        RAISE EXCEPTION 'only the proposing teacher can withdraw a proposal' USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF NEW.status IN ('declined', 'expired') AND NEW.closed_by = 'aa_pro' THEN
      NEW.closed_by_account := NULL;
    ELSE
      RAISE EXCEPTION 'a proposal cannot go to % by %', NEW.status, coalesce(NEW.closed_by, 'nobody')
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Anything else: 0029's rules, unchanged (byte for byte), as a labelled sub-block.
  <<lesson_rules_0029>>

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
END ;
END $$;

-- ---------------------------------------------------------------- expiry without a scheduler
-- 0029's sweep, now also for overdue proposals (D-TLS-5). Same signature; called from the
-- existing CR-16 shared sweep. Safe to run twice at once.
CREATE OR REPLACE FUNCTION lessons_expire_overdue(p_limit int DEFAULT 200) RETURNS SETOF uuid LANGUAGE sql AS $$
  UPDATE lessons SET status = 'expired', closed_by = 'aa_pro'
  WHERE id IN (SELECT id FROM lessons WHERE status IN ('requested', 'proposed') AND reply_deadline <= now()
               ORDER BY reply_deadline LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING id
$$;

-- ---------------------------------------------------------------- teacher-planned chapters
ALTER TABLE lesson_chapters DROP CONSTRAINT lesson_chapters_source_check;
ALTER TABLE lesson_chapters ADD CONSTRAINT lesson_chapters_source_check CHECK (source IN ('requested', 'planned'));

CREATE OR REPLACE FUNCTION lesson_chapters_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  tl3_l lessons%ROWTYPE;
  tl3_c record;
BEGIN
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

-- ---------------------------------------------------------------- material requests on proposals
-- TL3-1: 0033's function with exactly three edits: 'proposed' added to the lesson statuses that
-- accept a new request, accept a parent's answer, and count as still open for AA Pro's closing.
CREATE OR REPLACE FUNCTION material_requests_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  l lessons%ROWTYPE;
  c record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Serialise new requests on the lesson row, so the limit of five holds under concurrency.
    SELECT * INTO l FROM lessons WHERE id = NEW.lesson_id FOR NO KEY UPDATE;
    IF NOT FOUND OR l.status NOT IN ('requested', 'proposed', 'confirmed') OR now() >= l.ends_at THEN
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
    IF l.status NOT IN ('requested', 'proposed', 'confirmed') OR now() >= l.ends_at THEN
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
      IF l.status NOT IN ('requested', 'proposed', 'confirmed') THEN
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
