import { Info } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Avatar } from "../components/avatar";
import { FieldArt } from "../components/field-art";
import { HowTeamWorks } from "../components/how-team-works";
import { State } from "../components/ui";
import { t } from "../copy";
import { useLang } from "../language";
import { useFarmId, useRead } from "../services/context";
import {
  applyRemoteTeam,
  buildTeam,
  isTeamId,
  roleKeyFor,
} from "../team/adapter";
import { Thread } from "./ask";

export function TeamPage() {
  const { lang } = useLang();
  const { mateId } = useParams();
  const farmId = useFarmId();
  const [how, setHow] = useState(false);
  const home = useRead(
    "getHome",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const mate = mateId && isTeamId(mateId) ? mateId : "sakha";
  const remote = useRead(
    "getTeam",
    { params: { farmId }, input: {} },
    Boolean(farmId),
  );
  const role = useRead(
    "getAgent",
    { params: { farmId, roleKey: roleKeyFor[mate] }, input: {} },
    Boolean(farmId),
  );
  if (home.isPending || role.isPending)
    return (
      <div className="splash">
        <FieldArt mood="calm" />
        <p>{t(lang, "loading")}</p>
      </div>
    );
  if (!role.data)
    return (
      <div className="route-content">
        <State title={t(lang, "startFailed")} retry={() => void role.refetch()}>
          {t(lang, "startFailedBody")}
        </State>
      </div>
    );
  const roster = applyRemoteTeam(buildTeam(home.data, lang), remote.data);
  const team = roster.filter((item) => item.id !== "sakha");
  const current = roster.find((item) => item.id === mate);
  if (mate !== "sakha")
    return (
      <div className="route-content">
        <Link className="text-link" to="/team">
          {t(lang, "backTeam")}
        </Link>
        <header className="mate-head">
          <Avatar id={mate} color={current?.color} />
          <div>
            <h1>{current?.name}</h1>
            <p>{current?.role}</p>
            <p>{current?.status}</p>
          </div>
          <button
            type="button"
            className="icon-button how-info"
            aria-label={t(lang, "howTeamWorks")}
            onClick={() => setHow(true)}
          >
            <Info size={26} />
          </button>
        </header>
        <HowTeamWorks open={how} onClose={() => setHow(false)} />
        <Thread role={role.data} mate={mate} embedded />
      </div>
    );
  return (
    <div className="route-content">
      <header className="mate-head">
        <Avatar id="sakha" color="#1F6F43" />
        <div>
          <h1>{t(lang, "yourTeam")}</h1>
          <p>{current?.role}</p>
          <p>{current?.status}</p>
        </div>
        <button
          type="button"
          className="icon-button how-info"
          aria-label={t(lang, "howTeamWorks")}
          onClick={() => setHow(true)}
        >
          <Info size={26} />
        </button>
      </header>
      <HowTeamWorks open={how} onClose={() => setHow(false)} />
      <Thread role={role.data} mate="sakha" embedded />
      <div className="teammate-grid">
        {team.map((item) => (
          <Link
            className={`teammate-card agent-${item.id}`}
            key={item.id}
            to={`/team/${item.id}`}
            style={{ borderColor: item.color }}
          >
            <Avatar id={item.id} color={item.color} />
            <div>
              <strong>{item.name}</strong>
              <p>{item.role}</p>
              <p>{item.status}</p>
            </div>
            <span className="button secondary">{t(lang, "talk")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
