import * as c from "@sakha/contracts";
import {
  DEMO_FARMER,
  type DemoCache,
  loadDemoCache,
  refreshDemoCache,
} from "@sakha/data";
import { DomainError } from "@sakha/farm";
import { importAdapterCache } from "./adapter-import.js";
import type { createApp } from "./app.js";
import { importDemoSources } from "./demo-sources.js";
import { persistTeamSeed } from "./team-persist.js";

export const DEMO_ID = "sakha-public-demo.v1";
const SOWING = "2026-06-20";
type Services = ReturnType<typeof createApp>;

export function isDemo(store: Services["store"]) {
  return Boolean(store.get("demo_profile", DEMO_ID, "installation"));
}

function rupee(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function prettyDate(iso: string) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

/** Seed only an empty installation. Numbers in the plan come from the adapter cache. */
export function initializeDemo(services: Services, cache?: DemoCache) {
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
  const data = cache ?? loadDemoCache();
  const brief = data.brief;
  const rec = data.recommendation;
  return store.transaction(() => {
    const profile = c.Farm.parse(
      farm.execute(
        "createFarm",
        {
          name: brief.farmer_name,
          location: {
            country: DEMO_FARMER.country,
            state: brief.state,
            district: brief.district,
            village: brief.village,
            latitude: DEMO_FARMER.latitude,
            longitude: DEMO_FARMER.longitude,
          },
        },
        {},
      ),
    );
    const farmId = profile.id;
    const provenance = {
      origin: "farmer_report" as const,
      attribution: `${brief.farmer_name}, ${brief.village} (demo profile, not a live survey)`,
      effective_at: data.forecast.fetched_at,
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
        value: { kind: "known", value: brief.total_ha, unit: "ha" },
      },
      {
        category: "F01",
        key: "situation",
        value: `${brief.village}, ${brief.district} · soybean pods drying, cotton still in the field`,
      },
      { category: "F02", key: "current_crop", value: "Soybean" },
      {
        category: "F02",
        key: "companion_crop",
        value: `Cotton on ${brief.cotton_ha} ha`,
      },
      { category: "F02", key: "crop_stage", value: "Pods drying" },
      { category: "F02", key: "sowing_date", value: SOWING },
      {
        category: "F02",
        key: "crop_condition",
        value:
          "Mostly dry pods; a small green patch, reported by the farmer. Not a diagnosis.",
      },
      { category: "F03", key: "water_source", value: "Borewell" },
      {
        category: "F03",
        key: "water_availability",
        value: "Borewell kept for the cotton while the soybean dries",
      },
      {
        category: "F04",
        key: "resources",
        value:
          "Family harvest labour. Pump horsepower and the power tariff are not recorded.",
      },
      {
        category: "F04",
        key: "soil_type",
        value: "Not laboratory tested",
      },
    ];
    farm.execute(
      "completeSetup",
      {
        expected_version: profile.version,
        facts: entries.map((entry) => ({
          ...entry,
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
        area: { kind: "known", value: brief.soybean_ha, unit: "ha" },
        crop: "Soybean",
      },
      { farmId },
    );
    farm.execute(
      "createField",
      {
        name: "Cotton field",
        area: { kind: "known", value: brief.cotton_ha, unit: "ha" },
        crop: "Cotton",
      },
      { farmId },
    );
    farm.execute(
      "grantConsent",
      {
        farm_id: farmId,
        purpose:
          "Demo-only external processing of this seeded farm profile and its conversation text",
        fields: [...entries.map((entry) => entry.key), "conversation"],
        roles: c.RoleKey.options,
        external_processing: true,
        storage: "persistent",
      },
      { farmId },
    );
    const task = (title: string, description: string, due: string) => ({
      ...farm.makeBase(farmId),
      title,
      description,
      role_key: "sakha" as const,
      status: "proposed" as const,
      due_at: due,
      evidence: [],
    });
    const cutFrom = "2026-10-12T09:00:00+05:30";
    const approved = c.PlanRevision.parse(
      domain.execute(
        "createPlanRevision",
        {
          farm_id: farmId,
          title: rec.title,
          summary: `${rec.action} Harvest labour ₹${rupee(rec.cost_inr)}. The modal-minus-minimum gap on ${rec.quintals} quintal is ₹${rupee(rec.benefit_inr)}, not a promised sale.`,
          cost_inr: rec.cost_inr,
          benefit_inr: rec.benefit_inr,
          tasks: [
            task(
              `Cut ${brief.soybean_ha} ha soybean`,
              `Cut between 12 and 16 Oct 2026 while the forecast shows ${brief.forecast_rain_7d_mm} mm of rain.`,
              cutFrom,
            ),
            task(
              `Sell at ${brief.market}`,
              `Aim for ₹${rupee(brief.modal_inr)} per quintal, not the ₹${rupee(brief.min_inr)} minimum. The quote is cached ${prettyDate(brief.price_date)}.`,
              "2026-10-13T09:00:00+05:30",
            ),
            task(
              "Keep the borewell for cotton",
              `Give the soybean 0 mm. About ${rupee(rec.borewell_held_m3)} m3 stays unpumped for the ${brief.cotton_ha} ha cotton.`,
              "2026-10-12T09:00:00+05:30",
            ),
          ],
          findings: [],
          evidence: [],
          constraints: [],
          assumptions: [
            ...rec.assumptions,
            `Soybean sown ${SOWING}, farmer report. Variety was not stated.`,
            "Soil moisture, pump horsepower and the power tariff were not measured.",
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
        reason: "Seeded demo farmer accepted the harvest-and-sell plan",
      },
      { farmId, revisionId: approved.id },
    );
    domain.execute(
      "recordActivity",
      {
        farm_id: farmId,
        kind: "observation",
        description:
          "Farmer walked the soybean and reported mostly dry pods, with one small green patch. Not a diagnosis.",
        confirmed: true,
        confirmed_by: "farmer",
        effective_at: "2026-10-10T09:00:00+05:30",
        provenance: {
          ...provenance,
          effective_at: "2026-10-10T09:00:00+05:30",
        },
      },
      { farmId },
    );
    domain.execute(
      "recordActivity",
      {
        farm_id: farmId,
        kind: "other",
        description:
          "Farmer reported no irrigation this week. Borewell volume was not measured.",
        confirmed: true,
        confirmed_by: "farmer",
        effective_at: "2026-10-10T10:00:00+05:30",
        provenance: {
          ...provenance,
          effective_at: "2026-10-10T10:00:00+05:30",
        },
      },
      { farmId },
    );
    for (const reminder of [
      {
        title: "Dry week for the soybean cut",
        summary: `Open-Meteo shows ${brief.forecast_rain_7d_mm} mm over the next 7 days. The approved plan is to cut ${brief.soybean_ha} ha and sell at the cached modal.`,
      },
      {
        title: "Mandi quote is cached",
        summary: `${brief.market} ${brief.market_note}`,
      },
    ]) {
      store.put(
        "alert",
        c.Alert.parse({
          ...farm.makeBase(farmId),
          ...reminder,
          severity: "information",
          role_key: "sakha",
          status: "active",
          evidence: [],
          issued_at: data.forecast.fetched_at,
          freshness: {
            status: "fresh",
            retrieved_at: data.forecast.fetched_at,
          },
        }),
      );
    }
    persistTeamSeed(services, farmId, data);
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

/** One command for the named demo farm, its cache, and the team seed. */
export async function seedDemo(
  services: Services,
  options: { live?: boolean } = {},
) {
  const cache =
    options.live === false
      ? loadDemoCache()
      : await refreshDemoCache().catch(() => loadDemoCache());
  const profile = initializeDemo(services, cache);
  const location = profile.location;
  const sources =
    location?.latitude === c.nagpurPlace.latitude &&
    location.longitude === c.nagpurPlace.longitude
      ? importDemoSources(services, profile.id)
      : { series: 0, documents: 0 };
  const adapters = importAdapterCache(services, profile.id, cache);
  return { profile, sources, adapters, cache };
}
