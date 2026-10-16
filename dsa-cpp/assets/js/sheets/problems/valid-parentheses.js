SHEETS.define({
  id: "valid-parentheses",
  viz: "stack",
  io: { fn: "isValid", params: [["s", "str"]], ret: "bool" },

  statement: `You are given a string \`s\` made only of the characters \`(\`, \`)\`, \`{\`, \`}\`, \`[\` and \`]\`.

Return \`true\` if the string is **valid**, otherwise \`false\`. A string is valid when:

1. every opening bracket is closed by a bracket of the **same type**,
2. brackets are closed in the **correct order** (the most recently opened one must be closed first), and
3. every closing bracket has a matching opening bracket.`,
  examples: [
    { input: 's = "()"', output: "true", explain: "One pair, closed immediately." },
    { input: 's = "()[]{}"', output: "true", explain: "Three separate pairs, one after the other." },
    { input: 's = "(]"', output: "false", explain: "`(` is closed by `]`, which is the wrong type." },
    { input: 's = "([)]"', output: "false", explain: "Each type appears the right number of times, but `[` is still open when `)` tries to close `(`: the order is wrong." },
  ],
  constraints: ["$1 \\le$ `s.length` $\\le 10^4$", "`s` consists only of `()[]{}`", "(An empty string is also treated as valid, which the lab lets you try.)"],

  intuition: {
    find: "A yes/no answer: can the brackets be paired up so that every pair is the same type and the pairs are properly **nested** (never crossing)?",
    beginner: "Count brackets: one `(` should be matched by one `)`, and so on. If all three counts balance, say valid.",
    works: "Counting is a real **necessary** condition: a valid string must have equal numbers of each opening and closing type. It is enough for strings with only one bracket type if you also never let the count go negative.",
    slow: "It is fast, but it is **wrong**: `\"([)]\"` and `\")(\"` both have balanced counts and are invalid. Counts forget **order**. The fix that stays simple is to repeatedly delete adjacent pairs `()`, `[]`, `{}` until nothing changes; that is correct but re-scans the string again and again, $O(n^2)$ in the worst case (`\"((((…))))\"` peels one layer per pass).",
    repeat: "Every pass of the delete-pairs method hunts for an *adjacent* matching pair, then rescans from the start. Yet the pair to delete is always the **most recently opened** bracket meeting the first closing one that follows it.",
    remember: "We only ever need the **most recent unmatched opening bracket**. When a closer arrives, it must match exactly that one. So remember the unmatched openers in a pile where the newest is on top: last in, first out.",
    observation: "The rule *\"a closing bracket must close the most recently opened one that is still open\"* is exactly **LIFO**: last in, first out. A **stack** is the data structure that gives you the newest element in $O(1)$, so the matching check is a single look at the top.",
    leads: "Scan left to right. Push every opening bracket. When a closing bracket arrives, the stack must be non-empty and its top must be the matching opener: pop it. Any violation means invalid. At the end the stack must be empty (no opener left unclosed).",
  },

  flow: [
    "Repeatedly delete adjacent pairs `()`, `[]`, `{}` until the string stops changing.",
    "If everything disappears, every bracket was properly matched and nested.",
    "Each pass rescans the string, and nested input needs about $n/2$ passes: $O(n^2)$.",
    "A closing bracket always matches the **most recent** opener that is still open.",
    "Keep the open brackets in a stack: the newest is on top, ready in $O(1)$.",
    "One pass: push openers, pop and compare on closers. $O(n)$ time, $O(n)$ space.",
  ],

  brute: {
    idea: "**Brute force:** keep deleting the substrings `\"()\"`, `\"[]\"` and `\"{}\"` from the string. If the string becomes empty, it was valid; if no pair is left to delete and characters remain, it is invalid.",
    why: "Each deletion needs a search for the next adjacent pair and a shift of the rest of the string, and a deeply nested input such as `\"((((....))))\"` can remove only the innermost pair in each round. With $n/2$ rounds of $O(n)$ work the cost is $\\Theta(n^2)$. The method also never uses the fact that matching is determined *locally* by the most recent opener.",
    time: "O(n^2)", space: "O(1)",
    measure: { fTex: "\\tfrac{n^2}{2}", f: (n) => (n * n) / 2, ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    bool isValid(string s) {
        bool changed = true;
        while (changed) {
            changed = false;
            for (string p : {"()", "[]", "{}"}) {
                size_t pos;
                while ((pos = s.find(p)) != string::npos) { s.erase(pos, 2); changed = true; }
            }
        }
        return s.empty();
    }
};`,
    js: `function isValid(s) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of ["()", "[]", "{}"]) {
      while (s.includes(p)) { s = s.replace(p, ""); changed = true; }
    }
  }
  return s.length === 0;
}`,
  },

  pattern: {
    name: "Stack",
    why: "Brackets nest like boxes inside boxes: the *last* box opened is the *first* one that must be closed. That *last-in, first-out* behaviour is the definition of a stack. Any time the most recent unfinished thing is the one you need next, a stack is the right tool.",
    recognize: [
      "Things must be **closed / matched / undone in reverse order** (brackets, tags, nested calls, undo history).",
      "You keep needing *\"the most recent item that is still pending\"*.",
      "Nested or recursive structure appears in a flat string or array (expression evaluation, decoding `3[ab]`, simplifying paths).",
      "You process input left to right and sometimes have to **look back at exactly one earlier thing**: its newest unresolved item.",
    ],
  },

  optimal: {
    idea: "Scan the string once with a stack of **unmatched opening brackets**. An opening bracket is pushed. A closing bracket must find, on top of the stack, the opener of the same type: if the stack is empty or the top is a different type, the string is invalid; otherwise pop the opener (that pair is done). After the last character, the string is valid only if no opener is left over.",
    steps: [
      "Create an empty stack of characters.",
      "For each character `c` of `s`: if `c` is an opening bracket (`(`, `[` or `{`), **push** it.",
      "Otherwise `c` is a closer. If the stack is **empty**, return `false` (nothing to close).",
      "Look at the **top**. If it is not the opener that matches `c`, return `false` (wrong type or wrong order). Otherwise **pop** it.",
      "After the loop, return `true` only if the stack is **empty**.",
    ],
    invariant: "**After reading a prefix, the stack holds exactly the opening brackets of that prefix that are still unmatched, oldest at the bottom and newest on top** — and everything else in the prefix is already perfectly matched.",
    correct: "*If we return `true`:* every closer popped an opener of its own type and the stack ended empty, so every bracket is matched and, because we always matched against the *newest* open one, the pairs never cross. *If the string is valid:* in a valid nesting, a closer's partner is always the newest open bracket (otherwise a newer opener would be left open inside it, which would cross), so our check passes at every closer and the stack empties at the end. So the algorithm accepts exactly the valid strings.",
  },

  cpp: `class Solution {
public:
    bool isValid(string s) {
        stack<char> st;                                   //@init
        for (char c : s) {                                //@loop
            if (c == '(' || c == '[' || c == '{') {       //@open
                st.push(c);                               //@push
            } else {
                if (st.empty()) return false;             //@empty
                char o = st.top(); st.pop();              //@pop
                if ((c == ')' && o != '(') ||             //@mismatch
                    (c == ']' && o != '[') ||
                    (c == '}' && o != '{')) return false; //@false
            }
        }
        return st.empty();                                //@end
    }
};`,
  js: `function isValid(s) {
  const st = [];                                  //@init
  for (const c of s) {                            //@loop
    if (c === "(" || c === "[" || c === "{") {    //@open
      st.push(c);                                 //@push
    } else {
      if (st.length === 0) return false;          //@empty
      const o = st.pop();                         //@pop
      if ((c === ")" && o !== "(") ||             //@mismatch
          (c === "]" && o !== "[") ||
          (c === "}" && o !== "{")) return false; //@false
    }
  }
  return st.length === 0;                         //@end
}`,

  tests: [
    { name: "Example 1: one pair", kind: "normal", input: { s: "()" } },
    { name: "Example 2: three pairs", kind: "normal", input: { s: "()[]{}" } },
    { name: "Example 3: wrong type", kind: "normal", input: { s: "(]" } },
    { name: "Nested pairs", kind: "normal", input: { s: "{[()]}" } },
    { name: "Crossing pairs", kind: "edge", input: { s: "([)]" }, why: "Counts balance and every type matches in number, yet the string is **invalid** because the pairs cross. This is exactly the case that breaks the \"just count them\" idea and is the reason a stack (order!) is needed." },
    { name: "Closing bracket first", kind: "edge", input: { s: ")(" }, why: "The very first character is a closer, so the stack is **empty** when we try to pop. If the code calls `top()` / `pop()` without the empty check, C++ crashes (undefined behaviour) and JS silently compares with `undefined`." },
    { name: "Opened but never closed", kind: "edge", input: { s: "(()" }, why: "Every closer finds a partner, so no mismatch is ever reported, but one `(` is left on the stack at the end. Forgetting the final `stack.empty()` check would wrongly return `true`." },
    { name: "Deep nesting", kind: "corner", input: { s: "((((((()))))))" }, why: "The stack grows to depth 7 before it starts to shrink: the worst case for memory, $n/2$ items. It also shows that nesting depth, not length, drives the stack size." },
    { name: "A single opening bracket", kind: "corner", input: { s: "(" }, why: "The smallest invalid input: no mismatch is found during the scan, only the leftover opener at the end gives it away." },
    { name: "Empty string (outside constraints)", kind: "corner", input: { s: "" }, why: "No characters means nothing is unmatched, so the empty string is valid by convention. The loop never runs and the final `st.empty()` returns `true`." },
  ],

  trace(input, T) {
    const s = input.s, chars = s.split(""), n = chars.length;
    const table = [["(", ")"], ["[", "]"], ["{", "}"]];
    const open = { "(": ")", "[": "]", "{": "}" }, closeOf = { ")": "(", "]": "[", "}": "{" };
    const stack = [];   // { t, at }
    let whyPush = false, whyPop = false, whyEmpty = false, whyEnd = false;
    const S = (i, o = {}) => () => {
      const hl = {};
      stack.forEach((e) => (hl[e.at] = "key"));
      for (let k = 0; k < (i == null ? n : i); k++) if (!stack.some((e) => e.at === k) && !(o.bad && o.bad.includes(k))) hl[k] = "ok";
      if (o.matched != null) { hl[o.matched] = "ok"; }
      if (i != null && i < n) hl[i] = o.res === "bad" ? "bad" : "cur";
      if (o.bad) o.bad.forEach((k) => (hl[k] = "bad"));
      return { input: chars, i: i != null && i < n ? i : null, hl, stack: stack.map((e) => ({ t: e.t, id: e.at, cls: o.topCls && e === stack[stack.length - 1] ? o.topCls : "key" })), cmp: o.cmp, table, tableHl: o.tableHl, result: o.result, label: `s  (${n} character${n === 1 ? "" : "s"})`, slots: Math.max(5, Math.min(8, n)) };
    };
    T.step("init", { vars: { "stack.size": 0 }, state: S(0), phase: "Scan left to right", say: "We scan the string once. The stack will hold the **opening brackets that are still waiting to be closed**, the newest on top.", op: "stack = [ ]", act: "START" });
    for (let i = 0; i < n; i++) {
      const c = chars[i];
      const vars = (extra = {}) => Object.assign({ i, c, "stack.size": stack.length, top: stack.length ? stack[stack.length - 1].t : "—" }, extra);
      T.step("loop", { vars: vars(), state: S(i), say: `Read the next character: **\`${c}\`** (index ${i}).`, op: `c = s[${i}] = '${c}'`, act: "READ" });
      if (open[c]) {
        T.step("open", { vars: vars(), state: S(i), say: `\`${c}\` is an **opening** bracket. We cannot judge it yet: it can only be validated when its partner \`${open[c]}\` arrives.`, op: `'${c}' is an opening bracket`, act: "OPENER" });
        stack.push({ t: c, at: i });
        T.step("push", { vars: vars(), state: S(i), say: `**Push** \`${c}\`. It is now the newest unmatched opener, so it is the one the next closer must match.`, op: `push('${c}')  →  size ${stack.length}`, act: "PUSH",
          why: whyPush ? null : { title: "Why push openers?", text: "An opener waits for its closer. Several can be waiting at once, and the **newest** one must be closed first: that last-in, first-out order is exactly what a stack stores." } });
        whyPush = true;
        continue;
      }
      // a closing bracket
      T.step("open", { vars: vars(), state: S(i), say: `\`${c}\` is a **closing** bracket, so it must close the most recent unmatched opener.`, op: `'${c}' is a closing bracket`, act: "CLOSER" });
      if (!stack.length) {
        T.step("empty", { vars: vars(), state: S(i, { res: "bad", result: "invalid" }), say: `The stack is **empty**: there is no opener for \`${c}\` to close. The string is invalid.`, op: "stack.empty() → true  ⇒  return false", act: "INVALID",
          why: whyEmpty ? null : { title: "Why is an empty stack fatal here?", text: "A closer with nothing open has no partner at all. Always test for empty **before** looking at the top; reading the top of an empty stack is undefined behaviour in C++." } });
        whyEmpty = true;
        T.result(false);
        return;
      }
      const top = stack[stack.length - 1];
      const ok = top.t === closeOf[c];
      T.step("pop", { vars: vars(), state: S(i, { cmp: { res: null, text: `top = ${top.t}` }, tableHl: closeOf[c] }), say: `Look at the **top** of the stack: \`${top.t}\`, the newest unmatched opener. Does \`${c}\` close it? The partner of \`${c}\` is \`${closeOf[c]}\`.`, op: `top = '${top.t}',  '${c}' needs '${closeOf[c]}'`, act: "COMPARE" });
      if (!ok) {
        T.step("false", { vars: vars(), state: S(i, { cmp: { res: "bad", text: `${top.t} ≠ ${closeOf[c]}` }, res: "bad", bad: [top.at], result: "invalid", topCls: "bad" }), say: `\`${top.t}\` is on top but \`${c}\` needs \`${closeOf[c]}\`. The newest open bracket is the wrong type, so the pairs would cross. **Invalid.**`, op: `'${top.t}' ≠ '${closeOf[c]}'  ⇒  return false`, act: "MISMATCH",
          why: { title: "Why is a mismatch final?", text: `Everything between \`${top.t}\` and \`${c}\` is already matched (otherwise it would be on the stack above \`${top.t}\`), so \`${c}\` could only close \`${top.t}\` itself. If the types differ, no arrangement can fix it.` } });
        T.result(false);
        return;
      }
      stack.pop();
      T.step("mismatch", { vars: vars(), state: S(i, { cmp: { res: "ok", text: `${top.t} ${c} ✓` }, matched: top.at, topCls: "ok" }), say: `\`${top.t}\` and \`${c}\` are a matching pair. **Pop** \`${top.t}\`: that pair is complete and the opener before it becomes the new top.`, op: `'${top.t}' matches '${c}'  →  pop,  size ${stack.length}`, act: "MATCH",
        why: whyPop ? null : { title: "Why does popping keep the string valid so far?", text: "The popped pair is closed, and everything inside it was matched before it was popped. The prefix is still a valid nesting with exactly the openers on the stack left open." } });
      whyPop = true;
    }
    const valid = stack.length === 0;
    T.step("end", { vars: { "stack.size": stack.length }, state: S(null, { result: valid ? "valid" : "invalid" }), say: valid ? "The whole string is read and the stack is **empty**: every opener found its closer. **Valid.**" : `The string ends but the stack still holds ${stack.length} unclosed opener${stack.length === 1 ? "" : "s"}. **Invalid.**`, op: `stack.empty() → ${valid}`, act: valid ? "VALID" : "INVALID",
      why: whyEnd || valid ? null : { title: "Why check the stack at the end?", text: "Reaching the end without a mismatch only proves that every *closer* was fine. Openers that never got a closer are still on the stack, and each one is an error." } });
    T.result(valid);
  },
  fuzz(rnd) {
    const chars = "()[]{}";
    if (rnd() < 0.5) { let s = ""; const n = Math.floor(rnd() * 5); const st = []; for (let i = 0; i < n * 2 + 2; i++) { if (st.length && (rnd() < 0.5 || st.length > 5)) { s += { "(": ")", "[": "]", "{": "}" }[st.pop()]; } else { const o = "([{"[Math.floor(rnd() * 3)]; st.push(o); s += o; } } while (st.length) s += { "(": ")", "[": "]", "{": "}" }[st.pop()]; if (rnd() < 0.3 && s.length) { const k = Math.floor(rnd() * s.length); s = s.slice(0, k) + chars[Math.floor(rnd() * 6)] + s.slice(k + 1); } return { s }; }
    const n = Math.floor(rnd() * 12); let s = ""; for (let i = 0; i < n; i++) s += chars[Math.floor(rnd() * 6)];
    return { s };
  },
  gen(n) { const h = Math.floor(n / 2); return { s: "(".repeat(h) + ")".repeat(h) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "each character is pushed at most once and popped at most once", short: "at most n pushes and n pops in total",
      derive: [
        "\\text{pushes} \\le n || only opening brackets are pushed, and each character is read once",
        "\\text{pops} \\le \\text{pushes} \\le n || a pop needs something on the stack to remove",
        "T(n) = n \\cdot c_{\\text{read}} + \\text{pushes}\\cdot c_{\\text{push}} + \\text{pops}\\cdot c_{\\text{pop}} \\le n(c_{\\text{read}} + c_{\\text{push}}) + n\\,c_{\\text{pop}} || every push, pop and comparison is $O(1)$",
        "T(n) \\le c' \\cdot n || the constants merge",
        "!T(n) = O(n) || a single left-to-right pass",
      ],
      where: "Although the stack changes size, **no character is ever revisited**. This is *amortised* reasoning: a pop is paid for by an earlier push, so the total number of stack operations over the whole run is at most $2n$, not $n$ pops each costing $O(n)$.",
    },
    space: {
      tex: "O(n)", title: "the stack can hold every opening bracket", short: "worst case: a string of only opening brackets, or n/2 openers before any closer",
      derive: [
        "S(n) = \\max_t |\\text{stack}_t| \\cdot s_{\\text{char}} || memory is the largest size the stack ever reaches",
        "\\max_t |\\text{stack}_t| \\le n || at most one entry per character",
        "!S(n) = O(n) || attained by `\"((((…\"` (all openers), though valid strings reach at most $n/2$",
      ],
      where: "The stack is the only extra memory. For a valid string it never exceeds $n/2$ entries (each opener needs a closer later), but a string like `\"((((((\"` pushes all $n$ characters before the end reveals the failure.",
    },
    limit: "$O(n)$ time is optimal because every character must be inspected. Space can be reduced to $O(1)$ **only if there is a single bracket type** (just a counter that must never go negative and end at zero). With three types, the *order* of types has to be remembered, which needs a stack.",
    measure: { label: "n = s.length", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Popping or peeking an empty stack", what: "Calling `st.top()` / `st.pop()` (or `.pop()` in JS) when the stack may be empty.", why: "The valid examples never hit the problem, so the bug stays hidden until a string starts with a closer, e.g. `\")(\"`.", breaks: "In C++, `top()` on an empty `stack` is undefined behaviour: a crash or garbage. In JS, `pop()` returns `undefined`, which then silently fails every comparison.", avoid: "Check `st.empty()` **before** reading the top. An empty stack at a closer means *invalid*." },
    { title: "Forgetting the final emptiness check", what: "Returning `true` after the loop without checking the stack.", why: "The loop reports every mismatch it finds, so it feels complete.", breaks: "Strings like `\"(((\"` or `\"(()\"` have no wrong closer but leave openers behind, and are wrongly reported as valid.", avoid: "The last line must be `return st.empty();`." },
    { title: "Only counting brackets", what: "Using one counter per type and checking they end at zero.", why: "It is the first idea and it solves single-type versions.", breaks: "It cannot see order: `\"([)]\"` and `\")(\"` have balanced counts but are invalid.", avoid: "Order is the whole point: use a stack so that a closer is checked against the **newest** open bracket." },
    { title: "Comparing the closer to the wrong thing", what: "Pushing the opener but comparing the closer with the **first** unmatched opener, or with the character just before it.", why: "Mixing up which end of the pile is \"newest\".", breaks: "`\"{[]}\"` fails, because `]` is compared against `{` instead of `[`.", avoid: "The only item that can legally match is the **top**: `st.top() == matching(c)`." },
    { title: "Not mapping each closer to its own opener", what: "Writing `if (c == ')' ) { ... }` for one type only, or treating all closers alike.", why: "Handling the example with just `()` and generalising badly.", breaks: "`\"(]\"` is accepted as valid, since any closer pops any opener.", avoid: "Keep an explicit mapping `)`→`(`, `]`→`[`, `}`→`{`, or push the *expected closer* instead of the opener." },
  ],

  followUps: [
    {
      q: "A neat trick: how can you avoid the three-way `if` for matching types?",
      a: "Push the **expected closing bracket** instead of the opener. When you see `(` push `)`, when you see `[` push `]`, and so on. A closer is then valid exactly when it equals the top. The matching table disappears into the push step, and the comparison becomes a plain `c == st.top()`.",
      cpp: `bool isValid2(string s) {
    stack<char> st;
    for (char c : s) {
        if (c == '(') st.push(')');
        else if (c == '[') st.push(']');
        else if (c == '{') st.push('}');
        else {
            if (st.empty() || st.top() != c) return false;
            st.pop();
        }
    }
    return st.empty();
}`,
      js: `function isValid2(s) {
  const st = [];
  for (const c of s) {
    if (c === "(") st.push(")");
    else if (c === "[") st.push("]");
    else if (c === "{") st.push("}");
    else if (st.length === 0 || st.pop() !== c) return false;
  }
  return st.length === 0;
}`,
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Only **one** kind of bracket, `(` and `)`. Can you use $O(1)$ extra space?",
      a: "Yes. With a single type, the stack would only ever contain identical items, so the **stack size is the only information** and a counter replaces it. Increment on `(`, decrement on `)`. If the counter ever goes negative, return `false`; at the end it must be exactly `0`.",
      cpp: `bool balanced(const string& s) {
    int open = 0;
    for (char c : s) {
        open += (c == '(') ? 1 : -1;
        if (open < 0) return false;     // a closer with nothing to close
    }
    return open == 0;
}`,
      js: `function balanced(s) {
  let open = 0;
  for (const c of s) {
    open += c === "(" ? 1 : -1;
    if (open < 0) return false;         // a closer with nothing to close
  }
  return open === 0;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Return the length of the **longest valid** parentheses substring of a string of `(` and `)`.",
      a: "Keep a stack of **indices** instead of characters, starting with a sentinel `-1` (the index just before the string). On `(` push its index. On `)` pop; if the stack becomes empty, push the current index as the new sentinel (a boundary no valid substring can cross); otherwise the length of the current valid run is `i − stack.top()`. Take the maximum. It is the same stack idea, remembering *where* openers are.",
      time: "O(n)", space: "O(n)",
    },
    {
      q: "How would you make the **minimum number of insertions** so that the string becomes valid?",
      a: "Scan with a counter of unmatched openers `open` and a counter `add` of insertions. For each `)`: if `open > 0` then `open--`, otherwise this closer has no partner, so we must insert one `(` before it: `add++`. At the end every leftover unmatched `(` needs a `)` appended, so the answer is `add + open`. It is $O(n)$ time and $O(1)$ space, because the stack degenerates into a counter for a single bracket type.",
      time: "O(n)", space: "O(1)",
    },
  ],

  related: [
    { id: "maximum-depth-of-binary-tree", why: "Recursion *is* a stack: the call stack remembers the pending work of each ancestor, just like the bracket stack remembers pending openers." },
    { id: "number-of-islands", why: "An iterative depth-first search replaces recursion with an explicit stack of cells still to explore." },
    { id: "binary-tree-level-order-traversal", why: "Swap the stack (last in, first out) for a **queue** (first in, first out) and you get breadth-first order instead." },
  ],
  patternNote: "**The Stack pattern** appears whenever the *most recent* unfinished item decides what happens next: matching brackets, undoing operations, evaluating nested expressions, DFS. If your first thought is \"I need to look back at the last thing I saw that is still open\", reach for a stack. Each element is pushed once and popped once, so the work stays linear.",
  takeaways: [
    "A closing bracket must match the **most recent** unmatched opener: that is last-in, first-out, i.e. a **stack**.",
    "Push openers; on a closer, check the stack is not empty and its **top** is the matching type, then pop.",
    "At the end the stack must be **empty**, otherwise some opener was never closed.",
    "Time $O(n)$ (each character pushed and popped at most once, amortised), space $O(n)$.",
    "Counting alone is wrong because it forgets order: `\"([)]\"` and `\")(\"` balance but are invalid.",
  ],
});
