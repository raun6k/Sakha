import Fastify from "fastify";
export function createServer() {
  const server = Fastify({ logger: true });
  server.get("/api/v1/health", async () => ({
    schema_version: "sakha.v1",
    request_id: "health",
    data: { status: "ok" },
  }));
  return server;
}
if (process.env.NODE_ENV !== "test") {
  const server = createServer();
  server
    .listen({ host: "127.0.0.1", port: Number(process.env.SAKHA_PORT ?? 4310) })
    .catch((error) => {
      server.log.error(error);
      process.exitCode = 1;
    });
}
