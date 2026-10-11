import type { PlanRevision } from "@sakha/contracts";
import { Link } from "react-router";
import { FieldArt } from "../components/field-art";
import { SourceBadge } from "../components/source-badge";
import { ErrorNotice, State } from "../components/ui";
import { t } from "../copy";
import { plainSentence } from "../farmer";
import { useLang } from "../language";
import { useCommand, useFarmId, useRead } from "../services/context";

function Steps({ revision }: { revision: PlanRevision }) {
  const { lang } = useLang();
  const steps = revision.tasks.filter((task) => task.status !== "cancelled");
  if (!steps.length) return <p>{t(lang, "whyFallback")}</p>;
  return (
    <ol className="steps">
      {steps.map((task) => (
        <li key={task.id}>
          <strong>{plainSentence(task.title, t(lang, "whyFallback"))}</strong>
          <p>{plainSentence(task.description, t(lang, "whyFallback"))}</p>
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
        <section className="card">
          <h2>{t(lang, "savedPlan")}</h2>
          <p>
            {plainSentence(
              saved.tasks[0]?.title,
              plainSentence(saved.title, t(lang, "savedPlan")),
            )}
          </p>
          <h3>{t(lang, "steps")}</h3>
          <Steps revision={saved} />
          <SourceBadge
            source={t(lang, "yourPlan")}
            updated={saved.updated_at}
          />
        </section>
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
