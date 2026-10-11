import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DomainError } from "@sakha/farm";
import { z } from "zod";
import { assertSourceUrl, boundedFetch, parseRoni } from "./index.js";

/** Every live adapter returns this envelope. `source.live` is false when the body came from the committed cache. */
export type AdapterResult<T> = {
  data: T;
  source: { id: string; name: string; url: string; live: boolean };
  fetched_at: string;
};

export type FarmPoint = { latitude: number; longitude: number };

export const DEMO_FARMER = {
  name: "Kavita Meshram",
  village: "Kalmeshwar",
  district: "Nagpur",
  state: "Maharashtra",
  country: "India",
  latitude: 21.15,
  longitude: 79.1,
  soybean_ha: 1.6,
  cotton_ha: 0.8,
  yield_q_per_ha: 12,
  labour_inr_per_ha: 3500,
} as const;

const seasons = [
  "DJF",
  "JFM",
  "FMA",
  "MAM",
  "AMJ",
  "MJJ",
  "JJA",
  "JAS",
  "ASO",
  "SON",
  "OND",
  "NDJ",
] as const;

export function isIndianFarmLocation(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 6 &&
    latitude <= 37.5 &&
    longitude >= 68 &&
    longitude <= 97.5
  );
}

export function assertIndianFarmLocation(point: FarmPoint) {
  if (!isIndianFarmLocation(point.latitude, point.longitude))
    throw new DomainError(
      "validation",
      "Weather adapters cover farm locations inside India",
    );
  return point;
}

export function cacheDirectory() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const direct = join(dir, "cache", "manifest.json");
    const nested = join(dir, "packages", "data", "cache", "manifest.json");
    if (existsSync(direct)) return dirname(direct);
    if (existsSync(nested)) return dirname(nested);
    dir = dirname(dir);
  }
  throw new DomainError("unavailable", "Committed data cache was not found");
}

type Manifest = {
  captured_at: string;
  location: { latitude: number; longitude: number };
  files: Record<string, { file: string; fetched_at: string; url: string }>;
};

function manifest(): Manifest {
  return JSON.parse(
    readFileSync(join(cacheDirectory(), "manifest.json"), "utf8"),
  ) as Manifest;
}

function cacheFile(key: string) {
  const entry = manifest().files[key];
  if (!entry) throw new DomainError("unavailable", `Cache entry ${key} missing`);
  return {
    ...entry,
    text: readFileSync(join(cacheDirectory(), entry.file), "utf8"),
  };
}

function nearDemo(point: FarmPoint) {
  const place = manifest().location;
  return (
    Math.abs(point.latitude - place.latitude) <= 0.02 &&
    Math.abs(point.longitude - place.longitude) <= 0.02
  );
}

const Daily = z.object({
  time: z.array(z.string()),
  precipitation_sum: z.array(z.number().nullable()),
  temperature_2m_max: z.array(z.number().nullable()).optional(),
  temperature_2m_min: z.array(z.number().nullable()).optional(),
  et0_fao_evapotranspiration: z.array(z.number().nullable()).optional(),
  precipitation_probability_max: z.array(z.number().nullable()).optional(),
});

export type OpenMeteoDaily = {
  latitude: number;
  longitude: number;
  days: {
    date: string;
    rain_mm: number | null;
    et0_mm: number | null;
    temp_max_c: number | null;
    temp_min_c: number | null;
    rain_probability_pct: number | null;
  }[];
};

export function parseOpenMeteoDaily(payload: unknown): OpenMeteoDaily {
  const parsed = z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      daily: Daily,
    })
    .parse(payload);
  const daily = parsed.daily;
  if (!daily.time.length)
    throw new DomainError("validation", "Open-Meteo daily rows missing");
  return {
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    days: daily.time.map((date, index) => ({
      date,
      rain_mm: daily.precipitation_sum[index] ?? null,
      et0_mm: daily.et0_fao_evapotranspiration?.[index] ?? null,
      temp_max_c: daily.temperature_2m_max?.[index] ?? null,
      temp_min_c: daily.temperature_2m_min?.[index] ?? null,
      rain_probability_pct: daily.precipitation_probability_max?.[index] ?? null,
    })),
  };
}

export type OniPoint = {
  time: string;
  season: string;
  year: number;
  anomaly_c: number;
};

export function parseOni(text: string): OniPoint[] {
  const points: OniPoint[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.trim().split(/\s+/);
    if (cells.length !== 4) continue;
    const season = cells[0] ?? "";
    const index = seasons.indexOf(season as (typeof seasons)[number]);
    const year = Number(cells[1]);
    const anomaly = Number(cells[3]);
    if (index === -1 || !Number.isInteger(year)) continue;
    if (!Number.isFinite(anomaly))
      throw new DomainError("validation", "ONI anomaly is not a number");
    points.push({
      time: `${year}-${String(index + 1).padStart(2, "0")}-15T00:00:00Z`,
      season,
      year,
      anomaly_c: anomaly,
    });
  }
  if (!points.length) throw new DomainError("validation", "ONI rows missing");
  return points;
}

export function ensoPhase(anomalyC: number) {
  if (anomalyC >= 0.5) return "El Niño" as const;
  if (anomalyC <= -0.5) return "La Niña" as const;
  return "Neutral" as const;
}

export type PowerDaily = {
  days: { date: string; rain_mm: number | null; temp_max_c: number | null }[];
};

export function parsePowerDaily(payload: unknown): PowerDaily {
  const parsed = z
    .object({
      properties: z.object({
        parameter: z.object({
          PRECTOTCORR: z.record(z.string(), z.number()),
          T2M_MAX: z.record(z.string(), z.number()).optional(),
        }),
      }),
      header: z.object({ fill_value: z.number().optional() }).optional(),
    })
    .parse(payload);
  const fill = parsed.header?.fill_value ?? -999;
  const rain = parsed.properties.parameter.PRECTOTCORR;
  const temp = parsed.properties.parameter.T2M_MAX ?? {};
  const days = Object.keys(rain)
    .sort()
    .map((key) => {
      const value = rain[key] ?? fill;
      const hot = temp[key];
      return {
        date: `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`,
        rain_mm: value === fill || value < 0 ? null : value,
        temp_max_c: hot === undefined || hot === fill ? null : hot,
      };
    });
  if (!days.length) throw new DomainError("validation", "NASA POWER days missing");
  return { days };
}

const MandiRecord = z.object({
  state: z.string(),
  district: z.string(),
  market: z.string(),
  commodity: z.string(),
  variety: z.string().optional(),
  arrival_date: z.string(),
  min_price: z.union([z.string(), z.number()]),
  max_price: z.union([z.string(), z.number()]),
  modal_price: z.union([z.string(), z.number()]),
});

export type MandiQuote = {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  date: string;
  min_inr: number;
  modal_inr: number;
  max_inr: number;
};

function rupee(value: string | number) {
  const amount = typeof value === "number" ? value : Number(value.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0)
    throw new DomainError("validation", "Mandi price is not a rupee amount");
  return amount;
}

function quoteDate(value: string) {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (local) return `${local[3]}-${local[2]}-${local[1]}`;
  throw new DomainError("validation", "Mandi arrival date is not recognised");
}

export function parseAgmarknet(payload: unknown): MandiQuote[] {
  const parsed = z
    .object({
      records: z.array(MandiRecord).optional(),
      data: z.array(MandiRecord).optional(),
    })
    .parse(payload);
  const rows = parsed.records ?? parsed.data ?? [];
  const quotes = rows.map((row) => {
    const min = rupee(row.min_price);
    const modal = rupee(row.modal_price);
    const max = rupee(row.max_price);
    if (min > modal || modal > max)
      throw new DomainError(
        "validation",
        "Mandi quote is not in minimum ≤ modal ≤ maximum order",
      );
    return {
      state: row.state,
      district: row.district,
      market: row.market,
      commodity: row.commodity,
      variety: row.variety ?? row.commodity,
      date: quoteDate(row.arrival_date),
      min_inr: min,
      modal_inr: modal,
      max_inr: max,
    };
  });
  if (!quotes.length) throw new DomainError("validation", "Mandi records missing");
  return quotes;
}

export function selectMandiQuote(quotes: MandiQuote[], market = "Nagpur APMC") {
  const named = quotes.filter((quote) => quote.market === market);
  const pool = named.length ? named : quotes;
  return [...pool].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

export type MspReading = {
  commodity: string;
  msp_inr_per_quintal: number;
  issued_on: string;
  url: string;
  note: string;
};

export function parseMsp(payload: unknown): MspReading {
  return z
    .object({
      commodity: z.string(),
      msp_inr_per_quintal: z.number().positive(),
      issued_on: z.string(),
      url: z.string(),
      note: z.string(),
    })
    .parse(payload);
}

export type Recommendation = {
  title: string;
  action: string;
  why: string;
  cost_inr: number;
  benefit_inr: number;
  premium_over_msp_inr: number;
  borewell_held_m3: number;
  quintals: number;
  assumptions: string[];
  sources: string[];
};

export function buildHarvestRecommendation(input: {
  soybean_ha: number;
  yield_q_per_ha: number;
  labour_inr_per_ha: number;
  forecast_rain_mm_7d: number;
  forecast_et0_mm_7d: number;
  market: string;
  price_date: string;
  min_inr: number;
  modal_inr: number;
  max_inr: number;
  msp_inr: number;
  enso_phase: string;
  oni_season: string;
  oni_anom_c: number;
  market_live: boolean;
}): Recommendation {
  const quintals = Math.round(input.soybean_ha * input.yield_q_per_ha * 10) / 10;
  const cost = Math.round(input.labour_inr_per_ha * input.soybean_ha);
  const benefit = Math.round((input.modal_inr - input.min_inr) * quintals);
  const premium = Math.round((input.modal_inr - input.msp_inr) * quintals);
  const held = Math.round(
    (Math.max(0, input.forecast_et0_mm_7d - input.forecast_rain_mm_7d) / 1000) *
      input.soybean_ha *
      10000,
  );
  const rain = round1(input.forecast_rain_mm_7d);
  const et0 = round1(input.forecast_et0_mm_7d);
  const priceNote = input.market_live
    ? `Agmarknet modal on ${input.price_date}`
    : `latest retrieved Agmarknet quote, ${input.market} on ${input.price_date}`;
  return {
    title: "Cut soybean this dry week and sell at the modal",
    action: `Harvest the ${input.soybean_ha} ha soybean while the next 7 days show ${rain} mm of rain, and sell at ${input.market} aiming for the modal price of ₹${input.modal_inr} per quintal rather than the minimum ₹${input.min_inr}.`,
    why: `${input.enso_phase} is the Pacific status (${input.oni_season} ONI ${input.oni_anom_c > 0 ? "+" : ""}${input.oni_anom_c} °C). Evaporation over those 7 days is ${et0} mm, so leave the borewell for the cotton (about ${held} m3 not pumped onto drying soybean). ${priceNote} is still above the ₹${input.msp_inr} soybean MSP.`,
    cost_inr: cost,
    benefit_inr: benefit,
    premium_over_msp_inr: premium,
    borewell_held_m3: held,
    quintals,
    assumptions: [
      `${input.yield_q_per_ha} quintal/ha is the farmer's expected soybean yield, not a weighed harvest`,
      `${quintals} quintal = ${input.soybean_ha} ha × ${input.yield_q_per_ha}`,
      `Harvest labour ₹${input.labour_inr_per_ha}/ha is the farmer's own figure`,
      "Benefit is the modal-minus-minimum gap on that quantity, not a promised sale",
      "Transport, bagging and moisture deductions are not in the price file",
      input.market_live
        ? "Mandi prices came from the live data.gov.in resource"
        : "Mandi prices are the cached Agmarknet reading because the live resource did not answer",
    ],
    sources: [
      "Open-Meteo",
      "NOAA ONI",
      "Agmarknet",
      "PIB MSP",
      "NASA POWER",
    ],
  };
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function sum(values: (number | null)[]) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function localTime(date: string) {
  return `${date}T00:00:00+05:30`;
}

export type PreparedSeries = {
  source_id: string;
  variable: string;
  unit: string;
  kind: "observed" | "forecast";
  geography: string;
  method_version: string;
  points: {
    time: string;
    value: number | null;
    lower?: number;
    upper?: number;
    label?: string;
  }[];
  title: string;
  text: string;
  url: string;
  fetched_at: string;
  live: boolean;
};

export type DemoCache = {
  point: FarmPoint;
  forecast: AdapterResult<OpenMeteoDaily>;
  rainfall: AdapterResult<OpenMeteoDaily>;
  oni: AdapterResult<{ latest: OniPoint; phase: string; points: OniPoint[] }>;
  roni: AdapterResult<{
    latest: { time: string; value: number; label?: string };
    points: { time: string; value: number | null; label?: string }[];
  }>;
  power: AdapterResult<PowerDaily> | null;
  market: AdapterResult<{ quotes: MandiQuote[]; selected: MandiQuote; note: string }>;
  msp: AdapterResult<MspReading>;
  recommendation: Recommendation;
  series: PreparedSeries[];
  brief: DemoBrief;
};

export type DemoBrief = {
  farmer_name: string;
  village: string;
  district: string;
  state: string;
  soybean_ha: number;
  cotton_ha: number;
  total_ha: number;
  yield_q_per_ha: number;
  forecast_rain_7d_mm: number;
  forecast_et0_7d_mm: number;
  forecast_temp_max_c: number | null;
  forecast_from: string;
  forecast_to: string;
  season_rain_mm: number;
  season_from: string;
  season_to: string;
  oni_season: string;
  oni_year: number;
  oni_anom_c: number;
  enso_phase: string;
  roni_label: string;
  roni_c: number;
  power_rain_mm: number | null;
  power_from: string | null;
  power_to: string | null;
  market: string;
  price_date: string;
  min_inr: number;
  modal_inr: number;
  max_inr: number;
  market_live: boolean;
  market_note: string;
  msp_inr: number;
  msp_url: string;
  recommendation: Recommendation;
};

function forecastUrl(point: FarmPoint) {
  const query = new URLSearchParams({
    latitude: String(point.latitude),
    longitude: String(point.longitude),
    daily:
      "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration",
    timezone: "Asia/Kolkata",
    forecast_days: "16",
  });
  return `https://api.open-meteo.com/v1/forecast?${query}`;
}

function archiveUrl(point: FarmPoint, today: Date) {
  const end = new Date(today.getTime() - 6 * 86400000);
  const start = new Date(Date.UTC(end.getUTCFullYear(), 5, 1));
  const day = (value: Date) => value.toISOString().slice(0, 10);
  const query = new URLSearchParams({
    latitude: String(point.latitude),
    longitude: String(point.longitude),
    start_date: day(start),
    end_date: day(end),
    daily: "precipitation_sum,temperature_2m_max",
    timezone: "Asia/Kolkata",
  });
  return `https://archive-api.open-meteo.com/v1/archive?${query}`;
}

function powerUrl(point: FarmPoint) {
  return `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX&community=AG&longitude=${point.longitude}&latitude=${point.latitude}&start=20260901&end=20261001&format=JSON`;
}

async function readLive(url: string) {
  assertSourceUrl(url);
  const raw = await boundedFetch(url, 2_000_000);
  return new TextDecoder().decode(raw.data);
}

function envelope<T>(
  id: string,
  name: string,
  url: string,
  live: boolean,
  fetchedAt: string,
  data: T,
): AdapterResult<T> {
  return { data, source: { id, name, url, live }, fetched_at: fetchedAt };
}

async function liveOrCachedText(
  url: string,
  cacheKey: string,
  allowCache: boolean,
) {
  try {
    const text = await readLive(url);
    return { text, live: true, fetched_at: new Date().toISOString(), url };
  } catch (error) {
    if (!allowCache) throw error;
    const cached = cacheFile(cacheKey);
    return {
      text: cached.text,
      live: false,
      fetched_at: cached.fetched_at,
      url: cached.url,
    };
  }
}

function assemble(input: {
  point: FarmPoint;
  forecast: AdapterResult<OpenMeteoDaily>;
  rainfall: AdapterResult<OpenMeteoDaily>;
  oni: AdapterResult<{ latest: OniPoint; phase: string; points: OniPoint[] }>;
  roni: AdapterResult<{
    latest: { time: string; value: number; label?: string };
    points: { time: string; value: number | null; label?: string }[];
  }>;
  power: AdapterResult<PowerDaily> | null;
  market: AdapterResult<{ quotes: MandiQuote[]; selected: MandiQuote; note: string }>;
  msp: AdapterResult<MspReading>;
}): DemoCache {
  const rain7 = sum(input.forecast.data.days.slice(0, 7).map((day) => day.rain_mm));
  const et07 = sum(input.forecast.data.days.slice(0, 7).map((day) => day.et0_mm));
  const selected = input.market.data.selected;
  const recommendation = buildHarvestRecommendation({
    soybean_ha: DEMO_FARMER.soybean_ha,
    yield_q_per_ha: DEMO_FARMER.yield_q_per_ha,
    labour_inr_per_ha: DEMO_FARMER.labour_inr_per_ha,
    forecast_rain_mm_7d: rain7,
    forecast_et0_mm_7d: et07,
    market: selected.market,
    price_date: selected.date,
    min_inr: selected.min_inr,
    modal_inr: selected.modal_inr,
    max_inr: selected.max_inr,
    msp_inr: input.msp.data.msp_inr_per_quintal,
    enso_phase: input.oni.data.phase,
    oni_season: `${input.oni.data.latest.season} ${input.oni.data.latest.year}`,
    oni_anom_c: input.oni.data.latest.anomaly_c,
    market_live: input.market.source.live,
  });
  const place = `${DEMO_FARMER.village}, ${DEMO_FARMER.district}`;
  const geography = `${place} (${input.point.latitude}, ${input.point.longitude})`;
  const powerDays = input.power?.data.days ?? [];
  const brief: DemoBrief = {
    farmer_name: DEMO_FARMER.name,
    village: DEMO_FARMER.village,
    district: DEMO_FARMER.district,
    state: DEMO_FARMER.state,
    soybean_ha: DEMO_FARMER.soybean_ha,
    cotton_ha: DEMO_FARMER.cotton_ha,
    total_ha: Math.round((DEMO_FARMER.soybean_ha + DEMO_FARMER.cotton_ha) * 10) / 10,
    yield_q_per_ha: DEMO_FARMER.yield_q_per_ha,
    forecast_rain_7d_mm: round1(rain7),
    forecast_et0_7d_mm: round1(et07),
    forecast_temp_max_c: input.forecast.data.days[0]?.temp_max_c ?? null,
    forecast_from: input.forecast.data.days[0]?.date ?? "",
    forecast_to: input.forecast.data.days.at(-1)?.date ?? "",
    season_rain_mm: round1(sum(input.rainfall.data.days.map((day) => day.rain_mm))),
    season_from: input.rainfall.data.days[0]?.date ?? "",
    season_to: input.rainfall.data.days.at(-1)?.date ?? "",
    oni_season: input.oni.data.latest.season,
    oni_year: input.oni.data.latest.year,
    oni_anom_c: input.oni.data.latest.anomaly_c,
    enso_phase: input.oni.data.phase,
    roni_label: input.roni.data.latest.label ?? "",
    roni_c: input.roni.data.latest.value,
    power_rain_mm: powerDays.length
      ? round1(sum(powerDays.map((day) => day.rain_mm)))
      : null,
    power_from: powerDays[0]?.date ?? null,
    power_to: powerDays.at(-1)?.date ?? null,
    market: selected.market,
    price_date: selected.date,
    min_inr: selected.min_inr,
    modal_inr: selected.modal_inr,
    max_inr: selected.max_inr,
    market_live: input.market.source.live,
    market_note: input.market.data.note,
    msp_inr: input.msp.data.msp_inr_per_quintal,
    msp_url: input.msp.data.url,
    recommendation,
  };
  const series: PreparedSeries[] = [
    {
      source_id: "W05",
      variable: "forecast_rainfall",
      unit: "mm/day",
      kind: "forecast",
      geography,
      method_version: "open-meteo-forecast.v1",
      points: input.forecast.data.days.map((day) => ({
        time: localTime(day.date),
        value: day.rain_mm,
      })),
      title: "Open-Meteo 16-day rainfall forecast",
      text: `Daily precipitation sum for ${geography}. Next 7 days total ${brief.forecast_rain_7d_mm} mm. A forecast, not a rain-gauge promise.`,
      url: input.forecast.source.url,
      fetched_at: input.forecast.fetched_at,
      live: input.forecast.source.live,
    },
    {
      source_id: "W05",
      variable: "forecast_et0",
      unit: "mm/day",
      kind: "forecast",
      geography,
      method_version: "open-meteo-forecast.v1",
      points: input.forecast.data.days.map((day) => ({
        time: localTime(day.date),
        value: day.et0_mm,
      })),
      title: "Open-Meteo reference evaporation",
      text: `FAO ET0 for ${geography}. Next 7 days total ${brief.forecast_et0_7d_mm} mm.`,
      url: input.forecast.source.url,
      fetched_at: input.forecast.fetched_at,
      live: input.forecast.source.live,
    },
    {
      source_id: "W06",
      variable: "historical_rainfall",
      unit: "mm/day",
      kind: "observed",
      geography,
      method_version: "open-meteo-archive.v1",
      points: input.rainfall.data.days.map((day) => ({
        time: localTime(day.date),
        value: day.rain_mm,
      })),
      title: "Open-Meteo past rainfall",
      text: `Archive precipitation from ${brief.season_from} to ${brief.season_to}: ${brief.season_rain_mm} mm at ${geography}. Model reanalysis, not a farm gauge.`,
      url: input.rainfall.source.url,
      fetched_at: input.rainfall.fetched_at,
      live: input.rainfall.source.live,
    },
    {
      source_id: "C08",
      variable: "ONI",
      unit: "degC",
      kind: "observed",
      geography: "Niño 3.4",
      method_version: "noaa-oni-ascii.v1",
      points: input.oni.data.points.map((point) => ({
        time: point.time,
        value: point.anomaly_c,
        label: point.season,
      })),
      title: "NOAA Oceanic Niño Index",
      text: `Latest ${brief.oni_season} ${brief.oni_year} anomaly ${brief.oni_anom_c} °C (${brief.enso_phase}). Thresholds ±0.5 °C. Not a local rainfall forecast.`,
      url: input.oni.source.url,
      fetched_at: input.oni.fetched_at,
      live: input.oni.source.live,
    },
    {
      source_id: "C01",
      variable: "RONI",
      unit: "degC",
      kind: "observed",
      geography: "Nino3.4 relative to tropical mean",
      method_version: "noaa-roni-ersstv6.v1",
      points: input.roni.data.points,
      title: "NOAA Relative Oceanic Niño Index",
      text: `Latest labelled season ${brief.roni_label} is ${brief.roni_c} °C. ERSSTv6 relative index. Not a farm rainfall prediction.`,
      url: input.roni.source.url,
      fetched_at: input.roni.fetched_at,
      live: input.roni.source.live,
    },
    {
      source_id: "M01",
      variable: `market_price:${selected.market}:${selected.commodity}`,
      unit: "INR/quintal",
      kind: "observed",
      geography: `${selected.market}, ${selected.district}, ${selected.state}`,
      method_version: "data-gov-in-agmarknet.v1",
      points: input.market.data.quotes
        .filter((quote) => quote.market === selected.market)
        .map((quote) => ({
          time: localTime(quote.date),
          value: quote.modal_inr,
          lower: quote.min_inr,
          upper: quote.max_inr,
        })),
      title: `${selected.commodity} ${selected.market} modal price`,
      text: input.market.data.note,
      url: input.market.source.url,
      fetched_at: input.market.fetched_at,
      live: input.market.source.live,
    },
    {
      source_id: "G04",
      variable: "soybean_msp",
      unit: "INR/quintal",
      kind: "observed",
      geography: "India",
      method_version: "pib-kharif-msp.v1",
      points: [
        {
          time: `${input.msp.data.issued_on}T00:00:00+05:30`,
          value: input.msp.data.msp_inr_per_quintal,
          label: input.msp.data.commodity,
        },
      ],
      title: "Soybean yellow MSP 2026-27",
      text: input.msp.data.note,
      url: input.msp.source.url,
      fetched_at: input.msp.fetched_at,
      live: input.msp.source.live,
    },
  ];
  if (input.power) {
    series.push({
      source_id: "W07",
      variable: "historical_rainfall",
      unit: "mm/day",
      kind: "observed",
      geography,
      method_version: "nasa-power-daily.v1",
      points: input.power.data.days.map((day) => ({
        time: localTime(day.date),
        value: day.rain_mm,
      })),
      title: "NASA POWER corrected precipitation",
      text: `POWER PRECTOTCORR from ${brief.power_from} to ${brief.power_to}: ${brief.power_rain_mm} mm at ${geography}.`,
      url: input.power.source.url,
      fetched_at: input.power.fetched_at,
      live: input.power.source.live,
    });
  }
  return { ...input, recommendation, series, brief };
}

function oniResult(text: string, live: boolean, fetchedAt: string, url: string) {
  const points = parseOni(text);
  const latest = points.at(-1);
  if (!latest) throw new DomainError("validation", "ONI rows missing");
  return envelope("C08", "NOAA Oceanic Niño Index", url, live, fetchedAt, {
    latest,
    phase: ensoPhase(latest.anomaly_c),
    points,
  });
}

function roniResult(text: string, live: boolean, fetchedAt: string, url: string) {
  const points = parseRoni(text);
  const latest = [...points].reverse().find((point) => point.value !== null);
  if (!latest || latest.value === null)
    throw new DomainError("validation", "RONI observations missing");
  return envelope("C01", "NOAA Relative Oceanic Niño Index", url, live, fetchedAt, {
    latest: { time: latest.time, value: latest.value, label: latest.label },
    points,
  });
}

function marketFromText(text: string, live: boolean, fetchedAt: string, url: string) {
  const payload = JSON.parse(text) as { note?: string };
  const quotes = parseAgmarknet(payload);
  const selected = selectMandiQuote(quotes);
  if (!selected) throw new DomainError("validation", "Mandi quote missing");
  return envelope("M01", "Agmarknet mandi prices", url, live, fetchedAt, {
    quotes,
    selected,
    note:
      payload.note ??
      `Agmarknet ${selected.commodity} at ${selected.market} on ${selected.date}: min ₹${selected.min_inr}, modal ₹${selected.modal_inr}, max ₹${selected.max_inr} per quintal.`,
  });
}

export function loadDemoCache(point: FarmPoint = DEMO_FARMER): DemoCache {
  assertIndianFarmLocation(point);
  if (!nearDemo(point))
    throw new DomainError(
      "unavailable",
      "No committed weather cache for this farm location; a live refresh is required",
    );
  const forecastFile = cacheFile("open_meteo_forecast");
  const rainfallFile = cacheFile("open_meteo_archive");
  const oniFile = cacheFile("noaa_oni");
  const roniFile = cacheFile("noaa_roni");
  const powerFile = cacheFile("nasa_power");
  const marketFile = cacheFile("agmarknet");
  const mspFile = cacheFile("msp");
  const msp = parseMsp(JSON.parse(mspFile.text));
  return assemble({
    point,
    forecast: envelope(
      "W05",
      "Open-Meteo forecast",
      forecastFile.url,
      false,
      forecastFile.fetched_at,
      parseOpenMeteoDaily(JSON.parse(forecastFile.text)),
    ),
    rainfall: envelope(
      "W06",
      "Open-Meteo past rainfall",
      rainfallFile.url,
      false,
      rainfallFile.fetched_at,
      parseOpenMeteoDaily(JSON.parse(rainfallFile.text)),
    ),
    oni: oniResult(oniFile.text, false, oniFile.fetched_at, oniFile.url),
    roni: roniResult(roniFile.text, false, roniFile.fetched_at, roniFile.url),
    power: envelope(
      "W07",
      "NASA POWER",
      powerFile.url,
      false,
      powerFile.fetched_at,
      parsePowerDaily(JSON.parse(powerFile.text)),
    ),
    market: marketFromText(marketFile.text, false, marketFile.fetched_at, marketFile.url),
    msp: envelope("G04", "Kharif MSP", msp.url, false, mspFile.fetched_at, msp),
  });
}

export async function refreshDemoCache(
  point: FarmPoint = DEMO_FARMER,
  options: { state?: string; commodity?: string; apiKey?: string } = {},
): Promise<DemoCache> {
  assertIndianFarmLocation(point);
  const cached = () => {
    try {
      return nearDemo(point) ? loadDemoCache(point) : null;
    } catch {
      return null;
    }
  };
  const fallback = cached();
  const forecastLive = await liveOrCachedText(
    forecastUrl(point),
    "open_meteo_forecast",
    nearDemo(point),
  ).catch(() => null);
  const rainfallLive = await liveOrCachedText(
    archiveUrl(point, new Date()),
    "open_meteo_archive",
    nearDemo(point),
  ).catch(() => null);
  const oniLive = await liveOrCachedText(
    "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt",
    "noaa_oni",
    true,
  ).catch(() => null);
  const roniLive = await liveOrCachedText(
    "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/",
    "noaa_roni",
    true,
  ).catch(() => null);
  const powerLive = await liveOrCachedText(powerUrl(point), "nasa_power", nearDemo(point)).catch(
    () => null,
  );
  const key = options.apiKey ?? process.env.DATA_GOV_IN_API_KEY?.trim();
  let marketLive: { text: string; live: boolean; fetched_at: string; url: string } | null =
    null;
  if (key) {
    const resource =
      "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
    const query = new URLSearchParams({
      "api-key": key,
      format: "json",
      limit: "100",
      offset: "0",
    });
    query.append("filters[state]", options.state ?? DEMO_FARMER.state);
    query.append("filters[commodity]", options.commodity ?? "Soyabean");
    try {
      marketLive = {
        text: await readLive(`${resource}?${query}`),
        live: true,
        fetched_at: new Date().toISOString(),
        url: resource,
      };
    } catch {
      marketLive = null;
    }
  }
  if (!marketLive && nearDemo(point)) {
    const file = cacheFile("agmarknet");
    marketLive = {
      text: file.text,
      live: false,
      fetched_at: file.fetched_at,
      url: file.url,
    };
  }
  const mspLive = await liveOrCachedText(
    "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2260618",
    "msp",
    true,
  ).catch(() => null);
  const forecast = forecastLive
    ? envelope(
        "W05",
        "Open-Meteo forecast",
        forecastLive.url,
        forecastLive.live,
        forecastLive.fetched_at,
        parseOpenMeteoDaily(JSON.parse(forecastLive.text)),
      )
    : fallback?.forecast;
  const rainfall = rainfallLive
    ? envelope(
        "W06",
        "Open-Meteo past rainfall",
        rainfallLive.url,
        rainfallLive.live,
        rainfallLive.fetched_at,
        parseOpenMeteoDaily(JSON.parse(rainfallLive.text)),
      )
    : fallback?.rainfall;
  const oni = oniLive
    ? oniResult(oniLive.text, oniLive.live, oniLive.fetched_at, oniLive.url)
    : fallback?.oni;
  const roni = roniLive
    ? roniResult(roniLive.text, roniLive.live, roniLive.fetched_at, roniLive.url)
    : fallback?.roni;
  const power = powerLive
    ? envelope(
        "W07",
        "NASA POWER",
        powerLive.url,
        powerLive.live,
        powerLive.fetched_at,
        parsePowerDaily(JSON.parse(powerLive.text)),
      )
    : (fallback?.power ?? null);
  const market = marketLive
    ? marketFromText(marketLive.text, marketLive.live, marketLive.fetched_at, marketLive.url)
    : fallback?.market;
  let msp = fallback?.msp;
  if (mspLive?.live && mspLive.text.includes("5708") && mspLive.text.includes("Soybean")) {
    const file = cacheFile("msp");
    const parsed = parseMsp(JSON.parse(file.text));
    msp = envelope("G04", "Kharif MSP", mspLive.url, true, mspLive.fetched_at, parsed);
  } else if (mspLive && !mspLive.live) {
    const parsed = parseMsp(JSON.parse(mspLive.text));
    msp = envelope("G04", "Kharif MSP", parsed.url, false, mspLive.fetched_at, parsed);
  }
  if (!forecast || !rainfall || !oni || !roni || !market || !msp)
    throw new DomainError(
      "unavailable",
      "Live sources and the committed cache both failed for this location",
    );
  return assemble({ point, forecast, rainfall, oni, roni, power, market, msp });
}
