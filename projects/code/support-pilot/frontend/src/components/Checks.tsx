import type { Check } from "../types";

const LABEL: Record<string, string> = {
  no_personal_data: "No personal data", citations_exist: "Citations are real", cites_policy: "Cites the policy", matches_policy: "Matches the policy decision",
  no_overpromise: "No over-promising", no_internal_info: "Nothing internal revealed", mentions_order: "Mentions the order", empathy: "Tone suits the customer", length: "A sensible length",
};

// region: checks
export function Checks({ checks }: { checks: Check[] }) {
  const blocking = checks.filter((c) => !c.ok && c.severity === "block").length;
  return (
    <section className="checks" aria-label="Guardrail checks">
      <h3>Guardrails {blocking > 0 ? <span className="problem">· {blocking} blocking</span> : <span className="ok">· all clear</span>}</h3>
      <ul>
        {checks.map((c) => (
          <li key={c.name} className={c.ok ? "pass" : c.severity === "block" ? "fail" : "warn"}>
            <span aria-hidden>{c.ok ? "✓" : c.severity === "block" ? "✕" : "!"}</span>
            <span><b>{LABEL[c.name] ?? c.name}</b>{!c.ok && <> <span className="muted">{c.detail}</span></>}</span>
            <span className="sr-only">{c.ok ? "passed" : c.severity === "block" ? "failed, blocks approval" : "warning"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
// endregion: checks
