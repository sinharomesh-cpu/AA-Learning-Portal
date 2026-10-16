-- AA Pro · 0007 Teacher profile and re-review (Phase 2, PR1)
-- Rules: OC-38 (teachers register, complete M-20 and wait for approval), OC-71 (teacher terms),
-- OC-73 (after approval, subject or grade changes are reviewed again while access is kept).

-- An approved teacher's requested subject/grade change waits here; the approved values in
-- `subjects` and `grades` stay in force until an approver accepts the change.
ALTER TABLE teacher_profiles
  ADD COLUMN pending_subjects      text[] CHECK (pending_subjects IS NULL OR valid_subjects(pending_subjects)),
  ADD COLUMN pending_grades        smallint[]
                                   CHECK (pending_grades IS NULL OR pending_grades <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  ADD COLUMN change_submitted_at   timestamptz,
  -- The outcome of the most recent change review, shown to the teacher once.
  ADD COLUMN change_decision       text CHECK (change_decision IS NULL OR change_decision IN ('approved', 'declined')),
  ADD COLUMN change_decision_note  text CHECK (change_decision_note IS NULL OR char_length(change_decision_note) <= 1000),
  ADD COLUMN change_decided_by     uuid REFERENCES accounts (id) ON DELETE SET NULL,
  ADD COLUMN change_decided_at     timestamptz,
  ADD CONSTRAINT teacher_profiles_pending_change CHECK (
    (pending_subjects IS NULL) = (pending_grades IS NULL)
    AND (pending_subjects IS NULL) = (change_submitted_at IS NULL)
    -- Only an approved profile can have a change waiting.
    AND (pending_subjects IS NULL OR approval_status = 'approved')
  ),
  ADD CONSTRAINT teacher_profiles_change_decision CHECK (
    change_decision IS NULL OR change_decided_at IS NOT NULL
  );
CREATE INDEX teacher_profiles_change_queue ON teacher_profiles (change_submitted_at)
  WHERE change_submitted_at IS NOT NULL;

-- Teachers accept the teacher terms (OC-71) when they send their profile for approval.
ALTER TABLE consents DROP CONSTRAINT consents_kind_check;
ALTER TABLE consents ADD CONSTRAINT consents_kind_check
  CHECK (kind IN ('privacy_and_terms', 'guardian', 'ai_tutor', 'email_reminders', 'teacher_terms'));
