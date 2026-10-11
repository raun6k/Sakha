import { randomUUID } from "node:crypto";
import * as c from "@sakha/contracts";
import type { Runtime } from "@sakha/core";
import { expect, it } from "vitest";
import { createApp } from "../app.js";
import { replayEvents } from "../events.js";

const ready = {
  ready: true,
  text: true,
  cancel: true,
  resume: false,
  approvals: false,
  attachments: false,
  version: "synthetic-test",
};
function setup(runtime?: Runtime) {
  const services = createApp({ databasePath: ":memory:", runtime });
  const farm = c.Farm.parse(
    services.farm.execute("createFarm", { name: "Synthetic test farm" }, {}),
  );
  const conversation = c.Conversation.parse(
    services.core.execute(
      "createConversation",
      { role_key: "chief_of_staff", title: "Test" },
      { farmId: farm.id },
    ),
  );
  const run = c.Run.parse(
    services.core.execute(
      "submitTurn",
      { text: "Synthetic question", evidence: [] },
      { farmId: farm.id, conversationId: conversation.id },
    ),
  );
  return { ...services, farmId: farm.id, run };
}
function grant(s: ReturnType<typeof setup>) {
  s.store.put(
    "consent",
    c.Consent.parse({
      ...s.farm.makeBase(s.farmId),
      category: "external_processing",
      fields: ["conversation"],
      roles: ["chief_of_staff"],
      external_processing: true,
      storage: "persistent",
      status: "active",
      purpose: "Synthetic test",
    }),
  );
}
it("processes durable queued turns, batches text then publishes final message", async () => {
  const s = setup({
    getCapabilities: async () => ready,
    cancelTurn: async () => {},
    startTurn: async (turn) => {
      await turn.onText("A grounded ");
      await turn.onText("answer");
      return { text: "A grounded answer" };
    },
  });
  grant(s);
  await s.execution.tick();
  expect(c.Run.parse(s.store.get("run", s.run.id, s.farmId)).state).toBe(
    "completed",
  );
  expect(
    s.store
      .list("message", s.farmId)
      .map((x) => c.Message.parse(x))
      .find((x) => x.author === "agent")?.status,
  ).toBe("final");
  const events = replayEvents(s.store, s.farmId);
  expect(events.some((x) => x.type === "text_batch")).toBe(true);
  expect(events.at(-2)?.type).toBe("message_final");
  expect(replayEvents(s.store, s.farmId, events.at(-1)?.cursor)).toHaveLength(
    0,
  );
  expect(() => replayEvents(s.store, s.farmId, `${randomUUID()}.1`)).toThrow(
    "farm",
  );
  await s.app.close();
});
it("denies missing or revoked external consent before provider call", async () => {
  let calls = 0;
  const s = setup({
    getCapabilities: async () => ready,
    cancelTurn: async () => {},
    startTurn: async () => {
      calls++;
      return { text: "forbidden" };
    },
  });
  await s.execution.tick();
  expect(calls).toBe(0);
  expect(
    c.Run.parse(s.store.get("run", s.run.id, s.farmId)).failure?.code,
  ).toBe("consent_required");
  await s.app.close();
});
it("recovers running leases as interrupted without retrying uncertain effects", async () => {
  const s = setup();
  s.core.saveRun({ ...s.run, state: "running" });
  s.store.claimJob(new Date().toISOString());
  s.execution.start();
  expect(c.Run.parse(s.store.get("run", s.run.id, s.farmId)).state).toBe(
    "interrupted",
  );
  expect(
    (
      s.store.db.prepare("SELECT status FROM outbox").get() as {
        status: string;
      }
    ).status,
  ).toBe("interrupted");
  await s.app.close();
});
it("rejects expired forecasts and wrong district evidence before publishing a finding", async () => {
  for (const variant of ["expired", "wrong_district"]) {
    const runtime: Runtime = {
      getCapabilities: async () => ready,
      cancelTurn: async () => {},
      startTurn: async (turn) => {
        const evidence = await turn.tools.lookupEvidence({ source_id: "W01" });
        const item = evidence[0];
        if (!item) throw new Error("Evidence absent");
        await turn.tools.publishFinding({
          title: "Bounded test",
          summary: "Test finding",
          evidence: [
            {
              source_id: item.source_id,
              evidence_id: item.id,
              snapshot_id: item.snapshot_id,
            },
          ],
          assumptions: [],
          missing_inputs: [],
          constraints: [],
          freshness: { status: "fresh" },
        });
        return { text: "Should never publish" };
      },
    };
    const s = setup(runtime);
    grant(s);
    const profile = s.farm.assertFarm(s.farmId);
    s.store.put("farm", {
      ...profile,
      location: { country: "India", district: "Nagpur" },
    });
    const evidence = c.Evidence.parse({
      ...s.farm.makeBase(s.farmId),
      source_id: "W01",
      snapshot_id: "snapshot",
      title: "Synthetic forecast fixture",
      text: "Synthetic only",
      retrieved_at: new Date().toISOString(),
      valid_until:
        variant === "expired" ? "1970-01-01T00:00:00Z" : "2099-01-01T00:00:00Z",
      geography: variant === "expired" ? "Nagpur district" : "Wardha district",
      kind: "forecast",
      origin: "fixture",
      hash: "synthetic",
      method_version: "fixture",
      citation: {},
    });
    s.store.put("evidence", evidence);
    await s.execution.tick();
    expect(
      c.Run.parse(s.store.get("run", s.run.id, s.farmId)).failure?.code,
    ).toBe(variant === "expired" ? "source_stale" : "scope_denied");
    expect(s.store.list("finding", s.farmId)).toHaveLength(0);
    await s.app.close();
  }
});

it("bounds busy-peer retries before delivery and records failed inbox outcome", async () => {
  const s = setup();
  grant(s);
  const conversation = c.Conversation.parse(
    s.core.execute(
      "createConversation",
      { role_key: "weather", title: "Busy recipient" },
      { farmId: s.farmId },
    ),
  );
  s.core.execute(
    "submitTurn",
    { text: "Recipient already waiting", evidence: [] },
    { farmId: s.farmId, conversationId: conversation.id },
  );
  s.store.db.prepare("DELETE FROM outbox WHERE kind='agent_turn'").run();
  s.core.saveRun({ ...s.run, state: "running" });
  const peer = await s.execution
    .tools(s.run)
    .peer("weather", "Synthetic bounded request");
  for (let attempt = 0; attempt < 3; attempt++) {
    s.store.db
      .prepare("UPDATE outbox SET available_at='1970-01-01T00:00:00Z'")
      .run();
    await s.execution.tick();
  }
  expect(
    s.store.db.prepare("SELECT status FROM inbox WHERE id=?").get(peer.id),
  ).toEqual({ status: "failed" });
  expect(
    s.store.db
      .prepare("SELECT status,attempts FROM outbox WHERE kind='peer_delivery'")
      .get(),
  ).toEqual({ status: "failed", attempts: 3 });
  expect(s.store.list("conversation", s.farmId)).toHaveLength(2);
  await s.app.close();
});
