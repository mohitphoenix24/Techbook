from app.weather import WMO, describe, forecast_text, parse_forecast, parse_places

from .conftest import fixture


# region: parse-tests
def test_places_are_picked_apart_and_labelled():
    places = parse_places(fixture("geocode_pune"))
    assert len(places) == 3                                           # capped, though the service sent five
    first = places[0]
    assert first["label"] == "Pune, Maharashtra, India" and first["id"] == 1259229 and first["country_code"] == "IN"
    assert first["latitude"] == 18.51957 and first["timezone"] == "Asia/Kolkata" and first["population"] == 3124458


def test_a_search_with_no_matches_has_no_results_key_at_all():
    assert fixture("geocode_nothing").get("results") is None
    assert parse_places(fixture("geocode_nothing")) == []


def test_places_with_the_same_name_are_told_apart_by_their_region():
    labels = [p["label"] for p in parse_places(fixture("geocode_springfield"))]
    assert labels == ["Springfield, Missouri, United States", "Springfield, Illinois, United States", "Springfield, Massachusetts, United States"]


def test_a_repeated_name_is_not_printed_twice():
    [p] = parse_places({"results": [{"id": 1, "name": "Singapore", "admin1": "Singapore", "country": "Singapore", "latitude": 1.3, "longitude": 103.8}]})
    assert p["label"] == "Singapore"


def test_the_forecast_columns_become_rows():
    f = parse_forecast("Pune, Maharashtra, India", fixture("forecast_pune"))
    assert f["place"] == "Pune, Maharashtra, India" and f["timezone"] == "Asia/Kolkata"
    assert [d["date"] for d in f["days"]] == ["2026-10-18", "2026-10-19", "2026-10-20"]
    assert [d["weekday"] for d in f["days"]] == ["Sun", "Mon", "Tue"]
    day = f["days"][0]
    assert day == {"date": "2026-10-18", "weekday": "Sun", "summary": "Overcast", "kind": "cloud", "temp_max": 34.1, "temp_min": 23.0,
                   "rain_mm": 0.0, "rain_chance": 29, "wind_max": 10.7, "uv_max": 7.5}
    assert f["current"]["temp"] == 33.3 and f["current"]["summary"] == "Mainly clear" and f["current"]["kind"] == "clear"
# endregion: parse-tests


def test_missing_values_stay_none_instead_of_crashing():
    f = parse_forecast("X", {"daily": {"time": ["2026-10-18", "2026-10-19"], "weather_code": [61], "temperature_2m_max": [30.0, 31.0]}})
    assert f["days"][0]["summary"] == "Light rain" and f["days"][0]["temp_min"] is None
    assert f["days"][1]["summary"] == "Unknown conditions" and f["days"][1]["temp_max"] == 31.0
    assert f["current"]["temp"] is None


def test_every_weather_code_has_words_and_an_icon():
    for code, (words, kind) in WMO.items():
        assert words and kind in {"clear", "partly", "cloud", "fog", "rain", "snow", "storm"}, code
    assert describe(61) == ("Light rain", "rain")
    assert describe(1234)[0] == "Unknown conditions" and describe(None)[0] == "Unknown conditions"


def test_the_text_for_the_model_is_short_and_complete():
    text = forecast_text(parse_forecast("Pune, Maharashtra, India", fixture("forecast_pune")))
    lines = text.split("\n")
    assert len(lines) == 4
    assert lines[0].startswith("Pune, Maharashtra, India (times are local). Now: Mainly clear, 33.3°C, feels like 35.2°C")
    assert lines[1] == "Sun 2026-10-18: Overcast, 23.0-34.1°C, 29% chance of rain, 0.0 mm, wind up to 10.7 km/h, UV 7.5"
    assert len(text) < 700, "raw JSON is about three times longer"
