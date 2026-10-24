-- AA Pro · 0030 teacher meeting links (M2), DRAFT for the owner's review. NOT APPROVED.
-- CR-17 PR 3. Assumes the recommended options for D3A-1 (the parent allows a teacher's own Zoom
-- links once per teacher and child, and can withdraw it) and D3A-8 (links deleted 7 days after
-- the lesson's scheduled end, and at once when the lesson is cancelled). If the owner chooses
-- differently, this file changes before it is approved; nothing here is applied before then.
--
-- Additive only: two new tables, their functions and triggers, one trigger on lessons and one on
-- teacher_student_links. No existing row changes; no existing column, check or list is altered.
-- Human Teacher module only: no Zoom API, no paid service, no AI provider.
--
-- The database is the second line of defence behind the server. Whatever the code sends, it:
--  * accepts a permission only from a parent with an ACTIVE link to the child, for a teacher
--    with an ACTIVE link to that child; one live permission per teacher and child;
--  * lets a permission change only once: withdrawn, by a parent of the child, on the database
--    clock; it is withdrawn automatically when the teacher-child link is removed;
--  * accepts a meeting link only from the lesson's own teacher (approved, active, still linked in
--    the lesson's subject), only for a CONFIRMED lesson that has not ended, only while the
--    parent's permission is live; https only, a zoom.us address only, at most 500 characters;
--  * sets the times itself: set_at from the database clock, delete_after = the lesson's end +
--    7 days (D3A-8);
--  * deletes the link at once when the lesson is cancelled;
--  * removes links past delete_after through meeting_links_purge(), called from the existing
--    free CR-16 sweep (no scheduler; it runs on the next signed-in activity, so deletion is
--    "at the next eligible activity", not to the minute: OC-126).
-- The link itself is never copied into notifications or emails; access is checked by the server.

-- ---------------------------------------------------------------- permissions (D3A-1)
CREATE TABLE meeting_link_permissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  granted_by    uuid REFERENCES accounts (id) ON DELETE SET NULL,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  withdrawn_by  uuid REFERENCES accounts (id) ON DELETE SET NULL,
  withdrawn_at  timestamptz,
  -- 'parent' or 'aa_pro' (the teacher-child link ended).
  withdrawn_how text CHECK (withdrawn_how IN ('parent', 'aa_pro')),
  CONSTRAINT meeting_link_permissions_withdrawn CHECK (
    (withdrawn_at IS NULL AND withdrawn_how IS NULL AND withdrawn_by IS NULL)
    OR (withdrawn_at IS NOT NULL AND withdrawn_at >= granted_at AND (
         (withdrawn_how = 'parent') OR (withdrawn_how = 'aa_pro' AND withdrawn_by IS NULL))))
);
-- One live permission per teacher and child (either parent may give or withdraw it).
CREATE UNIQUE INDEX meeting_link_permissions_live ON meeting_link_permissions (teacher_id, student_id)
  WHERE withdrawn_at IS NULL;
CREATE INDEX meeting_link_permissions_student ON meeting_link_permissions (student_id) WHERE withdrawn_at IS NULL;

CREATE FUNCTION meeting_link_permissions_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.granted_at := now();
  NEW.withdrawn_at := NULL; NEW.withdrawn_by := NULL; NEW.withdrawn_how := NULL;
  IF NOT lessons_parent_ok(NEW.granted_by, NEW.student_id) THEN
    RAISE EXCEPTION 'only a parent of the child can allow meeting links' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM teacher_student_links l
    WHERE l.teacher_id = NEW.teacher_id AND l.student_id = NEW.student_id AND l.status = 'active'
    FOR SHARE OF l) THEN
    RAISE EXCEPTION 'the teacher is not linked to the child' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER meeting_link_permissions_before_insert BEFORE INSERT ON meeting_link_permissions
  FOR EACH ROW EXECUTE FUNCTION meeting_link_permissions_before_insert();

-- The only change allowed: live -> withdrawn, once, on the database clock.
CREATE FUNCTION meeting_link_permissions_before_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A deleted account clears its id here (ON DELETE SET NULL); nothing else may change with it.
  IF (NEW.id, NEW.teacher_id, NEW.student_id, NEW.granted_at, NEW.withdrawn_at, NEW.withdrawn_how)
       IS NOT DISTINCT FROM (OLD.id, OLD.teacher_id, OLD.student_id, OLD.granted_at, OLD.withdrawn_at, OLD.withdrawn_how)
     AND (NEW.granted_by IS NOT DISTINCT FROM OLD.granted_by OR NEW.granted_by IS NULL)
     AND (NEW.withdrawn_by IS NOT DISTINCT FROM OLD.withdrawn_by OR NEW.withdrawn_by IS NULL) THEN
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.teacher_id, NEW.student_id, NEW.granted_by, NEW.granted_at)
     IS DISTINCT FROM (OLD.id, OLD.teacher_id, OLD.student_id, OLD.granted_by, OLD.granted_at)
     OR OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_how IS NULL THEN
    RAISE EXCEPTION 'a meeting-link permission can only be withdrawn, once' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.withdrawn_how = 'parent' AND NOT lessons_parent_ok(NEW.withdrawn_by, NEW.student_id) THEN
    RAISE EXCEPTION 'only a parent of the child can withdraw it' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.withdrawn_how = 'aa_pro' THEN NEW.withdrawn_by := NULL; END IF;
  NEW.withdrawn_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER meeting_link_permissions_before_update BEFORE UPDATE ON meeting_link_permissions
  FOR EACH ROW EXECUTE FUNCTION meeting_link_permissions_before_update();

-- ---------------------------------------------------------------- links (one per lesson)
CREATE TABLE lesson_meeting_links (
  lesson_id     uuid PRIMARY KEY REFERENCES lessons (id) ON DELETE CASCADE,
  -- https, host zoom.us or a subdomain of it (lower case), no user name, port, spaces or quotes.
  url           text NOT NULL CHECK (
                  char_length(url) <= 500
                  AND url ~ '^https://([a-z0-9-]+\.)*zoom\.us(/[A-Za-z0-9/?=&._~%+#-]*)?$'),
  set_by        uuid REFERENCES accounts (id) ON DELETE SET NULL,
  set_at        timestamptz NOT NULL DEFAULT now(),
  -- 1 when first added, +1 on each change (the parent is told of changes).
  version       int NOT NULL DEFAULT 1 CHECK (version >= 1),
  delete_after  timestamptz NOT NULL
);
CREATE INDEX lesson_meeting_links_delete_after ON lesson_meeting_links (delete_after);

CREATE FUNCTION lesson_meeting_links_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER lesson_meeting_links_before_write BEFORE INSERT OR UPDATE ON lesson_meeting_links
  FOR EACH ROW EXECUTE FUNCTION lesson_meeting_links_before_write();

-- A cancelled lesson keeps no meeting link.
CREATE FUNCTION lessons_drop_link_on_cancel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM lesson_meeting_links WHERE lesson_id = NEW.id;
  RETURN NULL;
END $$;
CREATE TRIGGER lessons_drop_link_on_cancel AFTER UPDATE OF status ON lessons
  FOR EACH ROW WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION lessons_drop_link_on_cancel();

-- A removed teacher-child link withdraws the permission (it does not come back on re-linking).
CREATE FUNCTION teacher_links_withdraw_meeting_permission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE meeting_link_permissions SET withdrawn_how = 'aa_pro'
  WHERE teacher_id = NEW.teacher_id AND student_id = NEW.student_id AND withdrawn_at IS NULL;
  RETURN NULL;
END $$;
CREATE TRIGGER teacher_links_withdraw_meeting_permission AFTER UPDATE OF status ON teacher_student_links
  FOR EACH ROW WHEN (NEW.status = 'removed' AND OLD.status IS DISTINCT FROM 'removed')
  EXECUTE FUNCTION teacher_links_withdraw_meeting_permission();

-- Links past their delete-after time (D3A-8); called from the CR-17 lesson maintenance step.
CREATE FUNCTION meeting_links_purge(p_limit int DEFAULT 200) RETURNS int LANGUAGE sql AS $$
  WITH gone AS (
    DELETE FROM lesson_meeting_links
    WHERE lesson_id IN (SELECT lesson_id FROM lesson_meeting_links WHERE delete_after <= now()
                        ORDER BY delete_after LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING 1)
  SELECT count(*)::int FROM gone
$$;
