-- AA Pro · 0004 child accounts (Phase 2, WP2-4)
-- Rules: OC-23 / OC-35 (D-23a child sign-in, lockout and recovery), M-06 (guardian consent),
-- M-08 (child profile). Test data only until D-28 is decided.

-- The picture a parent picks for a child (M-08). Photo upload is not offered.
ALTER TABLE student_profiles
  ADD COLUMN avatar text NOT NULL DEFAULT 'star' CHECK (avatar IN ('star', 'sun', 'leaf', 'moon'));

-- M-06: the two required consents a parent gives before adding a child, and the optional
-- email-reminder choice, each recorded with the notice version and time.
ALTER TABLE consents DROP CONSTRAINT consents_kind_check;
ALTER TABLE consents ADD CONSTRAINT consents_kind_check
  CHECK (kind IN ('privacy_and_terms', 'guardian', 'ai_tutor', 'email_reminders'));

-- Step-up re-authentication (G1-08 §3.4 step 3): wrong password entries in this session.
-- Five sign the parent out.
ALTER TABLE sessions
  ADD COLUMN reauth_failures integer NOT NULL DEFAULT 0 CHECK (reauth_failures >= 0);
