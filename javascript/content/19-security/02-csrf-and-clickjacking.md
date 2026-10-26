---
title: CSRF, clickjacking and cross-site request protection
level: advanced
time: 30
summary: How CSRF works (the browser attaches cookies automatically), the defences (SameSite cookies, CSRF tokens, origin checks, custom headers), why JSON APIs with cookies still need protection, and clickjacking protection with frame-ancestors.
---

## How CSRF works

> "**Cross-Site Request Forgery (CSRF)**: a malicious site makes **your browser** send a request to a site where you are **logged in**, and the browser **automatically attaches your cookies**, so the request looks like you made it."

```viz algo=seq title="A CSRF attack"
participant u User [user]
participant b bank.example [server]
participant e evil.example [browser]
u -> b : logs in (cookie: sid=abc stored in the browser)
u -> e : visits a page (a link, an ad, an email)
e --> u : page contains a hidden form posting to bank.example/transfer
u -> b : POST /transfer to=attacker amount=5000 | The browser attaches the bank's cookie automatically!
b --> u : 200 OK (the bank thinks the user asked for it)
```

```html
<!-- on evil.example: it submits itself, no click needed -->
<form action="https://bank.example/transfer" method="POST" id="f">
  <input type="hidden" name="to" value="attacker">
  <input type="hidden" name="amount" value="5000">
</form>
<script>document.getElementById("f").submit();</script>
```

The attacker **cannot read** the response (same-origin policy), but does not need to: the **action** (transfer, change email, delete account) is the damage.

CSRF needs **three** things: (1) a **state-changing** request, (2) authentication by something the browser **sends automatically** (cookies, HTTP auth), (3) the attacker can **predict all the parameters**.

APIs that need **`Authorization: Bearer ...` headers** set by JavaScript are **not** vulnerable to classic CSRF (the browser does not add that header by itself). But then the token is stored where scripts can read it (see XSS and storage lessons), so each choice has a trade-off.

## Defences

### 1. `SameSite` cookies (the first line of defence)

```
Set-Cookie: sid=abc; HttpOnly; Secure; SameSite=Lax
```

| SameSite | Cookie is sent on... |
|---|---|
| **`Strict`** | only requests that start from the **same site** |
| **`Lax`** (default in modern browsers) | same-site requests, **plus top-level navigations with safe methods (GET)** from other sites |
| **`None; Secure`** | all requests, including cross-site (needed for embeds): **no CSRF protection** |

With **`Lax`**, a cross-site `POST`, `fetch`, image or iframe request does **not** carry the cookie, which blocks the classic attack. Weak spots: **GET requests that change state** (never do that), and sites in the **same "site"** (a compromised subdomain), and old browsers.

"Site" = registrable domain (eTLD+1): `app.example.com` and `api.example.com` are the **same site** (different origins).

### 2. CSRF tokens (synchroniser token pattern)

The server gives the page a **random, unguessable token** tied to the session; every state-changing request must **send it back** (in a hidden field or a header). The attacker's page cannot read it (SOP), so it cannot forge the request.

```js run node title="A CSRF token: generate, embed, verify (constant-time compare)"
const crypto = require("node:crypto");

const sessions = new Map();                                    // sessionId -> { csrf }
function login() {
  const id = crypto.randomBytes(16).toString("hex");
  sessions.set(id, { csrf: crypto.randomBytes(24).toString("base64url") });
  return id;
}

function verifyCsrf(sessionId, tokenFromRequest) {
  const session = sessions.get(sessionId);
  if (!session || typeof tokenFromRequest !== "string") return false;
  const a = Buffer.from(session.csrf), b = Buffer.from(tokenFromRequest);
  return a.length === b.length && crypto.timingSafeEqual(a, b);          // avoids timing attacks
}

const sid = login();
const token = sessions.get(sid).csrf;                          // embedded in the HTML form the server rendered

console.log("legitimate form (cookie + token):", verifyCsrf(sid, token));
console.log("attacker's forged form (cookie only):", verifyCsrf(sid, undefined));
console.log("attacker guesses a token:", verifyCsrf(sid, "A".repeat(token.length)));
```

Variants:

- **Double-submit cookie:** set the token in a (non-HttpOnly) cookie **and** require it in a header or body; the server checks that they match. Safer when signed/bound to the session.
- **Per-request** tokens are stricter but break the back button; **per-session** tokens are the common compromise.
- SPAs: read the token (cookie or meta tag) and add a header like `X-CSRF-Token` on each `fetch`; the browser will not add a **custom header** cross-site without a CORS preflight, which your server rejects.

### 3. Check `Origin` / `Referer` and `Sec-Fetch-Site`

Browsers add these headers and the attacker cannot forge them from a browser:

```js run title="Server-side request origin check"
function isSameSiteRequest(headers, allowedOrigin) {
  const fetchSite = headers["sec-fetch-site"];                         // "same-origin" | "same-site" | "cross-site" | "none"
  if (fetchSite) return fetchSite === "same-origin" || fetchSite === "none";     // "none": typed in the address bar
  const origin = headers.origin ?? (headers.referer ? new URL(headers.referer).origin : null);
  return origin === allowedOrigin;                                      // fall back for older browsers
}

const allowed = "https://bank.example";
console.log(isSameSiteRequest({ "sec-fetch-site": "same-origin" }, allowed));
console.log(isSameSiteRequest({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }, allowed));
console.log(isSameSiteRequest({ origin: "https://bank.example" }, allowed), isSameSiteRequest({}, allowed));
```

### 4. Require a custom header or a non-simple content type

If every API call must carry **`Content-Type: application/json`** or a header such as **`X-Requested-With`**, a cross-site form cannot send it (HTML forms only send `application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`). A cross-site `fetch` with that header triggers a **preflight**, which fails unless your CORS allows the attacker's origin. **Do not rely on this alone**; also reject requests with the wrong content type.

### 5. Other good practices

- **Never change state with `GET`** (links, images and prefetching can trigger it).
- **Re-authenticate or confirm** sensitive actions (password, payment).
- **Short session lifetime** and rotate session ids on login.
- Frameworks help: Django, Rails, Laravel, Spring, ASP.NET have built-in CSRF protection. In Express use `csrf-csrf` or `csurf` alternatives with care.
- **CORS is not a CSRF defence.**

## Clickjacking

> "**Clickjacking:** the attacker loads your site in a **transparent iframe** on their page and tricks the user into clicking buttons they cannot see (like 'Delete account' or 'Like')."

Defence: tell the browser **who may embed your pages**.

```
Content-Security-Policy: frame-ancestors 'none';        ← modern (or 'self', or a list of origins)
X-Frame-Options: DENY                                    ← older equivalent (DENY or SAMEORIGIN)
```

Do **not** rely on JavaScript "frame busting". For pages that must be embedded, allow only specific origins in `frame-ancestors`.

## Putting it together: a checklist for cookie-based sessions

| Measure | Stops |
|---|---|
| `HttpOnly` | script theft of the cookie (XSS) |
| `Secure` | sending over HTTP |
| `SameSite=Lax` (or `Strict`) | classic CSRF |
| CSRF token (or double-submit) for unsafe methods | CSRF from same-site attackers and old browsers |
| `Origin` / `Sec-Fetch-Site` check | forged cross-site requests |
| No state change on `GET` | link/prefetch triggered actions |
| `frame-ancestors` / `X-Frame-Options` | clickjacking |
| CSP + escaping | XSS (which would defeat CSRF tokens too!) |

:::interview What is CSRF and how do you defend against it?
"CSRF tricks a logged-in user's browser into sending an authenticated, state-changing request to my site from another site, because the browser attaches cookies automatically. The attacker cannot read the response but can cause the action. Defences: `SameSite=Lax` or `Strict` on session cookies, which stops cookies on cross-site POST and fetch requests; anti-CSRF tokens tied to the session and verified on every unsafe request, or double-submit cookies; checking `Origin`, `Referer` and `Sec-Fetch-Site`; requiring a custom header or JSON content type so a cross-site form cannot send it; never changing state on GET; and re-authentication for sensitive actions. CORS is not a defence by itself. For clickjacking I send `frame-ancestors` or `X-Frame-Options`."
:::

## More interview questions on this topic

:::qa Why can't the attacker just read the CSRF token from my page? {level=medium}
**Say this:** "The same-origin policy stops a page from another origin reading my page's HTML or responses, so it cannot get the token (unless XSS or a CORS misconfiguration exists)."

**In simple words:** They can send the envelope but cannot see inside my letters.
:::

:::qa Does using a JWT in the Authorization header protect you from CSRF? {level=medium}
**Say this:** "Yes from classic CSRF, because the browser does not attach that header automatically. But if the JWT is stored in localStorage, XSS can steal it, so you trade CSRF risk for XSS exposure. A common best practice is an HttpOnly SameSite cookie plus CSRF protection."

**In simple words:** No automatic header, no CSRF, but the token is exposed to scripts.
:::

:::qa What is the difference between "same-origin" and "same-site"? {level=hard}
**Say this:** "Same-origin means identical scheme, host and port. Same-site means the same registrable domain (and scheme), so `app.example.com` and `api.example.com` are the same site but different origins. SameSite cookies use the site concept."

**In simple words:** Site is the whole company; origin is one exact building.
:::

:::qa How does `SameSite=Lax` still allow some cross-site cookies? {level=medium}
**Say this:** "On top-level navigations with safe methods, like clicking a link to your site, so users arriving from another site stay logged in. That is why GET requests must never change state."

**In simple words:** Following a normal link carries your cookie; a hidden POST does not.
:::

```quiz
? What makes CSRF possible?
- Weak passwords
+ The browser automatically attaches cookies to cross-site requests
- Slow servers
> Authentication by ambient cookies.
? Which cookie attribute is the primary CSRF defence?
- HttpOnly
+ SameSite
- Path
> Lax or Strict limits cross-site sending.
? Which header controls who may embed your page in an iframe?
- Access-Control-Allow-Origin
+ Content-Security-Policy: frame-ancestors
- Referrer-Policy
> It prevents clickjacking.
```

:::keypoints
- **CSRF**: attacker site triggers an authenticated state-changing request; the browser sends your **cookies automatically**. They cannot read the response, but the action happens.
- **Defences**: **SameSite** (Lax/Strict), **CSRF tokens** (or double-submit), **Origin/Referer/`Sec-Fetch-Site`** checks, custom header / JSON content type, **no state change on GET**, re-auth for sensitive actions.
- Bearer tokens in headers avoid CSRF but shift risk to XSS/token storage.
- **Clickjacking**: `frame-ancestors` (or `X-Frame-Options`). **CORS ≠ CSRF protection.**
:::
