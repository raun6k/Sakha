# Sakha reproducible demo

This demo uses the normal local HTTP/SQLite/Cedar application. It seeds one named farm, Kavita Meshram of Kalmeshwar in Nagpur district, with soybean on 1.6 ha and cotton on 0.8 ha, a borewell, and one approved harvest plan. Prices, rain and the Niño index come from the adapter cache. Farmer-reported items (yield, harvest labour, sowing date, the green patch) are labelled as her report.

```sh
pnpm seed:demo
./scripts/sakha build
./scripts/sakha-demo init
./scripts/sakha-demo start
```

`pnpm seed:demo` writes `.local/demo/sakha.sqlite` unless `SAKHA_DATABASE_PATH` is set. It tries a live refresh, then uses `packages/data/cache` if a source does not answer. `SAKHA_SEED_LIVE=0` skips the network. Running it again does not duplicate the farm, the conversations, or the imported series.

Open http://127.0.0.1:4396. The launcher uses `.local/demo/sakha.sqlite`, separate from the normal OS application-data profile. Existing Codex authentication powers the farm roles using GPT-6 Luna; no API key is required. The installed Codex runtime and account access are required for real replies. The demo seed includes a grant for sending its public records and conversation text to Codex; real farmer profiles require their own grants.

Stop the demo backend before running `./scripts/sakha-demo reset`. Reset refuses normal unmarked databases and installations with additional farms. It discards changes made to this dedicated demo and restores the seed. `init` and `pnpm seed:demo` are idempotent. Files in `.local` are ignored; the seed code and attributed source snapshot are versioned.

The demo farm is 21.15 N, 79.1 E, near Kalmeshwar. Other Indian locations keep their own coordinates. Soybean 1.6 ha and cotton 0.8 ha are the farmer's figures. The one approved plan is to cut the soybean in the dry week and sell at the cached Nagpur modal. The rupee benefit is the modal-minus-minimum gap on her expected quintals, not a promised sale. Where a number was never fetched, the saved answer gives the next safe step: a free soil test at the KVK, leave the pump off, or ask the bank for the PMFBY date.

`pnpm seed:demo && pnpm dev` opens the same farm at http://127.0.0.1:5173. Saved team chats are on screen with no model key. A live model is optional; see the root README.

Official snapshots retain their original retrieval/issue/validity times and expire normally. They are not a guarantee that a later checkout has fresh weather. Read `sources/README.md` for captured coverage and attribution. To refresh live evidence after stopping the backend, use `./scripts/sakha-demo refresh FARM_ID`; an upstream failure remains a reported failure rather than fabricated data.
