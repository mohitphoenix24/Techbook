---
title: Infinite AI Image Gallery
level: intermediate
time: 50
icon: palette
cover: #f43f5e,#a855f7
tags: infinite scroll, useInfiniteQuery, IntersectionObserver, dialog, masonry
summary: A gallery of AI-generated artworks that loads more as you scroll — TanStack Query's useInfiniteQuery with cursors, an IntersectionObserver sentinel, filters that reset pagination, a masonry layout, favourites, and an accessible lightbox with keyboard navigation.
---

Feeds, search results, chat history and image galleries all share one pattern: **load a page, show it, load the next page when the user gets near the end**. This project builds it properly, with a gallery of generated artworks (drawn as SVG, so it works offline).

:::flow Infinite loading
API page + cursor | { items, nextCursor }
useInfiniteQuery | caches every page
Sentinel visible? | IntersectionObserver
fetchNextPage() | append next page
Filter changes | new key → page 1
:::

**You'll practise:** cursor pagination, `useInfiniteQuery`, `IntersectionObserver` in an effect with cleanup, query keys that include filters, CSS columns for masonry, `<dialog>` with keyboard navigation, and deterministic generative art.

## Step 1 — Cursor pagination

APIs return a **page** of items plus a **cursor** pointing to the next page. When there's no next cursor, you've reached the end.

```js run title="Step 1 · a paginated fake API"
const ALL = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, title: `Artwork #${i + 1}` }));

async function fetchPage({ cursor = 0, limit = 10 }) {
  await new Promise((r) => setTimeout(r, 100));
  const items = ALL.slice(cursor, cursor + limit);
  const next = cursor + limit;
  return { items, nextCursor: next < ALL.length ? next : null };
}

let cursor = 0, page = 1;
while (cursor !== null) {
  const res = await fetchPage({ cursor });
  console.log(`page ${page++}: ids ${res.items[0].id}–${res.items.at(-1).id}, nextCursor = ${res.nextCursor}`);
  cursor = res.nextCursor;
}
```

## Step 2 — The complete gallery

```jsx run title="AI Image Gallery · complete app"
import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useInfiniteQuery } from "@tanstack/react-query";

// ============ deterministic "generated" artworks ============
const STYLES = ["aurora", "sunset", "ocean", "forest", "neon"];
const PALETTES = { aurora: ["#22d3ee", "#a78bfa", "#34d399"], sunset: ["#f97316", "#f43f5e", "#facc15"], ocean: ["#0ea5e9", "#1e3a8a", "#67e8f9"], forest: ["#166534", "#84cc16", "#a3e635"], neon: ["#ec4899", "#8b5cf6", "#22d3ee"] };
const SUBJECTS = ["mountains at dawn", "a quiet lake", "floating islands", "a city of glass", "a lighthouse", "desert dunes", "a giant tree", "northern lights", "a paper boat", "a sleeping dragon"];
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function makeArtwork(id) {
  const r = rng(id * 7919);
  const style = STYLES[Math.floor(r() * STYLES.length)];
  return { id, style, prompt: `${SUBJECTS[Math.floor(r() * SUBJECTS.length)]}, ${style} palette, soft light`, ratio: [1, 1.3, 0.75, 1.5][Math.floor(r() * 4)], seed: id * 7919, likes: Math.floor(r() * 500) };
}

function Art({ art, size = 200, maxHeight }) {
  const r = rng(art.seed);
  const [a, b, c] = PALETTES[art.style];
  const h = Math.round(size * art.ratio);
  return (
    <svg viewBox={`0 0 ${size} ${h}`} width="100%" style={{ display: "block", borderRadius: 10, maxHeight }} role="img" aria-label={art.prompt}>
      <defs>
        <linearGradient id={`g${art.id}-${size}`} x1="0" y1="0" x2={r()} y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
        <filter id={`f${art.id}-${size}`}><feGaussianBlur stdDeviation={size / 25} /></filter>
        <clipPath id={`c${art.id}-${size}`}><rect width={size} height={h} rx="10" /></clipPath>
      </defs>
      <g clipPath={`url(#c${art.id}-${size})`}>
      <rect width={size} height={h} fill={`url(#g${art.id}-${size})`} />
      <g filter={`url(#f${art.id}-${size})`} opacity="0.85">
        {Array.from({ length: 5 }, (_, i) => <circle key={i} cx={r() * size} cy={r() * h} r={size * (0.12 + r() * 0.25)} fill={[a, b, c][i % 3]} />)}
      </g>
      <path d={`M0 ${h * 0.75} Q ${size * 0.3} ${h * (0.55 + r() * 0.2)} ${size * 0.55} ${h * 0.72} T ${size} ${h * 0.68} V ${h} H 0 Z`} fill="black" opacity="0.28" />
      </g>
    </svg>
  );
}

// ============ fake paginated API ============
const TOTAL = 60;
async function fetchArtworks({ pageParam = 0, style }) {
  await new Promise((r) => setTimeout(r, 600));
  const all = Array.from({ length: TOTAL }, (_, i) => makeArtwork(i + 1)).filter((a) => !style || a.style === style);
  const items = all.slice(pageParam, pageParam + 12);
  return { items, nextCursor: pageParam + 12 < all.length ? pageParam + 12 : null, total: all.length };
}

const queryClient = new QueryClient();

// ============ the sentinel hook ============
function useOnVisible(ref, rootRef, callback, enabled) {
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) callback(); },
      { root: rootRef.current, rootMargin: "200px" },              // start loading a bit before the end
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, rootRef, callback, enabled]);
}

function Lightbox({ items, index, onClose, onMove, liked, toggleLike }) {
  const ref = useRef(null);
  useEffect(() => { if (index !== null && !ref.current.open) ref.current.showModal(); if (index === null && ref.current.open) ref.current.close(); }, [index]);
  const art = index !== null ? items[index] : null;
  return (
    <dialog ref={ref} onClose={onClose} aria-label="Artwork details" style={{ width: "min(420px, 90vw)", maxHeight: "94vh", overflow: "auto" }}
      onKeyDown={(e) => { if (e.key === "ArrowRight") onMove(1); if (e.key === "ArrowLeft") onMove(-1); }}>
      {art && (
        <div className="stack">
          <Art art={art} size={380} maxHeight="55vh" />
          <div><b>“{art.prompt}”</b></div>
          <small className="muted">seed {art.seed} · style {art.style} · #{art.id}</small>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="row">
              <button onClick={() => onMove(-1)} disabled={index === 0} aria-label="Previous">‹</button>
              <button onClick={() => onMove(1)} disabled={index === items.length - 1} aria-label="Next">›</button>
              <button onClick={() => toggleLike(art.id)} aria-pressed={liked.has(art.id)}>{liked.has(art.id) ? "♥ Liked" : "♡ Like"}</button>
            </div>
            <button onClick={onClose} autoFocus>Close</button>
          </div>
        </div>
      )}
    </dialog>
  );
}

function Gallery() {
  const [style, setStyle] = useState(null);
  const [open, setOpen] = useState(null);
  const [liked, setLiked] = useState(() => new Set());
  const scrollRef = useRef(null), sentinelRef = useRef(null);

  const { data, status, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["artworks", style],                                   // new filter → separate cache, starts at page 1
    queryFn: ({ pageParam }) => fetchArtworks({ pageParam, style }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,             // null → hasNextPage = false
  });
  const items = data?.pages.flatMap((p) => p.items) ?? [];

  useOnVisible(sentinelRef, scrollRef, fetchNextPage, hasNextPage && !isFetchingNextPage);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [style]);

  const toggleLike = (id) => setLiked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 4 }}>
          {[null, ...STYLES].map((s) => (
            <button key={s ?? "all"} onClick={() => setStyle(s)} aria-pressed={style === s} className={style === s ? "primary" : ""} style={{ padding: "2px 10px", fontSize: 13 }}>{s ?? "all"}</button>
          ))}
        </div>
        <small className="muted">{items.length}{data ? ` of ${data.pages[0].total}` : ""} loaded · ♥ {liked.size}</small>
      </div>

      <div ref={scrollRef} style={{ height: 420, overflowY: "auto", paddingRight: 4 }}>
        {status === "pending" ? (
          <div style={{ columns: "3 140px", columnGap: 10 }}>{Array.from({ length: 9 }, (_, i) => <div key={i} style={{ height: 100 + (i % 3) * 40, marginBottom: 10, borderRadius: 10, background: "var(--card)", border: "1px solid var(--border)" }} />)}</div>
        ) : status === "error" ? (
          <p className="error">{error.message}</p>
        ) : (
          <>
            <div style={{ columns: "3 140px", columnGap: 10 }}>
              {items.map((art, i) => (
                <figure key={art.id} style={{ margin: "0 0 10px", breakInside: "avoid", position: "relative" }}>
                  <button onClick={() => setOpen(i)} aria-label={`Open: ${art.prompt}`} style={{ padding: 0, border: 0, display: "block", width: "100%", background: "none" }}>
                    <Art art={art} />
                  </button>
                  <button onClick={() => toggleLike(art.id)} aria-pressed={liked.has(art.id)} aria-label={liked.has(art.id) ? "Unlike" : "Like"}
                    style={{ position: "absolute", top: 6, right: 6, padding: "1px 7px", fontSize: 13, background: "rgb(0 0 0 / .45)", color: "white", border: 0 }}>
                    {liked.has(art.id) ? "♥" : "♡"}
                  </button>
                  <figcaption style={{ fontSize: 12, marginTop: 3 }} className="muted">{art.prompt.split(",")[0]}</figcaption>
                </figure>
              ))}
            </div>
            <div ref={sentinelRef} style={{ height: 1 }} />
            <p className="muted" style={{ textAlign: "center" }}>
              {isFetchingNextPage ? "Loading more…" : hasNextPage ? "" : "✨ You've seen everything"}
            </p>
          </>
        )}
      </div>

      <Lightbox items={items} index={open} liked={liked} toggleLike={toggleLike}
        onClose={() => setOpen(null)} onMove={(d) => setOpen((i) => Math.max(0, Math.min(items.length - 1, i + d)))} />
    </div>
  );
}

export default function App() {
  return <QueryClientProvider client={queryClient}><Gallery /></QueryClientProvider>;
}
```

Scroll inside the gallery to load more, switch styles (each style has its own cached pages — switch back and it's instant), like artworks, and open one: use ← → in the lightbox and Escape to close.

## How it works

| Feature | Technique |
|---|---|
| pages + cursor | `useInfiniteQuery` stores `data.pages`; `getNextPageParam` reads the cursor; `null` ends it |
| loading more | an invisible **sentinel** div observed by `IntersectionObserver` (root = the scroll box, `rootMargin` to prefetch early) |
| no duplicate loads | the observer only runs while `hasNextPage && !isFetchingNextPage` |
| filters | the style is part of the **query key**, so each filter has its own pages and cache |
| masonry | CSS `columns` + `break-inside: avoid` — no JavaScript layout needed |
| lightbox | native `<dialog>` (focus trap, Escape, backdrop) + arrow-key navigation |
| art | seeded random numbers → the same id always draws the same picture |

:::tip Very long lists
Infinite scroll keeps adding DOM nodes. For thousands of items, use **virtualisation** (TanStack Virtual, react-window): only the rows on screen are rendered.
:::

:::exercise Extend it
1. Add a **search box** for prompts (include it in the query key, debounce it with `useDeferredValue`).
2. Add a **"Generate"** form that calls an image-generation backend and **prepends** the new image with `queryClient.setQueryData`.
3. Persist likes with an **optimistic mutation** to a fake API.
4. Show a **"Back to top"** button when the user has scrolled far.
:::

:::keypoints
- Paginate with cursors; `useInfiniteQuery` manages pages, loading and "has more".
- Trigger loading with an `IntersectionObserver` sentinel, and disconnect it in the effect cleanup.
- Put filters in the query key — each combination gets its own cache.
- Use `<dialog>` for accessible lightboxes; virtualise when lists get huge.
:::
