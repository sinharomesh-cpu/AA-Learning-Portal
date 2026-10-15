-- AA Pro · 0003 consent records and request limits (Phase 2, WP2-3)

-- Which version of the privacy notice and terms an adult accepted, and when (M-06, board 62).
CREATE TABLE consents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('privacy_and_terms', 'guardian')),
  version      text NOT NULL CHECK (char_length(version) BETWEEN 1 AND 40),
  accepted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, kind, version)
);

-- Limits on requests that send email (sign-up, password reset), per client address, so the
-- forms cannot be used to flood someone's inbox. Same keyed-hash scheme as sign-in throttling.
ALTER TABLE sign_in_throttle DROP CONSTRAINT sign_in_throttle_kind_check;
ALTER TABLE sign_in_throttle ADD CONSTRAINT sign_in_throttle_kind_check
  CHECK (kind IN ('username', 'email', 'ip', 'request'));
