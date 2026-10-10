import { Entry } from "@napi-rs/keyring";
import * as c from "@sakha/contracts";
import type { Runtime, RuntimeCapabilities, RuntimeTurn } from "@sakha/core";
import { DomainError } from "@sakha/farm";
import { Agent, tool } from "@strands-agents/sdk";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import { z } from "zod";
export type StrandsConfiguration = {
  model: string;
  apiKey?: string;
  keyringAccount?: string;
  maxTurns?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
};
export interface AgentDriver {
  stream(): AsyncIterable<unknown>;
  cancel(): void;
}
export function runtimeFailure(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const status = z.object({ status: z.number().optional() }).safeParse(error);
  if (status.success && status.data.status === 401)
    return new DomainError(
      "runtime",
      "Provider authentication failed; update the operator credential",
    );
  if (status.success && status.data.status === 429)
    return new DomainError(
      "runtime",
      "Provider rate limit reached; try later",
      true,
    );
  if (error instanceof Error && error.name === "AbortError")
    return new DomainError("interrupted", "Turn was cancelled or timed out");
  return new DomainError(
    "runtime",
    "The provider turn failed. Review operator configuration or retry later",
    true,
  );
}
function sdkDriver(
  config: StrandsConfiguration,
  key: string,
  turn: RuntimeTurn,
): AgentDriver {
  let toolCalls = 0;
  const check = () => {
    if (turn.signal.aborted)
      throw new DomainError("interrupted", "Run cancelled");
    if (++toolCalls > 24)
      throw new DomainError("runtime", "Tool budget exhausted");
  };
  const findingInput = c.Finding.omit({
    id: true,
    farm_id: true,
    field_id: true,
    version: true,
    created_at: true,
    updated_at: true,
    role_key: true,
    origin: true,
  });
  const tools = [
    tool({
      name: "read_farm_facts",
      description:
        "Read authorized immutable farmer fact context. No identity arguments.",
      inputSchema: z.object({}),
      callback: async () => {
        check();
        return JSON.stringify(await turn.tools.readFacts());
      },
    }),
    tool({
      name: "publish_finding",
      description:
        "Persist a grounded finding with actual evidence IDs; missing inputs remain explicit.",
      inputSchema: findingInput,
      callback: async (input) => {
        check();
        return JSON.stringify(await turn.tools.publishFinding(input));
      },
    }),
    tool({
      name: "request_specialist",
      description:
        "Send a permitted durable peer request. Queued acknowledgement is not a specialist answer.",
      inputSchema: z.object({
        recipient: c.RoleKey,
        text: z.string().min(1).max(10000),
      }),
      callback: async (input) => {
        check();
        return JSON.stringify(
          await turn.tools.peer(input.recipient, input.text),
        );
      },
    }),
    tool({
      name: "ask_clarification",
      description:
        "Pause for a concrete farmer question when essential information is missing. This does not save facts.",
      inputSchema: z.object({ question: z.string().min(1).max(2000) }),
      callback: async (input) => {
        check();
        await turn.tools.clarify(input.question);
        return "Waiting for farmer clarification";
      },
    }),
  ];
  const agent = new Agent({
    model: new OpenAIModel({
      api: "responses",
      modelId: config.model,
      apiKey: key,
      maxTokens: 4096,
      stateful: false,
    }),
    systemPrompt: turn.instructions,
    tools,
    toolExecutor: "sequential",
    printer: false,
    messages: turn.messages.slice(0, -1).map((message) => ({
      role: message.author === "farmer" ? "user" : "assistant",
      content: [{ text: message.text }],
    })),
  });
  return {
    stream: () =>
      agent.stream(
        JSON.stringify({
          farmer_message: turn.messages.at(-1)?.text ?? "",
          authorized_facts: turn.facts,
        }),
        {
          cancelSignal: turn.signal,
          limits: {
            turns: config.maxTurns ?? 8,
            outputTokens: config.maxOutputTokens ?? 8192,
            totalTokens: 32000,
          },
        },
      ),
    cancel: () => agent.cancel(),
  };
}
export class StrandsRuntime implements Runtime {
  private active = new Map<string, AgentDriver>();
  constructor(
    private config: StrandsConfiguration,
    private driverFactory: typeof sdkDriver = sdkDriver,
  ) {}
  private credential() {
    if (this.config.apiKey) return this.config.apiKey;
    if (this.config.keyringAccount) {
      try {
        return (
          new Entry("sakha-openai", this.config.keyringAccount).getPassword() ??
          undefined
        );
      } catch {
        throw new DomainError(
          "unavailable",
          "OS keyring unavailable; configure an environment credential",
        );
      }
    }
    return undefined;
  }
  async getCapabilities(): Promise<RuntimeCapabilities> {
    let ready = false;
    try {
      ready = Boolean(this.config.model && this.credential());
    } catch {}
    return {
      ready,
      text: true,
      cancel: true,
      resume: false,
      approvals: false,
      attachments: false,
      version: "strands1.20.0-openai6.49.0",
      reason: ready
        ? undefined
        : "Add an operator model and OpenAI API credential",
    };
  }
  async startTurn(turn: RuntimeTurn) {
    const key = this.credential();
    if (!key || !this.config.model)
      throw new DomainError(
        "unavailable",
        "Configure OPENAI_API_KEY and SAKHA_OPENAI_MODEL, or OS keyring reference",
      );
    const driver = this.driverFactory(this.config, key, turn);
    this.active.set(turn.run.id, driver);
    const timeout = setTimeout(
      () => driver.cancel(),
      this.config.timeoutMs ?? 120000,
    );
    let text = "",
      completed = false;
    try {
      for await (const raw of driver.stream()) {
        if (turn.signal.aborted)
          throw new DomainError("interrupted", "Turn cancelled");
        const event = z
          .object({
            type: z.string(),
            event: z.unknown().optional(),
            result: z.unknown().optional(),
          })
          .parse(raw);
        if (event.type === "modelStreamUpdateEvent") {
          const update = z
            .object({ type: z.string(), delta: z.unknown().optional() })
            .parse(event.event);
          if (update.type === "modelContentBlockDeltaEvent") {
            const delta = z
              .object({ type: z.string(), text: z.string().optional() })
              .parse(update.delta);
            if (delta.type === "textDelta") {
              if (delta.text === undefined)
                throw new DomainError(
                  "runtime",
                  "Malformed provider text event",
                );
              text += delta.text;
              if (text.length > 100000)
                throw new DomainError(
                  "runtime",
                  "Response exceeded the output bound",
                );
              await turn.onText(delta.text);
            }
          }
        }
        if (event.type === "agentResultEvent") {
          const result = z
            .object({ stopReason: z.string() })
            .parse(event.result);
          if (result.stopReason !== "endTurn")
            throw new DomainError(
              result.stopReason === "cancelled" ? "interrupted" : "runtime",
              `Runtime ended with ${result.stopReason}`,
            );
          completed = true;
        }
      }
      if (!completed || !text.trim())
        throw new DomainError(
          "runtime",
          "Provider did not return a completed text answer",
        );
      return { text };
    } catch (error) {
      throw runtimeFailure(error);
    } finally {
      clearTimeout(timeout);
      this.active.delete(turn.run.id);
    }
  }
  async cancelTurn(runId: string) {
    this.active.get(runId)?.cancel();
  }
}
