import type { TeamId } from "../team/adapter";

const colors: Record<TeamId, string> = {
  sakha: "#1F6F43",
  megha: "#2B7BB9",
  jal: "#5BA8D6",
  kheti: "#8B5E3C",
  paisa: "#F2A93B",
};

export function Avatar({ id, color }: { id: TeamId; color?: string }) {
  const ink = color ?? colors[id];
  return (
    <svg
      className="avatar"
      viewBox="0 0 72 72"
      aria-hidden="true"
      style={{ ["--glow" as string]: ink }}
    >
      <circle cx="36" cy="36" r="36" fill={ink} />
      {id === "sakha" ? <Sakha /> : null}
      {id === "megha" ? <Megha /> : null}
      {id === "jal" ? <Jal /> : null}
      {id === "kheti" ? <Kheti /> : null}
      {id === "paisa" ? <Paisa /> : null}
    </svg>
  );
}

function Sakha() {
  return (
    <g>
      <path d="M18 32c2-14 34-14 36 0v6H18z" fill="#F2A93B" />
      <path d="M22 32h28v4H22z" fill="#E0892A" />
      <circle cx="36" cy="36" r="11" fill="#F6D7B0" />
      <path
        d="M28 40c2 4 14 4 16 0"
        fill="none"
        stroke="#C48A62"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="44" y="38" width="14" height="18" rx="2" fill="#FAF7F0" />
      <path d="M47 43h8M47 47h8M47 51h5" stroke="#1F6F43" strokeWidth="1.4" />
      <circle cx="18" cy="50" r="7" fill="#2E9E5B" />
      <path
        d="M18 46v8M15 50h6"
        stroke="#FAF7F0"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </g>
  );
}

function Megha() {
  return (
    <g>
      <path
        d="M16 24c8-10 18-6 20 2 6-6 16-2 16 6H22c-4 0-8-3-6-8z"
        fill="#FAF7F0"
      />
      <path
        d="M22 26c8 8 22 2 26-2"
        fill="none"
        stroke="#2B7BB9"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="36" cy="40" r="10" fill="#F6D7B0" />
      <path d="M26 36c1-8 18-8 20 0" fill="#1E2A22" />
      <path
        d="M24 52h24"
        stroke="#FAF7F0"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="52" cy="18" r="5" fill="#F2A93B" />
    </g>
  );
}

function Jal() {
  return (
    <g>
      <path
        d="M36 12c10 12 18 18 18 28a18 18 0 1 1-36 0c0-10 8-16 18-28z"
        fill="#E7F3FA"
      />
      <circle cx="36" cy="42" r="7" fill="#F6D7B0" />
      <path
        d="M16 54h8l3-5 3 8 3-6 4 3h16"
        fill="none"
        stroke="#1E2A22"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="52" cy="50" r="3.2" fill="#1E2A22" />
    </g>
  );
}

function Kheti() {
  return (
    <g>
      <circle cx="32" cy="36" r="11" fill="#F6D7B0" />
      <path d="M20 34c2-12 22-14 26-2-6 2-8 6-6 8" fill="#1E2A22" />
      <path d="M48 16c8 2 10 12 4 16-6-2-8-8-4-16z" fill="#2E9E5B" />
      <path
        d="M50 22c3 4 2 8-1 10"
        fill="none"
        stroke="#17583A"
        strokeWidth="1.4"
      />
      <rect x="46" y="40" width="7" height="16" rx="3" fill="#FAF7F0" />
      <path d="M49.5 44v8" stroke="#2B7BB9" strokeWidth="1.6" />
      <path
        d="M22 54c8 4 16 2 22-2"
        fill="none"
        stroke="#FAF7F0"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </g>
  );
}

function Paisa() {
  return (
    <g>
      <circle cx="30" cy="34" r="11" fill="#F6D7B0" />
      <path d="M20 32c2-10 18-12 22-2" fill="#1E2A22" />
      <rect x="38" y="26" width="16" height="22" rx="2" fill="#FAF7F0" />
      <path d="M41 32h10M41 36h8M41 40h9" stroke="#8B5E3C" strokeWidth="1.5" />
      <circle cx="54" cy="52" r="9" fill="#1F6F43" />
      <text
        x="54"
        y="56"
        textAnchor="middle"
        fontSize="12"
        fill="#F2A93B"
        fontFamily="sans-serif"
      >
        ₹
      </text>
    </g>
  );
}
