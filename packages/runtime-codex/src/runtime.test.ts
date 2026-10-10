import { spawn } from "node:child_process";
import * as c from "@sakha/contracts";
import { responseExamples } from "@sakha/contracts/examples";
import type { RuntimeTurn } from "@sakha/core";
import { expect, it, vi } from "vitest";
import { CodexRuntime, invokeScopedTool } from "./index.js";

function turn(onText: (text: string) => Promise<void>): RuntimeTurn {
  return {
    run: c.Run.parse(responseExamples.getRun),
    messages: [],
    facts: [],
    instructions: "Synthetic protocol test",
    signal: new AbortController().signal,
    onText,
    beforeSend: async () => {},
    tools: {
      readFacts: async () => [],
      lookupEvidence: async () => [],
      scenario: async () => c.Scenario.parse(responseExamples.getScenario),
      proposePlan: async () =>
        c.PlanRevision.parse(responseExamples.getPlanRevision),
      publishFinding: async () => c.Finding.parse(responseExamples.getFinding),
      peer: async () => ({ id: "peer", status: "queued" }),
      clarify: async () => {},
    },
  };
}
function runtime() {
  const instance = new CodexRuntime({
    enabled: true,
    bridgeEntrypoint: "unused",
    spawnProcess: () =>
      spawn(
        process.execPath,
        [
          "-e",
          `const rl=require('node:readline').createInterface({input:process.stdin});const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');rl.on('line',line=>{const m=JSON.parse(line);if(!m.id)return;if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'thread'}}});else if(m.method==='turn/start'){send({id:m.id,result:{turn:{id:'turn'}}});send({method:'item/agentMessage/delta',params:{threadId:'thread',delta:'Text'}});send({method:'turn/completed',params:{threadId:'thread',turn:{status:'completed'}}});}else send({id:m.id,result:{}});});`,
        ],
        { stdio: "pipe" },
      ),
  });
  vi.spyOn(instance, "getCapabilities").mockResolvedValue({
    ready: true,
    version: "synthetic",
    text: true,
    cancel: true,
    resume: false,
    approvals: false,
    attachments: false,
  });
  return instance;
}
it("drains durable text callbacks before canonical completion", async () => {
  let saved = false;
  const result = await runtime().startTurn(
    turn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      saved = true;
    }),
  );
  expect(saved).toBe(true);
  expect(result.text).toBe("Text");
});
it("rejects persistence failures rather than publishing canonical success", async () => {
  await expect(
    runtime().startTurn(
      turn(async () => {
        throw new Error("Storage failed");
      }),
    ),
  ).rejects.toThrow("Codex protocol turn failed");
});
it("rejects forged identity and unknown tools before side effects", async () => {
  const input = turn(async () => {});
  const read = vi.spyOn(input.tools, "readFacts");
  await expect(
    invokeScopedTool(input, "read_farm_facts", { farm_id: "other" }),
  ).rejects.toThrow();
  await expect(invokeScopedTool(input, "native_shell", {})).rejects.toThrow(
    "Unknown scoped tool",
  );
  expect(read).not.toHaveBeenCalled();
});
