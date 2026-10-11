# Sakha — Environmental Hacks 2026

## Problem

Most of India's farms are small. In the Agriculture Census 2015-16, small and marginal holdings (under 2 hectares) were 86.21% of operational holdings and 47.34% of the operated area ([All India Report, as released by the Ministry of Agriculture & Farmers Welfare](https://www.thehinducentre.com/the-arena/current-issues/article28682480.ece/binary/T1_ac_2015_16.pdf)). Those farmers feel a failed rain week immediately.

El Niño raises that risk. The India Meteorological Department says El Niño generally suppresses the summer monsoon: below-normal rain, more dry spells, hotter weather, and lower agricultural productivity. IMD lists 1982, 1987, 2002, 2009 and 2015 among the drought years that coincided with El Niño, and notes that not every El Niño is a drought ([IMD FAQ on ENSO and the monsoon](https://mausam.imd.gov.in/imd_latest/FAQ_ENSO_IOD.pdf)). In the Lok Sabha on 5 August 2026 the Ministry of Earth Sciences said that, since 1950, 16 El Niño years included 7 in which Indian monsoon rainfall was below normal ([Unstarred Question 2973](https://sansad.in/getFile/lsapps/loksabhaquestions/annex/188/AU2973_ciCkhd.pdf)). NOAA treats an Oceanic Niño Index of +0.5 °C or more as El Niño ([CPC ONI](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php)).

The demo farmer is Kavita Meshram of Kalmeshwar, Nagpur: soybean on 1.6 ha at pods drying, cotton on 0.8 ha, one borewell. The committed NOAA table in this repo shows JAS 2026 at +2.16 °C, and the committed Open-Meteo forecast for her field totals about 1.3 mm over seven days. She needs one week of decisions, not a dashboard of indices.

## Solution

Sakha is a phone-first farm team. Sakha leads. Megha speaks for weather, Jal for water, Kheti for the crop, and Paisa for money. Home shows the risk in a sentence, a Daily Brief from each teammate, and one plan with rupees. The plan on the seeded farm is to cut the soybean in the dry week, sell toward the cached Nagpur modal of ₹6,175 per quintal (MSP ₹5,708), spend ₹5,600 on harvest labour, and treat ₹12,960 as the modal-minus-minimum gap on 19.2 quintals. That gap is not a promised sale. Where a figure was never fetched, the answer names the next safe step, such as a free soil test at the KVK, instead of inventing a dose.

## Implementation

The app is a pnpm workspace: a React client, a Fastify API, SQLite, and shared contracts. `pnpm seed:demo` loads Kavita's farm, the approved plan, and the team chats from `packages/data/cache`. `pnpm dev` serves that database, so the demo works with no model key. Adapters return data, a source, and a fetch time, and keep the committed cache when a live call fails.

## AWS integration

The lead-and-tools shape is Strands Agents: Sakha calls Megha, Jal, Kheti and Paisa as tools, and does not let them consult each other. Cedar policies in `policies/sakha-v1.cedar` are the lane rules. A seeded Megha chat asks for the mandi price; the server calls Cedar, stores the deny for Megha and the allow for Paisa, and the screen shows that decision. Optional live wording uses Amazon Bedrock (`SAKHA_STRANDS_PROVIDER=bedrock`), OpenAI, or Codex. This submission runs the seeded path. It is not deployed as an AWS account.

## AI tool disclosure

Cursor cloud agents, using Grok, wrote the integration and the polish pass.

**Owner: add your other tools here before you submit.**

## Impact

A farmer who cannot sit with four advisors still gets one checked plan: how much rain is forecast, whether to pump, whether the crop is ready, and what the cached mandi and MSP imply in rupees, each with a source line. The demo does not claim a yield gain. It shows the decision Kavita can take this week, and it refuses an answer that would cross a teammate's lane.
