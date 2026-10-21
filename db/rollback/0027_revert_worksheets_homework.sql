-- AA Pro · rollback for 0027_worksheets_homework.sql (M3). NOT a migration: it is kept outside
-- db/migrations and is used only with the owner's separate written approval, because it deletes
-- the homework records created since M3 (synthetic test data only on the test site).
--
-- Use: the migration runner never runs files backwards and refuses a changed or removed
-- migration, so a rollback is a NEW forward migration. With approval, copy this file into
-- db/migrations under the next free number (for example 0030_revert_worksheets_homework.sql),
-- together with the code change that switches the Homework pages back off. 0027 stays recorded
-- in schema_migrations; this file undoes it. The runner applies it in its own transaction.

-- 1. Notifications that point at assignments, then narrow the list back.
DELETE FROM notifications WHERE entity_type = 'assignment';
ALTER TABLE notifications DROP CONSTRAINT notifications_entity_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_entity_type_check CHECK (entity_type IN (
  'enquiry', 'link_request', 'rate_proposal', 'resource_share', 'listing', 'learning_package', 'teacher_profile'));

-- 2. The resource type label.
ALTER TABLE teacher_resources DROP COLUMN resource_type;

-- 3. The link trigger, then homework records, newest dependants first.
DROP TRIGGER teacher_student_links_withdraw_homework ON teacher_student_links;
DROP FUNCTION withdraw_unlinked_homework();
DROP TABLE assignment_events;
DROP TABLE answers;
DROP TABLE assignment_targets;
DROP TABLE questions;
DROP TABLE assignment_resources;
DROP TABLE assignments;
DROP TABLE worksheet_questions;
DROP TABLE worksheets;

-- 4. Functions created by 0027.
DROP FUNCTION answers_check();
DROP FUNCTION questions_locked_delete();
DROP FUNCTION questions_locked();
DROP FUNCTION assignment_targets_check();
DROP FUNCTION assignment_resources_owner();
DROP FUNCTION assignments_check();
DROP FUNCTION worksheet_ready_check();
DROP FUNCTION valid_question_type(text);
DROP FUNCTION worksheets_owner();
