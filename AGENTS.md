# Sakha — Contributor and Coding Agent Guidance

## Product and working approach

Sakha is an open-source farming Command Center running in a local browser with one local backend. It has A0 Chief of Staff and eight persistent specialist roles. The initial active set is A0–A5 and A7; A6 Market and A8 Government Support follow. The MVP has no farmer accounts, login, password or OTP, and requires no hosted AWS infrastructure.

**Prioritize steady development with useful unit coverage and regular local commits.** Build several related pieces, check the completed part, commit, and continue. Do not interrupt every small edit with a build, full test suite, browser run or approval request. Fix failures caused by the change before calling that part complete. Speed must not come from hiding errors, bypassing authorization or inventing data.

The repository now contains the integrated local application, planning documents and visual references. Check the implementation evidence for verified behavior and remaining live-provider/source gates. Consult [the documentation map](docs/README.md) and only the owner documents relevant to the task:

- [Architecture](docs/architecture.md): shared state, agent collaboration, evidence, permissions and plan lifecycle.
- [Build plan](docs/build-plan.md): shared foundation, parallel backend/frontend phases, contract ownership, handoff gates and one final integration/validation phase.
- [Technology baseline](docs/tech-stack-proposal.md): named packages, recorded version candidates and runtime boundaries.
- [Agent directory](docs/agent-directory.md) and [source catalog](docs/data-sources.md): role authority and data meanings.
- [Frontend architecture](docs/frontend-architecture.md), [page inventory](docs/frontend/01-page-inventory-and-sitemap.md), [feature specifications](docs/frontend/02-page-feature-specifications.md) and [journeys](docs/frontend/03-user-journey-maps.md): UI scope and behavior.

Keep specifications aligned when implementation changes a contract or behavior. Do not turn an unresolved choice, fixture or unimplemented connector into a completed capability in documentation.

## Technology baseline

Use this stack around the selected Strands Agents SDK and Cedar. Follow the existing proposal rather than reconsidering frameworks for each feature.

| Area | Technology |
| --- | --- |
| Language/runtime | TypeScript with strict checking, Node.js 24 LTS, ESM; TypeScript for both the application backend and agent orchestration. |
| Workspace/tooling | pnpm workspaces, `tsx`, TypeScript compiler, Biome. |
| Frontend/routing | React, Vite, React Router in declarative mode. |
| Styling/controls/icons | Tailwind CSS, Radix UI primitives, Lucide React. |
| UI data and temporary state | TanStack Query for backend-owned records; Zustand for drafts, tabs and temporary interface state. |
| Chat rendering | `react-markdown` and `remark-gfm`, with raw HTML disabled. |
| HTTP/local serving | Fastify and `@fastify/static`; release UI/API served from the same local origin. |
| Commands/streaming | REST commands and SSE through `@fastify/sse`. |
| API-powered agents | `@strands-agents/sdk` TypeScript SDK; OpenAI client for the initial API provider, optional Anthropic client when enabled. |
| Codex-powered agents | Separate installed Codex app-server adapter using JSON-RPC over stdio; authentication stays with Codex. |
| Authorization | `@cedar-policy/cedar-wasm` in the application-owned tool gateway; versioned Cedar policies. Use the schema-generator package where required by the documented integration. |
| Persistence/search | SQLite, `better-sqlite3`, Drizzle ORM/Kit migrations, SQLite FTS5 for initial memory search. |
| Validation/contracts | Zod schemas and shared TypeScript contracts. |
| Messaging/background jobs | Application-owned durable router/scheduler backed by SQLite inbox, outbox and job records. |
| Tool interoperability | Official MCP TypeScript client/server packages and scoped Sakha tools. |
| Credentials/files/logs | `@napi-rs/keyring` with optional environment variables; `env-paths` for local storage; Fastify/Pino logs and durable activity records. |
| Verification | Vitest for unit and focused integration tests; Playwright for selected complete browser flows. |

Package/version candidates are recorded in the technology proposal, not established by an installed application yet. Resolve compatible versions once during scaffolding and commit manifests plus `pnpm-lock.yaml`; those become the installed-version authority. Keep provider/MCP versions compatible with the chosen Strands version. Do not routinely update dependencies during unrelated feature work.

Strands and Cedar are the only selected AWS-origin components. Do not introduce another agent framework, hosted database, Redis, distributed queue, microservice system or plugin platform without a concrete requirement. Chart/animation, scientific processing, voice and image-capability libraries remain unselected; choose them when their feature needs them. A Python scientific worker is a possible data-processing addition, not the application/agent backend baseline.

## Architecture and coding standards

- Keep one application with clear internal modules. Use the planned boundaries: `apps/web`, `apps/server`, `packages/core`, `packages/contracts`, `packages/agents-farming`, `packages/farm`, `packages/data`, `packages/runtime-strands`, `packages/runtime-codex`, and `policies`. Create modules when implementing them; avoid empty scaffolding for every future feature.
- Keep HTTP handlers and React components focused. Put shared business rules in the owning service/module, not in UI handlers, prompts or duplicated adapter code. Prefer a direct function or small module before a class hierarchy, generic repository or configurable framework.
- Use descriptive names, explicit domain types and units. Validate untrusted inputs at API, tool, provider and connector boundaries with Zod. Use `unknown` plus validation rather than unexplained `any` or unsafe assertions. Share contracts instead of redefining payloads in the frontend and backend.
- Keep deterministic calculations, conversions and state transitions separate from LLM calls. Make their inputs/outputs testable. Preserve original farmer wording, units, attribution and effective time when normalizing facts.
- Persist authoritative farm facts, global UI settings and role preferences through their owning services. Client state and agent memory cannot become competing sources of truth. Use migrations for schema changes and short transactions for related writes.
- Keep Strands and Codex behind a small shared runtime interface for capabilities, turns, streaming and cancellation. Preserve capability differences. Do not copy Codex account tokens into provider API-key storage.
- Route permitted peer messages through the durable application router; A0 coordinates the plan and is not a mandatory relay. Bound turns, concurrency, retries and fan-out. Persist important state transitions and make retried messages/mutations idempotent.
- Return understandable, structured failures with enough context to locate the fault. Do not swallow errors, replace a failed fetch with plausible data, or claim a mutation succeeded before persistence. Use correlation/run IDs where useful and redact credentials/private fields from logs.
- Preserve existing changes outside the task. Avoid unrelated refactors, formatting churn, dependency additions and speculative abstractions. Comment on a non-obvious reason or constraint, not every line. Use `rg` for targeted discovery rather than repeatedly scanning the whole repository.

## Domain, data and permission rules

- Scope records, messages, memory, tools and plans to the actual farm/field where applicable. Cedar checks the real principal, action and resource before application-owned side effects; model arguments cannot choose the executing identity or bypass the gateway.
- Keep **proposal → farmer approval → actual completed-work confirmation** distinct. Approval does not record irrigation, spending, sowing or sales. New evidence creates a reviewable revision rather than overwriting an approved plan. Alert acknowledgement does not complete a task.
- Preserve evidence identity, source definition, issue/retrieval/valid times, geography/resolution and units. Distinguish farmer reports, observations, forecasts, estimates and scenarios. Missing measurements stay unknown; qualitative water answers are not exact volumes.
- Do not invent agronomic coefficients, financial returns, eligibility, confidence percentages or connector results. Mock/fixture data is useful for development but must be labeled and separate from live records. A declared source or role is not evidence that its connector/model works.
- Keep keys and private farm records out of Git, browser bundles, prompts that do not need them, and diagnostic logs. Use scoped private-data grants; minimize optional financial/eligibility collection. Corrections/deletion must reach derived memory/indexes and attachments according to the implemented lifecycle.
- Bind the local backend to loopback and protect accepted origins/state-changing calls. No farmer login does not remove tool authorization. Background work pauses when the backend stops or the laptop sleeps; never imply uninterrupted monitoring.

## Frontend standards and visual references

Before frontend work, read the relevant feature/journey requirements and [visual guidance](docs/frontend/05-visual-and-motion-design-system.md). **Inspect the relevant user-supplied images in [the visual-reference index](docs/frontend/reference-images/README.md).** For a screen without its own image, use the common shell and nearest page/workspace family. Keep all original images unchanged.

Use the requested evergreen sidebar, ivory canvas, serif display headings, sans-serif body/controls, white cards, green actions, gold accents and farm imagery. The images guide structure/theme/component treatment; written specifications govern features, routes, data and confirmations. Screenshot numbers, maps, recommendations and monitoring claims are illustrative.

Preserve four primary destinations, the seven-section Home order, the shared About/Chat/Preferences/History specialist template, and separate global settings/role preferences/shared facts. Use reusable components where patterns actually repeat. Keep backend data in Query and temporary drafts/panels in Zustand. Farmer preferences must not expose models, prompts, temperature, autonomy or tool grants.

Build readable, responsive and accessible UI from the start: semantic controls, labels, keyboard/focus behavior, touch interaction and reduced motion. Include relevant loading, empty, missing, stale, failed, unavailable, offline and coming-soon states. Keep source/context links usable. Desktop screenshots do not define mobile layouts or motion. Compare the rendered frontend with relevant references at meaningful UI checkpoints.

## Development and testing cadence

**Default loop: develop related pieces → add focused unit coverage → run relevant checks at a meaningful checkpoint → fix attributable failures → commit the completed part → continue.** Several edits belong inside a development batch. A checkpoint is a coherent feature/module or a usable workflow, not every saved file or changed line.

Build a substantial, useful unit suite as behavior is implemented. Test the rules whose failure would matter and whose failure should be easy to locate:

- Validation, units/conversions, deterministic calculations and boundary cases, including missing/invalid inputs.
- Plan/task/decision transitions, corrections and authoritative fact ownership.
- Farm/private-data isolation, allowed/denied tools and messaging grants.
- Message/job deduplication, retries, cancellation and interrupted-run recovery.
- Connector normalization, evidence validity/freshness and unavailable/malformed data.

Write small tests named for observable behavior. Include normal, important failure and edge cases; assert useful outcomes rather than implementation details. Use deterministic fixtures, fake clocks and provider doubles for unit tests. Keep live API/Codex checks separate. Use a few focused integration tests where the real boundary matters, such as SQLite transactions/migrations, Cedar enforcement, adapters and SSE recovery. Do not mock the rule being tested.

At a completed part, batch the affected formatting/lint, type checks and relevant unit/integration tests. Run only existing applicable scripts; create clear scripts during scaffolding rather than pretending commands already exist. A full unit run is appropriate when it is cheap or shared changes affect many modules. Use a full build and selected browser/manual flows at larger feature or phase checkpoints and for integration-sensitive changes. Broaden checks when failures, changed boundaries or unresolved concerns justify it.

Do not add a test for every cosmetic edit, snapshot every component, mirror each implementation line with an assertion, chase an arbitrary coverage percentage, or run expensive E2E/build/full-suite checks after every small change. Avoid heavyweight pre-commit/save hooks that enforce that cadence. Stable CI checks can protect shared milestones without becoming a local edit-by-edit loop. Documentation-only changes need a focused read/link/diff check, not an application build.

When a check fails, identify and fix the cause with the smallest relevant reproducer/check, then return to development. Do not repeatedly run unchanged passing suites. Record unrelated pre-existing failures clearly; do not hide them or expand the task into unrelated repairs. State what was verified and what remains unverified. Meaningful unit coverage and fault isolation take priority over raw test counts.

## Git and commit discipline

**Make a local commit after each meaningful completed part. Do not wait until the whole project or task is finished.** Examples: workspace foundation, farm-profile persistence, a shared UI/workspace component, an agent adapter, durable messaging, or a complete page/workflow. Keep commits small enough to understand/revert and large enough to represent a coherent result.

- Inspect status/diff and stage explicit task-owned paths. Do not sweep unrelated files into a commit with `git add .`. Include relevant tests and manifest/lockfile/migration changes with the behavior they support.
- Use clear messages describing the result, for example `feat: add farm profile persistence`, `fix: deduplicate agent message delivery`, `test: cover plan approval transitions`, or `docs: clarify contributor workflow`.
- Run the checkpoint checks appropriate to that part before committing it. Do not rerun the whole suite just to create a commit after relevant checks already passed. Do not commit known attributable failures as a completed feature.
- Continue on the task's existing branch unless the user requests otherwise or isolation is needed; new branches use `raun6k/` by default. Never overwrite/revert user work, rewrite history or amend someone else's commits to make the tree look clean.
- Local commits are authorized by the user's requested workflow; do not ask for permission each time. Do not push, publish, deploy or open a public PR unless the user authorizes that action.
- This checkout currently excludes `docs/` locally. Preserve that boundary during ordinary implementation; do not accidentally add the reference archive/private artifacts when staging. `AGENTS.md` should be versioned so this guidance accompanies the source. Publishing the design docs/assets is a separate scoped change.

## Completion and handoff

Finish the authorized scope, leave meaningful parts in coherent local commits, and report the changed behavior, relevant verification, commit IDs and material remaining gaps concisely. Distinguish fixture tests from live provider/connector success. Keep developing autonomously through routine implementation choices; ask only when a missing decision genuinely blocks progress or changes the agreed product scope.
