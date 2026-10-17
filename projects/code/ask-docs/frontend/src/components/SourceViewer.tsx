import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getChunk } from "../api";

/** A dialog showing one passage with the text around it, so a reader can judge a citation in context. */
export function SourceViewer({ chunkId, onClose }: { chunkId: number; onClose: () => void }) {
  const { data, error } = useQuery({ queryKey: ["chunk", chunkId], queryFn: () => getChunk(chunkId) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Source passage" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <b>{data?.document ?? "Loading…"}</b>
            {data && <span className="muted"> · page {data.page}{data.heading ? ` · ${data.heading}` : ""}</span>}
          </div>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </header>
        {error && <p className="flag error">Could not load this passage.</p>}
        {data && (
          <div className="context">
            {data.before && <p className="dim">…{data.before}</p>}
            <p className="focus">{data.text}</p>
            {data.after && <p className="dim">{data.after}…</p>}
          </div>
        )}
      </div>
    </div>
  );
}
