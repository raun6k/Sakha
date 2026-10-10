import { createHash } from "node:crypto";
import { peerGrants, roleDirectory } from "@sakha/agents-farming";
import * as c from "@sakha/contracts";
import type { createCoreServices } from "@sakha/core";
import { authorize, type Runtime, type RuntimeTurn } from "@sakha/core";
import type { createDataServices } from "@sakha/data";
import type { createDomainServices, createFarmServices } from "@sakha/farm";
import { DomainError, load } from "@sakha/farm";
import { z } from "zod";
import type { createLifecycle } from "./lifecycle.js";
import type { Storage } from "./storage/database.js";

type Services = {
  store: Storage;
  farm: ReturnType<typeof createFarmServices>;
  domain: ReturnType<typeof createDomainServices>;
  core: ReturnType<typeof createCoreServices>;
  dataServices: ReturnType<typeof createDataServices>;
  lifecycle: ReturnType<typeof createLifecycle>;
};
export function createExecution(
  services: Services,
  runtime: Runtime | undefined,
) {
  const { store, farm, core, domain, lifecycle } = services;
  const active = new Map<string, AbortController>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const pendingJobs = new Set<Promise<void>>();
  const now = () => new Date().toISOString();
  const state = (
    run: c.Run,
    next: c.Run["state"],
    extra: Partial<c.Run> = {},
  ) =>
    core.saveRun({
      ...run,
      ...extra,
      state: next,
      version: run.version + 1,
      updated_at: now(),
    });
  function current(run: c.Run) {
    return load(store, "run", run.id, run.farm_id, c.Run);
  }
  function authorizeSend(run: c.Run) {
    const grants = store
      .list("consent", run.farm_id)
      .map((x) => c.Consent.parse(x))
      .filter(
        (x) =>
          x.status === "active" &&
          x.external_processing &&
          x.roles.includes(run.role_key),
      );
    if (!grants.some((g) => g.fields.includes("conversation")))
      throw new DomainError(
        "consent_required",
        "Allow external processing of conversation text for this specialist before sending a turn",
      );
    return core.contextFacts(run.farm_id, run.role_key, true, run.field_id);
  }
  const principal = (run: c.Run) => ({
    kind: "agent" as const,
    id: run.role_key,
    farmId: run.farm_id,
    roleKey: run.role_key,
    runId: run.id,
  });
  const check = (run: c.Run, action: string, allowed = true) => {
    if (
      stopped ||
      current(run).state !== "running" ||
      active.get(run.id)?.signal.aborted
    )
      throw new DomainError("interrupted", "Run is no longer active");
    authorize(
      principal(run),
      action,
      { id: run.id, farmId: run.farm_id },
      allowed,
    );
  };
  function evidence(run: c.Run, query: { source_id?: string; text?: string }) {
    const role = roleDirectory().find((x) => x.key === run.role_key);
    const allowed =
      run.role_key === "chief_of_staff" ? undefined : role?.source_ids;
    return store
      .list("evidence", run.farm_id)
      .map((x) => c.Evidence.parse(x))
      .filter(
        (x) =>
          (!x.field_id || x.field_id === run.field_id) &&
          (!allowed || allowed.includes(x.source_id)) &&
          (!query.source_id || x.source_id === query.source_id) &&
          (!query.text ||
            `${x.title} ${x.text}`
              .toLowerCase()
              .includes(query.text.toLowerCase())),
      );
  }
  function refs(run: c.Run, values: z.infer<typeof c.EvidenceRef>[]) {
    const permitted = new Set(evidence(run, {}).map((x) => x.id));
    for (const ref of values) {
      const item = load(
        store,
        "evidence",
        ref.evidence_id,
        run.farm_id,
        c.Evidence,
      );
      if (!permitted.has(item.id) || item.snapshot_id !== ref.snapshot_id)
        throw new DomainError(
          "scope_denied",
          "Evidence reference is outside this role/field or snapshot",
        );
    }
  }
  function tools(run: c.Run): RuntimeTurn["tools"] {
    return {
      readFacts: async () => {
        check(run, "read");
        return authorizeSend(run);
      },
      lookupEvidence: async (query) => {
        check(run, "read");
        authorizeSend(run);
        return evidence(run, query);
      },
      scenario: async (input) => {
        check(run, "propose");
        const request = c.ScenarioRequest.parse({
          ...z.record(z.string(), z.unknown()).parse(input),
          farm_id: run.farm_id,
          field_id: run.field_id,
          role_key: run.role_key,
        });
        refs(run, request.evidence);
        return c.Scenario.parse(
          domain.execute("createScenario", request, { farmId: run.farm_id }),
        );
      },
      proposePlan: async (input) => {
        check(run, "propose", run.role_key === "chief_of_staff");
        const request = c.operations.createPlanRevision.input.parse({
          ...z.record(z.string(), z.unknown()).parse(input),
          farm_id: run.farm_id,
          field_id: run.field_id,
        });
        refs(run, request.evidence);
        return c.PlanRevision.parse(
          domain.execute("createPlanRevision", request, {
            farmId: run.farm_id,
          }),
        );
      },
      publishFinding: async (input) => {
        check(run, "propose");
        const finding = c.Finding.parse({
          ...z.record(z.string(), z.unknown()).parse(input),
          ...farm.makeBase(run.farm_id),
          field_id: run.field_id,
          role_key: run.role_key,
          origin: "agent_inference",
        });
        refs(run, finding.evidence);
        if (!finding.evidence.length && !finding.missing_inputs.length)
          throw new DomainError(
            "validation",
            "Finding must cite evidence or identify missing grounding",
          );
        store.put("finding", finding);
        store.event(run.farm_id, "finding_ready", {
          record_id: finding.id,
          run_id: run.id,
        });
        return finding;
      },
      clarify: async (question) => {
        check(run, "clarify");
        const pending = c.PendingRequest.parse({
          id: farm.makeBase(run.farm_id).id,
          version: 1,
          kind: "clarification",
          question,
          options: [],
          status: "pending",
        });
        const saved = state(current(run), "waiting_clarification", {
          pending: [...current(run).pending, pending],
        });
        store.event(run.farm_id, "clarification_request", {
          run_id: saved.id,
          request: pending,
        });
        active.get(run.id)?.abort();
      },
      peer: async (recipient, text) => {
        if (store.get("peer_run", run.id, run.farm_id))
          throw new DomainError(
            "permission_denied",
            "Peer request turns cannot fan out further",
          );
        check(
          run,
          "peer",
          (peerGrants[run.role_key] as readonly string[]).includes(recipient),
        );
        const count = store.db
          .prepare(
            "SELECT count(*) as count FROM inbox WHERE farm_id=? AND sender=? AND json_extract(payload,'$.origin_run')=?",
          )
          .get(run.farm_id, run.role_key, run.id) as { count: number };
        if (count.count >= 5)
          throw new DomainError("unavailable", "Peer fan-out bound reached");
        const payload = { origin_run: run.id, field_id: run.field_id, text };
        const key = createHash("sha256")
          .update(JSON.stringify([run.id, recipient, payload]))
          .digest("hex");
        const existing = store.db
          .prepare("SELECT id FROM inbox WHERE deduplication_key=?")
          .get(key) as { id: string } | undefined;
        if (existing) return { ...existing, status: "queued" };
        const id = farm.makeBase(run.farm_id).id;
        store.transaction(() => {
          store.db
            .prepare("INSERT INTO inbox VALUES(?,?,?,?,?,?,?,?)")
            .run(
              id,
              run.farm_id,
              run.role_key,
              recipient,
              JSON.stringify(payload),
              "queued",
              now(),
              key,
            );
          store.enqueue(run.farm_id, "peer_delivery", { message_id: id });
        });
        return { id, status: "queued" };
      },
    };
  }
  async function runTurn(run: c.Run) {
    if (run.state !== "queued") return;
    const controller = new AbortController();
    active.set(run.id, controller);
    let message: c.Message | undefined;
    try {
      if (!runtime || (await runtime.getCapabilities()).ready !== true)
        throw new DomainError(
          "unavailable",
          "Configure a supported agent runtime before sending a turn",
        );
      const facts = authorizeSend(run);
      const allowedIds = new Set(facts.map((x) => x.id));
      const messages = store
        .list("message", run.farm_id)
        .map((x) => c.Message.parse(x))
        .filter(
          (x) =>
            x.conversation_id === run.conversation_id &&
            Object.keys(x.context.fact_versions).every((id) =>
              allowedIds.has(id),
            ),
        );
      run = state(run, "running");
      message = c.Message.parse({
        ...farm.makeBase(run.farm_id),
        field_id: run.field_id,
        conversation_id: run.conversation_id,
        role_key: run.role_key,
        author: "agent",
        text: "",
        status: "partial",
        context: {
          fact_versions: Object.fromEntries(
            facts.map((x) => [x.id, x.version]),
          ),
          evidence: [],
        },
      });
      store.put("message", message);
      let sequence = 0;
      const result = await runtime.startTurn({
        run,
        messages,
        facts,
        instructions: `${roleDirectory().find((x) => x.key === run.role_key)?.description}. Use only scoped Sakha tools. Look up actual evidence before claims. Source dates, crop stage, local applicability and missing measurements matter. Do not invent coefficients, eligibility, volumes, prices or percentages. Calculations use calculate_scenario. Only Chief of Staff proposes integrated plans. Never approve plans, save farmer facts or record actual work. Ask one concrete clarification if blocked. A peer request acknowledges queueing, not an answer.`,
        signal: controller.signal,
        tools: tools(run),
        beforeSend: async () => {
          const fresh = authorizeSend(run);
          if (
            JSON.stringify(fresh.map((x) => [x.id, x.version])) !==
            JSON.stringify(facts.map((x) => [x.id, x.version]))
          )
            throw new DomainError(
              "consent_required",
              "Authorized context changed before provider send; start a new turn",
            );
        },
        onText: async (text) => {
          if (stopped) throw new DomainError("interrupted", "Backend stopping");
          authorizeSend(run);
          check(run, "read");
          if (!message) return;
          message = {
            ...message,
            text: message.text + text,
            version: message.version + 1,
            updated_at: now(),
          };
          store.put("message", message);
          store.event(run.farm_id, "text_batch", {
            record_id: message.id,
            run_id: run.id,
            text,
            sequence: sequence++,
          });
        },
      });
      if (current(run).state === "running" && message) {
        message = {
          ...message,
          text: result.text,
          status: "final",
          version: message.version + 1,
          updated_at: now(),
        };
        const finalMessage = message;
        store.transaction(() => {
          store.put("message", finalMessage);
          state(current(run), "completed");
          store.event(run.farm_id, "message_final", {
            record_id: finalMessage.id,
            run_id: run.id,
            message,
          });
        });
      }
    } catch (error) {
      if (stopped) return;
      const savedResult = c.Run.safeParse(
        store.get("run", run.id, run.farm_id),
      );
      if (!savedResult.success) return;
      const saved = savedResult.data;
      if (message) {
        store.put("message", {
          ...message,
          status: "partial",
          version: message.version + 1,
          updated_at: now(),
        });
      }
      if (saved.state === "running" || saved.state === "queued")
        state(saved, controller.signal.aborted ? "interrupted" : "failed", {
          failure: {
            code: error instanceof DomainError ? error.code : "runtime",
            message:
              error instanceof DomainError ? error.message : "Runtime failed",
          },
        });
    } finally {
      active.delete(run.id);
    }
  }
  async function deliverPeer(farmId: string, id: string) {
    const row = store.db
      .prepare("SELECT * FROM inbox WHERE id=? AND farm_id=?")
      .get(id, farmId) as
      | {
          sender: c.RoleKey;
          recipient: c.RoleKey;
          payload: string;
          status: string;
        }
      | undefined;
    if (row?.status !== "queued") return;
    const p = z
      .object({ origin_run: c.Id, field_id: c.Id.optional(), text: z.string() })
      .parse(JSON.parse(row.payload));
    // A peer request cannot recursively fan out: direct replies stay durable and the receiving role can inspect facts/evidence.
    if (
      store
        .list("run", farmId)
        .map((x) => c.Run.parse(x))
        .some(
          (x) =>
            x.role_key === row.recipient &&
            ["queued", "running", "waiting_clarification"].includes(x.state),
        )
    )
      throw new DomainError("unavailable", "Recipient busy");
    store.transaction(() => {
      const conversation = c.Conversation.parse(
        core.execute(
          "createConversation",
          { role_key: row.recipient, title: `Request from ${row.sender}` },
          { farmId },
        ),
      );
      const receiving = c.Run.parse(
        core.execute(
          "submitTurn",
          {
            text: `Specialist ${row.sender} requests: ${p.text}`,
            field_id: p.field_id,
            evidence: [],
          },
          { farmId, conversationId: conversation.id },
        ),
      );
      store.put("peer_run", {
        ...farm.makeBase(farmId),
        id: receiving.id,
        origin_run: p.origin_run,
      });
      store.db
        .prepare("UPDATE inbox SET status='delivered' WHERE id=?")
        .run(id);
    });
  }
  async function tickJob() {
    if (stopped) return;
    for (const [id, controller] of active) {
      const run = store
        .farms()
        .flatMap((f) => store.list("run", f))
        .map((x) => c.Run.parse(x))
        .find((x) => x.id === id);
      if (run?.state === "cancelled") controller.abort();
    }
    if (active.size >= 2) return;
    const job = store.claimJob(now());
    if (!job) return;
    try {
      const p = z.record(z.string(), z.unknown()).parse(job.payload);
      if (job.kind === "agent_turn")
        await runTurn(
          load(store, "run", z.string().parse(p.run_id), job.farm_id, c.Run),
        );
      else if (job.kind === "lifecycle") {
        for (const [id, controller] of active) {
          const running = store.get("run", id, job.farm_id);
          if (running) controller.abort();
        }
        lifecycle.run(job.farm_id, z.string().parse(p.job_id));
      } else if (job.kind === "peer_delivery")
        await deliverPeer(job.farm_id, z.string().parse(p.message_id));
      else if (["fact_corrected", "consent_revoked"].includes(job.kind)) {
        store.db
          .prepare("DELETE FROM memory_fts WHERE farm_id=?")
          .run(job.farm_id);
        for (const record of store.list("memory", job.farm_id)) {
          const id = z.object({ id: c.Id }).parse(record).id;
          store.remove("memory", id, job.farm_id);
        }
        for (const run of store
          .list("run", job.farm_id)
          .map((x) => c.Run.parse(x)))
          if (run.state === "running") active.get(run.id)?.abort();
      }
      if (stopped) return;
      store.finishJob(job.id, { status: "completed" });
      store.event(job.farm_id, "job_outcome", {
        record_id: job.id,
        reason: "completed",
      });
    } catch (error) {
      if (stopped) return;
      store.finishJob(
        job.id,
        { reason: error instanceof DomainError ? error.message : "Job failed" },
        true,
      );
      store.event(job.farm_id, "job_outcome", {
        record_id: job.id,
        reason: "failed",
      });
    }
  }
  function tick() {
    const work = tickJob();
    pendingJobs.add(work);
    void work.finally(() => pendingJobs.delete(work));
    return work;
  }
  return {
    tick,
    tools,
    runTurn,
    start() {
      store.recoverJobs();
      for (const farmId of store.farms())
        for (const run of store.list("run", farmId).map((x) => c.Run.parse(x)))
          if (run.state === "running")
            state(run, "interrupted", {
              failure: {
                code: "interrupted",
                message: "Backend restarted; no uncertain turn was retried",
              },
            });
      timer = setInterval(() => {
        void tick();
      }, 250);
      timer.unref();
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      for (const controller of active.values()) controller.abort();
      let deadline: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.allSettled([...pendingJobs]),
        new Promise((resolve) => {
          deadline = setTimeout(resolve, 5000);
        }),
      ]);
      if (deadline) clearTimeout(deadline);
    },
  };
}
