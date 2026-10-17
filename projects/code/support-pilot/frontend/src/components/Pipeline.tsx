import type { RunState } from "../pipelineReducer";
import { formatMs } from "../waterfall";

const LABEL: Record<string, string> = {
  redact: "Hide personal data", triage: "Understand the ticket", escalate: "Hand to a person", lookup: "Find the order", decide: "Apply the policy",
  retrieve: "Find help articles", draft: "Write the draft", revise: "Rewrite after a failed check", check: "Run the guardrails",
};

// region: pipeline
export function Pipeline({ run }: { run: RunState }) {
  if (run.phase === "idle") return null;
  return (
    <section className="pipeline" aria-label="What the copilot is doing" data-phase={run.phase}>
      <ol>
        {run.stages.map((s) => (
          <li key={s.name} className={`stage ${s.status}`}>
            <span className="mark" aria-hidden>{s.status === "running" ? "…" : "✓"}</span>
            <span><b>{LABEL[s.name] ?? s.name}</b> <span className="muted small">{s.summary}</span></span>
            {s.ms !== null && <span className="muted small ms">{formatMs(s.ms)}</span>}
          </li>
        ))}
      </ol>
      {run.phase === "running" && run.text && <blockquote className="live">{run.text}<span className="caret" aria-hidden /></blockquote>}
      {run.revised && <p className="small muted">The first draft broke a rule, so the copilot rewrote it once.</p>}
      {run.error && <p className="problem" role="alert">{run.error}</p>}
    </section>
  );
}
// endregion: pipeline
