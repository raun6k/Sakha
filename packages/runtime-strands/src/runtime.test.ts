import * as c from "@sakha/contracts";
import { responseExamples } from "@sakha/contracts/examples";
import type { RuntimeTurn } from "@sakha/core";
import { expect, it } from "vitest";
import { bedrockReady, runtimeFailure, StrandsRuntime } from "./index.js";

function turn(onText: (text: string) => Promise<void>): RuntimeTurn {
  return {
    run: c.Run.parse(responseExamples.getRun),
    messages: [],
    facts: [],
    instructions: "Test instructions",
    signal: new AbortController().signal,
    onText,
    beforeSend: async () => {},
    tools: {
      readFacts: async () => [],
      lookupEvidence: async () => [],
      recallMemory: async () => [],
      scenario: async () => c.Scenario.parse(responseExamples.getScenario),
      proposePlan: async () =>
        c.PlanRevision.parse(responseExamples.getPlanRevision),
      publishFinding: async () => c.Finding.parse(responseExamples.getFinding),
      peer: async () => ({ id: "peer", status: "queued" }),
      clarify: async () => {},
      searchWeb: async () => [],
      fetchPage: async () => {
        throw new Error("unused");
      },
      consultSpecialist: async () => ({
        specialist: "megha",
        notes: "",
        citations: [],
        evidence_ids: [],
      }),
      dailyBrief: async () => [],
      remember: async () => ({ key: "note" }),
      recordWork: async () => {},
    },
  };
}
it("maps real SDK event shapes to streamed text and requires canonical completion", async () => {
  const batches: string[] = [];
  const runtime = new StrandsRuntime(
    { model: "test-model", apiKey: "synthetic-test-only" },
    () => ({
      cancel() {},
      async *stream() {
        yield {
          type: "modelStreamUpdateEvent",
          event: {
            type: "modelContentBlockDeltaEvent",
            delta: { type: "textDelta", text: "Hello" },
          },
        };
        yield { type: "agentResultEvent", result: { stopReason: "endTurn" } };
      },
    }),
  );
  expect(
    await runtime.startTurn(
      turn(async (text) => {
        batches.push(text);
      }),
    ),
  ).toEqual({ text: "Hello" });
  expect(batches).toEqual(["Hello"]);
});
it("preserves partial text as partial when completion fails and redacts raw provider errors", async () => {
  const batches: string[] = [];
  const runtime = new StrandsRuntime(
    { model: "test-model", apiKey: "synthetic-test-only" },
    () => ({
      cancel() {},
      async *stream() {
        yield {
          type: "modelStreamUpdateEvent",
          event: {
            type: "modelContentBlockDeltaEvent",
            delta: { type: "textDelta", text: "Partial" },
          },
        };
        throw new Error("private raw provider payload");
      },
    }),
  );
  await expect(
    runtime.startTurn(
      turn(async (text) => {
        batches.push(text);
      }),
    ),
  ).rejects.toThrow("provider turn failed");
  expect(batches).toEqual(["Partial"]);
  expect(runtimeFailure({ status: 401 }).message).toContain("authentication");
  expect(runtimeFailure({ status: 429 }).retryable).toBe(true);
});
it("reports missing credentials unavailable and rejects malformed/limited final results", async () => {
  const missing = new StrandsRuntime({ model: "model" });
  expect((await missing.getCapabilities()).ready).toBe(false);
  await expect(missing.startTurn(turn(async () => {}))).rejects.toThrow(
    "Configure",
  );
  const runtime = new StrandsRuntime(
    { model: "test-model", apiKey: "synthetic-test-only" },
    () => ({
      cancel() {},
      async *stream() {
        yield {
          type: "agentResultEvent",
          result: { stopReason: "limitTurns" },
        };
      },
    }),
  );
  await expect(runtime.startTurn(turn(async () => {}))).rejects.toThrow(
    "limitTurns",
  );
});
it("selects Bedrock from configuration and stays unavailable without a model", async () => {
  expect(
    bedrockReady(
      { provider: "bedrock", model: "anthropic.test", region: "us-east-1" },
      {},
    ),
  ).toBe(false);
  expect(
    bedrockReady(
      {
        provider: "bedrock",
        model: "anthropic.test",
        region: "us-east-1",
        apiKey: "synthetic",
      },
      {},
    ),
  ).toBe(true);
  const missing = new StrandsRuntime({ provider: "bedrock", model: "" });
  expect((await missing.getCapabilities()).ready).toBe(false);
  expect((await missing.getCapabilities()).reason).toMatch(/BEDROCK/);
  const ready = new StrandsRuntime({
    provider: "bedrock",
    model: "anthropic.test",
    region: "us-east-1",
    apiKey: "synthetic-bedrock-key",
  });
  const capabilities = await ready.getCapabilities();
  expect(capabilities.ready).toBe(true);
  expect(capabilities.version).toContain("bedrock");
});
it("bounds a provider that ignores cancellation", async () => {
  const runtime = new StrandsRuntime(
    { model: "test", apiKey: "synthetic", timeoutMs: 10 },
    () => ({
      cancel() {},
      async *stream() {
        await new Promise(() => {});
        yield {};
      },
    }),
  );
  await expect(runtime.startTurn(turn(async () => {}))).rejects.toThrow(
    "time bound",
  );
});
