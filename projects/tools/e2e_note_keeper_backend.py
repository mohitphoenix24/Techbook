"""Starts NoteKeeper's real back end for the end-to-end test, with four proposals already waiting.

The agent is the only thing that makes proposals, and the agent needs a model. So that the approval screen can be tested without
one, this launcher adds proposals through the project's own `Proposals.add`, exactly as the propose_change tool does, then serves
the app as usual. Nothing here fakes a model or a response."""
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path.cwd()))
from app.main import create_app  # noqa: E402

port = int(sys.argv[1])
app = create_app()
original = app.router.lifespan_context


@asynccontextmanager
async def with_proposals(a):
    async with original(a):
        notes, props = a.state.notes, a.state.proposals
        props.add(notes, "append", "meeting-2026-10-12", "- Landlord: water supply off Saturday 25 Oct, 10 am to 1 pm.", "The pasted email mentions a water cut that affects the demo day.")
        props.add(notes, "delete", "recipes", None, "You asked me to remove notes that are not about work.")
        props.add(notes, "replace", "reading-list", "# Reading list\n\n## Books\n- The Pragmatic Programmer (started, chapter 4)\n- Thinking in Systems\n- Deep Work (finished, lent to Rohan)\n", "Dropped the articles and podcasts, as you asked.")
        props.add(notes, "replace", "trip-ideas", "# Trip ideas\n\nKonkan coast only.\n", "Shortened to your favourite.")
        notes.write("trip-ideas", "# Trip ideas\n\nI edited this note myself, after the proposal was made.\n")      # makes proposal 4 stale
        yield

app.router.lifespan_context = with_proposals
uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
