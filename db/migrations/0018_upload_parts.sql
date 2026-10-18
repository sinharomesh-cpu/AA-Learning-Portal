-- AA Pro · 0018 Large files on the free host (CR-07 H-2a; OC-90 Q-3, Q-4, OC-91).
-- The free Vercel plan accepts at most 4.5 MB per request in each direction. Files up to the
-- approved 20 MB therefore travel in pieces of at most 3 MB: uploads are staged here and joined
-- on the server; downloads are read back in pieces. No paid upload service is used.

CREATE TABLE upload_parts (
  upload_id   uuid NOT NULL,
  owner_id    uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  part        smallint NOT NULL CHECK (part >= 0),
  total       smallint NOT NULL CHECK (total BETWEEN 1 AND 7),
  -- 3 MB per piece; 7 pieces cover the 20 MB file limit.
  bytes       bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 3145728),
  file_name   text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (upload_id, part),
  CONSTRAINT upload_parts_in_range CHECK (part < total)
);
CREATE INDEX upload_parts_owner ON upload_parts (owner_id, created_at);

-- Pieces are read back with substring(); stored files are already compressed (PDF, JPEG), so
-- keep them uncompressed in the database to make reading a piece cheap.
ALTER TABLE stored_files ALTER COLUMN body SET STORAGE EXTERNAL;
ALTER TABLE upload_parts ALTER COLUMN bytes SET STORAGE EXTERNAL;
