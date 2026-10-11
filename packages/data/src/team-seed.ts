import { type AgentId, Card } from "@sakha/contracts";
import type { DemoCache } from "./adapters.js";

/** Charter ids. The first role that exists at seed time is the one that gets the rows. */
export const TEAM = [
  {
    id: "sakha",
    name: "Sakha",
    roleCandidates: ["sakha", "chief_of_staff"],
  },
  {
    id: "megha",
    name: "Megha",
    roleCandidates: ["megha", "weather"],
  },
  {
    id: "jal",
    name: "Jal",
    roleCandidates: ["jal", "water"],
  },
  {
    id: "kheti",
    name: "Kheti",
    roleCandidates: ["kheti", "crop_care", "crop_planning"],
  },
  {
    id: "paisa",
    name: "Paisa",
    roleCandidates: ["paisa", "farm_finance", "market"],
  },
] as const;

const SOWING_DATE = "2026-06-20";
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export type SeedMemory = {
  team_id: AgentId;
  key: string;
  value: unknown;
  text: string;
};

export type SeedMessage = {
  author: "farmer" | "agent";
  text: string;
  reviewed_by?: AgentId;
  consulted?: AgentId[];
  card?: Card;
};

export type SeedThread = {
  team_id: AgentId;
  title: string;
  kind: "primary" | "consult";
  messages: SeedMessage[];
};

export type SeedStatus = { id: AgentId; name: string; line: string };

export type FindingDraft = {
  team_id: AgentId;
  role_key: string;
  title: string;
  summary: string;
  source_id: string;
  assumptions: string[];
};

export type TeamSeed = {
  roles: Partial<Record<AgentId, string>>;
  memory: SeedMemory[];
  threads: SeedThread[];
  statuses: SeedStatus[];
  findings: FindingDraft[];
};

export function resolveTeamRole(
  teamId: AgentId,
  availableRoles: readonly string[],
) {
  const member = TEAM.find((item) => item.id === teamId);
  if (!member) return null;
  const available = new Set(availableRoles);
  return member.roleCandidates.find((role) => available.has(role)) ?? null;
}

function rupee(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function pretty(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

function plusDays(iso: string, days: number) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function sentences(text: string) {
  return text
    .split(/(?<!\d)[.!?](?!\d)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function card(input: Card): Card {
  const words = input.headline.trim().split(/\s+/).filter(Boolean);
  if (words.length > 12)
    throw new Error(`Headline is over 12 words: ${input.headline}`);
  if (sentences(input.why).length > 2)
    throw new Error(`Why is over 2 sentences: ${input.why}`);
  if (input.do.length < 1 || input.do.length > 3)
    throw new Error(`Do list must hold 1 to 3 actions: ${input.headline}`);
  return Card.parse(input);
}

function say(value: Card, hindi?: string) {
  return [
    value.headline,
    ...value.do.map((item) => `• ${item}`),
    value.why,
    hindi,
  ]
    .filter(Boolean)
    .join("\n");
}

function pair(
  question: string,
  value: Card,
  extra?: { consulted?: AgentId[]; hindi?: string },
): SeedMessage[] {
  return [
    { author: "farmer", text: question },
    {
      author: "agent",
      text: say(value, extra?.hindi),
      reviewed_by: "sakha",
      consulted: extra?.consulted,
      card: value,
    },
  ];
}

function memory(
  teamId: AgentId,
  key: string,
  value: unknown,
  text: string,
): SeedMemory {
  return { team_id: teamId, key, value, text: `${key}: ${text}` };
}

export function buildTeamSeed(
  cache: DemoCache,
  availableRoles: readonly string[],
): TeamSeed {
  const brief = cache.brief;
  const rec = cache.recommendation;
  const quotes = cache.market.data.quotes;
  const selected = cache.market.data.selected;
  const week = cache.forecast.data.days.slice(0, 7);
  const tomorrow = cache.forecast.data.days[1];
  const today = brief.forecast_from;
  const weekEnd = plusDays(today, 6);
  const das = daysBetween(SOWING_DATE, today);
  const fetched = pretty(cache.forecast.fetched_at);
  const priceWhen = pretty(brief.price_date);
  const priceAge = daysBetween(brief.price_date, today);
  const cachedLabel = brief.market_live
    ? `priced ${priceWhen}`
    : `cached ${priceWhen}`;
  const modelLat = Math.round(cache.forecast.data.latitude * 100) / 100;
  const modelLon = Math.round(cache.forecast.data.longitude * 100) / 100;
  const rows = quotes
    .filter((quote) => quote.market === selected.market)
    .sort((a, b) => a.date.localeCompare(b.date));
  const earlier = rows
    .filter((quote) => quote.date <= plusDays(brief.price_date, -6))
    .at(-1);
  const trendPct = earlier?.modal_inr
    ? Math.round(
        ((selected.modal_inr - earlier.modal_inr) / earlier.modal_inr) * 100,
      )
    : 0;
  const arrow = trendPct > 0 ? "↑" : trendPct < 0 ? "↓" : "→";
  const latestByMarket = new Map<string, (typeof quotes)[number]>();
  for (const quote of quotes) {
    const previous = latestByMarket.get(quote.market);
    if (!previous || previous.date < quote.date)
      latestByMarket.set(quote.market, quote);
  }
  const prices = [...latestByMarket.values()].map((quote) => ({
    mandi: quote.market,
    modal_inr: quote.modal_inr,
    date: quote.date,
  }));
  const forecastDays = week.map((day) => ({
    date: day.date,
    rain_mm: day.rain_mm,
    tmax: day.temp_max_c,
    prob: day.rain_probability_pct,
  }));
  const forecastSource = {
    title: "Open-Meteo 16-day forecast",
    url: cache.forecast.source.url,
    adapter: "W05",
    fetched_at: cache.forecast.fetched_at,
  };
  const archiveSource = {
    title: "Open-Meteo past rainfall",
    url: cache.rainfall.source.url,
    adapter: "W06",
    fetched_at: cache.rainfall.fetched_at,
  };
  const powerSource = cache.power
    ? {
        title: "NASA POWER corrected precipitation",
        url: cache.power.source.url,
        adapter: "W07",
        fetched_at: cache.power.fetched_at,
      }
    : null;
  const oniSource = {
    title: "NOAA Oceanic Niño Index",
    url: cache.oni.source.url,
    adapter: "C08",
    fetched_at: cache.oni.fetched_at,
  };
  const secondIndexSource = {
    title: "NOAA second Pacific index",
    url: cache.roni.source.url,
    adapter: "C01",
    fetched_at: cache.roni.fetched_at,
  };
  const marketSource = {
    title: `Agmarknet ${selected.commodity}, ${cachedLabel}`,
    url: cache.market.source.url,
    adapter: "M01",
    fetched_at: cache.market.fetched_at,
  };
  const mspSource = {
    title: `PIB ${cache.msp.data.commodity} MSP`,
    url: cache.msp.data.url,
    adapter: "G04",
    fetched_at: cache.msp.fetched_at,
  };
  const farmerSource = {
    title: "Farmer report, Kalmeshwar",
    adapter: "farmer_report",
    fetched_at: cache.forecast.fetched_at,
  };
  const enso = `active (+${brief.oni_anom_c} °C)`;
  const actions = [
    `Cut the ${brief.soybean_ha} ha soybean on ${pretty(plusDays(today, 1))}–${pretty(plusDays(today, 5))}.`,
    `Sell at ${brief.market} aiming for ₹${rupee(brief.modal_inr)} per quintal, not the ₹${rupee(brief.min_inr)} minimum (${cachedLabel}).`,
    `Give the soybean 0 mm and keep the borewell for ${brief.cotton_ha} ha cotton.`,
  ];
  const roles: Partial<Record<AgentId, string>> = {};
  for (const member of TEAM) {
    const role = resolveTeamRole(member.id, availableRoles);
    if (role) roles[member.id] = role;
  }

  const weekly = card({
    agent: "sakha",
    headline: "Cut soybean this dry week and sell",
    do: actions,
    why: `Megha's Open-Meteo forecast, fetched ${fetched}, totals ${brief.forecast_rain_7d_mm} mm of rain and ${brief.forecast_et0_7d_mm} mm of evaporation through ${pretty(weekEnd)}, and NOAA's ${brief.oni_season} ${brief.oni_year} index is +${brief.oni_anom_c} °C. Paisa's ${brief.market} modal is ₹${rupee(brief.modal_inr)} against a ₹${rupee(brief.msp_inr)} MSP, so the plan is to sell this dry week.`,
    cost_inr: rec.cost_inr,
    benefit_inr: rec.benefit_inr,
    risk: "medium",
    confidence: "medium",
    sources: [forecastSource, oniSource, marketSource, mspSource],
  });
  const profileCard = card({
    agent: "sakha",
    headline: "Kalmeshwar profile is saved",
    do: [
      `Keep soybean at ${brief.soybean_ha} ha, sown ${pretty(SOWING_DATE)}, stage pods drying.`,
      `Keep cotton at ${brief.cotton_ha} ha on the same borewell.`,
      "Talk with Kavita in Hindi and English.",
    ],
    why: `This only saves the farmer's own report from ${fetched}. Weather, water, crop care and prices still come from Megha, Jal, Kheti and Paisa.`,
    risk: "low",
    confidence: "high",
    sources: [farmerSource],
  });
  const joke = card({
    agent: "sakha",
    headline: "I only help with your farm",
    do: ["Ask about this week's rain, water, the soybean, or the mandi price."],
    why: "I only help with your farm — ask me about weather, water, crops or money.",
    risk: "low",
    confidence: "high",
    sources: [forecastSource],
    out_of_scope: true,
  });
  const accepted = card({
    agent: "sakha",
    headline: "The harvest plan is already approved",
    do: actions,
    why: `You accepted this plan on ${fetched}. Approving it does not cut the crop, start the pump, or sell the grain by itself.`,
    cost_inr: rec.cost_inr,
    benefit_inr: rec.benefit_inr,
    risk: "medium",
    confidence: "medium",
    sources: [farmerSource, marketSource, forecastSource],
  });
  const rainCard = card({
    agent: "megha",
    headline: `${brief.forecast_rain_7d_mm} mm of rain over seven days`,
    do: [
      `Expect ${brief.forecast_rain_7d_mm} mm from ${pretty(today)} to ${pretty(weekEnd)}.`,
      `Hold irrigation; Jal owns the water decision.`,
    ],
    why: `Open-Meteo, fetched ${fetched}, places this forecast at ${modelLat} N, ${modelLon} E, nearest to the farm at ${brief.district}, and totals ${brief.forecast_rain_7d_mm} mm against ${brief.forecast_et0_7d_mm} mm of evaporation. It is a forecast, not a rain-gauge promise.`,
    risk: "medium",
    confidence: "medium",
    sources: [forecastSource],
    forecast_days: forecastDays,
    handoff_suggestion: {
      to: "jal",
      reason:
        "Rain over the next 7 days is under 10 mm while soybean pods are drying.",
    },
  });
  const ensoCard = card({
    agent: "megha",
    headline: "El Niño is on for this season",
    do: [
      `Treat ${brief.oni_season} ${brief.oni_year} as El Niño at +${brief.oni_anom_c} °C.`,
      "Do not count on late rain; ask Kheti about the harvest stage.",
    ],
    why: `NOAA's Oceanic Niño Index for ${brief.oni_season} ${brief.oni_year} is +${brief.oni_anom_c} °C, fetched ${fetched}, which is at or above the +0.5 °C El Niño mark. A second NOAA index for ${brief.roni_label} is +${brief.roni_c} °C, and neither number is a rainfall forecast for ${brief.village}.`,
    risk: "medium",
    confidence: "high",
    sources: [oniSource, secondIndexSource],
    handoff_suggestion: {
      to: "kheti",
      reason: "Crop stage and harvest readiness are Kheti's lane.",
    },
  });
  const spray = card({
    agent: "megha",
    headline: "No spray clearance without a wind reading",
    do: [
      `Do not treat ${pretty(tomorrow?.date ?? plusDays(today, 1))} as a spray window.`,
      "Ask again when a wind reading is actually on file.",
    ],
    why: `Tomorrow's Open-Meteo row is ${tomorrow?.rain_mm ?? "unknown"} mm of rain with a ${tomorrow?.rain_probability_pct ?? "unknown"}% chance, fetched ${fetched}. Wind is not in that file, so I cannot clear a spray window.`,
    risk: "medium",
    confidence: "low",
    sources: [forecastSource],
    forecast_days: tomorrow
      ? [
          {
            date: tomorrow.date,
            rain_mm: tomorrow.rain_mm,
            tmax: tomorrow.temp_max_c,
            prob: tomorrow.rain_probability_pct,
          },
        ]
      : forecastDays,
  });
  const season = card({
    agent: "megha",
    headline: "June to October rain is on file",
    do: [
      `Record ${brief.season_rain_mm} mm from ${pretty(brief.season_from)} to ${pretty(brief.season_to)}.`,
      powerSource && brief.power_rain_mm !== null
        ? `NASA POWER adds ${brief.power_rain_mm} mm from ${pretty(brief.power_from ?? "")} to ${pretty(brief.power_to ?? "")}.`
        : "No second rainfall total is on file.",
    ],
    why: `Both totals were fetched ${fetched}. I do not have a normal-rainfall figure for ${brief.district}, so this is not a deficit or a surplus.`,
    risk: "low",
    confidence: "medium",
    sources: powerSource ? [archiveSource, powerSource] : [archiveSource],
  });
  const wait = card({
    agent: "jal",
    headline: "Do not irrigate the drying soybean",
    do: [
      `Give the ${brief.soybean_ha} ha soybean 0 mm on ${pretty(today)}.`,
      "Keep the borewell for the cotton until a soil reading exists.",
    ],
    why: `Open-Meteo, fetched ${fetched}, shows ${brief.forecast_rain_7d_mm} mm of rain and ${brief.forecast_et0_7d_mm} mm of evaporation over seven days. Soil moisture was not measured, and pump hours are not calculated because horsepower and the power tariff are not on file.`,
    cost_inr: 0,
    risk: "medium",
    confidence: "medium",
    sources: [forecastSource, farmerSource],
    action: "wait",
    mm: 0,
  });
  const drip = card({
    agent: "jal",
    headline: "Drip savings percent is not on file",
    do: [
      "Do not treat a savings percent as known.",
      "Ask Paisa only for a subsidy figure that is actually published.",
    ],
    why: `The water method on this farm is not recorded, and no drip-versus-flood comparison is in the fetched files. A subsidy percent is Paisa's lane, and it is not in the cache either.`,
    risk: "low",
    confidence: "low",
    sources: [farmerSource],
    handoff_suggestion: {
      to: "paisa",
      reason:
        "A drip subsidy percent is Paisa's lane, and none is in the cached files.",
    },
  });
  const borewell = card({
    agent: "jal",
    headline: "Save the borewell for the cotton",
    do: [
      `Put 0 mm on the drying soybean this week.`,
      `Leave about ${rupee(rec.borewell_held_m3)} m3 unpumped on the ${brief.soybean_ha} ha soybean.`,
      `Keep that borewell for the ${brief.cotton_ha} ha cotton.`,
    ],
    why: `That volume is evaporation minus rain over seven days, spread across the soybean area, using the Open-Meteo totals fetched ${fetched}. It is water not applied, not a rupee cost, because the pump tariff is unknown.`,
    cost_inr: 0,
    risk: "medium",
    confidence: "medium",
    sources: [forecastSource, farmerSource],
    action: "wait",
    mm: 0,
  });
  const pump = card({
    agent: "jal",
    headline: "Pump hours and power cost are unknown",
    do: [
      "Do not run the pump for the soybean this week.",
      "Record pump horsepower before anyone quotes hours or rupees.",
    ],
    why: "Pump horsepower is unset and no rupee-per-unit or diesel rate was fetched. I will not invent hours or a power bill.",
    cost_inr: 0,
    risk: "low",
    confidence: "low",
    sources: [farmerSource, forecastSource],
    action: "wait",
    mm: 0,
  });
  const stage = card({
    agent: "kheti",
    headline: `Soybean day ${das} and pods are drying`,
    do: [
      `Count day ${das} from the ${pretty(SOWING_DATE)} sowing the farmer reported.`,
      "Treat the stage as pods drying, and confirm the green patch with the local KVK.",
    ],
    why: `Variety was not stated and no soil test is on file, so this is a calendar check from the farmer's sowing date, not a variety-maturity table. The dry forecast supports a harvest look this week; Megha has the rain numbers.`,
    risk: "medium",
    confidence: "medium",
    sources: [farmerSource, forecastSource],
  });
  const patch = card({
    agent: "kheti",
    headline: "A green patch is not a diagnosis",
    do: [
      "Do not spray or dose from this report.",
      "Show the green patch to the local KVK before any treatment.",
    ],
    why: `The farmer reported a small green patch among drying pods on ${fetched}. I do not have a photo, a pest name, or a label dose, so I will not name a disease or a chemical.`,
    risk: "medium",
    confidence: "low",
    sources: [farmerSource],
  });
  const urea = card({
    agent: "kheti",
    headline: "No urea dose without a soil test",
    do: [
      "Do not apply a urea dose from this chat.",
      "Bring a soil test result before asking for nitrogen.",
    ],
    why: "The soil card is not tested, so nitrogen, phosphorus, potassium, pH and organic carbon are unknown. A dose without that card would be a guess.",
    risk: "low",
    confidence: "low",
    sources: [farmerSource],
  });
  const ready = card({
    agent: "kheti",
    headline: "The dry week supports a soybean cut",
    do: [
      `Look at cutting the ${brief.soybean_ha} ha from ${pretty(plusDays(today, 1))} to ${pretty(plusDays(today, 5))}.`,
      "Leave any still-green patch for a KVK look before it is mixed in.",
      "Ask Paisa where to sell.",
    ],
    why: `Day ${das} and the farmer's 'pods drying' report line up with a harvest look, and the forecast is dry. Variety is unstated, so this is not a named-variety maturity date.`,
    risk: "medium",
    confidence: "medium",
    sources: [farmerSource, forecastSource],
    handoff_suggestion: {
      to: "paisa",
      reason: "The sale price and the mandi choice are Paisa's lane.",
    },
  });
  const sell = card({
    agent: "paisa",
    headline: "Sell at the Nagpur modal, quote cached",
    do: [
      `Ask ₹${rupee(brief.modal_inr)} per quintal at ${brief.market} (${cachedLabel}), not the ₹${rupee(brief.min_inr)} minimum.`,
      `Compare Katol ₹${rupee(prices.find((item) => item.mandi.startsWith("Katol"))?.modal_inr ?? 0)} on ${pretty(prices.find((item) => item.mandi.startsWith("Katol"))?.date ?? brief.price_date)} and Savner ₹${rupee(prices.find((item) => item.mandi.startsWith("Savner"))?.modal_inr ?? 0)} on ${pretty(prices.find((item) => item.mandi.startsWith("Savner"))?.date ?? brief.price_date)}.`,
      `Treat the gap versus the minimum on ${rec.quintals} quintal as ₹${rupee(rec.benefit_inr)}, not a promised sale.`,
    ],
    why: `The ${brief.market} quote is ${priceAge} days older than ${pretty(today)}, so it is labelled cached, and the mandi row says ${selected.variety} while the MSP row is ${cache.msp.data.commodity}. The modal is above the ₹${rupee(brief.msp_inr)} MSP from the ${pretty(cache.msp.data.issued_on)} PIB note, so this is not a hold-for-MSP call.`,
    cost_inr: rec.cost_inr,
    benefit_inr: rec.benefit_inr,
    risk: "medium",
    confidence: "medium",
    sources: [marketSource, mspSource, farmerSource],
    prices,
  });
  const subsidy = card({
    agent: "paisa",
    headline: "Drip subsidy percent is not on file",
    do: [
      "Do not quote a subsidy percent or a rupee refund.",
      "Check the state portal only when a dated government figure is in hand.",
    ],
    why: `No PMKSY percent or installment amount was in the files fetched ${fetched}. The PIB page on file is the soybean MSP, not a drip subsidy.`,
    risk: "low",
    confidence: "low",
    sources: [mspSource],
  });
  const insurance = card({
    agent: "paisa",
    headline: "Insurance deadline is not in the file",
    do: [
      "Do not treat any date here as the crop-insurance deadline.",
      "Read the current PMFBY notice before you enrol or claim.",
    ],
    why: `No PMFBY cutoff was fetched ${fetched}. I will not invent a last date or a claim amount.`,
    risk: "medium",
    confidence: "low",
    sources: [mspSource],
  });
  const harvestMoney = card({
    agent: "paisa",
    headline: "Harvest labour and the modal gap",
    do: [
      `Count harvest labour at ₹${rupee(rec.cost_inr)} for ${brief.soybean_ha} ha, from the farmer's ₹${rupee(brief.recommendation.cost_inr / brief.soybean_ha)} per hectare.`,
      `Count ₹${rupee(rec.benefit_inr)} as the modal-minus-minimum gap on ${rec.quintals} quintal.`,
      "Stored soybean is 0 quintal until the cut is weighed.",
    ],
    why: `The yield of ${brief.yield_q_per_ha} quintal per hectare is the farmer's expectation, not a weighment. Transport, bags and moisture cuts are not in the price file.`,
    cost_inr: rec.cost_inr,
    benefit_inr: rec.benefit_inr,
    risk: "medium",
    confidence: "medium",
    sources: [farmerSource, marketSource, mspSource],
    prices,
  });
  const irrigateConsult = card({
    agent: "sakha",
    headline: "Wait for rain and skip soybean water",
    do: [
      `Give the soybean 0 mm from ${pretty(today)} to ${pretty(weekEnd)}.`,
      `Megha: ${brief.forecast_rain_7d_mm} mm of rain and ${brief.forecast_et0_7d_mm} mm of evaporation.`,
      "Jal: soil moisture is not measured, so no pump hours and no power bill.",
    ],
    why: `The two readings agree: do not irrigate drying soybean this week. A soil moisture percent is not on file, so nobody should invent one.`,
    cost_inr: 0,
    risk: "medium",
    confidence: "medium",
    sources: [forecastSource, farmerSource],
    action: "wait",
    mm: 0,
  });
  const cottonConsult = card({
    agent: "sakha",
    headline: "Keep borewell water for the cotton",
    do: [
      `Leave about ${rupee(rec.borewell_held_m3)} m3 off the soybean.`,
      `Kheti still has the soybean at day ${das}, pods drying.`,
      `Use the borewell for the ${brief.cotton_ha} ha cotton if that crop needs water.`,
    ],
    why: `Jal's volume is evaporation minus forecast rain, not a measured borewell level. Kheti has not changed the soybean stage from pods drying.`,
    cost_inr: 0,
    risk: "medium",
    confidence: "medium",
    sources: [forecastSource, farmerSource],
    action: "wait",
    mm: 0,
  });
  const pumpConsult = card({
    agent: "sakha",
    headline: "Pumping soybean has no cost on file",
    do: [
      "Do not start the pump for the soybean.",
      "Bring pump horsepower and the power tariff before asking for a bill.",
    ],
    why: `Jal will not invent pump hours or a rupee-per-unit rate. The ${rupee(rec.borewell_held_m3)} m3 figure is water not applied, not money saved.`,
    cost_inr: 0,
    risk: "low",
    confidence: "low",
    sources: [forecastSource, farmerSource],
    action: "wait",
    mm: 0,
  });
  const sellConsult = card({
    agent: "sakha",
    headline: "Sell if the buyer pays the modal",
    do: [
      `Paisa: seek ₹${rupee(brief.modal_inr)} at ${brief.market}, ${cachedLabel}.`,
      `Harvest labour is ₹${rupee(rec.cost_inr)}; the modal-minus-minimum gap is ₹${rupee(rec.benefit_inr)}.`,
    ],
    why: `The quote is above the ₹${rupee(brief.msp_inr)} MSP, so this is not advice to hold for the support price. It is a cached mandi row, not a promise the buyer will pay the modal.`,
    cost_inr: rec.cost_inr,
    benefit_inr: rec.benefit_inr,
    risk: "medium",
    confidence: "medium",
    sources: [marketSource, mspSource],
    prices,
  });
  const mandiConsult = card({
    agent: "sakha",
    headline: "Nagpur, Katol and Savner are listed",
    do: prices
      .slice(0, 3)
      .map(
        (item) =>
          `${item.mandi}: ₹${rupee(item.modal_inr)} per quintal on ${pretty(item.date)}.`,
      ),
    why: `These are the latest cached rows for each mandi, fetched ${fetched}. A higher modal at another mandi does not include transport, which is not in the file.`,
    cost_inr: rec.cost_inr,
    benefit_inr: rec.benefit_inr,
    risk: "medium",
    confidence: "medium",
    sources: [marketSource],
    prices,
  });
  const mspConsult = card({
    agent: "sakha",
    headline: "Nagpur modal is above the soybean MSP",
    do: [
      `MSP for ${cache.msp.data.commodity} is ₹${rupee(brief.msp_inr)}, PIB ${pretty(cache.msp.data.issued_on)}.`,
      `On ${rec.quintals} quintal the modal is about ₹${rupee(rec.premium_over_msp_inr)} above that MSP.`,
    ],
    why: `The mandi row is labelled ${selected.variety}, while the MSP row is ${cache.msp.data.commodity}, so the comparison assumes the same crop. It is not a promise of a government purchase.`,
    cost_inr: rec.cost_inr,
    benefit_inr: rec.benefit_inr,
    risk: "medium",
    confidence: "medium",
    sources: [marketSource, mspSource],
    prices,
  });

  const threads: SeedThread[] = [
    {
      team_id: "sakha",
      title: "What should I do this week",
      kind: "primary",
      messages: [
        ...pair("इस हफ्ते क्या करूँ? What should I do this week?", weekly, {
          consulted: ["megha", "jal", "kheti", "paisa"],
          hindi: "इस हफ्ते सोयाबीन काट लो।",
        }),
        ...pair(
          "Keep soybean at 1.6 hectare and cotton at 0.8 hectare. Water is a borewell. I speak Hindi and English.",
          profileCard,
        ),
        ...pair("Tell me a joke.", joke),
        ...pair("Did I accept this week's plan?", accepted),
      ],
    },
    {
      team_id: "megha",
      title: "Will it rain this week",
      kind: "primary",
      messages: [
        ...pair("क्या इस हफ्ते बारिश होगी? Will it rain this week?", rainCard),
        ...pair("Is El Niño bad for my soybean?", ensoCard),
        ...pair("Can I spray tomorrow?", spray),
        ...pair("How much rain fell since June?", season),
      ],
    },
    {
      team_id: "jal",
      title: "Should I water soybean today",
      kind: "primary",
      messages: [
        ...pair("सोयाबीन को आज पानी दूँ? Should I water soybean today?", wait),
        ...pair("Is drip worth it for the cotton?", drip),
        ...pair("The borewell is low. What should I save it for?", borewell),
        ...pair("How many hours should the pump run?", pump),
      ],
    },
    {
      team_id: "kheti",
      title: "What stage is the soybean",
      kind: "primary",
      messages: [
        ...pair("सोयाबीन किस अवस्था में है? What stage is the soybean?", stage),
        ...pair("There is a small green patch. Is it a disease?", patch),
        ...pair("How much urea should I give?", urea),
        ...pair("Is the soybean ready to cut?", ready),
      ],
    },
    {
      team_id: "paisa",
      title: "Sell soybean now",
      kind: "primary",
      messages: [
        ...pair("अभी सोयाबीन बेचूँ? Should I sell soybean now?", sell),
        ...pair("Is a drip subsidy available?", subsidy),
        ...pair("What is the last date for crop insurance?", insurance),
        ...pair(
          "What does this harvest cost, and what is the benefit?",
          harvestMoney,
        ),
      ],
    },
    {
      team_id: "sakha",
      title: "Irrigate or wait",
      kind: "consult",
      messages: [
        ...pair("Should I irrigate or wait?", irrigateConsult, {
          consulted: ["megha", "jal"],
        }),
        ...pair("Cotton still needs the borewell, right?", cottonConsult, {
          consulted: ["jal", "kheti"],
        }),
        ...pair("What if I pump the soybean anyway?", pumpConsult, {
          consulted: ["jal"],
        }),
      ],
    },
    {
      team_id: "sakha",
      title: "Sell now or wait",
      kind: "consult",
      messages: [
        ...pair("Sell now or wait for a higher price?", sellConsult, {
          consulted: ["paisa"],
        }),
        ...pair("Which mandi is on the sheet?", mandiConsult, {
          consulted: ["paisa"],
        }),
        ...pair("Is that price above MSP?", mspConsult, {
          consulted: ["paisa"],
        }),
      ],
    },
  ];

  const memoryRows: SeedMemory[] = [
    memory("sakha", "profile.district", brief.district, brief.district),
    memory(
      "sakha",
      "profile.lat",
      cache.point.latitude,
      String(cache.point.latitude),
    ),
    memory(
      "sakha",
      "profile.lon",
      cache.point.longitude,
      String(cache.point.longitude),
    ),
    memory(
      "sakha",
      "profile.crop",
      { soybean_ha: brief.soybean_ha, cotton_ha: brief.cotton_ha },
      `Soybean ${brief.soybean_ha} ha and cotton ${brief.cotton_ha} ha`,
    ),
    memory(
      "sakha",
      "profile.sowing_date",
      SOWING_DATE,
      `${SOWING_DATE}, farmer report`,
    ),
    memory("sakha", "profile.stage", "pods drying", "pods drying"),
    memory(
      "sakha",
      "profile.acres",
      {
        soybean_ha: brief.soybean_ha,
        cotton_ha: brief.cotton_ha,
        acres: null,
      },
      "Hectares are the farmer's figures. Acres were not surveyed, so this value stays unset.",
    ),
    memory("sakha", "profile.water_source", "borewell", "borewell"),
    memory(
      "sakha",
      "profile.budget_inr",
      rec.cost_inr,
      `₹${rupee(rec.cost_inr)} harvest labour, farmer's own rate, not a surveyed budget`,
    ),
    memory("sakha", "profile.language", "hi/en", "Hindi and English"),
    memory(
      "sakha",
      "plan.current",
      { top1: "cut soybean and sell at the Nagpur modal", actions },
      `top: cut soybean and sell at the Nagpur modal. ${actions.join(" ")}`,
    ),
    memory("sakha", "plan.history", [], "No earlier plan is stored."),
    memory(
      "sakha",
      "decisions",
      [{ at: today, decision: "approve", title: rec.title }],
      `Approved on ${today}: ${rec.title}`,
    ),
    memory(
      "megha",
      "megha.last_forecast",
      {
        rain_7d_mm: brief.forecast_rain_7d_mm,
        et0_7d_mm: brief.forecast_et0_7d_mm,
        from: today,
        to: weekEnd,
        fetched_at: cache.forecast.fetched_at,
      },
      `${brief.forecast_rain_7d_mm} mm rain and ${brief.forecast_et0_7d_mm} mm evaporation from ${today} to ${weekEnd}`,
    ),
    memory(
      "megha",
      "megha.enso_state",
      {
        phase: brief.enso_phase,
        season: `${brief.oni_season} ${brief.oni_year}`,
        anomaly_c: brief.oni_anom_c,
        second_index_c: brief.roni_c,
        second_index_label: brief.roni_label,
      },
      `${brief.enso_phase} ${brief.oni_season} ${brief.oni_year} +${brief.oni_anom_c} °C. A second NOAA index ${brief.roni_label} is +${brief.roni_c} °C.`,
    ),
    memory(
      "megha",
      "megha.season_rain_mm",
      {
        open_meteo_mm: brief.season_rain_mm,
        from: brief.season_from,
        to: brief.season_to,
        power_mm: brief.power_rain_mm,
      },
      `${brief.season_rain_mm} mm from ${brief.season_from} to ${brief.season_to}. No normal is stored, so this is not a deficit.`,
    ),
    memory(
      "megha",
      "megha.alerts_sent",
      [],
      "No heat, frost or warning alert was sent.",
    ),
    memory("jal", "jal.water_source", "borewell", "borewell"),
    memory("jal", "jal.pump_hp", null, "Unknown. Do not invent pump hours."),
    memory(
      "jal",
      "jal.last_irrigation_date",
      null,
      "No irrigation date is recorded.",
    ),
    memory(
      "jal",
      "jal.method",
      null,
      "Not recorded. No drip or flood comparison is stored.",
    ),
    memory(
      "jal",
      "jal.irrigation_log",
      [],
      "Empty. No irrigation has been logged.",
    ),
    memory(
      "kheti",
      "kheti.crop",
      "Soybean",
      "Soybean, with cotton on the rest of the farm",
    ),
    memory(
      "kheti",
      "kheti.variety",
      null,
      "Not stated. Do not name a variety.",
    ),
    memory(
      "kheti",
      "kheti.sowing_date",
      SOWING_DATE,
      `${SOWING_DATE}, farmer report`,
    ),
    memory("kheti", "kheti.stage", "pods drying", `pods drying, day ${das}`),
    memory(
      "kheti",
      "kheti.soil_card",
      null,
      "Not tested. Nitrogen, phosphorus, potassium, pH and organic carbon are unknown.",
    ),
    memory(
      "kheti",
      "kheti.issues_log",
      ["small green patch reported by farmer"],
      "small green patch reported by farmer. Not a diagnosis.",
    ),
    memory(
      "paisa",
      "paisa.nearest_mandis",
      ["Nagpur APMC", "Katol APMC", "Savner APMC"],
      "Nagpur APMC, Katol APMC, Savner APMC",
    ),
    memory(
      "paisa",
      "paisa.price_history",
      quotes,
      `${selected.market} ${selected.date} modal ₹${selected.modal_inr}. ${brief.market_note}`,
    ),
    memory(
      "paisa",
      "paisa.enrolled_schemes",
      [],
      "Unknown. No PM-KISAN, PMFBY or PMKSY enrolment is recorded.",
    ),
    memory(
      "paisa",
      "paisa.costs_this_season",
      { harvest_labour_inr: rec.cost_inr },
      `Harvest labour ₹${rec.cost_inr}, farmer's rate. Other costs were not reported.`,
    ),
    memory(
      "paisa",
      "paisa.stored_qty_qtl",
      0,
      "0 quintal stored. The soybean is not harvested yet.",
    ),
  ];

  const statuses: SeedStatus[] = [
    {
      id: "sakha",
      name: "Sakha",
      line: `${actions.length} actions this week · top: cut soybean and sell at the Nagpur modal`,
    },
    {
      id: "megha",
      name: "Megha",
      line: `🌧 ${brief.forecast_rain_7d_mm} mm next 7 days · El Niño: ${enso} · no alerts`,
    },
    {
      id: "jal",
      name: "Jal",
      line: "💧 Soil moisture not measured · next water: not needed · 0 mm",
    },
    {
      id: "kheti",
      name: "Kheti",
      line: `🌱 Soybean day ${das} · pods drying · watch: none reported`,
    },
    {
      id: "paisa",
      name: "Paisa",
      line: `₹ ${selected.commodity} ₹${rupee(brief.modal_inr)}/qtl at ${brief.market} (${arrow} ${trendPct}% wk, ${cachedLabel}) · MSP ₹${rupee(brief.msp_inr)}`,
    },
  ];
  const climateRole = availableRoles.includes("climate")
    ? "climate"
    : (roles.megha ?? "weather");
  const findings: FindingDraft[] = [];
  if (roles.megha)
    findings.push({
      team_id: "megha",
      role_key: roles.megha,
      title: `${brief.forecast_rain_7d_mm} mm in the next 7 days`,
      summary: `Open-Meteo, fetched ${fetched}, totals ${brief.forecast_rain_7d_mm} mm of rain and ${brief.forecast_et0_7d_mm} mm of evaporation from ${pretty(today)} to ${pretty(weekEnd)}. A forecast, not a field gauge.`,
      source_id: "W05",
      assumptions: [],
    });
  findings.push({
    team_id: "megha",
    role_key: climateRole,
    title: `El Niño · ONI +${brief.oni_anom_c} °C`,
    summary: `NOAA ${brief.oni_season} ${brief.oni_year} Oceanic Niño Index is +${brief.oni_anom_c} °C, fetched ${fetched}. A second NOAA index for ${brief.roni_label} is +${brief.roni_c} °C. Not a local rainfall forecast.`,
    source_id: "C08",
    assumptions: ["El Niño here means the index is at or above +0.5 °C"],
  });
  if (roles.sakha)
    findings.push({
      team_id: "sakha",
      role_key: roles.sakha,
      title: rec.title,
      summary: `${rec.action} Harvest labour ₹${rupee(rec.cost_inr)}. The modal-minus-minimum gap on ${rec.quintals} quintal is ₹${rupee(rec.benefit_inr)}, not a promised sale.`,
      source_id: "M01",
      assumptions: rec.assumptions,
    });

  return { roles, memory: memoryRows, threads, statuses, findings };
}
