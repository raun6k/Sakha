import {
  type Fact,
  type Farm,
  nagpurPlace,
  type OperationInput,
} from "@sakha/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Leaf } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Card,
  DateText,
  ErrorNotice,
  Field,
  factValue,
  Loading,
  Modal,
  PageHeading,
  quantityText,
  State,
} from "../components/ui";
import {
  bootstrapFarm,
  executeCommand,
  useCommand,
  useFarmId,
  useRead,
  useService,
} from "../services/context";
import { errorMessage } from "../services/http";
import { type SetupDraft, useUi } from "../state/ui";
export function reportedFact(
  farmId: string,
  key: string,
  value: Fact["value"],
  category: Fact["category"],
  effectiveAt = new Date().toISOString(),
): OperationInput<"saveFact"> {
  return {
    farm_id: farmId,
    key,
    value,
    category,
    private: false,
    provenance: {
      origin: "farmer_report",
      attribution: "Farmer report",
      effective_at: effectiveAt,
      effective_time_precision: "exact",
      original_wording: typeof value === "string" ? value : quantityText(value),
      evidence: [],
    },
  };
}
export function setupFacts(draft: SetupDraft, farmId: string) {
  const facts: OperationInput<"saveFact">[] = [];
  if (draft.area.trim()) {
    const area = Number(draft.area);
    if (!Number.isFinite(area) || area <= 0)
      throw new Error(
        "Enter a positive farm area, or leave it blank if unknown.",
      );
    facts.push(
      reportedFact(
        farmId,
        "area",
        { kind: "known", value: area, unit: draft.areaUnit },
        "F01",
      ),
    );
  }
  for (const [key, value, category] of [
    ["water_source", draft.water, "F04"],
    ["situation", draft.situation, "F03"],
    [
      draft.situation === "growing" ? "current_crop" : "intended_crop",
      draft.crop,
      "F03",
    ],
  ] as const)
    if (value.trim()) facts.push(reportedFact(farmId, key, value, category));
  return facts;
}
export function Startup({ children }: { children: React.ReactNode }) {
  const bootstrap = useRead("bootstrap", { input: {} });
  const path = window.location.pathname;
  if (bootstrap.isPending)
    return (
      <div className="splash">
        <Leaf size={54} />
        <h1>Sakha</h1>
        <p>Opening your local farming Command Center…</p>
      </div>
    );
  if (bootstrap.error)
    return (
      <div className="splash">
        <Leaf size={54} />
        <h1>Sakha</h1>
        <State
          title="Sakha could not start"
          retry={() => void bootstrap.refetch()}
        >
          {errorMessage(bootstrap.error)}
        </State>
        <a className="button secondary" href="/?demo=1">
          Open a labeled demonstration
        </a>
      </div>
    );
  const farm = bootstrap.data ? bootstrapFarm(bootstrap.data) : undefined;
  if (!farm?.setup_complete && path !== "/setup") return <Setup />;
  return children;
}
export function Setup() {
  const { service, demo } = useService();
  const bootstrap = useRead("bootstrap", { input: {} });
  const draft = useUi((s) => s.setup);
  const step = useUi((s) => s.step);
  const patch = useUi((s) => s.patchSetup);
  const setStep = useUi((s) => s.setStep);
  const clear = useUi((s) => s.clearSetup);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const client = useQueryClient();
  const savedSetupFarm = useRef<Farm | undefined>(undefined);
  const setupCommand = useRef(crypto.randomUUID());
  const profileCommand = useRef(crypto.randomUUID());
  const finish = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      let farm =
        savedSetupFarm.current ??
        (bootstrap.data ? bootstrapFarm(bootstrap.data) : undefined);
      const location = nagpurPlace;
      const name = draft.name.trim() || "My farm";
      if (!farm)
        farm = await executeCommand(
          service,
          "createFarm",
          {
            input: { name, location },
          },
          profileCommand.current,
        );
      else if (!savedSetupFarm.current)
        farm = await executeCommand(
          service,
          "updateFarm",
          {
            params: { farmId: farm.id },
            input: { name, location, expected_version: farm.version },
          },
          profileCommand.current,
        );
      savedSetupFarm.current = farm;
      await executeCommand(
        service,
        "completeSetup",
        {
          params: { farmId: farm.id },
          input: {
            expected_version: farm.version,
            facts: setupFacts(draft, farm.id),
          },
        },
        setupCommand.current,
      );
      await client.invalidateQueries({ queryKey: ["sakha"] });
      clear();
      navigate("/");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="setup-wrap">
      <div className="brand" style={{ color: "var(--evergreen)", padding: 0 }}>
        <Leaf size={36} />
        <span>Sakha</span>
      </div>
      <PageHeading
        title="A little about your farm"
        description="Three short steps. Share what you know; missing details can wait."
      />
      {demo ? (
        <div className="notice">
          Demonstration setup · synthetic records only
        </div>
      ) : null}
      <div
        role="status"
        className="progress-steps"
        aria-label={`Step ${step + 1} of 3`}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className={i <= step ? "active" : ""} />
        ))}
      </div>
      <Card title={["About you", "Land and water", "Current farming"][step]}>
        <p className="muted">
          {
            [
              "These details help give your questions the right context.",
              "A water source does not tell us how much water is available.",
              "Choosing an intended crop does not record sowing.",
            ][step]
          }
        </p>
        <div className="empty-space" />
        {step === 0 ? (
          <>
            <Field label="Your name or farm name (optional)">
              <input
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                autoComplete="name"
              />
            </Field>
            <p>
              Sakha covers Nagpur district, Maharashtra. District forecast and
              rainfall use the public grid point 21.15° N, 79.1° E. That point
              is not a surveyed field, and another district does not have a
              checked forecast bulletin in this version.
            </p>
            <p className="muted">
              English is available. No account, password or OTP is needed.
            </p>
          </>
        ) : step === 1 ? (
          <>
            <div className="form-grid">
              <Field label="Farm area (optional)">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.area}
                  onChange={(e) => patch({ area: e.target.value })}
                />
              </Field>
              <Field label="Area unit">
                <select
                  value={draft.areaUnit}
                  onChange={(e) =>
                    patch({
                      areaUnit: e.target.value === "acre" ? "acre" : "ha",
                    })
                  }
                >
                  <option value="ha">Hectares</option>
                  <option value="acre">Acres</option>
                </select>
              </Field>
            </div>
            <Field label="Main water source (optional)">
              <select
                value={draft.water}
                onChange={(e) => patch({ water: e.target.value })}
              >
                <option value="">Not sure / skip</option>
                {["Rain", "Borewell or well", "Canal", "Pond", "Other"].map(
                  (v) => (
                    <option key={v}>{v}</option>
                  ),
                )}
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Farming situation (optional)">
              <select
                value={draft.situation}
                onChange={(e) => patch({ situation: e.target.value })}
              >
                <option value="">Not sure / skip</option>
                <option value="growing">Currently growing a crop</option>
                <option value="planning">Planning to sow</option>
                <option value="between_seasons">Between seasons</option>
              </select>
            </Field>
            <Field
              label={
                draft.situation === "growing"
                  ? "Current crop (optional)"
                  : "Intended crop (optional)"
              }
              hint="Undecided is fine. This is your report, not a recommendation."
            >
              <input
                value={draft.crop}
                onChange={(e) => patch({ crop: e.target.value })}
                list="crop-options"
              />
              <datalist id="crop-options">
                {[
                  "Soybean",
                  "Pigeonpea",
                  "Rice",
                  "Wheat",
                  "Onion",
                  "Millet",
                  "Cotton",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </datalist>
            </Field>
          </>
        )}
        <ErrorNotice error={error} />
        <div className="actions">
          {step > 0 ? (
            <button
              type="button"
              className="button secondary"
              onClick={() => setStep(step - 1)}
              disabled={busy}
            >
              Previous
            </button>
          ) : null}
          {step < 2 ? (
            <button
              type="button"
              className="button"
              onClick={() => setStep(step + 1)}
            >
              Next <ArrowRight size={17} />
            </button>
          ) : (
            <button
              type="button"
              className="button"
              onClick={() => void finish()}
              disabled={busy}
            >
              {busy ? "Saving farm…" : "Open my Command Center"}
            </button>
          )}
          {step < 2 ? (
            <button
              type="button"
              className="button ghost"
              onClick={() => setStep(step + 1)}
            >
              Skip this step
            </button>
          ) : null}
        </div>
      </Card>
    </main>
  );
}
const updateOptions = {
  crop_stage: [
    "Just planted",
    "Growing",
    "Flowering",
    "Grain or fruit formation",
    "Near harvest",
    "Not sure",
  ],
  crop_condition: [
    "Healthy",
    "Yellowing",
    "Wilting",
    "Spots or insects",
    "Not sure",
  ],
  water_availability: ["Little", "Some", "Plenty", "Not sure"],
};
export function QuickUpdate({
  open,
  onClose,
  initialKey,
}: {
  open: boolean;
  onClose: () => void;
  initialKey?: string;
}) {
  const farmId = useFarmId();
  const facts = useRead(
    "listFacts",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const { service } = useService();
  const client = useQueryClient();
  const [key, setKey] = useState(initialKey ?? "crop_stage");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const reportCommands = useRef(new Map<string, string>());
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (!value.trim())
        throw new Error("Enter what you observed, or choose Not sure.");
      const category: Fact["category"] =
        key === "resources"
          ? "F02"
          : key === "water_availability" || key === "water_source"
            ? "F04"
            : key === "crop_condition" || key === "observation"
              ? "F06"
              : "F03";
      const input = reportedFact(
        farmId,
        key,
        ["water_availability"].includes(key)
          ? { kind: "qualitative", text: value }
          : value,
        category,
        new Date(`${date}T12:00:00Z`).toISOString(),
      );
      input.provenance.effective_time_precision = "date";
      const prior = facts.data?.items.filter((f) => f.key === key).at(-1);
      const hash = JSON.stringify({
        input,
        priorId: prior?.id,
        priorVersion: prior?.version,
      });
      let identity = reportCommands.current.get(hash);
      if (!identity) {
        identity = crypto.randomUUID();
        reportCommands.current.set(hash, identity);
      }
      if (prior)
        await executeCommand(
          service,
          "correctFact",
          {
            params: { farmId, factId: prior.id },
            input: { ...input, expected_version: prior.version },
          },
          identity,
        );
      else
        await executeCommand(
          service,
          "saveFact",
          {
            params: { farmId },
            input,
          },
          identity,
        );
      await client.invalidateQueries({ queryKey: ["sakha", farmId] });
      setValue("");
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Update my farm"
      description="Save one attributed observation to shared farm context. This does not record completed work."
    >
      <Field label="What would you like to update?">
        <select
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setValue("");
          }}
        >
          {[
            ["crop_stage", "Crop stage"],
            ["crop_condition", "Crop condition"],
            ["water_availability", "Water availability"],
            ["water_source", "Water source"],
            ["current_crop", "Current crop"],
            ["intended_crop", "Intended crop"],
            ["observation", "Field observation"],
            ["resources", "Equipment and resource constraints"],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Your report"
        hint="Qualitative answers stay qualitative. Missing measurements remain unknown."
      >
        {key in updateOptions ? (
          <select value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">Choose what you know</option>
            {updateOptions[key as keyof typeof updateOptions].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        ) : (
          <textarea value={value} onChange={(e) => setValue(e.target.value)} />
        )}
      </Field>
      <Field label="When was this true?">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <ErrorNotice error={error} />
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save farm update"}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
export function LocationEdit({
  farm,
  onClose,
}: {
  farm: Farm;
  onClose: () => void;
}) {
  const mutation = useCommand("updateFarm", { farmId: farm.id });
  const [error, setError] = useState<unknown>();
  const save = async () => {
    setError(undefined);
    try {
      await mutation.mutateAsync({
        expected_version: farm.version,
        location: nagpurPlace,
      });
      onClose();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <>
      <p>
        Sakha covers Nagpur district, Maharashtra. The district forecast and
        rainfall charts are the captured official records for 21.15° N, 79.1° E.
        That is a public grid point, not a surveyed field.
      </p>
      <p className="muted">
        Another district does not load a forecast bulletin. Crop and water
        details stay the facts you record.
      </p>
      <ErrorNotice error={error} />
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={mutation.isPending}
          onClick={() => void save()}
        >
          Use Nagpur evidence
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </>
  );
}
export function FarmPage() {
  const farmId = useFarmId();
  const farm = useRead(
    "getFarm",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const facts = useRead(
    "listFacts",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const history = useRead(
    "listActivity",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const [update, setUpdate] = useState(false);
  const [location, setLocation] = useState(false);
  if (farm.isPending || facts.isPending) return <Loading />;
  if (farm.error || facts.error)
    return <ErrorNotice error={farm.error ?? facts.error} />;
  const list = facts.data?.items ?? [];
  return (
    <div className="route-content">
      <PageHeading
        title="My Farm"
        description="Your recorded facts, observations and resources."
      >
        <button
          type="button"
          className="button"
          onClick={() => setUpdate(true)}
        >
          Update my farm
        </button>
      </PageHeading>
      <Card
        title="Farm profile"
        action={
          <button
            type="button"
            className="text-link"
            onClick={() => setLocation(true)}
          >
            Nagpur coverage
          </button>
        }
      >
        <dl className="data-list">
          <div>
            <dt>Farm name</dt>
            <dd>{farm.data?.name}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>
              {[
                farm.data?.location?.village,
                farm.data?.location?.district,
                farm.data?.location?.state,
              ]
                .filter(Boolean)
                .join(", ") || "Not recorded"}
            </dd>
          </div>
          <div>
            <dt>Area</dt>
            <dd>{factValue(list, "area")}</dd>
          </div>
          <div>
            <dt>Situation</dt>
            <dd>{factValue(list, "situation")}</dd>
          </div>
          <div>
            <dt>Nagpur rainfall grid</dt>
            <dd>
              {farm.data?.location?.latitude !== undefined
                ? `${farm.data.location.latitude}, ${farm.data.location.longitude}`
                : "Not recorded"}
            </dd>
          </div>
        </dl>
      </Card>
      <div className="grid-2">
        <Card title="Current cultivation">
          <dl className="data-list">
            {[
              ["Current crop", "current_crop"],
              ["Intended crop", "intended_crop"],
              ["Reported stage", "crop_stage"],
              ["Reported condition", "crop_condition"],
            ].map(([label, key]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{factValue(list, key ?? "")}</dd>
              </div>
            ))}
          </dl>
          <p className="chart-meta">
            An intended crop is a plan, not a report that sowing happened.
          </p>
        </Card>
        <Card title="Water and resources">
          <dl className="data-list">
            {[
              ["Water source", "water_source"],
              ["Availability", "water_availability"],
              ["Equipment / constraints", "resources"],
            ].map(([label, key]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{factValue(list, key ?? "")}</dd>
              </div>
            ))}
          </dl>
          <p className="chart-meta">
            “Some” water is a farmer description, not a measured volume.
          </p>
        </Card>
      </div>
      <section className="section-block">
        <Card
          title="Recent reports"
          action={
            <Link className="text-link" to="/activity">
              Activity & decisions <ArrowRight size={16} />
            </Link>
          }
        >
          {list.length ? (
            list
              .slice(-5)
              .reverse()
              .map((f) => (
                <div className="list-row" key={f.id}>
                  <div>
                    <h3>{f.key.replaceAll("_", " ")}</h3>
                    <p>{quantityText(f.value)}</p>
                    <small>
                      {f.provenance.attribution} ·{" "}
                      <DateText
                        value={f.provenance.effective_at}
                        precision={f.provenance.effective_time_precision}
                      />
                    </small>
                  </div>
                  {f.corrects_id ? (
                    <span className="badge">Correction</span>
                  ) : null}
                </div>
              ))
          ) : (
            <State title="No farm reports yet">
              Record what you know; missing details are allowed.
            </State>
          )}
        </Card>
      </section>
      <Card title="Plan and completed work">
        <p>
          Proposals, farmer decisions and actual work reports have separate
          records.
        </p>
        <div className="actions">
          <Link className="button secondary" to="/plan">
            Review farm plan
          </Link>
          <Link className="button secondary" to="/activity">
            View recorded work
          </Link>
        </div>
        {history.data?.items.slice(0, 3).map((h) => (
          <div className="list-row" key={h.id}>
            <div>
              <h3>{h.title}</h3>
              <p>{h.kind.replaceAll("_", " ")}</p>
            </div>
          </div>
        ))}
      </Card>
      <QuickUpdate open={update} onClose={() => setUpdate(false)} />
      <Modal
        open={location}
        onClose={() => setLocation(false)}
        title="Review farm location"
      >
        {farm.data ? (
          <LocationEdit farm={farm.data} onClose={() => setLocation(false)} />
        ) : null}
      </Modal>
    </div>
  );
}
