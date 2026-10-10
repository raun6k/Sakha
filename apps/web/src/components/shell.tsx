import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  HelpCircle,
  History,
  Home,
  Leaf,
  MapPin,
  Menu,
  MessageCircle,
  Settings,
  Sprout,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { bootstrapFarm, useRead, useService } from "../services/context";
import { Modal } from "./ui";

const primary = [
  { to: "/", label: "Home", Icon: Home },
  { to: "/ask", label: "Ask Sakha", Icon: MessageCircle },
  { to: "/agents", label: "Agents", Icon: Users },
  { to: "/farm", label: "My Farm", Icon: Sprout },
];
const secondary = [
  { to: "/plan", label: "Farm Plan", Icon: CalendarDays },
  { to: "/alerts", label: "Alerts", Icon: Bell },
  { to: "/insights", label: "Insights", Icon: ChartNoAxesCombined },
  { to: "/activity", label: "Activity & decisions", Icon: History },
  { to: "/settings", label: "Settings", Icon: Settings },
  { to: "/help", label: "Help & data sources", Icon: HelpCircle },
];
function NavItems({ items }: { items: typeof primary }) {
  return (
    <>
      {items.map(({ to, label, Icon }) => (
        <NavLink key={to} end={to === "/"} to={to}>
          <Icon size={20} />
          <span>{label}</span>
        </NavLink>
      ))}
    </>
  );
}
export function Shell() {
  const { demo } = useService();
  const [more, setMore] = useState(false);
  const bootstrap = useRead("bootstrap", { input: {} });
  const farm = bootstrap.data ? bootstrapFarm(bootstrap.data) : undefined;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="brand" to="/">
          <Leaf size={36} />
          <div>
            Sakha<small>Your farming Command Center</small>
          </div>
        </Link>
        <nav aria-label="Primary navigation">
          <NavItems items={primary} />
        </nav>
        <div className="sidebar-divider" />
        <nav className="secondary-nav" aria-label="Supporting pages">
          <NavItems items={secondary} />
        </nav>
        <div className="sidebar-foot">
          <Leaf size={22} />
          <p>
            One farm.
            <br />A clearer way forward.
          </p>
          <small>Local work pauses when Sakha stops.</small>
        </div>
      </aside>
      <div className="main-wrap">
        <div className="utility-bar">
          <span>
            <MapPin size={15} />
            {farm?.location?.district ?? "Location not recorded"}
            {farm?.location?.state ? `, ${farm.location.state}` : ""}
          </span>
          <button
            type="button"
            className="icon-button mobile-more"
            aria-label="Open supporting pages"
            onClick={() => setMore(true)}
          >
            <Menu size={21} />
          </button>
          <Link to="/alerts" aria-label="Open alerts">
            <Bell size={20} />
          </Link>
        </div>
        {demo ? (
          <div className="demo-banner" role="status">
            Demonstration mode · synthetic records and events · no live advice
            or monitoring
            <Link to="/?mode=live" reloadDocument>
              Open real local profile
            </Link>
          </div>
        ) : null}
        {more ? (
          <Modal open onClose={() => setMore(false)} title="More in Sakha">
            <nav className="more-nav" aria-label="Supporting destinations">
              {secondary.map(({ to, label, Icon }) => (
                <Link key={to} to={to} onClick={() => setMore(false)}>
                  <Icon size={20} />
                  {label}
                </Link>
              ))}
            </nav>
          </Modal>
        ) : null}
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="app-footer">
          Sakha runs locally. Public-source and model availability are shown
          where used.
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile primary navigation">
        <NavItems items={primary} />
      </nav>
    </div>
  );
}
