import { expect, it } from "vitest";
import { authorizationLog, authorize } from "./index.js";
import { domainAllowed, FETCH_DOMAINS } from "./web-research.js";

it("actual Cedar denies foreign farm, missing private grant and farmer decision impersonation before effects", () => {
  const principal = {
    kind: "agent" as const,
    id: "jal",
    farmId: "a",
    roleKey: "jal" as const,
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

it("permits Paisa market and Sakha consult, and denies Megha using either", () => {
  const resource = { id: "cedar-denial-case", farmId: "a" };
  const megha = {
    kind: "agent" as const,
    id: "megha",
    farmId: "a",
    roleKey: "megha" as const,
  };
  const paisa = {
    kind: "agent" as const,
    id: "paisa",
    farmId: "a",
    roleKey: "paisa" as const,
  };
  const sakha = {
    kind: "agent" as const,
    id: "sakha",
    farmId: "a",
    roleKey: "sakha" as const,
  };
  authorize(paisa, "market", resource, true);
  authorize(sakha, "consult", resource, true, false, { specialist: "megha" });
  authorize(megha, "web_search", resource, true);
  authorize(megha, "fetch_page", resource, true, false, {
    domain: "imd.gov.in",
  });
  authorize(sakha, "memory", resource, true, false, { namespace: "sakha" });
  authorize(sakha, "write_profile", resource, true);
  expect(() => authorize(megha, "market", resource, true)).toThrow(
    /Cedar denied market/,
  );
  expect(() =>
    authorize(megha, "consult", resource, true, false, { specialist: "paisa" }),
  ).toThrow(/Cedar denied consult/);
  expect(() =>
    authorize(sakha, "fetch_page", resource, true, false, {
      domain: "evil.example",
    }),
  ).toThrow(/Cedar denied fetch_page/);
  expect(() => authorize(sakha, "record_work", resource, true)).toThrow(
    /Cedar denied record_work/,
  );
  expect(() => authorize(paisa, "payment", resource, true)).toThrow(
    /Cedar denied payment/,
  );
  expect(() => authorize(paisa, "submit_form", resource, true)).toThrow(
    /Cedar denied submit_form/,
  );
  expect(() =>
    authorize(megha, "memory", resource, true, false, { namespace: "paisa" }),
  ).toThrow(/Cedar denied memory/);
  for (const suffix of FETCH_DOMAINS) {
    expect(domainAllowed(suffix)).toBe(true);
    expect(domainAllowed(`api.${suffix}`)).toBe(true);
    authorize(sakha, "fetch_page", resource, true, false, { domain: suffix });
  }
  expect(domainAllowed("enam.gov.in")).toBe(true);
  expect(domainAllowed("evil.example")).toBe(false);
  expect(domainAllowed("imd.gov.in.evil.example")).toBe(false);
  const entries = authorizationLog().filter(
    (entry) => entry.resource === resource.id,
  );
  expect(
    entries.find(
      (entry) => entry.action === "market" && entry.principal === "paisa",
    )?.decision,
  ).toBe("allow");
  expect(
    entries.find(
      (entry) => entry.action === "market" && entry.principal === "megha",
    )?.decision,
  ).toBe("deny");
  expect(
    entries.find(
      (entry) => entry.action === "consult" && entry.specialist === "megha",
    )?.decision,
  ).toBe("allow");
  expect(
    entries.find(
      (entry) => entry.action === "consult" && entry.principal === "megha",
    )?.decision,
  ).toBe("deny");
});
