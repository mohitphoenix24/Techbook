SHEETS.define({
  id: "merge-k-sorted-lists",
  viz: "heap",
  io: { fn: "mergeKLists", params: [["lists", "lists"]], ret: "list", labels: { lists: "lists (an array of sorted lists)" } },

  statement: `You are given an array of \`k\` linked lists \`lists\`, each linked list is sorted in **ascending order**.

**Merge all the linked lists into one sorted linked list** and return it.`,
  examples: [
    { input: "lists = [[1, 4, 5], [1, 3, 4], [2, 6]]", output: "[1, 1, 2, 3, 4, 4, 5, 6]", explain: "Merging the three lists gives all eight values in sorted order." },
    { input: "lists = []", output: "[]", explain: "There are no lists at all." },
    { input: "lists = [[]]", output: "[]", explain: "The only list is empty." },
  ],
  constraints: ["`k == lists.length`", "$0 \\le k \\le 10^4$", "$0 \\le$ `lists[i].length` $\\le 500$", "$-10^4 \\le$ `lists[i][j]` $\\le 10^4$", "Each `lists[i]` is sorted in **ascending** order", "The sum of `lists[i].length` is at most $10^4$"],
  check(input) {
    const L = input.lists, N = L.reduce((s, x) => s + x.length, 0);
    if (L.length > 5) return "for the animation use at most 5 lists";
    if (L.some((x) => x.length > 5) || N > 12) return "for the animation use at most 5 nodes per list and 12 in total";
    if (L.some((x) => x.some((v) => Math.abs(v) > 99))) return "keep the values between -99 and 99";
    if (L.some((x) => x.some((v, i) => i && x[i - 1] > v))) return "every list must be sorted in ascending order, e.g. [1,4,5]";
    return null;
  },

  intuition: {
    find: "One sorted list holding **every node of all `k` lists**.",
    beginner: "Repeatedly look at the front node of **every** list, pick the smallest, attach it to the answer and move that list forward. Stop when all lists are empty.",
    works: "Each list is sorted, so its front is its smallest node; the smallest of all fronts is the smallest node left anywhere. Taking it each time produces sorted order.",
    slow: "Finding the smallest of `k` fronts costs $O(k)$, and we do it once for **each of the $N$ nodes**: $O(N \\cdot k)$. With 10 000 one-node lists that is 100 million comparisons.",
    repeat: "After taking a node, **only one front changes** (the list we took from), but the next round re-compares all `k` fronts from scratch, although `k − 1` of them are exactly as before.",
    remember: "We need a structure that always gives us the **minimum of a changing set** quickly: remove the smallest, add one new element, and again ask for the smallest. That is precisely a **min-heap** (priority queue).",
    observation: "Keep a min-heap of **at most one node per list: its current front**. The top is the overall smallest. Pop it, append it to the answer, and push the *next node of the same list* (if it has one). The heap never holds more than `k` nodes, so each push and pop costs only $O(\\log k)$.",
    leads: "Push the front of every non-empty list. While the heap is not empty: pop the smallest node, link it after `tail`, and push `node.next` if it exists. Return `dummy.next`.",
  },

  flow: [
    "Compare the fronts of all `k` lists every time and take the smallest.",
    "The front of a sorted list is its smallest, so the smallest front is the smallest node left.",
    "$O(N \\cdot k)$: every node triggers a scan over `k` fronts, though only one front changed.",
    "We need the **minimum of a changing set**, with cheap removal and insertion: a min-heap.",
    "Heap of at most `k` fronts: pop the smallest, push its successor from the same list.",
    "$N$ pushes and pops of $O(\\log k)$ each: $O(N \\log k)$ time, $O(k)$ space.",
  ],

  brute: {
    idea: "**Brute force:** repeat: scan the current front of all `k` lists, pick the list whose front is smallest, move that node to the answer and advance that list. Stop when every list is empty.",
    why: "The scan costs $O(k)$ per node and there are $N$ nodes: $O(N \\cdot k)$. Only one front changes per round, yet we re-examine all of them. A heap remembers the order of the fronts so that finding the smallest costs $O(\\log k)$ instead of $O(k)$.",
    time: "O(N · k)", space: "O(1)",
    measure: { fTex: "N \\cdot k", f: (n) => n * n, ns: [10, 100, 1000, 10000] },
    cpp: `class Solution {
public:
    ListNode* mergeKLists(vector<ListNode*>& lists) {
        ListNode dummy;
        ListNode* tail = &dummy;
        int k = lists.size();
        while (true) {
            int best = -1;
            for (int i = 0; i < k; i++)
                if (lists[i] && (best < 0 || lists[i]->val < lists[best]->val)) best = i;
            if (best < 0) break;
            tail->next = lists[best];
            tail = tail->next;
            lists[best] = lists[best]->next;
        }
        return dummy.next;
    }
};`,
    js: `function mergeKLists(lists) {
  const dummy = new ListNode(0);
  let tail = dummy;
  const k = lists.length;
  while (true) {
    let best = -1;
    for (let i = 0; i < k; i++)
      if (lists[i] && (best < 0 || lists[i].val < lists[best].val)) best = i;
    if (best < 0) break;
    tail.next = lists[best];
    tail = tail.next;
    lists[best] = lists[best].next;
  }
  return dummy.next;
}`,
  },

  pattern: {
    name: "Heap (k-way merge)",
    why: "Whenever you must repeatedly take **the smallest of several sorted sources**, a min-heap holding *one candidate per source* gives the next element in $O(\\log k)$. It is the generalisation of the two-pointer merge, and the engine of external sorting and of \"k-th smallest\" problems.",
    recognize: [
      "**k sorted** lists, arrays, files or streams must be combined or searched in order.",
      "You repeatedly need *the smallest (or largest) of a set that changes by one element each step*.",
      "The phrase **\"k-th smallest\"**, **\"top k\"** or **\"merge k\"** appears.",
      "A scan for the minimum would cost $O(k)$ per step, which is the bottleneck.",
    ],
  },

  optimal: {
    idea: "Put the head node of every non-empty list into a **min-heap ordered by value**. The top of the heap is the smallest node overall: pop it, link it after `tail`, and push the next node of the list it came from. Because every list is sorted, the heap always contains the smallest unused node of each list, so the popped node is the smallest unused node anywhere.",
    steps: [
      "Create an empty min-heap of nodes, ordered by `val`.",
      "Push the head of every **non-empty** list.",
      "Create `dummy` and `tail = &dummy`.",
      "While the heap is not empty: `node = heap.pop()` (the smallest front).",
      "Link it: `tail.next = node` and `tail = node`.",
      "If `node.next` exists, **push** it (the next candidate from that list).",
      "Return `dummy.next`.",
    ],
    invariant: "**The heap holds exactly the first unused node of each list that still has unused nodes, so its minimum is the smallest unused node of all.**",
    correct: "Initially the heap holds the head (the first unused node) of every non-empty list, so the invariant holds. Popping the minimum removes the smallest unused node overall (each list is sorted, so nothing behind a front can be smaller than that front). Pushing `node.next` restores the invariant for that list, and the other lists are untouched. So nodes leave the heap in non-decreasing order, which is the order of the answer. Each node is pushed once and popped once, so every node is linked exactly once and the loop ends when no unused nodes remain.",
  },

  cpp: `class Solution {
public:
    ListNode* mergeKLists(vector<ListNode*>& lists) {
        auto cmp = [](ListNode* a, ListNode* b) { return a->val > b->val; };
        priority_queue<ListNode*, vector<ListNode*>, decltype(cmp)> heap(cmp);   // min-heap //@init
        for (ListNode* l : lists)
            if (l) heap.push(l);                // the front of each list //@seed
        ListNode dummy;
        ListNode* tail = &dummy;
        while (!heap.empty()) {                 //@loop
            ListNode* node = heap.top(); heap.pop();   // the smallest front //@pop
            tail->next = node; tail = node;     // append it to the answer //@link
            if (node->next) heap.push(node->next);     // its successor joins //@push
        }
        return dummy.next;                      //@ret
    }
};`,
  js: `class MinHeap {                          // binary min-heap of nodes ordered by val
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(x) {
    const a = this.a; a.push(x); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].val <= a[i].val) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].val < a[m].val) m = l;
        if (r < a.length && a[r].val < a[m].val) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}
function mergeKLists(lists) {
  const heap = new MinHeap();            // min-heap of list fronts //@init
  for (const l of lists)
    if (l) heap.push(l);                 // the front of each list //@seed
  const dummy = new ListNode(0);
  let tail = dummy;
  while (heap.size > 0) {                //@loop
    const node = heap.pop();             // the smallest front //@pop
    tail.next = node; tail = node;       // append it to the answer //@link
    if (node.next) heap.push(node.next); // its successor joins //@push
  }
  return dummy.next;                     //@ret
}`,

  tests: [
    { name: "Example 1: three lists", kind: "normal", input: { lists: [[1, 4, 5], [1, 3, 4], [2, 6]] } },
    { name: "Example 2: no lists", kind: "normal", input: { lists: [] } },
    { name: "Example 3: one empty list", kind: "normal", input: { lists: [[]] } },
    { name: "Lists of different lengths", kind: "normal", input: { lists: [[5], [1, 2, 3], [4]] } },
    { name: "A single list", kind: "edge", input: { lists: [[1, 2, 3]] }, why: "With one list the heap never holds more than one node, so each pop returns the next node of that list: the answer is the list itself. It checks that the algorithm does not rely on having two lists." },
    { name: "Empty lists among others", kind: "edge", input: { lists: [[], [2, 3], [], [1]] }, why: "Empty lists are `null` pointers and must **not** be pushed (`heap.push(null)` would crash on the first comparison). The seeding loop guards with `if (l)`, so only lists `[2,3]` and `[1]` enter the heap." },
    { name: "All values equal", kind: "edge", input: { lists: [[3, 3], [3], [3, 3, 3]] }, why: "Every comparison is a tie. The heap may return the equal nodes in any order, but the values are all the same, so the result is correct whichever node comes first. The invariant only needs *a* minimum, not a particular one." },
    { name: "Negative values", kind: "edge", input: { lists: [[-5, -1], [-3, 0], [-4]] }, why: "Negative numbers order like any others: `-5 < -4 < -3 < -1 < 0`. A heap keyed on, say, an unsigned value or on `0` as \"missing\" would put them in the wrong order." },
    { name: "Lists with disjoint ranges", kind: "corner", input: { lists: [[1, 2], [3, 4], [5, 6]] }, why: "The first list is drained completely before the second one is touched: the heap always pops from the same list until it is empty, then from the next. The heap is as small as it can be." },
    { name: "One long list and a short one", kind: "corner", input: { lists: [[1, 2, 3, 4, 5], [0]] }, why: "The short list has the smallest value, so it empties on the **first** pop and is never pushed again; afterwards the heap has a single element for the rest of the run (the very unbalanced case)." },
    { name: "Every list has one node", kind: "corner", input: { lists: [[4], [2], [3], [1]] }, why: "No node has a `next`, so nothing is ever pushed after the seeding: the heap only shrinks. Here the algorithm is a plain *heap sort* of the heads." },
  ],

  trace(input, T) {
    const Ls = input.lists, k = Ls.length;
    const taken = Ls.map(() => 0);
    const heap = [], out = [];
    const total = Ls.reduce((s, x) => s + x.length, 0);
    const lg = (m) => 1 + Math.floor(Math.log2(Math.max(m, 1)));
    const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].v <= heap[i].v) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].v < heap[m].v) m = l; if (r < heap.length && heap[r].v < heap[m].v) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } }
      return top;
    };
    const levels = Math.max(2, Math.ceil(Math.log2(k + 1)));
    const S = (o = {}) => () => ({
      lists: k ? Ls.map((vals, r) => ({ vals, taken: taken[r], hl: o.listHl && o.listHl[r] })) : undefined,
      listsLabel: "the k sorted lists",
      heaps: [{ name: "min-heap of list fronts (smallest on top)", min: true, items: heap.map((h) => ({ id: h.id, v: h.v })), hl: o.hl || {}, levels }],
      out: { label: "merged list", items: out.slice() },
      note: o.note !== undefined ? o.note : k === 0 ? "there are no lists at all" : undefined,
    });
    const vars = () => ({ "heap size": heap.length, "heap top": heap.length ? heap[0].v : "–", merged: out.length });
    let whyTop = false, whyPush = false;
    T.step("init", { vars: vars(), state: S(), phase: "Seed the heap with every list's front", say: `${k} list${k === 1 ? "" : "s"} with ${total} node${total === 1 ? "" : "s"} in total. We create an empty **min-heap**: it will hold the current front node of each list, smallest on top.`, op: "heap = min-heap { }", act: "EMPTY_HEAP" });
    Ls.forEach((vals, r) => {
      if (!vals.length) { T.step("seed", { w: 1, vars: vars(), state: S({ note: `list ${r + 1} is empty (null): skipped` }), say: `List ${r + 1} is empty, so it is \`null\`: we **skip** it. Pushing \`null\` would crash on the first comparison.`, op: `lists[${r}] == null  →  skip`, act: "SKIP_EMPTY" }); return; }
      const it = { id: `${r}_0`, v: vals[0], r, i: 0 };
      push(it);
      T.step("seed", { w: lg(heap.length), vars: vars(), state: S({ hl: { [it.id]: "cur" } }), say: `Push the front of list ${r + 1}, which is **${vals[0]}**. The heap now holds ${heap.length} front${heap.length === 1 ? "" : "s"}; the smallest is on top.`, op: `heap.push(lists[${r}])  (${vals[0]})`, act: "PUSH_FRONT",
        why: r === 0 || whyTop ? null : { title: "Why only one node per list?", text: "Each list is sorted, so the other nodes of a list are all larger than its front. Only the front can be the overall minimum. Keeping just `k` nodes in the heap is why every operation costs $O(\\log k)$, not $O(\\log N)$." } });
      whyTop = true;
    });
    T.phase("Pop the smallest, push its successor");
    while (heap.length) {
      T.step("loop", { vars: vars(), state: S(), say: `The heap holds ${heap.length} front${heap.length === 1 ? "" : "s"}: there are still unused nodes.`, op: `heap.empty()  →  false`, act: "HEAP_NOT_EMPTY" });
      const top = pop();
      T.step("pop", { w: lg(heap.length + 1), vars: Object.assign(vars(), { node: top.v }), state: S({ listHl: { [top.r]: { [top.i]: "cur" } } }), say: `Pop the top: the smallest front is **${top.v}** (from list ${top.r + 1}). Nothing unused anywhere is smaller, because every other front is at least this large and each list is sorted.`, op: `node = heap.pop()  →  ${top.v}`, act: "POP_MIN",
        why: whyPush ? null : { title: "Why is the popped node safe to output?", text: "Every unused node is either a front in the heap or sits behind a front in its own (sorted) list. The heap's minimum is no larger than any front, so it is no larger than anything behind a front either." } });
      whyPush = true;
      out.push(top.v); taken[top.r]++;
      T.step("link", { vars: vars(), state: S({ listHl: { [top.r]: { [top.i]: "ok" } } }), say: `Link it to the end of the answer (\`tail.next = node\`). The merged list now has **${out.length}** node${out.length === 1 ? "" : "s"}: [${out.join(", ")}].`, op: `tail.next = node;  tail = node`, act: "APPEND" });
      const nxt = Ls[top.r][top.i + 1];
      if (nxt !== undefined) {
        const it = { id: `${top.r}_${top.i + 1}`, v: nxt, r: top.r, i: top.i + 1 };
        push(it);
        T.step("push", { w: lg(heap.length), vars: vars(), state: S({ hl: { [it.id]: "cur" } }), say: `\`node.next\` exists: the next node of list ${top.r + 1}, **${nxt}**, becomes that list's new front and is pushed. The heap is back to one front per non-empty list.`, op: `heap.push(node.next)  (${nxt})`, act: "PUSH_NEXT" });
      } else {
        T.step("push", { vars: vars(), state: S(), say: `\`node.next\` is \`null\`: list ${top.r + 1} is used up, so there is nothing to push. The heap shrinks by one.`, op: "node.next == null  →  nothing to push", act: "LIST_DONE" });
      }
    }
    T.step("loop", { vars: vars(), state: S(), say: "The heap is empty: every node of every list has been appended.", op: "heap.empty()  →  true", act: "HEAP_EMPTY" });
    T.step("ret", { vars: { "return": out.length ? `list starting at ${out[0]}` : "null" }, state: S(), say: out.length ? `Return \`dummy.next\`: the merged list is **[${out.join(", ")}]**.` : "Nothing was ever pushed, so `dummy.next` is `null`: the merged list is empty.", op: "return dummy.next", act: "DONE" });
    T.result(out.slice());
  },
  fuzz(rnd) {
    const k = Math.floor(rnd() * 6);
    return { lists: Array.from({ length: k }, () => Array.from({ length: Math.floor(rnd() * 5) }, () => Math.floor(rnd() * 15) - 7).sort((a, b) => a - b)) };
  },
  gen(n) { return { lists: Array.from({ length: n }, (_, i) => [(i * 7) % n]) }; },

  complexity: {
    time: {
      tex: "O(N \\log k)", title: "N pushes and N pops on a heap of at most k nodes", short: "every node enters and leaves a heap of size \\le k once",
      derive: [
        "|\\text{heap}| \\le k \\;\\Rightarrow\\; c_{\\text{push}},\\, c_{\\text{pop}} = O(\\log k) || one front per list, never more",
        "\\text{each node is pushed once and popped once} \\;\\Rightarrow\\; 2N \\text{ heap operations} || including the k initial pushes",
        "T(N,k) = 2N \\cdot O(\\log k) + N \\cdot c || plus constant work per node to link it",
        "!T(N,k) = O(N \\log k) || versus $O(N \\cdot k)$ for scanning the fronts",
      ],
      where: "$N$ is the total number of nodes and $k$ the number of lists. In the measured table every list has one node, so $N = k = n$ and the formula is $n \\log_2 n$; the heap steps are counted as one step per level a node can sift through.",
    },
    space: {
      tex: "O(k)", title: "the heap holds at most one node per list", short: "k nodes at most",
      derive: [
        "S = |\\text{heap}| \\cdot s_{\\text{ptr}} \\le k \\cdot s_{\\text{ptr}} || one front per list",
        "!S = O(k) || the nodes themselves are re-linked, not copied",
      ],
      where: "The answer list re-uses the input nodes, so no $O(N)$ memory is needed. (Collect-and-sort would use $O(N)$.) The recursion-free loop adds only a few pointers.",
    },
    limit: "Any comparison-based merge needs $\\Omega(N \\log k)$ comparisons (merging $k$ sorted runs is information-theoretically that hard), so the heap method is optimal. The divide-and-conquer pairwise merge matches it with $O(1)$ extra heap space.",
    measure: { label: "n = k = N (every list has one node)", fTex: "n \\log_2 n", f: (n) => n * Math.log2(n), sizes: [8, 16, 32, 64, 128, 256], growth: "n log n" },
  },

  mistakes: [
    { title: "Pushing `null` lists into the heap", what: "`for (auto l : lists) heap.push(l);` without a check.", why: "Empty lists are rare in the examples, so the guard is forgotten.", breaks: "The comparator reads `a->val` of a null pointer and the program crashes (it happens for `lists = [[]]`).", avoid: "`if (l) heap.push(l);` before every push." },
    { title: "Using the default max-heap", what: "`priority_queue<ListNode*, vector<ListNode*>, Cmp>` with `Cmp` returning `a->val < b->val`, or the plain default.", why: "`priority_queue` returns the *largest* element and the comparator direction is easy to reverse.", breaks: "The merged list comes out in **descending** order (or random-looking), and the test fails.", avoid: "For a min-heap the comparator must say *\"a is worse than b\"*: `a->val > b->val` (or use `greater`)." },
    { title: "Forgetting to push `node->next`", what: "Popping nodes but never adding the successor.", why: "The seeding loop already pushed \"all the lists\".", breaks: "After one pop per list the heap is empty and the answer contains only the first node of each list.", avoid: "After linking a node, push `node->next` if it is not null." },
    { title: "Pushing values instead of nodes", what: "`priority_queue<int>` holding only the numbers.", why: "The values are what we compare.", breaks: "Once a value is popped we no longer know which list it came from, so we cannot find that list's next node.", avoid: "Store the node pointer (or a `(value, list index)` pair)." },
    { title: "Merging the lists one after another", what: "`ans = merge(ans, lists[i])` for each `i`.", why: "It re-uses `mergeTwoLists`, which is easy.", breaks: "The growing answer is re-walked every time: $O(k \\cdot N)$, which is too slow for $k = 10^4$.", avoid: "Use the heap, or merge the lists in **pairs** (divide and conquer)." },
  ],

  followUps: [
    {
      q: "Do it **without a heap**, by merging the lists in pairs (divide and conquer).",
      a: "Merge list 0 with list 1, list 2 with list 3, and so on; then merge the results in pairs again. There are $\\log_2 k$ rounds and every round touches each node once, so it is $O(N \\log k)$, with only $O(\\log k)$ stack space for the recursion. It re-uses the two-list merge from the previous lesson.",
      cpp: `ListNode* mergeKDC(vector<ListNode*>& L, int lo, int hi) {
    if (lo > hi) return nullptr;
    if (lo == hi) return L[lo];
    int mid = (lo + hi) / 2;
    ListNode* a = mergeKDC(L, lo, mid);
    ListNode* b = mergeKDC(L, mid + 1, hi);
    ListNode dummy; ListNode* t = &dummy;
    while (a && b) {
        if (a->val <= b->val) { t->next = a; a = a->next; }
        else { t->next = b; b = b->next; }
        t = t->next;
    }
    t->next = a ? a : b;
    return dummy.next;
}`,
      js: `function mergeKDC(L, lo, hi) {
  if (lo > hi) return null;
  if (lo === hi) return L[lo];
  const mid = (lo + hi) >> 1;
  let a = mergeKDC(L, lo, mid), b = mergeKDC(L, mid + 1, hi);
  const dummy = new ListNode(0); let t = dummy;
  while (a && b) {
    if (a.val <= b.val) { t.next = a; a = a.next; }
    else { t.next = b; b = b.next; }
    t = t.next;
  }
  t.next = a ? a : b;
  return dummy.next;
}`,
      time: "O(N log k)", space: "O(log k)",
    },
    {
      q: "Find the **K-th smallest element in a sorted matrix** (each row and column sorted).",
      a: "Treat each row as a sorted list: put the first element of each row in a min-heap and pop $K$ times, pushing the next element of the popped row. The $K$-th popped value is the answer: $O(K \\log n)$ for an $n \\times n$ matrix. It is exactly this algorithm with the nodes replaced by matrix cells.",
      time: "O(K log n)", space: "O(n)",
    },
    {
      q: "Find the **smallest range** that contains at least one number from each of the $k$ lists.",
      a: "Run the same heap, but also track the **maximum** value currently in the heap. At every step the range `[heap.top, max]` covers one element from every list; record the smallest such range, then pop the minimum and push its successor (updating the maximum). Stop as soon as a list is exhausted. It is $O(N \\log k)$.",
      time: "O(N log k)", space: "O(k)",
    },
    {
      q: "The lists are **huge files on disk** that do not fit in memory. How does this help?",
      a: "This is the merge phase of external merge sort. Keep one buffered *block* from each file in memory and use the heap to choose the next smallest line; refill a file's buffer when it is empty. Memory use is $O(k)$ lines (plus buffers), and every line is read and written once.",
      time: "O(N log k)", space: "O(k)",
    },
  ],

  related: [
    { id: "merge-two-sorted-lists", why: "The two-list merge that this problem generalises (and which the divide-and-conquer version re-uses)." },
    { id: "find-median-from-data-stream", why: "Another heap problem: two heaps keep the middle of a stream available in $O(\\log n)$." },
    { id: "meeting-rooms-ii", why: "A min-heap again: the earliest-finishing room is always on top." },
    { id: "top-k-frequent-elements", why: "Selects the best $k$ items; a heap of size $k$ keeps the cost at $O(n \\log k)$." },
  ],
  patternNote: "**The k-way merge** is the heap pattern in its purest form: keep *one candidate per source* in a min-heap, repeatedly remove the smallest and replace it with its successor. It turns \"scan all sources\" ($O(k)$) into \"ask the heap\" ($O(\\log k)$), and it is the same loop for lists, arrays, matrices rows and sorted files.",
  takeaways: [
    "Scanning `k` fronts per output node costs $O(N \\cdot k)$; a **min-heap of fronts** costs $O(\\log k)$.",
    "The heap holds **one node per non-empty list**: pop the smallest, then push its successor.",
    "Never push `null`; use a min-heap comparator (`a->val > b->val` in C++); store **nodes**, not values.",
    "Time $O(N \\log k)$, space $O(k)$. Divide and conquer (merge in pairs) gives the same time.",
    "The same loop solves k-th smallest in a matrix, smallest range, and external merge sort.",
  ],
});
