import { useEffect, useRef } from "react";

/** A note, read-only, in a modal <dialog>. The text is shown as text; it is never interpreted as HTML or Markdown. */
export function NoteViewer({ name, content, onClose }: { name: string; content: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="viewer" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }} aria-label={`Note ${name}`}>
      <header><b>{name}</b><button className="ghost" onClick={() => ref.current?.close()}>Close</button></header>
      <pre>{content}</pre>
    </dialog>
  );
}
