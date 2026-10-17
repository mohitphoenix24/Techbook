import { label, splitCitations } from "../citations";
import type { CitationItem } from "../types";

const TITLE: Record<string, string> = {
  valid: "The model was shown this code",
  outside_context: "This code exists, but the model was never shown it: treat this citation with suspicion",
  bad_lines: "Those lines do not exist in that file",
  no_such_file: "There is no such file in this repository",
  unchecked: "Not checked yet",
};

// region: answer
/** The answer as text, with each [path:start-end] drawn as a chip coloured by the server's check of it. */
export function Answer({ text, citations, onOpen }: { text: string; citations: CitationItem[] | null; onOpen: (path: string, start: number, end: number) => void }) {
  return (
    <div className="answer" data-testid="answer">
      {text.split("\n").map((line, i) => {
        const bullet = line.startsWith("- ");
        const body = bullet ? line.slice(2) : line;
        const content = splitCitations(body, citations).map((p, j) =>
          p.kind === "cite" ? (
            <button key={j} className={`cite ${p.status}`} title={TITLE[p.status]} disabled={p.status === "no_such_file"} onClick={() => onOpen(p.path, p.start, p.end)}>{label(p)}</button>
          ) : (
            <Inline key={j} text={p.text} />
          ),
        );
        return bullet ? <li key={i}>{content}</li> : <p key={i}>{content}</p>;
      })}
    </div>
  );
}

/** `code` in backticks, nothing else: just enough to read an answer. */
function Inline({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/).map((s, i) => (s.startsWith("`") && s.endsWith("`") ? <code key={i}>{s.slice(1, -1)}</code> : <span key={i}>{s}</span>))}</>;
}
// endregion: answer
