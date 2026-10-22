---
title: Parsing a real weather API
level: easy
time: 40
summary: The forecast arrives as columns of numbers and weather codes. Turn it into clean rows, with words for the codes, tolerant of missing data, and into a short text the model can read cheaply. All pure functions, run here on a real saved response.
tags: parsing, JSON, WMO codes, pure functions, fixtures, tokens
---

An agent's tool must hand the model something it can use. Raw API responses rarely are. Between the network and the model sits a layer that **parses and shapes**, and it is worth keeping *pure*: a function from JSON to a clean dictionary, with no network in it. Then you can test it on a saved response, and run it anywhere (including in this page).

## What the service sends

Here, trimmed, is a real answer from the forecast endpoint for Pune (a request for three days):

```json title="Open-Meteo's forecast response (abridged)"
{
  "timezone": "Asia/Kolkata",
  "current": { "time": "2026-10-18T13:00", "temperature_2m": 33.3, "apparent_temperature": 35.2,
               "relative_humidity_2m": 32, "weather_code": 1, "wind_speed_10m": 8.3 },
  "daily": {
    "time":                          ["2026-10-18", "2026-10-19", "2026-10-20"],
    "weather_code":                  [3, 2, 2],
    "temperature_2m_max":            [34.1, 33.0, 34.0],
    "temperature_2m_min":            [23.0, 23.2, 23.6],
    "precipitation_probability_max": [29, 22, 8],
    "wind_speed_10m_max":            [10.7, 10.7, 11.3]
  }
}
```

Three things make this awkward:

1. **It is column-oriented.** One list per measure, with the *i*th entry of each list belonging to day *i*. You think in days; the service thinks in columns.
2. **The weather is a number.** `weather_code: 3` means "overcast". Codes follow a standard, the WMO weather interpretation codes. Nobody (and no model) should have to remember that 61 is light rain and 95 is a thunderstorm.
3. **Any value can be missing.** A day may lack a UV figure; a short list may not reach day 7. Code that indexes blindly will crash on the day that matters.

## Words for the codes

```python src="weather-wise/backend/app/weather.py" region="codes" title="backend/app/weather.py"
```

Each code maps to **words** (for the model and the person) and an **icon kind** (for the browser's picture). Unknown codes get "Unknown conditions" rather than a crash: the service may add codes tomorrow. The test `every weather code has words and an icon` keeps the table honest.

## Columns into rows

```python src="weather-wise/backend/app/weather.py" region="parse-forecast" title="backend/app/weather.py"
```

`_at(columns, key, i)` is the small hero: it returns `None` when a list is missing or too short, instead of raising. Missing numbers stay `None` all the way to the interface, which draws a dash. **Decide once, at the edge, how absence is represented**, and the rest of the program never needs to wonder.

## Shaping text for the model

```python src="weather-wise/backend/app/weather.py" region="for-the-model" title="backend/app/weather.py"
```

The model does not need JSON. It needs *facts it can read*. One line per day, with the weekday and date (so it can work out "this weekend"), the conditions in words, and only the numbers that matter. This does two jobs: it is **cheaper** (you pay for every token you send, on every later call too), and **easier** for the model to use correctly than a nest of brackets.

## Try it on a real response

The block below runs the real parsing code on a response captured from Open-Meteo, the same file the tests use.

```python run src="weather-wise/backend/app/weather.py#codes+parse-forecast+for-the-model" dir="weather-wise/backend/tests/fixtures" title="From columns to rows to text" level=easy
import json
from datetime import date

raw = json.loads(SAMPLE_FILES["forecast_pune.json"])
print("raw 'daily' keys:", list(raw["daily"]))
print("raw JSON is", len(SAMPLE_FILES["forecast_pune.json"]), "characters\n")

forecast = parse_forecast("Pune, Maharashtra, India", raw)
print("one parsed day:")
for k, v in forecast["days"][0].items():
    print(f"  {k:<12}{v}")

text = forecast_text(forecast)
print("\nwhat the model reads (%d characters):" % len(text))
print(text)

print("\nmissing data does not crash it:")
partial = parse_forecast("Nowhere", {"daily": {"time": ["2026-10-18", "2026-10-19"], "weather_code": [61], "temperature_2m_max": [30.0, 31.0]}})
print(" ", [(d["date"], d["summary"], d["temp_min"]) for d in partial["days"]])
```

```output
raw 'daily' keys: ['time', 'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'precipitation_probability_max', 'wind_speed_10m_max', 'uv_index_max']
raw JSON is 1103 characters

one parsed day:
  date        2026-10-18
  weekday     Sun
  summary     Overcast
  kind        cloud
  temp_max    34.1
  temp_min    23.0
  rain_mm     0.0
  rain_chance 29
  wind_max    10.7
  uv_max      7.5

what the model reads (416 characters):
Pune, Maharashtra, India (times are local). Now: Mainly clear, 33.3°C, feels like 35.2°C, humidity 32%, wind 8.3 km/h.
Sun 2026-10-18: Overcast, 23.0-34.1°C, 29% chance of rain, 0.0 mm, wind up to 10.7 km/h, UV 7.5
Mon 2026-10-19: Partly cloudy, 23.2-33.0°C, 22% chance of rain, 0.0 mm, wind up to 10.7 km/h, UV 7.45
Tue 2026-10-20: Partly cloudy, 23.6-34.0°C, 8% chance of rain, 0.0 mm, wind up to 11.3 km/h, UV 7.4

missing data does not crash it:
  [('2026-10-18', 'Light rain', None), ('2026-10-19', 'Unknown conditions', None)]
```

Look at the sizes. The model's text is a fraction of the raw JSON, and the raw file is only a three-day sample. A seven-day forecast with hourly data would be far larger. Every character you do not send is money and attention saved.

:::tip Keep a real response as a test fixture
`backend/tests/fixtures/` holds responses captured from the real service, saved as files. Tests parse them, so the parsing is tested against *real* data (not data you imagined), and the tests run offline and never change. When the service changes its format, you capture a new file and fix the parser, instead of finding out in production.
:::

## The tests

```python src="weather-wise/backend/tests/test_weather_parse.py" region="parse-tests" title="backend/tests/test_weather_parse.py"
```

The rest of the file checks missing data, that every weather code has words and an icon, and that the text for the model is four short lines. Note the last assertion in the text test: it checks the text is under 700 characters. A *size budget* in a test is a cheap way to stop a well-meant change from quietly doubling your costs.

:::keypoints
- Between the network and the model sits a layer that parses and shapes. Keep it pure so it is testable and portable.
- Real APIs are awkward: column-oriented data, numeric codes, missing values. Handle each at the edge, once.
- Represent absence as `None` and let the interface draw a dash.
- Send the model short text of facts, not raw JSON. It is cheaper and easier to use.
- Save real responses as fixtures and test against them.
:::

```quiz
? Why does `_at(columns, key, i)` return None instead of raising an error?
- Python lists cannot raise errors
+ A missing value should not crash the whole forecast; it should show as a dash
- To make the code shorter
> Decide once, at the edge, how absence is represented.
? Why give the model a few short lines of text instead of the raw JSON?
- The model cannot read JSON
+ It uses fewer tokens, and the facts are easier to use correctly
- The API forbids JSON
> Tokens cost money on every call, and shaped text is easier to reason about.
? What is a test fixture here?
+ A real response saved as a file so parsing tests run offline against real data
- A broken weather station
- A copy of the model
> It freezes the real world so the tests are repeatable.
```

:::exercise Wind words
Add a `wind_words(kmh)` function that turns a speed into "calm", "breezy" or "windy" (choose the thresholds and defend them), use it in `forecast_text`, and add a test. Then check the 700-character budget test still passes. What would you do if it did not?
:::
