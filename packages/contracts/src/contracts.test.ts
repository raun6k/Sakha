import { describe, expect, it } from "vitest";
import {
  errorExamples,
  eventExamples,
  responseExamples,
  scenarioExamples,
} from "./examples.js";
import {
  ApiError,
  Event,
  Evidence,
  operations,
  Quantity,
  ScenarioRequest,
} from "./index.js";

describe("shared operation contracts", () => {
  for (const [name, operation] of Object.entries(operations))
    it(`${name} has a valid concrete response`, () => {
      expect(
        operation.output.safeParse(
          responseExamples[name as keyof typeof operations],
        ).success,
      ).toBe(true);
    });
  it("preserves missing quantity and rejects invalid range", () => {
    expect(Quantity.parse({ kind: "unknown", reason: "Unmeasured" }).kind).toBe(
      "unknown",
    );
    expect(
      Quantity.safeParse({ kind: "range", min: 10, max: 1, unit: "m3" })
        .success,
    ).toBe(false);
  });
  it("requires concrete confirmation for actual work, separate from approval", () => {
    expect(
      operations.recordActivity.input.safeParse({ confirmed: false }).success,
    ).toBe(false);
    expect(
      operations.decidePlan.input.safeParse({
        expected_version: 1,
        decision: "approve",
        base_revision_id: null,
      }).success,
    ).toBe(true);
  });
  it("covers all unique scenario panel types", () => {
    expect(scenarioExamples.map((x) => x.kind)).toEqual(
      ScenarioRequest.shape.kind.options,
    );
  });
  it("validates every durable event and failure family", () => {
    for (const event of eventExamples)
      expect(Event.safeParse(event).success).toBe(true);
    for (const error of errorExamples)
      expect(ApiError.safeParse(error).success).toBe(true);
  });
});

it("rejects executable and local-file URLs in evidence links", () => {
  for (const url of [
    "javascript:alert(1)",
    "file:///private/local-records",
    "data:text/html,example",
  ])
    expect(
      Evidence.safeParse({ ...(responseExamples.getEvidence as object), url })
        .success,
    ).toBe(false);
  expect(
    Evidence.safeParse({
      ...(responseExamples.getEvidence as object),
      url: "https://example.org/source.pdf",
    }).success,
  ).toBe(true);
});
