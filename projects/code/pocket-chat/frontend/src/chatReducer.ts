import type { ChatMessage, Usage } from "./types";

// region: state
export interface ChatState {
  conversationId: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  provider: string | null;     // "mock" | "anthropic", shown in the footer
  model: string | null;
  dropped: number;             // how many old messages the server left out of the last request
}

export const initialState: ChatState = { conversationId: null, messages: [], streaming: false, provider: null, model: null, dropped: 0 };

export type Action =
  | { type: "loaded"; conversationId: string; messages: ChatMessage[] }
  | { type: "reset" }
  | { type: "sent"; userId: string; assistantId: string; text: string }
  | { type: "regenerating"; assistantId: string }
  | { type: "meta"; conversationId: string; provider: string; model: string; dropped: number }
  | { type: "delta"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "finished" }
  | { type: "stopped" }
  | { type: "failed"; message: string };
// endregion: state

function updateLast(messages: ChatMessage[], change: (m: ChatMessage) => ChatMessage): ChatMessage[] {
  if (!messages.length) return messages;
  const last = messages[messages.length - 1];
  return [...messages.slice(0, -1), change(last)];
}

// region: reducer
export function chatReducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case "loaded":
      return { ...initialState, conversationId: action.conversationId, messages: action.messages };
    case "reset":
      return initialState;
    case "sent":
      return {
        ...state,
        streaming: true,
        messages: [
          ...state.messages,
          { id: action.userId, role: "user", content: action.text, status: "done" },
          { id: action.assistantId, role: "assistant", content: "", status: "streaming" },
        ],
      };
    case "regenerating": {
      const last = state.messages[state.messages.length - 1];
      const base = last?.role === "assistant" ? state.messages.slice(0, -1) : state.messages;
      return { ...state, streaming: true, messages: [...base, { id: action.assistantId, role: "assistant", content: "", status: "streaming" }] };
    }
    case "meta":
      return { ...state, conversationId: action.conversationId, provider: action.provider, model: action.model, dropped: action.dropped };
    case "delta":
      return { ...state, messages: updateLast(state.messages, (m) => ({ ...m, content: m.content + action.text })) };
    case "usage":
      return { ...state, messages: updateLast(state.messages, (m) => ({ ...m, usage: action.usage })) };
    case "finished":
      return { ...state, streaming: false, messages: updateLast(state.messages, (m) => (m.status === "streaming" ? { ...m, status: "done" } : m)) };
    case "stopped":
      return { ...state, streaming: false, messages: updateLast(state.messages, (m) => ({ ...m, status: "stopped" })) };
    case "failed":
      return { ...state, streaming: false, messages: updateLast(state.messages, (m) => ({ ...m, status: "error", error: action.message })) };
  }
}
// endregion: reducer
