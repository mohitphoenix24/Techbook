---
title: Tools that reach the internet
level: easy
time: 30
summary: WeatherWise gives Claude two tools that call a real weather service. What changes when a tool leaves your machine: slower, fallible, rate-limited and out of your control. A tour of the app, the Open-Meteo service and its terms, and how to run it.
tags: agents, external APIs, Open-Meteo, tools, setup
---

TaskPal's tools touched a database on your own machine: fast, local and predictable. WeatherWise's tools call a **real service on the internet**, and almost everything interesting about this project follows from that single difference.

| | A local tool (TaskPal) | A tool that calls the internet (WeatherWise) |
|---|---|---|
| Speed | microseconds | hundreds of milliseconds to seconds |
| Can it fail? | rarely, and you control why | often: timeouts, outages, rate limits, changed formats |
| Who controls the data? | you | someone else, who can change it |
| Cost | none | maybe money, maybe limits, maybe terms of use |
| Testing | trivial | needs real data samples, and care about live calls |

## The app

You ask about the weather in plain language: *"Do I need an umbrella in Pune this week?"*, *"Compare Mumbai and Delhi for the weekend"*, *"I'm travelling to Goa on Friday. What should I pack?"* WeatherWise:

1. **Finds the places** (`find_place`): turns a name into an id, with its country.
2. **Fetches forecasts** (`get_forecast`): current weather plus up to seven days of temperature, rain chance, wind and UV.
3. **Advises**: a few plain sentences, and **forecast cards** drawn by the browser from the same data.

When you name two cities, Claude asks for both lookups *in the same turn* and your code runs them **at the same time** (lesson 4). The cards show real numbers from a real forecast.

![WeatherWise as it first loads: the model name, a credit to Open-Meteo, a banner about the API key and four example questions](assets/img/weather-wise-welcome.png)

## Open-Meteo

The weather comes from [Open-Meteo](https://open-meteo.com/), an open weather service that needs **no API key**, which keeps this project to one key (Claude's). It has two endpoints we use:

- **Geocoding**: `https://geocoding-api.open-meteo.com/v1/search?name=Pune`: a place name to latitude, longitude, country and time zone.
- **Forecast**: `https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...&daily=...`: the weather itself.

:::warn Read the terms of any service you build on
Open-Meteo's free service is for **non-commercial use**, with limits (at the time of writing: 600 calls a minute, 5,000 an hour, 10,000 a day) and a requirement to **credit** the source (the data is licensed CC BY 4.0). That is why the app header says "forecasts by Open-Meteo". If you ever turn WeatherWise into a paid product, you need their commercial plan. Check the current terms on their site; limits and prices change.
:::

This is a real habit worth forming now. A tool that calls someone else's service puts **their** terms, limits and reliability inside **your** agent.

## What you will build

| Lesson | You build | The new idea |
|---|---|---|
| 2 | the weather parser | real API data is awkward; keep parsing pure |
| 3 | `find_place` and ids | ambiguity, and why the model gets handles not coordinates |
| 4 | parallel tool calls | several requests in one turn, run at the same time |
| 5 | failure handling | timeouts, rate limits and outages as messages the model can use |
| 6 | forecast cards | tools return text for the model *and* data for the browser |
| 7 | tests and extensions | testing code that depends on a service you do not control |

## Run it

You need Python 3.10+, Node 22.12+, and your Claude API key (see Project 7, lesson 1, if you skipped it). There is no offline mode and no fake model here either.

```bash title="Terminal 1: the back end"
cd projects/code/weather-wise/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then edit it: ANTHROPIC_API_KEY=sk-ant-...
uvicorn app.main:app --reload
```

```bash title="Terminal 2: the front end"
cd projects/code/weather-wise/frontend
npm install
npm run dev                     # http://localhost:5173
```

The source is in the [source explorer](#/code/weather-wise), with a zip download.

Try the four example questions, and watch the step list. For the "compare" question you should see **two** `find_place` steps appear together, then **two** `get_forecast` steps together. If you see them one after another, the model is calling the tools sequentially; look at the tool descriptions (they ask it to batch) and think about what you would change.

:::keypoints
- A tool that calls the internet is slower, fallible, limited and out of your control. Design for that from the start.
- Open-Meteo is keyless, free for non-commercial use, and requires credit. Read the terms of every service you build on.
- Two tools are enough for a useful agent: one to *find* something, one to *fetch* it.
- Several independent lookups can be requested in one turn and run at once.
:::

```quiz
? What is different about a tool that calls an external service?
- Nothing; it is just another function
+ It can be slow, fail, be rate-limited, and change, none of which you control
- It does not need testing
> Plan for every one of those from the first line.
? Why does the app credit Open-Meteo in its header?
- Decoration
+ The data's licence (CC BY 4.0) requires attribution
- The API refuses requests without it
> Licences are obligations. Respect them in the interface.
? A user asks for the weather in two cities. What is the best thing for the agent to do?
- Ask which city first
+ Look both up in the same turn, so the requests run together
- Look up one, then the other, in separate turns
> Independent requests in one turn finish in the time of the slowest one, not the sum.
```

:::exercise Another service
Pick a free, keyless API that you could give an agent (a currency converter, a public holiday list, a dictionary). Write down: its terms of use, its rate limits, what it returns when something is wrong, and the *one sentence* you would put in the tool description so Claude uses it well.
:::
