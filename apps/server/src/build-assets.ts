import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";

mkdirSync("apps/server/dist/apps/server/migrations", { recursive: true });
cpSync("apps/server/migrations", "apps/server/dist/apps/server/migrations", {
  recursive: true,
});
cpSync("policies", "apps/server/dist/policies", { recursive: true });
for (const name of readdirSync("packages")) {
  rmSync(`packages/${name}/dist`, { recursive: true, force: true });
  cpSync(`apps/server/dist/packages/${name}/src`, `packages/${name}/dist`, {
    recursive: true,
  });
}
cpSync("apps/web/dist", "apps/server/dist/apps/web/dist", { recursive: true });

cpSync("demo", "apps/server/dist/demo", { recursive: true });
