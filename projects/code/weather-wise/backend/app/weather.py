"""Talking to Open-Meteo, a free weather service that needs no key. Two kinds of code live here and they are kept apart:
`parse_*` functions turn the service's JSON into small clean dicts (pure, easy to test), `fetch_*` functions do the network."""
from datetime import date
from typing import Any

import httpx

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


class WeatherError(Exception):
    """Something went wrong getting weather. The message is written for the model to read and act on."""


# region: codes
# WMO weather codes, as Open-Meteo reports them: code -> (words, icon kind for the browser)
WMO: dict[int, tuple[str, str]] = {
    0: ("Clear sky", "clear"), 1: ("Mainly clear", "clear"), 2: ("Partly cloudy", "partly"), 3: ("Overcast", "cloud"),
    45: ("Fog", "fog"), 48: ("Freezing fog", "fog"),
    51: ("Light drizzle", "rain"), 53: ("Drizzle", "rain"), 55: ("Heavy drizzle", "rain"),
    56: ("Light freezing drizzle", "rain"), 57: ("Freezing drizzle", "rain"),
    61: ("Light rain", "rain"), 63: ("Rain", "rain"), 65: ("Heavy rain", "rain"),
    66: ("Light freezing rain", "rain"), 67: ("Freezing rain", "rain"),
    71: ("Light snow", "snow"), 73: ("Snow", "snow"), 75: ("Heavy snow", "snow"), 77: ("Snow grains", "snow"),
    80: ("Light rain showers", "rain"), 81: ("Rain showers", "rain"), 82: ("Violent rain showers", "rain"),
    85: ("Light snow showers", "snow"), 86: ("Heavy snow showers", "snow"),
    95: ("Thunderstorm", "storm"), 96: ("Thunderstorm with hail", "storm"), 99: ("Thunderstorm with heavy hail", "storm"),
}


def describe(code: int | None) -> tuple[str, str]:
    return WMO.get(code, ("Unknown conditions", "cloud")) if code is not None else ("Unknown conditions", "cloud")
# endregion: codes


# region: parse-places
def parse_places(payload: dict, limit: int = 3) -> list[dict]:
    """Geocoding JSON -> up to `limit` places. A search with no matches has no `results` key at all."""
    places = []
    for r in (payload.get("results") or [])[:limit]:
        parts = [r.get("name"), r.get("admin1"), r.get("country")]
        label = ", ".join(dict.fromkeys(p for p in parts if p))          # drop repeats such as "Singapore, Singapore"
        places.append({"id": r["id"], "label": label, "country_code": r.get("country_code"), "latitude": r["latitude"],
                       "longitude": r["longitude"], "timezone": r.get("timezone"), "population": r.get("population")})
    return places
# endregion: parse-places


# region: parse-forecast
def parse_forecast(label: str, payload: dict) -> dict:
    """Forecast JSON -> {place, timezone, current, days[]}. The service sends columns (one list per measure); we turn them into rows."""
    cur, daily = payload.get("current") or {}, payload.get("daily") or {}
    words, kind = describe(cur.get("weather_code"))
    current = {"temp": cur.get("temperature_2m"), "feels_like": cur.get("apparent_temperature"), "humidity": cur.get("relative_humidity_2m"),
               "wind": cur.get("wind_speed_10m"), "rain_mm": cur.get("precipitation"), "summary": words, "kind": kind, "time": cur.get("time")}
    days = []
    for i, day in enumerate(daily.get("time") or []):
        text, kind = describe(_at(daily, "weather_code", i))
        days.append({
            "date": day, "weekday": date.fromisoformat(day).strftime("%a"), "summary": text, "kind": kind,
            "temp_max": _at(daily, "temperature_2m_max", i), "temp_min": _at(daily, "temperature_2m_min", i),
            "rain_mm": _at(daily, "precipitation_sum", i), "rain_chance": _at(daily, "precipitation_probability_max", i),
            "wind_max": _at(daily, "wind_speed_10m_max", i), "uv_max": _at(daily, "uv_index_max", i),
        })
    return {"place": label, "timezone": payload.get("timezone"), "current": current, "days": days}


def _at(columns: dict, key: str, i: int):
    values = columns.get(key) or []
    return values[i] if i < len(values) else None
# endregion: parse-forecast


# region: for-the-model
def forecast_text(f: dict) -> str:
    """The forecast as short lines of text for the model: far fewer tokens than the raw JSON, and easy to read."""
    c = f["current"]
    lines = [f"{f['place']} (times are local). Now: {c['summary']}, {c['temp']}°C, feels like {c['feels_like']}°C, humidity {c['humidity']}%, wind {c['wind']} km/h."]
    for d in f["days"]:
        chance = f"{d['rain_chance']}% chance of rain" if d["rain_chance"] is not None else "rain chance unknown"
        lines.append(f"{d['weekday']} {d['date']}: {d['summary']}, {d['temp_min']}-{d['temp_max']}°C, {chance}, {d['rain_mm']} mm, wind up to {d['wind_max']} km/h, UV {d['uv_max']}")
    return "\n".join(lines)
# endregion: for-the-model


# region: fetch
async def _get(http: httpx.AsyncClient, url: str, params: dict) -> dict:
    """One GET. Every way it can fail becomes a WeatherError with a message the model can act on."""
    try:
        response = await http.get(url, params=params)
    except httpx.TimeoutException as exc:
        raise WeatherError("The weather service took too long to answer. You may try once more.") from exc
    except httpx.HTTPError as exc:
        raise WeatherError("Could not reach the weather service. Tell the user it is unavailable right now.") from exc
    if response.status_code == 429:
        raise WeatherError("The weather service says we are asking too often. Do not retry; tell the user to try again in a minute.")
    if response.status_code >= 500:
        raise WeatherError(f"The weather service had a problem (HTTP {response.status_code}). You may try once more.")
    if response.status_code >= 400:
        reason = "bad request"
        if response.headers.get("content-type", "").startswith("application/json"):
            try:
                reason = response.json().get("reason", reason)
            except ValueError:
                pass
        raise WeatherError(f"The weather service rejected the request: {reason}")
    try:
        return response.json()
    except ValueError as exc:                              # a 200 whose body is not JSON (a proxy's error page, say)
        raise WeatherError("The weather service sent a reply that could not be read. You may try once more.") from exc


async def search_places(http: httpx.AsyncClient, name: str, country_code: str | None = None, url: str = GEOCODING_URL) -> list[dict]:
    params: dict[str, Any] = {"name": name, "count": 5, "language": "en", "format": "json"}
    if country_code:
        params["countryCode"] = country_code
    return parse_places(await _get(http, url, params))


async def fetch_forecast(http: httpx.AsyncClient, place: dict, days: int, url: str = FORECAST_URL) -> dict:
    params = {
        "latitude": place["latitude"], "longitude": place["longitude"], "timezone": "auto", "forecast_days": days,
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max",
    }
    return parse_forecast(place["label"], await _get(http, url, params))
# endregion: fetch
