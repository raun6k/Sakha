import { t } from "../copy";
import { useLang } from "../language";

export function LanguageToggle() {
  const { lang, setLang } = useLang();
  return (
    <fieldset className="lang-toggle" aria-label={t(lang, "language")}>
      <button
        type="button"
        aria-pressed={lang === "en"}
        onClick={() => setLang("en")}
      >
        English
      </button>
      <button
        type="button"
        aria-pressed={lang === "hi"}
        onClick={() => setLang("hi")}
      >
        हिन्दी
      </button>
    </fieldset>
  );
}
