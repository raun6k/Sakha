import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { refreshCoreEvidence } from "@sakha/data";
import envPaths from "env-paths";
import { createApp } from "./app.js";

const paths = envPaths("sakha", { suffix: "" });
const { app, store, farm, dataServices } = createApp({
  databasePath:
    process.env.SAKHA_DATABASE_PATH ?? join(paths.data, "sakha.sqlite"),
});
const [command, farmId, arg, extra] = process.argv.slice(2);
try {
  if (command === "farms") {
    console.log(
      JSON.stringify(
        store.db
          .prepare(
            "SELECT id,json_extract(payload,'$.name') as name FROM records WHERE kind='farm'",
          )
          .all(),
        null,
        2,
      ),
    );
  } else if (command === "refresh" && farmId) {
    const profile = farm.assertFarm(farmId);
    const location =
      profile.location?.latitude !== undefined &&
      profile.location.longitude !== undefined
        ? {
            latitude: profile.location.latitude,
            longitude: profile.location.longitude,
          }
        : undefined;
    console.log(
      JSON.stringify(
        await refreshCoreEvidence(
          dataServices,
          farmId,
          location,
          join(paths.data, "source-artifacts"),
          {
            months: arg ? Number(arg) : 12,
            forecastDays: extra ? Number(extra) : 7,
          },
        ),
        null,
        2,
      ),
    );
  } else if (command === "import" && farmId && arg) {
    const input: unknown = JSON.parse(readFileSync(arg, "utf8"));
    const original = extra ? readFileSync(extra) : undefined;
    const record = dataServices.importDocument(farmId, input, original);
    if (extra) {
      const raw = readFileSync(extra);
      const hash = createHash("sha256").update(raw).digest("hex");
      if (hash !== record.hash)
        throw new Error(
          "Raw source artifact hash does not match curated import",
        );
      const artifactDir = join(paths.data, "source-artifacts");
      mkdirSync(artifactDir, { recursive: true, mode: 0o700 });
      copyFileSync(extra, join(artifactDir, `${hash}.pdf`));
    }
    console.log(
      JSON.stringify({
        evidence_id: record.id,
        source_id: record.source_id,
        origin: record.origin,
      }),
    );
  } else
    throw new Error(
      "Usage: pnpm operator farms | refresh FARM_ID [MONTHS=12] [FORECAST_DAYS=7] | import FARM_ID CURATED_JSON [RAW_PDF]",
    );
} finally {
  await app.close();
}
