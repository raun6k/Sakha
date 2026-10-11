// @vitest-environment jsdom

import type { Role } from "@sakha/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement as h, StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RainChart } from "../components/rain-chart";
import { Shell } from "../components/shell";
import { greeting } from "../farmer";
import { LanguageProvider } from "../language";
import { ServiceContext } from "../services/context";
import { createFixtureService } from "../services/fixture";
import { useUi } from "../state/ui";
import { Thread } from "./ask";
import { HomePage } from "./home";
import { PlanPage } from "./plan";
import { TeamPage } from "./team";

function mount(
  component: React.ReactNode,
  service = createFixtureService(),
  entry: object | string = "/",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    h(
      StrictMode,
      {},
      h(
        QueryClientProvider,
        { client },
        h(
          ServiceContext.Provider,
          { value: { service, demo: true } },
          h(
            LanguageProvider,
            null,
            h(MemoryRouter, { initialEntries: [entry] }, component),
          ),
        ),
      ),
    ),
  );
  return service;
}
afterEach(() => {
  cleanup();
  useUi.setState({ composer: {} });
  localStorage.removeItem("sakha-lang");
});

describe("conversation interaction", () => {
  it("submits one question and shows a checked card", async () => {
    const service = createFixtureService();
    const execute = vi.spyOn(service, "execute");
    const roles = await service.execute("listAgents", { input: {} });
    const role = roles.find((item) => item.key === "sakha") as Role;
    mount(h(Thread, { role }), service, {
      pathname: "/team",
      state: { question: "How should I plan?", questionId: "home-1" },
    });
    await waitFor(() =>
      expect(
        execute.mock.calls.filter(([name]) => name === "submitTurn"),
      ).toHaveLength(1),
    );
    await screen.findByText("Checked by Sakha");
    expect(
      execute.mock.calls.filter(([name]) => name === "submitTurn"),
    ).toHaveLength(1);
  });
  it("hides the composer when chat is not available", async () => {
    const service = createFixtureService();
    const role = (
      await service.execute("listAgents", { input: {} })
    )[1] as Role;
    role.capabilities = [
      {
        key: "chat",
        status: "unavailable",
        reason: "Provider not configured",
        requirements: [],
      },
    ];
    const execute = vi.spyOn(service, "execute");
    mount(h(Thread, { role }), service);
    await screen.findByText(/Sakha cannot answer yet/);
    expect(screen.queryByLabelText("Your question")).toBeNull();
    expect(execute.mock.calls.some(([name]) => name === "submitTurn")).toBe(
      false,
    );
  });
  it("retains the text after a failed turn", async () => {
    const service = createFixtureService({ failure: "submitTurn" });
    const role = (
      await service.execute("listAgents", { input: {} })
    )[0] as Role;
    const user = userEvent.setup();
    mount(h(Thread, { role }), service);
    await user.type(screen.getByLabelText("Your question"), "Failed question");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("alert");
    expect(
      (screen.getByLabelText("Your question") as HTMLTextAreaElement).value,
    ).toBe("Failed question");
  });
});

describe("plans", () => {
  it("saving a suggestion records no completed work", async () => {
    const service = createFixtureService();
    const user = userEvent.setup();
    mount(h(PlanPage), service);
    await user.click(
      await screen.findByRole("button", { name: "Save this plan" }),
    );
    await waitFor(async () => {
      const history = await service.execute("listActivity", {
        params: { farmId: "fixture-farm" },
        input: {},
      });
      expect(
        history.items.filter((item) => item.kind === "actual_work"),
      ).toHaveLength(0);
      expect(history.items.some((item) => item.kind === "plan_decision")).toBe(
        true,
      );
    });
  });
});

describe("home, team and rain", () => {
  it("uses short time-based greetings", () => {
    expect(greeting(8, "en")).toBe("Good morning");
    expect(greeting(12, "en")).toBe("Good afternoon");
    expect(greeting(19, "en")).toBe("Good evening");
  });
  it("shows the daily brief, the five teammates and a checked card", async () => {
    mount(h(HomePage));
    await screen.findByRole("heading", { name: "Daily Brief" });
    await screen.findByRole("heading", { name: "Safe" });
    for (const name of ["Sakha", "Megha", "Jal", "Kheti", "Paisa"])
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    expect(screen.getByText("Checked by Sakha")).toBeTruthy();
    expect(screen.getAllByText("Cost").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Benefit").length).toBeGreaterThan(0);
    const axis = document.querySelector(".rain-y")?.textContent ?? "";
    expect(axis).toContain("0");
    expect(axis).toContain("6");
    expect(axis).toContain("12");
  });
  it("opens teammate chats from the team tab", async () => {
    mount(h(TeamPage));
    await screen.findByRole("heading", { name: "Sakha · Team lead" });
    expect(screen.getAllByRole("link", { name: /Talk/ })).toHaveLength(4);
  });
  it("keeps four farmer tabs", async () => {
    const user = userEvent.setup();
    mount(h(Shell));
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Team" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "My Plan" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "My Farm" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Agents" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "हिन्दी" }));
    expect(screen.getByRole("link", { name: "होम" })).toBeTruthy();
  });
  it("labels a small rain axis in millimetres", () => {
    const service = createFixtureService();
    mount(
      h(RainChart, {
        series: {
          id: "tiny",
          source_id: "W04",
          snapshot_id: "s",
          evidence_id: "e",
          method_version: "t",
          variable: "Rain",
          unit: "mm/day",
          kind: "forecast",
          geography: "Nagpur",
          resolution: "day",
          supported_range: { from: "2026-10-11", to: "2026-10-12" },
          freshness: { status: "fresh", retrieved_at: "2026-10-11T00:00:00Z" },
          completeness: "complete",
          origin: "fixture",
          points: [
            { time: "2026-10-11T00:00:00Z", value: 0.2 },
            { time: "2026-10-12T00:00:00Z", value: null },
          ],
        },
      }),
      service,
    );
    const axis = document.querySelector(".rain-y")?.textContent ?? "";
    expect(axis).toContain("0");
    expect(axis).toContain("0.5");
    expect(axis).toContain("1");
  });
});
