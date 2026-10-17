import { useState } from "react";
import { ApiError, whoAmI } from "../api";
import { setToken } from "../session";
import type { Me } from "../types";

// region: login
/** A desk needs a way in. Here, two demo people with fixed tokens; a real deployment signs in through your identity provider. */
const DEMO = [
  { label: "Asha, support agent", token: "agent-demo-token", note: "Can edit and approve drafts, but not refunds above the limit." },
  { label: "Ravi, team lead", token: "lead-demo-token", note: "Can also approve large refunds, close tickets and see the metrics." },
];

export function Login({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(token: string) {
    setBusy(true);
    setError(null);
    try {
      const me = await whoAmI(token);
      setToken(token);
      onSignedIn(me);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <h1>SupportPilot</h1>
      <p className="muted">An AI copilot that drafts replies to customer tickets. A person approves every one.</p>
      <div className="choices">
        {DEMO.map((d) => (
          <button key={d.token} className="choice" disabled={busy} onClick={() => signIn(d.token)}>
            <b>{d.label}</b>
            <span className="muted">{d.note}</span>
          </button>
        ))}
      </div>
      {error && <p className="problem" role="alert">{error}</p>}
      <p className="muted small">These are demo sign-ins with fixed tokens. Change them in <code>.env</code> before sharing the app with anyone.</p>
    </main>
  );
}
// endregion: login
