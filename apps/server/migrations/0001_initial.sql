CREATE TABLE scopes(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('farm','installation','public')));
INSERT INTO scopes VALUES('installation','installation'),('public','public');
CREATE TABLE records(id TEXT NOT NULL,kind TEXT NOT NULL,farm_id TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,version INTEGER NOT NULL CHECK(version>0),payload TEXT NOT NULL CHECK(json_valid(payload)),created_at TEXT NOT NULL,PRIMARY KEY(kind,id,farm_id));
CREATE INDEX records_scope ON records(farm_id,kind,created_at,id);
CREATE TABLE record_links(owner_kind TEXT NOT NULL,owner_id TEXT NOT NULL,farm_id TEXT NOT NULL,target_kind TEXT NOT NULL,target_id TEXT NOT NULL,PRIMARY KEY(owner_kind,owner_id,farm_id,target_kind,target_id),FOREIGN KEY(owner_kind,owner_id,farm_id) REFERENCES records(kind,id,farm_id) ON DELETE CASCADE,FOREIGN KEY(target_kind,target_id,farm_id) REFERENCES records(kind,id,farm_id));
CREATE TABLE commands(actor TEXT NOT NULL,action TEXT NOT NULL,scope TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL CHECK(json_valid(result)),PRIMARY KEY(actor,action,scope,key));
CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,farm_id TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,type TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),created_at TEXT NOT NULL);
CREATE TABLE outbox(id TEXT PRIMARY KEY,farm_id TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,kind TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),lease_until TEXT);
CREATE VIRTUAL TABLE memory_fts USING fts5(id UNINDEXED,farm_id UNINDEXED,role_key UNINDEXED,content);
