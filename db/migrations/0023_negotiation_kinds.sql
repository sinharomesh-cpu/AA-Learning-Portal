-- AA Pro · 0023 Separate hourly and package price proposals (CR-15 Phase A, step A4; FR-043;
-- P-6, P-10, OC-104).
--
-- CR-13 negotiations gain a kind:
--   legacy  — made on the earlier weekly / every-two-weeks / monthly / hourly prices (every row
--             that exists today); they continue to their natural end under CR-13.
--   hourly  — an hourly rate for one negotiable usual time (model 'hourly'); the time is copied.
--   package — the learning package's total price (model 'package'); its terms are copied.
-- The one-open rule and the 7-day wait after a decline were already per model, so they are now
-- per type (P-10): an open hourly proposal never blocks a package proposal, and the reverse.
-- Offers on the new kinds change the amount only (P-6); the lesson length and terms never change.
-- Additive: nothing is deleted; existing rows keep their meaning.

ALTER TABLE rate_negotiations
  ADD COLUMN kind          text NOT NULL DEFAULT 'legacy' CHECK (kind IN ('legacy', 'hourly', 'package')),
  -- hourly: {"weekday", "start", "end", "timeZone"} as published when the proposal was made.
  ADD COLUMN slot          jsonb,
  -- package: the published package terms (classes, a week, minutes, weeks, times, terms version).
  ADD COLUMN package_terms jsonb;

ALTER TABLE rate_negotiations DROP CONSTRAINT rate_negotiations_model_check;
ALTER TABLE rate_negotiations ADD CONSTRAINT rate_negotiations_model_check
  CHECK (model IN ('hourly', 'weekly', 'biweekly', 'monthly', 'package'));
ALTER TABLE rate_negotiations DROP CONSTRAINT rate_negotiations_sessions;
ALTER TABLE rate_negotiations ADD CONSTRAINT rate_negotiations_sessions
  CHECK ((model IN ('hourly', 'package')) = (asking_sessions IS NULL));
ALTER TABLE rate_negotiations ADD CONSTRAINT rate_negotiations_kind CHECK (
  (kind = 'legacy' AND model <> 'package' AND slot IS NULL AND package_terms IS NULL)
  OR (kind = 'hourly' AND model = 'hourly' AND slot IS NOT NULL AND package_terms IS NULL)
  OR (kind = 'package' AND model = 'package' AND package_terms IS NOT NULL AND slot IS NULL));

CREATE OR REPLACE FUNCTION rate_negotiations_check() RETURNS trigger LANGUAGE plpgsql AS $$
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
    -- FR-040.15 (OC-100), P-10: 7 calendar days after a decline by either side, per type (model).
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
  -- The fixed facts never change, including the copied time or package terms (P-6).
  IF (NEW.parent_id, NEW.teacher_id, NEW.child_key, NEW.model, NEW.currency, NEW.asking_amount_minor, NEW.subject,
      NEW.kind, NEW.slot, NEW.package_terms, NEW.asking_minutes)
     IS DISTINCT FROM
     (OLD.parent_id, OLD.teacher_id, OLD.child_key, OLD.model, OLD.currency, OLD.asking_amount_minor, OLD.subject,
      OLD.kind, OLD.slot, OLD.package_terms, OLD.asking_minutes) THEN
    RAISE EXCEPTION 'the basis, currency and parties of a negotiation are fixed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'expired' THEN
    IF NEW.ended_at < OLD.expires_at THEN
      RAISE EXCEPTION 'a negotiation expires only after its 14 days' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.last_action_at >= OLD.expires_at THEN
    RAISE EXCEPTION 'this negotiation has expired' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'withdrawn' AND NEW.ended_by IS DISTINCT FROM 'parent' THEN
    RAISE EXCEPTION 'only the parent withdraws' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IN ('accepted', 'declined') AND NEW.ended_by IS DISTINCT FROM OLD.turn THEN
    RAISE EXCEPTION 'it is not this side''s turn' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'countered' AND (NEW.offers <> OLD.offers + 1 OR NEW.turn = OLD.turn) THEN
    RAISE EXCEPTION 'a counter-offer adds one offer and passes the turn' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION rate_offers_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  n record;
BEGIN
  IF TG_OP = 'DELETE' THEN
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
  IF (n.model IN ('hourly', 'package')) <> (NEW.sessions IS NULL) THEN
    RAISE EXCEPTION 'lessons per period apply to weekly, every-two-weeks and monthly prices only'
      USING ERRCODE = 'check_violation';
  END IF;
  -- P-6: hourly and package offers change the amount only.
  IF n.kind <> 'legacy' AND NEW.minutes <> n.asking_minutes THEN
    RAISE EXCEPTION 'offers on hourly and package proposals change the price only' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
