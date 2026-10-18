-- AA Pro · 0020 Teacher acceptance of parent requests (CR-12 Point 1; FR-038; OC-97, OC-101).
--
-- A parent's choice of children and subjects for a teacher is now a REQUEST per child. The
-- teacher accepts or declines each child separately; only an accepted request becomes an active
-- link, limited to that child and the requested subjects. A request is kept on the same
-- `teacher_student_links` row, so every existing access check (status = 'active') is unchanged:
--
--   pending    waiting for AA Pro to approve the teacher (OC-75); the 14 days have not started
--   requested  waiting for the teacher; expires 14 calendar days after it reached them
--   active     the teacher accepted (or the link existed before CR-12: decision 4, kept as is)
--   removed    ended; `ended_as` says how a request ended (declined, expired or withdrawn)
--
-- Existing active links are NOT changed by this migration (OC-97 decision 4, AC-8).

ALTER TABLE teacher_student_links DROP CONSTRAINT teacher_student_links_status_check;
ALTER TABLE teacher_student_links ADD CONSTRAINT teacher_student_links_status_check
  CHECK (status IN ('pending', 'requested', 'active', 'removed'));

ALTER TABLE teacher_student_links
  -- When the request reached the teacher (on sending, or on the teacher's AA Pro approval).
  ADD COLUMN requested_at   timestamptz,
  ADD COLUMN expires_at     timestamptz,
  -- When the teacher accepted or declined.
  ADD COLUMN answered_at    timestamptz,
  ADD COLUMN ended_as       text CHECK (ended_as IN ('declined', 'expired', 'withdrawn')),
  ADD COLUMN decline_reason text CHECK (decline_reason IN ('no_time', 'not_a_fit', 'personal', 'other')),
  ADD COLUMN decline_note   text CHECK (decline_note IS NULL OR char_length(decline_note) BETWEEN 1 AND 300),
  -- Optional message from the parent (Reading B). Never shown with the child's name before acceptance.
  ADD COLUMN parent_message text CHECK (parent_message IS NULL OR char_length(parent_message) BETWEEN 1 AND 500);

ALTER TABLE teacher_student_links
  ADD CONSTRAINT teacher_student_links_request_dates
    CHECK (status <> 'requested' OR (requested_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at > requested_at)),
  ADD CONSTRAINT teacher_student_links_ended
    CHECK (ended_as IS NULL OR status = 'removed'),
  ADD CONSTRAINT teacher_student_links_declined
    CHECK ((ended_as IS NOT DISTINCT FROM 'declined') = (decline_reason IS NOT NULL)
           AND (decline_note IS NULL OR decline_reason IS NOT NULL)
           AND (ended_as IS DISTINCT FROM 'declined' OR answered_at IS NOT NULL));

-- The 7-day wait after a decline, and the parent's list of ended requests, look these up.
CREATE INDEX teacher_student_links_ended_requests
  ON teacher_student_links (teacher_id, student_id, removed_at DESC) WHERE ended_as IS NOT NULL;
-- The teacher's "Requests from parents".
CREATE INDEX teacher_student_links_requested
  ON teacher_student_links (teacher_id, requested_at) WHERE status = 'requested';

-- Lifecycle rules, enforced in the database behind the application checks (FR-038.11):
--  * a new row is a request (pending or requested), never an active link;
--  * only a waiting request becomes active, answered before it expired, while the teacher's
--    account is active and the parent who asked is still the child's active guardian
--    (approval and subjects are checked by teacher_student_links_teacher_subjects, 0008);
--  * a pending request can only move on to "requested" (Reading A), never straight to active;
--  * an ended row never comes back to life;
--  * declined and expired apply only to a waiting request.
CREATE FUNCTION teacher_student_links_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pending', 'requested') THEN
      RAISE EXCEPTION 'a new teacher link must be a request; it becomes active only when the teacher accepts'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'removed' AND (NEW.status <> 'removed' OR NEW.ended_as IS DISTINCT FROM OLD.ended_as) THEN
    RAISE EXCEPTION 'an ended teacher link or request cannot be changed' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'active' AND OLD.status <> 'active' THEN
    IF OLD.status <> 'requested' THEN
      RAISE EXCEPTION 'only a request waiting for the teacher can be accepted' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.answered_at IS NULL OR NEW.answered_at >= OLD.expires_at THEN
      RAISE EXCEPTION 'this request has expired and cannot be accepted' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = NEW.teacher_id AND role = 'teacher' AND status = 'active') THEN
      RAISE EXCEPTION 'an active link needs an active teacher account' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM guardian_links g JOIN accounts p ON p.id = g.parent_id AND p.status = 'active'
      WHERE g.parent_id = NEW.created_by_parent_id AND g.student_id = NEW.student_id AND g.status = 'active'
    ) THEN
      RAISE EXCEPTION 'the parent who asked is no longer the child''s guardian' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'requested' AND OLD.status NOT IN ('pending', 'requested') THEN
    RAISE EXCEPTION 'only a request waiting for AA Pro approval can be sent to the teacher'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.ended_as IN ('declined', 'expired') AND OLD.status <> 'requested' THEN
    RAISE EXCEPTION 'only a request waiting for the teacher can be declined or expire'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.ended_as = 'withdrawn' AND OLD.status NOT IN ('pending', 'requested') THEN
    RAISE EXCEPTION 'only a waiting request can be withdrawn' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teacher_student_links_lifecycle BEFORE INSERT OR UPDATE ON teacher_student_links
  FOR EACH ROW EXECUTE FUNCTION teacher_student_links_lifecycle();

