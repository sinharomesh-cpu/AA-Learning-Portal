-- AA Pro · rollback for 0029_lessons.sql (M1, CR-17 PR 2). NOT a migration: it is kept outside
-- db/migrations and is used only with the owner's separate written approval.
--
-- PERMANENTLY DELETES, with no way back except a database backup:
--   * every row in lessons: all lesson requests and lessons in every status, with their times,
--     price snapshots, who requested, declined, withdrew or cancelled, notes and outcomes;
--   * every notification whose entity_type is 'lesson' (read and unread), for every recipient.
-- Nothing else is deleted: accounts, links, usual times, listings, rate agreements and every other
-- notification stay as they are.
--
-- LEAVES BEHIND, on purpose:
--   * the btree_gist extension (standard, harmless when unused; removing it is a separate decision:
--     DROP EXTENSION btree_gist; fails safely if anything still uses it);
--   * 0029's row in schema_migrations (the runner never re-applies a recorded migration);
--   * audit_events rows that mention lessons, if the PR 2 code wrote any (audit history is kept).
--
-- Use: copy this file into db/migrations under the next free number, together with the code
-- change that switches the lesson pages back off; it then runs in the migration runner's single
-- transaction, so it applies completely or not at all. Before using it on a database that holds
-- anything other than synthetic test data, take a backup (Neon: a branch or a restore point) and
-- export the two tables above; restoring them would mean re-applying 0029 and re-inserting the rows.

-- 1. Lesson notifications first, so the narrower list below can be put back.
DELETE FROM notifications WHERE entity_type = 'lesson';
ALTER TABLE notifications DROP CONSTRAINT notifications_entity_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_entity_type_check CHECK (entity_type IN (
  'enquiry', 'link_request', 'rate_proposal', 'resource_share', 'listing', 'learning_package', 'teacher_profile',
  'assignment'));

-- 2. The lessons table (its indexes, overlap rules and triggers go with it), then its functions.
DROP TABLE lessons;
DROP FUNCTION lessons_expire_overdue(int);
DROP FUNCTION lessons_before_update();
DROP FUNCTION lessons_before_insert();
DROP FUNCTION lessons_price_for(uuid, uuid, text, timestamptz, int);
DROP FUNCTION lessons_in_slot(jsonb, timestamptz, int);
DROP FUNCTION lessons_in_usual_time(uuid, timestamptz, int);
DROP FUNCTION lessons_local_weekday(timestamptz, text);
DROP FUNCTION lessons_local_minute(timestamptz, text);
DROP FUNCTION lessons_teacher_link_ok(uuid, uuid, text);
DROP FUNCTION lessons_parent_ok(uuid, uuid);
