---
title: Security for System Design
level: intermediate
time: 45
summary: The security topics expected in design interviews — authentication vs authorisation, sessions vs JWTs (with signing and verification in code), OAuth 2.0 and OpenID Connect, RBAC/ABAC, encryption in transit and at rest, password storage, secrets management, service-to-service identity (mTLS), and protecting the edge (DDoS, WAF, input validation).
---

Security rarely gets its own interview, but it shows up inside every design: "how do users log in?", "how does the payment service know the request is legitimate?", "where do you keep the API keys?". A few precise sentences at the right moments show maturity. This lesson gives you those sentences and the concepts behind them.

## Authentication vs authorisation

:::def Authentication (AuthN)
Verifying **who** someone is: password, passkey, one-time code, social login, client certificate.
:::

:::def Authorisation (AuthZ)
Deciding **what** an authenticated identity is **allowed** to do: can user 42 read order 77? Can this service call the refunds API?
:::

They're separate steps, often handled by separate components: an identity provider authenticates; every service enforces authorisation for its own resources.

## Sessions vs tokens

After login, the client needs a way to prove its identity on every request. Two designs:

**Server-side sessions**: the server creates a random **session id**, stores `session id → user` in a store (Redis), and sends the id in an `HttpOnly`, `Secure`, `SameSite` cookie. Each request looks the session up.

- ✓ Easy to **revoke** (delete the session: instant logout everywhere), small cookie, nothing sensitive on the client.
- ✗ A lookup on every request (a fast Redis hit), and the store must be shared across servers (stateless app servers again).

**Signed tokens (JWT)**: the server issues a **JSON Web Token** containing claims (`sub: user 42`, `role`, `exp`) and a **signature**. Any service with the verification key can check it **without a lookup**.

:::def JWT (JSON Web Token)
Three base64url parts, `header.payload.signature`. The payload is **readable by anyone** (it's encoded, not encrypted); the signature (HMAC with a shared secret, or RSA/ECDSA with a private key) proves it wasn't modified and was issued by the auth server.
:::

```js run title="Sign and verify a JWT (HS256) with Web Crypto"
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
const dec = (part) => atob(part.replace(/-/g, "+").replace(/_/g, "/"));    // base64url → text
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("server-secret-from-a-vault"),
  { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

async function sign(payload) {
  const data = `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}`;
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}
async function verify(token, now) {
  const [h, p, s] = token.split(".");
  const expected = b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${h}.${p}`)));
  if (expected !== s) return "✕ invalid signature (tampered or forged)";
  const claims = JSON.parse(dec(p));
  if (now >= claims.exp) return "✕ expired";
  return `✓ valid: user ${claims.sub}, role ${claims.role}`;
}

const now = 1_767_225_600;                                   // seconds since epoch (fixed for the demo)
const token = await sign({ sub: "42", role: "customer", exp: now + 900 });   // 15-minute access token
console.log("token:", token.slice(0, 60) + "…");
console.log("payload is readable by anyone:", dec(token.split(".")[1]));
console.log(await verify(token, now + 60));

// An attacker edits the payload to become an admin, keeping the old signature
const [h, , s] = token.split(".");
const forged = `${h}.${enc({ sub: "42", role: "admin", exp: now + 900 })}.${s}`;
console.log(await verify(forged, now + 60));
console.log(await verify(token, now + 901));
```

- ✓ **Stateless verification**: no lookup, any service can verify; great across microservices and regions.
- ✗ **Hard to revoke**: a stolen token is valid until it expires. So access tokens are **short-lived** (5–15 minutes) and paired with a **refresh token** (long-lived, stored server-side, revocable) used to get new access tokens.
- ✗ Never put secrets or sensitive personal data in the payload; keep tokens small.

| | Session cookie | JWT access token |
|---|---|---|
| Verification | lookup in a session store | signature check, no lookup |
| Revocation | instant | wait for expiry (keep it short) or keep a deny list |
| Best for | web apps on one domain | APIs, mobile apps, service-to-service, multiple domains |

A common design uses both: the browser holds a session cookie with the edge/BFF, which exchanges it for short-lived JWTs passed to internal services.

## OAuth 2.0 and OpenID Connect

:::def OAuth 2.0
A standard for **delegated authorisation**: letting an application access resources **on a user's behalf** without seeing the user's password (e.g. "allow this app to read your Google Calendar"). The app receives an **access token** with limited **scopes**.
:::

:::def OpenID Connect (OIDC)
A layer on top of OAuth 2.0 for **authentication**: it adds an **ID token** (a JWT describing who the user is). "Sign in with Google/Apple/Microsoft" is OIDC.
:::

The recommended flow for web and mobile apps is the **Authorization Code flow with PKCE**:

```viz algo=seq title="Sign in with OIDC (authorization code + PKCE)"
participant u User [user]
participant app Your app [mobile]
participant idp Identity provider [shield]
participant api Your API [service]
app -> idp : redirect to /authorize (client_id, scope=openid profile, code_challenge)
u -> idp : logs in, consents | The password goes only to the identity provider.
idp --> app : redirect back with a one-time code
app -> idp : POST /token (code + code_verifier) | PKCE proves the same app started the flow.
idp --> app : ID token (who) + access token (what) + refresh token
app -> api : GET /me  Authorization: Bearer <access token>
api -> api : verify signature with the IdP's public keys (JWKS), check exp, aud, scopes
api --> app : 200 profile
```

In interviews it's usually enough to say: *"Authentication via an OIDC provider (Auth0/Cognito/Keycloak or our own auth service); clients get short-lived JWT access tokens and refresh tokens; services verify tokens with the provider's public keys."*

## Authorisation models

- **RBAC (role-based)**: permissions attach to roles (`admin`, `editor`, `viewer`); users get roles. Simple and common.
- **ABAC (attribute-based)**: rules over attributes (`user.department == doc.department AND time < 18:00`). Flexible, harder to reason about.
- **ReBAC (relationship-based)**: permissions from relationships in a graph ("can view if member of a group that owns the folder"). Google's **Zanzibar** (used for Drive, YouTube…) and open-source descendants (SpiceDB, OpenFGA) work this way.

Whatever the model, **check ownership on every request**: `GET /orders/77` must verify that order 77 belongs to the caller. Forgetting this (an **insecure direct object reference**, or broken object-level authorisation) is the most common API vulnerability in practice.

## Encryption

- **In transit**: TLS everywhere: client to edge, **and between internal services** (often mutual TLS via a service mesh). "It's inside our network" is not a security boundary.
- **At rest**: databases, disks, backups and object storage encrypted (AES-256), with keys in a **KMS** (key management service), usually via **envelope encryption**: data encrypted with a data key, the data key encrypted with a master key that never leaves the KMS/HSM.
- **Application-level / field-level** encryption for especially sensitive fields (national ids, health data), so even database admins and backups only see ciphertext.
- **End-to-end encryption** where the service itself must not read content (WhatsApp, Signal): keys live only on users' devices.

## Passwords

Never store passwords, even encrypted. Store a **slow, salted hash**: **Argon2id**, bcrypt or scrypt. The salt (random per user) defeats precomputed tables; the deliberate slowness (tunable work factor) makes brute force expensive after a database leak. Fast hashes like SHA-256 are wrong here. Better still, reduce password exposure: passkeys (WebAuthn), social login, multi-factor authentication.

## Secrets

API keys, database passwords and signing keys must not live in source code, config files in Git, container images, or logs.

- Store them in a **secrets manager** (HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager), injected at runtime.
- **Rotate** them regularly and automatically; prefer **short-lived, dynamically issued credentials** (Vault database credentials valid for an hour; cloud IAM roles instead of static keys).
- Apply **least privilege**: each service gets only the permissions it needs.

## Service-to-service security

- **Workload identity**: each service has a cryptographic identity (SPIFFE IDs, cloud IAM roles, Kubernetes service accounts), and **mutual TLS** proves both sides of every call.
- **Authorise calls between services** too: the reporting service shouldn't be able to call the refunds API. A mesh or gateway enforces these policies.
- **Zero trust**: no implicit trust based on network location; every request is authenticated and authorised.

## Protecting the edge

- **DDoS protection**: CDN/anycast absorption, network-level scrubbing (Cloudflare, AWS Shield), plus rate limiting (from the rate limiting lesson).
- **WAF (web application firewall)**: blocks common attack patterns (SQL injection probes, known exploits, bad bots).
- **Input validation and output encoding** in every service: parameterised SQL queries (never string concatenation), size limits on uploads and bodies, HTML escaping against XSS, CSRF protection for cookie-based sessions.
- **Abuse controls**: CAPTCHAs or proof-of-work on sign-up and login, credential-stuffing detection, per-account rate limits.

## Compliance and privacy (one line each)

- **PCI-DSS**: never store raw card numbers yourself; use a payment provider's tokenisation so card data never touches your servers.
- **GDPR / data residency**: know where personal data lives, support deletion and export, keep EU users' data in the EU if required.
- **Audit logs**: record who did what and when for sensitive actions, append-only.

:::interview The security paragraph for any design
*"Users authenticate through OIDC; clients hold 15-minute JWT access tokens plus revocable refresh tokens. The gateway validates tokens and rate-limits; each service checks resource ownership. TLS everywhere, mTLS inside via the mesh; data encrypted at rest with KMS-managed keys; passwords hashed with Argon2id; secrets in Vault with rotation. Card data is tokenised by the payment provider."*
:::

```quiz
? A JWT's payload contains `"role": "customer"`. An attacker changes it to `"admin"` and sends it. What stops them?
+ The signature no longer matches the modified header and payload, so verification fails
- The payload is encrypted, so the attacker can't read or edit it
- Nothing; JWTs can't be protected
> JWT payloads are readable but tamper-evident: any change invalidates the signature.

? Why are JWT access tokens usually short-lived (minutes)?
+ They can't easily be revoked, so a short lifetime limits the damage if one is stolen; refresh tokens (revocable) obtain new ones
- They're too large to keep longer
- Signatures expire after 15 minutes
> Stateless verification means no central place to cancel a token, so expiry is the main control.

? How should user passwords be stored?
- Encrypted with AES so they can be recovered
- Hashed with SHA-256
+ Hashed with a slow, salted password hash such as Argon2id or bcrypt
> Slow salted hashes make offline brute-forcing after a leak expensive. Passwords should never be recoverable.

? An API returns any order whose id is in the URL, as long as the caller is logged in. What's the vulnerability?
+ Broken object-level authorisation: it must also check that the order belongs to the caller
- Missing TLS
- Weak password hashing
> Authentication says who you are; each request must still check you may access that specific resource.
```

:::keypoints
- **Authentication** = who you are; **authorisation** = what you may do. Check resource ownership on **every** request.
- **Sessions** (cookie + server store) are easy to revoke; **JWTs** verify without lookups but need short lifetimes + refresh tokens. Payloads are readable, not secret.
- **OAuth 2.0** delegates access; **OIDC** adds login (ID tokens). Use the authorization code flow with PKCE.
- Authorisation models: **RBAC**, **ABAC**, **ReBAC** (Zanzibar).
- Encrypt **in transit** (TLS, mTLS inside) and **at rest** (KMS, envelope encryption); hash passwords with **Argon2id/bcrypt**; keep secrets in a **vault** with rotation and least privilege.
- Protect the edge with CDN/DDoS protection, a WAF, rate limits and input validation; tokenise card data.
:::
