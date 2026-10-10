import { CONTRACT_VERSION, type Event } from "@sakha/contracts";
import { describe, expect, it, vi } from "vitest";
import { emptyStream, reconcileEvent } from "../state/stream";
import { createFixtureService } from "./fixture";
import { createHttpService, downloadExport, operationUrl } from "./http";

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
    const fetcher = vi.fn().mockResolvedValue(
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
describe("backend restart and transport recovery", () => {
  it("renews only an expired session on reads and repeats the same read", async () => {
    const bootstrap = await createFixtureService().execute("bootstrap", {
      input: {},
    });
    const expired = {
      code: "permission_denied",
      message: "Old process session",
      retryable: false,
      request_id: "s",
      details: { session_expired: true },
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(expired), { status: 403 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schema_version: CONTRACT_VERSION,
            request_id: "b",
            data: { ...bootstrap, session_token: "renewed" },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schema_version: CONTRACT_VERSION,
            request_id: "f",
            data: bootstrap.farms[0],
          }),
        ),
      );
    const service = createHttpService(fetcher);
    await service.execute("getFarm", {
      params: { farmId: "fixture-farm" },
      input: {},
    });
    expect(fetcher.mock.calls.map((args) => args[0])).toEqual([
      "/api/v1/farms/fixture-farm",
      "/api/v1/bootstrap",
      "/api/v1/farms/fixture-farm",
    ]);
    expect(fetcher.mock.calls[2]?.[1]?.headers).toMatchObject({
      "X-Sakha-Session": "renewed",
    });
  });
  it("renews expired protection but never automatically resubmits a mutation", async () => {
    const bootstrap = await createFixtureService().execute("bootstrap", {
      input: {},
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "permission_denied",
            message: "Old session",
            retryable: false,
            request_id: "r",
            details: { session_expired: true },
          }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schema_version: CONTRACT_VERSION,
            request_id: "b",
            data: bootstrap,
          }),
        ),
      );
    const service = createHttpService(fetcher);
    await expect(
      service.execute("updateFarm", {
        params: { farmId: "fixture-farm" },
        input: { name: "Change", expected_version: 1 },
        command,
      }),
    ).rejects.toThrow("not been resubmitted");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      "Idempotency-Key": "command-1",
    });
  });
  it("does not reinterpret ordinary permission denial as stale session protection", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "permission_denied",
          message: "Not allowed",
          retryable: false,
          request_id: "r",
        }),
        { status: 403 },
      ),
    );
    await expect(
      createHttpService(fetcher).execute("getFarm", {
        params: { farmId: "f" },
        input: {},
      }),
    ).rejects.toThrow("Not allowed");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("parses split CRLF frames including comments without dropping the event", async () => {
    const event: Event = {
      schema_version: CONTRACT_VERSION,
      cursor: "c",
      farm_id: "f",
      type: "farm_changed",
      timestamp: "2026-10-10T00:00:00Z",
      correlation_id: "r",
      payload: {},
    };
    const encoder = new TextEncoder();
    const source = `: heartbeat\r\n\r\ndata: ${JSON.stringify(event)}\r\n\r\n`;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const char of source) controller.enqueue(encoder.encode(char));
        controller.close();
      },
    });
    const onEvent = vi.fn();
    const onStatus = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(stream));
    const stop = createHttpService(fetcher).subscribe(
      "f",
      undefined,
      onEvent,
      vi.fn(),
      onStatus,
    );
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledOnce());
    stop();
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({ cursor: "c" });
    expect(onStatus).toHaveBeenCalledWith("connected");
  });
});
describe("historical context and bounded stream state", () => {
  it("bounds canonical messages across long-lived event subscriptions", () => {
    let state = emptyStream();
    for (let i = 0; i < 260; i++) {
      const event: Event = {
        cursor: `m${i}`,
        farm_id: "f",
        type: "message_final",
        schema_version: CONTRACT_VERSION,
        timestamp: "2026-10-10T00:00:00Z",
        correlation_id: `r${i}`,
        run_id: `r${i}`,
        payload: {
          message: {
            id: `m${i}`,
            farm_id: "f",
            version: 1,
            created_at: "2026-10-10T00:00:00Z",
            updated_at: "2026-10-10T00:00:00Z",
            conversation_id: "c",
            role_key: "chief_of_staff",
            author: "agent",
            status: "final",
            text: "saved",
            context: { fact_versions: {}, evidence: [] },
          },
        },
      };
      state = reconcileEvent(state, event);
    }
    expect(state.messages).toHaveLength(200);
    expect(state.messages[0]?.id).toBe("m60");
  });
  it("a hypothetical scenario never changes authoritative farm facts", async () => {
    const s = createFixtureService();
    const before = await s.execute("listFacts", {
      params: { farmId: "fixture-farm" },
      input: {},
    });
    await s.execute("createScenario", {
      params: { farmId: "fixture-farm" },
      input: {
        farm_id: "fixture-farm",
        role_key: "water",
        kind: "water_budget",
        assumptions: [],
        inputs: { available_water: { kind: "known", value: 120, unit: "m3" } },
        evidence: [],
      },
      command,
    });
    expect(
      await s.execute("listFacts", {
        params: { farmId: "fixture-farm" },
        input: {},
      }),
    ).toEqual(before);
  });
});

describe("private export transport", () => {
  it("downloads through the authenticated local path and rejects another origin", async () => {
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
      .mockResolvedValueOnce(new Response('{"farm":true}'));
    const service = createHttpService(fetcher);
    await service.execute("bootstrap", { input: {} });
    const blob = await downloadExport(
      service,
      "/api/v1/farms/f/exports/j/download",
    );
    expect(await blob.text()).toBe('{"farm":true}');
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      "X-Sakha-Session": "fixture-session",
    });
    await expect(
      downloadExport(service, "https://example.com/export"),
    ).rejects.toThrow("Unexpected");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
