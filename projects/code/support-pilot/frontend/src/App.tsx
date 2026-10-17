import { useCallback, useEffect, useState } from "react";
import { getHealth, listTickets, whoAmI } from "./api";
import { Inbox } from "./components/Inbox";
import { IntakeForm } from "./components/IntakeForm";
import { Login } from "./components/Login";
import { MetricsView } from "./components/MetricsView";
import { TicketView } from "./components/TicketView";
import { getToken, setToken } from "./session";
import type { Me, TicketSummary } from "./types";

type Tab = "inbox" | "metrics" | "customer";

// region: app
export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const [provider, setProvider] = useState("");
  const [tab, setTab] = useState<Tab>("inbox");
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {                                   // a token from earlier in this tab: is it still good?
    const token = getToken();
    (token ? whoAmI(token).then(setMe).catch(() => setToken(null)) : Promise.resolve()).finally(() => setChecking(false));
    getHealth().then((h) => setProvider(h.provider)).catch(() => {});
  }, []);

  const refresh = useCallback(() => { listTickets(status, query).then(setTickets).catch(() => setTickets([])); }, [status, query]);
  useEffect(() => { if (me) refresh(); }, [me, refresh]);

  if (checking) return <p className="muted center">Loading…</p>;
  if (!me) return <Login onSignedIn={setMe} />;

  const signOut = () => { setToken(null); setMe(null); setSelected(null); };
  return (
    <div className="shell">
      <header className="topbar">
        <h1>SupportPilot</h1>
        <nav aria-label="Sections">
          <button className={tab === "inbox" ? "on" : ""} onClick={() => setTab("inbox")}>Inbox</button>
          {me.role === "lead" && <button className={tab === "metrics" ? "on" : ""} onClick={() => setTab("metrics")}>Metrics</button>}
          <button className={tab === "customer" ? "on" : ""} onClick={() => setTab("customer")}>Customer form</button>
        </nav>
        <span className="who">{me.name} <button className="link" onClick={signOut}>Sign out</button></span>
        {provider && <span className="pill">{provider === "mock" ? "Offline demo model" : "Claude"}</span>}
      </header>

      {tab === "inbox" && (
        <main className={`split ${selected !== null ? "detail" : "list"}`}>
          <Inbox tickets={tickets} selected={selected} status={status} query={query} onSelect={setSelected} onStatus={setStatus} onQuery={setQuery} />
          <section className="pane">
            {selected === null ? <p className="muted empty">Pick a ticket from the inbox.</p> : (
              <>
                <button className="link back" onClick={() => setSelected(null)}>← Inbox</button>
                <TicketView key={selected} id={selected} me={me} provider={provider} onChanged={refresh} />
              </>
            )}
          </section>
        </main>
      )}
      {tab === "metrics" && me.role === "lead" && <main className="page"><MetricsView /></main>}
      {tab === "customer" && <main className="page"><IntakeForm /></main>}
    </div>
  );
}
// endregion: app
