import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Shell } from "./components/shell";
import { Loading, State } from "./components/ui";

import { FarmPage, Setup, Startup } from "./pages/farm";

import { ServiceContext } from "./services/context";

import { createHttpService } from "./services/http";
import "./styles.css";

const HomePage = lazy(() =>
  import("./pages/home").then((m) => ({ default: m.HomePage })),
);
const AgentsPage = lazy(() =>
  import("./pages/agents").then((m) => ({ default: m.AgentsPage })),
);
const AskPage = lazy(() =>
  import("./pages/agents").then((m) => ({ default: m.AskPage })),
);
const WorkspacePage = lazy(() =>
  import("./pages/agents").then((m) => ({ default: m.WorkspacePage })),
);
const PlanPage = lazy(() =>
  import("./pages/decisions").then((m) => ({ default: m.PlanPage })),
);
const AlertsPage = lazy(() =>
  import("./pages/decisions").then((m) => ({ default: m.AlertsPage })),
);
const ActivityPage = lazy(() =>
  import("./pages/decisions").then((m) => ({ default: m.ActivityPage })),
);
const InsightsPage = lazy(() =>
  import("./pages/support").then((m) => ({ default: m.InsightsPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/support").then((m) => ({ default: m.SettingsPage })),
);
const HelpPage = lazy(() =>
  import("./pages/support").then((m) => ({ default: m.HelpPage })),
);
async function start() {
  const demo = new URLSearchParams(window.location.search).get("demo") === "1";
  const service = demo
    ? (await import("./services/fixture")).createFixtureService({
        setup: new URLSearchParams(window.location.search).get("setup") !== "1",
      })
    : createHttpService();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  const root = document.getElementById("root");
  if (root)
    createRoot(root).render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <ServiceContext.Provider value={{ service, demo }}>
            <BrowserRouter>
              <Startup>
                <Suspense fallback={<Loading />}>
                  <Routes>
                    <Route path="/setup" element={<Setup />} />
                    <Route element={<Shell />}>
                      <Route path="/" element={<HomePage />} />
                      <Route path="/farm" element={<FarmPage />} />
                      <Route path="/ask" element={<AskPage />} />
                      <Route path="/agents" element={<AgentsPage />} />
                      <Route
                        path="/agents/:roleKey"
                        element={<WorkspacePage />}
                      />
                      <Route path="/plan" element={<PlanPage />} />
                      <Route path="/alerts" element={<AlertsPage />} />
                      <Route path="/activity" element={<ActivityPage />} />
                      <Route path="/insights" element={<InsightsPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/help" element={<HelpPage />} />
                      <Route
                        path="*"
                        element={
                          <State title="Page not found">
                            Choose one of the primary destinations to continue.
                          </State>
                        }
                      />
                    </Route>
                  </Routes>
                </Suspense>
              </Startup>
            </BrowserRouter>
          </ServiceContext.Provider>
        </QueryClientProvider>
      </StrictMode>,
    );
}
void start();
