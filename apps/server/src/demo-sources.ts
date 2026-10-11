import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as c from "@sakha/contracts";
import type { createDataServices } from "@sakha/data";
import { assertSourceUrl, DocumentImport } from "@sakha/data";
import type { createFarmServices } from "@sakha/farm";
import { DomainError } from "@sakha/farm";
import { z } from "zod";
import type { Storage } from "./storage/database.js";

const Snapshot = z.object({
  version: z.literal("sakha.demo-sources.v1"),
  captured_at: c.Timestamp,
  location: c.Location,
  series: z.array(
    z.object({
      series: c.Series.omit({ id: true, snapshot_id: true, evidence_id: true }),
      evidence: c.Evidence.omit({
        id: true,
        farm_id: true,
        version: true,
        created_at: true,
        updated_at: true,
        snapshot_id: true,
      }),
    }),
  ),
  documents: z.array(
    z.object({
      input: DocumentImport,
      original_pdf_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
  artifacts: z.array(
    z.object({
      file: z.string().regex(/^[a-f0-9]{64}\.(html|txt|json|range)$/),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});
export function importDemoSources(
  services: {
    store: Storage;
    farm: ReturnType<typeof createFarmServices>;
    dataServices: ReturnType<typeof createDataServices>;
  },
  farmId: string,
  directory = new URL("../../../demo/sources/", import.meta.url),
) {
  const snapshot = Snapshot.parse(
    JSON.parse(readFileSync(new URL("snapshot.json", directory), "utf8")),
  );
  const farm = services.farm.assertFarm(farmId);
  if (services.store.get("demo_sources", "bundled.demo.v1", farmId))
    return { series: 0, documents: 0, captured_at: snapshot.captured_at };
  if (
    farm.location?.latitude !== snapshot.location.latitude ||
    farm.location?.longitude !== snapshot.location.longitude
  )
    throw new DomainError(
      "scope_denied",
      "Demo source snapshot belongs to a different location point",
    );
  const artifacts = snapshot.artifacts.map((artifact) => {
    const raw = readFileSync(new URL(artifact.file, directory));
    if (createHash("sha256").update(raw).digest("hex") !== artifact.sha256)
      throw new DomainError(
        "validation",
        "Bundled source artifact checksum mismatch",
      );
    return { raw, hash: artifact.sha256 };
  });
  const saved = services.store.transaction(() => {
    for (const artifact of artifacts)
      services.dataServices.persistArtifact(artifact.raw, artifact.hash);
    const series = snapshot.series.map((item) => {
      if (!item.evidence.url)
        throw new DomainError("validation", "Bundled source URL is required");
      assertSourceUrl(item.evidence.url);
      if (
        item.series.grid &&
        (item.series.grid.latitude !== snapshot.location.latitude ||
          item.series.grid.longitude !== snapshot.location.longitude)
      )
        throw new DomainError(
          "scope_denied",
          "Source series grid differs from bundled demonstration point",
        );
      return services.dataServices.persistSeries(
        farmId,
        { ...item.series, origin: "imported_source" },
        { ...item.evidence, origin: "imported_source" },
      );
    });
    const documents = snapshot.documents.map((doc) =>
      services.dataServices.importDocument(farmId, doc.input),
    );
    return { series, documents };
  });
  const evidenceFor = (id: string) =>
    c.Evidence.parse(services.store.get("evidence", id, farmId));
  const ref = (e: c.Evidence) => ({
    source_id: e.source_id,
    snapshot_id: e.snapshot_id,
    evidence_id: e.id,
    method_version: e.method_version,
  });
  const weather = saved.documents.find((doc) => doc.source_id === "W01");
  if (weather)
    services.store.put(
      "finding",
      c.Finding.parse({
        ...services.farm.makeBase(farmId),
        role_key: "megha",
        title: "Dry district forecast",
        summary:
          "IMD lists no rain for Nagpur, 10–16 October. District forecast; field conditions can differ.",
        evidence: [ref(weather)],
        assumptions: [],
        missing_inputs: [],
        constraints: [],
        freshness: {
          status: "fresh",
          retrieved_at: weather.retrieved_at,
          valid_until: weather.valid_until,
        },
        origin: "imported_source",
      }),
    );
  const roni = saved.series.find((item) => item.source_id === "C01");
  const latest = roni?.points.filter((point) => point.value !== null).at(-1);
  if (roni && latest)
    services.store.put(
      "finding",
      c.Finding.parse({
        ...services.farm.makeBase(farmId),
        role_key: "megha",
        title: `Pacific index ${latest.value !== null && latest.value >= 0 ? "+" : ""}${latest.value} °C`,
        summary: `Latest published second NOAA Pacific index, ${new Date(latest.time).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })}. A climate indicator, not a local rainfall prediction.`,
        evidence: [ref(evidenceFor(roni.evidence_id ?? ""))],
        assumptions: [],
        missing_inputs: [],
        constraints: [],
        freshness: roni.freshness,
        origin: "derived_calculation",
      }),
    );
  services.store.put("demo_sources", {
    ...services.farm.makeBase(farmId),
    id: "bundled.demo.v1",
    captured_at: snapshot.captured_at,
  });
  return {
    series: saved.series.length,
    documents: saved.documents.length,
    captured_at: snapshot.captured_at,
  };
}
