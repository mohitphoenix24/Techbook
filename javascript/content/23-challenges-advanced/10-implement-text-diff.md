---
title: Implement a text diff (LCS and Myers)
level: hard
time: 45
summary: Compute the smallest set of additions and removals between two sequences with dynamic programming, then with Myers' O(ND) algorithm, and show word-level changes. The idea behind git diff, code review tools and collaborative editors.
---

:::problem Implement a diff {level=hard tags="algorithms,dynamic programming,lcs,myers,git"}
Given two arrays (lines or words) `a` and `b`, return a list of edits `{ type: "equal" | "add" | "remove", value }` that turns `a` into `b` using the **fewest** additions and removals.

1. `lcsDiff(a, b)`: classic dynamic programming on the **longest common subsequence** (LCS), O(n × m).
2. `myersDiff(a, b)`: Myers' algorithm, **O(N × D)** where `D` is the number of edits. Fast when the files are similar, which is almost always the case.
3. `wordDiff(oldText, newText)`: tokenise into words and spaces, diff the tokens, and print `the [-quick-]{+slow+} brown`.

Prove it: the number of edits equals `n + m − 2·LCS`, rebuilding `a` and `b` from the edits gives back the inputs, and both algorithms agree on random inputs.

:::hint Hint
LCS table: `L[i][j]` = length of the LCS of `a[i..]` and `b[j..]`. Walk from the top left: equal items are kept, otherwise move in the direction with the larger table value. For Myers, think of a grid: moving right = remove from `a`, down = add from `b`, diagonal = free when items are equal; find the shortest path from the top-left to the bottom-right corner.
:::
:::

## Solution and tests

```js run title="lcsDiff, myersDiff and wordDiff, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

// ---------- 1. LCS by dynamic programming ----------
function lcsDiff(a, b) {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const edits = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { edits.push({ type: "equal", value: a[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { edits.push({ type: "remove", value: a[i++] }); }
    else { edits.push({ type: "add", value: b[j++] }); }
  }
  while (i < n) edits.push({ type: "remove", value: a[i++] });
  while (j < m) edits.push({ type: "add", value: b[j++] });
  return edits;
}

// ---------- 2. Myers' O(ND) algorithm ----------
function myersDiff(a, b) {
  const n = a.length, m = b.length;
  const v = new Map([[1, 0]]);                               // v[k] = the furthest x reached on diagonal k = x - y
  const trace = [];                                          // a copy of v for every round d (to walk back later)
  for (let d = 0; d <= n + m; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v.get(k - 1) < v.get(k + 1))) x = v.get(k + 1);    // come from above: an "add"
      else x = v.get(k - 1) + 1;                                                     // come from the left: a "remove"
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }                          // follow the free diagonal ("snake")
      v.set(k, x);
      if (x >= n && y >= m) return backtrack(a, b, trace);
    }
  }
}

function backtrack(a, b, trace) {
  let x = a.length, y = b.length;
  const edits = [];
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && v.get(k - 1) < v.get(k + 1)) ? k + 1 : k - 1;
    const prevX = v.get(prevK), prevY = prevX - prevK;
    while (x > prevX && y > prevY) { edits.push({ type: "equal", value: a[x - 1] }); x--; y--; }
    if (d > 0) edits.push(x === prevX ? { type: "add", value: b[prevY] } : { type: "remove", value: a[prevX] });
    x = prevX; y = prevY;
  }
  return edits.reverse();
}

// put the removals before the additions inside each changed block (like git does)
function tidy(edits) {
  const out = [];
  for (let i = 0; i < edits.length;) {
    if (edits[i].type === "equal") { out.push(edits[i++]); continue; }
    const block = [];
    while (i < edits.length && edits[i].type !== "equal") block.push(edits[i++]);
    out.push(...block.filter((e) => e.type === "remove"), ...block.filter((e) => e.type === "add"));
  }
  return out;
}

// ---------- 3. words ----------
function wordDiff(oldText, newText) {
  const tokens = (s) => s.split(/(\s+)/).filter(Boolean);
  const edits = tidy(myersDiff(tokens(oldText), tokens(newText)));
  let out = "";
  for (let i = 0; i < edits.length;) {
    const type = edits[i].type;
    let chunk = "";
    while (i < edits.length && edits[i].type === type) chunk += edits[i++].value;
    out += type === "equal" ? chunk : type === "remove" ? `[-${chunk}-]` : `{+${chunk}+}`;
  }
  return out;
}

// ---------------- tests ----------------
const lcsLength = (a, b) => {                                // an independent check: rolling-row DP
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
};
const rebuild = (edits) => ({
  a: edits.filter((e) => e.type !== "add").map((e) => e.value),
  b: edits.filter((e) => e.type !== "remove").map((e) => e.value),
});
const cost = (edits) => edits.filter((e) => e.type !== "equal").length;
const chars = (s) => [...s];

for (const [name, diff] of [["lcsDiff", lcsDiff], ["myersDiff", myersDiff]]) {
  test(`${name}: identical, empty and fully different inputs`, () => {
    assert.deepEqual(diff(chars("abc"), chars("abc")).map((e) => e.type), ["equal", "equal", "equal"]);
    assert.deepEqual(diff([], chars("ab")).map((e) => e.type), ["add", "add"]);
    assert.deepEqual(diff(chars("ab"), []).map((e) => e.type), ["remove", "remove"]);
    assert.deepEqual(diff([], []), []);
    assert.equal(cost(diff(chars("abc"), chars("xyz"))), 6);
  });

  test(`${name}: the example from Myers' paper needs exactly 5 edits`, () => {
    const edits = diff(chars("ABCABBA"), chars("CBABAC"));
    assert.equal(cost(edits), 5);                            // 7 + 6 - 2 * LCS(4)
    assert.deepEqual(rebuild(edits), { a: chars("ABCABBA"), b: chars("CBABAC") });
  });

  test(`${name}: lines of a file`, () => {
    const oldFile = ["const a = 1;", "const b = 2;", "console.log(a + b);"];
    const newFile = ["const a = 1;", "const b = 3;", "const c = 4;", "console.log(a + b + c);"];
    const edits = tidy(diff(oldFile, newFile));
    assert.deepEqual(edits.map((e) => (e.type === "equal" ? " " : e.type === "add" ? "+" : "-")).join(""), " --+++");
  });

  test(`${name}: random inputs give a minimal, correct script`, () => {
    let seed = 11;
    const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
    for (let t = 0; t < 300; t++) {
      const a = Array.from({ length: rand(12) }, () => "abc"[rand(3)]);
      const b = Array.from({ length: rand(12) }, () => "abc"[rand(3)]);
      const edits = diff(a, b);
      assert.deepEqual(rebuild(edits), { a, b });
      assert.equal(cost(edits), a.length + b.length - 2 * lcsLength(a, b), `minimal for ${a.join("")} / ${b.join("")}`);
    }
  });
}

test("both algorithms find the same number of edits on bigger inputs", () => {
  const a = Array.from({ length: 300 }, (_, i) => "line " + (i % 17));
  const b = a.slice(); b.splice(100, 5); b.splice(200, 0, "new line", "another");
  assert.equal(cost(myersDiff(a, b)), cost(lcsDiff(a, b)));
  assert.equal(cost(myersDiff(a, b)), 7);
});

test("Myers does little work when the inputs are similar", () => {
  const a = Array.from({ length: 5000 }, (_, i) => "line " + i);
  const b = a.slice(); b[2500] = "changed";
  const edits = myersDiff(a, b);                             // a 5000 x 5000 DP table would be 25 million cells
  assert.equal(cost(edits), 2);
});

test("wordDiff marks removed and added words", () => {
  assert.equal(wordDiff("the quick brown fox", "the slow brown dog"), "the [-quick-]{+slow+} brown [-fox-]{+dog+}");
  assert.equal(wordDiff("same text", "same text"), "same text");
  assert.equal(wordDiff("a b", "a b c"), "a b{+ c+}");
});
```

## How `git diff` goes further

| Idea | What it adds |
|---|---|
| **Hunks with context** | show only changed lines plus 3 lines around them, with `@@ -10,6 +10,8 @@` headers |
| **Trim common prefix and suffix first** | most files change in the middle, so the algorithm sees a much smaller problem |
| **Patience / histogram diff** | anchors on lines that are unique in both files, which gives more readable diffs when code moves |
| **Hashing lines** | compare numbers instead of strings |
| **Rename detection** | similarity score between whole files, not lines |

The same ideas drive **React's reconciliation** (the list-diff lesson), **Google Docs-style editing** (operational transformation) and **`jest` snapshot diffs**.

:::qa What is the complexity of the DP version, and why is Myers better? {level=medium}
**Say this:** "The DP table is O(n × m) in time and memory: two 100,000-line files would need 10 billion cells. Myers' algorithm is O(N × D), where N = n + m and D is the number of edits. For files that are mostly the same, D is small, so it is close to linear."

**In simple words:** DP always does the full work; Myers works in proportion to how different the files are.
:::

:::qa Is the diff unique? {level=medium}
**Say this:** "No. Several minimal edit scripts can exist (for example which of two equal lines is matched). Algorithms differ in tie-breaking, which is why `git diff --patience` can look different from the default and still be minimal in the number of changes."

**In simple words:** There are often several equally short ways to change one text into the other.
:::

:::qa How do you diff very large files or binary data? {level=hard}
**Say this:** "Hash lines first, trim the common prefix and suffix, then split into chunks around unique anchor lines (patience) and diff each part. For binary files, use rolling-hash block matching (rsync, `xdelta`, `bsdiff`) instead of line diffs."

**In simple words:** Cut the problem into small pieces using landmarks, and compare pieces by hash.
:::

:::keypoints
- Edits = `n + m − 2 × LCS`; the **LCS table** gives a simple O(n·m) diff.
- **Myers**: shortest path on an edit grid, **O(N·D)**; follow **diagonals** for free; store `v` per round to **backtrack**.
- Group each changed block as **remove then add**; for words, diff the **tokens including whitespace**.
- Verify with properties: **rebuild both inputs** from the edits, and compare the cost with an **independent LCS length**.
:::
