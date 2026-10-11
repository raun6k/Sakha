import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertSourceUrl,
  buildHarvestRecommendation,
  loadDemoCache,
  parseAgmarknet,
  parseOni,
  parseOpenMeteoDaily,
  refreshDemoCache,
} from "./index.js";

describe("live adapters", () => {
  it("reads the committed 11 Oct 2026 cache without calling the network", () => {
    const cache = loadDemoCache();
    expect(cache.forecast.source.live).toBe(false);
    expect(cache.brief.enso_phase).toBe("El Niño");
    expect(cache.brief.oni_anom_c).toBe(2.16);
    expect(cache.brief.forecast_rain_7d_mm).toBeLessThan(5);
    expect(cache.brief.market_live).toBe(false);
    const recommendation = cache.recommendation;
    expect(recommendation.quintals).toBe(
      Math.round(cache.brief.soybean_ha * cache.brief.yield_q_per_ha * 10) / 10,
    );
    expect(recommendation.cost_inr).toBe(
      Math.round(3500 * cache.brief.soybean_ha),
    );
    expect(recommendation.benefit_inr).toBe(
      Math.round(
        (cache.brief.modal_inr - cache.brief.min_inr) * recommendation.quintals,
      ),
    );
    expect(recommendation.benefit_inr).toBeGreaterThan(0);
    expect(cache.msp.data.msp_inr_per_quintal).toBe(5708);
  });
  it("does not hand the Nagpur forecast to another Indian farm", () => {
    expect(() => loadDemoCache({ latitude: 18.52, longitude: 73.85 })).toThrow(
      /cache/,
    );
    expect(() => loadDemoCache({ latitude: 1, longitude: 1 })).toThrow(/India/);
  });
  it("allows the new public hosts and keeps the recorded parsers", () => {
    expect(
      assertSourceUrl("https://api.open-meteo.com/v1/forecast").hostname,
    ).toBe("api.open-meteo.com");
    expect(
      assertSourceUrl("https://archive-api.open-meteo.com/v1/archive").hostname,
    ).toBe("archive-api.open-meteo.com");
    expect(
      assertSourceUrl(
        "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070",
      ).hostname,
    ).toBe("api.data.gov.in");
    expect(
      assertSourceUrl("https://power.larc.nasa.gov/api/temporal/daily/point")
        .hostname,
    ).toBe("power.larc.nasa.gov");
    const forecast = parseOpenMeteoDaily(
      JSON.parse(
        readFileSync(
          new URL("../cache/open-meteo-forecast.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    expect(forecast.days[0]?.date).toBe("2026-10-11");
    expect(forecast.days[0]?.rain_mm).toBe(0);
    const oni = parseOni("JAS 2026 29.12 2.16\n");
    expect(oni.at(-1)?.anomaly_c).toBe(2.16);
    const quotes = parseAgmarknet({
      records: [
        {
          state: "Maharashtra",
          district: "Nagpur",
          market: "Nagpur APMC",
          commodity: "Soyabean",
          arrival_date: "07/10/2026",
          min_price: "5500",
          modal_price: "6175",
          max_price: "6400",
        },
      ],
    });
    expect(quotes[0]?.modal_inr).toBe(6175);
    expect(quotes[0]?.date).toBe("2026-10-07");
  });
  it("uses the committed cache when every live fetch fails", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error("offline"));
    try {
      const cache = await refreshDemoCache();
      expect(cache.forecast.source.live).toBe(false);
      expect(cache.oni.data.latest.anomaly_c).toBe(2.16);
      expect(cache.market.source.live).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });
  it("keeps the harvest figures tied to the same inputs", () => {
    const result = buildHarvestRecommendation({
      soybean_ha: 1.6,
      yield_q_per_ha: 12,
      labour_inr_per_ha: 3500,
      forecast_rain_mm_7d: 1.3,
      forecast_et0_mm_7d: 33.8,
      market: "Nagpur APMC",
      price_date: "2026-10-07",
      min_inr: 5500,
      modal_inr: 6175,
      max_inr: 6400,
      msp_inr: 5708,
      enso_phase: "El Niño",
      oni_season: "JAS 2026",
      oni_anom_c: 2.16,
      market_live: false,
    });
    expect(result.quintals).toBe(19.2);
    expect(result.cost_inr).toBe(5600);
    expect(result.benefit_inr).toBe(12960);
    expect(result.premium_over_msp_inr).toBe(8966);
    expect(result.borewell_held_m3).toBe(520);
  });
});
