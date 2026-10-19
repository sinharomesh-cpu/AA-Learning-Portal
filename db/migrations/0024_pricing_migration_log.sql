-- AA Pro · 0024 Converting the earlier prices to the CR-15 model (step A5; FR-044; P-9, R-1).
--
-- The conversion itself is NOT a migration: the Super Admin runs a read-only dry run first and
-- applies it only after the owner has seen the report (Admin → Pricing migration). This table
-- records, for every listing the conversion changes, exactly what it was before, so the change can
-- be rolled back. Earlier prices (listing_prices) are never changed or deleted by the conversion.
CREATE TABLE pricing_migration_log (
  id               bigserial PRIMARY KEY,
  run_id           uuid NOT NULL,
  listing_id       uuid NOT NULL REFERENCES teacher_listings (id) ON DELETE CASCADE,
  teacher_id       uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  -- The public copy and the hourly fields before the conversion.
  old_published    jsonb,
  old_hourly       jsonb NOT NULL,
  -- Whether this run created the teacher's learning package (needs review) from a monthly price.
  package_created  boolean NOT NULL DEFAULT false,
  -- What the run did, for the report (no personal data).
  summary          jsonb NOT NULL,
  applied_by       uuid REFERENCES accounts (id) ON DELETE SET NULL,
  applied_at       timestamptz NOT NULL DEFAULT now(),
  rolled_back_at   timestamptz,
  rolled_back_by   uuid REFERENCES accounts (id) ON DELETE SET NULL
);
-- One live (not rolled back) conversion per listing: running it again changes nothing.
CREATE UNIQUE INDEX pricing_migration_log_live ON pricing_migration_log (listing_id) WHERE rolled_back_at IS NULL;
