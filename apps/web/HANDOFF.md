# Frontend integration handoff

10 October 2026. Frontend worktree branch `codex/frontend`, foundation `df7ed7c`. Shared-only contract commits consumed: `f3b5430` (local `60ffb34`), `4d50dbb` (local `253a094`), `30d37f2` (local `9882596`), `3bf3589` (local `7326798`). No root manifest, lockfile or server changes belong to this track. Do not cherry-pick those shared commits twice when integrating both branches.

The production binding is HTTP. Only an explicit initial `?demo=1` loads the synthetic adapter; `?demo=1&setup=1` starts its setup example. Demo records reset on reload, are isolated from real profiles and are visibly labeled. No failed HTTP request falls back to synthetic values. Route and fixture code are loaded conditionally. All farmer-owned records are Query data; setup/composer drafts are temporary Zustand data. Commands require confirmation where appropriate, carry idempotency identities and expected versions, and never turn plan approval into actual work.

## Inventory

| Screens | Implemented entry and behavior |
| --- | --- |
| P00 | Startup checks backend/setup; black splash; recoverable failure and explicit demo entry. |
| P01 | Three optional setup steps, original units and planned/current crop distinction, validation, draft preservation, partial-save recovery. English support is explicit. |
| P02 | Seven ordered Home sections: welcome/context, Ask, overview, attention, historical rainfall/ENSO/forecast, four shortcuts, farm plan. Unknowns and unsupported forecasts remain labeled. |
| P03 | A0 Ask: one-time Home handoff, conversation creation, Markdown without HTML, canonical messages, contextual evidence, progress, clarification, scoped runtime approval, cancellation and interrupted-run recovery. |
| P04 | Eight specialists in three categories; A0 separately linked. Generic cards open About and contextual entries open Chat. |
| P05–P12 | Shared About/Chat/Preferences/History for Climate, Weather, Crop Planning, Crop Care, Water, Market, Finance and Government Support. Recorded fact context and supported evidence remain separate from preferences. |
| P13 | Profile/location (optional reported coordinates), cultivation/resources, recent attributed reports with precision-aware dates, actual-work/history/plan links. Shared fact updates/corrections use farm services. |
| P14 | Approved revision, pending revisions, assumptions/constraints/evidence/contributions, exact-version approval/reject/request changes, daily/weekly/seasonal views, defer/not-yet, separate actual-work confirmation and revision history. |
| P15 | Current/history alerts, search, source validity/freshness, acknowledgement/dismissal and responsible specialist context. |
| P16 | Source/range selection, expanded historical rainfall/ENSO/forecast charts, separate published-month and daily windows gated by declared interval units, gaps, text alternatives and source metadata. Unsupported regional drought and long horizons have useful unavailable states. |
| P17 | Distinct typed recommendations/proposals/decisions/actual reports/corrections/outcomes, original context, paged older activity, confirmed outcome and actual quantity/spending corrections. |
| P18 | Supported English/units/INR, explanation, persisted reduced motion/in-app notifications, named scope grants/revocation, confirmed export/deletion, job status and authenticated local export download. No model/operator controls. |
| P19 | Local help, all nine roles, source catalog/official links, uncertainty/privacy/local monitoring limits. No fabricated feedback submission. |

| Reusable panel | Hosts and behavior |
| --- | --- |
| U01 Quick Farm Update | Home, My Farm and workspaces; attributed qualitative/known facts, date precision, cancel, persistence failure and stable explicit retry identity. |
| U02 Agent Information | Directory information dialog and role About. |
| U03 Recommendation Details | Workspace findings: assumptions, constraints, contributors and immutable evidence. |
| U04 Task Confirmation | Plan/activity: what happened, date, only known quantity/money, explicit actual-work checkbox; cancel/not-yet performs no mutation. |
| U05 Alert Details | Home/Alerts: validity, evidence, acknowledgement/dismissal and scoped specialist entry. |
| U06 Source Details | Chart/workspace/help: catalog definition versus immutable retrieved snapshot, issue/retrieval/validity, coverage/resolution/method and official link. |
| U07 Missing Information | Home missing coordinates, scenario unresolved inputs, plan critical constraints and run clarification; links to owning farm update or scoped answer. |
| U08 Action Confirmation | Exact revision decision, scoped runtime authorization, deletion/export and correction confirmation; separate from actual work. |
| U09 Offline/Data Unavailable | Startup, Query/command errors, stream reconnect, unsupported source/range/model/analysis states; no generated replacement data. |

## Unique specialist features

Climate, Weather and Market use C-, W- and M-prefixed source families respectively; supported qualitative weather and government guidance findings are shown separately from numeric charts. Charts preserve units, reported geography/resolution, observed versus forecast, actual source horizon and null gaps. Crop Planning has crop comparison and planting scenario forms; Crop Care has stage/condition reporting, task check-in, capability-gated private photo storage/deletion with no automatic analysis. Water has availability/budget and allocation scenario forms and irrigation history. Market has mandi/commodity/variety/date/quantity/price/cost and sale/storage comparison forms, preferences and dated-source limitations. Finance has budget/cost/proceeds comparison, spending limit/risk preferences and actual expense history. Government Support has jurisdiction/document context and checklist scenario inputs, official/insurance guidance, support interests and optional private-data consent. Every role has farmer-facing preferences; none exposes tools/prompts/models/autonomy.

Scenario inputs remain hypothetical and are typed known quantities/Money or explicit unknown. Numeric water needs, crop returns, sale/storage results and eligibility are never invented when the deterministic method or evidence is unavailable. Backend calculator currently supports explicit hypothetical cost/proceeds arithmetic; backend owns expansion and exact schema/input gates. Form keys were sent to the backend owner, and live evidence/calculation validation belongs to final integration.

## Verification and review

Frontend checkpoints: `385c1bf` foundation; `b20b61a` setup/Home/My Farm; `51af7e0` workspaces/decisions/supporting flows. `d472283` closes F7/F8; the following handoff adjustment aligns the final source-panel and scenario keys with backend B9.

- Strict TypeScript passes; Biome passes with the backend-owned recommended/no-explicit-any configuration.
- 34 focused Vitest behavior/component/transport tests pass: optional setup, failed persistence/draft retention, qualitative facts, stable mutation retries, one Home question under StrictMode, unavailable/failed turns, approval versus actual work, cancel/no mutation, unknown quantities, source context, privacy cancel, replay/resync, CRLF chunk boundaries, session renewal, mutation no-auto-resubmit, bounded messages and protected export download.
- Nine fixture Playwright tests pass, spanning J01 setup, J02 returning Home/J03 question, J04 all eight four-tab workspaces, J05 alert acknowledgement, J06 exact revision/cancel, J07 mobile save/focus/date, J08 ENSO/source snapshot, J09 mobile menu/history. A separate browser case inside the suite covers seven page families at 1440 and 390px without horizontal overflow.
- Vite production build passes without the previous oversized-chunk warning: largest initial chunk approximately 484 kB (150 kB gzip); specialist Markdown and fixture code are separate chunks.
- All ten original reference PNG SHA-256 hashes match their manifest. Separate generated panorama has embedded prompt sidecar and OFL font provenance. The detector's only finding was a false positive on square tab underlines (`border-radius:0`), not an accent border on a rounded card.
- Parent independently reviewed desktop Home/setup/Water and mobile Home/My Farm/Plan against the references; theme and structure were accepted. Four-primary navigation, mobile supporting menu/Escape focus, async dialog focus return and date-only report precision have browser evidence. New dialog focus and chart table semantics were checked; reduced motion is honored both from OS preference and restored global settings.

Screenshots are preserved outside Git in this worktree at `docs/implementation/frontend-review/screenshots/`: `home-1440.png`, `home-390.png`, `agents-1440.png`, `agents-390.png`, `agents-water-1440.png`, `agents-water-390.png`, `ask-desktop.png`, `farm-mobile.png`, `plan-1440.png`, `plan-390.png`, `source-desktop.png`, `insights-1440.png`, `insights-390.png`, `settings-1440.png`, `settings-390.png`, `help-1440.png`, `help-390.png`, `activity-mobile.png`, `support-workspace-desktop.png`. `/tmp/sakha-frontend-evidence` retains the originals too. Private design/docs and reference screenshots remain excluded.

Run with Node24 and installed pnpm: `pnpm --filter @sakha/web dev` (Vite defaults 5173); open `http://127.0.0.1:5173/?demo=1`. Tests: `pnpm exec vitest run apps/web/src`; browser `pnpm exec playwright test -c apps/web/playwright.config.ts` with optional `SAKHA_WEB_URL`. The ongoing review server is 5173. No provider keys are needed for fixture verification.

## Final integration gates

This is frontend readiness, not live UI→API→SQLite/provider/connector success. Parent owns final integration after backend B10.

Verify all HTTP endpoints on the exact merged contract, persisted startup after restart, expired-session GET/SSE renewal with canonical resync, interrupted/resumed/cancelled runs, actual SQLite version conflicts, private consent revocation/deletion/index/attachment effects, supported market/scheme/source normalization, and authenticated export/photo save/delete. Photo analysis and voice remain unavailable until a real compatible runtime and separate processing consent exist. Multi-profile switching remains an open specification, not a fabricated capability. The local app does not perform system push, official scheme applications, or uninterrupted monitoring.

Real-source Nagpur pilot is parent/backend owned; synthetic demo is disposable. Qualitative W01 must not become a numeric forecast; numeric W04 has its own evidence gate. W03 monthly totals never render as daily values; daily mm/day requires a distinct backend interval and publication gaps. Market unavailable status must remain useful if TLS/data retrieval does not pass. Keys/Codex authentication remain operator setup placeholders; final user credential requirements and live testing are parent-owned. No keys, account tokens or private real records are in the browser bundle.

## Parent integration follow-through, 11 October 2026

Both tracks are merged on main. The parent added real HTTP/SQLite/Cedar/SSE Playwright workflows in `integration/local.spec.ts`, fixed farm-scoped A0 capability lookup, stable preference saves and source-document details, and verified actual Codex-backed source lookup through the compiled application. The private integration register at `docs/implementation/integration-validation.md` owns exact live evidence and remaining OpenAI/source gates. Earlier fixture-only results above remain fixture-only evidence.
