import { describeInput, STEP_LABEL } from "../format";
import type { Step } from "../chatReducer";

// region: steps
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="steps">
      {steps.map((s) => {
        const state = s.result === null ? "running" : s.result.ok ? "ok" : "failed";
        return (
          <li key={s.id} className={`step ${state}`}>
            {s.note && <p className="note">{s.note}</p>}
            <div className="head">
              <span className="dot" aria-hidden />
              <b>{STEP_LABEL[s.name] ?? s.name}</b>
              <code>{describeInput(s.name, s.input)}</code>
              <span className="status">{s.result === null ? "running…" : s.result.summary}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
// endregion: steps
