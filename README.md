# Sakha

A local farming Command Center with one loopback backend and persistent farm-scoped specialist roles. Implementation follows the locally maintained architecture and parallel build plan.

## Development

Requires Node.js 24 LTS and pnpm 12.10.1. Install with `pnpm install`, run `pnpm dev`, or use `pnpm dev:server` / `pnpm dev:web`. The Vite frontend proxies `/api` to port 4310. `pnpm lint`, `pnpm typecheck` and `pnpm test` verify the workspace. `pnpm build` builds the UI and server; `pnpm start` launches the backend.


Credentials belong only in the backend environment or OS keyring. `.env.example` records empty configuration placeholders. Actual runtime/provider/source support is gated on separate live verification; fixture examples never imply live agronomic advice. No farmer account is required. The application is local while API models may process consented context externally.

Shared browser contracts and transport conventions are in `packages/contracts/README.md`. Private design docs and original visual references remain locally excluded from Git. The project license and advertised platform support remain release decisions.
