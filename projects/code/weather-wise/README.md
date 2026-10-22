# WeatherWise

A weather assistant that looks things up. **React + TypeScript** front end, **FastAPI** back end, and an **agent** built straight on the Anthropic SDK: Claude finds your places, fetches **real forecasts** from the free Open-Meteo service, and tells you what to wear or carry. Ask about several places and it checks them all at the same time.
It is Project 8 of the ProjectLab course, the second of four beginner agents.

**What it does:** the model gets two tools (`find_place`, `get_forecast`). It decides which to call, and how many at once; **our code runs them** against the real weather service and shows the model what came back. The browser gets the same data as forecast cards.

**It needs a real API key** for Claude. There is no offline mode and no fake model: the agent is Claude. Get a key at <https://console.anthropic.com/>. The weather itself needs no key.

## Run it

You need Python 3.10+ and Node 22.12+.

```bash
# terminal 1: the back end
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                      # then put your key in ANTHROPIC_API_KEY=
uvicorn app.main:app --reload                             # http://localhost:8000/docs

# terminal 2: the front end
cd frontend
npm install
npm run dev                                               # http://localhost:5173
```

Try: *"Compare Mumbai and Delhi for the weekend"* and watch two lookups, then two forecasts, run side by side.

## Test it

```bash
cd backend && pytest -q                  # 31 tests: parsing, tool validation, failure handling, the API. Some call the real Open-Meteo (skipped when offline)
cd frontend && npm test && npm run build # 25 unit tests, then a type-check and production build
```

The tests never call the model, and there is no fake model standing in for it. The parsing tests use real Open-Meteo responses saved as files in `backend/tests/fixtures/`; the tool tests call the real service.

## Layout

```text
backend/app/
  weather.py   Open-Meteo: parse_* functions (pure) and fetch_* functions (network), every failure a WeatherError
  tools.py     two tools: description + input model + function. ToolBox.call never raises
  prompts.py   the system prompt          agent.py  the loop (tool calls of one turn run at the same time)
  llm.py       builds the SDK client; turns SDK errors into plain messages
  main.py      POST /api/chat: the agent's events as Server-Sent Events
frontend/src/
  chatReducer.ts  conversation state, forecasts to draw (tested)     format.ts  temperature bars, labels (tested)
  components/     ForecastCard, WeatherIcon (SVG), StepList, ExchangeView
```

## Docker

```bash
docker build -t weather-wise .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... weather-wise
```
