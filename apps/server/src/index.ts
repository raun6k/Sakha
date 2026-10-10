import { join } from "node:path";
import envPaths from "env-paths";
import { createApp } from "./app.js";

const { app } = createApp({
  databasePath:
    process.env.SAKHA_DATABASE_PATH ??
    join(envPaths("sakha", { suffix: "" }).data, "sakha.sqlite"),
  logger: true,
});
await app.listen({
  host: "127.0.0.1",
  port: Number(process.env.SAKHA_PORT ?? 4310),
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    app.close().catch(() => {
      process.exitCode = 1;
    });
  });
