-- AA Pro · 0011 Teacher photos (Phase 2, PR-D1b; OC-84, OC-85)
-- Optional profile photo. Stored in AA Pro's own database (OC-85: no new service). The server
-- re-encodes every upload to a 400 × 400 WebP without metadata (no location data), so rows stay
-- small. A photo is seen by families or visitors only after the AA Pro team approves it
-- (OC-85); until then the teacher's initial is shown. Public display also needs the teacher's
-- consent when they publish a listing (OC-77(1), PR-D2).
CREATE TABLE teacher_photos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id     uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  status         text NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
  -- WebP bytes; removed when a photo is declined (only the note is kept for the teacher).
  image          bytea CHECK (image IS NULL OR octet_length(image) BETWEEN 1 AND 200000),
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  decided_by     uuid REFERENCES accounts (id) ON DELETE SET NULL,
  decided_at     timestamptz,
  decision_note  text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  CONSTRAINT teacher_photos_image CHECK ((status = 'declined') = (image IS NULL)),
  CONSTRAINT teacher_photos_decided CHECK (status = 'pending' OR decided_at IS NOT NULL)
);
-- At most one photo of each kind per teacher: the approved one stays visible while a new one waits.
CREATE UNIQUE INDEX teacher_photos_one_pending ON teacher_photos (teacher_id) WHERE status = 'pending';
CREATE UNIQUE INDEX teacher_photos_one_approved ON teacher_photos (teacher_id) WHERE status = 'approved';
CREATE UNIQUE INDEX teacher_photos_one_declined ON teacher_photos (teacher_id) WHERE status = 'declined';
CREATE INDEX teacher_photos_queue ON teacher_photos (uploaded_at) WHERE status = 'pending';

CREATE FUNCTION teacher_photos_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.teacher_id, 'teacher');
  RETURN NEW;
END $$;
CREATE TRIGGER teacher_photos_role BEFORE INSERT OR UPDATE OF teacher_id ON teacher_photos
  FOR EACH ROW EXECUTE FUNCTION teacher_photos_role();
