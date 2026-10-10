import * as c from "@sakha/contracts";
import { DomainError } from "@sakha/farm";
import type { Storage } from "./storage/database.js";
export function replayEvents(
  store: Storage,
  farmId: string,
  cursor?: string,
): c.Event[] {
  let after = 0;
  if (cursor) {
    const prefix = `${farmId}.`;
    if (
      !cursor.startsWith(prefix) ||
      !/^\d+$/.test(cursor.slice(prefix.length))
    )
      throw new DomainError(
        "scope_denied",
        "Event cursor does not belong to this farm",
      );
    after = Number(cursor.slice(prefix.length));
  }
  const bounds = store.db
    .prepare(
      "SELECT min(seq) as first,max(seq) as last FROM events WHERE farm_id=?",
    )
    .get(farmId) as { first: number | null; last: number | null };
  if (after && bounds.first && after < bounds.first - 1)
    return [
      c.Event.parse({
        schema_version: c.CONTRACT_VERSION,
        cursor: `${farmId}.${bounds.last}`,
        farm_id: farmId,
        type: "resync_required",
        timestamp: new Date().toISOString(),
        correlation_id: "replay",
        payload: {
          reason: "Saved cursor expired; reload authoritative records",
        },
      }),
    ];
  if (after > (bounds.last ?? 0))
    throw new DomainError(
      "validation",
      "Event cursor is ahead of retained history",
    );
  return (
    store.db
      .prepare(
        "SELECT * FROM events WHERE farm_id=? AND seq>? ORDER BY seq LIMIT 500",
      )
      .all(farmId, after) as {
      seq: number;
      type: string;
      payload: string;
      created_at: string;
    }[]
  ).map((row) => {
    const raw = JSON.parse(row.payload) as Record<string, unknown>;
    return c.Event.parse({
      schema_version: c.CONTRACT_VERSION,
      cursor: `${farmId}.${row.seq}`,
      farm_id: farmId,
      type: row.type,
      record_id: raw.record_id,
      run_id: raw.run_id,
      timestamp: row.created_at,
      correlation_id: raw.run_id ?? raw.record_id ?? `event-${row.seq}`,
      payload: raw,
    });
  });
}
