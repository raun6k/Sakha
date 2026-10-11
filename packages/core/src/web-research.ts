import * as c from "@sakha/contracts";
import { DomainError } from "@sakha/farm";

/** Public suffixes Sakha may fetch. Keep this list identical to policies/sakha-v1.cedar. */
export const FETCH_DOMAINS = [
  "imd.gov.in",
  "icar.org.in",
  "icar.gov.in",
  "agricoop.nic.in",
  "agricoop.gov.in",
  "pib.gov.in",
  "data.gov.in",
  "nic.in",
  "cpc.ncep.noaa.gov",
  "noaa.gov",
  "open-meteo.com",
  "nasa.gov",
  "pmfby.gov.in",
  "pmkisan.gov.in",
  "agmarknet.gov.in",
  "enam.gov.in",
  "gov.in",
  "farmer.gov.in",
  "india.gov.in",
  "isric.org",
  "weather.gov",
] as const;

const CACHE_CAPTURED_AT = "2026-10-11T06:30:00Z";

const CACHED_SNIPPETS: {
  keywords: string[];
  title: string;
  url: string;
  snippet: string;
}[] = [
  {
    keywords: [
      "el nino",
      "elnino",
      "enso",
      "al nino",
      "नीनो",
      "monsoon",
      "मानसून",
    ],
    title: "NOAA ENSO diagnostic discussion",
    url: "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml",
    snippet:
      "NOAA CPC publishes the El Niño / Southern Oscillation status. A warm Niño3.4 anomaly is the public signal Sakha cites before changing a sowing or water plan.",
  },
  {
    keywords: [
      "drought",
      "सूख",
      "dry",
      "rain",
      "बारिश",
      "forecast",
      "मौसम",
      "imd",
    ],
    title: "India Meteorological Department",
    url: "https://mausam.imd.gov.in/",
    snippet:
      "IMD publishes district forecasts and rainfall warnings. Use the local outlook beside the seasonal El Niño signal; a dry week is not the same as a failed monsoon.",
  },
  {
    keywords: [
      "rain",
      "forecast",
      "irrigation",
      "सिंचाई",
      "पानी",
      "open-meteo",
      "temperature",
    ],
    title: "Open-Meteo 7-day forecast",
    url: "https://api.open-meteo.com/v1/forecast",
    snippet:
      "Open-Meteo provides keyless daily rain, temperature and reference evapotranspiration for a farm coordinate. Treat it as a forecast, not a rain-gauge reading.",
  },
  {
    keywords: [
      "sow",
      "sowing",
      "बुवाई",
      "बोव",
      "variety",
      "crop",
      "फसल",
      "soy",
      "सोया",
    ],
    title: "ICAR crop guidance",
    url: "https://www.icar.org.in/",
    snippet:
      "ICAR publishes crop and contingency guidance. A short-duration variety is a proposal until the farmer's water, seed and sowing window are known.",
  },
  {
    keywords: [
      "scheme",
      "yojana",
      "योजना",
      "insurance",
      "बीमा",
      "pmfby",
      "kisan",
      "relief",
    ],
    title: "Pradhan Mantri Fasal Bima Yojana",
    url: "https://pmfby.gov.in/",
    snippet:
      "PMFBY is the public crop insurance scheme. Sakha can point to the official page and checklist; it cannot confirm that this farmer is enrolled or will be paid.",
  },
  {
    keywords: ["scheme", "subsidy", "pib", "government", "योजना", "relief"],
    title: "Press Information Bureau",
    url: "https://www.pib.gov.in/",
    snippet:
      "PIB carries official scheme announcements. Quote the notice and its date; do not turn a press note into a promise of money.",
  },
  {
    keywords: [
      "market",
      "mandi",
      "price",
      "भाव",
      "मंडी",
      "sell",
      "बेच",
      "soybean",
      "quintal",
    ],
    title: "data.gov.in Agmarknet prices",
    url: "https://data.gov.in/",
    snippet:
      "Agmarknet mandi prices are published through data.gov.in as min, max and modal rupees per quintal for a commodity, market and arrival date.",
  },
  {
    keywords: ["irrigation", "water", "सिंचाई", "पानी", "drought", "agricoop"],
    title: "Department of Agriculture and Farmers Welfare",
    url: "https://agricoop.nic.in/",
    snippet:
      "Agricoop publishes national agriculture guidance, including contingency advice when rainfall is late. Local water still has to be measured on the farm.",
  },
];

export type WebEnv = Record<string, string | undefined>;

export type WebDeps = {
  fetch?: typeof fetch;
  env?: WebEnv;
  now?: () => string;
  timeoutMs?: number;
};

export function domainAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".local")) return false;
  if (host.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return FETCH_DOMAINS.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

function citation(
  input: {
    url: string;
    title: string;
    snippet: string;
    source: string;
  },
  fetchedAt: string,
): c.WebCitation | undefined {
  const parsed = c.WebCitation.safeParse({
    url: input.url,
    title: input.title.slice(0, 300) || input.url,
    snippet: (input.snippet || input.title)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1500),
    source: input.source,
    fetched_at: fetchedAt,
  });
  return parsed.success ? parsed.data : undefined;
}

function cachedSnippets(query: string, fetchedAt: string): c.WebCitation[] {
  const hay = query.toLowerCase();
  const ranked = CACHED_SNIPPETS.map((item) => ({
    item,
    score: item.keywords.filter((keyword) => hay.includes(keyword)).length,
  }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  const chosen = (
    ranked.length ? ranked : CACHED_SNIPPETS.map((item) => ({ item, score: 0 }))
  ).slice(0, 3);
  return chosen.flatMap(({ item }) => {
    const hit = citation(
      {
        url: item.url,
        title: item.title,
        snippet: item.snippet,
        source: "cache",
      },
      fetchedAt || CACHE_CAPTURED_AT,
    );
    return hit ? [hit] : [];
  });
}

async function withTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<T>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () =>
            reject(Object.assign(new Error("timeout"), { name: "AbortError" })),
          { once: true },
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function tavily(
  query: string,
  key: string,
  fetchedAt: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<c.WebCitation[]> {
  const response = await withTimeout(timeoutMs, (signal) =>
    fetchImpl("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: false,
        country: "india",
      }),
      signal,
    }),
  );
  const body = (await readJson(response)) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  return (body.results ?? []).flatMap((row) => {
    if (!row.url) return [];
    const hit = citation(
      {
        url: row.url,
        title: row.title || row.url,
        snippet: row.content || row.title || row.url,
        source: "tavily",
      },
      fetchedAt,
    );
    return hit ? [hit] : [];
  });
}

async function exa(
  query: string,
  key: string | undefined,
  fetchedAt: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<c.WebCitation[]> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (key) headers["x-api-key"] = key;
  const response = await withTimeout(timeoutMs, (signal) =>
    fetchImpl("https://api.exa.ai/search", {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        numResults: 5,
        contents: { highlights: { maxCharacters: 400 } },
      }),
      signal,
    }),
  );
  const body = (await readJson(response)) as {
    results?: {
      title?: string;
      url?: string;
      highlights?: string[];
      text?: string;
    }[];
  };
  return (body.results ?? []).flatMap((row) => {
    if (!row.url) return [];
    const hit = citation(
      {
        url: row.url,
        title: row.title || row.url,
        snippet: row.highlights?.join(" ") || row.text || row.title || row.url,
        source: "exa",
      },
      fetchedAt,
    );
    return hit ? [hit] : [];
  });
}

function linksFromDuckDuckGo(html: string): { url: string; title: string }[] {
  const found: { url: string; title: string }[] = [];
  for (const match of html.matchAll(
    /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const raw = match[1] ?? "";
    const encoded = raw.match(/[?&]uddg=([^&"]+)/i)?.[1];
    let href = encoded
      ? decodeURIComponent(encoded)
      : raw.replaceAll("&amp;", "&");
    try {
      href = new URL(href, "https://lite.duckduckgo.com").toString();
    } catch {
      continue;
    }
    if (!/^https:\/\//i.test(href) || href.includes("duckduckgo.com")) continue;
    const title = (match[2] ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!title) continue;
    found.push({ url: href, title: title.slice(0, 300) });
    if (found.length >= 5) break;
  }
  return found;
}

async function duckDuckGo(
  query: string,
  fetchedAt: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<c.WebCitation[]> {
  const response = await withTimeout(timeoutMs, (signal) =>
    fetchImpl("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ q: query }).toString(),
      signal,
    }),
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  return linksFromDuckDuckGo(html).flatMap((row) => {
    const hit = citation(
      {
        url: row.url,
        title: row.title,
        snippet: row.title,
        source: "duckduckgo",
      },
      fetchedAt,
    );
    return hit ? [hit] : [];
  });
}

async function firstHits(
  run: () => Promise<c.WebCitation[]>,
): Promise<c.WebCitation[] | undefined> {
  try {
    const hits = await run();
    return hits.length ? hits : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Search order: Tavily when TAVILY_API_KEY is set, then Exa (key or free tier),
 * then keyless DuckDuckGo, then committed snippets. Each live call stops at 10s.
 */
export async function searchWeb(
  query: string,
  deps: WebDeps = {},
): Promise<c.WebCitation[]> {
  const text = query.trim();
  if (!text) throw new DomainError("validation", "Search needs a question");
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetch ?? fetch;
  const fetchedAt = (deps.now ?? (() => new Date().toISOString()))();
  const timeoutMs = deps.timeoutMs ?? 10_000;
  if (env.TAVILY_API_KEY) {
    const hits = await firstHits(() =>
      tavily(text, env.TAVILY_API_KEY ?? "", fetchedAt, timeoutMs, fetchImpl),
    );
    if (hits) return hits;
  }
  const tryExa = Boolean(env.EXA_API_KEY) || env.SAKHA_EXA_FREE_TIER !== "0";
  if (tryExa) {
    const hits = await firstHits(() =>
      exa(text, env.EXA_API_KEY, fetchedAt, timeoutMs, fetchImpl),
    );
    if (hits) return hits;
  }
  const ddg = await firstHits(() =>
    duckDuckGo(text, fetchedAt, timeoutMs, fetchImpl),
  );
  if (ddg) return ddg;
  return cachedSnippets(text, fetchedAt);
}

function htmlText(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    title: title.replace(/\s+/g, " ").trim().slice(0, 300),
    text: text.slice(0, 1500),
  };
}

/** Fetch one HTTPS page on the agriculture and weather allowlist. */
export async function fetchPage(
  url: string,
  deps: WebDeps = {},
): Promise<c.WebCitation> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw new DomainError("validation", "Page address is not a URL");
  }
  if (current.protocol !== "https:" || current.username || current.password)
    throw new DomainError(
      "permission_denied",
      "Only public HTTPS pages can be fetched",
    );
  if (!domainAllowed(current.hostname))
    throw new DomainError(
      "permission_denied",
      `Cedar denied fetch_page. The scoped operation is not permitted`,
    );
  const fetchImpl = deps.fetch ?? fetch;
  const fetchedAt = (deps.now ?? (() => new Date().toISOString()))();
  const timeoutMs = deps.timeoutMs ?? 10_000;
  let response: Response | undefined;
  for (let hop = 0; hop < 3; hop++) {
    response = await withTimeout(timeoutMs, (signal) =>
      fetchImpl(current.toString(), {
        method: "GET",
        redirect: "manual",
        headers: { accept: "text/html,application/json;q=0.9" },
        signal,
      }),
    );
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location) break;
    const next = new URL(location, current);
    if (next.protocol !== "https:" || !domainAllowed(next.hostname))
      throw new DomainError(
        "permission_denied",
        "Cedar denied fetch_page. The scoped operation is not permitted",
      );
    current = next;
  }
  if (!response?.ok)
    throw new DomainError("unavailable", "The public page did not load", true);
  const body = await response.text();
  const page = htmlText(body.slice(0, 500_000));
  const hit = citation(
    {
      url: current.toString(),
      title: page.title || current.hostname,
      snippet: page.text || page.title || current.hostname,
      source: current.hostname,
    },
    fetchedAt,
  );
  if (!hit)
    throw new DomainError(
      "unavailable",
      "The public page had no usable text",
      true,
    );
  return hit;
}
