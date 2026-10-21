-- AA Pro · 0027 Human Teacher worksheets and homework (M3).
-- CR-07 FR-022 and FR-024 (digital homework and its lifecycle), CR-17 PR 4 and PR 5, expanded by
-- the worksheet assessment Revision 2 and the readiness pack (owner decisions OC-127, OC-128 and
-- OC-129: one student per assignment, reusable library, W-2, W-3, W-7, W-9, W-10, W-11).
-- Additive only: no existing row changes meaning; two lists are widened (notification record
-- types) and teacher resources gain an optional type label.
--
-- Two kinds of record, kept apart on purpose:
--  * worksheets / worksheet_questions: the teacher's own library. Never shown to a student.
--  * assignments / questions / assignment_targets / answers / assignment_events: the frozen copy
--    given to ONE student. Later library edits never reach it. Assigning the same worksheet to
--    the same student again makes another, independent copy (W-9).
-- Human Teacher module only: nothing here is used by, or calls, any AI provider.

-- ---------------------------------------------------------------- the teacher's library
CREATE TABLE worksheets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('exercise', 'handwritten')),
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  -- Labels (W-3). Board uses the same list as children's profiles (src/lib/curricula.ts).
  grade         smallint NOT NULL CHECK (grade BETWEEN 1 AND 12),
  board         text NOT NULL CHECK (char_length(board) BETWEEN 1 AND 80),
  subject       text NOT NULL CHECK (valid_subjects(ARRAY[subject])),
  -- Typed by the teacher, never an invented chapter name (OC-63).
  chapter       text CHECK (chapter IS NULL OR char_length(chapter) BETWEEN 1 AND 120),
  topic         text CHECK (topic IS NULL OR char_length(topic) BETWEEN 1 AND 120),
  difficulty    text CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')),
  instructions  text NOT NULL DEFAULT '' CHECK (char_length(instructions) <= 4000),
  -- Optional source the teacher works from: one of their own shared files, with pages (W2).
  -- A parent's book as source comes with books (M6, PR B2).
  source_resource_id uuid REFERENCES teacher_resources (id) ON DELETE SET NULL,
  source_from_page   smallint CHECK (source_from_page IS NULL OR source_from_page BETWEEN 1 AND 9999),
  source_to_page     smallint CHECK (source_to_page IS NULL OR source_to_page BETWEEN 1 AND 9999),
  CHECK (source_to_page IS NULL OR (source_from_page IS NOT NULL AND source_to_page >= source_from_page)),
  CONSTRAINT worksheets_source_pages CHECK (source_from_page IS NULL OR source_resource_id IS NOT NULL),
  -- Draft or Ready; archiving is separate so Restore brings back what it was.
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz
);
CREATE INDEX worksheets_teacher ON worksheets (teacher_id, updated_at DESC);
CREATE TRIGGER worksheets_touch BEFORE UPDATE ON worksheets FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE FUNCTION worksheets_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.teacher_id, 'teacher');
  IF NEW.source_resource_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM teacher_resources WHERE id = NEW.source_resource_id AND teacher_id = NEW.teacher_id
  ) THEN
    RAISE EXCEPTION 'the source file is not this teacher''s' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER worksheets_owner BEFORE INSERT OR UPDATE OF teacher_id, source_resource_id ON worksheets
  FOR EACH ROW EXECUTE FUNCTION worksheets_owner();

-- Question types (CR-07 FR-022.2, FR-022.3). Shared by library and frozen questions.
CREATE FUNCTION valid_question_type(t text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT t IN ('single_choice', 'multi_select', 'fill_blank', 'true_false', 'matching', 'short_answer')
$$;

CREATE TABLE worksheet_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id    uuid NOT NULL REFERENCES worksheets (id) ON DELETE CASCADE,
  position        smallint NOT NULL CHECK (position BETWEEN 1 AND 100),
  type            text NOT NULL CHECK (valid_question_type(type)),
  -- An empty prompt is an empty slot made by the question plan (W-3); the teacher fills it.
  prompt          text NOT NULL DEFAULT '' CHECK (char_length(prompt) <= 1000),
  -- Options, blanks or pairs; shape checked in code (src/lib/worksheetQuestions.ts).
  data            jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(data) = 'object'),
  answer_key      jsonb CHECK (answer_key IS NULL OR jsonb_typeof(answer_key) = 'object'),
  points          smallint NOT NULL DEFAULT 1 CHECK (points BETWEEN 0 AND 100),
  partial_credit  boolean NOT NULL DEFAULT false,
  -- Optional page of the source the question comes from; shown to the teacher only.
  source_page     smallint CHECK (source_page IS NULL OR source_page BETWEEN 1 AND 9999),
  CONSTRAINT worksheet_questions_position UNIQUE (worksheet_id, position) DEFERRABLE INITIALLY DEFERRED
);

-- A Ready worksheet is complete: an exercise has at least one question, no empty slot, and
-- every automatically marked question has an answer key. Handwritten worksheets have none.
-- Checked at commit, so a save can rewrite all questions in one transaction.
CREATE FUNCTION worksheet_ready_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  w worksheets%ROWTYPE;
  wid uuid;
BEGIN
  IF TG_TABLE_NAME = 'worksheets' THEN
    wid := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    wid := OLD.worksheet_id;
  ELSE
    wid := NEW.worksheet_id;
  END IF;
  SELECT * INTO w FROM worksheets WHERE id = wid;
  IF NOT FOUND OR w.status <> 'ready' THEN
    RETURN NULL;
  END IF;
  IF w.kind = 'handwritten' THEN
    IF EXISTS (SELECT 1 FROM worksheet_questions WHERE worksheet_id = wid) THEN
      RAISE EXCEPTION 'handwritten worksheets have no questions' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM worksheet_questions WHERE worksheet_id = wid) THEN
    RAISE EXCEPTION 'a ready exercise needs at least one question' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM worksheet_questions
    WHERE worksheet_id = wid AND (prompt = '' OR (type <> 'short_answer' AND answer_key IS NULL))
  ) THEN
    RAISE EXCEPTION 'a ready worksheet has an empty question or a missing answer key' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER worksheets_ready AFTER INSERT OR UPDATE ON worksheets
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION worksheet_ready_check();
CREATE CONSTRAINT TRIGGER worksheet_questions_ready AFTER INSERT OR UPDATE OR DELETE ON worksheet_questions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION worksheet_ready_check();

-- ---------------------------------------------------------------- a student's frozen copy
CREATE TABLE assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  -- Where the copy came from. Kept if the worksheet is archived; cleared if it is ever removed.
  worksheet_id  uuid REFERENCES worksheets (id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('exercise', 'handwritten')),
  -- Copied from the worksheet when assigned (frozen).
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  grade         smallint NOT NULL CHECK (grade BETWEEN 1 AND 12),
  board         text NOT NULL CHECK (char_length(board) BETWEEN 1 AND 80),
  subject       text NOT NULL CHECK (valid_subjects(ARRAY[subject])),
  chapter       text CHECK (chapter IS NULL OR char_length(chapter) BETWEEN 1 AND 120),
  topic         text CHECK (topic IS NULL OR char_length(topic) BETWEEN 1 AND 120),
  difficulty    text CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')),
  instructions  text NOT NULL DEFAULT '' CHECK (char_length(instructions) <= 4000),
  -- Hidden from the student and parent until this moment (W-7).
  visible_from  timestamptz NOT NULL,
  due_at        timestamptz CHECK (due_at IS NULL OR due_at >= visible_from),
  -- FR-022.8: marks shown on release (default) or as soon as marked (automatic marking only).
  release_mode  text NOT NULL DEFAULT 'manual' CHECK (release_mode IN ('manual', 'on_marking')),
  show_answers  boolean NOT NULL DEFAULT true,
  status        text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'closed')),
  published_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (release_mode = 'manual' OR kind = 'exercise')
);
CREATE INDEX assignments_teacher ON assignments (teacher_id, created_at DESC);
CREATE INDEX assignments_worksheet ON assignments (worksheet_id) WHERE worksheet_id IS NOT NULL;
CREATE TRIGGER assignments_touch BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- The teacher owns it; the date of work a student can already see is never moved (W-10).
CREATE FUNCTION assignments_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.teacher_id, 'teacher');
  IF NEW.worksheet_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.worksheet_id IS DISTINCT FROM OLD.worksheet_id)
     AND NOT EXISTS (SELECT 1 FROM worksheets WHERE id = NEW.worksheet_id AND teacher_id = NEW.teacher_id) THEN
    RAISE EXCEPTION 'the worksheet is not this teacher''s' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.teacher_id <> OLD.teacher_id THEN
      RAISE EXCEPTION 'an assignment cannot change teacher' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.visible_from IS DISTINCT FROM OLD.visible_from AND OLD.visible_from <= now() THEN
      RAISE EXCEPTION 'work the student can already see keeps its date' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.kind, NEW.title, NEW.grade, NEW.board, NEW.subject) IS DISTINCT FROM
       (OLD.kind, OLD.title, OLD.grade, OLD.board, OLD.subject) THEN
      RAISE EXCEPTION 'an assigned copy is frozen' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assignments_check BEFORE INSERT OR UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION assignments_check();

-- Reference material (FR-022.1): the teacher's own shared resources.
CREATE TABLE assignment_resources (
  assignment_id uuid NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
  resource_id   uuid NOT NULL REFERENCES teacher_resources (id) ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, resource_id)
);
CREATE FUNCTION assignment_resources_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM assignments a JOIN teacher_resources r ON r.teacher_id = a.teacher_id
    WHERE a.id = NEW.assignment_id AND r.id = NEW.resource_id
  ) THEN
    RAISE EXCEPTION 'the resource is not this teacher''s' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assignment_resources_owner BEFORE INSERT OR UPDATE ON assignment_resources
  FOR EACH ROW EXECUTE FUNCTION assignment_resources_owner();

-- The frozen questions. The answer key is never sent to the student before release (code).
CREATE TABLE questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
  position        smallint NOT NULL CHECK (position BETWEEN 1 AND 100),
  type            text NOT NULL CHECK (valid_question_type(type)),
  prompt          text NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 1000),
  data            jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(data) = 'object'),
  answer_key      jsonb CHECK (answer_key IS NULL OR jsonb_typeof(answer_key) = 'object'),
  points          smallint NOT NULL CHECK (points BETWEEN 0 AND 100),
  partial_credit  boolean NOT NULL DEFAULT false,
  source_page     smallint CHECK (source_page IS NULL OR source_page BETWEEN 1 AND 9999),
  UNIQUE (assignment_id, position),
  CHECK (type = 'short_answer' OR answer_key IS NOT NULL)
);

-- ---------------------------------------------------------------- per student (CR-07 §5)
CREATE TABLE assignment_targets (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One student per assignment (OC-127); a repeat is a new assignment (W-9).
  assignment_id          uuid NOT NULL UNIQUE REFERENCES assignments (id) ON DELETE CASCADE,
  student_id             uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  status                 text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'submitted',
                                                     'under_review', 'revision_required', 'reviewed', 'withdrawn')),
  revision_count         smallint NOT NULL DEFAULT 0 CHECK (revision_count BETWEEN 0 AND 20),
  started_at             timestamptz,
  submitted_at           timestamptz,
  reviewed_at            timestamptz,
  released_at            timestamptz,
  withdrawn_at           timestamptz,
  score                  numeric(6, 2) CHECK (score IS NULL OR score >= 0),
  max_score              numeric(6, 2) CHECK (max_score IS NULL OR max_score >= 0),
  feedback               text CHECK (feedback IS NULL OR char_length(feedback) BETWEEN 1 AND 4000),
  -- Late is recorded at submission and never rewritten by a later due-date change (OC-90 Q-10).
  submitted_late         boolean,
  due_at_when_submitted  timestamptz,
  -- 12-month retention (OC-90 Q-6); reliable deletion is launch requirement PL-05.
  purge_after            timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (released_at IS NULL OR status IN ('reviewed', 'revision_required', 'withdrawn')),
  CHECK ((status = 'withdrawn') = (withdrawn_at IS NOT NULL))
);
CREATE INDEX assignment_targets_student ON assignment_targets (student_id, status);
CREATE TRIGGER assignment_targets_touch BEFORE UPDATE ON assignment_targets
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Giving work needs an active link in that subject (CR-07 §3, OC-87 Q-1); only the allowed
-- status changes happen (CR-07 §5); the student never changes.
CREATE FUNCTION assignment_targets_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM require_role(NEW.student_id, 'student');
    IF NEW.status <> 'assigned' THEN
      RAISE EXCEPTION 'new work starts as assigned' USING ERRCODE = 'check_violation';
    END IF;
    -- Lock the link row: a parent ending the link at the same moment waits for this insert, and
    -- its own trigger then withdraws the new work (or this insert sees the ended link and fails).
    PERFORM 1 FROM teacher_student_links l JOIN assignments a ON a.teacher_id = l.teacher_id
      WHERE a.id = NEW.assignment_id AND l.student_id = NEW.student_id AND l.status <> 'removed'
      FOR SHARE OF l;
    IF NOT EXISTS (
      SELECT 1 FROM assignments a
      JOIN teacher_student_links l ON l.teacher_id = a.teacher_id AND l.student_id = NEW.student_id
      WHERE a.id = NEW.assignment_id AND l.status = 'active' AND a.subject = ANY (l.subjects)
    ) THEN
      RAISE EXCEPTION 'the student is not linked to this teacher for this subject' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.student_id <> OLD.student_id OR NEW.assignment_id <> OLD.assignment_id THEN
    RAISE EXCEPTION 'the student of an assignment never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'assigned' AND NEW.status IN ('in_progress', 'submitted', 'withdrawn'))
    OR (OLD.status = 'in_progress' AND NEW.status IN ('submitted', 'withdrawn'))
    OR (OLD.status = 'submitted' AND NEW.status IN ('under_review', 'reviewed', 'withdrawn'))
    OR (OLD.status = 'under_review' AND NEW.status IN ('reviewed', 'revision_required', 'withdrawn'))
    OR (OLD.status = 'reviewed' AND NEW.status = 'revision_required')
    OR (OLD.status = 'revision_required' AND NEW.status IN ('in_progress', 'submitted', 'withdrawn'))
  ) THEN
    RAISE EXCEPTION 'homework cannot move from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assignment_targets_check BEFORE INSERT OR UPDATE ON assignment_targets
  FOR EACH ROW EXECUTE FUNCTION assignment_targets_check();

-- FR-027.1 and FR-027.3: when a parent removes the teacher, or the subject from the link,
-- unfinished work from that teacher in that subject becomes Withdrawn for the child, whatever
-- code path changed the link. The child keeps their answers; nothing is deleted (W-11).
CREATE FUNCTION withdraw_unlinked_homework() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  WITH ended AS (
    UPDATE assignment_targets t SET status = 'withdrawn', withdrawn_at = now()
    FROM assignments a
    WHERE a.id = t.assignment_id AND a.teacher_id = NEW.teacher_id AND t.student_id = NEW.student_id
      AND t.status IN ('assigned', 'in_progress', 'submitted', 'under_review', 'revision_required')
      AND (NEW.status <> 'active' OR NOT (a.subject = ANY (NEW.subjects)))
    RETURNING t.id, t.status
  )
  INSERT INTO assignment_events (target_id, from_status, to_status, actor_id, note)
  SELECT id, NULL, 'withdrawn', NULL, 'The teacher is no longer linked for this subject.' FROM ended;
  RETURN NEW;
END $$;
CREATE TRIGGER teacher_student_links_withdraw_homework AFTER UPDATE OF status, subjects ON teacher_student_links
  FOR EACH ROW WHEN (OLD.status = 'active') EXECUTE FUNCTION withdraw_unlinked_homework();

-- H-N4 (proposed, for owner approval with this migration): a student's questions never change
-- once they have started. Deleting the whole assignment (retention) is still possible.
CREATE FUNCTION questions_locked() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  aid uuid := COALESCE(NEW.assignment_id, OLD.assignment_id);
BEGIN
  IF EXISTS (SELECT 1 FROM assignment_targets WHERE assignment_id = aid AND status <> 'assigned')
     OR (TG_OP <> 'INSERT' AND NEW.assignment_id IS DISTINCT FROM OLD.assignment_id) THEN
    RAISE EXCEPTION 'questions are locked once the student has started' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER questions_locked BEFORE INSERT OR UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION questions_locked();
CREATE FUNCTION questions_locked_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- In a cascade from the assignment the parent row is already gone: allowed.
  IF EXISTS (SELECT 1 FROM assignments WHERE id = OLD.assignment_id)
     AND EXISTS (SELECT 1 FROM assignment_targets WHERE assignment_id = OLD.assignment_id AND status <> 'assigned') THEN
    RAISE EXCEPTION 'questions are locked once the student has started' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER questions_locked_delete BEFORE DELETE ON questions
  FOR EACH ROW EXECUTE FUNCTION questions_locked_delete();

-- Exercise answers: one row per question per attempt.
CREATE TABLE answers (
  target_id        uuid NOT NULL REFERENCES assignment_targets (id) ON DELETE CASCADE,
  question_id      uuid NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  attempt          smallint NOT NULL CHECK (attempt BETWEEN 1 AND 21),
  response         jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object' AND pg_column_size(response) <= 8192),
  auto_points      numeric(6, 2) CHECK (auto_points IS NULL OR auto_points >= 0),
  teacher_points   numeric(6, 2) CHECK (teacher_points IS NULL OR teacher_points >= 0),
  teacher_comment  text CHECK (teacher_comment IS NULL OR char_length(teacher_comment) BETWEEN 1 AND 1000),
  saved_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_id, question_id, attempt)
);

-- The question belongs to that student's assignment, and answers change only while the work is open.
CREATE FUNCTION answers_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM assignment_targets t JOIN questions q ON q.assignment_id = t.assignment_id
    WHERE t.id = NEW.target_id AND q.id = NEW.question_id
  ) THEN
    RAISE EXCEPTION 'the question is not part of this homework' USING ERRCODE = 'check_violation';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.response IS DISTINCT FROM OLD.response) AND NOT EXISTS (
    SELECT 1 FROM assignment_targets WHERE id = NEW.target_id AND status IN ('assigned', 'in_progress', 'revision_required')
  ) THEN
    RAISE EXCEPTION 'answers can be changed only while the homework is open' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER answers_check BEFORE INSERT OR UPDATE ON answers FOR EACH ROW EXECUTE FUNCTION answers_check();

-- Status history (CR-07 acceptance 11). Never contains answers or feedback text.
CREATE TABLE assignment_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id    uuid NOT NULL REFERENCES assignment_targets (id) ON DELETE CASCADE,
  from_status  text,
  to_status    text NOT NULL,
  actor_id     uuid REFERENCES accounts (id) ON DELETE SET NULL,
  at           timestamptz NOT NULL DEFAULT now(),
  note         text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500)
);
CREATE INDEX assignment_events_target ON assignment_events (target_id, at);

-- ---------------------------------------------------------------- widened lists
-- CR-17 PR 4: a type label on teacher resources. Existing rows become "other".
ALTER TABLE teacher_resources ADD COLUMN resource_type text NOT NULL DEFAULT 'other'
  CHECK (resource_type IN ('notes', 'worksheet', 'slides', 'other'));

-- CR-16: "homework assigned" notifications point at an assignment record.
ALTER TABLE notifications DROP CONSTRAINT notifications_entity_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_entity_type_check CHECK (entity_type IN (
  'enquiry', 'link_request', 'rate_proposal', 'resource_share', 'listing', 'learning_package', 'teacher_profile',
  'assignment'));
