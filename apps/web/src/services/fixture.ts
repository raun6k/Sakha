import * as c from "@sakha/contracts";
import {
  fixtureSettings,
  fixtureTime,
  responseExamples,
} from "@sakha/contracts/examples";
import { ServiceError } from "./http";
import { supportsRequestedInterval } from "./series";

const roleCopy: Record<
  c.RoleKey,
  {
    name: string;
    label: string;
    description: string;
    questions: string[];
    sources: string[];
  }
> = {
  sakha: {
    name: "Sakha",
    label: "Ask Sakha",
    description: "Your farm team lead. One reviewed plan from the teammates.",
    questions: [
      "What should I focus on this week?",
      "Help me review my farming plan.",
    ],
    sources: [],
  },
  megha: {
    name: "Megha",
    label: "Weather and El Niño",
    description: "Forecasts, monsoon, and El Niño, each with a source.",
    questions: [
      "Will it rain this week?",
      "What does El Niño mean for this season?",
    ],
    sources: ["C01", "W01", "W03", "W04"],
  },
  jal: {
    name: "Jal",
    label: "Water",
    description: "When to irrigate, using a dated rain source.",
    questions: [
      "Should I irrigate or wait?",
      "What water measurements do I need?",
    ],
    sources: ["W03", "W04"],
  },
  kheti: {
    name: "Kheti",
    label: "Crops and soil",
    description: "Sowing, stage, pests, and contingency crops.",
    questions: [
      "What should I record about my crop?",
      "What can I sow this season?",
    ],
    sources: ["A01"],
  },
  paisa: {
    name: "Paisa",
    label: "Money and mandi",
    description: "Mandi prices, costs, and public schemes from dated sources.",
    questions: ["Should I sell now?", "Which scheme page should I read?"],
    sources: ["M01", "G01"],
  },
};
export function createFixtureService(
  options: { setup?: boolean; failure?: string } = {},
): c.SakhaService {
  let sequence = 100;
  const makeId = () => `fixture-${++sequence}`;
  const base = (id = makeId()) => ({
    id,
    farm_id: "fixture-farm",
    version: 1,
    created_at: fixtureTime,
    updated_at: fixtureTime,
  });
  let farm = c.Farm.parse({
    ...base("fixture-farm"),
    name: "Demonstration farm",
    location: { country: "India", state: "Maharashtra", district: "Nagpur" },
    setup_complete: options.setup !== false,
  });
  let settings = { ...fixtureSettings };
  const provenance: c.Fact["provenance"] = {
    origin: "fixture",
    attribution: "Synthetic demonstration",
    effective_at: fixtureTime,
    effective_time_precision: "exact",
    evidence: [],
  };
  let facts: c.Fact[] = [
    c.Fact.parse({
      ...base(),
      category: "F03",
      key: "situation",
      value: "planning",
      provenance,
    }),
    c.Fact.parse({
      ...base(),
      category: "F04",
      key: "water_source",
      value: "Rain",
      provenance,
    }),
    c.Fact.parse({
      ...base(),
      category: "F04",
      key: "water_availability",
      value: { kind: "qualitative", text: "some" },
      provenance,
    }),
  ];
  const roles = c.roles.map((key, index) =>
    c.Role.parse({
      key,
      id: `A${index}`,
      ...roleCopy[key],
      help: [
        roleCopy[key].description,
        "Explain missing inputs and evidence limitations.",
      ],
      source_ids: roleCopy[key].sources,
      limitations: [
        "Synthetic demonstration only; no real agricultural recommendation.",
        "Actual capability depends on supported sources and runtime.",
      ],
      capabilities: [
        {
          key: "chat",
          status: "enabled",
          reason: "Synthetic event adapter only",
          requirements: [],
        },
        {
          key: "photo_upload",
          status: "disabled",
          reason: "Not enabled in this demo",
          requirements: [],
        },
        {
          key: "image_analysis",
          status: "disabled",
          reason: "No diagnosis adapter selected",
          requirements: [],
        },
      ],
    }),
  );
  const prefs: Record<string, c.Preferences> = {};
  let conversations: c.Conversation[] = [];
  let messages: c.Message[] = [];
  const runs: c.Run[] = [];
  let consents: c.Consent[] = [];
  let history: c.HistoryEntry[] = [];
  const activities: c.Activity[] = [];
  const jobs: c.Job[] = [];
  const scenarios: c.Scenario[] = [];
  let tasks: c.Task[] = [
    c.Task.parse({
      ...base("fixture-task"),
      title: "Inspect and record crop condition",
      description:
        "A synthetic planning task, not an agronomic recommendation.",
      role_key: "kheti",
      status: "proposed",
      evidence: [],
    }),
  ];
  let revisions: c.PlanRevision[] = [
    c.PlanRevision.parse({
      ...base("fixture-proposal"),
      status: "proposed",
      title: "Prepare your recorded farm context",
      summary:
        "Synthetic demonstration proposal. Inspect the crop and record what you actually observe.",
      cost_inr: 100,
      benefit_inr: 200,
      tasks,
      findings: [],
      evidence: [],
      constraints: [],
      assumptions: [
        "This is a demonstration workflow, not a field recommendation.",
      ],
      missing_inputs: [],
    }),
  ];
  const alerts: c.Alert[] = [
    c.Alert.parse({
      ...base("fixture-alert"),
      title: "Crop observation needed",
      summary:
        "Synthetic reminder: record what you can see. No weather warning is asserted.",
      severity: "information",
      role_key: "kheti",
      status: "active",
      evidence: [],
      issued_at: fixtureTime,
      freshness: { status: "unknown", reason: "Synthetic reminder" },
    }),
  ];
  const sources = c.Source.array().parse([
    {
      id: "C01",
      name: "NOAA RONI",
      url: "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v6.php",
      definition:
        "Relative Oceanic Niño Index. Synthetic example values below are not retrieved observations.",
      geography: "Tropical Pacific",
      capability: { key: "C01", status: "declared", requirements: [] },
      freshness: { status: "missing" },
    },
    {
      id: "W03",
      name: "CHIRPS v3 historical rainfall",
      url: "https://www.chc.ucsb.edu/data/chirps3",
      definition: "Gridded rainfall estimates; not a field rain gauge.",
      geography: "Source coverage applies",
      capability: { key: "W03", status: "declared", requirements: [] },
      freshness: { status: "missing" },
    },
    {
      id: "W04",
      name: "CHIRPS3-GEFS rainfall outlook",
      url: "https://www.chc.ucsb.edu/data/chirps3-gefs",
      definition: "Forecast rainfall within the actual supported horizon.",
      geography: "Source coverage applies",
      capability: { key: "W04", status: "declared", requirements: [] },
      freshness: { status: "missing" },
    },
  ]);
  const series: c.Series[] = sources.map((source, index) =>
    c.Series.parse({
      id: `fixture-series-${index}`,
      source_id: source.id,
      snapshot_id: `fixture-snapshot-${index}`,
      evidence_id: `fixture-evidence-${index}`,
      method_version: "synthetic.v1",
      variable:
        index === 0
          ? "RONI"
          : index === 1
            ? "Historical rainfall"
            : "Rainfall outlook",
      unit: index === 0 ? "°C" : "mm/day",
      kind: index === 2 ? "forecast" : "observed",
      geography: "Synthetic example geography",
      resolution:
        index === 0 ? "Regional climate index" : "Gridded estimate example",
      supported_range: {
        from: "2026-10-01T00:00:00Z",
        to: "2026-10-10T00:00:00Z",
      },
      freshness: { status: "unknown", reason: "Synthetic values" },
      completeness: "partial",
      points: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
        time: `2026-10-${String(n + 1).padStart(2, "0")}T00:00:00Z`,
        value:
          n === 4
            ? null
            : index === 0
              ? (n - 4) * 0.15
              : [2, 5, 0, 8, 0, 12, 4, 7, 3, 1][n],
      })),
      origin: "fixture",
    }),
  );
  series.push(
    c.Series.parse({
      id: "fixture-monthly-rainfall",
      source_id: "W03",
      snapshot_id: "fixture-monthly-snapshot",
      evidence_id: "fixture-monthly-evidence",
      method_version: "synthetic.monthly.v1",
      variable: "Monthly historical rainfall",
      unit: "mm/month",
      kind: "observed",
      geography: "Synthetic example geography",
      resolution: "Gridded estimate example",
      supported_range: {
        from: "2025-10-01T00:00:00Z",
        to: "2026-09-01T00:00:00Z",
      },
      freshness: {
        status: "unknown",
        reason: "Synthetic values, not publication coverage",
      },
      completeness: "partial",
      origin: "fixture",
      points: Array.from({ length: 12 }, (_, i) => ({
        time: new Date(Date.UTC(2025, 9 + i, 1)).toISOString(),
        value: i === 4 ? null : 30 + i * 8,
      })),
    }),
  );
  const listeners = new Set<(event: c.Event) => void>();
  const replay: c.Event[] = [];
  const emitted = (
    type: c.Event["type"],
    run_id: string,
    payload: c.Event["payload"],
  ) => {
    const event: c.Event = {
      schema_version: c.CONTRACT_VERSION,
      cursor: makeId(),
      farm_id: farm.id,
      type,
      run_id,
      timestamp: fixtureTime,
      correlation_id: run_id,
      payload,
    };
    replay.push(event);
    for (const callback of listeners) callback(event);
  };
  const resultPage = <T>(items: T[]) => ({ items, next_cursor: null });
  const plan = () => ({
    farm_id: farm.id,
    active_revision: revisions.find((r) => r.status === "approved") ?? null,
    proposed_revisions: revisions.filter((r) =>
      ["proposed", "changes_requested"].includes(r.status),
    ),
  });
  const commandResults = new Map<string, { hash: string; result: unknown }>();
  function perform(
    name: c.OperationName,
    input: Record<string, unknown>,
    params: Record<string, string>,
  ): unknown {
    const find = <T extends { id: string }>(
      items: T[],
      id: string | undefined,
    ) => {
      const item = items.find((x) => x.id === id);
      if (!item)
        throw new ServiceError({
          code: "not_found",
          message: "The demonstration record is no longer available.",
          retryable: false,
          request_id: "fixture",
        });
      return item;
    };
    const version = (record: { version: number }) => {
      if (input.expected_version !== record.version)
        throw new ServiceError({
          code: "version_conflict",
          message:
            "This record changed. Reload and review it before trying again.",
          retryable: false,
          request_id: "fixture",
        });
    };
    switch (name) {
      case "health":
        return { status: "ok" };
      case "bootstrap":
        return {
          schema_version: c.CONTRACT_VERSION,
          session_token: "fixture-session",
          readiness: farm.setup_complete ? "ready" : "setup_required",
          farms: [farm],
          settings,
          capabilities: [],
          supported_languages: ["en"],
          supported_units: ["ha", "acre", "mm", "kg", "INR"],
        };
      case "createFarm":
        farm = c.Farm.parse({
          ...base("fixture-farm"),
          ...input,
          setup_complete: false,
        });
        return farm;
      case "getFarm":
        return farm;
      case "updateFarm":
        version(farm);
        farm = c.Farm.parse({ ...farm, ...input, version: farm.version + 1 });
        return farm;
      case "completeSetup":
        version(farm);
        facts = [
          ...facts,
          ...(input.facts as c.Fact[]).map((f) =>
            c.Fact.parse({ ...base(), ...f }),
          ),
        ];
        farm = { ...farm, setup_complete: true, version: farm.version + 1 };
        if (input.settings) settings = c.Settings.parse(input.settings);
        return farm;
      case "listFacts":
        return resultPage(facts);
      case "saveFact":
      case "saveObservation": {
        const fact = c.Fact.parse({ ...base(), ...input });
        facts.push(fact);
        history.push(
          c.HistoryEntry.parse({
            ...base(),
            kind: "correction",
            title: `Saved ${fact.key.replaceAll("_", " ")}`,
            summary: "Synthetic reported farm context",
            record_id: fact.id,
          }),
        );
        return fact;
      }
      case "correctFact": {
        const old = find(facts, params.factId);
        version(old);
        const fact = c.Fact.parse({ ...base(), ...input, corrects_id: old.id });
        facts = facts.filter((f) => f.id !== old.id);
        facts.push(fact);
        return fact;
      }
      case "getSettings":
        return settings;
      case "updateSettings":
        if (input.version !== settings.version)
          throw new ServiceError({
            code: "version_conflict",
            message: "Settings changed. Reload to review.",
            retryable: false,
            request_id: "fixture",
          });
        settings = c.Settings.parse({
          ...settings,
          ...input,
          version: settings.version + 1,
        });
        return settings;
      case "listAgents":
        return roles;
      case "getAgent":
        return roles.find((r) => r.key === params.roleKey);
      case "getPreferences":
        return (
          prefs[params.roleKey ?? ""] ??
          c.Preferences.parse({
            role_key: params.roleKey,
            version: 1,
            explanation: "inherit",
          })
        );
      case "updatePreferences": {
        const old = prefs[params.roleKey ?? ""];
        if (old && old.version !== input.version)
          throw new Error("Preferences changed. Reload.");
        const p = c.Preferences.parse({
          ...input,
          version: Number(input.version) + 1,
        });
        prefs[p.role_key] = p;
        return p;
      }
      case "listConversations":
        return resultPage(
          conversations.filter(
            (x) => !input.role_key || x.role_key === input.role_key,
          ),
        );
      case "createConversation": {
        const conversation = c.Conversation.parse({ ...base(), ...input });
        conversations.push(conversation);
        return conversation;
      }
      case "getConversation":
        return find(conversations, params.conversationId);
      case "listMessages":
        return resultPage(
          messages.filter((x) => x.conversation_id === params.conversationId),
        );
      case "submitTurn": {
        const conversation = find(conversations, params.conversationId);
        const run = c.Run.parse({
          ...base(),
          conversation_id: conversation.id,
          role_key: conversation.role_key,
          state: "queued",
          pending: [],
          capabilities: [
            { key: "cancel", status: "enabled", requirements: [] },
          ],
        });
        runs.push(run);
        messages.push(
          c.Message.parse({
            ...base(),
            conversation_id: conversation.id,
            role_key: conversation.role_key,
            author: "farmer",
            text: input.text,
            status: "final",
            context: {
              fact_versions: Object.fromEntries(
                facts.map((f) => [f.id, f.version]),
              ),
              evidence: input.evidence ?? [],
            },
          }),
        );
        setTimeout(() => {
          if (run.state === "cancelled") return;
          run.state = "running";
          emitted("run_state", run.id, { state: "running" });
          emitted("run_progress", run.id, {
            text: "Reviewing the synthetic farm context",
          });
          emitted("text_batch", run.id, {
            text: "This is a synthetic demonstration response. ",
            sequence: 1,
          });
          setTimeout(() => {
            if (run.state === "cancelled") return;
            const message = c.Message.parse({
              ...base(),
              conversation_id: conversation.id,
              role_key: conversation.role_key,
              author: "agent",
              text: "**Demonstration response**\n\nThis turn shows the conversation workflow. Real advice requires a configured runtime and supported evidence.\n\nYour farm facts, proposed plans and completed work remain distinct. You can inspect recorded context in My Farm or review the synthetic proposal in Farm Plan.",
              status: "final",
              context: {
                fact_versions: Object.fromEntries(
                  facts.map((f) => [f.id, f.version]),
                ),
                evidence: [],
              },
            });
            messages.push(message);
            run.state = "completed";
            run.version++;
            emitted("message_final", run.id, { message });
            emitted("run_state", run.id, { state: "completed" });
          }, 350);
        }, 150);
        return run;
      }
      case "listRuns":
        return resultPage(
          runs.filter(
            (r) =>
              !input.conversation_id ||
              r.conversation_id === input.conversation_id,
          ),
        );
      case "getRun":
        return find(runs, params.runId);
      case "cancelRun": {
        const run = find(runs, params.runId);
        version(run);
        run.state = "cancelled";
        run.version++;
        emitted("run_state", run.id, { state: "cancelled" });
        return run;
      }
      case "resumeRun":
      case "answerClarification":
      case "respondApproval": {
        const run = find(runs, params.runId);
        version(run);
        run.state = "completed";
        run.version++;
        return run;
      }
      case "getHome":
        return {
          farm,
          sections: {
            briefing: {
              summary:
                "Review your recorded farm context and choose the next useful action.",
              freshness: { status: "unknown" },
            },
            context: facts,
            climate: [],
            weather: [],
            actions: tasks,
            agents: roles,
            plan: plan(),
          },
          alerts,
          insights: { series, capabilities: [], missing_inputs: [] },
          capabilities: [],
        };
      case "getInsights":
        return {
          series: series
            .filter(
              (x) =>
                !input.series ||
                x.source_id === input.series ||
                x.variable === input.series,
            )
            .filter(
              (x) =>
                !input.range ||
                supportsRequestedInterval(x, String(input.range)),
            ),
          capabilities: [],
          missing_inputs: [],
        };
      case "listSources":
        return sources;
      case "getSource":
        return (
          sources.find((s) => s.id === params.sourceId) ??
          responseExamples.getSource
        );
      case "getEvidence": {
        const s = series.find((s) => s.evidence_id === params.evidenceId);
        return c.Evidence.parse({
          ...base(params.evidenceId),
          source_id: s?.source_id ?? "C01",
          snapshot_id: s?.snapshot_id ?? "fixture-snapshot",
          title: "Synthetic chart evidence",
          text: "Values were authored for interface verification. No live observation or forecast is asserted.",
          retrieved_at: fixtureTime,
          geography: s?.geography ?? "Synthetic",
          resolution: s?.resolution,
          unit: s?.unit,
          kind: s?.kind === "forecast" ? "forecast" : "observation",
          origin: "fixture",
          hash: "synthetic",
          method_version: "synthetic.v1",
          citation: {},
        });
      }
      case "listFindings":
        return resultPage([]);
      case "getPlan":
        return plan();
      case "listPlanRevisions":
        return resultPage(revisions);
      case "getPlanRevision":
        return find(revisions, params.revisionId);
      case "createPlanRevision": {
        const revision = c.PlanRevision.parse({
          ...base(),
          ...input,
          status: "proposed",
        });
        revisions.push(revision);
        return revision;
      }
      case "decidePlan": {
        const revision = find(revisions, params.revisionId);
        version(revision);
        if ((plan().active_revision?.id ?? null) !== input.base_revision_id)
          throw new Error(
            "The approved plan changed. Review the proposal again.",
          );
        revision.status =
          input.decision === "approve"
            ? "approved"
            : input.decision === "reject"
              ? "rejected"
              : "changes_requested";
        revision.version++;
        if (revision.status === "approved") {
          revisions = revisions.map((r) =>
            r.id !== revision.id && r.status === "approved"
              ? { ...r, status: "superseded" }
              : r,
          );
          tasks = revision.tasks.map((t) => ({
            ...t,
            status: "pending",
            plan_revision_id: revision.id,
          }));
        }
        history.push(
          c.HistoryEntry.parse({
            ...base(),
            kind: "plan_decision",
            title: `Plan ${revision.status}`,
            summary: "Farmer decision; no work recorded.",
            record_id: revision.id,
          }),
        );
        return revision;
      }
      case "listTasks":
        return resultPage(tasks);
      case "deferTask": {
        const task = find(tasks, params.taskId);
        version(task);
        task.status = "deferred";
        task.version++;
        return task;
      }
      case "getActivity":
        return find(activities, params.activityId);
      case "getOutcome":
        return find(history, params.outcomeId);
      case "recordActivity":
      case "correctActivity": {
        if (name === "correctActivity")
          version(find(activities, params.activityId));
        const activity = c.Activity.parse({
          ...base(),
          ...input,
          corrects_id:
            name === "correctActivity" ? params.activityId : undefined,
        });
        activities.push(activity);
        if (activity.task_id) {
          const task = find(tasks, activity.task_id);
          task.status = "completed";
          task.version++;
        }
        history.push(
          c.HistoryEntry.parse({
            ...base(),
            kind: name === "correctActivity" ? "correction" : "actual_work",
            title: activity.description,
            summary: `Reported actual ${activity.kind}; effective ${activity.effective_at}`,
            record_id: activity.id,
          }),
        );
        return activity;
      }
      case "listAlerts":
        return resultPage(alerts);
      case "getAlert":
        return find(alerts, params.alertId);
      case "acknowledgeAlert":
      case "dismissAlert": {
        const alert = find(alerts, params.alertId);
        version(alert);
        alert.status =
          name === "acknowledgeAlert" ? "acknowledged" : "dismissed";
        alert.version++;
        return alert;
      }
      case "listActivity":
        return resultPage(
          history.filter((h) => !input.kind || h.kind === input.kind),
        );
      case "recordOutcome":
      case "correctOutcome": {
        if (name === "correctOutcome") version(find(history, params.outcomeId));
        const outcome = c.HistoryEntry.parse({
          ...base(),
          kind: name === "recordOutcome" ? "outcome" : "correction",
          title: input.description,
          summary: "Synthetic farmer report",
          record_id: "pending",
        });
        outcome.record_id = outcome.id;
        history.push(outcome);
        return outcome;
      }
      case "listConsents":
        return resultPage(consents);
      case "grantConsent": {
        const grant = c.Consent.parse({
          ...base(),
          ...input,
          status: "active",
        });
        consents.push(grant);
        return grant;
      }
      case "revokeConsent": {
        const grant = find(consents, params.grantId);
        version(grant);
        grant.status = "revoked";
        grant.version++;
        return grant;
      }
      case "createScenario": {
        const request = c.ScenarioRequest.parse(input);
        const scenario = c.Scenario.parse({
          ...base(),
          request,
          status: "needs_information",
          results: {
            note: "Demonstration scenario. Sourced methods and supported inputs are required before calculating.",
          },
          constraints: [],
          missing_inputs: ["Supported source evidence and method"],
          method_version: "synthetic.v1",
          origin: "fixture",
        });
        scenarios.push(scenario);
        return scenario;
      }
      case "getScenario":
        return find(scenarios, params.scenarioId);
      case "requestExport":
      case "requestDeletion": {
        const job = c.Job.parse({
          ...base(),
          kind: name === "requestExport" ? "export" : "deletion",
          status: "queued",
          progress: "Synthetic lifecycle job queued",
        });
        jobs.push(job);
        setTimeout(() => {
          job.status = "completed";
          job.progress = "Synthetic job completed";
          if (name === "requestDeletion" && input.scope === "farm") {
            farm = { ...farm, setup_complete: false };
            facts = [];
            conversations = [];
            messages = [];
            tasks = [];
            revisions = [];
            history = [];
            consents = [];
          }
        }, 300);
        return job;
      }
      case "getExport":
      case "getDeletion":
        return find(jobs, params.jobId);
      case "listFields":
        return resultPage([]);
      default:
        return responseExamples[name];
    }
  }
  return {
    async execute<K extends c.OperationName>(
      name: K,
      request: c.ServiceRequest<K>,
    ): Promise<c.OperationOutput<K>> {
      if (options.failure === name)
        throw new ServiceError({
          code: "unavailable",
          message: "Synthetic request failure. Your draft is preserved.",
          retryable: true,
          request_id: "fixture-failure",
        });
      const op = c.operations[name];
      const input = op.input.parse(request.input);
      const key = request.command?.idempotency_key;
      const hash = JSON.stringify({ name, input, params: request.params });
      const cached = key ? commandResults.get(key) : undefined;
      if (cached) {
        if (cached.hash !== hash)
          throw new ServiceError({
            code: "idempotency_conflict",
            message: "Command identity reused with different content.",
            retryable: false,
            request_id: "fixture",
          });
        return structuredClone(cached.result) as c.OperationOutput<K>;
      }
      const result = op.output.parse(
        perform(name, input as Record<string, unknown>, request.params ?? {}),
      );
      if (key)
        commandResults.set(key, { hash, result: structuredClone(result) });
      return structuredClone(result) as c.OperationOutput<K>;
    },
    subscribe(_farm, cursor, onEvent, _onError, onConnection) {
      onConnection?.("connected");
      if (cursor) {
        const index = replay.findIndex((e) => e.cursor === cursor);
        for (const event of replay.slice(index + 1)) onEvent(event);
      }
      listeners.add(onEvent);
      return () => {
        listeners.delete(onEvent);
      };
    },
  };
}
