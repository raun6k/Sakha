// @vitest-environment jsdom

import type { Role } from "@sakha/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement as h, StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceContext } from "../services/context";
import { createFixtureService } from "../services/fixture";
import { useUi } from "../state/ui";
import { AgentsPage, ConversationView } from "./agents";
import { PlanPage, WorkConfirmation } from "./decisions";
import { InsightsPage, SettingsPage } from "./support";

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
          h(MemoryRouter, { initialEntries: [entry as string] }, component),
        ),
      ),
    ),
  );
  return service;
}
afterEach(() => {
  cleanup();
  useUi.setState({ composer: {} });
});
describe("conversation interaction", () => {
  it("submits one question from Home even with StrictMode effects and stream refetches", async () => {
    const service = createFixtureService();
    const execute = vi.spyOn(service, "execute");
    const roles = await service.execute("listAgents", { input: {} });
    const role = roles.find((r) => r.key === "chief_of_staff") as Role;
    mount(h(ConversationView, { role }), service, {
      pathname: "/ask",
      state: { question: "How should I plan?", questionId: "home-1" },
    });
    await waitFor(() =>
      expect(
        execute.mock.calls.filter(([name]) => name === "submitTurn"),
      ).toHaveLength(1),
    );
    await screen.findByText(
      "Your farm facts, proposed plans and completed work remain distinct. You can inspect recorded context in My Farm or review the synthetic proposal in Farm Plan.",
    );
    expect(
      execute.mock.calls.filter(([name]) => name === "submitTurn"),
    ).toHaveLength(1);
  });
  it("keeps an unsent draft when the runtime is unavailable", async () => {
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
    const user = userEvent.setup();
    mount(h(ConversationView, { role }), service);
    await user.type(screen.getByLabelText(`Ask ${role.name}`), "My question");
    expect(
      screen
        .getByRole("button", { name: "Send question" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(execute.mock.calls.some(([name]) => name === "submitTurn")).toBe(
      false,
    );
    expect(useUi.getState().composer[role.key]).toBe("My question");
  });
  it("retains the text after a failed turn and does not silently invent a response", async () => {
    const service = createFixtureService({ failure: "submitTurn" });
    const role = (
      await service.execute("listAgents", { input: {} })
    )[0] as Role;
    const user = userEvent.setup();
    mount(h(ConversationView, { role }), service);
    await user.type(
      screen.getByLabelText(`Ask ${role.name}`),
      "Failed question",
    );
    await user.click(screen.getByRole("button", { name: "Send question" }));
    await screen.findByRole("alert");
    expect(
      (screen.getByLabelText(`Ask ${role.name}`) as HTMLTextAreaElement).value,
    ).toBe("Failed question");
  });
});
describe("plans, actual work and history", () => {
  it("approval records a decision but no actual work, then separate confirmation records work", async () => {
    const service = createFixtureService();
    const user = userEvent.setup();
    mount(h(PlanPage), service);
    await user.click(
      await screen.findByRole("button", { name: "Review revision" }),
    );
    await user.click(
      screen.getByLabelText(
        "I reviewed this exact revision and its assumptions.",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Confirm decision" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    let history = await service.execute("listActivity", {
      params: { farmId: "fixture-farm" },
      input: {},
    });
    expect(history.items.filter((x) => x.kind === "actual_work")).toHaveLength(
      0,
    );
    await user.click(
      await screen.findByRole("button", { name: "Report completed work" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Activity type"),
      "observation",
    );
    await user.click(
      screen.getByLabelText("I confirm this work actually happened."),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm completed work" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    history = await service.execute("listActivity", {
      params: { farmId: "fixture-farm" },
      input: {},
    });
    expect(history.items.map((x) => x.kind)).toEqual([
      "plan_decision",
      "actual_work",
    ]);
  });
  it("not yet / cancel makes no mutation", async () => {
    const service = createFixtureService();
    const execute = vi.spyOn(service, "execute");
    const user = userEvent.setup();
    const close = vi.fn();
    mount(h(WorkConfirmation, { onClose: close }), service);
    await user.click(screen.getByRole("button", { name: "Not yet / cancel" }));
    expect(close).toHaveBeenCalledOnce();
    expect(execute.mock.calls.some(([name]) => name === "recordActivity")).toBe(
      false,
    );
  });
  it("unknown work quantity stays absent rather than zero", async () => {
    const service = createFixtureService();
    const user = userEvent.setup();
    const close = vi.fn();
    mount(h(WorkConfirmation, { onClose: close }), service);
    await user.type(screen.getByLabelText("What happened?"), "Checked field");
    await user.click(
      screen.getByLabelText("I confirm this work actually happened."),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm completed work" }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    const history = await service.execute("listActivity", {
      params: { farmId: "fixture-farm" },
      input: {},
    });
    const activity = await service.execute("getActivity", {
      params: {
        farmId: "fixture-farm",
        activityId: history.items[0]?.record_id ?? "",
      },
      input: {},
    });
    expect(activity.quantity).toBeUndefined();
    expect(activity.provenance.effective_time_precision).toBe("date");
  });
});
describe("evidence and privacy interactions", () => {
  it("preserves ENSO filter and shows accessible value table with a gap", async () => {
    mount(
      h(InsightsPage),
      createFixtureService(),
      "/insights?series=C01&range=5years",
    );
    await screen.findByRole("heading", { name: "RONI" });
    expect(
      (screen.getByLabelText("Time range") as HTMLSelectElement).value,
    ).toBe("5years");
    expect(screen.getByText("Missing")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Ask the specialist" })
        .getAttribute("href"),
    ).toContain("snapshot=fixture-snapshot-0");
  });
  it("does not delete any data when the review dialog is cancelled", async () => {
    const service = createFixtureService();
    const execute = vi.spyOn(service, "execute");
    const user = userEvent.setup();
    mount(h(SettingsPage), service);
    await user.click(
      await screen.findByRole("button", { name: "Review deletion options" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      execute.mock.calls.some(([name]) => name === "requestDeletion"),
    ).toBe(false);
  });
  it("directory contains eight specialists and keeps A0 separate", async () => {
    mount(h(AgentsPage));
    await screen.findByRole("heading", { name: "Water & Irrigation" });
    expect(
      screen.getAllByRole("link", { name: "Explore specialist" }),
    ).toHaveLength(8);
    expect(
      screen.queryByRole("heading", { name: "Chief of Staff" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Ask Sakha" })).toBeTruthy();
  });
});
