-- Run ONCE against your existing database (create_all() will not add columns).
-- Easiest alternative while developing: DROP TABLE jobs; then restart the API.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stored_filename VARCHAR;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS error VARCHAR;
CREATE INDEX IF NOT EXISTS ix_jobs_status ON jobs (status);