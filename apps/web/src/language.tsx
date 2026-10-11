import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRead, useService } from "./services/context";
import { commandKey } from "./services/http";

export type Lang = "en" | "hi" | "mr";

const LanguageContext = createContext<{
  lang: Lang;
  setLang: (lang: Lang) => void;
} | null>(null);

function storedLang(): Lang | undefined {
  try {
    const value = localStorage.getItem("sakha-lang");
    if (value === "en" || value === "hi" || value === "mr") return value;
  } catch {
    /* Storage can be blocked. */
  }
  return undefined;
}

export function LanguageProvider({ children }: { children?: React.ReactNode }) {
  const { service } = useService();
  const client = useQueryClient();
  const bootstrap = useRead("bootstrap", { input: {} });
  const [lang, setLangState] = useState<Lang>(storedLang() ?? "en");
  const picked = useRef(false);
  const applied = useRef(false);
  const setLang = (next: Lang) => {
    picked.current = true;
    setLangState(next);
    try {
      localStorage.setItem("sakha-lang", next);
    } catch {
      /* The choice still applies to this visit. */
    }
    const settings = bootstrap.data?.settings;
    if (!settings || settings.language === next) return;
    void service
      .execute("updateSettings", {
        input: { version: settings.version, language: next },
        command: { idempotency_key: commandKey() },
      })
      .then(() => client.invalidateQueries({ queryKey: ["sakha"] }))
      .catch(() => undefined);
  };
  useEffect(() => {
    const saved = bootstrap.data?.settings.language;
    if (!saved || applied.current || picked.current) return;
    applied.current = true;
    setLangState(saved);
    try {
      localStorage.setItem("sakha-lang", saved);
    } catch {
      /* The visit still uses the saved language. */
    }
  }, [bootstrap.data?.settings.language]);
  useEffect(() => {
    document.documentElement.lang = lang;
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
