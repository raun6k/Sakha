import * as c from "./index.js";
/** Synthetic contract examples only. Never import into live persistence. */
export const fixtureTime = "2026-10-10T06:00:00Z";
const base = {
  id: "fixture-record",
  farm_id: "fixture-farm",
  version: 1,
  created_at: fixtureTime,
  updated_at: fixtureTime,
};
export const fixtureSettings = c.Settings.parse({
  version: 1,
  language: "en",
  area_unit: "ha",
  temperature_unit: "celsius",
  currency: "INR",
  explanation: "simple",
  reduced_motion: false,
  notifications: true,
});
export const fixtureFarm = c.Farm.parse({
  ...base,
  id: "fixture-farm",
  name: "Synthetic demonstration farm",
  setup_complete: true,
});
export const fixtureProvenance = c.Provenance.parse({
  origin: "fixture",
  attribution: "Synthetic contract fixture",
  effective_at: fixtureTime,
  evidence: [],
});
const quantity = {
  kind: "unknown",
  reason: "No measured quantity supplied",
} as const;
const freshness = {
  status: "missing",
  reason: "Synthetic example has no live evidence",
} as const;
export const fixtureRoles = c.roles.map((key, index) =>
  c.Role.parse({
    key,
    id: `A${index}`,
    name: key.replaceAll("_", " "),
    label: key.replaceAll("_", " "),
    description: "Synthetic role presentation example",
    help: ["Explore saved farm context"],
    questions: ["What information is needed?"],
    limitations: ["Not a live agent response"],
    source_ids: [],
    capabilities: [
      {
        key: "chat",
        status: "disabled",
        reason: "Synthetic fixture mode",
        requirements: [],
      },
    ],
  }),
);
const fact = c.Fact.parse({
  ...base,
  key: "water_availability",
  category: "F04",
  value: quantity,
  provenance: fixtureProvenance,
});
const field = c.Field.parse({ ...base, name: "Example field", area: quantity });
const preferences = c.Preferences.parse({
  version: 1,
  role_key: "water",
  explanation: "inherit",
});
const consent = c.Consent.parse({
  ...base,
  purpose: "financial planning",
  fields: ["budget"],
  roles: ["farm_finance"],
  external_processing: false,
  status: "active",
  storage: "persistent",
});
const conversation = c.Conversation.parse({
  ...base,
  role_key: "water",
  title: "Synthetic conversation",
});
const message = c.Message.parse({
  ...base,
  conversation_id: base.id,
  role_key: "water",
  author: "agent",
  text: "Synthetic example: please report the available water.",
  status: "final",
  context: { fact_versions: {}, evidence: [] },
});
const run = c.Run.parse({
  ...base,
  conversation_id: base.id,
  role_key: "water",
  state: "interrupted",
  pending: [],
  capabilities: [],
  failure: { code: "interrupted", message: "Illustrative interrupted runtime" },
});
const finding = c.Finding.parse({
  ...base,
  role_key: "water",
  title: "Water measurement needed",
  summary: "No water feasibility claim can be made.",
  evidence: [],
  assumptions: [],
  missing_inputs: ["available water"],
  constraints: [],
  freshness,
  origin: "fixture",
});
const scenarioRequest = c.ScenarioRequest.parse({
  farm_id: base.farm_id,
  role_key: "water",
  kind: "water_budget",
  inputs: { water: quantity },
  assumptions: [],
  evidence: [],
});
const scenario = c.Scenario.parse({
  ...base,
  request: scenarioRequest,
  status: "needs_information",
  results: { water: quantity },
  constraints: [],
  missing_inputs: ["measured water", "sourced crop coefficient"],
  method_version: "unavailable.v1",
  origin: "fixture",
});
const task = c.Task.parse({
  ...base,
  title: "Report available water",
  description: "Measure or report qualitative availability.",
  role_key: "water",
  status: "pending",
  evidence: [],
});
const revision = c.PlanRevision.parse({
  ...base,
  status: "proposed",
  title: "Review missing farm information",
  summary: "Illustrative proposal only",
  tasks: [task],
  findings: [],
  evidence: [],
  constraints: [],
  assumptions: [],
  missing_inputs: ["water"],
});
const plan = c.Plan.parse({
  farm_id: base.farm_id,
  active_revision: null,
  proposed_revisions: [revision],
});
const activity = c.Activity.parse({
  ...base,
  kind: "other",
  description: "Synthetic farmer work confirmation",
  confirmed_by: "farmer",
  effective_at: fixtureTime,
  quantity,
  provenance: fixtureProvenance,
});
const alert = c.Alert.parse({
  ...base,
  title: "Example information alert",
  summary: "No weather warning is asserted.",
  severity: "information",
  role_key: "weather",
  status: "acknowledged",
  evidence: [],
  issued_at: fixtureTime,
  freshness,
});
const source = c.Source.parse({
  id: "C01",
  name: "NOAA RONI",
  url: "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v6.php",
  definition: "Relative Oceanic Nino Index; metadata example only",
  geography: "Tropical Pacific",
  capability: {
    key: "C01",
    status: "declared",
    requirements: ["Parser validation"],
  },
  freshness,
});
const evidence = c.Evidence.parse({
  ...base,
  source_id: "C01",
  snapshot_id: "fixture-snapshot",
  title: "Synthetic evidence example",
  text: "Illustrative content only",
  retrieved_at: fixtureTime,
  geography: "Unspecified",
  kind: "guidance",
  origin: "fixture",
  hash: "fixture-hash",
  method_version: "fixture.v1",
  citation: {},
});
const series = c.Series.parse({
  id: "fixture-series",
  source_id: "C01",
  snapshot_id: "fixture-snapshot",
  evidence_id: base.id,
  method_version: "fixture.v1",
  variable: "RONI",
  unit: "degC",
  kind: "observed",
  geography: "Tropical Pacific",
  resolution: "regional index",
  supported_range: { from: fixtureTime, to: fixtureTime },
  freshness,
  completeness: "missing",
  points: [{ time: fixtureTime, value: null }],
  origin: "fixture",
});
const insights = c.Insights.parse({
  series: [series],
  capabilities: [],
  missing_inputs: ["validated source"],
});
const history = c.HistoryEntry.parse({
  ...base,
  kind: "actual_work",
  title: "Example confirmed work",
  summary: "Fixture entry",
  record_id: base.id,
});
const job = c.Job.parse({
  ...base,
  kind: "export",
  status: "queued",
  progress: "Queued is not completed",
});
const attachment = c.Attachment.parse({
  ...base,
  name: "example.jpg",
  media_type: "image/jpeg",
  size_bytes: 0,
  hash: "fixture-hash",
  analysis_capability: {
    key: "image_analysis",
    status: "disabled",
    requirements: [],
  },
});
const home = c.Home.parse({
  farm: fixtureFarm,
  sections: {
    briefing: { summary: "Synthetic demonstration", freshness },
    context: [fact],
    climate: [],
    weather: [],
    actions: [task],
    agents: fixtureRoles,
    plan,
  },
  alerts: [alert],
  insights,
  capabilities: [],
});
const bootstrap = c.Bootstrap.parse({
  schema_version: c.CONTRACT_VERSION,
  session_token: "fixture-session",
  readiness: "ready",
  farms: [fixtureFarm],
  settings: fixtureSettings,
  capabilities: [],
  supported_languages: ["en"],
  supported_units: ["ha", "acre", "mm", "m3", "kg", "INR"],
});
const paged = <T>(item: T) => ({ items: [item], next_cursor: null });
/** Each endpoint has a concrete response validated by the exported contract. */
export const responseExamples: Record<c.OperationName, unknown> = {
  health: { status: "ok" },
  bootstrap,
  createFarm: fixtureFarm,
  completeSetup: fixtureFarm,
  getFarm: fixtureFarm,
  updateFarm: fixtureFarm,
  listFields: paged(field),
  createField: field,
  updateField: field,
  listFacts: paged(fact),
  saveFact: fact,
  correctFact: fact,
  saveObservation: fact,
  getSettings: fixtureSettings,
  updateSettings: fixtureSettings,
  getPreferences: preferences,
  updatePreferences: preferences,
  listConsents: paged(consent),
  grantConsent: consent,
  revokeConsent: { ...consent, status: "revoked" },
  listAgents: fixtureRoles,
  getAgent: fixtureRoles[5],
  listConversations: paged(conversation),
  createConversation: conversation,
  getConversation: conversation,
  listMessages: paged(message),
  submitTurn: { ...run, state: "queued", failure: undefined },
  listRuns: paged(run),
  getRun: run,
  cancelRun: { ...run, state: "cancelled" },
  resumeRun: { ...run, state: "queued" },
  answerClarification: run,
  respondApproval: run,
  getHome: home,
  listSources: [source],
  getSource: source,
  getEvidence: evidence,
  getInsights: insights,
  listFindings: paged(finding),
  getFinding: finding,
  createScenario: scenario,
  getScenario: scenario,
  getPlan: plan,
  listPlanRevisions: paged(revision),
  createPlanRevision: revision,
  getPlanRevision: revision,
  decidePlan: { ...revision, status: "changes_requested" },
  listTasks: paged(task),
  getActivity: activity,
  getOutcome: { ...history, kind: "outcome" },
  recordActivity: activity,
  correctActivity: { ...activity, corrects_id: "original" },
  deferTask: { ...task, status: "deferred" },
  listAlerts: paged(alert),
  getAlert: alert,
  acknowledgeAlert: alert,
  dismissAlert: { ...alert, status: "dismissed" },
  recordOutcome: { ...history, kind: "outcome" },
  correctOutcome: { ...history, kind: "correction" },
  listActivity: paged(history),
  requestExport: job,
  getExport: job,
  requestDeletion: { ...job, kind: "deletion" },
  getDeletion: { ...job, kind: "deletion" },
  uploadAttachment: attachment,
  getAttachment: attachment,
  deleteAttachment: { deleted: true },
};
export const scenarioExamples = c.ScenarioRequest.shape.kind.options.map(
  (kind) => c.ScenarioRequest.parse({ ...scenarioRequest, kind }),
);
export const errorExamples = c.ApiError.shape.code.options.map((code) =>
  c.ApiError.parse({
    code,
    message: `Synthetic ${code} example`,
    retryable: code === "runtime",
    request_id: "fixture-request",
  }),
);
export const eventExamples = c.Event.shape.type.options.map((type, index) =>
  c.Event.parse({
    schema_version: c.CONTRACT_VERSION,
    cursor: `fixture-${index}`,
    farm_id: base.farm_id,
    type,
    timestamp: fixtureTime,
    correlation_id: "fixture-correlation",
    payload:
      type === "resync_required"
        ? { reason: "Cursor outside retained range" }
        : {},
  }),
);
export const stateExamples = {
  missing: freshness,
  stale: { status: "stale", reason: "Past valid period" },
  partial: { ...series, completeness: "partial" },
  restricted: {
    code: "permission_denied",
    message: "Grant missing",
    retryable: false,
    request_id: "fixture-request",
  },
  interrupted: run,
  conflict: errorExamples.find((x) => x.code === "version_conflict"),
};
