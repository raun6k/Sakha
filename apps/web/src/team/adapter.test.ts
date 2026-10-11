import { describe, expect, it } from "vitest";
import { createFixtureService } from "../services/fixture";
import {
  buildTeam,
  cardFromAnswer,
  consultedFromSources,
  parseCard,
  rupeeText,
} from "./adapter";

describe("team charter adapter", () => {
  it("builds status lines, colors and roles from the charter", async () => {
    const home = await createFixtureService().execute("getHome", {
      params: { farmId: "fixture-farm" },
      input: {},
    });
    const team = buildTeam(home, "en");
    expect(team.map((mate) => mate.name)).toEqual([
      "Sakha",
      "Megha",
      "Jal",
      "Kheti",
      "Paisa",
    ]);
    expect(team.find((mate) => mate.id === "sakha")?.color).toBe("#1F6F43");
    expect(team.find((mate) => mate.id === "megha")?.status).toMatch(
      /^🌧 \d+ mm next 7 days · monsoon reading is on the way · no alerts$/,
    );
    expect(team.find((mate) => mate.id === "megha")?.status).not.toContain(
      "El Niño: El Niño",
    );
    expect(team.find((mate) => mate.id === "jal")?.status).toBe(
      "💧 Wait · next water: not needed",
    );
    expect(team.find((mate) => mate.id === "kheti")?.status).toBe(
      "🌱 crop · Getting ready to sow · watch: field check",
    );
    expect(team.find((mate) => mate.id === "paisa")?.status).toBe(
      "₹ crop mandi price and MSP are on the team strip",
    );
    expect(team.find((mate) => mate.id === "kheti")?.role).toBe(
      "Your crop doctor and agronomist.",
    );
  });

  it("reads a shared card, rupee ranges and consulted teammates", () => {
    const parsed = parseCard(
      JSON.stringify({
        agent: "jal",
        headline: "Wait for Thursday rain",
        do: ["Hold irrigation until Friday"],
        why: "Rain is on the way.",
        cost_inr_low: 0,
        cost_inr_high: 180,
        benefit_inr: 400,
        risk: "low",
        confidence: "medium",
        sources: [
          { title: "IMD weather", fetched_at: "2026-10-11T00:00:00.000Z" },
        ],
        consulted: ["megha"],
      }),
    );
    expect(parsed?.reviewed_by).toBe("sakha");
    expect(parsed?.do).toEqual(["Hold irrigation until Friday"]);
    expect(rupeeText(undefined, 0, 180, "en")).toContain("–");
    expect(rupeeText(400, undefined, undefined, "en")).toMatch(/400/);
    expect(rupeeText(undefined, undefined, undefined, "en")).toBe(
      "Not known yet",
    );
    expect(consultedFromSources(["W04", "A01", "M01"])).toEqual([
      "megha",
      "kheti",
      "paisa",
    ]);
    const card = cardFromAnswer({
      text: "Walk the soybean plots this week.\n- Check pods\n- Keep tarpaulin ready",
      agent: "kheti",
      evidence: [{ source_id: "A01" }],
      createdAt: "2026-10-11T00:00:00.000Z",
      lang: "en",
    });
    expect(card.reviewed_by).toBe("sakha");
    expect(card.consulted).toContain("kheti");
    expect(card.do).toEqual(["Check pods", "Keep tarpaulin ready"]);
    expect(card.sources[0]?.title).toBeTruthy();
  });
});
