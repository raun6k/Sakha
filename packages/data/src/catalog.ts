import { Source } from "@sakha/contracts";
export const catalog = [
  {
    id: "A07",
    name: "IMD National Agromet Advisory",
    url: "https://mausam.imd.gov.in/imd_latest/contents/agromet/agromet-data/national/current/current-pdf/national_current.pdf",
    definition:
      "National bulletin with region-specific advisory sections; distinct from block/district local-language products",
    geography: "Explicit cited regional section",
    capability: {
      key: "A07",
      status: "disabled",
      reason: "Curated regional imports require validity checks",
      requirements: [],
    },
    freshness: { status: "missing" },
  },
  {
    id: "C01",
    name: "NOAA \u2014 Relative Oceanic Ni\u00f1o Index (RONI)",
    url: "https://cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/",
    definition: "Historical and current ENSO phase and intensity",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "C01",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "C02",
    name: "NOAA \u2014 Official ENSO Probabilities",
    url: "https://cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/probabilities.php",
    definition:
      "Probabilities of El Ni\u00f1o, La Ni\u00f1a and neutral conditions",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "C02",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "C03",
    name: "NOAA \u2014 RONI Outlook",
    url: "https://cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/outlook/",
    definition: "Forecast index ranges and uncertainty percentiles",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "C03",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "C04",
    name: "NOAA PSL \u2014 Ni\u00f1o 3.4 SST Index",
    url: "https://psl.noaa.gov/data/timeseries/month/Nino34_CPC/",
    definition: "Historical Pacific temperature anomalies",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "C04",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "C05",
    name: "NOAA PSL \u2014 Dipole Mode Index",
    url: "https://psl.noaa.gov/data/timeseries/month/DMI/",
    definition: "Indian Ocean Dipole measurements",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "C05",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "C06",
    name: "NOAA OISST v2.1 \u2014 Daily Sea-Surface Temperature",
    url: "https://www.ncei.noaa.gov/products/optimum-interpolation-sst",
    definition:
      "Detailed daily ocean-temperature monitoring; optional advanced source",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "C06",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "C07",
    name: "IMD \u2014 Seasonal Forecasts",
    url: "https://mausam.imd.gov.in/responsive/seasonal_forecast.php",
    definition: "Official Indian seasonal rainfall and temperature outlooks",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "C07",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "W01",
    name: "IMD \u2014 Weather Forecast Portal",
    url: "https://mausam.imd.gov.in/",
    definition: "Short- and extended-range weather forecasts",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "W01",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "W02",
    name: "IMD \u2014 Districtwise Weather Warnings",
    url: "https://mausam.imd.gov.in/responsive/districtWiseWarning.php",
    definition: "Official warnings for heavy rainfall, heat and other hazards",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "W02",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "W03",
    name: "CHIRPS v3 \u2014 Historical and Recent Rainfall",
    url: "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/",
    definition: "Localized rainfall history and observed rainfall deficits",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "W03",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "W04",
    name: "CHIRPS3-GEFS \u2014 Ensemble Rainfall Forecasts",
    url: "https://data.chc.ucsb.edu/products/CHIRPS-GEFS/v3/",
    definition: "Short-range rainfall scenarios and dry-spell risk",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "W04",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "A01",
    name: "ICAR-CRIDA \u2014 District Crop Contingency Plans",
    url: "https://www.icar-crida.res.in/Crop_Contingency_Plan.html",
    definition:
      "Delayed sowing, crop substitution and drought-response recommendations",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "A01",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "A02",
    name: "ICAR-CRIDA \u2014 Crop Contingency Portal",
    url: "https://icar-crida.res.in/ccp.html",
    definition:
      "Strategies by crop stage, drought type and extreme-weather event",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "A02",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "A03",
    name: "IMD \u2014 Block Agromet Advisories, English",
    url: "https://mausam.imd.gov.in/responsive/agromet_adv_ser_block_current_en.php",
    definition: "Weather-informed crop-management recommendations",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "A03",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "A04",
    name: "IMD \u2014 District Agromet Advisories, Local Languages",
    url: "https://mausam.imd.gov.in/responsive/agromet_adv_ser_district_current_lo.php",
    definition: "Regional and local-language farming guidance",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "A04",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "A05",
    name: "FAO ASIS \u2014 Near-Real-Time Agricultural Stress Index",
    url: "https://www.fao.org/giews/earthobservation/access.jsp",
    definition: "Crop-area drought stress indicators",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "A05",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "A06",
    name: "FAO ASIS \u2014 Vegetation Health, Condition and Phenology Products",
    url: "https://www.fao.org/giews/earthobservation/access.jsp",
    definition: "Regional vegetation anomalies and growing-season conditions",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "A06",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "M01",
    name: "e-NAM \u2014 AGMARKNET Price Dashboard",
    url: "https://www.enam.gov.in/web/dashboard/agmarknet",
    definition:
      "Mandi prices, crop varieties, arrivals, dates and market comparisons",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "M01",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "M02",
    name: "e-NAM vs AGMARKNET Price Dashboard",
    url: "https://www.enam.gov.in/web/dashboard/Agm_Enam_ctrl",
    definition: "Comparison of price information across participating markets",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "M02",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "G01",
    name: "Government \u2014 El Ni\u00f1o Agricultural Contingency Strategy",
    url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2277178",
    definition:
      "Identifies drought-preparedness measures and government response",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "G01",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "G02",
    name: "PMFBY \u2014 Crop Insurance Portal",
    url: "https://pmfby.gov.in/",
    definition:
      "Explains insurance coverage, rules and farmer application pathways",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "G02",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
  {
    id: "G03",
    name: "PM-KISAN \u2014 Scheme Portal",
    url: "https://pmkisan.gov.in/",
    definition: "Explains income-support rules and application processes",
    geography: "Source-specific coverage; verify applicability",
    capability: {
      key: "G03",
      status: "disabled",
      reason: "No verified parser/coverage yet",
      requirements: ["source-specific parser and applicability validation"],
    },
    freshness: {
      status: "missing",
    },
  },
].map((source) => Source.parse(source));
