import { expect, it } from "vitest";
import { authorize } from "./index.js";

it("actual Cedar denies foreign farm, missing private grant and farmer decision impersonation before effects", () => {
  const principal = {
    kind: "agent" as const,
    id: "run:water",
    farmId: "a",
    roleKey: "water" as const,
    runId: "run",
  };
  let effects = 0;
  authorize(principal, "read", { id: "record", farmId: "a" }, true);
  effects++;
  expect(() => {
    authorize(principal, "read", { id: "record", farmId: "b" }, true);
    effects++;
  }).toThrow("not permitted");
  expect(() =>
    authorize(
      principal,
      "read",
      { id: "record", farmId: "a", private: true },
      true,
      false,
    ),
  ).toThrow("not permitted");
  expect(() =>
    authorize(principal, "record_work", { id: "record", farmId: "a" }, true),
  ).toThrow("not permitted");
  expect(() =>
    authorize(principal, "decide_plan", { id: "record", farmId: "a" }, true),
  ).toThrow("not permitted");
  expect(() =>
    authorize(
      principal,
      "invented_action",
      { id: "record", farmId: "a" },
      true,
    ),
  ).toThrow("not permitted");
  expect(effects).toBe(1);
});
