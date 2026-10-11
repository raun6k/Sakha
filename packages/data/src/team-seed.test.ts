import { describe, expect, it } from "vitest";
import { loadDemoCache } from "./adapters.js";
import { buildTeamSeed, TEAM } from "./team-seed.js";

function words(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function sentences(value: string) {
  return value
    .split(/(?<!\d)[.!?](?!\d)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

describe("team charter seed", () => {
  const cache = loadDemoCache();

  it("stores the five role ids and no older directory", () => {
    expect(TEAM.map((member) => member.id)).toEqual([
      "sakha",
      "megha",
      "jal",
      "kheti",
      "paisa",
    ]);
    const seed = buildTeamSeed(cache);
    expect(seed.roles).toEqual({
      sakha: "sakha",
      megha: "megha",
      jal: "jal",
      kheti: "kheti",
      paisa: "paisa",
    });
    expect(seed.findings.map((item) => item.role_key)).toEqual([
      "megha",
      "megha",
      "sakha",
    ]);
    expect(JSON.stringify(seed)).not.toMatch(
      /chief_of_staff|crop_planning|farm_finance|government_support/,
    );
  });

  it("shapes memory, status lines and cards from the cached readings", () => {
    const seed = buildTeamSeed(cache);
    const keys = seed.memory.map((item) => item.key);
    for (const key of [
      "profile.district",
      "profile.lat",
      "profile.lon",
      "profile.crop",
      "profile.sowing_date",
      "profile.stage",
      "profile.acres",
      "profile.water_source",
      "profile.budget_inr",
      "profile.language",
      "plan.current",
      "plan.history",
      "decisions",
      "megha.last_forecast",
      "megha.enso_state",
      "megha.season_rain_mm",
      "megha.alerts_sent",
      "jal.water_source",
      "jal.pump_hp",
      "jal.last_irrigation_date",
      "jal.method",
      "jal.irrigation_log",
      "kheti.crop",
      "kheti.variety",
      "kheti.sowing_date",
      "kheti.stage",
      "kheti.soil_card",
      "kheti.issues_log",
      "paisa.nearest_mandis",
      "paisa.price_history",
      "paisa.enrolled_schemes",
      "paisa.costs_this_season",
      "paisa.stored_qty_qtl",
    ])
      expect(keys).toContain(key);
    expect(
      seed.memory.every((item) => item.text.startsWith(`${item.key}:`)),
    ).toBe(true);
    const lines = Object.fromEntries(
      seed.statuses.map((status) => [status.id, status.line]),
    );
    expect(lines.sakha).toMatch(/^3 actions this week · top: /);
    expect(lines.megha).toContain(
      `${cache.brief.forecast_rain_7d_mm} mm next 7 days`,
    );
    expect(lines.megha).toContain(
      `El Niño +${cache.brief.oni_anom_c} °C`,
    );
    expect(lines.megha).not.toContain("El Niño: El Niño");
    expect(lines.megha).toContain("no alerts");
    expect(lines.jal).toContain("Wait");
    expect(lines.jal).toContain(`${cache.brief.forecast_rain_7d_mm} mm rain`);
    expect(lines.jal).not.toMatch(/—|not measured/);
    expect(lines.kheti).toMatch(
      /^🌱 Soybean day \d+ · pods drying · watch: no pest reported$/,
    );
    expect(lines.paisa).toContain("₹6,175/qtl at Nagpur APMC");
    expect(lines.paisa).toContain("cached");
    expect(lines.paisa).toContain("MSP ₹5,708");
    expect(lines.jal).not.toMatch(/\d+%/);
    const primaries = seed.threads.filter(
      (thread) => thread.kind === "primary",
    );
    expect(primaries.map((thread) => thread.team_id)).toEqual([
      "sakha",
      "megha",
      "jal",
      "kheti",
      "paisa",
    ]);
    for (const thread of primaries) {
      const exchanges = thread.messages.length / 2;
      expect(exchanges).toBeGreaterThanOrEqual(3);
      expect(exchanges).toBeLessThanOrEqual(5);
    }
    const consults = seed.threads.filter((thread) => thread.kind === "consult");
    expect(consults.length).toBeGreaterThanOrEqual(1);
    expect(consults.length).toBeLessThanOrEqual(2);
    const replies = seed.threads.flatMap((thread) =>
      thread.messages.filter((message) => message.author === "agent"),
    );
    expect(replies.every((message) => message.reviewed_by === "sakha")).toBe(
      true,
    );
    for (const message of replies) {
      const value = message.card;
      expect(value).toBeTruthy();
      if (!value) continue;
      expect(words(value.headline)).toBeLessThanOrEqual(12);
      expect(sentences(value.why).length).toBeLessThanOrEqual(2);
      expect(value.sources.length).toBeGreaterThanOrEqual(1);
      expect(
        value.sources.every((source) =>
          Number.isFinite(Date.parse(source.fetched_at)),
        ),
      ).toBe(true);
    }
    const weekly = seed.threads[0]?.messages[1];
    expect(weekly?.consulted).toEqual(["megha", "jal", "kheti", "paisa"]);
    for (const thread of consults)
      for (const message of thread.messages)
        if (message.author === "agent") {
          expect(message.consulted?.length).toBeGreaterThanOrEqual(1);
          expect(message.consulted?.length).toBeLessThanOrEqual(2);
        }
    const megha = replies.find((message) => message.card?.forecast_days);
    expect(megha?.card?.forecast_days?.[0]?.date).toBe(
      cache.brief.forecast_from,
    );
    const jal = replies.find((message) => message.card?.agent === "jal");
    expect(jal?.card?.action).toBe("wait");
    expect(jal?.card?.mm).toBe(0);
    expect(jal?.card?.pump_hours).toBeUndefined();
    const paisa = replies.find(
      (message) => message.card?.agent === "paisa" && message.card.prices,
    );
    expect(paisa?.card?.cost_inr).toBe(cache.recommendation.cost_inr);
    expect(paisa?.card?.benefit_inr).toBe(cache.recommendation.benefit_inr);
    expect(
      paisa?.card?.prices?.some((price) => price.mandi === "Nagpur APMC"),
    ).toBe(true);
    const joke = replies.find((message) => message.card?.out_of_scope);
    expect(joke?.text).toMatch(/farm/);
    expect(JSON.stringify(replies)).not.toMatch(/\bRONI\b/);
    expect(JSON.stringify(replies)).not.toMatch(/grid point/);
  });
});
