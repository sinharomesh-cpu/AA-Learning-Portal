-- AA Pro · 0010 Teacher profile claims (Phase 2, PR-D1a; P2-R3 K-6, OC-77(5), OC-85)
-- Curricula the teacher teaches and years of teaching experience. Both are the teacher's own
-- statement: they save at once (no re-review after approval, K-6), are seen by the approver at
-- first approval, and are shown "as stated by the teacher" — never as verified or certified.
-- They are not shown to parents or visitors until the teacher publishes a listing (K-1, PR-D2).
ALTER TABLE teacher_profiles
  -- Same list parents choose from for their children (OC-58, src/server/children.ts CURRICULA).
  ADD COLUMN curricula text[] NOT NULL DEFAULT '{}'
    CHECK (curricula <@ ARRAY['CBSE', 'ICSE', 'State board', 'IB', 'Cambridge (IGCSE)', 'Other']::text[]),
  ADD COLUMN experience_years smallint
    CHECK (experience_years IS NULL OR experience_years BETWEEN 0 AND 60);
