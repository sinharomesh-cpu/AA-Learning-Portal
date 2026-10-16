-- AA Pro · 0009 Teacher directory (Phase 2, PR3; approved board 65; OC-48, OC-54, OC-62)
-- Parents search approved, active teachers by subject, grade and name. The directory shows only
-- name, subjects, grades, time zone and bio (OC-54). A teacher can hide from search; hiding does
-- not affect existing links or "Add by email" (OC-36), only whether the directory lists them.
ALTER TABLE teacher_profiles
  ADD COLUMN hidden_from_search boolean NOT NULL DEFAULT false;

-- Directory searches filter approved profiles by subject and grade.
CREATE INDEX teacher_profiles_directory ON teacher_profiles USING gin (subjects)
  WHERE approval_status = 'approved' AND NOT hidden_from_search;
