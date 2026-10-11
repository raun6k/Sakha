import type { Series } from "@sakha/contracts";
import { axisTicks, dayLabel, formatMm, niceMax } from "../farmer";
import { useLang } from "../language";

export function RainChart({ series }: { series: Series }) {
  const { lang } = useLang();
  const points = series.points;
  const values = points.flatMap((point) =>
    typeof point.value === "number" ? [point.value] : [],
  );
  const peak = values.length ? Math.max(...values) : 0;
  const max = niceMax(peak);
  const ticks = axisTicks(peak);
  const aria = points
    .map((point) => {
      const day = dayLabel(point.time, lang);
      if (point.value === null) return `${day}: missing`;
      return `${day}: ${formatMm(point.value)} mm`;
    })
    .join(", ");
  return (
    <div className="rain-chart" role="img" aria-label={aria}>
      <div className="rain-y">
        {[...ticks].reverse().map((tick) => (
          <span key={tick}>{formatMm(tick)}</span>
        ))}
      </div>
      <div className="rain-plot">
        <span className="rain-grid" style={{ top: 0 }} />
        <span className="rain-grid" style={{ top: "50%" }} />
        <div className="rain-bars">
          {points.map((point) => {
            const value = typeof point.value === "number" ? point.value : 0;
            const height = point.value === null ? 0 : (value / max) * 100;
            return (
              <div className="rain-col" key={point.time}>
                <div
                  className="rain-bar"
                  style={{ height: `${height}%` }}
                  data-value={point.value ?? "missing"}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="rain-days">
        {points.map((point) => (
          <span key={point.time}>{dayLabel(point.time, lang)}</span>
        ))}
      </div>
    </div>
  );
}
