---
title: "Web bank: cheat sheet"
level: easy
time: 15
summary: Cookie flags, security headers, HTTP caching headers, status codes for web apps, CORS headers and a hooks rules recap on one page.
---

## Cookie flags

| Flag | Meaning |
|---|---|
| `HttpOnly` | not readable by JavaScript (limits XSS damage) |
| `Secure` | sent only over HTTPS |
| `SameSite=Strict` | never sent on cross-site requests |
| `SameSite=Lax` | sent on top-level navigations (links), not on cross-site `POST`/images/frames; the browser default |
| `SameSite=None` | always sent; needs `Secure` |
| `Max-Age` / `Expires` | lifetime; no value means a session cookie |
| `__Host-` prefix | requires `Secure`, `Path=/`, and no `Domain`: locks the cookie to the host |

## Security headers

| Header | Purpose |
|---|---|
| `Content-Security-Policy` | which sources scripts, styles, images and frames may load from; `frame-ancestors` stops clickjacking |
| `Strict-Transport-Security` | use HTTPS only |
| `X-Content-Type-Options: nosniff` | do not guess MIME types |
| `Referrer-Policy` | how much of the URL is sent as a referrer |
| `Permissions-Policy` | switch off browser features (camera, geolocation) |
| `Cross-Origin-Opener-Policy` / `-Embedder-Policy` | isolation (needed for `SharedArrayBuffer`) |

## HTTP caching

| Header | Meaning |
|---|---|
| `Cache-Control: max-age=31536000, immutable` | fingerprinted assets: cache for a year |
| `Cache-Control: no-cache` | store, but revalidate before use |
| `Cache-Control: no-store` | never store (sensitive data) |
| `Cache-Control: private` / `public` | only the browser / shared caches too |
| `ETag`, `If-None-Match` → `304` | validate a stored copy cheaply |
| `stale-while-revalidate=60` | serve the old copy while fetching a new one |

## CORS in one table

| Request | Preflight? | Server must send |
|---|---|---|
| `GET`/`POST` with simple headers and content types | no | `Access-Control-Allow-Origin` |
| `PUT`/`DELETE`, JSON `Content-Type`, custom headers | yes (`OPTIONS`) | `Allow-Origin`, `Allow-Methods`, `Allow-Headers`, optional `Max-Age` |
| With cookies (`credentials: 'include'`) | as above | exact origin (not `*`) and `Access-Control-Allow-Credentials: true` |

## Web and React quick facts

- Vitals: **LCP < 2.5 s, INP < 200 ms, CLS < 0.1**.
- Animate `transform` and `opacity`; batch DOM reads and writes.
- Script loading: normal blocks, `defer` runs in order after parsing, `async` runs when ready.
- React: render → diff → commit; state is a snapshot; hooks by call order; effects after paint; keys must be stable.
- Never: user HTML in `innerHTML`, secrets in `localStorage`, state changes on `GET`, `Access-Control-Allow-Origin: *` with credentials.

:::keypoints
- Memorise the **cookie flags**, the **CSP / HSTS / nosniff** trio, and the **caching header** meanings.
- State the **three Core Web Vitals** with their limits.
:::
