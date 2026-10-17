-- AA Pro · 0015 AI Tutor sessions (OC-89(4)).
-- One AI Tutor session of at most 15 minutes per child in any rolling 24 hours, whatever the
-- subject or chapter; at most one active session per child. Enforced here as a second line of
-- defence behind server/aiSessions.ts, so a page refresh, a second browser or a direct request
-- cannot start a second session. Nothing about the conversation is stored: no audio, no
-- transcript, only times and the outcome.

CREATE TABLE ai_sessions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id             uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  -- One per start attempt from a page; a repeated request with the same key returns the same
  -- session instead of creating a second one.
  request_key            uuid NOT NULL,
  subject                text NOT NULL CHECK (valid_subjects(ARRAY[subject])),
  started_at             timestamptz NOT NULL,
  ends_at                timestamptz NOT NULL,
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'no_service')),
  end_reason             text CHECK (end_reason IN ('time_up', 'ended_by_user', 'no_service')),
  ended_at               timestamptz,
  -- When the tutor first produced output. A session the service never served does not count.
  first_tutor_output_at  timestamptz,
  CONSTRAINT ai_sessions_length CHECK (ends_at > started_at AND ends_at <= started_at + interval '15 minutes'),
  CONSTRAINT ai_sessions_end CHECK ((status = 'active') = (ended_at IS NULL AND end_reason IS NULL)),
  CONSTRAINT ai_sessions_no_service CHECK (status <> 'no_service' OR first_tutor_output_at IS NULL),
  UNIQUE (student_id, request_key)
);

CREATE UNIQUE INDEX ai_sessions_one_active ON ai_sessions (student_id) WHERE status = 'active';
CREATE INDEX ai_sessions_recent ON ai_sessions (student_id, started_at DESC);

CREATE FUNCTION ai_sessions_daily_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.student_id, 'student');
  -- Serialise starts for this child, so two requests at the same moment cannot both pass.
  PERFORM 1 FROM accounts WHERE id = NEW.student_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM ai_sessions
    WHERE student_id = NEW.student_id AND status <> 'no_service'
      AND started_at > NEW.started_at - interval '24 hours'
      AND started_at <= NEW.started_at
  ) THEN
    RAISE EXCEPTION 'ai daily limit: one AI session in any 24 hours' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_sessions_daily_limit BEFORE INSERT ON ai_sessions
  FOR EACH ROW EXECUTE FUNCTION ai_sessions_daily_limit();
