import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Shell } from "./components/shell";
import { State } from "./components/ui";
import { LanguageProvider } from "./language";
import { FarmPage, Setup, Startup } from "./pages/farm";
import { ServiceContext } from "./services/context";
import { createHttpService } from "./services/http";
import "./styles.css";

const HomePage = lazy(() =>
  import("./pages/home").then((m) => ({ default: m.HomePage })),
);
const TeamPage = lazy(() =>
  import("./pages/team").then((m) => ({ default: m.TeamPage })),
);
const PlanPage = lazy(() =>
  import("./pages/plan").then((m) => ({ default: m.PlanPage })),
);

function Missing() {
  return (
    <div className="route-content">
      <State title="This page is not here">
        Use Home, Team, My Plan, or My Farm.
      </State>
    </div>
  );
}

async function start() {
  const service = createHttpService();
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
          <ServiceContext.Provider value={{ service, demo: false }}>
            <LanguageProvider>
              <BrowserRouter>
                <Startup>
                  <Suspense
                    fallback={
                      <div className="splash">
                        <h1>Sakha</h1>
                        <p>Opening Sakha…</p>
                      </div>
                    }
                  >
                    <Routes>
                      <Route path="/setup" element={<Setup />} />
                      <Route element={<Shell />}>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/team" element={<TeamPage />} />
                        <Route path="/team/:mateId" element={<TeamPage />} />
                        <Route
                          path="/ask"
                          element={<Navigate to="/team" replace />}
                        />
                        <Route path="/plan" element={<PlanPage />} />
                        <Route path="/farm" element={<FarmPage />} />
                        <Route
                          path="/agents/*"
                          element={<Navigate to="/team" replace />}
                        />
                        <Route
                          path="/alerts"
                          element={<Navigate to="/" replace />}
                        />
                        <Route
                          path="/activity"
                          element={<Navigate to="/plan" replace />}
                        />
                        <Route
                          path="/insights"
                          element={<Navigate to="/" replace />}
                        />
                        <Route
                          path="/settings"
                          element={<Navigate to="/farm" replace />}
                        />
                        <Route
                          path="/help"
                          element={<Navigate to="/farm" replace />}
                        />
                        <Route path="*" element={<Missing />} />
                      </Route>
                    </Routes>
                  </Suspense>
                </Startup>
              </BrowserRouter>
            </LanguageProvider>
          </ServiceContext.Provider>
        </QueryClientProvider>
      </StrictMode>,
    );
}
void start();
