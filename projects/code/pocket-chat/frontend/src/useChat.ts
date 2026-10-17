import { useCallback, useReducer, useRef } from "react";
import { ApiError, getConversation, streamChat, type ChatBody } from "./api";
import { chatReducer, initialState } from "./chatReducer";

const uid = () => crypto.randomUUID();

export function useChat(persona: string, onSaved: () => void) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abort = useRef<AbortController | null>(null);

  // region: run
  const run = useCallback(async (body: ChatBody) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    try {
      for await (const event of streamChat(body, controller.signal)) {
        switch (event.type) {
          case "meta":
            dispatch({ type: "meta", conversationId: event.conversation_id, provider: event.provider, model: event.model, dropped: event.history_dropped });
            break;
          case "delta":
            dispatch({ type: "delta", text: event.text });
            break;
          case "usage":
            dispatch({ type: "usage", usage: event.usage });
            break;
          case "error":
            dispatch({ type: "failed", message: event.message });
            return;
          case "done":
            break;
        }
      }
      dispatch({ type: "finished" });
    } catch (err) {
      if (controller.signal.aborted) dispatch({ type: "stopped" });          // the user pressed Stop: not an error
      else dispatch({ type: "failed", message: err instanceof ApiError ? err.message : "Could not reach the server. Is the backend running?" });
    } finally {
      if (abort.current === controller) abort.current = null;
      onSaved();                                                               // refresh the sidebar list
    }
  }, [onSaved]);
  // endregion: run

  const send = useCallback((text: string) => {
    dispatch({ type: "sent", userId: uid(), assistantId: uid(), text });
    return run({ conversation_id: state.conversationId, message: text, persona });
  }, [run, state.conversationId, persona]);

  const regenerate = useCallback(() => {
    if (!state.conversationId) return;
    dispatch({ type: "regenerating", assistantId: uid() });
    return run({ conversation_id: state.conversationId, regenerate: true, persona });
  }, [run, state.conversationId, persona]);

  const stop = useCallback(() => abort.current?.abort(), []);

  const open = useCallback(async (id: string) => {
    abort.current?.abort();
    const detail = await getConversation(id);
    dispatch({
      type: "loaded",
      conversationId: detail.id,
      messages: detail.messages.map((m) => ({
        id: String(m.id), role: m.role, content: m.content,
        status: m.stopped ? "stopped" : "done",
        usage: m.role === "assistant" ? { input_tokens: m.input_tokens, output_tokens: m.output_tokens, cost_usd: m.cost_usd } : undefined,
      })),
    });
    return detail.persona;
  }, []);

  const reset = useCallback(() => {
    abort.current?.abort();
    dispatch({ type: "reset" });
  }, []);

  return { state, send, regenerate, stop, open, reset };
}
