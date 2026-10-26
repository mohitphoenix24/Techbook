---
title: Implement a query-string parser and a route matcher
level: medium
time: 35
summary: Parse and build query strings with repeated keys and safe decoding, split a URL with the RFC regex, and write the route matcher behind routers (:params, optional parts, wildcards).
---

:::problem Implement query strings, URL parts and route matching {level=medium tags="strings,regex,url,router"}
**Part 1.** `parseQuery("?a=1&b=2&b=3&tag[]=x&empty&q=hello+world%21")` returns an object:

- repeated keys (and keys ending in `[]`) become **arrays**
- `+` and `%20` mean a space; `%21` decodes to `!`
- a key without `=` has the value `""`
- a **bad percent sequence** (`%E0%A4%A`) must not throw: keep the raw text
- `__proto__` and similar keys must not change any prototype

`stringifyQuery(obj)` is the reverse: arrays become repeated keys, `undefined` is skipped, everything is encoded.

**Part 2.** `parseUrl(url)` splits `https://user:pw@example.com:8080/a/b?x=1#top` into scheme, user info, host, port, path, query and hash.

**Part 3.** `compileRoute("/users/:id/posts/:postId?")` returns a function `match(path)` giving `{ id, postId }` or `null`. Support `:param`, optional `:param?`, a `*` wildcard at the end, an optional trailing slash, and decode `%20`.

:::hint Hint
Query: split on `&`, then on the **first** `=`. Decode with `decodeURIComponent` inside `try/catch`. Route: turn the pattern into a **regular expression** with capture groups, and escape the characters that are special in regex.
:::
:::

## Solution and tests

```js run title="Query string, URL parts and a route matcher, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

// ---------- Part 1: query strings ----------
const decode = (s) => {
  const spaced = s.replace(/\+/g, " ");                      // in query strings, + means a space
  try { return decodeURIComponent(spaced); } catch { return spaced; }          // malformed: keep it as it is
};

function parseQuery(qs) {
  if (qs.startsWith("?")) qs = qs.slice(1);
  const out = Object.create(null);                           // no prototype: a key named "__proto__" is just a key
  for (const pair of qs.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");                            // the FIRST "=": a value may contain more "="
    let key = decode(eq === -1 ? pair : pair.slice(0, eq));
    const value = eq === -1 ? "" : decode(pair.slice(eq + 1));
    const forceArray = key.endsWith("[]");
    if (forceArray) key = key.slice(0, -2);
    if (!(key in out)) out[key] = forceArray ? [value] : value;
    else out[key] = [].concat(out[key], value);              // second occurrence: make it an array
  }
  return out;
}

function stringifyQuery(obj) {
  const enc = encodeURIComponent;
  const parts = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) parts.push(`${enc(key)}=${v === null ? "" : enc(v)}`);
  }
  return parts.join("&");
}

// ---------- Part 2: URL parts (RFC 3986, appendix B) ----------
function parseUrl(url) {
  const m = /^(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(url);
  const [, scheme, authority = "", path, query, hash] = m;
  const at = authority.lastIndexOf("@");
  const userinfo = at === -1 ? "" : authority.slice(0, at);
  const hostport = authority.slice(at + 1);
  const portMatch = /:(\d*)$/.exec(hostport);
  return {
    scheme, user: userinfo.split(":")[0] || undefined, password: userinfo.split(":")[1],
    host: portMatch ? hostport.slice(0, portMatch.index) : hostport,
    port: portMatch && portMatch[1] ? Number(portMatch[1]) : undefined,
    path, query: query ?? "", hash: hash ?? "",
  };
}

// ---------- Part 3: route matching ----------
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compileRoute(pattern) {
  const names = [];
  const regexParts = pattern.split("/").filter(Boolean).map((seg) => {
    if (seg === "*") { names.push("wildcard"); return "/(.*)"; }
    if (seg.startsWith(":")) {
      const optional = seg.endsWith("?");
      names.push(optional ? seg.slice(1, -1) : seg.slice(1));
      return optional ? "(?:/([^/]+))?" : "/([^/]+)";
    }
    return "/" + escapeRe(seg);                              // literal text: escape regex characters like "."
  });
  const re = new RegExp("^" + regexParts.join("") + "/?$");
  return function match(path) {
    const m = re.exec(path.split(/[?#]/)[0]);
    if (!m) return null;
    const params = {};
    names.forEach((n, i) => { if (m[i + 1] !== undefined) params[n] = decode(m[i + 1].replace(/\+/g, "%2B")); });
    return params;
  };
}

// ---------------- tests ----------------
const plain = (o) => ({ ...o });                             // the parser returns a null-prototype object

test("basic parsing, decoding and flags", () => {
  assert.deepEqual(plain(parseQuery("?a=1&b=2&empty&q=hello+world%21")), { a: "1", b: "2", empty: "", q: "hello world!" });
});
test("repeated keys and [] make arrays", () => {
  assert.deepEqual(plain(parseQuery("b=2&b=3&b=4&tag[]=x&one[]=only")), { b: ["2", "3", "4"], tag: ["x"], one: ["only"] });
});
test("a value may contain =", () => assert.deepEqual(plain(parseQuery("token=abc==&x=1")), { token: "abc==", x: "1" }));
test("bad percent-encoding does not throw", () => assert.equal(parseQuery("a=%E0%A4%A").a, "%E0%A4%A"));
test("empty input and stray ampersands", () => {
  assert.deepEqual(plain(parseQuery("")), {});
  assert.deepEqual(plain(parseQuery("?&&a=1&&")), { a: "1" });
});
test("__proto__ is only data", () => {
  const q = parseQuery("__proto__=x&constructor=y&__proto__=z");
  assert.equal({}.x, undefined);
  assert.equal(Object.getPrototypeOf(q), null);
  assert.deepEqual(q.__proto__, ["x", "z"]);
});
test("agrees with URLSearchParams on simple input", () => {
  const text = "a=1&b=two+words&c=%C3%A9";
  assert.deepEqual(plain(parseQuery(text)), Object.fromEntries(new URLSearchParams(text)));
});

test("stringify encodes, expands arrays, skips undefined", () => {
  assert.equal(stringifyQuery({ q: "a b&c", tags: ["x", "y"], skip: undefined, n: 5, nothing: null }), "q=a%20b%26c&tags=x&tags=y&n=5&nothing=");
});
test("round trip", () => {
  const data = { name: "Asha Rao", tags: ["a", "b"], note: "50% off & more" };
  assert.deepEqual(plain(parseQuery(stringifyQuery(data))), data);
});

test("parseUrl", () => {
  const u = parseUrl("https://user:pw@example.com:8080/a/b?x=1&y=2#top");
  assert.deepEqual(u, { scheme: "https", user: "user", password: "pw", host: "example.com", port: 8080, path: "/a/b", query: "x=1&y=2", hash: "top" });
  const real = new URL("https://user:pw@example.com:8080/a/b?x=1&y=2#top");
  assert.equal(u.host, real.hostname);
  assert.equal(String(u.port), real.port);
});
test("parseUrl: relative and minimal URLs", () => {
  assert.deepEqual([parseUrl("/path?q=1").path, parseUrl("/path?q=1").query], ["/path", "q=1"]);
  assert.equal(parseUrl("mailto:a@b.com").scheme, "mailto");
  assert.equal(parseUrl("http://example.com").path, "");
});

test("route: params", () => {
  const match = compileRoute("/users/:id/posts/:postId");
  assert.deepEqual(match("/users/42/posts/7"), { id: "42", postId: "7" });
  assert.equal(match("/users/42/posts"), null);
  assert.equal(match("/users/42/posts/7/extra"), null);
});
test("route: trailing slash, query and hash are ignored", () => {
  const match = compileRoute("/users/:id");
  assert.deepEqual(match("/users/9/"), { id: "9" });
  assert.deepEqual(match("/users/9?tab=1#x"), { id: "9" });
});
test("route: optional params", () => {
  const match = compileRoute("/blog/:slug?");
  assert.deepEqual(match("/blog"), {});
  assert.deepEqual(match("/blog/hello"), { slug: "hello" });
});
test("route: wildcard", () => assert.deepEqual(compileRoute("/files/*")("/files/a/b/c.txt"), { wildcard: "a/b/c.txt" }));
test("route: literal dots are not wildcards", () => {
  const match = compileRoute("/v1.0/status");
  assert.notEqual(match("/v1.0/status"), null);
  assert.equal(match("/v1X0/status"), null);
});
test("route: decoding and the root route", () => {
  assert.deepEqual(compileRoute("/tags/:name")("/tags/hello%20world"), { name: "hello world" });
  assert.deepEqual(compileRoute("/")("/"), {});
  assert.equal(compileRoute("/")("/x"), null);
});
```

## Notes for the interview

- **Two encodings**: `encodeURIComponent` for a *part* (a value, a path segment), `encodeURI` for a whole URL. In query strings, `+` is a space (form encoding); in paths it is a plus sign.
- Prefer the built-ins in real code: `new URL(...)` and `URLSearchParams`. Writing it yourself shows that you know the edge cases.
- **Routers** try routes in order: put specific routes (`/users/new`) before parameterised ones (`/users/:id`).
- Real routers (path-to-regexp, Express) also handle regex constraints (`:id(\\d+)`), repeated params and named wildcards.

:::qa What is the difference between `encodeURI` and `encodeURIComponent`? {level=easy}
**Say this:** "`encodeURI` keeps characters that have meaning in a URL (`/ ? # & =`), so it is for whole URLs. `encodeURIComponent` encodes them too, so it is for one piece, like a query value. Using `encodeURI` on a value lets `&` or `#` break the structure."

**In simple words:** Encode the pieces, not the glue.
:::

:::qa How could a query parser lead to prototype pollution? {level=hard}
**Say this:** "Older parsers (like early `qs` versions) supported nested keys such as `a[b]=1`. A key like `__proto__[admin]=1` then walked into the prototype of the result object. Use null-prototype objects or `Map`, skip dangerous keys, and limit depth and key counts."

**In simple words:** A query key can try to reach the shared prototype.
:::

:::qa Why escape the literal parts when building the route regex? {level=medium}
**Say this:** "A route like `/v1.0/status` contains a dot, which in a regex matches any character. Without escaping, `/v1X0/status` would match. Characters like `(`, `+` or `?` could even break the regex or cause catastrophic backtracking."

**In simple words:** Text from the route must stay plain text.
:::

:::keypoints
- Query parsing: split on `&`, then the **first `=`**; `+` → space; **safe decode**; repeated keys → **arrays**; **null-prototype** result.
- Encode **parts** with `encodeURIComponent`, not whole URLs.
- URL parts: the RFC 3986 regex; in real code use `URL` and `URLSearchParams`.
- Routes → **regex with capture groups**; **escape literals**; optional params, wildcard, optional trailing slash.
:::
