import { z } from "zod";
import * as c from "./schemas.js";

const empty = z.object({});
const version = z.object({ expected_version: z.number().int().positive() });
const confirmation = z.object({ confirmed: z.literal(true) });
const factInput = c.Fact.omit({
  id: true,
  version: true,
  created_at: true,
  updated_at: true,
});
const activityInput = c.Activity.omit({
  id: true,
  version: true,
  created_at: true,
  updated_at: true,
}).extend({ confirmed: z.literal(true) });
const op = <I extends z.ZodType, O extends z.ZodType>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  input: I,
  output: O,
) => ({ method, path, input, output });
/** Paths are relative to /api/v1. Params are substituted by transport, never taken as authorization. */
export const operations = {
  health: op("GET", "/health", empty, z.object({ status: z.literal("ok") })),
  bootstrap: op("GET", "/bootstrap", empty, c.Bootstrap),
  createFarm: op(
    "POST",
    "/farms",
    z.object({ name: z.string().min(1), location: c.Location.optional() }),
    c.Farm,
  ),
  completeSetup: op(
    "POST",
    "/farms/:farmId/setup/complete",
    version.extend({
      facts: z.array(factInput),
      settings: c.Settings.optional(),
    }),
    c.Farm,
  ),
  getFarm: op("GET", "/farms/:farmId", empty, c.Farm),
  updateFarm: op(
    "PATCH",
    "/farms/:farmId",
    version.extend({
      name: z.string().min(1).optional(),
      location: c.Location.optional(),
    }),
    c.Farm,
  ),
  listFields: op("GET", "/farms/:farmId/fields", empty, c.page(c.Field)),
  createField: op(
    "POST",
    "/farms/:farmId/fields",
    z.object({
      name: z.string().min(1),
      area: c.Quantity,
      crop: z.string().optional(),
    }),
    c.Field,
  ),
  updateField: op(
    "PATCH",
    "/farms/:farmId/fields/:fieldId",
    version.extend({
      name: z.string().min(1).optional(),
      area: c.Quantity.optional(),
      crop: z.string().optional(),
    }),
    c.Field,
  ),
  listFacts: op("GET", "/farms/:farmId/facts", empty, c.page(c.Fact)),
  saveFact: op("POST", "/farms/:farmId/facts", factInput, c.Fact),
  correctFact: op(
    "POST",
    "/farms/:farmId/facts/:factId/corrections",
    factInput.extend({ expected_version: z.number().int().positive() }),
    c.Fact,
  ),
  saveObservation: op("POST", "/farms/:farmId/observations", factInput, c.Fact),
  getSettings: op("GET", "/settings", empty, c.Settings),
  updateSettings: op(
    "PATCH",
    "/settings",
    c.Settings.partial().required({ version: true }),
    c.Settings,
  ),
  getPreferences: op(
    "GET",
    "/farms/:farmId/agents/:roleKey/preferences",
    empty,
    c.Preferences,
  ),
  updatePreferences: op(
    "PATCH",
    "/farms/:farmId/agents/:roleKey/preferences",
    c.Preferences,
    c.Preferences,
  ),
  listConsents: op("GET", "/farms/:farmId/consents", empty, c.page(c.Consent)),
  grantConsent: op(
    "POST",
    "/farms/:farmId/consents",
    c.Consent.omit({
      id: true,
      version: true,
      created_at: true,
      updated_at: true,
      status: true,
    }),
    c.Consent,
  ),
  revokeConsent: op(
    "POST",
    "/farms/:farmId/consents/:grantId/revoke",
    version,
    c.Consent,
  ),
  listAgents: op("GET", "/agents", empty, z.array(c.Role)),
  getAgent: op("GET", "/farms/:farmId/agents/:roleKey", empty, c.Role),
  listConversations: op(
    "GET",
    "/farms/:farmId/conversations",
    z.object({ role_key: c.RoleKey.optional() }),
    c.page(c.Conversation),
  ),
  createConversation: op(
    "POST",
    "/farms/:farmId/conversations",
    z.object({ role_key: c.RoleKey, title: z.string() }),
    c.Conversation,
  ),
  getConversation: op(
    "GET",
    "/farms/:farmId/conversations/:conversationId",
    empty,
    c.Conversation,
  ),
  listMessages: op(
    "GET",
    "/farms/:farmId/conversations/:conversationId/messages",
    empty,
    c.page(c.Message),
  ),
  submitTurn: op(
    "POST",
    "/farms/:farmId/conversations/:conversationId/turns",
    z.object({
      text: z.string().min(1).max(20000),
      field_id: c.Id.optional(),
      evidence: z.array(c.EvidenceRef).default([]),
    }),
    c.Run,
  ),
  listRuns: op(
    "GET",
    "/farms/:farmId/runs",
    z.object({ conversation_id: c.Id.optional() }),
    c.page(c.Run),
  ),
  getRun: op("GET", "/farms/:farmId/runs/:runId", empty, c.Run),
  cancelRun: op("POST", "/farms/:farmId/runs/:runId/cancel", version, c.Run),
  resumeRun: op("POST", "/farms/:farmId/runs/:runId/resume", version, c.Run),
  answerClarification: op(
    "POST",
    "/farms/:farmId/runs/:runId/clarifications/:clarificationId/answer",
    version.extend({ answer: z.string().min(1) }),
    c.Run,
  ),
  respondApproval: op(
    "POST",
    "/farms/:farmId/runs/:runId/approvals/:approvalId/respond",
    version.extend({ decision: z.enum(["allow", "deny"]) }),
    c.Run,
  ),
  getHome: op("GET", "/farms/:farmId/home", empty, c.Home),
  getTeam: op("GET", "/farms/:farmId/team", empty, z.array(c.Teammate)),
  listSources: op("GET", "/sources", empty, z.array(c.Source)),
  getSource: op("GET", "/sources/:sourceId", empty, c.Source),
  getEvidence: op(
    "GET",
    "/farms/:farmId/evidence/:evidenceId",
    empty,
    c.Evidence,
  ),
  getInsights: op(
    "GET",
    "/farms/:farmId/insights",
    z.object({
      series: z.string().optional(),
      range: z.string().optional(),
      field_id: c.Id.optional(),
    }),
    c.Insights,
  ),
  listFindings: op(
    "GET",
    "/farms/:farmId/findings",
    z.object({ role_key: c.RoleKey.optional() }),
    c.page(c.Finding),
  ),
  getFinding: op("GET", "/farms/:farmId/findings/:findingId", empty, c.Finding),
  createScenario: op(
    "POST",
    "/farms/:farmId/scenarios",
    c.ScenarioRequest,
    c.Scenario,
  ),
  getScenario: op(
    "GET",
    "/farms/:farmId/scenarios/:scenarioId",
    empty,
    c.Scenario,
  ),
  getPlan: op("GET", "/farms/:farmId/plan", empty, c.Plan),
  listPlanRevisions: op(
    "GET",
    "/farms/:farmId/plan/revisions",
    empty,
    c.page(c.PlanRevision),
  ),
  createPlanRevision: op(
    "POST",
    "/farms/:farmId/plan/revisions",
    c.PlanRevision.omit({
      id: true,
      version: true,
      created_at: true,
      updated_at: true,
      status: true,
    }),
    c.PlanRevision,
  ),
  getPlanRevision: op(
    "GET",
    "/farms/:farmId/plan/revisions/:revisionId",
    empty,
    c.PlanRevision,
  ),
  decidePlan: op(
    "POST",
    "/farms/:farmId/plan/revisions/:revisionId/decisions",
    version.extend({
      decision: z.enum(["approve", "reject", "request_changes"]),
      reason: z.string().optional(),
      base_revision_id: c.Id.nullable(),
    }),
    c.PlanRevision,
  ),
  listTasks: op("GET", "/farms/:farmId/tasks", empty, c.page(c.Task)),
  getActivity: op(
    "GET",
    "/farms/:farmId/activities/:activityId",
    empty,
    c.Activity,
  ),
  getOutcome: op(
    "GET",
    "/farms/:farmId/outcomes/:outcomeId",
    empty,
    c.HistoryEntry,
  ),
  recordActivity: op(
    "POST",
    "/farms/:farmId/activities",
    activityInput,
    c.Activity,
  ),
  correctActivity: op(
    "POST",
    "/farms/:farmId/activities/:activityId/corrections",
    activityInput.extend({ expected_version: z.number().int().positive() }),
    c.Activity,
  ),
  deferTask: op(
    "POST",
    "/farms/:farmId/tasks/:taskId/defer",
    version.extend({ reason: z.string(), until: c.Timestamp.optional() }),
    c.Task,
  ),
  listAlerts: op("GET", "/farms/:farmId/alerts", empty, c.page(c.Alert)),
  getAlert: op("GET", "/farms/:farmId/alerts/:alertId", empty, c.Alert),
  acknowledgeAlert: op(
    "POST",
    "/farms/:farmId/alerts/:alertId/acknowledge",
    version,
    c.Alert,
  ),
  dismissAlert: op(
    "POST",
    "/farms/:farmId/alerts/:alertId/dismiss",
    version,
    c.Alert,
  ),
  recordOutcome: op(
    "POST",
    "/farms/:farmId/outcomes",
    confirmation.extend({
      description: z.string().min(1),
      activity_id: c.Id.optional(),
      finding_id: c.Id.optional(),
      effective_at: c.Timestamp,
      quantity: c.Quantity.optional(),
    }),
    c.HistoryEntry,
  ),
  correctOutcome: op(
    "POST",
    "/farms/:farmId/outcomes/:outcomeId/corrections",
    confirmation.extend({
      expected_version: z.number().int().positive(),
      description: z.string().min(1),
      effective_at: c.Timestamp,
    }),
    c.HistoryEntry,
  ),
  listActivity: op(
    "GET",
    "/farms/:farmId/activity",
    z.object({ kind: z.string().optional(), role_key: c.RoleKey.optional() }),
    c.page(c.HistoryEntry),
  ),
  requestExport: op(
    "POST",
    "/farms/:farmId/exports",
    confirmation.extend({ include_private: z.boolean() }),
    c.Job,
  ),
  getExport: op("GET", "/farms/:farmId/exports/:jobId", empty, c.Job),
  requestDeletion: op(
    "POST",
    "/farms/:farmId/deletions",
    confirmation.extend({
      scope: z.enum(["farm", "private_data", "conversations"]),
      record_ids: z.array(c.Id).optional(),
    }),
    c.Job,
  ),
  getDeletion: op("GET", "/farms/:farmId/deletions/:jobId", empty, c.Job),
  uploadAttachment: op(
    "POST",
    "/farms/:farmId/attachments",
    z.object({
      name: z.string().min(1),
      media_type: z.string(),
      data_base64: z.string().max(14000000),
    }),
    c.Attachment,
  ),
  getAttachment: op(
    "GET",
    "/farms/:farmId/attachments/:attachmentId",
    empty,
    c.Attachment,
  ),
  deleteAttachment: op(
    "DELETE",
    "/farms/:farmId/attachments/:attachmentId",
    confirmation.extend({ expected_version: z.number().int().positive() }),
    z.object({ deleted: z.literal(true) }),
  ),
} as const;
export type OperationName = keyof typeof operations;
export type OperationInput<K extends OperationName> = z.input<
  (typeof operations)[K]["input"]
>;
export type OperationOutput<K extends OperationName> = z.output<
  (typeof operations)[K]["output"]
>;
export type ServiceRequest<K extends OperationName> = {
  params?: Record<string, string>;
  input: OperationInput<K>;
  command?: c.CommandMeta;
  cursor?: string;
  limit?: number;
};
export interface SakhaService {
  execute<K extends OperationName>(
    operation: K,
    request: ServiceRequest<K>,
  ): Promise<OperationOutput<K>>;
  subscribe(
    farmId: string,
    cursor: string | undefined,
    onEvent: (event: c.Event) => void,
    onError: (error: z.infer<typeof c.ApiError>) => void,
    onConnection?: (state: "connecting" | "connected" | "disconnected") => void,
  ): () => void;
}
export const eventPath = "/api/v1/farms/:farmId/events";
