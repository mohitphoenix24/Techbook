import pytest

from app.tools import TOOLS, FindPlace, GetForecast, ToolBox, schema_of

from .conftest import needs_network


# region: definition-tests
def test_every_tool_is_defined_the_way_the_api_expects():
    for tool in TOOLS:
        assert set(tool) == {"name", "description", "input_schema"}
        assert tool["input_schema"]["type"] == "object"
        assert len(tool["description"]) > 60, "a tool is only as good as its description"


def test_schema_comes_from_the_validation_model_and_carries_the_limits():
    days = schema_of(GetForecast)["properties"]["days"]
    assert (days["minimum"], days["maximum"], days["default"]) == (1, 7, 3)
    assert "title" not in schema_of(FindPlace)
    assert schema_of(FindPlace)["required"] == ["name"]
    for model in (FindPlace, GetForecast):
        for name, prop in schema_of(model)["properties"].items():
            assert prop.get("description"), f"{model.__name__}.{name} has no description"
# endregion: definition-tests


# region: validation-tests
@pytest.mark.parametrize("name,args,expect", [
    ("find_place", {"name": ""}, "name"),
    ("find_place", {"name": "Pune", "country_code": "India"}, "country_code"),
    ("find_place", {}, "name"),
    ("get_forecast", {"place_id": 1259229}, "unknown place id"),          # never found, so never allowed
    ("get_forecast", {"place_id": "pune"}, "place_id"),
    ("get_forecast", {"place_id": 1, "days": 30}, "days"),
    ("make_coffee", {}, "no tool called"),
])
async def test_bad_calls_become_errors_the_model_can_read(box, name, args, expect):
    r = await box.call(name, args)             # none of these reach the network
    assert not r.ok and r.content.startswith("Error:") and expect in r.content
# endregion: validation-tests


# region: failure-tests
async def test_a_reply_that_is_not_json_is_an_error_not_a_crash(http, monkeypatch):
    class Page:                                            # what a proxy's "bad gateway" page looks like to the code
        status_code, headers, text = 200, {"content-type": "text/html"}, "<html>oops</html>"
        def json(self):
            raise ValueError("not json")
    async def fake_get(self, url, params=None):
        return Page()
    monkeypatch.setattr(type(http), "get", fake_get)
    r = await ToolBox(http).call("find_place", {"name": "Pune"})
    assert not r.ok and "could not be read" in r.content


async def test_an_unexpected_bug_is_an_error_too(http, monkeypatch):
    async def boom(*a, **k):
        raise KeyError("id")
    monkeypatch.setattr("app.tools.search_places", boom)
    r = await ToolBox(http).call("find_place", {"name": "Pune"})
    assert not r.ok and r.summary == "tool failed" and "KeyError" not in r.content



async def test_a_dead_weather_service_is_an_error_not_a_crash(http):
    dead = ToolBox(http, geocoding_url="http://127.0.0.1:9/v1/search")        # nothing listens on port 9
    r = await dead.call("find_place", {"name": "Pune"})
    assert not r.ok and "Could not reach the weather service" in r.content and r.summary == "weather service problem"
# endregion: failure-tests


def skip_if_service_hiccup(*results):
    """A free public service sometimes answers slowly or with an error. The tools turn that into a result (tested above); a live test should not fail because of it."""
    if any(not r.ok and r.summary == "weather service problem" for r in results):
        pytest.skip("Open-Meteo had a hiccup: " + next(r.content for r in results if not r.ok))


@needs_network
@pytest.mark.network
async def test_find_place_for_real(box):
    r = await box.call("find_place", {"name": "Pune", "country_code": "IN"})
    skip_if_service_hiccup(r)
    assert r.ok and r.content.splitlines()[0].startswith("id 1259229: Pune, Maharashtra, India, population")
    assert r.ui["places"][0] == {"id": 1259229, "label": "Pune, Maharashtra, India"}
    assert 1259229 in box.places


@needs_network
@pytest.mark.network
async def test_a_place_that_does_not_exist(box):
    r = await box.call("find_place", {"name": "Qwertyxyzz"})
    skip_if_service_hiccup(r)
    assert not r.ok and "No place called 'Qwertyxyzz'" in r.content


@needs_network
@pytest.mark.network
async def test_forecast_for_real(box):
    found = await box.call("find_place", {"name": "Pune", "country_code": "IN"})
    skip_if_service_hiccup(found)
    r = await box.call("get_forecast", {"place_id": 1259229, "days": 4})
    skip_if_service_hiccup(r)
    assert r.ok and r.ui["type"] == "forecast" and len(r.ui["days"]) == 4
    assert r.ui["place"] == "Pune, Maharashtra, India" and r.ui["timezone"] == "Asia/Kolkata"
    assert r.content.count("\n") == 4 and "chance of rain" in r.content
    assert -10 < r.ui["days"][0]["temp_max"] < 55


@needs_network
@pytest.mark.network
async def test_several_places_at_once(box):
    import asyncio
    results = await asyncio.gather(box.call("find_place", {"name": "Goa", "country_code": "IN"}), box.call("find_place", {"name": "Mumbai"}))
    skip_if_service_hiccup(*results)
    assert all(r.ok for r in results) and len(box.places) >= 2
