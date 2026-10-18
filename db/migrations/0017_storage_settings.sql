-- AA Pro · 0017 Storage safety limits (OC-96).
-- Temporary technical limits for development and testing only, not business rules and not an
-- approval of paid storage (OC-91). The Super Admin changes them on Admin → Storage, without a
-- code change; the server reads them on every upload. Defaults are approved by the owner
-- (18 Oct 2026, 13:07 IST): 100 uploads per account per day, 200 MB stored per account.

CREATE TABLE platform_settings (
  key         text PRIMARY KEY CHECK (key IN (
                'file_uploads_per_day',      -- uploads per account per rolling 24 hours
                'file_mb_per_account',       -- stored files per account, in MB
                'database_allowance_mb',     -- the free database allowance being protected, in MB
                'storage_warn_percent',      -- warn the Super Admin at this share of the allowance
                'storage_stop_percent')),    -- refuse new uploads at this share of the allowance
  value       integer NOT NULL CHECK (value > 0),
  updated_by  uuid REFERENCES accounts (id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_settings (key, value) VALUES
  ('file_uploads_per_day', 100),
  ('file_mb_per_account', 200),
  ('database_allowance_mb', 1024),   -- Neon Free plan: 1 GB per project
  ('storage_warn_percent', 75),
  ('storage_stop_percent', 90);
