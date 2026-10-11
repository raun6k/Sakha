import type { Series } from "@sakha/contracts";
/** A filtered monthly value cannot stand in for a daily measurement. */
export function supportsRequestedInterval(
  series: Pick<Series, "source_id" | "unit">,
  range: string,
) {
  if (series.source_id !== "W03") return true;
  if (range.endsWith("days")) return series.unit === "mm/day";
  if (range.endsWith("months")) return series.unit === "mm/month";
  return true;
}
