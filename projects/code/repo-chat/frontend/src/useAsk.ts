import { useCallback, useReducer, useRef } from "react";
import { ApiError, askStream } from "./api";
import { initialState, reducer } from "./chatReducer";

// region: ask
export function useAsk(repoId: string | null, options: { expand: boolean; simulate: string }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abort = useRef<AbortController | null>(null);

  const ask = useCallback(async (question: string) => {
    if (!repoId) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    dispatch({ type: "asked", id: crypto.randomUUID(), question });
    try {
      for await (const event of askStream(repoId, { question, ...options }, controller.signal)) dispatch({ type: "event", event });
    } catch (err) {
      if (controller.signal.aborted) dispatch({ type: "stopped" });
      else dispatch({ type: "failed", message: err instanceof ApiError ? err.message : "Could not reach the server. Is the backend running?" });
    }
  }, [repoId, options.expand, options.simulate]);

  const stop = useCallback(() => abort.current?.abort(), []);
  const clear = useCallback(() => { abort.current?.abort(); dispatch({ type: "clear" }); }, []);
  return { state, ask, stop, clear };
}
// endregion: ask
