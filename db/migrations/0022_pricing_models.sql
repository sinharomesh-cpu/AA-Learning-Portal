-- AA Pro · 0022 Hourly lessons and learning packages (CR-15 Phase A, step A2; FR-041, FR-042;
-- OC-102, OC-103, OC-104).
--
-- Two independent offers on a teacher's listing:
--   * Hourly lessons: an hourly rate, one lesson length, and a Fixed / Negotiable setting on
--     each usual weekly time. No minimum number of lessons.
--   * A learning package: 22–60 classes, 2–7 a week, 10–40 minutes each, completed within
--     ⌈classes ÷ classes a week⌉ to 26 weeks, at the teacher's usual times, for one total price
--     the teacher sets (never derived from the hourly rate), Fixed or Negotiable.
--
-- Additive only: nothing existing is changed or deleted. Old prices (listing_prices) stay as
-- they are; converting them is a separate dry-run-first script (CR-15 §6, step A5), never a
-- migration, because every merge to main migrates the test database.
-- Everything here stays unused until the Super Admin turns on "New pricing model"
-- (platform setting pricing_model_v2, absent = off; CR-15 v1.0 §10 reading 1).

ALTER TABLE platform_settings DROP CONSTRAINT platform_settings_key_check;
ALTER TABLE platform_settings ADD CONSTRAINT platform_settings_key_check CHECK (key IN (
  'file_uploads_per_day', 'file_mb_per_account', 'database_allowance_mb', 'storage_warn_percent',
  'storage_stop_percent', 'rate_active_per_parent', 'rate_new_per_day',
  'pricing_model_v2'));          -- 1 = the CR-15 pricing model is shown; no row = off

-- Hourly lessons, part of the listing draft (published through the existing preview-and-agree
-- step, OC-77(1)). Amounts in the smallest unit (paise, cents), never converted (OC-76(4)).
ALTER TABLE teacher_listings
  ADD COLUMN hourly_offered     boolean NOT NULL DEFAULT false,
  ADD COLUMN hourly_currency    text CHECK (hourly_currency IN ('INR', 'SGD', 'USD')),
  ADD COLUMN hourly_rate_minor  bigint CHECK (hourly_rate_minor BETWEEN 1 AND 100000000),
  ADD COLUMN hourly_minutes     smallint CHECK (hourly_minutes BETWEEN 10 AND 40),
  ADD CONSTRAINT teacher_listings_hourly CHECK (
    NOT hourly_offered OR (hourly_currency IS NOT NULL AND hourly_rate_minor IS NOT NULL AND hourly_minutes IS NOT NULL));

-- P-8: each usual time has its own setting for hourly lessons. Off (Fixed rate) by default,
-- including every existing time (P-9: nothing becomes negotiable by itself).
ALTER TABLE teacher_usual_times ADD COLUMN negotiable boolean NOT NULL DEFAULT false;

CREATE TABLE learning_packages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One package per teacher (CR-15 reading 6).
  teacher_id        uuid NOT NULL UNIQUE REFERENCES accounts (id) ON DELETE CASCADE,
  -- draft: saved, not offered · offered: valid and included in the listing when it is next
  -- published · needs_review: converted from an old price that could not be mapped safely
  -- (P-9, R-1); never offered until the teacher completes it.
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'offered', 'needs_review')),
  currency          text CHECK (currency IN ('INR', 'SGD', 'USD')),
  price_minor       bigint CHECK (price_minor BETWEEN 1 AND 1000000000),
  -- Ranges allow an incomplete draft or a flagged conversion to be stored as found; the
  -- "offered" rules below are the business rules (P-1, P-2, R-3 to R-6).
  classes           smallint CHECK (classes BETWEEN 1 AND 60),
  classes_per_week  smallint CHECK (classes_per_week BETWEEN 1 AND 7),
  lesson_minutes    smallint CHECK (lesson_minutes BETWEEN 10 AND 40),
  completion_weeks  smallint CHECK (completion_weeks BETWEEN 1 AND 26),
  -- Class times: [{"weekday": 1-7, "start": minute}], in the teacher's time zone.
  times             jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(times) = 'array' AND jsonb_array_length(times) <= 7),
  -- P-6, P-8: the package's own setting, independent of the hourly slots. Fixed by default.
  negotiable        boolean NOT NULL DEFAULT false,
  terms_version     text CHECK (terms_version IS NULL OR char_length(terms_version) BETWEEN 1 AND 60),
  terms_note        text CHECK (terms_note IS NULL OR char_length(terms_note) BETWEEN 1 AND 1000),
  -- P-9: the old monthly price this was converted from, copied as it was (for review and rollback).
  legacy_source     jsonb,
  review_issues     text[] NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_packages_offered CHECK (
    status <> 'offered' OR (
      currency IS NOT NULL AND price_minor IS NOT NULL AND terms_version IS NOT NULL
      AND classes BETWEEN 22 AND 60
      AND classes_per_week BETWEEN 2 AND 7
      AND lesson_minutes BETWEEN 10 AND 40
      -- P-1: at least ⌈classes ÷ classes a week⌉ weeks; at most 26 (R-4).
      AND completion_weeks >= (classes + classes_per_week - 1) / classes_per_week
      AND completion_weeks <= 26
      AND jsonb_array_length(times) = classes_per_week
      AND cardinality(review_issues) = 0)),
  CONSTRAINT learning_packages_review CHECK ((status = 'needs_review') = (cardinality(review_issues) > 0))
);
CREATE TRIGGER learning_packages_touch BEFORE UPDATE ON learning_packages
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Only teachers; an offered package's times must be well formed, not overlap, and each class must
-- fit inside one of the teacher's usual times.
CREATE FUNCTION learning_packages_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t jsonb;
  u jsonb;
  w int;
  s int;
BEGIN
  PERFORM require_role(NEW.teacher_id, 'teacher');
  IF NEW.status <> 'offered' THEN
    RETURN NEW;
  END IF;
  FOR t IN SELECT jsonb_array_elements(NEW.times) LOOP
    IF jsonb_typeof(t -> 'weekday') <> 'number' OR jsonb_typeof(t -> 'start') <> 'number' THEN
      RAISE EXCEPTION 'package times are malformed' USING ERRCODE = 'check_violation';
    END IF;
    w := (t ->> 'weekday')::int;
    s := (t ->> 'start')::int;
    IF w NOT BETWEEN 1 AND 7 OR s NOT BETWEEN 0 AND 1410 OR s % 30 <> 0 THEN
      RAISE EXCEPTION 'package times are malformed' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM teacher_usual_times x
      WHERE x.teacher_id = NEW.teacher_id AND x.weekday = w
        AND x.start_minute <= s AND s + NEW.lesson_minutes <= x.end_minute) THEN
      RAISE EXCEPTION 'package times must be within usual times' USING ERRCODE = 'check_violation';
    END IF;
    FOR u IN SELECT jsonb_array_elements(NEW.times) LOOP
      IF u IS DISTINCT FROM t AND (u ->> 'weekday')::int = w
         AND (u ->> 'start')::int < s + NEW.lesson_minutes AND s < (u ->> 'start')::int + NEW.lesson_minutes THEN
        RAISE EXCEPTION 'package times overlap' USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(DISTINCT e) FROM jsonb_array_elements(NEW.times) e) <> jsonb_array_length(NEW.times) THEN
    RAISE EXCEPTION 'package times overlap' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER learning_packages_check BEFORE INSERT OR UPDATE ON learning_packages
  FOR EACH ROW EXECUTE FUNCTION learning_packages_check();
