import { CalendarDays, Home, Leaf, Sprout, Users } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet } from "react-router";
import { t } from "../copy";
import { useLang } from "../language";
import { useRead } from "../services/context";
import { LanguageToggle } from "./language-toggle";

const tabs = [
  { to: "/", key: "home", Icon: Home },
  { to: "/team", key: "team", Icon: Users },
  { to: "/plan", key: "plan", Icon: CalendarDays },
  { to: "/farm", key: "farm", Icon: Sprout },
] as const;

export function Shell() {
  const { lang } = useLang();
  const bootstrap = useRead("bootstrap", { input: {} });
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(
      bootstrap.data?.settings.reduced_motion ?? false,
    );
  }, [bootstrap.data?.settings.reduced_motion]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t(lang, "skipToContent")}
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <Leaf size={26} />
            </span>
            <div>
              Sakha
              <small>{t(lang, "brandNote")}</small>
            </div>
          </div>
          <div className="topbar-side">
            <LanguageToggle />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <nav className="tab-bar" aria-label={t(lang, "home")}>
        {tabs.map(({ to, key, Icon }) => (
          <NavLink key={to} end={to === "/"} to={to}>
            <Icon size={22} />
            <span>{t(lang, key)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
