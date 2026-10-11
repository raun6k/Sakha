# Sakha

Sakha is a local farming Command Center with one loopback backend, a browser interface and nine persistent farm-scoped specialist roles. Farmer facts, evidence, conversations, scenarios, plans and confirmed work have separate records. Approving a plan never records irrigation, spending, sowing or a sale.

## Run locally

Use Node.js 24 LTS and pnpm 12.10.1. The lockfile records installed dependency versions. `./scripts/sakha` accepts the same arguments as `pnpm`; on this development machine it uses the tested ignored local toolchain because the default shell has Node 20. It does not change your system installation. On another checkout, install the required Node/pnpm versions first.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Development uses the browser at `http://127.0.0.1:5173` and backend at `http://127.0.0.1:4310`. The frontend proxies `/api` to the backend. For a single-origin release:

```sh
pnpm build
pnpm start
```

Open `http://127.0.0.1:4310`. Release startup loads compiled JavaScript with the `sakha-release` export condition, serves the built UI, applies checksum-verified SQLite migrations and locks the selected database. `SAKHA_PORT` selects another loopback port. `SAKHA_DATABASE_PATH` selects a database; otherwise `env-paths` chooses the operating system's Sakha application-data directory. Stop the process before changing releases or using the operator CLI. Preserve the database and its WAL files together when backing up a stopped application. A migration checksum mismatch stops startup without replacing the database.

There is no farmer account or password. Bootstrap creates a process-local session for API commands, evidence, downloads and SSE. A backend restart expires it. The browser renews read access; uncertain mutations retain their original idempotency key. Host/origin checks and Cedar tool authorization still apply.

## Runtime and public evidence

Copy `.env.example` to `.env` and fill the selected runtime configuration. Release startup, development backend and operator commands load this ignored file; exported environment variables take precedence. Keep the file private. Choose either the installed Codex runtime with `SAKHA_CODEX_ENABLED=true`, or the Strands/OpenAI runtime with `OPENAI_API_KEY` and `SAKHA_OPENAI_MODEL`. An optional `SAKHA_OPENAI_KEYRING_ACCOUNT` reads an existing OS-keyring credential. The Codex path uses your existing Codex login and subscription allowance; it does not require an OpenAI API key. API credentials are needed only if you choose the alternative Strands/OpenAI runtime. Sakha never copies Codex tokens into API-key storage. All external runtime turns, including Codex, require explicit role/field grants for external processing, including conversation text.

The Codex adapter uses the pinned installed app-server protocol, an ephemeral read-only workspace, no native shell/browser tools or general network access, and eight scoped Sakha MCP tools. Native continuation, approval escalation and image analysis are unavailable. Uploaded JPEG/PNG/WebP photos remain local; upload does not imply analysis.

Core public connectors cover NOAA RONI, ENSO probabilities/outlook, Niño3.4 and DMI indices, CHIRPS v3 rainfall estimates and CHIRPS-GEFS ensemble-mean forecasts. Daily and monthly rainfall are separate products. Daily CHIRPS uses pentad disaggregation with IMERG Late V07; its 0.1° input is bilinearly resampled to the 0.05° CHIRPS grid. A native containing-cell sample is an estimate, not a farmer rain-gauge observation. Unpublished, missing or failed samples remain gaps with reasons. Preliminary daily estimates remain identified and can be replaced by final data. Forecasts retain issue and validity windows. Intermittent upstream failures degrade capability rather than supplying plausible values.

Attributed curated official documents can provide qualitative district weather, regional crop guidance, historical contingency context and public scheme checklists. These retain original raw hashes, separate curated-content hashes, pages, date precision and geographic scope. Current district crop bulletins, market-price extraction, individual eligibility and state seasonal insurance enrollment remain separate gates. A market arithmetic scenario accepts supplied prices as hypotheses; it does not create a live market quote or promise proceeds.

```sh
pnpm operator farms
pnpm operator refresh FARM_ID 30 7
pnpm operator import FARM_ID CURATED_JSON RAW_PDF
pnpm operator market-import FARM_ID QUOTE_JSON RAW_SOURCE
```

Refresh requires an explicitly supplied farm location; it never invents a coordinate. The operator records actual source artifacts and normalized evidence in local storage. Public source retrieval needs no farmer credentials. The CLI is an operator interface, not a farmer setup step.

## Persistence and verification

All multi-record commands use SQLite transactions, optimistic versions and durable idempotency records. Authoritative facts, source snapshots and original corrections remain available until confirmed deletion. The SSE journal retains the latest 5000 events per farm; an older cursor requests an authoritative resync. Transcript history and idempotency records are not aged out automatically. The scheduler runs only while the backend is awake; interrupted external turns are recorded without automatic uncertain retries.

Exports are scoped local JSON downloads with an explicit private-data option and processing bounds. Nonprivate exports use a safe record allowlist and omit conversations, findings, plans, history and other potentially derived private text. Confirmed deletion clears relevant records, FTS memory, private artifacts, peer payloads, event and command caches. Queued deletion blocks new owner-service mutations. Full-farm deletion retains only scope tombstones and its completion record. Fact corrections and grant revocation clear derived memory, cancel affected active turns and mark saved findings for review.

`pnpm lint`, `pnpm typecheck` and `pnpm test` check the workspace. Runtime doubles and synthetic fixtures test deterministic boundaries; they are separate from live provider/source checks. After `pnpm build`, `pnpm test:browser` checks real local HTTP/SQLite browser flows with a deterministic provider double and disposable databases. `pnpm test:demo` checks the separate synthetic UI journeys against a running web server. Shared DTOs and transport conventions live in `packages/contracts/README.md`. Private planning documents and original reference assets remain locally excluded from Git.
