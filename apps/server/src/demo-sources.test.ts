import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as c from "@sakha/contracts";
import { afterEach, expect, it } from "vitest";
import { createApp } from "./app.js";
import { initializeDemo } from "./demo.js";
import { importDemoSources } from "./demo-sources.js";

const apps: ReturnType<typeof createApp>[] = [];
const directories: string[] = [];
const context = () => {
  const services = createApp({ databasePath: ":memory:" });
  apps.push(services);
  return { services, farm: initializeDemo(services) };
};
afterEach(async () => {
  for (const services of apps.splice(0)) await services.app.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
it("imports dated official snapshots offline once with complete rainfall coverage", () => {
  const { services, farm } = context();
  const result = importDemoSources(services, farm.id);
  expect(result.series).toBe(9);
  expect(result.documents).toBe(2);
  const series = services.store
    .list("series", farm.id)
    .map((s) => c.Series.parse(s));
  const rainfall = series.find((s) => s.source_id === "W03");
  expect(rainfall?.points).toHaveLength(12);
  expect(rainfall?.points.every((p) => p.value !== null)).toBe(true);
  expect(rainfall?.grid?.latitude).toBe(farm.location?.latitude);
  expect(series.find((s) => s.source_id === "W04")?.points).toHaveLength(7);
  const evidence = services.store
    .list("evidence", farm.id)
    .map((e) => c.Evidence.parse(e));
  expect(
    evidence.every((e) => e.origin === "imported_source" && Boolean(e.url)),
  ).toBe(true);
  expect(evidence.find((e) => e.source_id === "W01")?.issued_at).toBe(
    "2026-10-10T12:16:00+05:30",
  );
  expect(importDemoSources(services, farm.id).series).toBe(0);
  expect(services.store.list("evidence", farm.id)).toHaveLength(
    evidence.length,
  );
});
it("rejects a different location rather than assigning the demo rainfall to it", () => {
  const { services } = context();
  const other = c.Farm.parse(
    services.farm.execute(
      "createFarm",
      {
        name: "Other",
        location: {
          country: "India",
          state: "Maharashtra",
          district: "Pune",
          latitude: 18.52,
          longitude: 73.85,
        },
      },
      {},
    ),
  );
  expect(() => importDemoSources(services, other.id)).toThrow(
    "different location point",
  );
  expect(services.store.list("evidence", other.id)).toHaveLength(0);
});
it("rejects tampered source bytes before storing any evidence", () => {
  const { services, farm } = context();
  const directory = mkdtempSync(join(tmpdir(), "sakha-snapshot-"));
  directories.push(directory);
  const snapshot = JSON.parse(
    readFileSync(
      new URL("../../../demo/sources/snapshot.json", import.meta.url),
      "utf8",
    ),
  ) as { artifacts: { file: string; sha256: string }[] };
  const first = snapshot.artifacts[0];
  if (!first) throw new Error("Source bundle must contain artifacts");
  expect(createHash("sha256").update("tampered").digest("hex")).not.toBe(
    first.sha256,
  );
  writeFileSync(join(directory, "snapshot.json"), JSON.stringify(snapshot));
  writeFileSync(join(directory, first.file), "tampered");
  expect(() =>
    importDemoSources(services, farm.id, pathToFileURL(`${directory}/`)),
  ).toThrow("checksum mismatch");
  expect(services.store.list("evidence", farm.id)).toHaveLength(0);
});
