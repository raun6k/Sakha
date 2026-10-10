import { cpSync, mkdirSync } from "node:fs";

mkdirSync("apps/server/dist/apps/server/migrations", { recursive: true });
cpSync("apps/server/migrations", "apps/server/dist/apps/server/migrations", {
  recursive: true,
});
cpSync("policies", "apps/server/dist/policies", { recursive: true });
