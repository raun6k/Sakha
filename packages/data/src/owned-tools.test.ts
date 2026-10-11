import { describe, expect, it } from "vitest";
import { loadDemoCache } from "./adapters.js";
import {
  cropStageFromFacts,
  ensoReading,
  forecastReading,
  irrigateOrWait,
  mandiReading,
  mspReading,
} from "./owned-tools.js";

describe("owned adapter tools", () => {
  const cache = loadDemoCache();

  it("gives Megha the forecast and the El Niño anomaly", () => {
    const forecast = forecastReading(cache);
    const enso = ensoReading(cache);
    expect(forecast.rain_7d_mm).toBe(cache.brief.forecast_rain_7d_mm);
    expect(forecast.et0_7d_mm).toBe(cache.brief.forecast_et0_7d_mm);
    expect(forecast.days.length).toBeGreaterThan(0);
    expect(enso.phase).toBe("El Niño");
    expect(enso.anomaly_c).toBe(cache.brief.oni_anom_c);
    expect(enso.anomaly_c).toBeGreaterThanOrEqual(0.5);
  });

  it("lets Jal compare rain with ET0 and keep a drying crop waiting", () => {
    const drying = irrigateOrWait(cache, "Pods drying");
    expect(drying.action).toBe("wait");
    expect(drying.mm).toBe(0);
    expect(drying.rain_7d_mm).toBe(cache.brief.forecast_rain_7d_mm);
    expect(drying.et0_7d_mm).toBe(cache.brief.forecast_et0_7d_mm);
    const growing = irrigateOrWait(
      {
        ...cache,
        brief: { ...cache.brief, forecast_rain_7d_mm: 2, forecast_et0_7d_mm: 18 },
      },
      "Flowering",
    );
    expect(growing.action).toBe("irrigate");
    expect(growing.mm).toBe(16);
  });

  it("reads Kheti's stage from farm facts", () => {
    const stage = cropStageFromFacts(
      [
        { key: "current_crop", value: "Soybean" },
        { key: "crop_stage", value: "Pods drying" },
        { key: "sowing_date", value: "2026-06-20" },
      ],
      "2026-10-11",
    );
    expect(stage).toMatchObject({
      crop: "Soybean",
      stage: "Pods drying",
      sowing_date: "2026-06-20",
    });
    expect(stage.day).toBeGreaterThan(100);
  });

  it("gives Paisa the mandi modal and the MSP", () => {
    const mandi = mandiReading(cache);
    const msp = mspReading(cache);
    expect(mandi.modal_inr).toBe(6175);
    expect(mandi.market).toBe("Nagpur APMC");
    expect(msp.msp_inr).toBe(5708);
  });
});
