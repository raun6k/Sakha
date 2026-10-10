import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as c from "@sakha/contracts";
import { DomainError, load, type Store } from "@sakha/farm";
import { BaseClient, BaseResponse, fromCustomClient } from "geotiff";
import { z } from "zod";
import { catalog } from "./catalog.js";
import { refreshClimateExtras } from "./climate.js";

export { catalog };

const allowedHosts = new Set([
  "cpc.ncep.noaa.gov",
  "www.cpc.ncep.noaa.gov",
  "psl.noaa.gov",
  "data.chc.ucsb.edu",
  "mausam.imd.gov.in",
  "www.icar-crida.res.in",
  "icar-crida.res.in",
  "pmkisan.gov.in",
  "pmfby.gov.in",
  "pmfby.amnex.co.in",
  "www.pib.gov.in",
]);
export function assertSourceUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !allowedHosts.has(url.hostname)
  )
    throw new DomainError(
      "permission_denied",
      "Source must use a configured official public HTTPS origin",
    );
  return url;
}
export async function boundedFetch(
  url: string,
  maxBytes = 2_000_000,
  headers?: HeadersInit,
  signal = AbortSignal.timeout(30_000),
) {
  assertSourceUrl(url);
  const response = await fetch(url, { redirect: "error", headers, signal });
  if (!response.ok)
    throw new DomainError(
      "unavailable",
      `Official source returned HTTP ${response.status}`,
      true,
    );
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    await response.body?.cancel();
    throw new DomainError(
      "unavailable",
      "Source exceeds the bounded import size",
    );
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new DomainError("unavailable", "Source body missing");
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new DomainError(
        "unavailable",
        "Source exceeds the bounded import size",
      );
    }
    chunks.push(result.value);
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return { response, data };
}
export function parseRoni(html: string) {
  if (
    !html.includes("ERSSTv6") ||
    !html.includes("1991") ||
    !html.includes("2020")
  )
    throw new DomainError(
      "validation",
      "RONI definition/baseline changed; parser review required",
    );
  const table = html.match(
    /<table id="roni-v5-table2"[^>]*>([\s\S]*?)<\/table>/,
  )?.[1];
  if (!table) throw new DomainError("validation", "RONI table missing");
  const points: { time: string; value: number | null; label?: string }[] = [];
  for (const row of table.matchAll(
    /<tr\b[^>]*>([\s\S]*?)(?=<tr\b|<\/tbody>|$)/g,
  )) {
    const cells = [
      ...(row[1] ?? "").matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/g),
    ].map((m) => (m[1] ?? "").replace(/<[^>]+>/g, "").trim());
    const year = Number(cells[0]);
    if (!Number.isInteger(year) || year < 1950 || year > 2200) continue;
    if (cells.length < 2 || cells.length > 13)
      throw new DomainError("validation", "RONI season column count changed");
    for (let month = 1; month <= 12; month++) {
      const text = cells[month];
      const value = text === undefined || text === "" ? null : Number(text);
      if (value !== null && !Number.isFinite(value))
        throw new DomainError("validation", "Invalid RONI number");
      points.push({
        label: [
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
        ][month - 1],
        time: `${year}-${String(month).padStart(2, "0")}-15T00:00:00Z`,
        value,
      });
    }
  }
  if (!points.some((x) => x.value !== null))
    throw new DomainError("validation", "No RONI observations found");
  return points;
}
export function parsePslMonthly(text: string, missingSentinel = -99.99) {
  const points: { time: string; value: number | null }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.trim().split(/\s+/);
    const year = Number(cells[0]);
    if (!Number.isInteger(year) || year < 1850 || year > 2200) continue;
    if (
      cells.length === 2 &&
      Number(cells[1]) >= 1850 &&
      Number(cells[1]) <= 2200
    )
      continue;
    if (cells.length !== 13)
      throw new DomainError(
        "validation",
        "Monthly data row has wrong column count",
      );
    for (let i = 1; i <= 12; i++) {
      const value = Number(cells[i]);
      if (!Number.isFinite(value))
        throw new DomainError("validation", "Malformed monthly source value");
      points.push({
        time: `${year}-${String(i).padStart(2, "0")}-15T00:00:00Z`,
        value: value === missingSentinel ? null : value,
      });
    }
  }
  if (!points.length)
    throw new DomainError("validation", "Monthly rows missing");
  return points;
}
export function containingCell(
  longitude: number,
  latitude: number,
  origin: number[],
  resolution: number[],
  width: number,
  height: number,
) {
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude >= 180 ||
    latitude <= -60 ||
    latitude > 60
  )
    throw new DomainError(
      "unavailable",
      "Point outside verified CHIRPS land-grid coverage",
    );
  const ox = origin[0],
    oy = origin[1],
    rx = resolution[0],
    ry = resolution[1];
  if (
    ox === undefined ||
    oy === undefined ||
    rx === undefined ||
    ry === undefined ||
    rx <= 0 ||
    ry >= 0
  )
    throw new DomainError("validation", "Unexpected raster origin/resolution");
  const column = Math.floor((longitude - ox) / rx),
    row = Math.floor((latitude - oy) / ry);
  if (column < 0 || row < 0 || column >= width || row >= height)
    throw new DomainError("unavailable", "Point outside source grid");
  return {
    column,
    row,
    bounds: [
      ox + column * rx,
      oy + (row + 1) * ry,
      ox + (column + 1) * rx,
      oy + row * ry,
    ] as [number, number, number, number],
    resolution_degrees: rx,
  };
}
class RangeResponse extends BaseResponse {
  constructor(
    private response: Response,
    private data: ArrayBuffer,
  ) {
    super();
  }
  get status() {
    return this.response.status;
  }
  getHeader(name: string) {
    return this.response.headers.get(name) ?? undefined;
  }
  async getData() {
    return this.data;
  }
}
class BoundedRangeClient extends BaseClient {
  bytes = 0;
  reserved = 0;
  etag: string | undefined;
  lastModified: string | undefined;
  total: number | undefined;
  parts: { range: string; hash: string; data: Uint8Array }[] = [];
  async request(options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    const range = headers.get("range");
    if (!range || !/^bytes=\d+-\d+$/.test(range))
      throw new DomainError(
        "validation",
        "Only one bounded byte range is allowed",
      );
    const [start, end] = range.slice(6).split("-").map(Number);
    if (
      start === undefined ||
      end === undefined ||
      end < start ||
      end - start > 2_000_000
    )
      throw new DomainError("unavailable", "Raster range exceeds bounds");
    const requested = end - start + 1;
    if (this.bytes + this.reserved + requested > 8_000_000)
      throw new DomainError(
        "unavailable",
        "Cumulative raster byte budget exceeded",
      );
    this.reserved += requested;
    const result = await boundedFetch(
      this.url,
      Math.min(2_000_000, 8_000_000 - this.bytes),
      headers,
      options.signal ?? AbortSignal.timeout(30_000),
    );
    if (result.response.status !== 206)
      throw new DomainError(
        "unavailable",
        "Raster server must support byte ranges",
      );
    this.reserved -= requested;
    const contentRange = result.response.headers
      .get("content-range")
      ?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
    const etag = result.response.headers.get("etag") ?? undefined;
    const lastModified =
      result.response.headers.get("last-modified") ?? undefined;
    if (
      !contentRange ||
      Number(contentRange[1]) !== start ||
      Number(contentRange[2]) !== end ||
      result.data.length !== requested
    )
      throw new DomainError(
        "validation",
        "Raster range response does not match requested bytes",
      );
    const total = Number(contentRange[3]);
    if (
      this.total !== undefined &&
      (this.total !== total ||
        this.etag !== etag ||
        this.lastModified !== lastModified)
    )
      throw new DomainError("validation", "Raster changed during extraction");
    this.total = total;
    this.etag = etag;
    this.lastModified = lastModified;
    this.bytes += result.data.length;
    this.parts.push({
      range,
      hash: createHash("sha256").update(result.data).digest("hex"),
      data: result.data,
    });
    return new RangeResponse(
      result.response,
      result.data.buffer as ArrayBuffer,
    );
  }
}
export async function extractRainfall(
  url: string,
  longitude: number,
  latitude: number,
  artifactDir?: string,
) {
  if (new URL(assertSourceUrl(url)).hostname !== "data.chc.ucsb.edu")
    throw new DomainError("permission_denied", "Raster URL must belong to CHC");
  const client = new BoundedRangeClient(url);
  const signal = AbortSignal.timeout(60_000);
  const tiff = await fromCustomClient(client, { allowFullFile: false }, signal);
  const image = await tiff.getImage();
  const keys = image.getGeoKeys();
  if (
    keys?.GeographicTypeGeoKey !== 4326 ||
    keys.GTRasterTypeGeoKey !== 1 ||
    Math.abs((image.getOrigin()[0] ?? 0) + 180) > 1e-5 ||
    Math.abs((image.getOrigin()[1] ?? 0) - 60) > 1e-5 ||
    Math.abs((image.getResolution()[0] ?? 0) - 0.05) > 1e-7 ||
    Math.abs((image.getResolution()[1] ?? 0) + 0.05) > 1e-7 ||
    image.getWidth() !== 7200 ||
    image.getHeight() !== 2400
  )
    throw new DomainError(
      "validation",
      "CHIRPS grid changed; method validation required",
    );
  const cell = containingCell(
    longitude,
    latitude,
    image.getOrigin(),
    image.getResolution(),
    image.getWidth(),
    image.getHeight(),
  );
  const raster = await image.readRasters({
    window: [cell.column, cell.row, cell.column + 1, cell.row + 1],
    samples: [0],
    interleave: true,
    signal,
  });
  const raw = Number(raster[0]);
  if (!Number.isFinite(raw) || (raw < 0 && raw !== -9999))
    throw new DomainError("validation", "Invalid rainfall sample");
  const hash = createHash("sha256")
    .update(
      JSON.stringify(client.parts.map(({ range, hash }) => ({ range, hash }))),
    )
    .digest("hex");
  if (artifactDir) {
    mkdirSync(artifactDir, { recursive: true, mode: 0o700 });
    for (const part of client.parts)
      writeFileSync(join(artifactDir, `${part.hash}.range`), part.data, {
        mode: 0o600,
      });
    writeFileSync(
      join(artifactDir, `${hash}.json`),
      JSON.stringify({
        url,
        ranges: client.parts.map(({ range, hash }) => ({ range, hash })),
        hash_kind: "range-manifest-sha256",
        retrieved_bytes: client.bytes,
        etag: client.etag,
        last_modified: client.lastModified,
        total_source_bytes: client.total,
      }),
      { mode: 0o600 },
    );
  }
  return {
    value: raw === -9999 ? null : raw,
    grid: { ...cell, latitude, longitude, crs: "EPSG:4326" },
    hash,
    bytes: client.bytes,
    method_version: "chirps-v3-containing-native-cell.v1",
  };
}
export const DocumentImport = z.object({
  source_id: z.enum([
    "A01",
    "A02",
    "A03",
    "A04",
    "A07",
    "C07",
    "W01",
    "W02",
    "G01",
    "G02",
    "G03",
    "M01",
    "M02",
  ]),
  url: z.url(),
  title: z.string().min(1),
  text: z.string().min(1).max(500000),
  geography: z.string().min(1),
  issued_at: c.Timestamp.optional(),
  valid_from: c.Timestamp.optional(),
  valid_until: c.Timestamp.optional(),
  page: z.number().int().positive().optional(),
  section: z.string().optional(),
  hash: z.string().min(16),
  origin: z.enum(["live_source", "imported_source"]),
  crops: z.array(z.string()).default([]),
  definition: z.string().min(1),
});
export function createDataServices(
  store: Store,
  base: (farmId: string) => {
    id: string;
    farm_id: string;
    version: number;
    created_at: string;
    updated_at: string;
  },
  assertFarm: (farmId: string) => c.Farm,
  now: () => string,
) {
  function aged<T extends c.Series | c.Source>(record: T): T {
    return {
      ...record,
      freshness:
        record.freshness.valid_until &&
        Date.parse(record.freshness.valid_until) < Date.parse(now())
          ? {
              ...record.freshness,
              status: "stale",
              reason: "Source refresh/validity period expired",
            }
          : record.freshness,
    };
  }
  function sources() {
    return catalog.map((source) =>
      aged(c.Source.parse(store.get("source", source.id, "public") ?? source)),
    );
  }
  function markSourceFailure(sourceId: string, reason: string) {
    const source = sources().find((s) => s.id === sourceId);
    if (source)
      store.put("source", {
        ...source,
        id: sourceId,
        farm_id: "public",
        version: 1,
        created_at: now(),
        capability: {
          key: sourceId,
          status: "degraded",
          reason,
          requirements: ["Successful source refresh"],
        },
        freshness: {
          ...source.freshness,
          status: source.freshness.retrieved_at ? "stale" : "missing",
          reason,
        },
      });
  }

  function persistSeries(
    farmId: string,
    input: Omit<c.Series, "id" | "snapshot_id" | "evidence_id">,
    evidenceInput: Omit<
      c.Evidence,
      "id" | "farm_id" | "version" | "created_at" | "updated_at" | "snapshot_id"
    >,
  ) {
    return store.transaction(() => {
      assertFarm(farmId);
      const snapshot = base("public");
      store.put("source_snapshot", {
        ...snapshot,
        source_id: input.source_id,
        hash: evidenceInput.hash,
        method_version: input.method_version,
      });
      const evidence = c.Evidence.parse({
        ...evidenceInput,
        ...base(farmId),
        snapshot_id: snapshot.id,
      });
      store.put("evidence", evidence);
      const series = c.Series.parse({
        ...input,
        id: base(farmId).id,
        snapshot_id: snapshot.id,
        evidence_id: evidence.id,
      });
      store.put("series", {
        ...series,
        farm_id: farmId,
        version: 1,
        created_at: now(),
      });
      store.put("series_projection", {
        ...base(farmId),
        id: createHash("sha256")
          .update(`${series.source_id}:${series.variable}:${series.geography}`)
          .digest("hex"),
        series_id: series.id,
      });
      const source = sources().find((s) => s.id === input.source_id);
      if (source)
        store.put("source", {
          ...source,
          id: source.id,
          farm_id: "public",
          version: 1,
          created_at: now(),
          capability: { key: source.id, status: "enabled", requirements: [] },
          freshness: input.freshness,
          parser_version: input.method_version,
        });
      store.event(farmId, "finding_ready", { record_id: evidence.id });
      return series;
    });
  }
  function importDocument(
    farmId: string,
    value: unknown,
    rawArtifact?: Uint8Array,
  ) {
    assertFarm(farmId);
    const input = DocumentImport.parse(value);
    const original = rawArtifact ?? new TextEncoder().encode(input.text);
    if (createHash("sha256").update(original).digest("hex") !== input.hash)
      throw new DomainError(
        "validation",
        "Original source artifact hash does not match import",
      );
    return store.transaction(() => {
      assertSourceUrl(input.url);
      if (input.source_id === "M01" || input.source_id === "M02")
        throw new DomainError(
          "unavailable",
          "Market records require dated commodity/grade/unit validation, not generic text",
        );
      const evidence = c.Evidence.parse({
        ...base(farmId),
        content_hash: createHash("sha256").update(input.text).digest("hex"),
        hash_kind: "full_artifact_sha256",
        source_time_precision: input.issued_at ? "date" : "unknown",
        source_id: input.source_id,
        snapshot_id: base("public").id,
        title: input.title,
        text: input.text,
        url: input.url,
        issued_at: input.issued_at,
        retrieved_at: now(),
        valid_from: input.valid_from,
        valid_until: input.valid_until,
        geography: input.geography,
        kind:
          input.source_id.startsWith("W") || input.source_id === "C07"
            ? "forecast"
            : "guidance",
        origin: input.origin,
        hash: input.hash,
        method_version: "curated-document.v1",
        citation: { page: input.page, section: input.section },
      });
      store.put("source_snapshot", {
        ...base("public"),
        id: evidence.snapshot_id,
        source_id: input.source_id,
        hash: input.hash,
        content_hash: evidence.content_hash,
        method_version: evidence.method_version,
        definition: input.definition,
      });
      store.put("evidence", evidence);
      store.put("document_applicability", {
        ...base(farmId),
        id: evidence.id,
        crops: input.crops,
        definition: input.definition,
      });
      return evidence;
    });
  }
  return {
    sources,
    markSourceFailure,
    persistSeries,
    importDocument,
    insights(farmId: string, filter?: string, fieldId?: string) {
      assertFarm(farmId);
      const farm = load(store, "farm", farmId, farmId, c.Farm);
      if (fieldId) load(store, "field", fieldId, farmId, c.Field);
      const latest = new Map<string, c.Series>();
      for (const raw of store.list("series_projection", farmId)) {
        const pointer = z.object({ id: c.Id, series_id: c.Id }).parse(raw);
        const item = c.Series.parse(
          store.get("series", pointer.series_id, farmId),
        );
        const evidence = load(
          store,
          "evidence",
          item.evidence_id ?? "",
          farmId,
          c.Evidence,
        );
        if (evidence.field_id && evidence.field_id !== fieldId) continue;
        if (
          item.grid &&
          (item.grid.latitude !== farm.location?.latitude ||
            item.grid.longitude !== farm.location?.longitude)
        )
          continue;
        latest.set(pointer.id, aged(item));
      }
      const series = [...latest.values()].filter(
        (item) =>
          !filter || filter === item.variable || filter === item.source_id,
      );
      return c.Insights.parse({
        series,
        capabilities: sources()
          .filter((s) => ["C01", "W01", "W03", "W04"].includes(s.id))
          .map((s) => s.capability),
        missing_inputs: series.length
          ? []
          : [
              "Refresh verified sources; provide exact location for rainfall extraction",
            ],
      });
    },
    execute(
      name: c.OperationName,
      input: unknown,
      params: Record<string, string>,
    ) {
      switch (name) {
        case "listSources":
          return sources();
        case "getSource": {
          const source = sources().find((s) => s.id === params.sourceId);
          if (!source) throw new DomainError("not_found", "Source not found");
          return source;
        }
        case "getEvidence":
          assertFarm(params.farmId ?? "");
          return load(
            store,
            "evidence",
            params.evidenceId ?? "",
            params.farmId ?? "",
            c.Evidence,
          );
        case "getInsights": {
          const filter = c.operations.getInsights.input.parse(input);
          return this.insights(
            params.farmId ?? "",
            filter.series,
            filter.field_id,
          );
        }
        default:
          throw new DomainError("unavailable", "Data operation unavailable");
      }
    },
  };
}
export async function refreshCoreEvidence(
  services: ReturnType<typeof createDataServices>,
  farmId: string,
  location: { latitude: number; longitude: number } | undefined,
  artifactDir: string,
  options: { months?: number; forecastDays?: number; now?: Date } = {},
) {
  const current = options.now ?? new Date();
  const retrieved = current.toISOString();
  const validUntil = new Date(
    current.getTime() + 24 * 60 * 60 * 1000,
  ).toISOString();
  const results: { source: string; status: string; reason?: string }[] = [];
  const roniUrl =
    "https://cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/";
  try {
    const raw = await boundedFetch(roniUrl);
    const text = new TextDecoder().decode(raw.data);
    const points = parseRoni(text);
    const hash = createHash("sha256").update(raw.data).digest("hex");
    mkdirSync(artifactDir, { recursive: true, mode: 0o700 });
    writeFileSync(join(artifactDir, `${hash}.html`), raw.data, { mode: 0o600 });
    services.persistSeries(
      farmId,
      {
        source_id: "C01",
        method_version: "noaa-roni-ersstv6.v1",
        variable: "RONI",
        unit: "degC",
        kind: "observed",
        geography: "Nino3.4 relative to tropical mean",
        resolution: "3-month running index",
        baseline:
          "ERSSTv6, 1991–2020; tropical mean removed and variance-adjusted. Most recent 2 months provisional.",
        supported_range: {
          from: points[0]?.time ?? retrieved,
          to: points.at(-1)?.time ?? retrieved,
        },
        freshness: {
          status: "fresh",
          retrieved_at: retrieved,
          valid_until: validUntil,
        },
        completeness: points.some((p) => p.value === null)
          ? "partial"
          : "complete",
        points,
        origin: "live_source",
      },
      {
        source_id: "C01",
        title: "NOAA Relative Oceanic Niño Index",
        text: "ERSSTv6 RONI is a three-month running relative Nino3.4 index, not a farm rainfall prediction. Last two months may be revised.",
        url: roniUrl,
        retrieved_at: retrieved,
        geography: "Tropical Pacific",
        resolution: "regional index",
        unit: "degC",
        kind: "observation",
        origin: "live_source",
        hash,
        method_version: "noaa-roni-ersstv6.v1",
        citation: { section: "RONI historical table" },
      },
    );
    results.push({ source: "C01", status: "enabled" });
  } catch (error) {
    services.markSourceFailure(
      "C01",
      error instanceof Error ? error.message : "Source fetch failed",
    );
    results.push({
      source: "C01",
      status: "unavailable",
      reason: error instanceof Error ? error.message : "Fetch failed",
    });
  }
  results.push(
    ...(await refreshClimateExtras(services, farmId, artifactDir, retrieved)),
  );
  if (!location) {
    results.push({
      source: "W03/W04",
      status: "needs_information",
      reason: "Exact latitude/longitude required; no default farm coordinate",
    });
    return results;
  }
  for (const source of ["W03", "W04"] as const) {
    const count =
      source === "W03" ? (options.months ?? 12) : (options.forecastDays ?? 7);
    if (count < 1 || count > (source === "W03" ? 60 : 16))
      throw new DomainError(
        "validation",
        "Requested rainfall range exceeds supported processing bound",
      );
    const points: c.Series["points"] = [];
    const hashes: string[] = [];
    let grid: z.infer<typeof c.GridMetadata> | undefined;
    const urls: string[] = [];
    let failures = 0;
    for (let index = 0; index < count; index++) {
      const date =
        source === "W03"
          ? new Date(
              Date.UTC(
                current.getUTCFullYear(),
                current.getUTCMonth() - count + index,
                1,
              ),
            )
          : new Date(
              Date.UTC(
                current.getUTCFullYear(),
                current.getUTCMonth(),
                current.getUTCDate() + index,
              ),
            );
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      const issueYear = current.getUTCFullYear();
      const issueMonth = String(current.getUTCMonth() + 1).padStart(2, "0");
      const issueDay = String(current.getUTCDate()).padStart(2, "0");
      const url =
        source === "W03"
          ? `https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/global/cogs/chirps-v3.0.${year}.${month}.cog`
          : `https://data.chc.ucsb.edu/products/CHIRPS-GEFS/v3/daily/global/${issueYear}/${issueMonth}/${issueDay}/c3g_${year}.${month}.${day}.tif`;
      urls.push(url);
      try {
        const value = await extractRainfall(
          url,
          location.longitude,
          location.latitude,
          artifactDir,
        );
        grid = value.grid;
        hashes.push(value.hash);
        points.push({ time: date.toISOString(), value: value.value });
      } catch {
        failures++;
        points.push({ time: date.toISOString(), value: null });
      }
    }
    if (!grid) {
      services.markSourceFailure(
        source,
        "No valid source grid sample; existing evidence retained as stale",
      );
      results.push({
        source,
        status: "unavailable",
        reason: "No valid source grid sample; existing evidence retained",
      });
      continue;
    }
    const first = points[0]?.time ?? retrieved,
      last = points.at(-1)?.time ?? retrieved;
    const hash = createHash("sha256")
      .update(JSON.stringify(hashes))
      .digest("hex");
    const geography = `Native cell at ${location.latitude}, ${location.longitude}`;
    services.persistSeries(
      farmId,
      {
        source_id: source,
        method_version: "chirps-v3-containing-native-cell.v1",
        variable:
          source === "W03" ? "historical_rainfall" : "forecast_rainfall",
        unit: source === "W03" ? "mm/month" : "mm/day",
        kind: source === "W03" ? "observed" : "forecast",
        geography,
        resolution:
          "0.05 degree native grid cell; containing point, no interpolation",
        grid,
        supported_range: { from: first, to: last },
        freshness: {
          status: failures ? "partial" : "fresh",
          retrieved_at: retrieved,
          valid_until: source === "W04" ? validUntil : undefined,
        },
        completeness:
          failures || points.some((p) => p.value === null)
            ? "partial"
            : "complete",
        points,
        origin: "live_source",
      },
      {
        source_id: source,
        title:
          source === "W03"
            ? "CHIRPS v3 final monthly rainfall estimate"
            : "CHIRPS-GEFS v3 ensemble mean daily rainfall forecast",
        text:
          source === "W03"
            ? "Satellite/station-derived gridded estimate; not a rain gauge measurement. Final monthly publication may lag. Missing months remain gaps."
            : `Forecast issued ${current.toISOString().slice(0, 10)}, bias-corrected ensemble mean; not ensemble percentiles and not a guarantee. Data files: ${urls.join(" ")}`,
        url: urls[0],
        issued_at:
          source === "W04"
            ? new Date(
                Date.UTC(
                  current.getUTCFullYear(),
                  current.getUTCMonth(),
                  current.getUTCDate(),
                ),
              ).toISOString()
            : undefined,
        retrieved_at: retrieved,
        valid_from: first,
        valid_until: source === "W04" ? last : undefined,
        geography,
        resolution: "0.05 degree",
        grid,
        unit: source === "W03" ? "mm/month" : "mm/day",
        kind: source === "W03" ? "observation" : "forecast",
        origin: "live_source",
        hash,
        hash_kind: "collection_manifest_sha256",
        method_version: "chirps-v3-containing-native-cell.v1",
        citation: {
          section: "CHC native grid; range artifact manifest hashes",
        },
      },
    );
    results.push({
      source,
      status: failures ? "partial" : "enabled",
      reason: failures
        ? `${failures} unavailable periods retained as gaps`
        : undefined,
    });
  }
  return results;
}
