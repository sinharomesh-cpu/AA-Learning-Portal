-- AA Pro · 0002 teacher–child links carry the subjects the parent ticked (OC-41, CR-03).
-- A teacher sees a child's parent-uploaded materials only for these subjects, only while the
-- link is active. The parent can change the subjects at any time.

ALTER TABLE teacher_student_links
  ADD COLUMN subjects text[] NOT NULL DEFAULT '{}'
    CHECK (valid_subjects(subjects));

UPDATE teacher_student_links SET subjects = ARRAY[subject] WHERE subject IS NOT NULL;

ALTER TABLE teacher_student_links DROP COLUMN subject;

-- A live link must cover at least one subject; "all subjects" is all six ticked.
ALTER TABLE teacher_student_links
  ADD CONSTRAINT teacher_student_links_subjects_present
    CHECK (status = 'removed' OR cardinality(subjects) > 0);

-- The ticked subjects must be ones the child actually studies (set on the child's profile).
CREATE FUNCTION teacher_student_links_subjects() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'removed' AND NOT EXISTS (
    SELECT 1 FROM student_profiles WHERE account_id = NEW.student_id AND NEW.subjects <@ subjects
  ) THEN
    RAISE EXCEPTION 'subjects must be among the child''s subjects' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teacher_student_links_subjects BEFORE INSERT OR UPDATE OF subjects, status ON teacher_student_links
  FOR EACH ROW EXECUTE FUNCTION teacher_student_links_subjects();
