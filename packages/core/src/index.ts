import { readFileSync } from "node:fs";
import {
  checkParsePolicySet,
  checkParseSchema,
  isAuthorized,
} from "@cedar-policy/cedar-wasm/nodejs";
import * as c from "@sakha/contracts";
import { DomainError, load, requireVersion, type Store } from "@sakha/farm";
export type BoundPrincipal = {
  kind: "farmer" | "agent";
  id: string;
  farmId: string;
  roleKey?: c.RoleKey;
  runId?: string;
};
export const policyText = readFileSync(
  new URL("../../../policies/sakha-v1.cedar", import.meta.url),
  "utf8",
);
const policySchema = readFileSync(
  new URL("../../../policies/sakha-v1.cedarschema", import.meta.url),
  "utf8",
);
if (
  checkParseSchema(policySchema).type === "failure" ||
  checkParsePolicySet({ staticPolicies: policyText }).type === "failure"
)
  throw new Error("Invalid Sakha authorization policy");
export const roleFactCategories: Record<c.RoleKey, readonly string[]> = {
  chief_of_staff: ["F01", "F02", "F03", "F04", "F05", "F06", "F07", "F08"],
  climate: ["F01", "F03", "F04"],
  weather: ["F01", "F03", "F06"],
  crop_planning: ["F01", "F02", "F03", "F04", "F05"],
  crop_care: ["F01", "F02", "F03", "F04", "F06"],
  water: ["F01", "F02", "F03", "F04"],
  market: ["F01", "F03", "F07"],
  farm_finance: ["F01", "F03", "F05", "F07"],
  government_support: ["F01", "F03", "F06", "F08"],
};
export function authorize(
  principal: BoundPrincipal,
  action: string,
  resource: { id: string; farmId: string; private?: boolean },
  allowed: boolean,
  privateGrant = false,
) {
  const principalType =
    principal.kind === "farmer" ? "Sakha::Farmer" : "Sakha::Agent";
  const principalUid = { type: principalType, id: principal.id };
  const resourceUid = { type: "Sakha::Resource", id: resource.id };
  const result = isAuthorized({
    schema: policySchema,
    validateRequest: true,
    principal: principalUid,
    action: { type: "Sakha::Action", id: action },
    resource: resourceUid,
    context: { allowed, privateGrant },
    policies: { staticPolicies: policyText },
    entities: [
      { uid: principalUid, attrs: { farm: principal.farmId }, parents: [] },
      {
        uid: resourceUid,
        attrs: { farm: resource.farmId, private: resource.private ?? false },
        parents: [],
      },
    ],
  });
  if (result.type !== "success" || result.response.decision !== "allow")
    throw new DomainError(
      "permission_denied",
      "The scoped operation is not permitted",
    );
}
export type RuntimeCapabilities = {
  ready: boolean;
  text: boolean;
  cancel: boolean;
  resume: boolean;
  approvals: boolean;
  attachments: boolean;
  version: string;
  reason?: string;
};
export type RuntimeTurn = {
  run: c.Run;
  messages: c.Message[];
  facts: c.Fact[];
  instructions: string;
  signal: AbortSignal;
  onText: (text: string) => Promise<void>;
  beforeSend: () => Promise<void>;
  tools: {
    readFacts: () => Promise<c.Fact[]>;
    lookupEvidence: (query: {
      source_id?: string;
      text?: string;
    }) => Promise<c.Evidence[]>;
    scenario: (request: unknown) => Promise<c.Scenario>;
    proposePlan: (request: unknown) => Promise<c.PlanRevision>;
    publishFinding: (finding: unknown) => Promise<c.Finding>;
    peer: (
      recipient: c.RoleKey,
      text: string,
    ) => Promise<{ id: string; status: string }>;
    clarify: (question: string) => Promise<void>;
  };
};
export interface Runtime {
  getCapabilities(): Promise<RuntimeCapabilities>;
  startTurn(turn: RuntimeTurn): Promise<{ text: string }>;
  cancelTurn?(runId: string): Promise<void>;
  resumeTurn?(turn: RuntimeTurn): Promise<{ text: string }>;
}
export function createCoreServices(
  store: Store,
  base: (farmId: string) => {
    id: string;
    farm_id: string;
    version: number;
    created_at: string;
    updated_at: string;
  },
  assertFarm: (farmId: string) => c.Farm,
  listFacts: (farmId: string) => c.Fact[],
  now: () => string,
) {
  function contextFacts(
    farmId: string,
    roleKey: c.RoleKey,
    external = false,
    fieldId?: string,
  ) {
    assertFarm(farmId);
    if (fieldId) load(store, "field", fieldId, farmId, c.Field);
    const grants = store
      .list("consent", farmId)
      .map((x) => c.Consent.parse(x))
      .filter(
        (x) =>
          x.status === "active" &&
          x.roles.includes(roleKey) &&
          (!external || x.external_processing),
      );
    return listFacts(farmId).filter(
      (fact) =>
        roleFactCategories[roleKey].includes(fact.category) &&
        (!fact.field_id || fact.field_id === fieldId) &&
        ((!fact.private && !external) ||
          grants.some(
            (g) =>
              g.fields.includes(fact.key) || g.fields.includes(fact.category),
          )),
    );
  }
  function saveRun(run: c.Run) {
    store.put("run", run);
    store.event(run.farm_id, "run_state", {
      record_id: run.id,
      run_id: run.id,
      state: run.state,
      version: run.version,
    });
    return run;
  }
  return {
    contextFacts,
    saveRun,
    execute(
      name: c.OperationName,
      input: unknown,
      params: Record<string, string>,
    ): unknown {
      return store.transaction(() => {
        const farmId = params.farmId ?? "";
        assertFarm(farmId);
        switch (name) {
          case "listConversations": {
            const d = c.operations.listConversations.input.parse(input);
            return {
              items: store
                .list("conversation", farmId)
                .filter(
                  (raw) =>
                    !d.role_key ||
                    c.Conversation.parse(raw).role_key === d.role_key,
                ),
              next_cursor: null,
            };
          }
          case "createConversation": {
            const d = c.operations.createConversation.input.parse(input);
            if (!store.get("agent_instance", d.role_key, farmId))
              store.put("agent_instance", {
                ...base(farmId),
                id: d.role_key,
                role_key: d.role_key,
                runtime: "unconfigured",
              });
            const conversation = c.Conversation.parse({
              ...d,
              ...base(farmId),
            });
            store.put("conversation", conversation);
            return conversation;
          }
          case "getConversation":
            return load(
              store,
              "conversation",
              params.conversationId ?? "",
              farmId,
              c.Conversation,
            );
          case "listMessages": {
            const conversation = load(
              store,
              "conversation",
              params.conversationId ?? "",
              farmId,
              c.Conversation,
            );
            return {
              items: store
                .list("message", farmId)
                .filter(
                  (raw) =>
                    c.Message.parse(raw).conversation_id === conversation.id,
                ),
              next_cursor: null,
            };
          }
          case "submitTurn": {
            const d = c.operations.submitTurn.input.parse(input);
            const conversation = load(
              store,
              "conversation",
              params.conversationId ?? "",
              farmId,
              c.Conversation,
            );
            const existing = store
              .list("run", farmId)
              .map((x) => c.Run.parse(x))
              .find(
                (x) =>
                  x.role_key === conversation.role_key &&
                  [
                    "queued",
                    "running",
                    "waiting_approval",
                    "waiting_clarification",
                  ].includes(x.state),
              );
            if (existing)
              throw new DomainError(
                "version_conflict",
                "This specialist already has an active turn",
              );
            if (d.field_id) load(store, "field", d.field_id, farmId, c.Field);
            for (const ref of d.evidence)
              load(store, "evidence", ref.evidence_id, farmId, c.Evidence);
            const facts = contextFacts(
              farmId,
              conversation.role_key,
              false,
              d.field_id,
            );
            const message = c.Message.parse({
              ...base(farmId),
              conversation_id: conversation.id,
              role_key: conversation.role_key,
              author: "farmer",
              text: d.text,
              status: "final",
              context: {
                fact_versions: Object.fromEntries(
                  facts.map((f) => [f.id, f.version]),
                ),
                evidence: d.evidence,
                field_id: d.field_id,
              },
            });
            store.put("message", message);
            const run = c.Run.parse({
              ...base(farmId),
              field_id: d.field_id,
              conversation_id: conversation.id,
              role_key: conversation.role_key,
              state: "queued",
              pending: [],
              capabilities: [],
            });
            saveRun(run);
            store.enqueue(farmId, "agent_turn", { run_id: run.id });
            return run;
          }
          case "listRuns": {
            const d = c.operations.listRuns.input.parse(input);
            if (d.conversation_id)
              load(
                store,
                "conversation",
                d.conversation_id,
                farmId,
                c.Conversation,
              );
            return {
              items: store
                .list("run", farmId)
                .map((x) => c.Run.parse(x))
                .filter(
                  (x) =>
                    !d.conversation_id ||
                    x.conversation_id === d.conversation_id,
                ),
              next_cursor: null,
            };
          }
          case "getRun":
            return load(store, "run", params.runId ?? "", farmId, c.Run);
          case "cancelRun": {
            const d = c.operations.cancelRun.input.parse(input);
            const run = load(store, "run", params.runId ?? "", farmId, c.Run);
            requireVersion(run, d.expected_version);
            if (["completed", "failed", "cancelled"].includes(run.state))
              throw new DomainError(
                "version_conflict",
                "This run is already terminal",
              );
            return saveRun({
              ...run,
              state: "cancelled",
              version: run.version + 1,
              updated_at: now(),
            });
          }
          case "resumeRun": {
            const d = c.operations.resumeRun.input.parse(input);
            const run = load(store, "run", params.runId ?? "", farmId, c.Run);
            requireVersion(run, d.expected_version);
            if (run.state !== "interrupted")
              throw new DomainError(
                "version_conflict",
                "Only interrupted runs can be resumed",
              );
            throw new DomainError(
              "unavailable",
              "Native continuation is unavailable until runtime support is verified; start a new turn with the saved transcript",
            );
          }
          case "answerClarification":
          case "respondApproval": {
            const run = load(store, "run", params.runId ?? "", farmId, c.Run);
            const requestId = params.clarificationId ?? params.approvalId;
            const pending = run.pending.find(
              (x) => x.id === requestId && x.status === "pending",
            );
            if (!pending)
              throw new DomainError(
                "not_found",
                "Pending request no longer exists",
              );
            const d =
              name === "answerClarification"
                ? c.operations.answerClarification.input.parse(input)
                : c.operations.respondApproval.input.parse(input);
            requireVersion(pending, d.expected_version);
            if (name === "respondApproval")
              throw new DomainError(
                "unavailable",
                "Runtime approvals are not enabled",
              );
            const answer =
              c.operations.answerClarification.input.parse(input).answer;
            store.put(
              "message",
              c.Message.parse({
                ...base(farmId),
                conversation_id: run.conversation_id,
                role_key: run.role_key,
                author: "farmer",
                text: answer,
                status: "final",
                context: { fact_versions: {}, evidence: [] },
              }),
            );
            const updated = saveRun({
              ...run,
              state: "queued",
              pending: run.pending.map((p) =>
                p.id === pending.id
                  ? { ...p, status: "answered", version: p.version + 1 }
                  : p,
              ),
              version: run.version + 1,
              updated_at: now(),
            });
            store.enqueue(farmId, "agent_turn", { run_id: run.id });
            return updated;
          }
          default:
            throw new DomainError(
              "unavailable",
              "Core operation not implemented",
            );
        }
      });
    },
  };
}
