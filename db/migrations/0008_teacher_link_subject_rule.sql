-- AA Pro · 0008 Teacher–child subjects must be subjects the teacher is approved for (OC-75)
-- Rule: an ACTIVE link exists only for an approved teacher, and only for subjects that are both on
-- the teacher's approved profile and among the child's subjects (the child part is checked by
-- teacher_student_links_subjects, 0002). A PENDING link holds the parent's preferences only.
-- The application revalidates links when approved subjects change (decideProfileChange).

-- Existing active links (synthetic test data only) are trimmed to the rule first; a link left
-- with no subject in common ends.
UPDATE teacher_student_links l
SET subjects = CASE WHEN cardinality(x.common) = 0 THEN l.subjects ELSE x.common END,
    status = CASE WHEN cardinality(x.common) = 0 THEN 'removed' ELSE l.status END,
    removed_at = CASE WHEN cardinality(x.common) = 0 THEN now() ELSE l.removed_at END
FROM (
  SELECT l2.id, ARRAY(
    SELECT unnest(l2.subjects) INTERSECT SELECT unnest(COALESCE(tp.subjects, '{}'::text[]))
  ) AS common
  FROM teacher_student_links l2
  LEFT JOIN teacher_profiles tp ON tp.account_id = l2.teacher_id AND tp.approval_status = 'approved'
  WHERE l2.status = 'active'
) x
WHERE x.id = l.id AND NOT (l.subjects <@ x.common);

CREATE FUNCTION teacher_student_links_teacher_subjects() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'active' AND NOT EXISTS (
    SELECT 1 FROM teacher_profiles
    WHERE account_id = NEW.teacher_id AND approval_status = 'approved' AND NEW.subjects <@ subjects
  ) THEN
    RAISE EXCEPTION 'an active link needs an approved teacher who teaches these subjects'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teacher_student_links_teacher_subjects BEFORE INSERT OR UPDATE OF subjects, status
  ON teacher_student_links FOR EACH ROW EXECUTE FUNCTION teacher_student_links_teacher_subjects();
