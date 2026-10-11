# Data adapters

Every live adapter returns the same envelope:

```ts
{
  data: T,
  source: { id: string, name: string, url: string, live: boolean },
  fetched_at: string // ISO-8601 with a timezone
}
```

`source.live` is false when the body came from `packages/data/cache`. A farm inside India can be fetched. The committed weather and mandi cache applies only within 0.02° of the demo point (21.15 N, 79.1 E). Another Indian farm does not receive the Nagpur forecast. The Niño index and the MSP table are not location-specific and can fall back anywhere.

| Id | What | Live key |
|---|---|---|
| W05 | Open-Meteo 16-day rain, temperature, evaporation | none |
| W06 | Open-Meteo past rainfall | none |
| W07 | NASA POWER corrected precipitation | none |
| C08 | NOAA Oceanic Niño Index | none |
| C01 | NOAA second Pacific index | none |
| M01 | Agmarknet via data.gov.in resource `9ef84268-d588-465a-a308-a864a43d0070` | `DATA_GOV_IN_API_KEY`, otherwise the committed cache |
| G04 | PIB soybean MSP | none |

`loadDemoCache()` reads the committed files. `refreshDemoCache()` tries the network and falls back to those files for the demo point. Startup never calls the network; it only loads the cache.

`GET /api/v1/farms/:id/insights` returns series for C01, C08, W01, W03, W04, W05, W06, W07 and M01. Home reads the newest weather finding title (unless the evidence is the curated W01 bulletin) and the newest climate finding title. `team_status` on home is:

```ts
{ id: "sakha" | "megha" | "jal" | "kheti" | "paisa", name: string, line: string }[]
```

Seeded replies use the shared card:

```ts
{
  agent, headline, do, why, risk, confidence,
  sources: { title, url?, adapter?, fetched_at }[],
  cost_inr?, benefit_inr?, handoff_suggestion?, out_of_scope?,
  forecast_days?, action?, mm?, pump_hours?, prices?
}
```

Messages may also carry `team_id`, `reviewed_by` and `consulted`. Memory rows keep the charter key in `key` and in the searchable text.
