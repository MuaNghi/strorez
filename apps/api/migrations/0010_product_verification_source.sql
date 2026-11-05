ALTER TABLE products ADD COLUMN verification_source TEXT NOT NULL DEFAULT ''
  CHECK (data_status != 'VERIFIED' OR length(trim(verification_source)) > 0);
