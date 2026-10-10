import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { roleDirectory } from "@sakha/agents-farming";
import * as c from "@sakha/contracts";
import { authorize, createCoreServices } from "@sakha/core";
import {
  createDomainServices,
  createFarmServices,
  DomainError,
} from "@sakha/farm";
import Fastify from "fastify";
import { z } from "zod";
import { Storage } from "./storage/database.js";
export function createApp(options: {
  databasePath: string;
  logger?: boolean;
  origin?: string;
  devOrigins?: string[];
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
  const sessionToken = randomBytes(32).toString("hex");
  const origin = options.origin ?? "http://127.0.0.1:4310";
  const allowedOrigins = new Set([origin, ...(options.devOrigins ?? [])]);
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 14_000_000,
  });
  app.addHook("onRequest", async (request) => {
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
        const perform = () => {
          if (name === "health") return { status: "ok" };
          if (name === "bootstrap")
            return c.Bootstrap.parse({
              schema_version: c.CONTRACT_VERSION,
              session_token: sessionToken,
              readiness: (
                store.db
                  .prepare(
                    "SELECT count(*) as count FROM records WHERE kind='farm'",
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
          if (name === "listAgents") return roleDirectory();
          if (name === "getAgent") {
            farm.assertFarm(params.farmId ?? "");
            return roleDirectory().find((role) => role.key === params.roleKey);
          }
          const scope = params.farmId ?? "installation";
          authorize(
            { kind: "farmer", id: "local-session", farmId: scope },
            operation.method === "GET" ? "read" : "write",
            { id: Object.values(params).join(":") || scope, farmId: scope },
            true,
          );
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
  app.addHook("onClose", async () => store.close());
  return { app, store, farm, core, sessionToken };
}
