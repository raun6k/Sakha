import { createHash, randomUUID } from "node:crypto";
import { createDataServices } from "@sakha/data";
import { createFarmServices } from "@sakha/farm";
import { expect, it } from "vitest";
import { Storage } from "./database.js";

it("projects latest immutable series, ages freshness and records refresh failure without replacing evidence", () => {
  const store = new Storage(":memory:");
  let time = "2026-10-10T00:00:00Z";
  const now = () => time;
  const farm = createFarmServices(store, randomUUID, now);
  const profile = farm.execute("createFarm", { name: "Farm" }, {}) as {
    id: string;
  };
  const data = createDataServices(store, farm.makeBase, farm.assertFarm, now);
  const input = {
    source_id: "C01",
    method_version: "test.v1",
    variable: "RONI",
    unit: "degC",
    kind: "observed" as const,
    geography: "Pacific",
    resolution: "3month",
    supported_range: { from: time, to: time },
    freshness: {
      status: "fresh" as const,
      retrieved_at: time,
      valid_until: "2026-10-11T00:00:00Z",
    },
    completeness: "complete" as const,
    points: [{ time, value: 1 }],
    origin: "live_source" as const,
  };
  const evidence = {
    source_id: "C01",
    title: "Test source",
    text: "Test metadata",
    retrieved_at: time,
    geography: "Pacific",
    kind: "observation" as const,
    origin: "live_source" as const,
    hash: "test-sha256",
    method_version: "test.v1",
    citation: {},
  };
  data.persistSeries(profile.id, input, evidence);
  data.persistSeries(
    profile.id,
    { ...input, points: [{ time, value: 2 }] },
    evidence,
  );
  expect(store.list("series", profile.id)).toHaveLength(2);
  expect(data.insights(profile.id).series).toHaveLength(1);
  expect(data.insights(profile.id).series[0]?.points[0]?.value).toBe(2);
  time = "2026-10-12T00:00:00Z";
  expect(data.insights(profile.id).series[0]?.freshness.status).toBe("stale");
  data.markSourceFailure("C01", "Network unavailable");
  expect(data.sources().find((x) => x.id === "C01")?.capability.status).toBe(
    "degraded",
  );
  expect(data.insights(profile.id).series[0]?.points[0]?.value).toBe(2);
  store.close();
});
it("verifies original document artifact hash before atomic snapshot/evidence/applicability writes", () => {
  const store = new Storage(":memory:");
  const now = () => new Date().toISOString();
  const farm = createFarmServices(store, randomUUID, now);
  const profile = farm.execute("createFarm", { name: "Farm" }, {}) as {
    id: string;
  };
  const data = createDataServices(store, farm.makeBase, farm.assertFarm, now);
  const bytes = new TextEncoder().encode("Original public document");
  const input = {
    source_id: "A01",
    url: "https://www.icar-crida.res.in/document.pdf",
    title: "Historic district guidance",
    text: "Curated paraphrase",
    geography: "Nagpur district",
    hash: createHash("sha256").update(bytes).digest("hex"),
    origin: "imported_source",
    definition: "Historical document; current prescription must be rechecked",
    crops: ["soybean"],
  };
  expect(() =>
    data.importDocument(profile.id, input, new TextEncoder().encode("wrong")),
  ).toThrow("hash");
  expect(store.list("evidence", profile.id)).toHaveLength(0);
  const evidence = data.importDocument(profile.id, input, bytes);
  expect(
    store.get("source_snapshot", evidence.snapshot_id, "public"),
  ).toBeDefined();
  expect(evidence.content_hash).not.toBe(evidence.hash);
  store.close();
});
