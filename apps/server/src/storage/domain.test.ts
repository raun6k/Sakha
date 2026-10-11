import { randomUUID } from "node:crypto";
import type * as c from "@sakha/contracts";
import {
  actualLedger,
  convertQuantity,
  createDomainServices,
  createFarmServices,
} from "@sakha/farm";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { Storage } from "./database.js";

function context() {
  const store = new Storage(":memory:");
  const now = () => new Date().toISOString();
  const farm = createFarmServices(store, randomUUID, now);
  const profile = farm.execute("createFarm", { name: "Test" }, {}) as {
    id: string;
  };
  const domain = createDomainServices(
    store,
    farm.makeBase,
    farm.assertFarm,
    now,
  );
  return { store, farm, domain, id: profile.id, now };
}
function proposal(
  farmId: string,
  now: string,
): z.infer<typeof c.operations.createPlanRevision.input> {
  return {
    farm_id: farmId,
    title: "Review plan",
    summary: "No coefficients invented",
    tasks: [
      {
        id: "draft-task",
        farm_id: farmId,
        version: 1,
        created_at: now,
        updated_at: now,
        title: "Inspect field",
        description: "Record work separately",
        role_key: "crop_care",
        status: "proposed",
        evidence: [],
      },
    ],
    findings: [],
    evidence: [],
    constraints: [],
    assumptions: [],
    missing_inputs: [],
  };
}
describe("plan and actual work lifecycle", () => {
  it("approval changes commitments without recording water or cash, completion records one effect", () => {
    const { store, domain, id, now } = context();
    const revision = domain.execute("createPlanRevision", proposal(id, now()), {
      farmId: id,
    }) as { id: string; tasks: { id: string }[] };
    domain.execute(
      "decidePlan",
      { expected_version: 1, decision: "approve", base_revision_id: null },
      { farmId: id, revisionId: revision.id },
    );
    expect(actualLedger(store, id)).toMatchObject({
      water_m3: 0,
      cash: { minor_units: 0 },
    });
    const input = {
      farm_id: id,
      kind: "irrigation",
      description: "Irrigated field",
      confirmed_by: "farmer",
      confirmed: true,
      effective_at: now(),
      task_id: revision.tasks[0]?.id,
      quantity: { kind: "known", value: 1000, unit: "litre" },
      provenance: {
        origin: "farmer_report",
        attribution: "Farmer",
        effective_at: now(),
        evidence: [],
      },
    };
    domain.execute("recordActivity", input, { farmId: id });
    expect(actualLedger(store, id).water_m3).toBe(1);
    expect(() =>
      domain.execute("recordActivity", input, { farmId: id }),
    ).toThrow("already confirmed");
    store.close();
  });
  it("failed critical water constraints prevent approval regardless of attractive return", () => {
    const { store, domain, id, now } = context();
    const revision = domain.execute(
      "createPlanRevision",
      {
        ...proposal(id, now()),
        constraints: [
          {
            key: "water",
            label: "Water feasibility",
            status: "failed",
            critical: true,
            reason: "Insufficient water",
            evidence: [],
          },
        ],
      },
      { farmId: id },
    ) as { id: string };
    expect(() =>
      domain.execute(
        "decidePlan",
        { expected_version: 1, decision: "approve", base_revision_id: null },
        { farmId: id, revisionId: revision.id },
      ),
    ).toThrow("constraints");
    expect(domain.plan(id).active_revision).toBeNull();
    store.close();
  });
  it("qualitative completed use stays unknown and corrections replace ledger effects", () => {
    const { store, domain, id, now } = context();
    const activity = domain.execute(
      "recordActivity",
      {
        farm_id: id,
        kind: "irrigation",
        description: "Used some water",
        confirmed_by: "farmer",
        confirmed: true,
        effective_at: now(),
        quantity: { kind: "qualitative", text: "some" },
        provenance: {
          origin: "farmer_report",
          attribution: "Farmer",
          effective_at: now(),
          evidence: [],
        },
      },
      { farmId: id },
    ) as { id: string };
    expect(actualLedger(store, id).water_m3).toBeNull();
    domain.execute(
      "correctActivity",
      {
        farm_id: id,
        kind: "irrigation",
        description: "Measured later",
        confirmed_by: "farmer",
        confirmed: true,
        expected_version: 1,
        effective_at: now(),
        quantity: { kind: "known", value: 2, unit: "m3" },
        provenance: {
          origin: "farmer_report",
          attribution: "Farmer",
          effective_at: now(),
          evidence: [],
        },
      },
      { farmId: id, activityId: activity.id },
    );
    expect(actualLedger(store, id).water_m3).toBe(2);
    store.close();
  });
  it("saved what-if financial margin has no actual cash effect", () => {
    const { store, domain, id } = context();
    expect(
      domain.execute(
        "createScenario",
        {
          farm_id: id,
          role_key: "farm_finance",
          kind: "financial_comparison",
          inputs: {
            cost: { minor_units: 10000, currency: "INR" },
            proceeds: { minor_units: 15000, currency: "INR" },
          },
          assumptions: ["Hypothetical inputs"],
          evidence: [],
        },
        { farmId: id },
      ),
    ).toMatchObject({ results: { margin: { minor_units: 5000 } } });
    expect(actualLedger(store, id).cash.minor_units).toBe(0);
    expect(() =>
      convertQuantity({ kind: "known", value: 2, unit: "bag" }, "kg"),
    ).toThrow("known unit");
    store.close();
  });
  it("database rejects foreign farms and missing relational references even outside services", () => {
    const { store, id, now } = context();
    expect(() =>
      store.put("fact", {
        id: "x",
        farm_id: "foreign",
        version: 1,
        created_at: now(),
      }),
    ).toThrow("FOREIGN KEY");
    expect(() =>
      store.put("activity", {
        id: "x",
        farm_id: id,
        version: 1,
        created_at: now(),
        task_id: "absent",
      }),
    ).toThrow("FOREIGN KEY");
    expect(store.get("activity", "x", id)).toBeUndefined();
    store.close();
  });
});
it("converts explicit depth and area to volume without inventing crop demand", () => {
  const { domain, store, id } = context();
  const base = {
    farm_id: id,
    role_key: "water",
    kind: "irrigation_allocation",
    assumptions: ["Supplied scenario values only"],
    evidence: [],
  };
  const result = domain.execute(
    "createScenario",
    {
      ...base,
      inputs: {
        available_water: { kind: "known", value: 200, unit: "m3" },
        irrigation_need: { kind: "known", value: 10, unit: "mm" },
        area: { kind: "known", value: 2, unit: "ha" },
      },
    },
    { farmId: id },
  ) as { results: Record<string, unknown>; constraints: { status: string }[] };
  expect(result.results.required_volume).toEqual({
    kind: "known",
    value: 200,
    unit: "m3",
  });
  expect(result.constraints[0]?.status).toBe("satisfied");
  expect(() =>
    domain.execute(
      "createScenario",
      {
        ...base,
        inputs: {
          available_water: { kind: "known", value: 200, unit: "m3" },
          irrigation_need: { kind: "known", value: -10, unit: "mm" },
          area: { kind: "known", value: -2, unit: "ha" },
        },
      },
      { farmId: id },
    ),
  ).toThrow();
  store.close();
});
it("uses supplied kg price and costs with a distinct proceeds method", () => {
  const { domain, store, id } = context();
  const result = domain.execute(
    "createScenario",
    {
      farm_id: id,
      role_key: "market",
      kind: "market_proceeds",
      inputs: {
        quantity: { kind: "known", value: 2, unit: "quintal" },
        price: { currency: "INR", minor_units: 4000 },
        costs: { currency: "INR", minor_units: 10000 },
      },
      assumptions: ["Hypothetical supplied price per kg"],
      evidence: [],
    },
    { farmId: id },
  ) as { results: Record<string, unknown>; method_version: string };
  expect(result.results.net_proceeds).toEqual({
    currency: "INR",
    minor_units: 790000,
  });
  expect(result.method_version).toBe("supplied-kg-price-proceeds.v1");
  store.close();
});

it("inherits critical finding constraints and blocks unverified water tasks", () => {
  const { domain, store, farm, id, now } = context();
  const finding = {
    ...farm.makeBase(id),
    role_key: "water",
    title: "Fixture water uncertainty",
    summary: "Demand is unknown",
    evidence: [],
    assumptions: [],
    missing_inputs: ["Measured supply"],
    constraints: [
      {
        key: "physical_water",
        label: "Physical water feasibility",
        status: "unknown",
        critical: true,
        reason: "No measurement",
        evidence: [],
      },
    ],
    freshness: { status: "unknown" },
    origin: "fixture",
  };
  store.put("finding", finding);
  const data = proposal(id, now());
  data.findings = [finding.id];
  const first = data.tasks[0];
  if (first) first.role_key = "water";
  const revision = domain.execute("createPlanRevision", data, {
    farmId: id,
  }) as {
    id: string;
    missing_inputs: string[];
    constraints: { critical: boolean }[];
  };
  expect(revision.constraints.some((x) => x.critical)).toBe(true);
  expect(revision.missing_inputs).toContain("Measured supply");
  expect(() =>
    domain.execute(
      "decidePlan",
      { expected_version: 1, decision: "approve", base_revision_id: null },
      { farmId: id, revisionId: revision.id },
    ),
  ).toThrow("Critical missing");
  store.close();
});
