import {
  type ChildProcessWithoutNullStreams,
  execFileSync,
  spawn,
  spawnSync,
} from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import * as c from "@sakha/contracts";
import type { Runtime, RuntimeCapabilities, RuntimeTurn } from "@sakha/core";
import { DomainError } from "@sakha/farm";
import { z } from "zod";

const rpcMessage = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});
export class JsonRpcConnection {
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();
  private handlers = new Set<(method: string, params: unknown) => void>();
  private bufferBytes = 0;
  constructor(readonly child: ChildProcessWithoutNullStreams) {
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      this.bufferBytes += Buffer.byteLength(line);
      if (line.length > 1_000_000 || this.bufferBytes > 4_000_000) {
        this.fail(new Error("Codex protocol output limit exceeded"));
        child.kill();
        return;
      }
      let message: z.infer<typeof rpcMessage>;
      try {
        message = rpcMessage.parse(JSON.parse(line));
      } catch {
        this.fail(new Error("Malformed Codex protocol message"));
        child.kill();
        return;
      }
      if (message.id !== undefined && message.method) {
        child.stdin.write(
          `${JSON.stringify({ id: message.id, error: { code: -32601, message: "Runtime approval/native tool requests are not enabled" } })}\n`,
        );
        return;
      }
      if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error("Codex request failed"));
          else pending.resolve(message.result);
        }
      } else if (message.method)
        for (const handler of this.handlers)
          handler(message.method, message.params);
    });
    child.on("exit", () => this.fail(new Error("Codex app-server exited")));
    child.on("error", () =>
      this.fail(new Error("Codex app-server could not start")),
    );
    child.stderr.on("data", () => {});
  }
  private fail(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
  request(method: string, params: unknown, timeoutMs = 30000) {
    const id = ++this.sequence;
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }
  notify(method: string, params: unknown = {}) {
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }
  subscribe(handler: (method: string, params: unknown) => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  close() {
    this.fail(new Error("Codex connection closed"));
    this.child.kill();
  }
}
export type CodexWebSearch = "disabled" | "cached" | "live";
export type CodexConfiguration = {
  enabled: boolean;
  binary?: string;
  model?: string;
  bridgeEntrypoint: string;
  loaderPath?: string;
  timeoutMs?: number;
  webSearch?: CodexWebSearch;
  spawnProcess?: (
    args: string[],
    cwd: string,
  ) => ChildProcessWithoutNullStreams;
};
export function codexWebSearchMode(value: string | undefined): CodexWebSearch {
  if (value === "cached" || value === "live") return value;
  return "disabled";
}
export function codexNetworkClause(webSearch: CodexWebSearch = "disabled") {
  return webSearch === "live"
    ? "network={enabled=true}"
    : "network={enabled=false}";
}
export const gatewaySchemas = {
  read_farm_facts: z.object({}).strict(),
  recall_memory: z.object({ query: z.string().min(1).max(1000) }).strict(),
  lookup_evidence: z
    .object({
      source_id: z.string().optional(),
      text: z.string().max(1000).optional(),
    })
    .strict(),
  calculate_scenario: c.ScenarioRequest.omit({
    farm_id: true,
    field_id: true,
    role_key: true,
  }).strict(),
  propose_plan: c.operations.createPlanRevision.input
    .omit({ farm_id: true, field_id: true })
    .strict(),
  publish_finding: c.Finding.omit({
    id: true,
    farm_id: true,
    field_id: true,
    version: true,
    created_at: true,
    updated_at: true,
    role_key: true,
    origin: true,
  }).strict(),
  request_specialist: z
    .object({ recipient: c.RoleKey, text: z.string().min(1).max(10000) })
    .strict(),
  ask_clarification: z
    .object({ question: z.string().min(1).max(2000) })
    .strict(),
  web_search: z.object({ query: z.string().min(1).max(500) }).strict(),
  fetch_page: z.object({ url: z.url() }).strict(),
  consult_specialist: z
    .object({
      specialist: z.string().min(1).max(64),
      question: z.string().min(1).max(2000),
    })
    .strict(),
  daily_brief: z.object({ question: z.string().min(1).max(2000) }).strict(),
  remember: z
    .object({
      key: z.string().min(1).max(80),
      value: z.string().min(1).max(500),
    })
    .strict(),
  record_work: z.object({ description: z.string().min(1).max(2000) }).strict(),
};
export async function invokeScopedTool(
  turn: RuntimeTurn,
  name: string,
  args: unknown,
) {
  switch (name) {
    case "read_farm_facts":
      gatewaySchemas.read_farm_facts.parse(args);
      return turn.tools.readFacts();
    case "recall_memory":
      return turn.tools.recallMemory(
        gatewaySchemas.recall_memory.parse(args).query,
      );
    case "lookup_evidence":
      return turn.tools.lookupEvidence(
        gatewaySchemas.lookup_evidence.parse(args),
      );
    case "calculate_scenario":
      return turn.tools.scenario(gatewaySchemas.calculate_scenario.parse(args));
    case "propose_plan":
      return turn.tools.proposePlan(gatewaySchemas.propose_plan.parse(args));
    case "publish_finding":
      return turn.tools.publishFinding(
        gatewaySchemas.publish_finding.parse(args),
      );
    case "request_specialist": {
      const input = gatewaySchemas.request_specialist.parse(args);
      return turn.tools.peer(input.recipient, input.text);
    }
    case "ask_clarification": {
      const input = gatewaySchemas.ask_clarification.parse(args);
      await turn.tools.clarify(input.question);
      return { status: "waiting_clarification" };
    }
    case "web_search":
      return turn.tools.searchWeb(gatewaySchemas.web_search.parse(args).query);
    case "fetch_page":
      return turn.tools.fetchPage(gatewaySchemas.fetch_page.parse(args).url);
    case "consult_specialist": {
      const input = gatewaySchemas.consult_specialist.parse(args);
      return turn.tools.consultSpecialist(input.specialist, input.question);
    }
    case "daily_brief":
      return turn.tools.dailyBrief(
        gatewaySchemas.daily_brief.parse(args).question,
      );
    case "remember": {
      const input = gatewaySchemas.remember.parse(args);
      return turn.tools.remember(input.key, input.value);
    }
    case "record_work":
      await turn.tools.recordWork(
        gatewaySchemas.record_work.parse(args).description,
      );
      return { decision: "deny" };
    default:
      throw new DomainError("permission_denied", "Unknown scoped tool");
  }
}
export class CodexRuntime implements Runtime {
  private active = new Map<
    string,
    { connection: JsonRpcConnection; threadId: string; turnId?: string }
  >();
  constructor(private configuration: CodexConfiguration) {}
  async getCapabilities(): Promise<RuntimeCapabilities> {
    let version = "missing";
    let ready = false;
    let reason = "Enable installed Codex runtime explicitly";
    if (this.configuration.enabled) {
      try {
        version = execFileSync(
          this.configuration.binary ?? "codex",
          ["--version"],
          { encoding: "utf8", timeout: 5000 },
        ).trim();
        if (!/^codex(?:-cli)? 0\.159\.2$/.test(version))
          reason =
            "Installed Codex version differs from verified protocol0.159.2";
        else {
          const authentication = spawnSync(
            this.configuration.binary ?? "codex",
            ["login", "status"],
            {
              encoding: "utf8",
              timeout: 5000,
              stdio: ["ignore", "pipe", "pipe"],
            },
          );
          ready =
            authentication.status === 0 &&
            /Logged in/.test(
              `${authentication.stdout}${authentication.stderr}`,
            );
          reason = ready ? "" : "Authenticate using codex login";
        }
      } catch {
        reason =
          "Install compatible Codex0.159.2 and authenticate using codex login";
      }
    }
    return {
      ready,
      text: true,
      cancel: true,
      resume: false,
      approvals: false,
      attachments: false,
      version,
      reason: ready ? undefined : reason,
    };
  }
  async startTurn(turn: RuntimeTurn) {
    if (!(await this.getCapabilities()).ready)
      throw new DomainError(
        "unavailable",
        "Installed Codex is disabled, incompatible or needs authentication",
      );
    const cwd = mkdtempSync(join(tmpdir(), "sakha-codex-run-"));
    const token = randomBytes(32).toString("hex");
    let toolCalls = 0;
    const gateway = createServer(async (request, response) => {
      try {
        const supplied = request.headers["x-sakha-run"];
        if (
          request.method !== "POST" ||
          typeof supplied !== "string" ||
          supplied.length !== token.length ||
          !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
        )
          throw new DomainError("permission_denied", "Invalid run binding");
        let raw = "";
        for await (const chunk of request) {
          raw += chunk;
          if (raw.length > 500000)
            throw new DomainError("validation", "Tool input too large");
        }
        if (turn.signal.aborted || ++toolCalls > 24)
          throw new DomainError(
            "interrupted",
            "Run cancelled or tool budget exceeded",
          );
        const body = z
          .object({ name: z.string(), args: z.unknown() })
          .strict()
          .parse(JSON.parse(raw));
        const result = await invokeScopedTool(turn, body.name, body.args);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ data: result }));
      } catch (error) {
        response.writeHead(403, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            error:
              error instanceof DomainError
                ? error.message
                : "Invalid scoped tool request",
          }),
        );
      }
    });
    await new Promise<void>((resolve) =>
      gateway.listen(0, "127.0.0.1", resolve),
    );
    const address = gateway.address();
    if (!address || typeof address === "string")
      throw new DomainError("internal", "Gateway address unavailable");
    const mcpArgs = this.configuration.loaderPath
      ? [
          "--import",
          this.configuration.loaderPath,
          this.configuration.bridgeEntrypoint,
        ]
      : ["--conditions=sakha-release", this.configuration.bridgeEntrypoint];
    const binary = realpathSync(
      this.configuration.binary ??
        (this.configuration.spawnProcess
          ? process.execPath
          : execFileSync("which", ["codex"], { encoding: "utf8" }).trim()),
    );
    const filePermissions: Record<string, unknown> = {
      ":root": "deny",
      ":minimal": "read",
      ":tmpdir": "deny",
      ":slash_tmp": "deny",
      "/tmp": "deny",
      "/private/tmp": "deny",
      "/Users": "deny",
      "/home": "deny",
      [realpathSync(tmpdir())]: "deny",
      [realpathSync(cwd)]: "read",
      ":workspace_roots": { ".": "read" },
      [binary]: "read",
    };
    const profile = `permissions.sakha={description="Sakha run-bound isolated read-only tools",filesystem={${Object.entries(
      filePermissions,
    )
      .map(
        ([key, value]) =>
          `${JSON.stringify(key)}=${typeof value === "string" ? JSON.stringify(value) : '{"."="read"}'}`,
      )
      .join(",")}},${codexNetworkClause(this.configuration.webSearch)}}`;
    const args = [
      "app-server",
      "--listen",
      "stdio://",
      "-c",
      "mcp_servers={}",
      "-c",
      profile,
      "-c",
      "features.plugins=false",
      "-c",
      "features.apps=false",
      "-c",
      "features.code_mode_host=true",
      "-c",
      "features.code_mode=false",
      "-c",
      "features.shell_tool=false",
      "-c",
      "features.unified_exec=false",
      "-c",
      "features.browser_use=false",
      "-c",
      "features.browser_use_external=false",
      "-c",
      "features.browser_use_full_cdp_access=false",
      "-c",
      "features.in_app_browser=false",
      "-c",
      "features.computer_use=false",
    ];
    const child = this.configuration.spawnProcess
      ? this.configuration.spawnProcess(args, cwd)
      : spawn(binary, args, {
          cwd,
          stdio: "pipe",
        });
    const connection = new JsonRpcConnection(child);
    let text = "";
    let unsubscribe: () => void = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let persistence = Promise.resolve();
    let rejectInterrupted: (error: Error) => void = () => {};
    const abort = () => {
      rejectInterrupted(new DomainError("interrupted", "Codex turn cancelled"));
      void this.cancelTurn(turn.run.id);
    };
    try {
      await connection.request("initialize", {
        capabilities: { experimentalApi: true },
        clientInfo: {
          name: "sakha",
          title: "Sakha local farming command center",
          version: "0.1.0",
        },
      });
      connection.notify("initialized");
      const inherited = z
        .object({
          data: z.array(z.object({ name: z.string() })),
          nextCursor: z.string().nullable(),
        })
        .parse(
          await connection.request("mcpServerStatus/list", {
            limit: 100,
            detail: "toolsAndAuthOnly",
          }),
        );
      if (inherited.nextCursor)
        throw new DomainError(
          "permission_denied",
          "Inherited MCP inventory exceeds isolation bound",
        );
      const disabledServers = Object.fromEntries(
        inherited.data
          .filter((server) => server.name !== "sakha")
          .map((server) => [server.name, { enabled: false }]),
      );
      const started = z.object({ thread: z.object({ id: z.string() }) }).parse(
        await connection.request("thread/start", {
          ephemeral: true,
          cwd,
          approvalPolicy: "never",
          permissions: "sakha",
          model: this.configuration.model,
          baseInstructions: turn.instructions,
          developerInstructions:
            "Native shell, file and browser tools are disabled. Use Sakha web_search and fetch_page for public sources; fetch_page only succeeds for allowlisted agriculture and weather domains. record_work is denied. Never read outside the runtime workspace.",
          config: {
            web_search: this.configuration.webSearch ?? "disabled",
            mcp_servers: {
              ...disabledServers,
              sakha: {
                command: process.execPath,
                required: true,
                enabled_tools: Object.keys(gatewaySchemas),
                default_tools_approval_mode: "approve",
                args: mcpArgs,
                env: {
                  SAKHA_RUN_GATEWAY: `http://127.0.0.1:${address.port}`,
                  SAKHA_RUN_TOKEN: token,
                },
                startup_timeout_sec: 20,
                tool_timeout_sec: 30,
              },
            },
          },
        }),
      );
      const threadId = started.thread.id;
      const inventory = z
        .object({
          data: z.array(
            z.object({
              name: z.string(),
              tools: z.record(z.string(), z.unknown()),
            }),
          ),
          nextCursor: z.string().nullable(),
        })
        .parse(
          await connection.request("mcpServerStatus/list", {
            threadId,
            limit: 100,
            detail: "toolsAndAuthOnly",
          }),
        );
      if (
        inventory.nextCursor ||
        inventory.data.some(
          (server) =>
            (server.name !== "sakha" && Object.keys(server.tools).length > 0) ||
            (server.name === "sakha" &&
              Object.keys(server.tools).some(
                (key) => !Object.keys(gatewaySchemas).includes(key),
              )),
        ) ||
        !inventory.data.some(
          (server) =>
            server.name === "sakha" && Object.keys(server.tools).length > 0,
        )
      )
        throw new DomainError(
          "permission_denied",
          "Codex tool inventory differs from scoped Sakha configuration",
        );
      this.active.set(turn.run.id, { connection, threadId });
      const result = new Promise<{ text: string }>((resolve, reject) => {
        rejectInterrupted = reject;
        timer = setTimeout(
          () =>
            reject(
              new DomainError(
                "interrupted",
                "Codex turn exceeded its time bound",
              ),
            ),
          this.configuration.timeoutMs ?? 120000,
        );
        unsubscribe = connection.subscribe((method, params) => {
          try {
            if (method === "item/agentMessage/delta") {
              const delta = z
                .object({ threadId: z.string(), delta: z.string() })
                .parse(params);
              if (delta.threadId !== threadId) return;
              text += delta.delta;
              if (text.length > 100000)
                throw new DomainError("runtime", "Codex output bound exceeded");
              persistence = persistence.then(() => turn.onText(delta.delta));
              void persistence.catch(reject);
            }
            if (method === "turn/completed") {
              const completed = z
                .object({
                  threadId: z.string(),
                  turn: z.object({ status: z.string() }),
                })
                .parse(params);
              if (completed.threadId !== threadId) return;
              clearTimeout(timer);
              if (completed.turn.status !== "completed")
                reject(
                  new DomainError(
                    completed.turn.status === "interrupted"
                      ? "interrupted"
                      : "runtime",
                    `Codex turn ${completed.turn.status}`,
                  ),
                );
              else if (!text.trim())
                reject(new DomainError("runtime", "Codex returned no text"));
              else void persistence.then(() => resolve({ text }), reject);
            }
          } catch {
            clearTimeout(timer);
            reject(
              new DomainError("runtime", "Codex protocol event malformed"),
            );
          }
        });
        child.once("exit", () => {
          clearTimeout(timer);
          reject(
            new DomainError(
              "interrupted",
              "Codex process stopped before completion",
            ),
          );
        });
        turn.signal.addEventListener("abort", abort, { once: true });
      });
      void result.catch(() => {});
      await turn.beforeSend();
      if (turn.signal.aborted)
        throw new DomainError("interrupted", "Run cancelled before send");
      const accepted = z.object({ turn: z.object({ id: z.string() }) }).parse(
        await connection.request("turn/start", {
          threadId,
          input: [
            {
              type: "text",
              text: JSON.stringify({
                transcript: turn.messages.map((m) => ({
                  author: m.author,
                  text: m.text,
                })),
                authorized_facts: turn.facts,
              }),
            },
          ],
          approvalPolicy: "never",
          permissions: "sakha",
        }),
      );
      this.active.set(turn.run.id, {
        connection,
        threadId,
        turnId: accepted.turn.id,
      });
      return await result;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        "runtime",
        "Codex protocol turn failed; inspect compatible install/authentication",
        true,
      );
    } finally {
      if (timer) clearTimeout(timer);
      turn.signal.removeEventListener("abort", abort);
      unsubscribe();
      this.active.delete(turn.run.id);
      connection.close();
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
      rmSync(cwd, { recursive: true, force: true });
    }
  }
  async cancelTurn(runId: string) {
    const active = this.active.get(runId);
    if (active?.turnId)
      await active.connection
        .request("turn/interrupt", {
          threadId: active.threadId,
          turnId: active.turnId,
        })
        .catch(() => {});
    else active?.connection.close();
  }
}
