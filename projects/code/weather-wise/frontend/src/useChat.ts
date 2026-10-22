import { useCallback, useReducer, useRef } from "react";
import { ApiError, chatStream } from "./api";
import { historyOf, initialState, reducer } from "./chatReducer";

export function useChat() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abort = useRef<AbortController | null>(null);

  // region: send
  const send = useCallback(async (message: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const history = historyOf(state);
    dispatch({ type: "asked", id: crypto.randomUUID(), question: message });
    try {
      for await (const event of chatStream({ message, history }, controller.signal)) {
        dispatch({ type: "event", event });                                    // the reducer knows what every event means
      }
    } catch (err) {
      if (controller.signal.aborted) dispatch({ type: "stopped" });
      else dispatch({ type: "failed", message: err instanceof ApiError ? err.message : "Could not reach the server. Is the backend running?" });
    }
  }, [state]);
  // endregion: send

  const stop = useCallback(() => abort.current?.abort(), []);
  const clear = useCallback(() => { abort.current?.abort(); dispatch({ type: "clear" }); }, []);
  return { state, send, stop, clear };
}
