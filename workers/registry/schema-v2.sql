-- CerebreX Registry — D1 Schema Migration v2
-- Run: wrangler d1 execute cerebrex-registry --file=./schema-v2.sql --remote

-- New columns on packages
ALTER TABLE packages ADD COLUMN readme TEXT NOT NULL DEFAULT '';
ALTER TABLE packages ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE packages ADD COLUMN deprecated INTEGER NOT NULL DEFAULT 0;

-- Token expiry support
ALTER TABLE tokens ADD COLUMN expires_at TEXT;

-- Index for author lookups and download sorting
CREATE INDEX IF NOT EXISTS idx_packages_author ON packages(author);
CREATE INDEX IF NOT EXISTS idx_packages_downloads ON packages(download_count DESC);
