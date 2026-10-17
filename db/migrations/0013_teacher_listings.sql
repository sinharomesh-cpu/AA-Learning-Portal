-- AA Pro · 0013 "Looking for students" listings (Phase 2, PR-D2; board D5; OC-77, OC-79 C, OC-80, OC-85)
--
-- One listing per teacher. The editable values (subjects, grades, prices) are the teacher's
-- draft. What the public sees is `published`: a copy of exactly the details the teacher saw in
-- the preview and agreed to show (OC-77(1)). Profile edits made elsewhere never change the
-- public listing until the teacher reviews and agrees again (OC-80 C-6); narrowing by an
-- approver (fewer approved subjects or grades, L-5) applies at once.
-- Listings are shown for 60 days, then hidden until renewed (OC-76(3)); prices are information
-- only — AA Pro never charges, collects or pays out money (OC-77(4), (8)).

-- Rolling 24-hour limits (OC-80 C-3): one row per counted action, pruned after 7 days.
CREATE TABLE rate_events (
  id           bigserial PRIMARY KEY,
  account_id   uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('listing_save')),
  occurred_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_events_lookup ON rate_events (account_id, kind, occurred_at);

CREATE TABLE teacher_listings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Public address /teachers/t-…: random, never the account id (P2-R3 §11.5).
  public_id            text NOT NULL UNIQUE CHECK (public_id ~ '^t-[a-z0-9]{10}$'),
  teacher_id           uuid NOT NULL UNIQUE REFERENCES accounts (id) ON DELETE CASCADE,
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'withdrawn')),
  subjects             text[] NOT NULL DEFAULT '{}' CHECK (valid_subjects(subjects)),
  grades               smallint[] NOT NULL DEFAULT '{}'
                       CHECK (grades <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  published            jsonb,
  published_at         timestamptz,
  expires_at           timestamptz,
  consent_version      text CHECK (consent_version IS NULL OR char_length(consent_version) BETWEEN 1 AND 60),
  consent_at           timestamptz,
  -- The expiry date a reminder was queued for, so it is queued once per period (L-2).
  reminder_queued_for  timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_listings_public_copy CHECK ((status IN ('published', 'paused')) = (published IS NOT NULL)),
  CONSTRAINT teacher_listings_published_fields CHECK (
    published IS NULL OR (published_at IS NOT NULL AND expires_at IS NOT NULL
                          AND consent_at IS NOT NULL AND consent_version IS NOT NULL)
  )
);
-- Public search reads published listings only.
CREATE INDEX teacher_listings_public ON teacher_listings USING gin (published jsonb_path_ops)
  WHERE status = 'published';
CREATE TRIGGER teacher_listings_touch BEFORE UPDATE ON teacher_listings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Up to 3 asking prices per listing (OC-77(8)): hourly (rate + minutes per session), or weekly,
-- every two weeks or monthly (amount + sessions + minutes). Sessions are at most 40 minutes
-- (K-5). Amounts in the smallest unit of INR, SGD or USD; never converted (OC-76(4)).
CREATE TABLE listing_prices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    uuid NOT NULL REFERENCES teacher_listings (id) ON DELETE CASCADE,
  position      smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
  model         text NOT NULL CHECK (model IN ('hourly', 'weekly', 'biweekly', 'monthly')),
  currency      text NOT NULL CHECK (currency IN ('INR', 'SGD', 'USD')),
  amount_minor  integer NOT NULL CHECK (amount_minor BETWEEN 1 AND 100000000),
  sessions      smallint CHECK (sessions IS NULL OR sessions BETWEEN 1 AND 31),
  minutes       smallint NOT NULL CHECK (minutes BETWEEN 10 AND 40),
  UNIQUE (listing_id, position),
  CONSTRAINT listing_prices_sessions CHECK ((model = 'hourly') = (sessions IS NULL))
);

-- L-1: only teachers; the draft and the public copy stay within the approved profile; only an
-- approved, active teacher can have a published listing.
CREATE FUNCTION teacher_listings_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  p record;
BEGIN
  PERFORM require_role(NEW.teacher_id, 'teacher');
  SELECT t.subjects, t.grades, t.approval_status, a.status INTO p
  FROM teacher_profiles t JOIN accounts a ON a.id = t.account_id WHERE t.account_id = NEW.teacher_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing teacher has no profile' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (NEW.subjects <@ p.subjects AND NEW.grades <@ p.grades) THEN
    RAISE EXCEPTION 'listing outside the approved profile' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.published IS NOT NULL AND NOT (
    ARRAY(SELECT jsonb_array_elements_text(NEW.published -> 'subjects')) <@ p.subjects
    AND ARRAY(SELECT (jsonb_array_elements_text(NEW.published -> 'grades'))::smallint) <@ p.grades
  ) THEN
    RAISE EXCEPTION 'listing outside the approved profile' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'published' AND NOT (p.approval_status = 'approved' AND p.status = 'active') THEN
    RAISE EXCEPTION 'only an approved, active teacher can publish' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teacher_listings_check BEFORE INSERT OR UPDATE ON teacher_listings
  FOR EACH ROW EXECUTE FUNCTION teacher_listings_check();
