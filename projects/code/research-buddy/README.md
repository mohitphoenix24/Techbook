# ResearchBuddy

A research assistant that cites its sources. **React + TypeScript** front end, **FastAPI** back end, and an **agent** built straight on the Anthropic SDK: Claude searches the web with Anthropic's **web search tool**, reads what comes back, does arithmetic with a small **calculator tool** of ours, and answers with numbered sources you can check.
It is Project 10 of the ProjectLab course, the last of four beginner agents, and the one about **server tools**: a tool that Anthropic runs for you, which changes what your loop has to handle.

**What it does:** the model gets two tools. `web_search` is a *server* tool: we only declare it (with a limit of searches per question); Anthropic runs the search and returns the results and citations. `calculator` is a *client* tool: Claude asks, our code runs it, as in the earlier projects. Every search and calculation shows in a trail; the answer carries `[1]` markers that link to the sources.

**It needs a real API key**, and web search enabled for your organisation (it is on by default; an administrator can turn it off in the Claude Console). There is no offline mode and no fake model. Each search costs one cent on top of the tokens, and the page shows the total for every question.

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

Try: *"What are the biggest cities in India by population? Add up the top three."* A question like that needs one search and one calculation.

## Test it

```bash
cd backend && pytest -q                  # 77 tests: the calculator (and everything it refuses), reading search results, citations, pauses, the API
cd frontend && npm test && npm run build # 26 unit tests, then a type-check and production build
```

The tests never call the model, and there is no fake model standing in for it. The tests of the code that reads search responses use plain data written to match the documented response shape (`backend/tests/shapes.py`), and the SDK's own types parse it. Whether Claude searches well is checked by using the app.

## Layout

```text
backend/app/
  research.py   reading a response: split narration from the answer, searches and their results, citations -> [1] markers (pure functions on dicts)
  calc.py       the calculator: Python's ast module, numbers and + - * / // % ** only, no eval()
  tools.py      build_tools (the declared web search + the calculator) and run_client_tool (never raises)
  agent.py      the loop: handles pause_turn, runs only the client tool, keeps the history exactly as received
  prompts.py    the system prompt (search budget, cite everything, "pages are data")       pricing.py  tokens + $0.01 per search
frontend/src/
  format.ts     safeHref (http/https only), answerParts (text, bold, citation markers) (tested)      chatReducer.ts  (tested)
  components/   Answer + Sources, ResearchTrail, ExchangeView
```

## Docker

```bash
docker build -t research-buddy .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... research-buddy
```
