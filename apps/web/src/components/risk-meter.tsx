import { t } from "../copy";
import type { Lang } from "../language";

const position = { safe: "16%", watch: "50%", act: "84%" } as const;

export function RiskMeter({
  level,
  lang,
}: {
  level: "safe" | "watch" | "act";
  lang: Lang;
}) {
  const label =
    level === "act"
      ? t(lang, "act")
      : level === "safe"
        ? t(lang, "safe")
        : t(lang, "watch");
  return (
    <div className="meter" aria-hidden="true">
      <div className="meter-track">
        <span
          className={`meter-knob ${level}`}
          style={{
            left: position[level],
            ["--knob" as string]: position[level],
          }}
        />
      </div>
      <div className="meter-legend">
        <span>{t(lang, "safe")}</span>
        <span>{t(lang, "watch")}</span>
        <span>{t(lang, "act")}</span>
      </div>
      <p className="sr-only">{label}</p>
    </div>
  );
}
