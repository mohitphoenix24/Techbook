import type { Kind } from "../types";

const CLOUD = "M7 19a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 10.5 4.25 4.25 0 0 1 17.5 19Z";

/** A small SVG for each kind of weather. Colours come from CSS variables, so dark mode works with no extra code. */
export function WeatherIcon({ kind, size = 28 }: { kind: Kind; size?: number }) {
  return (
    <svg className={`wicon ${kind}`} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={kind} fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {(kind === "clear" || kind === "partly") && (
        <g className="sun" transform={kind === "partly" ? "translate(-0.5 -0.5) scale(0.75)" : undefined}>
          <circle cx="12" cy="12" r="4.2" fill="currentColor" />
          <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
        </g>
      )}
      {kind !== "clear" && <path className="cloud" d={CLOUD} transform={kind === "partly" ? "translate(1 1)" : undefined} />}
      {kind === "fog" && <path className="drop" d="M5 21h14M8 23.5h8" transform="translate(0 -1.5)" />}
      {kind === "rain" && <path className="drop" d="M8 21l-1 2M12 21l-1 2M16 21l-1 2" transform="translate(0 -1)" />}
      {kind === "snow" && <path className="drop" d="M8 21.5h.01M12 22h.01M16 21.5h.01M10 23h.01M14 23h.01" strokeWidth="2.4" transform="translate(0 -1)" />}
      {kind === "storm" && <path className="bolt" d="M12.5 15l-2.5 4h3l-1.5 4" transform="translate(0 -2.5)" />}
    </svg>
  );
}
