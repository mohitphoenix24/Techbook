SHEETS.define({
  id: "reorder-list",
  viz: "list",
  io: { fn: "reorderList", params: [["head", "list"]], ret: "void", inplace: "head", labels: { head: "head (list as an array)" } },

  statement: `You are given the head of a singly linked list. The list can be represented as:

\`L0 → L1 → … → Ln-1 → Ln\`

**Reorder the list** to be in the following form:

\`L0 → Ln → L1 → Ln-1 → L2 → Ln-2 → …\`

You may **not** modify the values in the list's nodes. Only the nodes themselves may be changed. The function does not return anything: it reorders the list **in place**.`,
  examples: [
    { input: "head = [1, 2, 3, 4]", output: "[1, 4, 2, 3]", explain: "First, last, second, second-last: 1, 4, 2, 3." },
    { input: "head = [1, 2, 3, 4, 5]", output: "[1, 5, 2, 4, 3]", explain: "For an odd length the middle node ends up last." },
  ],
  constraints: ["The number of nodes in the list is in the range $[1, 5 \\cdot 10^4]$", "$1 \\le$ `Node.val` $\\le 1000$"],
  check(input) {
    if (input.head.length > 9) return "for the animation use at most 9 nodes";
    if (input.head.some((v) => Math.abs(v) > 99)) return "keep the values between -99 and 99";
    return null;
  },

  intuition: {
    find: "The same nodes, interleaved from **both ends**: first, last, second, second-last, and so on. The front of the list must be paired with the *back* of the list, and a singly linked list cannot walk backwards.",
    beginner: "Copy all the nodes (their addresses) into an array. Now use two indices, one from the left and one from the right, and re-link: `v[i].next = v[j]`, `v[j].next = v[i+1]`, moving the indices inwards.",
    works: "An array gives random access, so the last node is as easy to reach as the first. Re-linking from both ends produces exactly the required order.",
    slow: "The array costs $O(n)$ **extra memory**. Time is fine ($O(n)$), but the problem is asking for a clever in-place way of reaching the end of the list again and again.",
    repeat: "Without the array, \"give me the last node\" would need a walk to the end, once per pair: $O(n^2)$. We are paying memory to avoid repeating that walk.",
    remember: "If the **second half were reversed**, its nodes would come out in exactly the order we want to insert them (last first, then second-last, …). And we already know how to reverse a list in place with three pointers.",
    observation: "Split the work into three simple pieces: **(1)** find the middle with slow and fast pointers; **(2)** cut the list there and **reverse the second half** in place; **(3)** **weave** the first half and the reversed second half together, taking one node from each in turn. Each piece is $O(n)$ and uses only a few pointers.",
    leads: "Find the middle (`slow`, `fast`). `second = slow.next; slow.next = null`. Reverse `second`. Then, with `a` on the first half and `b` on the reversed half: save both successors, link `a → b → an`, and move `a`, `b` forward until `b` runs out.",
  },

  flow: [
    "Copy the nodes into an array and re-link from both ends.",
    "Random access lets us reach the back as easily as the front.",
    "$O(n)$ time but $O(n)$ extra memory for the array.",
    "A reversed second half hands us the last nodes in exactly the order we need them.",
    "Three steps: find the middle, reverse the second half, weave the two halves.",
    "Each step is a single pass with a few pointers: $O(n)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Array method:** store a pointer to every node in a `vector`. Then use two indices, `i` from the front and `j` from the back: link `v[i] → v[j]`, then `v[j] → v[i+1]`, and move `i` up and `j` down until they meet. The last node placed must point to `null`.",
    why: "It needs $O(n)$ extra memory for the vector of pointers. In time it is already $O(n)$, so what the in-place solution improves is **space**: three pointers instead of $n$.",
    time: "O(n)", space: "O(n)",
    cpp: `class Solution {
public:
    void reorderList(ListNode* head) {
        vector<ListNode*> v;
        for (ListNode* p = head; p; p = p->next) v.push_back(p);
        int i = 0, j = (int)v.size() - 1;
        while (i < j) {
            v[i]->next = v[j]; i++;
            if (i == j) break;
            v[j]->next = v[i]; j--;
        }
        if (!v.empty()) v[i]->next = nullptr;
    }
};`,
    js: `function reorderList(head) {
  const v = [];
  for (let p = head; p; p = p.next) v.push(p);
  let i = 0, j = v.length - 1;
  while (i < j) {
    v[i].next = v[j]; i++;
    if (i === j) break;
    v[j].next = v[i]; j--;
  }
  if (v.length) v[i].next = null;
}`,
  },

  pattern: {
    name: "Linked List Pointers (combine the basic moves)",
    why: "Hard-looking list problems are usually a **sequence of small standard moves**: find the middle (slow/fast), reverse a segment (three pointers), merge or interleave two lists (save both successors, link, advance). Recognise the pieces and the problem becomes three easy loops.",
    recognize: [
      "You need to pair the **front with the back** of a singly linked list.",
      "The statement says *\"in place\"*, so no array of nodes is allowed.",
      "The answer alternates between two sources (like a zipper).",
      "A *reversed half* would turn \"from the back\" into \"from the front\".",
    ],
  },

  optimal: {
    idea: "Three in-place passes. First, move `slow` one node and `fast` two nodes at a time, so that when `fast` reaches the end `slow` is on the last node of the first half. Second, cut after `slow` and reverse the second half with the usual `prev / curr / next` loop. Third, weave: while the reversed half has nodes, point `a` (first half) to `b` (reversed half) and `b` to `a`'s old successor, then move both pointers forward.",
    steps: [
      "If the list has fewer than two nodes, stop (nothing to reorder).",
      "Find the end of the first half: `slow` moves 1, `fast` moves 2, while `fast.next` and `fast.next.next` exist.",
      "Cut: `second = slow.next` and `slow.next = null`.",
      "Reverse the list starting at `second` (three pointers); `prev` becomes its head.",
      "Weave: `a = head`, `b = prev`; while `b` exists: save `an = a.next`, `bn = b.next`; link `a.next = b`, `b.next = an`; then `a = an`, `b = bn`.",
    ],
    invariant: "**During the weave, the nodes already linked read `L0, Ln, L1, Ln-1, …` in order, `a` is the next unprocessed node of the first half, `b` the next of the reversed second half, and no node is lost because both successors are saved before any link is changed.**",
    correct: "Let the list have $n$ nodes. The first half has $\\lceil n/2 \\rceil$ nodes and the second half $\\lfloor n/2 \\rfloor$, so the second half is never longer than the first. After reversing, `b` visits $L_n, L_{n-1}, \\dots$ in that order. Each weave step inserts the next reversed node right after `a`, i.e. after the node it must follow, and links it to the rest of the first half (`an`), so the output alternates one node from each half. The loop ends when the reversed half is exhausted; the remaining first-half node (if $n$ is odd) is already the last one, and its `next` is `null` because we cut the list at `slow`. Every node is moved at most once in each pass, so nothing is dropped or visited twice.",
  },

  cpp: `class Solution {
public:
    void reorderList(ListNode* head) {
        if (!head || !head->next) return;       // 0 or 1 node //@guard
        ListNode* slow = head;                  // finds the middle //@mid
        ListNode* fast = head;
        while (fast->next && fast->next->next) {   //@midloop
            slow = slow->next; fast = fast->next->next;   // 1 hop and 2 hops //@midstep
        }
        ListNode* second = slow->next;          // start of the second half //@split
        slow->next = nullptr;                   // cut the list in two
        ListNode* prev = nullptr;               // head of the reversed half //@revinit
        while (second) {                        //@revloop
            ListNode* nx = second->next; second->next = prev; prev = second; second = nx;   //@rev
        }
        ListNode* a = head;                     // first half //@weaveinit
        ListNode* b = prev;                     // reversed second half
        while (b) {                             //@weaveloop
            ListNode *an = a->next, *bn = b->next;   // save both successors //@weavesave
            a->next = b; b->next = an;          // a, b, then the rest of the first half //@weavelink
            a = an; b = bn;                     //@weaveadv
        }
    }
};`,
  js: `function reorderList(head) {
  if (!head || !head.next) return;       // 0 or 1 node //@guard
  let slow = head;                       // finds the middle //@mid
  let fast = head;
  while (fast.next && fast.next.next) {  //@midloop
    slow = slow.next; fast = fast.next.next;   // 1 hop and 2 hops //@midstep
  }
  let second = slow.next;                // start of the second half //@split
  slow.next = null;                      // cut the list in two
  let prev = null;                       // head of the reversed half //@revinit
  while (second) {                       //@revloop
    const nx = second.next; second.next = prev; prev = second; second = nx;   //@rev
  }
  let a = head;                          // first half //@weaveinit
  let b = prev;                          // reversed second half
  while (b) {                            //@weaveloop
    const an = a.next, bn = b.next;      // save both successors //@weavesave
    a.next = b; b.next = an;             // a, b, then the rest of the first half //@weavelink
    a = an; b = bn;                      //@weaveadv
  }
}`,

  tests: [
    { name: "Example 1: four nodes", kind: "normal", input: { head: [1, 2, 3, 4] } },
    { name: "Example 2: five nodes", kind: "normal", input: { head: [1, 2, 3, 4, 5] } },
    { name: "Six nodes", kind: "normal", input: { head: [10, 20, 30, 40, 50, 60] } },
    { name: "A single node", kind: "edge", input: { head: [7] }, why: "There is nothing to reorder, and `head.next` is `null`. The guard `!head->next` returns at once; without it, `fast->next->next` would dereference a null pointer." },
    { name: "Two nodes", kind: "edge", input: { head: [1, 2] }, why: "`L0 → Ln` is already the answer. `fast->next->next` is `null` straight away, so `slow` stays on the head: the first half is `[1]`, the second `[2]`; after the weave the order is unchanged." },
    { name: "Three nodes", kind: "edge", input: { head: [1, 2, 3] }, why: "The smallest odd length: the middle node (2) ends up **last**, so its `next` must be `null`. This works only because we cut the list at `slow` before weaving." },
    { name: "All values equal", kind: "edge", input: { head: [4, 4, 4, 4, 4] }, why: "The output *looks identical* to the input, so values cannot tell us whether the nodes were moved. Watch the arrows in the lab: the links still zig-zag between the halves." },
    { name: "Palindromic values", kind: "corner", input: { head: [1, 2, 3, 2, 1] }, why: "The expected answer `[1, 1, 2, 2, 3]` differs from the input, even though the input reads the same both ways. Reversing the whole list (instead of the second half) would produce the wrong order here." },
    { name: "Odd length, descending", kind: "corner", input: { head: [9, 8, 7, 6, 5, 4, 3] }, why: "Seven nodes: the first half has 4 nodes and the second half 3. The weave takes three pairs and then the last first-half node is left in place, already pointing to `null`." },
    { name: "Empty list", kind: "corner", input: { head: [] }, why: "`head` is `null`, and the guard `!head` returns immediately. The function must not touch `head->next` before checking `head`." },
  ],

  trace(input, T) {
    const vals = input.head, L = vals.length;
    const h = Math.ceil(L / 2);
    const nodes = vals.map((v, i) => ({ id: i, val: v, slot: i, row: 0, sub: i === 0 ? "head" : undefined }));
    const next = {}; vals.forEach((_, i) => (next[i] = i + 1 < L ? i + 1 : null));
    const ptr = {};
    const done = new Set();
    const read = () => { const r = []; let p = L ? 0 : null, g = 0; while (p !== null && g++ <= L) { r.push(vals[p]); p = next[p]; } return r; };
    let whyCut = false, whyRev = false, whySave = false;
    let secondHalf = new Set();
    const S = (o = {}) => () => {
      const hl = {};
      secondHalf.forEach((id) => (hl[id] = "win"));
      done.forEach((id) => (hl[id] = "ok"));
      (o.cur || []).forEach((id) => { if (id !== null && id !== undefined) hl[id] = "cur"; });
      return { nodes: nodes.map((x) => Object.assign({}, x)), next: Object.assign({}, next), ptr: Object.assign({}, ptr), hl, ehl: o.ehl, rowGap: 124, nullRows: L ? [0, 1] : [0], ptrBottom: ["an", "bn", "nx"], out: { label: "list read from head", items: read() }, label: o.label || "singly linked list", note: o.note };
    };
    const nm = (id) => (id === null || id === undefined ? "null" : `node ${vals[id]}`);
    const vars = () => { const v = {}; for (const k in ptr) v[k] = ptr[k] === null || ptr[k] === undefined ? "null" : vals[ptr[k]]; return v; };
    T.step("guard", { vars: {}, state: S(), phase: "Find the middle", say: L < 2 ? (L === 0 ? "`head` is `null`: there is nothing to reorder, so the function returns at once." : "The list has a single node: there is nothing to reorder, so the function returns at once.") : `The list has ${L} nodes, so there is something to reorder. The plan: **find the middle**, **reverse the second half**, then **weave** the halves together.`, op: L < 2 ? `head == null || head.next == null  →  return` : "head.next != null  →  continue", act: L < 2 ? "RETURN_EARLY" : "CONTINUE" });
    if (L >= 2) {
      ptr.slow = 0; ptr.fast = 0;
      T.step("mid", { vars: vars(), state: S({ cur: [0] }), say: "`slow` and `fast` both start on the head. `slow` will take one hop per step, `fast` two, so when `fast` reaches the end `slow` is halfway.", op: "slow = fast = head", act: "START_POINTERS" });
      for (;;) {
        const go = next[ptr.fast] !== null && next[next[ptr.fast]] !== null;
        T.step("midloop", { vars: vars(), state: S({ cur: [ptr.slow, ptr.fast] }), say: go ? `\`fast\` can still make two hops (${nm(next[ptr.fast])} and ${nm(next[next[ptr.fast]])} exist), so the middle is further on.` : `\`fast\` cannot make two more hops: \`slow\` (${nm(ptr.slow)}) is on the **last node of the first half**.`, op: `fast.next && fast.next.next  →  ${go}`, act: go ? "KEEP_GOING" : "MIDDLE_FOUND" });
        if (!go) break;
        ptr.slow = next[ptr.slow]; ptr.fast = next[next[ptr.fast]];
        T.step("midstep", { vars: vars(), state: S({ cur: [ptr.slow, ptr.fast] }), say: `\`slow\` hops once, to ${nm(ptr.slow)}; \`fast\` hops twice, to ${nm(ptr.fast)}.`, op: "slow = slow.next;  fast = fast.next.next", act: "ADVANCE" });
      }
      // ------------------------------------------------ split
      T.phase("Reverse the second half");
      const sec = next[ptr.slow];
      delete ptr.fast;
      ptr.second = sec;
      next[ptr.slow] = null;
      for (let id = h; id < L; id++) { nodes[id].row = 1; nodes[id].slot = id - h; secondHalf.add(id); }
      T.step("split", { vars: vars(), state: S({ cur: [ptr.slow], ehl: { [ptr.slow]: "hot" }, note: `first half: ${h} node${h === 1 ? "" : "s"}   ·   second half: ${L - h} node${L - h === 1 ? "" : "s"}` }), say: `The second half starts at ${nm(sec)}. Set \`slow.next = null\`: the list is **cut in two**. The first half (${h} node${h === 1 ? "" : "s"}) stays on the top row, the second half (${L - h}) drops to the bottom row.`, op: `second = slow.next;  slow.next = null`, act: "CUT",
        why: whyCut ? null : { title: "Why cut the list?", text: "After the weave the last first-half node must end the list. If we left `slow.next` pointing into the second half, the weave would create a cycle through nodes that have already been moved." } });
      whyCut = true;
      let prev = null, second = sec;
      delete ptr.slow;
      T.step("revinit", { vars: Object.assign(vars(), { prev: "null" }), state: S({ cur: [second] }), say: "Reverse the second half with the usual three pointers. `prev` starts as `null`: the reversed part is empty.", op: "prev = null", act: "PREPARE_REVERSE",
        why: whyRev ? null : { title: "Why reverse the second half?", text: "We want to read the second half **from its last node backwards**: `Ln`, `Ln-1`, … A singly linked list cannot go backwards, but a reversed list produces exactly that order when read forwards." } });
      whyRev = true;
      while (second !== null) {
        T.step("revloop", { vars: Object.assign(vars(), { prev: prev === null ? "null" : vals[prev] }), state: S({ cur: [second] }), say: `\`second\` is on ${nm(second)}, which exists, so there is still an arrow to flip.`, op: "second != null  →  true", act: "CONTINUE" });
        const nx = next[second];
        next[second] = prev; prev = second; second = nx;
        ptr.second = second; ptr.prev = prev; if (second === null) delete ptr.second;
        T.step("rev", { vars: Object.assign(vars(), { prev: vals[prev] }), state: S({ cur: [prev], ehl: { [prev]: "hot" } }), say: `Flip the arrow of node ${vals[prev]} so that it points ${next[prev] === null ? "to `null` (it becomes the tail)" : "back at node " + vals[next[prev]]}, then move \`prev\` and \`second\` forward.`, op: "nx = second.next;  second.next = prev;  prev = second;  second = nx", act: "FLIP_AND_ADVANCE" });
      }
      T.step("revloop", { vars: Object.assign(vars(), { prev: vals[prev] }), state: S({ cur: [prev] }), say: "`second` is `null`: the whole second half is reversed, and `prev` is its new head.", op: "second != null  →  false", act: "LOOP_ENDS" });
      // ------------------------------------------------ weave
      T.phase("Weave the two halves");
      const order = []; for (let p = prev; p !== null; p = next[p]) order.push(p);
      order.forEach((id, k) => { nodes[id].slot = k; });
      let a = 0, b = prev;
      delete ptr.second; delete ptr.prev;
      ptr.a = a; ptr.b = b;
      T.step("weaveinit", { vars: vars(), state: S({ cur: [a, b], note: "the reversed second half has been laid out in reading order" }), say: `\`a\` is the head of the first half and \`b\` is the head of the reversed second half, node **${vals[b]}** (the old last node). We will take one node from each, in turn.`, op: "a = head;  b = prev", act: "START_WEAVE" });
      while (b !== null) {
        T.step("weaveloop", { vars: vars(), state: S({ cur: [a, b] }), say: "The reversed half still has nodes, so there is another pair to link.", op: "b != null  →  true", act: "CONTINUE" });
        const an = next[a], bn = next[b];
        ptr.an = an; ptr.bn = bn;
        T.step("weavesave", { vars: vars(), state: S({ cur: [a, b] }), say: `Save both successors first: \`an\` = ${nm(an)} (the rest of the first half) and \`bn\` = ${nm(bn)} (the rest of the reversed half). Changing \`a.next\` would otherwise lose the first half.`, op: `an = a.next;  bn = b.next`, act: "SAVE_BOTH",
          why: whySave ? null : { title: "Why save both before linking?", text: "`a.next = b` overwrites the only link to the rest of the first half, and `b.next = an` overwrites the only link to the rest of the reversed half. Both successors must be remembered before either link is changed." } });
        whySave = true;
        next[a] = b; next[b] = an;
        done.add(a); done.add(b);
        T.step("weavelink", { vars: vars(), state: S({ cur: [a, b], ehl: { [a]: "hot", [b]: "hot" } }), say: `Link \`a.next = b\` and \`b.next = an\`: node ${vals[a]} now leads to node ${vals[b]}, which leads on to ${nm(an)}. The list so far reads **[${read().join(", ")}]**.`, op: "a.next = b;  b.next = an", act: "INTERLEAVE" });
        a = an; b = bn;
        delete ptr.an; delete ptr.bn;
        if (a === null) delete ptr.a; else ptr.a = a;
        if (b === null) delete ptr.b; else ptr.b = b;
        T.step("weaveadv", { vars: vars(), state: S({ cur: [a, b] }), say: `Move on: \`a = an\` (${nm(a)}) and \`b = bn\` (${nm(b)}).`, op: "a = an;  b = bn", act: "ADVANCE" });
      }
      T.step("weaveloop", { vars: vars(), state: S({ cur: [a] }), say: "`b` is `null`: the reversed half is used up, so the weave is finished. The last node's `next` is already `null` (we cut the list earlier).", op: "b != null  →  false", act: "LOOP_ENDS" });
      if (a !== null) done.add(a);
    }
    T.step(L >= 2 ? "weaveloop" : "guard", { vars: { result: `[${read().join(", ")}]` }, state: S(), say: L ? `The list now reads **[${read().join(", ")}]**: first, last, second, second-last, … The function returns nothing; the list was reordered in place.` : "The list is empty and stays empty.", op: "(void)  list reordered in place", act: "DONE" });
    T.result(read());
  },
  fuzz(rnd) { const n = Math.floor(rnd() * 10); return { head: Array.from({ length: n }, () => Math.floor(rnd() * 11) - 5) }; },
  gen(n) { return { head: Array.from({ length: n }, (_, i) => i) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "three passes, each linear", short: "find the middle, reverse half, weave: about 1.5 n loop iterations",
      derive: [
        "T_{\\text{mid}} = \\tfrac{n}{2}\\, c_1 || `fast` moves two nodes per iteration, so about $n/2$ iterations",
        "T_{\\text{rev}} = \\tfrac{n}{2}\\, c_2 || one iteration per node of the second half",
        "T_{\\text{weave}} = \\lfloor \\tfrac{n}{2} \\rfloor\\, c_3 || one iteration per node of the reversed half",
        "!T(n) = \\tfrac{n}{2}(c_1 + c_2 + c_3) = O(n) || three linear passes add up to a linear total",
      ],
      where: "Each node is visited a constant number of times (once by `fast` or `slow`, once during the reversal, once in the weave), so nothing is quadratic.",
    },
    space: {
      tex: "O(1)", title: "a handful of pointers", short: "`slow`, `fast`, `prev`, `second`, `a`, `b`, `an`, `bn`",
      derive: [
        "S = c_{\\text{pointers}} || eight pointers at most, whatever the list length",
        "!S = O(1) || the nodes are re-linked in place, none is copied",
      ],
      where: "The array method stores $n$ node pointers. A *recursive* weave would use $O(n)$ stack. The three-pass version uses neither.",
    },
    limit: "Each node's `next` has to change (or be examined), so $\\Omega(n)$ time is needed, and $O(1)$ extra space is optimal.",
    measure: { label: "n = number of nodes", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Forgetting to cut the first half", what: "Not setting `slow->next = nullptr` before reversing the second half.", why: "The reversal makes the second half look separate.", breaks: "The first half's last node still points into the (now reversed) second half, so the weave ends with a **cycle** and any traversal never finishes.", avoid: "Cut right after finding `slow`: `second = slow->next; slow->next = nullptr;`." },
    { title: "Reversing the whole list", what: "Calling the reverse loop on `head`.", why: "\"Reverse\" feels like the first step.", breaks: "The first half is reversed too, so the result alternates the wrong way (for `[1,2,3,4]` you would get `[4,1,3,2]`).", avoid: "Reverse **only** the second half, starting at `slow->next`." },
    { title: "Overwriting `a->next` before saving it", what: "`a->next = b; b->next = a->next;` (in this order).", why: "Writing the two links in the order they are \"needed\".", breaks: "`a->next` is already `b`, so `b->next = b`: a one-node cycle, and the rest of the first half is lost.", avoid: "Save `an` and `bn` first, then link." },
    { title: "Missing the guard for short lists", what: "Dropping the check for `!head || !head->next`.", why: "The examples all have at least four nodes.", breaks: "`fast->next->next` dereferences null for `head = [1]`, and an empty list crashes immediately.", avoid: "Return early when there are fewer than two nodes." },
    { title: "Trying to return or build a new list", what: "Creating new nodes or returning a pointer.", why: "Most list problems return a head.", breaks: "The function is `void`: the caller's `head` must itself be rearranged, and copying nodes uses $O(n)$ space and may break identity.", avoid: "Re-link the existing nodes; `head` stays the head (it is always `L0`)." },
  ],

  followUps: [
    {
      q: "Check whether a linked list is a **palindrome** in $O(1)$ space.",
      a: "Use the first two pieces of this lesson: find the middle, reverse the second half, then compare the two halves node by node from both ends. (Optionally reverse the second half again afterwards to restore the list.)",
      cpp: `bool isPalindrome(ListNode* head) {
    if (!head || !head->next) return true;
    ListNode *slow = head, *fast = head;
    while (fast->next && fast->next->next) { slow = slow->next; fast = fast->next->next; }
    ListNode* prev = nullptr; ListNode* cur = slow->next;
    while (cur) { ListNode* nx = cur->next; cur->next = prev; prev = cur; cur = nx; }
    for (ListNode *p = head, *q = prev; q; p = p->next, q = q->next)
        if (p->val != q->val) return false;
    return true;
}`,
      js: `function isPalindrome(head) {
  if (!head || !head.next) return true;
  let slow = head, fast = head;
  while (fast.next && fast.next.next) { slow = slow.next; fast = fast.next.next; }
  let prev = null, cur = slow.next;
  while (cur) { const nx = cur.next; cur.next = prev; prev = cur; cur = nx; }
  for (let p = head, q = prev; q; p = p.next, q = q.next)
    if (p.val !== q.val) return false;
  return true;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Group the nodes by **odd and even position** (all odd positions first, then all even).",
      a: "Keep two tails, one for the odd list and one for the even list, and alternate: `odd.next = even.next; odd = odd.next; even.next = odd.next; even = even.next`. At the end join `odd.next = evenHead`. One pass, $O(n)$ time and $O(1)$ space.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Write the **recursive** version. What does it cost?",
      a: "Recurse to the end, and on the way back pair each node with the node at the opposite end (a pointer that moves forward from the head as the stack unwinds). It is short but uses $O(n)$ stack frames, so the in-place three-pass version is preferred for long lists.",
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Reverse the list in **groups of k** nodes.",
      a: "Count `k` nodes; if they exist, reverse exactly those with the same three-pointer loop and connect the previous group's tail to the new group head; repeat. The reverse routine from this lesson is the building block: $O(n)$ time and $O(1)$ space.",
      time: "O(n)", space: "O(1)",
    },
  ],

  related: [
    { id: "reverse-linked-list", why: "The second step of this solution: reverse the second half in place." },
    { id: "linked-list-cycle", why: "Same slow and fast pointers, used here to find the middle instead of a loop." },
    { id: "merge-two-sorted-lists", why: "The weave is an interleaving merge with a save-link-advance loop." },
    { id: "remove-nth-node-from-end-of-list", why: "Another way of reaching \"the back\" of a singly linked list without knowing its length." },
  ],
  patternNote: "**Compose the basic list moves.** Almost every medium or hard linked-list question is built from three pieces: *slow/fast pointers* (find the middle or a loop), *reversal* (turn a segment around) and *merge/weave* (combine two lists with a dummy or tail). Reorder List uses all three, one after another.",
  takeaways: [
    "Pairing front with back on a singly linked list needs the second half **reversed**.",
    "Step 1: slow/fast to find the middle. Step 2: cut (`slow.next = null`) and reverse the second half. Step 3: weave.",
    "In the weave, **save both successors** (`an`, `bn`) before changing any link.",
    "Guard for fewer than two nodes; the function is `void`: the list is changed in place.",
    "Time $O(n)$, space $O(1)$; the same pieces solve palindrome list and odd-even list.",
  ],
});
