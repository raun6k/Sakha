import { Entry } from "@napi-rs/keyring";
import * as c from "@sakha/contracts";
import {
  activeSpecialists,
  charterInstructions,
  type Runtime,
  type RuntimeCapabilities,
  type RuntimeTurn,
} from "@sakha/core";
import { toolOwner } from "@sakha/data";
import { DomainError } from "@sakha/farm";
import { Agent, tool } from "@strands-agents/sdk";
import { BedrockModel } from "@strands-agents/sdk/models/bedrock";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import { z } from "zod";
export type StrandsProvider = "openai" | "bedrock";
export type StrandsConfiguration = {
  provider?: StrandsProvider;
  model: string;
  apiKey?: string;
  keyringAccount?: string;
  region?: string;
  maxTurns?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
};
export function bedrockReady(
  config: StrandsConfiguration,
  env: NodeJS.ProcessEnv = process.env,
) {
  if ((config.provider ?? "openai") !== "bedrock") return false;
  if (!config.model.trim()) return false;
  const region = config.region || env.AWS_REGION || env.AWS_DEFAULT_REGION;
  if (!region) return false;
  return Boolean(
    config.apiKey ||
      env.AWS_ACCESS_KEY_ID ||
      env.AWS_PROFILE ||
      env.AWS_BEARER_TOKEN_BEDROCK ||
      env.AWS_WEB_IDENTITY_TOKEN_FILE ||
      env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI,
  );
}
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
async function deniedOrJson(run: () => Promise<unknown>) {
  try {
    return JSON.stringify(await run());
  } catch (error) {
    if (error instanceof DomainError && error.code === "permission_denied")
      return JSON.stringify({ decision: "deny", message: error.message });
    throw error;
  }
}
function createModel(config: StrandsConfiguration, key: string | undefined) {
  if (config.provider === "bedrock")
    return new BedrockModel({
      modelId: config.model,
      region: config.region,
      maxTokens: 4096,
      ...(key ? { apiKey: key } : {}),
    });
  return new OpenAIModel({
    api: "responses",
    modelId: config.model,
    apiKey: key ?? "",
    maxTokens: 4096,
    stateful: false,
  });
}
function sdkDriver(
  config: StrandsConfiguration,
  key: string | undefined,
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
  }).strict();
  const tools = [
    tool({
      name: "recall_memory",
      description:
        "Recall only this persistent role’s current authorized farm/field notes. Corrections invalidate derived memories.",
      inputSchema: z.object({ query: z.string().min(1).max(1000) }).strict(),
      callback: async (input) => {
        check();
        return JSON.stringify(await turn.tools.recallMemory(input.query));
      },
    }),
    tool({
      name: "lookup_evidence",
      description:
        "Find actual saved public evidence permitted for this role and field; results retain freshness and provenance.",
      inputSchema: z
        .object({
          source_id: z.string().optional(),
          text: z.string().max(1000).optional(),
        })
        .strict(),
      callback: async (input) => {
        check();
        return JSON.stringify(await turn.tools.lookupEvidence(input));
      },
    }),
    tool({
      name: "calculate_scenario",
      description:
        "Run the deterministic domain calculator. Missing sourced methods and measurements remain unknown.",
      inputSchema: c.ScenarioRequest.omit({
        farm_id: true,
        field_id: true,
        role_key: true,
      }).strict(),
      callback: async (input) => {
        check();
        return JSON.stringify(await turn.tools.scenario(input));
      },
    }),
    tool({
      name: "propose_plan",
      description:
        "Create a reviewable revision. Does not approve or complete work. Chief of Staff only.",
      inputSchema: c.operations.createPlanRevision.input
        .omit({ farm_id: true, field_id: true })
        .strict(),
      callback: async (input) => {
        check();
        return JSON.stringify(await turn.tools.proposePlan(input));
      },
    }),
    tool({
      name: "read_farm_facts",
      description:
        "Read authorized immutable farmer fact context. No identity arguments.",
      inputSchema: z.object({}).strict(),
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
      inputSchema: z
        .object({
          recipient: c.RoleKey,
          text: z.string().min(1).max(10000),
        })
        .strict(),
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
    tool({
      name: "web_search",
      description:
        "Search public web sources. Every hit includes a source URL and fetched_at time. Prefer this plus saved evidence.",
      inputSchema: z.object({ query: z.string().min(1).max(500) }).strict(),
      callback: async (input) => {
        check();
        return deniedOrJson(() => turn.tools.searchWeb(input.query));
      },
    }),
    tool({
      name: "fetch_page",
      description:
        "Fetch one public HTTPS page on the agriculture and weather allowlist. Other domains are denied.",
      inputSchema: z.object({ url: z.url() }).strict(),
      callback: async (input) => {
        check();
        return deniedOrJson(() => turn.tools.fetchPage(input.url));
      },
    }),
    tool({
      name: "remember",
      description:
        "Save one memory key in this teammate's own notes. Profile keys are Sakha's.",
      inputSchema: z
        .object({
          key: z.string().min(1).max(80),
          value: z.string().min(1).max(500),
        })
        .strict(),
      callback: async (input) => {
        check();
        return deniedOrJson(() => turn.tools.remember(input.key, input.value));
      },
    }),
    tool({
      name: "record_work",
      description:
        "Record completed irrigation, spending, sowing or a sale. Sakha cannot do this; the farmer confirms work separately.",
      inputSchema: z
        .object({ description: z.string().min(1).max(2000) })
        .strict(),
      callback: async (input) => {
        check();
        return deniedOrJson(() => turn.tools.recordWork(input.description));
      },
    }),
    tool({
      name: "openmeteo_forecast",
      description:
        "Megha only. Open-Meteo rain, temperature, and ET0 for this farm, live or cached.",
      inputSchema: z.object({}).strict(),
      callback: async () => deniedOrJson(() => turn.tools.forecast()),
    }),
    tool({
      name: "noaa_enso_status",
      description:
        "Megha only. NOAA El Niño state for this season, live or cached.",
      inputSchema: z.object({}).strict(),
      callback: async () => deniedOrJson(() => turn.tools.enso()),
    }),
    tool({
      name: "irrigate_or_wait",
      description:
        "Jal only. Compare forecast rain with ET0 and say irrigate or wait.",
      inputSchema: z.object({}).strict(),
      callback: async () => deniedOrJson(() => turn.tools.irrigateOrWait()),
    }),
    tool({
      name: "crop_stage",
      description: "Kheti only. Crop and stage from this farm's saved facts.",
      inputSchema: z.object({}).strict(),
      callback: async () => deniedOrJson(() => turn.tools.cropStage()),
    }),
    tool({
      name: "agmarknet_prices",
      description: "Paisa only. Mandi prices for this crop, live or cached.",
      inputSchema: z.object({}).strict(),
      callback: async () => deniedOrJson(() => turn.tools.mandi()),
    }),
    tool({
      name: "msp_table",
      description: "Paisa only. Official MSP for this crop.",
      inputSchema: z.object({}).strict(),
      callback: async () => deniedOrJson(() => turn.tools.msp()),
    }),
  ];
  const visible = (role: c.RoleKey, name: string) => {
    if (
      ["propose_plan", "request_specialist", "record_work"].includes(name) &&
      role !== "sakha"
    )
      return false;
    const owner = toolOwner(name);
    return !owner || owner === role;
  };
  const model = createModel(config, key);
  const lead = turn.run.role_key === "sakha";
  const teammateTools = lead
    ? activeSpecialists.map((id) => {
        const teammate = new Agent({
          model,
          systemPrompt: charterInstructions(id, turn.language ?? "en"),
          tools: tools.filter((item) => {
            const name = "name" in item ? String(item.name) : "";
            return visible(id, name);
          }),
          printer: false,
          toolExecutor: "sequential" as const,
        });
        return tool({
          name: `consult_${id}`,
          description: `Ask ${id} for their lane only. Sakha reviews the Card. Do not invent numbers.`,
          inputSchema: z
            .object({ question: z.string().min(1).max(2000) })
            .strict(),
          callback: async (input) => {
            check();
            const card = await turn.tools.consultSpecialist(id, input.question);
            if (card.stopped) return JSON.stringify(card);
            try {
              const result = await teammate.invoke(input.question);
              const draft = z
                .object({
                  content: z
                    .array(
                      z.object({ text: z.string().optional() }).passthrough(),
                    )
                    .optional(),
                })
                .safeParse(result.lastMessage);
              const text = draft.success
                ? (draft.data.content ?? [])
                    .map((block) => block.text ?? "")
                    .join("")
                : "";
              return JSON.stringify({ ...card, draft: text.slice(0, 2000) });
            } catch {
              return JSON.stringify(card);
            }
          },
        });
      })
    : [];
  const daily = lead
    ? tool({
        name: "daily_brief",
        description:
          "Ask Megha, Jal, Kheti, and Paisa together, then merge one reviewed plan. Use this for the weekly brief.",
        inputSchema: z
          .object({ question: z.string().min(1).max(2000) })
          .strict(),
        callback: async (input) => {
          check();
          return deniedOrJson(() => turn.tools.dailyBrief(input.question));
        },
      })
    : undefined;
  const agent = new Agent({
    model,
    systemPrompt: turn.instructions,
    tools: [
      ...tools.filter((item) => {
        const name = "name" in item ? String(item.name) : "";
        return visible(turn.run.role_key, name);
      }),
      ...teammateTools,
      ...(daily ? [daily] : []),
    ],
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
    const provider = this.config.provider ?? "openai";
    let ready = false;
    try {
      ready =
        provider === "bedrock"
          ? bedrockReady(this.config)
          : Boolean(this.config.model && this.credential());
    } catch {}
    return {
      ready,
      text: true,
      cancel: true,
      resume: false,
      approvals: false,
      attachments: false,
      version:
        provider === "bedrock"
          ? "strands1.20.0-bedrock"
          : "strands1.20.0-openai6.49.0",
      reason: ready
        ? undefined
        : provider === "bedrock"
          ? "Set SAKHA_STRANDS_PROVIDER=bedrock, SAKHA_BEDROCK_MODEL_ID, AWS_REGION, and AWS credentials or SAKHA_BEDROCK_API_KEY"
          : "Add an operator model and OpenAI API credential",
    };
  }
  async startTurn(turn: RuntimeTurn) {
    const provider = this.config.provider ?? "openai";
    const key = provider === "bedrock" ? this.config.apiKey : this.credential();
    if (
      provider === "bedrock"
        ? !bedrockReady(this.config)
        : !key || !this.config.model
    )
      throw new DomainError(
        "unavailable",
        provider === "bedrock"
          ? "Configure SAKHA_BEDROCK_MODEL_ID, AWS_REGION, and AWS credentials or SAKHA_BEDROCK_API_KEY"
          : "Configure OPENAI_API_KEY and SAKHA_OPENAI_MODEL, or OS keyring reference",
      );
    const timeoutController = new AbortController();
    const signal = AbortSignal.any([turn.signal, timeoutController.signal]);
    const driver = this.driverFactory(this.config, key, { ...turn, signal });
    this.active.set(turn.run.id, driver);
    const timeout = setTimeout(() => {
      timeoutController.abort();
      driver.cancel();
    }, this.config.timeoutMs ?? 120000);
    let text = "",
      completed = false;
    let abortListener: () => void = () => {};
    const stopped = new Promise<never>((_, reject) => {
      abortListener = () => {
        driver.cancel();
        reject(
          new DomainError(
            "interrupted",
            "Turn cancelled or exceeded its time bound",
          ),
        );
      };
      signal.addEventListener("abort", abortListener, { once: true });
      if (signal.aborted) abortListener();
    });
    void stopped.catch(() => {});
    try {
      await turn.beforeSend();
      const iterator = driver.stream()[Symbol.asyncIterator]();
      for (;;) {
        const next = await Promise.race([iterator.next(), stopped]);
        if (next.done) break;
        const raw = next.value;
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
      signal.removeEventListener("abort", abortListener);
      this.active.delete(turn.run.id);
    }
  }
  async cancelTurn(runId: string) {
    this.active.get(runId)?.cancel();
  }
}
