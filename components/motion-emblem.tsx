export function MotionEmblem({
  variant = "shop",
}: {
  variant?: "shop" | "growth";
}) {
  return (
    <svg
      className={`motion-emblem emblem-${variant}`}
      viewBox="0 0 180 160"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="89" cy="81" r="65" fill="currentColor" opacity=".08" />
      <g className="emblem-orbit">
        <circle cx="26" cy="47" r="7" fill="#f5a45d" />
        <path d="m145 25 3 7 8 3-8 3-3 8-3-8-8-3 8-3 3-7Z" fill="#8053dc" />
        <circle cx="149" cy="121" r="4" fill="#12a590" />
      </g>
      {variant === "shop" ? (
        <g className="emblem-main">
          <path
            d="M48 69h84v63H48z"
            fill="#fff"
            stroke="#7650d7"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path d="m46 68 10-29h68l10 29" fill="#bda6f0" />
          <path
            d="m67 39-4 29m26-29v29m21-29 6 29"
            stroke="#fff"
            strokeWidth="11"
          />
          <path
            d="M45 68c0 14 18 14 18 0 0 14 26 14 26 0 0 14 27 14 27 0 0 14 18 14 18 0"
            fill="#7650d7"
          />
          <path d="M61 94h24v22H61z" fill="#d0f3e9" />
          <path d="M101 94h17v38h-17z" fill="#eee6ff" />
          <path
            d="m62 105 7 7 11-15"
            stroke="#087f70"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      ) : (
        <g className="emblem-main">
          <path
            d="M89 126V66"
            stroke="#087f70"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path d="M89 94C44 96 46 57 46 57c34-1 45 19 43 37Z" fill="#16ad92" />
          <path d="M89 78c-4-35 36-44 36-44s11 40-36 44Z" fill="#9673df" />
          <path
            d="M64 130h50"
            stroke="#087f70"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
}
