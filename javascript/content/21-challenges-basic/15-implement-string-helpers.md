---
title: Implement string helpers
level: easy
time: 25
summary: Palindrome, anagram, first unique character, case converters, truncate and a Unicode-safe reverse. The classic warm-up questions with the edge cases that separate a senior answer from a junior one.
---

:::problem Implement string helpers {level=easy tags="strings,unicode,warm-up"}
Write:

1. `isPalindrome(s)` ignoring case, spaces and punctuation.
2. `isAnagram(a, b)` ignoring case and spaces.
3. `firstUnique(s)` returns the index of the first character that appears once, or `-1`.
4. `camelCase`, `snakeCase`, `kebabCase` from any of `"hello world"`, `"helloWorld"`, `"hello_world"`, `"hello-world"`.
5. `truncate(s, max)` adds `…` and never cuts a word in half (when possible).
6. `reverseString(s)` that does not break **emoji** or other characters made of several code units.

```js
isPalindrome("A man, a plan, a canal: Panama");   // true
camelCase("hello_big-world");                     // "helloBigWorld"
```

:::hint Hint
For case converters, first split the string into **words**, then join them in the wanted style. A regex that finds "a lowercase letter followed by an uppercase letter" splits camelCase.
:::
:::

## Solution and tests

```js run title="String helpers, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

// 1. Palindrome: clean first, then compare from both ends (no extra reversed copy)
function isPalindrome(s) {
  const clean = s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");        // keep letters and numbers of any language
  for (let i = 0, j = clean.length - 1; i < j; i++, j--) if (clean[i] !== clean[j]) return false;
  return true;
}

// 2. Anagram: count letters
function isAnagram(a, b) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, "");
  a = norm(a); b = norm(b);
  if (a.length !== b.length) return false;
  const counts = new Map();
  for (const ch of a) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  for (const ch of b) {
    if (!counts.get(ch)) return false;                                   // missing or used up
    counts.set(ch, counts.get(ch) - 1);
  }
  return true;
}

// 3. First unique character: two passes, O(n)
function firstUnique(s) {
  const counts = new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  for (let i = 0; i < s.length; i++) if (counts.get(s[i]) === 1) return i;
  return -1;
}

// 4. Case converters
const words = (s) =>
  s.replace(/([a-z\d])([A-Z])/g, "$1 $2")                                // helloWorld -> hello World
   .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")                            // HTMLParser -> HTML Parser
   .split(/[^A-Za-z\d]+/)
   .filter(Boolean)
   .map((w) => w.toLowerCase());
const camelCase = (s) => words(s).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join("");
const snakeCase = (s) => words(s).join("_");
const kebabCase = (s) => words(s).join("-");

// 5. Truncate at a word boundary
function truncate(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);                                       // leave room for the ellipsis
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + "…";
}

// 6. Reverse that respects user-perceived characters
function reverseString(s) {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(seg.segment(s), (x) => x.segment).reverse().join("");
}

// ---------------- tests ----------------
test("palindrome ignores case and punctuation", () => {
  assert.equal(isPalindrome("A man, a plan, a canal: Panama"), true);
  assert.equal(isPalindrome("hello"), false);
  assert.equal(isPalindrome(""), true);
  assert.equal(isPalindrome("12321"), true);
});

test("anagram", () => {
  assert.equal(isAnagram("Listen", "Silent"), true);
  assert.equal(isAnagram("Dormitory", "dirty room"), true);
  assert.equal(isAnagram("aab", "abb"), false);
  assert.equal(isAnagram("abc", "abcd"), false);
});

test("first unique character", () => {
  assert.equal(firstUnique("leetcode"), 0);
  assert.equal(firstUnique("loveleetcode"), 2);
  assert.equal(firstUnique("aabb"), -1);
  assert.equal(firstUnique(""), -1);
});

test("case converters from any style", () => {
  for (const input of ["hello world", "helloWorld", "hello_world", "hello-world", "Hello  World"]) {
    assert.equal(camelCase(input), "helloWorld", input);
    assert.equal(snakeCase(input), "hello_world", input);
    assert.equal(kebabCase(input), "hello-world", input);
  }
});

test("case converters with acronyms and digits", () => {
  assert.equal(kebabCase("parseHTMLString"), "parse-html-string");
  assert.equal(snakeCase("user2Name"), "user2_name");
  assert.equal(camelCase(""), "");
});

test("truncate at a word boundary", () => {
  assert.equal(truncate("The quick brown fox", 100), "The quick brown fox");
  assert.equal(truncate("The quick brown fox", 12), "The quick…");
  assert.equal(truncate("Supercalifragilistic", 8), "Superca…");           // one long word: cut inside it
});

test("naive reverse breaks emoji, the segmenter version does not", () => {
  const s = "ab👍🏽c";                                                      // the thumbs-up has a skin-tone modifier
  const naive = s.split("").reverse().join("");
  const good = reverseString(s);
  assert.equal(good, "c👍🏽ba");
  assert.notEqual(naive, good);
  assert.equal(reverseString("héllo"), "olléh");
});

test("length is in code units, not characters", () => {
  assert.equal("😀".length, 2);
  assert.equal([..."😀"].length, 1);
  assert.equal([..."👍🏽"].length, 2);                                      // still two code points, but one visible character
});
```

## Edge cases to say out loud

- `.length` counts **UTF-16 code units**. An emoji is 2, a thumbs-up with skin tone is 4 units, 2 code points, 1 visible character.
- `[...s]` splits by **code point**; `Intl.Segmenter` splits by **grapheme** (what the user sees).
- `toLowerCase` is locale-sensitive in a few languages (Turkish `I`). Use `toLocaleLowerCase(locale)` when it matters.
- Compare accented text after `normalize("NFC")`: `"é"` can be one code point or `e` + a combining mark.

:::qa How do you check for an anagram without sorting? {level=easy}
**Say this:** "Count the letters of the first string in a Map, then subtract for the second. If a count would go below zero, or the lengths differ, it is not an anagram. That is O(n); sorting both strings is O(n log n)."

**In simple words:** Tick off each letter as you find it.
:::

:::qa Why does `s.split("").reverse().join("")` fail for some strings? {level=medium}
**Say this:** "`split('')` cuts between UTF-16 code units, so characters outside the basic plane (many emoji) are split into two halves, and reversing puts the halves in the wrong order. Even `[...s]` breaks combined sequences like skin-tone emoji. Use `Intl.Segmenter` with grapheme granularity."

**In simple words:** What you see as one character may be several pieces inside.
:::

:::qa How would you make `kebabCase` handle `parseHTMLString` correctly? {level=medium}
**Say this:** "Two regexes: one splits `lower|Upper` boundaries, one splits an acronym from the next word (`HTMLParser` → `HTML Parser`). Then lower-case the words and join with `-`."

**In simple words:** Find where one word ends and the next begins before you change the case.
:::

:::keypoints
- Palindrome: clean with a **Unicode-aware regex**, compare from both ends.
- Anagram / first unique: **count with a Map**, O(n).
- Case converters: **split into words first**, then join in the style you need.
- Strings are **UTF-16**: `length` ≠ characters; use `Intl.Segmenter` and `normalize` for correctness.
:::
