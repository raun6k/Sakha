# Captured official source evidence

This bundle was captured on 11 October 2026 for the public demonstration point 21.15° N, 79.1° E, Nagpur. Farmer records are invented; these source values are extracted from the actual publishers. The JSON manifest preserves retrieval, issue and validity times, methods, definitions, units, source URLs and grid bounds. Import does not renew those timestamps. Forecasts expire normally.

| Source | Bundled coverage | Publisher |
| --- | --- | --- |
| W03 CHIRPS v3 | September 2025–August 2026: 12 published monthly grid estimates, mm/month | [UCSB Climate Hazards Center](https://chc.ucsb.edu/data/chirps3) |
| W04 CHIRPS-GEFS v3 | Issue 10 October 2026; 11–17 October daily grid forecasts, mm/day | [CHC published forecast files](https://data.chc.ucsb.edu/products/CHIRPS-GEFS/v3/daily/global/2026/10/10/) |
| C01–C05 | Published RONI history, ENSO probabilities, RONI outlook, Niño3.4 anomalies and Indian Ocean Dipole index, including real missing points | [NOAA CPC](https://www.cpc.ncep.noaa.gov/data/indices/), [NOAA PSL climate indices](https://psl.noaa.gov/data/climateindices/list/) |
| W01 | Nagpur district forecast issued 10 October, daily conditions 10–16 October | [IMD RMC Nagpur](https://mausam.imd.gov.in/nagpur/) |
| A07 | Vidarbha agromet guidance for 9–13 October | [IMD agromet advisories](https://mausam.imd.gov.in/imd_latest/contents/agromet-advisory.php) |

September 2026 CHIRPS monthly data and 11 October GEFS issue files were not published at capture time. The importer uses actual published coverage, rather than filling unpublished dates. Rainfall is a grid estimate/forecast, not a measured farm rainfall or irrigation requirement. Pacific indices do not predict this farm's rainfall.

Content-addressed `.txt`/`.html` artifacts preserve the NOAA input. `.range` files preserve the fetched GeoTIFF byte ranges, and their `.json` manifests record upstream URLs, offsets and hashes. Those bytes were replayed through the same grid extractor to validate the point samples. `snapshot.json` carries normalized values and SHA-256 artifact checksums; importing checks every included artifact. It includes concise factual paraphrases of the IMD bulletins with original PDF hashes, page references and source timestamps. The full IMD PDFs are not redistributed here. Their URLs can change as bulletins are replaced, so the original hashes identify the captured documents rather than a future response from the same URL.

Attribute rainfall data to UCSB CHC and climate indices to NOAA CPC/PSL. [CHIRPS data are public domain](https://chc.ucsb.edu/data/chirps). [NOAA explains its public domain materials](https://www.noaa.gov/office-education/outreach-communication/faq). Keep this provenance with redistributed snapshots. No API tokens or private farmer data are included.

To refresh, stop the demo backend and run `./scripts/sakha-demo refresh FARM_ID`. Live fetching is a separate operation; failures are reported and never replaced with plausible values. The fixed bundle supports the 12-month presentation view; a five-year rainfall dataset or daily historical view requires separately published and processed evidence. The regional drought processing feature is not implemented and has been removed from the presentation page.
