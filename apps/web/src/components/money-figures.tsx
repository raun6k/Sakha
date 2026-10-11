import { t } from "../copy";
import { useLang } from "../language";
import { rupeeText } from "../team/adapter";

export function MoneyFigures({
  cost,
  benefit,
}: {
  cost?: number;
  benefit?: number;
}) {
  const { lang } = useLang();
  const net =
    cost !== undefined && benefit !== undefined ? benefit - cost : undefined;
  if (cost === undefined && benefit === undefined) return null;
  return (
    <div className="money-row">
      {cost !== undefined ? (
        <div>
          <span>{t(lang, "cost")}</span>
          <strong className="money-cost">
            {rupeeText(cost, undefined, undefined, lang)}
          </strong>
        </div>
      ) : null}
      {benefit !== undefined ? (
        <div>
          <span>{t(lang, "benefit")}</span>
          <strong className="money-benefit">
            {rupeeText(benefit, undefined, undefined, lang)}
          </strong>
        </div>
      ) : null}
      {net !== undefined ? (
        <div>
          <span>{t(lang, "netGain")}</span>
          <strong className="money-net">
            {rupeeText(net, undefined, undefined, lang)}
          </strong>
        </div>
      ) : null}
    </div>
  );
}
