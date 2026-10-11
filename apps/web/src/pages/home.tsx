import { Mic } from "lucide-react";
import { Link } from "react-router";
import { AnswerCard } from "../components/answer-card";
import { DailyBrief } from "../components/daily-brief";
import { FieldArt } from "../components/field-art";
import { RainChart } from "../components/rain-chart";
import { RiskMeter } from "../components/risk-meter";
import { SourceBadge } from "../components/source-badge";
import { ErrorNotice, State } from "../components/ui";
import { sourceLabel, t } from "../copy";
import {
  buildRisk,
  factText,
  greeting,
  latestFact,
  pickRainSeries,
  placeName,
  rainCaption,
  rainTotal,
  riskSentence,
} from "../farmer";
import { useLang } from "../language";
import { useFarmId, useRead } from "../services/context";
import { applyRemoteTeam, buildTeam, cardFromHome } from "../team/adapter";

export function HomePage() {
  const { lang } = useLang();
  const farmId = useFarmId();
  const q = useRead(
    "getHome",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const remote = useRead(
    "getTeam",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const sources = useRead("listSources", { input: {} });
  if (q.isPending)
    return (
      <div className="splash">
        <FieldArt mood="calm" />
        <h1>Sakha</h1>
        <p>{t(lang, "loading")}</p>
      </div>
    );
  if (q.error || !q.data)
    return (
      <div className="route-content">
        <State title={t(lang, "startFailed")} retry={() => void q.refetch()}>
          {t(lang, "startFailedBody")}
        </State>
        <ErrorNotice error={q.error} />
      </div>
    );
  const home = q.data;
  const facts = home.sections.context;
  const risk = buildRisk(home);
  const advice = cardFromHome(home, lang);
  const team = applyRemoteTeam(buildTeam(home, lang), remote.data);
  const rain = pickRainSeries(home.insights.series);
  const crop = factText(latestFact(facts, "current_crop"), lang);
  const cropShown = crop === t(lang, "notAdded") ? undefined : crop;
  const context = [
    home.farm.name,
    placeName(home.farm.location),
    cropShown,
  ].filter(Boolean);
  const catalog = (id?: string) =>
    sources.data?.find((source) => source.id === id)?.name;
  const riskLevel =
    risk.level === "act"
      ? t(lang, "act")
      : risk.level === "safe"
        ? t(lang, "safe")
        : t(lang, "watch");
  return (
    <div className="route-content">
      <section className={`hero hero-${risk.level}`}>
        <FieldArt mood={risk.level} />
        <div className="hero-body">
          <p className="eyebrow">{greeting(new Date().getHours(), lang)}</p>
          {context.length ? (
            <p className="context-line">{context.join(" · ")}</p>
          ) : null}
          <h1>{riskLevel}</h1>
          <p className="hero-sentence">{riskSentence(risk.kind, lang)}</p>
          <RiskMeter level={risk.level} lang={lang} />
          <SourceBadge
            source={sourceLabel(risk.sourceId, lang, catalog(risk.sourceId))}
            updated={risk.updated}
          />
        </div>
      </section>
      <DailyBrief team={team} />
      <Link className="button ask-button" to="/team">
        <span className="ask-icon" aria-hidden="true">
          <Mic size={26} />
        </span>
        <span>
          {lang === "hi" ? t(lang, "askSakhaHindi") : t(lang, "askSakha")}
          <small>
            {lang === "hi" ? "Ask Sakha" : t(lang, "askSakhaHindi")}
          </small>
        </span>
      </Link>
      <AnswerCard card={advice} />
      {rain ? (
        <section className="card">
          <h2>{t(lang, "rainTitle")}</h2>
          <RainChart series={rain} />
          <p>{rainCaption(rainTotal(rain), lang)}</p>
          <p className="quiet">{t(lang, "rainUnit")}</p>
          <SourceBadge
            source={sourceLabel(rain.source_id, lang, catalog(rain.source_id))}
            updated={rain.freshness.retrieved_at}
          />
        </section>
      ) : null}
    </div>
  );
}
