---
title: Forecast cards in React
level: easy
time: 40
summary: A tool result has two readers. The model gets a few lines of text; the browser gets structured data and draws a card with icons and temperature bars. How the server sends both, how the reducer keeps the data, and the SVG, range-bar and accessibility details of the card. The real card runs in your browser.
tags: React, TypeScript, SVG, data visualisation, structured tool results, accessibility
---

The agent can describe the weather in words. A *picture* of seven days is faster to read than any sentence. So a `get_forecast` result has to serve **two readers** at once.

| Reader | Needs | Gets |
|---|---|---|
| The model | a few short, readable lines (cheap in tokens) | `content`: the text from lesson 2 |
| The browser | numbers it can plot and icons it can pick | `ui`: the structured forecast |

## One result, two payloads

```python src="weather-wise/backend/app/tools.py" region="toolbox" title="backend/app/tools.py"
```

In `_get_forecast` the same fetch produces `ToolResult(content=forecast_text(forecast), ..., ui={"type": "forecast", **forecast})`. The loop sends `content` back to Claude and `ui` out to the browser in the `tool_result` event. The model never sees the bulky `ui`, so it costs no tokens, and the browser never has to guess at numbers by parsing the model's prose.

:::tip Never draw from the model's words
It is tempting to let the model write the numbers and let the page show them. Don't. A model can mis-copy a figure, and a card showing a wrong temperature looks authoritative. Draw charts from **data your code fetched**, and let the model's sentences add the advice. When they disagree, the card is the one telling the truth, and a reader can spot the difference.
:::

## The types

```ts src="weather-wise/frontend/src/types.ts" region="types" title="frontend/src/types.ts"
```

`ToolUi` is a union, so `ui.type === "forecast"` narrows to a `Forecast`. The numbers are `number | null` because anything can be missing (lesson 2): the card shows a dash rather than `NaN`. And `Kind` is a closed list of icon names, so the compiler tells you when the server adds a kind that the icons do not cover.

The reducer keeps each step's `ui`, and one small function collects what the page should draw:

```ts src="weather-wise/frontend/src/chatReducer.ts" region="reducer" title="frontend/src/chatReducer.ts"
```

`forecastsOf(exchange)` returns the **successful** forecasts in arrival order. A failed lookup has `ui: null` and gets no card, only its red step.

## The card

```tsx src="weather-wise/frontend/src/components/ForecastCard.tsx" region="card" title="frontend/src/components/ForecastCard.tsx"
```

Three details are worth a closer look.

**The temperature bars** are the most useful part. Each day shows its low and high *as a bar between the coldest and the warmest point of the whole forecast*, so a glance shows which days are warmer and how wide the swing is. The geometry is a pure function with its own tests:

```ts src="weather-wise/frontend/src/format.ts" region="range-bars" title="frontend/src/format.ts"
```

For each day, `left` is where its low sits on the shared scale and `width` is the spread, both as percentages. A day whose low and high are equal would have a zero-width bar, so it is given a minimum of 4% and clamped to stay inside the track. A day with missing data gets `null` and no bar. The tests check exactly those cases.

**The rain chance** has a colour for how likely it is (`rainLevel`): grey for under 10%, then light, medium and strong blue. The number is always there too, because **colour must never be the only carrier of meaning** (a colour-blind reader, a printout, a screen reader).

**The icons** are inline SVG:

```tsx src="weather-wise/frontend/src/components/WeatherIcon.tsx" title="frontend/src/components/WeatherIcon.tsx"
```

Inline SVG needs no image files, scales without blurring, and takes its colours from CSS variables, so dark mode works with no extra code. Each icon has `role="img"` and an `aria-label` (its kind), so it is not silent to a screen reader.

## See it

This block runs the project's **real** `ForecastCard` and `WeatherIcon`, with two hand-typed forecasts (the first uses the real numbers for Pune from the saved fixture; the second is invented to show rain and a storm), and a gallery of every icon the app can draw.

```tsx run src="weather-wise/frontend/src/format.ts,weather-wise/frontend/src/components/WeatherIcon.tsx,weather-wise/frontend/src/components/ForecastCard.tsx" flat title="The real forecast card" level=easy
const css = `
:root{--panel:var(--card);--muted:var(--text-dim,#64748b);--sun:#f59e0b;--cloud:#7c93a6;--rain:#0284c7;--snow:#38bdf8;--storm:#7c3aed;--r-none:#94a3b8;--r-low:#38bdf8;--r-mid:#0284c7;--r-high:#1d4ed8}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px}
.forecast{border:1px solid var(--border);border-radius:12px;background:var(--panel);padding:12px 14px}
.forecast header{display:flex;flex-direction:column;gap:8px;padding-bottom:8px;border-bottom:1px solid var(--border)}
.where{display:flex;flex-direction:column}.where h3{font-size:15px;margin:0}.now{display:flex;align-items:center;gap:12px}.now .big{font-size:28px;line-height:1}
.small{font-size:12.5px}.muted{color:var(--muted)}
.days{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
.days li{display:grid;grid-template-columns:58px 28px 42px 32px minmax(30px,1fr) 32px;gap:8px;align-items:center;padding:3px 0}
.dow{display:flex;flex-direction:column;line-height:1.2}.rain{font-size:13px;text-align:right;font-weight:600}
.rain.none{color:var(--r-none);font-weight:400}.rain.low{color:var(--r-low)}.rain.mid{color:var(--r-mid)}.rain.high{color:var(--r-high)}
.lo{text-align:right;color:var(--muted)}.hi{font-weight:600}
.track{position:relative;height:6px;border-radius:99px;background:rgba(127,127,127,.2)}.track i{position:absolute;top:0;bottom:0;border-radius:99px;background:linear-gradient(90deg,var(--snow),var(--sun))}
.wicon .sun{color:var(--sun);stroke:var(--sun)}.wicon .cloud{stroke:var(--cloud);fill:color-mix(in srgb,var(--cloud) 22%,transparent)}
.wicon .drop{stroke:var(--rain)}.wicon.snow .drop{stroke:var(--snow)}.wicon .bolt{stroke:var(--storm);fill:var(--storm)}.wicon.fog .drop{stroke:var(--cloud)}
.gallery{display:flex;gap:18px;flex-wrap:wrap;margin-top:6px}.gallery figure{margin:0;text-align:center;font-size:12px}
`;

const day = (date: string, weekday: string, summary: string, kind: Kind, lo: number, hi: number, chance: number, mm: number): Day =>
  ({ date, weekday, summary, kind, temp_min: lo, temp_max: hi, rain_mm: mm, rain_chance: chance, wind_max: 12, uv_max: 6 });

const pune: Forecast = {
  type: "forecast", place: "Pune, Maharashtra, India", timezone: "Asia/Kolkata",
  current: { temp: 33.3, feels_like: 35.2, humidity: 32, wind: 8.3, rain_mm: 0, summary: "Mainly clear", kind: "clear", time: "2026-10-18T13:00" },
  days: [day("2026-10-18", "Sun", "Overcast", "cloud", 23.0, 34.1, 29, 0), day("2026-10-19", "Mon", "Partly cloudy", "partly", 23.2, 33.0, 22, 0), day("2026-10-20", "Tue", "Partly cloudy", "partly", 23.6, 34.0, 8, 0)],
};
const wet: Forecast = {
  type: "forecast", place: "Imaginary Hills, India", timezone: "Asia/Kolkata",
  current: { temp: 19.4, feels_like: 18, humidity: 91, wind: 14, rain_mm: 2.1, summary: "Rain showers", kind: "rain", time: "2026-10-18T13:00" },
  days: [day("2026-10-18", "Sun", "Rain showers", "rain", 15, 20, 85, 12), day("2026-10-19", "Mon", "Thunderstorm", "storm", 14, 19, 92, 25), day("2026-10-20", "Tue", "Fog", "fog", 13, 18, 20, 0),
         day("2026-10-21", "Wed", "Light snow", "snow", 2, 6, 60, 4), day("2026-10-22", "Thu", "Clear sky", "clear", 4, 21, 0, 0), day("2026-10-23", "Fri", "Light rain", "rain", 12, 17, 45, 3)],
};
const KINDS: Kind[] = ["clear", "partly", "cloud", "fog", "rain", "snow", "storm"];

export default function App() {
  return (
    <div className="stack">
      <style>{css}</style>
      <div className="cards"><ForecastCard f={pune} /><ForecastCard f={wet} /></div>
      <div className="gallery">{KINDS.map((k) => <figure key={k}><WeatherIcon kind={k} size={40} /><figcaption>{k}</figcaption></figure>)}</div>
    </div>
  );
}
```

Look at the second card. Its bars show the wide swing on Thursday (4° to 21°) against the narrow ones on the rainy days, and every number is present as text. Change a temperature in the code and run it again.

## The reading experience

When the answer is "done", the trace folds away and the **cards come first**, above the written answer: look at the numbers, then read the advice. When two cities are asked about, two cards sit side by side (CSS grid with `repeat(auto-fit, minmax(310px, 1fr))` wraps them to one column on a phone, with no media query needed).

:::keypoints
- A tool result can have two readers: text for the model, structured data for the browser. Send both; the model never sees the bulky one.
- Draw charts from data your code fetched, never from the model's prose.
- Type the data with `null` for anything missing, and show a dash rather than `NaN`.
- Put the geometry of a chart in a pure function and test it, including the edge cases (a zero-width bar, a missing day).
- Colour must never be the only carrier of meaning: always show the number. Inline SVG with `role="img"` and an `aria-label` is accessible, themeable and file-free.
:::

```quiz
? Why does the tool result carry both `content` and `ui`?
- The API requires two fields
+ The model needs short text, and the browser needs structured data to draw
- To make requests bigger
> Two readers, two formats. Only `content` is sent back to the model.
? Why show the rain chance as a number as well as a colour?
- The colour is not accurate
+ Colour alone excludes colour-blind readers and printouts; meaning must not depend on it
- Numbers are shorter
> A rule for every chart you will ever draw.
? What does `rangeBars` do for a day whose low and high temperature are equal?
- Throws an error
+ Gives it a minimum 4% width so it is still visible, kept inside the track
- Hides the day
> Edge cases belong in a pure function with tests.
```

:::exercise Wind and UV
Add two small rows to each day: a wind speed shown as an arrow whose length depends on `wind_max`, and the UV index shown as a number coloured at 3, 6 and 8 (the usual breakpoints). Put the colour choice in a tested pure function in `format.ts`, as `rainLevel` is. Which would you drop first on a narrow phone, and why?
:::
