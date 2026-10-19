-- AA Pro · 0025 "AA Pro Verified" (CR-15 §5.1; owner decision OC-106 (2); FR-045).
--
-- Three checks, all required: the teacher's email is confirmed (read from the account, never
-- typed), the Super Admin reviewed the profile, and the Super Admin checked the teacher's identity
-- on a video call. No identity document, image or number is stored: only that each check was
-- done, by whom and when. Valid for 12 months from the decision; the tick disappears at expiry.
--
-- States: not started → pending (teacher requested) → verified | not verified;
-- verified → expired (time) | revoked (Super Admin, reason required). Every decision is a new,
-- unchangeable row in teacher_verification_decisions (the audit trail); the current state is
-- read from the newest decision and any open request.

-- ---------------------------------------------------------------- requests
-- A teacher's request to be checked. Open until a decision answers it; one open at a time.
CREATE TABLE teacher_verification_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  requested_at  timestamptz NOT NULL,
  closed_at     timestamptz,
  CHECK (closed_at IS NULL OR closed_at >= requested_at)
);
CREATE UNIQUE INDEX teacher_verification_requests_open ON teacher_verification_requests (teacher_id)
  WHERE closed_at IS NULL;
CREATE INDEX teacher_verification_requests_queue ON teacher_verification_requests (requested_at)
  WHERE closed_at IS NULL;

-- A request is only ever opened, then closed once; never reopened, moved or removed (removal
-- happens only with the teacher's account, through ON DELETE CASCADE).
CREATE FUNCTION teacher_verification_requests_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM accounts WHERE id = OLD.teacher_id) THEN
      RAISE EXCEPTION 'verification requests cannot be deleted' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM require_role(NEW.teacher_id, 'teacher');
    IF NEW.closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a new verification request must be open' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.closed_at IS NOT NULL OR NEW.closed_at IS NULL
     OR NEW.id <> OLD.id OR NEW.teacher_id <> OLD.teacher_id OR NEW.requested_at <> OLD.requested_at THEN
    RAISE EXCEPTION 'a verification request can only be closed, once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teacher_verification_requests_check BEFORE INSERT OR UPDATE OR DELETE ON teacher_verification_requests
  FOR EACH ROW EXECUTE FUNCTION teacher_verification_requests_check();

-- ---------------------------------------------------------------- decisions (append-only)
CREATE TABLE teacher_verification_decisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Order of the decisions (the newest one gives the current state).
  seq               bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  teacher_id        uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  -- The request a verified / not verified decision answers; a removal answers none.
  request_id        uuid REFERENCES teacher_verification_requests (id) ON DELETE CASCADE,
  outcome           text NOT NULL CHECK (outcome IN ('verified', 'not_verified', 'revoked')),
  -- The three checks as they stood at the decision. The email check is copied from the account.
  email_confirmed   boolean NOT NULL,
  profile_reviewed  boolean NOT NULL,
  identity_checked  boolean NOT NULL,
  -- Decision note or removal reason. Never an ID number: long runs of digits are refused.
  note              text NOT NULL CHECK (char_length(note) BETWEEN 3 AND 500 AND note !~ '[0-9]{8,}'),
  decided_by        uuid NOT NULL REFERENCES accounts (id),
  decided_at        timestamptz NOT NULL,
  -- Verified only: 12 months after the decision (set by the trigger below).
  expires_at        timestamptz,
  CONSTRAINT teacher_verification_all_checks CHECK (
    outcome <> 'verified' OR (email_confirmed AND profile_reviewed AND identity_checked)),
  CONSTRAINT teacher_verification_expiry CHECK ((outcome = 'verified') = (expires_at IS NOT NULL)),
  CONSTRAINT teacher_verification_request CHECK ((outcome = 'revoked') = (request_id IS NULL))
);
CREATE INDEX teacher_verification_decisions_teacher ON teacher_verification_decisions (teacher_id, seq DESC);
CREATE UNIQUE INDEX teacher_verification_decisions_request ON teacher_verification_decisions (request_id)
  WHERE request_id IS NOT NULL;

CREATE FUNCTION teacher_verification_decisions_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  latest record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only with the teacher's account (ON DELETE CASCADE); otherwise the trail is permanent.
    IF EXISTS (SELECT 1 FROM accounts WHERE id = OLD.teacher_id) THEN
      RAISE EXCEPTION 'verification decisions cannot be changed or deleted' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'verification decisions cannot be changed or deleted' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM require_role(NEW.teacher_id, 'teacher');
  -- The Super Admin only (OC-106 (2)); not Admins, not teachers.
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = NEW.decided_by AND role = 'superadmin' AND status = 'active') THEN
    RAISE EXCEPTION 'only the Super Admin decides verification' USING ERRCODE = 'check_violation';
  END IF;
  -- The email check is the account's own record, never what was typed or ticked.
  IF NEW.email_confirmed IS DISTINCT FROM
     (SELECT email_verified_at IS NOT NULL FROM accounts WHERE id = NEW.teacher_id) THEN
    RAISE EXCEPTION 'the email check must match the account' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.request_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM teacher_verification_requests
    WHERE id = NEW.request_id AND teacher_id = NEW.teacher_id AND closed_at IS NULL) THEN
    RAISE EXCEPTION 'a decision answers an open request of the same teacher' USING ERRCODE = 'check_violation';
  END IF;
  SELECT outcome, decided_at, expires_at INTO latest FROM teacher_verification_decisions
  WHERE teacher_id = NEW.teacher_id ORDER BY seq DESC LIMIT 1;
  IF FOUND AND NEW.decided_at < latest.decided_at THEN
    RAISE EXCEPTION 'decisions are recorded in time order' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.outcome = 'revoked' THEN
    IF NOT FOUND OR latest.outcome <> 'verified' OR latest.expires_at <= NEW.decided_at THEN
      RAISE EXCEPTION 'only a current verification can be removed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- 12 calendar months, counted in UTC so the result never depends on the session time zone.
  NEW.expires_at := CASE WHEN NEW.outcome = 'verified'
    THEN (NEW.decided_at AT TIME ZONE 'UTC' + interval '12 months') AT TIME ZONE 'UTC' END;
  RETURN NEW;
END $$;
CREATE TRIGGER teacher_verification_decisions_check BEFORE INSERT OR UPDATE OR DELETE ON teacher_verification_decisions
  FOR EACH ROW EXECUTE FUNCTION teacher_verification_decisions_check();
CREATE FUNCTION teacher_verification_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'verification records cannot be emptied' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER teacher_verification_decisions_no_truncate BEFORE TRUNCATE ON teacher_verification_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION teacher_verification_no_truncate();
CREATE TRIGGER teacher_verification_requests_no_truncate BEFORE TRUNCATE ON teacher_verification_requests
  FOR EACH STATEMENT EXECUTE FUNCTION teacher_verification_no_truncate();
