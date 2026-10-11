import { expect, test } from "@playwright/test";

const evidence = "/tmp/sakha-frontend-evidence";
async function demo(page: import("@playwright/test").Page) {
  await page.goto("/?demo=1");
  await expect(
    page.getByRole("heading", {
      name: /Good morning|Good afternoon|Good evening/,
    }),
  ).toBeVisible();
}
test("J01 skipped setup creates a profile with unknown facts", async ({
  page,
}) => {
  await page.goto("/?demo=1&setup=1");
  await expect(
    page.getByRole("button", { name: "Skip this step" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip this step" }).click();
  await page.getByRole("button", { name: "Skip this step" }).click();
  await page.getByRole("button", { name: "Open my Command Center" }).click();
  await expect(
    page.getByRole("heading", {
      name: /Good morning|Good afternoon|Good evening/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Not recorded", { exact: true }).first(),
  ).toBeVisible();
});
test("J02/J03 Home sends one contextual question and canonical response", async ({
  page,
}) => {
  await demo(page);
  await page
    .getByPlaceholder("What should I consider before my next field activity?")
    .fill("How should I plan?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ask Sakha", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(/Your farm facts, proposed plans/)).toBeVisible();
  await expect(
    page.getByText("How should I plan?", { exact: true }),
  ).toHaveCount(1);
  await page.screenshot({
    path: `${evidence}/ask-desktop.png`,
    fullPage: true,
  });
});
test("J04 each specialist has About Chat Preferences History", async ({
  page,
}) => {
  await demo(page);
  await page
    .getByRole("button", { name: "Agents", exact: true })
    .first()
    .click();
  await page.getByRole("link", { name: "View agent directory" }).click();
  await expect(
    page.getByRole("heading", { name: "Your farming specialists" }),
  ).toBeVisible();
  for (const path of [
    "megha",
    "jal",
    "kheti",
    "paisa",
  ]) {
    await page.goto(`/agents/${path}?demo=1`);
    await expect(
      page.getByRole("button", { name: "About", exact: true }),
    ).toBeVisible();
    for (const tab of ["Chat", "Preferences", "History", "About"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      await expect(
        page.getByRole("button", { name: tab, exact: true }),
      ).toHaveClass("active");
    }
    await expect(
      page.getByRole("heading", { name: "Your farm context" }),
    ).toBeVisible();
  }
  await page.screenshot({
    path: `${evidence}/support-workspace-desktop.png`,
    fullPage: true,
  });
});
test("J05 alert acknowledgement leaves actual work unrecorded", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Review alert" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "does not complete work",
  );
  await page.getByRole("button", { name: "Acknowledge alert" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("link", { name: "Farm Plan", exact: true })
    .first()
    .click();
  await expect(page.getByText("No completed tasks recorded")).toBeVisible();
});
test("J06 proposal review and cancellation do not record work", async ({
  page,
}) => {
  await demo(page);
  await page
    .getByRole("link", { name: "Farm Plan", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Your Farm Plan", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `${evidence}/plan-desktop.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Review revision/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "does not record irrigation",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("No completed tasks recorded")).toBeVisible();
});
test("J07 async save restores focus and date precision on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page);
  await page.getByRole("link", { name: "My Farm", exact: true }).last().click();
  const trigger = page.getByRole("button", {
    name: "Update my farm",
    exact: true,
  });
  await trigger.click();
  await page
    .getByRole("combobox", { name: "Your report", exact: true })
    .selectOption("Flowering");
  await page.getByRole("button", { name: "Save farm update" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(
    page.getByText("Flowering", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .locator(".list-row")
      .filter({ has: page.getByText("Flowering", { exact: true }) })
      .locator("time"),
  ).not.toContainText(/am|pm/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${evidence}/farm-mobile.png`,
    fullPage: true,
  });
});
test("J08 ENSO expansion retains series and source snapshot", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("link", { name: "Expand", exact: true }).nth(1).click();
  await expect(page).toHaveURL(/series=C01/);
  await expect(
    page.getByRole("heading", { name: "Insights & Analytics" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Source & definition" }).click();
  await expect(page.getByRole("dialog")).toContainText("Synthetic");
  await page.screenshot({
    path: `${evidence}/source-desktop.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("J09 mobile supporting menu keyboard and history reachability", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page);
  const menu = page.getByRole("button", { name: "Open supporting pages" });
  await menu.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await menu.click();
  await page
    .getByRole("navigation", { name: "Supporting destinations" })
    .getByRole("link", { name: "Activity & decisions" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Activity & Decision History" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Mobile primary navigation" })
      .getByRole("link"),
  ).toHaveCount(3);
  await expect(
    page
      .getByRole("navigation", { name: "Mobile primary navigation" })
      .getByRole("button", { name: "Agents" }),
  ).toHaveCount(1);
  await page.screenshot({
    path: `${evidence}/activity-mobile.png`,
    fullPage: true,
  });
});
test("responsive page families have no horizontal overflow", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of [
      "",
      "agents",
      "agents/water?tab=chat",
      "plan",
      "insights",
      "settings",
      "help",
    ]) {
      await page.goto(`/${path}${path.includes("?") ? "&" : "?"}demo=1`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        page.getByText("Loading saved information…", { exact: true }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${path} at ${width}`,
      ).toBe(true);
      await page.screenshot({
        path: `${evidence}/${path.replaceAll("/", "-").replace("?tab=chat", "") || "home"}-${width}.png`,
        fullPage: true,
      });
    }
  }
});
