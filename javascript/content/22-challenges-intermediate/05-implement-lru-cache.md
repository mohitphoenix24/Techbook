---
title: Implement an LRU cache
level: medium
time: 30
summary: Build a least-recently-used cache with O(1) get and put, first with a Map and then with a doubly linked list and a hash map, the way interviewers expect to see it drawn.
---

:::problem Implement an LRU cache {level=medium tags="data structures,map,linked list,cache"}
Design `LRUCache(capacity)`:

- `get(key)` returns the value, or `-1` if missing. A hit makes the key the **most recently used**.
- `put(key, value)` adds or updates. If the size goes over `capacity`, remove the **least recently used** key.
- Both must run in **O(1)** time.

```js
const c = new LRUCache(2);
c.put(1, "a"); c.put(2, "b");
c.get(1);          // "a"   (1 is now the most recent)
c.put(3, "c");     // removes key 2
c.get(2);          // -1
```

Write it **twice**: (1) using `Map` and its insertion order; (2) with a **doubly linked list + hash map** (the classic answer, needed in languages without an ordered map).

:::hint Hint
`Map` remembers insertion order. "Touch" a key by deleting it and setting it again: it moves to the end. The oldest key is `map.keys().next().value`. For the linked list: the map stores `key → node`; moving a node needs only its `prev` and `next` pointers.
:::
:::

## Solution and tests

```js run title="Two LRU caches, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

// Version 1: Map keeps insertion order
class LRUMap {
  #cap; #map = new Map();
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("capacity must be a positive integer");
    this.#cap = capacity;
  }
  get(key) {
    if (!this.#map.has(key)) return -1;
    const value = this.#map.get(key);
    this.#map.delete(key); this.#map.set(key, value);        // move to the end = most recent
    return value;
  }
  put(key, value) {
    this.#map.delete(key);                                   // so an update also moves the key to the end
    this.#map.set(key, value);
    if (this.#map.size > this.#cap) this.#map.delete(this.#map.keys().next().value);   // the first key = least recent
  }
  keys() { return [...this.#map.keys()]; }                   // least recent -> most recent
  get size() { return this.#map.size; }
}

// Version 2: doubly linked list + hash map. Every step is O(1) with no hidden cost.
class Node { constructor(key, value) { this.key = key; this.value = value; this.prev = null; this.next = null; } }

class LRUList {
  #cap; #map = new Map();
  #head = new Node();                                        // sentinel: head.next = most recent
  #tail = new Node();                                        // sentinel: tail.prev = least recent
  constructor(capacity) {
    this.#cap = capacity;
    this.#head.next = this.#tail;
    this.#tail.prev = this.#head;
  }
  #unlink(n) { n.prev.next = n.next; n.next.prev = n.prev; }
  #pushFront(n) {
    n.next = this.#head.next; n.prev = this.#head;
    this.#head.next.prev = n; this.#head.next = n;
  }
  get(key) {
    const n = this.#map.get(key);
    if (!n) return -1;
    this.#unlink(n); this.#pushFront(n);                     // touch
    return n.value;
  }
  put(key, value) {
    let n = this.#map.get(key);
    if (n) { n.value = value; this.#unlink(n); this.#pushFront(n); return; }
    n = new Node(key, value);
    this.#map.set(key, n);
    this.#pushFront(n);
    if (this.#map.size > this.#cap) {
      const lru = this.#tail.prev;                           // evict the least recent
      this.#unlink(lru);
      this.#map.delete(lru.key);
    }
  }
  keys() { const out = []; for (let n = this.#tail.prev; n !== this.#head; n = n.prev) out.push(n.key); return out; }
  get size() { return this.#map.size; }
}

// ---------------- tests (the same for both) ----------------
for (const [name, LRU] of [["Map", LRUMap], ["List", LRUList]]) {
  test(`${name}: the classic sequence`, () => {
    const c = new LRU(2);
    c.put(1, "a"); c.put(2, "b");
    assert.equal(c.get(1), "a");
    c.put(3, "c");                                           // evicts 2
    assert.equal(c.get(2), -1);
    c.put(4, "d");                                           // evicts 1
    assert.equal(c.get(1), -1);
    assert.equal(c.get(3), "c");
    assert.equal(c.get(4), "d");
  });

  test(`${name}: updating a key keeps size and refreshes it`, () => {
    const c = new LRU(2);
    c.put(1, "a"); c.put(2, "b"); c.put(1, "A");
    c.put(3, "c");                                           // 2 is the oldest now
    assert.equal(c.get(1), "A");
    assert.equal(c.get(2), -1);
    assert.equal(c.size, 2);
  });

  test(`${name}: order from least to most recent`, () => {
    const c = new LRU(3);
    c.put("a", 1); c.put("b", 2); c.put("c", 3);
    c.get("a");
    assert.deepEqual(c.keys(), ["b", "c", "a"]);
  });

  test(`${name}: capacity 1`, () => {
    const c = new LRU(1);
    c.put(1, 1); c.put(2, 2);
    assert.equal(c.get(1), -1);
    assert.equal(c.get(2), 2);
  });

  test(`${name}: falsy values are real values`, () => {
    const c = new LRU(2);
    c.put("zero", 0); c.put("empty", "");
    assert.equal(c.get("zero"), 0);
    assert.equal(c.get("empty"), "");
  });

  test(`${name}: a stress test against a simple model`, () => {
    const cap = 5, c = new LRU(cap), model = [];             // model: array of keys, least recent first
    let seed = 12345;
    const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
    for (let step = 0; step < 2000; step++) {
      const key = rand(9);
      if (rand(2)) {
        c.put(key, key * 10);
        const i = model.indexOf(key); if (i !== -1) model.splice(i, 1);
        model.push(key); if (model.length > cap) model.shift();
      } else {
        const hit = model.includes(key);
        assert.equal(c.get(key), hit ? key * 10 : -1);
        if (hit) { model.splice(model.indexOf(key), 1); model.push(key); }
      }
    }
    assert.deepEqual(c.keys(), model);
  });
}

test("Map version rejects a bad capacity", () => assert.throws(() => new LRUMap(0), RangeError));
```

## Why the two sentinels?

The dummy `head` and `tail` nodes mean **no `null` checks** when you insert or remove at the ends. Without them, every `unlink` needs `if (n.prev)` and `if (n.next)`, and that is where most interview bugs come from.

## Drawing it

```
head <-> [most recent] <-> ... <-> [least recent] <-> tail
          ^ map: key -> node, so we jump straight to any node
```

:::qa Why not just use an array to store the order? {level=easy}
**Say this:** "Finding a key and removing it from the middle of an array is O(n). The linked list removes a node in O(1) if you already have the node, and the hash map gives you that node in O(1)."

**In simple words:** The map finds it fast; the list moves it fast.
:::

:::qa Is the `Map` version really O(1)? {level=medium}
**Say this:** "In practice yes: JavaScript's `Map` keeps insertion order, and `delete`, `set` and `keys().next()` are amortised O(1) in V8. The spec only promises the order, so in an interview I explain it, and I also show the linked-list version, which is O(1) by construction."

**In simple words:** It works well, but the list version proves it.
:::

:::qa How would you add a TTL or make it safe for async loaders? {level=hard}
**Say this:** "Store an expiry time with each value and check it on `get` (lazy expiry). For async loaders, cache the **promise**, so concurrent calls for the same key share one request, and delete the entry if it rejects."

**In simple words:** Remember when it expires, and remember the in-flight request too.
:::

:::keypoints
- **Hash map + doubly linked list** = O(1) `get` and `put`; map gives the node, list gives the order.
- **Sentinel** head and tail remove edge cases.
- With `Map`: **delete + set** moves a key to the end; the **first key** is the least recent.
- On `put` of an existing key: update **and** refresh; evict only when the size exceeds the capacity.
:::
