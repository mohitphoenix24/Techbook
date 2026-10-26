---
title: fetch, the same-origin policy and CORS
level: advanced
time: 40
summary: How fetch really behaves (it does not reject on 404), requests with JSON and credentials, the same-origin policy, simple and preflighted CORS requests with the exact headers, CORS server code, and the classic CORS mistakes.
---

## `fetch` in practice

`fetch(url, options)` returns a **promise of a `Response`**. The promise **rejects only on network failure** (no connection, DNS error, CORS blocked, abort). **A 404 or 500 is a successful fetch.** You must check `response.ok`.

```js run node title="The fetch error-handling pattern (against a local server)"
const http = require("node:http");

const server = http.createServer((req, res) => {
  if (req.url === "/ok") return res.writeHead(200, { "Content-Type": "application/json" }).end('{"name":"Asha"}');
  if (req.url === "/missing") return res.writeHead(404, { "Content-Type": "application/json" }).end('{"error":"no such user"}');
  if (req.url === "/echo") { let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => res.end(JSON.stringify({ method: req.method, type: req.headers["content-type"], body }))); return; }
  res.writeHead(500).end("boom");
});

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {                                              // 4xx/5xx do NOT throw by themselves
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    error.body = await response.text();
    throw error;
  }
  return response.json();
}

server.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(await getJson(base + "/ok"));
  for (const path of ["/missing", "/error"]) {
    try { await getJson(base + path); } catch (e) { console.log(path, "->", e.message, "|", e.body); }
  }

  // sending JSON: set the header AND stringify the body
  console.log(await getJson(base + "/echo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: "tea" }) }));

  try { await fetch("http://127.0.0.1:1/unreachable"); } catch (e) { console.log("network failure rejects:", e.name + ":", e.message); }
  server.close();
});
```

Other things to know:

- `response.json()`, `.text()`, `.blob()`, `.arrayBuffer()`, `.formData()` can each be read **once** (the body is a stream). Use `response.clone()` to read twice.
- `response.body` is a **ReadableStream**: stream big responses.
- **Timeouts and cancel:** `fetch(url, { signal: AbortSignal.timeout(5000) })` (there is no built-in `timeout` option).
- **Query strings:** `new URLSearchParams({ q: "tea & coffee" })` handles encoding.
- **Credentials:** by default `fetch` sends cookies only to the **same origin**. `credentials: "include"` sends them cross-origin too (needs CORS opt-in).
- Not supported by `fetch`: progress events for **uploads** (use XHR or streams), and automatic retries.

## The same-origin policy (SOP)

> "A page may **freely read** data from another page or response only if it comes from the **same origin**."

**Origin = scheme + host + port.**

| URL | Same origin as `https://shop.example.com/page`? |
|---|---|
| `https://shop.example.com/other` | ✅ yes (path differs only) |
| `http://shop.example.com` | ❌ scheme differs |
| `https://api.example.com` | ❌ host differs (subdomain!) |
| `https://shop.example.com:8443` | ❌ port differs |

SOP protects you from **a malicious site reading your bank page with your cookies**. It restricts **reading** responses and accessing another origin's DOM and storage. It does **not** stop **sending** requests (a cross-site `<form>` POST or `<img src>` still goes out: that is why **CSRF** exists).

## CORS: relaxing SOP on purpose

**CORS (Cross-Origin Resource Sharing)** lets a **server** tell the browser: "this other origin may read my responses." It is a **browser** rule, enforced by the browser, controlled by **server headers**. It is **not** a protection for your server (curl, Postman or another server ignore it).

### Simple requests

For `GET`/`HEAD`/`POST` with only "safe" headers and content types (`text/plain`, `form-urlencoded`, `multipart/form-data`), the browser **sends the request** with an `Origin` header and **checks the response** headers:

```
GET /api/items HTTP/1.1
Host: api.example.com
Origin: https://app.example.com            ← added by the browser

HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://app.example.com    ← the server allows that origin
Vary: Origin
```

If `Access-Control-Allow-Origin` is missing or does not match, the browser **hides the response** from your JavaScript (you see a CORS error in the console), **even though the server did process the request**.

### Preflighted requests

If the request is **not simple** (methods like `PUT`/`DELETE`/`PATCH`, `Content-Type: application/json`, an `Authorization` or custom header), the browser first sends an **`OPTIONS` preflight** to ask permission:

```viz algo=seq title="A preflighted CORS request"
participant b Browser [browser]
participant s api.example.com [server]
b -> s : OPTIONS /items | Origin: https://app.example.com, Access-Control-Request-Method: PUT, Access-Control-Request-Headers: content-type, authorization
s --> b : 204 | Allow-Origin, Allow-Methods: PUT, Allow-Headers: content-type, authorization, Max-Age: 600
b -> s : PUT /items (the real request, with Origin)
s --> b : 200 + Access-Control-Allow-Origin
```

The preflight result is **cached** for `Access-Control-Max-Age` seconds.

### The response headers

| Header | Meaning |
|---|---|
| `Access-Control-Allow-Origin` | the allowed origin (**one** origin, or `*` for any) |
| `Access-Control-Allow-Methods` | allowed methods (preflight response) |
| `Access-Control-Allow-Headers` | allowed request headers (preflight response) |
| `Access-Control-Expose-Headers` | response headers that JavaScript may read (beyond the safe list) |
| `Access-Control-Allow-Credentials: true` | allow cookies / HTTP auth (**then `Allow-Origin` cannot be `*`**) |
| `Access-Control-Max-Age` | how long to cache the preflight |
| `Vary: Origin` | **required** when the allowed origin is chosen dynamically, so caches do not mix responses |

### A CORS implementation, tested without a browser

```js run title="CORS server logic as a pure function, plus a model of the browser check"
const ALLOWED = new Set(["https://app.example.com", "https://admin.example.com"]);

// SERVER: decide the CORS headers for a request
function corsHeaders({ method, origin, requestMethod, requestHeaders }) {
  const headers = { Vary: "Origin" };
  if (!origin) return headers;                                          // not a CORS request (same origin, curl, server to server)
  if (!ALLOWED.has(origin)) return headers;                             // unknown origin: send no CORS headers
  headers["Access-Control-Allow-Origin"] = origin;                      // echo ONLY allowed origins (never blindly echo!)
  headers["Access-Control-Allow-Credentials"] = "true";
  if (method === "OPTIONS") {                                           // the preflight
    headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE";
    headers["Access-Control-Allow-Headers"] = requestHeaders ?? "content-type, authorization";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

// BROWSER (model): may the page read the response?
function browserAllows(pageOrigin, responseHeaders, { credentials = false } = {}) {
  const allow = responseHeaders["Access-Control-Allow-Origin"];
  if (!allow) return "blocked: no Access-Control-Allow-Origin header";
  if (allow !== "*" && allow !== pageOrigin) return `blocked: origin ${pageOrigin} does not match ${allow}`;
  if (credentials && allow === "*") return "blocked: wildcard origin with credentials";
  if (credentials && responseHeaders["Access-Control-Allow-Credentials"] !== "true") return "blocked: credentials not allowed";
  return "allowed";
}

const page = "https://app.example.com";
console.log(browserAllows(page, corsHeaders({ method: "GET", origin: page }), { credentials: true }));
console.log(browserAllows("https://evil.example.net", corsHeaders({ method: "GET", origin: "https://evil.example.net" })));
console.log(browserAllows(page, { "Access-Control-Allow-Origin": "*" }, { credentials: true }));
console.log(corsHeaders({ method: "OPTIONS", origin: page, requestMethod: "PUT", requestHeaders: "content-type" }));
```

### Express/Node server code

```js
import cors from "cors";

app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowList.has(origin)),   // validate against an allow-list
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600,
}));
// Note: for requests WITHOUT an Origin header (same-origin, curl), no CORS headers are needed.
```

## Common CORS mistakes

| Mistake | Why it is wrong |
|---|---|
| `Access-Control-Allow-Origin: *` together with `credentials: "include"` | The browser rejects it. Credentials need a **specific origin** + `Allow-Credentials: true` |
| Reflecting any `Origin` header back | Equivalent to allowing every site to read authenticated responses: a **security hole** |
| Forgetting `Vary: Origin` | A CDN may cache one origin's headers and serve them to another |
| Not handling `OPTIONS` (preflight) | The real request is never sent; you see "preflight failed" |
| Putting CORS headers only on the success path | Error responses (4xx/5xx) without them show up as **CORS errors** that hide the real status |
| Thinking CORS protects your API | It only controls browsers; use **authentication** and **CSRF protection** |
| "Fixing" CORS on the client with `mode: "no-cors"` | You get an **opaque** response you cannot read |
| Using a **proxy in development** | Good: Vite/webpack `proxy` or Next.js rewrites make API calls same-origin, no CORS at all |

Ways to avoid CORS entirely: serve the API under the **same origin** (a reverse proxy: `/api` → backend), or use a **BFF** (backend for frontend).

## Related security headers (a preview)

| Header | Protects against |
|---|---|
| `Content-Security-Policy` | XSS (which scripts and sources are allowed) |
| `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy` | cross-origin isolation (needed for `SharedArrayBuffer`) |
| `Cross-Origin-Resource-Policy` | other sites embedding your resources |
| `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security` | MIME sniffing, referrer leaks, HTTP downgrade |

:::interview What is the same-origin policy and what is CORS? What is a preflight request?
"An origin is scheme, host and port. The same-origin policy stops a page from reading responses and storage of another origin, which protects users from malicious sites using their cookies. CORS is a browser mechanism that lets a server opt in to cross-origin reads by sending `Access-Control-Allow-Origin` (and related) headers. For non-simple requests, such as JSON content type, custom or Authorization headers, or PUT and DELETE, the browser first sends an OPTIONS preflight with the `Origin` and the requested method and headers; the server must answer with the allowed origin, methods and headers, and the result is cached by `Max-Age`. Credentials need an explicit origin (not `*`) and `Allow-Credentials: true`. CORS is enforced by browsers only; it does not secure the API itself."
:::

## More interview questions on this topic

:::qa Why does `fetch` not reject on a 404? {level=easy}
**Say this:** "The promise reflects whether a response was received, not whether it was successful. A 404 is a valid HTTP response, so I check `response.ok` or `response.status` and throw myself."

**In simple words:** The mail arrived; it just said "not found".
:::

:::qa The request reached my server and succeeded, but the browser shows a CORS error. Why? {level=medium}
**Say this:** "For simple requests the browser sends the request and the server executes it, but the browser hides the response from JavaScript because `Access-Control-Allow-Origin` was missing or did not match. CORS limits reading, not sending."

**In simple words:** The reply came, but the browser would not hand it to your code.
:::

:::qa Why can't `Access-Control-Allow-Origin` be `*` when credentials are included? {level=hard}
**Say this:** "Because it would let any site read responses that depend on the user's cookies. The spec requires an explicit origin and `Access-Control-Allow-Credentials: true` for credentialed requests."

**In simple words:** "Everyone may read this" and "this is personal" cannot both be true.
:::

:::qa Does CORS protect against CSRF? {level=hard}
**Say this:** "No. SOP and CORS restrict reading responses. A cross-site form or simple request can still be sent with the user's cookies. CSRF is prevented with SameSite cookies, CSRF tokens or custom headers checked on the server."

**In simple words:** CORS stops reading, not sending.
:::

```quiz
? What decides if two URLs have the same origin?
- Only the domain name
+ Scheme, host and port
- The path
> A different subdomain or port is a different origin.
? Does a fetch to a URL that returns 500 reject the promise?
- Yes
+ No, it resolves with response.ok === false
- Only in strict mode
> Only network failures and aborts reject.
? When does the browser send a preflight?
- For every GET
+ For non-simple requests (JSON content type, custom headers, PUT/DELETE)
- Never
> An OPTIONS request asks permission first.
```

:::keypoints
- **`fetch` rejects only on network failure**; check **`response.ok`**. Bodies are read once; use `AbortSignal.timeout`; `credentials: "include"` for cross-origin cookies.
- **SOP**: origin = **scheme + host + port**. It limits **reading**, not **sending** (hence CSRF).
- **CORS** = server opt-in via **`Access-Control-Allow-*`** headers; **preflight (`OPTIONS`)** for non-simple requests; cached by `Max-Age`.
- Credentials need a **specific origin + `Allow-Credentials: true`** (never `*`). Add **`Vary: Origin`**. Validate origins against an **allow-list**.
- CORS is enforced by **browsers**; it does **not** secure the API. Avoid it with a proxy/BFF on the same origin.
:::
