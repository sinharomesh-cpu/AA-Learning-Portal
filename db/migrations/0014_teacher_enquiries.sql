-- AA Pro · 0014 Connect with teacher and enquiries (Phase 2, PR-D4a; boards D3, D4, D6, D11;
-- OC-76, OC-77, OC-79 C, OC-80)
--
-- A parent sends a short enquiry from a public listing. The teacher sees the parent's first
-- name and the child's grade, curriculum and subjects — never the child's name or anything the
-- child has done on AA Pro (OC-76(1)). An enquiry books nothing, links nothing and gives no
-- access; after acceptance the parent may add the teacher through the existing linking
-- (OC-75). Waiting enquiries expire after 14 days (OC-76(2)).

ALTER TABLE rate_events DROP CONSTRAINT rate_events_kind_check;
ALTER TABLE rate_events ADD CONSTRAINT rate_events_kind_check CHECK (kind IN ('listing_save', 'enquiry_new'));

-- "Connect with teacher" while signed out: the chosen listing is remembered on the new or
-- signed-in parent account for 7 days, so it survives email confirmation on another device (D11).
CREATE TABLE pending_connects (
  account_id  uuid PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  public_id   text NOT NULL CHECK (public_id ~ '^t-[a-z0-9]{10}$'),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teacher_enquiries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id          uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  teacher_id         uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  listing_id         uuid REFERENCES teacher_listings (id) ON DELETE SET NULL,
  -- The parent's own child, or NULL for "a child I haven't added yet" (P-4).
  child_id           uuid REFERENCES accounts (id) ON DELETE SET NULL,
  stated_grade       smallint NOT NULL CHECK (stated_grade BETWEEN 1 AND 12),
  stated_curriculum  text CHECK (stated_curriculum IS NULL OR stated_curriculum IN
                       ('CBSE', 'ICSE', 'State board', 'IB', 'Cambridge (IGCSE)', 'Other')),
  subjects           text[] NOT NULL CHECK (valid_subjects(subjects) AND cardinality(subjects) BETWEEN 1 AND 6),
  -- Times the parent picked from the teacher's usual times, as shown to them (a guide only).
  preferred_times    text[] NOT NULL DEFAULT '{}' CHECK (cardinality(preferred_times) <= 14),
  -- The asking price the parent asked about, copied when sent (OC-79 C: kept separate from any agreed price).
  asking_price       jsonb,
  message            text CHECK (message IS NULL OR char_length(message) <= 500),
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  teacher_note       text CHECK (teacher_note IS NULL OR char_length(teacher_note) <= 500),
  sent_at            timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  answered_at        timestamptz,
  CONSTRAINT teacher_enquiries_answered CHECK ((status IN ('accepted', 'declined')) = (answered_at IS NOT NULL))
);
CREATE INDEX teacher_enquiries_parent ON teacher_enquiries (parent_id, status, sent_at);
CREATE INDEX teacher_enquiries_teacher ON teacher_enquiries (teacher_id, status, sent_at);

CREATE FUNCTION teacher_enquiries_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.parent_id, 'parent');
  PERFORM require_role(NEW.teacher_id, 'teacher');
  IF NEW.child_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM guardian_links g
    WHERE g.parent_id = NEW.parent_id AND g.student_id = NEW.child_id AND g.status = 'active'
  ) AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'enquiry child is not the parent''s own' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teacher_enquiries_check BEFORE INSERT OR UPDATE OF parent_id, teacher_id, child_id ON teacher_enquiries
  FOR EACH ROW EXECUTE FUNCTION teacher_enquiries_check();
