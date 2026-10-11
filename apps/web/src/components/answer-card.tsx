import { t } from "../copy";
import { formatUpdated } from "../farmer";
import { useLang } from "../language";
import { type FarmerCard, rupeeText, teammateName } from "../team/adapter";
import { Avatar } from "./avatar";

export function AnswerCard({ card }: { card: FarmerCard }) {
  const { lang } = useLang();
  const risk =
    card.risk === "high"
      ? t(lang, "riskHigh")
      : card.risk === "medium"
        ? t(lang, "riskMedium")
        : card.risk === "low"
          ? t(lang, "riskLow")
          : undefined;
  const confidence =
    card.confidence === "high"
      ? t(lang, "riskHigh")
      : card.confidence === "medium"
        ? t(lang, "riskMedium")
        : card.confidence === "low"
          ? t(lang, "riskLow")
          : undefined;
  const costKnown =
    card.cost_inr !== undefined ||
    (card.cost_inr_low !== undefined && card.cost_inr_high !== undefined);
  const benefitKnown =
    card.benefit_inr !== undefined ||
    (card.benefit_inr_low !== undefined && card.benefit_inr_high !== undefined);
  return (
    <article className={`answer-card agent-${card.agent}`}>
      <header className="answer-head">
        <Avatar id={card.agent} />
        <div>
          <p className="eyebrow">{teammateName(card.agent, lang)}</p>
          <h3>{card.headline}</h3>
        </div>
      </header>
      <p className="answer-label">{t(lang, "doThis")}</p>
      <ol className="answer-do">
        {card.do.slice(0, 3).map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p>
        <span className="answer-label">{t(lang, "why")}</span> {card.why}
      </p>
      <dl className="reco">
        {costKnown ? (
          <div>
            <dt>{t(lang, "cost")}</dt>
            <dd>
              {rupeeText(
                card.cost_inr,
                card.cost_inr_low,
                card.cost_inr_high,
                lang,
              )}
            </dd>
          </div>
        ) : null}
        {benefitKnown ? (
          <div>
            <dt>{t(lang, "benefit")}</dt>
            <dd>
              {rupeeText(
                card.benefit_inr,
                card.benefit_inr_low,
                card.benefit_inr_high,
                lang,
              )}
            </dd>
          </div>
        ) : null}
        {risk ? (
          <div>
            <dt>{t(lang, "riskLevel")}</dt>
            <dd>{risk}</dd>
          </div>
        ) : null}
        {confidence ? (
          <div>
            <dt>{t(lang, "confidence")}</dt>
            <dd>{confidence}</dd>
          </div>
        ) : null}
      </dl>
      <ul className="source-list">
        {card.sources.map((source) => (
          <li key={`${source.title}-${source.fetched_at ?? ""}`}>
            {source.url ? (
              <a href={source.url}>{source.title}</a>
            ) : (
              source.title
            )}
            <span> · {formatUpdated(source.fetched_at, lang)}</span>
          </li>
        ))}
      </ul>
      <div className="chips">
        <span className="chip checked">{t(lang, "checkedBySakha")}</span>
        {card.consulted.map((id) => (
          <span className="chip" key={id}>
            {teammateName(id, lang)}
          </span>
        ))}
      </div>
    </article>
  );
}
