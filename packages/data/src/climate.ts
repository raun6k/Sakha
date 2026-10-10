import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type * as c from "@sakha/contracts";
import { DomainError } from "@sakha/farm";
import {
  boundedFetch,
  type createDataServices,
  parsePslMonthly,
} from "./index.js";

const seasons = [
  "DJF",
  "JFM",
  "FMA",
  "MAM",
  "AMJ",
  "MJJ",
  "JJA",
  "JAS",
  "ASO",
  "SON",
  "OND",
  "NDJ",
];
export function parseOutlook(html: string, kind: "probabilities" | "outlook") {
  const issue = html.match(/Issued ([A-Za-z]+) (\d{4})/);
  if (!issue)
    throw new DomainError("validation", "Forecast issue month missing");
  const date = new Date(`${issue[1]} 1, ${issue[2]} 00:00:00 UTC`);
  if (!Number.isFinite(date.getTime()))
    throw new DomainError("validation", "Invalid forecast issue time");
  const table = html.match(
    new RegExp(
      `<table id="${kind === "outlook" ? "outlook" : "probabilities"}-table"[^>]*>([\\s\\S]*?)<\\/table>`,
    ),
  )?.[1];
  if (!table)
    throw new DomainError("validation", "Climate forecast table changed");
  const results: { time: string; season: string; values: number[] }[] = [];
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [
      ...(row[1] ?? "").matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/g),
    ].map((m) => (m[1] ?? "").replace(/<[^>]+>/g, " ").trim());
    const season = cells[0]?.slice(0, 3);
    const index = seasons.indexOf(season ?? "");
    if (index === -1) continue;
    const values = cells.slice(1).map(Number);
    if (
      values.some((x) => !Number.isFinite(x)) ||
      values.length !== (kind === "outlook" ? 7 : 3)
    )
      throw new DomainError("validation", "Forecast values malformed");
    if (
      kind === "probabilities" &&
      (values.some((x) => x < 0 || x > 100) ||
        Math.abs(values.reduce((a, b) => a + b, 0) - 100) > 1)
    )
      throw new DomainError(
        "validation",
        "Probabilities do not sum to 100 percent",
      );
    if (
      kind === "outlook" &&
      values.some((v, i) => i > 0 && v < (values[i - 1] ?? v))
    )
      throw new DomainError("validation", "Forecast quantiles are not ordered");
    const year =
      date.getUTCFullYear() + (index < date.getUTCMonth() - 1 ? 1 : 0);
    results.push({
      time: new Date(Date.UTC(year, index, 15)).toISOString(),
      season: season ?? "",
      values,
    });
  }
  if (!results.length)
    throw new DomainError("validation", "Forecast rows missing");
  return {
    issued_at: date.toISOString(),
    issue_precision: "month",
    rows: results,
  };
}
export async function refreshClimateExtras(
  services: ReturnType<typeof createDataServices>,
  farmId: string,
  artifactDir: string,
  retrieved: string,
) {
  const results: { source: string; status: string; reason?: string }[] = [];
  const configurations = [
    {
      id: "C02",
      url: "https://cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/probabilities/",
      kind: "probabilities",
    },
    {
      id: "C03",
      url: "https://cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/outlook/",
      kind: "outlook",
    },
    {
      id: "C04",
      url: "https://psl.noaa.gov/data/correlation/nina34.anom.data",
      kind: "nino",
    },
    {
      id: "C05",
      url: "https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data",
      kind: "dmi",
    },
  ];
  for (const config of configurations) {
    try {
      const raw = await boundedFetch(config.url);
      const text = new TextDecoder().decode(raw.data);
      const hash = createHash("sha256").update(raw.data).digest("hex");
      writeFileSync(join(artifactDir, `${hash}.txt`), raw.data, {
        mode: 0o600,
      });
      let groups: { variable: string; points: c.Series["points"] }[] = [];
      let issuedAt: string | undefined;
      let baseline: string | undefined;
      let definition: string;
      if (config.kind === "nino") {
        if (
          !text.includes("ERSST V6") ||
          !text.includes("1981-2010") ||
          !text.includes("units=degC")
        )
          throw new DomainError(
            "validation",
            "Nino3.4 data definition changed",
          );
        groups = [{ variable: "Nino3.4", points: parsePslMonthly(text) }];
        baseline =
          "ERSSTv6 anomalies from 1981–2010; actual data payload differs from older v5 landing page";
        definition =
          "Nino3.4 SST anomalies,5N–5S170W–120W, monthly degrees Celsius. Not RONI.";
      } else if (config.kind === "dmi") {
        if (!text.includes("DMI HadISST1.1") || !text.includes("50E-70E"))
          throw new DomainError("validation", "DMI definition changed");
        groups = [{ variable: "DMI", points: parsePslMonthly(text, -9999) }];
        definition =
          "HadISST1.1 monthly west50–70E10S–10N minus east90–110E10S–0 SST anomaly difference; anomaly climatology baseline years unverified. Preliminary values.";
      } else {
        const parsed = parseOutlook(
          text,
          config.kind === "outlook" ? "outlook" : "probabilities",
        );
        issuedAt = parsed.issued_at;
        baseline =
          "RONI source forecast; issued month precision, exact release time unknown";
        definition =
          config.kind === "outlook"
            ? "NOAA RONI outlook seasonal percentile values; source-provided uncertainty"
            : "NOAA probabilities of La Nina/neutral/El Nino; seasonal source probabilities do not predict this farm";
        groups =
          config.kind === "outlook"
            ? [
                {
                  variable: "RONI_outlook",
                  points: parsed.rows.map((r) => ({
                    time: r.time,
                    value: r.values[3] ?? null,
                    lower: r.values[0],
                    upper: r.values[6],
                  })),
                },
              ]
            : [
                "La_Nina_probability",
                "neutral_probability",
                "El_Nino_probability",
              ].map((variable, i) => ({
                variable,
                points: parsed.rows.map((r) => ({
                  time: r.time,
                  value: r.values[i] ?? null,
                })),
              }));
        definition += ` Normalized source rows: ${JSON.stringify(parsed.rows)}`;
      }
      for (const group of groups) {
        const from = group.points[0]?.time ?? retrieved,
          to = group.points.at(-1)?.time ?? retrieved;
        services.persistSeries(
          farmId,
          {
            source_id: config.id,
            method_version: `noaa-${config.kind}.v1`,
            variable: group.variable,
            unit: config.kind === "probabilities" ? "percent" : "degC",
            kind: issuedAt ? "forecast" : "observed",
            geography:
              config.kind === "dmi"
                ? "Tropical Indian Ocean"
                : "Tropical Pacific",
            resolution: issuedAt ? "3-month season" : "monthly index",
            baseline,
            supported_range: { from, to },
            freshness: {
              status: "fresh",
              retrieved_at: retrieved,
              valid_until: new Date(
                Date.parse(retrieved) + 86400000,
              ).toISOString(),
            },
            completeness: group.points.some((p) => p.value === null)
              ? "partial"
              : "complete",
            points: group.points,
            origin: "live_source",
          },
          {
            source_id: config.id,
            title: group.variable,
            text: definition,
            url: config.url,
            issued_at: issuedAt,
            retrieved_at: retrieved,
            geography:
              config.kind === "dmi"
                ? "Tropical Indian Ocean"
                : "Tropical Pacific",
            kind: issuedAt ? "forecast" : "observation",
            unit: config.kind === "probabilities" ? "percent" : "degC",
            origin: "live_source",
            hash,
            method_version: `noaa-${config.kind}.v1`,
            citation: {
              section: "Validated official source table/payload definition",
            },
          },
        );
      }
      results.push({ source: config.id, status: "enabled" });
    } catch (error) {
      results.push({
        source: config.id,
        status: "unavailable",
        reason: error instanceof Error ? error.message : "Source import failed",
      });
    }
  }
  return results;
}
