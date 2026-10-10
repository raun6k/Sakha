import * as c from "@sakha/contracts";
import { DomainError, load, requireVersion, type Store } from "./index.js";
export function convertQuantity(value: c.Quantity, target: string): c.Quantity {
  if (value.kind !== "known" && value.kind !== "range") return value;
  const scale: Record<string, number> = {
    "ha:acre": 2.471053814671653,
    "acre:ha": 0.40468564224,
    "kg:quintal": 0.01,
    "quintal:kg": 100,
    "kg:tonne": 0.001,
    "tonne:kg": 1000,
    "litre:m3": 0.001,
    "m3:litre": 1000,
  };
  if (value.unit === target) return value;
  const multiplier = scale[`${value.unit}:${target}`];
  if (!multiplier)
    throw new DomainError(
      "validation",
      "Conversion requires a known unit definition",
    );
  return value.kind === "known"
    ? { ...value, value: value.value * multiplier, unit: target }
    : {
        ...value,
        min: value.min * multiplier,
        max: value.max * multiplier,
        unit: target,
      };
}
export function moneyTotal(values: zMoney[]): cMoney {
  const currency = values[0]?.currency ?? "INR";
  if (values.some((x) => x.currency !== currency))
    throw new DomainError(
      "validation",
      "Mixed currencies require an attributed exchange rate",
    );
  const total = values.reduce((sum, x) => sum + x.minor_units, 0);
  if (!Number.isSafeInteger(total))
    throw new DomainError("validation", "Money exceeds safe range");
  return { currency, minor_units: total };
}
type zMoney = { minor_units: number; currency: string };
type cMoney = zMoney;
export function createDomainServices(
  store: Store,
  base: (farmId: string) => {
    id: string;
    farm_id: string;
    version: number;
    created_at: string;
    updated_at: string;
  },
  assertFarm: (farmId: string) => c.Farm,
  now: () => string,
) {
  const history = (
    farmId: string,
    kind: c.HistoryEntry["kind"],
    recordId: string,
    title: string,
    summary: string,
  ) => {
    const record = c.HistoryEntry.parse({
      ...base(farmId),
      kind,
      record_id: recordId,
      title,
      summary,
    });
    store.put("history", record);
    return record;
  };
  const plan = (farmId: string) => {
    assertFarm(farmId);
    const revisions = store
      .list("revision", farmId)
      .map((x) => c.PlanRevision.parse(x));
    return c.Plan.parse({
      farm_id: farmId,
      active_revision: revisions.find((x) => x.status === "approved") ?? null,
      proposed_revisions: revisions.filter((x) => x.status === "proposed"),
    });
  };
  return {
    plan,
    history,
    execute(
      name: c.OperationName,
      input: unknown,
      params: Record<string, string>,
    ): unknown {
      return store.transaction(() => {
        const farmId = params.farmId ?? "";
        assertFarm(farmId);
        switch (name) {
          case "createScenario": {
            const request = c.ScenarioRequest.parse(input);
            if (request.farm_id !== farmId)
              throw new DomainError(
                "scope_denied",
                "Scenario belongs to another farm",
              );
            if (request.field_id)
              load(store, "field", request.field_id, farmId, c.Field);
            for (const ref of request.evidence)
              load(store, "evidence", ref.evidence_id, farmId, c.Evidence);
            const missing: string[] = [];
            const results: Record<string, c.Quantity | cMoney | string> = {};
            for (const [key, value] of Object.entries(request.inputs)) {
              if (
                typeof value === "object" &&
                "kind" in value &&
                value.kind === "unknown"
              )
                missing.push(key);
            }
            const cost = request.inputs.cost;
            const proceeds = request.inputs.proceeds;
            if (
              (request.kind === "crop_budget" ||
                request.kind === "financial_comparison" ||
                request.kind === "market_proceeds") &&
              cost &&
              proceeds &&
              typeof cost === "object" &&
              typeof proceeds === "object" &&
              "minor_units" in cost &&
              "minor_units" in proceeds
            ) {
              if (cost.currency !== proceeds.currency)
                throw new DomainError(
                  "validation",
                  "Cost and proceeds currencies differ",
                );
              results.margin = moneyTotal([
                proceeds,
                { ...cost, minor_units: -cost.minor_units },
              ]);
            } else
              missing.push(
                "Verified domain method and applicable source evidence",
              );
            const scenario = c.Scenario.parse({
              ...base(farmId),
              request,
              status: missing.length ? "needs_information" : "available",
              results,
              constraints: [],
              missing_inputs: missing,
              method_version: Object.keys(results).length
                ? "money-arithmetic.v1"
                : "domain-method-unavailable.v1",
              origin: "derived_calculation",
            });
            store.put("scenario", scenario);
            return scenario;
          }
          case "getScenario":
            return load(
              store,
              "scenario",
              params.scenarioId ?? "",
              farmId,
              c.Scenario,
            );
          case "listFindings":
            return {
              items: store.list("finding", farmId).filter((raw) => {
                const finding = c.Finding.parse(raw);
                return (
                  !c.operations.listFindings.input.parse(input).role_key ||
                  finding.role_key ===
                    c.operations.listFindings.input.parse(input).role_key
                );
              }),
              next_cursor: null,
            };
          case "getFinding":
            return load(
              store,
              "finding",
              params.findingId ?? "",
              farmId,
              c.Finding,
            );
          case "getPlan":
            return plan(farmId);
          case "listPlanRevisions":
            return { items: store.list("revision", farmId), next_cursor: null };
          case "getPlanRevision":
            return load(
              store,
              "revision",
              params.revisionId ?? "",
              farmId,
              c.PlanRevision,
            );
          case "createPlanRevision": {
            const data = c.operations.createPlanRevision.input.parse(input);
            if (data.farm_id !== farmId)
              throw new DomainError(
                "scope_denied",
                "Plan belongs to another farm",
              );
            const active = plan(farmId).active_revision;
            if (data.base_revision_id !== active?.id)
              throw new DomainError(
                "version_conflict",
                "Plan base no longer matches the active approved revision",
              );
            for (const findingId of data.findings)
              load(store, "finding", findingId, farmId, c.Finding);
            for (const ref of data.evidence)
              load(store, "evidence", ref.evidence_id, farmId, c.Evidence);
            const recordBase = base(farmId);
            const tasks = data.tasks.map((task) =>
              c.Task.parse({
                ...task,
                ...base(farmId),
                plan_revision_id: recordBase.id,
                status: "proposed",
              }),
            );
            const revision = c.PlanRevision.parse({
              ...data,
              ...recordBase,
              tasks,
              status: "proposed",
            });
            store.put("revision", revision);
            history(
              farmId,
              "plan_proposal",
              revision.id,
              revision.title,
              revision.summary,
            );
            store.event(farmId, "plan_proposed", {
              record_id: revision.id,
              version: revision.version,
            });
            return revision;
          }
          case "decidePlan": {
            const d = c.operations.decidePlan.input.parse(input);
            const revision = load(
              store,
              "revision",
              params.revisionId ?? "",
              farmId,
              c.PlanRevision,
            );
            requireVersion(revision, d.expected_version);
            if (revision.status !== "proposed")
              throw new DomainError(
                "version_conflict",
                "Only a proposed revision can be decided",
              );
            const active = plan(farmId).active_revision;
            if (
              (active?.id ?? null) !== d.base_revision_id ||
              (revision.base_revision_id ?? null) !== d.base_revision_id
            )
              throw new DomainError(
                "version_conflict",
                "The approved plan changed. Review the revision again",
              );
            if (
              d.decision === "approve" &&
              (revision.missing_inputs.length ||
                revision.constraints.some(
                  (x) =>
                    x.critical &&
                    x.status !== "satisfied" &&
                    x.status !== "not_applicable",
                ))
            )
              throw new DomainError(
                "validation",
                "Critical missing or failed constraints prevent approval",
              );
            const status =
              d.decision === "approve"
                ? "approved"
                : d.decision === "reject"
                  ? "rejected"
                  : "changes_requested";
            const updated = c.PlanRevision.parse({
              ...revision,
              status,
              version: revision.version + 1,
              updated_at: now(),
            });
            if (status === "approved") {
              if (active)
                store.put("revision", {
                  ...active,
                  status: "superseded",
                  version: active.version + 1,
                  updated_at: now(),
                });
              for (const task of updated.tasks)
                store.put("task", { ...task, status: "pending" });
            }
            store.put("revision", updated);
            history(
              farmId,
              "plan_decision",
              updated.id,
              d.decision,
              d.reason ?? "Explicit farmer decision",
            );
            store.event(farmId, "plan_decision", {
              record_id: updated.id,
              version: updated.version,
            });
            return updated;
          }
          case "listTasks":
            return { items: store.list("task", farmId), next_cursor: null };
          case "recordActivity":
          case "correctActivity": {
            const d =
              name === "recordActivity"
                ? c.operations.recordActivity.input.parse(input)
                : c.operations.correctActivity.input.parse(input);
            if (d.farm_id !== farmId)
              throw new DomainError(
                "scope_denied",
                "Activity belongs to another farm",
              );
            if (d.field_id) load(store, "field", d.field_id, farmId, c.Field);
            let correctsId: string | undefined;
            if (name === "correctActivity") {
              const original = load(
                store,
                "activity",
                params.activityId ?? "",
                farmId,
                c.Activity,
              );
              requireVersion(
                original,
                c.operations.correctActivity.input.parse(input)
                  .expected_version,
              );
              if (
                store
                  .list("activity", farmId)
                  .some(
                    (raw) => c.Activity.parse(raw).corrects_id === original.id,
                  )
              )
                throw new DomainError(
                  "version_conflict",
                  "Activity already corrected",
                );
              correctsId = original.id;
            }
            if (
              d.quantity &&
              ((d.quantity.kind === "known" && d.quantity.value < 0) ||
                (d.quantity.kind === "range" && d.quantity.min < 0))
            )
              throw new DomainError(
                "validation",
                "Activity quantities must not be negative",
              );
            const activity = c.Activity.parse({
              ...d,
              ...base(farmId),
              corrects_id: correctsId,
            });
            if (d.task_id) {
              const task = load(store, "task", d.task_id, farmId, c.Task);
              if (task.status === "completed" && !correctsId)
                throw new DomainError(
                  "version_conflict",
                  "Task work was already confirmed",
                );
              store.put("task", {
                ...task,
                status: "completed",
                version: task.version + 1,
                updated_at: now(),
              });
            }
            store.put("activity", activity);
            history(
              farmId,
              correctsId ? "correction" : "actual_work",
              activity.id,
              activity.kind,
              activity.description,
            );
            store.event(farmId, "activity_recorded", {
              record_id: activity.id,
            });
            return activity;
          }
          case "deferTask": {
            const d = c.operations.deferTask.input.parse(input);
            const task = load(
              store,
              "task",
              params.taskId ?? "",
              farmId,
              c.Task,
            );
            requireVersion(task, d.expected_version);
            if (task.status === "completed")
              throw new DomainError(
                "version_conflict",
                "Completed work cannot be deferred",
              );
            const updated = c.Task.parse({
              ...task,
              status: "deferred",
              due_at: d.until ?? task.due_at,
              version: task.version + 1,
              updated_at: now(),
            });
            store.put("task", updated);
            return updated;
          }
          case "listAlerts":
            return { items: store.list("alert", farmId), next_cursor: null };
          case "getAlert":
            return load(store, "alert", params.alertId ?? "", farmId, c.Alert);
          case "acknowledgeAlert":
          case "dismissAlert": {
            const alert = load(
              store,
              "alert",
              params.alertId ?? "",
              farmId,
              c.Alert,
            );
            const d = c.operations.acknowledgeAlert.input.parse(input);
            requireVersion(alert, d.expected_version);
            const updated = c.Alert.parse({
              ...alert,
              status:
                name === "acknowledgeAlert" ? "acknowledged" : "dismissed",
              version: alert.version + 1,
              updated_at: now(),
            });
            store.put("alert", updated);
            store.event(farmId, "alert_changed", { record_id: updated.id });
            return updated;
          }
          case "listActivity": {
            const d = c.operations.listActivity.input.parse(input);
            return {
              items: store.list("history", farmId).filter((raw) => {
                const h = c.HistoryEntry.parse(raw);
                return (
                  (!d.kind || h.kind === d.kind) &&
                  (!d.role_key || h.role_key === d.role_key)
                );
              }),
              next_cursor: null,
            };
          }
          case "recordOutcome": {
            const d = c.operations.recordOutcome.input.parse(input);
            if (d.activity_id)
              load(store, "activity", d.activity_id, farmId, c.Activity);
            if (d.finding_id)
              load(store, "finding", d.finding_id, farmId, c.Finding);
            return history(
              farmId,
              "outcome",
              d.activity_id ?? d.finding_id ?? farmId,
              "Farmer-reported outcome",
              d.description,
            );
          }
          case "correctOutcome": {
            const d = c.operations.correctOutcome.input.parse(input);
            const original = load(
              store,
              "history",
              params.outcomeId ?? "",
              farmId,
              c.HistoryEntry,
            );
            requireVersion(original, d.expected_version);
            if (original.kind !== "outcome")
              throw new DomainError(
                "validation",
                "Only outcomes use this correction path",
              );
            const updated = {
              ...original,
              version: original.version + 1,
              summary: d.description,
              updated_at: now(),
            };
            store.put("history", updated);
            return history(
              farmId,
              "correction",
              original.id,
              "Outcome corrected",
              d.description,
            );
          }
          default:
            throw new DomainError(
              "unavailable",
              "Operation is not implemented in domain service",
            );
        }
      });
    },
  };
}
export function actualLedger(store: Store, farmId: string) {
  const activities = store
    .list("activity", farmId)
    .map((x) => c.Activity.parse(x));
  const corrected = new Set(
    activities.flatMap((x) => (x.corrects_id ? [x.corrects_id] : [])),
  );
  const current = activities.filter((x) => !corrected.has(x.id));
  let water = 0;
  let unknownWater = false;
  const money: cMoney[] = [];
  for (const activity of current) {
    if (activity.kind === "irrigation") {
      if (activity.quantity?.kind === "known")
        water +=
          convertQuantity(activity.quantity, "m3").kind === "known"
            ? (convertQuantity(activity.quantity, "m3") as { value: number })
                .value
            : 0;
      else unknownWater = true;
    }
    if (
      (activity.kind === "sale" || activity.kind === "spending") &&
      activity.money
    )
      money.push({
        ...activity.money,
        minor_units:
          activity.kind === "spending"
            ? -activity.money.minor_units
            : activity.money.minor_units,
      });
  }
  return { water_m3: unknownWater ? null : water, cash: moneyTotal(money) };
}
