import { z } from "zod";
export const CONTRACT_VERSION = "sakha.v1" as const;
const PublicSourceUrl = z
  .url()
  .refine(
    (value) => /^https?:\/\//i.test(value),
    "Public sources require an HTTP or HTTPS URL",
  );
export const Id = z.string().min(1).max(128);
export const Timestamp = z.iso.datetime({ offset: true });
export const RoleKey = z.enum([
  "chief_of_staff",
  "climate",
  "weather",
  "crop_planning",
  "crop_care",
  "water",
  "market",
  "farm_finance",
  "government_support",
]);
export type RoleKey = z.infer<typeof RoleKey>;
export const roles = RoleKey.options;
export const Scope = z.object({ farm_id: Id, field_id: Id.optional() });
export const Origin = z.enum([
  "live_source",
  "imported_source",
  "farmer_report",
  "derived_calculation",
  "agent_inference",
  "fixture",
]);
export const Capability = z.object({
  key: Id,
  status: z.enum([
    "declared",
    "disabled",
    "validating",
    "enabled",
    "degraded",
    "unavailable",
    "coming_soon",
  ]),
  reason: z.string().optional(),
  requirements: z.array(z.string()).default([]),
});
export const Freshness = z.object({
  status: z.enum(["fresh", "stale", "missing", "partial", "unknown"]),
  retrieved_at: Timestamp.optional(),
  valid_until: Timestamp.optional(),
  reason: z.string().optional(),
});
export const Quantity = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("known"),
    value: z.number().finite(),
    unit: z.string().min(1),
  }),
  z
    .object({
      kind: z.literal("range"),
      min: z.number().finite(),
      max: z.number().finite(),
      unit: z.string().min(1),
    })
    .refine((v) => v.min <= v.max, {
      message: "Minimum must not exceed maximum",
    }),
  z.object({
    kind: z.literal("qualitative"),
    text: z.string().min(1),
    unit: z.string().optional(),
  }),
  z.object({ kind: z.literal("unknown"), reason: z.string().min(1) }),
  z.object({ kind: z.literal("not_applicable"), reason: z.string().min(1) }),
]);
export type Quantity = z.infer<typeof Quantity>;
export const Money = z.object({
  minor_units: z.number().int().safe(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export const EvidenceRef = z.object({
  evidence_id: Id,
  source_id: Id,
  snapshot_id: Id,
  method_version: z.string().optional(),
});
export const Provenance = z.object({
  origin: Origin,
  attribution: z.string(),
  effective_at: Timestamp,
  effective_time_precision: z
    .enum(["exact", "date", "month", "approximate"])
    .default("exact"),
  original_effective_time: z.string().optional(),
  original_wording: z.string().optional(),
  original_unit: z.string().optional(),
  method_version: z.string().optional(),
  evidence: z.array(EvidenceRef).default([]),
});
export const RecordBase = Scope.extend({
  id: Id,
  version: z.number().int().positive(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export const Location = z.object({
  country: z.string(),
  state: z.string().optional(),
  district: z.string().optional(),
  village: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export const Farm = RecordBase.extend({
  name: z.string().min(1),
  location: Location.optional(),
  setup_complete: z.boolean(),
});
export const Field = RecordBase.extend({
  name: z.string().min(1),
  area: Quantity,
  crop: z.string().optional(),
});
export const Fact = RecordBase.extend({
  category: z.enum(["F01", "F02", "F03", "F04", "F05", "F06", "F07", "F08"]),
  key: z.string().min(1),
  value: z.union([Quantity, z.string(), z.boolean(), Money]),
  provenance: Provenance,
  corrects_id: Id.optional(),
  private: z.boolean().default(false),
});
export const Settings = z.object({
  version: z.number().int().positive(),
  language: z.literal("en"),
  area_unit: z.enum(["ha", "acre"]),
  temperature_unit: z.enum(["celsius", "fahrenheit"]),
  currency: z.literal("INR"),
  explanation: z.enum(["simple", "detailed"]),
  reduced_motion: z.boolean(),
  notifications: z.boolean(),
});
export const Preferences = z.object({
  version: z.number().int().positive(),
  role_key: RoleKey,
  explanation: z.enum(["inherit", "simple", "detailed"]),
  planning_horizon: z.enum(["month", "season", "year"]).optional(),
  temperature_unit: z.enum(["inherit", "celsius", "fahrenheit"]).optional(),
  crops_of_interest: z.array(z.string()).default([]),
  tracked_crop: z.string().optional(),
  check_in_frequency: z.enum(["daily", "weekly", "as_needed"]).optional(),
  water_description: z.enum(["simple", "detailed"]).optional(),
  assistance_interests: z.array(z.string()).default([]),
  priorities: z.array(z.string()).default([]),
  activities: z.array(z.string()).default([]),
  preferred_markets: z.array(z.string()).default([]),
  max_distance_km: z.number().nonnegative().optional(),
  produce_unit: z.enum(["kg", "quintal", "tonne", "bag"]).optional(),
  risk_preference: z.enum(["lower_risk", "balanced"]).optional(),
  notifications: z.boolean().optional(),
});
export const Consent = RecordBase.extend({
  purpose: z.string().min(1),
  fields: z.array(z.string()),
  roles: z.array(RoleKey),
  external_processing: z.boolean(),
  status: z.enum(["active", "revoked"]),
  storage: z.enum(["persistent", "session"]),
});
export const Role = z.object({
  key: RoleKey,
  id: z.string(),
  name: z.string(),
  label: z.string(),
  description: z.string(),
  help: z.array(z.string()),
  questions: z.array(z.string()),
  limitations: z.array(z.string()),
  source_ids: z.array(Id),
  capabilities: z.array(Capability),
});
export const RunState = z.enum([
  "queued",
  "running",
  "waiting_clarification",
  "waiting_approval",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export const Message = RecordBase.extend({
  conversation_id: Id,
  role_key: RoleKey,
  author: z.enum(["farmer", "agent", "system"]),
  text: z.string(),
  status: z.enum(["final", "partial", "interrupted"]),
  context: z.object({
    fact_versions: z.record(Id, z.number().int()),
    evidence: z.array(EvidenceRef),
    field_id: Id.optional(),
  }),
});
export const Conversation = RecordBase.extend({
  role_key: RoleKey,
  title: z.string(),
});
export const PendingRequest = z.object({
  id: Id,
  version: z.number().int().positive(),
  kind: z.enum(["clarification", "runtime_approval"]),
  question: z.string(),
  options: z.array(z.string()),
  status: z.enum(["pending", "answered", "expired"]),
  fact_key: z.string().optional(),
});
export const Run = RecordBase.extend({
  conversation_id: Id,
  role_key: RoleKey,
  state: RunState,
  progress: z.string().optional(),
  pending: z.array(PendingRequest),
  failure: z.object({ code: z.string(), message: z.string() }).optional(),
  capabilities: z.array(Capability),
});
export const Constraint = z.object({
  key: Id,
  label: z.string(),
  status: z.enum(["satisfied", "failed", "unknown", "not_applicable"]),
  critical: z.boolean(),
  reason: z.string(),
  evidence: z.array(EvidenceRef),
});
export const Finding = RecordBase.extend({
  role_key: RoleKey,
  title: z.string(),
  summary: z.string(),
  evidence: z.array(EvidenceRef),
  assumptions: z.array(z.string()),
  missing_inputs: z.array(z.string()),
  constraints: z.array(Constraint),
  freshness: Freshness,
  origin: Origin,
});
export const ScenarioRequest = Scope.extend({
  role_key: RoleKey,
  kind: z.enum([
    "seasonal_risk",
    "crop_comparison",
    "planting_plan",
    "crop_care",
    "water_budget",
    "irrigation_allocation",
    "market_proceeds",
    "sale_storage",
    "crop_budget",
    "financial_comparison",
    "scheme_checklist",
  ]),
  inputs: z.record(
    z.string(),
    z.union([Quantity, Money, z.string(), z.boolean()]),
  ),
  assumptions: z.array(z.string()),
  evidence: z.array(EvidenceRef),
});
export const Scenario = RecordBase.extend({
  request: ScenarioRequest,
  status: z.enum(["available", "needs_information", "unavailable"]),
  results: z.record(z.string(), z.union([Quantity, Money, z.string()])),
  constraints: z.array(Constraint),
  missing_inputs: z.array(z.string()),
  method_version: z.string(),
  origin: Origin,
});
export const Task = RecordBase.extend({
  title: z.string(),
  description: z.string(),
  role_key: RoleKey,
  status: z.enum(["proposed", "pending", "completed", "deferred", "cancelled"]),
  due_at: Timestamp.optional(),
  plan_revision_id: Id.optional(),
  evidence: z.array(EvidenceRef),
});
export const PlanRevision = RecordBase.extend({
  base_revision_id: Id.optional(),
  status: z.enum([
    "draft",
    "proposed",
    "approved",
    "rejected",
    "changes_requested",
    "superseded",
  ]),
  title: z.string(),
  summary: z.string(),
  tasks: z.array(Task),
  findings: z.array(Id),
  evidence: z.array(EvidenceRef),
  constraints: z.array(Constraint),
  assumptions: z.array(z.string()),
  missing_inputs: z.array(z.string()),
});
export const Plan = z.object({
  farm_id: Id,
  active_revision: PlanRevision.nullable(),
  proposed_revisions: z.array(PlanRevision),
});
export const Activity = RecordBase.extend({
  kind: z.enum([
    "irrigation",
    "spending",
    "sowing",
    "sale",
    "observation",
    "other",
  ]),
  description: z.string(),
  confirmed_by: z.literal("farmer"),
  effective_at: Timestamp,
  task_id: Id.optional(),
  quantity: Quantity.optional(),
  money: Money.optional(),
  corrects_id: Id.optional(),
  provenance: Provenance,
});
export const Alert = RecordBase.extend({
  title: z.string(),
  summary: z.string(),
  severity: z.enum(["information", "advisory", "warning"]),
  role_key: RoleKey,
  status: z.enum(["active", "acknowledged", "dismissed", "expired"]),
  evidence: z.array(EvidenceRef),
  issued_at: Timestamp,
  valid_until: Timestamp.optional(),
  freshness: Freshness,
});
export const Source = z.object({
  id: Id,
  name: z.string(),
  url: PublicSourceUrl,
  definition: z.string(),
  geography: z.string(),
  capability: Capability,
  freshness: Freshness,
  parser_version: z.string().optional(),
});
export const Evidence = RecordBase.extend({
  source_id: Id,
  snapshot_id: Id,
  title: z.string(),
  text: z.string(),
  url: PublicSourceUrl.optional(),
  issued_at: Timestamp.optional(),
  retrieved_at: Timestamp,
  valid_from: Timestamp.optional(),
  valid_until: Timestamp.optional(),
  geography: z.string(),
  resolution: z.string().optional(),
  grid: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      crs: z.string(),
    })
    .optional(),
  unit: z.string().optional(),
  kind: z.enum([
    "observation",
    "forecast",
    "farmer_report",
    "estimate",
    "scenario",
    "guidance",
  ]),
  origin: Origin,
  hash: z.string(),
  content_hash: z.string().optional(),
  hash_kind: z
    .enum([
      "full_artifact_sha256",
      "range_manifest_sha256",
      "collection_manifest_sha256",
    ])
    .optional(),
  source_time_precision: z
    .enum(["exact", "date", "month", "unknown"])
    .optional(),
  method_version: z.string(),
  citation: z.object({
    page: z.number().int().positive().optional(),
    section: z.string().optional(),
  }),
});
export const GridMetadata = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  crs: z.string(),
  resolution_degrees: z.number().positive(),
  row: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
});
export const Series = z.object({
  id: Id,
  source_id: Id,
  snapshot_id: Id,
  method_version: z.string(),
  evidence_id: Id.optional(),
  grid: GridMetadata.optional(),
  variable: z.string(),
  unit: z.string(),
  kind: z.enum(["observed", "forecast"]),
  geography: z.string(),
  resolution: z.string(),
  baseline: z.string().optional(),
  supported_range: z.object({ from: Timestamp, to: Timestamp }),
  freshness: Freshness,
  completeness: z.enum(["complete", "partial", "missing"]),
  points: z.array(
    z.object({
      time: Timestamp,
      label: z.string().optional(),
      value: z.number().finite().nullable(),
      lower: z.number().finite().optional(),
      upper: z.number().finite().optional(),
    }),
  ),
  origin: Origin,
});
export const Insights = z.object({
  series: z.array(Series),
  capabilities: z.array(Capability),
  missing_inputs: z.array(z.string()),
});
export const HistoryEntry = RecordBase.extend({
  kind: z.enum([
    "finding",
    "plan_proposal",
    "plan_decision",
    "actual_work",
    "correction",
    "outcome",
    "alert",
  ]),
  title: z.string(),
  summary: z.string(),
  record_id: Id,
  role_key: RoleKey.optional(),
});
export const Job = RecordBase.extend({
  kind: z.enum(["export", "deletion", "refresh"]),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  progress: z.string(),
  download_url: z.string().optional(),
  failure: z.string().optional(),
});
export const Attachment = RecordBase.extend({
  name: z.string(),
  media_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  hash: z.string(),
  analysis_capability: Capability,
});
export const Home = z.object({
  farm: Farm,
  sections: z.object({
    briefing: z.object({ summary: z.string(), freshness: Freshness }),
    context: z.array(Fact),
    climate: z.array(Finding),
    weather: z.array(Finding),
    actions: z.array(Task),
    agents: z.array(Role),
    plan: Plan,
  }),
  alerts: z.array(Alert),
  insights: Insights,
  capabilities: z.array(Capability),
});
export const Bootstrap = z.object({
  schema_version: z.literal(CONTRACT_VERSION),
  session_token: z.string().min(1),
  readiness: z.enum(["ready", "setup_required", "unavailable"]),
  farms: z.array(Farm),
  settings: Settings,
  capabilities: z.array(Capability),
  supported_languages: z.array(z.literal("en")),
  supported_units: z.array(z.string()),
});
export const ApiError = z.object({
  code: z.enum([
    "validation",
    "permission_denied",
    "scope_denied",
    "consent_required",
    "version_conflict",
    "idempotency_conflict",
    "unavailable",
    "source_stale",
    "runtime",
    "interrupted",
    "not_found",
    "internal",
  ]),
  message: z.string(),
  retryable: z.boolean(),
  request_id: Id,
  field_errors: z.record(z.string(), z.array(z.string())).optional(),
  details: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});
export const Event = z.object({
  schema_version: z.literal(CONTRACT_VERSION),
  cursor: Id,
  farm_id: Id,
  type: z.enum([
    "run_state",
    "run_progress",
    "text_batch",
    "message_final",
    "clarification_request",
    "approval_request",
    "finding_ready",
    "farm_changed",
    "settings_changed",
    "plan_proposed",
    "plan_decision",
    "activity_recorded",
    "alert_changed",
    "job_outcome",
    "resync_required",
  ]),
  record_id: Id.optional(),
  run_id: Id.optional(),
  timestamp: Timestamp,
  correlation_id: Id,
  payload: z.object({
    text: z.string().optional(),
    sequence: z.number().int().nonnegative().optional(),
    state: RunState.optional(),
    message: Message.optional(),
    request: PendingRequest.optional(),
    reason: z.string().optional(),
    version: z.number().int().positive().optional(),
  }),
});
export type Event = z.infer<typeof Event>;
export const commandMeta = z.object({
  idempotency_key: Id,
  expected_version: z.number().int().positive().optional(),
});
export type CommandMeta = z.infer<typeof commandMeta>;
export const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), next_cursor: Id.nullable() });
export const envelope = <T extends z.ZodType>(data: T) =>
  z.object({
    schema_version: z.literal(CONTRACT_VERSION),
    request_id: Id,
    data,
    freshness: Freshness.optional(),
    capabilities: z.array(Capability).optional(),
  });

export type Farm = z.infer<typeof Farm>;
export type Field = z.infer<typeof Field>;
export type Fact = z.infer<typeof Fact>;
export type Settings = z.infer<typeof Settings>;
export type Preferences = z.infer<typeof Preferences>;
export type Consent = z.infer<typeof Consent>;
export type Role = z.infer<typeof Role>;
export type Message = z.infer<typeof Message>;
export type Conversation = z.infer<typeof Conversation>;
export type Run = z.infer<typeof Run>;
export type Finding = z.infer<typeof Finding>;
export type Scenario = z.infer<typeof Scenario>;
export type ScenarioRequest = z.infer<typeof ScenarioRequest>;
export type Task = z.infer<typeof Task>;
export type PlanRevision = z.infer<typeof PlanRevision>;
export type Plan = z.infer<typeof Plan>;
export type Activity = z.infer<typeof Activity>;
export type Alert = z.infer<typeof Alert>;
export type Source = z.infer<typeof Source>;
export type Evidence = z.infer<typeof Evidence>;
export type Series = z.infer<typeof Series>;
export type Insights = z.infer<typeof Insights>;
export type HistoryEntry = z.infer<typeof HistoryEntry>;
export type Job = z.infer<typeof Job>;
export type Attachment = z.infer<typeof Attachment>;
export type Home = z.infer<typeof Home>;
export type Bootstrap = z.infer<typeof Bootstrap>;
export type ApiError = z.infer<typeof ApiError>;
