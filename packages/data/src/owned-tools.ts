import type { DemoCache } from "./adapters.js";

/** Tool name to the only teammate Cedar should allow to call it. */
export const ownedToolOwner = {
  openmeteo_forecast: "megha",
  noaa_enso_status: "megha",
  irrigate_or_wait: "jal",
  crop_stage: "kheti",
  agmarknet_prices: "paisa",
  msp_table: "paisa",
} as const;

export type OwnedToolName = keyof typeof ownedToolOwner;

export function toolOwner(name: string) {
  return ownedToolOwner[name as OwnedToolName];
}

function textFact(facts: { key: string; value: unknown }[], key: string) {
  const value = facts.find((fact) => fact.key === key)?.value;
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "qualitative" &&
    "text" in value &&
    typeof value.text === "string"
  )
    return value.text;
  if (
    value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "known" &&
    "value" in value &&
    typeof value.value === "number"
  )
    return String(value.value);
  return undefined;
}

export function forecastReading(cache: DemoCache) {
  const days = cache.forecast.data.days.slice(0, 7).map((day) => ({
    date: day.date,
    rain_mm: day.rain_mm,
    et0_mm: day.et0_mm,
    tmax: day.temp_max_c,
    prob: day.rain_probability_pct,
  }));
  return {
    rain_7d_mm: cache.brief.forecast_rain_7d_mm,
    et0_7d_mm: cache.brief.forecast_et0_7d_mm,
    temp_max_c: cache.brief.forecast_temp_max_c,
    days,
    source: cache.forecast.source,
    fetched_at: cache.forecast.fetched_at,
    cached: cache.forecast.source.live === false,
  };
}

export function ensoReading(cache: DemoCache) {
  return {
    phase: cache.brief.enso_phase,
    season: cache.brief.oni_season,
    year: cache.brief.oni_year,
    anomaly_c: cache.brief.oni_anom_c,
    second_index_c: cache.brief.roni_c,
    second_index_label: cache.brief.roni_label,
    source: cache.oni.source,
    fetched_at: cache.oni.fetched_at,
    cached: cache.oni.source.live === false,
  };
}

/** Rain and ET0 decide irrigate-or-wait. A drying crop waits even in a dry week. */
export function irrigateOrWait(cache: DemoCache, stage = "") {
  const rain = cache.brief.forecast_rain_7d_mm;
  const et0 = cache.brief.forecast_et0_7d_mm;
  const drying = /dry|pod|harvest/i.test(stage);
  const action = drying || rain >= 10 ? "wait" : "irrigate";
  const mm =
    action === "wait" ? 0 : Math.max(0, Math.round((et0 - rain) * 10) / 10);
  return {
    action,
    mm,
    rain_7d_mm: rain,
    et0_7d_mm: et0,
    stage: stage || "not noted",
    reason: drying
      ? "Pods are drying, so the borewell stays off the soybean."
      : rain >= 10
        ? "Enough rain is on the forecast to wait."
        : "Forecast rain is below evaporation, so a measured irrigation is due.",
    source: cache.forecast.source,
    fetched_at: cache.forecast.fetched_at,
    cached: cache.forecast.source.live === false,
  };
}

export function cropStageFromFacts(
  facts: { key: string; value: unknown }[],
  today = "2026-10-11",
) {
  const crop = textFact(facts, "current_crop") ?? "crop";
  const stage = textFact(facts, "crop_stage") ?? "stage not noted";
  const sowing = textFact(facts, "sowing_date");
  let day: number | undefined;
  if (sowing && /^\d{4}-\d{2}-\d{2}/.test(sowing)) {
    const start = Date.parse(`${sowing.slice(0, 10)}T00:00:00Z`);
    const end = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
    if (Number.isFinite(start) && Number.isFinite(end))
      day = Math.max(0, Math.round((end - start) / 86_400_000));
  }
  return { crop, stage, sowing_date: sowing, day };
}

export function mandiReading(cache: DemoCache) {
  const selected = cache.market.data.selected;
  return {
    market: selected.market,
    commodity: selected.commodity,
    date: selected.date,
    min_inr: selected.min_inr,
    modal_inr: selected.modal_inr,
    max_inr: selected.max_inr,
    quotes: cache.market.data.quotes.slice(0, 12).map((quote) => ({
      mandi: quote.market,
      modal_inr: quote.modal_inr,
      date: quote.date,
    })),
    note: cache.market.data.note,
    source: cache.market.source,
    fetched_at: cache.market.fetched_at,
    cached: cache.market.source.live === false,
  };
}

export function mspReading(cache: DemoCache) {
  return {
    commodity: cache.msp.data.commodity,
    msp_inr: cache.msp.data.msp_inr_per_quintal,
    issued_on: cache.msp.data.issued_on,
    source: cache.msp.source,
    fetched_at: cache.msp.fetched_at,
    cached: cache.msp.source.live === false,
  };
}
