import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Shell } from "./components/shell";
import { State } from "./components/ui";
import { AgentsPage, AskPage, WorkspacePage } from "./pages/agents";
import { ActivityPage, AlertsPage, PlanPage } from "./pages/decisions";
import { FarmPage, Setup, Startup } from "./pages/farm";
import { HomePage } from "./pages/home";
import { HelpPage, InsightsPage, SettingsPage } from "./pages/support";
import { ServiceContext } from "./services/context";
import { createFixtureService } from "./services/fixture";
import { createHttpService } from "./services/http";
import "./styles.css";

const demo = new URLSearchParams(window.location.search).get("demo") === "1";
const service = demo
  ? createFixtureService({
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
              <Routes>
                <Route path="/setup" element={<Setup />} />
                <Route element={<Shell />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/farm" element={<FarmPage />} />
                  <Route path="/ask" element={<AskPage />} />
                  <Route path="/agents" element={<AgentsPage />} />
                  <Route path="/agents/:roleKey" element={<WorkspacePage />} />
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
            </Startup>
          </BrowserRouter>
        </ServiceContext.Provider>
      </QueryClientProvider>
    </StrictMode>,
  );
