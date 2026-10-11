import * as c from "@sakha/contracts";
import { DomainError } from "@sakha/farm";
import type { createApp } from "./app.js";

export const DEMO_ID = "sakha-public-demo.v1";
export const DEMO_LOCATION = {
  ...c.nagpurPlace,
  village: "Public Nagpur demonstration point",
};
type Services = ReturnType<typeof createApp>;
export function isDemo(store: Services["store"]) {
  return Boolean(store.get("demo_profile", DEMO_ID, "installation"));
}
/** Seed only an empty installation; all farmer information is deliberately illustrative. */
export function initializeDemo(services: Services) {
  const { store, farm, domain } = services;
  const marker = store.get("demo_profile", DEMO_ID, "installation");
  if (marker) {
    const profile = store.db
      .prepare("SELECT payload FROM records WHERE kind='farm'")
      .get() as { payload: string } | undefined;
    if (!profile)
      throw new DomainError(
        "validation",
        "Demo marker has no farm; reset this dedicated demo installation",
      );
    return c.Farm.parse(JSON.parse(profile.payload));
  }
  const count = store.db
    .prepare("SELECT count(*) as count FROM records WHERE kind='farm'")
    .get() as { count: number };
  if (count.count)
    throw new DomainError(
      "permission_denied",
      "Demo initialization requires a separate empty database; existing farms are never overwritten",
    );
  return store.transaction(() => {
    const profile = c.Farm.parse(
      farm.execute(
        "createFarm",
        { name: "Sahaj Demo Farm", location: DEMO_LOCATION },
        {},
      ),
    );
    const farmId = profile.id;
    const now = new Date();
    const time = (offset: number) =>
      new Date(now.getTime() + offset * 86400000).toISOString();
    const provenance = {
      origin: "farmer_report" as const,
      attribution: "Illustrative demo farmer (not an actual farmer report)",
      effective_at: time(0),
      evidence: [],
    };
    const entries: {
      category: c.Fact["category"];
      key: string;
      value: c.Fact["value"];
    }[] = [
      {
        category: "F01",
        key: "area",
        value: { kind: "known", value: 2.4, unit: "ha" },
      },
      {
        category: "F01",
        key: "situation",
        value: "Owner-operated family farm · Kharif harvest preparation",
      },
      { category: "F02", key: "current_crop", value: "Soybean" },
      {
        category: "F02",
        key: "intended_crop",
        value: "Chickpea after harvest; sowing decision still pending",
      },
      { category: "F02", key: "crop_stage", value: "Maturity · pods drying" },
      {
        category: "F02",
        key: "crop_condition",
        value:
          "Mostly dry pods; a small patch still green, reported by demo farmer",
      },
      {
        category: "F03",
        key: "water_source",
        value: "Farm pond and stored tank water",
      },
      {
        category: "F03",
        key: "water_availability",
        value: { kind: "known", value: 150, unit: "m3" },
      },
      {
        category: "F04",
        key: "resources",
        value: "Shared tractor, tarpaulins, hand tools and two family workers",
      },
      {
        category: "F04",
        key: "soil_type",
        value: "Clay loam, demo farmer description; no laboratory result",
      },
    ];
    farm.execute(
      "completeSetup",
      {
        expected_version: profile.version,
        facts: entries.map((e) => ({
          ...e,
          farm_id: farmId,
          provenance,
          private: false,
        })),
      },
      { farmId },
    );
    farm.execute(
      "createField",
      {
        name: "Soybean field",
        area: { kind: "known", value: 1.8, unit: "ha" },
        crop: "Soybean",
      },
      { farmId },
    );
    farm.execute(
      "createField",
      {
        name: "Pigeonpea field",
        area: { kind: "known", value: 0.6, unit: "ha" },
        crop: "Pigeonpea",
      },
      { farmId },
    );
    farm.execute(
      "grantConsent",
      {
        farm_id: farmId,
        purpose:
          "Demo-only external processing of public illustrative farm records and conversation text",
        fields: [
          "conversation",
          "area",
          "situation",
          "current_crop",
          "intended_crop",
          "crop_stage",
          "crop_condition",
          "water_source",
          "water_availability",
          "resources",
          "soil_type",
        ],
        roles: c.RoleKey.options,
        external_processing: true,
        storage: "persistent",
      },
      { farmId },
    );
    const task = (title: string, description: string, due: number) => ({
      ...farm.makeBase(farmId),
      title,
      description,
      role_key: "crop_care" as const,
      status: "proposed" as const,
      due_at: time(due),
      evidence: [],
    });
    const approved = c.PlanRevision.parse(
      domain.execute(
        "createPlanRevision",
        {
          farm_id: farmId,
          title: "Harvest preparation",
          summary:
            "Demo farmer's approved preparation checklist. No automatic harvest, irrigation or spending is recorded by approval.",
          tasks: [
            task(
              "Inspect soybean pods",
              "Walk both plots and record remaining green patches.",
              0,
            ),
            task(
              "Prepare tarpaulins and dry storage",
              "Clean the storage area and check available tarpaulins before selecting a harvest date.",
              1,
            ),
            task(
              "Review harvest timing with Sakha",
              "Compare the farmer's maturity report with current attributed weather guidance.",
              2,
            ),
          ],
          findings: [],
          evidence: [],
          constraints: [],
          assumptions: [
            "Illustrative farmer-selected checklist; not an agronomic prescription",
          ],
          missing_inputs: [],
        },
        { farmId },
      ),
    );
    domain.execute(
      "decidePlan",
      {
        expected_version: approved.version,
        base_revision_id: null,
        decision: "approve",
        reason: "Seeded demo farmer decision",
      },
      { farmId, revisionId: approved.id },
    );
    domain.execute(
      "recordActivity",
      {
        farm_id: farmId,
        kind: "observation",
        description:
          "Demo farmer walked the soybean field and recorded mostly dry pods with a remaining green patch.",
        confirmed: true,
        confirmed_by: "farmer",
        effective_at: time(-1),
        task_id: approved.tasks[0]?.id,
        provenance: { ...provenance, effective_at: time(-1) },
      },
      { farmId },
    );
    domain.execute(
      "recordActivity",
      {
        farm_id: farmId,
        kind: "other",
        description:
          "Demo farmer cleaned the tool shed and counted the available tarpaulins.",
        confirmed: true,
        confirmed_by: "farmer",
        effective_at: time(-2),
        provenance: { ...provenance, effective_at: time(-2) },
      },
      { farmId },
    );
    domain.execute(
      "createPlanRevision",
      {
        farm_id: farmId,
        base_revision_id: approved.id,
        title: "Review the remaining green patch",
        summary:
          "A separate demo proposal to inspect the green patch again. It has not replaced the approved checklist.",
        tasks: [
          task(
            "Inspect the green patch again",
            "Record pod dryness before changing the farmer's harvest checklist.",
            2,
          ),
        ],
        findings: [],
        evidence: [],
        constraints: [],
        assumptions: ["Illustrative draft; farmer approval still required"],
        missing_inputs: [],
      },
      { farmId },
    );
    for (const reminder of [
      {
        title: "Prepare dry storage",
        summary:
          "Demo farmer reminder: check the storage area and tarpaulins on your approved preparation checklist.",
      },
      {
        title: "Review your next crop choice",
        summary:
          "Demo farmer reminder: chickpea is an intention, not a completed sowing record. Discuss soil, inputs and current local guidance before committing.",
      },
    ]) {
      store.put(
        "alert",
        c.Alert.parse({
          ...farm.makeBase(farmId),
          ...reminder,
          severity: "information",
          role_key: "chief_of_staff",
          status: "active",
          evidence: [],
          issued_at: time(0),
          freshness: { status: "fresh" },
        }),
      );
    }
    store.put("demo_profile", {
      ...farm.makeBase("installation"),
      id: DEMO_ID,
      demo_farm_id: farmId,
    });
    return farm.assertFarm(farmId);
  });
}

export function resetDemo(services: Services) {
  const { store } = services;
  if (!isDemo(store))
    throw new DomainError(
      "permission_denied",
      "Reset is restricted to a marked dedicated demo database",
    );
  const count = store.db
    .prepare("SELECT count(*) as count FROM records WHERE kind='farm'")
    .get() as { count: number };
  if (count.count > 1)
    throw new DomainError(
      "permission_denied",
      "Demo reset refuses an installation containing additional farms",
    );
  store.transaction(() => {
    store.db.exec(
      "DELETE FROM record_links; DELETE FROM records; DELETE FROM scopes WHERE kind='farm'; DELETE FROM commands; DELETE FROM memory_fts;",
    );
  });
  return initializeDemo(services);
}
