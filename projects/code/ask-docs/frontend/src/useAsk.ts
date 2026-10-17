import { useCallback, useReducer, useRef } from "react";
import { ApiError, askStream } from "./api";
import { historyOf, initialState, reducer } from "./askReducer";
import type { AskSettings } from "./types";

export function useAsk(settings: AskSettings) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abort = useRef<AbortController | null>(null);

  // region: ask
  const ask = useCallback(async (question: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const history = historyOf(state);                                         // earlier turns, so "and sick leave?" makes sense
    dispatch({ type: "asked", id: crypto.randomUUID(), question });
    try {
      for await (const event of askStream({ question, history, settings }, controller.signal)) {
        switch (event.type) {
          case "rewrite": dispatch({ type: "rewrite", standalone: event.standalone, rewritten: event.rewritten }); break;
          case "sources": dispatch({ type: "sources", sources: event.sources, relevant: event.relevant }); break;
          case "delta": dispatch({ type: "delta", text: event.text }); break;
          case "citations": dispatch({ type: "citations", citations: event.citations }); break;
          case "usage": dispatch({ type: "usage", usage: event.usage }); break;
          case "error": dispatch({ type: "failed", message: event.message }); return;
          case "done": break;
        }
      }
      dispatch({ type: "finished" });
    } catch (err) {
      if (controller.signal.aborted) dispatch({ type: "stopped" });
      else dispatch({ type: "failed", message: err instanceof ApiError ? err.message : "Could not reach the server. Is the backend running?" });
    }
  }, [state, settings]);
  // endregion: ask

  const stop = useCallback(() => abort.current?.abort(), []);
  const clear = useCallback(() => { abort.current?.abort(); dispatch({ type: "clear" }); }, []);
  return { state, ask, stop, clear };
}
