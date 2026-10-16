SHEETS.define({
  id: "linked-list-cycle",
  viz: "list",
  io: {
    fn: "hasCycle", params: [["head", "list"], ["pos", "int"]], args: ["head"], ret: "bool",
    labels: { head: "head (list as an array)", pos: "pos (index that the tail links back to, or -1 for no cycle)" },
    setup: {
      cpp: `    if (pos >= 0 && head) { ListNode* t = head; for (int i = 0; i < pos; i++) t = t->next; ListNode* e = head; while (e->next) e = e->next; e->next = t; }`,
      js: `if (pos >= 0 && head) { let t = head; for (let i = 0; i < pos; i++) t = t.next; let e = head; while (e.next) e = e.next; e.next = t; }`,
    },
  },

  statement: `Given \`head\`, the head of a linked list, determine whether the list has a **cycle** in it.

A cycle exists if some node can be reached again by following the \`next\` pointers continuously. Internally, \`pos\` is the index of the node that the tail's \`next\` pointer connects to (it is \`-1\` if there is no cycle). **\`pos\` is not passed to your function**: it only describes how the test list was built.

Return \`true\` if there is a cycle in the linked list, otherwise \`false\`.`,
  examples: [
    { input: "head = [3, 2, 0, -4], pos = 1", output: "true", explain: "The tail (-4) links back to the node at index 1 (value 2), so walking forward never ends." },
    { input: "head = [1, 2], pos = 0", output: "true", explain: "The tail (2) links back to the head (1)." },
    { input: "head = [1], pos = -1", output: "false", explain: "A single node whose `next` is `null`: the walk ends." },
  ],
  constraints: ["The number of nodes is in the range $[0, 10^4]$", "$-10^5 \\le$ `Node.val` $\\le 10^5$", "`pos` is `-1` or a valid index in the linked list"],
  check(input) {
    const n = input.head.length;
    if (n > 10) return "for the animation use at most 10 nodes";
    if (input.head.some((v) => Math.abs(v) > 99)) return "keep the values between -99 and 99";
    if (input.pos < -1 || input.pos >= Math.max(n, 1) || (n === 0 && input.pos !== -1)) return n ? `pos must be -1 or an index from 0 to ${n - 1}` : "an empty list has no cycle, so pos must be -1";
    return null;
  },

  intuition: {
    find: "Whether walking forward along `next` pointers can go on **forever**. A list without a cycle always reaches `null`; a list with a cycle never does.",
    beginner: "Walk along the list and write down every node you visit. If you ever arrive at a node you have already written down, you are going round in a circle.",
    works: "A node can only be seen twice if some arrow leads back to it, which is exactly what a cycle is. If the walk reaches `null` first, there was no cycle.",
    slow: "It is fast enough in time, $O(n)$, but the notebook of visited nodes costs $O(n)$ **extra memory**, and the interviewer's question is whether we can detect a cycle with no notebook at all.",
    repeat: "Nothing is walked twice: the waste is the memory. We store every node's address just to ask one yes/no question at the end.",
    remember: "Two runners on a **circular track** at different speeds must eventually meet: the faster one laps the slower one. On a straight road (a list that ends) the faster one just reaches the end first and they never meet.",
    observation: "Use two pointers: `slow` moves **one** node per step, `fast` moves **two**. Without a cycle, `fast` hits `null` and we stop. With a cycle, both end up inside it, and every step `fast` gets exactly **one node closer** to `slow` from behind, so it cannot jump over `slow`: they must land on the same node.",
    leads: "Start both at `head`. While `fast` and `fast.next` exist: move `slow` one step, `fast` two steps, and if `slow == fast` return `true`. If the loop ends, `fast` fell off the end: return `false`. Two pointers, no extra memory.",
  },

  flow: [
    "Remember every visited node; a repeat means a cycle.",
    "A node repeats only if an arrow leads back to it, i.e. there is a cycle.",
    "$O(n)$ time, but $O(n)$ extra memory for the visited set.",
    "On a circular track a faster runner must lap a slower one; on a straight road it just finishes.",
    "`slow` moves 1, `fast` moves 2: inside a cycle the gap shrinks by exactly 1 per step.",
    "Meet ⇒ cycle, `fast` hits `null` ⇒ no cycle: $O(n)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force:** walk the list and keep an `unordered_set` of the **node addresses** already visited. If the next node is already in the set, we have come back to it: a cycle. If the walk reaches `null`, there is none.",
    why: "It is $O(n)$ time but stores up to $n$ pointers: $O(n)$ extra memory. For a list of 10 million nodes that is tens of megabytes just to answer yes or no; the two-pointer method needs two pointers.",
    time: "O(n)", space: "O(n)",
    cpp: `class Solution {
public:
    bool hasCycle(ListNode* head) {
        unordered_set<ListNode*> seen;
        for (ListNode* p = head; p; p = p->next) {
            if (!seen.insert(p).second) return true;
        }
        return false;
    }
};`,
    js: `function hasCycle(head) {
  const seen = new Set();
  for (let p = head; p; p = p.next) {
    if (seen.has(p)) return true;
    seen.add(p);
  }
  return false;
}`,
  },

  pattern: {
    name: "Fast and Slow Pointers (Floyd's tortoise and hare)",
    why: "When the question is about the **shape** of a linked structure (does it loop? where is the middle?), two pointers moving at different speeds reveal it without any extra memory: the speed difference turns \"have I been here before?\" into \"have we collided?\".",
    recognize: [
      "A linked list or a sequence defined by *\"next = f(current)\"* where you must detect a **loop**.",
      "The statement forbids extra memory (or you want $O(1)$ space) for a repeat check.",
      "You need the **middle** of a list in one pass (when `fast` finishes, `slow` is halfway).",
      "The answer is about a *meeting point* or the *entry* of a cycle.",
    ],
  },

  optimal: {
    idea: "Put `slow` and `fast` at the head. Advance `slow` by one node and `fast` by two, repeatedly. If `fast` reaches the end (`fast` or `fast.next` is `null`) there is no cycle. If at any step both pointers are on the same node, they have met inside a cycle.",
    steps: [
      "Set `slow = head` and `fast = head`.",
      "While `fast` is not `null` **and** `fast.next` is not `null` (two hops are possible):",
      "Move `slow = slow.next` (one hop).",
      "Move `fast = fast.next.next` (two hops).",
      "If `slow == fast` (the same node, not just equal values): **return `true`**.",
      "If the loop ends, `fast` fell off the list: **return `false`**.",
    ],
    invariant: "**Either both pointers are still on the straight part, or both are inside the cycle with `fast` ahead of `slow` by some distance $d$ that decreases by exactly 1 each step.**",
    correct: "*No cycle:* `fast` moves faster than anything can loop, so it reaches `null` after about $n/2$ steps and the function returns `false`. *Cycle:* let the straight part have $\\mu$ nodes and the cycle $\\lambda$ nodes. After $\\mu$ steps `slow` enters the cycle and `fast` is already in it. From then on, each step `fast` moves 2 and `slow` moves 1, so the distance from `fast` back to `slow` along the cycle changes by exactly 1 (mod $\\lambda$). A distance that goes down by exactly one each step must pass through $0$ within $\\lambda$ steps, and it cannot skip over $0$. At $0$ both are on the same node. So they meet within $\\mu + \\lambda \\le n$ steps.",
  },

  cpp: `class Solution {
public:
    bool hasCycle(ListNode* head) {
        ListNode* slow = head;                  // tortoise //@init
        ListNode* fast = head;                  // hare
        while (fast != nullptr && fast->next != nullptr) {   //@loop
            slow = slow->next;                  // one hop //@slow
            fast = fast->next->next;            // two hops //@fast
            if (slow == fast) return true;      // same NODE //@meet
        }
        return false;                           // fast fell off the end //@none
    }
};`,
  js: `function hasCycle(head) {
  let slow = head;                       // tortoise //@init
  let fast = head;                       // hare
  while (fast !== null && fast.next !== null) {   //@loop
    slow = slow.next;                    // one hop //@slow
    fast = fast.next.next;               // two hops //@fast
    if (slow === fast) return true;      // same NODE //@meet
  }
  return false;                          // fast fell off the end //@none
}`,

  tests: [
    { name: "Example 1: cycle back to index 1", kind: "normal", input: { head: [3, 2, 0, -4], pos: 1 } },
    { name: "Example 2: cycle back to the head", kind: "normal", input: { head: [1, 2], pos: 0 } },
    { name: "Example 3: one node, no cycle", kind: "normal", input: { head: [1], pos: -1 } },
    { name: "A long tail and a short cycle", kind: "normal", input: { head: [1, 2, 3, 4, 5, 6, 7, 8], pos: 6 } },
    { name: "A node linked to itself", kind: "edge", input: { head: [5], pos: 0 }, why: "The smallest possible cycle: the only node's `next` is itself. After the first step both pointers are on that node, so `slow == fast` immediately and we return `true`. The loop condition must allow `fast->next` to be the node itself." },
    { name: "Equal values, no cycle", kind: "edge", input: { head: [1, 1, 1, 1], pos: -1 }, why: "Every value is the same, so a solution that compares **values** (`slow->val == fast->val`) would report a cycle. We compare **nodes**; there are four different nodes and the list ends, so the answer is `false`." },
    { name: "The whole list is the cycle", kind: "edge", input: { head: [1, 2, 3, 4, 5, 6], pos: 0 }, why: "The straight part is empty ($\\mu = 0$) and the cycle has $\\lambda = 6$ nodes. The gap between the pointers grows from 0 and must wrap round, so they meet only after 6 steps. This is the slowest case: about $n$ iterations." },
    { name: "Even length, no cycle", kind: "edge", input: { head: [1, 2, 3, 4], pos: -1 }, why: "`fast` lands exactly on `null` (`fast = fast.next.next` becomes `null`). The loop condition `fast != null` ends the loop. Code that only tests `fast->next` would dereference `null`." },
    { name: "Odd length, no cycle", kind: "edge", input: { head: [1, 2, 3], pos: -1 }, why: "Here `fast` stops on the **last node**, whose `next` is `null`, so the other half of the condition (`fast->next != null`) ends the loop. Together with the even case, both ways of leaving the loop are covered." },
    { name: "Tail links to itself", kind: "corner", input: { head: [1, 2, 3, 4, 5], pos: 4 }, why: "The cycle is just the last node ($\\lambda = 1$), reached after a straight part of 4 nodes. `slow` takes 4 steps to arrive; `fast` is already looping there, and they meet as soon as `slow` arrives." },
    { name: "Empty list", kind: "corner", input: { head: [], pos: -1 }, why: "`head` is `null`, so `fast != nullptr` is false at once and we return `false`. The check `fast != nullptr` must come **before** `fast->next`." },
  ],

  trace(input, T) {
    const vals = input.head, n = vals.length, pos = n ? input.pos : -1;
    const next = {}; for (let i = 0; i < n; i++) next[i] = i + 1 < n ? i + 1 : pos >= 0 ? pos : null;
    const nodes = vals.map((v, i) => ({ id: i, val: v, slot: i, row: 0, sub: i === 0 ? "head" : undefined }));
    let slow = n ? 0 : null, fast = n ? 0 : null, steps = 0;
    let whyTwo = false, whyMeet = false;
    const nm = (i) => (i === null ? "null" : `#${i}=${vals[i]}`);
    const S = (o = {}) => () => {
      const hl = {};
      if (slow !== null) hl[slow] = "cur";
      if (fast !== null) hl[fast] = fast === slow ? (o.met ? "hit" : "cur") : "cmp";
      return { nodes, next: Object.assign({}, next), ptr: { slow, fast }, hl, ehl: o.ehl, noNull: pos >= 0, ptrDrop: pos >= 0 ? 28 : 0, label: pos >= 0 ? `linked list: the tail links back to index ${pos}` : "linked list: the tail ends in null", note: o.note };
    };
    const vars = () => ({ slow: nm(slow), fast: nm(fast), steps });
    T.step("init", { vars: vars(), state: S(), phase: "Race the two pointers", say: n ? "Both runners start at the **head**: `slow` (tortoise) will move one node per step, `fast` (hare) two nodes per step." : "The list is empty: `head` is `null`, so `slow` and `fast` both start as `null`.", op: "slow = fast = head", act: "START" });
    let found = false;
    for (;;) {
      const ok = fast !== null && next[fast] !== null && next[fast] !== undefined;
      T.step("loop", { vars: vars(), state: S(), say: fast === null ? "`fast` is `null`: it has fallen off the end of the list, so the walk is over." : !ok ? `\`fast\` is on node ${nm(fast)} and its \`next\` is \`null\`: it cannot take two hops, the list ends here.` : `\`fast\` is on node ${nm(fast)} and \`fast.next\` exists, so \`fast\` can still hop twice.`, op: `fast != null && fast.next != null  →  ${ok}`, act: ok ? "CAN_MOVE" : "END_OF_LIST" });
      if (!ok) break;
      steps++;
      slow = next[slow];
      T.step("slow", { vars: vars(), state: S(), say: `\`slow\` moves **one** hop, to node ${nm(slow)}.`, op: `slow = slow.next = ${nm(slow)}`, act: "SLOW_HOP" });
      fast = next[next[fast]];
      T.step("fast", { vars: vars(), state: S(), say: fast === null ? "`fast` moves **two** hops and lands on `null`: it has left the list." : `\`fast\` moves **two** hops, to node ${nm(fast)}.`, op: `fast = fast.next.next = ${nm(fast)}`, act: "FAST_HOP",
        why: whyTwo ? null : { title: "Why two hops against one?", text: "Each step `fast` gains exactly **one** node on `slow`. If both are inside a cycle, the gap between them shrinks by one each step, so it must reach zero (they cannot jump past each other)." } });
      whyTwo = true;
      const same = slow !== null && slow === fast;
      T.step("meet", { vars: vars(), state: S({ met: same }), say: same ? `\`slow\` and \`fast\` are on the **same node** (${nm(slow)}). Two runners can only meet again if the road is a circle: **there is a cycle**.` : `Different nodes (${nm(slow)} and ${nm(fast)}), so the race goes on.`, op: `slow == fast  →  ${same}`, act: same ? "MEET" : "NOT_YET",
        why: same && !whyMeet ? { title: "Why must meeting mean a cycle?", text: "On a list that ends, `fast` is always ahead of `slow` and reaches `null` first; they can never stand on the same node again. Meeting is possible only on a loop." } : null });
      if (same) { whyMeet = true; found = true; break; }
    }
    T.step(found ? "meet" : "none", { vars: { "return": found }, state: S({ met: found }), say: found ? "Return **true**." : n ? "`fast` ran off the end of the list without ever meeting `slow`: **no cycle**. Return **false**." : "An empty list has no cycle: return **false**.", op: `return ${found}`, act: "DONE" });
    T.result(found);
  },
  fuzz(rnd) { const n = Math.floor(rnd() * 10); return { head: Array.from({ length: n }, () => Math.floor(rnd() * 7) - 3), pos: n && rnd() < 0.6 ? Math.floor(rnd() * n) : -1 }; },
  gen(n) { return { head: Array.from({ length: n }, (_, i) => i), pos: 0 }; },

  complexity: {
    time: {
      tex: "O(n)", title: "the pointers meet within \\mu + \\lambda \\le n steps", short: "at most n loop iterations of four O(1) operations",
      derive: [
        "\\text{no cycle: } \\text{fast advances 2 per step} \\;\\Rightarrow\\; \\lceil n/2 \\rceil \\text{ iterations} || it reaches `null` first",
        "\\text{cycle: } \\mu \\text{ steps until slow enters it} || $\\mu$ = nodes before the cycle",
        "d \\;\\to\\; d-1 \\text{ every step, } 0 \\le d < \\lambda \\;\\Rightarrow\\; \\text{at most } \\lambda \\text{ more steps} || the gap shrinks by exactly 1",
        "T(n) \\le (\\mu + \\lambda)\\, c = n\\, c' || $\\mu + \\lambda \\le n$, each step is a few pointer moves",
        "!T(n) = O(n) || linear in the number of nodes",
      ],
      where: "In the worst case the whole list is the cycle ($\\mu = 0$, $\\lambda = n$) and it takes about $n$ iterations. The measured table below uses exactly that list.",
    },
    space: {
      tex: "O(1)", title: "two pointers", short: "`slow` and `fast`",
      derive: [
        "S(n) = |\\text{slow}| + |\\text{fast}| = 2c || the only memory the algorithm adds",
        "!S(n) = O(1) || no visited set, no marking of nodes",
      ],
      where: "The brute force stored up to $n$ node addresses. Here the extra memory does not grow with the list.",
    },
    limit: "Any algorithm must at least read the nodes it decides about, so $\\Omega(n)$ time is needed. $O(1)$ space is optimal. Floyd's method achieves both.",
    measure: { label: "n = number of nodes (the whole list is one cycle)", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Checking `slow == fast` before moving", what: "Writing `while (slow != fast) { ... }` with both starting at `head`.", why: "\"Keep going until they meet\" sounds natural.", breaks: "They start on the same node, so the loop body never runs and the answer is always the same.", avoid: "Move first, then compare (as the code does), or start `fast` one node ahead." },
    { title: "Testing only `fast->next` in the loop", what: "`while (fast->next != nullptr)`.", why: "Thinking of `fast->next->next` as the dangerous part.", breaks: "On an empty list `fast` is `null` and `fast->next` crashes. On an even-length list `fast` becomes `null` after the hop and the next test crashes.", avoid: "`while (fast != nullptr && fast->next != nullptr)`: the order matters." },
    { title: "Comparing values instead of nodes", what: "`if (slow->val == fast->val) return true;`.", why: "The pointers look like they hold \"the same thing\".", breaks: "A list `[1, 1, 1, 1]` with no cycle is reported as cyclic; equal values do not mean the same node.", avoid: "Compare the pointers themselves (`slow == fast`)." },
    { title: "Moving the pointers at the same speed", what: "`slow` and `fast` both advance one node.", why: "Forgetting that the speed difference is the whole idea.", breaks: "They are always the same distance apart, so inside a cycle they never meet and the loop never ends.", avoid: "Different speeds: `fast` moves two hops." },
    { title: "Marking visited nodes by editing the list", what: "Setting `node->val = INT_MAX` to remember a visit.", why: "It avoids a hash set and uses $O(1)$ memory.", breaks: "It destroys the caller's data and fails if `INT_MAX` is a legal value. The input is not yours to change.", avoid: "Use the two-pointer method; it needs no marks." },
  ],

  followUps: [
    {
      q: "**Find the node where the cycle begins** (Linked List Cycle II).",
      a: "After `slow` and `fast` meet, put one pointer back at `head` and move **both one hop at a time**. They meet exactly at the cycle's entry. Why: let the straight part have $\\mu$ nodes and the cycle $\\lambda$. At the meeting `slow` has walked $\\mu + a$ steps (with $a$ steps inside the cycle) and `fast` has walked twice that, so $2(\\mu + a) = \\mu + a + k\\lambda$, which gives $\\mu = k\\lambda - a$. Walking $\\mu$ more steps from the meeting point brings `slow` round to the entry (it is $a$ in, needs $\\lambda - a$ more, plus whole laps), exactly when the pointer from `head` has also walked $\\mu$ steps.",
      cpp: `ListNode* detectCycle(ListNode* head) {
    ListNode *slow = head, *fast = head;
    while (fast && fast->next) {
        slow = slow->next; fast = fast->next->next;
        if (slow == fast) {
            ListNode* p = head;
            while (p != slow) { p = p->next; slow = slow->next; }
            return p;                    // the first node of the cycle
        }
    }
    return nullptr;
}`,
      js: `function detectCycle(head) {
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow.next; fast = fast.next.next;
    if (slow === fast) {
      let p = head;
      while (p !== slow) { p = p.next; slow = slow.next; }
      return p;                          // the first node of the cycle
    }
  }
  return null;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "How long is the cycle?",
      a: "Once `slow` and `fast` have met, keep `slow` still and walk a second pointer from it until it returns to the same node, counting the hops. That count is $\\lambda$.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Why must `fast` move exactly **two** hops? Would three work?",
      a: "With speeds 1 and 2 the gap shrinks by exactly 1 per step, so it must hit 0. With speeds 1 and 3 the gap shrinks by 2 per step; if the gap is odd and the cycle length $\\lambda$ is even, the gap stays odd (an odd number minus 2, taken modulo an even number, is still odd), so it can never equal 0 and the pointers jump over each other for ever. A speed difference of exactly one is the safe choice.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Find the **duplicate number** in an array of $n+1$ integers from $1$ to $n$ without changing it and using $O(1)$ space.",
      a: "Treat the array as a linked list: index `i` points to `nums[i]`. Because a value repeats, two indices point to the same place, so the walk from index 0 must contain a cycle, and the **entry of the cycle is the duplicate**. Use the same two-phase Floyd method as above.",
      time: "O(n)", space: "O(1)",
    },
  ],

  related: [
    { id: "reverse-linked-list", why: "The other core pointer skill: rewiring arrows with three pointers instead of racing two pointers." },
    { id: "remove-nth-node-from-end-of-list", why: "Also two pointers, but kept a fixed gap apart so that one is `n` nodes behind the other." },
    { id: "reorder-list", why: "Uses slow and fast pointers to find the middle of the list in one pass." },
    { id: "graph-valid-tree", why: "The graph version of the question: a cycle means it is not a tree." },
  ],
  patternNote: "**Fast and slow pointers** answer questions about the *shape* of a linked structure using only two pointers and different speeds. Whenever the words *cycle*, *loop*, *middle* or *repeat* appear with a no-extra-memory rule, race a hare against a tortoise: if the road is straight the hare finishes, if it is a circle the hare must lap the tortoise.",
  takeaways: [
    "A visited set works in $O(n)$ time but costs $O(n)$ memory.",
    "Floyd's trick: `slow` moves 1, `fast` moves 2; they meet **if and only if** there is a cycle.",
    "The gap shrinks by exactly one per step, so `fast` cannot jump over `slow`.",
    "Loop on `fast != null && fast.next != null` (in that order) and compare **nodes**, not values.",
    "Time $O(n)$, space $O(1)$; the same idea finds the cycle entry, the middle and duplicates.",
  ],
});
