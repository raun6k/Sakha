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
  await page.getByLabel("State (optional)").fill("Maharashtra");
  await page.getByLabel("District (optional)").fill("Nagpur");
  await page.getByRole("button", { name: "Skip this step" }).click();
  await page.getByRole("button", { name: "Skip this step" }).click();
  await page.getByRole("button", { name: "Open my Command Center" }).click();
  await expect(
    page.getByRole("heading", {
      name: /Good morning|Good afternoon|Good evening/,
    }),
  ).toBeVisible();
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
    .getByRole("button", { name: "Update my farm", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Your report", exact: true })
    .selectOption("Flowering");
  await page.getByRole("button", { name: "Save farm update" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const first = c.Fact.parse(services.store.list("fact", farm.id)[0]);
  expect(first.provenance.effective_time_precision).toBe("date");
  expect(services.store.list("activity", farm.id)).toHaveLength(0);
  await page
    .getByRole("button", { name: "Update my farm", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Your report", exact: true })
    .selectOption("Growing");
  await page.getByRole("button", { name: "Save farm update" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    services.farm.listFacts(farm.id).find((x) => x.key === "crop_stage")?.value,
  ).toBe("Growing");
  await page.goto(`${origin}/settings`);
  await page.getByLabel(/Allow my conversation text/).check();
  await page
    .getByLabel("I understand this scope and want to grant it.")
    .check();
  await page.getByRole("button", { name: "Grant this scope" }).click();
  await expect(
    page.getByText("External processing allowed").first(),
  ).toBeVisible();
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
  await page.goto(origin);
  await page
    .getByPlaceholder("What should I consider before my next field activity?")
    .fill("What is known about my farm?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText(/Integration provider double:/)).toBeVisible();
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
    page.getByText("Growing", { exact: true }).first(),
  ).toBeVisible();
  expect(services.store.list("run", farm.id)).toHaveLength(1);
  await page.goto(`${origin}/settings`);
  await page.getByRole("button", { name: "Export my farm records" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("I understand and confirm this exact scope.").check();
  await page.getByRole("button", { name: "Confirm export" }).click();
  await expect(page.getByRole("button", { name: /Download/ })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^sakha-export-/);
  await page.screenshot({
    path: "/tmp/sakha-integrated-settings.png",
    fullPage: true,
  });
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
  await page.getByRole("button", { name: /Review revision/ }).click();
  await page
    .getByLabel("I reviewed this exact revision and its assumptions.")
    .check();
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(services.domain.plan(farm.id).active_revision?.id).toBe(revision.id);
  expect(services.store.list("activity", farm.id)).toHaveLength(0);
  await page.getByRole("button", { name: /Report completed work/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Not yet / cancel", exact: true })
    .click();
  expect(services.store.list("activity", farm.id)).toHaveLength(0);
  await page.getByRole("button", { name: /Report completed work/ }).click();
  await page.getByLabel("I confirm this work actually happened.").check();
  await page.getByRole("button", { name: "Confirm completed work" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(services.store.list("activity", farm.id)).toHaveLength(1);
  expect(c.Task.parse(services.store.list("task", farm.id)[0]).status).toBe(
    "completed",
  );
});
test("mobile specialists, local photo lifecycle, alert acknowledgement and full-farm deletion", async ({
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
  await page.goto(`${origin}/agents/crop_care`);
  await page
    .getByText("Explore specialist tools and scenarios", { exact: true })
    .click();
  await page.getByLabel("Photo (PNG, JPEG or WebP, up to 8 MB)").setInputFiles({
    name: "synthetic-one-pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9N0AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page
    .getByLabel("Save this selected photo privately with my farm.")
    .check();
  await page.getByRole("button", { name: "Save crop photo" }).click();
  await expect(
    page.getByRole("heading", { name: "synthetic-one-pixel.png" }),
  ).toBeVisible();
  const attachment = c.Attachment.parse(
    services.store.list("attachment", farm.id)[0],
  );
  expect(attachment.analysis_capability.status).toBe("unavailable");
  expect(
    services.store.db
      .prepare("SELECT count(*) AS count FROM private_artifacts")
      .get(),
  ).toMatchObject({ count: 1 });
  await page.getByRole("button", { name: "Delete this private photo" }).click();
  await expect(
    page.getByRole("heading", { name: "synthetic-one-pixel.png" }),
  ).toHaveCount(0);
  expect(services.store.list("attachment", farm.id)).toHaveLength(0);
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText(/Preferences saved/)).toBeVisible();
  const now = new Date().toISOString();
  const alert = c.Alert.parse({
    ...services.farm.makeBase(farm.id),
    title: "Synthetic integration alert",
    summary: "No weather warning asserted",
    severity: "information",
    role_key: "weather",
    status: "active",
    evidence: [],
    issued_at: now,
    freshness: { status: "unknown" },
  });
  services.store.put("alert", alert);
  await page.goto(`${origin}/alerts`);
  await page
    .getByRole("button", { name: /Review details/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Acknowledge alert" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    c.Alert.parse(services.store.get("alert", alert.id, farm.id)).status,
  ).toBe("acknowledged");
  expect(services.store.list("activity", farm.id)).toHaveLength(0);
  await page.goto(`${origin}/insights`);
  await expect(
    page.getByRole("heading", { name: "Insights & Analytics" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/sakha-integrated-mobile-insights.png",
    fullPage: true,
  });
  await page.goto(`${origin}/settings`);
  await page.getByRole("button", { name: "Review deletion options" }).click();
  await page.getByLabel("Deletion scope").selectOption("farm");
  await page.getByLabel("I understand and confirm this exact scope.").check();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(
    page.getByRole("heading", { name: "A little about your farm" }),
  ).toBeVisible();
  expect(services.store.get("farm", farm.id, farm.id)).toBeUndefined();
  expect(services.store.list("attachment", farm.id)).toHaveLength(0);
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
  await page.goto(`${origin}/ask`);
  await page.getByLabel("Ask Chief of Staff").fill("What should I review?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(
    page.getByText("Chief of Staff is thinking…", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".message.agent, .message.partial")).toHaveCount(0);
  releaseText();
  await expect(
    page.getByText("First model text", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".message.agent, .message.partial")).toHaveCount(1);
  releaseFinal();
  await expect(page.locator(".message.agent")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".message.agent, .message.partial")).toHaveCount(1);
  await expect(
    page.getByText("First model text", { exact: true }),
  ).toBeVisible();
});
