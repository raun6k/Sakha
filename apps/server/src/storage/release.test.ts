import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as c from "@sakha/contracts";
import { expect, it } from "vitest";
import { createApp } from "../app.js";
import { replayEvents } from "../events.js";
import { lockDatabase } from "../process-lock.js";

it("prevents a second process owner and recovers only a dead PID lock", () => {
  const dir = mkdtempSync(join(tmpdir(), "sakha-lock-"));
  const path = join(dir, "db.sqlite");
  try {
    const unlock = lockDatabase(path);
    expect(() => lockDatabase(path)).toThrow("already running");
    unlock();
    writeFileSync(`${path}.lock`, JSON.stringify({ pid: 2147483647 }));
    const recovered = lockDatabase(path);
    recovered();
    writeFileSync(`${path}.lock`, "invalid");
    expect(() => lockDatabase(path)).toThrow("invalid");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("serves authenticated SSE over real HTTP and replays a retained farm cursor", async () => {
  const s = createApp({
    databasePath: ":memory:",
    origin: "http://127.0.0.1:4399",
  });
  const farm = c.Farm.parse(
    s.farm.execute("createFarm", { name: "SSE boundary fixture" }, {}),
  );
  s.store.event(farm.id, "job_outcome", { reason: "fixture initial event" });
  await s.app.listen({ host: "127.0.0.1", port: 4399 });
  const abort = new AbortController();
  try {
    const boot = await fetch("http://127.0.0.1:4399/api/v1/bootstrap");
    const envelope = c.envelope(c.Bootstrap).parse(await boot.json());
    const cursor = replayEvents(s.store, farm.id).at(-1)?.cursor;
    s.store.event(farm.id, "finding_ready", { record_id: "synthetic-record" });
    const response = await fetch(
      `http://127.0.0.1:4399/api/v1/farms/${farm.id}/events?cursor=${encodeURIComponent(cursor ?? "")}`,
      {
        headers: { "X-Sakha-Session": envelope.data.session_token },
        signal: abort.signal,
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body?.getReader();
    const chunk = await reader?.read();
    expect(new TextDecoder().decode(chunk?.value)).toContain("finding_ready");
    // Shutdown must finish even while the browser still holds an SSE connection.
    await s.app.close();
  } finally {
    abort.abort();
    await s.app.close();
  }
});

it("expires old stream cursors without deleting authoritative farm records", async () => {
  const s = createApp({ databasePath: ":memory:" });
  const farm = c.Farm.parse(
    s.farm.execute("createFarm", { name: "Retention fixture" }, {}),
  );
  s.store.event(farm.id, "job_outcome", { reason: "fixture initial event" });
  const old = replayEvents(s.store, farm.id)[0]?.cursor;
  s.store.transaction(() => {
    for (let i = 0; i < 5001; i++)
      s.store.event(farm.id, "job_outcome", { reason: "fixture" });
  });
  expect(replayEvents(s.store, farm.id, old)[0]?.type).toBe("resync_required");
  expect(s.farm.assertFarm(farm.id).name).toBe("Retention fixture");
  await s.app.close();
});
