import { actualLedger } from "@sakha/farm";
import { afterEach, expect, it } from "vitest";
import { createApp } from "./app.js";
import { initializeDemo, resetDemo } from "./demo.js";

const apps: ReturnType<typeof createApp>[] = [];
const context = () => {
  const s = createApp({ databasePath: ":memory:" });
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
  expect(s.farm.listFacts(farm.id)).toHaveLength(10);
  const plan = s.domain.plan(farm.id);
  expect(plan.active_revision?.status).toBe("approved");
  expect(plan.proposed_revisions).toHaveLength(1);
  expect(
    s.store
      .list("task", farm.id)
      .map((t) => (t as { status: string }).status)
      .sort(),
  ).toEqual(["completed", "pending", "pending"]);
  expect(s.store.list("activity", farm.id)).toHaveLength(2);
  expect(actualLedger(s.store, farm.id).water_m3).toBe(0);
  expect(s.store.list("evidence", farm.id)).toHaveLength(0);
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
