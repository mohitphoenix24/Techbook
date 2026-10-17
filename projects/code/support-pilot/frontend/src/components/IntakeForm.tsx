import { useState, type FormEvent } from "react";
import { ApiError, submitIntake } from "../api";

// region: intake
/** What a customer sees. It is not signed in, so everything it can do is limited by the server, not by this form. */
export function IntakeForm() {
  const [form, setForm] = useState({ from_email: "", subject: "", body: "" });
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" | "error"; message?: string }>({ kind: "idle" });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    try {
      const done = await submitIntake(form);
      setState({ kind: "sent", message: done.message });
      setForm({ from_email: "", subject: "", body: "" });
    } catch (err) {
      setState({ kind: "error", message: err instanceof ApiError ? err.message : "Could not send. Please try again." });
    }
  }

  return (
    <form className="intake" onSubmit={submit}>
      <h2>Contact support</h2>
      <p className="muted">This is the customer's side: the form that creates a ticket in the inbox.</p>
      <label>Your email<input type="email" required value={form.from_email} onChange={set("from_email")} autoComplete="email" /></label>
      <label>Subject<input required minLength={3} maxLength={120} value={form.subject} onChange={set("subject")} /></label>
      <label>How can we help?<textarea required minLength={10} maxLength={4000} rows={5} value={form.body} onChange={set("body")} /></label>
      <button className="primary" disabled={state.kind === "sending"}>{state.kind === "sending" ? "Sending…" : "Send"}</button>
      {state.kind === "sent" && <p className="ok" role="status">{state.message}</p>}
      {state.kind === "error" && <p className="problem" role="alert">{state.message}</p>}
    </form>
  );
}
// endregion: intake
