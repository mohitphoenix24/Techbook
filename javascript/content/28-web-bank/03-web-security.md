---
title: "Web bank: security"
level: hard
time: 35
summary: Sixteen answers on XSS, CSRF, CORS, cookies and their flags, JWT, content security policy, clickjacking, injection, prototype pollution, passwords, HTTPS and dependency safety.
---

:::qa What is XSS, and what are its types? {level=easy}
**Say this:** "Cross-site scripting is running attacker-supplied JavaScript in your page. Stored XSS: the payload is saved (a comment) and shown to others. Reflected XSS: it comes from the URL and is echoed back. DOM-based XSS: client code writes untrusted data into the DOM (`innerHTML`). The script can steal data, act as the user and read non-HttpOnly storage."

**In simple words:** Strangers' text turns into running code on your page.
:::

:::qa How do you prevent XSS? {level=medium}
**Say this:** "Escape output for the right context (HTML text, attribute, URL, JavaScript), use `textContent` instead of `innerHTML`, rely on frameworks that escape by default (React, Vue) and avoid their raw-HTML escapes (`dangerouslySetInnerHTML`, `v-html`) unless sanitised with DOMPurify, set a strict Content Security Policy, and use `HttpOnly` cookies. Validate input, but escape output."

**In simple words:** Treat all outside text as text, never as code.
:::

:::qa What is a Content Security Policy? {level=medium}
**Say this:** "An HTTP header that tells the browser which sources of scripts, styles, images and frames are allowed. A strict policy (no `unsafe-inline`, scripts by nonce or hash) stops injected scripts from running even if an XSS bug exists. Roll out with `Content-Security-Policy-Report-Only` first."

**In simple words:** A guest list for scripts.
:::

:::qa What is CSRF, and how do you stop it? {level=medium}
**Say this:** "Cross-site request forgery makes a logged-in user's browser send an unwanted request to your site, because cookies are attached automatically. Defences: `SameSite=Lax` or `Strict` cookies, anti-CSRF tokens (synchroniser or double-submit), checking `Origin`/`Referer`, and requiring custom headers or JSON content types. State-changing actions must never be GET."

**In simple words:** Another site tricks your browser into using your login for something you did not intend.
:::

:::qa XSS versus CSRF? {level=easy}
**Say this:** "XSS runs the attacker's code **inside** your site and can do anything the user can. CSRF makes the user's browser send a request **from another site**, relying on the automatic cookie, and the attacker cannot read the response. An XSS bug can also defeat CSRF tokens."

**In simple words:** One is a thief inside the house; the other is a forged letter sent in your name.
:::

:::qa What do the cookie flags `HttpOnly`, `Secure` and `SameSite` do? {level=easy}
**Say this:** "`HttpOnly`: JavaScript cannot read the cookie, which limits theft through XSS. `Secure`: sent only over HTTPS. `SameSite=Strict/Lax/None`: controls sending on cross-site requests (Lax is the browser default; `None` needs `Secure`). Also use `Path`, `Max-Age`/`Expires`, and the `__Host-` prefix for extra safety."

**In simple words:** Hidden from scripts, only over a secure road, and not sent from other sites.
:::

:::qa Where should you store a JWT in a browser app? {level=hard}
**Say this:** "Avoid `localStorage` for sensitive tokens: any XSS can read it. Prefer an `HttpOnly`, `Secure`, `SameSite` cookie for the session or refresh token, a short-lived access token kept in memory, and refresh-token rotation with revocation. Cookies bring CSRF concerns, handled with SameSite and tokens."

**In simple words:** Put the key where scripts cannot grab it.
:::

:::qa What is the structure of a JWT, and what are its weaknesses? {level=medium}
**Say this:** "Three base64url parts: header, payload (claims) and signature. The payload is **encoded, not encrypted**, so do not store secrets in it. Verify the signature, the algorithm (reject `none`, pin the algorithm), `exp`, `aud` and `iss`. Tokens cannot be revoked before they expire unless you keep a deny-list or use short lifetimes."

**In simple words:** A signed postcard: anyone can read it, but no one can change it without being noticed.
:::

:::qa Why is CORS not a security feature for your server? {level=medium}
**Say this:** "CORS only tells browsers whether a page from another origin may read your responses. It does not block requests from curl, servers or attackers' scripts, and simple requests still reach your server (which is why CSRF protection exists). Authenticate and authorise on the server regardless."

**In simple words:** CORS protects users' browsers, not your API.
:::

:::qa What is clickjacking? {level=medium}
**Say this:** "Loading your site in a transparent iframe over a fake page so the user clicks your buttons unknowingly. Prevent with `Content-Security-Policy: frame-ancestors 'none'` (or `'self'`) and the older `X-Frame-Options`."

**In simple words:** Tricking someone to click on something hidden under something else.
:::

:::qa How do you prevent SQL injection? {level=easy}
**Say this:** "Use parameterised queries or prepared statements (`db.query('SELECT * FROM users WHERE id = $1', [id])`) or an ORM that does so. Never concatenate user input into SQL. Also use least-privilege database accounts and validate input. The same idea applies to NoSQL operators (`{ $ne: null }`)."

**In simple words:** Send the command and the data separately.
:::

:::qa How should passwords be stored? {level=medium}
**Say this:** "Never plain text or fast hashes. Use a slow, salted password hashing function: Argon2id, scrypt or bcrypt, with sensible cost settings. Add rate limiting and lockouts, support multi-factor authentication, and prefer a trusted identity provider (OAuth/OIDC) where possible."

**In simple words:** Make every guess expensive for the attacker.
:::

:::qa What is prototype pollution? {level=hard}
**Say this:** "Attacker input with keys like `__proto__` or `constructor.prototype` is merged into an object and changes `Object.prototype`, so all objects get unexpected properties (for example `isAdmin: true`). Prevent by blocking those keys, using `Object.create(null)` or `Map`, validating with schemas, freezing prototypes, and updating libraries."

**In simple words:** A crafted key reaches into the shared parent and changes it for everyone.
:::

:::qa What does HTTPS give you, and what is HSTS? {level=easy}
**Say this:** "Encryption (nobody can read the traffic), integrity (nobody can change it) and server authentication via certificates. HSTS (`Strict-Transport-Security`) tells the browser to use HTTPS only for that site, preventing downgrade attacks."

**In simple words:** A sealed, signed envelope; HSTS says 'always use envelopes'.
:::

:::qa How do you keep dependencies safe? {level=medium}
**Say this:** "Pin and commit the lock file, run `npm audit`/Dependabot/Snyk, remove unused packages, prefer well-maintained ones, review install scripts, use Subresource Integrity (`integrity=` attributes) for CDN scripts, and monitor for typosquatting."

**In simple words:** Every package is someone else's code running in your app.
:::

:::qa What is SSRF? {level=hard}
**Say this:** "Server-side request forgery: an attacker makes your server fetch a URL they choose (image proxy, webhook, URL preview), reaching internal services or cloud metadata endpoints. Defend with allow-lists of hosts, blocking private and link-local IP ranges after DNS resolution, no redirects to internal hosts, short timeouts, and network segmentation."

**In simple words:** Your server is tricked into knocking on doors that only it can reach.
:::

:::keypoints
- **XSS**: escape output, avoid `innerHTML`, strict **CSP**, HttpOnly cookies.
- **CSRF**: SameSite cookies + tokens + never GET for changes.
- **Cookies**: `HttpOnly`, `Secure`, `SameSite`; **JWT payload is not secret**; short-lived tokens, rotate refresh tokens.
- **CORS ≠ server security**; parameterise SQL; **Argon2/bcrypt** passwords; block `__proto__`; guard against **SSRF**.
:::
