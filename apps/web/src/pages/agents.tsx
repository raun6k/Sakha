import {
  type Finding,
  type Preferences,
  type Role,
  RoleKey,
  type Run,
  type ScenarioRequest,
} from "@sakha/contracts";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  MessageCircle,
  Paperclip,
  Send,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import remarkGfm from "remark-gfm";
import {
  ChartCard,
  EvidenceLinks,
  FindingDetails,
  SourceDetails,
} from "../components/evidence";
import {
  Badge,
  Banner,
  Card,
  DateText,
  ErrorNotice,
  Field,
  factValue,
  Loading,
  Modal,
  PageHeading,
  quantityText,
  RoleCard,
  RoleIcon,
  State,
} from "../components/ui";
import {
  executeCommand,
  useCommand,
  useFarmId,
  useRead,
  useService,
} from "../services/context";
import { commandKey } from "../services/http";
import { emptyStream, reconcileEvent } from "../state/stream";
import { useUi } from "../state/ui";
import { QuickUpdate } from "./farm";

const category: { title: string; roles: string[] }[] = [
  { title: "Climate & resources", roles: ["climate", "weather", "water"] },
  { title: "Crop decisions", roles: ["crop_planning", "crop_care"] },
  {
    title: "Business & support",
    roles: ["market", "farm_finance", "government_support"],
  },
];
export function RoleAbout({ role }: { role: Role }) {
  const [source, setSource] = useState<string>();
  return (
    <>
      <h2>What does this specialist do?</h2>
      <p className="chart-meta">{role.description}</p>
      <h3>How can it help me?</h3>
      <ul>
        {role.help.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      <h3>What information does it use?</h3>
      <p className="chart-meta">
        Authorized shared farm context and supported source evidence. A catalog
        assignment does not establish a successful fetch.
      </p>
      <div className="actions">
        {role.source_ids.map((id) => (
          <button
            type="button"
            className="button secondary"
            key={id}
            onClick={() => setSource(id)}
          >
            Source {id}
          </button>
        ))}
      </div>
      <h3 style={{ marginTop: 24 }}>What can I ask?</h3>
      <ul>
        {role.questions.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      <h3>Limits</h3>
      <ul>
        {role.limitations.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      {role.capabilities.map((c) => (
        <p className="chart-meta" key={c.key}>
          {c.key.replaceAll("_", " ")}: {c.status.replaceAll("_", " ")}
          {c.reason ? ` — ${c.reason}` : ""}
        </p>
      ))}
      {source ? (
        <SourceDetails sourceId={source} onClose={() => setSource(undefined)} />
      ) : null}
    </>
  );
}
export function AgentsPage() {
  const q = useRead("listAgents", { input: {} });
  const [selected, setSelected] = useState<Role>();
  if (q.isPending) return <Loading />;
  if (q.error)
    return (
      <State
        title="Specialist directory unavailable"
        retry={() => void q.refetch()}
      >
        {q.error.message}
      </State>
    );
  return (
    <div className="route-content">
      <PageHeading
        title="Your farming specialists"
        description="Eight dedicated roles. One shared farm context."
      />
      <Banner text="The right perspective for every farming question." />
      {category.map((group) => (
        <section className="section-block" key={group.title}>
          <div className="section-head">
            <h2>{group.title}</h2>
          </div>
          <div className="grid-3">
            {q.data
              ?.filter((r) => group.roles.includes(r.key))
              .map((role) => (
                <RoleCard
                  key={role.key}
                  role={role}
                  info={() => setSelected(role)}
                />
              ))}
          </div>
        </section>
      ))}
      <Card title="Need a coordinated view?">
        <p>
          Ask Sakha brings permitted specialist findings together and helps you
          review a shared plan.
        </p>
        <div className="actions">
          <Link className="button" to="/ask">
            Ask Sakha <ArrowRight size={16} />
          </Link>
        </div>
      </Card>
      {selected ? (
        <Modal
          open
          onClose={() => setSelected(undefined)}
          title={selected.name}
        >
          <RoleAbout role={selected} />
          <div className="actions">
            <Link
              className="button"
              to={`/agents/${selected.key}?tab=chat`}
              onClick={() => setSelected(undefined)}
            >
              Open conversation
            </Link>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
export function FarmContext() {
  const farmId = useFarmId();
  const facts = useRead(
    "listFacts",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  return (
    <Card
      title="Your farm context"
      action={
        <Link className="text-link" to="/farm">
          View farm
        </Link>
      }
    >
      <dl className="data-list">
        {[
          ["Situation", "situation"],
          ["Current crop", "current_crop"],
          ["Intended crop", "intended_crop"],
          ["Stage", "crop_stage"],
          ["Water source", "water_source"],
          ["Water available", "water_availability"],
        ].map(([label, key]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{factValue(facts.data?.items ?? [], key ?? "")}</dd>
          </div>
        ))}
      </dl>
      <p className="chart-meta">
        New questions use current authorized facts. Older messages retain their
        original context.
      </p>
    </Card>
  );
}
function PendingRun({ run }: { run: Run }) {
  const [answer, setAnswer] = useState("");
  const answerCommand = useCommand("answerClarification", {
    farmId: run.farm_id,
    runId: run.id,
    clarificationId:
      run.pending.find((p) => p.kind === "clarification")?.id ?? "",
  });
  const approval = useCommand("respondApproval", {
    farmId: run.farm_id,
    runId: run.id,
    approvalId:
      run.pending.find((p) => p.kind === "runtime_approval")?.id ?? "",
  });
  return (
    <>
      {run.pending
        .filter((p) => p.status === "pending")
        .map((p) => (
          <Card
            key={p.id}
            title={
              p.kind === "clarification"
                ? "One detail is needed"
                : "Review processing request"
            }
          >
            <p>{p.question}</p>
            {p.kind === "clarification" ? (
              <>
                <Field label="Your answer">
                  <input
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="You can answer Not sure if unknown."
                  />
                </Field>
                <div className="suggestions">
                  {p.options.map((option) => (
                    <button
                      type="button"
                      className="button secondary"
                      key={option}
                      onClick={() => setAnswer(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="button"
                    disabled={!answer.trim() || answerCommand.isPending}
                    onClick={() =>
                      void answerCommand.mutateAsync({
                        expected_version: p.version,
                        answer,
                      })
                    }
                  >
                    Save answer and continue
                  </button>
                </div>
                <ErrorNotice error={answerCommand.error} />
              </>
            ) : (
              <>
                <p className="chart-meta">
                  This processing request is separate from approving a farming
                  plan.
                </p>
                <div className="actions">
                  <button
                    type="button"
                    className="button"
                    disabled={approval.isPending}
                    onClick={() =>
                      approval.mutate({
                        expected_version: p.version,
                        decision: "allow",
                      })
                    }
                  >
                    Allow this request
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={approval.isPending}
                    onClick={() =>
                      approval.mutate({
                        expected_version: p.version,
                        decision: "deny",
                      })
                    }
                  >
                    Deny
                  </button>
                </div>
                <ErrorNotice error={approval.error} />
              </>
            )}
          </Card>
        ))}
    </>
  );
}
export function ConversationView({ role }: { role: Role }) {
  const farmId = useFarmId();
  const { service } = useService();
  const client = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const conversations = useRead(
    "listConversations",
    { params: { farmId }, input: { role_key: role.key } },
    Boolean(farmId),
  );
  const [createdId, setCreatedId] = useState("");
  const cid = search.get("conversation") ?? createdId ?? "";
  const conversationId = cid || conversations.data?.items[0]?.id || "";
  const messages = useRead(
    "listMessages",
    { params: { farmId, conversationId }, input: {} },
    Boolean(conversationId),
  );
  const [selectedRunId, setRunId] = useState("");
  const storedRuns = useRead(
    "listRuns",
    { params: { farmId }, input: { conversation_id: conversationId } },
    Boolean(conversationId),
  );
  const runId =
    selectedRunId ||
    storedRuns.data?.items.find((r) =>
      [
        "queued",
        "running",
        "waiting_clarification",
        "waiting_approval",
        "interrupted",
      ].includes(r.state),
    )?.id ||
    "";
  const run = useRead(
    "getRun",
    { params: { farmId, runId }, input: {} },
    Boolean(runId),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [stream, setStream] = useState(emptyStream);
  const [connection, setConnection] = useState("");
  const [update, setUpdate] = useState(false);
  const text = useUi((s) => s.composer[role.key] ?? "");
  const setText = useUi((s) => s.setComposer);
  const [finding, setFinding] = useState<Finding>();
  const findings = useRead(
    "listFindings",
    { params: { farmId }, input: { role_key: role.key } },
    Boolean(farmId),
  );
  const submission = useRef(false);
  const homeConsumed = useRef(false);
  const pendingCommand = useRef<
    { key: string; text: string; conversationId: string } | undefined
  >(undefined);
  const canChat = role.capabilities.some(
    (c) => c.key === "chat" && ["enabled", "degraded"].includes(c.status),
  );
  const active =
    run.data &&
    ["queued", "running", "waiting_clarification", "waiting_approval"].includes(
      run.data.state,
    );
  const cancel = useCommand("cancelRun", { farmId, runId });
  const resume = useCommand("resumeRun", { farmId, runId });
  useEffect(() => {
    if (!farmId) return;
    return service.subscribe(
      farmId,
      undefined,
      (event) => {
        setConnection("");
        setStream((s) => reconcileEvent(s, event));
        if (event.type !== "text_batch")
          void client.invalidateQueries({ queryKey: ["sakha", farmId] });
      },
      (e) => {
        setConnection(e.message);
      },
      (state) => {
        if (state === "connected") {
          setConnection("");
          void client.invalidateQueries({ queryKey: ["sakha", farmId] });
        }
      },
    );
  }, [farmId, service, client]);
  const send = async (value: string) => {
    if (submission.current || !value.trim() || !canChat) return;
    submission.current = true;
    setBusy(true);
    setError(undefined);
    try {
      let id = conversationId;
      if (!id) {
        const c = await executeCommand(service, "createConversation", {
          params: { farmId },
          input: { role_key: role.key, title: value.slice(0, 80) },
        });
        id = c.id;
        setCreatedId(id);
      }
      const old = pendingCommand.current;
      const command =
        old && old.text === value && old.conversationId === id
          ? old
          : { key: commandKey(), text: value, conversationId: id };
      pendingCommand.current = command;
      const result = await executeCommand(
        service,
        "submitTurn",
        {
          params: { farmId, conversationId: id },
          input: {
            text: value,
            evidence:
              search.get("evidence") &&
              search.get("source") &&
              search.get("snapshot")
                ? [
                    {
                      evidence_id: search.get("evidence") ?? "",
                      source_id: search.get("source") ?? "",
                      snapshot_id: search.get("snapshot") ?? "",
                    },
                  ]
                : [],
          },
        },
        command.key,
      );
      pendingCommand.current = undefined;
      setRunId(result.id);
      setText(role.key, "");
      await client.invalidateQueries({ queryKey: ["sakha", farmId] });
    } catch (e) {
      setError(e);
      setText(role.key, value);
    } finally {
      submission.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    const state = location.state as {
      question?: string;
      questionId?: string;
    } | null;
    if (state?.question && !homeConsumed.current && conversations.isSuccess) {
      homeConsumed.current = true;
      setText(role.key, state.question);
      navigate(location.pathname + location.search, {
        replace: true,
        state: null,
      });
      void send(state.question);
    }
  }, [
    conversations.isSuccess,
    location.state,
    location.pathname,
    location.search,
    navigate,
    role.key,
    setText,
    send,
  ]);
  return (
    <>
      <div className="suggestions">
        {role.questions.map((q) => (
          <button
            type="button"
            className="button secondary"
            key={q}
            onClick={() => setText(role.key, q)}
          >
            {q}
          </button>
        ))}
      </div>
      {!canChat ? (
        <State
          title={
            role.capabilities.find((c) => c.key === "chat")?.status ===
            "coming_soon"
              ? "This specialist is coming soon"
              : "Conversation unavailable"
          }
        >
          {role.capabilities.find((c) => c.key === "chat")?.reason ??
            "A supported runtime is required. Farm records remain available."}
        </State>
      ) : null}
      {search.get("alert") || search.get("evidence") ? (
        <p className="notice">
          This question carries selected{" "}
          {search.get("alert") ? "alert" : "evidence"} context. Its snapshot is
          kept separate from newer data.
        </p>
      ) : null}
      <div className="transcript">
        {messages.data?.items.length ? (
          messages.data.items.map((message) => (
            <article className={`message ${message.author}`} key={message.id}>
              <header>
                <RoleIcon
                  role={message.author === "farmer" ? "crop_care" : role.key}
                />
                <strong>
                  {message.author === "farmer" ? "You" : role.name}
                </strong>
                <small>
                  <DateText value={message.created_at} />
                </small>
              </header>
              <Markdown remarkPlugins={[remarkGfm]} skipHtml>
                {message.text}
              </Markdown>
              <EvidenceLinks evidence={message.context.evidence} />
              {message.status !== "final" ? (
                <Badge tone="gold">{message.status}</Badge>
              ) : null}
            </article>
          ))
        ) : (
          <Card title="What is on your mind?">
            <p>
              Ask a question, describe an observation, or explore a farming
              scenario. Facts are saved through their own confirmation flow.
            </p>
          </Card>
        )}
        {runId && stream.partial[runId] ? (
          <div className="message partial" aria-live="polite">
            <p>{stream.partial[runId]}</p>
            <Badge>Response in progress</Badge>
          </div>
        ) : null}
      </div>
      {run.data ? (
        <>
          <div className="notice" role="status">
            <MessageCircle size={19} />
            {stream.progress[runId] ??
              run.data.progress ??
              run.data.state.replaceAll("_", " ")}
            {run.data.state === "completed" ? <Check size={18} /> : null}
          </div>
          <PendingRun run={run.data} />
          {run.data.failure ? (
            <ErrorNotice error={new Error(run.data.failure.message)} />
          ) : null}
          {active &&
          run.data.capabilities.some(
            (c) => c.key === "cancel" && c.status === "enabled",
          ) ? (
            <button
              type="button"
              className="button secondary"
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate({ expected_version: run.data?.version ?? 1 })
              }
            >
              Stop this response
            </button>
          ) : null}
          {run.data.state === "interrupted" ? (
            <State title="Response interrupted">
              Review the saved transcript before continuing.
              <button
                type="button"
                className="button secondary"
                disabled={resume.isPending}
                onClick={() =>
                  resume.mutate({ expected_version: run.data?.version ?? 1 })
                }
              >
                Resume this response
              </button>
              <ErrorNotice error={resume.error} />
            </State>
          ) : null}
        </>
      ) : null}
      {connection ? (
        <State title="Updates disconnected">{connection}</State>
      ) : null}
      <ErrorNotice error={error ?? messages.error ?? cancel.error} />
      {findings.data?.items.map((f) => (
        <Card key={f.id} title={f.title}>
          <p>{f.summary}</p>
          <div className="actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setFinding(f)}
            >
              Recommendation details
            </button>
            <Link className="text-link" to="/plan">
              Review plan
            </Link>
          </div>
        </Card>
      ))}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <textarea
          aria-label={`Ask ${role.name}`}
          value={text}
          onChange={(e) => setText(role.key, e.target.value)}
          placeholder="Ask a farming question…"
          rows={2}
        />
        <button
          className="button"
          type="submit"
          disabled={busy || Boolean(active) || !canChat || !text.trim()}
          aria-label="Send question"
        >
          <Send size={20} />
        </button>
      </form>
      <div className="actions">
        <button
          type="button"
          className="text-link"
          onClick={() => setUpdate(true)}
        >
          Record a farm observation
        </button>
        <Link className="text-link" to="/plan">
          Review a plan
        </Link>
      </div>
      <QuickUpdate open={update} onClose={() => setUpdate(false)} />
      {finding ? (
        <FindingDetails
          finding={finding}
          onClose={() => setFinding(undefined)}
        />
      ) : null}
    </>
  );
}
export function AskPage() {
  const q = useRead("listAgents", { input: {} });
  const role = q.data?.find((r) => r.key === "chief_of_staff");
  return (
    <div className="route-content">
      <PageHeading
        title="Ask Sakha"
        description="Your Chief of Staff for coordinated farming decisions."
      />
      <Banner text="A shared view. A considered next step." />
      {q.error ? (
        <ErrorNotice error={q.error} />
      ) : role ? (
        <div className="workspace-layout">
          <div>
            <ConversationView role={role} />
          </div>
          <aside className="rail">
            <FarmContext />
            <Card title="Working together">
              <p>
                Permitted specialists can contribute internally. Missing results
                stay visible; no percentage implies confidence.
              </p>
              <div className="actions">
                <Link className="text-link" to="/agents">
                  Explore the specialists
                </Link>
              </div>
            </Card>
          </aside>
        </div>
      ) : (
        <Loading />
      )}
    </div>
  );
}
function PreferencesForm({ initial }: { initial: Preferences }) {
  const [draft, setDraft] = useState(initial);
  const farmId = useFarmId();
  const mutation = useCommand("updatePreferences", {
    farmId,
    roleKey: initial.role_key,
  });
  const [saved, setSaved] = useState(false);
  const role = initial.role_key;
  const csv = (value: string) =>
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return (
    <Card title="How this specialist works with you">
      <p>
        These choices change your experience. Actual crop, location, water and
        budget facts belong in My Farm.
      </p>
      <div className="empty-space" />
      <Field label="Explanation detail">
        <select
          value={draft.explanation}
          onChange={(e) => {
            setSaved(false);
            setDraft({
              ...draft,
              explanation: e.target.value as Preferences["explanation"],
            });
          }}
        >
          <option value="inherit">Use application default</option>
          <option value="simple">Simple</option>
          <option value="detailed">Detailed</option>
        </select>
      </Field>
      {role === "climate" ? (
        <Field
          label="Planning horizon"
          hint="A year-long preference does not create a year-long local forecast."
        >
          <select
            value={draft.planning_horizon ?? "season"}
            onChange={(e) =>
              setDraft({
                ...draft,
                planning_horizon: e.target
                  .value as Preferences["planning_horizon"],
              })
            }
          >
            <option value="month">Upcoming month</option>
            <option value="season">Season</option>
            <option value="year">Year</option>
          </select>
        </Field>
      ) : null}
      {role === "weather" ? (
        <>
          <Field label="Temperature display">
            <select
              value={draft.temperature_unit ?? "inherit"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  temperature_unit: e.target
                    .value as Preferences["temperature_unit"],
                })
              }
            >
              <option value="inherit">Use global units</option>
              <option value="celsius">Celsius</option>
              <option value="fahrenheit">Fahrenheit</option>
            </select>
          </Field>
          <Field label="Activities of interest (comma separated)">
            <input
              value={draft.activities.join(", ")}
              onChange={(e) =>
                setDraft({ ...draft, activities: csv(e.target.value) })
              }
            />
          </Field>
        </>
      ) : null}
      {role === "crop_planning" ? (
        <>
          <Field label="Crops of interest (comma separated)">
            <input
              value={draft.crops_of_interest.join(", ")}
              onChange={(e) =>
                setDraft({ ...draft, crops_of_interest: csv(e.target.value) })
              }
            />
          </Field>
          <Field label="Priorities">
            <select
              value={draft.priorities[0] ?? "lower_water_use"}
              onChange={(e) =>
                setDraft({ ...draft, priorities: [e.target.value] })
              }
            >
              <option value="lower_water_use">Lower water use</option>
              <option value="lower_financial_risk">Lower financial risk</option>
              <option value="higher_potential_return">
                Higher potential return
              </option>
            </select>
          </Field>
        </>
      ) : null}
      {role === "crop_care" ? (
        <>
          <Field
            label="Crop to follow"
            hint="Display selection only; it does not change the actual crop."
          >
            <input
              value={draft.tracked_crop ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, tracked_crop: e.target.value })
              }
            />
          </Field>
          <Field label="Check-in preference">
            <select
              value={draft.check_in_frequency ?? "as_needed"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  check_in_frequency: e.target
                    .value as Preferences["check_in_frequency"],
                })
              }
            >
              <option value="as_needed">As needed</option>
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
            </select>
          </Field>
        </>
      ) : null}
      {role === "water" ? (
        <Field label="Water descriptions">
          <select
            value={draft.water_description ?? "simple"}
            onChange={(e) =>
              setDraft({
                ...draft,
                water_description: e.target
                  .value as Preferences["water_description"],
              })
            }
          >
            <option value="simple">Simple descriptions</option>
            <option value="detailed">Include measurement details</option>
          </select>
        </Field>
      ) : null}
      {role === "market" ? (
        <>
          <Field label="Preferred markets (comma separated)">
            <input
              value={draft.preferred_markets.join(", ")}
              onChange={(e) =>
                setDraft({ ...draft, preferred_markets: csv(e.target.value) })
              }
            />
          </Field>
          <Field label="Produce display units">
            <select
              value={draft.produce_unit ?? "kg"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  produce_unit: e.target.value as Preferences["produce_unit"],
                })
              }
            >
              {["kg", "quintal", "tonne", "bag"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Acceptable travel distance (km, optional)">
            <input
              type="number"
              min="0"
              value={draft.max_distance_km ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  max_distance_km: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
          </Field>
        </>
      ) : null}
      {role === "farm_finance" ? (
        <Field label="Risk preference">
          <select
            value={draft.risk_preference ?? "lower_risk"}
            onChange={(e) =>
              setDraft({
                ...draft,
                risk_preference: e.target
                  .value as Preferences["risk_preference"],
              })
            }
          >
            <option value="lower_risk">Lower financial risk</option>
            <option value="balanced">Balanced</option>
          </select>
        </Field>
      ) : null}
      {role === "government_support" ? (
        <Field label="Areas of assistance (comma separated)">
          <input
            value={draft.assistance_interests.join(", ")}
            onChange={(e) =>
              setDraft({ ...draft, assistance_interests: csv(e.target.value) })
            }
          />
        </Field>
      ) : null}
      <ErrorNotice error={mutation.error} />
      {saved ? (
        <p className="notice" role="status">
          Preferences saved.
        </p>
      ) : null}
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={mutation.isPending}
          onClick={() =>
            void mutation.mutateAsync(draft).then(() => setSaved(true))
          }
        >
          {mutation.isPending ? "Saving…" : "Save preferences"}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setDraft(initial);
            setSaved(false);
          }}
        >
          Cancel changes
        </button>
        <Link className="text-link" to="/farm">
          Update shared facts
        </Link>
      </div>
    </Card>
  );
}
const tools: Record<
  string,
  {
    title: string;
    kind: ScenarioRequest["kind"];
    fields: { key: string; label: string; unit?: string; money?: boolean }[];
    note: string;
  }[]
> = {
  climate: [
    {
      title: "Seasonal risk scenario",
      kind: "seasonal_risk",
      fields: [
        { key: "crop", label: "Crop of interest" },
        { key: "season", label: "Planning season" },
        { key: "water_availability", label: "Reported water context" },
      ],
      note: "A seasonal signal is not a certain local rainfall prediction.",
    },
  ],
  weather: [],
  crop_planning: [
    {
      title: "Compare crop options",
      kind: "crop_comparison",
      fields: [
        { key: "crops", label: "Crop options (comma separated)" },
        { key: "area", label: "Scenario area", unit: "ha" },
        { key: "water_availability", label: "Water context" },
        { key: "budget", label: "Scenario spending limit (INR)", money: true },
      ],
      note: "Suitability, water and affordability require grounded inputs; scenario choices do not change the actual crop.",
    },
    {
      title: "Build a planting scenario",
      kind: "planting_plan",
      fields: [
        { key: "crop", label: "Intended crop" },
        { key: "area", label: "Area", unit: "ha" },
        { key: "sowing_window", label: "Intended sowing period" },
        { key: "budget", label: "Spending limit (INR)", money: true },
      ],
      note: "Sowing dates and contingency guidance require supported regional evidence.",
    },
  ],
  crop_care: [
    {
      title: "Review a crop observation",
      kind: "crop_care",
      fields: [
        { key: "crop", label: "Crop" },
        { key: "stage", label: "Reported stage" },
        { key: "condition", label: "What do you observe?" },
      ],
      note: "An observation is not a diagnosis. Save actual reports through Update my farm.",
    },
  ],
  water: [
    {
      title: "Water availability assessment",
      kind: "water_budget",
      fields: [
        {
          key: "available_water",
          label: "Known available water (optional)",
          unit: "m3",
        },
        { key: "crop", label: "Crop" },
        { key: "area", label: "Area", unit: "ha" },
      ],
      note: "Unknown supply stays unknown; crop needs require a sourced method.",
    },
    {
      title: "Irrigation allocation scenario",
      kind: "irrigation_allocation",
      fields: [
        { key: "available_water", label: "Available water", unit: "m3" },
        { key: "irrigation_need", label: "Known irrigation need", unit: "m3" },
      ],
      note: "This scenario does not record irrigation or water use.",
    },
  ],
  market: [
    {
      title: "Compare dated market options",
      kind: "market_proceeds",
      fields: [
        { key: "market", label: "Mandi / market" },
        { key: "commodity", label: "Commodity" },
        { key: "variety", label: "Variety" },
        { key: "price_date", label: "Price date" },
        { key: "quantity", label: "Harvest scenario quantity", unit: "kg" },
        { key: "price", label: "Dated price per kg (INR)", money: true },
        { key: "costs", label: "Known sale costs (INR)", money: true },
      ],
      note: "Past prices are not future guaranteed returns. Bag quantities need a known bag mass.",
    },
    {
      title: "Sale or storage scenario",
      kind: "sale_storage",
      fields: [
        { key: "quantity", label: "Quantity", unit: "kg" },
        {
          key: "sale_price",
          label: "Current dated price per kg (INR)",
          money: true,
        },
        {
          key: "future_price",
          label: "Hypothetical future price (INR)",
          money: true,
        },
        {
          key: "storage_cost",
          label: "Known storage costs (INR)",
          money: true,
        },
        { key: "loss", label: "Expected losses (if known)" },
      ],
      note: "Future prices and losses are assumptions; no sale is recorded.",
    },
  ],
  farm_finance: [
    {
      title: "Crop budget scenario",
      kind: "crop_budget",
      fields: [
        { key: "crop", label: "Crop" },
        { key: "cost", label: "Total known scenario costs (INR)", money: true },
        { key: "input_cost", label: "Other input costs (INR)", money: true },
        { key: "labour_cost", label: "Labour costs (INR)", money: true },
        { key: "budget", label: "Spending limit (INR)", money: true },
      ],
      note: "Scenario costs are hypothetical. Actual spending uses a separate confirmation.",
    },
    {
      title: "Compare financial scenarios",
      kind: "financial_comparison",
      fields: [
        { key: "cost", label: "Total scenario costs (INR)", money: true },
        { key: "proceeds", label: "Hypothetical proceeds (INR)", money: true },
        { key: "option_a_cost", label: "Option A costs (INR)", money: true },
        { key: "option_b_cost", label: "Option B costs (INR)", money: true },
        { key: "budget", label: "Spending limit (INR)", money: true },
      ],
      note: "Affordability does not waive agronomic or water constraints.",
    },
  ],
  government_support: [
    {
      title: "Programme document checklist",
      kind: "scheme_checklist",
      fields: [
        { key: "scheme", label: "Programme / scheme" },
        { key: "state", label: "State / jurisdiction" },
        { key: "support_area", label: "Assistance needed" },
        { key: "document_date", label: "Official document date" },
      ],
      note: "Official programme guidance does not establish eligibility, a benefit or a filed application. Optional private details need purpose-scoped consent.",
    },
  ],
};
function ScenarioBuilder({
  role,
  tool,
}: {
  role: Role;
  tool: (typeof tools)[string][number];
}) {
  const farmId = useFarmId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>();
  const mutation = useCommand("createScenario", { farmId });
  const submit = async () => {
    setError(undefined);
    try {
      const inputs: ScenarioRequest["inputs"] = {};
      for (const field of tool.fields) {
        const text = values[field.key]?.trim();
        if (!text) {
          inputs[field.key] = { kind: "unknown", reason: "Not supplied" };
          continue;
        }
        if (field.unit || field.money) {
          const number = Number(text);
          if (!Number.isFinite(number) || number < 0)
            throw new Error(
              `${field.label} must be a non-negative number or blank.`,
            );
          inputs[field.key] = field.money
            ? { minor_units: Math.round(number * 100), currency: "INR" }
            : { kind: "known", value: number, unit: field.unit ?? "" };
        } else inputs[field.key] = text;
      }
      await mutation.mutateAsync({
        farm_id: farmId,
        role_key: role.key,
        kind: tool.kind,
        inputs,
        assumptions: [tool.note],
        evidence: [],
      });
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Card title={tool.title}>
      <Badge tone="gold">Hypothetical scenario</Badge>
      <p className="chart-meta">{tool.note}</p>
      <div className="form-grid">
        {tool.fields.map((field) => (
          <Field key={field.key} label={field.label}>
            <input
              value={values[field.key] ?? ""}
              onChange={(e) =>
                setValues({ ...values, [field.key]: e.target.value })
              }
              type={field.money || field.unit ? "number" : "text"}
              min={field.money || field.unit ? "0" : undefined}
              step="any"
            />
          </Field>
        ))}
      </div>
      <ErrorNotice error={error ?? mutation.error} />
      <button
        type="button"
        className="button secondary"
        disabled={mutation.isPending}
        onClick={() => void submit()}
      >
        {mutation.isPending ? "Checking scenario…" : "Check scenario"}
      </button>
      {mutation.data ? (
        <section className="section-block">
          <h3>{mutation.data.status.replaceAll("_", " ")}</h3>
          {Object.entries(mutation.data.results).map(([key, value]) => (
            <div className="result-row" key={key}>
              <span>{key.replaceAll("_", " ")}</span>
              <strong>{quantityText(value)}</strong>
            </div>
          ))}
          {mutation.data.missing_inputs.length ? (
            <State title="More information is needed">
              {mutation.data.missing_inputs.join(", ")}
            </State>
          ) : null}
          {mutation.data.constraints.map((c) => (
            <div className="result-row" key={c.key}>
              <span>
                {c.label} — {c.reason}
              </span>
              <Badge tone={c.status === "failed" ? "red" : "gold"}>
                {c.status}
              </Badge>
            </div>
          ))}
          <p className="chart-meta">
            {mutation.data.origin.replaceAll("_", " ")} · Method{" "}
            {mutation.data.method_version}
          </p>
        </section>
      ) : null}
    </Card>
  );
}
function RolePanels({ role }: { role: Role }) {
  const farmId = useFarmId();
  const insights = useRead(
    "getInsights",
    { params: { farmId }, input: {} },
    Boolean(farmId) && ["climate", "weather"].includes(role.key),
  );
  const tasks = useRead(
    "listTasks",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const history = useRead(
    "listActivity",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const [update, setUpdate] = useState(false);
  return (
    <>
      {["climate", "weather"].includes(role.key) ? (
        <>
          <h2 style={{ marginBottom: 16 }}>
            {role.key === "weather"
              ? "Forecasts and rainfall timelines"
              : "Climate history and outlook"}
          </h2>
          {insights.data?.series
            .filter((s) =>
              role.key === "climate"
                ? s.source_id === "C01"
                : s.source_id !== "C01",
            )
            .map((s) => (
              <ChartCard key={s.id} series={s} />
            ))}
          {!insights.data?.series.length ? (
            <Card>
              <State title="Source information unavailable">
                A validated source, supported range and applicable geography are
                needed. No local condition is inferred.
              </State>
              <Link className="text-link" to="/insights">
                Review source coverage
              </Link>
            </Card>
          ) : null}
        </>
      ) : null}
      {role.key === "crop_care" ? (
        <Card title="Growth-stage tracker and check-in">
          <State title="Your reported stage is the source of truth">
            Sakha does not predict stage dates or crop health from an
            illustration.
          </State>
          <div className="actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setUpdate(true)}
            >
              Record stage or condition
            </button>
            <button
              type="button"
              className="button secondary"
              disabled
              title="Photo collection and analysis require declared capability and consent"
            >
              <Paperclip size={17} />
              Photo analysis unavailable
            </button>
          </div>
          {tasks.data?.items
            .filter((t) => t.role_key === "crop_care")
            .map((t) => (
              <div className="list-row" key={t.id}>
                <h3>{t.title}</h3>
                <Link className="text-link" to="/plan">
                  Review reminder
                </Link>
              </div>
            ))}
        </Card>
      ) : null}
      {(tools[role.key] ?? []).map((tool) => (
        <ScenarioBuilder key={tool.kind} role={role} tool={tool} />
      ))}
      {role.key === "water" ||
      role.key === "farm_finance" ||
      role.key === "market" ? (
        <Card
          title={
            role.key === "water"
              ? "Irrigation history"
              : role.key === "farm_finance"
                ? "Reported expenses"
                : "Recorded sale context"
          }
        >
          {history.data?.items.filter((h) => h.kind === "actual_work")
            .length ? (
            history.data.items
              .filter((h) => h.kind === "actual_work")
              .map((h) => (
                <div className="list-row" key={h.id}>
                  <div>
                    <h3>{h.title}</h3>
                    <p>{h.summary}</p>
                  </div>
                </div>
              ))
          ) : (
            <State title="No matching completed work recorded">
              Scenario calculations and plan approval do not create actual work.
            </State>
          )}
          <div className="actions">
            <Link className="text-link" to="/activity">
              Review recorded work
            </Link>
          </div>
        </Card>
      ) : null}
      {role.key === "government_support" ? (
        <Card title="Official guidance and insurance">
          <p>
            Check jurisdiction, document date, required papers and official
            application instructions. Sakha does not submit an application or
            promise benefits.
          </p>
          <div className="actions">
            <Link className="button secondary" to="/help">
              Review official sources
            </Link>
            <Link className="text-link" to="/settings">
              Optional data consent
            </Link>
          </div>
        </Card>
      ) : null}
      <QuickUpdate open={update} onClose={() => setUpdate(false)} />
    </>
  );
}
function RoleHistory({ role }: { role: Role }) {
  const farmId = useFarmId();
  const conversations = useRead(
    "listConversations",
    { params: { farmId }, input: { role_key: role.key } },
    Boolean(farmId),
  );
  const findings = useRead(
    "listFindings",
    { params: { farmId }, input: { role_key: role.key } },
    Boolean(farmId),
  );
  const [selected, setSelected] = useState<Finding>();
  return (
    <>
      <Card title="Previous conversations">
        {conversations.data?.items.length ? (
          conversations.data.items.map((c) => (
            <div className="list-row" key={c.id}>
              <div>
                <h3>{c.title}</h3>
                <DateText value={c.updated_at} />
              </div>
              <Link
                className="button secondary"
                to={`/agents/${role.key}?tab=chat&conversation=${c.id}`}
              >
                Reopen
              </Link>
            </div>
          ))
        ) : (
          <State title="No conversations yet">
            Start a question from Chat.
          </State>
        )}
      </Card>
      <Card title="Findings and recommendations">
        {findings.data?.items.length ? (
          findings.data.items.map((f) => (
            <div className="list-row" key={f.id}>
              <div>
                <h3>{f.title}</h3>
                <p>{f.summary}</p>
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => setSelected(f)}
              >
                Details
              </button>
            </div>
          ))
        ) : (
          <State title="No saved findings">
            Completed evidence-grounded findings appear here.
          </State>
        )}
      </Card>
      {selected ? (
        <FindingDetails
          finding={selected}
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </>
  );
}
export function WorkspacePage() {
  const params = useParams();
  const parsed = RoleKey.safeParse(params.roleKey);
  const key = parsed.success ? parsed.data : "chief_of_staff";
  const farmId = useFarmId();
  const role = useRead(
    "getAgent",
    { params: { farmId, roleKey: key }, input: {} },
    Boolean(farmId),
  );
  const [search, setSearch] = useSearchParams();
  const tab = search.get("tab") ?? "about";
  const preferences = useRead(
    "getPreferences",
    { params: { farmId, roleKey: key }, input: {} },
    Boolean(farmId) && tab === "preferences",
  );
  if (!parsed.success || key === "chief_of_staff")
    return (
      <State title="Specialist not found">
        Open Ask Sakha for the Chief of Staff.
      </State>
    );
  if (role.isPending) return <Loading />;
  if (role.error)
    return (
      <State title="Workspace unavailable" retry={() => void role.refetch()}>
        {role.error.message}
      </State>
    );
  if (!role.data) return null;
  return (
    <div className="route-content">
      <div className="breadcrumbs">
        <Link to="/agents">Agents</Link> / {role.data.name}
      </div>
      <PageHeading title={role.data.name} description={role.data.description}>
        <RoleIcon role={key} />
      </PageHeading>
      <Banner text={role.data.label} />
      <nav className="tabs" aria-label="Workspace sections">
        {["about", "chat", "preferences", "history"].map((t) => (
          <button
            type="button"
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => {
              const next = new URLSearchParams(search);
              next.set("tab", t);
              setSearch(next);
            }}
          >
            {t[0]?.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      <div className="workspace-layout">
        <div>
          {tab === "about" ? (
            <>
              <Card>
                <RoleAbout role={role.data} />
                <div className="actions">
                  <button
                    type="button"
                    className="button"
                    onClick={() => setSearch({ tab: "chat" })}
                  >
                    Start a conversation
                  </button>
                </div>
              </Card>
              <RolePanels role={role.data} />
            </>
          ) : tab === "chat" ? (
            <>
              <ConversationView
                key={`${role.data.key}-${search.get("conversation") ?? "current"}`}
                role={role.data}
              />
              <section className="section-block">
                <details>
                  <summary className="button secondary">
                    Explore specialist tools and scenarios
                  </summary>
                  <div className="empty-space" />
                  <RolePanels role={role.data} />
                </details>
              </section>
            </>
          ) : tab === "preferences" ? (
            preferences.data ? (
              <PreferencesForm
                key={`${key}-${preferences.data.version}`}
                initial={preferences.data}
              />
            ) : (
              <Loading />
            )
          ) : (
            <RoleHistory role={role.data} />
          )}
        </div>
        <aside className="rail">
          <FarmContext />
          <Card title="Useful next steps">
            <div className="data-list">
              <Link to="/plan">Review your farm plan</Link>
              <Link to="/insights">Explore source evidence</Link>
              <Link to="/settings">Application preferences & privacy</Link>
            </div>
            <p className="chart-meta">
              Preferences stay separate from shared facts. Decisions stay
              separate from actual work.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
