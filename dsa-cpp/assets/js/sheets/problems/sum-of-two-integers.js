SHEETS.define({
  id: "sum-of-two-integers",
  viz: "bit",
  io: { fn: "getSum", params: [["a", "int"], ["b", "int"]], ret: "int" },

  statement: `Given two integers \`a\` and \`b\`, return their sum **without using the operators \`+\` and \`-\`**.

Work with ordinary 32-bit signed integers (two's complement), as in C++ and Java.`,
  examples: [
    { input: "a = 1, b = 2", output: "3", explain: "`1 + 2 = 3`." },
    { input: "a = 2, b = 3", output: "5", explain: "`2 + 3 = 5`." },
  ],
  constraints: ["$-1000 \\le a, b \\le 1000$"],

  intuition: {
    find: "The sum `a + b`, built only from bit operations (`&`, `|`, `^`, `<<`, `>>`), the way the adder circuit inside a CPU does it.",
    beginner: "Do what we do on paper: add the two numbers **one bit position at a time** from the right, writing the sum bit and carrying a 1 to the next position when needed.",
    works: "It is exactly the school-book addition done in binary, so it gives the right answer. You can code it as a loop over the 32 bit positions with a `carry` variable.",
    slow: "It is not slow (32 steps), but it is **clumsy**: a loop over every bit, with several conditions per bit for the sum and the carry. There is a much shorter way that processes all the bit positions **at once**.",
    repeat: "We repeat the same tiny rule at each of the 32 positions: *sum bit = x ⊕ y ⊕ carry*, *new carry = majority(x, y, carry)*. All 32 positions use the same rule, which suggests it can be done on whole numbers in parallel.",
    remember: "Split addition into two independent parts: **(1)** the sum *without* carries, and **(2)** the carries themselves. Then add them. Adding them is the same problem again, but the carries are always a bit further to the left, so the process ends.",
    observation: "For one bit: `x + y` without carry is `x XOR y`, and the carry is `x AND y`, shifted one place **left** because it belongs to the next position. In full numbers: `a + b = (a XOR b) + ((a AND b) << 1)`. The right side is a sum of the same kind, but its second part has **fewer / farther-left set bits**.",
    leads: "Repeat: `carry = (a & b) << 1; a = a ^ b; b = carry;` until `b == 0` (no carry left). Then `a` holds the sum. Each round pushes the carries at least one bit to the left, so after at most 32 rounds they fall off the end.",
  },

  flow: [
    "Add bit by bit with an explicit carry, like on paper.",
    "It is exactly binary school-book addition, so it is correct.",
    "Correct but clumsy: a 32-step loop with several cases per bit.",
    "Without carries, addition is XOR; the carries are AND, shifted left.",
    "`a + b = (a ^ b) + ((a & b) << 1)`: same problem, carries pushed left.",
    "Repeat until no carry is left: at most 32 rounds, $O(1)$ for 32-bit integers.",
  ],

  brute: {
    idea: "**Brute force:** simulate a **ripple-carry adder**. For each of the 32 bit positions, read bit `x` of `a`, bit `y` of `b`, compute the sum bit `x ^ y ^ carry` and the new carry `(x & y) | (carry & (x ^ y))`, and write the sum bit into the result.",
    why: "It is correct and also constant-time for 32-bit numbers, but it needs a loop over **all** 32 positions even for `1 + 2`, plus a handful of bit tricks per position. The clever version does the same work with three operations per *round* and stops as soon as no carry remains.",
    time: "O(1)", space: "O(1)",
    cpp: `class Solution {
public:
    int getSum(int a, int b) {
        unsigned x = a, y = b, res = 0, carry = 0;
        for (int i = 0; i < 32; i++) {
            unsigned bx = (x >> i) & 1, by = (y >> i) & 1;
            res |= (bx ^ by ^ carry) << i;
            carry = (bx & by) | (carry & (bx ^ by));
        }
        return (int)res;
    }
};`,
    js: `function getSum(a, b) {
  let res = 0, carry = 0;
  for (let i = 0; i < 32; i++) {
    const bx = (a >>> i) & 1, by = (b >>> i) & 1;
    res |= (bx ^ by ^ carry) << i;
    carry = (bx & by) | (carry & (bx ^ by));
  }
  return res | 0;
}`,
  },

  pattern: {
    name: "Bit Manipulation",
    why: "Addition itself is made of bit operations inside a CPU: XOR gives the digit and AND gives the carry. Re-implementing it with those operations is the cleanest way to see that **arithmetic is bit manipulation**. The technique (split into a *carry-free part* and a *carry part*, then repeat) is the same one used in many bit puzzles.",
    recognize: [
      "The problem **forbids arithmetic operators** and allows only bitwise operations.",
      "You can express the operation as *\"the part without interaction\"* plus *\"the interaction\"* (XOR for sum, AND for carry).",
      "A repeat-until-stable loop that moves bits in one direction (so it must terminate).",
      "Two's complement (negative numbers) must work without any special case: the same bit rule is valid.",
    ],
  },

  optimal: {
    idea: "Treat addition as two parts. `a ^ b` is the sum of the bits **ignoring carries**. `(a & b) << 1` is the carries, already moved to the position where they must be added. The true sum is the sum of those two numbers: so repeat the same step with `a ← a ^ b` and `b ← carries` until there are no carries.",
    steps: [
      "While `b != 0` (there is still a carry to add):",
      "Compute the carries: `carry = (a & b) << 1` (bits where both are 1, moved one place left).",
      "Compute the carry-free sum: `a = a ^ b`.",
      "Make the carries the new addend: `b = carry`.",
      "When `b == 0`, return `a`.",
    ],
    invariant: "**The value `a + b` never changes** (it always equals the original sum), and **the lowest set bit of `b` moves at least one position to the left each round**, so `b` eventually becomes 0.",
    correct: "For single bits, `x + y = (x ^ y) + 2·(x & y)`: if both are 0 or exactly one is 1 the carry is 0; if both are 1 the sum is 2, which is 0 in this position plus a carry of 1 in the next. Applying that to every bit at once gives `a + b = (a ^ b) + ((a & b) << 1)` for whole numbers. Each round keeps `a + b` unchanged, so when `b` reaches 0 we have `a + 0 = ` the sum. *Termination:* `(a & b) << 1` has its lowest set bit at least one place higher than the lowest set bit common to `a` and `b`, so the carries march left and are shifted out of the 32-bit word after at most 32 rounds. Two's complement needs no special case: the identity above is valid for the bit patterns themselves, modulo $2^{32}$.",
  },

  cpp: `class Solution {
public:
    int getSum(int a, int b) {
        while (b != 0) {                                     // while a carry remains //@loop
            unsigned carry = (unsigned)(a & b) << 1;         // both 1: carry left //@carry
            a = a ^ b;                                       // sum without carry //@xor
            b = (int)carry;                                  // add the carries next //@shift
        }
        return a;                                            //@ret
    }
};`,
  js: `function getSum(a, b) {
  while (b !== 0) {                                          // while a carry remains //@loop
    const carry = (a & b) << 1;                              // both 1: carry left //@carry
    a = a ^ b;                                               // sum without carry //@xor
    b = carry;                                               // add the carries next //@shift
  }
  return a;                                                  //@ret
}`,

  tests: [
    { name: "Example 1: 1 + 2", kind: "normal", input: { a: 1, b: 2 } },
    { name: "Example 2: 2 + 3", kind: "normal", input: { a: 2, b: 3 } },
    { name: "A carry that ripples: 7 + 1", kind: "normal", input: { a: 7, b: 1 } },
    { name: "Adding zero", kind: "edge", input: { a: 12, b: 0 }, why: "`b` is `0` from the start, so the loop never runs and `a` is returned unchanged. The algorithm needs no special case for zero." },
    { name: "A negative and a positive", kind: "edge", input: { a: -2, b: 3 }, why: "Negative numbers are stored in **two's complement**, with leading 1 bits. The same XOR/AND rule adds them correctly with no sign handling at all: the carry runs through the high bits and falls off the end of the 32-bit word." },
    { name: "Two negatives", kind: "edge", input: { a: -3, b: -5 }, why: "Both numbers have all their upper bits set to 1, so every high position generates a carry. The result, `-8`, appears once the carries have been shifted out of the word." },
    { name: "A number and its negation", kind: "corner", input: { a: 1, b: -1 }, why: "The worst case for the number of rounds: `1 + (−1) = 0`. The carry ripples through **all 32 positions**, so the loop runs 32 times. It shows why the bound is 32 rounds, not 1." },
    { name: "Carry chain through ten bits", kind: "corner", input: { a: 1, b: 1023 }, why: "`1 + 1111111111₂`: the single carry must travel through ten 1-bits before it finds a free position, giving `1024`. Each round moves the carry exactly one place left." },
    { name: "Both zero", kind: "corner", input: { a: 0, b: 0 }, why: "No bits are set anywhere: the loop does not run and the answer is `0`. A check that mistakenly loops until `a == 0` would never start." },
  ],

  trace(input, T) {
    let a = input.a | 0, b = input.b | 0;
    const neg = a < 0 || b < 0 || Math.abs(a) >= 1024 || Math.abs(b) >= 1024;
    const W = neg ? 32 : 12;
    const mask = (v) => (W === 32 ? v | 0 : v);
    const hlOf = (x, y) => { const h = {}; for (let i = 0; i < W; i++) { const p = (x >>> i) & 1, q = (y >>> i) & 1; if (p && q) h[i] = "hit"; else if (p ^ q) h[i] = "cmp"; } return h; };
    const note = W === 32 ? "all 32 bits shown (negative numbers have leading 1 bits)" : "the lowest 12 of the 32 bits are shown";
    const rows = (list) => list.map(([label, value, hl, cls, n]) => ({ label, value, width: W, hl, cls, note: n }));
    let rounds = 0, whyX = false, whyC = false, whyEnd = false;
    T.step("loop", { vars: { a, b }, state: { rows: rows([["a", a], ["b", b]]), note, label: `adding ${a} and ${b} with bit operations` }, phase: "Repeat: carry-free sum + carries", say: b === 0 ? `\`b = 0\`: there is no carry, so \`a = ${a}\` is already the answer.` : `\`a = ${a}\`, \`b = ${b}\`. We will add them without \`+\`: first the sum ignoring carries, then the carries.`, op: `b != 0  →  ${b !== 0}`, act: b === 0 ? "NO_CARRY" : "START" });
    while (b !== 0) {
      rounds++;
      const both = a & b, carry = both << 1, x = a ^ b;
      T.step("carry", { vars: { a, b, "a & b": both, carry }, state: { rows: rows([["a", a, hlOf(a, b)], ["b", b, hlOf(b, a)], ["a & b", both, {}, "hot", "positions where BOTH are 1"], ["carry", carry, {}, "hot", "(a & b) << 1"]]), note, label: `round ${rounds}: the carries` }, say: `Where **both** bits are 1 (green), the column adds to 2: write 0 and carry 1 to the next column. \`a & b = ${both}\`, shifted left by one: **carry = ${carry}**.`, op: `carry = (${a} & ${b}) << 1 = ${both} << 1 = ${carry}`, act: "CARRIES",
        why: whyC ? null : { title: "Why shift left by one?", text: "A carry produced in column *i* is worth 2ⁱ⁺¹, so it must be added in column *i+1*. Shifting `a & b` left by one puts every carry in the column where it belongs." } });
      whyC = true;
      T.step("xor", { vars: { a, b, carry, "a ^ b": x }, state: { rows: rows([["a", a, hlOf(a, b)], ["b", b, hlOf(b, a)], ["a ^ b", x, {}, "ok", "sum without carries"]]), note, label: `round ${rounds}: the carry-free sum` }, say: `Where exactly **one** bit is 1 (amber) the column adds to 1 with no carry. XOR keeps those and clears the columns where both are 1: \`a ^ b = ${x}\`. That is the sum **ignoring carries**.`, op: `a = ${a} ^ ${b} = ${x}`, act: "XOR",
        why: whyX ? null : { title: "Why does XOR give the carry-free sum?", text: "Column by column: 0+0=0, 0+1=1, 1+0=1, and 1+1=2 which is written as 0 (the carry goes elsewhere). That is exactly the truth table of XOR." } });
      whyX = true;
      a = x;
      T.step("shift", { vars: { a, b: carry }, state: { rows: rows([["a", a, hlOf(a, carry)], ["b = carry", carry, hlOf(carry, a)]]), note, label: `round ${rounds}: carries become the new b` }, say: carry === 0 ? `The carry is **0**: nothing is left to add. \`a = ${a}\` is the final sum.` : `The carries become the new addend: \`b = ${carry}\`. We now have to add \`a = ${a}\` and \`b = ${carry}\`: the same problem, but the carry bits are **farther left**.`, op: `b = carry = ${carry}`, act: carry === 0 ? "DONE_CARRYING" : "NEXT_ROUND" });
      b = carry;
    }
    T.step("ret", { vars: { a, rounds }, state: { rows: rows([["result", a, {}, "hit"]]), note, label: "the sum" }, say: `\`b = 0\`, so the loop ends after **${rounds}** round${rounds === 1 ? "" : "s"}. The sum is **${a}**.`, op: `return a = ${a}`, act: "DONE",
      why: whyEnd || rounds < 2 ? null : { title: "Why does it always stop?", text: "Each round the carry bits move at least one column to the left. After at most 32 rounds they have fallen out of the 32-bit word, so `b` becomes 0." } });
    T.result(a);
  },
  fuzz(rnd) { return { a: Math.floor(rnd() * 2001) - 1000, b: Math.floor(rnd() * 2001) - 1000 }; },
  gen(n) { return { a: 1, b: Math.pow(2, n) - 1 }; },

  complexity: {
    time: {
      tex: "O(1)", title: "at most 32 rounds of three bit operations", short: "bounded by the word size w = 32 (O(w) in general)",
      derive: [
        "\\text{the lowest set bit of the carry moves left by at least 1 per round} || `(a & b) << 1` always starts one place above the lowest common 1",
        "\\text{after } w \\text{ rounds it has left the } w\\text{-bit word, so } b = 0 \\;\\Rightarrow\\; \\text{rounds} \\le w = 32 || the carry chain cannot be longer than the word",
        "T = \\text{rounds} \\cdot (c_{\\&} + c_{\\ll} + c_{\\oplus}) \\le 32\\,c || each round is three bit operations on whole words",
        "!T = O(w) = O(1) \\text{ for 32-bit integers} || a constant, independent of the values",
      ],
      where: "For machine integers the loop count is at most the word size, so the time is constant. In the lab, `1 + (−1)` is the slowest input (32 rounds) because the carry has to ripple through every position. The measured table below counts steps for carry chains of growing length.",
    },
    space: {
      tex: "O(1)", title: "three integers", short: "`a`, `b` and `carry`",
      derive: [
        "S = |a| + |b| + |\\text{carry}| || the only variables",
        "!S = 3c = O(1) || no arrays, no recursion",
      ],
      where: "Everything happens in registers. (A recursive version would use one stack frame per round: at most 32.)",
    },
    limit: "You cannot be faster than reading the two numbers, but for 32-bit integers $O(1)$ is already the best possible. For *big* integers with $n$ bits the carry-propagation loop is $O(n)$ rounds, and clever adders (carry-lookahead) work in $O(\\log n)$ depth.",
    measure: { label: "n = length of the carry chain (bits)", fTex: "n", f: (n) => n, sizes: [4, 8, 12, 16, 20, 24, 28], growth: "linear in the length of the carry chain (and at most 32)" },
  },

  mistakes: [
    { title: "Left-shifting a negative signed number in C++", what: "`int carry = (a & b) << 1;` when `a & b` is negative.", why: "It looks like ordinary integer arithmetic.", breaks: "Shifting a negative signed value left is undefined behaviour before C++20 (and implementation-flavoured afterwards), and compilers can exploit it.", avoid: "Convert to `unsigned` for the shift, then back: `(unsigned)(a & b) << 1`." },
    { title: "Forgetting the `<< 1` on the carry", what: "`carry = a & b;` and adding it at the same column.", why: "The AND gives the columns that overflow, so it feels like the carry itself.", breaks: "The carry is added into the **wrong column** (the same one it came from), so `1 + 1` produces `0` instead of `2`.", avoid: "A carry from column *i* belongs to column *i + 1*: shift left by one." },
    { title: "Updating `a` before computing the carry", what: "`a = a ^ b; carry = (a & b) << 1;`", why: "The two lines look independent.", breaks: "The AND now uses the new `a`, which is the carry-free sum, so the carries are wrong.", avoid: "Compute `carry` **first** (from the original `a` and `b`), then update `a`." },
    { title: "Stopping the loop at `a & b == 0`", what: "`while (a & b)`.", why: "\"No overlapping 1 bits means no carries.\"", breaks: "That is true for the *first* round, but it ignores that after XOR the old carry `b` must still be added: the loop ends one step early and returns a wrong value.", avoid: "Loop until the **carry** `b` is zero: `while (b != 0)`." },
    { title: "Believing it can loop forever on negatives", what: "Worrying (or in Python actually hitting) an infinite loop.", why: "In languages with arbitrary-precision integers, `-1 << 1` keeps growing negative.", breaks: "In Python the carry never shifts out of the word, so the loop does not terminate for some negatives unless you mask to 32 bits.", avoid: "In C++/Java/JS the 32-bit width bounds it. In Python, mask with `0xFFFFFFFF` and convert back." },
  ],

  followUps: [
    {
      q: "Subtract two numbers without using `-` (and `+`).",
      a: "In two's complement, `-b = ~b + 1`, so `a − b = a + (~b + 1)`. Compute the negation with the same adder: `negB = getSum(~b, 1)`, then `getSum(a, negB)`. Everything still uses only bit operations.",
      cpp: `int getDiff(int a, int b) {
    int negB = getSum(~b, 1);     // two's complement negation
    return getSum(a, negB);
}`,
      js: `function getDiff(a, b) {
  const negB = getSum(~b, 1);     // two's complement negation
  return getSum(a, negB);
}`,
      time: "O(1)", space: "O(1)",
    },
    {
      q: "Write the **recursive** version.",
      a: "The identity `a + b = (a ^ b) + ((a & b) << 1)` is already recursive: if `b == 0` return `a`, otherwise recurse with `(a ^ b, (a & b) << 1)`. It uses one stack frame per round, at most 32, so $O(1)$ for 32-bit numbers (but $O(w)$ in general).",
      cpp: `int getSumRec(int a, int b) {
    return b == 0 ? a : getSumRec(a ^ b, (int)((unsigned)(a & b) << 1));
}`,
      js: `function getSumRec(a, b) {
  return b === 0 ? a : getSumRec(a ^ b, (a & b) << 1);
}`,
      time: "O(1)", space: "O(1)",
    },
    {
      q: "Multiply two integers without `*`.",
      a: "Use **shift-and-add** (Russian peasant multiplication): look at the bits of `b` from the lowest; whenever the current bit is 1, add the (shifted) `a` to the result with the adder above; shift `a` left and `b` right each round. It takes one round per bit of `b`: $O(\\log b)$ additions.",
      time: "O(\\log b)", space: "O(1)",
    },
    {
      q: "How does a hardware adder do this?",
      a: "A **ripple-carry adder** is a chain of *full adders*, one per bit: each outputs `x ^ y ^ carry_in` and `carry_out = (x & y) | (carry_in & (x ^ y))`. It is exactly the brute-force loop in this lesson, but with the loop unrolled into 32 wired copies. Faster designs (*carry-lookahead*, *carry-select*) compute many carries in parallel to cut the delay from $O(n)$ to $O(\\log n)$.",
      time: "O(n) gate delay (ripple)", space: "O(n) gates",
    },
  ],

  related: [
    { id: "number-of-1-bits", why: "Another bit-trick loop whose cost depends on the number of set bits: `n & (n − 1)` clears the lowest one." },
    { id: "counting-bits", why: "Builds the popcount of every number from its predecessors using shifts and masks." },
    { id: "missing-number", why: "Uses XOR's key property (`x ^ x = 0`) to cancel everything that appears twice." },
    { id: "reverse-bits", why: "Builds a result bit by bit with shifts and masks, in a loop of 32 rounds." },
  ],
  patternNote: "**The Bit Manipulation pattern** treats a number as a row of independent bits and uses `&`, `|`, `^`, `<<`, `>>` to work on all of them at once. Look for the *per-bit* truth table first (here: sum = XOR, carry = AND), then lift it to whole words, and check whether repeating the step terminates (the carries move left).",
  takeaways: [
    "Per bit: **sum = XOR**, **carry = AND**, and the carry belongs to the **next** column (`<< 1`).",
    "`a + b = (a ^ b) + ((a & b) << 1)`: repeat until the carry `b` is 0.",
    "Compute the carry **before** updating `a`; shift as `unsigned` in C++ to avoid undefined behaviour.",
    "At most 32 rounds, so $O(1)$ time and space for 32-bit integers; two's complement needs no special case.",
    "The same adder gives subtraction (`a + (~b + 1)`) and, with shifts, multiplication.",
  ],
});
