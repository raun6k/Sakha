import type { Home, RoleKey } from "@sakha/contracts";
import { sourceLabel, t } from "../copy";
import {
  climateAnomaly,
  factText,
  latestFact,
  pickRainSeries,
  plainSentence,
  rainTotal,
  shownLine,
} from "../farmer";
import type { Lang } from "../language";

export const teamIds = ["sakha", "megha", "jal", "kheti", "paisa"] as const;
export type TeamId = (typeof teamIds)[number];

/** Chat role for each teammate. These are the stored role ids. */
export const roleKeyFor: Record<TeamId, RoleKey> = {
  sakha: "sakha",
  megha: "megha",
  jal: "jal",
  kheti: "kheti",
  paisa: "paisa",
};

export interface RemoteTeammate {
  id: string;
  name: string;
  role: string;
  status: string;
  color: string;
}

export interface TeammateView {
  id: TeamId;
  name: string;
  role: string;
  status: string;
  color: string;
  accent?: string;
  roleKey: RoleKey;
}

export interface CardSource {
  title: string;
  url?: string;
  adapter?: string;
  fetched_at?: string;
}

export interface FarmerCard {
  agent: TeamId;
  headline: string;
  do: string[];
  why: string;
  cost_inr?: number;
  benefit_inr?: number;
  cost_inr_low?: number;
  cost_inr_high?: number;
  benefit_inr_low?: number;
  benefit_inr_high?: number;
  risk?: "low" | "medium" | "high";
  confidence?: "low" | "medium" | "high";
  sources: CardSource[];
  consulted: TeamId[];
  reviewed_by: "sakha";
}

const charter: Record<
  TeamId,
  {
    en: string;
    hi: string;
    mr: string;
    roleEn: string;
    roleHi: string;
    roleMr: string;
    color: string;
    accent?: string;
  }
> = {
  sakha: {
    en: "Sakha",
    hi: "साखा",
    mr: "साखा",
    roleEn:
      "Your farm team lead; listens, assigns, checks and gives one clear plan.",
    roleHi: "आपकी खेत टीम के मुखिया; सुनते हैं, काम बाँटते हैं, जाँचते हैं और एक योजना देते हैं।",
    roleMr: "तुमच्या शेत टीमचे प्रमुख. ऐकतात, काम वाटतात, तपासतात आणि एक योजना देतात.",
    color: "#1F6F43",
  },
  megha: {
    en: "Megha",
    hi: "मेघा",
    mr: "मेघा",
    roleEn: "Your weather and monsoon watcher",
    roleHi: "मौसम और मानसून देखती हैं",
    roleMr: "हवामान आणि पावसाळा पाहते",
    color: "#2B7BB9",
    accent: "#F2A93B",
  },
  jal: {
    en: "Jal",
    hi: "जल",
    mr: "जल",
    roleEn: "Your water manager",
    roleHi: "पानी संभालते हैं",
    roleMr: "पाणी सांभाळतात",
    color: "#5BA8D6",
  },
  kheti: {
    en: "Kheti",
    hi: "खेती",
    mr: "शेती",
    roleEn: "Your crop doctor and agronomist.",
    roleHi: "आपकी फसल डॉक्टर और कृषि सलाहकार।",
    roleMr: "तुमच्या पिकाचे डॉक्टर.",
    color: "#8B5E3C",
    accent: "#1F6F43",
  },
  paisa: {
    en: "Paisa",
    hi: "पैसा",
    mr: "पैसा",
    roleEn: "Your money and market advisor",
    roleHi: "पैसा और मंडी की सलाह",
    roleMr: "पैसा आणि मंडईचा सल्ला",
    color: "#F2A93B",
  },
};

function say(lang: Lang, en: string, hi: string, mr: string) {
  if (lang === "hi") return hi;
  if (lang === "mr") return mr;
  return en;
}

export function teammateName(id: TeamId, lang: Lang) {
  return say(lang, charter[id].en, charter[id].hi, charter[id].mr);
}

export function isTeamId(value: string): value is TeamId {
  return (teamIds as readonly string[]).includes(value);
}

function mmText(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return undefined;
  if (value < 1) return value.toFixed(1).replace(/\.0$/, "");
  return String(Math.round(value));
}

function ensoLabel(anomaly: number | undefined, lang: Lang) {
  if (anomaly === undefined)
    return say(lang, "not in yet", "पता नहीं", "अजून नाही");
  if (anomaly >= 0.5) return say(lang, "El Niño", "अल नीनो", "एल निनो");
  if (anomaly <= -0.5) return say(lang, "La Niña", "ला नीना", "ला निना");
  return say(lang, "neutral", "सामान्य", "सामान्य");
}

function cropName(home: Home, lang: Lang) {
  const current = factText(
    latestFact(home.sections.context, "current_crop"),
    lang,
  );
  if (current !== t(lang, "notAdded")) return current;
  const next = factText(
    latestFact(home.sections.context, "intended_crop"),
    lang,
  );
  if (next !== t(lang, "notAdded")) return next;
  return say(lang, "crop", "फसल", "पीक");
}

function cropWord(name: string, lang: Lang) {
  if (lang === "en") return name;
  return name
    .replace(/soybean/gi, "सोयाबीन")
    .replace(/cotton/gi, lang === "hi" ? "कपास" : "कापूस");
}

export function buildTeam(home: Home | undefined, lang: Lang): TeammateView[] {
  const rain = home ? pickRainSeries(home.insights.series) : undefined;
  const rainMm = rainTotal(rain);
  const climate = home?.sections.climate.at(-1);
  const anomaly =
    climateAnomaly(climate?.title) ?? climateAnomaly(climate?.summary);
  const dry =
    (rainMm !== undefined && rainMm < 10) ||
    /no rain|dry|deficit/i.test(
      `${home?.sections.weather.at(-1)?.title ?? ""} ${home?.sections.weather.at(-1)?.summary ?? ""}`,
    );
  const alert = dry
    ? say(lang, "dry week", "सूखा हफ्ता", "कोरडा आठवडा")
    : say(lang, "no alerts", "कोई चेतावनी नहीं", "इशारा नाही");
  const enso = ensoLabel(home ? anomaly : undefined, lang);
  const tasks =
    home?.sections.plan.active_revision?.tasks ??
    home?.sections.plan.proposed_revisions[0]?.tasks ??
    [];
  const open = tasks.filter((task) => task.status !== "cancelled");
  const top = shownLine(
    plainSentence(
      open[0]?.title,
      say(lang, "ask the team", "टीम से पूछें", "टीमला विचारा"),
    ),
    lang,
  );
  const crop = cropWord(
    home ? cropName(home, lang) : say(lang, "crop", "फसल", "पीक"),
    lang,
  );
  const stageRaw = home
    ? factText(latestFact(home.sections.context, "crop_stage"), lang)
    : t(lang, "notAdded");
  const stage =
    stageRaw === t(lang, "notAdded")
      ? home
        ? factText(latestFact(home.sections.context, "situation"), lang)
        : t(lang, "notAdded")
      : stageRaw;
  const stageText =
    stage === t(lang, "notAdded")
      ? say(lang, "stage not noted", "अवस्था पता नहीं", "अवस्था माहीत नाही")
      : /pods drying/i.test(stage)
        ? say(lang, stage, "फलियाँ सूख रही हैं", "शेंगा सुकत आहेत")
        : stage;
  const nextWater =
    rainMm !== undefined && rainMm >= 10
      ? say(lang, "not needed", "अभी ज़रूरत नहीं", "आता गरज नाही")
      : say(lang, "soon", "जल्द पूछें", "लवकर विचारा");

  const rainLabel = mmText(rainMm);
  const ensoText =
    anomaly === undefined
      ? say(
          lang,
          "monsoon reading is on the way",
          "मानसून का आंकड़ा आ रहा है",
          "पावसाळ्याचा आकडा येतोय",
        )
      : `${enso} ${anomaly > 0 ? "+" : ""}${anomaly} °C`;
  const status: Record<TeamId, string> = {
    sakha: say(
      lang,
      `${open.length} actions this week · top: ${top}`,
      `${open.length} काम इस हफ्ते · पहला: ${top}`,
      `${open.length} कामे या आठवड्यात · पहिले: ${top}`,
    ),
    megha: say(
      lang,
      `🌧 ${rainLabel ?? "upcoming"} mm next 7 days · ${ensoText} · ${alert}`,
      `🌧 अगले 7 दिन ${rainLabel ?? "का आंकड़ा"} मिमी · ${ensoText} · ${alert}`,
      `🌧 पुढचे 7 दिवस ${rainLabel ?? "अजून"} मिमी · ${ensoText} · ${alert}`,
    ),
    jal: say(
      lang,
      `💧 Wait · next water: ${nextWater}`,
      `💧 इंतज़ार · अगला पानी: ${nextWater}`,
      `💧 थांबा · पुढचे पाणी: ${nextWater}`,
    ),
    kheti: say(
      lang,
      `🌱 ${crop} · ${stageText} · watch: field check`,
      `🌱 ${crop} · ${stageText} · ध्यान: खेत की जाँच`,
      `🌱 ${crop} · ${stageText} · लक्ष: शेत तपासा`,
    ),
    paisa: say(
      lang,
      `₹ ${crop} mandi price and MSP are on the team strip`,
      `₹ ${crop} का मंडी भाव और एमएसपी टीम की पट्टी पर`,
      `₹ ${crop}चा मंडईभाव आणि एमएसपी टीमच्या पट्ट्यावर`,
    ),
  };

  return teamIds.map((id) => ({
    id,
    name: teammateName(id, lang),
    role: say(lang, charter[id].roleEn, charter[id].roleHi, charter[id].roleMr),
    status: status[id],
    color: charter[id].color,
    accent: charter[id].accent,
    roleKey: roleKeyFor[id],
  }));
}

/** Prefer the team endpoint: full role lines and seeded status, no doubled El Niño label. */
export function applyRemoteTeam(
  local: TeammateView[],
  remote?: {
    id: string;
    name: string;
    role_line: string;
    status_line: string;
    color: string;
  }[],
  lang: Lang = "en",
): TeammateView[] {
  if (!remote?.length) return local;
  return local.map((mate) => {
    const next = remote.find((item) => item.id === mate.id);
    if (!next) return mate;
    if (lang !== "en") return { ...mate, color: next.color || mate.color };
    return {
      ...mate,
      name: next.name || mate.name,
      role: next.role_line || mate.role,
      status: next.status_line || mate.status,
      color: next.color || mate.color,
    };
  });
}

/** Overlay a future `{ id, name, role, status, color }` team list without dropping local fallbacks. */
export function withRemoteTeam(
  local: TeammateView[],
  remote?: RemoteTeammate[],
): TeammateView[] {
  if (!remote?.length) return local;
  return local.map((mate) => {
    const next = remote.find((item) => item.id === mate.id);
    if (!next) return mate;
    return {
      ...mate,
      name: next.name || mate.name,
      role: next.role || mate.role,
      status: next.status || mate.status,
      color: next.color || mate.color,
    };
  });
}

const sourceTeam: Record<string, TeamId> = {};
for (const id of [
  "W01",
  "W02",
  "W03",
  "W04",
  "C01",
  "C02",
  "C03",
  "C04",
  "C05",
  "C06",
  "C07",
  "A07",
])
  sourceTeam[id] = "megha";
for (const id of ["A01", "A02", "A03", "A04", "A05", "A06"])
  sourceTeam[id] = "kheti";
for (const id of ["M01", "M02", "G01", "G02", "G03"]) sourceTeam[id] = "paisa";

export function consultedFromSources(sourceIds: string[]): TeamId[] {
  const found = new Set<TeamId>();
  for (const id of sourceIds) {
    const mate = sourceTeam[id];
    if (mate) found.add(mate);
  }
  return teamIds.filter((id) => id !== "sakha" && found.has(id));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return value as Record<string, unknown>;
}

function asTeamId(value: unknown): TeamId | undefined {
  return typeof value === "string" && isTeamId(value) ? value : undefined;
}

function asLevel(value: unknown): "low" | "medium" | "high" | undefined {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : undefined;
}

function asSources(value: unknown): CardSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (!row || typeof row.title !== "string") return [];
    return [
      {
        title: row.title,
        url: typeof row.url === "string" ? row.url : undefined,
        adapter: typeof row.adapter === "string" ? row.adapter : undefined,
        fetched_at:
          typeof row.fetched_at === "string" ? row.fetched_at : undefined,
      },
    ];
  });
}

/** Reads a Card payload when the answer is JSON, including future reviewed_by/consulted/citations aliases. */
export function parseCard(text: string): Partial<FarmerCard> | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const raw = asRecord(JSON.parse(trimmed));
    if (!raw || typeof raw.headline !== "string") return undefined;
    const agent = asTeamId(raw.agent) ?? "sakha";
    const consulted = Array.isArray(raw.consulted)
      ? raw.consulted.flatMap((item) => {
          const id = asTeamId(item);
          return id ? [id] : [];
        })
      : [];
    return {
      agent,
      headline: raw.headline,
      do: Array.isArray(raw.do)
        ? raw.do
            .filter((item): item is string => typeof item === "string")
            .slice(0, 3)
        : [],
      why: typeof raw.why === "string" ? raw.why : "",
      cost_inr: typeof raw.cost_inr === "number" ? raw.cost_inr : undefined,
      benefit_inr:
        typeof raw.benefit_inr === "number" ? raw.benefit_inr : undefined,
      cost_inr_low:
        typeof raw.cost_inr_low === "number" ? raw.cost_inr_low : undefined,
      cost_inr_high:
        typeof raw.cost_inr_high === "number" ? raw.cost_inr_high : undefined,
      benefit_inr_low:
        typeof raw.benefit_inr_low === "number"
          ? raw.benefit_inr_low
          : undefined,
      benefit_inr_high:
        typeof raw.benefit_inr_high === "number"
          ? raw.benefit_inr_high
          : undefined,
      risk: asLevel(raw.risk),
      confidence: asLevel(raw.confidence),
      sources: asSources(raw.sources).concat(asSources(raw.citations)),
      consulted,
      reviewed_by: "sakha",
    };
  } catch {
    return undefined;
  }
}

function sentences(text: string) {
  return text
    .replace(/[#*_>`]/g, "")
    .split(/\n+|(?<=[.?!])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function cardFromAnswer(input: {
  text: string;
  agent: TeamId;
  evidence?: { source_id: string }[];
  createdAt?: string;
  consulted?: string[];
  citations?: CardSource[];
  stored?: Partial<FarmerCard>;
  lang: Lang;
  catalogName?: (sourceId: string) => string | undefined;
}): FarmerCard {
  const parsed = input.stored?.headline ? input.stored : parseCard(input.text);
  const sourceIds = input.evidence?.map((item) => item.source_id) ?? [];
  const consulted = [
    ...new Set([
      ...(parsed?.consulted ?? []),
      ...(input.consulted ?? []).flatMap((item) =>
        isTeamId(item) ? [item] : [],
      ),
      ...consultedFromSources(sourceIds),
      ...(input.agent === "sakha" ? [] : [input.agent]),
    ]),
  ].filter((id) => id !== "sakha");
  const evidenceSources: CardSource[] = sourceIds.map((id) => ({
    title: sourceLabel(id, input.lang, input.catalogName?.(id)),
    adapter: id,
    fetched_at: input.createdAt,
  }));
  const sources = [
    ...(input.citations ?? []),
    ...(parsed?.sources ?? []),
    ...evidenceSources,
  ].filter(
    (item, index, all) =>
      all.findIndex((other) => other.title === item.title) === index,
  );
  if (parsed?.headline) {
    return {
      agent: parsed.agent ?? input.agent,
      headline: parsed.headline,
      do: parsed.do?.length ? parsed.do : [parsed.headline],
      why: parsed.why || parsed.headline,
      cost_inr: parsed.cost_inr,
      benefit_inr: parsed.benefit_inr,
      cost_inr_low: parsed.cost_inr_low,
      cost_inr_high: parsed.cost_inr_high,
      benefit_inr_low: parsed.benefit_inr_low,
      benefit_inr_high: parsed.benefit_inr_high,
      risk: parsed.risk,
      confidence: parsed.confidence,
      sources: sources.length
        ? sources
        : [{ title: t(input.lang, "notCited"), fetched_at: input.createdAt }],
      consulted,
      reviewed_by: "sakha",
    };
  }
  const parts = sentences(input.text);
  const headline = plainSentence(
    (parts[0] ?? "").split(" ").slice(0, 12).join(" "),
    t(input.lang, "askWhatToDo"),
  );
  const bullets = input.text
    .split("\n")
    .filter((line) => /^\s*([-*]|\d+[.)])\s+/.test(line))
    .map((line) => line.replace(/^\s*([-*]|\d+[.)])\s+/, "").trim())
    .map((line) => plainSentence(line, ""))
    .filter(Boolean)
    .slice(0, 3);
  const doItems = bullets.length ? bullets : [headline];
  const why = plainSentence(
    parts.slice(1, 3).join(" "),
    t(input.lang, "whyFallback"),
  );
  return {
    agent: input.agent,
    headline,
    do: doItems.slice(0, 3),
    why,
    sources: sources.length
      ? sources
      : [{ title: t(input.lang, "notCited"), fetched_at: input.createdAt }],
    consulted,
    reviewed_by: "sakha",
  };
}

export function cardFromHome(home: Home, lang: Lang): FarmerCard {
  const revision =
    home.sections.plan.active_revision ??
    home.sections.plan.proposed_revisions[0];
  const tasks = (revision?.tasks ?? [])
    .filter((task) => task.status !== "cancelled")
    .slice(0, 3);
  const action = shownLine(
    plainSentence(
      tasks[0]?.title,
      plainSentence(revision?.title, t(lang, "askWhatToDo")),
    ),
    lang,
  );
  const why = shownLine(
    plainSentence(
      tasks[0]?.description,
      plainSentence(revision?.summary, t(lang, "whyEmpty")),
    ),
    lang,
  );
  const consulted = teamIds.filter((id) => {
    if (id === "sakha") return false;
    if (id === "megha")
      return Boolean(
        home.sections.weather.length ||
          home.sections.climate.length ||
          pickRainSeries(home.insights.series),
      );
    if (id === "kheti")
      return (
        factText(latestFact(home.sections.context, "current_crop"), lang) !==
          t(lang, "notAdded") ||
        factText(latestFact(home.sections.context, "intended_crop"), lang) !==
          t(lang, "notAdded")
      );
    if (id === "jal")
      return (
        factText(latestFact(home.sections.context, "water_source"), lang) !==
        t(lang, "notAdded")
      );
    return false;
  });
  const rain = pickRainSeries(home.insights.series);
  const weather = home.sections.weather.at(-1);
  const sources: CardSource[] = [];
  if (weather?.evidence[0])
    sources.push({
      title: sourceLabel(weather.evidence[0].source_id, lang),
      adapter: weather.evidence[0].source_id,
      fetched_at: weather.freshness.retrieved_at,
    });
  if (rain)
    sources.push({
      title: sourceLabel(rain.source_id, lang),
      adapter: rain.source_id,
      fetched_at: rain.freshness.retrieved_at,
    });
  if (revision)
    sources.push({
      title: t(lang, "yourPlan"),
      fetched_at: revision.updated_at,
    });
  const rainMm = rainTotal(rain);
  const riskKind =
    rainMm !== undefined && rainMm < 10
      ? "high"
      : rainMm !== undefined && rainMm >= 15
        ? "low"
        : "medium";
  return {
    agent: "sakha",
    headline: action,
    do: tasks.length
      ? tasks.map((task) => shownLine(plainSentence(task.title, action), lang))
      : [action],
    why,
    cost_inr: revision?.cost_inr,
    benefit_inr: revision?.benefit_inr,
    risk: home.sections.weather.length || rain ? riskKind : undefined,
    confidence:
      weather?.freshness.status === "fresh"
        ? "medium"
        : home.sections.weather.length || rain
          ? "low"
          : undefined,
    sources: sources.length ? sources : [{ title: t(lang, "notCited") }],
    consulted,
    reviewed_by: "sakha",
  };
}

export function rupeeText(
  value: number | undefined,
  low: number | undefined,
  high: number | undefined,
  lang: Lang,
) {
  const format = (amount: number) =>
    new Intl.NumberFormat(
      lang === "hi" ? "hi-IN" : lang === "mr" ? "mr-IN" : "en-IN",
      {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      },
    ).format(amount);
  if (low !== undefined && high !== undefined)
    return `${format(low)}–${format(high)}`;
  if (value !== undefined) return format(value);
  return t(lang, "notKnown");
}
