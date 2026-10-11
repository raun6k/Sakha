import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Runtime } from "@sakha/core";
import { CodexRuntime } from "@sakha/runtime-codex";
import { StrandsRuntime } from "@sakha/runtime-strands";
import envPaths from "env-paths";
import { createApp } from "./app.js";
import { lockDatabase } from "./process-lock.js";

const configured = (key: string) => process.env[key]?.trim() || undefined;
const port = Number(configured("SAKHA_PORT") ?? 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("SAKHA_PORT must be an integer between1024 and65535");
const databasePath =
  configured("SAKHA_DATABASE_PATH") ??
  join(envPaths("sakha", { suffix: "" }).data, "sakha.sqlite");
mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
const unlock = lockDatabase(databasePath);
let runtime: Runtime | undefined;
const development = import.meta.url.endsWith(".ts");
if (process.env.SAKHA_CODEX_ENABLED === "true")
  runtime = new CodexRuntime({
    enabled: true,
    model: configured("SAKHA_CODEX_MODEL"),
    bridgeEntrypoint: fileURLToPath(
      new URL(
        development ? "./mcp-bridge.ts" : "./mcp-bridge.js",
        import.meta.url,
      ),
    ),
    loaderPath: development
      ? fileURLToPath(import.meta.resolve("tsx"))
      : undefined,
  });
else
  runtime = new StrandsRuntime({
    model: configured("SAKHA_OPENAI_MODEL") ?? "",
    apiKey: configured("OPENAI_API_KEY"),
    keyringAccount: configured("SAKHA_OPENAI_KEYRING_ACCOUNT"),
  });
const webDirectory = fileURLToPath(new URL("../../web/dist/", import.meta.url));
let app: ReturnType<typeof createApp>["app"];
try {
  ({ app } = createApp({
    databasePath,
    logger: true,
    origin: `http://127.0.0.1:${port}`,
    devOrigins: development ? ["http://127.0.0.1:5173"] : [],
    runtime,
    startScheduler: true,
    webDirectory: existsSync(webDirectory) ? webDirectory : undefined,
  }));
} catch (error) {
  unlock();
  throw error;
}
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try {
    await app.close();
  } finally {
    unlock();
  }
}
try {
  await app.listen({ host: "127.0.0.1", port });
} catch (error) {
  await close();
  throw error;
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void close().then(
      () => process.exit(0),
      () => {
        process.exitCode = 1;
      },
    );
  });
