---
title: Finding places, and handing the model handles
level: easy
time: 40
summary: "Pune" is easy and "Springfield" is not. How geocoding returns several matches, why get_forecast takes an id from find_place instead of coordinates, and how a per-request memory makes it impossible to ask about a place that was never found.
tags: geocoding, ambiguity, handles, ids, tool design, hallucination
---

People say "Pune", "Goa", "Springfield". A forecast service needs coordinates. Something has to turn one into the other, and that step is where an agent most easily goes quietly wrong.

## Why not let the model supply coordinates?

Claude knows roughly where Pune is. It could write `latitude: 18.52, longitude: 73.86` straight into a `get_forecast` call, and often it would be right. So why does WeatherWise use a separate `find_place` step?

- **Models misremember numbers.** A confident `latitude: 18.5` for a village near the city, or a longitude with its digits swapped, gives a perfectly valid forecast for the *wrong place*. No error, no warning.
- **Names are ambiguous.** There is more than one Springfield, and more than one Pune.
- **You get a place name to show.** The forecast card says "Pune, Maharashtra, India", taken from the geocoder, not from the model's memory.

So the design has two tools, and the second only accepts what the first produced.

## What the geocoder returns

```python src="weather-wise/backend/app/weather.py" region="parse-places" title="backend/app/weather.py"
```

A search returns up to five matches (we keep three). Each carries a numeric **id**, a label made from the name, region and country, coordinates, a time zone and sometimes a population. Notice the line `dict.fromkeys(...)`: it removes repeats, so "Singapore, Singapore, Singapore" becomes "Singapore".

Here it is on three real responses (saved in the tests' fixtures):

```python run src="weather-wise/backend/app/weather.py#parse-places" dir="weather-wise/backend/tests/fixtures" title="Three searches" level=easy
import json

for name in ("pune", "springfield", "nothing"):
    places = parse_places(json.loads(SAMPLE_FILES[f"geocode_{name}.json"]))
    print(f"search: {name}")
    if not places:
        print("   (no results: the service sends no 'results' key at all)")
    for p in places:
        pop = f"{p['population']:,}" if p["population"] else "unknown"
        print(f"   id {p['id']:<8} {p['label']:<42} population {pop}")
    print()
```

```output
search: pune
   id 1259229  Pune, Maharashtra, India                   population 3,124,458
   id 1944337  Pune, Oecusse, Timor-Leste                 population unknown
   id 3391144  Pune, Pará, Brazil                         population unknown

search: springfield
   id 4409896  Springfield, Missouri, United States       population 170,188
   id 4250542  Springfield, Illinois, United States       population 114,394
   id 4951788  Springfield, Massachusetts, United States  population 154,341

search: nothing
   (no results: the service sends no 'results' key at all)
```

Two lessons are in that output. The first Pune is the city of three million, and the others are tiny places on other continents: **the order of results is not a promise of importance**, so the population is shown to the model. And the three Springfields differ only in their *region*, which is why the label includes it.

:::note A real surprise
When this project was built, asking the geocoder for plain "Goa" returned small villages that happen to be called Goa, because Goa the *state* is not a place name it lists. The state's main city, Panjim, is found easily. So the system prompt says: if the best match has no population and the user surely means a famous region, search for its main city and **say so**. A tool that "works" can still need guidance for the cases the data does not cover. Run the app and ask about Goa to see what your Claude does.
:::

## Handles, not coordinates

The tools themselves:

```python src="weather-wise/backend/app/tools.py" region="inputs" title="backend/app/tools.py"
```

`get_forecast` takes a `place_id`: the number `find_place` returned. And the `ToolBox` remembers what it has returned:

```python src="weather-wise/backend/app/tools.py" region="toolbox" title="backend/app/tools.py"
```

Look at `_find_place`: it stores every place it returns in `self.places`. Look at `_get_forecast`: if the id is not in that dictionary, the result is an error saying "unknown place id 1259229. Call find_place first and use an id it returned." The model **cannot** fetch a forecast for a place it did not search for, whether by mistake or because of text in a prompt telling it to. A **handle** (an opaque id the tool gave out) is safer than a **value** the model typed, because the tool can check that it gave it out.

:::tip Handles are everywhere
The same pattern appears whenever you let a model act on something: a task id from `list_tasks` (TaskPal), a note name from `list_notes` (NoteKeeper), a proposal id. "Use only ids a tool returned" is one of the cheapest, strongest rules in agent design, and the test `get_forecast for an id never found` proves it.
:::

The `ToolBox` lives for **one request** (the route creates a new one each time), so the memory of places lasts exactly one question. If the user asks a follow-up about the same city, the model searches again: one extra, cheap call in exchange for state that can never go stale or leak between users.

## What each result looks like to the model

```text title="find_place('Pune', 'IN') as the model sees it"
id 1259229: Pune, Maharashtra, India, population 3,124,458
id 10191779: Puneta, Rajasthan, India
id 10481679: Puneir, Uttar Pradesh, India
```

```text title="What it returns when nothing matches (is_error: true)"
No place called 'Qwertyxyzz' was found. Check the spelling, or try the nearest big city.
```

Even the failure message is a small piece of prompt engineering: it tells the model *what to try next*.

## The tests

```python src="weather-wise/backend/tests/test_tools.py" region="validation-tests" title="backend/tests/test_tools.py"
```

The first parametrised cases never touch the network: an empty name, a country code that is not two letters, a forecast for an id that was never found, a `days` outside 1 to 7. Validation is the cheapest place to stop a bad call, and it costs nothing.

:::keypoints
- A forecast for the wrong place looks perfectly valid. Do not let the model type coordinates.
- Geocoding is ambiguous: return a few candidates with enough detail (region, country, population) to choose between.
- Result order is not importance. Show the data the choice needs, and tell the model to name what it chose.
- Give the model **handles** (ids a tool returned) and have the tool refuse any id it did not hand out.
- A per-request `ToolBox` keeps that memory short-lived and leak-free.
:::

```quiz
? Why does `get_forecast` take a `place_id` and not a latitude and longitude?
- Coordinates are secret
+ So it can only be asked about places that find_place really returned
- IDs are shorter to type
> A handle the tool issued can be checked; a number the model typed cannot.
? A geocoder returns five places named "Springfield". What should the agent do?
- Pick one at random and say nothing
+ Use the most likely one (here the first/most populous), and tell the user which it chose
- Refuse to answer
> A clear statement of the choice makes a wrong guess easy to spot and correct.
? What does the ToolBox's `places` dictionary protect against?
+ A forecast request for an id that was never found, by mistake or by injection
- Slow networks
- Duplicate cities
> The tool refuses what it did not hand out.
```

:::exercise Ask when it matters
Change the system prompt so that, when `find_place` returns several places with similar populations (say two US cities named Springfield), the agent **asks the user which one** instead of choosing. Try it. Then try to write a test for that behaviour without a model: what *can* you test, and what can you only check by using the app?
:::
