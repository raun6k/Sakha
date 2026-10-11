# Sakha reproducible demo

This demo uses the normal local HTTP/SQLite/Cedar/Codex application. It seeds an isolated, explicitly labeled farm with invented farmer reports, fields, decisions, reminders and completed observations. It does not manufacture weather or climate observations.

```sh
./scripts/sakha build
./scripts/sakha-demo init
./scripts/sakha-demo start
```

Open http://127.0.0.1:4396. The launcher uses `.local/demo/sakha.sqlite`, separate from the normal OS application-data profile. Existing Codex authentication powers all nine agents using GPT-6 Luna; no API key is required. The installed Codex runtime and account access are required for real replies. The demo seed includes a grant for sending its public illustrative records/conversation to Codex; real farmer profiles require their own grants.

Stop the demo backend before running `./scripts/sakha-demo reset`. Reset refuses normal unmarked databases and installations with additional farms. It discards changes made to this dedicated demo and restores the seed. `init` is idempotent. Files in `.local` are ignored; the seed code and attributed source snapshot are versioned.

The Nagpur sample point (21.15 N, 79.1 E) is a public demonstration grid point, not a surveyed farm location. Changing it invalidates rainfall projections for the old point until actual sources are refreshed. Invented field areas sum to 2.4 ha. The approved harvest-preparation checklist, separate pending proposal and confirmed work remain distinct; no irrigation dose or profitability promise is invented.

The legacy `?demo=1` frontend fixture mode is a separate software-test fixture with synthetic datasets. Use the commands above for the presentation demo with actual sources and real agent turns.

Official snapshots retain their original retrieval/issue/validity times and expire normally. They are not a guarantee that a later checkout has fresh weather. Read `sources/README.md` for captured coverage and attribution. To refresh live evidence after stopping the backend, use `./scripts/sakha-demo refresh FARM_ID`; an upstream failure remains a reported failure rather than fabricated data.
