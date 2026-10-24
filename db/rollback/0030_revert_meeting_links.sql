-- AA Pro · rollback for 0030_meeting_links.sql (M2, CR-17 PR 3). NOT a migration: it is
-- kept outside db/migrations and is used only with the owner's separate written approval.
--
-- PERMANENTLY DELETES, with no way back except a database backup:
--   * every stored teacher meeting link (lesson_meeting_links);
--   * every parent permission for teacher meeting links, live or withdrawn, with its history
--     (meeting_link_permissions);
--   * the in-app notifications PR 3 adds about links: lesson_link_added, lesson_link_changed and
--     lesson_link_permission_needed (about a lesson), meeting_links_allowed and meeting_links_stopped
--     (about a teacher-child link).
-- Nothing else is deleted: lessons, accounts, teacher links and every other notification stay.
-- LEAVES BEHIND, on purpose: 0030's row in schema_migrations (the runner never re-applies it).
--
-- Use: copy this file into db/migrations under the next free number, together with the code
-- change that switches the PR 3 screens off; it then runs in the migration runner's single
-- transaction, so it applies completely or not at all. Before using it on the shared test
-- database, take a Neon restore point or branch.

DELETE FROM notifications WHERE (entity_type = 'lesson' AND type IN (
    'lesson_link_added', 'lesson_link_changed', 'lesson_link_permission_needed'))
  OR (entity_type = 'link_request' AND type IN ('meeting_links_allowed', 'meeting_links_stopped'));

DROP TRIGGER teacher_links_withdraw_meeting_permission ON teacher_student_links;
DROP TRIGGER lessons_drop_link_on_cancel ON lessons;
DROP TABLE lesson_meeting_links;
DROP TABLE meeting_link_permissions;
DROP FUNCTION meeting_links_purge(int);
DROP FUNCTION teacher_links_withdraw_meeting_permission();
DROP FUNCTION lessons_drop_link_on_cancel();
DROP FUNCTION lesson_meeting_links_before_write();
DROP FUNCTION meeting_link_permissions_before_update();
DROP FUNCTION meeting_link_permissions_before_insert();
