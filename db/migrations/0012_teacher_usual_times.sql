-- AA Pro · 0012 Teacher usual weekly times (Phase 2, PR-D1c; boards D3, D5, D9; OC-85)
-- "Usually free" times a teacher shows families on a listing. A guide only: nothing is booked or
-- reserved from them; bookable availability, exceptions and capacity come with scheduling
-- (Phase 3, board M-23), which will build on these rows.
-- Times are wall-clock times in the teacher's own time zone (accounts.time_zone), in 30-minute
-- steps. Families see them converted to their own time zone.
CREATE TABLE teacher_usual_times (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  -- ISO weekday: 1 = Monday … 7 = Sunday.
  weekday       smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_minute  smallint NOT NULL CHECK (start_minute BETWEEN 0 AND 1410 AND start_minute % 30 = 0),
  end_minute    smallint NOT NULL CHECK (end_minute BETWEEN 30 AND 1440 AND end_minute % 30 = 0),
  CONSTRAINT teacher_usual_times_order CHECK (end_minute > start_minute)
);
CREATE INDEX teacher_usual_times_teacher ON teacher_usual_times (teacher_id, weekday, start_minute);

-- Only teachers; at most 14 ranges each; ranges on the same day may not overlap.
CREATE FUNCTION teacher_usual_times_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.teacher_id, 'teacher');
  IF EXISTS (
    SELECT 1 FROM teacher_usual_times u
    WHERE u.teacher_id = NEW.teacher_id AND u.weekday = NEW.weekday AND u.id <> NEW.id
      AND u.start_minute < NEW.end_minute AND NEW.start_minute < u.end_minute
  ) THEN
    RAISE EXCEPTION 'usual times overlap' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM teacher_usual_times u WHERE u.teacher_id = NEW.teacher_id AND u.id <> NEW.id) >= 14 THEN
    RAISE EXCEPTION 'too many usual times' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teacher_usual_times_check BEFORE INSERT OR UPDATE ON teacher_usual_times
  FOR EACH ROW EXECUTE FUNCTION teacher_usual_times_check();
