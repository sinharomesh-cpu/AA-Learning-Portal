-- AA Pro · 0031 lessons kept when a parent removes a teacher (M3), OC-53 Option A.
-- Owner decision of 25 Oct 2026, 00:05 IST ("OC-53 — Option A"): when a parent removes a teacher
-- (or unticks a child or subject with that teacher), lessons starting within the next 30 minutes
-- stay scheduled and every other upcoming lesson with that teacher is cancelled. A kept lesson
-- must stay usable by its own participants, with an explicit, lesson-scoped permission model.
-- Applying this migration to the shared test database needs the owner's separate written approval.
--
-- Additive only: one function, one table with its trigger, and a replacement body for 0030's
-- meeting-link check (the new body adds one case and changes nothing else). No existing row changes.
-- Human Teacher module only: no Zoom API, no paid service, no AI provider.
--
-- The boundary (one definition, used by the server and here): a lesson is KEPT when it has not
-- ended and starts at most 30 minutes after the moment of removal, on the database clock:
--   starts_at <= removal + 30 minutes AND removal < ends_at.
-- So a lesson starting exactly 30:00 after removal is kept ("lessons starting within 30 minutes
-- stay"); 30:00.001 or later is cancelled ("more than 30 minutes away are cancelled"); a lesson
-- already in progress is kept.
--
-- The database is the second line of defence behind the server. Whatever the code sends, it:
--  * records a kept lesson only for a CONFIRMED lesson inside the window, whose teacher is no
--    longer linked to the child in that subject, at the request of an active parent of the child;
--    the time comes from the database clock; a record can never change afterwards;
--  * carries the meeting-link permission to that ONE lesson only if a parent's permission was live
--    at the moment of removal (live, or withdrawn by AA Pro in this same transaction because the
--    link was removed); it never revives a permission a parent withdrew themselves;
--  * lets the kept lesson's own teacher (still approved and active) add or change that lesson's
--    meeting link only when the permission was carried; every other 0030 rule is unchanged.

-- ---------------------------------------------------------------- the 30-minute window
CREATE FUNCTION lessons_kept_window_ok(p_starts timestamptz, p_ends timestamptz, p_at timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_starts <= p_at + interval '30 minutes' AND p_at < p_ends
$$;

-- ---------------------------------------------------------------- kept lessons
CREATE TABLE lessons_kept (
  lesson_id      uuid PRIMARY KEY REFERENCES lessons (id) ON DELETE CASCADE,
  kept_at        timestamptz NOT NULL DEFAULT now(),
  -- The parent whose change ended the link (history only; access never depends on it).
  kept_by        uuid REFERENCES accounts (id) ON DELETE SET NULL,
  -- A parent's meeting-link permission was live at the moment of removal (set by the database).
  links_carried  boolean NOT NULL DEFAULT false
);

CREATE FUNCTION lessons_kept_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  l lessons%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- A deleted parent account clears kept_by (ON DELETE SET NULL); nothing else may change.
    IF NEW.kept_by IS NULL AND (NEW.lesson_id, NEW.kept_at, NEW.links_carried)
         IS NOT DISTINCT FROM (OLD.lesson_id, OLD.kept_at, OLD.links_carried) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'a kept-lesson record cannot change' USING ERRCODE = 'check_violation';
  END IF;
  NEW.kept_at := now();
  SELECT * INTO l FROM lessons WHERE id = NEW.lesson_id FOR UPDATE;
  IF NOT FOUND OR l.status <> 'confirmed' THEN
    RAISE EXCEPTION 'only a confirmed lesson can be kept' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT lessons_kept_window_ok(l.starts_at, l.ends_at, NEW.kept_at) THEN
    RAISE EXCEPTION 'only a lesson starting within 30 minutes can be kept' USING ERRCODE = 'check_violation';
  END IF;
  IF lessons_teacher_link_ok(l.teacher_id, l.student_id, l.subject) THEN
    RAISE EXCEPTION 'the teacher is still linked in this subject' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT lessons_parent_ok(NEW.kept_by, l.student_id) THEN
    RAISE EXCEPTION 'only a parent of the child can keep a lesson' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.links_carried := EXISTS (
    SELECT 1 FROM meeting_link_permissions p
    WHERE p.teacher_id = l.teacher_id AND p.student_id = l.student_id
      AND (p.withdrawn_at IS NULL OR (p.withdrawn_how = 'aa_pro' AND p.withdrawn_at = now())));
  RETURN NEW;
END $$;
CREATE TRIGGER lessons_kept_before_write BEFORE INSERT OR UPDATE ON lessons_kept
  FOR EACH ROW EXECUTE FUNCTION lessons_kept_before_write();

-- ---------------------------------------------------------------- 0030's link check, plus kept lessons
CREATE OR REPLACE FUNCTION lesson_meeting_links_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  l lessons%ROWTYPE;
  carried boolean;
BEGIN
  -- A deleted teacher account clears set_by (ON DELETE SET NULL); nothing else may change with it.
  IF TG_OP = 'UPDATE' AND NEW.set_by IS NULL
     AND (NEW.lesson_id, NEW.url, NEW.set_at, NEW.version, NEW.delete_after)
         IS NOT DISTINCT FROM (OLD.lesson_id, OLD.url, OLD.set_at, OLD.version, OLD.delete_after) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.lesson_id <> OLD.lesson_id THEN
    RAISE EXCEPTION 'a meeting link cannot move to another lesson' USING ERRCODE = 'check_violation';
  END IF;
  -- Share-lock the lesson: a cancellation running at the same moment waits for this write (and
  -- then deletes the link), or this write sees the cancellation and is refused.
  SELECT * INTO l FROM lessons WHERE id = NEW.lesson_id FOR SHARE;
  IF NOT FOUND OR l.status <> 'confirmed' OR now() >= l.ends_at THEN
    RAISE EXCEPTION 'a meeting link can only be added to a confirmed lesson before it ends'
      USING ERRCODE = 'check_violation';
  END IF;
  -- OC-53 (0031): a lesson kept after the parent removed the teacher, with the permission carried.
  SELECT k.links_carried INTO carried FROM lessons_kept k WHERE k.lesson_id = l.id;
  IF carried IS TRUE THEN
    IF NEW.set_by IS DISTINCT FROM l.teacher_id OR NOT EXISTS (
      SELECT 1 FROM accounts a JOIN teacher_profiles tp ON tp.account_id = a.id AND tp.approval_status = 'approved'
      WHERE a.id = l.teacher_id AND a.role = 'teacher' AND a.status = 'active') THEN
      RAISE EXCEPTION 'only the lesson''s own linked teacher can add its meeting link' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.set_by IS DISTINCT FROM l.teacher_id OR NOT lessons_teacher_link_ok(l.teacher_id, l.student_id, l.subject) THEN
      RAISE EXCEPTION 'only the lesson''s own linked teacher can add its meeting link' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM meeting_link_permissions p
      WHERE p.teacher_id = l.teacher_id AND p.student_id = l.student_id AND p.withdrawn_at IS NULL
      FOR SHARE OF p) THEN
      RAISE EXCEPTION 'the parent has not allowed this teacher''s meeting links' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.set_at := now();
  NEW.delete_after := l.ends_at + interval '7 days';   -- D3A-8
  NEW.version := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE OLD.version + 1 END;
  RETURN NEW;
END $$;
