-- AA Pro · 0006 Admins and permissions (Phase 2, WP2-5b)
-- Rules: OC-21 (no access to children's content, no sign-in-as, no child password resets),
-- OC-37/OC-50 (the owner is the Super Admin and may add Admins with chosen permissions).

-- Admins are a role of their own; there is still only one Super Admin (0005).
ALTER TABLE accounts DROP CONSTRAINT accounts_role_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_role_check
  CHECK (role IN ('parent', 'student', 'teacher', 'admin', 'superadmin'));

-- What each Admin may manage (board 66). The Super Admin has every permission implicitly and
-- is the only one who can change these rows.
CREATE TABLE admin_permissions (
  account_id   uuid PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  permissions  text[] NOT NULL DEFAULT '{}'
               CHECK (permissions <@ ARRAY['accounts', 'teacher_approvals', 'audit_log']::text[]),
  granted_by   uuid REFERENCES accounts (id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION admin_permissions_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.account_id, 'admin');
  IF NEW.granted_by IS NOT NULL THEN
    PERFORM require_role(NEW.granted_by, 'superadmin');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER admin_permissions_role BEFORE INSERT OR UPDATE ON admin_permissions
  FOR EACH ROW EXECUTE FUNCTION admin_permissions_role();

-- Teacher decisions may be made by the Super Admin or an Admin with "Teacher approvals"
-- (the permission itself is checked by the application). Teachers may also be created by an
-- admin from the Accounts page (M-28); they still need approval.
CREATE OR REPLACE FUNCTION teacher_profiles_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.account_id, 'teacher');
  IF NEW.added_by_parent_id IS NOT NULL THEN
    PERFORM require_role(NEW.added_by_parent_id, 'parent');
  END IF;
  IF NEW.decided_by IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM accounts WHERE id = NEW.decided_by AND role IN ('superadmin', 'admin')) THEN
    RAISE EXCEPTION 'account % is not an admin', NEW.decided_by USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE teacher_profiles DROP CONSTRAINT teacher_profiles_origin_check;
ALTER TABLE teacher_profiles ADD CONSTRAINT teacher_profiles_origin_check
  CHECK (origin IN ('self_registered', 'parent_added', 'admin_created'));
