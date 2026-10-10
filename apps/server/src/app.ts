import { randomUUID } from "node:crypto";
import * as c from "@sakha/contracts";
import { createFarmServices, DomainError } from "@sakha/farm";
import Fastify from "fastify";
import { z } from "zod";
import { Storage } from "./storage/database.js";
export function createApp(options: { databasePath: string; logger?: boolean }) {
  const store = new Storage(options.databasePath);
  const farm = createFarmServices(store, randomUUID, () =>
    new Date().toISOString(),
  );
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 14_000_000,
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
  return { app, store, farm };
}
