import { degrees, rainLevel, rangeBars, shortDate } from "../format";
import type { Forecast } from "../types";
import { WeatherIcon } from "./WeatherIcon";

// region: card
export function ForecastCard({ f }: { f: Forecast }) {
  const bars = rangeBars(f.days);
  const c = f.current;
  return (
    <article className="forecast" aria-label={`Forecast for ${f.place}`}>
      <header>
        <div className="where"><h3>{f.place}</h3><span className="muted">{f.timezone}</span></div>
        <div className="now">
          <WeatherIcon kind={c.kind} size={40} />
          <div>
            <b className="big">{degrees(c.temp)}</b>
            <div className="muted small">{c.summary} · feels {degrees(c.feels_like)} · {c.humidity ?? "–"}% humidity · {c.wind ?? "–"} km/h</div>
          </div>
        </div>
      </header>
      <ul className="days">
        {f.days.map((d, i) => (
          <li key={d.date}>
            <span className="dow"><b>{i === 0 ? "Today" : d.weekday}</b><span className="muted small">{shortDate(d.date)}</span></span>
            <WeatherIcon kind={d.kind} size={26} />
            <span className={`rain ${rainLevel(d.rain_chance)}`} title={`${d.rain_mm ?? 0} mm expected`}>{d.rain_chance === null ? "–" : `${d.rain_chance}%`}</span>
            <span className="lo">{degrees(d.temp_min)}</span>
            <span className="track" aria-hidden>{bars[i] && <i style={{ left: `${bars[i]!.left}%`, width: `${bars[i]!.width}%` }} />}</span>
            <span className="hi">{degrees(d.temp_max)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
// endregion: card
