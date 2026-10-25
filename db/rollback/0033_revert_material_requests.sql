-- AA Pro · rollback for 0033_material_requests.sql (TL-2). NOT a migration: it is kept outside
-- db/migrations and is used only with the owner's separate written approval.
--
-- The table and its rows are dropped as a whole (DROP TABLE does not run the delete guard).
-- Order: TL-2 is reverted BEFORE 0032 (TL-1), and before 0031, 0030, 0029 and 0028 if any of
-- those is ever reverted too (material_requests refers to lessons, lesson_chapters and books).
--
-- PERMANENTLY DELETES, with no way back except a database backup: every material request and its
-- answer (material_requests), and every in-app notification that points at one (entity_type
-- 'material_request'), which must go before the notifications list returns to 0029's values.
-- Lessons, lesson chapters, books, chapters, assignments, links, permissions and all other
-- notifications are untouched.
-- LEAVES BEHIND, on purpose: 0033's row in schema_migrations (the runner never re-applies it).

DROP TRIGGER lessons_close_material_requests ON lessons;
DROP FUNCTION lessons_close_material_requests();
DROP FUNCTION material_requests_close_ended(int);
DROP TRIGGER material_requests_before_delete ON material_requests;
DROP TRIGGER material_requests_before_write ON material_requests;
DROP TABLE material_requests;
DROP FUNCTION material_requests_before_delete();
DROP FUNCTION material_requests_before_write();
DROP FUNCTION material_requests_teacher_can_view(uuid, uuid, text, uuid);
DROP FUNCTION material_requests_parent_ok(uuid, uuid);

DELETE FROM notifications WHERE entity_type = 'material_request';
ALTER TABLE notifications DROP CONSTRAINT notifications_entity_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_entity_type_check CHECK (entity_type IN (
  'enquiry', 'link_request', 'rate_proposal', 'resource_share', 'listing', 'learning_package', 'teacher_profile',
  'assignment', 'lesson'));
