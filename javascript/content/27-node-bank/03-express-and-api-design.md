---
title: "Node bank: Express and API design"
level: medium
time: 30
summary: Fourteen answers on middleware, routing, validation, error handling, authentication, REST design, status codes, pagination, idempotency, rate limiting and testing an API.
---

:::qa What is middleware in Express? {level=easy}
**Say this:** "A function `(req, res, next)` that runs in the request pipeline. It can read or change `req`/`res`, end the response, or call `next()` to pass control on. Order matters: body parsing, logging, auth, routes, then the error handler last."

**In simple words:** A line of checkpoints each request passes, one after another.
:::

:::qa How are errors handled in Express? {level=medium}
**Say this:** "Call `next(err)`; Express skips to the error-handling middleware with four parameters `(err, req, res, next)`. Express 4 does not catch rejected promises from async handlers, so wrap them (`asyncHandler`) or use Express 5, which forwards rejections. The final handler maps error types to status codes and hides internals."

**In simple words:** Pass the problem forward; one handler at the end answers the client.
:::

:::qa How do you validate request input? {level=easy}
**Say this:** "Validate `body`, `query`, `params` and headers at the edge with a schema library (Zod, Joi, Ajv), reject bad input with 400 and clear messages, and use only the parsed, cleaned data afterwards. Validation of types is not the same as authorisation."

**In simple words:** Check every parcel at the gate.
:::

:::qa REST: what do you consider a good design? {level=medium}
**Say this:** "Nouns for resources (`/users/42/orders`), HTTP methods for actions (GET read, POST create, PUT replace, PATCH update, DELETE remove), correct status codes, consistent JSON shapes, pagination, filtering and sorting through query parameters, versioning, and idempotent PUT/DELETE. Document it with OpenAPI."

**In simple words:** Predictable URLs and verbs, so clients can guess how it works.
:::

:::qa Which status codes should you know? {level=easy}
**Say this:** "200 OK, 201 Created, 204 No Content, 301/302/304 redirects and Not Modified, 400 Bad Request, 401 Unauthorized (not authenticated), 403 Forbidden (not allowed), 404 Not Found, 409 Conflict, 422 Unprocessable, 429 Too Many Requests, 500 Internal Server Error, 502/503/504 for gateway and availability problems."

**In simple words:** 2xx worked, 3xx go elsewhere, 4xx you made a mistake, 5xx we made a mistake.
:::

:::qa Which HTTP methods are safe and which are idempotent? {level=medium}
**Say this:** "Safe (no state change): GET, HEAD, OPTIONS. Idempotent (repeating gives the same result): GET, PUT, DELETE, HEAD, OPTIONS. POST is neither; PATCH depends. This matters for retries: you may retry idempotent requests automatically, but not POST without an idempotency key."

**In simple words:** Pressing the lift button twice is harmless; ordering a pizza twice is not.
:::

:::qa How do you make a POST request safe to retry? {level=hard}
**Say this:** "The client sends an `Idempotency-Key` header. The server stores the key with the result of the first request (for a while) and returns the same response for repeats instead of performing the action again."

**In simple words:** A ticket number that stops a payment being charged twice.
:::

:::qa How would you paginate a large list? {level=medium}
**Say this:** "Offset pagination (`?page=3&limit=20`) is simple but slow for deep pages and unstable when rows change. Cursor (keyset) pagination (`?after=<last id>`) is fast and stable and is best for feeds and big tables. Always set a maximum page size and return a `nextCursor`."

**In simple words:** 'Give me the 20 items after this one' beats 'skip 100,000 items'.
:::

:::qa How does authentication differ from authorisation? {level=easy}
**Say this:** "Authentication proves who you are (login, token, session). Authorisation decides what you may do (roles, permissions, ownership checks). A valid token does not mean the user may access every resource: check ownership on every request."

**In simple words:** Showing your ID versus being on the guest list.
:::

:::qa Sessions or JWT? {level=medium}
**Say this:** "Sessions keep state on the server and send only an ID in an HttpOnly cookie: easy to revoke, simple. JWTs are signed tokens the server can verify without a lookup: good across services, but hard to revoke, and they grow with claims. Use short-lived access tokens with refresh-token rotation, store them in HttpOnly, Secure, SameSite cookies, and never in `localStorage` for sensitive apps."

**In simple words:** A locker number versus a signed letter carrying your details.
:::

:::qa How do you protect an Express API? {level=medium}
**Say this:** "`helmet` for security headers, strict CORS, rate limiting, input validation, a body size limit, HTTPS, parameterised queries (no string-built SQL), secrets in the environment, up-to-date dependencies (`npm audit`), least-privilege database users, and logging without secrets."

**In simple words:** Several small locks, not one big one.
:::

:::qa How do you handle file uploads? {level=medium}
**Say this:** "Stream with `multer`, `busboy` or `formidable` rather than buffering in memory. Limit size and count, check the real file type (magic bytes), generate your own file names, store outside the web root or in object storage, and scan if needed. For large files use signed direct-to-storage uploads."

**In simple words:** Accept it in pieces, check what it really is, and put it somewhere safe.
:::

:::qa How do you test an Express app? {level=medium}
**Say this:** "Export the `app` without calling `listen`, and use `supertest` to send requests to it in Jest or Vitest or `node:test`. Unit-test pure logic separately, use test databases or fakes for dependencies, and cover error paths and validation, not just the happy path."

**In simple words:** Call the app like a client would, without a real network.
:::

:::qa How do you structure a Node API project? {level=medium}
**Say this:** "Routes/controllers (HTTP concerns only), services (business logic), repositories (data access), and models/schemas; configuration loaded once; dependencies passed in for testing; shared error classes and middleware. Group by feature (`users/`, `orders/`) as the app grows."

**In simple words:** Keep the web part, the business part and the database part apart.
:::

:::keypoints
- Middleware order matters; the **error handler comes last**; wrap async handlers on Express 4.
- **Validate at the edge**; authenticate then **authorise every resource**.
- Status codes: **2xx/4xx/5xx**; know **safe vs idempotent**; use **idempotency keys** for POST.
- **Cursor pagination** for big data; limit page sizes and body sizes.
- Secure by default: **helmet, CORS, rate limits, HTTPS, parameterised queries**.
:::
