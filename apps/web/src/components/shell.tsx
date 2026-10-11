import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
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
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { LocationEdit } from "../pages/farm";
import {
  bootstrapFarm,
  useFarmId,
  useRead,
  useService,
} from "../services/context";
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
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [mobileAgents, setMobileAgents] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const farmId = useFarmId();
  const agents = useRead(
    "listAgents",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const bootstrap = useRead("bootstrap", { input: {} });
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(
      bootstrap.data?.settings.reduced_motion ?? false,
    );
  }, [bootstrap.data?.settings.reduced_motion]);
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
          {primary.map((item) =>
            item.to === "/agents" ? (
              <div key={item.to}>
                <button
                  type="button"
                  className="agents-toggle"
                  aria-expanded={agentsOpen}
                  aria-controls="sidebar-agents"
                  onClick={() => setAgentsOpen(!agentsOpen)}
                >
                  <Users size={20} />
                  <span>Agents</span>
                  <ChevronDown size={17} />
                </button>
                {agentsOpen ? (
                  <div id="sidebar-agents" className="agent-links">
                    {agents.data?.map((role) => (
                      <NavLink
                        key={role.key}
                        to={
                          role.key === "sakha"
                            ? "/ask"
                            : `/agents/${role.key}?tab=chat`
                        }
                      >
                        {role.name}
                      </NavLink>
                    ))}
                    <Link to="/agents">View agent directory</Link>
                  </div>
                ) : null}
              </div>
            ) : (
              <NavItems key={item.to} items={[item]} />
            ),
          )}
        </nav>
        <div className="sidebar-divider" />
        <nav className="secondary-nav" aria-label="Supporting pages">
          <NavItems items={secondary} />
        </nav>
        <div className="sidebar-foot">
          <small>Local work pauses when Sakha stops.</small>
        </div>
      </aside>
      <div className="main-wrap">
        <div className="utility-bar">
          <button
            type="button"
            className="location-button"
            aria-label="Edit farm location"
            onClick={() => setLocationOpen(true)}
          >
            <MapPin size={15} />
            {farm?.location?.district ?? "Location not recorded"}
            {farm?.location?.state ? `, ${farm.location.state}` : ""}
          </button>
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
        {demo || bootstrap.data?.demo_profile ? (
          <div className="demo-banner" role="status">
            {demo
              ? "UI fixtures · synthetic sources and events"
              : "Demo farm · illustrative farmer records · attributed official sources"}
            {demo ? (
              <Link to="/?mode=live" reloadDocument>
                Open local backend
              </Link>
            ) : null}
          </div>
        ) : null}
        <Modal
          open={locationOpen}
          onClose={() => setLocationOpen(false)}
          title="Review farm location"
        >
          {farm ? (
            <LocationEdit farm={farm} onClose={() => setLocationOpen(false)} />
          ) : null}
        </Modal>
        <Modal
          open={mobileAgents}
          onClose={() => setMobileAgents(false)}
          title="Your agents"
        >
          <nav className="more-nav">
            {agents.data?.map((role) => (
              <Link
                key={role.key}
                to={
                  role.key === "sakha" ? "/ask" : `/agents/${role.key}?tab=chat`
                }
                onClick={() => setMobileAgents(false)}
              >
                {role.name}
              </Link>
            ))}
            <Link to="/agents" onClick={() => setMobileAgents(false)}>
              View agent directory
            </Link>
          </nav>
        </Modal>
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
        {primary.map((item) =>
          item.to === "/agents" ? (
            <button
              key={item.to}
              type="button"
              className="mobile-agents-button"
              onClick={() => setMobileAgents(true)}
            >
              <Users size={20} />
              <span>Agents</span>
            </button>
          ) : (
            <NavItems key={item.to} items={[item]} />
          ),
        )}
      </nav>
    </div>
  );
}
