---
title: Implement JSON.stringify and JSON.parse
level: hard
time: 45
summary: Write a spec-faithful JSON.stringify (toJSON, undefined, NaN, cycles, indent) and a recursive-descent JSON.parse with good error positions. A favourite way to test recursion and your knowledge of JSON edge cases.
---

:::problem Implement JSON.stringify and JSON.parse {level=medium tags="recursion,parsing,json,edge cases"}
**Part 1.** `stringify(value, replacer?, space?)` must match `JSON.stringify`:

- `undefined`, functions and symbols: **omitted** in objects, **`null`** in arrays, and the whole result is `undefined` at the top.
- `NaN`, `Infinity`, `-Infinity` → `null`.
- Calls `toJSON(key)` when present (so `Date` works).
- Wrapper objects (`new Number(1)`) unwrap; `BigInt` throws a `TypeError`.
- **Circular** structures throw a `TypeError`.
- `replacer` can be a function or an array of keys; `space` a number (max 10) or a string.
- Strings escape quotes, backslashes, control characters and lone surrogates.

**Part 2.** `parse(text, reviver?)` — a **recursive descent parser**. Reject invalid JSON with a `SyntaxError` that mentions the position (trailing commas, single quotes, leading zeros, unquoted keys, comments, `NaN`).

:::hint Hint
Stringify: one recursive function `serialize(holder, key, value)` that follows the spec order: `toJSON` → replacer → unwrap → type switch. Parse: one function per grammar rule: `value`, `object`, `array`, `string`, `number`, with an index `i` into the text.
:::
:::

## Solution and tests

```js run title="stringify and parse, with tests against the real JSON"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

// ===================== stringify =====================
const ESC = { '"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t" };
function quote(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], code = s.charCodeAt(i);
    if (ESC[ch]) out += ESC[ch];
    else if (code < 0x20) out += "\\u" + code.toString(16).padStart(4, "0");              // other control characters
    else if (code >= 0xd800 && code <= 0xdbff) {                                           // high surrogate: needs a low one after it
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { out += ch + s[i + 1]; i++; }
      else out += "\\u" + code.toString(16);                                               // lone surrogate: escape it (well-formed JSON)
    } else if (code >= 0xdc00 && code <= 0xdfff) out += "\\u" + code.toString(16);        // lone low surrogate
    else out += ch;
  }
  return out + '"';
}

function stringify(value, replacer, space) {
  const fn = typeof replacer === "function" ? replacer : null;
  const allow = Array.isArray(replacer) ? new Set(replacer.map(String)) : null;
  const gap = typeof space === "number" ? " ".repeat(Math.min(10, Math.max(0, Math.floor(space)))) : typeof space === "string" ? space.slice(0, 10) : "";
  const stack = [];

  function serialize(holder, key, value, indent) {
    if (value !== null && (typeof value === "object" || typeof value === "bigint") && typeof value.toJSON === "function") value = value.toJSON(key);
    if (fn) value = fn.call(holder, key, value);
    if (value instanceof Number) value = Number(value);                                    // unwrap Number/String/Boolean objects
    else if (value instanceof String) value = String(value);
    else if (value instanceof Boolean) value = value.valueOf();

    if (value === null) return "null";
    switch (typeof value) {
      case "boolean": return String(value);
      case "string": return quote(value);
      case "number": return Number.isFinite(value) ? String(value) : "null";
      case "bigint": throw new TypeError("Do not know how to serialize a BigInt");
      case "undefined": case "function": case "symbol": return undefined;                  // the caller decides: skip, or null
    }
    if (stack.includes(value)) throw new TypeError("Converting circular structure to JSON");
    stack.push(value);
    const inner = indent + gap;
    let result;
    if (Array.isArray(value)) {
      const items = Array.from(value, (v, i) => serialize(value, String(i), v, inner) ?? "null");   // Array.from visits holes too; holes and undefined become null
      result = items.length === 0 ? "[]" : gap ? `[\n${inner}${items.join(`,\n${inner}`)}\n${indent}]` : `[${items.join(",")}]`;
    } else {
      const keys = (allow ? Object.keys(value).filter((k) => allow.has(k)) : Object.keys(value));
      const items = [];
      for (const k of keys) {
        const s = serialize(value, k, value[k], inner);
        if (s !== undefined) items.push(quote(k) + (gap ? ": " : ":") + s);
      }
      result = items.length === 0 ? "{}" : gap ? `{\n${inner}${items.join(`,\n${inner}`)}\n${indent}}` : `{${items.join(",")}}`;
    }
    stack.pop();
    return result;
  }
  return serialize({ "": value }, "", value, "");
}

// ===================== parse =====================
function parse(text, reviver) {
  let i = 0;
  const fail = (msg) => { throw new SyntaxError(`${msg} at position ${i}`); };
  const ws = () => { while (i < text.length && " \t\n\r".includes(text[i])) i++; };
  const expect = (ch) => { if (text[i] !== ch) fail(`Expected '${ch}'`); i++; };

  function value() {
    ws();
    const c = text[i];
    if (c === "{") return object();
    if (c === "[") return array();
    if (c === '"') return string();
    if (c === "-" || (c >= "0" && c <= "9")) return number();
    for (const [word, v] of [["true", true], ["false", false], ["null", null]]) {
      if (text.startsWith(word, i)) { i += word.length; return v; }
    }
    return fail(c === undefined ? "Unexpected end of input" : `Unexpected token '${c}'`);
  }

  function object() {
    expect("{"); ws();
    const obj = {};
    if (text[i] === "}") { i++; return obj; }
    for (;;) {
      ws();
      if (text[i] !== '"') fail("Expected a string key");
      const key = string();
      ws(); expect(":");
      const v = value();
      Object.defineProperty(obj, key, { value: v, writable: true, enumerable: true, configurable: true });   // own property even for "__proto__"
      ws();
      if (text[i] === ",") { i++; continue; }
      expect("}");
      return obj;
    }
  }

  function array() {
    expect("["); ws();
    const arr = [];
    if (text[i] === "]") { i++; return arr; }
    for (;;) {
      arr.push(value());
      ws();
      if (text[i] === ",") { i++; continue; }
      expect("]");
      return arr;
    }
  }

  const SIMPLE = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
  function string() {
    expect('"');
    let out = "";
    for (;;) {
      const c = text[i];
      if (c === undefined) fail("Unterminated string");
      if (c === '"') { i++; return out; }
      if (c < " ") fail("Control character in string");
      if (c === "\\") {
        const e = text[i + 1];
        if (e === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("Bad unicode escape");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else if (e in SIMPLE) { out += SIMPLE[e]; i += 2; }
        else fail("Bad escape");
      } else { out += c; i++; }
    }
  }

  const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;       // sticky: matches exactly at index i
  function number() {
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (!m) fail("Bad number");
    i += m[0].length;
    return Number(m[0]);
  }

  const result = value();
  ws();
  if (i < text.length) fail(`Unexpected token '${text[i]}' after the value`);

  if (typeof reviver !== "function") return result;
  function walk(holder, key) {                                         // bottom-up: children first
    const v = holder[key];
    if (v !== null && typeof v === "object") {
      for (const k of Object.keys(v)) {
        const nv = walk(v, k);
        if (nv === undefined) delete v[k]; else v[k] = nv;
      }
    }
    return reviver.call(holder, key, v);
  }
  return walk({ "": result }, "");
}

// ---------------- tests ----------------
const same = (value, ...rest) => assert.equal(stringify(value, ...rest), JSON.stringify(value, ...rest));

test("primitives match the real JSON", () => {
  for (const v of [null, true, false, 0, -0, 1.5, 1e21, "text", "quote\" back\\ \n\t \u0001 é 😀", NaN, Infinity, -Infinity]) same(v);
});

test("undefined, functions and symbols", () => {
  same(undefined); same(() => {}); same(Symbol("s"));
  same({ a: undefined, b: () => {}, c: Symbol("s"), d: 1 });
  same([undefined, () => {}, Symbol("s"), 1]);
});

test("nested data", () => same({ a: [1, { b: [] }, {}], c: { d: null } }));

test("toJSON, Date and wrapper objects", () => {
  same({ when: new Date(86400000) });
  same({ n: new Number(3), s: new String("x"), b: new Boolean(false) });
  same({ custom: { toJSON(key) { return "key was " + key; } } });
});

test("BigInt throws", () => assert.throws(() => stringify({ n: 10n }), TypeError));

test("circular structures throw a TypeError", () => {
  const a = { name: "a" }; a.self = a;
  assert.throws(() => stringify(a), TypeError);
  const shared = { x: 1 };
  same({ one: shared, two: shared });                                  // the same object twice is NOT circular
});

test("space: numbers and strings", () => {
  const v = { a: [1, 2, { b: 3 }], c: {}, d: [] };
  same(v, null, 2); same(v, null, "--"); same(v, null, 20); same(v, null, 0);
});

test("replacer function and array", () => {
  const v = { a: 1, b: "x", c: { a: 2, d: 3 } };
  same(v, (k, val) => (typeof val === "number" ? val * 10 : val));
  same(v, ["a", "c"]);
});

test("lone surrogates are escaped", () => same("bad \ud800 and \udc00 but fine 😀"));

test("sparse arrays and symbol keys", () => { same([1, , 3]); same({ [Symbol("k")]: 1, a: 1 }); });

test("parse valid documents like the real JSON", () => {
  const docs = ['{"a":[1,2,{"b":null}],"c":"x\\ny","d":-1.5e3,"e":true}', "[]", "{}", '"\\u00e9\\ud83d\\ude00"', " [ 1 , 2 ] ", "0", "-0", "1E2", '{"__proto__":{"x":1}}'];
  for (const d of docs) assert.deepEqual(parse(d), JSON.parse(d), d);
});

test("parse: __proto__ stays an own property (no pollution)", () => {
  const o = parse('{"__proto__": {"polluted": true}}');
  assert.equal(Object.getPrototypeOf(o), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test("parse rejects what the real JSON rejects", () => {
  const bad = ["{'a':1}", "[1,]", '{"a":1,}', "{a:1}", "01", "1.", ".5", "+1", "NaN", "undefined", '"tab\there"', "[1 2]", "", "{", '{"a"}', '"\\x"', "// c\n1", "[1] x"];
  for (const b of bad) {
    assert.throws(() => JSON.parse(b), SyntaxError, "native: " + b);
    assert.throws(() => parse(b), SyntaxError, "mine: " + b);
  }
});

test("parse error messages include the position", () => assert.throws(() => parse('{"a": tru}'), /position 6/));

test("reviver turns date strings back into Dates and can drop keys", () => {
  const text = '{"when":"1970-01-02T00:00:00.000Z","secret":1,"n":2}';
  const r = (k, v) => (k === "when" ? new Date(v) : k === "secret" ? undefined : v);
  const mine = parse(text, r), real = JSON.parse(text, r);
  assert.equal(mine.when.getTime(), 86400000);
  assert.deepEqual(mine, real);
});

test("round trip", () => {
  const data = { users: [{ id: 1, tags: ["a", "b"], nested: { ok: true, nothing: null } }], pi: 3.14159, text: 'say "hi"\n' };
  assert.deepEqual(parse(stringify(data)), data);
});
```

## JSON facts that come up

- JSON has **no** `undefined`, `NaN`, `Infinity`, `Date`, `Map`, `Set`, comments or trailing commas.
- `JSON.stringify` order of keys follows `Object.keys`: integer-like keys first, ascending; then strings in insertion order.
- A `Date` becomes a string through `toJSON`; `JSON.parse` does **not** turn it back (use a reviver).
- `JSON.parse` of untrusted text is safe from code execution (unlike `eval`), but a huge or deep input can still cost CPU and memory.
- Numbers beyond 2^53 lose precision; send big ids as **strings**.

:::qa Why does `JSON.stringify(undefined)` return `undefined`, not a string? {level=medium}
**Say this:** "`undefined` has no JSON representation. At the top level the function returns the value `undefined` (not the text 'undefined'). Inside an object the key is skipped, inside an array it becomes `null`."

**In simple words:** JSON cannot say 'nothing'; it can only say `null` or leave it out.
:::

:::qa How does the stringify code detect circular structures, and what is the cost? {level=medium}
**Say this:** "It keeps the stack of objects currently being serialised. If it meets one that is already on the stack, it is a cycle. It checks the **path**, not every object seen, because the same object used twice in different branches is valid. `includes` on the stack is O(depth); a `Set` makes it O(1)."

**In simple words:** Being your own ancestor is a cycle; being a cousin twice is not.
:::

:::qa Why do you need a reviver when parsing dates? {level=easy}
**Say this:** "JSON only has strings and numbers for them. After `stringify`, a Date is just a string; `parse` cannot know it was a Date. A reviver (or a schema library like Zod) converts known fields back."

**In simple words:** JSON forgets the type; you have to tell it again.
:::

:::keypoints
- Stringify order: **`toJSON` → replacer → unwrap wrappers → type switch**; unsupported values are **skipped in objects, `null` in arrays**.
- **Cycles**: check the current ancestor stack. **BigInt** throws. **Lone surrogates** are escaped.
- Parser: **one function per grammar rule**, an index `i`, a **sticky regex** for numbers, `SyntaxError` with **position**.
- Use `defineProperty` for keys so `"__proto__"` stays data; revivers run **bottom-up**.
:::
