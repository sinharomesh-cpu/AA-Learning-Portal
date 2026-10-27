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
-- The application reads material_requests on the teacher's schedule, the family calendar and the
-- family home page, and its notices link to them, so this SQL must ship together with the code
-- change that removes those reads; on its own it breaks those pages.
-- LEAVES BEHIND, on purpose: 0033's row in schema_migrations (the runner never re-applies it). To
-- apply 0033 again later, that row is deleted in the same approved change.
--
-- Use: copy this file into db/migrations under the next free number, together with the code change
-- that removes the TL-2 reads; it then runs in the migration runner's single transaction, so it
-- applies completely or not at all. If it is ever run by hand, run it as one transaction that stops
-- at the first error (psql --single-transaction -v ON_ERROR_STOP=1). Before using it on the shared
-- test database, take a Neon restore point or branch.

-- The whole rollback is ONE statement (a DO block), so it is atomic however it is run: by the
-- runner, with psql -1, or with plain psql -f. It either completes or changes nothing.
DO $$
BEGIN
  -- Anything else that depends on material_requests (another table's foreign key, or a view)
  -- would make DROP TABLE fail; refuse with a clear message before anything is changed.
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE contype = 'f' AND confrelid = 'material_requests'::regclass
               AND conrelid <> 'material_requests'::regclass)
     OR EXISTS (SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid
                WHERE d.classid = 'pg_rewrite'::regclass AND d.refobjid = 'material_requests'::regclass
                  AND r.ev_class <> 'material_requests'::regclass) THEN
    RAISE EXCEPTION 'another object still depends on material_requests: remove it first';
  END IF;

  -- The lessons trigger first (it writes to material_requests); then the table, which also drops
  -- its two guard triggers.
  DROP TRIGGER lessons_close_material_requests ON lessons;
  DROP TABLE material_requests;
  DROP FUNCTION lessons_close_material_requests();
  DROP FUNCTION material_requests_close_ended(int);
  DROP FUNCTION material_requests_before_delete();
  DROP FUNCTION material_requests_before_write();
  DROP FUNCTION material_requests_teacher_can_view(uuid, uuid, text, uuid);
  DROP FUNCTION material_requests_parent_ok(uuid, uuid);

  DELETE FROM notifications WHERE entity_type = 'material_request';
  ALTER TABLE notifications DROP CONSTRAINT notifications_entity_type_check;
  ALTER TABLE notifications ADD CONSTRAINT notifications_entity_type_check CHECK (entity_type IN (
    'enquiry', 'link_request', 'rate_proposal', 'resource_share', 'listing', 'learning_package', 'teacher_profile',
    'assignment', 'lesson'));
END $$;
