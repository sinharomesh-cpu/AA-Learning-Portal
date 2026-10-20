-- AA Pro · 0026 In-app notifications (CR-16 v0.7, approved baseline OC-119; implementation
-- approved for the free test site, 20 Oct 2026). Additive only: no existing table, row or rule
-- changes.
--
-- One row per authorised recipient per business event (§3, §5). Rows are created only by server
-- code, in the same transaction as the business change, with an event-based de-duplication key
-- (never the clock) and ON CONFLICT DO NOTHING. Menu badges never read this table (§4.1): they
-- are counted from the business records. Super Admin and Admin accounts never receive
-- notifications (D-6). Nothing here sends email or WhatsApp; email_outbox is unchanged (D-11).

CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('action', 'update', 'reminder')),
  -- The event, e.g. enquiry_received (used for icons and labels; never shown as text).
  type          text NOT NULL CHECK (type ~ '^[a-z][a-z0-9_]{2,63}$'),
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body          text NOT NULL DEFAULT '' CHECK (char_length(body) <= 300),
  -- An internal path only (§5, AC-26): never a full address, never "//", no query or fragment.
  href          text NOT NULL CHECK (href ~ '^/[a-z][a-z0-9/_-]*$' AND href !~ '//' AND char_length(href) <= 200),
  -- The underlying business record, re-checked on every list and open (§8, §8.1).
  entity_type   text NOT NULL CHECK (entity_type IN ('enquiry', 'link_request', 'rate_proposal', 'resource_share',
                                                     'listing', 'learning_package', 'teacher_profile')),
  entity_id     uuid NOT NULL,
  -- Rate proposals: the offer number this notification announces (§5, §6.1).
  offer_seq     smallint CHECK (offer_seq IS NULL OR offer_seq BETWEEN 1 AND 6),
  dedupe_key    text NOT NULL UNIQUE CHECK (char_length(dedupe_key) BETWEEN 3 AND 300),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Set once, the first time it is read (opened, marked read or "Mark all"); never moved or cleared.
  read_at       timestamptz,
  CONSTRAINT notifications_offer CHECK ((entity_type = 'rate_proposal' AND kind = 'action') = (offer_seq IS NOT NULL))
);
-- Newest first, keyset paging (§6.2).
CREATE INDEX notifications_recipient ON notifications (recipient_id, created_at DESC, id DESC);
-- The bell number (§4).
CREATE INDEX notifications_unread ON notifications (recipient_id) WHERE read_at IS NULL;
-- Retention (§9): read rows by read_at, unread rows by created_at.
CREATE INDEX notifications_read_age ON notifications (read_at) WHERE read_at IS NOT NULL;
CREATE INDEX notifications_unread_age ON notifications (created_at) WHERE read_at IS NULL;

-- Only parents, teachers and students receive notifications (D-6); read_at is set once; nothing
-- else about a notification ever changes. Users cannot delete them: only retention does (§9).
CREATE FUNCTION notifications_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = NEW.recipient_id AND role IN ('parent', 'teacher', 'student')) THEN
      RAISE EXCEPTION 'notifications go to parents, teachers and students only' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at THEN
    RAISE EXCEPTION 'read_at is set once' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.recipient_id, NEW.kind, NEW.type, NEW.title, NEW.body, NEW.href, NEW.entity_type, NEW.entity_id,
      NEW.offer_seq, NEW.dedupe_key, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.recipient_id, OLD.kind, OLD.type, OLD.title, OLD.body, OLD.href, OLD.entity_type, OLD.entity_id,
      OLD.offer_seq, OLD.dedupe_key, OLD.created_at) THEN
    RAISE EXCEPTION 'a notification cannot be changed, only marked read' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notifications_check BEFORE INSERT OR UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION notifications_check();

-- Two stored "last run" times in the existing database (no scheduler, no new service, ₹0):
--   shared_sweep  the expiry and listing-reminder sweeps, at most once a minute across all users
--                 and server instances (§7.5, Q-8);
--   cleanup       retention clean-up, at most once an hour (§9, D-9).
-- A run is claimed with one conditional UPDATE on the database clock; the row lock makes
-- concurrent claims wait and re-check, so exactly one wins.
CREATE TABLE notification_throttles (
  name         text PRIMARY KEY CHECK (name IN ('shared_sweep', 'cleanup')),
  last_run_at  timestamptz NOT NULL
);
INSERT INTO notification_throttles (name, last_run_at) VALUES ('shared_sweep', '-infinity'), ('cleanup', '-infinity');

-- §7.6 (B-1 option C): the parent side of the user-scoped link-request expiry check. Keyed on
-- the parent only (columns from 0001), so this migration does not depend on 0020's columns.
CREATE INDEX teacher_student_links_parent_requested
  ON teacher_student_links (created_by_parent_id) WHERE status = 'requested';
