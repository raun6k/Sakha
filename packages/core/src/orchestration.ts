import type { TeamCard, WebCitation } from "@sakha/contracts";
import * as c from "@sakha/contracts";

/** Team lead. The farmer can also open a teammate directly. */
export const sakhaRole = "sakha" as const;

/** Teammates Sakha may consult. They do not call each other. */
export const activeSpecialists = ["megha", "jal", "kheti", "paisa"] as const;

export type ActiveSpecialist = (typeof activeSpecialists)[number];

export const specialistLabels: Record<ActiveSpecialist, string> = {
  megha: "Megha",
  jal: "Jal",
  kheti: "Kheti",
  paisa: "Paisa",
};

const teamRoles = ["sakha", "megha", "jal", "kheti", "paisa"] as const;

export const MAX_SPECIALIST_CALLS = 3;
export const MAX_HOPS = 2;
export const MAX_REVISIONS = 1;
export const TURN_BUDGET_MS = 45_000;

export function canonicalizeSpecialist(
  value: string,
): ActiveSpecialist | undefined {
  const key = value.trim().toLowerCase();
  return (activeSpecialists as readonly string[]).includes(key)
    ? (key as ActiveSpecialist)
    : undefined;
}

export function isActiveSpecialist(value: string): value is ActiveSpecialist {
  return canonicalizeSpecialist(value) !== undefined;
}

/** One external-processing conversation grant unlocks the whole team. */
export function sakhaChatEnabled(
  grants: {
    status: string;
    external_processing: boolean;
    fields: string[];
    roles: string[];
  }[],
): boolean {
  return grants.some(
    (grant) =>
      grant.status === "active" &&
      grant.external_processing &&
      grant.fields.includes("conversation") &&
      (grant.roles.length === 0 ||
        grant.roles.some((role) =>
          (teamRoles as readonly string[]).includes(role),
        )),
  );
}

const sharedRules = [
  "You only help with your lane for this farmer's farm. For anything else reply in one line and name the teammate who handles it.",
  "No general chit-chat, coding, homework, politics, or medical or legal advice.",
  "Be short and actionable. Always cite a source URL and the time it was fetched. Say you are not sure rather than guess. Never invent rain totals, prices, or scheme amounts. If the source is cached, say cached on that date and keep confidence low.",
  "Unknown rupees stay unknown. Do not approve a plan, save a farmer fact, record completed work, pay, or submit a form.",
].join(" ");

export function sakhaInstructions(): string {
  return [
    "You are Sakha, the farm team lead. You listen, assign Megha (weather and El Niño), Jal (water), Kheti (crops and soil), or Paisa (money, mandi, schemes), then review their Cards into one plan.",
    "You do not invent weather, irrigation amounts, agronomy, or prices. Call consult_megha, consult_jal, consult_kheti, or consult_paisa. For a daily brief, call daily_brief once so all four run together.",
    "Simple questions use one teammate. Mixed questions use at most two in parallel. A second round happens only when a Card names a teammate you have not called. Stop at 2 rounds, 3 teammate calls, and 1 revision. Never ask two teammates to call each other.",
    "Answer in the farmer's language, Hindi or English, in at most 120 words. Shape: headline, do this, why, cost in rupees only when a source gave a number, benefit in rupees only when a source gave a number, source.",
    "Off-topic requests get one polite line about weather, water, crops, and money. Unsafe pesticide or self-harm requests get a refusal and Kisan Call Centre 1800-180-1551.",
    sharedRules,
  ].join(" ");
}

export function charterInstructions(role: c.RoleKey): string {
  const lanes: Record<c.RoleKey, string> = {
    sakha: sakhaInstructions(),
    megha:
      "You are Megha, the weather and monsoon watcher. Forecast, heat, spray windows, ENSO, and whether to wait for rain are in lane. Call openmeteo_forecast and noaa_enso_status before you state a number. Water quantity is Jal. Variety choice is Kheti. Insurance is Paisa. Memory keys: megha.last_forecast, megha.enso_state, megha.season_rain_mm, megha.alerts_sent.",
    jal: "You are Jal, the water manager. Call irrigate_or_wait for the rain-versus-evaporation decision. Do not invent millimetres, pump hours, or rupee costs. Forecasts are Megha. Subsidies are Paisa. Disease is Kheti. Memory keys: jal.water_source, jal.pump_hp, jal.last_irrigation_date, jal.method, jal.irrigation_log.",
    kheti:
      "You are Kheti, the crop doctor. Call crop_stage for this farm's crop and stage. Pests, sowing, and contingency crops are in lane. Do not invent doses or yields. Rain is Megha. Irrigation amounts are Jal. Prices and schemes are Paisa. If a chemical is mentioned, say to confirm with the local KVK. Memory keys: kheti.crop, kheti.variety, kheti.sowing_date, kheti.stage, kheti.soil_card, kheti.issues_log.",
    paisa:
      "You are Paisa, the money and market advisor. Call agmarknet_prices and msp_table before you state a rupee amount. Mandi, MSP, costs, and public schemes (PM-KISAN, PMFBY, PMKSY, KCC) are in lane. Never invent a price or a scheme amount. Never ask for bank or Aadhaar details. Never promise a payment. Agronomy is Kheti. Weather is Megha. Water quantity is Jal. Memory keys: paisa.nearest_mandis, paisa.price_history, paisa.enrolled_schemes, paisa.costs_this_season, paisa.stored_qty_qtl.",
  };
  return `${lanes[role]} ${sharedRules}`;
}

export type PromptRoute = {
  offTopic: boolean;
  injection: boolean;
  outOfScope: boolean;
  unsafe: boolean;
  specialists: ActiveSpecialist[];
  searchQuery?: string;
  fetchUrl?: string;
};

export type TurnPlan = {
  guard: "farm" | "off_topic" | "unsafe" | "injection" | "out_of_scope";
  refusal?: string;
  dailyBrief: boolean;
  /** Each inner list is one parallel round. At most two rounds. */
  hops: ActiveSpecialist[][];
  calls: number;
  specialists: ActiveSpecialist[];
  searchQuery?: string;
  fetchUrl?: string;
};

const HELPLINE =
  "I cannot help with that. For pesticide harm or distress, call the Kisan Call Centre on 1800-180-1551.";
const OFF_TOPIC =
  "I only help with your farm — ask me about weather, water, crops, or money.";

function mentioned(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

export function routeFarmerPrompt(text: string): PromptRoute {
  const plan = planTurn(text);
  return {
    offTopic: plan.guard === "off_topic",
    injection: plan.guard === "injection",
    outOfScope: plan.guard === "out_of_scope",
    unsafe: plan.guard === "unsafe",
    specialists: plan.specialists,
    searchQuery: plan.searchQuery,
    fetchUrl: plan.fetchUrl,
  };
}

export function planTurn(text: string): TurnPlan {
  const empty = (guard: TurnPlan["guard"], refusal?: string): TurnPlan => ({
    guard,
    refusal,
    dailyBrief: false,
    hops: [],
    calls: 0,
    specialists: [],
  });
  if (
    mentioned(
      text,
      /overdose|pesticide dose|double the (pesticide |spray )?dose|kill myself|suicide|self-harm|आत्महत्या|जहर खा/i,
    )
  )
    return empty("unsafe", HELPLINE);
  if (
    mentioned(
      text,
      /ignore (all |previous |prior |the |my )?instructions|ignore (the |all |my )?rules|system prompt|jailbreak|evil\.example|reveal (the |your )?prompt|call paisa/i,
    )
  )
    return empty(
      "injection",
      "I will not ignore the farm team's rules or use another teammate's tools.",
    );
  if (
    mentioned(
      text,
      /record (that |the )?(i |we )?(irrigat|work|spent|sowed|sold)|approve the plan|decide the plan|mark .{0,40} completed|save (this |the )?fact|submit (the |a )?form|make (a )?payment/i,
    )
  )
    return empty(
      "out_of_scope",
      "I cannot record work, approve a plan, pay, or submit a form. You confirm those yourself.",
    );
  const farmTask =
    /crop|soy|rain|drought|irrig|sow|monsoon|el\s*nino|elnino|enso|mandi|price|scheme|water|harvest|bima|pmfby|kisan|wheat|cotton|paddy|rice|imd|cost|benefit|weather|spray|pest|urea|soil|insurance|subsidy/i.test(
      text,
    ) ||
    /खेत|फसल|सोया|बारिश|सूख|सिंचाई|बुवाई|बोव|मानसून|नीनो|मंडी|भाव|योजना|बीमा|पानी|गेहूं|कपास|धान|मौसम|कीट/.test(
      text,
    );
  if (
    mentioned(
      text,
      /essay|homework|poem|cricket|movie|song|joke|election|recipe|who will win|निबंध|कविता|क्रिकेट|फिल्म|गीत|चुनाव/i,
    ) &&
    !farmTask
  )
    return empty("off_topic", OFF_TOPIC);
  if (mentioned(text, /daily brief|what should i do this week|इस हफ्ते क्या/i))
    return {
      guard: "farm",
      dailyBrief: true,
      hops: [["megha", "jal", "kheti", "paisa"]],
      calls: 4,
      specialists: ["megha", "jal", "kheti", "paisa"],
      searchQuery: text.slice(0, 300),
    };
  const elNino = mentioned(
    text,
    /el\s*ni[nñ]o|elnino|enso|अल नीनो|ला नीना|la nina|नीनो/i,
  );
  const sow = mentioned(text, /sow|sowing|बुवाई|बोव|variety|किस्म/i);
  const pay = mentioned(text, /pay|profit|cost|benefit|₹|rupee|रुपय|कमा/i);
  const rain = mentioned(text, /rain|बारिश|forecast|मौसम|weather|imd/i);
  const irrigate = mentioned(text, /irrigat|सिंचाई/i);
  const drought = mentioned(
    text,
    /drought|सूख|dry spell|no rain|कम बारिश|monsoon deficit/i,
  );
  const scheme = mentioned(
    text,
    /scheme|yojana|योजना|pmfby|pm-?kisan|बीमा|insurance|relief|subsidy|pmksy/i,
  );
  const market = mentioned(
    text,
    /market|mandi|price|भाव|मंडी|sell|बेच|quintal|msp/i,
  );
  const crop = mentioned(
    text,
    /pest|disease|yellow leaves|urea|soil health|कीट|खाद/i,
  );
  const fetchUrl = /imd|मौसम विभाग/i.test(text)
    ? "https://mausam.imd.gov.in/"
    : undefined;
  const base = {
    guard: "farm" as const,
    dailyBrief: false,
    searchQuery: text.slice(0, 300),
    fetchUrl,
  };
  if (elNino && sow && pay)
    return {
      ...base,
      hops: [["kheti", "paisa"], ["megha"]],
      calls: 3,
      specialists: ["kheti", "paisa", "megha"],
    };
  if (sow && (rain || mentioned(text, /wait for rain|बारिश का इंतज़ार/i)))
    return {
      ...base,
      hops: [["kheti", "megha"]],
      calls: 2,
      specialists: ["kheti", "megha"],
    };
  if (
    (rain && irrigate) ||
    mentioned(text, /rain or irrigat|irrigate or wait|wait for rain or/i)
  )
    return {
      ...base,
      hops: [["megha", "jal"]],
      calls: 2,
      specialists: ["megha", "jal"],
    };
  const picked: ActiveSpecialist[] = [];
  const add = (key: ActiveSpecialist) => {
    if (!picked.includes(key)) picked.push(key);
  };
  if (drought) {
    add("megha");
    add("jal");
  }
  if (elNino || rain) add("megha");
  if (sow || crop) add("kheti");
  if (irrigate || mentioned(text, /पानी|water/i)) add("jal");
  if (market || pay) add("paisa");
  if (scheme) add("paisa");
  if (!picked.length && farmTask) add("megha");
  const hop1 = picked.slice(0, 2);
  const hop2 = picked.slice(2, 3);
  const hops = [hop1, hop2].filter((round) => round.length > 0);
  return {
    ...base,
    hops,
    calls: hop1.length + hop2.length,
    specialists: [...hop1, ...hop2],
  };
}

export function farmerFacingChecks(
  specialists: readonly ActiveSpecialist[],
): string[] {
  return specialists.map((key) => specialistLabels[key]);
}

export function ensureCited(
  text: string,
  citations: Pick<WebCitation, "title" | "url" | "source" | "fetched_at">[],
): string {
  const missing = citations.filter(
    (item) => item.url && !text.includes(item.url),
  );
  if (!missing.length) return text;
  const lines = missing.map(
    (item) =>
      `- ${item.title} (${item.source}, ${item.fetched_at}) ${item.url}`,
  );
  return `${text.trim()}\n\nSources:\n${lines.join("\n")}`;
}

export type ConsultReply = {
  specialist: string;
  notes: string;
  citations: c.WebCitation[];
  evidence_ids: string[];
  stopped?: string;
  card?: c.TeamCard;
};

export function specialistNote(
  specialist: ActiveSpecialist,
  question: string,
  evidence: { title: string; text: string }[],
  citations: c.WebCitation[],
): string {
  const lines = [`${specialistLabels[specialist]} check: ${question}`];
  for (const item of evidence.slice(0, 3))
    lines.push(`Saved evidence: ${item.title}. ${item.text.slice(0, 240)}`);
  for (const item of citations.slice(0, 3)) {
    const cached =
      item.source === "cache" ? ` Cached on ${item.fetched_at}.` : "";
    lines.push(
      `Source: ${item.title} ${item.url} fetched ${item.fetched_at}.${cached}`,
    );
  }
  if (evidence.length === 0 && citations.length === 0)
    lines.push(
      "No saved evidence or public source was available. I am not sure.",
    );
  return lines.join("\n");
}

export type ConsultLedger = {
  calls: number;
  revisions: number;
  hops: number;
  consulted: string[];
  seen: string[];
  handoffs: string[];
  daily: boolean;
  startedAt: number;
};

export function beginLedger(now = Date.now(), daily = false): ConsultLedger {
  return {
    calls: 0,
    revisions: 0,
    hops: 0,
    consulted: [],
    seen: [],
    handoffs: [],
    daily,
    startedAt: now,
  };
}

export function registerHandoff(ledger: ConsultLedger, specialist: string) {
  const key = canonicalizeSpecialist(specialist);
  if (key && !ledger.handoffs.includes(key)) ledger.handoffs.push(key);
}

/** Synchronous so parallel consults share one budget. */
export function admitConsult(
  ledger: ConsultLedger,
  specialist: string,
  question: string,
  now = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  const canonical = canonicalizeSpecialist(specialist);
  if (!canonical) return { ok: false, reason: "unknown teammate" };
  const seenKey = `${canonical}|${question.trim().toLowerCase()}`;
  if (ledger.seen.includes(seenKey)) return { ok: false, reason: "repeat" };
  if (!ledger.daily && now - ledger.startedAt > TURN_BUDGET_MS)
    return { ok: false, reason: "time" };
  const again = ledger.consulted.includes(canonical);
  if (again) {
    if (!ledger.daily && ledger.revisions >= MAX_REVISIONS)
      return { ok: false, reason: "revision" };
  } else if (!ledger.daily && ledger.calls >= MAX_SPECIALIST_CALLS) {
    return { ok: false, reason: "calls" };
  } else if (
    !ledger.daily &&
    ledger.consulted.length >= 2 &&
    !ledger.handoffs.includes(canonical)
  ) {
    return { ok: false, reason: "hops" };
  }
  ledger.seen.push(seenKey);
  ledger.calls += 1;
  if (again) ledger.revisions += 1;
  else {
    if (ledger.consulted.length >= 2) ledger.hops = MAX_HOPS;
    else if (ledger.hops === 0) ledger.hops = 1;
    ledger.consulted.push(canonical);
  }
  return { ok: true };
}

function words(text: string, max: number) {
  return text.trim().split(/\s+/).filter(Boolean).slice(0, max).join(" ");
}

export function suggestHandoff(
  agent: c.RoleKey,
  question: string,
): { to: ActiveSpecialist; reason: string } | undefined {
  const pay =
    /pay|profit|cost|benefit|₹|rupee|रुपय|scheme|योजना|subsidy|बीमा/i.test(
      question,
    );
  const rain = /rain|बारिश|el\s*nino|elnino|enso|नीनो|forecast|मौसम/i.test(
    question,
  );
  const water = /irrigat|सिंचाई|पानी|water/i.test(question);
  const crop = /sow|sowing|बुवाई|pest|disease|variety|किस्म|फसल|कीट/i.test(
    question,
  );
  if (agent === "megha" && water)
    return { to: "jal", reason: "Water quantity is Jal's lane." };
  if (agent === "megha" && crop)
    return { to: "kheti", reason: "Crop choice is Kheti's lane." };
  if (agent === "jal" && rain && !water)
    return { to: "megha", reason: "The rain outlook is Megha's lane." };
  if (agent === "jal" && pay)
    return { to: "paisa", reason: "Subsidy and cost are Paisa's lane." };
  if (agent === "kheti" && pay)
    return { to: "paisa", reason: "Price and profit are Paisa's lane." };
  if (agent === "kheti" && rain)
    return { to: "megha", reason: "Seasonal rain is Megha's lane." };
  if (agent === "paisa" && rain)
    return { to: "megha", reason: "Weather proof is Megha's lane." };
  if (agent === "paisa" && crop)
    return { to: "kheti", reason: "Crop loss detail is Kheti's lane." };
  return undefined;
}

export function cardFromSources(
  agent: c.RoleKey,
  question: string,
  citations: c.WebCitation[],
  now = new Date().toISOString(),
): TeamCard {
  const cached = citations.some((item) => item.source === "cache");
  const first = citations[0];
  const why = first
    ? `${first.snippet}${cached ? ` Cached on ${first.fetched_at}.` : ""}`
    : "I am not sure. No dated source was retrieved.";
  const handoff = suggestHandoff(agent, question);
  return c.TeamCard.parse({
    agent,
    headline: words(question || "Farm check", 12),
    do: ["Read the cited source before you change water, seed, or a sale."],
    why: words(why, 80),
    risk: "medium",
    confidence: cached || !first ? "low" : "medium",
    sources: first
      ? citations.slice(0, 3).map((item) => ({
          title: item.title,
          url: item.url,
          adapter: item.source,
          fetched_at: item.fetched_at,
        }))
      : [
          {
            title: "No dated source was retrieved",
            adapter: "none",
            fetched_at: now,
          },
        ],
    ...(handoff ? { handoff_suggestion: handoff } : {}),
    reviewed_by: "sakha",
    reviewed: true,
  });
}

export function sakhaReview(card: TeamCard): {
  ok: boolean;
  reasons: string[];
  card: TeamCard;
} {
  const reasons: string[] = [];
  let next: TeamCard = { ...card, reviewed: true, reviewed_by: "sakha" };
  if (!next.sources.length) reasons.push("source");
  const cached = next.sources.some((source) => source.adapter === "cache");
  if (cached && next.confidence !== "low") {
    reasons.push("stale");
    const at = next.sources.find(
      (source) => source.adapter === "cache",
    )?.fetched_at;
    next = {
      ...next,
      confidence: "low",
      why: /cached on/i.test(next.why)
        ? next.why
        : `${next.why} Cached on ${at}.`,
    };
  }
  const count = `${next.why} ${next.do.join(" ")}`
    .split(/\s+/)
    .filter(Boolean).length;
  if (count > 120) {
    reasons.push("length");
    next = { ...next, why: words(next.why, 80) };
  }
  const fixed = reasons.every(
    (reason) => reason === "stale" || reason === "length",
  );
  return {
    ok: reasons.length === 0 || fixed,
    reasons,
    card: c.TeamCard.parse(next),
  };
}

export function mergeCards(cards: TeamCard[]): TeamCard {
  const consulted = cards
    .map((card) => card.agent)
    .filter((agent): agent is ActiveSpecialist => isActiveSpecialist(agent));
  const irrigateNow = cards.some((card) =>
    /irrigate today|irrigate now|आज सिंचाई/i.test(
      `${card.headline} ${card.why} ${card.do.join(" ")}`,
    ),
  );
  const rainSoon = cards.some((card) => /rain|बारिश/i.test(card.why));
  let why = cards.map((card) => card.why).join(" ");
  if (irrigateNow && rainSoon)
    why = `Wait for the cited rain outlook before irrigating. ${why}`;
  const sources = cards.flatMap((card) => card.sources).slice(0, 6);
  return c.TeamCard.parse({
    agent: "sakha",
    headline: words(cards[0]?.headline || "Reviewed farm plan", 12),
    do: cards.flatMap((card) => card.do).slice(0, 3),
    why: words(why, 80),
    risk: cards.some((card) => card.risk === "high")
      ? "high"
      : cards.some((card) => card.risk === "medium")
        ? "medium"
        : "low",
    confidence: cards.some((card) => card.confidence === "low")
      ? "low"
      : "medium",
    sources: sources.length
      ? sources
      : [
          {
            title: "No dated source was retrieved",
            adapter: "none",
            fetched_at: new Date().toISOString(),
          },
        ],
    consulted,
    reviewed: true,
    reviewed_by: "sakha",
  });
}
