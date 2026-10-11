import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFarmServices } from "@sakha/farm";
import { describe, expect, it } from "vitest";
import { Storage } from "./database.js";

const now = () => new Date().toISOString();
function context(path = ":memory:") {
  const store = new Storage(path);
  return { store, services: createFarmServices(store, randomUUID, now) };
}
describe("authoritative farm storage", () => {
  it("migrates, persists setup with skipped facts and reopens", () => {
    const dir = mkdtempSync(join(tmpdir(), "sakha-test-"));
    const path = join(dir, "state.sqlite");
    const { store, services } = context(path);
    const farm = services.execute("createFarm", { name: "Test" }, {}) as {
      id: string;
    };
    services.execute(
      "completeSetup",
      { expected_version: 1, facts: [] },
      { farmId: farm.id },
    );
    store.close();
    const restarted = context(path);
    expect(
      restarted.services.execute("getFarm", {}, { farmId: farm.id }),
    ).toMatchObject({ setup_complete: true, version: 2 });
    restarted.store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  it("rolls back all related writes when setup contains an invalid fact", () => {
    const { store, services } = context();
    const farm = services.execute("createFarm", { name: "Test" }, {}) as {
      id: string;
    };
    expect(() =>
      store.transaction(() =>
        services.execute(
          "completeSetup",
          {
            expected_version: 1,
            facts: [
              {
                farm_id: "foreign",
                category: "F04",
                key: "water",
                value: { kind: "unknown", reason: "No measurement" },
                provenance: {
                  origin: "farmer_report",
                  attribution: "Farmer",
                  effective_at: now(),
                  evidence: [],
                },
              },
            ],
          },
          { farmId: farm.id },
        ),
      ),
    ).toThrow();
    expect(services.execute("getFarm", {}, { farmId: farm.id })).toMatchObject({
      setup_complete: false,
      version: 1,
    });
    store.close();
  });
  it("deduplicates same command and rejects reused key with changed payload", () => {
    const { store } = context();
    let writes = 0;
    expect(
      store.command(
        "farmer",
        "save",
        "farm",
        "same",
        { name: "a" },
        () => ++writes,
      ),
    ).toBe(1);
    expect(
      store.command(
        "farmer",
        "save",
        "farm",
        "same",
        { name: "a" },
        () => ++writes,
      ),
    ).toBe(1);
    expect(() =>
      store.command(
        "farmer",
        "save",
        "farm",
        "same",
        { name: "b" },
        () => ++writes,
      ),
    ).toThrow("idempotency_conflict");
    expect(writes).toBe(1);
    store.close();
  });
  it("rejects stale versions and keeps preference ownership farm-scoped", () => {
    const { store, services } = context();
    const a = services.execute("createFarm", { name: "a" }, {}) as {
      id: string;
    };
    const b = services.execute("createFarm", { name: "b" }, {}) as {
      id: string;
    };
    services.execute(
      "updateFarm",
      { expected_version: 1, name: "changed" },
      { farmId: a.id },
    );
    expect(() =>
      services.execute(
        "updateFarm",
        { expected_version: 1, name: "stale" },
        { farmId: a.id },
      ),
    ).toThrow("Reload");
    services.execute(
      "updatePreferences",
      { version: 1, role_key: "jal", explanation: "detailed" },
      { farmId: a.id, roleKey: "jal" },
    );
    expect(
      services.execute("getPreferences", {}, { farmId: b.id, roleKey: "jal" }),
    ).toMatchObject({ explanation: "inherit" });
    expect(() =>
      services.execute("getFarm", {}, { farmId: "foreign" }),
    ).toThrow("No farm");
    store.close();
  });
  it("requires consent for optional financial facts and preserves qualitative reports", () => {
    const { store, services } = context();
    const farm = services.execute("createFarm", { name: "Test" }, {}) as {
      id: string;
    };
    const fact = {
      farm_id: farm.id,
      category: "F04",
      key: "water",
      value: { kind: "qualitative", text: "well is low" },
      provenance: {
        origin: "farmer_report",
        attribution: "Farmer",
        effective_at: now(),
        original_wording: "well is low",
        effective_time_precision: "approximate",
        evidence: [],
      },
    };
    expect(
      services.execute("saveFact", fact, { farmId: farm.id }),
    ).toMatchObject({ value: { kind: "qualitative", text: "well is low" } });
    expect(() =>
      services.execute(
        "saveFact",
        { ...fact, category: "F05", key: "cash" },
        { farmId: farm.id },
      ),
    ).toThrow("permission");
    store.close();
  });
});
