import type { Consent, Job, Settings } from "@sakha/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ChartCard, SourceDetails } from "../components/evidence";
import {
  Banner,
  Card,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  PageHeading,
  SourceCard,
  State,
} from "../components/ui";
import {
  useCommand,
  useFarmId,
  useRead,
  useService,
} from "../services/context";
import { downloadExport } from "../services/http";
import { supportsRequestedInterval } from "../services/series";
export function InsightsPage() {
  const farmId = useFarmId();
  const [search, setSearch] = useSearchParams();
  const series = search.get("series") ?? "W03";
  const range =
    search.get("range") ??
    (series === "C01" ? "5years" : series === "W04" ? "forecast" : "12months");
  const q = useRead(
    "getInsights",
    { params: { farmId }, input: { series, range } },
    Boolean(farmId),
  );
  const visibleSeries =
    q.data?.series.filter((s) => supportsRequestedInterval(s, range)) ?? [];
  return (
    <div className="route-content">
      <PageHeading
        title="Insights & Analytics"
        description="Explore rainfall, climate signals and the evidence behind them."
      />
      <Banner text="Understand the evidence. Keep its limits in view." />
      <div className="tabs" role="tablist" aria-label="Insight series">
        {[
          ["W03", "Historical rainfall"],
          ["C01", "El Niño history"],
          ["W04", "Rainfall outlook"],
        ].map(([id, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={series === id}
            key={id}
            onClick={() =>
              setSearch({
                series: id ?? "W03",
                range:
                  id === "C01"
                    ? "5years"
                    : id === "W04"
                      ? "forecast"
                      : "12months",
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      <Field label="Time range">
        <select
          value={range}
          onChange={(e) => setSearch({ series, range: e.target.value })}
        >
          {series === "C01" ? (
            <>
              <option value="5years">Recent five years</option>
              <option value="1year">Recent year</option>
            </>
          ) : series === "W04" ? (
            <option value="forecast">Actual supported forecast horizon</option>
          ) : (
            <>
              <option value="12months">Recent 12 published months</option>
              <option value="60months">
                Recent five years of monthly totals
              </option>
              <option value="30days">
                Daily 30-day view (where published)
              </option>
            </>
          )}
        </select>
      </Field>
      <ErrorNotice error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : visibleSeries.length ? (
        visibleSeries.map((s) => (
          <ChartCard key={s.id} series={s} range={range} />
        ))
      ) : (
        <Card>
          <State title="No usable series for this scope and range">
            Supported processing and location are required. Longer filters
            cannot manufacture data.
          </State>
          <div className="actions">
            <Link className="button secondary" to="/farm">
              Review farm location
            </Link>
            <button
              type="button"
              className="button secondary"
              onClick={() => void q.refetch()}
            >
              Try again
            </button>
          </div>
        </Card>
      )}
      {q.data?.missing_inputs.length ? (
        <State title="Information needed">
          {q.data.missing_inputs.join(", ")}
        </State>
      ) : null}
      <Card title="How to read these charts">
        <p>
          Gridded rainfall estimates are not a direct field measurement.
          Forecasts show only the source horizon. A climate index describes
          regional conditions and does not guarantee rainfall on this farm.
          Missing points remain gaps.
        </p>
      </Card>
      <Card title="Regional drought context">
        <State title="Coverage not established">
          Regional drought processing is shown only when a supported source and
          method are available. No crop stress or soil moisture is inferred from
          missing data.
        </State>
      </Card>
    </div>
  );
}
function GlobalSettingsForm({ initial }: { initial: Settings }) {
  const [draft, setDraft] = useState(initial);
  const mutation = useCommand("updateSettings");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(
      initial.reduced_motion,
    );
  }, [initial.reduced_motion]);
  return (
    <>
      <div className="grid-2">
        <Card title="Language and units">
          <Field label="Language">
            <select value="en" disabled>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label="Default area unit">
            <select
              value={draft.area_unit}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  area_unit: e.target.value as Settings["area_unit"],
                })
              }
            >
              <option value="ha">Hectares</option>
              <option value="acre">Acres</option>
            </select>
          </Field>
          <Field label="Default temperature unit">
            <select
              value={draft.temperature_unit}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  temperature_unit: e.target
                    .value as Settings["temperature_unit"],
                })
              }
            >
              <option value="celsius">Celsius</option>
              <option value="fahrenheit">Fahrenheit</option>
            </select>
          </Field>
          <p className="chart-meta">
            Display defaults can be overridden by supported role preferences.
            Stored units and measurements retain their meaning. INR is
            supported.
          </p>
        </Card>
        <Card title="Accessibility and notifications">
          <Field label="Default explanation detail">
            <select
              value={draft.explanation}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  explanation: e.target.value as Settings["explanation"],
                })
              }
            >
              <option value="simple">Simple</option>
              <option value="detailed">Detailed</option>
            </select>
          </Field>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.reduced_motion}
              onChange={(e) =>
                setDraft({ ...draft, reduced_motion: e.target.checked })
              }
            />
            Reduce motion
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.notifications}
              onChange={(e) =>
                setDraft({ ...draft, notifications: e.target.checked })
              }
            />
            General in-app notifications
          </label>
          <p className="chart-meta">
            System/browser push is not enabled. Local work pauses when the
            backend stops or laptop sleeps.
          </p>
        </Card>
      </div>
      <ErrorNotice error={mutation.error} />
      {saved ? (
        <p className="notice" role="status">
          Application preferences saved.
        </p>
      ) : null}
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={mutation.isPending}
          onClick={() =>
            void mutation
              .mutateAsync(draft)
              .then(() => setSaved(true))
              .catch(() => {})
          }
        >
          {mutation.isPending ? "Saving…" : "Save application preferences"}
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
      </div>
    </>
  );
}
function ConsentPanel() {
  const farmId = useFarmId();
  const q = useRead(
    "listConsents",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const grant = useCommand("grantConsent", { farmId });
  const { service } = useService();
  const client = useQueryClient();
  const [purpose, setPurpose] = useState("Conversation assistance");
  const [external, setExternal] = useState(false);
  const [financial, setFinancial] = useState(false);
  const [support, setSupport] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<unknown>();
  const revoke = async (consent: Consent) => {
    setError(undefined);
    try {
      await service.execute("revokeConsent", {
        params: { farmId, grantId: consent.id },
        input: { expected_version: consent.version },
        command: { idempotency_key: crypto.randomUUID() },
      });
      await client.invalidateQueries({ queryKey: ["sakha", farmId] });
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Card title="Purpose-scoped consent">
      <p>
        Local storage does not mean model processing happens on your device.
        Optional private information and external processing require explicit
        scope.
      </p>
      <p className="chart-meta">
        Standard scope covers farm location, equipment, cultivation, water and
        reported crop observations for A0 and all eight specialist roles.
        Finance and support details require the separate choices below.
      </p>
      <Field label="Purpose">
        <input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </Field>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={external}
          onChange={(e) => setExternal(e.target.checked)}
        />
        Allow my conversation text and authorized farm context to be sent to the
        configured model provider
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={financial}
          onChange={(e) => setFinancial(e.target.checked)}
        />
        Include optional financial context for Farm Finance
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={support}
          onChange={(e) => setSupport(e.target.checked)}
        />
        Include optional support details for Government Support
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I understand this scope and want to grant it.
      </label>
      <ErrorNotice error={grant.error ?? error ?? q.error} />
      <button
        type="button"
        className="button secondary"
        disabled={!confirmed || !purpose.trim() || grant.isPending}
        onClick={() =>
          void grant
            .mutateAsync({
              farm_id: farmId,
              purpose,
              fields: [
                "conversation",
                "F01",
                "F02",
                "F06",
                "F03",
                "F04",
                ...(financial ? ["F05"] : []),
                ...(support ? ["F08"] : []),
              ],
              roles: [
                "chief_of_staff",
                "climate",
                "weather",
                "crop_planning",
                "crop_care",
                "water",
                "market",
                "farm_finance",
                "government_support",
              ],
              external_processing: external,
              storage: "persistent",
            })
            .then(() => setConfirmed(false))
            .catch(() => {})
        }
      >
        Grant this scope
      </button>
      <section className="section-block">
        <h3>Existing grants</h3>
        {q.data?.items.length ? (
          q.data.items.map((c) => (
            <div className="list-row" key={c.id}>
              <div>
                <h3>{c.purpose}</h3>
                <p>
                  {c.fields.join(", ")} ·{" "}
                  {c.external_processing
                    ? "External processing allowed"
                    : "Local scope"}{" "}
                  · {c.status}
                </p>
                <small>
                  {c.roles.map((r) => r.replaceAll("_", " ")).join(", ")}
                </small>
              </div>
              {c.status === "active" ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void revoke(c)}
                >
                  Revoke
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <p className="muted">No consent grants recorded.</p>
        )}
      </section>
    </Card>
  );
}
function LifecyclePanel() {
  const farmId = useFarmId();
  const [action, setAction] = useState<"export" | "deletion">();
  const [scope, setScope] = useState<"farm" | "private_data" | "conversations">(
    "private_data",
  );
  const [includePrivate, setIncludePrivate] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [job, setJob] = useState<Job>();
  const exportCommand = useCommand("requestExport", { farmId });
  const deleteCommand = useCommand("requestDeletion", { farmId });
  const { service } = useService();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    let stopped = false;
    const timer = setInterval(() => {
      void service
        .execute(job.kind === "export" ? "getExport" : "getDeletion", {
          params: { farmId, jobId: job.id },
          input: {},
        })
        .then((result) => {
          if (stopped) return;
          setJob(result);
          if (result.status === "completed") {
            void client.invalidateQueries({ queryKey: ["sakha"] });
            if (result.kind === "deletion" && scope === "farm")
              navigate("/setup");
          }
        })
        .catch(setError);
    }, 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [job?.id, job?.status, farmId, service, client, navigate, scope]);
  const submit = async () => {
    setError(undefined);
    try {
      const next =
        action === "export"
          ? await exportCommand.mutateAsync({
              confirmed: true,
              include_private: includePrivate,
            })
          : await deleteCommand.mutateAsync({ confirmed: true, scope });
      setJob(next);
      setAction(undefined);
      setConfirmed(false);
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Card title="Local data lifecycle" className="danger-zone">
      <p>
        An export is a private local copy. Deletion reaches the selected records
        and derived memory, indexes and attachments according to the backend
        lifecycle. Model credentials are excluded.
      </p>
      <div className="actions">
        <button
          type="button"
          className="button secondary"
          onClick={() => setAction("export")}
        >
          Export my farm records
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => setAction("deletion")}
        >
          Review deletion options
        </button>
      </div>
      <ErrorNotice error={error} />
      {job ? (
        <div className="notice" role="status">
          <div>
            <h3>
              {job.kind}: {job.status}
            </h3>
            <p>{job.progress}</p>
            {job.failure ? <p>{job.failure}</p> : null}
            {job.download_url ? (
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  void downloadExport(service, job.download_url ?? "")
                    .then((blob) => {
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `sakha-export-${job.id}.json`;
                      link.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    })
                    .catch(setError)
                }
              >
                Download prepared export
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {action ? (
        <Modal
          open
          onClose={() => {
            setAction(undefined);
            setConfirmed(false);
          }}
          title={
            action === "export" ? "Review local export" : "Review data deletion"
          }
          description="Review this exact operation. Queued means accepted; success is shown only after the backend completes it."
        >
          {action === "export" ? (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={includePrivate}
                onChange={(e) => setIncludePrivate(e.target.checked)}
              />
              Include authorized private records in the local export
            </label>
          ) : (
            <Field label="Deletion scope">
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
              >
                <option value="private_data">
                  Optional private data and grants
                </option>
                <option value="conversations">
                  Farm conversations and derived context
                </option>
                <option value="farm">
                  Entire farm and dependent local records
                </option>
              </select>
            </Field>
          )}
          <State
            title={
              action === "export"
                ? "Keep the exported file private"
                : "Deletion changes local records"
            }
          >
            {action === "export"
              ? "The file contains farm records. It is not a public share or credentials backup."
              : scope === "farm"
                ? "This removes the profile and dependent records. Setup will be required again."
                : "Selected records and associated derived information will be removed. This is not merely clearing a downloadable cache."}
          </State>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I understand and confirm this exact scope.
          </label>
          <ErrorNotice error={exportCommand.error ?? deleteCommand.error} />
          <div className="actions">
            <button
              type="button"
              className={`button ${action === "deletion" ? "danger" : ""}`}
              disabled={
                !confirmed || exportCommand.isPending || deleteCommand.isPending
              }
              onClick={() => void submit()}
            >
              {action === "export" ? "Confirm export" : "Confirm deletion"}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setAction(undefined)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}
export function SettingsPage() {
  const q = useRead("getSettings", { input: {} });
  return (
    <div className="route-content">
      <PageHeading
        title="Application Settings"
        description="Global defaults, accessibility and control over your local information."
      />
      <Banner text="Your farm. Your preferences. Your choice." />
      {q.isPending ? (
        <Loading />
      ) : q.data ? (
        <GlobalSettingsForm key={q.data.version} initial={q.data} />
      ) : (
        <ErrorNotice error={q.error} />
      )}
      <section className="section-block">
        <ConsentPanel />
      </section>
      <LifecyclePanel />
      <Card title="Specialist preferences">
        <p>
          Each specialist has its own experience choices. These do not overwrite
          farm facts or grant private access.
        </p>
        <div className="actions">
          <Link className="button secondary" to="/agents">
            Choose a specialist
          </Link>
          <Link className="text-link" to="/farm">
            Correct farm facts
          </Link>
        </div>
      </Card>
    </div>
  );
}
const help = [
  [
    "How Sakha works",
    "Record what you know about your farm, inspect supported source evidence and ask A0 or a specialist. Review any proposed plan before choosing it. Report actual work only after it happened.",
  ],
  [
    "Understanding the agents",
    "A0 coordinates your shared plan. Eight specialists cover climate, weather, crop planning, crop care, water, markets, finance and government support. Permitted peers can collaborate without changing your page.",
  ],
  [
    "Forecast and evidence limitations",
    "Forecast horizons and geographic resolution matter. ENSO is not a certain prediction of rainfall on one farm. Gridded rainfall is not a direct field measurement. Declared sources may still be unavailable or unvalidated.",
  ],
  [
    "Privacy and local storage",
    "The app has no farmer login. Anyone who can access this local browser app or OS storage may access saved information. Collect optional private details only when needed. Local storage does not promise on-device model processing; review consent and provider disclosure.",
  ],
  [
    "Plans, approval and completed work",
    "A proposal is an option. Approval chooses an exact revision. Completed-work confirmation records what actually happened and known quantities. Alert acknowledgement does not record work or certify safety.",
  ],
  [
    "Offline and monitoring",
    "Farm records and help remain useful when a model or source is unavailable. Backend shutdown or laptop sleep pauses jobs and monitoring. Do not rely on this local app for uninterrupted warnings.",
  ],
  [
    "Help and feedback",
    "No external feedback destination is configured. Your information is not sent to a fabricated support inbox. Check local installation instructions or the project repository for contributor help.",
  ],
];
export function HelpPage() {
  const sources = useRead("listSources", { input: {} });
  const roles = useRead("listAgents", { input: {} });
  const [source, setSource] = useState<string>();
  return (
    <div className="route-content">
      <PageHeading
        title="Help & Data Sources"
        description="Understand Sakha, its evidence and the limits of local assistance."
      />
      <Banner text="Clear sources. Clear choices." />
      <div className="workspace-layout">
        <div>
          <Card title="Using Sakha">
            {help.map(([title, text]) => (
              <details className="help-details" key={title}>
                <summary>{title}</summary>
                <p>{text}</p>
              </details>
            ))}
          </Card>
          <Card title="All nine roles">
            {roles.data?.map((role) => (
              <div className="list-row" key={role.key}>
                <div>
                  <h3>{role.name}</h3>
                  <p>{role.description}</p>
                </div>
                <Link
                  className="text-link"
                  to={
                    role.key === "chief_of_staff"
                      ? "/ask"
                      : `/agents/${role.key}?tab=about`
                  }
                >
                  Explore role
                </Link>
              </div>
            ))}
          </Card>
        </div>
        <aside>
          <Card title="Source catalog">
            <p>
              A catalog entry describes the source. Its status shows whether a
              usable connector is available.
            </p>
            <ErrorNotice error={sources.error} />
            {sources.isPending ? (
              <Loading />
            ) : (
              sources.data?.map((s) => (
                <SourceCard
                  key={s.id}
                  source={s}
                  onOpen={() => setSource(s.id)}
                />
              ))
            )}
          </Card>
        </aside>
      </div>
      {source ? (
        <SourceDetails sourceId={source} onClose={() => setSource(undefined)} />
      ) : null}
    </div>
  );
}
