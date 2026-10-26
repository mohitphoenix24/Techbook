---
title: Dependencies, secrets, security headers and rate limiting
level: advanced
time: 35
summary: npm supply-chain risks and defences, handling secrets, the HTTP security headers that matter, a token-bucket rate limiter, and the OWASP Top 10 mapped to a Node/React stack.
---

## Your dependencies are your attack surface

A typical Node project pulls in **hundreds to thousands** of packages (direct and transitive). Anyone who can publish or hijack **one** of them can run code on your developers' machines, your CI and your servers.

| Attack | How it works |
|---|---|
| **Known vulnerabilities** | an old version has a published CVE (prototype pollution, ReDoS, path traversal) |
| **Typosquatting** | a malicious `reqeust` or `crossenv` package waits for typos |
| **Dependency confusion** | an attacker publishes a public package with the same name as your **private** internal package, with a higher version, and the build installs it |
| **Account takeover / maintainer sabotage** | a maintainer's npm account is hijacked, or they add malware themselves (`event-stream`, `colors`/`faker`, `ua-parser-js`) |
| **Malicious install scripts** | `preinstall`/`postinstall` scripts run arbitrary code on `npm install` |
| **Compromised build/CI or CDN** | a poisoned release artefact, or a hijacked CDN script (`polyfill.io`) |

### Defences

```bash
npm ci                          # install EXACTLY what package-lock.json says (use in CI and Docker builds)
npm audit                       # known vulnerabilities in your tree; `npm audit --omit=dev`; `npm audit fix` carefully
npm install --ignore-scripts    # do not run install scripts (then run the few that you need on purpose)
npm config set save-exact true  # record exact versions instead of ^ ranges
npm ls <package>                # who depends on this package (find the vulnerable transitive one)
npm outdated; npx npm-check-updates
npm audit signatures            # verify registry signatures and provenance attestations
```

| Practice | Why |
|---|---|
| **Commit the lockfile**, use **`npm ci`** | reproducible, reviewed installs |
| **Few, well-known dependencies**; check maintenance, downloads, license, last release | smaller surface (a 5-line `left-pad` is better written yourself) |
| **Automated updates** (Renovate, Dependabot) with review and CI | patches arrive quickly but not blindly |
| **Scoped private packages** (`@company/pkg`) + registry config | blocks dependency confusion |
| **2FA and provenance** for packages you publish | npm provenance links a package to its source build |
| **Review lockfile diffs**; block new install scripts | catches surprises |
| **Scanning tools**: `npm audit`, **Snyk**, **Socket**, **OSV-Scanner**, GitHub code scanning | continuous detection |
| **Run builds with least privilege**; no production secrets in CI by default | limits the blast radius |
| **Subresource Integrity (SRI)** for CDN scripts; self-host critical ones | `<script src=… integrity="sha384-…" crossorigin>` |
| **SBOM** (software bill of materials) | know what you ship |

```js run node title="Subresource Integrity: compute the integrity hash of a file"
const crypto = require("node:crypto");

const fileContents = "console.log('a third-party library');\n";
const integrity = "sha384-" + crypto.createHash("sha384").update(fileContents).digest("base64");
console.log(`<script src="https://cdn.example/lib.js" integrity="${integrity.slice(0, 30)}..." crossorigin="anonymous"></script>`);

// the browser recomputes the hash of what it downloaded and refuses to run it if it differs
const tampered = fileContents + "stealCookies();";
const matches = "sha384-" + crypto.createHash("sha384").update(tampered).digest("base64") === integrity;
console.log("tampered file accepted:", matches);
```

## Secrets

Secrets: API keys, database URLs, signing keys, tokens, passwords.

- **Never commit them** (not even once: Git history is forever; rotate any leaked secret immediately).
- Load from the **environment** or a **secret manager** (AWS Secrets Manager / SSM, GCP Secret Manager, HashiCorp Vault, Doppler, 1Password/Infisical). Different secrets per environment.
- `.env` files only for **local development** and listed in **`.gitignore`**; provide a `.env.example` without values.
- Add **secret scanning** (`gitleaks`, `trufflehog`, GitHub push protection) and a pre-commit hook.
- **Rotate** regularly and on every suspicion; give each secret the **least privilege** and short lifetime (short-lived tokens, IAM roles instead of static keys).
- **Never log** secrets, tokens, passwords or full request bodies; **redact** them (`pino`'s `redact` option).
- **Frontend code is public.** Anything in a React/Vite bundle (`VITE_*`, `NEXT_PUBLIC_*`) can be read by users: never put a real secret there. Call a backend that holds the secret.

```js run title="Redact secrets before logging"
const SENSITIVE = /^(password|pass|token|secret|authorization|api[-_]?key|cookie|set-cookie|ssn|card)/i;

function redact(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? "[REDACTED]" : redact(v, depth + 1)]));
}

console.log(redact({
  user: "asha", password: "hunter2",
  headers: { authorization: "Bearer abc.def.ghi", "content-type": "application/json" },
  payments: [{ cardNumber: "4111111111111111", last4: "1111" }],
}));
```

## HTTP security headers

Cheap, high-value protections. In Express: **`helmet()`** sets most of them. Always verify with **securityheaders.com** or **Mozilla Observatory**.

| Header | Purpose | Typical value |
|---|---|---|
| **`Content-Security-Policy`** | blocks XSS and unwanted resources | see the XSS lesson |
| **`Strict-Transport-Security`** (HSTS) | browsers must use **HTTPS** only | `max-age=63072000; includeSubDomains; preload` |
| **`X-Content-Type-Options`** | stop MIME sniffing (a `.txt` run as script) | `nosniff` |
| **`Referrer-Policy`** | limit what URL is sent in the `Referer` header | `strict-origin-when-cross-origin` |
| **`Permissions-Policy`** | disable powerful features (camera, geolocation) | `camera=(), microphone=(), geolocation=()` |
| **`Cross-Origin-Opener-Policy`** | isolate your window from cross-origin popups | `same-origin` |
| **`Cross-Origin-Embedder-Policy`** / **`Cross-Origin-Resource-Policy`** | cross-origin isolation / who can load your resources | `require-corp` / `same-site` |
| **`frame-ancestors`** (CSP) or `X-Frame-Options` | clickjacking | `'none'` / `DENY` |
| `Cache-Control: no-store` on sensitive responses | no caching of personal data | |
| Remove **`X-Powered-By`** | do not advertise the stack | `app.disable("x-powered-by")` |

Cookies: `HttpOnly`, `Secure`, `SameSite`, `__Host-` prefix. Always **redirect HTTP to HTTPS** and use **TLS 1.2+**.

```js run title="A tiny header auditor (what securityheaders.com does)"
const CHECKS = [
  ["content-security-policy", (v) => !/unsafe-inline|unsafe-eval|\*/.test(v.replace(/img-src[^;]*/g, "")), "needs a strict policy"],
  ["strict-transport-security", (v) => /max-age=(\d+)/.test(v) && Number(v.match(/max-age=(\d+)/)[1]) >= 15552000, "max-age should be at least 180 days"],
  ["x-content-type-options", (v) => v.toLowerCase() === "nosniff", "should be nosniff"],
  ["referrer-policy", (v) => !/unsafe-url|no-referrer-when-downgrade/.test(v), "too much referrer data"],
  ["x-frame-options", (v) => /deny|sameorigin/i.test(v), "or use CSP frame-ancestors"],
];

function audit(headers) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const report = CHECKS.map(([name, ok, hint]) => (name in lower ? (ok(lower[name]) ? `✓ ${name}` : `! ${name}: ${hint}`) : `✗ ${name}: missing`));
  if ("x-powered-by" in lower) report.push(`! x-powered-by: reveals "${lower["x-powered-by"]}"`);
  return report;
}

console.log(audit({
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Powered-By": "Express",
}).join("\n"));
```

## Rate limiting and brute-force protection

Limit how often a client can call expensive or sensitive endpoints (login, password reset, OTP, search, signup, API keys). It protects against **brute force**, **credential stuffing**, **scraping**, **DoS** and runaway clients.

Algorithms:

| Algorithm | Idea | Good for |
|---|---|---|
| **Fixed window** | max N per calendar window | simple, but allows 2N bursts at a window edge |
| **Sliding window** | N in the last T seconds, exact | accurate, more memory |
| **Token bucket** | a bucket refills at a steady rate, a request takes a token; allows **bursts** up to the bucket size | APIs (smooth + bursts) |
| **Leaky bucket** | a queue drains at a constant rate | smoothing traffic |

```js run title="A token bucket rate limiter (with an injectable clock for testing)"
class TokenBucket {
  constructor({ capacity, refillPerSec, now = () => Date.now() }) {
    Object.assign(this, { capacity, refillPerSec, now });
    this.tokens = capacity;
    this.last = now();
  }
  take(cost = 1) {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.refillPerSec);     // refill since last time
    this.last = t;
    if (this.tokens >= cost) { this.tokens -= cost; return { allowed: true, remaining: Math.floor(this.tokens) }; }
    return { allowed: false, retryAfterSec: Math.ceil((cost - this.tokens) / this.refillPerSec) };
  }
}

let clock = 0;
const bucket = new TokenBucket({ capacity: 3, refillPerSec: 1, now: () => clock });          // 3 burst, 1 per second sustained
const results = [];
for (const at of [0, 0, 0, 0, 500, 1000, 1000, 5000]) {
  clock = at;
  const r = bucket.take();
  results.push(`${at}ms:${r.allowed ? "ok(" + r.remaining + ")" : "429 retry " + r.retryAfterSec + "s"}`);
}
console.log(results.join("  "));
```

In production:

- Key by **user id, API key, IP** (careful behind proxies: use `X-Forwarded-For` from a **trusted** proxy only: `app.set("trust proxy", 1)`).
- Store counters in **Redis** (shared by all instances); libraries: `express-rate-limit` + `rate-limit-redis`, `rate-limiter-flexible`, API gateway or CDN/WAF rules (Cloudflare, AWS WAF).
- Return **`429 Too Many Requests`** with **`Retry-After`** (and `RateLimit-*` headers).
- **Stricter limits** on login, password reset and OTP endpoints; add **progressive delays**, **CAPTCHA**, account lockout with care (lockouts can be abused), and **MFA**.
- Use **timeouts**, **request size limits** and **concurrency limits** too (slowloris-type attacks).

## OWASP Top 10 mapped to a JavaScript stack

| OWASP category | In a Node/React app |
|---|---|
| **Broken access control** | missing ownership checks (`/orders/:id`), trusting client-sent roles, exposed admin routes: check authz on **every** request on the server |
| **Cryptographic failures** | plain-text secrets, weak hashes, HTTP, JWT secrets: TLS everywhere, argon2/bcrypt, key management |
| **Injection** | SQL/NoSQL/command/XSS: the previous lessons |
| **Insecure design** | no rate limits, no threat model: design review, abuse cases |
| **Security misconfiguration** | debug mode, default creds, verbose errors, open CORS, missing headers: hardening, `helmet`, config review |
| **Vulnerable and outdated components** | old npm packages: audit, Renovate |
| **Identification and authentication failures** | weak passwords, no MFA, session fixation, JWT mistakes |
| **Software and data integrity failures** | unsigned updates, CI/CD compromise, insecure deserialisation: lockfiles, SRI, provenance |
| **Security logging and monitoring failures** | no audit trail or alerts: structured logs, alerts on auth failures |
| **SSRF** | server fetching user URLs: validate and restrict outbound calls |

:::interview How do you secure a Node.js/React application end to end? How do you handle third-party dependencies?
"I think in layers. At the edge: HTTPS with HSTS, security headers via helmet, a strict CSP with nonces, rate limiting and request size limits. Authentication with HttpOnly SameSite cookies or short-lived tokens, MFA, argon2 password hashing, and server-side authorisation on every request. Input handled by schema validation at the boundary, parameterised queries, no shell strings, and safe file and URL handling. In React I avoid dangerouslySetInnerHTML and sanitise with DOMPurify. For dependencies I commit the lockfile and use `npm ci`, run `npm audit` and automated updates, avoid unnecessary packages, ignore install scripts where possible, use scoped private packages to prevent dependency confusion and SRI for CDN scripts. Secrets live in a secret manager, never in the repo or the frontend bundle, and are redacted in logs. Finally I add structured logging, monitoring and alerts, and follow the OWASP Top 10 in code reviews."
:::

## More interview questions on this topic

:::qa What is dependency confusion? {level=hard}
**Say this:** "An attacker publishes a public package with the same name as an internal private one, with a higher version number, and a misconfigured build installs the public one. Prevent it with scoped names, registry scoping and lockfiles."

**In simple words:** They put a fake copy of your internal tool on the public shelf, and your build picks it up.
:::

:::qa Why `npm ci` instead of `npm install` in CI? {level=easy}
**Say this:** "`npm ci` installs exactly the versions in the lockfile, fails if `package.json` and the lockfile disagree, and starts from a clean `node_modules`, so builds are reproducible and safer."

**In simple words:** The same ingredients every time.
:::

:::qa What does HSTS do? {level=medium}
**Say this:** "It tells browsers to only use HTTPS for the domain for a period (`max-age`), so users cannot be downgraded to HTTP by a man-in-the-middle. With `preload` the domain is hard-coded into browsers."

**In simple words:** "Always knock on the secure door."
:::

:::qa How does a token bucket differ from a fixed window limiter? {level=medium}
**Say this:** "A fixed window resets a counter every interval, so a client can send double the limit across a boundary. A token bucket refills continuously and allows short bursts up to its capacity while enforcing an average rate."

**In simple words:** The bucket gives smooth fairness; the window has a cliff at the edge.
:::

```quiz
? Which command gives reproducible CI installs?
- npm install
+ npm ci
- npm update
> It installs exactly what the lockfile says.
? Which header stops MIME-type sniffing?
- Referrer-Policy
+ X-Content-Type-Options: nosniff
- Cache-Control
> The browser must trust the declared type.
? Where must real secrets never be placed?
- Environment variables on the server
+ The frontend bundle (VITE_*, NEXT_PUBLIC_*)
- A secret manager
> Client code is public.
```

:::keypoints
- **Supply chain**: lockfile + `npm ci`, `npm audit`, Renovate/Dependabot, few dependencies, `--ignore-scripts`, scoped private packages (dependency confusion), SRI, provenance.
- **Secrets**: secret manager/env, never in git or the frontend bundle; scan, rotate, redact in logs.
- **Headers**: CSP, **HSTS**, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, `frame-ancestors`; use **helmet**; hide `X-Powered-By`.
- **Rate limiting**: token bucket/sliding window in Redis, per user/IP/API key; `429` + `Retry-After`; stricter on login/OTP; add MFA.
- Map reviews to the **OWASP Top 10**: broken access control first.
:::
