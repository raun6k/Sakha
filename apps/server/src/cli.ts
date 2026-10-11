import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { importMarketQuote, refreshCoreEvidence } from "@sakha/data";
import envPaths from "env-paths";
import { createApp } from "./app.js";
import { initializeDemo, resetDemo, seedDemo } from "./demo.js";
import { importDemoSources } from "./demo-sources.js";
import { lockDatabase } from "./process-lock.js";

const paths = envPaths("sakha", { suffix: "" });
const [command, farmId, arg, extra] = process.argv.slice(2);
const databasePath =
  (process.env.SAKHA_DATABASE_PATH?.trim() || undefined) ??
  (command === "seed"
    ? join(process.cwd(), ".local/demo/sakha.sqlite")
    : join(paths.data, "sakha.sqlite"));
mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
const unlock = lockDatabase(databasePath);
let services: ReturnType<typeof createApp>;
try {
  services = createApp({ databasePath });
} catch (error) {
  unlock();
  throw error;
}
const { app, store, farm, dataServices } = services;
try {
  if (command === "seed") {
    const seeded = await seedDemo(services, {
      live: process.env.SAKHA_SEED_LIVE !== "0",
    });
    console.log(
      JSON.stringify({
        farm_id: seeded.profile.id,
        name: seeded.profile.name,
        village: seeded.profile.location?.village,
        district: seeded.profile.location?.district,
        database: databasePath,
        demo: true,
        sources: seeded.sources,
        adapters: seeded.adapters,
        rain_7d_mm: seeded.cache.brief.forecast_rain_7d_mm,
        modal_inr: seeded.cache.brief.modal_inr,
        benefit_inr: seeded.cache.recommendation.benefit_inr,
      }),
    );
  } else if (command === "demo" && ["init", "reset"].includes(farmId ?? "")) {
    if (!process.env.SAKHA_DATABASE_PATH?.trim())
      throw new Error(
        "Set SAKHA_DATABASE_PATH to a dedicated demo database before initializing or resetting demo records",
      );
    const profile =
      farmId === "reset" ? resetDemo(services) : initializeDemo(services);
    const sources = importDemoSources(services, profile.id);
    console.log(
      JSON.stringify({
        farm_id: profile.id,
        name: profile.name,
        demo: true,
        sources,
      }),
    );
  } else if (command === "farms") {
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
            historicalDays: arg ? Number(arg) : 30,
            forecastDays: extra ? Number(extra) : 7,
          },
        ),
        null,
        2,
      ),
    );
  } else if (command === "market-import" && farmId && arg && extra) {
    console.log(
      JSON.stringify(
        importMarketQuote(
          dataServices,
          farmId,
          JSON.parse(readFileSync(arg, "utf8")),
          readFileSync(extra),
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
      "Usage: pnpm seed:demo | pnpm operator demo init|reset (explicit SAKHA_DATABASE_PATH) | farms | refresh FARM_ID [HISTORICAL_DAYS=30] [FORECAST_DAYS=7] | import FARM_ID CURATED_JSON RAW_PDF | market-import FARM_ID QUOTE_JSON RAW_SOURCE",
    );
} finally {
  try {
    await app.close();
  } finally {
    unlock();
  }
}
