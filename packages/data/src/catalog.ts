import { Source } from "@sakha/contracts";

const missing = { status: "missing" as const };

function source(
  id: string,
  name: string,
  url: string,
  definition: string,
  status: "enabled" | "declared" | "degraded",
  reason?: string,
) {
  return {
    id,
    name,
    url,
    definition,
    geography: "Stated on each imported series or document",
    capability: {
      key: id,
      status,
      reason,
      requirements: [],
    },
    freshness: missing,
  };
}

/** Sources with a working parser or a committed cache. Disabled catalogs stay out of the list. */
export const catalog = [
  source(
    "C01",
    "NOAA — Relative Oceanic Niño Index",
    "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/",
    "Second NOAA Pacific index, ERSSTv6, parsed from the official table",
    "enabled",
  ),
  source(
    "C02",
    "NOAA — Official ENSO probabilities",
    "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/probabilities.php",
    "El Niño, La Niña and neutral probabilities when the operator refreshes them",
    "declared",
    "Parsed on refresh; not part of the demo cache",
  ),
  source(
    "C03",
    "NOAA — index outlook",
    "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/outlook/",
    "Forecast index ranges when the operator refreshes them",
    "declared",
    "Parsed on refresh; not part of the demo cache",
  ),
  source(
    "C04",
    "NOAA PSL — Niño 3.4 SST index",
    "https://psl.noaa.gov/data/timeseries/month/Nino34_CPC/",
    "Monthly Pacific temperature anomalies when the operator refreshes them",
    "declared",
    "Parsed on refresh; not part of the demo cache",
  ),
  source(
    "C05",
    "NOAA PSL — Dipole Mode Index",
    "https://psl.noaa.gov/data/timeseries/month/DMI/",
    "Indian Ocean Dipole measurements when the operator refreshes them",
    "declared",
    "Parsed on refresh; not part of the demo cache",
  ),
  source(
    "C08",
    "NOAA — Oceanic Niño Index",
    "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt",
    "Oceanic Niño Index anomaly used for the El Niño state",
    "enabled",
  ),
  source(
    "W01",
    "IMD — district forecast, curated",
    "https://mausam.imd.gov.in/",
    "Curated district forecast text. IMD does not provide a live JSON feed here",
    "declared",
    "Imported from a curated bulletin, not a live API",
  ),
  source(
    "W03",
    "CHIRPS v3 — historical rainfall",
    "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/",
    "Gridded rainfall history for the bundled snapshot and operator refresh",
    "enabled",
  ),
  source(
    "W04",
    "CHIRPS-GEFS — ensemble rainfall forecast",
    "https://data.chc.ucsb.edu/products/CHIRPS-GEFS/v3/",
    "Short-range ensemble-mean rainfall for the bundled snapshot and operator refresh",
    "enabled",
  ),
  source(
    "W05",
    "Open-Meteo forecast",
    "https://api.open-meteo.com/v1/forecast",
    "16-day rain, temperature and reference evaporation for an Indian farm location",
    "enabled",
  ),
  source(
    "W06",
    "Open-Meteo past rainfall",
    "https://archive-api.open-meteo.com/v1/archive",
    "Archive precipitation for the current season at an Indian farm location",
    "enabled",
  ),
  source(
    "W07",
    "NASA POWER daily point",
    "https://power.larc.nasa.gov/api/temporal/daily/point",
    "Corrected precipitation and maximum temperature for an Indian farm location",
    "enabled",
  ),
  source(
    "A07",
    "IMD national agromet advisory, curated",
    "https://mausam.imd.gov.in/imd_latest/contents/agromet/agromet-data/national/current/current-pdf/national_current.pdf",
    "Curated national advisory text",
    "declared",
    "Imported from a curated bulletin, not a live API",
  ),
  source(
    "M01",
    "Agmarknet mandi prices",
    "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070",
    "data.gov.in Agmarknet resource. Live when DATA_GOV_IN_API_KEY is set; otherwise the committed cache",
    "degraded",
    "Live calls need DATA_GOV_IN_API_KEY. The demo cache is an attributed republish, not a live resource body",
  ),
  source(
    "G04",
    "PIB kharif MSP",
    "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2260618",
    "Soybean (Yellow) MSP read from the cited PIB release",
    "enabled",
  ),
].map((item) => Source.parse(item));
