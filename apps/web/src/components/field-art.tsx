export function FieldArt({
  mood = "watch",
}: {
  mood?: "act" | "watch" | "safe" | "calm";
}) {
  const sky =
    mood === "act"
      ? ["#E25B45", "#F2A93B"]
      : mood === "safe"
        ? ["#D7EBF8", "#E7F6EE"]
        : mood === "calm"
          ? ["#F3E6C8", "#E7F0E4"]
          : ["#F6E7C2", "#F3D7A2"];
  const field =
    mood === "act" ? "#C9D7A4" : mood === "safe" ? "#1F6F43" : "#2E9E5B";
  const field2 = mood === "act" ? "#A9C48B" : "#17583A";
  const id = `sky-${mood}`;
  return (
    <svg
      className={`field-art mood-${mood}`}
      viewBox="0 0 640 220"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
      </defs>
      <rect width="640" height="220" fill={`url(#${id})`} />
      {mood === "safe" ? (
        <>
          <circle
            className="rain-drop"
            cx="120"
            cy="36"
            r="3.5"
            fill="#2B7BB9"
          />
          <circle
            className="rain-drop delay"
            cx="180"
            cy="58"
            r="3"
            fill="#2B7BB9"
          />
          <circle
            className="rain-drop"
            cx="250"
            cy="28"
            r="3.5"
            fill="#2B7BB9"
          />
        </>
      ) : (
        <g className="sun">
          <circle cx="500" cy="62" r="28" fill="#F2A93B" />
          <circle cx="500" cy="62" r="40" fill="#F2A93B" opacity="0.28" />
        </g>
      )}
      {mood === "watch" || mood === "calm" ? (
        <g fill="#fff" opacity="0.85">
          <ellipse cx="150" cy="58" rx="36" ry="16" />
          <ellipse cx="178" cy="52" rx="26" ry="14" />
          <ellipse cx="126" cy="54" rx="22" ry="12" />
        </g>
      ) : null}
      <ellipse cx="210" cy="168" rx="250" ry="58" fill={field2} />
      <ellipse cx="430" cy="186" rx="280" ry="52" fill={field} />
      <path
        d="M40 176 C160 166 220 190 320 178 C420 166 500 188 620 174"
        fill="none"
        stroke="#8B5E3C"
        strokeWidth="3"
        opacity="0.55"
      />
      <path
        d="M70 196 C180 188 250 206 360 196 C460 186 530 204 610 194"
        fill="none"
        stroke="#FAF7F0"
        strokeWidth="2"
        opacity="0.35"
      />
    </svg>
  );
}
