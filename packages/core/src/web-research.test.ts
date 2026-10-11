import { expect, it } from "vitest";
import { fetchPage, searchWeb } from "./web-research.js";

const now = () => "2026-10-11T08:00:00Z";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ddgHtml = `<html><body><a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.cpc.ncep.noaa.gov%2Fproducts%2Fanalysis_monitoring%2Fenso_advisory%2Fensodisc.shtml">ENSO discussion</a></body></html>`;

it("uses Tavily first, then Exa, then DuckDuckGo, then cached snippets", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("tavily"))
      return jsonResponse({
        results: [
          {
            title: "Tavily ENSO",
            url: "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml",
            content: "El Niño watch",
          },
        ],
      });
    throw new Error("should not fall through");
  };
  const tavily = await searchWeb("El Niño monsoon", {
    fetch: fetchImpl,
    env: { TAVILY_API_KEY: "tavily-test", EXA_API_KEY: "exa-test" },
    now,
    timeoutMs: 50,
  });
  expect(calls).toEqual(["https://api.tavily.com/search"]);
  expect(tavily[0]).toMatchObject({
    source: "tavily",
    fetched_at: "2026-10-11T08:00:00Z",
  });
  expect(tavily[0]?.url).toMatch(/^https:\/\//);

  calls.length = 0;
  const fetchFallback: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("tavily")) return jsonResponse({ results: [] });
    if (url.includes("exa.ai")) return new Response("no", { status: 401 });
    if (url.includes("duckduckgo"))
      return new Response(ddgHtml, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    return new Response("missing", { status: 404 });
  };
  const ddg = await searchWeb("soybean price", {
    fetch: fetchFallback,
    env: { TAVILY_API_KEY: "tavily-test", EXA_API_KEY: "exa-test" },
    now,
    timeoutMs: 50,
  });
  expect(calls.map((url) => new URL(url).hostname)).toEqual([
    "api.tavily.com",
    "api.exa.ai",
    "lite.duckduckgo.com",
  ]);
  expect(ddg[0]).toMatchObject({
    source: "duckduckgo",
    fetched_at: "2026-10-11T08:00:00Z",
    url: "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml",
  });

  const cached = await searchWeb("drought sowing", {
    fetch: async () => {
      throw new Error("offline");
    },
    env: { SAKHA_EXA_FREE_TIER: "0" },
    now,
    timeoutMs: 20,
  });
  expect(cached.length).toBeGreaterThan(0);
  expect(
    cached.every(
      (item) => item.source === "cache" && item.url.startsWith("https://"),
    ),
  ).toBe(true);
  expect(cached[0]?.fetched_at).toBe("2026-10-11T08:00:00Z");
});

it("stops a hung provider at the timeout and still returns a cached source", async () => {
  const fetchImpl: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    });
  const hits = await searchWeb("irrigation", {
    fetch: fetchImpl,
    env: { TAVILY_API_KEY: "t", EXA_API_KEY: "e" },
    now,
    timeoutMs: 15,
  });
  expect(hits[0]?.source).toBe("cache");
  expect(hits[0]?.url).toMatch(/^https:\/\//);
});

it("fetches an allowlisted page and refuses anything else before the network", async () => {
  let called = 0;
  const fetchImpl: typeof fetch = async () => {
    called += 1;
    return new Response(
      "<title>IMD district</title><p>Light rain is possible.</p>",
      {
        status: 200,
        headers: { "content-type": "text/html" },
      },
    );
  };
  await expect(
    fetchPage("https://evil.example/secret", { fetch: fetchImpl, now }),
  ).rejects.toThrow(/not permitted/);
  await expect(
    fetchPage("http://mausam.imd.gov.in/", { fetch: fetchImpl, now }),
  ).rejects.toThrow(/HTTPS/);
  expect(called).toBe(0);
  const page = await fetchPage("https://mausam.imd.gov.in/warning", {
    fetch: fetchImpl,
    now,
    timeoutMs: 50,
  });
  expect(called).toBe(1);
  expect(page).toMatchObject({
    source: "mausam.imd.gov.in",
    fetched_at: "2026-10-11T08:00:00Z",
    title: "IMD district",
  });
  expect(page.url).toBe("https://mausam.imd.gov.in/warning");
  expect(page.snippet).toContain("Light rain");
});
