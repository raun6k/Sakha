import { useRef, useState } from "react";
import { Link } from "react-router";
import { t } from "../copy";
import { useLang } from "../language";
import type { TeammateView } from "../team/adapter";
import { Avatar } from "./avatar";

export function DailyBrief({ team }: { team: TeammateView[] }) {
  const { lang } = useLang();
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  function place(next: number) {
    const el = scroller.current;
    const card = el?.children.item(next) as HTMLElement | null;
    card?.scrollIntoView({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
    setIndex(next);
  }
  function onScroll() {
    const el = scroller.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    const step = card.offsetWidth + 12;
    const next = Math.round(el.scrollLeft / step);
    setIndex(Math.min(team.length - 1, Math.max(0, next)));
  }
  return (
    <section className="daily-brief" aria-label={t(lang, "dailyBrief")}>
      <div className="section-head">
        <h2>{t(lang, "dailyBrief")}</h2>
        <p className="swipe-hint">{t(lang, "swipeHint")}</p>
      </div>
      <div className="team-strip" ref={scroller} onScroll={onScroll}>
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
      <div className="strip-dots">
        {team.map((mate, dot) => (
          <button
            key={mate.id}
            type="button"
            className={dot === index ? "on" : undefined}
            aria-label={mate.name}
            aria-current={dot === index ? "true" : undefined}
            onClick={() => place(dot)}
          />
        ))}
      </div>
    </section>
  );
}
