-- AA Pro · rollback for 0031_kept_lessons.sql (M3, OC-53 Option A). NOT a migration: it is kept
-- outside db/migrations and is used only with the owner's separate written approval.
--
-- Order: M3 is reverted BEFORE M2 (0030) and M1 (0029).
--
-- PERMANENTLY DELETES, with no way back except a database backup:
--   * every kept-lesson record (lessons_kept). The lessons themselves stay as they are: a kept lesson
--     stays confirmed, but its teacher loses access to it (they are no longer linked), and a link
--     the teacher saved for it after the removal stays until 0030's normal clean-up;
--   * the in-app notifications M3 adds: lesson_kept (about a lesson).
-- Restores 0030's meeting-link check exactly as it was.
-- LEAVES BEHIND, on purpose: 0031's row in schema_migrations (the runner never re-applies it).
--
-- Use: copy this file into db/migrations under the next free number, together with the code change
-- that switches the OC-53 keep step off; it then runs in the migration runner's single transaction.
-- Before using it on the shared test database, take a Neon restore point or branch.

DELETE FROM notifications WHERE entity_type = 'lesson' AND type = 'lesson_kept';

CREATE OR REPLACE FUNCTION lesson_meeting_links_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  l lessons%ROWTYPE;
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
  IF NEW.set_by IS DISTINCT FROM l.teacher_id OR NOT lessons_teacher_link_ok(l.teacher_id, l.student_id, l.subject) THEN
    RAISE EXCEPTION 'only the lesson''s own linked teacher can add its meeting link' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM meeting_link_permissions p
    WHERE p.teacher_id = l.teacher_id AND p.student_id = l.student_id AND p.withdrawn_at IS NULL
    FOR SHARE OF p) THEN
    RAISE EXCEPTION 'the parent has not allowed this teacher''s meeting links' USING ERRCODE = 'check_violation';
  END IF;
  NEW.set_at := now();
  NEW.delete_after := l.ends_at + interval '7 days';   -- D3A-8
  NEW.version := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE OLD.version + 1 END;
  RETURN NEW;
END $$;

DROP TRIGGER lessons_kept_before_write ON lessons_kept;
DROP TABLE lessons_kept;
DROP FUNCTION lessons_kept_before_write();
DROP FUNCTION lessons_kept_window_ok(timestamptz, timestamptz, timestamptz);
