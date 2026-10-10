import {
  ApiError,
  Event,
  envelope,
  type OperationName,
  type OperationOutput,
  operations,
  type SakhaService,
  type ServiceRequest,
} from "@sakha/contracts";
export class ServiceError extends Error {
  constructor(public detail: ApiError) {
    super(detail.message);
    this.name = "ServiceError";
  }
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The request could not be completed. Try again.";
}
export function commandKey() {
  return crypto.randomUUID();
}
export function operationUrl<K extends OperationName>(
  name: K,
  request: ServiceRequest<K>,
) {
  const op = operations[name];
  const input = op.input.parse(request.input);
  let path = op.path;
  for (const [key, value] of Object.entries(request.params ?? {}))
    path = path.replace(`:${key}`, encodeURIComponent(value));
  if (/:[a-zA-Z]/.test(path)) throw new Error("Missing resource identifier.");
  const query = new URLSearchParams();
  if (op.method === "GET")
    for (const [key, value] of Object.entries(input))
      if (value !== undefined)
        query.set(
          key,
          typeof value === "string" ? value : JSON.stringify(value),
        );
  if (request.cursor) query.set("cursor", request.cursor);
  if (request.limit) query.set("limit", String(request.limit));
  return { url: `/api/v1${path}${query.size ? `?${query}` : ""}`, input };
}
function responseError(json: unknown, status: number): ApiError {
  const parsed = ApiError.safeParse(json);
  const nested =
    typeof json === "object" && json !== null && "error" in json
      ? ApiError.safeParse(json.error)
      : undefined;
  return parsed.success
    ? parsed.data
    : nested?.success
      ? nested.data
      : {
          code: "internal",
          message: `The request failed (${status}).`,
          retryable: status >= 500,
          request_id: "response",
        };
}
export function createHttpService(fetcher: typeof fetch = fetch): SakhaService {
  let token: string | undefined;
  let renewal: Promise<void> | undefined;
  async function renew() {
    if (!renewal)
      renewal = (async () => {
        await execute("bootstrap", { input: {} }, false);
      })().finally(() => {
        renewal = undefined;
      });
    return renewal;
  }
  async function execute<K extends OperationName>(
    name: K,
    request: ServiceRequest<K>,
    retrySession = true,
  ): Promise<OperationOutput<K>> {
    const op = operations[name];
    const { url, input } = operationUrl(name, request);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers["X-Sakha-Session"] = token;
    if (op.method !== "GET") {
      headers["Content-Type"] = "application/json";
      if (!request.command) throw new Error("A command identity is required.");
      headers["Idempotency-Key"] = request.command.idempotency_key;
    }
    let response: Response;
    try {
      response = await fetcher(url, {
        method: op.method,
        headers,
        body: op.method === "GET" ? undefined : JSON.stringify(input),
        credentials: "same-origin",
      });
    } catch {
      throw new ServiceError({
        code: "unavailable",
        message:
          "The local Sakha backend cannot be reached. Start it and try again. Monitoring is paused.",
        retryable: true,
        request_id: "connection",
      });
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new Error("The local service returned an unreadable response.");
    }
    if (!response.ok) {
      const detail = responseError(json, response.status);
      if (
        detail.code === "permission_denied" &&
        detail.details?.session_expired === true &&
        name !== "bootstrap" &&
        retrySession
      ) {
        await renew();
        if (op.method === "GET") return execute(name, request, false);
        throw new ServiceError({
          ...detail,
          message:
            "Sakha restarted. The local session was restored. Review and retry this action; it has not been resubmitted automatically.",
          retryable: true,
        });
      }
      throw new ServiceError(detail);
    }
    const result = envelope(op.output).parse(json).data;
    if (
      name === "bootstrap" &&
      typeof result === "object" &&
      result !== null &&
      "session_token" in result
    )
      token = String(result.session_token);
    return result as OperationOutput<K>;
  }
  return {
    execute,
    subscribe(farmId, cursor, onEvent, onError, onConnection) {
      const controller = new AbortController();
      let last = cursor;
      let retry = 500;
      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            controller.signal.removeEventListener("abort", finish);
            resolve();
          };
          const timer = setTimeout(finish, ms);
          controller.signal.addEventListener("abort", finish, { once: true });
        });
      const reconnect = async () => {
        while (!controller.signal.aborted) {
          onConnection?.("connecting");
          try {
            const headers: Record<string, string> = {
              Accept: "text/event-stream",
            };
            if (token) headers["X-Sakha-Session"] = token;
            if (last) headers["Last-Event-ID"] = last;
            const response = await fetcher(
              `/api/v1/farms/${encodeURIComponent(farmId)}/events`,
              {
                headers,
                signal: controller.signal,
                credentials: "same-origin",
              },
            );
            if (!response.ok) {
              const detail = responseError(
                await response.json(),
                response.status,
              );
              if (
                detail.details?.session_expired === true &&
                detail.code === "permission_denied"
              )
                await renew();
              throw new ServiceError(detail);
            }
            if (!response.body) throw new Error("Event connection unavailable");
            onConnection?.("connected");
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            retry = 500;
            try {
              while (!controller.signal.aborted) {
                const chunk = await reader.read();
                if (chunk.done) break;
                buffer = (
                  buffer + decoder.decode(chunk.value, { stream: true })
                ).replaceAll("\r\n", "\n");
                if (buffer.length > 2_000_000)
                  throw new Error("Event frame too large");
                let end = buffer.indexOf("\n\n");
                while (end >= 0) {
                  const block = buffer.slice(0, end);
                  buffer = buffer.slice(end + 2);
                  end = buffer.indexOf("\n\n");
                  const data = block
                    .split("\n")
                    .filter((line) => line.startsWith("data:"))
                    .map((line) => line.slice(5).trimStart())
                    .join("\n");
                  if (!data) continue;
                  const event = Event.parse(JSON.parse(data));
                  if (event.farm_id !== farmId) continue;
                  last = event.cursor;
                  onEvent(event);
                }
              }
            } finally {
              await reader.cancel().catch(() => undefined);
              reader.releaseLock();
            }
            if (!controller.signal.aborted)
              throw new Error("Event stream closed");
          } catch {
            if (controller.signal.aborted) break;
            onConnection?.("disconnected");
            onError({
              code: "unavailable",
              message:
                "Live updates disconnected. Reconnecting without resending your question.",
              retryable: true,
              request_id: "stream",
            });
          }
          await wait(retry);
          retry = Math.min(retry * 2, 10000);
        }
      };
      void reconnect();
      return () => controller.abort();
    },
  };
}
