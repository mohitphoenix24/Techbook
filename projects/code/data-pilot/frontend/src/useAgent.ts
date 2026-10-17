import { useCallback, useReducer, useRef } from "react";
import { ApiError, askStream } from "./api";
import { historyOf, initialState, reducer } from "./agentReducer";
import type { Mistake } from "./types";

export function useAgent(simulate: Mistake) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abort = useRef<AbortController | null>(null);

  // region: ask
  const ask = useCallback(async (question: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const history = historyOf(state);
    dispatch({ type: "asked", id: crypto.randomUUID(), question });
    try {
      for await (const event of askStream({ question, history, simulate_mistake: simulate }, controller.signal)) {
        dispatch({ type: "event", event });                                    // the reducer knows what every event means
      }
    } catch (err) {
      if (controller.signal.aborted) dispatch({ type: "stopped" });
      else dispatch({ type: "failed", message: err instanceof ApiError ? err.message : "Could not reach the server. Is the backend running?" });
    }
  }, [state, simulate]);
  // endregion: ask

  const stop = useCallback(() => abort.current?.abort(), []);
  const clear = useCallback(() => { abort.current?.abort(); dispatch({ type: "clear" }); }, []);
  return { state, ask, stop, clear };
}
