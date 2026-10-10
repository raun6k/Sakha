ALTER TABLE outbox ADD COLUMN available_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00Z';
ALTER TABLE outbox ADD COLUMN outcome TEXT CHECK(outcome IS NULL OR json_valid(outcome));
CREATE INDEX jobs_ready ON outbox(status,available_at,lease_until);
CREATE TABLE inbox(id TEXT PRIMARY KEY,farm_id TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,sender TEXT NOT NULL,recipient TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),status TEXT NOT NULL CHECK(status IN ('queued','delivered','failed')),created_at TEXT NOT NULL,deduplication_key TEXT NOT NULL UNIQUE);
