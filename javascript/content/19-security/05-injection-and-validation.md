---
title: Injection attacks and input validation
level: advanced
time: 40
summary: SQL, NoSQL, command and path injection, SSRF and ReDoS, why string building is the root cause, parameterised queries, allow-list validation with schemas, safe file uploads and the rule "validate on the server, escape for the output".
---

## The common root cause

> "**Injection** happens when **untrusted data** is mixed into a **command or query** that an **interpreter** executes, and the data is treated as **code**."

The interpreters: SQL engines, MongoDB queries, the OS shell, file paths, LDAP, XML, template engines, HTTP clients (SSRF), regex engines (ReDoS). The cure is always the same idea: **keep data and code separate** (parameters, no shell), and **validate** inputs with an **allow-list**.

## SQL injection

```js run title="String-built SQL: the classic bypass"
const buildQuery = (email, password) =>
  `SELECT * FROM users WHERE email = '${email}' AND password_hash = '${password}'`;       // VULNERABLE

console.log(buildQuery("asha@mail.com", "x"));
console.log(buildQuery("admin@mail.com' --", "anything"));                               // the -- comments out the password check
console.log(buildQuery("' OR '1'='1", "' OR '1'='1"));                                   // always true: logs in as the first user
console.log(buildQuery("x'; DROP TABLE users; --", "y"));                                // multiple statements (driver dependent)
```

### The fix: parameterised queries (prepared statements)

The query text and the values travel **separately**. The database **never parses the values as SQL**.

```js
// node-postgres
const { rows } = await pool.query("SELECT * FROM users WHERE email = $1 AND id = $2", [email, id]);

// mysql2
const [rows] = await conn.execute("SELECT * FROM users WHERE email = ? AND age > ?", [email, minAge]);

// better-sqlite3
db.prepare("SELECT * FROM users WHERE email = ?").get(email);

// Prisma / Knex / Sequelize / Drizzle: use the query builder; avoid raw strings
await prisma.user.findFirst({ where: { email } });
await prisma.$queryRaw`SELECT * FROM users WHERE email = ${email}`;      // tagged template: parameterised for you
```

```js run title="How placeholders keep data out of the SQL text (a model)"
function toParameterised(sqlTemplate, values) {
  // the database receives the text and the values SEPARATELY; values can never change the structure
  return { text: sqlTemplate, values };
}

const attack = "admin@mail.com' --";
console.log(toParameterised("SELECT * FROM users WHERE email = $1", [attack]));
console.log("the value is compared as one literal string, quote marks and all");
```

Things you **cannot** parameterise: **table and column names, `ORDER BY` direction, `LIMIT` in some drivers**. For those, use an **allow-list**:

```js run title="Allow-list for identifiers that cannot be parameters"
const SORTABLE = new Map([["name", "name"], ["created", "created_at"], ["price", "price"]]);
const DIRECTIONS = new Set(["asc", "desc"]);

function orderBy(column, direction) {
  const col = SORTABLE.get(column);
  if (!col || !DIRECTIONS.has(String(direction).toLowerCase())) throw new Error("invalid sort");
  return `ORDER BY ${col} ${direction.toUpperCase()}`;                           // only values WE wrote can reach the SQL
}

console.log(orderBy("created", "desc"));
try { orderBy("name; DROP TABLE users", "asc"); } catch (e) { console.log("rejected:", e.message); }
```

Also: give the app's database user **least privilege** (no `DROP`, no access to other schemas), and never show raw SQL errors to users.

## NoSQL injection (MongoDB)

JavaScript objects from JSON bodies can contain **operators** (`$gt`, `$ne`, `$regex`, `$where`).

```js run title="Operator injection: the password check becomes always true"
// a tiny stand-in for Mongo's matching, to show the idea
function matches(doc, query) {
  return Object.entries(query).every(([field, cond]) => {
    if (cond && typeof cond === "object") {
      if ("$ne" in cond) return doc[field] !== cond.$ne;
      if ("$gt" in cond) return doc[field] > cond.$gt;
      if ("$regex" in cond) return new RegExp(cond.$regex).test(doc[field]);
    }
    return doc[field] === cond;
  });
}

const users = [{ email: "asha@mail.com", password: "s3cret!" }];

// Express: req.body = JSON.parse(rawBody)
const honest = { email: "asha@mail.com", password: "s3cret!" };
const attack = { email: "asha@mail.com", password: { $ne: "" } };                // sent as JSON: {"password": {"$ne": ""}}

console.log("honest login:", users.some((u) => matches(u, honest)));
console.log("attack login (no password known):", users.some((u) => matches(u, attack)));

// FIX: validate types. A password must be a STRING, never an object
const login = (body) => typeof body.email === "string" && typeof body.password === "string" && users.some((u) => matches(u, body));
console.log("attack after type validation:", login(attack));
```

Defences: **validate types and shapes** (schemas), use `express-mongo-sanitize`/Mongoose strict schemas with proper types, **never pass `req.body` or `req.query` straight into a query**, disable server-side JavaScript (`$where`) in MongoDB, and escape user text before building `$regex`.

## Command injection

```js run node title="exec with user input vs execFile with an argument array"
const { exec, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);

const userInput = "hello; echo INJECTED";                                         // an attacker adds a second command

exec(`echo ${userInput}`, (err, stdout) => {                                      // a shell interprets ; && | $() `
  console.log("exec    :", JSON.stringify(stdout));                                // both commands ran
  run("echo", [userInput]).then(({ stdout }) => console.log("execFile:", JSON.stringify(stdout)));    // one harmless argument
});
```

Rules: avoid shells; use `execFile`/`spawn` with **argument arrays**; validate inputs against an allow-list; and don't pass user text to `eval`, `new Function`, `vm.runInNewContext` (not a security sandbox!) or `require(userPath)`.

## Path traversal

User-controlled file names can escape the intended folder with `../`.

```js run node title="Path traversal and the resolve + startsWith check"
const path = require("node:path");

const BASE = path.resolve("/srv/app/uploads");

function unsafe(name) { return path.join(BASE, name); }
function safe(name) {
  const full = path.resolve(BASE, name);                                         // resolves ../ and absolute names
  if (full !== BASE && !full.startsWith(BASE + path.sep)) throw new Error("path escapes the base folder");
  return full;
}

for (const name of ["report.pdf", "../../etc/passwd", "/etc/passwd", "sub/../../secret.txt"]) {
  const bad = unsafe(name);
  let good;
  try { good = safe(name); } catch (e) { good = "BLOCKED"; }
  console.log(name.padEnd(22), "unsafe ->", bad.padEnd(28), "| safe ->", good);
}
```

Also check **symlinks** (`fs.realpath`), reject null bytes, and prefer **generated ids** over user file names. Serve user files from a separate domain or with `Content-Disposition: attachment` and the right `Content-Type` plus `X-Content-Type-Options: nosniff`.

## SSRF (server-side request forgery)

If your server **fetches a URL the user gives** (webhooks, image proxies, link previews, PDF generators), an attacker can make it call **internal services** (`http://localhost:6379`, `http://169.254.169.254/` cloud metadata with credentials, `http://admin.internal/`).

```js run title="Validating outbound URLs (a first layer, not the whole defence)"
function isPrivateHost(host) {
  return /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.internal$|.*\.local$)/i.test(host);
}

function assertSafeUrl(input) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("scheme not allowed: " + url.protocol);
  if (isPrivateHost(url.hostname)) throw new Error("internal address not allowed");
  return url;
}

for (const u of ["https://example.com/image.png", "http://localhost:6379", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "http://192.168.1.10/admin", "https://svc.internal/"]) {
  try { assertSafeUrl(u); console.log("allowed ", u); } catch (e) { console.log("blocked ", u, "->", e.message); }
}
```

A name check is **not enough**: attackers use **DNS rebinding**, redirects, and alternative IP notations (`2130706433`, `0x7f.1`, IPv6-mapped). Better defences: **resolve the hostname yourself and check the IP**, connect to that IP, **disable redirects** (or re-validate each hop), use an **allow-list of domains**, put outbound requests through an **egress proxy** or network policy, and block the cloud **metadata service** (require IMDSv2).

## ReDoS: regular expressions as an attack

A regex with **nested quantifiers** can take **exponential time** on crafted input, blocking the event loop (one request freezes the whole Node server).

```js run title="A vulnerable pattern vs a safe one" nondet
const vulnerable = /^(a+)+$/;                                // nested quantifier: catastrophic backtracking
const matching = "a".repeat(22);
const evil = "a".repeat(22) + "!";                           // the "!" makes the match fail, after trying every way to split the a's

let t0 = performance.now();
vulnerable.test(matching);
const fast = performance.now() - t0;
t0 = performance.now();
vulnerable.test(evil);                                       // 2^22 (about 4 million) ways: add one more "a" and it takes twice as long
const slow = performance.now() - t0;
console.log("a failing input is far slower than a matching one:", slow > fast * 20);

const safe = /^a+$/;                                         // same intent, no nested quantifier: linear time
t0 = performance.now(); safe.test(evil.repeat(1000)); console.log("safe pattern, long input, fast:", performance.now() - t0 < 50);
```

Defences: avoid nested quantifiers and overlapping alternations, **limit input length** before matching, use linear-time engines (**RE2** via `re2` package), check patterns with `safe-regex`/`recheck`, and set **request timeouts**.

## Input validation: the right way

1. **Validate on the server.** Client-side validation is only for user experience; attackers do not use your form.
2. **Allow-list, do not block-list.** Define exactly what is valid (type, length, range, pattern, enum), reject the rest.
3. **Validate structure and types**, not only content (`typeof`, arrays vs objects, nested keys).
4. **Normalise** before validating (trim, Unicode `normalize("NFC")`), and validate **after** decoding.
5. **Reject unknown fields** (mass assignment / over-posting: `isAdmin: true` in a profile update).
6. **Set limits**: body size, string length, array length, nesting depth, number of fields, upload size.
7. **Validate once at the boundary** with a schema, then pass typed, trusted data inward.

```js run title="A tiny schema validator (the idea behind zod, joi, ajv)"
const t = {
  string: ({ min = 0, max = Infinity, pattern } = {}) => (v) => typeof v === "string" && v.length >= min && v.length <= max && (!pattern || pattern.test(v)),
  int: ({ min = -Infinity, max = Infinity } = {}) => (v) => Number.isInteger(v) && v >= min && v <= max,
  oneOf: (...options) => (v) => options.includes(v),
};

function validate(schema, input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: ["body must be an object"] };
  const errors = [];
  for (const key of Object.keys(input)) if (!Object.hasOwn(schema, key)) errors.push(`unknown field: ${key}`);       // reject unknown fields
  for (const [key, check] of Object.entries(schema)) if (!check(input[key])) errors.push(`invalid ${key}`);
  return errors.length ? { ok: false, errors } : { ok: true, value: Object.fromEntries(Object.keys(schema).map((k) => [k, input[k]])) };
}

const signupSchema = { email: t.string({ max: 254, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ }), age: t.int({ min: 13, max: 120 }), plan: t.oneOf("free", "pro") };

console.log(validate(signupSchema, { email: "asha@mail.com", age: 25, plan: "free" }));
console.log(validate(signupSchema, { email: "nope", age: "25", plan: "enterprise", isAdmin: true }));
console.log(validate(signupSchema, { email: "a@b.co", age: 30, plan: "pro", __proto__x: 1 }));
```

In real projects use **zod**, **joi**, **ajv** (JSON Schema), **valibot**, or framework validators (NestJS `class-validator`, Fastify schemas).

## File uploads

- Limit **size**, count and **type**: check the **magic bytes** (file signature), not only the extension or `Content-Type`.
- Generate **your own file names**; store outside the web root or in object storage (S3) with a private ACL.
- **Scan** for malware if files are shared; re-encode images (strips embedded payloads and metadata).
- Serve with correct `Content-Type`, `Content-Disposition: attachment`, `nosniff`, and from a **separate domain**.
- Beware of **zip bombs**, **XML external entities (XXE)**, and **SVG** uploads (SVG can contain scripts).

:::interview How do you protect a Node.js API against injection attacks and bad input?
"I keep data and code separate. For SQL I use parameterised queries or a query builder and allow-list anything that cannot be a parameter, like column names for sorting, plus a least-privileged database user. For MongoDB I validate that fields are the expected primitive types so operator objects like `{ $ne: '' }` are rejected, and I never pass `req.body` straight into a query. For processes I use `execFile` or `spawn` with argument arrays instead of shell strings. For files I resolve the path and check it stays inside the base directory. For outbound requests I validate scheme and the resolved IP to avoid SSRF. I validate every request at the boundary with a strict schema (zod, joi or ajv) that rejects unknown fields and sets length and size limits, I avoid regexes prone to catastrophic backtracking, and I never trust client-side validation."
:::

## More interview questions on this topic

:::qa Why do parameterised queries prevent SQL injection? {level=easy}
**Say this:** "The SQL text and the values are sent separately; the database parses the text first and treats the values only as data, so input can never change the structure of the query."

**In simple words:** The question and the answer arrive in different envelopes.
:::

:::qa How can JSON bodies cause injection in MongoDB? {level=medium}
**Say this:** "A client can send an object where a string is expected, like `{ \"password\": { \"$ne\": \"\" } }`, which Mongo interprets as an operator. Validate types, sanitise operator keys, and use strict schemas."

**In simple words:** The attacker sends a rule instead of a value.
:::

:::qa What is SSRF and how do you defend against it? {level=hard}
**Say this:** "Server-side request forgery makes your server request URLs the attacker chooses, reaching internal services or cloud metadata. Defences: allow-list destinations, validate scheme and resolved IP (not just the hostname), block private ranges and metadata addresses, disable or re-validate redirects, and use network egress controls."

**In simple words:** The attacker uses your server as a messenger into your private network.
:::

:::qa What is mass assignment and how do you stop it? {level=medium}
**Say this:** "When you copy all fields of a request body into a model, an attacker can set fields they should not, such as `isAdmin` or `price`. Accept only an allow-list of fields via a schema, and set sensitive fields on the server."

**In simple words:** Only take the boxes you put on the form.
:::

```quiz
? What is the best fix for SQL injection?
- Escape quotes by hand
+ Parameterised queries
- A longer password
> Keep data separate from code.
? Which Node function runs a program without a shell?
- exec
+ execFile
- eval
> Arguments are not interpreted.
? What does allow-list validation mean?
- Reject known bad inputs
+ Accept only inputs that match exactly what is expected
- Validate in the browser
> Define what is valid, reject everything else.
```

:::keypoints
- **Injection** = untrusted data interpreted as code. Fix: **separate data from code** and **allow-list** inputs.
- **SQL**: parameterised queries/ORMs; allow-list identifiers; least privilege. **NoSQL**: validate types (no operator objects). **Command**: `execFile`/`spawn` with arrays. **Path**: `resolve` + `startsWith(base)`. **SSRF**: validate scheme + resolved IP, allow-list, egress control. **ReDoS**: no nested quantifiers, length limits, RE2.
- **Validate at the boundary on the server** with a strict **schema** (reject unknown fields, set limits). Never trust client validation.
- Uploads: size/type/magic bytes, own file names, private storage, safe headers.
:::
