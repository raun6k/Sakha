import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import sse from "@fastify/sse";
import fastifyStatic from "@fastify/static";
import { roleDirectory } from "@sakha/agents-farming";
import * as c from "@sakha/contracts";
import type { Runtime } from "@sakha/core";
import { authorize, createCoreServices } from "@sakha/core";
import { createDataServices } from "@sakha/data";
import {
  createDomainServices,
  createFarmServices,
  DomainError,
} from "@sakha/farm";
import Fastify from "fastify";
import { z } from "zod";
import { replayEvents } from "./events.js";
import { createExecution } from "./execution.js";
import { createLifecycle } from "./lifecycle.js";
import { Storage } from "./storage/database.js";
export function createApp(options: {
  databasePath: string;
  logger?: boolean;
  origin?: string;
  devOrigins?: string[];
  runtime?: Runtime;
  startScheduler?: boolean;
  webDirectory?: string;
}) {
  const store = new Storage(options.databasePath);
  const farm = createFarmServices(store, randomUUID, () =>
    new Date().toISOString(),
  );
  const domain = createDomainServices(
    store,
    farm.makeBase,
    farm.assertFarm,
    () => new Date().toISOString(),
  );
  const core = createCoreServices(
    store,
    farm.makeBase,
    farm.assertFarm,
    farm.listFacts,
    () => new Date().toISOString(),
  );
  const dataServices = createDataServices(
    store,
    farm.makeBase,
    farm.assertFarm,
    () => new Date().toISOString(),
  );
  const lifecycle = createLifecycle(store, farm);
  const sessionToken = randomBytes(32).toString("hex");
  const origin = options.origin ?? "http://127.0.0.1:4310";
  const allowedOrigins = new Set([origin, ...(options.devOrigins ?? [])]);
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 14_000_000,
  });
  app.addHook("onRequest", async (request) => {
    if (!request.url.startsWith("/api/")) return;
    if (request.url === "/api/v1/health") return;
    const host = request.headers.host;
    const actualOrigin = request.headers.origin;
    if (
      !host ||
      new URL(`http://${host}`).host !== new URL(origin).host ||
      request.headers["sec-fetch-site"] === "cross-site" ||
      (actualOrigin && !allowedOrigins.has(actualOrigin))
    )
      throw new DomainError(
        "permission_denied",
        "Open Sakha through its configured local address",
      );
    if (request.url === "/api/v1/bootstrap" && request.method === "GET") return;
    const token = request.headers["x-sakha-session"];
    if (
      typeof token !== "string" ||
      token.length !== sessionToken.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(sessionToken))
    )
      throw new DomainError(
        "permission_denied",
        "Local session expired. Reload Sakha",
        false,
        { session_expired: true },
      );
    if (
      !["GET", "HEAD"].includes(request.method) &&
      !request.headers["content-type"]?.startsWith("application/json")
    )
      throw new DomainError(
        "validation",
        "State-changing requests require JSON",
      );
  });
  app.setErrorHandler((error, request, reply) => {
    let code: c.ApiError["code"] = "internal";
    let message = "An internal operation failed";
    if (error instanceof DomainError) {
      code = error.code;
      message = error.message;
    } else if (error instanceof z.ZodError) {
      code = "validation";
      message = "Check the supplied fields";
    } else if (
      error instanceof Error &&
      error.message === "idempotency_conflict"
    ) {
      code = "idempotency_conflict";
      message = "This command key was used with a different payload";
    }
    const status =
      code === "not_found"
        ? 404
        : code.includes("conflict")
          ? 409
          : code === "permission_denied" ||
              code === "scope_denied" ||
              code === "consent_required"
            ? 403
            : code === "unavailable"
              ? 503
              : code === "validation"
                ? 400
                : 500;
    reply.code(status).send(
      c.ApiError.parse({
        code,
        message,
        retryable: code === "unavailable",
        request_id: request.id,
        details: error instanceof DomainError ? error.details : undefined,
      }),
    );
  });
  for (const [name, operation] of Object.entries(c.operations))
    app.route({
      method: operation.method,
      url: `/api/v1${operation.path}`,
      handler: async (request) => {
        const params = z.record(z.string(), z.string()).parse(request.params);
        const input = operation.input.parse(
          operation.method === "GET" ? request.query : (request.body ?? {}),
        );
        const runtimeReady =
          ["listAgents", "getAgent", "getHome", "bootstrap"].includes(name) &&
          options.runtime
            ? (await options.runtime.getCapabilities()).ready
            : false;
        const roleProjection = (farmId?: string) =>
          roleDirectory(runtimeReady).map((role) => {
            const consent = farmId
              ? store
                  .list("consent", farmId)
                  .map((x) => c.Consent.parse(x))
                  .some(
                    (x) =>
                      x.status === "active" &&
                      x.external_processing &&
                      x.roles.includes(role.key) &&
                      x.fields.includes("conversation"),
                  )
              : false;
            return {
              ...role,
              capabilities: [
                ...role.capabilities.map((cap) =>
                  cap.key === "chat" && runtimeReady && !consent
                    ? {
                        ...cap,
                        status: "needs_information" as const,
                        reason:
                          "Grant external processing of conversation text to this specialist",
                        requirements: ["scoped external-processing consent"],
                      }
                    : cap,
                ),
                ...(role.key === "market"
                  ? [
                      {
                        key: "market_quotes",
                        status:
                          farmId &&
                          store
                            .list("series", farmId)
                            .some((raw) =>
                              c.Series.parse(raw).source_id.startsWith("M"),
                            )
                            ? ("enabled" as const)
                            : ("unavailable" as const),
                        reason:
                          "Only attributable dated imported quotes are supported; live dashboard extraction is unverified",
                        requirements: [
                          "Verified dated market/commodity/grade/unit record",
                        ],
                      },
                    ]
                  : []),
                ...(role.key === "government_support"
                  ? [
                      {
                        key: "public_guidance",
                        status:
                          farmId &&
                          store
                            .list("evidence", farmId)
                            .some((raw) =>
                              c.Evidence.parse(raw).source_id.startsWith("G"),
                            )
                            ? ("enabled" as const)
                            : ("unavailable" as const),
                        reason:
                          "Public source checklists only; current jurisdiction and individual applicability need review",
                        requirements: [
                          "Attributed applicable official document",
                        ],
                      },
                      {
                        key: "individual_eligibility",
                        status: "unavailable" as const,
                        reason:
                          "Beneficiary access, individual eligibility and filing are unverified",
                        requirements: ["Official farmer-specific verification"],
                      },
                    ]
                  : []),
              ],
            };
          });
        const perform = () => {
          if (name === "health") return { status: "ok" };
          if (name === "bootstrap")
            return c.Bootstrap.parse({
              schema_version: c.CONTRACT_VERSION,
              session_token: sessionToken,
              readiness: (
                store.db
                  .prepare(
                    "SELECT count(*) as count FROM records WHERE kind='farm' AND json_extract(payload,'$.setup_complete')=1",
                  )
                  .get() as { count: number }
              ).count
                ? "ready"
                : "setup_required",
              farms: (
                store.db
                  .prepare("SELECT payload FROM records WHERE kind='farm'")
                  .all() as { payload: string }[]
              ).map((row) => c.Farm.parse(JSON.parse(row.payload))),
              settings: farm.execute("getSettings", {}, {}),
              capabilities: roleDirectory()[0]?.capabilities ?? [],
              supported_languages: ["en"],
              supported_units: ["ha", "acre", "mm", "m3", "kg", "INR"],
            });
          if (name === "listAgents") return roleProjection(params.farmId);
          if (name === "getAgent") {
            farm.assertFarm(params.farmId ?? "");
            return roleProjection(params.farmId).find(
              (role) => role.key === params.roleKey,
            );
          }
          if (name === "getHome") {
            const farmId = params.farmId ?? "";
            const profile = farm.assertFarm(farmId);
            const findings = store
              .list("finding", farmId)
              .map((x) => c.Finding.parse(x))
              .map((x) => ({
                ...x,
                freshness:
                  x.freshness.valid_until &&
                  Date.parse(x.freshness.valid_until) < Date.now()
                    ? { ...x.freshness, status: "stale" as const }
                    : x.freshness,
              }));
            const briefing = findings
              .filter((x) => x.role_key === "chief_of_staff")
              .at(-1);
            return c.Home.parse({
              farm: profile,
              sections: {
                briefing: {
                  summary:
                    briefing?.summary ??
                    "Your saved farm context and evidence are ready to review. Ask Sakha to build a proposal; unknown measurements and unavailable sources remain explicit.",
                  freshness: briefing?.freshness ?? {
                    status: "unknown",
                    reason: "No saved Chief of Staff briefing yet",
                  },
                },
                context: farm.listFacts(farmId),
                climate: findings.filter((x) => x.role_key === "climate"),
                weather: findings.filter((x) => x.role_key === "weather"),
                actions: store
                  .list("task", farmId)
                  .map((x) => c.Task.parse(x))
                  .filter((x) => x.status === "pending"),
                agents: roleProjection(farmId),
                plan: domain.plan(farmId),
              },
              alerts: store.list("alert", farmId).map((x) => c.Alert.parse(x)),
              insights: dataServices.insights(farmId),
              capabilities: dataServices.sources().map((x) => x.capability),
            });
          }
          const scope = params.farmId ?? "installation";
          authorize(
            { kind: "farmer", id: "local-session", farmId: scope },
            operation.method === "GET" ? "read" : "write",
            { id: Object.values(params).join(":") || scope, farmId: scope },
            true,
          );
          if (
            ["listSources", "getSource", "getEvidence", "getInsights"].includes(
              name,
            )
          )
            return dataServices.execute(name as c.OperationName, input, params);
          if (
            [
              "requestExport",
              "getExport",
              "requestDeletion",
              "getDeletion",
              "uploadAttachment",
              "getAttachment",
              "deleteAttachment",
            ].includes(name)
          )
            return lifecycle.execute(name as c.OperationName, input, params);
          const coreNames = [
            "Conversation",
            "Messages",
            "Turn",
            "Run",
            "Clarification",
            "Approval",
          ];
          if (coreNames.some((part) => name.includes(part)))
            return core.execute(name as c.OperationName, input, params);
          const domainNames = [
            "Scenario",
            "Finding",
            "Plan",
            "Task",
            "Activity",
            "Alert",
            "Outcome",
          ];
          if (domainNames.some((part) => name.includes(part)))
            return domain.execute(name as c.OperationName, input, params);
          return farm.execute(name as c.OperationName, input, params);
        };
        const key = request.headers["idempotency-key"];
        if (operation.method !== "GET" && typeof key !== "string")
          throw new DomainError(
            "validation",
            "Supply an Idempotency-Key for this command",
          );
        const result =
          operation.method === "GET"
            ? perform()
            : store.command(
                "farmer",
                name,
                params.farmId ?? "installation",
                String(key),
                { input, params },
                () => operation.output.parse(perform()),
              );
        return {
          schema_version: c.CONTRACT_VERSION,
          request_id: request.id,
          data: operation.output.parse(result),
        };
      },
    });
  const services = { store, farm, core, domain, dataServices, lifecycle };
  const execution = createExecution(services, options.runtime);
  if (options.startScheduler) execution.start();
  app.get(
    "/api/v1/farms/:farmId/exports/:jobId/download",
    async (request, reply) => {
      const { farmId, jobId } = z
        .object({ farmId: c.Id, jobId: c.Id })
        .parse(request.params);
      return reply
        .type("application/json")
        .header(
          "content-disposition",
          `attachment; filename="sakha-export-${jobId}.json"`,
        )
        .send(lifecycle.download(farmId, jobId));
    },
  );
  app.register(sse, { heartbeatInterval: 15000 });
  app.register(async (server) => {
    server.get(
      "/api/v1/farms/:farmId/events",
      { sse: "only" },
      async (request, reply) => {
        const { farmId } = z.object({ farmId: c.Id }).parse(request.params);
        farm.assertFarm(farmId);
        let cursor: string | undefined = z
          .object({ cursor: c.Id.optional() })
          .parse(request.query).cursor;
        const headerCursor = request.headers["last-event-id"];
        if (!cursor && typeof headerCursor === "string") cursor = headerCursor;
        if (Array.isArray(cursor))
          throw new DomainError("validation", "Invalid cursor");
        const stream = reply.sse;
        if (!stream) throw new DomainError("internal", "Stream unavailable");
        const send = async () => {
          for (const event of replayEvents(store, farmId, cursor)) {
            await stream.send({ id: event.cursor, data: event });
            cursor = event.cursor;
          }
        };
        await send();
        stream.keepAlive();
        let pending = false;
        const interval = setInterval(() => {
          if (pending) return;
          pending = true;
          void send()
            .catch(() => stream.close())
            .finally(() => {
              pending = false;
            });
        }, 250);
        stream.onClose(() => clearInterval(interval));
      },
    );
  });
  if (options.webDirectory) {
    app.register(fastifyStatic, {
      root: options.webDirectory,
      prefix: "/",
      wildcard: false,
    });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/"))
        return reply.type("text/html").sendFile("index.html");
      return reply
        .code(404)
        .send({ code: "not_found", message: "Route not found" });
    });
  }
  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api/"))
      reply.header("cache-control", "no-store");
    return payload;
  });
  app.addHook("onClose", async () => {
    await execution.stop();
    store.close();
  });
  return { app, ...services, execution, sessionToken };
}
