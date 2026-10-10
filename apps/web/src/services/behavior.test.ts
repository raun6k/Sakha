import { CONTRACT_VERSION, type Event } from "@sakha/contracts";
import { describe, expect, it, vi } from "vitest";
import { emptyStream, reconcileEvent } from "../state/stream";
import { createFixtureService } from "./fixture";
import { createHttpService, operationUrl } from "./http";

const command = { idempotency_key: "command-1" };
describe("command lifecycle in synthetic adapter", () => {
  it("plan approval does not record completed work or water usage", async () => {
    const s = createFixtureService();
    const params = { farmId: "fixture-farm" };
    const before = await s.execute("getPlan", { params, input: {} });
    const r = before.proposed_revisions[0];
    expect(r).toBeDefined();
    if (!r) return;
    await s.execute("decidePlan", {
      params: { ...params, revisionId: r.id },
      input: {
        expected_version: r.version,
        base_revision_id: null,
        decision: "approve",
      },
      command,
    });
    const tasks = await s.execute("listTasks", { params, input: {} });
    expect(tasks.items[0]?.status).toBe("pending");
    const history = await s.execute("listActivity", { params, input: {} });
    expect(history.items.map((h) => h.kind)).toEqual(["plan_decision"]);
  });
  it("acknowledging an alert never completes a task", async () => {
    const s = createFixtureService();
    const params = { farmId: "fixture-farm" };
    const alerts = await s.execute("listAlerts", { params, input: {} });
    const a = alerts.items[0];
    if (!a) throw new Error("fixture missing");
    await s.execute("acknowledgeAlert", {
      params: { ...params, alertId: a.id },
      input: { expected_version: a.version },
      command,
    });
    expect(
      (await s.execute("listTasks", { params, input: {} })).items[0]?.status,
    ).toBe("proposed");
  });
  it("deduplicates a mutation and rejects changed payload with same identity", async () => {
    const s = createFixtureService();
    const request = {
      params: { farmId: "fixture-farm" },
      input: { role_key: "water" as const, title: "Question" },
      command,
    };
    const a = await s.execute("createConversation", request);
    const b = await s.execute("createConversation", request);
    expect(a.id).toBe(b.id);
    expect(
      (
        await s.execute("listConversations", {
          params: request.params,
          input: {},
        })
      ).items,
    ).toHaveLength(1);
    await expect(
      s.execute("createConversation", {
        ...request,
        input: { ...request.input, title: "Changed" },
      }),
    ).rejects.toThrow("different content");
  });
  it("rejects outdated version instead of overwriting saved context", async () => {
    const s = createFixtureService();
    await s.execute("updateFarm", {
      params: { farmId: "fixture-farm" },
      input: { expected_version: 1, name: "Changed" },
      command,
    });
    await expect(
      s.execute("updateFarm", {
        params: { farmId: "fixture-farm" },
        input: { expected_version: 1, name: "Overwrite" },
        command: { idempotency_key: "command-2" },
      }),
    ).rejects.toThrow("changed");
  });
  it("setup accepts skipped facts and marks completion only after command result", async () => {
    const s = createFixtureService({ setup: false });
    expect((await s.execute("bootstrap", { input: {} })).readiness).toBe(
      "setup_required",
    );
    await s.execute("completeSetup", {
      params: { farmId: "fixture-farm" },
      input: { expected_version: 1, facts: [] },
      command,
    });
    expect((await s.execute("bootstrap", { input: {} })).readiness).toBe(
      "ready",
    );
  });
});
describe("transport and streaming", () => {
  it("substitutes encoded resource identifiers and preserves selected chart period", () => {
    expect(
      operationUrl("getInsights", {
        params: { farmId: "farm one" },
        input: { series: "C01", range: "5years" },
      }).url,
    ).toBe("/api/v1/farms/farm%20one/insights?series=C01&range=5years");
  });
  it("validates malformed successful backend responses instead of inventing data", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            schema_version: CONTRACT_VERSION,
            request_id: "r",
            data: { name: "invalid" },
          }),
          { status: 200 },
        ),
      );
    const s = createHttpService(fetcher);
    await expect(
      s.execute("getFarm", { params: { farmId: "f" }, input: {} }),
    ).rejects.toThrow();
  });
  it("passes protected session and stable idempotency identity to a mutation", async () => {
    const bootstrap = await createFixtureService().execute("bootstrap", {
      input: {},
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schema_version: CONTRACT_VERSION,
            request_id: "r",
            data: bootstrap,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schema_version: CONTRACT_VERSION,
            request_id: "r2",
            data: bootstrap.farms[0],
          }),
        ),
      );
    const s = createHttpService(fetcher);
    await s.execute("bootstrap", { input: {} });
    await s.execute("updateFarm", {
      params: { farmId: "fixture-farm" },
      input: { expected_version: 1, name: "Draft" },
      command,
    });
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      "X-Sakha-Session": "fixture-session",
      "Idempotency-Key": "command-1",
    });
  });
  it("deduplicates replayed cursors and text batches, clears partial on resync", () => {
    const event: Event = {
      schema_version: CONTRACT_VERSION,
      cursor: "c1",
      farm_id: "f",
      run_id: "r",
      type: "text_batch",
      timestamp: "2026-10-10T00:00:00Z",
      correlation_id: "r",
      payload: { text: "first", sequence: 1 },
    };
    const one = reconcileEvent(emptyStream(), event);
    expect(reconcileEvent(one, event)).toBe(one);
    const two = reconcileEvent(one, { ...event, cursor: "c2" });
    expect(two.partial.r).toBe("first");
    expect(
      reconcileEvent(two, {
        ...event,
        cursor: "c3",
        type: "resync_required",
        payload: {},
      }).partial,
    ).toEqual({});
  });
});
