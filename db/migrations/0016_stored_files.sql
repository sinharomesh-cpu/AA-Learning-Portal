-- AA Pro · 0016 Private file store (CR-07 H-1; OC-87 Q-9, OC-90 Q-3, Q-4, Q-8, OC-91).
-- One private file per row, shared by teacher resources (H-2) and handwritten homework pages
-- (H-4). For the test environment the bytes live in AA Pro's own database (no paid service,
-- OC-91); `storage = 'object'` is reserved for an object store chosen later with the owner's
-- budget approval, behind the same server interface (src/server/files/store.ts).
-- Only re-encoded images and checked PDFs reach this table: the server decides the type from
-- the file's contents, removes photo metadata (location, camera) and converts HEIC to JPEG.

CREATE TABLE stored_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('teacher_resource', 'submission_page')),
  media_type  text NOT NULL CHECK (media_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  byte_size   integer NOT NULL CHECK (byte_size BETWEEN 1 AND 20971520),
  sha256      bytea NOT NULL CHECK (octet_length(sha256) = 32),
  -- A plain name for downloads; never used as a path.
  file_name   text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 120 AND file_name !~ '[/\\\x00-\x1f]'),
  storage     text NOT NULL DEFAULT 'database' CHECK (storage IN ('database', 'object')),
  body        bytea,
  object_key  text CHECK (object_key IS NULL OR char_length(object_key) <= 300),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Set when a file is removed (unshare, retention): the bytes go at once, the row stays for history.
  deleted_at  timestamptz,
  CONSTRAINT stored_files_location CHECK (
    deleted_at IS NOT NULL
    OR (storage = 'database' AND body IS NOT NULL AND octet_length(body) = byte_size AND object_key IS NULL)
    OR (storage = 'object' AND body IS NULL AND object_key IS NOT NULL)),
  CONSTRAINT stored_files_deleted_empty CHECK (deleted_at IS NULL OR (body IS NULL AND object_key IS NULL))
);

CREATE INDEX stored_files_owner ON stored_files (owner_id, created_at DESC);

-- Teachers upload resources; parents (guardians) upload homework pages (CR-07 FR-023.9).
CREATE FUNCTION stored_files_owner_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.purpose = 'teacher_resource' THEN
    PERFORM require_role(NEW.owner_id, 'teacher');
  ELSE
    PERFORM require_role(NEW.owner_id, 'parent');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stored_files_owner_role BEFORE INSERT OR UPDATE OF owner_id, purpose ON stored_files
  FOR EACH ROW EXECUTE FUNCTION stored_files_owner_role();

-- Daily upload limits reuse rate_events.
ALTER TABLE rate_events DROP CONSTRAINT rate_events_kind_check;
ALTER TABLE rate_events ADD CONSTRAINT rate_events_kind_check
  CHECK (kind IN ('listing_save', 'enquiry_new', 'file_upload'));
