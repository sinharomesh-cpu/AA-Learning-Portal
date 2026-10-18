-- AA Pro · 0021 Teacher rate negotiation (CR-13; FR-040; OC-98, OC-99, OC-100, OC-101).
--
-- A parent proposes a different rate for one of a teacher's published asking prices; the two
-- sides take turns (at most 6 offers in total) until one accepts or declines, the parent
-- withdraws, or 14 days pass without an answer. An agreed rate is information only: it books
-- nothing, links nothing, grants no access and starts no payment (FR-040.18, OC-77(4)).

-- FR-040.1/.2: off for every teacher, including existing ones, until they turn it on. A price
-- takes proposals only when the global switch is on AND its pricing basis is switched on.
ALTER TABLE teacher_profiles
  ADD COLUMN rate_negotiation_on boolean NOT NULL DEFAULT false,
  ADD COLUMN negotiable_models   text[] NOT NULL DEFAULT '{}'
    CHECK (negotiable_models <@ ARRAY['hourly', 'weekly', 'biweekly', 'monthly']::text[]);

-- FR-040.16: limits the Super Admin changes without a code change (like OC-96).
ALTER TABLE platform_settings DROP CONSTRAINT platform_settings_key_check;
ALTER TABLE platform_settings ADD CONSTRAINT platform_settings_key_check CHECK (key IN (
  'file_uploads_per_day', 'file_mb_per_account', 'database_allowance_mb', 'storage_warn_percent',
  'storage_stop_percent',
  'rate_active_per_parent',     -- negotiations Pending or Counter-proposed at once, per parent
  'rate_new_per_day'));         -- new proposals per parent per calendar day (parent's time zone)
INSERT INTO platform_settings (key, value) VALUES ('rate_active_per_parent', 5), ('rate_new_per_day', 10);

CREATE TABLE rate_negotiations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id           uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  teacher_id          uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  listing_public_id   text NOT NULL CHECK (listing_public_id ~ '^t-[a-z0-9]{10}$'),
  -- The parent's own child, or NULL for a prospective child (FR-040.6).
  child_id            uuid REFERENCES accounts (id) ON DELETE SET NULL,
  -- Identifies the child for the one-active rule and the decline wait: 'child:<id>' or
  -- 'grade:<n>:<curriculum>' for a prospective child.
  child_key           text NOT NULL CHECK (char_length(child_key) <= 120),
  grade               smallint NOT NULL CHECK (grade BETWEEN 1 AND 12),
  curriculum          text CHECK (curriculum IS NULL OR char_length(curriculum) <= 80),
  subject             text NOT NULL CHECK (valid_subjects(ARRAY[subject])),
  -- The pricing basis and currency are fixed for the whole negotiation (FR-040.5).
  model               text NOT NULL CHECK (model IN ('hourly', 'weekly', 'biweekly', 'monthly')),
  currency            text NOT NULL CHECK (currency IN ('INR', 'SGD', 'USD')),
  -- The asking price as published when the proposal was made (kept apart from the agreed rate).
  asking_amount_minor bigint NOT NULL CHECK (asking_amount_minor > 0),
  asking_sessions     smallint CHECK (asking_sessions IS NULL OR asking_sessions BETWEEN 1 AND 31),
  asking_minutes      smallint NOT NULL CHECK (asking_minutes BETWEEN 10 AND 40),
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'countered', 'accepted', 'declined', 'withdrawn', 'expired')),
  -- Whose turn it is while active; NULL once final.
  turn                text CHECK (turn IN ('teacher', 'parent')),
  offers              smallint NOT NULL DEFAULT 1 CHECK (offers BETWEEN 1 AND 6),
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- The moment of the latest action (offer or answer); answers must come before expiry.
  last_action_at      timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  ended_at            timestamptz,
  ended_by            text CHECK (ended_by IN ('teacher', 'parent')),
  decline_reason      text CHECK (decline_reason IN ('no_time', 'not_a_fit', 'personal', 'other')),
  agreed_amount_minor bigint CHECK (agreed_amount_minor IS NULL OR agreed_amount_minor > 0),
  agreed_sessions     smallint,
  agreed_minutes      smallint,
  CONSTRAINT rate_negotiations_active CHECK ((status IN ('pending', 'countered')) = (turn IS NOT NULL)),
  CONSTRAINT rate_negotiations_ended CHECK ((status IN ('pending', 'countered')) = (ended_at IS NULL)),
  CONSTRAINT rate_negotiations_agreed CHECK ((status = 'accepted') = (agreed_amount_minor IS NOT NULL)),
  CONSTRAINT rate_negotiations_sessions CHECK ((model = 'hourly') = (asking_sessions IS NULL)),
  CONSTRAINT rate_negotiations_reason CHECK (decline_reason IS NULL OR status = 'declined'),
  CONSTRAINT rate_negotiations_by CHECK ((status IN ('accepted', 'declined', 'withdrawn')) = (ended_by IS NOT NULL))
);
-- FR-040.14: one active negotiation per parent, teacher, child and basis.
CREATE UNIQUE INDEX rate_negotiations_one_active ON rate_negotiations (parent_id, teacher_id, child_key, model)
  WHERE status IN ('pending', 'countered');
CREATE INDEX rate_negotiations_parent ON rate_negotiations (parent_id, created_at DESC);
CREATE INDEX rate_negotiations_teacher ON rate_negotiations (teacher_id, last_action_at DESC);
CREATE INDEX rate_negotiations_declined ON rate_negotiations (parent_id, teacher_id, child_key, model, ended_at DESC)
  WHERE status = 'declined';

-- FR-040.17: every offer, never changed or deleted.
CREATE TABLE rate_offers (
  negotiation_id  uuid NOT NULL REFERENCES rate_negotiations (id) ON DELETE CASCADE,
  seq             smallint NOT NULL CHECK (seq BETWEEN 1 AND 6),
  made_by         text NOT NULL CHECK (made_by IN ('parent', 'teacher')),
  amount_minor    bigint NOT NULL CHECK (amount_minor > 0),
  sessions        smallint CHECK (sessions IS NULL OR sessions BETWEEN 1 AND 31),
  minutes         smallint NOT NULL CHECK (minutes BETWEEN 10 AND 40),
  message         text CHECK (message IS NULL OR char_length(message) BETWEEN 1 AND 500),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (negotiation_id, seq)
);

CREATE FUNCTION rate_negotiations_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM require_role(NEW.parent_id, 'parent');
    PERFORM require_role(NEW.teacher_id, 'teacher');
    IF NEW.status <> 'pending' OR NEW.turn <> 'teacher' OR NEW.offers <> 1 THEN
      RAISE EXCEPTION 'a negotiation starts with the parent''s first offer' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.child_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM guardian_links g WHERE g.parent_id = NEW.parent_id AND g.student_id = NEW.child_id
        AND g.status = 'active') THEN
      RAISE EXCEPTION 'the child is not the parent''s own' USING ERRCODE = 'check_violation';
    END IF;
    -- FR-040.15 (OC-100): 7 calendar days after a decline by either side.
    IF EXISTS (
      SELECT 1 FROM rate_negotiations d
      WHERE d.parent_id = NEW.parent_id AND d.teacher_id = NEW.teacher_id AND d.child_key = NEW.child_key
        AND d.model = NEW.model AND d.status = 'declined' AND d.ended_at > NEW.created_at - interval '7 days') THEN
      RAISE EXCEPTION 'a new proposal is not allowed until 7 days after a decline' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Final statuses accept no further change (FR-040.13).
  IF OLD.status NOT IN ('pending', 'countered') THEN
    RAISE EXCEPTION 'this negotiation has ended and cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  -- The fixed facts never change.
  IF (NEW.parent_id, NEW.teacher_id, NEW.child_key, NEW.model, NEW.currency, NEW.asking_amount_minor, NEW.subject)
     IS DISTINCT FROM
     (OLD.parent_id, OLD.teacher_id, OLD.child_key, OLD.model, OLD.currency, OLD.asking_amount_minor, OLD.subject) THEN
    RAISE EXCEPTION 'the basis, currency and parties of a negotiation are fixed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'expired' THEN
    IF NEW.ended_at < OLD.expires_at THEN
      RAISE EXCEPTION 'a negotiation expires only after its 14 days' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- Every answer or offer comes before the expiry (FR-040.12).
  IF NEW.last_action_at >= OLD.expires_at THEN
    RAISE EXCEPTION 'this negotiation has expired' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'withdrawn' AND NEW.ended_by IS DISTINCT FROM 'parent' THEN
    RAISE EXCEPTION 'only the parent withdraws' USING ERRCODE = 'check_violation';
  END IF;
  -- Accept, decline and counter belong to the side whose turn it is (FR-040.10).
  IF NEW.status IN ('accepted', 'declined') AND NEW.ended_by IS DISTINCT FROM OLD.turn THEN
    RAISE EXCEPTION 'it is not this side''s turn' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'countered' AND (NEW.offers <> OLD.offers + 1 OR NEW.turn = OLD.turn) THEN
    RAISE EXCEPTION 'a counter-offer adds one offer and passes the turn' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rate_negotiations_check BEFORE INSERT OR UPDATE ON rate_negotiations
  FOR EACH ROW EXECUTE FUNCTION rate_negotiations_check();

-- Offers: numbered in order, made by the side whose turn it is, never edited or deleted.
CREATE FUNCTION rate_offers_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  n record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only together with its negotiation (an account being deleted); never on its own.
    IF EXISTS (SELECT 1 FROM rate_negotiations WHERE id = OLD.negotiation_id) THEN
      RAISE EXCEPTION 'the offer history cannot be changed' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'the offer history cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO n FROM rate_negotiations WHERE id = NEW.negotiation_id;
  IF NEW.seq <> (SELECT count(*) + 1 FROM rate_offers WHERE negotiation_id = NEW.negotiation_id) THEN
    RAISE EXCEPTION 'offers are numbered in order' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.seq = 1 AND NEW.made_by <> 'parent' THEN
    RAISE EXCEPTION 'the parent makes the first offer' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.seq > 1 AND (n.status NOT IN ('pending', 'countered') OR NEW.made_by <> n.turn) THEN
    RAISE EXCEPTION 'an offer needs an active negotiation and this side''s turn' USING ERRCODE = 'check_violation';
  END IF;
  IF (n.model = 'hourly') <> (NEW.sessions IS NULL) THEN
    RAISE EXCEPTION 'lessons per period apply to weekly, every-two-weeks and monthly prices only'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rate_offers_check BEFORE INSERT OR UPDATE OR DELETE ON rate_offers
  FOR EACH ROW EXECUTE FUNCTION rate_offers_check();

