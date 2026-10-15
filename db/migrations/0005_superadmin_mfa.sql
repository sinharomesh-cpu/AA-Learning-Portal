-- AA Pro · 0005 Super Admin setup and MFA (Phase 2, WP2-5a)
-- Rules: OC-21 (Super Admin scope), OC-37/OC-50 (owner is the Super Admin, with recovery
-- codes), G1-08 §3 (step-up and audit).

-- Exactly one Super Admin: the owner (OC-50). Admins come in WP2-5b.
CREATE UNIQUE INDEX accounts_one_superadmin ON accounts ((role)) WHERE role = 'superadmin';

-- Authenticator-app factor (time-based codes). The secret is encrypted with a key derived
-- from the server secret; it is never shown again after enrolment. `last_time_step` stops a
-- code from being used twice.
CREATE TABLE mfa_factors (
  account_id      uuid PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  secret_enc      bytea NOT NULL CHECK (octet_length(secret_enc) BETWEEN 29 AND 200),
  confirmed_at    timestamptz,
  last_time_step  bigint,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One-time recovery codes (OC-50). Only keyed hashes are stored; each works once.
CREATE TABLE recovery_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  code_hash   bytea NOT NULL UNIQUE CHECK (octet_length(code_hash) = 32),
  created_at  timestamptz NOT NULL DEFAULT now(),
  used_at     timestamptz
);
CREATE INDEX recovery_codes_account ON recovery_codes (account_id) WHERE used_at IS NULL;

-- Wrong security codes in this session; five sign the person out.
ALTER TABLE sessions
  ADD COLUMN mfa_failures integer NOT NULL DEFAULT 0 CHECK (mfa_failures >= 0);
