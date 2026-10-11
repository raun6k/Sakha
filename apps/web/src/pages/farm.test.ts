// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceContext } from "../services/context";
import { createFixtureService } from "../services/fixture";
import { useUi } from "../state/ui";
import { QuickUpdate, Setup, setupFacts } from "./farm";

function mount(component: React.ReactNode, service = createFixtureService()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    h(
      QueryClientProvider,
      { client },
      h(
        ServiceContext.Provider,
        { value: { service, demo: true } },
        h(MemoryRouter, {}, component),
      ),
    ),
  );
}
afterEach(() => {
  cleanup();
  useUi.getState().clearSetup();
});
describe("farmer setup and updates", () => {
  it("finishes with skipped optional facts and stores setup completion", async () => {
    const service = createFixtureService({ setup: false });
    const user = userEvent.setup();
    mount(h(Setup), service);
    await user.click(screen.getByRole("button", { name: "Skip this step" }));
    await user.click(screen.getByRole("button", { name: "Skip this step" }));
    await user.click(screen.getByRole("button", { name: "See my farm" }));
    await waitFor(async () =>
      expect(
        (await service.execute("bootstrap", { input: {} })).readiness,
      ).toBe("ready"),
    );
  });
  it("retains entered values when persistence fails", async () => {
    const service = createFixtureService({
      setup: false,
      failure: "completeSetup",
    });
    const user = userEvent.setup();
    mount(h(Setup), service);
    await user.type(
      screen.getByLabelText("Your name or farm name (optional)"),
      "Draft farm",
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "See my farm" }));
    await screen.findByRole("alert");
    expect(useUi.getState().setup.name).toBe("Draft farm");
    expect((await service.execute("bootstrap", { input: {} })).readiness).toBe(
      "setup_required",
    );
  });
  it("rejects ambiguous/non-positive area without manufacturing a value", () => {
    expect(() =>
      setupFacts({ ...useUi.getState().setup, area: "0" }, "f"),
    ).toThrow("positive");
    expect(() =>
      setupFacts({ ...useUi.getState().setup, area: "two local units" }, "f"),
    ).toThrow("positive");
  });
  it("cancelling a farm update creates no record", async () => {
    const service = createFixtureService();
    const execute = vi.spyOn(service, "execute");
    const close = vi.fn();
    const user = userEvent.setup();
    mount(h(QuickUpdate, { open: true, onClose: close }), service);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledOnce();
    expect(
      execute.mock.calls.some(
        ([op]) => op === "saveFact" || op === "correctFact",
      ),
    ).toBe(false);
  });
  it("saves qualitative water as a description and updates authoritative facts", async () => {
    const service = createFixtureService();
    const user = userEvent.setup();
    const close = vi.fn();
    mount(
      h(QuickUpdate, {
        open: true,
        onClose: close,
        initialKey: "water_availability",
      }),
      service,
    );
    await screen.findByLabelText("Your note");
    await user.selectOptions(screen.getByLabelText("Your note"), "Little");
    await user.click(screen.getByRole("button", { name: "Save this note" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    const facts = await service.execute("listFacts", {
      params: { farmId: "fixture-farm" },
      input: {},
    });
    expect(
      facts.items.find((f) => f.key === "water_availability")?.value,
    ).toEqual({ kind: "qualitative", text: "Little" });
  });
});

it("keeps the same command identity when a farmer explicitly retries an uncertain report", async () => {
  const service = createFixtureService({ failure: "saveFact" });
  const execute = vi.spyOn(service, "execute");
  const user = userEvent.setup();
  mount(h(QuickUpdate, { open: true, onClose: vi.fn() }), service);
  await user.selectOptions(screen.getByLabelText("Your note"), "Flowering");
  await user.click(screen.getByRole("button", { name: "Save this note" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Save this note" }));
  await waitFor(() =>
    expect(
      execute.mock.calls.filter(([name]) => name === "saveFact"),
    ).toHaveLength(2),
  );
  const calls = execute.mock.calls.filter(([name]) => name === "saveFact");
  expect(calls[0]?.[1]?.command?.idempotency_key).toBe(
    calls[1]?.[1]?.command?.idempotency_key,
  );
});
