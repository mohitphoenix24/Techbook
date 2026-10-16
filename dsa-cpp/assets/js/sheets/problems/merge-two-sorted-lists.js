SHEETS.define({
  id: "merge-two-sorted-lists",
  viz: "list",
  io: { fn: "mergeTwoLists", params: [["list1", "list"], ["list2", "list"]], ret: "list", labels: { list1: "list1 (sorted, as an array)", list2: "list2 (sorted, as an array)" } },

  statement: `You are given the heads of two sorted linked lists, \`list1\` and \`list2\`.

Merge the two lists into **one sorted list**. The list should be made by **splicing together the nodes** of the first two lists (no need to create new nodes). Return the head of the merged linked list.`,
  examples: [
    { input: "list1 = [1, 2, 4], list2 = [1, 3, 4]", output: "[1, 1, 2, 3, 4, 4]", explain: "At every step the smaller of the two front nodes goes next." },
    { input: "list1 = [], list2 = []", output: "[]", explain: "Nothing to merge." },
    { input: "list1 = [], list2 = [0]", output: "[0]", explain: "An empty list contributes nothing; the other list is the answer." },
  ],
  constraints: ["The number of nodes in both lists is in the range $[0, 50]$", "$-100 \\le$ `Node.val` $\\le 100$", "Both `list1` and `list2` are sorted in **non-decreasing** order"],
  check(input) {
    const a = input.list1, b = input.list2;
    if (a.length > 5 || b.length > 5) return "for the animation use at most 5 nodes in each list";
    if ([...a, ...b].some((v) => Math.abs(v) > 99)) return "keep the values between -99 and 99";
    const sorted = (x) => x.every((v, i) => i === 0 || x[i - 1] <= v);
    if (!sorted(a)) return "list1 must be sorted in non-decreasing order, e.g. [1,2,4]";
    if (!sorted(b)) return "list2 must be sorted in non-decreasing order, e.g. [1,3,4]";
    return null;
  },

  intuition: {
    find: "One sorted list that contains **all the nodes** of both lists, produced by re-linking the nodes we already have.",
    beginner: "Pour every value from both lists into one array, sort the array, and build a new list from it.",
    works: "A sorted array of all the values is exactly the merged answer, and building a list from it is straightforward.",
    slow: "Sorting costs $O((n+m)\\log(n+m))$ and the array plus the new nodes cost $O(n+m)$ **extra memory**. Worst of all, it ignores the most useful fact in the statement: both lists are *already sorted*.",
    repeat: "The sort compares values that we already know are in order (the values inside list1, and inside list2). All that remains is to decide how the two lists **interleave**.",
    remember: "Because each list is sorted, its **front node is its smallest**. So the smallest value not yet placed is always one of just two candidates: the front of list1 or the front of list2.",
    observation: "At every step compare the two front nodes, **take the smaller one** and attach it to the end of the merged list; then move that list's front forward. When one list runs out, the other (still sorted, and all of it no smaller than what we have placed) can be attached **in one go**. A **dummy** node in front of the answer removes the \"what is the head?\" special case.",
    leads: "Keep a `dummy` node and a `tail` pointer starting at it. While both lists have nodes: link the smaller front node after `tail`, advance that list, advance `tail`. Finally attach whichever list is left over and return `dummy.next`.",
  },

  flow: [
    "Dump both lists into an array, sort it, and build a new list.",
    "The sorted array is exactly the merged answer.",
    "$O((n+m)\\log(n+m))$ time and $O(n+m)$ extra memory; the lists were already sorted.",
    "The front node of a sorted list is its smallest, so only two candidates matter at each step.",
    "Take the smaller front, attach it behind `tail`; attach the leftover list at the end. A dummy node hides the head case.",
    "One pass, re-linking the existing nodes: $O(n+m)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force:** copy every value of both lists into a `vector`, **sort** it, then build a brand-new list from the sorted values.",
    why: "Sorting costs $O(N \\log N)$ with $N = n + m$, and the vector plus $N$ new nodes cost $O(N)$ extra memory. It also does not splice the original nodes, which the statement asks for, and throws away the fact that the two lists are already sorted.",
    time: "O((n+m) log(n+m))", space: "O(n+m)",
    measure: { fTex: "N \\log_2 N", f: (n) => n * Math.log2(Math.max(n, 2)), ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    ListNode* mergeTwoLists(ListNode* list1, ListNode* list2) {
        vector<int> all;
        for (ListNode* p = list1; p; p = p->next) all.push_back(p->val);
        for (ListNode* p = list2; p; p = p->next) all.push_back(p->val);
        sort(all.begin(), all.end());
        ListNode dummy;
        ListNode* tail = &dummy;
        for (int v : all) { tail->next = new ListNode(v); tail = tail->next; }
        return dummy.next;
    }
};`,
    js: `function mergeTwoLists(list1, list2) {
  const all = [];
  for (let p = list1; p; p = p.next) all.push(p.val);
  for (let p = list2; p; p = p.next) all.push(p.val);
  all.sort((a, b) => a - b);
  const dummy = new ListNode(0);
  let tail = dummy;
  for (const v of all) { tail.next = new ListNode(v); tail = tail.next; }
  return dummy.next;
}`,
  },

  pattern: {
    name: "Linked List Pointers (dummy node + tail)",
    why: "Building a list in order is easiest with a **tail pointer** that always sits on the last node of the answer, and a **dummy node** in front of the answer so that the very first append is no different from the others. The same *dummy + tail* idea appears in every problem that builds or filters a list.",
    recognize: [
      "You must **merge, filter or partition** lists while keeping the original nodes.",
      "The first node of the result is not known until the algorithm has started (the head can change).",
      "Two (or $k$) sorted inputs where you repeatedly need *\"the smallest front element\"*.",
      "The statement says *\"splice\"*, *\"in place\"* or *\"do not create new nodes\"*.",
    ],
  },

  optimal: {
    idea: "Create a `dummy` node and let `tail` point to it. While both `list1` and `list2` have nodes, compare their front values; attach the smaller node after `tail` and move that list's pointer forward; then move `tail` onto the node just attached. When one list is empty, hook the other one onto `tail` (it is already sorted) and return `dummy.next`.",
    steps: [
      "Create `dummy` and set `tail = &dummy`.",
      "While `list1` and `list2` are both non-null: compare `list1.val` with `list2.val`.",
      "If `list1.val <= list2.val`: `tail.next = list1`, then `list1 = list1.next`. Otherwise do the same with `list2`.",
      "Move `tail = tail.next` (it is now on the node we just attached).",
      "After the loop, at most one list is non-empty: `tail.next = list1 ? list1 : list2`.",
      "Return `dummy.next`.",
    ],
    invariant: "**The nodes after `dummy` up to `tail` are the smallest nodes seen so far, in sorted order; every node still in `list1` or `list2` is no smaller than `tail`'s value.**",
    correct: "Initially the merged part is empty (only `dummy`), so the invariant holds. Each iteration takes the smaller of the two fronts; because each list is sorted, that node is the smallest of **all** nodes not yet placed, so appending it keeps the merged part sorted and preserves the invariant for the rest. Each iteration places exactly one node, so the loop ends after at most $n + m$ iterations. When one list becomes empty, the other contains only nodes at least as large as everything placed and is itself sorted, so attaching it whole completes a sorted list. All nodes appear exactly once because each is attached once.",
  },

  cpp: `class Solution {
public:
    ListNode* mergeTwoLists(ListNode* list1, ListNode* list2) {
        ListNode dummy;                         // sentinel before the answer
        ListNode* tail = &dummy;                // last node of the merged list //@init
        while (list1 != nullptr && list2 != nullptr) {   //@loop
            if (list1->val <= list2->val) {     // compare the two fronts //@cmp
                tail->next = list1;             // take from list1 //@take1
                list1 = list1->next;
            } else {
                tail->next = list2;             // take from list2 //@take2
                list2 = list2->next;
            }
            tail = tail->next;                  // tail moves onto it //@adv
        }
        tail->next = list1 ? list1 : list2;     // attach the leftover //@rest
        return dummy.next;                      // skip the sentinel //@ret
    }
};`,
  js: `function mergeTwoLists(list1, list2) {
  const dummy = new ListNode(0);         // sentinel before the answer
  let tail = dummy;                      // last node of the merged list //@init
  while (list1 !== null && list2 !== null) {   //@loop
    if (list1.val <= list2.val) {        // compare the two fronts //@cmp
      tail.next = list1;                 // take from list1 //@take1
      list1 = list1.next;
    } else {
      tail.next = list2;                 // take from list2 //@take2
      list2 = list2.next;
    }
    tail = tail.next;                    // tail moves onto it //@adv
  }
  tail.next = list1 ? list1 : list2;     // attach the leftover //@rest
  return dummy.next;                     // skip the sentinel //@ret
}`,

  tests: [
    { name: "Example 1: [1,2,4] and [1,3,4]", kind: "normal", input: { list1: [1, 2, 4], list2: [1, 3, 4] } },
    { name: "Example 2: both empty", kind: "normal", input: { list1: [], list2: [] } },
    { name: "Example 3: one empty", kind: "normal", input: { list1: [], list2: [0] } },
    { name: "Perfectly interleaved", kind: "normal", input: { list1: [1, 3, 5], list2: [2, 4, 6] } },
    { name: "list1 entirely before list2", kind: "edge", input: { list1: [1, 2, 3], list2: [7, 8, 9] }, why: "Every node of `list1` is smaller, so `list1` is used up first and `list2` is still full. The leftover attach (`tail->next = list2`) moves all three of its nodes at once. A loop `while (list1 || list2)` that forgets this step would lose them." },
    { name: "list2 entirely before list1", kind: "edge", input: { list1: [10, 20], list2: [1, 2, 3] }, why: "The mirror case: `list2` is consumed first and the leftover is `list1`. It tests the other branch of `list1 ? list1 : list2`." },
    { name: "All values equal", kind: "edge", input: { list1: [2, 2, 2], list2: [2, 2] }, why: "Every comparison is a tie. With `<=` the front of `list1` wins each tie, so the merge is **stable** (nodes of `list1` stay before equal nodes of `list2`); with `<` the nodes of `list2` would go first. Both give a sorted result, but stability matters for records." },
    { name: "Negative values", kind: "edge", input: { list1: [-9, -3, 0], list2: [-5, -4, 1] }, why: "Negative numbers compare like any other, and nothing in the algorithm treats `0` or a negative number specially (a `0` sentinel for \"end\" would fail here)." },
    { name: "Very different lengths", kind: "corner", input: { list1: [1], list2: [2, 3, 4, 5, 6] }, why: "`list1` has one node and runs out after the first iteration; the remaining five nodes of `list2` are attached **in one step**, not one by one." },
    { name: "One node versus none", kind: "corner", input: { list1: [5], list2: [] }, why: "The loop never runs because `list2` is `null`; the answer comes entirely from the leftover step `tail->next = list1`, and `dummy.next` is that node. Without the dummy node, this is the case that needs special code." },
  ],

  trace(input, T) {
    const A = input.list1, B = input.list2;
    const nodes = [
      ...A.map((v, i) => ({ id: "a" + i, val: v, slot: i, row: 0, sub: i === 0 ? "list1" : undefined })),
      ...B.map((v, i) => ({ id: "b" + i, val: v, slot: i, row: 1, sub: i === 0 ? "list2" : undefined })),
      { id: "D", val: "·", slot: 0, row: 2, sub: "dummy" },
    ];
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const next = { D: null };
    A.forEach((_, i) => (next["a" + i] = i + 1 < A.length ? "a" + (i + 1) : null));
    B.forEach((_, i) => (next["b" + i] = i + 1 < B.length ? "b" + (i + 1) : null));
    let l1 = A.length ? "a0" : null, l2 = B.length ? "b0" : null, tail = "D";
    const placed = [];
    let just = null;
    let whyCmp = false, whyRest = false;
    const nm = (id) => (id === null ? "null" : id === "D" ? "dummy" : `${id[0] === "a" ? "list1" : "list2"}[${id.slice(1)}] = ${byId[id].val}`);
    const val = (id) => byId[id].val;
    const S = (o = {}) => () => {
      const hl = { D: "dim" };
      placed.forEach((id) => (hl[id] = "ok"));
      if (o.cmp) { if (l1) hl[l1] = "cmp"; if (l2) hl[l2] = "cmp"; }
      if (o.hit) hl[o.hit] = "hit";
      const ptr = {};
      if (l1 !== null) ptr.l1 = l1;
      if (l2 !== null) ptr.l2 = l2;
      ptr.tail = tail;
      const notes = [];
      if (l1 === null) notes.push("list1 is null (used up)");
      if (l2 === null) notes.push("list2 is null (used up)");
      return { nodes: nodes.map((n) => Object.assign({}, n)), next: Object.assign({}, next), ptr, hl, ehl: o.ehl, rowLabels: ["list1", "list2", "merged list"], rowGap: 100, ptrBottom: ["tail"], note: notes.join("   ·   ") || undefined, label: "two sorted lists, merged by re-linking their nodes" };
    };
    const vars = () => ({ l1: l1 === null ? "null" : val(l1), l2: l2 === null ? "null" : val(l2), tail: tail === "D" ? "dummy" : val(tail), merged: placed.length });
    const place = (id) => { placed.push(id); byId[id].row = 2; byId[id].slot = placed.length; };
    T.step("init", { vars: vars(), state: S(), phase: "Take the smaller front node", say: `A \`dummy\` node starts the merged list and \`tail\` points at it. \`l1\` is the front of list1${A.length ? "" : " (it is empty)"}, \`l2\` the front of list2${B.length ? "" : " (it is empty)"}.`, op: "tail = &dummy", act: "START" });
    while (l1 !== null && l2 !== null) {
      T.step("loop", { vars: vars(), state: S({ cmp: true }), say: `Both lists still have nodes (front values **${val(l1)}** and **${val(l2)}**), so there is something to compare.`, op: "list1 != null && list2 != null  →  true", act: "BOTH_NON_EMPTY" });
      const left = val(l1) <= val(l2);
      T.step("cmp", { vars: vars(), state: S({ cmp: true }), say: `Compare the fronts: **${val(l1)}** (list1) against **${val(l2)}** (list2). ${left ? `${val(l1)} ≤ ${val(l2)}, so list1's front goes next.` : `${val(l1)} > ${val(l2)}, so list2's front goes next.`}`, op: `${val(l1)} <= ${val(l2)}  →  ${left}`, act: left ? "TAKE_LIST1" : "TAKE_LIST2",
        why: whyCmp ? null : { title: "Why compare only the two fronts?", text: "Each list is sorted, so its front node is its smallest. The smallest of all unplaced nodes must therefore be one of these two fronts: nothing deeper in either list can be smaller." } });
      whyCmp = true;
      const pick = left ? l1 : l2;
      next[tail] = pick;
      place(pick);
      just = pick;
      if (left) l1 = next[l1]; else l2 = next[l2];
      T.step(left ? "take1" : "take2", { vars: vars(), state: S({ hit: pick, ehl: { [tail]: "hot" } }), say: `**Link** the node ${val(pick)} after \`tail\`: \`tail.next = ${left ? "list1" : "list2"}\`. It joins the merged list, and \`${left ? "list1" : "list2"}\` moves to its next node.`, op: `tail.next = ${left ? "list1" : "list2"}  (${val(pick)});  ${left ? "list1" : "list2"} = ${left ? "list1" : "list2"}.next`, act: left ? "LINK_LIST1" : "LINK_LIST2" });
      tail = pick;
      T.step("adv", { vars: vars(), state: S({ hit: pick }), say: `\`tail = tail.next\`: \`tail\` now sits on the node just attached (${val(pick)}), ready for the next link.`, op: `tail = tail.next = ${val(pick)}`, act: "ADVANCE_TAIL" });
    }
    T.step("loop", { vars: vars(), state: S(), say: l1 === null && l2 === null ? "Both lists are empty: nothing is left to compare." : `${l1 === null ? "list1" : "list2"} is \`null\`: it has been used up, so comparing fronts is no longer possible.`, op: "list1 != null && list2 != null  →  false", act: "LOOP_ENDS" });
    const rest = l1 !== null ? l1 : l2;
    next[tail] = rest;
    const moved = [];
    for (let p = rest; p !== null; p = next[p]) moved.push(p);
    moved.forEach(place);
    T.step("rest", { vars: vars(), state: S({ ehl: { [tail]: "hot" } }), say: rest === null ? "Nothing is left over, so `tail.next` becomes `null`: the merged list is complete." : `Attach the leftover list in **one step**: \`tail.next = ${rest[0] === "a" ? "list1" : "list2"}\`. It is sorted and every value is at least as large as everything placed, so ${moved.length} node${moved.length === 1 ? "" : "s"} join${moved.length === 1 ? "s" : ""} at once.`, op: `tail.next = ${rest === null ? "null" : rest[0] === "a" ? "list1" : "list2"}`, act: "ATTACH_REST",
      why: whyRest || rest === null ? null : { title: "Why can the leftover go in whole?", text: "It is still sorted, and each of its values is at least as big as every value already placed (otherwise it would have been picked earlier). Comparing node by node would only repeat the same decision." } });
    const res = []; let guard = 0;
    for (let p = next.D; p !== null && guard++ < 1000; p = next[p]) res.push(val(p));
    T.step("ret", { vars: { "return": res.length ? `list starting at ${res[0]}` : "null" }, state: S(), say: res.length ? `Return \`dummy.next\`, skipping the sentinel: the merged list is **[${res.join(", ")}]**.` : "Return `dummy.next`, which is `null`: the merged list is empty.", op: "return dummy.next", act: "DONE" });
    T.result(res);
  },
  fuzz(rnd) {
    const mk = () => Array.from({ length: Math.floor(rnd() * 7) }, () => Math.floor(rnd() * 13) - 6).sort((a, b) => a - b);
    return { list1: mk(), list2: mk() };
  },
  gen(n) {
    const h = Math.ceil(n / 2);
    return { list1: Array.from({ length: h }, (_, i) => 2 * i), list2: Array.from({ length: n - h }, (_, i) => 2 * i + 1) };
  },

  complexity: {
    time: {
      tex: "O(n + m)", title: "each loop iteration places exactly one node", short: "one pass over both lists, a constant amount of work per node",
      derive: [
        "T_{\\text{loop}} = \\sum_{k=1}^{I} (c_{\\text{cmp}} + c_{\\text{link}} + c_{\\text{adv}}) = c\\,I || $I$ iterations, each: one comparison, one link, one pointer move",
        "I \\le n + m || every iteration attaches one node and no node is attached twice",
        "T_{\\text{rest}} = c' || attaching the leftover list is a single pointer assignment",
        "!T(n, m) = c\\,(n + m) + c' = O(n + m) || linear in the total number of nodes",
      ],
      where: "Here $n$ and $m$ are the lengths of the two lists. The loop stops as soon as one list is empty, so it can be shorter than $n + m$; the worst case (perfectly interleaved lists) is the one measured in the table below, where $N = n + m$.",
    },
    space: {
      tex: "O(1)", title: "a dummy node and a few pointers", short: "`dummy`, `tail`, `list1`, `list2`",
      derive: [
        "S = |\\text{dummy}| + |\\text{tail}| + |\\text{list1}| + |\\text{list2}| = c || the only memory added",
        "!S = O(1) || no node is created: the existing nodes are re-linked",
      ],
      where: "The recursive version uses $O(n + m)$ stack frames, and the brute force needs $O(n + m)$ for its array and new nodes. The iterative splice needs neither.",
    },
    limit: "Every node must be looked at at least once to be placed, so $\\Omega(n + m)$ time is needed; $O(1)$ extra space is optimal. (Merging by repeated *galloping* can be faster when the lists are very unbalanced, but is $O(n + m)$ in the worst case.)",
    measure: { label: "N = n + m = total number of nodes (interleaved)", fTex: "N", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Not using a dummy node", what: "Trying to choose the head with an `if` before the loop and then continue with a separate pointer.", why: "The first node feels special.", breaks: "Extra branches for the empty lists and the head; this is where most off-by-one pointer bugs come from.", avoid: "Start from a `dummy` node and return `dummy.next`: the first append is identical to all others." },
    { title: "Forgetting to attach the leftover list", what: "Ending after the `while` loop without `tail->next = list1 ? list1 : list2`.", why: "Assuming both lists end together.", breaks: "The remaining nodes are dropped: `[1,2,3]` merged with `[7,8,9]` returns `[1,2,3]`.", avoid: "After the loop, hook up whichever list is not empty." },
    { title: "Looping while either list is non-empty without null checks", what: "`while (list1 || list2) { if (list1->val <= list2->val) ... }`.", why: "It seems to handle the leftover automatically.", breaks: "Once one list is `null`, `list1->val` or `list2->val` dereferences a null pointer.", avoid: "Loop only while **both** exist, then attach the leftover." },
    { title: "Moving `tail` before linking", what: "`tail = tail->next;` placed before `tail->next = list1;`.", why: "Mixing up the order of \"link\" and \"advance\".", breaks: "`tail->next` is `null` (or stale) at that moment, so the program crashes or the new node is attached in the wrong place.", avoid: "Link first (`tail->next = chosen`), then move `tail` onto it." },
    { title: "Returning `dummy` instead of `dummy.next`", what: "`return &dummy;` or `return dummy;`.", why: "The dummy is the thing we have been holding.", breaks: "The answer starts with an extra node of value 0, and in C++ it also points to a stack object that no longer exists.", avoid: "Return `dummy.next`." },
  ],

  followUps: [
    {
      q: "Write the **recursive** version. What does it cost?",
      a: "If one list is empty, return the other. Otherwise the smaller front node becomes the head of the answer, and its `next` is the merge of the rest: `a.next = merge(a.next, b)`. Each call places one node, so it is $O(n + m)$ time, but the recursion depth reaches $n + m$, so the stack uses $O(n + m)$ space. The iterative version is better in space.",
      cpp: `ListNode* mergeRec(ListNode* a, ListNode* b) {
    if (!a) return b;
    if (!b) return a;
    if (a->val <= b->val) { a->next = mergeRec(a->next, b); return a; }
    b->next = mergeRec(a, b->next);
    return b;
}`,
      js: `function mergeRec(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.val <= b.val) { a.next = mergeRec(a.next, b); return a; }
  b.next = mergeRec(a, b.next);
  return b;
}`,
      time: "O(n + m)", space: "O(n + m)",
    },
    {
      q: "Merge **k** sorted lists.",
      a: "Merging them one after another costs $O(k \\cdot N)$ in the worst case. A **min-heap** holding the current front of each list gives the next smallest in $O(\\log k)$, so the total is $O(N \\log k)$; or merge the lists in pairs, like the merge phase of merge sort, for the same bound. This is the next problem in the sheet.",
      time: "O(N log k)", space: "O(k)",
    },
    {
      q: "Use this routine to **sort a linked list** in $O(n \\log n)$.",
      a: "Merge sort: find the middle with slow and fast pointers, cut the list in two, sort each half recursively and `merge` them with exactly this function. There are $\\log n$ levels and each level touches every node once, so it is $O(n \\log n)$ time and $O(\\log n)$ stack space. It is the natural sort for linked lists because it needs no random access.",
      time: "O(n log n)", space: "O(log n)",
    },
    {
      q: "Merge two sorted **arrays** where the first has room at its end, in place.",
      a: "Fill from the **back**: with two pointers at the largest elements of each array and a write pointer at the very end of the first array, place the larger element each time and move left. Writing from the end never overwrites an element that is still needed, so it is $O(n + m)$ time and $O(1)$ space.",
      time: "O(n + m)", space: "O(1)",
    },
  ],

  related: [
    { id: "merge-k-sorted-lists", why: "The same merge step, applied to $k$ lists with a min-heap choosing the smallest front." },
    { id: "reverse-linked-list", why: "Another in-place rewiring of `next` pointers, with a trailing pointer." },
    { id: "reorder-list", why: "Splits a list at its middle and then interleaves the two halves with a similar merge." },
    { id: "merge-intervals", why: "Another \"sweep and combine\" over sorted data, producing a new sorted sequence." },
  ],
  patternNote: "**Dummy node + tail pointer** is the standard way to *build* a linked list in order: the dummy removes the empty-list and head special cases, the tail always marks where the next node goes. Whenever you must produce a list while walking other lists (merge, filter, partition, add two numbers), reach for this pair first.",
  takeaways: [
    "Both lists are sorted, so the next node is always one of the **two fronts**: take the smaller.",
    "Use a **dummy** node and a **tail** pointer: link `tail.next = chosen`, then move `tail` and the chosen list.",
    "When one list ends, attach the other **whole**; do not forget this step.",
    "Return `dummy.next`; loop on `list1 && list2` so no null is dereferenced.",
    "Time $O(n + m)$, space $O(1)$: nodes are re-linked, never copied. This is the engine of merge sort on lists.",
  ],
});
