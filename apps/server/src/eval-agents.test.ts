import { expect, it } from "vitest";
import { runMockEval } from "./eval-agents.js";

it("runs the farmer prompt suite without a live model", () => {
  expect(runMockEval()).toEqual([]);
});
