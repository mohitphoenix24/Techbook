"""The agent's hands: two tools that reach a real weather service. As in TaskPal, each tool is a description Claude reads,
an input model that checks what Claude sends, and a function that does the work."""
import logging
from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import BaseModel, Field, ValidationError

from .weather import FORECAST_URL, GEOCODING_URL, WeatherError, fetch_forecast, forecast_text, search_places

log = logging.getLogger(__name__)


# region: inputs
class FindPlace(BaseModel):
    name: str = Field(min_length=1, max_length=80, description="A city or town name only, such as 'Pune' or 'Goa'. No country or state in this field.")
    country_code: str | None = Field(default=None, pattern=r"^[A-Za-z]{2}$", description="Optional two-letter country code (IN, US, GB) to tell places with the same name apart.")


class GetForecast(BaseModel):
    place_id: int = Field(description="The id of a place, exactly as find_place returned it. Never make up an id.")
    days: int = Field(default=3, ge=1, le=7, description="How many days to include, counting today. 1 to 7.")
# endregion: inputs


# region: definitions
def schema_of(model: type[BaseModel]) -> dict:
    """The JSON Schema Claude reads, made from the same model that validates the input (one source of truth)."""
    def clean(node: Any) -> Any:
        if isinstance(node, dict):
            return {k: clean(v) for k, v in node.items() if not (k == "title" and isinstance(v, str))}     # drop the generated "title"s
        return [clean(v) for v in node] if isinstance(node, list) else node
    return clean(model.model_json_schema())


TOOLS: list[dict] = [
    {"name": "find_place",
     "description": "Look up a place by name and get its id and country. Always call this first: get_forecast only accepts an id from this tool. "
                    "Returns up to 3 matches, best match first. When the user names several places, call this once per place, all in the same turn.",
     "input_schema": schema_of(FindPlace)},
    {"name": "get_forecast",
     "description": "The current weather and a day-by-day forecast (temperature, rain chance, wind, UV) for one place, in local time. "
                    "When you need several places, call this once per place, all in the same turn.",
     "input_schema": schema_of(GetForecast)},
]
# endregion: definitions


@dataclass
class ToolResult:
    content: str                        # what the MODEL sees
    ok: bool = True
    summary: str = ""                   # what the person sees in the step list
    ui: dict | None = None              # structured data for the browser to draw (a forecast card)


# region: toolbox
class ToolBox:
    """One ToolBox per request. It remembers the places find_place has returned, so get_forecast can only be asked about a place that was really found."""

    def __init__(self, http: httpx.AsyncClient, geocoding_url: str = GEOCODING_URL, forecast_url: str = FORECAST_URL):
        self.http, self.geocoding_url, self.forecast_url = http, geocoding_url, forecast_url
        self.places: dict[int, dict] = {}

    async def call(self, name: str, raw_input: dict[str, Any]) -> ToolResult:
        """Run a tool the model asked for. The input is untrusted: validate it, and turn every failure into a message the model can read. Nothing here raises."""
        try:
            if name == "find_place":
                return await self._find_place(FindPlace.model_validate(raw_input))
            if name == "get_forecast":
                return await self._get_forecast(GetForecast.model_validate(raw_input))
            return ToolResult(f"Error: there is no tool called '{name}'. Available tools: find_place, get_forecast.", False, "unknown tool")
        except ValidationError as exc:
            problems = "; ".join(f"{'.'.join(str(p) for p in e['loc']) or 'input'}: {e['msg']}" for e in exc.errors())
            return ToolResult(f"Error: invalid input. {problems}. Fix the input and try again.", False, "invalid input")
        except WeatherError as exc:
            return ToolResult(f"Error: {exc}", False, "weather service problem")
        except Exception:                                  # a bug or an odd reply must not take the whole agent down
            log.exception("tool %s failed", name)
            return ToolResult("Error: the tool failed unexpectedly. Tell the user the weather could not be fetched.", False, "tool failed")

    async def _find_place(self, a: FindPlace) -> ToolResult:
        places = await search_places(self.http, a.name, a.country_code, self.geocoding_url)
        if not places:
            return ToolResult(f"No place called '{a.name}' was found. Check the spelling, or try the nearest big city.", False, "no match")
        for p in places:
            self.places[p["id"]] = p
        lines = [f"id {p['id']}: {p['label']}" + (f", population {p['population']:,}" if p["population"] else "") for p in places]
        return ToolResult("\n".join(lines), summary=f"{places[0]['label']}" + (f" (+{len(places) - 1} more)" if len(places) > 1 else ""),
                          ui={"type": "places", "places": [{"id": p["id"], "label": p["label"]} for p in places]})

    async def _get_forecast(self, a: GetForecast) -> ToolResult:
        place = self.places.get(a.place_id)
        if place is None:
            return ToolResult(f"Error: unknown place id {a.place_id}. Call find_place first and use an id it returned.", False, "unknown place id")
        forecast = await fetch_forecast(self.http, place, a.days, self.forecast_url)
        return ToolResult(forecast_text(forecast), summary=f"{place['label']}: {len(forecast['days'])} days", ui={"type": "forecast", **forecast})
# endregion: toolbox
