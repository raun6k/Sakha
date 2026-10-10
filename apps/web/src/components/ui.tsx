import type { Fact, Quantity, Role, RoleKey, Source } from "@sakha/contracts";
import {
  AlertCircle,
  ArrowRight,
  CloudSun,
  Droplets,
  Info,
  Landmark,
  Leaf,
  Sparkles,
  Sprout,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { type ReactNode, useRef } from "react";
import { Link } from "react-router";
import { errorMessage } from "../services/http";
export const roleIcons: Record<RoleKey, typeof Leaf> = {
  chief_of_staff: Sparkles,
  climate: TrendingUp,
  weather: CloudSun,
  crop_planning: Sprout,
  crop_care: Leaf,
  water: Droplets,
  market: TrendingUp,
  farm_finance: Wallet,
  government_support: Landmark,
};
export function RoleIcon({ role }: { role: RoleKey }) {
  const Icon = roleIcons[role];
  return (
    <span className={`role-icon role-${role}`}>
      <Icon size={25} strokeWidth={1.8} />
    </span>
  );
}
export function Card({
  title,
  children,
  action,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <div className="section-head">
          <h2>{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}
export function Banner({ text }: { text: string }) {
  return (
    <div className="farm-banner">
      <p>{text}</p>
      <span>Recorded context. Thoughtful decisions.</span>
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function State({
  title,
  children,
  retry,
}: {
  title: string;
  children?: ReactNode;
  retry?: () => void;
}) {
  return (
    <div className="state-panel">
      <Info size={22} />
      <div>
        <h3>{title}</h3>
        {children ? <div className="state-copy">{children}</div> : null}
        {retry ? (
          <button type="button" className="button secondary" onClick={retry}>
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <div role="alert" className="notice error">
      <AlertCircle size={20} />
      {errorMessage(error)}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <State title="Loading saved information…">
      Connecting to your local Sakha records.
    </State>
  );
}
export function Modal({
  open,
  onClose,
  title,
  children,
  description,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  description?: string;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onOpenAutoFocus={() => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <div className="section-head">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close">
              <X size={22} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="muted">
            {description ??
              "Review the details below. Closing returns you to your current page."}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: Each Field caller supplies a nested native input/select/textarea. */}
      <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <span>{label}</span>
        {children}
      </label>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
export function quantityText(
  value:
    | Quantity
    | string
    | boolean
    | { minor_units: number; currency: string }
    | undefined,
): string {
  if (value === undefined) return "Not recorded";
  if (typeof value === "string") return value.replaceAll("_", " ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if ("minor_units" in value)
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: value.currency,
    }).format(value.minor_units / 100);
  switch (value.kind) {
    case "known":
      return `${value.value} ${value.unit}`;
    case "range":
      return `${value.min}–${value.max} ${value.unit}`;
    case "qualitative":
      return value.text;
    case "unknown":
      return `Unknown${value.reason ? `: ${value.reason}` : ""}`;
    case "not_applicable":
      return "Not applicable";
  }
}
export function factValue(facts: Fact[], key: string) {
  return quantityText(facts.filter((f) => f.key === key).at(-1)?.value);
}
export function RoleCard({ role, info }: { role: Role; info?: () => void }) {
  const cap = role.capabilities.find((c) => c.key === "chat");
  return (
    <article className="role-card">
      <div className="section-head">
        <RoleIcon role={role.key} />
        <Badge tone={cap?.status === "enabled" ? "green" : "gold"}>
          {cap?.status.replaceAll("_", " ") ?? "Unavailable"}
        </Badge>
      </div>
      <h2>{role.name}</h2>
      <p>{role.description}</p>
      <p className="role-question">“{role.questions[0]}”</p>
      <div className="actions">
        <Link className="text-link" to={`/agents/${role.key}`}>
          Explore specialist <ArrowRight size={16} />
        </Link>
        {info ? (
          <button
            type="button"
            className="icon-button"
            aria-label={`About ${role.name}`}
            onClick={info}
          >
            <Info size={19} />
          </button>
        ) : null}
      </div>
    </article>
  );
}
export function SourceCard({
  source,
  onOpen,
}: {
  source: Source;
  onOpen: () => void;
}) {
  return (
    <div className="source-row">
      <div>
        <h3>{source.name}</h3>
        <p>{source.definition}</p>
        <Badge>{source.capability.status.replaceAll("_", " ")}</Badge>
      </div>
      <button type="button" className="button secondary" onClick={onOpen}>
        Source details
      </button>
    </div>
  );
}
export function DateText({
  value,
  precision = "exact",
}: {
  value?: string;
  precision?: string;
}) {
  const display = value
    ? new Date(value).toLocaleString(
        "en-IN",
        precision === "exact"
          ? { dateStyle: "medium", timeStyle: "short" }
          : precision === "month"
            ? { month: "long", year: "numeric" }
            : { dateStyle: "medium" },
      )
    : "Time not recorded";
  return (
    <time dateTime={value}>
      {precision === "approximate" ? "Around " : ""}
      {display}
    </time>
  );
}
