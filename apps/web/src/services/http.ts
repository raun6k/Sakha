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
export function createHttpService(fetcher: typeof fetch = fetch): SakhaService {
  let token: string | undefined;
  return {
    async execute<K extends OperationName>(
      name: K,
      request: ServiceRequest<K>,
    ): Promise<OperationOutput<K>> {
      const op = operations[name];
      const { url, input } = operationUrl(name, request);
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers["X-Sakha-Session"] = token;
      if (op.method !== "GET") {
        headers["Content-Type"] = "application/json";
        if (!request.command)
          throw new Error("A command identity is required.");
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
        const parsed = ApiError.safeParse(json);
        const nested =
          typeof json === "object" && json !== null && "error" in json
            ? ApiError.safeParse(json.error)
            : undefined;
        throw new ServiceError(
          parsed.success
            ? parsed.data
            : nested?.success
              ? nested.data
              : {
                  code: "internal",
                  message: `The request failed (${response.status}).`,
                  retryable: response.status >= 500,
                  request_id: "response",
                },
        );
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
    },
    subscribe(farmId, cursor, onEvent, onError) {
      const controller = new AbortController();
      let last = cursor;
      let retry = 500;
      const reconnect = async () => {
        while (!controller.signal.aborted) {
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
            if (!response.ok || !response.body)
              throw new Error("Event connection unavailable");
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            retry = 500;
            while (!controller.signal.aborted) {
              const chunk = await reader.read();
              if (chunk.done) break;
              buffer += decoder
                .decode(chunk.value, { stream: true })
                .replaceAll("\r\n", "\n");
              let end: number;
              while ((end = buffer.indexOf("\n\n")) >= 0) {
                const block = buffer.slice(0, end);
                buffer = buffer.slice(end + 2);
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
          } catch (error) {
            if (controller.signal.aborted) break;
            onError({
              code: "unavailable",
              message:
                "Live updates disconnected. Reconnecting without resending your question.",
              retryable: true,
              request_id: "stream",
            });
          }
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, retry);
            controller.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
          });
          retry = Math.min(retry * 2, 10000);
        }
      };
      void reconnect();
      return () => controller.abort();
    },
  };
}
