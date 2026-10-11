import { Link } from "react-router";
import { t } from "../copy";
import { useLang } from "../language";
import type { TeammateView } from "../team/adapter";
import { Avatar } from "./avatar";

export function DailyBrief({ team }: { team: TeammateView[] }) {
  const { lang } = useLang();
  return (
    <section className="daily-brief" aria-label={t(lang, "dailyBrief")}>
      <div className="section-head">
        <h2>{t(lang, "dailyBrief")}</h2>
        <p>{t(lang, "yourTeam")}</p>
      </div>
      <div className="team-strip">
        {team.map((mate) => (
          <Link
            className="team-pill"
            key={mate.id}
            to={mate.id === "sakha" ? "/team" : `/team/${mate.id}`}
            style={{ borderColor: mate.color }}
          >
            <Avatar id={mate.id} color={mate.color} />
            <strong>{mate.name}</strong>
            <span className="team-role">{mate.role}</span>
            <em>{mate.status}</em>
          </Link>
        ))}
      </div>
    </section>
  );
}
