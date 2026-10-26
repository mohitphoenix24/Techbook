---
title: Sessions vs JWT: authentication done right
level: advanced
time: 40
summary: How cookie sessions and JSON Web Tokens work, how to build and verify a JWT by hand, the real JWT vulnerabilities (alg none, weak secrets, no expiry, storage), access and refresh tokens with rotation, revocation, password hashing and a short note on OAuth 2 and OIDC.
---

## Authentication vs authorisation

- **Authentication (authn):** *who are you?* (login, password, MFA, SSO)
- **Authorisation (authz):** *what are you allowed to do?* (roles, permissions, ownership checks)

Both must be checked **on the server for every request**. Hiding a button in the UI is not security.

## Two ways to remember a logged-in user

| | **Server-side session** (cookie + session store) | **JWT** (self-contained token) |
|---|---|---|
| What the client holds | a random **session id** (opaque) | a **signed token** containing claims |
| Where the state is | on the **server** (memory, Redis, DB) | **in the token** (stateless) |
| Revocation (logout, ban) | **easy**: delete the session | **hard**: valid until it expires (needs a deny-list or short expiry) |
| Scaling | needs a shared store (Redis) | any server can verify with the key |
| Size per request | small id | larger (hundreds of bytes) |
| Typical transport | `HttpOnly` cookie | `Authorization: Bearer ...` header, or a cookie |
| Good for | classic web apps, anything needing instant logout | APIs between services, mobile apps, short-lived access tokens, SSO |

> "**JWTs are not better sessions.**" For a typical web app, a **server-side session in an HttpOnly cookie** is simpler and safer. Use JWTs where statelessness or cross-service trust is actually needed, and keep them **short-lived**.

## What a JWT is

A **JSON Web Token** has three parts, separated by dots, each **Base64URL**-encoded:

```
eyJhbGciOiJIUzI1NiJ9 . eyJzdWIiOiI0MiIsInJvbGUiOiJhZG1pbiIsImV4cCI6MTcwMDAwMDAwMH0 . 5mhBHq...
      HEADER                                  PAYLOAD (claims)                             SIGNATURE
{"alg":"HS256"}        {"sub":"42","role":"admin","exp":1700000000}   HMAC-SHA256(header.payload, secret)
```

- **Header:** the signing algorithm (`alg`) and type.
- **Payload (claims):** `sub` (subject/user id), `iss` (issuer), `aud` (audience), `exp` (expiry), `iat`, `nbf`, plus your own (`role`).
- **Signature:** proves the token was created by someone with the key and **was not changed**.

:::warn A JWT is signed, NOT encrypted
Anyone can **decode and read** the payload (it is only Base64). **Never put secrets or sensitive personal data in it.** (JWE exists for encrypted tokens, but is rarely needed.)
:::

## Build and verify a JWT by hand

```js run node title="HS256 JWT: sign, verify, and what tampering does"
const crypto = require("node:crypto");

const b64url = (input) => Buffer.from(input).toString("base64url");
const fromB64url = (text) => JSON.parse(Buffer.from(text, "base64url").toString());

function sign(payload, secret, { expiresInSec = 900 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSec }));
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verify(token, secret) {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("malformed token");
  const header = fromB64url(h);
  if (header.alg !== "HS256") throw new Error("unexpected algorithm: " + header.alg);       // PIN the algorithm: never trust the header
  const expected = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const given = Buffer.from(s, "base64url");
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) throw new Error("bad signature");
  const claims = fromB64url(p);
  if (claims.exp !== undefined && claims.exp < Date.now() / 1000) throw new Error("token expired");   // ALWAYS check expiry
  return claims;
}

const secret = crypto.randomBytes(32);                                    // a long random secret, from a secret manager in real life
const token = sign({ sub: "42", role: "user" }, secret);
console.log(token.split(".").length, "parts | payload:", fromB64url(token.split(".")[1]).role);
console.log("valid token:", verify(token, secret).sub);

// 1. tampering: an attacker edits the payload to become admin
const [h, , s] = token.split(".");
const forged = `${h}.${b64url(JSON.stringify({ sub: "42", role: "admin", exp: 9999999999 }))}.${s}`;
try { verify(forged, secret); } catch (e) { console.log("tampered payload:", e.message); }

// 2. expiry
try { verify(sign({ sub: "42" }, secret, { expiresInSec: -10 }), secret); } catch (e) { console.log("expired token:", e.message); }

// 3. wrong key
try { verify(token, crypto.randomBytes(32)); } catch (e) { console.log("wrong secret:", e.message); }
```

In real code, use a maintained library (**`jose`**, `jsonwebtoken`, `fast-jwt`). The code above shows what they do.

## The famous JWT vulnerabilities

### 1. Trusting the `alg` header ("alg: none" and algorithm confusion)

The header says which algorithm verified the token. If the server **uses the header to choose the algorithm**:

- **`alg: none`**: an attacker sends `{"alg":"none"}` with **no signature**, and a naive library accepts it.
- **RS256 → HS256 confusion**: the server expects an RSA signature with a **public** key; the attacker signs with **HS256 using the public key as the HMAC secret** (public keys are, well, public), and the naive server verifies "successfully".

```js run node title="A naive verifier that trusts the header: the 'alg none' attack"
const crypto = require("node:crypto");
const b64url = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const decode = (t) => JSON.parse(Buffer.from(t, "base64url").toString());

function naiveVerify(token, secret) {                                       // VULNERABLE
  const [h, p, s] = token.split(".");
  const header = decode(h);
  if (header.alg === "none") return decode(p);                              // "no signature needed" (!!)
  const expected = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  if (expected !== s) throw new Error("bad signature");
  return decode(p);
}

function safeVerify(token, secret) {                                        // FIXED: algorithm pinned on the server
  const [h, p, s] = token.split(".");
  if (decode(h).alg !== "HS256") throw new Error("algorithm not allowed");
  const expected = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  if (expected !== s) throw new Error("bad signature");
  return decode(p);
}

const attackerToken = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub: "1", role: "admin" })}.`;     // no signature at all
const secret = crypto.randomBytes(32);
console.log("naive verifier says:", naiveVerify(attackerToken, secret));
try { safeVerify(attackerToken, secret); } catch (e) { console.log("safe verifier says:", e.message); }
```

**Fix:** the **server decides** the allowed algorithms (`algorithms: ["RS256"]`); never use the token's own header to pick the key or algorithm; use a current library.

### 2. Weak or leaked secrets

HS256 with `secret`, `password`, a dictionary word or a short string can be **brute-forced offline** from any token (tools like `hashcat`, `jwt_tool`). Use **32+ random bytes**, keep them in a **secret manager**, and **rotate** them. For multi-service systems, prefer **asymmetric** signing (RS256/ES256/EdDSA) so only the auth service holds the private key and others verify with the public key (via a **JWKS** endpoint, with `kid` in the header for key rotation).

### 3. No expiry, or a very long one

A token without `exp`, or valid for 30 days, is a **long-lived password**. Make **access tokens short** (5 to 15 minutes).

### 4. Not validating claims

Check **`exp`**, **`nbf`**, **`iss`** (is it from my issuer?), **`aud`** (is it meant for this API?), and `sub`. Reject tokens meant for another service.

### 5. Storing the token where scripts can read it

`localStorage` or `sessionStorage` + **XSS** = stolen token. Prefer an **`HttpOnly; Secure; SameSite` cookie** (and add CSRF protection), or keep the access token in **memory only**.

### 6. Putting too much in the token

Stale permissions (the role in the token stays until it expires), large size, and leaking personal data. Keep claims minimal; look up fine-grained permissions on the server if they change often.

## Access token + refresh token

```viz algo=seq title="Short-lived access token, rotating refresh token"
participant c Client [browser]
participant a Auth server [server]
participant r Resource API [service]
c -> a : POST /login (password / SSO)
a --> c : access token (15 min) + refresh token (HttpOnly cookie, 7 days)
c -> r : GET /orders + access token
r --> c : 200
c -> r : GET /orders + EXPIRED access token
r --> c : 401
c -> a : POST /refresh (refresh cookie)
a --> c : NEW access token + NEW refresh token (the old one is now invalid)
```

- **Access token:** short-lived (minutes), sent to APIs, stateless.
- **Refresh token:** long-lived, stored **securely** (HttpOnly cookie), used **only** with the auth server, **stored server-side** (hashed) so it can be **revoked**.
- **Rotation:** every refresh gives a **new** refresh token and invalidates the old one. If an **old** one is used again, someone stole it: **revoke the whole family** (reuse detection).
- **Logout:** delete the refresh token (server-side) and clear cookies; access tokens expire quickly (or keep a short **deny-list** for emergencies).

```js run node title="Refresh token rotation with reuse detection (in-memory model)"
const crypto = require("node:crypto");

const store = new Map();                       // tokenHash -> { user, familyId, used }
const families = new Set();                    // revoked family ids
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
const newToken = () => crypto.randomBytes(24).toString("base64url");

function issue(user, familyId = crypto.randomUUID()) {
  const token = newToken();
  store.set(hash(token), { user, familyId, used: false });
  return token;
}

function refresh(token) {
  const record = store.get(hash(token));
  if (!record) throw new Error("unknown refresh token");
  if (families.has(record.familyId)) throw new Error("family revoked: login again");
  if (record.used) {                                        // REUSE: an old token came back => it was stolen
    families.add(record.familyId);
    throw new Error("token reuse detected: all tokens of this session revoked");
  }
  record.used = true;
  return issue(record.user, record.familyId);               // rotate: a new token in the same family
}

const t1 = issue("asha");
const t2 = refresh(t1);                                     // legitimate refresh
const t3 = refresh(t2);                                     // and again
try { refresh(t1); } catch (e) { console.log("attacker replays t1:", e.message); }
try { refresh(t3); } catch (e) { console.log("legitimate user's latest token now:", e.message); }
```

## Passwords: store them correctly

- Never store plain text, and never a fast hash (MD5, SHA-1, SHA-256) alone.
- Use a **slow, salted, memory-hard** algorithm: **argon2id** (preferred), **scrypt** or **bcrypt**; unique random **salt** per password; tune the cost.
- Compare in **constant time**; rate-limit logins; lock/slow down after repeated failures; offer **MFA** (TOTP, WebAuthn/passkeys).
- Do not reveal whether an email exists ("invalid email or password").
- Check passwords against **breached lists** (Have I Been Pwned k-anonymity API) and allow long passphrases.

## OAuth 2.0 and OpenID Connect in one minute

- **OAuth 2.0** is a framework for **delegated authorisation**: "let this app access my photos without giving it my password." The app gets an **access token** with limited **scopes**.
- **OpenID Connect (OIDC)** adds **authentication** on top: an **ID token** (a JWT) tells the app **who the user is** ("Sign in with Google").
- Use the **Authorization Code flow with PKCE** for SPAs and mobile apps. The old **implicit flow** is deprecated.
- Do not build your own: use an identity provider (Auth0, Okta, Keycloak, Cognito, Firebase Auth, Clerk) or a library (NextAuth/Auth.js, Passport).

:::interview JWT vs sessions: which would you choose and what are the security pitfalls of JWT?
"For a typical web app I prefer a server-side session with an opaque id in an HttpOnly, Secure, SameSite cookie, because it is simple, can be revoked instantly and nothing sensitive is in the client. I use JWTs for stateless service-to-service or mobile and SSO scenarios, as short-lived access tokens, usually 5 to 15 minutes, with a rotating refresh token stored in an HttpOnly cookie and tracked on the server for revocation and reuse detection. JWT pitfalls: it is signed, not encrypted, so no secrets in the payload; the server must pin the allowed algorithm and never trust the header, to avoid alg none and key confusion; secrets must be long and random, or use asymmetric keys with JWKS rotation; always validate exp, iss and aud; and don't store tokens in localStorage, where XSS can steal them."
:::

## More interview questions on this topic

:::qa Is a JWT encrypted? {level=easy}
**Say this:** "No. It is signed (integrity) but the payload is only Base64URL encoded, so anyone can read it. Do not store secrets in it."

**In simple words:** A sealed envelope that is made of glass: you can see inside, but you cannot change it without breaking the seal.
:::

:::qa How do you log a user out or revoke a JWT? {level=medium}
**Say this:** "Short expiry limits the window; for immediate revocation keep a server-side deny-list of token ids (`jti`) or a per-user token version, revoke the refresh token, and rotate signing keys in emergencies. This is the main cost of stateless tokens."

**In simple words:** A signed token cannot be recalled, so keep it short and keep a block list for emergencies.
:::

:::qa What is the `alg: none` attack? {level=medium}
**Say this:** "A forged token with `alg: none` and no signature that a vulnerable library accepts because it trusts the token's header. Servers must enforce an allow-list of algorithms."

**In simple words:** "I need no lock," says the thief, and a careless guard agrees.
:::

:::qa Why use refresh token rotation? {level=hard}
**Say this:** "A stolen refresh token is valid for a long time. With rotation each token can be used once; if an already-used token reappears, the server knows it was copied and revokes the whole token family."

**In simple words:** One-time keys: a reused key sets off the alarm.
:::

```quiz
? Which part of a JWT can anyone read?
- Only the signature
+ The header and payload (they are just Base64URL)
- Nothing
> A JWT is signed, not encrypted.
? What must a server do about the `alg` in a JWT header?
- Trust it
+ Ignore it and use its own allowed algorithms
- Use none
> Pinning prevents alg-none and confusion attacks.
? Where is the safest place for a session credential in a browser?
- localStorage
+ An HttpOnly, Secure, SameSite cookie
- A global variable
> Scripts cannot read an HttpOnly cookie.
```

:::keypoints
- **Session** (opaque id in an `HttpOnly; Secure; SameSite` cookie, state on the server) is the safe default; **JWT** (signed claims, stateless) for APIs/mobile/SSO, **short-lived**.
- JWT = `header.payload.signature`, **signed not encrypted**. Verify: **pinned algorithm**, signature (constant time), **`exp`, `nbf`, `iss`, `aud`**.
- Pitfalls: **alg none / key confusion**, weak secrets, long expiry, **tokens in localStorage**, secrets in payload, no revocation.
- **Access (minutes) + refresh (days, HttpOnly, server-tracked, rotated, reuse detection)**.
- Passwords: **argon2id/scrypt/bcrypt** + salt, rate limits, MFA. Use **OAuth 2 + PKCE / OIDC** via a proven provider.
:::
