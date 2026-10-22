import { useCallback, useReducer, useRef } from "react";
import { ApiError, chatStream } from "./api";
import { historyOf, initialState, reducer } from "./chatReducer";

/** Owns the conversation. `onChanged` is called when the agent changed the task list, so the board can reload. */
export function useChat(onChanged: () => void) {
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
        dispatch({ type: "event", event });
        if (event.type === "tool_result" && event.changed) onChanged();      // the board follows the agent, step by step
      }
    } catch (err) {
      if (controller.signal.aborted) dispatch({ type: "stopped" });
      else dispatch({ type: "failed", message: err instanceof ApiError ? err.message : "Could not reach the server. Is the backend running?" });
    } finally {
      onChanged();                                                           // whatever happened, show the truth
    }
  }, [state, onChanged]);
  // endregion: send

  const stop = useCallback(() => abort.current?.abort(), []);
  const clear = useCallback(() => { abort.current?.abort(); dispatch({ type: "clear" }); }, []);
  return { state, send, stop, clear };
}
