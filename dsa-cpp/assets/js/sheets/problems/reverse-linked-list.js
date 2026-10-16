SHEETS.define({
  id: "reverse-linked-list",
  viz: "list",
  io: { fn: "reverseList", params: [["head", "list"]], ret: "list", labels: { head: "head (list as an array)" } },

  statement: `You are given the \`head\` of a singly linked list. Reverse the list and return the new head.

Each node has a value \`val\` and a pointer \`next\` to the following node (the last node's \`next\` is \`null\`). After reversing, the old last node must be the head, and every \`next\` pointer must point the other way.`,
  examples: [
    { input: "head = [1, 2, 3, 4, 5]", output: "[5, 4, 3, 2, 1]", explain: "Every arrow now points to the node that used to come before it." },
    { input: "head = [1, 2]", output: "[2, 1]", explain: "Two nodes: the second becomes the head." },
    { input: "head = []", output: "[]", explain: "An empty list reverses to an empty list." },
  ],
  constraints: ["The number of nodes is in the range $[0, 5000]$", "$-5000 \\le$ `Node.val` $\\le 5000$"],

  intuition: {
    find: "The same nodes, in the opposite order: the old tail becomes the head, and each node's `next` must point to the node that used to be **before** it.",
    beginner: "Walk through the list, copy every value into an array, then walk through the list again and write the values back in reverse order.",
    works: "The array remembers all the values, and writing them back in reverse order gives exactly the reversed sequence. It is correct and easy.",
    slow: "It is not slower in *time* (two passes are still $O(n)$), but it spends $O(n)$ **extra memory** for the array, and it only rewrites the values: the nodes are never actually re-linked. Interviewers ask for the in-place version: $O(1)$ extra space.",
    repeat: "Nothing is repeated here; the cost is the **copy**. A list already contains all its information in its links. Copying the values out and back is a detour, when all we need is to *turn the arrows around*.",
    remember: "To turn one arrow around (`curr → next` becomes `curr → prev`) we need to know the node **behind** us (`prev`), and we must not lose the node **ahead** (`next`), because once the arrow is flipped, that is the only copy of the way forward.",
    observation: "Reversing a list is just reversing **every arrow, one at a time**. Walking left to right, the arrows already visited form a reversed list that ends at `prev`, and the rest is still an ordinary list starting at `curr`. Three pointers (`prev`, `curr`, `next`) are all we ever need.",
    leads: "Start with `prev = null`, `curr = head`. In each step: save `next = curr.next`, flip the arrow `curr.next = prev`, then slide forward `prev = curr`, `curr = next`. When `curr` falls off the end, `prev` is the new head.",
  },

  flow: [
    "Copy all values into an array, then write them back backwards.",
    "The array stores the whole sequence, so reversing it reverses the list.",
    "$O(n)$ extra memory, and the nodes themselves are never re-linked.",
    "Reversing a list means reversing **each arrow**, and each flip needs the node behind (`prev`).",
    "Flip one arrow per step, remembering `next` first so the rest is not lost.",
    "Three pointers, one pass: $O(n)$ time, $O(1)$ extra space.",
  ],

  brute: {
    idea: "**Brute force:** walk the list once to copy every value into a `vector`. Walk it a second time and overwrite each node's value with the values taken from the **end** of the vector. The list structure is untouched; only the values change.",
    why: "It costs $O(n)$ extra memory for the vector. In time it is fine, so the real problem is that it changes the *values* and not the *links*: it does not work when nodes carry big payloads or are referenced from elsewhere, and it misses what the question is testing, which is pointer manipulation.",
    time: "O(n)", space: "O(n)",
    cpp: `class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        vector<int> vals;
        for (ListNode* p = head; p; p = p->next) vals.push_back(p->val);
        for (ListNode* p = head; p; p = p->next) { p->val = vals.back(); vals.pop_back(); }
        return head;
    }
};`,
    js: `function reverseList(head) {
  const vals = [];
  for (let p = head; p; p = p.next) vals.push(p.val);
  for (let p = head; p; p = p.next) p.val = vals.pop();
  return head;
}`,
  },

  pattern: {
    name: "Linked List Pointers",
    why: "A linked list can only be changed by editing `next` pointers, and every edit loses information the moment it is made. The skill is to **keep the right handles** (`prev`, `curr`, `next`) so that no node ever becomes unreachable. This three-pointer dance is the foundation of almost every linked-list problem.",
    recognize: [
      "You must **rewire** a linked list in place (reverse it, merge it, remove a node, reorder it).",
      "The statement says *\"in place\"*, *\"O(1) extra space\"*, or forbids creating new nodes.",
      "After changing one `next`, you still need the old `next` to continue: that is the signal to save it first.",
      "A **dummy / sentinel** node or a trailing `prev` pointer would make the edge cases (empty list, head change) disappear.",
    ],
  },

  optimal: {
    idea: "Process the nodes one at a time from the head. Invariant: `prev` is the head of the already-reversed part and `curr` is the first node not yet processed. In each step save the next node, point `curr` backwards at `prev`, then move both pointers one node forward.",
    steps: [
      "Set `prev = null` (the reversed part is empty) and `curr = head`.",
      "While `curr` is not `null`: save `next = curr.next` (so the rest of the list is not lost).",
      "**Flip** the arrow: `curr.next = prev`.",
      "Slide forward: `prev = curr`, then `curr = next`.",
      "When `curr` becomes `null`, every arrow has been flipped. **Return `prev`**: it is the old tail, i.e. the new head.",
    ],
    invariant: "**`prev` heads a correctly reversed list made of the first `k` nodes, and `curr` heads the untouched list of the remaining `n − k` nodes**, and together they contain every node exactly once.",
    correct: "Initially `k = 0`: `prev` is the empty reversed list and `curr` is the whole list. Each iteration moves the first node of the untouched part to the *front* of the reversed part (`curr.next = prev; prev = curr`) and advances `curr` using the saved `next`, so the invariant holds with `k + 1`. When `curr` is `null`, `k = n`: the reversed list contains all nodes, and `prev` is its head. Because the old head's `next` was set to `null` (the initial `prev`), the new tail terminates the list correctly.",
  },

  cpp: `class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;               // reversed part //@init
        ListNode* curr = head;                  // untouched part
        while (curr != nullptr) {               //@loop
            ListNode* next = curr->next;        // save the way forward //@save
            curr->next = prev;                  // flip the arrow //@flip
            prev = curr;                        // grow reversed part //@advprev
            curr = next;                        // move on //@advcurr
        }
        return prev;                            // the old tail //@ret
    }
};`,
  js: `function reverseList(head) {
  let prev = null;                       // reversed part //@init
  let curr = head;                       // untouched part
  while (curr !== null) {                //@loop
    const next = curr.next;              // save the way forward //@save
    curr.next = prev;                    // flip the arrow //@flip
    prev = curr;                         // grow reversed part //@advprev
    curr = next;                         // move on //@advcurr
  }
  return prev;                           // the old tail //@ret
}`,

  tests: [
    { name: "Example 1: five nodes", kind: "normal", input: { head: [1, 2, 3, 4, 5] } },
    { name: "Example 2: two nodes", kind: "normal", input: { head: [1, 2] } },
    { name: "A longer list", kind: "normal", input: { head: [10, 20, 30, 40, 50, 60, 70] } },
    { name: "A single node", kind: "edge", input: { head: [7] }, why: "`head.next` is already `null`, so there is nothing to turn around. The loop runs once: `curr.next` becomes `prev` (`null`), `prev` becomes the node, and we return it. A solution that assumes at least two nodes would crash or loop." },
    { name: "All values equal", kind: "edge", input: { head: [4, 4, 4, 4] }, why: "The output *looks identical* to the input, so you cannot check this by eye. The algorithm works on **node identity**, not values: every arrow is still reversed. This is why the lab shows the links, not just the numbers." },
    { name: "Negative values and zero", kind: "edge", input: { head: [-3, 0, 5, -1] }, why: "Values never influence how pointers move, so negatives and zero behave like any other number. A solution that used `0` as a sentinel for \"end of list\" would break here." },
    { name: "A palindromic list", kind: "corner", input: { head: [1, 2, 3, 2, 1] }, why: "Reversing gives the same values. A buggy solution that returns the list *unchanged* would still pass, so never rely on a palindrome as your only test." },
    { name: "Empty list", kind: "corner", input: { head: [] }, why: "`head` is `null`. The loop condition is false immediately, `prev` is still `null`, and we return `null`. Code that does `head->next` before checking would dereference a null pointer." },
  ],

  trace(input, T) {
    const vals = input.head, n = vals.length;
    const next = {}; for (let i = 0; i < n; i++) next[i] = i + 1 < n ? i + 1 : null;
    let prev = "nullL", curr = n ? 0 : null, nxt;      // "nullL": the null that `prev` starts as
    let whySave = false, whyFlip = false;
    const nodes = vals.map((v, i) => ({ id: i, val: v, slot: i, row: 0, sub: i === 0 ? "old head" : i === n - 1 ? "old tail" : undefined }));
    const doneSet = new Set();
    const S = (o = {}) => () => {
      const hl = {};
      doneSet.forEach((id) => (hl[id] = "ok"));
      if (curr !== null && curr !== undefined && o.cur !== false) hl[curr] = "cur";
      const ptr = { prev, curr };
      if (nxt !== undefined && !o.hideNext) ptr.next = nxt;
      return { nodes, next: Object.assign({}, next), ptr, hl, ehl: o.ehl, nullLeft: true, label: "linked list" };
    };
    const vstr = (p) => (p === "nullL" || p === null ? "null" : String(p));
    const vars = () => ({ prev: p2(prev), curr: p2(curr), next: nxt === undefined ? "–" : p2(nxt) });
    const p2 = (p) => (p === "nullL" || p === null ? "null" : `node ${vals[p]}`);
    T.step("init", { vars: vars(), state: S(), phase: "Flip one arrow per step", say: n ? "`prev` starts as `null` (the reversed part is empty) and `curr` is the head: the whole list is still untouched." : "The list is empty: `head` is `null`, so `curr` starts as `null` too.", op: `prev = null,  curr = head`, act: "START" });
    while (curr !== null) {
      T.step("loop", { vars: vars(), state: S(), say: `\`curr\` points at node **${vals[curr]}**, which is not \`null\`, so there is still an arrow to flip.`, op: `curr != null  →  true`, act: "CONTINUE" });
      const c = curr;
      nxt = next[c];
      T.step("save", { vars: vars(), state: S(), say: `Save \`next = curr.next\` = ${nxt === null ? "null" : "node **" + vals[nxt] + "**"}. We must do this **before** flipping: afterwards the only way to reach the rest of the list would be gone.`, op: `next = curr.next = ${nxt === null ? "null" : vals[nxt]}`, act: "SAVE_NEXT",
        why: whySave ? null : { title: "Why save `next` first?", text: `The arrow \`curr → ${nxt === null ? "null" : vals[nxt]}\` is the **only** link to the remaining nodes. Once we overwrite \`curr.next\`, those nodes would be unreachable (and lost) if we had not stored them in \`next\`.` } });
      whySave = true;
      next[c] = prev === "nullL" ? "nullL" : prev;
      T.step("flip", { vars: vars(), state: S({ ehl: { [c]: "hot" } }), say: `**Flip the arrow:** \`curr.next = prev\`. Node ${vals[c]} now points ${prev === "nullL" ? "to `null`: it is the new tail" : "back at node **" + vals[prev] + "**"}.`, op: `curr.next = prev = ${prev === "nullL" ? "null" : vals[prev]}`, act: "FLIP",
        why: whyFlip ? null : { title: "What just happened to the list?", text: "The arrow that pointed *forward* now points *backward*. The nodes to the left of `curr` form a reversed list, the nodes from `next` on are still an ordinary list. Together they cover every node exactly once." } });
      whyFlip = true;
      doneSet.add(c);
      prev = c;
      T.step("advprev", { vars: vars(), state: S({ cur: false, hideNext: false }), say: `Slide \`prev\` forward onto node **${vals[c]}**: the reversed part grew by one node.`, op: `prev = curr = ${vals[c]}`, act: "ADVANCE_PREV" });
      curr = nxt; nxt = undefined;
      T.step("advcurr", { vars: vars(), state: S(), say: curr === null ? "`curr = next` is `null`: we walked off the end, so every arrow has been flipped." : `Slide \`curr\` forward to the saved node **${vals[curr]}**: the untouched part shrank by one.`, op: `curr = next = ${curr === null ? "null" : vals[curr]}`, act: "ADVANCE_CURR" });
    }
    T.step("loop", { vars: vars(), state: S(), say: "`curr` is `null`: the untouched part is empty, so the loop ends.", op: "curr != null  →  false", act: "LOOP_ENDS" });
    const res = []; let p = prev === "nullL" ? null : prev; let guard = 0;
    while (p !== null && p !== "nullL" && guard++ < 10000) { res.push(vals[p]); p = next[p]; }
    T.step("ret", { vars: { "return": prev === "nullL" ? "null" : `node ${vals[prev]}` }, state: S({ cur: false }), say: n ? `\`prev\` points at node **${vals[prev]}**, the old tail. That is the new head, and following the arrows gives **[${res.join(", ")}]**.` : "Nothing to reverse: return `prev`, which is still `null`.", op: `return prev`, act: "DONE" });
    T.result(res);
  },
  fuzz(rnd) { const n = Math.floor(rnd() * 11); return { head: Array.from({ length: n }, () => Math.floor(rnd() * 11) - 5) }; },
  gen(n) { return { head: Array.from({ length: n }, (_, i) => i) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "each node is handled exactly once", short: "one loop iteration per node, four pointer assignments each",
      derive: [
        "T(n) = \\sum_{k=1}^{n} \\big( c_{\\text{save}} + c_{\\text{flip}} + c_{\\text{prev}} + c_{\\text{curr}} \\big) || the loop body is four pointer assignments, each $O(1)$",
        "T(n) = \\sum_{k=1}^{n} c || the four constants merge into one",
        "T(n) = c \\cdot n || the loop runs once per node and `curr` never moves backwards",
        "!T(n) = O(n) || drop the constant",
      ],
      where: "`curr` moves forward by exactly one node each iteration and the list has $n$ nodes, so the loop runs exactly $n$ times. Nothing inside the loop walks along the list, so there is no hidden second loop.",
    },
    space: {
      tex: "O(1)", title: "three pointers, no new nodes", short: "`prev`, `curr` and `next`",
      derive: [
        "S(n) = |\\text{prev}| + |\\text{curr}| + |\\text{next}| || the only memory the algorithm adds",
        "S(n) = 3c || it does not depend on n; no node is allocated or copied",
        "!S(n) = O(1) || constant extra space, the list is reversed **in place**",
      ],
      where: "The reversal re-uses the existing nodes: only the `next` pointers change. The brute force needed a vector of $n$ values; the recursive version needs $n$ stack frames ($O(n)$). The iterative three-pointer version needs neither.",
    },
    limit: "$O(n)$ time is optimal, since every node's `next` pointer must change (or at least be examined). $O(1)$ space is optimal too.",
    measure: { label: "n = number of nodes", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Flipping the arrow before saving `next`", what: "Writing `curr->next = prev;` as the first statement of the loop.", why: "The flip is the \"interesting\" line, so it feels like it should come first.", breaks: "After the flip, `curr->next` is `prev`, so the original successor is lost. Then `curr = curr->next` walks **backwards** and the loop either stops immediately or never ends. The rest of the list is leaked.", avoid: "First `next = curr->next`; flip; then move with the **saved** `next`." },
    { title: "Returning `head` instead of `prev`", what: "Ending with `return head;`.", why: "The function was handed `head`, so it feels natural to hand something called `head` back.", breaks: "The old head is now the **tail** (its `next` is `null`), so the caller receives a list with a single node.", avoid: "When the loop ends, `curr` is `null` and `prev` is the new head. Return `prev`." },
    { title: "Not starting `prev` at `null`", what: "Leaving `prev` uninitialised, or initialising it to `head`.", why: "Forgetting that the first node becomes the **last** node and must point to nothing.", breaks: "With `prev = head`, the old head points to itself: a cycle, so any traversal of the result never ends. With an uninitialised pointer, behaviour is undefined.", avoid: "Start with `prev = nullptr`: the old head's new `next` must be `null`." },
    { title: "Looping `while (curr->next != nullptr)`", what: "Stopping when `curr` is the last node.", why: "Mixing this up with loops that need a node *and* its successor.", breaks: "The final node's arrow is never flipped, and for an empty list `curr->next` is a null dereference.", avoid: "Loop on `curr != nullptr`: every node, including the last, must be processed." },
    { title: "Using `list.size()` or values as the end marker", what: "Treating the value `0`, or a precomputed count, as the end of the list.", why: "Habits from arrays.", breaks: "`0` is a legal value in this problem, so a list containing it is cut short.", avoid: "A linked list ends only at `null`; test pointers, not values." },
  ],

  followUps: [
    {
      q: "Write the **recursive** version. What does it cost in space?",
      a: "Reverse the rest of the list recursively (`rest = reverseList(head.next)`). After that call, `head.next` is the **tail of the reversed rest**, so make it point back at `head`: `head.next.next = head`, then cut the old link with `head.next = null`. The new head is `rest`, returned unchanged all the way up. The cost is $O(n)$ **stack frames**, which is why the iterative version is preferred.",
      cpp: `ListNode* reverseRec(ListNode* head) {
    if (!head || !head->next) return head;      // empty or last node
    ListNode* rest = reverseRec(head->next);    // reverse everything after head
    head->next->next = head;                    // the next node now points back
    head->next = nullptr;                       // head becomes the tail
    return rest;
}`,
      js: `function reverseRec(head) {
  if (!head || !head.next) return head;       // empty or last node
  const rest = reverseRec(head.next);         // reverse everything after head
  head.next.next = head;                      // the next node now points back
  head.next = null;                           // head becomes the tail
  return rest;
}`,
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Reverse only the part of the list between positions `left` and `right` (1-indexed).",
      a: "Walk to the node just before position `left` (use a **dummy** node in front so that `left = 1` is not a special case). Then repeat the same three-pointer flip, but only `right − left + 1` times, and finally reconnect the two ends: the node before the sub-list must point to the new sub-list head, and the old sub-list head (now its tail) must point to the node after the sub-list. It is $O(n)$ time and $O(1)$ space.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Reverse the list in **groups of `k`** (the last group stays as it is if it has fewer than `k` nodes).",
      a: "For each group: first check that `k` nodes exist; if so, reverse exactly those `k` nodes with the same loop, then connect the previous group's tail to this group's new head, and continue from the first node after the group. Each node is touched a constant number of times, so $O(n)$ time and $O(1)$ extra space (a recursive version would use $O(n/k)$ stack).",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "How do you check whether a linked list is a **palindrome** in $O(1)$ space?",
      a: "Find the middle with a slow and a fast pointer, reverse the **second half** in place (exactly the loop from this lesson), and compare the two halves node by node. Optionally reverse the second half again afterwards to restore the list. It is $O(n)$ time and $O(1)$ extra space.",
      time: "O(n)", space: "O(1)",
    },
  ],

  related: [
    { id: "reorder-list", why: "Uses this exact routine on the **second half** of the list, then interleaves the two halves." },
    { id: "merge-two-sorted-lists", why: "Another in-place rewiring with a trailing pointer (and a dummy node): decide each `next` while walking both lists." },
    { id: "linked-list-cycle", why: "The other core linked-list skill: two pointers moving at different speeds instead of three pointers rewiring arrows." },
  ],
  patternNote: "**The Linked List Pointer pattern** is about editing `next` pointers without losing anything. Name each pointer by its job (`prev` = behind, `curr` = working on, `next` = ahead), save the next link *before* overwriting it, and use a dummy node when the head can change. Once the three-pointer loop feels natural, merging, removing and reordering lists all become variations on it.",
  takeaways: [
    "Reversing a list means flipping **every arrow**; the nodes themselves never move.",
    "Three pointers: `prev` (reversed part), `curr` (working), `next` (saved). **Save `next` before you flip.**",
    "Loop `while (curr != null)`, flip `curr.next = prev`, then slide `prev = curr`, `curr = next`; **return `prev`**.",
    "Time $O(n)$, space $O(1)$: in place, no new nodes. The recursive version costs $O(n)$ stack.",
    "Test with 0, 1, 2 nodes and equal values: those are where pointer bugs hide.",
  ],
});
