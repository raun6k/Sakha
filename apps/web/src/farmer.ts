import type { Fact, Home, Plan, Series } from "@sakha/contracts";
import { sourceLabel, t } from "./copy";
import type { Lang } from "./language";

export function localeOf(lang: Lang) {
  if (lang === "hi") return "hi-IN";
  if (lang === "mr") return "mr-IN";
  return "en-IN";
}

/** Show the seeded plan lines in the farmer's language. Numbers stay as stored. */
export function shownLine(text: string, lang: Lang) {
  if (lang === "en") return text;
  const hi = lang === "hi";
  let match = text.match(/^Cut ([\d.]+) ha soybean$/);
  if (match)
    return hi
      ? `${match[1]} हेक्टेयर सोयाबीन काटें`
      : `${match[1]} हेक्टर सोयाबीन कापा`;
  match = text.match(/^Sell at (.+)$/);
  if (match) return hi ? `${match[1]} पर बेचें` : `${match[1]} येथे विका`;
  if (text === "Keep the borewell for cotton")
    return hi ? "कपास के लिए बोरवेल रखें" : "कापसासाठी बोअर ठेवा";
  match = text.match(
    /^Cut between (.+) while the forecast shows ([\d.]+) mm of rain\.$/,
  );
  if (match)
    return hi
      ? `${match[1]} के बीच काटें। पूर्वानुमान में ${match[2]} मिमी बारिश है।`
      : `${match[1]} दरम्यान कापा. अंदाजात ${match[2]} मिमी पाऊस आहे.`;
  match = text.match(
    /^Aim for ₹([\d,]+) per quintal, not the ₹([\d,]+) minimum\. The quote is cached (.+)\.$/,
  );
  if (match)
    return hi
      ? `₹${match[1]} प्रति क्विंटल माँगें, ₹${match[2]} न्यूनतम नहीं। भाव ${match[3]} का सहेजा हुआ है।`
      : `₹${match[1]} प्रति क्विंटल विचारा, ₹${match[2]} किमान नाही. भाव ${match[3]} रोजी साठवलेला आहे.`;
  match = text.match(
    /^Give the soybean 0 mm\. About ([\d,]+) m3 stays unpumped for the ([\d.]+) ha cotton\.$/,
  );
  if (match)
    return hi
      ? `सोयाबीन को 0 मिमी दें। लगभग ${match[1]} घन मीटर ${match[2]} हेक्टेयर कपास के लिए बचा है।`
      : `सोयाबीनला 0 मिमी द्या. सुमारे ${match[1]} घनमीटर ${match[2]} हेक्टर कापसासाठी राखून ठेवा.`;
  return text;
}

const jargon =
  /synthetic|demonstration|illustrative|agronomic|fixture|\bruntime\b|orchestrat|\bagents?\b|grid|RONI|ENSO|CHIRPS|Niño|Nino|demo farmer|command center|farm context/i;

export function plainSentence(text: string | undefined, fallback: string) {
  const trimmed = text
    ?.replace(/attributed weather guidance/gi, "the weather report")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed || jargon.test(trimmed)) return fallback;
  return trimmed;
}

export function placeName(location?: {
  village?: string;
  district?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
}) {
  if (!location) return undefined;
  const district = location.district?.trim();
  const village = location.village?.trim();
  const hideVillage =
    !village ||
    /demonstration|grid|point|coordinate|°/i.test(village) ||
    (district
      ? village.toLowerCase() === `${district.toLowerCase()} district`
      : false);
  const parts = [hideVillage ? undefined : village, district, location.state]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.join(", ") || undefined;
}

export function situationLabel(value: string, lang: Lang) {
  if (value === "growing") return t(lang, "cropInField");
  if (value === "planning") return t(lang, "readyToSow");
  if (value === "between_seasons") return t(lang, "betweenCrops");
  if (value === "Growing") return t(lang, "youngPlants");
  if (value === "Just planted") return t(lang, "justPlanted");
  if (value === "Flowering") return t(lang, "flowering");
  if (value === "Grain or fruit formation") return t(lang, "grain");
  if (value === "Near harvest") return t(lang, "nearHarvest");
  if (value === "Healthy") return t(lang, "healthy");
  if (value === "Yellowing") return t(lang, "yellowing");
  if (value === "Wilting") return t(lang, "wilting");
  if (value === "Spots or insects") return t(lang, "spots");
  if (value === "Little") return t(lang, "little");
  if (value === "Some" || value === "some") return t(lang, "some");
  if (value === "Plenty") return t(lang, "plenty");
  if (value === "Not sure") return t(lang, "notSure");
  return undefined;
}

function scrub(text: string) {
  return text
    .replace(/,?\s*reported by demo farmer\.?/gi, "")
    .replace(
      /\b(synthetic|demonstration|illustrative|agronomic|fixture|runtime|orchestrat\w*|agents?|RONI|ENSO|CHIRPS|Niño|Nino|command center|grid point|consent console)\b/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

function unitLabel(unit: string, lang: Lang) {
  if (unit === "ha") return t(lang, "hectares").toLowerCase();
  if (unit === "acre") return t(lang, "acres").toLowerCase();
  if (unit === "m3") return t(lang, "cubicMetres");
  if (unit === "mm" || unit === "mm/day" || unit === "mm/month")
    return t(lang, "mm");
  return unit;
}

export function factText(value: Fact["value"] | undefined, lang: Lang): string {
  if (value === undefined) return t(lang, "notAdded");
  if (typeof value === "string") {
    const labeled = situationLabel(value, lang);
    if (labeled) return labeled;
    const cleaned = scrub(value);
    return cleaned || t(lang, "notAdded");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if ("minor_units" in value)
    return new Intl.NumberFormat(localeOf(lang), {
      style: "currency",
      currency: value.currency,
      maximumFractionDigits: 0,
    }).format(value.minor_units / 100);
  switch (value.kind) {
    case "known":
      return `${value.value} ${unitLabel(value.unit, lang)}`;
    case "range":
      return `${value.min}–${value.max} ${unitLabel(value.unit, lang)}`;
    case "qualitative": {
      const labeled = situationLabel(value.text, lang);
      if (labeled) return labeled;
      const cleaned = scrub(value.text);
      return cleaned || t(lang, "notAdded");
    }
    case "unknown":
    case "not_applicable":
      return t(lang, "notAdded");
  }
}

export function latestFact(facts: Fact[], key: string) {
  return facts.filter((fact) => fact.key === key).at(-1)?.value;
}

function isRainForecast(item: Series) {
  return (
    item.kind === "forecast" &&
    /rain/i.test(`${item.variable} ${item.unit}`) &&
    item.points.some((point) => typeof point.value === "number")
  );
}

/** Prefer the adapter's next-seven-day forecast, then the older outlook. */
export function pickRainSeries(series: Series[]) {
  const preferred =
    series.find((item) => item.source_id === "W05" && isRainForecast(item)) ??
    series.find((item) => item.source_id === "W04" && isRainForecast(item));
  if (!preferred) return undefined;
  if (preferred.source_id === "W05" && preferred.points.length > 7)
    return { ...preferred, points: preferred.points.slice(0, 7) };
  return preferred;
}

export function rainTotal(series?: Series) {
  if (!series) return undefined;
  const values = series.points.flatMap((point) =>
    typeof point.value === "number" ? [point.value] : [],
  );
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0);
}

/** Small forecasts stay on a 0–1 mm scale so the ticks are not all "0". */
export function niceMax(peak: number) {
  if (!Number.isFinite(peak) || peak <= 1) return 1;
  if (peak <= 5) return Math.ceil(peak);
  if (peak <= 20) return Math.ceil(peak / 2) * 2;
  return Math.ceil(peak / 5) * 5;
}

export function formatMm(value: number) {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

export function axisTicks(peak: number) {
  const max = niceMax(peak);
  return [0, max / 2, max];
}

export function climateAnomaly(text?: string) {
  if (!text) return undefined;
  const match = text.match(/([+-]?\d+(?:\.\d+)?)/);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

export type RiskKind = "act" | "watchDry" | "watchEnso" | "safe" | "unknown";

export function buildRisk(home: Home) {
  const weather = home.sections.weather.at(-1);
  const climate = home.sections.climate.at(-1);
  const rain = pickRainSeries(home.insights.series);
  const weatherText = `${weather?.title ?? ""} ${weather?.summary ?? ""}`;
  const anomaly =
    climateAnomaly(climate?.title) ?? climateAnomaly(climate?.summary);
  const mm = rainTotal(rain);
  const hasSignal = Boolean(weather || climate || (rain && mm !== undefined));
  const dry = /no rain|dry|deficit|drought|little rain/i.test(weatherText);
  const elNino = anomaly !== undefined && anomaly >= 0.5;
  const lowRain = mm !== undefined && mm < 15;
  let level: "safe" | "watch" | "act" = "watch";
  let kind: RiskKind = "unknown";
  if (hasSignal) {
    if (elNino && (dry || lowRain)) {
      level = "act";
      kind = "act";
    } else if (dry || lowRain) {
      level = "watch";
      kind = "watchDry";
    } else if (elNino) {
      level = "watch";
      kind = "watchEnso";
    } else {
      level = "safe";
      kind = "safe";
    }
  }
  return {
    level,
    kind,
    sourceId:
      weather?.evidence[0]?.source_id ??
      climate?.evidence[0]?.source_id ??
      rain?.source_id,
    updated:
      weather?.freshness.retrieved_at ??
      climate?.freshness.retrieved_at ??
      rain?.freshness.retrieved_at,
  };
}

/** Name the readings that actually set the risk, in the order the farmer sees them. */
export function riskSourceLine(home: Home, lang: Lang) {
  const rain = pickRainSeries(home.insights.series);
  const climate = home.sections.climate.at(-1);
  const parts: string[] = [];
  if (rain?.source_id === "W05") parts.push(t(lang, "openMeteo"));
  else if (rain) parts.push(sourceLabel(rain.source_id, lang));
  const climateText = `${climate?.title ?? ""} ${climate?.summary ?? ""}`;
  if (climate && /ni[nñ]o|oni|noaa/i.test(climateText))
    parts.push(t(lang, "noaaEnso"));
  else if (climate?.evidence[0])
    parts.push(sourceLabel(climate.evidence[0].source_id, lang));
  const risk = buildRisk(home);
  return {
    source: parts.length
      ? parts.join(" · ")
      : risk.sourceId
        ? sourceLabel(risk.sourceId, lang)
        : t(lang, "yourPlan"),
    updated:
      rain?.freshness.retrieved_at ??
      climate?.freshness.retrieved_at ??
      risk.updated,
  };
}

export function riskSentence(kind: RiskKind, lang: Lang) {
  if (kind === "act") return t(lang, "riskAct");
  if (kind === "watchDry") return t(lang, "riskWatchDry");
  if (kind === "watchEnso") return t(lang, "riskWatchEnso");
  if (kind === "safe") return t(lang, "riskSafe");
  return t(lang, "riskUnknown");
}

export function recommendation(plan: Plan, lang: Lang) {
  const revision = plan.active_revision ?? plan.proposed_revisions[0];
  if (!revision)
    return {
      action: t(lang, "askWhatToDo"),
      why: t(lang, "whyEmpty"),
      source: t(lang, "notSaved"),
      updated: undefined as string | undefined,
      saved: false,
    };
  const task =
    revision.tasks.find((item) => item.status !== "cancelled") ??
    revision.tasks[0];
  const sourceId = revision.evidence[0]?.source_id;
  return {
    action: plainSentence(
      task?.title,
      plainSentence(revision.title, t(lang, "askWhatToDo")),
    ),
    why: plainSentence(
      task?.description,
      plainSentence(revision.summary, t(lang, "whyFallback")),
    ),
    source: sourceId ? sourceLabel(sourceId, lang) : t(lang, "yourPlan"),
    updated: revision.updated_at,
    saved: Boolean(
      plan.active_revision && revision.id === plan.active_revision.id,
    ),
  };
}

export function rainCaption(total: number | undefined, lang: Lang) {
  if (total === undefined) return t(lang, "rainUnit");
  if (total < 1) return t(lang, "rainLow");
  return t(lang, "rainAbout").replace("{n}", String(Math.round(total)));
}

export function formatUpdated(iso: string | undefined, lang: Lang) {
  if (!iso) return t(lang, "timeUnknown");
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return t(lang, "timeUnknown");
  return date.toLocaleString(localeOf(lang), {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function greeting(hour: number, lang: Lang) {
  if (hour < 12) return t(lang, "goodMorning");
  if (hour < 17) return t(lang, "goodAfternoon");
  return t(lang, "goodEvening");
}

export function dayLabel(iso: string, lang: Lang) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(localeOf(lang), {
    day: "numeric",
    timeZone: "Asia/Kolkata",
  });
}
