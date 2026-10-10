import type {
  Activity,
  Alert,
  HistoryEntry,
  PlanRevision,
  Task,
} from "@sakha/contracts";
import { useState } from "react";
import { Link } from "react-router";
import { AlertDetails, EvidenceLinks } from "../components/evidence";
import {
  Badge,
  Banner,
  Card,
  DateText,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  PageHeading,
  quantityText,
  State,
} from "../components/ui";
import { useCommand, useFarmId, useRead } from "../services/context";
export function WorkConfirmation({
  task,
  onClose,
}: {
  task?: Task;
  onClose: () => void;
}) {
  const farmId = useFarmId();
  const command = useCommand("recordActivity", { farmId });
  const [kind, setKind] = useState<Activity["kind"]>("other");
  const [description, setDescription] = useState(task?.title ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("m3");
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<unknown>();
  const save = async () => {
    setError(undefined);
    try {
      if (!description.trim())
        throw new Error("Describe what actually happened.");
      if (
        quantity &&
        (!Number.isFinite(Number(quantity)) || Number(quantity) < 0)
      )
        throw new Error("Enter a non-negative quantity, or leave it unknown.");
      if (amount && (!Number.isFinite(Number(amount)) || Number(amount) < 0))
        throw new Error("Enter a non-negative amount, or leave it unknown.");
      await command.mutateAsync({
        farm_id: farmId,
        kind,
        description,
        confirmed: true,
        confirmed_by: "farmer",
        effective_at: new Date(`${date}T12:00:00Z`).toISOString(),
        task_id: task?.id,
        quantity: quantity
          ? { kind: "known", value: Number(quantity), unit }
          : undefined,
        money: amount
          ? { minor_units: Math.round(Number(amount) * 100), currency: "INR" }
          : undefined,
        ...{
          provenance: {
            origin: "farmer_report",
            attribution: "Farmer confirmed work",
            effective_at: new Date(`${date}T12:00:00Z`).toISOString(),
            effective_time_precision: "date",
            original_wording: description,
            evidence: [],
          },
        },
      });
      onClose();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Report actual completed work"
      description="Use this only for work that happened. Plan approval and 'not yet' do not record any activity."
    >
      <Field label="What happened?">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="Activity type">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Activity["kind"])}
          >
            {[
              "irrigation",
              "spending",
              "sowing",
              "sale",
              "observation",
              "other",
            ].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Effective date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Known quantity (optional)">
          <input
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field label="Quantity unit">
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {["m3", "litre", "kg", "ha", "acre", "hour"].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Field>
      </div>
      {kind === "spending" || kind === "sale" ? (
        <Field label="Known amount (INR, optional)">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            min="0"
            step="any"
          />
        </Field>
      ) : null}
      <p className="chart-meta">
        Unknown quantities stay unknown. Bags are not converted without a
        reported bag mass.
      </p>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I confirm this work actually happened.
      </label>
      <ErrorNotice error={error ?? command.error} />
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={!confirmed || command.isPending}
          onClick={() => void save()}
        >
          {command.isPending ? "Recording…" : "Confirm completed work"}
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Not yet / cancel
        </button>
      </div>
    </Modal>
  );
}
function PlanReview({
  revision,
  activeId,
  onClose,
}: {
  revision: PlanRevision;
  activeId: string | null;
  onClose: () => void;
}) {
  const command = useCommand("decidePlan", {
    farmId: revision.farm_id,
    revisionId: revision.id,
  });
  const [decision, setDecision] = useState<
    "approve" | "reject" | "request_changes"
  >("approve");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const blocked = revision.constraints.some(
    (c) => c.critical && ["unknown", "failed"].includes(c.status),
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="Review the exact plan revision"
      description="Approval chooses this revision. It does not record irrigation, sowing, spending or sales."
    >
      <h3>{revision.title}</h3>
      <p className="chart-meta">
        Revision {revision.version} · {revision.status}
      </p>
      <p>{revision.summary}</p>
      <h3 style={{ marginTop: 20 }}>Assumptions and changes</h3>
      <ul>
        {revision.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      {revision.missing_inputs.length ? (
        <State title="Missing information">
          {revision.missing_inputs.join(", ")}
        </State>
      ) : null}
      {revision.constraints.map((c) => (
        <div className="result-row" key={c.key}>
          <span>
            {c.label}: {c.reason}
          </span>
          <Badge tone={c.status === "failed" ? "red" : "gold"}>
            {c.status}
          </Badge>
        </div>
      ))}
      <h3 style={{ marginTop: 20 }}>Proposed work</h3>
      {revision.tasks.map((t) => (
        <p className="chart-meta" key={t.id}>
          {t.title} — {t.description}
        </p>
      ))}
      <EvidenceLinks evidence={revision.evidence} />
      <Field label="Your decision">
        <select
          value={decision}
          onChange={(e) => {
            setDecision(e.target.value as typeof decision);
            setConfirmed(false);
          }}
        >
          <option value="approve">Approve this revision</option>
          <option value="request_changes">Request changes</option>
          <option value="reject">Reject</option>
        </select>
      </Field>
      <Field label="Reason or requested changes (optional)">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {decision === "approve" && blocked ? (
        <State title="Approval is blocked">
          A critical feasibility constraint is unknown or failed. Review the
          missing inputs first.
        </State>
      ) : null}
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I reviewed this exact revision and its assumptions.
      </label>
      <ErrorNotice error={command.error} />
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={
            !confirmed ||
            command.isPending ||
            (decision === "approve" && blocked)
          }
          onClick={() =>
            void command
              .mutateAsync({
                expected_version: revision.version,
                base_revision_id: activeId,
                decision,
                reason: reason || undefined,
              })
              .then(onClose)
          }
        >
          {command.isPending ? "Recording decision…" : "Confirm decision"}
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
function DeferTask({ task, onClose }: { task: Task; onClose: () => void }) {
  const mutation = useCommand("deferTask", {
    farmId: task.farm_id,
    taskId: task.id,
  });
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title="Defer this task"
      description="Deferring leaves the work incomplete and records no resource use."
    >
      <h3>{task.title}</h3>
      <Field label="Reason">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field label="Review date (optional)">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <ErrorNotice error={mutation.error} />
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={!reason.trim() || mutation.isPending}
          onClick={() =>
            void mutation
              .mutateAsync({
                expected_version: task.version,
                reason,
                until: date
                  ? new Date(`${date}T12:00:00Z`).toISOString()
                  : undefined,
              })
              .then(onClose)
          }
        >
          Confirm deferral
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
export function PlanPage() {
  const farmId = useFarmId();
  const q = useRead(
    "getPlan",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const tasks = useRead(
    "listTasks",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const history = useRead(
    "listPlanRevisions",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const [review, setReview] = useState<PlanRevision>();
  const [work, setWork] = useState<Task>();
  const [defer, setDefer] = useState<Task>();
  const [period, setPeriod] = useState("week");
  const [older, setOlder] = useState(false);
  if (q.isPending) return <Loading />;
  if (q.error)
    return (
      <State title="Plan unavailable" retry={() => void q.refetch()}>
        {q.error.message}
      </State>
    );
  return (
    <div className="route-content">
      <PageHeading
        title="Your Farm Plan"
        description="Understand what is proposed, what you chose, and what actually happened."
      />
      <Banner text="A considered plan. One decision at a time." />
      <div className="tabs" role="tablist" aria-label="Plan period">
        {["day", "week", "season"].map((p) => (
          <button
            type="button"
            role="tab"
            aria-selected={period === p}
            key={p}
            onClick={() => setPeriod(p)}
          >
            {p === "day" ? "Today" : p === "week" ? "This week" : "Season plan"}
          </button>
        ))}
      </div>
      <Card title="Active approved revision">
        {q.data?.active_revision ? (
          <>
            <h3>{q.data.active_revision.title}</h3>
            <p className="chart-meta">{q.data.active_revision.summary}</p>
            <Badge tone="green">
              Approved · revision {q.data.active_revision.version}
            </Badge>
            <EvidenceLinks evidence={q.data.active_revision.evidence} />
          </>
        ) : (
          <State title="No approved plan yet">
            Ask Sakha or Crop Planning to explore your goals. A proposal must be
            reviewed before becoming active.
          </State>
        )}
      </Card>
      <Card title="Proposed revisions">
        {q.data?.proposed_revisions.length ? (
          q.data.proposed_revisions.map((r) => (
            <div className="list-row" key={r.id}>
              <div>
                <h3>{r.title}</h3>
                <p>{r.summary}</p>
                <Badge tone="gold">{r.status.replaceAll("_", " ")}</Badge>
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => setReview(r)}
              >
                Review revision
              </button>
            </div>
          ))
        ) : (
          <State title="No pending proposal">
            New evidence can produce a reviewable revision; it cannot overwrite
            an approved plan.
          </State>
        )}
      </Card>
      <div className="grid-2">
        <Card title="Outstanding work">
          {tasks.data?.items.filter(
            (t) => !["completed", "cancelled"].includes(t.status),
          ).length ? (
            tasks.data.items
              .filter((t) => !["completed", "cancelled"].includes(t.status))
              .filter(
                (t) =>
                  period === "season" ||
                  !t.due_at ||
                  new Date(t.due_at).getTime() <=
                    Date.now() + (period === "day" ? 86400000 : 7 * 86400000),
              )
              .map((t) => (
                <div className="list-row" key={t.id}>
                  <div>
                    <h3>{t.title}</h3>
                    <p>{t.description}</p>
                    <Badge tone="gold">{t.status}</Badge>
                    <p className="chart-meta">
                      {t.due_at ? (
                        <DateText value={t.due_at} />
                      ) : (
                        "No due date recorded"
                      )}
                    </p>
                    <div className="actions">
                      {t.status === "pending" || t.status === "deferred" ? (
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => setWork(t)}
                        >
                          Report completed work
                        </button>
                      ) : (
                        <span className="muted">
                          Proposed work awaits plan decision.
                        </span>
                      )}
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => setDefer(t)}
                      >
                        Defer / not yet
                      </button>
                    </div>
                  </div>
                </div>
              ))
          ) : (
            <State title="No outstanding work recorded" />
          )}
        </Card>
        <Card title="Confirmed completed work">
          {tasks.data?.items.filter((t) => t.status === "completed").length ? (
            tasks.data.items
              .filter((t) => t.status === "completed")
              .map((t) => (
                <div className="list-row" key={t.id}>
                  <div>
                    <h3>{t.title}</h3>
                    <Badge tone="green">Farmer confirmed</Badge>
                  </div>
                </div>
              ))
          ) : (
            <State title="No completed tasks recorded">
              Plan approval alone never completes a task.
            </State>
          )}
          <div className="actions">
            <Link className="text-link" to="/activity">
              Activity and decision history
            </Link>
          </div>
        </Card>
      </div>
      <div className="actions">
        <button
          type="button"
          className="button secondary"
          onClick={() => setOlder(!older)}
        >
          {older ? "Hide" : "View"} earlier revisions
        </button>
        <Link className="button secondary" to="/ask">
          Ask Sakha about the plan
        </Link>
      </div>
      {older ? (
        <Card title="Revision history">
          {history.data?.items.map((r) => (
            <div className="list-row" key={r.id}>
              <div>
                <h3>{r.title}</h3>
                <p>
                  {r.status} · revision {r.version}
                </p>
                <EvidenceLinks evidence={r.evidence} />
              </div>
            </div>
          ))}
        </Card>
      ) : null}
      {review ? (
        <PlanReview
          revision={review}
          activeId={q.data?.active_revision?.id ?? null}
          onClose={() => setReview(undefined)}
        />
      ) : null}
      {work ? (
        <WorkConfirmation task={work} onClose={() => setWork(undefined)} />
      ) : null}
      {defer ? (
        <DeferTask task={defer} onClose={() => setDefer(undefined)} />
      ) : null}
    </div>
  );
}
export function AlertsPage() {
  const farmId = useFarmId();
  const q = useRead(
    "listAlerts",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const [tab, setTab] = useState("current");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Alert>();
  const list =
    q.data?.items
      .filter((a) =>
        tab === "current" ? a.status === "active" : a.status !== "active",
      )
      .filter((a) =>
        `${a.title} ${a.summary} ${a.role_key}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
      ) ?? [];
  return (
    <div className="route-content">
      <PageHeading
        title="Alerts & Notifications"
        description="Review relevant warnings, changed assumptions and reminders."
      />
      <Banner text="Understand the warning. Choose your next step." />
      <div className="tabs" role="tablist" aria-label="Alert history">
        {["current", "history"].map((t) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t === "current" ? "Current alerts" : "History"}
          </button>
        ))}
      </div>
      <Field label="Search alerts">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Keyword, crop or specialist"
        />
      </Field>
      <ErrorNotice error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : list.length ? (
        list.map((a) => (
          <Card key={a.id}>
            <div className="section-head">
              <h2>{a.title}</h2>
              <Badge tone={a.severity === "warning" ? "red" : "gold"}>
                {a.severity}
              </Badge>
            </div>
            <p>{a.summary}</p>
            <p className="chart-meta">
              {a.role_key.replaceAll("_", " ")} · {a.status} ·{" "}
              {a.freshness.status}
              <br />
              Issued <DateText value={a.issued_at} /> · valid until{" "}
              <DateText value={a.valid_until} />
            </p>
            <div className="actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setSelected(a)}
              >
                Review details
              </button>
              <Link
                className="text-link"
                to={`/agents/${a.role_key}?tab=chat&alert=${a.id}`}
              >
                Discuss with specialist
              </Link>
            </div>
          </Card>
        ))
      ) : (
        <Card>
          <State title="No matching alerts recorded">
            An unavailable feed cannot establish a fresh all clear.
          </State>
        </Card>
      )}
      <State title="Local monitoring has limits">
        Updates run while the local backend is active. Shutdown, sleep or a
        disconnected source pauses progress.
      </State>
      {selected ? (
        <AlertDetails alert={selected} onClose={() => setSelected(undefined)} />
      ) : null}
    </div>
  );
}
function OutcomeForm({
  entry,
  onClose,
}: {
  entry?: HistoryEntry;
  onClose: () => void;
}) {
  const farmId = useFarmId();
  const mutation = useCommand("recordOutcome", { farmId });
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Add a reported outcome"
      description="An outcome is your attributed report. It does not rewrite the original recommendation."
    >
      <Field label="What did you observe afterwards?">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Effective date">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
        />
        I confirm this is my report.
      </label>
      <ErrorNotice error={mutation.error} />
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={!confirm || !description.trim() || mutation.isPending}
          onClick={() =>
            void mutation
              .mutateAsync({
                confirmed: true,
                description,
                effective_at: new Date(`${date}T12:00:00Z`).toISOString(),
                activity_id:
                  entry?.kind === "actual_work" ? entry.record_id : undefined,
                finding_id:
                  entry?.kind === "finding" ? entry.record_id : undefined,
              })
              .then(onClose)
          }
        >
          Save reported outcome
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
export function ActivityPage() {
  const farmId = useFarmId();
  const [kind, setKind] = useState("");
  const q = useRead(
    "listActivity",
    { params: { farmId }, input: { kind: kind || undefined } },
    Boolean(farmId),
  );
  const [work, setWork] = useState(false);
  const [outcome, setOutcome] = useState<HistoryEntry>();
  const [details, setDetails] = useState<HistoryEntry>();
  const [correction, setCorrection] = useState<HistoryEntry>();
  return (
    <div className="route-content">
      <PageHeading
        title="Activity & Decision History"
        description="Keep suggestions, decisions, reported work and outcomes distinct."
      >
        <button type="button" className="button" onClick={() => setWork(true)}>
          Report completed work
        </button>
      </PageHeading>
      <Field label="Record type">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All records</option>
          {[
            "finding",
            "plan_proposal",
            "plan_decision",
            "actual_work",
            "correction",
            "outcome",
            "alert",
          ].map((k) => (
            <option value={k} key={k}>
              {k.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </Field>
      <ErrorNotice error={q.error} />
      <Card>
        {q.isPending ? (
          <Loading />
        ) : q.data?.items.length ? (
          q.data.items.map((h) => (
            <div className="list-row" key={h.id}>
              <div>
                <Badge
                  tone={
                    h.kind === "actual_work"
                      ? "green"
                      : h.kind === "plan_proposal"
                        ? "gold"
                        : "neutral"
                  }
                >
                  {h.kind.replaceAll("_", " ")}
                </Badge>
                <h3 style={{ marginTop: 8 }}>{h.title}</h3>
                <p>{h.summary}</p>
                <small>
                  <DateText value={h.created_at} />
                </small>
                <div className="actions">
                  {h.kind === "actual_work" ? (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setDetails(h)}
                    >
                      Inspect / correct report
                    </button>
                  ) : null}
                  {h.kind === "outcome" ? (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setCorrection(h)}
                    >
                      Correct outcome
                    </button>
                  ) : null}
                  {h.kind === "plan_decision" || h.kind === "plan_proposal" ? (
                    <Link className="text-link" to="/plan">
                      Original plan context
                    </Link>
                  ) : h.kind === "finding" ? (
                    <Link
                      className="text-link"
                      to={`/agents/${h.role_key ?? "climate"}?tab=history`}
                    >
                      Specialist history
                    </Link>
                  ) : null}
                  {h.kind === "actual_work" || h.kind === "finding" ? (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setOutcome(h)}
                    >
                      Add outcome
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        ) : (
          <State title="No history recorded">
            Saved reports, decisions and actual work appear here with their own
            record types.
          </State>
        )}
      </Card>
      <p className="chart-meta">
        Correct shared facts in My Farm. Deletion and private access can remove
        historical detail consistently from derived stores.
      </p>
      {work ? <WorkConfirmation onClose={() => setWork(false)} /> : null}
      {details ? (
        <ActualWorkDetails
          entry={details}
          onClose={() => setDetails(undefined)}
        />
      ) : null}
      {correction ? (
        <OutcomeCorrection
          entry={correction}
          onClose={() => setCorrection(undefined)}
        />
      ) : null}
      {outcome ? (
        <OutcomeForm entry={outcome} onClose={() => setOutcome(undefined)} />
      ) : null}
    </div>
  );
}
function ActualWorkDetails({
  entry,
  onClose,
}: {
  entry: HistoryEntry;
  onClose: () => void;
}) {
  const farmId = useFarmId();
  const activity = useRead("getActivity", {
    params: { farmId, activityId: entry.record_id },
    input: {},
  });
  return (
    <Modal open onClose={onClose} title="Recorded actual work">
      <ErrorNotice error={activity.error} />
      {activity.isPending ? (
        <Loading />
      ) : activity.data ? (
        <ActivityCorrection initial={activity.data} onClose={onClose} />
      ) : (
        <State title="Record unavailable">
          This reference may have been deleted or restricted.
        </State>
      )}
    </Modal>
  );
}
function ActivityCorrection({
  initial,
  onClose,
}: {
  initial: Activity;
  onClose: () => void;
}) {
  const mutation = useCommand("correctActivity", {
    farmId: initial.farm_id,
    activityId: initial.id,
  });
  const [edit, setEdit] = useState(false);
  const [description, setDescription] = useState(initial.description);
  const [date, setDate] = useState(initial.effective_at.slice(0, 10));
  const [confirmed, setConfirmed] = useState(false);
  return (
    <>
      <dl className="data-list">
        <div>
          <dt>Activity</dt>
          <dd>{initial.kind}</dd>
        </div>
        <div>
          <dt>Effective time</dt>
          <dd>
            <DateText
              value={initial.effective_at}
              precision={initial.provenance.effective_time_precision}
            />
          </dd>
        </div>
        <div>
          <dt>Quantity</dt>
          <dd>{quantityText(initial.quantity)}</dd>
        </div>
        <div>
          <dt>Money</dt>
          <dd>{quantityText(initial.money)}</dd>
        </div>
        <div>
          <dt>Attribution</dt>
          <dd>{initial.provenance.attribution}</dd>
        </div>
      </dl>
      <p className="chart-meta">{initial.description}</p>
      {!edit ? (
        <button
          type="button"
          className="button secondary"
          onClick={() => setEdit(true)}
        >
          Correct this report
        </button>
      ) : (
        <>
          <Field label="Corrected description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Corrected effective date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <p className="chart-meta">
            Quantity and money retain the original known values. This correction
            preserves lineage and does not duplicate work.
          </p>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed the corrected report.
          </label>
          <ErrorNotice error={mutation.error} />
          <div className="actions">
            <button
              type="button"
              className="button"
              disabled={!confirmed || !description.trim() || mutation.isPending}
              onClick={() =>
                void mutation
                  .mutateAsync({
                    farm_id: initial.farm_id,
                    kind: initial.kind,
                    description,
                    confirmed: true,
                    confirmed_by: "farmer",
                    effective_at: new Date(`${date}T12:00:00Z`).toISOString(),
                    task_id: initial.task_id,
                    quantity: initial.quantity,
                    money: initial.money,
                    corrects_id: initial.id,
                    expected_version: initial.version,
                    provenance: {
                      ...initial.provenance,
                      effective_at: new Date(`${date}T12:00:00Z`).toISOString(),
                      effective_time_precision: "date",
                      original_wording: description,
                    },
                  })
                  .then(onClose)
              }
            >
              Confirm correction
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setEdit(false)}
            >
              Cancel changes
            </button>
          </div>
        </>
      )}
    </>
  );
}
function OutcomeCorrection({
  entry,
  onClose,
}: {
  entry: HistoryEntry;
  onClose: () => void;
}) {
  const farmId = useFarmId();
  const original = useRead("getOutcome", {
    params: { farmId, outcomeId: entry.record_id },
    input: {},
  });
  const mutation = useCommand("correctOutcome", {
    farmId,
    outcomeId: entry.record_id,
  });
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Modal open onClose={onClose} title="Correct a reported outcome">
      <ErrorNotice error={original.error ?? mutation.error} />
      {original.data ? (
        <>
          <p>{original.data.title}</p>
          <p className="chart-meta">{original.data.summary}</p>
          <Field label="Corrected outcome">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Effective date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm this corrected report.
          </label>
          <button
            type="button"
            className="button"
            disabled={
              !confirmed || !description.trim() || !date || mutation.isPending
            }
            onClick={() =>
              void mutation
                .mutateAsync({
                  confirmed: true,
                  expected_version: original.data?.version ?? 1,
                  description,
                  effective_at: new Date(`${date}T12:00:00Z`).toISOString(),
                })
                .then(onClose)
            }
          >
            Confirm outcome correction
          </button>
        </>
      ) : (
        <Loading />
      )}
    </Modal>
  );
}
