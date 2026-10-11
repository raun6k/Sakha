import * as c from "@sakha/contracts";
import type { z } from "zod";
export type StoredRecord = {
  id: string;
  farm_id: string;
  version: number;
  created_at: string;
};
export interface Store {
  get(kind: string, id: string, farmId: string): unknown;
  list(kind: string, farmId: string): unknown[];
  put<T extends StoredRecord>(kind: string, record: T): void;
  remove(kind: string, id: string, farmId: string): void;
  transaction<T>(fn: () => T): T;
  event(farmId: string, type: string, payload: unknown): void;
  enqueue(farmId: string, kind: string, payload: unknown): string;
}
export class DomainError extends Error {
  constructor(
    public code: c.ApiError["code"],
    message: string,
    public retryable = false,
    public details?: Record<string, string | number | boolean>,
  ) {
    super(message);
  }
}
export function load<T extends z.ZodType>(
  store: Store,
  kind: string,
  id: string,
  farmId: string,
  schema: T,
): z.output<T> {
  const record = store.get(kind, id, farmId);
  if (!record)
    throw new DomainError("not_found", `No ${kind} found in this farm`);
  return schema.parse(record);
}
export function requireVersion(
  record: { version: number },
  expected: unknown,
): void {
  if (record.version !== expected)
    throw new DomainError(
      "version_conflict",
      "The saved record changed. Reload before saving.",
    );
}
export const defaultSettings = c.Settings.parse({
  version: 1,
  language: "en",
  area_unit: "ha",
  temperature_unit: "celsius",
  currency: "INR",
  explanation: "simple",
  reduced_motion: false,
  notifications: true,
});
export function createFarmServices(
  store: Store,
  id: () => string,
  now: () => string,
) {
  const makeBase = (farmId: string) => ({
    id: id(),
    farm_id: farmId,
    version: 1,
    created_at: now(),
    updated_at: now(),
  });
  const assertFarm = (farmId: string) =>
    load(store, "farm", farmId, farmId, c.Farm);
  const listFacts = (farmId: string) => {
    assertFarm(farmId);
    const all = store.list("fact", farmId).map((x) => c.Fact.parse(x));
    const replaced = new Set(
      all.flatMap((x) => (x.corrects_id ? [x.corrects_id] : [])),
    );
    return all.filter((x) => !replaced.has(x.id));
  };
  function saveFact(input: unknown, farmId: string, correctsId?: string) {
    assertFarm(farmId);
    assertMutationAllowed(store, farmId);
    const parsed = c.operations.saveFact.input.parse(input);
    if (parsed.farm_id !== farmId)
      throw new DomainError("scope_denied", "Fact belongs to another farm");
    if (parsed.field_id) load(store, "field", parsed.field_id, farmId, c.Field);
    if (
      (parsed.category === "F05" || parsed.category === "F08") &&
      !store.list("consent", farmId).some((raw) => {
        const grant = c.Consent.parse(raw);
        return grant.status === "active" && grant.fields.includes(parsed.key);
      })
    )
      throw new DomainError(
        "consent_required",
        "Grant permission before saving optional private details",
      );
    const fact = c.Fact.parse({
      ...parsed,
      ...makeBase(farmId),
      corrects_id: correctsId,
      private:
        parsed.private ||
        parsed.category === "F05" ||
        parsed.category === "F08",
    });
    store.put("fact", fact);
    store.event(farmId, "farm_changed", {
      record_id: fact.id,
      version: fact.version,
    });
    if (correctsId)
      store.enqueue(farmId, "fact_corrected", {
        fact_id: correctsId,
        new_fact_id: fact.id,
      });
    return fact;
  }
  return {
    makeBase,
    assertFarm,
    listFacts,
    saveFact,
    execute(
      name: c.OperationName,
      input: unknown,
      params: Record<string, string>,
    ): unknown {
      return store.transaction(() => {
        const farmId = params.farmId ?? "";
        if (c.operations[name].method !== "GET")
          assertMutationAllowed(store, farmId);
        const data = c.operations[name].input.parse(input);
        switch (name) {
          case "createFarm": {
            const d = c.operations.createFarm.input.parse(data);
            const farmId = id();
            const farm = c.Farm.parse({
              ...d,
              ...makeBase(farmId),
              id: farmId,
              setup_complete: false,
            });
            store.put("farm", farm);
            return farm;
          }
          case "getFarm":
            return assertFarm(farmId);
          case "updateFarm": {
            const d = c.operations.updateFarm.input.parse(data);
            const farm = assertFarm(farmId);
            requireVersion(farm, d.expected_version);
            const updated = c.Farm.parse({
              ...farm,
              ...d,
              version: farm.version + 1,
              updated_at: now(),
            });
            store.put("farm", updated);
            store.event(farmId, "farm_changed", {
              record_id: farmId,
              version: updated.version,
            });
            return updated;
          }
          case "completeSetup": {
            const d = c.operations.completeSetup.input.parse(data);
            const farm = assertFarm(farmId);
            requireVersion(farm, d.expected_version);
            for (const fact of d.facts) saveFact(fact, farmId);
            if (d.settings) {
              const record = {
                ...d.settings,
                id: "settings",
                farm_id: "installation",
                created_at: now(),
              };
              store.put("settings", record);
            }
            const updated = {
              ...farm,
              version: farm.version + 1,
              setup_complete: true,
              updated_at: now(),
            };
            store.put("farm", updated);
            store.event(farmId, "farm_changed", {
              record_id: farmId,
              version: updated.version,
            });
            return updated;
          }
          case "listFields":
            assertFarm(farmId);
            return { items: store.list("field", farmId), next_cursor: null };
          case "createField": {
            assertFarm(farmId);
            const d = c.operations.createField.input.parse(data);
            const record = c.Field.parse({ ...d, ...makeBase(farmId) });
            store.put("field", record);
            store.event(farmId, "farm_changed", { record_id: record.id });
            return record;
          }
          case "updateField": {
            const field = load(
              store,
              "field",
              params.fieldId ?? "",
              farmId,
              c.Field,
            );
            const d = c.operations.updateField.input.parse(data);
            requireVersion(field, d.expected_version);
            const updated = c.Field.parse({
              ...field,
              ...d,
              version: field.version + 1,
              updated_at: now(),
            });
            store.put("field", updated);
            return updated;
          }
          case "listFacts":
            return { items: listFacts(farmId), next_cursor: null };
          case "saveFact":
          case "saveObservation":
            return saveFact(data, farmId);
          case "correctFact": {
            const d = c.operations.correctFact.input.parse(data);
            const fact = load(
              store,
              "fact",
              params.factId ?? "",
              farmId,
              c.Fact,
            );
            requireVersion(fact, d.expected_version);
            if (
              store
                .list("fact", farmId)
                .some((raw) => c.Fact.parse(raw).corrects_id === fact.id)
            )
              throw new DomainError(
                "version_conflict",
                "This fact was already corrected",
              );
            return saveFact(d, farmId, fact.id);
          }
          case "getSettings":
            return c.Settings.parse(
              store.get("settings", "settings", "installation") ??
                defaultSettings,
            );
          case "updateSettings": {
            const d = c.operations.updateSettings.input.parse(data);
            const saved = c.Settings.parse(
              store.get("settings", "settings", "installation") ??
                defaultSettings,
            );
            requireVersion(saved, d.version);
            const updated = c.Settings.parse({
              ...saved,
              ...d,
              version: saved.version + 1,
            });
            store.put("settings", {
              ...updated,
              id: "settings",
              farm_id: "installation",
              created_at: now(),
            });
            return updated;
          }
          case "getPreferences":
            assertFarm(farmId);
            return c.Preferences.parse(
              store.get("preference", params.roleKey ?? "", farmId) ?? {
                version: 1,
                role_key: params.roleKey,
                explanation: "inherit",
              },
            );
          case "updatePreferences": {
            assertFarm(farmId);
            const d = c.Preferences.parse(data);
            if (d.role_key !== params.roleKey)
              throw new DomainError(
                "scope_denied",
                "Preference role does not match route",
              );
            const saved = c.Preferences.parse(
              store.get("preference", params.roleKey ?? "", farmId) ?? {
                version: 1,
                role_key: params.roleKey,
                explanation: "inherit",
              },
            );
            requireVersion(saved, d.version);
            const updated = { ...d, version: saved.version + 1 };
            store.put("preference", {
              ...updated,
              id: params.roleKey ?? "",
              farm_id: farmId,
              created_at: now(),
            });
            return updated;
          }
          case "listConsents":
            assertFarm(farmId);
            return { items: store.list("consent", farmId), next_cursor: null };
          case "grantConsent": {
            assertFarm(farmId);
            const d = c.operations.grantConsent.input.parse(data);
            if (d.storage === "session")
              throw new DomainError(
                "unavailable",
                "Session-only private storage is not supported yet; choose persistent consent or skip optional details",
              );
            if (d.farm_id !== farmId)
              throw new DomainError(
                "scope_denied",
                "Consent farm does not match",
              );
            const grant = c.Consent.parse({
              ...d,
              ...makeBase(farmId),
              status: "active",
            });
            store.put("consent", grant);
            return grant;
          }
          case "revokeConsent": {
            const grant = load(
              store,
              "consent",
              params.grantId ?? "",
              farmId,
              c.Consent,
            );
            const d = c.operations.revokeConsent.input.parse(data);
            requireVersion(grant, d.expected_version);
            const updated = c.Consent.parse({
              ...grant,
              status: "revoked",
              version: grant.version + 1,
              updated_at: now(),
            });
            store.put("consent", updated);
            store.enqueue(farmId, "consent_revoked", {
              grant_id: grant.id,
              fields: grant.fields,
            });
            return updated;
          }
          default:
            throw new DomainError(
              "unavailable",
              "Operation is not implemented in the farm profile service",
            );
        }
      });
    },
  };
}

export {
  actualLedger,
  convertQuantity,
  createDomainServices,
  moneyTotal,
} from "./domain.js";

export function assertMutationAllowed(store: Store, farmId: string) {
  if (
    farmId &&
    store.list("job", farmId).some((value) => {
      const job = c.Job.safeParse(value);
      return (
        job.success &&
        job.data.kind === "deletion" &&
        ["queued", "running"].includes(job.data.status)
      );
    })
  )
    throw new DomainError(
      "permission_denied",
      "Farm deletion is pending; wait for its outcome before changing records",
    );
}
