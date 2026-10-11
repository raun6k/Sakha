import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "en" | "hi";

const LanguageContext = createContext<{
  lang: Lang;
  setLang: (lang: Lang) => void;
} | null>(null);

export function LanguageProvider({ children }: { children?: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return localStorage.getItem("sakha-lang") === "hi" ? "hi" : "en";
    } catch {
      return "en";
    }
  });
  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem("sakha-lang", next);
    } catch {
      /* Storage can be blocked. The choice still applies to this visit. */
    }
  };
  useEffect(() => {
    document.documentElement.lang = lang === "hi" ? "hi" : "en";
  }, [lang]);
  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return (
    useContext(LanguageContext) ?? {
      lang: "en" as const,
      setLang: () => undefined,
    }
  );
}
