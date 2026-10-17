import { useCallback, useEffect, useState } from "react";
import { deleteConversation, listConversations, listPersonas } from "./api";
import { Composer } from "./components/Composer";
import { MessageList } from "./components/MessageList";
import { Sidebar } from "./components/Sidebar";
import type { ConversationSummary, Persona } from "./types";
import { useChat } from "./useChat";

export default function App() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [persona, setPersona] = useState("friendly");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = useCallback(() => {
    listConversations().then(setConversations).catch(() => {});
  }, []);
  const chat = useChat(persona, refresh);
  const { state } = chat;

  useEffect(() => {
    listPersonas().then(setPersonas).catch(() => {});
    refresh();
  }, [refresh]);

  async function openConversation(id: string) {
    const savedPersona = await chat.open(id);
    setPersona(savedPersona);
    setMenuOpen(false);
  }

  async function remove(id: string) {
    await deleteConversation(id);
    if (state.conversationId === id) chat.reset();
    refresh();
  }

  return (
    <div className={`app ${menuOpen ? "menu-open" : ""}`}>
      <Sidebar
        conversations={conversations}
        activeId={state.conversationId}
        onNew={() => { chat.reset(); setMenuOpen(false); }}
        onOpen={openConversation}
        onDelete={remove}
      />
      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Show conversations" onClick={() => setMenuOpen((v) => !v)}>☰</button>
          <h1>Pocket Chat</h1>
          <span className="provider-pill" title="Which engine answers your messages">
            {state.provider === "mock" ? "Offline demo mode" : state.model ?? "ready"}
          </span>
        </header>

        <MessageList
          messages={state.messages}
          streaming={state.streaming}
          onRegenerate={chat.regenerate}
          onPick={chat.send}
        />

        <Composer
          personas={personas}
          persona={persona}
          onPersona={setPersona}
          streaming={state.streaming}
          dropped={state.dropped}
          onSend={chat.send}
          onStop={chat.stop}
        />
      </main>
    </div>
  );
}
