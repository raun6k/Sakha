import { t } from "../copy";
import { formatUpdated } from "../farmer";
import { useLang } from "../language";

export function SourceBadge({
  source,
  updated,
}: {
  source: string;
  updated?: string;
}) {
  const { lang } = useLang();
  return (
    <p className="source-badge">
      {source} · {t(lang, "updated")} {formatUpdated(updated, lang)}
    </p>
  );
}
