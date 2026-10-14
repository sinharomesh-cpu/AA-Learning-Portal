-- AA Pro · 0001 foundation (Phase 2, WP2-1)
-- Accounts, profiles, relationships, one-time tokens, sessions, sign-in throttling,
-- audit events and the email outbox. Test data only until D-28 is decided.
-- Rules: OC-21 (Super Admin scope), OC-23/OC-35 (child sign-in), OC-36 (parent-added
-- teachers), OC-37 (two admins), OC-38 (teacher self-registration).

-- ---------------------------------------------------------------- accounts
CREATE TABLE accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role                text NOT NULL CHECK (role IN ('parent', 'student', 'teacher', 'superadmin')),
  status              text NOT NULL CHECK (status IN (
                        'pending_email',     -- registered, email not yet confirmed
                        'pending_approval',  -- teacher waiting for a Super Admin (OC-36, OC-38)
                        'active',
                        'suspended',
                        'deactivated')),
  -- Adults sign in with an email; children with a username and never have an email (OC-35).
  email               text,
  username            text,
  display_name        text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  -- NULL until a password is set (an invited teacher sets it through a one-time link).
  password_hash       text,
  -- Incremented on every password reset; sessions carrying an older version are invalid.
  credential_version  integer NOT NULL DEFAULT 1 CHECK (credential_version >= 1),
  time_zone           text NOT NULL DEFAULT 'Asia/Kolkata' CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  email_verified_at   timestamptz,
  status_reason       text CHECK (status_reason IS NULL OR char_length(status_reason) <= 500),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_identity_by_role CHECK (
    (role = 'student' AND username IS NOT NULL AND email IS NULL)
    OR (role <> 'student' AND email IS NOT NULL AND username IS NULL)
  ),
  CONSTRAINT accounts_email_shape CHECK (
    email IS NULL OR (email = lower(email) AND char_length(email) <= 254 AND email LIKE '%_@_%')
  ),
  -- Usernames are lower case: a chosen name plus a short random suffix, e.g. "kiran-4821".
  CONSTRAINT accounts_username_shape CHECK (
    username IS NULL OR username ~ '^[a-z0-9][a-z0-9-]{1,30}-[0-9]{4}$'
  )
);
CREATE UNIQUE INDEX accounts_email_unique ON accounts (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX accounts_username_unique ON accounts (username) WHERE username IS NOT NULL;
CREATE INDEX accounts_role_status ON accounts (role, status);

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER accounts_touch BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------- profiles
-- Subject ids match src/fixtures/subjects.ts.
CREATE FUNCTION valid_subjects(subjects text[]) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT subjects <@ ARRAY['maths', 'science', 'sst', 'english', 'hindi', 'it']::text[]
$$;

CREATE TABLE student_profiles (
  account_id   uuid PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  grade        smallint NOT NULL CHECK (grade BETWEEN 1 AND 12),
  curriculum   text CHECK (curriculum IS NULL OR char_length(curriculum) <= 80),
  -- Optional; minimal data (§12). Never shown to Super Admins (OC-21).
  school       text CHECK (school IS NULL OR char_length(school) <= 120),
  subjects     text[] NOT NULL DEFAULT '{}' CHECK (valid_subjects(subjects)),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER student_profiles_touch BEFORE UPDATE ON student_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE teacher_profiles (
  account_id          uuid PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  subjects            text[] NOT NULL DEFAULT '{}' CHECK (valid_subjects(subjects)),
  grades              smallint[] NOT NULL DEFAULT '{}' CHECK (grades <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  bio                 text CHECK (bio IS NULL OR char_length(bio) <= 1000),
  -- How the teacher joined: self-registration (OC-38) or added by a parent (OC-36).
  origin              text NOT NULL CHECK (origin IN ('self_registered', 'parent_added')),
  added_by_parent_id  uuid REFERENCES accounts (id) ON DELETE SET NULL,
  approval_status     text NOT NULL DEFAULT 'draft' CHECK (approval_status IN (
                        'draft', 'submitted', 'approved', 'changes_requested', 'rejected')),
  decided_by          uuid REFERENCES accounts (id) ON DELETE SET NULL,
  decided_at          timestamptz,
  decision_note       text CHECK (decision_note IS NULL OR char_length(decision_note) <= 1000),
  submitted_at        timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- A self-registered teacher has no adding parent. (A parent-added teacher keeps the
  -- reference unless that parent account is later deleted.)
  CONSTRAINT teacher_profiles_origin_parent CHECK (origin = 'parent_added' OR added_by_parent_id IS NULL),
  CONSTRAINT teacher_profiles_decision CHECK (
    approval_status NOT IN ('approved', 'changes_requested', 'rejected') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);
CREATE INDEX teacher_profiles_queue ON teacher_profiles (approval_status, submitted_at);
CREATE TRIGGER teacher_profiles_touch BEFORE UPDATE ON teacher_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------- relationships
-- Parent ↔ child. Every parent permission on a child goes through an active row here (FR-002.2).
CREATE TABLE guardian_links (
  parent_id   uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  PRIMARY KEY (parent_id, student_id),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX guardian_links_student ON guardian_links (student_id) WHERE status = 'active';

-- Teacher ↔ child (OC-36). Created only by a parent: ticked children when adding a teacher,
-- or (Phase 3) a parent-confirmed booking. 'pending' until the teacher is approved.
CREATE TABLE teacher_student_links (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id            uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  student_id            uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_by_parent_id  uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  source                text NOT NULL CHECK (source IN ('parent_added', 'booking')),
  status                text NOT NULL CHECK (status IN ('pending', 'active', 'removed')),
  subject               text CHECK (subject IS NULL OR valid_subjects(ARRAY[subject])),
  created_at            timestamptz NOT NULL DEFAULT now(),
  removed_at            timestamptz,
  CHECK ((status = 'removed') = (removed_at IS NOT NULL))
);
-- At most one live link per teacher and child.
CREATE UNIQUE INDEX teacher_student_links_live ON teacher_student_links (teacher_id, student_id) WHERE status <> 'removed';
CREATE INDEX teacher_student_links_student ON teacher_student_links (student_id) WHERE status = 'active';

-- Links must join accounts of the right roles; checked in the database as a second line of
-- defence behind the application checks.
CREATE FUNCTION require_role(account uuid, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = account AND role = expected) THEN
    RAISE EXCEPTION 'account % is not a %', account, expected USING ERRCODE = 'check_violation';
  END IF;
END $$;

CREATE FUNCTION guardian_links_roles() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.parent_id, 'parent');
  PERFORM require_role(NEW.student_id, 'student');
  RETURN NEW;
END $$;
CREATE TRIGGER guardian_links_roles BEFORE INSERT OR UPDATE OF parent_id, student_id ON guardian_links
  FOR EACH ROW EXECUTE FUNCTION guardian_links_roles();

-- The creating parent must be an active guardian of the child.
CREATE FUNCTION teacher_student_links_roles() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.teacher_id, 'teacher');
  PERFORM require_role(NEW.student_id, 'student');
  IF NOT EXISTS (
    SELECT 1 FROM guardian_links
    WHERE parent_id = NEW.created_by_parent_id AND student_id = NEW.student_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'parent is not a guardian of this child' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teacher_student_links_roles BEFORE INSERT OR UPDATE OF teacher_id, student_id, created_by_parent_id
  ON teacher_student_links FOR EACH ROW EXECUTE FUNCTION teacher_student_links_roles();

-- Profiles must belong to accounts of the matching role.
CREATE FUNCTION student_profiles_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.account_id, 'student');
  RETURN NEW;
END $$;
CREATE TRIGGER student_profiles_role BEFORE INSERT OR UPDATE OF account_id ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION student_profiles_role();

CREATE FUNCTION teacher_profiles_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.account_id, 'teacher');
  IF NEW.added_by_parent_id IS NOT NULL THEN
    PERFORM require_role(NEW.added_by_parent_id, 'parent');
  END IF;
  IF NEW.decided_by IS NOT NULL THEN
    PERFORM require_role(NEW.decided_by, 'superadmin');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teacher_profiles_role BEFORE INSERT OR UPDATE ON teacher_profiles
  FOR EACH ROW EXECUTE FUNCTION teacher_profiles_role();

-- ---------------------------------------------------------------- one-time tokens
-- Email confirmation, password reset (M-03) and set-password links (OC-36). Only a hash of
-- the token is stored; links are single-use and expire.
CREATE TABLE one_time_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('email_verify', 'password_reset', 'set_password')),
  token_hash  bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX one_time_tokens_account ON one_time_tokens (account_id, purpose);

-- ---------------------------------------------------------------- sessions
-- Server-side sessions so they can be revoked at once (G1-08 §3.2). The cookie holds a random
-- id; only its SHA-256 hash is stored.
CREATE TABLE sessions (
  id_hash              bytea PRIMARY KEY CHECK (octet_length(id_hash) = 32),
  account_id           uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  credential_version   integer NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  last_seen_at         timestamptz NOT NULL DEFAULT now(),
  idle_expires_at      timestamptz NOT NULL,
  absolute_expires_at  timestamptz NOT NULL,
  -- Last password (or password + MFA) confirmation, for step-up checks (G1-08 §3.4).
  reauthenticated_at   timestamptz NOT NULL DEFAULT now(),
  mfa_verified_at      timestamptz,
  revoked_at           timestamptz
);
CREATE INDEX sessions_account ON sessions (account_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------- sign-in throttling
-- Keyed on an HMAC of the submitted username or of the client address, whether or not the
-- account exists (G1-08 §3.2). No raw usernames or IP addresses are stored.
CREATE TABLE sign_in_throttle (
  kind              text NOT NULL CHECK (kind IN ('username', 'email', 'ip')),
  key_hash          bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  failures          integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until      timestamptz,
  PRIMARY KEY (kind, key_hash)
);

-- ---------------------------------------------------------------- audit events
-- Append-only (OC-21: read-only audit log). Never holds passwords, tokens or child content.
CREATE TABLE audit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_id  text,
  event_type  text NOT NULL CHECK (event_type ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  outcome     text NOT NULL CHECK (outcome IN ('success', 'failure', 'denied')),
  actor_id    uuid REFERENCES accounts (id) ON DELETE SET NULL,
  subject_id  uuid REFERENCES accounts (id) ON DELETE SET NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX audit_events_time ON audit_events (occurred_at DESC);
CREATE INDEX audit_events_actor ON audit_events (actor_id, occurred_at DESC);
CREATE INDEX audit_events_subject ON audit_events (subject_id, occurred_at DESC);

CREATE FUNCTION audit_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END $$;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();

-- ---------------------------------------------------------------- email outbox
-- Every email is written here (P2-00 §2). Nothing is sent until a provider is approved
-- (A-02). Rows that carry a one-time link are cleared of the link once it expires or is used.
CREATE TABLE email_outbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address   text NOT NULL CHECK (char_length(to_address) <= 254),
  template     text NOT NULL CHECK (template ~ '^[a-z][a-z0-9_]{2,63}$'),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  -- Prevents the same message being queued twice (§10 duplicate prevention).
  dedupe_key   text NOT NULL UNIQUE CHECK (char_length(dedupe_key) <= 200),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz
);
CREATE INDEX email_outbox_pending ON email_outbox (created_at) WHERE status = 'pending';
