import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Store, StoredRecord } from "@sakha/farm";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
export const records = sqliteTable(
  "records",
  {
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    farmId: text("farm_id").notNull(),
    version: integer("version").notNull(),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.id, table.farmId] })],
);
export class Storage implements Store {
  readonly db: Database.Database;
  readonly orm: ReturnType<typeof drizzle>;
  constructor(path: string) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      chmodSync(dirname(path), 0o700);
    }
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.orm = drizzle(this.db, { schema: { records } });
    this.db.exec(`CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS records(id TEXT NOT NULL,kind TEXT NOT NULL,farm_id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(kind,id,farm_id));
   CREATE INDEX IF NOT EXISTS records_scope ON records(farm_id,kind,created_at,id);
   CREATE TABLE IF NOT EXISTS commands(actor TEXT NOT NULL,action TEXT NOT NULL,scope TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(actor,action,scope,key));
   CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,farm_id TEXT NOT NULL,type TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,farm_id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,lease_until TEXT);
   CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(id UNINDEXED,farm_id UNINDEXED,role_key UNINDEXED,content);
   INSERT OR IGNORE INTO migrations VALUES(1,datetime('now'));`);
    if (path !== ":memory:") chmodSync(path, 0o600);
  }
  get(kind: string, id: string, farmId: string): unknown {
    const row = this.db
      .prepare(
        "SELECT payload FROM records WHERE kind=? AND id=? AND farm_id=?",
      )
      .get(kind, id, farmId) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) : undefined;
  }
  list(kind: string, farmId: string): unknown[] {
    return (
      this.db
        .prepare(
          "SELECT payload FROM records WHERE kind=? AND farm_id=? ORDER BY created_at,id",
        )
        .all(kind, farmId) as { payload: string }[]
    ).map((row) => JSON.parse(row.payload));
  }
  put(kind: string, record: StoredRecord): void {
    this.db
      .prepare(
        "INSERT INTO records VALUES(?,?,?,?,?,?) ON CONFLICT(kind,id,farm_id) DO UPDATE SET version=excluded.version,payload=excluded.payload",
      )
      .run(
        record.id,
        kind,
        record.farm_id,
        record.version,
        JSON.stringify(record),
        record.created_at,
      );
  }
  remove(kind: string, id: string, farmId: string): void {
    this.db
      .prepare("DELETE FROM records WHERE kind=? AND id=? AND farm_id=?")
      .run(kind, id, farmId);
  }
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
  command<T>(
    actor: string,
    action: string,
    scope: string,
    key: string,
    payload: unknown,
    fn: () => T,
  ): T {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    return this.transaction(() => {
      const saved = this.db
        .prepare(
          "SELECT fingerprint,result FROM commands WHERE actor=? AND action=? AND scope=? AND key=?",
        )
        .get(actor, action, scope, key) as
        | { fingerprint: string; result: string }
        | undefined;
      if (saved) {
        if (saved.fingerprint !== fingerprint)
          throw new Error("idempotency_conflict");
        return JSON.parse(saved.result) as T;
      }
      const result = fn();
      this.db
        .prepare("INSERT INTO commands VALUES(?,?,?,?,?,?)")
        .run(actor, action, scope, key, fingerprint, JSON.stringify(result));
      return result;
    });
  }
  event(farmId: string, type: string, payload: unknown): void {
    this.db
      .prepare(
        "INSERT INTO events(farm_id,type,payload,created_at) VALUES(?,?,?,?)",
      )
      .run(farmId, type, JSON.stringify(payload), new Date().toISOString());
  }
  enqueue(farmId: string, kind: string, payload: unknown): string {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO outbox(id,farm_id,kind,payload) VALUES(?,?,?,?)")
      .run(id, farmId, kind, JSON.stringify(payload));
    return id;
  }
  close(): void {
    this.db.close();
  }
}
