import type { Alert, Finding, RoleKey } from "@sakha/contracts";
import { ArrowRight, Send } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { AlertDetails, ChartCard, EvidenceLinks } from "../components/evidence";
import {
  Card,
  ErrorNotice,
  factValue,
  Loading,
  RoleCard,
  RoleIcon,
  State,
} from "../components/ui";
import { useFarmId, useRead } from "../services/context";
import { QuickUpdate } from "./farm";
export function greeting(hour: number) {
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
}
export function HomePage() {
  const farmId = useFarmId();
  const q = useRead(
    "getHome",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const [question, setQuestion] = useState("");
  const [update, setUpdate] = useState(false);
  const [alert, setAlert] = useState<Alert>();
  const navigate = useNavigate();
  if (q.isPending) return <Loading />;
  if (q.error)
    return (
      <State title="Home is unavailable" retry={() => void q.refetch()}>
        {q.error.message}
      </State>
    );
  const home = q.data;
  if (!home) return <State title="Farm not available" />;
  const facts = home.sections.context;
  const overview: {
    role: RoleKey;
    title: string;
    value: string;
    description: string;
    evidence?: Finding["evidence"];
  }[] = [
    {
      role: "megha",
      evidence: home.sections.weather[0]?.evidence,
      title: "Weather",
      value: home.sections.weather[0]?.evidence.some(
        (e) => e.source_id === "W01",
      )
        ? `${home.farm.location?.district ?? "Local"} district forecast`
        : (home.sections.weather[0]?.title ?? "Information unavailable"),
      description:
        home.sections.weather[0]?.summary ??
        "A supported local forecast is needed.",
    },
    {
      role: "kheti",
      title: "Crop status",
      value: factValue(facts, "crop_stage"),
      description: factValue(facts, "current_crop"),
    },
    {
      role: "jal",
      title: "Water situation",
      value: factValue(facts, "water_availability"),
      description: factValue(facts, "water_source"),
    },
    {
      role: "megha",
      evidence: home.sections.climate[0]?.evidence,
      title: "El Niño outlook",
      value: home.sections.climate[0]?.title ?? "Information unavailable",
      description:
        home.sections.climate[0]?.summary ??
        "A climate signal is not certain rainfall on your farm.",
    },
  ];
  return (
    <div className="route-content">
      <header className="farm-banner home-hero">
        <div>
          <h1>{greeting(new Date().getHours())}</h1>
          <p>Review what needs a decision, then ask Sakha.</p>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => setUpdate(true)}
        >
          Update my farm
        </button>
      </header>
      <Card title="Ask Sakha">
        <p>
          Ask about weather, crop care, water or your next farming decision.
        </p>
        <form
          className="ask-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim())
              navigate("/ask", {
                state: {
                  question: question.trim(),
                  questionId: crypto.randomUUID(),
                },
              });
          }}
        >
          <input
            aria-label="Your farming question"
            placeholder="What should I consider before my next field activity?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button className="button" disabled={!question.trim()} type="submit">
            <Send size={18} />
            <span>Ask</span>
          </button>
        </form>
        <div className="suggestions">
          {[
            "What information is missing from my farm?",
            "Help me plan this season.",
          ].map((text) => (
            <button
              type="button"
              className="button secondary"
              key={text}
              onClick={() => setQuestion(text)}
            >
              {text}
            </button>
          ))}
        </div>
      </Card>
      <section className="section-block">
        <div className="section-head">
          <h2>Your farm at a glance</h2>
        </div>
        <div className="grid-4">
          {overview.map((o) => (
            <Card className="overview-card" key={o.role}>
              <div className="section-head">
                <RoleIcon role={o.role} />
                <h2>{o.title}</h2>
              </div>
              <p className="stat-value">{o.value}</p>
              <p className="overview-summary">{o.description}</p>
              {o.evidence?.length ? (
                <EvidenceLinks evidence={o.evidence} />
              ) : null}
              <Link className="text-link" to={`/agents/${o.role}?tab=chat`}>
                Ask about this <ArrowRight size={15} />
              </Link>
            </Card>
          ))}
        </div>
      </section>
      <section className="section-block">
        <div className="section-head">
          <h2>Needs your attention</h2>
          <Link className="text-link" to="/alerts">
            All alerts <ArrowRight size={15} />
          </Link>
        </div>
        <Card>
          {home.alerts
            .filter((a) => a.status === "active")
            .map((a) => (
              <div className="list-row" key={a.id}>
                <div>
                  <h3>{a.title}</h3>
                  <p>{a.summary}</p>
                </div>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setAlert(a)}
                >
                  Review alert
                </button>
              </div>
            ))}
          {!home.farm.location?.latitude ? (
            <div className="list-row">
              <div>
                <h3>Rainfall needs a reported location point</h3>
                <p>
                  A village name is not enough to select a rainfall grid. Add
                  optional coordinates if known.
                </p>
              </div>
              <Link className="button secondary" to="/farm">
                Review location
              </Link>
            </div>
          ) : null}
          {home.sections.actions
            .filter((t) =>
              ["pending", "proposed", "deferred"].includes(t.status),
            )
            .slice(0, 3)
            .map((t) => (
              <div className="list-row" key={t.id}>
                <div>
                  <h3>{t.title}</h3>
                  <p>
                    {t.status === "pending"
                      ? "Waiting"
                      : t.status === "deferred"
                        ? "Not yet"
                        : "Proposal"}{" "}
                    · {t.description}
                  </p>
                </div>
                <Link className="text-link" to="/plan">
                  Review task
                </Link>
              </div>
            ))}
          {!home.alerts.length && !home.sections.actions.length ? (
            <State title="No attention items recorded">
              Nothing saved here needs a decision. That does not mean the field
              is all clear.
            </State>
          ) : null}
        </Card>
      </section>
      <section className="section-block">
        <div className="section-head">
          <h2>Climate and weather analytics</h2>
          <Link className="text-link" to="/insights">
            Explore insights <ArrowRight size={15} />
          </Link>
        </div>
        <div className="grid-3">
          {["W03", "C01", "W04"].map((id) => {
            const series = home.insights.series.find((s) => s.source_id === id);
            return series ? (
              <ChartCard key={id} series={series} compact />
            ) : (
              <Card
                key={id}
                title={
                  id === "W03"
                    ? "Historical rainfall"
                    : id === "C01"
                      ? "El Niño history"
                      : "Upcoming rainfall"
                }
              >
                <State title="Data unavailable">
                  Supported source processing, location and range are required.
                </State>
                <Link className="text-link" to={`/insights?series=${id}`}>
                  Review coverage
                </Link>
              </Card>
            );
          })}
        </div>
        {home.insights.missing_inputs.length ? (
          <p className="chart-meta">
            Needed: {home.insights.missing_inputs.join(", ")}
          </p>
        ) : null}
      </section>
      <section className="section-block">
        <div className="section-head">
          <h2>Your farming specialists</h2>
          <Link className="text-link" to="/agents">
            View all agents <ArrowRight size={15} />
          </Link>
        </div>
        <div className="agents-compact-grid">
          {home.sections.agents.map((role) => (
            <RoleCard key={role.key} role={role} compact />
          ))}
        </div>
      </section>
      <Card
        title="Your farm plan"
        action={
          <Link className="text-link" to="/plan">
            View full plan <ArrowRight size={15} />
          </Link>
        }
      >
        {home.sections.plan.active_revision ? (
          <>
            <h3>{home.sections.plan.active_revision.title}</h3>
            <p>{home.sections.plan.active_revision.summary}</p>
            <p className="chart-meta">
              Approved revision. Work is recorded only after a separate farmer
              confirmation.
            </p>
          </>
        ) : (
          <State title="No approved plan yet">
            Ask Sakha about your goals or review any proposed revision.
          </State>
        )}
        {home.sections.plan.proposed_revisions.map((r) => (
          <div className="list-row" key={r.id}>
            <div>
              <h3>{r.title}</h3>
              <p>Proposed revision · awaiting farmer review</p>
            </div>
            <Link className="button secondary" to="/plan">
              Review proposal
            </Link>
          </div>
        ))}
      </Card>
      <QuickUpdate open={update} onClose={() => setUpdate(false)} />
      {alert ? (
        <AlertDetails alert={alert} onClose={() => setAlert(undefined)} />
      ) : null}
      <ErrorNotice error={q.error} />
    </div>
  );
}
