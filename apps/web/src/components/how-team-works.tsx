import { t } from "../copy";
import { useLang } from "../language";
import { teammateName } from "../team/adapter";
import { Avatar } from "./avatar";
import { Modal } from "./ui";

const roster = ["sakha", "megha", "jal", "kheti", "paisa"] as const;

export function HowTeamWorks({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { lang } = useLang();
  return (
    <Modal open={open} onClose={onClose} title={t(lang, "howTeamWorks")}>
      <div className="how-sheet">
        <div className="how-roster">
          {roster.map((id) => (
            <div key={id}>
              <Avatar id={id} />
              <strong>{teammateName(id, lang)}</strong>
            </div>
          ))}
        </div>
        <p>{t(lang, "howLead")}</p>
        <p>{t(lang, "howStrands")}</p>
        <p>{t(lang, "howCedar")}</p>
        <p>{t(lang, "howNumbers")}</p>
        <button type="button" className="button" onClick={onClose}>
          {t(lang, "close")}
        </button>
      </div>
    </Modal>
  );
}
