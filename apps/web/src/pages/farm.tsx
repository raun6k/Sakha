import type { Fact, Farm, OperationInput } from "@sakha/contracts";
import { nagpurPlace } from "@sakha/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Droplets, MapPin, Sprout } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FieldArt } from "../components/field-art";
import { HowTeamWorks } from "../components/how-team-works";
import { LanguageToggle } from "../components/language-toggle";
import {
  ErrorNotice,
  Field,
  Modal,
  quantityText,
  State,
} from "../components/ui";
import { t } from "../copy";
import { factText, latestFact, placeName } from "../farmer";
import { useLang } from "../language";
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
  const { lang } = useLang();
  const bootstrap = useRead("bootstrap", { input: {} });
  const path = window.location.pathname;
  if (bootstrap.isPending)
    return (
      <div className="splash">
        <FieldArt mood="calm" />
        <h1>Sakha</h1>
        <p>{t(lang, "loading")}</p>
      </div>
    );
  if (bootstrap.error)
    return (
      <div className="splash">
        <FieldArt mood="watch" />
        <h1>Sakha</h1>
        <State
          title={t(lang, "startFailed")}
          retry={() => void bootstrap.refetch()}
        >
          {errorMessage(bootstrap.error)}
        </State>
      </div>
    );
  const farm = bootstrap.data ? bootstrapFarm(bootstrap.data) : undefined;
  if (!farm?.setup_complete && path !== "/setup") return <Setup />;
  return children;
}
export function Setup() {
  const { service } = useService();
  const { lang } = useLang();
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
          { input: { name, location } },
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
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  const titles = [
    t(lang, "aboutYou"),
    t(lang, "landWater"),
    t(lang, "yourCropStep"),
  ];
  const bodies = [
    t(lang, "aboutYouBody"),
    t(lang, "landWaterBody"),
    t(lang, "yourCropBody"),
  ];
  return (
    <main className="setup-wrap">
      <div className="setup-card">
        <FieldArt mood="safe" />
        <div className="setup-body">
          <div className="setup-top">
            <h1>{t(lang, "setupTitle")}</h1>
            <LanguageToggle />
          </div>
          <p>{t(lang, "setupLead")}</p>
          <div
            role="status"
            className="progress-steps"
            aria-label={`${step + 1} / 3`}
          >
            {[0, 1, 2].map((i) => (
              <span key={i} className={i <= step ? "active" : ""} />
            ))}
          </div>
          <h2>{titles[step]}</h2>
          <p>{bodies[step]}</p>
          {step === 0 ? (
            <>
              <Field label={t(lang, "nameLabel")}>
                <input
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  autoComplete="name"
                />
              </Field>
              <p>{t(lang, "nagpur")}</p>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <div className="form-grid">
                <Field label={t(lang, "areaLabel")}>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={draft.area}
                    onChange={(e) => patch({ area: e.target.value })}
                  />
                </Field>
                <Field label={t(lang, "areaUnit")}>
                  <select
                    value={draft.areaUnit}
                    onChange={(e) =>
                      patch({
                        areaUnit: e.target.value === "acre" ? "acre" : "ha",
                      })
                    }
                  >
                    <option value="ha">{t(lang, "hectares")}</option>
                    <option value="acre">{t(lang, "acres")}</option>
                  </select>
                </Field>
              </div>
              <Field label={t(lang, "waterLabel")}>
                <select
                  value={draft.water}
                  onChange={(e) => patch({ water: e.target.value })}
                >
                  <option value="">{t(lang, "skipWater")}</option>
                  {[
                    ["Rain", "rain"],
                    ["Borewell or well", "well"],
                    ["Canal", "canal"],
                    ["Pond", "pond"],
                    ["Other", "other"],
                  ].map(([value, key]) => (
                    <option key={value} value={value}>
                      {t(lang, key as "rain")}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Field label={t(lang, "situationLabel")}>
                <select
                  value={draft.situation}
                  onChange={(e) => patch({ situation: e.target.value })}
                >
                  <option value="">{t(lang, "skipWater")}</option>
                  <option value="growing">{t(lang, "cropInField")}</option>
                  <option value="planning">{t(lang, "readyToSow")}</option>
                  <option value="between_seasons">
                    {t(lang, "betweenCrops")}
                  </option>
                </select>
              </Field>
              <Field
                label={
                  draft.situation === "growing"
                    ? t(lang, "cropLabelField")
                    : t(lang, "cropLabelPlan")
                }
                hint={t(lang, "cropHint")}
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
                  ].map((crop) => (
                    <option key={crop} value={crop} />
                  ))}
                </datalist>
              </Field>
            </>
          ) : null}
          <ErrorNotice error={error} />
          <div className="actions">
            {step > 0 ? (
              <button
                type="button"
                className="button secondary"
                onClick={() => setStep(step - 1)}
                disabled={busy}
              >
                {t(lang, "back")}
              </button>
            ) : null}
            {step < 2 ? (
              <button
                type="button"
                className="button"
                onClick={() => setStep(step + 1)}
              >
                {t(lang, "next")}
              </button>
            ) : (
              <button
                type="button"
                className="button"
                onClick={() => void finish()}
                disabled={busy}
              >
                {busy ? t(lang, "savingFarm") : t(lang, "seeFarm")}
              </button>
            )}
            {step < 2 ? (
              <button
                type="button"
                className="button ghost"
                onClick={() => setStep(step + 1)}
              >
                {t(lang, "skip")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

const stageOptions = [
  ["Just planted", "justPlanted"],
  ["Growing", "youngPlants"],
  ["Flowering", "flowering"],
  ["Grain or fruit formation", "grain"],
  ["Near harvest", "nearHarvest"],
  ["Not sure", "notSure"],
] as const;
const conditionOptions = [
  ["Healthy", "healthy"],
  ["Yellowing", "yellowing"],
  ["Wilting", "wilting"],
  ["Spots or insects", "spots"],
  ["Not sure", "notSure"],
] as const;
const waterOptions = [
  ["Little", "little"],
  ["Some", "some"],
  ["Plenty", "plenty"],
  ["Not sure", "notSure"],
] as const;

export function QuickUpdate({
  open,
  onClose,
  initialKey,
}: {
  open: boolean;
  onClose: () => void;
  initialKey?: string;
}) {
  const { lang } = useLang();
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
  const choices =
    key === "crop_stage"
      ? stageOptions
      : key === "crop_condition"
        ? conditionOptions
        : key === "water_availability"
          ? waterOptions
          : undefined;
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
          { params: { farmId }, input },
          identity,
        );
      await client.invalidateQueries({ queryKey: ["sakha", farmId] });
      setValue("");
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(lang, "changeDetail")}
      description={t(lang, "updateLead")}
    >
      <Field label={t(lang, "whatChanged")}>
        <select
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setValue("");
          }}
        >
          {(
            [
              ["crop_stage", "cropStage"],
              ["crop_condition", "cropCondition"],
              ["water_availability", "waterAmount"],
              ["water_source", "waterFrom"],
              ["current_crop", "currentCrop"],
              ["intended_crop", "intendedCrop"],
              ["observation", "fieldNote"],
              ["resources", "tools"],
            ] as const
          ).map(([option, label]) => (
            <option key={option} value={option}>
              {t(lang, label)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t(lang, "yourNote")} hint={t(lang, "noteHint")}>
        {choices ? (
          <select value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">{t(lang, "choose")}</option>
            {choices.map(([option, label]) => (
              <option key={option} value={option}>
                {t(lang, label)}
              </option>
            ))}
          </select>
        ) : (
          <textarea value={value} onChange={(e) => setValue(e.target.value)} />
        )}
      </Field>
      <Field label={t(lang, "whenTrue")}>
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
          {busy ? t(lang, "saving") : t(lang, "saveNoteBtn")}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={onClose}
          disabled={busy}
        >
          {t(lang, "cancel")}
        </button>
      </div>
    </Modal>
  );
}

function AssistantLine() {
  const { lang } = useLang();
  const farmId = useFarmId();
  const agent = useRead(
    "getAgent",
    { params: { farmId, roleKey: "sakha" }, input: {} },
    Boolean(farmId),
  );
  const grant = useCommand("grantConsent", { farmId });
  const chat = agent.data?.capabilities.find((cap) => cap.key === "chat");
  if (agent.isPending) return <p>{t(lang, "checkingAssistant")}</p>;
  if (chat?.status === "enabled" || chat?.status === "degraded")
    return <p>{t(lang, "assistantOn")}</p>;
  if (chat?.status === "disabled")
    return (
      <>
        <p>{t(lang, "assistantYes")}</p>
        <button
          type="button"
          className="button"
          disabled={grant.isPending}
          onClick={() =>
            void grant.mutateAsync({
              farm_id: farmId,
              purpose: "Answer questions about this farm",
              fields: ["conversation"],
              roles: ["sakha", "megha", "jal", "kheti", "paisa"],
              external_processing: true,
              storage: "persistent",
            })
          }
        >
          {grant.isPending ? t(lang, "saving") : t(lang, "turnOn")}
        </button>
        <ErrorNotice error={grant.error} />
      </>
    );
  return <p>{t(lang, "assistantSetup")}</p>;
}

function FactRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="fact-row">
      <span className="fact-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className="fact-label">{label}</p>
        <p className="fact-value">{value}</p>
      </div>
    </div>
  );
}

export function FarmPage() {
  const { lang } = useLang();
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
  const [update, setUpdate] = useState(false);
  const [how, setHow] = useState(false);
  if (farm.isPending || facts.isPending)
    return (
      <div className="splash">
        <FieldArt mood="calm" />
        <p>{t(lang, "loading")}</p>
      </div>
    );
  if (farm.error || facts.error)
    return (
      <div className="route-content">
        <ErrorNotice error={farm.error ?? facts.error} />
      </div>
    );
  const list = facts.data?.items ?? [];
  const show = (key: string) => factText(latestFact(list, key), lang);
  const intended = show("intended_crop");
  const companion = show("companion_crop");
  const nextCrop =
    intended === t(lang, "notAdded") && companion !== t(lang, "notAdded")
      ? companion
      : intended;
  const nextLabel =
    nextCrop === companion && companion !== t(lang, "notAdded")
      ? t(lang, "alsoGrowing")
      : t(lang, "nextCrop");
  return (
    <div className="route-content">
      <header className="home-intro">
        <h1>{t(lang, "farmTitle")}</h1>
        <p>{farm.data?.name}</p>
        <p>{t(lang, "farmLead")}</p>
      </header>
      <section className="card">
        <FactRow
          icon={<MapPin size={22} />}
          label={t(lang, "yourPlace")}
          value={placeName(farm.data?.location) ?? t(lang, "notAdded")}
        />
        <FactRow
          icon={<Sprout size={22} />}
          label={t(lang, "yourCrop")}
          value={show("current_crop")}
        />
        <FactRow
          icon={<Sprout size={22} />}
          label={t(lang, "stage")}
          value={
            show("crop_stage") === t(lang, "notAdded")
              ? show("situation")
              : show("crop_stage")
          }
        />
        <FactRow
          icon={<Sprout size={22} />}
          label={t(lang, "howCropLooks")}
          value={show("crop_condition")}
        />
        <FactRow
          icon={<MapPin size={22} />}
          label={t(lang, "land")}
          value={show("area")}
        />
        <FactRow
          icon={<Droplets size={22} />}
          label={t(lang, "waterSource")}
          value={`${show("water_source")} · ${show("water_availability")}`}
        />
        <FactRow
          icon={<Sprout size={22} />}
          label={nextLabel}
          value={nextCrop}
        />
        <button
          type="button"
          className="button secondary"
          onClick={() => setUpdate(true)}
        >
          {t(lang, "changeDetail")}
        </button>
      </section>
      <section className="card">
        <h2>{t(lang, "language")}</h2>
        <LanguageToggle />
      </section>
      <section className="card">
        <h2>{t(lang, "assistant")}</h2>
        <AssistantLine />
      </section>
      <section className="card">
        <h2>{t(lang, "howTeamWorks")}</h2>
        <button
          type="button"
          className="button secondary"
          onClick={() => setHow(true)}
        >
          {t(lang, "howTeamWorks")}
        </button>
      </section>
      <HowTeamWorks open={how} onClose={() => setHow(false)} />
      <QuickUpdate open={update} onClose={() => setUpdate(false)} />
    </div>
  );
}
