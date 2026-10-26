---
title: Implement a schema validator (mini Zod)
level: hard
time: 45
summary: Build composable schemas with parse and safeParse, collected errors with paths, optional/default/nullable, union, refine and transform, unknown-key stripping. The pattern behind Zod, Yup and Joi, and the answer to "never trust input".
---

:::problem Implement a schema validation library {level=hard tags="validation,composition,api design,security"}
All data that crosses a boundary (HTTP body, query string, `localStorage`, `JSON.parse`, a message from a worker) is **untrusted**. TypeScript types do not exist at runtime, so validate.

Build a tiny library `s`:

```js
const User = s.object({
  name: s.string().min(2),
  email: s.string().email(),
  age: s.number().int().min(0).optional(),
  tags: s.array(s.string()).default([]),
  role: s.enum(["admin", "user"]),
});
User.parse(input);          // returns clean data, or throws ValidationError
User.safeParse(input);      // { success: true, data } | { success: false, error }
```

Requirements:

1. **Collect all errors**, each with a `path` (`["tags", 1]`) and a `message`, not just the first.
2. Types: `string` (min, max, email, regex), `number` (int, min, max, rejects `NaN`), `boolean`, `literal`, `enum`, `array`, `object`, `union`.
3. Modifiers: `optional()`, `nullable()`, `default(value)`, `refine(fn, message)`, `transform(fn)`.
4. Objects **strip unknown keys** by default and can be `strict` (unknown keys are errors).
5. **No coercion**: `"5"` is not a number.
6. The result is a **new** object; the input is not changed.

:::hint Hint
Every schema is a function `run(value, path, issues)` that returns the parsed value or an `INVALID` marker and pushes issues. Combinators (`object`, `array`, `union`) call their children's `run` with an extended `path`. Detect failure by comparing `issues.length` before and after.
:::
:::

## Solution and tests

```js run title="A small schema library, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

const INVALID = Symbol("invalid");
const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" && Number.isNaN(v) ? "nan" : typeof v);

class ValidationError extends Error {
  constructor(issues) {
    super(issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
    this.name = "ValidationError";
    this.issues = issues;
  }
  format() { const out = {}; for (const i of this.issues) (out[i.path.join(".") || "_"] ||= []).push(i.message); return out; }
}

class Schema {
  constructor(run) { this.run = run; }                       // run(value, path, issues) -> parsed value | INVALID

  safeParse(value) {
    const issues = [];
    const data = this.run(value, [], issues);
    return issues.length ? { success: false, error: new ValidationError(issues) } : { success: true, data };
  }
  parse(value) { const r = this.safeParse(value); if (!r.success) throw r.error; return r.data; }

  optional() { return new Schema((v, p, i) => (v === undefined ? undefined : this.run(v, p, i))); }
  nullable() { return new Schema((v, p, i) => (v === null ? null : this.run(v, p, i))); }
  default(d) { return new Schema((v, p, i) => this.run(v === undefined ? (typeof d === "function" ? d() : structuredClone(d)) : v, p, i)); }

  refine(test, message = "Invalid value") {
    return new Schema((v, p, issues) => {
      const before = issues.length;
      const out = this.run(v, p, issues);
      if (issues.length > before) return INVALID;            // the base check already failed: do not run the custom one
      if (!test(out)) { issues.push({ path: p, message }); return INVALID; }
      return out;
    });
  }
  transform(fn) {
    return new Schema((v, p, issues) => {
      const before = issues.length;
      const out = this.run(v, p, issues);
      return issues.length > before ? INVALID : fn(out);
    });
  }
}

// a helper: a primitive type check plus a list of extra rules, all of which are reported
function primitive(type, rules = [], extra = {}) {
  const schema = new Schema((v, p, issues) => {
    if (typeof v !== type || Number.isNaN(v)) { issues.push({ path: p, message: `Expected ${type}, received ${typeOf(v)}` }); return INVALID; }
    let ok = true;
    for (const rule of rules) if (!rule.test(v)) { issues.push({ path: p, message: rule.message }); ok = false; }
    return ok ? v : INVALID;
  });
  const add = (rule) => primitive(type, [...rules, rule], extra);
  if (type === "string") {
    schema.min = (n, m) => add({ test: (v) => v.length >= n, message: m ?? `Must be at least ${n} characters` });
    schema.max = (n, m) => add({ test: (v) => v.length <= n, message: m ?? `Must be at most ${n} characters` });
    schema.regex = (re, m) => add({ test: (v) => re.test(v), message: m ?? "Invalid format" });
    schema.email = (m) => add({ test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), message: m ?? "Invalid email" });
  }
  if (type === "number") {
    schema.int = (m) => add({ test: Number.isInteger, message: m ?? "Must be an integer" });
    schema.min = (n, m) => add({ test: (v) => v >= n, message: m ?? `Must be at least ${n}` });
    schema.max = (n, m) => add({ test: (v) => v <= n, message: m ?? `Must be at most ${n}` });
  }
  return schema;
}

const s = {
  string: () => primitive("string"),
  number: () => primitive("number"),
  boolean: () => primitive("boolean"),

  literal: (value) => new Schema((v, p, i) => (v === value ? v : (i.push({ path: p, message: `Expected ${JSON.stringify(value)}` }), INVALID))),
  enum: (values) => new Schema((v, p, i) => (values.includes(v) ? v : (i.push({ path: p, message: `Expected one of ${values.map((x) => JSON.stringify(x)).join(", ")}` }), INVALID))),

  array(item) {
    return new Schema((v, p, issues) => {
      if (!Array.isArray(v)) { issues.push({ path: p, message: `Expected array, received ${typeOf(v)}` }); return INVALID; }
      const before = issues.length;
      const out = v.map((x, index) => item.run(x, [...p, index], issues));        // every element is checked: all errors are collected
      return issues.length > before ? INVALID : out;
    });
  },

  object(shape, { strict = false } = {}) {
    return new Schema((v, p, issues) => {
      if (v === null || typeof v !== "object" || Array.isArray(v)) { issues.push({ path: p, message: `Expected object, received ${typeOf(v)}` }); return INVALID; }
      const before = issues.length;
      const out = {};
      for (const key of Object.keys(shape)) {
        const value = shape[key].run(Object.hasOwn(v, key) ? v[key] : undefined, [...p, key], issues);   // own properties only
        if (value !== undefined) out[key] = value;                                // do not create keys for missing optional values
      }
      if (strict) for (const key of Object.keys(v)) if (!Object.hasOwn(shape, key)) issues.push({ path: [...p, key], message: "Unrecognized key" });
      return issues.length > before ? INVALID : out;                              // unknown keys are dropped: they never reach the result
    });
  },

  union(options) {
    return new Schema((v, p, issues) => {
      for (const option of options) {
        const attempt = [];
        const out = option.run(v, p, attempt);
        if (attempt.length === 0) return out;                // the first option that accepts it wins
      }
      issues.push({ path: p, message: "Does not match any of the allowed types" });
      return INVALID;
    });
  },
};

// ---------------- tests ----------------
const User = s.object({
  name: s.string().min(2),
  email: s.string().email(),
  age: s.number().int().min(0).optional(),
  tags: s.array(s.string()).default([]),
  role: s.enum(["admin", "user"]),
});

test("valid input is returned clean, with defaults and without unknown keys", () => {
  const input = { name: "Asha", email: "asha@example.com", role: "admin", isAdmin: true, __proto__x: 1 };
  const out = User.parse(input);
  assert.deepEqual(out, { name: "Asha", email: "asha@example.com", tags: [], role: "admin" });
  assert.equal("isAdmin" in out, false);                     // mass assignment is blocked: unknown keys never get through
  assert.notEqual(out, input);
});

test("all problems are reported, each with a path", () => {
  const r = User.safeParse({ name: "A", email: "nope", age: 1.5, tags: ["ok", 7], role: "root" });
  assert.equal(r.success, false);
  const paths = r.error.issues.map((i) => i.path.join("."));
  assert.deepEqual(paths.sort(), ["age", "email", "name", "role", "tags.1"]);
  assert.deepEqual(r.error.format().name, ["Must be at least 2 characters"]);
});

test("parse throws a ValidationError, safeParse does not", () => {
  assert.throws(() => User.parse({}), (e) => e instanceof ValidationError && e.issues.length >= 3);
  assert.doesNotThrow(() => User.safeParse(42));
  assert.equal(User.safeParse(42).error.issues[0].message, "Expected object, received number");
});

test("no coercion: strings are not numbers, NaN is not a number", () => {
  assert.equal(s.number().safeParse("5").success, false);
  assert.equal(s.number().safeParse(NaN).error.issues[0].message, "Expected number, received nan");
  assert.equal(s.string().safeParse(null).error.issues[0].message, "Expected string, received null");
  assert.equal(s.boolean().safeParse(1).success, false);
});

test("several rules on one value are all reported", () => {
  const r = s.string().min(5).regex(/^\d+$/, "Digits only").safeParse("ab");
  assert.deepEqual(r.error.issues.map((i) => i.message), ["Must be at least 5 characters", "Digits only"]);
});

test("optional, nullable and default", () => {
  assert.equal(s.string().optional().parse(undefined), undefined);
  assert.equal(s.string().nullable().parse(null), null);
  assert.equal(s.string().optional().safeParse(null).success, false);
  assert.equal(s.number().default(10).parse(undefined), 10);
  const a = s.array(s.number()).default([]);
  assert.notEqual(a.parse(undefined), a.parse(undefined));   // each default is a fresh copy, not a shared array
});

test("arrays: element errors carry the index", () => {
  const r = s.array(s.number()).safeParse([1, "x", 3, "y"]);
  assert.deepEqual(r.error.issues.map((i) => i.path), [[1], [3]]);
});

test("nested objects: paths are joined", () => {
  const Order = s.object({ customer: s.object({ address: s.object({ zip: s.string().regex(/^\d{6}$/, "Bad PIN code") }) }) });
  const r = Order.safeParse({ customer: { address: { zip: "12" } } });
  assert.equal(r.error.issues[0].path.join("."), "customer.address.zip");
  assert.match(r.error.message, /customer\.address\.zip: Bad PIN code/);
});

test("strict objects reject unknown keys", () => {
  const Strict = s.object({ a: s.number() }, { strict: true });
  assert.equal(Strict.safeParse({ a: 1, b: 2 }).error.issues[0].message, "Unrecognized key");
  assert.equal(Strict.safeParse({ a: 1 }).success, true);
});

test("union picks the first matching option", () => {
  const IdOrName = s.union([s.number().int(), s.string().min(1)]);
  assert.equal(IdOrName.parse(5), 5);
  assert.equal(IdOrName.parse("asha"), "asha");
  assert.equal(IdOrName.safeParse(true).error.issues[0].message, "Does not match any of the allowed types");
});

test("literal and enum", () => {
  assert.equal(s.literal("on").parse("on"), "on");
  assert.equal(s.literal("on").safeParse("off").success, false);
  assert.match(s.enum(["a", "b"]).safeParse("c").error.issues[0].message, /Expected one of "a", "b"/);
});

test("refine runs only after the base checks pass", () => {
  let called = 0;
  const Even = s.number().refine((n) => { called++; return n % 2 === 0; }, "Must be even");
  assert.equal(Even.safeParse("x").success, false);
  assert.equal(called, 0);
  assert.equal(Even.safeParse(3).error.issues[0].message, "Must be even");
  assert.equal(Even.parse(4), 4);
});

test("refine on an object can check fields together", () => {
  const Signup = s.object({ password: s.string().min(8), confirm: s.string() }).refine((v) => v.password === v.confirm, "Passwords do not match");
  assert.equal(Signup.safeParse({ password: "longenough", confirm: "different" }).error.issues[0].message, "Passwords do not match");
  assert.equal(Signup.safeParse({ password: "longenough", confirm: "longenough" }).success, true);
});

test("transform changes the output (parse, don't validate)", () => {
  const DateString = s.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((str) => new Date(str + "T00:00:00Z"));
  assert.equal(DateString.parse("1970-01-02").getTime(), 86400000);
  const Trimmed = s.string().transform((x) => x.trim()).transform((x) => x.toLowerCase());
  assert.equal(Trimmed.parse("  HeLLo "), "hello");
});

test("inherited properties are not read (prototype safety)", () => {
  const Schema1 = s.object({ constructor: s.string().optional() });
  assert.equal(Schema1.safeParse({}).success, true);
});

test("JSON.parse output from the outside world is checked", () => {
  const raw = '{"name":"Ravi","email":"ravi@example.com","role":"user","age":"30"}';   // age is a string: a real-world bug
  const r = User.safeParse(JSON.parse(raw));
  assert.deepEqual(r.error.issues.map((i) => i.path.join(".")), ["age"]);
});
```

## Why this pattern matters

- **Parse, don't validate**: the function returns a *new, cleaned* value of a known shape; the rest of the code can trust it. Unknown fields are dropped, which also blocks **mass assignment** (`isAdmin: true` in a request body).
- **One schema, three uses**: runtime validation, TypeScript types (`z.infer<typeof User>`), and form error messages. In TypeScript the schema is the single source of truth.
- Validate at **every boundary**: request bodies, query strings, environment variables, `localStorage`, `postMessage`, third-party API responses.
- Validation is **not** sanitisation or authorisation. A valid email can still be someone else's.

## Where this appears

| Library | Notes |
|---|---|
| **Zod** | the API above, with TypeScript inference |
| **Valibot** | the same ideas, tree-shakable functions |
| **Yup**, **Joi** | older; Joi is common in Node back ends |
| **JSON Schema + Ajv** | language-neutral, also used by OpenAPI and Fastify |

:::qa Why return all errors instead of stopping at the first? {level=easy}
**Say this:** "A form needs to show every problem at once; otherwise the user fixes one field, submits, and finds the next error. For an API, the client developer also gets the full picture in one call."

**In simple words:** Tell the user everything that is wrong in one go.
:::

:::qa What is mass assignment and how does schema validation prevent it? {level=medium}
**Say this:** "If the server copies the whole request body into a database model (`User.create(req.body)`), a client can add fields like `role: 'admin'` or `isVerified: true`. Parsing with a schema that lists the allowed fields and drops everything else means only expected data reaches the model."

**In simple words:** Accept only the fields you asked for.
:::

:::qa Why does `refine` skip the custom test when the base type check failed? {level=medium}
**Say this:** "The custom function assumes a valid type. Calling `n % 2` on a string or `.length` on `undefined` would throw a confusing error instead of a clean validation message. The base check runs first and the refinement only sees values of the right type."

**In simple words:** Check the basics before the special rules.
:::

:::keypoints
- A schema is `run(value, path, issues)`; **combinators extend the path** and **collect** issues.
- **Parse, don't validate**: return new clean data; **strip unknown keys**; no coercion.
- `optional`, `nullable`, `default` (fresh copy), `refine` (after base checks), `transform`, `union` (first match).
- Use `Object.hasOwn` to read input keys; validate at **every trust boundary**.
:::
