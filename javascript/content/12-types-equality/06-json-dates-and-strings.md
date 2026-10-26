---
title: JSON, Date and string pitfalls
level: intermediate
time: 30
summary: JSON.stringify and parse in detail (toJSON, replacer, reviver, what disappears), the Date object traps (months, time zones, parsing), and Unicode string facts (length, emoji, normalisation, comparison).
---

## JSON

JSON is a text format. `JSON.stringify` turns a value into text; `JSON.parse` turns text into a value.

```js run title="stringify basics"
const user = { name: "Asha", age: 25, tags: ["a", "b"], address: { city: "Pune" } };

console.log(JSON.stringify(user));
console.log(JSON.stringify(user, null, 2));                    // pretty print with 2 spaces
console.log(JSON.stringify(user, ["name", "age"]));            // an array: only these keys (a whitelist)
console.log(JSON.stringify(user, (key, value) => (key === "age" ? undefined : value)));   // a function: filter or transform
console.log(JSON.parse('{"x":1,"y":[true,null]}'));
```

### What `stringify` does with special values

```js run title="Values that change or vanish"
console.log(JSON.stringify({
  undef: undefined,                    // dropped
  fn() {},                             // dropped
  sym: Symbol("s"),                    // dropped
  nan: NaN, inf: Infinity,             // null
  date: new Date(Date.UTC(2024, 0, 15)),   // ISO string (calls toJSON)
  nested: { u: undefined },
  arr: [undefined, () => {}, Symbol("s"), NaN],    // inside arrays: null
  [Symbol("k")]: 1,                    // symbol KEYS are dropped
  nul: null, neg0: -0, str: "quote\"d\nline",
}));
console.log(JSON.stringify(undefined), JSON.stringify(() => {}), JSON.stringify("text"), JSON.stringify(null));
try { JSON.stringify({ n: 1n }); } catch (e) { console.log(e.name + ": " + e.message); }
const cyc = {}; cyc.self = cyc;
try { JSON.stringify(cyc); } catch (e) { console.log(e.name + ": " + e.message.split("\n")[0]); }
```

### `toJSON`: control how your object is serialised

```js run title="toJSON, replacer and reviver"
class Money {
  constructor(paise, currency) { this.paise = paise; this.currency = currency; this.cache = "internal"; }
  toJSON() { return { amount: this.paise / 100, currency: this.currency }; }    // used by stringify
}
console.log(JSON.stringify({ price: new Money(1999, "INR") }));

// reviver: bring types back on parse
const text = '{"when":"2024-01-15T00:00:00.000Z","n":5}';
const parsed = JSON.parse(text, (key, value) => (key === "when" ? new Date(value) : value));
console.log(parsed.when instanceof Date, parsed.when.getUTCFullYear(), parsed.n);
```

### `JSON.parse` errors

```js run title="Invalid JSON throws a SyntaxError"
const attempts = ["{'a': 1}", '{"a": 1,}', "{a: 1}", "undefined", "", '{"a": 1}'];
for (const text of attempts) {
  try { console.log(JSON.stringify(text).padEnd(14), "->", JSON.parse(text)); }
  catch (e) { console.log(JSON.stringify(text).padEnd(14), "->", e.name); }
}

// safe parse helper
const safeParse = (text, fallback = null) => { try { return JSON.parse(text); } catch { return fallback; } };
console.log(safeParse("not json", { error: true }));
```

JSON needs **double quotes**, no trailing commas, no comments, no `undefined`.

## Dates

`Date` is one of JavaScript's most criticised parts. Know the traps.

```js run title="Trap 1: months are zero-based, days are not"
const d = new Date(2024, 0, 15);                     // January 15th! (month 0 = January)
console.log(d.getMonth(), d.getDate(), d.getDay());   // 0, 15, and day-of-week (0 = Sunday)
console.log(new Date(2024, 1, 30).getMonth());        // February 30th overflows into March (2)
```

```js run title="Trap 2: time zones. Parsing and printing use different rules"
const iso = new Date("2024-01-15");                   // date-only ISO: parsed as UTC
const local = new Date("2024-01-15T00:00:00");        // no zone: parsed as LOCAL time
console.log(iso.toISOString(), local.getTime() === iso.getTime());   // equal only if your zone is UTC

const fixed = new Date(Date.UTC(2024, 0, 15, 10, 30));
console.log(fixed.toISOString());                     // always UTC, always the same text
console.log(fixed.getUTCHours(), fixed.getTime());    // milliseconds since 1970-01-01 UTC
console.log(fixed.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }));
console.log(fixed.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }));
```

```js run title="Trap 3: invalid dates, comparisons and arithmetic"
const bad = new Date("not a date");
console.log(String(bad), bad.getTime(), isNaN(bad));

const a = new Date(Date.UTC(2024, 0, 1)), b = new Date(Date.UTC(2024, 0, 1));
console.log(a === b, a.getTime() === b.getTime(), +a === +b);       // compare with getTime(), never ===

const days = (to, from) => Math.round((to - from) / 86_400_000);
console.log(days(new Date(Date.UTC(2024, 11, 25)), new Date(Date.UTC(2024, 0, 1))), "days");

const addDays = (date, n) => { const c = new Date(date); c.setUTCDate(c.getUTCDate() + n); return c; };    // Dates are MUTABLE: copy first
console.log(addDays(new Date(Date.UTC(2024, 0, 31)), 1).toISOString().slice(0, 10));
```

Best practices:

- Store and transmit time as **UTC** (ISO string with `Z`, or a timestamp in ms).
- Convert to local time only for **display**, with `Intl.DateTimeFormat` or `toLocaleString` and an explicit `timeZone`.
- `Date` objects are **mutable**: copy before changing.
- For calendars, time zones and arithmetic, use a library (`date-fns`, `Luxon`, `Day.js`) or the upcoming **`Temporal`** API.

## Strings and Unicode

JavaScript strings are sequences of **UTF-16 code units**. Many characters (emoji, some scripts) take **two** units.

```js run title="length counts code units, not characters"
const s = "a😀";
console.log(s.length, [...s].length, Array.from(s).length);           // 3 vs 2
console.log(s.charAt(1) === "\ud83d", s.codePointAt(1), s.at(-1).length);   // charAt returns half of the emoji (a lone surrogate)!
console.log("👨‍👩‍👧".length, [..."👨‍👩‍👧"].length);                         // a family emoji is 5 code points joined

// grapheme-aware counting
const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
console.log([...seg.segment("👨‍👩‍👧 e\u0301")].length);                  // 3 visible characters
```

```js run title="Normalisation and comparison"
const a = "é";                    // one code point
const b = "e\u0301";              // 'e' + combining accent
console.log(a === b, a.length, b.length, a === b.normalize("NFC"));

const names = ["Zoya", "ångström", "apple", "Éclair", "banana"];
console.log([...names].sort());                                         // by code unit: accents and capitals sort oddly
console.log([...names].sort((x, y) => x.localeCompare(y, "en")));       // human order
console.log("a".localeCompare("B"), "a" < "B", "ä".localeCompare("z", "de"), "ä".localeCompare("z", "sv"));
```

```js run title="Handy string methods (ES2015 to ES2023)"
const t = "  Hello, World  ";
console.log(t.trim().padStart(15, "*"), "abc".repeat(2), "a-b-c".replaceAll("-", "+"));
console.log("Hello".at(-1), "Hello".includes("ell"), "Hello".startsWith("He"), "Hello".endsWith("lo"));
console.log("a,b,,c".split(","), "abc".split(""), "2024-01-15".split("-").map(Number));
console.log("x".concat(1, 2), `line1
line2`, String.raw`C:\new\table`);
console.log("İ".toLowerCase().length, "ß".toUpperCase(), "straße".localeCompare("strasse", "de", { sensitivity: "base" }));
```

Remember: strings are **immutable**; every method returns a **new** string.

:::interview What can go wrong with JSON.stringify, Date and string length?
"`JSON.stringify` drops undefined, functions and symbols, converts NaN and Infinity to null, turns Dates into ISO strings, and throws for BigInt and circular references; I control the output with `toJSON` or a replacer, and restore types with a reviver. `Date` months are zero-based, date-only ISO strings parse as UTC while date-time strings without a zone parse as local time, objects are mutable and cannot be compared with `===`, so I store UTC timestamps and format at the edge, or use a library or Temporal. String `length` counts UTF-16 code units, so emoji count as 2 and combined characters more; I use the spread or `Intl.Segmenter` to count characters, and `normalize()` and `localeCompare` for comparison."
:::

## More interview questions on this topic

:::qa Why is `new Date("2024-01-15")` sometimes a different day than `new Date(2024, 0, 15)`? {level=hard}
**Say this:** "A date-only ISO string is parsed as UTC midnight, while the constructor with numbers uses local time. In a time zone behind UTC, the first can print as the previous day locally."

**In simple words:** Same date, two different clocks.
:::

:::qa How do you deep clone and compare dates correctly? {level=medium}
**Say this:** "Copy with `new Date(d)` (or `d.getTime()`), and compare with `getTime()` or the unary plus. `===` compares references."

**In simple words:** Dates are objects, so compare their numbers.
:::

:::qa What does `toJSON` do? {level=medium}
**Say this:** "If an object has a `toJSON` method, `JSON.stringify` uses its return value instead of the object itself. `Date` has one that returns the ISO string."

**In simple words:** A hook to say how my object should look in JSON.
:::

:::qa Why is `"😀".length` 2? {level=medium}
**Say this:** "Strings are UTF-16: characters outside the Basic Multilingual Plane are stored as two code units (a surrogate pair). `[...str]` iterates by code point."

**In simple words:** The emoji needs two slots.
:::

```quiz
? What does JSON.stringify({ a: undefined, b: () => {}, c: NaN }) give?
- {"a":null,"b":null,"c":null}
+ {"c":null}
- {}
> undefined and functions are dropped, NaN becomes null.
? What is month 0 in `new Date(2024, 0, 15)`?
- A zero-based index: January
- December of the previous year
- An error
> Months count from 0, days from 1.
? How should you compare two Date objects for equality?
- a === b
+ a.getTime() === b.getTime()
- a == b
> Objects compare by reference.
```

:::keypoints
- **JSON**: drops `undefined`/functions/symbols, `NaN` → `null`, Date → ISO string, BigInt and cycles throw. Use `toJSON`, a replacer and a **reviver**.
- **Date**: months are **0-based**; date-only ISO = UTC, others local; mutable; compare with `getTime()`; store **UTC**.
- **Strings**: UTF-16 code units; `length` counts them; spread or `Intl.Segmenter` for characters; `normalize("NFC")` and `localeCompare` for comparisons.
- Strings are immutable.
:::
