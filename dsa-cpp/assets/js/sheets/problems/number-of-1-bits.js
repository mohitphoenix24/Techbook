SHEETS.define({
  id: "number-of-1-bits",
  viz: "bit",
  io: { fn: "hammingWeight", params: [["n", "long"]], ret: "int", labels: { n: "n (unsigned 32-bit integer)" } },

  statement: `Write a function that takes an **unsigned 32-bit integer** \`n\` and returns the number of bits that are \`1\` in its binary representation (this count is also called the *Hamming weight* or *popcount*).`,
  examples: [
    { input: "n = 11", output: "3", explain: "`11` is `1011` in binary: three `1` bits." },
    { input: "n = 128", output: "1", explain: "`128` is `10000000`: a single `1` bit." },
    { input: "n = 4294967293", output: "31", explain: "`11111111111111111111111111111101`: 31 ones, one zero." },
  ],
  constraints: ["$0 \\le n \\le 2^{32} - 1$ (the input is an unsigned 32-bit integer)"],
  check(input) { return input.n < 0 || input.n > 4294967295 ? "n must be between 0 and 4294967295 (an unsigned 32-bit integer)" : null; },

  intuition: {
    find: "How many of the 32 bit positions of `n` contain a `1`.",
    beginner: "Look at each of the 32 bit positions in turn: extract the bit with `(n >> i) & 1` and add it to a counter.",
    works: "It inspects every position, so every `1` is counted exactly once.",
    slow: "It always takes 32 steps, even for `n = 1` where 31 of them find a `0`. For most numbers the loop does a lot of pointless work on zero bits. (It is fine for correctness, just not elegant.)",
    repeat: "We look at positions that hold `0`, which cannot change the answer, only to skip over them. For a number like `2³¹` we make 31 useless checks before finding the one `1`.",
    remember: "We want a step that jumps **straight to the next 1 bit**: something that removes exactly one set bit per step, so the number of steps equals the number of `1`s.",
    observation: "`n − 1` flips the **lowest set bit** to `0` and turns all the zeros below it into `1`s. So `n & (n − 1)` is `n` with its lowest set bit **cleared** and everything else unchanged. Each application removes exactly one `1`.",
    leads: "Count how many times you can do `n = n & (n − 1)` before `n` becomes `0`. That number is the popcount. This is **Brian Kernighan's algorithm**: it runs in a number of steps equal to the number of set bits (at most 32).",
  },

  flow: [
    "Check all 32 bit positions and count the ones.",
    "Every position is inspected, so every `1` is counted.",
    "Always 32 steps, mostly wasted on zeros.",
    "`n − 1` flips the lowest set bit and the zeros under it.",
    "So `n & (n − 1)` clears the lowest set bit and nothing else.",
    "Repeat until `n == 0`: one step per `1` bit, at most 32.",
  ],

  brute: {
    idea: "**Brute force:** loop `i` from `0` to `31`; for each position add `(n >> i) & 1` to a counter.",
    why: "It does 32 iterations whatever the input, including numbers with very few set bits. It is correct and $O(1)$, but the work is proportional to the **word size**, not to the **number of 1s** like the smarter loop.",
    time: "O(1)", space: "O(1)",
    cpp: `class Solution {
public:
    int hammingWeight(uint32_t n) {
        int count = 0;
        for (int i = 0; i < 32; i++) count += (n >> i) & 1;
        return count;
    }
};`,
    js: `function hammingWeight(n) {
  let count = 0;
  for (let i = 0; i < 32; i++) count += (n >>> i) & 1;
  return count;
}`,
  },

  pattern: {
    name: "Bit Manipulation",
    why: "Many bit problems become simple once you know a few identities. Here, `n & (n − 1)` removes the lowest set bit, so a loop that applies it counts the set bits in exactly that many iterations. The pattern is *choose an operation that changes exactly one bit of interest per step*.",
    recognize: [
      "You must **count, test or clear set bits** of a number.",
      "The statement mentions *popcount*, *Hamming weight*, *power of two*, *single bit set*.",
      "A loop over all 32/64 positions feels wasteful when few bits are set.",
      "A trick such as `n & (n − 1)` (clear lowest set bit) or `n & −n` (isolate it) fits.",
    ],
  },

  optimal: {
    idea: "While `n` is not zero, replace `n` by `n & (n − 1)` and add one to the count. Subtracting 1 turns the lowest `1` into `0` and the zeros below it into ones; the AND with the original wipes all of those changed bits out, so exactly the lowest `1` disappears.",
    steps: [
      "Set `count = 0`.",
      "While `n != 0`: do `n = n & (n − 1)` (clear the lowest set bit).",
      "Add 1 to `count` for each such clearing.",
      "Return `count`.",
    ],
    invariant: "**`count` plus the number of set bits left in `n` always equals the original number of set bits.** Each round moves exactly one bit from \"left in `n`\" to \"counted\".",
    correct: "Write `n = X 1 0…0` where the lowest set bit is followed by `k ≥ 0` zeros and `X` is whatever lies above. Then `n − 1 = X 0 1…1`: the lowest 1 became 0 and the `k` zeros became ones, while `X` is untouched. So `n & (n − 1) = X 0 0…0`: `X` is unchanged and everything from the lowest set bit downward is zero. Hence exactly one set bit is removed per round, and after as many rounds as there are set bits, `n` is 0.",
  },

  cpp: `class Solution {
public:
    int hammingWeight(uint32_t n) {
        int count = 0;                       //@init
        while (n != 0) {                     //@loop
            n = n & (n - 1);                 // clear the lowest set bit //@clear
            count++;                         //@count
        }
        return count;                        //@ret
    }
};`,
  js: `function hammingWeight(n) {
  let count = 0;                             //@init
  while (n !== 0) {                          //@loop
    n = (n & (n - 1)) >>> 0;                 // clear the lowest set bit //@clear
    count++;                                 //@count
  }
  return count;                              //@ret
}`,

  tests: [
    { name: "Example 1: n = 11", kind: "normal", input: { n: 11 } },
    { name: "Example 2: n = 128", kind: "normal", input: { n: 128 } },
    { name: "Example 3: n = 4294967293", kind: "normal", input: { n: 4294967293 } },
    { name: "Zero", kind: "edge", input: { n: 0 }, why: "No bits are set, so the loop never runs and the answer is `0`. A solution that checks `n > 0` instead of `n != 0` also works here, but one that starts by computing `n & (n − 1)` first would underflow (`0 − 1`)." },
    { name: "A power of two", kind: "edge", input: { n: 1024 }, why: "Exactly one bit is set: `n & (n − 1)` clears it in one step and the answer is `1`. This is also the classic *power-of-two test*: `n > 0 && (n & (n − 1)) == 0`." },
    { name: "All 32 bits set", kind: "edge", input: { n: 4294967295 }, why: "The largest value, `2³² − 1`. The loop runs 32 times: the worst case. In C++ the parameter must be `uint32_t`; with a signed `int` this value is `−1`, and a loop like `while (n)` with `n >>= 1` would never end." },
    { name: "Only the top bit (the sign bit)", kind: "corner", input: { n: 2147483648 }, why: "`2³¹` has just the highest bit set. As a signed 32-bit integer it would be **negative** (`−2147483648`). The loop must treat it as unsigned, so it counts 1, not a negative number of bits." },
    { name: "Alternating bits", kind: "corner", input: { n: 2863311530 }, why: "`101010…10₂`: 16 set bits spread over the whole word. The loop runs 16 times, once per `1`, not 32 times: the saving over the brute force." },
    { name: "A single 1 in the lowest position", kind: "corner", input: { n: 1 }, why: "`n − 1 = 0`, so `n & (n − 1) = 0` after one step. It is the smallest non-zero input." },
  ],

  trace(input, T) {
    let n = input.n >>> 0, count = 0;
    const W = n < 256 ? 8 : n < 65536 ? 16 : 32;
    const lowest = (v) => { for (let i = 0; i < 32; i++) if ((v >>> i) & 1) return i; return -1; };
    const rows = (list) => list.map(([label, value, hl, cls, note]) => ({ label, value, width: W, hl, cls, note, signed: false }));
    let whyK = false;
    const total = (() => { let c = 0, v = n; while (v) { v &= v - 1; c++; } return c; })();
    T.step("init", { vars: { n, count }, state: { rows: rows([["n", n, { [lowest(n)]: "cur" }, "", W === 32 ? undefined : undefined]]), label: `n = ${n}`, note: `${total} bit${total === 1 ? " is" : "s are"} set: the loop below will run exactly ${total} time${total === 1 ? "" : "s"}` }, phase: "Clear one 1 bit per step", say: `We want to count the 1 bits of **${n}**. Instead of testing all 32 positions we will remove the lowest 1 bit each round and count the rounds.`, op: "count = 0", act: "START" });
    while (n !== 0) {
      const lo = lowest(n), m = (n - 1) >>> 0, r = (n & m) >>> 0;
      T.step("loop", { vars: { n, count }, state: { rows: rows([["n", n, { [lo]: "cur" }]]), label: `n = ${n}`, note: "n is not 0, so there is still a 1 bit to remove" }, say: `\`n = ${n}\` is not 0, so at least one bit is still set. Its **lowest** set bit is bit ${lo} (pink).`, op: `n != 0  →  true`, act: "CONTINUE" });
      const hlM = {}; for (let i = 0; i <= lo; i++) hlM[i] = "cmp";
      T.step("clear", { vars: { n, "n − 1": m, "n & (n−1)": r }, state: { rows: rows([["n", n, { [lo]: "cur" }], ["n − 1", m, hlM, "", `bits 0..${lo} flipped`], ["n & (n−1)", r, { [lo]: "ok" }, "ok", "the lowest 1 is gone"]]), label: "Kernighan's trick" }, say: `Subtracting 1 flips bit ${lo} (the lowest 1) to 0 and turns the ${lo} zero${lo === 1 ? "" : "s"} below it into ones (amber). The AND with the original keeps only what **both** share: bits above ${lo} unchanged, bit ${lo} and below all zero. **n becomes ${r}.**`, op: `n = ${n} & ${m} = ${r}`, act: "CLEAR_LOWEST",
        why: whyK ? null : { title: "Why does n & (n − 1) clear exactly one bit?", text: "`n − 1` borrows from the lowest 1: that bit becomes 0 and all the zeros below it become 1. Above the borrowed bit nothing changes. ANDing with `n` keeps the unchanged upper part and cancels the flipped lower part, so only the lowest 1 vanishes." } });
      whyK = true;
      n = r; count++;
      T.step("count", { vars: { n, count }, state: { rows: rows([["n", n, n ? { [lowest(n)]: "cur" } : {}]]), label: `n = ${n}`, note: `${count} bit${count === 1 ? "" : "s"} removed so far` }, say: `One bit removed: \`count = ${count}\`. ${n === 0 ? "`n` is now 0, so no bits remain." : `\`n = ${n}\` still has ${total - count} set bit${total - count === 1 ? "" : "s"}.`}`, op: `count = ${count}`, act: "COUNT" });
    }
    T.step("ret", { vars: { count }, state: { rows: rows([["n", 0, {}]]), label: "done", note: `count = ${count}` }, say: `\`n\` is 0: every set bit was removed once. The number of 1 bits is **${count}**.`, op: `return count = ${count}`, act: "DONE" });
    T.result(count);
  },
  fuzz(rnd) { return { n: Math.floor(rnd() * 4294967296) >>> 0 }; },
  gen(n) { return { n: Math.pow(2, n) - 1 }; },

  complexity: {
    time: {
      tex: "O(k)", title: "one iteration per set bit, at most 32", short: "k = number of 1 bits, so O(1) for 32-bit numbers",
      derive: [
        "\\text{each round removes exactly one set bit} || `n & (n−1)` clears the lowest 1",
        "\\text{rounds} = k = \\text{popcount}(n) \\le w = 32 || the loop stops when no bit is left",
        "T = k \\cdot (c_{\\&} + c_{-} + c_{+}) || three operations per round",
        "!T = O(k) \\le O(w) = O(1) \\text{ for a 32-bit word} || a constant, but proportional to the number of 1s",
      ],
      where: "The simple loop always takes 32 steps. Kernighan's loop takes exactly as many steps as there are `1`s: for `n = 2³¹` that is 1 round instead of 32, for `n = 0` it is 0 rounds. The table below measures rounds against the number of set bits.",
    },
    space: {
      tex: "O(1)", title: "two integers", short: "`n` and `count`",
      derive: [
        "S = |n| + |\\text{count}| || the only variables",
        "!S = 2c = O(1) || no arrays",
      ],
      where: "Everything is in registers; the input is modified in place (it is passed by value).",
    },
    limit: "You must at least look at the number once, but for fixed-width integers popcount is $O(1)$ anyway. Modern CPUs have a single `POPCNT` instruction (`__builtin_popcount` in GCC); a lookup table of 256 entries or the *SWAR* trick give constant-time versions without loops.",
    measure: { label: "n = number of 1 bits in the input", fTex: "n", f: (n) => n, sizes: [4, 8, 12, 16, 20, 24, 28, 32], growth: "linear in the number of set bits" },
  },

  mistakes: [
    { title: "Using a signed `int` and shifting right", what: "`int count = 0; while (n) { count += n & 1; n >>= 1; }` with `int n`.", why: "It is the textbook loop and it works for non-negative values.", breaks: "For a number with the top bit set, a signed `int` is **negative**, and `>>` on a negative signed value is an *arithmetic* shift that keeps filling with 1s: the loop **never terminates**.", avoid: "Use an unsigned type (`uint32_t`) in C++, or `>>>` in JavaScript." },
    { title: "Looping `while (n > 0)`", what: "A positive-only condition.", why: "Unsigned values are non-negative, so it seems harmless.", breaks: "In languages where `n` ends up as a signed value (JS bitwise ops return signed 32-bit integers), values ≥ 2³¹ look negative and the loop never runs.", avoid: "Test `n != 0`, and convert with `>>> 0` after bitwise operations in JavaScript." },
    { title: "Confusing `n & (n − 1)` with `n & −n`", what: "Using `n & -n` to clear the lowest bit.", why: "Both involve the lowest set bit.", breaks: "`n & −n` **isolates** the lowest set bit (keeps only it); `n & (n − 1)` **clears** it.", avoid: "Memorise: `& (n − 1)` removes, `& −n` extracts." },
    { title: "Forgetting `count++` inside the loop", what: "Clearing bits without counting.", why: "Focusing on the clever line.", breaks: "The function always returns 0.", avoid: "One clearing = one counted bit." },
    { title: "Counting 0 bits (or using the wrong width)", what: "Returning the number of zero bits, or `32 − count`.", why: "Misreading the question.", breaks: "The answer is the number of **1** bits.", avoid: "Re-read the statement; test with `n = 1` (answer 1, not 31)." },
  ],

  followUps: [
    {
      q: "Check whether `n` is a **power of two** using the same trick.",
      a: "A power of two has exactly one set bit, so clearing it leaves 0: `n > 0 && (n & (n − 1)) == 0`. The `n > 0` guard excludes 0, which has no set bit. It is $O(1)$ without any loop.",
      cpp: `bool isPowerOfTwo(long long n) {
    return n > 0 && (n & (n - 1)) == 0;
}`,
      js: `function isPowerOfTwo(n) {
  return n > 0 && (n & (n - 1)) === 0;
}`,
      time: "O(1)", space: "O(1)",
    },
    {
      q: "How many bits do you have to **flip** to turn the integer `a` into `b` (Hamming distance)?",
      a: "XOR marks the positions where the two numbers differ: `a ^ b` has a `1` exactly there. The answer is the **popcount of `a ^ b`**, so reuse this function: `hammingWeight(a ^ b)`.",
      time: "O(k)", space: "O(1)",
    },
    {
      q: "Use a **lookup table** or the built-in instruction instead. Why would you?",
      a: "Precompute the popcount of every byte (256 entries) and add the four table entries of the four bytes of `n`: 4 lookups, no loop, constant time. In C++ `__builtin_popcount(n)` / `std::popcount(n)` (C++20) compiles to the CPU's `POPCNT` instruction. Knowing the loop is for interviews; using the built-in is right in production.",
      time: "O(1)", space: "O(256)",
    },
    {
      q: "Count the number of set bits for **every number** from 0 to `n`.",
      a: "Do not call popcount `n` times. Use the relation `bits[i] = bits[i >> 1] + (i & 1)`: the answer for `i` is the answer for `i` shifted right by one (computed earlier) plus its last bit. That is the next lesson, *Counting Bits*: $O(n)$ total.",
      time: "O(n)", space: "O(n)",
    },
  ],

  related: [
    { id: "counting-bits", why: "The popcount of *every* number up to `n`, built from smaller answers with `bits[i] = bits[i >> 1] + (i & 1)`." },
    { id: "reverse-bits", why: "Another loop over the bits of a 32-bit unsigned number using shifts and masks." },
    { id: "missing-number", why: "XOR cancels equal values, another way bit operations replace extra memory." },
    { id: "sum-of-two-integers", why: "Pure bit-operation arithmetic: XOR for the sum and AND-shift for the carry." },
  ],
  patternNote: "**The Bit Manipulation pattern** relies on a small toolbox: `n & (n − 1)` clears the lowest set bit, `n & −n` isolates it, `x ^ x = 0` cancels pairs, `1 << i` builds a mask, and shifts move bits. When a loop over all word positions feels wasteful, look for an operation that touches **only the bits that matter**.",
  takeaways: [
    "`n & (n − 1)` **clears the lowest set bit**; counting how often you can do it counts the 1s.",
    "The loop runs **once per set bit**, at most 32 times: $O(k)$, i.e. $O(1)$ for fixed-width numbers.",
    "Use unsigned types (`uint32_t`, or `>>> 0` in JS) and test `n != 0`; signed right shifts can loop forever.",
    "Same trick: power-of-two test (`n & (n − 1) == 0`), Hamming distance (`popcount(a ^ b)`).",
    "In production, use `std::popcount` / `__builtin_popcount`.",
  ],
});
