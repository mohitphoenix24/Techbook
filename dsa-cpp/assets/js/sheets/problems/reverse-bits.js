SHEETS.define({
  id: "reverse-bits",
  viz: "bit",
  io: { fn: "reverseBits", params: [["n", "long"]], ret: "long", labels: { n: "n (unsigned 32-bit integer)" } },

  statement: `Reverse the bits of a given **unsigned 32-bit integer** \`n\`: the bit in position 0 (the least significant) moves to position 31, the bit in position 1 moves to position 30, and so on. Return the resulting unsigned integer.`,
  examples: [
    { input: "n = 43261596", output: "964176192", explain: "`00000010100101000001111010011100` reversed is `00111001011110000010100101000000`." },
    { input: "n = 4294967293", output: "3221225471", explain: "`11111111111111111111111111111101` reversed is `10111111111111111111111111111111`." },
  ],
  constraints: ["$0 \\le n \\le 2^{32} - 1$ (a 32-bit unsigned integer)"],
  check(input) { return input.n < 0 || input.n > 4294967295 ? "n must be between 0 and 4294967295 (an unsigned 32-bit integer)" : null; },

  intuition: {
    find: "The number whose 32-bit binary string is the **mirror image** of `n`'s 32-bit string. Leading zeros count: `1` is `000…001`, so its reverse is `100…000`.",
    beginner: "Write `n` as a 32-character string of `0`s and `1`s, reverse the string, and read it back as a number.",
    works: "Reversing the string reverses the bit order, which is exactly what is asked, and padding to 32 characters keeps the leading zeros.",
    slow: "It is not asymptotically slow (32 steps) but it is **indirect**: it allocates a string, reverses it and parses it, when the bits can be moved directly with shifts and masks.",
    repeat: "We convert to text and back, doing the same bit-by-bit work twice. The interesting part (moving each bit to its mirror position) can be done in a single loop on the number itself.",
    remember: "Build the answer one bit at a time: take the **lowest** bit of `n`, push it into the **bottom** of the result, and shift the result **left** to make room. Because the first bit taken will keep being shifted left, it ends up in the top position: exactly the mirror image.",
    observation: "Each round: `res = (res << 1) | (n & 1)` appends the lowest bit of `n` to the right end of `res` (after shifting everything already there one place left), and `n >>= 1` exposes the next bit. After 32 rounds the first bit taken has been shifted 31 times, landing at position 31.",
    leads: "Loop **exactly 32 times** (not until `n` is 0: leading zeros matter!): `res = (res << 1) | (n & 1); n >>= 1;`. Return `res`. Use unsigned types so shifts do not extend the sign.",
  },

  flow: [
    "Make a 32-character bit string, reverse it, parse it.",
    "String reversal mirrors the bits and padding keeps leading zeros.",
    "Correct and constant-size, but goes through text instead of working on the bits.",
    "Take the lowest bit of `n` and append it to the result, shifting the result left.",
    "The first bit taken is shifted 31 times: it lands on the top: a mirror.",
    "Loop **32 times** with shifts and masks: $O(1)$ time and space.",
  ],

  brute: {
    idea: "**Brute force:** build a string of 32 characters where character `i` is the bit at position `i` of `n` (lowest bit first). Read that string as a binary number with its **first** character as the most significant bit: that is the reverse.",
    why: "It works and is constant-time, but it involves converting to and from a character string, extra memory and branches. The direct approach moves the bits with a couple of shifts per step.",
    time: "O(1)", space: "O(1)",
    cpp: `class Solution {
public:
    uint32_t reverseBits(uint32_t n) {
        string s;
        for (int i = 0; i < 32; i++) s += ((n >> i) & 1) ? '1' : '0';   // lowest bit first
        uint32_t r = 0;
        for (char c : s) r = (r << 1) | (c == '1');                     // first char = top bit
        return r;
    }
};`,
    js: `function reverseBits(n) {
  let s = "";
  for (let i = 0; i < 32; i++) s += ((n >>> i) & 1) ? "1" : "0";        // lowest bit first
  let r = 0;
  for (const c of s) r = ((r << 1) | (c === "1" ? 1 : 0)) >>> 0;        // first char = top bit
  return r;
}`,
  },

  pattern: {
    name: "Bit Manipulation",
    why: "The bits of a number can be moved one at a time with a **shift-and-mask** loop: `n & 1` reads the lowest bit, `n >> 1` discards it, `res << 1` makes room, and `|` appends. Building a result by pushing bits onto its low end naturally reverses their order.",
    recognize: [
      "You must **reorder, mirror or rotate bits** of a fixed-width number.",
      "A result is **built** bit by bit, and the order of insertion defines the order of the output.",
      "Leading zeros are part of the answer: a fixed number of iterations (the word size), not `while (n)`.",
      "Unsigned types or `>>>` are needed to avoid sign extension.",
    ],
  },

  optimal: {
    idea: "Process the 32 bits of `n` from the lowest to the highest. In each round shift the result left by one (making room at the bottom) and OR in the lowest bit of `n`; then shift `n` right by one. After 32 rounds the first bit read sits at the top of the result.",
    steps: [
      "Set `res = 0`.",
      "Repeat **32 times**: `res = (res << 1) | (n & 1)` (append the lowest bit of `n`).",
      "Then `n >>= 1` (drop the bit just used).",
      "Return `res`.",
    ],
    invariant: "**After `k` rounds, the low `k` bits of `res` are the lowest `k` bits of the original `n`, in reverse order** (the first one read is the highest of them).",
    correct: "Round `k` (counting from 0) reads bit `k` of the original `n` and shifts the result left once. Afterwards that bit sits at position 0 of `res`; each of the remaining `31 − k` rounds shifts it left once more, so it finishes at position `31 − k`. So original bit `k` ends at position `31 − k`: exactly a reversal of the 32-bit word. Running exactly 32 rounds also moves leading zeros correctly (e.g. `1` becomes `2³¹`).",
  },

  cpp: `class Solution {
public:
    uint32_t reverseBits(uint32_t n) {
        uint32_t res = 0;                        //@init
        for (int i = 0; i < 32; i++) {           //@loop
            res = (res << 1) | (n & 1);          // append the lowest bit //@take
            n >>= 1;                             // expose the next bit //@shift
        }
        return res;                              //@ret
    }
};`,
  js: `function reverseBits(n) {
  let res = 0;                                   //@init
  for (let i = 0; i < 32; i++) {                 //@loop
    res = ((res << 1) | (n & 1)) >>> 0;          // append the lowest bit //@take
    n >>>= 1;                                    // expose the next bit //@shift
  }
  return res;                                    //@ret
}`,

  tests: [
    { name: "Example 1: n = 43261596", kind: "normal", input: { n: 43261596 } },
    { name: "Example 2: n = 4294967293", kind: "normal", input: { n: 4294967293 } },
    { name: "A single low bit", kind: "normal", input: { n: 1 } },
    { name: "Zero", kind: "edge", input: { n: 0 }, why: "All bits are 0, so the reverse is 0. The loop still runs 32 rounds but changes nothing visible." },
    { name: "Only the top bit set", kind: "edge", input: { n: 2147483648 }, why: "`2³¹` has just bit 31 set; reversed it becomes bit 0, i.e. `1`. As a *signed* 32-bit integer `2³¹` is negative, so signed arithmetic or `>>` (sign-extending) would give wrong results. Unsigned types are essential." },
    { name: "All 32 bits set", kind: "edge", input: { n: 4294967295 }, why: "The reverse of `111…1` is itself. In JavaScript the intermediate value `(res << 1)` becomes negative once bit 31 is set, which is why the code needs the final `>>> 0` to return an unsigned number." },
    { name: "A power of two in the middle", kind: "corner", input: { n: 2 }, why: "`2 = 10₂` is `00…010`; its reverse is `010…0`, i.e. `2³⁰`. The answer depends on the leading zeros: stopping the loop as soon as `n` is 0 would return a far smaller number." },
    { name: "A palindrome of bits", kind: "corner", input: { n: 2147483649 }, why: "`10…01₂` (bits 31 and 0 set) reads the same backwards, so the answer equals the input. A buggy solution that leaves the number unchanged would also pass this test, so it is not enough on its own." },
  ],

  trace(input, T) {
    let n = input.n >>> 0, res = 0;
    const W = 32;
    const rows = (list) => list.map(([label, value, hl, cls, note]) => ({ label, value, width: W, hl, cls, note, signed: false }));
    const orig = n;
    let whyTake = false, whyLoop = false;
    T.step("init", { vars: { n, res }, state: { rows: rows([["n", n, { 0: "cur" }], ["res", 0, {}]]), width: W, label: "the bit pipeline", note: "bit 0 of n will travel to bit 31 of res" }, phase: "32 rounds: take the lowest bit, push it into res", say: `We build \`res\` one bit at a time. Each round takes the **lowest bit of n** (pink) and pushes it into the **bottom of res**; earlier bits get pushed upwards by the left shift.`, op: "res = 0", act: "START" });
    for (let i = 0; i < 32; i++) {
      const bit = n & 1, before = res;
      res = ((res << 1) | bit) >>> 0;
      T.step("take", { vars: { i, "n & 1": bit, "res (before)": before, res }, state: { rows: rows([["n", n, { 0: "cur" }], ["res", res, { 0: "hit" }, "ok", `shifted left, then OR ${bit}`]]), width: W, label: `round ${i + 1} of 32` }, say: `Round ${i + 1}: \`res << 1\` moves everything already in \`res\` one place up, and the lowest bit of n (**${bit}**) enters at position 0. \`res = ${res}\`.`, op: `res = (${before} << 1) | ${bit} = ${res}`, act: bit ? "APPEND_1" : "APPEND_0",
        why: whyTake ? null : { title: "Why does this reverse the bits?", text: "The first bit we read keeps getting shifted left by every later round: after 32 rounds it has moved 31 places and sits at the top. The last bit read has not been shifted at all and sits at the bottom. First-in ends up highest: the order is reversed." } });
      whyTake = true;
      n = n >>> 1;
      T.step("shift", { vars: { i, n, res }, state: { rows: rows([["n", n, n ? { 0: "cur" } : {}], ["res", res, {}, "ok"]]), width: W, label: `round ${i + 1} of 32` }, say: `\`n >>= 1\` drops the bit we just used and exposes the next one. \`n = ${n}\`.${n === 0 && i < 31 ? " **n is already 0, but we must keep going**: the remaining rounds push zeros so the leading zeros of n become trailing zeros of the answer." : ""}`, op: `n = n >> 1 = ${n}`, act: "SHIFT_N",
        why: n === 0 && i < 31 && !whyLoop ? { title: "Why not stop when n becomes 0?", text: "Leading zeros are part of a 32-bit number. Each remaining round still has to shift `res` left once, otherwise the bits already placed would end up too low. For `n = 1` the answer is `2³¹`, which needs all 32 shifts." } : null });
      if (n === 0 && i < 31) whyLoop = true;
    }
    T.step("ret", { vars: { res }, state: { rows: rows([["original n", orig, {}], ["res", res, {}, "hit"]]), width: W, label: "reversed" }, say: `All 32 bits have been moved. The reverse of **${orig}** is **${res}**.`, op: `return res = ${res}`, act: "DONE" });
    T.result(res);
  },
  fuzz(rnd) { return { n: Math.floor(rnd() * 4294967296) >>> 0 }; },
  gen(n) { return { n: 123456789 }; },

  complexity: {
    time: {
      tex: "O(1)", title: "exactly 32 rounds, whatever the input", short: "O(w) for a w-bit word, a constant for 32 bits",
      derive: [
        "\\text{rounds} = w = 32 || the loop runs once per bit position, regardless of the value of n",
        "T = w \\cdot (c_{\\ll} + c_{\\&} + c_{|} + c_{\\gg}) || four constant-time operations per round",
        "!T = O(w) = O(1) \\text{ for 32-bit integers} || independent of the value; for a $w$-bit word it is $O(w)$",
      ],
      where: "Unlike *Number of 1 Bits*, the work here does **not** depend on how many bits are set: every bit position has to be moved. The measured table shows a flat line: the count of basic steps is the same for every input.",
    },
    space: {
      tex: "O(1)", title: "two words", short: "`res` and `n`",
      derive: [
        "S = |n| + |res| + |i| || the only variables",
        "!S = 3c = O(1) || no arrays or strings",
      ],
      where: "The string-based brute force used 32 extra characters (also constant, but with a bigger constant and allocation). This version uses registers only.",
    },
    limit: "$O(1)$ is optimal for fixed width. If this function is called **many times**, a *divide and conquer* version (swap the two 16-bit halves, then the 8-bit halves, …) needs only 5 steps instead of 32, and a *lookup table* of reversed bytes needs 4 table reads: the lessons' follow-ups.",
    measure: { label: "input (any value: the work is the same)", fTex: "1", f: () => 1, sizes: [1, 2, 3, 4, 5, 6], growth: "constant", constant: true, reading: "The work is the **same for every input**: always 32 rounds. A flat line means constant time." },
  },

  mistakes: [
    { title: "Stopping the loop when `n` becomes 0", what: "`while (n) { … }`", why: "It is how you would count bits, and it is faster for small numbers.", breaks: "Leading zeros are lost: `reverseBits(1)` returns `1` instead of `2147483648`, because the result is not shifted the remaining 31 times.", avoid: "Loop exactly **32** times." },
    { title: "Using a signed integer", what: "`int n` with `>>`, or `int res`.", why: "The problem gives an \"integer\", which in many languages is signed.", breaks: "Right-shifting a negative signed number copies the sign bit (arithmetic shift), and shifting a 1 into the sign bit of `res` is undefined/implementation-defined in C++.", avoid: "Use `uint32_t` in C++, and `>>> 0` / `>>>` in JavaScript to stay unsigned." },
    { title: "Shifting the result at the wrong time", what: "`res |= (n & 1); res <<= 1;` (shift after appending).", why: "The two lines look interchangeable.", breaks: "The result is shifted one time too many: every bit lands one position too high, and the last shift pushes the first bit out of the word.", avoid: "Shift **first**, then OR in the new bit: `res = (res << 1) | (n & 1)`." },
    { title: "Forgetting `>>> 0` in JavaScript", what: "Returning the raw result of bitwise operations.", why: "JS bitwise operators produce **signed** 32-bit integers.", breaks: "Whenever the top bit is set the result is negative: `reverseBits(1)` would return `-2147483648`.", avoid: "Finish with `>>> 0` to turn it into the unsigned value." },
    { title: "Reversing the decimal digits or the bytes by mistake", what: "Reversing the *digits* of `n` or swapping *bytes* only.", why: "\"Reverse\" is ambiguous at first glance.", breaks: "A different transformation entirely.", avoid: "Re-read: reverse the **32 binary bits**; trace `n = 1` → `2³¹`." },
  ],

  followUps: [
    {
      q: "The function is called **millions of times**. How would you make it faster?",
      a: "Use **divide and conquer on the word**: swap the two 16-bit halves, then swap adjacent 8-bit groups inside each half, then 4-bit, 2-bit and 1-bit groups: five steps instead of 32, all with masks and shifts. Or precompute a table of the reversed value of every byte (256 entries) and combine four lookups. Both are $O(1)$ with a much smaller constant.",
      cpp: `uint32_t reverseBitsFast(uint32_t n) {
    n = (n >> 16) | (n << 16);
    n = ((n & 0xff00ff00u) >> 8) | ((n & 0x00ff00ffu) << 8);
    n = ((n & 0xf0f0f0f0u) >> 4) | ((n & 0x0f0f0f0fu) << 4);
    n = ((n & 0xccccccccu) >> 2) | ((n & 0x33333333u) << 2);
    n = ((n & 0xaaaaaaaau) >> 1) | ((n & 0x55555555u) << 1);
    return n;
}`,
      js: `function reverseBitsFast(n) {
  n = ((n >>> 16) | (n << 16)) >>> 0;
  n = (((n & 0xff00ff00) >>> 8) | ((n & 0x00ff00ff) << 8)) >>> 0;
  n = (((n & 0xf0f0f0f0) >>> 4) | ((n & 0x0f0f0f0f) << 4)) >>> 0;
  n = (((n & 0xcccccccc) >>> 2) | ((n & 0x33333333) << 2)) >>> 0;
  n = (((n & 0xaaaaaaaa) >>> 1) | ((n & 0x55555555) << 1)) >>> 0;
  return n;
}`,
      time: "O(log w) = O(1)", space: "O(1)",
    },
    {
      q: "Reverse the bits of a **64-bit** number (or any width `w`).",
      a: "The loop is unchanged except that it runs `w` times and the types are 64-bit (`uint64_t`, or `BigInt` in JavaScript). The divide-and-conquer version needs one more swap step (32-bit halves), so $O(\\log w)$ steps.",
      time: "O(w)", space: "O(1)",
    },
    {
      q: "**Rotate** the bits left by `k` positions instead of reversing them.",
      a: "A rotation moves the top `k` bits to the bottom: `(n << k) | (n >> (32 − k))` for `0 < k < 32` with an unsigned `n` (take `k %= 32` first, and handle `k = 0` separately since a shift by 32 is undefined in C++). It is $O(1)$ and uses the same shift-and-OR building blocks.",
      time: "O(1)", space: "O(1)",
    },
    {
      q: "What does *Gray code* have to do with bits? (a related classic)",
      a: "The Gray code of `n` is `n ^ (n >> 1)`: successive numbers differ in exactly one bit. Converting back needs a prefix XOR of the bits from the top. Like reversal, it is a one-line bit identity once you see the structure. It shows that a lot of bit problems reduce to *one clever expression* or *one 32-step loop*.",
      time: "O(1)", space: "O(1)",
    },
  ],

  related: [
    { id: "number-of-1-bits", why: "Reads the bits of a 32-bit number, but only visits the `1`s with `n & (n − 1)`." },
    { id: "counting-bits", why: "Builds a bit-property table from smaller entries with shifts and masks." },
    { id: "sum-of-two-integers", why: "Pure bit-operation arithmetic with a carry loop that stops after at most 32 rounds." },
    { id: "missing-number", why: "XOR as a pair canceller: another clever bit identity." },
  ],
  patternNote: "**The Bit Manipulation pattern** views a number as a fixed row of bits and moves them with shifts and masks. When the output order differs from the input order, build the result by pushing bits onto one end: *first in ends up farthest*. Always decide the loop count from the **word width**, not from the value, when leading zeros matter.",
  takeaways: [
    "`res = (res << 1) | (n & 1); n >>= 1;` repeated **32 times** reverses the bits.",
    "Run exactly 32 rounds: leading zeros are part of the number (so `1` becomes `2³¹`).",
    "Use unsigned types (`uint32_t`, or `>>> 0` in JS) to avoid sign extension and negative results.",
    "Time $O(1)$ (32 rounds), space $O(1)$; the divide-and-conquer mask version needs only 5 steps.",
    "Shift the result **before** OR-ing the new bit.",
  ],
});
