import { actualLedger } from "@sakha/farm";
import { afterEach, expect, it } from "vitest";
import { createApp } from "./app.js";
import { initializeDemo, resetDemo, seedDemo } from "./demo.js";

const apps: ReturnType<typeof createApp>[] = [];
const context = () => {
  const s = createApp({
    databasePath: ":memory:",
    origin: "http://localhost:80",
  });
  apps.push(s);
  return s;
};
afterEach(async () => {
  for (const s of apps.splice(0)) await s.app.close();
});
it("seeds a coherent demo once without inventing external evidence", () => {
  const s = context();
  const farm = initializeDemo(s);
  expect(initializeDemo(s).id).toBe(farm.id);
  expect(s.farm.listFacts(farm.id)).toHaveLength(11);
  const plan = s.domain.plan(farm.id);
  expect(plan.active_revision?.status).toBe("approved");
  expect(plan.proposed_revisions).toHaveLength(0);
  expect(plan.active_revision?.title).toMatch(/soybean/i);
  expect(
    s.store
      .list("task", farm.id)
      .map((t) => (t as { status: string }).status)
      .sort(),
  ).toEqual(["pending", "pending", "pending"]);
  expect(s.store.list("activity", farm.id)).toHaveLength(2);
  expect(actualLedger(s.store, farm.id).water_m3).toBe(0);
  expect(s.store.list("evidence", farm.id)).toHaveLength(0);
});
it("serves the seeded team on the home screen", async () => {
  const s = context();
  const seeded = await seedDemo(s, { live: false });
  const home = await s.app.inject({
    url: `/api/v1/farms/${seeded.profile.id}/home`,
    headers: { "x-sakha-session": s.sessionToken },
  });
  expect(home.statusCode).toBe(200);
  const body = home.json().data;
  expect(body.farm.location.village).toBe("Kalmeshwar");
  expect(body.farm.name).toBe("Kavita Meshram");
  expect(body.team_status).toHaveLength(5);
  expect(body.sections.weather[0].title).toContain("mm");
  expect(body.sections.climate[0].title).toContain("El Niño");
  expect(body.sections.plan.active_revision.summary).toContain("₹");
  expect(body.sections.plan.active_revision.cost_inr).toBeGreaterThan(0);
  const team = await s.app.inject({
    url: `/api/v1/farms/${seeded.profile.id}/team`,
    headers: { "x-sakha-session": s.sessionToken },
  });
  expect(team.statusCode).toBe(200);
  const mates = team.json().data as {
    id: string;
    role_line: string;
    status_line: string;
  }[];
  expect(mates.map((mate) => mate.id)).toEqual([
    "sakha",
    "megha",
    "jal",
    "kheti",
    "paisa",
  ]);
  const megha = mates.find((mate) => mate.id === "megha");
  const paisa = mates.find((mate) => mate.id === "paisa");
  expect(megha?.status_line).toContain("1.3 mm");
  expect(megha?.status_line).toContain("El Niño +2.16");
  expect(megha?.status_line).not.toContain("El Niño: El Niño");
  expect(megha?.role_line.length).toBeGreaterThan(20);
  expect(paisa?.status_line).toContain("₹6,175/qtl");
  expect(paisa?.status_line).toContain("MSP ₹5,708");
  const roleKeys = new Set(
    s.store
      .list("message", seeded.profile.id)
      .map((row) => (row as { role_key: string }).role_key),
  );
  expect([...roleKeys].sort()).toEqual([
    "jal",
    "kheti",
    "megha",
    "paisa",
    "sakha",
  ]);
  const messages = s.store.list("message", seeded.profile.id).map(
    (row) =>
      row as {
        author: string;
        card?: { sources?: unknown[] };
        reviewed_by?: string;
      },
  );
  const replies = messages.filter((row) => row.author === "agent");
  expect(replies.length).toBeGreaterThanOrEqual(15);
  expect(replies.every((row) => row.reviewed_by === "sakha")).toBe(true);
  expect(replies.every((row) => (row.card?.sources?.length ?? 0) >= 1)).toBe(
    true,
  );
});
it("refuses seeding or resetting a normal installation", () => {
  const s = context();
  s.farm.execute("createFarm", { name: "Real farm" }, {});
  expect(() => initializeDemo(s)).toThrow("separate empty database");
  expect(() => resetDemo(s)).toThrow("marked dedicated demo");
});
it("resets only the marked dedicated demo and refuses additional farms", () => {
  const s = context();
  const original = initializeDemo(s);
  const restored = resetDemo(s);
  expect(restored.id).not.toBe(original.id);
  expect(s.store.list("farm", original.id)).toHaveLength(0);
  expect(s.store.list("activity", restored.id)).toHaveLength(2);
  s.farm.execute("createFarm", { name: "Additional farm" }, {});
  expect(() => resetDemo(s)).toThrow("additional farms");
});
