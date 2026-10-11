import { createHash } from "node:crypto";
import * as c from "@sakha/contracts";
import type { createDataServices } from "@sakha/data";
import {
  buildTeamSeed,
  type DemoCache,
  isIndianFarmLocation,
  loadDemoCache,
  type PreparedSeries,
} from "@sakha/data";
import type { createFarmServices } from "@sakha/farm";
import { DomainError } from "@sakha/farm";
import type { Storage } from "./storage/database.js";

const MARKER = "cache.v1";

type Services = {
  store: Storage;
  farm: ReturnType<typeof createFarmServices>;
  dataServices: ReturnType<typeof createDataServices>;
};

function evidenceFor(series: PreparedSeries) {
  const hash = createHash("sha256")
    .update(JSON.stringify(series.points))
    .digest("hex");
  const from = series.points[0]?.time;
  const to = series.points.at(-1)?.time;
  if (!from || !to)
    throw new DomainError("validation", "Adapter series has no points");
  const stale = series.source_id === "M01" && !series.live;
  return {
    series: {
      source_id: series.source_id,
      method_version: series.method_version,
      variable: series.variable,
      unit: series.unit,
      kind: series.kind,
      geography: series.geography,
      resolution: "farm location",
      supported_range: { from, to },
      freshness: {
        status: stale ? ("stale" as const) : ("fresh" as const),
        retrieved_at: series.fetched_at,
        reason: stale
          ? "Mandi row is the committed cache, not a live data.gov.in response"
          : undefined,
      },
      completeness: series.points.some((point) => point.value === null)
        ? ("partial" as const)
        : ("complete" as const),
      points: series.points,
      origin: series.live
        ? ("live_source" as const)
        : ("imported_source" as const),
    },
    evidence: {
      source_id: series.source_id,
      title: series.title,
      text: series.text,
      url: series.url,
      retrieved_at: series.fetched_at,
      geography: series.geography,
      unit: series.unit,
      kind:
        series.kind === "forecast"
          ? ("forecast" as const)
          : ("observation" as const),
      origin: series.live
        ? ("live_source" as const)
        : ("imported_source" as const),
      hash,
      hash_kind: "full_artifact_sha256" as const,
      method_version: series.method_version,
      citation: { section: series.title },
    },
  };
}

export function importAdapterCache(
  services: Services,
  farmId: string,
  cache?: DemoCache,
) {
  const profile = services.farm.assertFarm(farmId);
  const latitude = profile.location?.latitude;
  const longitude = profile.location?.longitude;
  if (
    latitude === undefined ||
    longitude === undefined ||
    !isIndianFarmLocation(latitude, longitude)
  )
    return { series: 0, findings: 0 };
  if (services.store.get("adapter_cache", MARKER, farmId))
    return { series: 0, findings: 0 };
  let loaded: DemoCache;
  try {
    loaded =
      cache ??
      loadDemoCache({
        latitude,
        longitude,
      });
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.code === "unavailable" || error.code === "validation")
    )
      return { series: 0, findings: 0 };
    throw error;
  }
  const saved = services.store.transaction(() =>
    loaded.series.map((item) => {
      const prepared = evidenceFor(item);
      return services.dataServices.persistSeries(
        farmId,
        prepared.series,
        prepared.evidence,
      );
    }),
  );
  const seed = buildTeamSeed(loaded, c.RoleKey.options);
  const bySource = (sourceId: string, variable?: string) =>
    saved.find(
      (item, index) =>
        item.source_id === sourceId &&
        (!variable || loaded.series[index]?.variable === variable),
    );
  let findings = 0;
  for (const draft of seed.findings) {
    const match =
      draft.source_id === "W05"
        ? bySource("W05", "forecast_rainfall")
        : bySource(draft.source_id);
    const evidence = match?.evidence_id
      ? [
          {
            evidence_id: match.evidence_id,
            source_id: match.source_id,
            snapshot_id: match.snapshot_id,
            method_version: match.method_version,
          },
        ]
      : [];
    const stamp = new Date(Date.now() + 120_000).toISOString();
    services.store.put(
      "finding",
      c.Finding.parse({
        ...services.farm.makeBase(farmId),
        role_key: draft.role_key,
        title: draft.title,
        summary: draft.summary,
        evidence,
        assumptions: draft.assumptions,
        missing_inputs: [],
        constraints: [],
        freshness: {
          status: "fresh",
          retrieved_at: loaded.forecast.fetched_at,
        },
        origin: "derived_calculation",
        created_at: stamp,
        updated_at: stamp,
      }),
    );
    findings += 1;
  }
  services.store.put("adapter_cache", {
    ...services.farm.makeBase(farmId),
    id: MARKER,
    fetched_at: loaded.forecast.fetched_at,
  });
  return { series: saved.length, findings };
}
