-- Mirrored initial migration applied transactionally by Storage. Version 1.
CREATE TABLE records(id TEXT NOT NULL,kind TEXT NOT NULL,farm_id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(kind,id,farm_id));
CREATE INDEX records_scope ON records(farm_id,kind,created_at,id);
CREATE TABLE commands(actor TEXT NOT NULL,action TEXT NOT NULL,scope TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(actor,action,scope,key));
CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,farm_id TEXT NOT NULL,type TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE outbox(id TEXT PRIMARY KEY,farm_id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,lease_until TEXT);
CREATE VIRTUAL TABLE memory_fts USING fts5(id UNINDEXED,farm_id UNINDEXED,role_key UNINDEXED,content);
