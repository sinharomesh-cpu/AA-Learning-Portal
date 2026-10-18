-- AA Pro · 0019 Teacher-shared resources (CR-07 H-2b; FR-021, FR-027.2; OC-86, OC-87 Q-1, Q-5,
-- OC-90 Q-3, Q-8).
-- A teacher shares a file with students linked to them, only in a subject the parent ticked for
-- that link. It appears for the student (and their parents) straight away; no approval per file.
-- Deleting moves a resource to an archive for 30 days, then it is removed with its file.

CREATE TABLE teacher_resources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id   uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  file_id      uuid NOT NULL UNIQUE REFERENCES stored_files (id) ON DELETE RESTRICT,
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  subject      text NOT NULL CHECK (valid_subjects(ARRAY[subject])),
  -- Typed by the teacher, never an invented or AA Pro-made chapter name (FR-021.7, OC-79 C-6).
  chapter      text CHECK (chapter IS NULL OR char_length(chapter) BETWEEN 1 AND 120),
  note         text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 1000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz
);
CREATE INDEX teacher_resources_teacher ON teacher_resources (teacher_id, created_at DESC);

-- The file must be the teacher's own resource file.
CREATE FUNCTION teacher_resources_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.teacher_id, 'teacher');
  IF NOT EXISTS (
    SELECT 1 FROM stored_files
    WHERE id = NEW.file_id AND owner_id = NEW.teacher_id AND purpose = 'teacher_resource'
  ) THEN
    RAISE EXCEPTION 'the file is not this teacher''s resource file' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teacher_resources_owner BEFORE INSERT OR UPDATE OF teacher_id, file_id ON teacher_resources
  FOR EACH ROW EXECUTE FUNCTION teacher_resources_owner();

CREATE TABLE resource_shares (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id  uuid NOT NULL REFERENCES teacher_resources (id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  shared_at    timestamptz NOT NULL DEFAULT now(),
  unshared_at  timestamptz,
  CHECK (unshared_at IS NULL OR unshared_at >= shared_at)
);
CREATE UNIQUE INDEX resource_shares_active ON resource_shares (resource_id, student_id) WHERE unshared_at IS NULL;
CREATE INDEX resource_shares_student ON resource_shares (student_id) WHERE unshared_at IS NULL;

-- Sharing (or sharing again) needs an active link between the teacher and the student that
-- includes the resource's subject (FR-021.5, FR-021.6, OC-41). A share made earlier stays
-- visible to the child after the link ends (FR-027.2, OC-87 Q-5); it just cannot be renewed.
CREATE FUNCTION resource_shares_linked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.unshared_at IS NULL AND (TG_OP = 'INSERT' OR OLD.unshared_at IS NOT NULL) THEN
    PERFORM require_role(NEW.student_id, 'student');
    IF NOT EXISTS (
      SELECT 1 FROM teacher_resources r
      JOIN teacher_student_links l ON l.teacher_id = r.teacher_id AND l.student_id = NEW.student_id
      WHERE r.id = NEW.resource_id AND l.status = 'active' AND r.subject = ANY (l.subjects)
    ) THEN
      RAISE EXCEPTION 'the student is not linked to this teacher for this subject' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER resource_shares_linked BEFORE INSERT OR UPDATE ON resource_shares
  FOR EACH ROW EXECUTE FUNCTION resource_shares_linked();
