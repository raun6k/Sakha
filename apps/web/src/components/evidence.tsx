import type { Alert, Finding, Series } from "@sakha/contracts";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

type EvidenceRef = Finding["evidence"][number];

import { useCommand, useFarmId, useRead } from "../services/context";
import {
  Badge,
  Card,
  DateText,
  ErrorNotice,
  Loading,
  Modal,
  State,
} from "./ui";
export function SourceDetails({
  sourceId,
  evidenceId,
  onClose,
}: {
  sourceId: string;
  evidenceId?: string;
  onClose: () => void;
}) {
  const farmId = useFarmId();
  const source = useRead("getSource", { params: { sourceId }, input: {} });
  const evidence = useRead(
    "getEvidence",
    { params: { farmId, evidenceId: evidenceId ?? "" }, input: {} },
    Boolean(evidenceId && farmId),
  );
  return (
    <Modal open onClose={onClose} title="Source details">
      <ErrorNotice error={source.error ?? evidence.error} />
      {source.isPending ? (
        <Loading />
      ) : source.data ? (
        <>
          <h3>{source.data.name}</h3>
          <p className="chart-meta">{source.data.definition}</p>
          <Badge>{source.data.capability.status.replaceAll("_", " ")}</Badge>
          <dl className="data-list">
            <div>
              <dt>Source ID</dt>
              <dd>{source.data.id}</dd>
            </div>
            <div>
              <dt>Coverage</dt>
              <dd>{source.data.geography}</dd>
            </div>
            <div>
              <dt>Freshness</dt>
              <dd>{source.data.freshness.status}</dd>
            </div>
          </dl>
          <a
            className="button secondary"
            href={source.data.url}
            target="_blank"
            rel="noreferrer"
          >
            Official source <ExternalLink size={16} />
          </a>
        </>
      ) : null}
      {evidenceId ? (
        <section className="section-block">
          <h2>Selected evidence snapshot</h2>
          {evidence.data ? (
            <>
              <p className="chart-meta">
                {evidence.data.title} · {evidence.data.kind} ·{" "}
                {evidence.data.origin.replaceAll("_", " ")}
              </p>
              <p>{evidence.data.text}</p>
              <dl className="data-list">
                <div>
                  <dt>Snapshot</dt>
                  <dd>{evidence.data.snapshot_id}</dd>
                </div>
                <div>
                  <dt>Issued</dt>
                  <dd>
                    <DateText
                      value={evidence.data.issued_at}
                      precision={
                        evidence.data.source_time_precision ?? "unknown"
                      }
                    />
                  </dd>
                </div>
                <div>
                  <dt>Retrieved</dt>
                  <dd>
                    <DateText value={evidence.data.retrieved_at} />
                  </dd>
                </div>
                <div>
                  <dt>Valid until</dt>
                  <dd>
                    <DateText
                      value={evidence.data.valid_until}
                      precision={
                        evidence.data.source_time_precision ?? "unknown"
                      }
                    />
                  </dd>
                </div>
                <div>
                  <dt>Geography / resolution</dt>
                  <dd>
                    {evidence.data.geography} /{" "}
                    {evidence.data.resolution ?? "Not recorded"}
                  </dd>
                </div>
                {evidence.data.grid ? (
                  <div>
                    <dt>Selected native grid</dt>
                    <dd>
                      {evidence.data.grid.latitude},{" "}
                      {evidence.data.grid.longitude} · {evidence.data.grid.crs}
                      <br />A regional cell, not a direct field measurement.
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>Units / method</dt>
                  <dd>
                    {evidence.data.unit ?? "Not applicable"} /{" "}
                    {evidence.data.method_version}
                  </dd>
                </div>
              </dl>
            </>
          ) : evidence.isPending ? (
            <Loading />
          ) : (
            <State title="Snapshot unavailable">
              The catalog entry does not establish retrieved evidence.
            </State>
          )}
        </section>
      ) : (
        <p className="chart-meta">
          A declared connector does not establish successful retrieval or valid
          farm coverage.
        </p>
      )}
      <div className="actions">
        <Link className="text-link" to="/help" onClick={onClose}>
          Help & data sources <ArrowRight size={16} />
        </Link>
      </div>
    </Modal>
  );
}
export function EvidenceLinks({ evidence }: { evidence: EvidenceRef[] }) {
  const [selected, setSelected] = useState<EvidenceRef>();
  return (
    <>
      {evidence.length ? (
        <div className="actions">
          {evidence.map((ref) => (
            <button
              type="button"
              className="button secondary"
              key={ref.evidence_id}
              onClick={() => setSelected(ref)}
            >
              Source {ref.source_id}
            </button>
          ))}
        </div>
      ) : (
        <p className="chart-meta">No source evidence attached.</p>
      )}
      {selected ? (
        <SourceDetails
          sourceId={selected.source_id}
          evidenceId={selected.evidence_id}
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </>
  );
}
export function ChartCard({
  series,
  compact = false,
  range,
}: {
  series: Series;
  compact?: boolean;
  range?: string;
}) {
  const [source, setSource] = useState(false);
  const selectedRange =
    range ??
    (series.kind === "forecast"
      ? "forecast"
      : series.source_id.startsWith("C")
        ? "5years"
        : series.source_id.startsWith("M")
          ? "1year"
          : series.unit.includes("month")
            ? "12months"
            : "30days");
  const points = series.points;
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const spread = max - min || 1;
  const W = 420,
    H = 160;
  const x = (i: number) => 40 + (i * (W - 50)) / Math.max(1, points.length);
  const y = (value: number) => H - 25 - ((value - min) / spread) * (H - 45);
  const zero = y(0);
  const line = points
    .map((p, i) =>
      p.value === null
        ? ""
        : `${i === 0 || points[i - 1]?.value === null ? "M" : "L"} ${x(i) + 5} ${y(p.value)}`,
    )
    .join(" ");
  return (
    <Card
      title={series.variable}
      className="chart-card"
      action={
        <Badge tone={series.origin === "fixture" ? "gold" : "neutral"}>
          {series.origin === "fixture" ? "Synthetic" : series.kind}
        </Badge>
      }
    >
      {values.length ? (
        <svg
          className="chart-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${series.variable}, ${series.unit}; ${series.completeness} coverage. Exact values in table.`}
        >
          <title>
            {series.variable} ({series.unit})
          </title>
          {[min, (min + max) / 2, max].map((t) => (
            <g key={t}>
              <line x1="35" y1={y(t)} x2="412" y2={y(t)} stroke="#e3e9dc" />
              <text x="0" y={y(t) + 4} className="chart-label">
                {t.toFixed(series.unit.includes("C") ? 1 : 0)}
              </text>
            </g>
          ))}
          {series.source_id === "C01" ? (
            <path d={line} fill="none" stroke="#a56b32" strokeWidth="2.5" />
          ) : (
            points.map((p, i) =>
              p.value === null ? null : (
                <rect
                  key={p.time}
                  x={x(i)}
                  y={Math.min(zero, y(p.value))}
                  width={Math.max(
                    2,
                    Math.min(18, (W - 55) / Math.max(1, points.length) - 3),
                  )}
                  height={Math.max(1, Math.abs(zero - y(p.value)))}
                  fill={series.kind === "forecast" ? "#79a9aa" : "#347553"}
                  rx="1"
                />
              ),
            )
          )}
          {points
            .filter(
              (_, i) =>
                i === 0 ||
                i === points.length - 1 ||
                i === Math.floor(points.length / 2),
            )
            .map((p) => (
              <text
                key={p.time}
                x={x(points.indexOf(p))}
                y="158"
                className="chart-label"
              >
                {p.label ??
                  new Date(p.time).toLocaleDateString("en-IN", {
                    month: "short",
                    day: "numeric",
                  })}
              </text>
            ))}
        </svg>
      ) : (
        <State title="No supported values">
          {series.freshness.reason ??
            "The source has no usable series for this scope and period."}
        </State>
      )}
      <p className="chart-meta">
        {series.unit} · {series.geography} · {series.resolution}
        <br />
        {series.kind === "forecast"
          ? "Forecast within supported horizon"
          : "Observed series"}{" "}
        · {series.completeness} coverage · {series.freshness.status}
        <br />
        Period{" "}
        {new Date(series.supported_range.from).toLocaleDateString("en-IN")} –{" "}
        {new Date(series.supported_range.to).toLocaleDateString("en-IN")}
        {series.baseline ? (
          <>
            <br />
            Baseline: {series.baseline}
          </>
        ) : null}
      </p>
      {series.origin === "fixture" ? (
        <p className="chart-meta">
          Synthetic values for interface review. Gaps stay gaps.
        </p>
      ) : null}
      <details>
        <summary>Read values as a table</summary>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>{series.unit}</th>
                <th>Range</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.time}>
                  <td>
                    {p.label ?? new Date(p.time).toLocaleDateString("en-IN")}
                  </td>
                  <td>{p.value ?? "Missing"}</td>
                  <td>
                    {p.lower !== undefined || p.upper !== undefined
                      ? `${p.lower ?? "?"} – ${p.upper ?? "?"}`
                      : "Not provided"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <div className="actions">
        <button
          type="button"
          className="text-link"
          onClick={() => setSource(true)}
        >
          Source & definition
        </button>
        {compact ? (
          <Link
            className="text-link"
            to={`/insights?series=${encodeURIComponent(series.source_id)}&range=${selectedRange}`}
          >
            Expand <ArrowRight size={15} />
          </Link>
        ) : (
          <Link
            className="text-link"
            to={`/agents/${series.source_id.startsWith("C") ? "climate" : series.source_id.startsWith("M") ? "market" : "weather"}?tab=chat&evidence=${encodeURIComponent(series.evidence_id ?? "")}&source=${series.source_id}&snapshot=${encodeURIComponent(series.snapshot_id)}&range=${selectedRange}`}
          >
            Ask the specialist
          </Link>
        )}
      </div>
      {source ? (
        <SourceDetails
          sourceId={series.source_id}
          evidenceId={series.evidence_id}
          onClose={() => setSource(false)}
        />
      ) : null}
    </Card>
  );
}
export function AlertDetails({
  alert,
  onClose,
}: {
  alert: Alert;
  onClose: () => void;
}) {
  const command = useCommand("acknowledgeAlert", {
    farmId: alert.farm_id,
    alertId: alert.id,
  });
  const dismiss = useCommand("dismissAlert", {
    farmId: alert.farm_id,
    alertId: alert.id,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={alert.title}
      description="Acknowledgement records that you have reviewed this alert. It does not complete work or end the hazard."
    >
      <p>{alert.summary}</p>
      <div className="actions">
        <Badge tone={alert.severity === "warning" ? "red" : "gold"}>
          {alert.severity}
        </Badge>
        <Badge>{alert.status}</Badge>
      </div>
      <p className="chart-meta">
        Issued <DateText value={alert.issued_at} /> · Valid until{" "}
        <DateText value={alert.valid_until} />
        <br />
        Evidence freshness: {alert.freshness.status}
      </p>
      <EvidenceLinks evidence={alert.evidence} />
      <ErrorNotice error={command.error ?? dismiss.error} />
      <div className="actions">
        {alert.status === "active" ? (
          <button
            type="button"
            className="button"
            disabled={command.isPending}
            onClick={() =>
              void command
                .mutateAsync({ expected_version: alert.version })
                .then(onClose)
                .catch(() => {})
            }
          >
            Acknowledge alert
          </button>
        ) : null}
        {alert.status !== "dismissed" ? (
          <button
            type="button"
            className="button secondary"
            disabled={dismiss.isPending}
            onClick={() =>
              void dismiss
                .mutateAsync({ expected_version: alert.version })
                .then(onClose)
                .catch(() => {})
            }
          >
            Dismiss alert
          </button>
        ) : null}
        <Link
          className="button secondary"
          to={`/agents/${alert.role_key}?tab=chat&alert=${alert.id}`}
          onClick={onClose}
        >
          Discuss with specialist
        </Link>
      </div>
    </Modal>
  );
}
export function FindingDetails({
  finding,
  onClose,
}: {
  finding: Finding;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={finding.title}>
      <p>{finding.summary}</p>
      <p className="chart-meta">
        {finding.role_key.replaceAll("_", " ")} ·{" "}
        {finding.origin.replaceAll("_", " ")} · {finding.freshness.status}
      </p>
      <h3>Assumptions and missing inputs</h3>
      <ul>
        {[...finding.assumptions, ...finding.missing_inputs].map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      <h3>Constraints</h3>
      {finding.constraints.map((c) => (
        <div className="result-row" key={c.key}>
          <span>
            {c.label}: {c.reason}
          </span>
          <Badge tone={c.status === "failed" ? "red" : "neutral"}>
            {c.status}
          </Badge>
        </div>
      ))}
      <EvidenceLinks evidence={finding.evidence} />
      <div className="actions">
        <Link className="button secondary" to="/plan">
          Review plan
        </Link>
      </div>
    </Modal>
  );
}
