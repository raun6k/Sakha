import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import * as c from "@sakha/contracts";
import type { Runtime } from "../../../packages/core/src/index";
import { createApp } from "../../server/src/app";
import { initializeDemo } from "../../server/src/demo";

// Real HTTP, Cedar, scheduler and SQLite; only the model is a deterministic double.
const runtime: Runtime = {
  getCapabilities: async () => ({
    ready: true,
    text: true,
    cancel: true,
    resume: false,
    approvals: false,
    attachments: false,
    version: "integration-provider-double",
  }),
  startTurn: async (turn) => {
    await turn.beforeSend();
    const facts = await turn.tools.readFacts();
    const text = `Integration provider double: ${facts.length} authorized farm reports. No agronomic recommendation generated.`;
    await turn.onText(text.slice(0, 35));
    await turn.onText(text.slice(35));
    return { text };
  },
  cancelTurn: async () => {},
};
let directory: string;
let services: ReturnType<typeof createApp>;
const origin = "http://127.0.0.1:4398";
async function start(selectedRuntime: Runtime = runtime) {
  services = createApp({
    databasePath: resolve(directory, "test.sqlite"),
    origin,
    runtime: selectedRuntime,
    startScheduler: true,
    webDirectory: resolve("apps/web/dist"),
  });
  await services.app.listen({ host: "127.0.0.1", port: 4398 });
}
test.beforeEach(async () => {
  directory = mkdtempSync(resolve(tmpdir(), "sakha-browser-"));
  await start();
});
test.afterEach(async () => {
  await services.app.close();
  rmSync(directory, { recursive: true, force: true });
});
async function setup(page: import("@playwright/test").Page) {
  await page.goto(origin);
  await page
    .getByLabel("Your name or farm name (optional)")
    .fill("Synthetic integration farm");
  await page.getByRole("button", { name: "Skip this step" }).click();
  await page.getByRole("button", { name: "Skip this step" }).click();
  await page.getByRole("button", { name: "See my farm" }).click();
  await expect(
    page.getByText(/Good morning|Good afternoon|Good evening/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Daily Brief" }),
  ).toBeVisible();
  await expect(page.getByText("Checked by Sakha").first()).toBeVisible();
  return c.Farm.parse(
    services.store.list("farm", services.store.farms()[0] ?? "")[0],
  );
}
test("browser setup, attributed correction, scoped chat, restart and protected export persist", async ({
  page,
}) => {
  const farm = await setup(page);
  expect(farm.setup_complete).toBe(true);
  expect(services.store.list("fact", farm.id)).toHaveLength(0);
  await page.goto(`${origin}/farm`);
  await page
    .getByRole("button", { name: "Change a detail", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Your note", exact: true })
    .selectOption("Flowering");
  await page.getByRole("button", { name: "Save this note" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const first = c.Fact.parse(services.store.list("fact", farm.id)[0]);
  expect(first.provenance.effective_time_precision).toBe("date");
  expect(services.store.list("activity", farm.id)).toHaveLength(0);
  await page
    .getByRole("button", { name: "Change a detail", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Your note", exact: true })
    .selectOption("Growing");
  await page.getByRole("button", { name: "Save this note" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    services.farm.listFacts(farm.id).find((x) => x.key === "crop_stage")?.value,
  ).toBe("Growing");
  await page.getByRole("button", { name: "Turn on the assistant" }).click();
  await expect(page.getByText("The assistant is on.")).toBeVisible();
  expect(
    c.Consent.parse(services.store.list("consent", farm.id)[0])
      .external_processing,
  ).toBe(true);
  const roleResponse = await page.request.get(
    `${origin}/api/v1/farms/${farm.id}/agents/chief_of_staff`,
    { headers: { "x-sakha-session": services.sessionToken } },
  );
  expect(
    (await roleResponse.json()).data.capabilities.find(
      (x: { key: string }) => x.key === "chat",
    ).status,
  ).toBe("enabled");
  await page.goto(`${origin}/team`);
  await page
    .getByRole("textbox", { name: "Your question" })
    .fill("What is known about my farm?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Integration provider double:/ }),
  ).toBeVisible();
  expect(
    services.store.list("run", farm.id).map((x) => c.Run.parse(x).state),
  ).toEqual(["completed"]);
  expect(
    services.store
      .list("message", farm.id)
      .filter((x) => c.Message.parse(x).author === "farmer"),
  ).toHaveLength(1);
  const previousToken = services.sessionToken;
  await services.app.close();
  await start();
  expect(services.sessionToken).not.toBe(previousToken);
  // Keep the browser's old session: GET and SSE must recover without a duplicate turn.
  await page.goto(`${origin}/farm`);
  await expect(
    page.getByText("Young plants", { exact: true }).first(),
  ).toBeVisible();
  expect(services.store.list("run", farm.id)).toHaveLength(1);
});
test("real plan approval stays separate from actual completed work", async ({
  page,
}) => {
  const farm = await setup(page);
  const revision = c.PlanRevision.parse(
    services.domain.execute(
      "createPlanRevision",
      {
        farm_id: farm.id,
        title: "Synthetic inspection plan",
        summary: "Integration lifecycle test",
        tasks: [
          {
            ...services.farm.makeBase(farm.id),
            title: "Inspect field",
            description: "Record work separately",
            role_key: "crop_care",
            status: "proposed",
            evidence: [],
          },
        ],
        findings: [],
        evidence: [],
        constraints: [],
        assumptions: [],
        missing_inputs: [],
      },
      { farmId: farm.id },
    ),
  );
  await page.goto(`${origin}/plan`);
  await page.getByRole("button", { name: "Save this plan" }).click();
  await expect(page.getByRole("heading", { name: "Saved plan" })).toBeVisible();
  expect(services.domain.plan(farm.id).active_revision?.id).toBe(revision.id);
  expect(services.store.list("activity", farm.id)).toHaveLength(0);
});
test("mobile team keeps every teammate on screen and old routes leave the command center", async ({
  page,
}) => {
  const farm = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const roleKey of c.roles) {
    const response = await page.request.get(
      `${origin}/api/v1/farms/${farm.id}/agents/${roleKey}`,
      { headers: { "x-sakha-session": services.sessionToken } },
    );
    expect(response.status()).toBe(200);
    expect(c.Role.parse((await response.json()).data).key).toBe(roleKey);
  }
  await page.goto(`${origin}/team`);
  await expect(
    page.getByRole("heading", { name: "Your farm team" }),
  ).toBeVisible();
  await expect(page.getByText("Megha").first()).toBeVisible();
  await page.goto(`${origin}/agents/crop_care`);
  await expect(
    page.getByRole("heading", { name: "Your farm team" }),
  ).toBeVisible();
  await page.goto(origin);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await page.locator("body").innerText()).not.toMatch(
    /\bRONI\b|Command Center|grid point/,
  );
});

test("thinking renders no empty agent bubble and first text becomes one canonical message", async ({
  page,
}) => {
  let releaseText: () => void = () => {};
  let releaseFinal: () => void = () => {};
  const textGate = new Promise<void>((resolve) => {
    releaseText = resolve;
  });
  const finalGate = new Promise<void>((resolve) => {
    releaseFinal = resolve;
  });
  await services.app.close();
  await start({
    ...runtime,
    startTurn: async (turn) => {
      await turn.beforeSend();
      await textGate;
      await turn.onText("First model text");
      await finalGate;
      return { text: "First model text" };
    },
  });
  initializeDemo(services);
  await page.goto(`${origin}/team`);
  await page
    .getByRole("textbox", { name: "Your question" })
    .fill("What should I review?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Sakha is thinking…", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".message.agent, .message.partial")).toHaveCount(0);
  releaseText();
  await expect(
    page.getByRole("heading", { name: "First model text", exact: true }),
  ).toBeVisible();
  releaseFinal();
  await expect(page.locator(".answer-card")).toHaveCount(1);
  await expect(page.locator(".message.agent")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".answer-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "First model text", exact: true }),
  ).toBeVisible();
});
