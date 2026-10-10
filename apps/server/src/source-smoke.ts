import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { boundedFetch, extractRainfall, parseRoni } from "@sakha/data";
import { parseOutlook } from "../../../packages/data/src/climate.js";

const dir = mkdtempSync(join(tmpdir(), "sakha-source-smoke-"));
try {
  const roni = await boundedFetch(
    "https://cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/",
  );
  console.log({
    source: "C01",
    points: parseRoni(new TextDecoder().decode(roni.data)).length,
  });
  for (const kind of ["outlook", "probabilities"] as const) {
    const raw = await boundedFetch(
      `https://cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/${kind}/`,
    );
    console.log({
      source: kind,
      rows: parseOutlook(new TextDecoder().decode(raw.data), kind).rows.length,
    });
  }
  for (const source of [
    {
      id: "W03",
      url: "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/global/cogs/chirps-v3.0.2026.08.cog",
    },
    {
      id: "W04",
      url: "https://data.chc.ucsb.edu/products/CHIRPS-GEFS/v3/daily/global/2026/10/10/c3g_2026.10.11.tif",
    },
  ])
    console.log({
      source: source.id,
      probe_id: randomUUID(),
      explicit_probe_coordinate: { latitude: 20, longitude: 73.8 },
      ...(await extractRainfall(source.url, 73.8, 20, dir)),
    });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
