import type { PlanRevision } from "@sakha/contracts";
import { Droplets, IndianRupee, Scissors } from "lucide-react";
import { Link } from "react-router";
import { FieldArt } from "../components/field-art";
import { MoneyFigures } from "../components/money-figures";
import { SourceBadge } from "../components/source-badge";
import { ErrorNotice, State } from "../components/ui";
import { t } from "../copy";
import { plainSentence } from "../farmer";
import { useLang } from "../language";
import { useCommand, useFarmId, useRead } from "../services/context";
import { teammateName } from "../team/adapter";

function stepIcon(title: string) {
  if (/sell|mandi|price|₹/i.test(title)) return <IndianRupee size={22} />;
  if (/water|borewell|irrigat|cotton/i.test(title))
    return <Droplets size={22} />;
  return <Scissors size={22} />;
}

function Steps({ revision }: { revision: PlanRevision }) {
  const { lang } = useLang();
  const steps = revision.tasks.filter((task) => task.status !== "cancelled");
  if (!steps.length) return <p>{t(lang, "whyFallback")}</p>;
  return (
    <ol className="plan-steps">
      {steps.map((task, index) => (
        <li className="plan-step" key={task.id}>
          <span className="step-index">{index + 1}</span>
          <span className="step-icon" aria-hidden="true">
            {stepIcon(task.title)}
          </span>
          <div>
            <strong>{plainSentence(task.title, t(lang, "whyFallback"))}</strong>
            <p>{plainSentence(task.description, t(lang, "whyFallback"))}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Suggestion({
  revision,
  activeId,
}: {
  revision: PlanRevision;
  activeId: string | null;
}) {
  const { lang } = useLang();
  const farmId = useFarmId();
  const save = useCommand("decidePlan", {
    farmId,
    revisionId: revision.id,
  });
  return (
    <section className="card">
      <h2>{t(lang, "newSuggestion")}</h2>
      <p>
        {plainSentence(
          revision.tasks[0]?.title,
          plainSentence(revision.title, t(lang, "askWhatToDo")),
        )}
      </p>
      <Steps revision={revision} />
      <p className="quiet">{t(lang, "saveNote")}</p>
      <button
        type="button"
        className="button"
        disabled={save.isPending}
        onClick={() =>
          void save.mutateAsync({
            expected_version: revision.version,
            decision: "approve",
            base_revision_id: activeId,
          })
        }
      >
        {save.isPending ? t(lang, "saving") : t(lang, "savePlan")}
      </button>
      <ErrorNotice error={save.error} />
      <SourceBadge source={t(lang, "yourPlan")} updated={revision.updated_at} />
    </section>
  );
}

export function PlanPage() {
  const { lang } = useLang();
  const farmId = useFarmId();
  const q = useRead(
    "getPlan",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  if (q.isPending) return <p className="loading-line">{t(lang, "loading")}</p>;
  if (q.error || !q.data)
    return (
      <div className="route-content">
        <State title={t(lang, "startFailed")} retry={() => void q.refetch()}>
          {t(lang, "startFailedBody")}
        </State>
      </div>
    );
  const plan = q.data;
  const saved = plan.active_revision;
  const proposals = plan.proposed_revisions;
  return (
    <div className="route-content">
      <header className="home-intro">
        <h1>{t(lang, "planTitle")}</h1>
        <p>{t(lang, "planLead")}</p>
      </header>
      {saved ? (
        <>
          <section className="card plan-hero">
            <p className="eyebrow">{t(lang, "weekPlan")}</p>
            <h2>{t(lang, "savedPlan")}</h2>
            <p>
              {plainSentence(
                saved.tasks[0]?.title,
                plainSentence(saved.title, t(lang, "savedPlan")),
              )}
            </p>
            <MoneyFigures cost={saved.cost_inr} benefit={saved.benefit_inr} />
            <div className="chips">
              <span className="chip checked">{t(lang, "checkedBySakha")}</span>
              {(["megha", "jal", "kheti", "paisa"] as const).map((id) => (
                <span className="chip" key={id}>
                  {teammateName(id, lang)}
                </span>
              ))}
            </div>
            <SourceBadge
              source={t(lang, "yourPlan")}
              updated={saved.updated_at}
            />
          </section>
          <Steps revision={saved} />
        </>
      ) : null}
      {proposals.map((revision) => (
        <Suggestion
          key={revision.id}
          revision={revision}
          activeId={saved?.id ?? null}
        />
      ))}
      {!saved && !proposals.length ? (
        <section className="card empty-card">
          <FieldArt mood="calm" />
          <h2>{t(lang, "noPlan")}</h2>
          <p>{t(lang, "noPlanBody")}</p>
          <Link className="button" to="/team">
            {t(lang, "askSakha")}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
