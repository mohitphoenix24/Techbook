SHEETS.define({
  id: "remove-nth-node-from-end-of-list",
  viz: "list",
  io: { fn: "removeNthFromEnd", params: [["head", "list"], ["n", "int"]], ret: "list", labels: { head: "head (list as an array)", n: "n (counted from the end, starting at 1)" } },

  statement: `Given the \`head\` of a linked list, remove the \`n\`-th node **from the end** of the list and return its head.

The last node is the 1st from the end, the one before it is the 2nd from the end, and so on.`,
  examples: [
    { input: "head = [1, 2, 3, 4, 5], n = 2", output: "[1, 2, 3, 5]", explain: "The 2nd node from the end is 4, so it is removed." },
    { input: "head = [1], n = 1", output: "[]", explain: "The only node is also the last one: the list becomes empty." },
    { input: "head = [1, 2], n = 1", output: "[1]", explain: "The last node (2) is removed." },
  ],
  constraints: ["The number of nodes in the list is `sz`", "$1 \\le$ `sz` $\\le 30$", "$0 \\le$ `Node.val` $\\le 100$", "$1 \\le n \\le$ `sz`"],
  check(input) {
    const L = input.head.length;
    if (L < 1) return "the list needs at least one node";
    if (L > 8) return "for the animation use at most 8 nodes";
    if (input.head.some((v) => Math.abs(v) > 99)) return "keep the values between -99 and 99";
    if (input.n < 1 || input.n > L) return `n must be between 1 and ${L} (the length of the list)`;
    return null;
  },

  intuition: {
    find: "The node that is `n` places from the **end**. A singly linked list only lets us walk *forward*, and we do not know where the end is until we get there.",
    beginner: "Walk the whole list once to count its length `L`. The node to delete is number `L − n` from the front (counting from 0), so walk again to the node just before it and skip over the target.",
    works: "Counting tells us where the end is, so \"`n`-th from the end\" becomes the ordinary question \"`(L − n)`-th from the start\".",
    slow: "It is $O(L)$ time and $O(1)$ space, so it is not slow in the usual sense, but it takes **two passes** over the list. The follow-up interviewers ask is: *can you do it in one pass?* (it matters when the list is huge or arrives as a stream).",
    repeat: "The first pass only exists to learn the length. The second pass walks along nodes the first pass has already visited.",
    remember: "We do not need the length itself, only the **distance between two nodes**. If one pointer is always `n` nodes ahead of another, then when the front one reaches the end, the back one is exactly `n` from the end.",
    observation: "Use two pointers with a fixed **gap**. Move `fast` `n` steps ahead first, then move `fast` and `slow` together one step at a time. When `fast` reaches the **last** node, `slow` is standing on the node **just before** the one to delete, so `slow.next = slow.next.next` removes it. A **dummy** node in front makes the case \"remove the head\" work without special code.",
    leads: "Put a `dummy` before `head` and start `slow = fast = dummy`. Advance `fast` `n` times. Then `while (fast.next)`: advance both. Finally `slow.next = slow.next.next` and return `dummy.next`.",
  },

  flow: [
    "Count the length `L`, then walk `L − n` nodes and skip the target.",
    "\"`n`-th from the end\" becomes \"`(L − n)`-th from the start\" once we know `L`.",
    "$O(L)$ time and $O(1)$ space, but two passes over the list.",
    "We only need the **distance** to the end: two pointers kept `n` nodes apart.",
    "Advance `fast` by `n`, then move both until `fast` is on the last node; `slow` is just before the target.",
    "One pass, $O(L)$ time, $O(1)$ space; a dummy node handles removing the head.",
  ],

  brute: {
    idea: "**Two-pass method:** walk the list once to count its length `L`. The node to delete has index `L − n` from the front, so walk again to the node just before it (index `L − n − 1`) and unlink the target. If `L − n = 0` the head itself is removed.",
    why: "It is correct and still $O(L)$ time and $O(1)$ space, but it traverses the list **twice**. The follow-up (and a real constraint for very long or streamed lists) is to do it in a single pass. Also the head needs a special case, because there is no node before it.",
    time: "O(L)", space: "O(1)",
    cpp: `class Solution {
public:
    ListNode* removeNthFromEnd(ListNode* head, int n) {
        int len = 0;
        for (ListNode* p = head; p; p = p->next) len++;
        if (len == n) return head->next;
        ListNode* p = head;
        for (int i = 0; i < len - n - 1; i++) p = p->next;
        p->next = p->next->next;
        return head;
    }
};`,
    js: `function removeNthFromEnd(head, n) {
  let len = 0;
  for (let p = head; p; p = p.next) len++;
  if (len === n) return head.next;
  let p = head;
  for (let i = 0; i < len - n - 1; i++) p = p.next;
  p.next = p.next.next;
  return head;
}`,
  },

  pattern: {
    name: "Two Pointers with a fixed gap",
    why: "Two pointers do not have to move at different *speeds* (as in cycle detection): they can move at the **same speed with a fixed distance** between them. The gap is a ruler that measures \"`n` from the end\" without ever knowing the length.",
    recognize: [
      "Something is counted **from the end** of a singly linked list.",
      "You want to avoid a second pass or a stored length.",
      "The head itself might be the node to remove (use a **dummy** node).",
      "A relation \"the back pointer is `k` behind the front pointer\" would answer the question.",
    ],
  },

  optimal: {
    idea: "Create a `dummy` node in front of the head and set both `slow` and `fast` on it. Move `fast` forward `n` nodes so there are exactly `n` nodes between them. Then move both one node at a time until `fast` is on the last node. Now `slow` is the node before the one to delete: set `slow.next = slow.next.next`.",
    steps: [
      "Create `dummy` with `dummy.next = head`; set `slow = fast = dummy`.",
      "Advance `fast` exactly `n` times (it is now `n` nodes ahead of `slow`).",
      "While `fast.next` is not `null`: move `fast` and `slow` one node each.",
      "`fast` is on the last node, so `slow.next` is the `n`-th node from the end: set `slow.next = slow.next.next`.",
      "Return `dummy.next` (the head, which may have changed).",
    ],
    invariant: "**After the gap is opened, `fast` is always exactly `n` nodes ahead of `slow`; so when `fast` is the last node, `slow.next` is the `n`-th node from the end.**",
    correct: "Let the list have $L$ nodes and number the dummy $0$ and the real nodes $1 \\dots L$. After `fast` advances `n` times it is at index $n$, and `slow` is at $0$. Each loop iteration moves both by one, so `fast − slow = n` always. The loop stops when `fast.next` is `null`, i.e. `fast` is at index $L$, so `slow` is at index $L − n$. The node to delete is the $n$-th from the end, which has index $L − n + 1$ = `slow.next`. Unlinking it is exactly `slow.next = slow.next.next`. Since `slow` can be the dummy (index $0$) when $n = L$, removing the head needs no special case. The loop runs $L − n$ times, so `fast` never walks past the end because $1 \\le n \\le L$.",
  },

  cpp: `class Solution {
public:
    ListNode* removeNthFromEnd(ListNode* head, int n) {
        ListNode dummy(0, head);                // a node in front of head //@init
        ListNode* slow = &dummy;
        ListNode* fast = &dummy;
        for (int i = 0; i < n; i++)             // open a gap of n nodes //@gap
            fast = fast->next;
        while (fast->next != nullptr) {         // until fast is the last node //@loop
            fast = fast->next;                  // both move together //@move
            slow = slow->next;
        }
        slow->next = slow->next->next;          // skip the target //@cut
        return dummy.next;                      // head may have changed //@ret
    }
};`,
  js: `function removeNthFromEnd(head, n) {
  const dummy = new ListNode(0, head);   // a node in front of head //@init
  let slow = dummy;
  let fast = dummy;
  for (let i = 0; i < n; i++)            // open a gap of n nodes //@gap
    fast = fast.next;
  while (fast.next !== null) {           // until fast is the last node //@loop
    fast = fast.next;                    // both move together //@move
    slow = slow.next;
  }
  slow.next = slow.next.next;            // skip the target //@cut
  return dummy.next;                     // head may have changed //@ret
}`,

  tests: [
    { name: "Example 1: remove the 2nd from the end", kind: "normal", input: { head: [1, 2, 3, 4, 5], n: 2 } },
    { name: "Example 2: the only node", kind: "normal", input: { head: [1], n: 1 } },
    { name: "Example 3: remove the tail", kind: "normal", input: { head: [1, 2], n: 1 } },
    { name: "A node in the middle of a longer list", kind: "normal", input: { head: [10, 20, 30, 40, 50, 60], n: 3 } },
    { name: "Remove the head", kind: "edge", input: { head: [1, 2, 3], n: 3 }, why: "`n` equals the length, so the node to delete is the **head**. Then `slow` ends on the dummy node, and `dummy.next = head.next` works with no special code. Without the dummy there is no node before the head to rewire." },
    { name: "Remove the last node", kind: "edge", input: { head: [1, 2, 3, 4], n: 1 }, why: "With `n = 1` the gap is one node, so `fast` stops at the last node and `slow` at the second-to-last. `slow.next.next` is `null`, so the list is simply shortened." },
    { name: "Equal values", kind: "edge", input: { head: [7, 7, 7, 7], n: 2 }, why: "All values are the same, so the answer **looks identical** to a list with any one node removed. Only the *position* matters: the 3rd node is removed (the 2nd from the end). That is why the lab shows nodes, not just values." },
    { name: "n is length − 1", kind: "edge", input: { head: [1, 2, 3, 4, 5], n: 4 }, why: "The target is the **second** node. `slow` stops on the head, and the gap is almost the whole list, so `fast` moves only once in the main loop." },
    { name: "Two nodes, remove the head", kind: "corner", input: { head: [1, 2], n: 2 }, why: "The smallest list where the head is removed and one node remains. `fast` moves to the last node during the gap and the main loop does **zero** iterations." },
    { name: "Negative values and zero", kind: "corner", input: { head: [-1, 0, -5, 2], n: 2 }, why: "The algorithm never looks at values, so negatives and zero behave like any others; the node `-5` (2nd from the end) is removed." },
  ],

  trace(input, T) {
    const vals = input.head, L = vals.length, n = input.n;
    const nodes = [{ id: "D", val: "·", slot: 0, row: 0, sub: "dummy" }, ...vals.map((v, i) => ({ id: i, val: v, slot: i + 1, row: 0, sub: i === 0 ? "head" : undefined }))];
    const byId = Object.fromEntries(nodes.map((x) => [x.id, x]));
    const next = { D: 0 }; for (let i = 0; i < L; i++) next[i] = i + 1 < L ? i + 1 : null;
    let slow = "D", fast = "D", gone = null, steps = 0;
    let whyGap = false, whyCut = false;
    const nm = (id) => (id === null ? "null" : id === "D" ? "dummy" : `${id + 1}${["st", "nd", "rd"][id] || "th"} node = ${vals[id]}`);
    const S = (o = {}) => () => {
      const hl = {};
      hl[slow] = "cur"; if (fast !== null) hl[fast] = fast === slow ? "cur" : "cmp";
      if (gone !== null) hl[gone] = "bad";
      return { nodes: nodes.map((x) => Object.assign({}, x)), next: Object.assign({}, next), ptr: { slow, fast }, hl, ehl: o.ehl, rowGap: 100, nullRows: [0], label: `remove the ${n}${["st", "nd", "rd"][n - 1] || "th"} node from the end`, note: o.note };
    };
    const vars = () => ({ slow: slow === "D" ? "dummy" : vals[slow], fast: fast === "D" ? "dummy" : vals[fast], gap: byId[fast].slot - byId[slow].slot, n });
    T.step("init", { vars: vars(), state: S(), phase: "Open a gap of n nodes", say: `A \`dummy\` node is placed before the head, and both \`slow\` and \`fast\` start on it. The list has ${L} node${L === 1 ? "" : "s"}; we must remove the **${n}${["st", "nd", "rd"][n - 1] || "th"} from the end**.`, op: "dummy.next = head;  slow = fast = dummy", act: "START",
      why: { title: "Why a dummy node?", text: "If the node to remove is the head, there is no node *before* it whose `next` we could change. With a dummy in front, every node (even the head) has a predecessor, so one rule covers all cases." } });
    for (let i = 1; i <= n; i++) {
      fast = next[fast];
      T.step("gap", { vars: vars(), state: S(), say: `Move \`fast\` forward (**${i}** of ${n}): it is now on ${nm(fast)}. The gap between \`slow\` and \`fast\` is **${i}** node${i === 1 ? "" : "s"}.`, op: `fast = fast.next   (step ${i} of ${n})`, act: "OPEN_GAP",
        why: whyGap || i < n ? null : { title: "Why open a gap of exactly n?", text: "Think of a ruler of length `n`. When its front end reaches the last node, its back end is `n` nodes behind it: exactly the node before the one that is `n`-th from the end." } });
      if (i === n) whyGap = true;
    }
    T.phase("Move both until fast is the last node");
    for (;;) {
      const go = next[fast] !== null;
      T.step("loop", { vars: vars(), state: S(), say: go ? `\`fast.next\` exists (the list continues after ${nm(fast)}), so \`fast\` is not on the last node yet.` : `\`fast.next\` is \`null\`: \`fast\` is on the **last node**. The gap is exactly ${n}, so \`slow\` is just before the node to remove.`, op: `fast.next != null  →  ${go}`, act: go ? "KEEP_WALKING" : "FAST_AT_LAST" });
      if (!go) break;
      fast = next[fast]; slow = next[slow]; steps++;
      T.step("move", { vars: vars(), state: S(), say: `Both pointers move one node: \`slow\` is on ${nm(slow)}, \`fast\` on ${nm(fast)}. The gap is still **${n}**.`, op: "fast = fast.next;  slow = slow.next", act: "MOVE_BOTH" });
    }
    gone = next[slow];
    const after = next[gone];
    next[slow] = after;
    byId[gone].row = 1;
    T.step("cut", { vars: Object.assign(vars(), { removed: vals[gone] }), state: S({ ehl: { [slow]: "hot" }, note: `node ${vals[gone]} is cut out of the list` }), say: `\`slow.next\` is ${nm(gone)}, the one to remove. Set \`slow.next = slow.next.next\`: the arrow from ${slow === "D" ? "the dummy" : "node " + vals[slow]} now jumps over it to ${after === null ? "`null`" : "node " + vals[after]}.`, op: `slow.next = slow.next.next = ${after === null ? "null" : vals[after]}`, act: "UNLINK",
      why: whyCut ? null : { title: "What happens to the removed node?", text: "Nothing points at it any more, so it is no longer part of the list (it still holds its own `next` arrow, but nobody follows it). In C++ you would `delete` it to free the memory." } });
    whyCut = true;
    const res = []; let guard = 0;
    for (let p = next.D; p !== null && guard++ < 1000; p = next[p]) res.push(vals[p]);
    T.step("ret", { vars: { "return": res.length ? `list starting at ${res[0]}` : "null" }, state: S(), say: res.length ? `Return \`dummy.next\`: the list is **[${res.join(", ")}]**.` : "Return `dummy.next`, which is `null`: the list is now empty.", op: "return dummy.next", act: "DONE" });
    T.result(res);
  },
  fuzz(rnd) {
    const L = 1 + Math.floor(rnd() * 8);
    return { head: Array.from({ length: L }, () => Math.floor(rnd() * 11) - 5), n: 1 + Math.floor(rnd() * L) };
  },
  gen(n) { return { head: Array.from({ length: n }, (_, i) => i), n: Math.max(1, n >> 1) }; },

  complexity: {
    time: {
      tex: "O(L)", title: "fast walks the list once, slow follows", short: "`fast` takes `L` steps in total; `slow` takes `L − n`",
      derive: [
        "T_{\\text{gap}} = n \\cdot c || `fast` advances `n` times",
        "T_{\\text{walk}} = (L - n) \\cdot c' || both move until `fast` is on the last node",
        "T_{\\text{cut}} = c'' || one pointer assignment",
        "!T(L) = n c + (L-n) c' + c'' = O(L) || since $n \\le L$; each node is passed by `fast` once",
      ],
      where: "Here $L$ is the length of the list and $1 \\le n \\le L$. The two-pass method does $L + (L - n)$ steps: also $O(L)$, but two traversals. The one-pass version touches each node at most once with `fast`.",
    },
    space: {
      tex: "O(1)", title: "a dummy node and two pointers", short: "`dummy`, `slow`, `fast`",
      derive: [
        "S = |\\text{dummy}| + |\\text{slow}| + |\\text{fast}| = c || no copy of the list, no stored length",
        "!S = O(1) || constant extra space",
      ],
      where: "Only pointers are kept; the list itself is edited in place.",
    },
    limit: "The node must be located, which needs at least one look at $L - n + 1$ nodes in the worst case, so $\\Omega(L)$ time is needed. One pass and $O(1)$ space are optimal.",
    measure: { label: "L = number of nodes (n = L/2)", fTex: "L", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "No dummy node: the head cannot be removed", what: "Starting `slow = head` and finishing with `slow->next = slow->next->next`.", why: "It works for the examples where the target is in the middle.", breaks: "When `n == length`, `slow` stops on the **head itself** and removing `slow->next` deletes the second node instead; or `fast` runs off the list.", avoid: "Use a dummy node before the head and return `dummy.next`." },
    { title: "Gap off by one", what: "Advancing `fast` only `n − 1` times, or looping `while (fast != nullptr)`.", why: "Mixing up whether the target or its predecessor is what `slow` should stop on.", breaks: "`slow` stops **on** the target (or one node too early), so the wrong node is removed.", avoid: "Gap `n`, and loop on `fast->next != nullptr`, so `slow` ends on the *predecessor*." },
    { title: "Moving `fast` before checking it exists", what: "Advancing `fast` `n` times without knowing that `n ≤ length`.", why: "The statement guarantees it, so it is easy to forget.", breaks: "For an invalid `n` the pointer becomes `null` and the next `fast->next` crashes. (The constraints promise `1 ≤ n ≤ sz`.)", avoid: "Rely on the constraint, or return the list unchanged if `fast` becomes `null` too early." },
    { title: "Removing by value", what: "Searching for the node whose value equals the answer.", why: "Treating the problem as \"delete this number\".", breaks: "With duplicates (`[7,7,7,7]`) the first match is removed, not the `n`-th from the end.", avoid: "Work with **positions** (pointers), never with values." },
    { title: "Returning `head`", what: "Ending with `return head;`.", why: "The head did not seem to change.", breaks: "If the head was the node removed, the caller still receives the deleted node.", avoid: "Return `dummy.next`." },
  ],

  followUps: [
    {
      q: "Find the **middle node** of a linked list in one pass.",
      a: "Use the same two-pointer idea with different *speeds*: `slow` moves 1 and `fast` moves 2. When `fast` reaches the end, `slow` is at the middle. This is the first step of the palindrome-list and merge-sort-on-list solutions.",
      cpp: `ListNode* middleNode(ListNode* head) {
    ListNode *slow = head, *fast = head;
    while (fast && fast->next) { slow = slow->next; fast = fast->next->next; }
    return slow;
}`,
      js: `function middleNode(head) {
  let slow = head, fast = head;
  while (fast && fast.next) { slow = slow.next; fast = fast.next.next; }
  return slow;
}`,
      time: "O(L)", space: "O(1)",
    },
    {
      q: "Return the **n-th node from the end** instead of deleting it.",
      a: "Open the same gap of `n` between two pointers (no dummy needed, as nothing is removed) and move both until `fast` falls off the list (`fast == null`); `slow` is then the `n`-th node from the end.",
      time: "O(L)", space: "O(1)",
    },
    {
      q: "Remove **all** nodes whose value equals `x`.",
      a: "Keep a `dummy` and a `prev` pointer on the last kept node. For each `curr`: if `curr.val == x`, set `prev.next = curr.next`; otherwise move `prev` to `curr`. Always move `curr`. The dummy handles the case in which the head must go. It is $O(L)$ time and $O(1)$ space.",
      time: "O(L)", space: "O(1)",
    },
    {
      q: "The list is **doubly linked**. Can it be simpler?",
      a: "Yes, with a tail pointer you can walk **backwards** `n − 1` steps from the end in $O(n)$ time and unlink the node by connecting its `prev` and `next` neighbours. The gap trick is needed because a *singly* linked list cannot be walked backwards.",
      time: "O(n)", space: "O(1)",
    },
  ],

  related: [
    { id: "linked-list-cycle", why: "Also two pointers, but at *different speeds* to find a loop instead of a fixed gap." },
    { id: "reverse-linked-list", why: "The other basic pointer rewiring; the dummy node idea appears again when the head changes." },
    { id: "reorder-list", why: "Needs the middle of the list (slow and fast pointers) before reversing and interleaving." },
    { id: "merge-two-sorted-lists", why: "Another problem where a dummy node removes the \"what is the head?\" special case." },
  ],
  patternNote: "**Two pointers with a fixed gap** measure distances on a structure you cannot index. Advance one pointer `n` nodes, then move both in lock-step: the back pointer always trails by exactly `n`, so when the front one finishes, the back one is where you need it. Pair it with a **dummy node** whenever the head might be the node you change.",
  takeaways: [
    "\"`n`-th from the end\" needs the length, or a **gap of `n`** between two pointers.",
    "Advance `fast` `n` times, then move both until `fast.next == null`: `slow` is the node *before* the target.",
    "A **dummy** node makes removing the head the same as removing any other node.",
    "Return `dummy.next`, not `head`; work with positions, not values.",
    "Time $O(L)$ in one pass, space $O(1)$. The same pointer tricks find the middle and the cycle.",
  ],
});
