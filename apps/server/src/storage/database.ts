import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Store, StoredRecord } from "@sakha/farm";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { z } from "zod";
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
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)",
    );
    const migrationDir = fileURLToPath(
      new URL("../../migrations/", import.meta.url),
    );
    try {
      this.db.transaction(() => {
        for (const file of readdirSync(migrationDir)
          .filter((x) => /^\d+.*\.sql$/.test(x))
          .sort()) {
          const version = Number(file.split("_")[0]);
          const sql = readFileSync(`${migrationDir}/${file}`, "utf8");
          const checksum = createHash("sha256").update(sql).digest("hex");
          const applied = this.db
            .prepare("SELECT checksum FROM migrations WHERE version=?")
            .get(version) as { checksum: string } | undefined;
          if (applied) {
            if (applied.checksum !== checksum)
              throw new Error(`Migration ${version} checksum mismatch`);
            continue;
          }
          this.db.exec(sql);
          this.db
            .prepare("INSERT INTO migrations VALUES(?,?,?)")
            .run(version, checksum, new Date().toISOString());
        }
      })();
    } catch (error) {
      this.db.close();
      throw new Error(
        "Database migration failed; preserve the database and restore the matching release",
        { cause: error },
      );
    }
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
  put<T extends StoredRecord>(kind: string, record: T): void {
    this.transaction(() => {
      if (kind === "farm")
        this.db
          .prepare("INSERT OR IGNORE INTO scopes VALUES(?,'farm')")
          .run(record.farm_id);
      this.orm
        .insert(records)
        .values({
          id: record.id,
          kind,
          farmId: record.farm_id,
          version: record.version,
          payload: JSON.stringify(record),
          createdAt: record.created_at,
        })
        .onConflictDoUpdate({
          target: [records.kind, records.id, records.farmId],
          set: { version: record.version, payload: JSON.stringify(record) },
        })
        .run();
      const object = z.record(z.string(), z.unknown()).parse(record);
      const links: Record<string, string> = {
        field_id: "field",
        conversation_id: "conversation",
        task_id: "task",
        plan_revision_id: "revision",
        base_revision_id: "revision",
      };
      this.db
        .prepare(
          "DELETE FROM record_links WHERE owner_kind=? AND owner_id=? AND farm_id=?",
        )
        .run(kind, record.id, record.farm_id);
      for (const [key, targetKind] of Object.entries(links)) {
        const target = object[key];
        if (typeof target === "string")
          this.db
            .prepare("INSERT INTO record_links VALUES(?,?,?,?,?)")
            .run(kind, record.id, record.farm_id, targetKind, target);
      }
    });
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
