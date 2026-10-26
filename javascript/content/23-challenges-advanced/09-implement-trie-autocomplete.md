---
title: Implement autocomplete with a trie
level: hard
time: 40
summary: Build a trie with weighted top-k suggestions, accent-insensitive matching that keeps non-Latin scripts intact, deletion with pruning, a precomputed top-k version, and fuzzy search with edit distance.
---

:::problem Implement autocomplete {level=hard tags="trie,data structures,search,unicode,levenshtein"}
Search boxes need suggestions after every key press, from a list of 100,000 words, in under a millisecond.

Build:

1. `Trie` with `insert(word, weight)`, `has(word)`, `delete(word)` (also **prunes** empty branches), `suggest(prefix, k)` → the `k` best words that start with the prefix, ordered by **weight (high first), then alphabetically**.
2. **Normalisation**: matching ignores case and Latin accents (`café` matches `cafe`), but must **not damage other scripts** (Hindi `भारत` must still work).
3. `FastAutocomplete(k)`: the same results, but every node stores its **top-k** list, so `suggest` is O(length of prefix).
4. `fuzzy(word, maxDistance)`: all words within a given **edit distance** (Levenshtein), found by walking the trie once and carrying a DP row.

:::hint Hint
A trie node is `{ children: Map, end, word, weight }`. For fuzzy search, do not compute the distance to each word separately. Carry the **last row of the edit-distance table** down the trie, and **stop** when the smallest value in the row is already above `maxDistance`.
:::
:::

## Solution and tests

```js run title="Trie, FastAutocomplete and fuzzy search, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

// Only strip Latin combining accents (U+0300 to U+036F). Stripping every \p{M} would also delete Hindi vowel signs.
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().normalize("NFC");
const byBest = (a, b) => b.weight - a.weight || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0);

class Trie {
  root = { children: new Map(), end: false, word: "", weight: 0 };

  insert(word, weight = 1) {
    let node = this.root;
    for (const ch of norm(word)) {                           // for...of walks code points, so emoji and rare scripts are single steps
      if (!node.children.has(ch)) node.children.set(ch, { children: new Map(), end: false, word: "", weight: 0 });
      node = node.children.get(ch);
    }
    node.end = true; node.word = word; node.weight += weight;
  }

  #find(prefix) {
    let node = this.root;
    for (const ch of norm(prefix)) { node = node.children.get(ch); if (!node) return null; }
    return node;
  }
  has(word) { return this.#find(word)?.end === true; }

  delete(word) {
    const chars = [...norm(word)];
    const path = [this.root];
    for (const ch of chars) { const next = path.at(-1).children.get(ch); if (!next) return false; path.push(next); }
    const last = path.at(-1);
    if (!last.end) return false;
    last.end = false; last.word = ""; last.weight = 0;
    for (let i = chars.length; i > 0; i--) {                 // prune upwards while a node is useless
      const node = path[i];
      if (node.end || node.children.size) break;
      path[i - 1].children.delete(chars[i - 1]);
    }
    return true;
  }

  suggest(prefix, k = 5) {
    const start = this.#find(prefix);
    if (!start) return [];
    const found = [];
    const stack = [start];                                   // iterative DFS: no recursion limit for long words
    while (stack.length) {
      const node = stack.pop();
      if (node.end) found.push({ word: node.word, weight: node.weight });
      for (const child of node.children.values()) stack.push(child);
    }
    return found.sort(byBest).slice(0, k).map((x) => x.word);
  }

  nodeCount() { let n = 0; const stack = [this.root]; while (stack.length) { n++; stack.push(...stack.pop().children.values()); } return n; }

  // Fuzzy search: carry one row of the Levenshtein table down the trie
  fuzzy(query, maxDistance = 1) {
    const q = [...norm(query)];
    const results = [];
    const walk = (node, ch, prevRow, path) => {
      const row = [prevRow[0] + 1];
      for (let i = 1; i <= q.length; i++) {
        row[i] = Math.min(row[i - 1] + 1, prevRow[i] + 1, prevRow[i - 1] + (q[i - 1] === ch ? 0 : 1));   // insert, delete, substitute
      }
      if (node.end && row[q.length] <= maxDistance) results.push({ word: node.word, distance: row[q.length], weight: node.weight });
      if (Math.min(...row) <= maxDistance) {                 // otherwise no word below here can get close enough: prune the whole subtree
        for (const [c, child] of node.children) walk(child, c, row, path + c);
      }
    };
    const first = Array.from({ length: q.length + 1 }, (_, i) => i);
    for (const [c, child] of this.root.children) walk(child, c, first, c);
    return results.sort((a, b) => a.distance - b.distance || byBest(a, b)).map((r) => r.word);
  }
}

// Every node keeps its own top-k, so a query is just "walk the prefix, read the list".
class FastAutocomplete {
  constructor(k = 5) { this.k = k; this.root = { children: new Map(), top: [] }; this.weights = new Map(); }
  insert(word, weight = 1) {                                 // weights only go UP, so a node's top-k never needs rebuilding
    const total = (this.weights.get(word) ?? 0) + weight;
    this.weights.set(word, total);
    const entry = { word, weight: total };
    let node = this.root;
    for (const ch of norm(word)) {
      if (!node.children.has(ch)) node.children.set(ch, { children: new Map(), top: [] });
      node = node.children.get(ch);
      node.top = node.top.filter((e) => e.word !== word);
      node.top.push(entry);
      node.top.sort(byBest);
      if (node.top.length > this.k) node.top.length = this.k;
    }
  }
  suggest(prefix, k = this.k) {
    let node = this.root;
    for (const ch of norm(prefix)) { node = node.children.get(ch); if (!node) return []; }
    return (prefix === "" ? this.#overall() : node.top).slice(0, k).map((e) => e.word);
  }
  #overall() { return [...this.weights].map(([word, weight]) => ({ word, weight })).sort(byBest); }
}

// ---------------- tests ----------------
const words = [["apple", 50], ["application", 80], ["apply", 80], ["apt", 5], ["banana", 30], ["band", 10], ["ban", 1], ["cafe", 20], ["café noir", 7]];
const build = () => { const t = new Trie(); words.forEach(([w, n]) => t.insert(w, n)); return t; };

test("suggestions by weight, then alphabetically, limited to k", () => {
  const t = build();
  assert.deepEqual(t.suggest("app", 3), ["application", "apply", "apple"]);       // 80, 80 (a before y), 50
  assert.deepEqual(t.suggest("ba", 10), ["banana", "band", "ban"]);
  assert.deepEqual(t.suggest("zzz"), []);
});

test("the empty prefix gives the overall best", () => assert.deepEqual(build().suggest("", 2), ["application", "apply"]));

test("case and accents are ignored; the original spelling is returned", () => {
  const t = build();
  assert.deepEqual(t.suggest("CAF"), ["cafe", "café noir"]);
  assert.deepEqual(t.suggest("café"), ["cafe", "café noir"]);
  assert.equal(t.has("CAFÉ"), true);
});

test("non-Latin scripts keep their vowel signs", () => {
  const t = new Trie();
  t.insert("भारत", 5); t.insert("भाषा", 3); t.insert("भय", 1);
  assert.deepEqual(t.suggest("भा"), ["भारत", "भाषा"]);                            // "भय" must not match "भा"
  assert.equal(norm("भारत"), "भारत");
});

test("emoji are single steps", () => {
  const t = new Trie();
  t.insert("😀 smile");
  assert.deepEqual(t.suggest("😀"), ["😀 smile"]);
});

test("inserting a word again adds to its weight", () => {
  const t = new Trie();
  t.insert("a1", 1); t.insert("a2", 2); t.insert("a1", 5);
  assert.deepEqual(t.suggest("a"), ["a1", "a2"]);
});

test("delete removes the word and prunes empty branches", () => {
  const t = new Trie();
  t.insert("car"); t.insert("card"); t.insert("dog");
  const before = t.nodeCount();
  assert.equal(t.delete("card"), true);
  assert.equal(t.has("card"), false);
  assert.equal(t.has("car"), true);                          // the shorter word survives
  assert.equal(t.nodeCount(), before - 1);                   // only the "d" node was removed
  assert.equal(t.delete("dog"), true);
  assert.equal(t.nodeCount(), before - 1 - 3);               // d-o-g branch gone completely
  assert.equal(t.delete("missing"), false);
  assert.equal(t.delete("ca"), false);                       // a prefix is not a word
});

test("fuzzy search finds near matches ordered by distance", () => {
  const t = new Trie();
  ["hello", "help", "hero", "hell", "world", "held"].forEach((w) => t.insert(w));
  assert.deepEqual(t.fuzzy("helo", 1), ["held", "hell", "hello", "help", "hero"]);
  assert.deepEqual(t.fuzzy("hello", 0), ["hello"]);
  assert.deepEqual(t.fuzzy("wrld", 1), ["world"]);
  assert.deepEqual(t.fuzzy("xyz", 1), []);
});

test("fuzzy distance matches a plain Levenshtein function", () => {
  const lev = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  const dict = ["kitten", "sitting", "mitten", "bitten", "fitting", "sit", "kit", "knitting"];
  const t = new Trie(); dict.forEach((w) => t.insert(w));
  for (const query of ["kitten", "sitten", "kiting"]) {
    const expected = dict.filter((w) => lev(query, w) <= 2).sort();
    assert.deepEqual(t.fuzzy(query, 2).sort(), expected, query);
  }
});

test("FastAutocomplete gives the same answers as the DFS trie (random check)", () => {
  let seed = 99;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
  const letters = "abcd";
  const slow = new Trie(), fast = new FastAutocomplete(5);
  for (let i = 0; i < 400; i++) {
    const w = Array.from({ length: 1 + rand(5) }, () => letters[rand(4)]).join("");
    const weight = 1 + rand(9);
    slow.insert(w, weight); fast.insert(w, weight);
  }
  for (const prefix of ["", "a", "b", "ab", "abc", "dd", "cab", "zzz"]) {
    assert.deepEqual(fast.suggest(prefix, 5), slow.suggest(prefix, 5), "prefix '" + prefix + "'");
  }
});
```

## Design notes

| Choice | Why |
|---|---|
| `Map` for children | any character (code point), no prototype keys, ordered |
| `for...of` over a string | walks **code points**, not UTF-16 halves |
| Store the original spelling at the word end | show `Café`, match `cafe` |
| Top-k per node (`FastAutocomplete`) | query cost independent of how many words share the prefix; costs memory and makes deletes hard |
| Debounce 100–200 ms + `takeLatest` | fewer requests, no stale suggestions (see the race-condition lesson) |
| Server side | Redis sorted sets, Elasticsearch `completion` suggester, or a **radix tree/DAWG** to save memory |

:::qa What is the time and space complexity of a trie? {level=medium}
**Say this:** "Insert and lookup are O(L), where L is the word length, independent of how many words are stored. Space is O(total characters) in the worst case, shared prefixes save space. Suggestions without precomputation cost O(L + size of the subtree)."

**In simple words:** The time depends on the length of your word, not on the size of the dictionary.
:::

:::qa Why not use `array.filter(w => w.startsWith(prefix))`? {level=easy}
**Say this:** "It is O(N × L) on every key press: for 100,000 words that is millions of comparisons per keystroke. A trie, or a sorted array with binary search for the first and last match, avoids scanning everything."

**In simple words:** Scanning everything on each key press does not scale.
:::

:::qa Why must accent stripping be limited to Latin marks? {level=hard}
**Say this:** "`normalize('NFD')` splits `é` into `e` plus a combining accent, and removing all combining marks (`\\p{M}`) works for Latin. But in Hindi, Thai and many scripts the vowel signs are also combining marks, so removing them changes the word and merges different words. Strip only the Latin diacritics block (U+0300–U+036F), or use `Intl.Collator` with `sensitivity: 'base'` for comparisons."

**In simple words:** An accent is decoration in French but part of the letter in Hindi.
:::

:::keypoints
- **Trie**: nodes with a `Map` of children; insert/lookup in **O(L)**; iterate with **`for...of`** (code points).
- Rank by **weight, then alphabetically**; return the stored **original spelling**.
- **Delete** must **prune** empty branches; a prefix is not a word.
- **Top-k per node** makes queries O(L) if weights only increase; **fuzzy search** = carry the **Levenshtein row** down the trie and prune when the row minimum exceeds the limit.
- Normalise carefully: strip **only Latin diacritics**.
:::
