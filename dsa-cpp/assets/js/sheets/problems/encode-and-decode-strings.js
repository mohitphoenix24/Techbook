SHEETS.define({
  id: "encode-and-decode-strings",
  viz: "array",
  premium: true,
  io: {
    fn: "Codec", params: [["strs", "str[]"]], ret: "str[]", labels: { strs: "strs (the list of strings to send)" },
    design: {
      cpp: `
int main() {
    vector<string> strs = Cv<vector<string>>::get(readJ());
    Codec codec;
    string wire = codec.encode(strs);                 // what would travel over the network
    vector<string> back = codec.decode(wire);         // what the receiver reconstructs
    string o; pj(Cv<vector<string>>::put(back), o); cout << o << "\\n";
}
`,
      js: (a) => `(function () {
const __a = ${a};
const codec = new Codec();
const wire = codec.encode(__a[0]);
return JSON.stringify(codec.decode(wire));
})()`,
    },
  },
  legend: [["cmp", "the length (digits)"], ["key", "the # separator"], ["cur", "characters of the current string"], ["ok", "already handled"]],

  statement: `Design an algorithm to **encode a list of strings to a single string**. The encoded string is then sent over the network and **decoded back** to the original list of strings.

Implement the two methods \`encode\` (list of strings → one string) and \`decode\` (one string → list of strings) so that \`decode(encode(strs))\` equals \`strs\` **for every possible list**: strings may be empty, may contain digits, and may contain any symbol you might want to use as a separator.

The lab runs both methods one after the other (like a sender and a receiver) and checks that the list you get back is exactly the list you sent.`,
  examples: [
    { input: `strs = ["lint", "code", "love", "you"]`, output: `["lint", "code", "love", "you"]`, explain: "One possible wire format is `4#lint4#code4#love3#you`; decoding it returns the same four words." },
    { input: `strs = ["we", "say", ":", "yes"]`, output: `["we", "say", ":", "yes"]`, explain: "A word such as `:` must not confuse a separator-based format." },
  ],
  constraints: ["$0 \\le$ `strs.length` $\\le 200$", "$0 \\le$ `strs[i].length` $\\le 200$", "`strs[i]` contains any of the 256 ASCII characters", "The decoder gets **only** the encoded string (no other data) and must not use global state"],
  check(input) {
    const a = input.strs;
    if (a.length > 4) return "for the animation use at most 4 strings";
    if (a.some((w) => w.length > 12) || a.reduce((n, w) => n + w.length, 0) > 20) return "for the animation use strings of at most 12 characters, and at most 20 characters in total";
    if (a.some((w) => /[^\x20-\x7e]/.test(w))) return "use printable ASCII characters only";
    return null;
  },

  intuition: {
    find: "A way to glue many strings into one so that the **receiver can always split them again exactly**, whatever the strings contain: empty strings, digits, spaces and punctuation included.",
    beginner: "Join the strings with a separator, say a comma: `[\"a\", \"b\"]` becomes `\"a,b\"`. To decode, split on commas.",
    works: "For plain words without commas the pieces come back exactly, and it is just a `join` and a `split`.",
    slow: "It is also **wrong** as soon as a string contains the separator: `[\"a,b\", \"c\"]` becomes `\"a,b,c\"` and decodes to three strings. And `[]` and `[\"\"]` both become `\"\"`. Choosing a \"rare\" separator only hides the problem. (A corrected version that **escapes** the separator inside the strings is possible, but it must inspect and rewrite every character.)",
    repeat: "Nothing is repeated in time, but every approach based on a *separator* has to decide what happens when the separator appears inside the data. That decision is where the bugs live.",
    remember: "Instead of marking where a string **ends**, say **how long it is** before it starts. A reader that knows the length can simply take that many characters, and nothing inside the string can ever be mistaken for structure.",
    observation: "Write each string as `length`, then `#`, then the string itself: `[\"lint\", \"code\"]` becomes `4#lint4#code`. The `#` only ends the *number*; the string's own `#` characters are never looked at, because the decoder jumps straight over `length` characters. The number cannot contain a `#`, so the first `#` after a position always ends the length.",
    leads: "Encode: append `len + \"#\" + s` for each string. Decode: from position `i`, find the next `#` at `j`, read `len = s[i..j)`, take `len` characters after `j`, and continue at `j + 1 + len`.",
  },

  flow: [
    "Join the strings with a separator and split on it.",
    "It works when the strings never contain the separator.",
    "It breaks on `\"a,b\"` and cannot tell `[]` from `[\"\"]`.",
    "Say how long each string is, not where it ends.",
    "Write `length#string` for each one; decode by reading the length and jumping over that many characters.",
    "One pass each way: $O(N)$ time for $N$ total characters, nothing inside a string can confuse the decoder.",
  ],

  brute: {
    idea: "**Naive approach with escaping:** end every string with a marker `/:` and write every `/` inside a string as `//` so a marker can never appear by accident. The decoder reads characters one by one: `//` is a literal slash, `/:` ends a string.",
    why: "This version is correct (the tests pass), but it has to look at and rewrite **every character** while encoding, the message grows with every slash, and the decoder must examine every character to find the end of each string. It is easy to get the escape rules subtly wrong. The length-prefix version never inspects the content of a string.",
    time: "O(N)", space: "O(N)",
    cpp: `class Codec {
public:
    string encode(vector<string>& strs) {
        string out;
        for (const string& s : strs) {
            for (char c : s) { if (c == '/') out += "//"; else out += c; }
            out += "/:";
        }
        return out;
    }
    vector<string> decode(string s) {
        vector<string> res;
        string cur;
        for (size_t i = 0; i < s.size(); i++) {
            if (s[i] == '/' && s[i + 1] == '/') { cur += '/'; i++; }
            else if (s[i] == '/' && s[i + 1] == ':') { res.push_back(cur); cur.clear(); i++; }
            else cur += s[i];
        }
        return res;
    }
};`,
    js: `class Codec {
  encode(strs) {
    let out = "";
    for (const s of strs) out += s.split("/").join("//") + "/:";
    return out;
  }
  decode(s) {
    const res = [];
    let cur = "";
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "/" && s[i + 1] === "/") { cur += "/"; i++; }
      else if (s[i] === "/" && s[i + 1] === ":") { res.push(cur); cur = ""; i++; }
      else cur += s[i];
    }
    return res;
  }
}`,
  },

  pattern: {
    name: "Design (length-prefixed serialisation)",
    why: "Whenever data is turned into a flat stream and back, ambiguity is the enemy. A **length prefix** (also used by network protocols and file formats) makes the format self-describing: the reader always knows how many characters belong to the next item, so the item's content can be anything.",
    recognize: [
      "You must **serialise** a collection (strings, trees, graphs) into one string and rebuild it.",
      "The items may contain *any* character, so a delimiter cannot be trusted.",
      "The decoder gets only the encoded string, with no side information.",
      "Edge cases like empty items, an empty list and delimiter characters inside the data decide whether the design is correct.",
    ],
  },

  optimal: {
    idea: "Encode every string as its length in decimal, then a `#`, then the string itself, and concatenate: `[\"ab\", \"\", \"c#\"]` becomes `2#ab0#2#c#`. To decode, keep a position `i`. Find the next `#` at `j`: the text between `i` and `j` is the length `len`. The next string is the `len` characters after `j`, and the following chunk starts at `j + 1 + len`.",
    steps: [
      "**Encode:** start with an empty string `out`.",
      "For each string `s`: append `s.size()`, then `\"#\"`, then `s` itself.",
      "Return `out`.",
      "**Decode:** set `i = 0`. While `i` is inside the encoded string: find the first `#` at or after `i`, at index `j`.",
      "Read the length `len` from `s[i..j)`.",
      "Take the `len` characters after `j` as the next string; set `i = j + 1 + len`.",
      "Return the list of strings.",
    ],
    invariant: "**At the start of each decode step, `i` is the start of a chunk `len#content`: everything before `i` has already been decoded into the output list, and `i` is exactly the position where the encoder started writing the next string.**",
    correct: "The encoded text is the concatenation of chunks `len(s_t) # s_t`. Suppose the decoder is at the start of chunk $t$. The characters from `i` up to the first `#` are digits only (the decimal length cannot contain `#`), so the first `#` found at or after `i` is exactly the one the encoder wrote after the length: `j` is correct, and `len = |s_t|`. The next `len` characters are `s_t` (whatever they contain, even `#` or digits, because they are not examined), and the chunk ends at `j + len`, so the next chunk starts at `j + 1 + len`, which preserves the invariant. The empty list encodes to the empty string (the loop does not run) and `[\"\"]` encodes to `0#`, so they are distinguished. By induction the decoder returns $s_1, \\dots, s_k$ in order.",
  },

  cpp: `class Codec {
public:
    string encode(vector<string>& strs) {
        string out;                             //@encInit
        for (const string& s : strs) {          //@encLoop
            out += to_string(s.size()) + "#" + s;   // length, #, then the string //@encAppend
        }
        return out;                             //@encRet
    }
    vector<string> decode(string s) {
        vector<string> res;                     //@decInit
        int i = 0;
        while (i < (int)s.size()) {             //@decLoop
            int j = s.find('#', i);             // the # that ends the length //@decFind
            int len = stoi(s.substr(i, j - i)); // read the length //@decLen
            res.push_back(s.substr(j + 1, len));   // take exactly len characters //@decTake
            i = j + 1 + len;                    // jump to the next chunk //@decJump
        }
        return res;                             //@decRet
    }
};`,
  js: `class Codec {
  encode(strs) {
    let out = "";                        //@encInit
    for (const s of strs) {              //@encLoop
      out += s.length + "#" + s;         // length, #, then the string //@encAppend
    }
    return out;                          //@encRet
  }
  decode(s) {
    const res = [];                      //@decInit
    let i = 0;
    while (i < s.length) {               //@decLoop
      const j = s.indexOf("#", i);       // the # that ends the length //@decFind
      const len = parseInt(s.slice(i, j), 10);   // read the length //@decLen
      res.push(s.slice(j + 1, j + 1 + len));     // take exactly len characters //@decTake
      i = j + 1 + len;                   // jump to the next chunk //@decJump
    }
    return res;                          //@decRet
  }
}`,

  tests: [
    { name: "Example 1: lint, code, love, you", kind: "normal", input: { strs: ["lint", "code", "love", "you"] } },
    { name: "Example 2: we, say, :, yes", kind: "normal", input: { strs: ["we", "say", ":", "yes"] } },
    { name: "Two words", kind: "normal", input: { strs: ["hello", "world"] } },
    { name: "An empty list", kind: "edge", input: { strs: [] }, why: "`encode([])` is the empty string and `decode(\"\")` returns `[]`: the loop never runs. The next test shows why this is different from a list holding one empty string." },
    { name: "One empty string", kind: "edge", input: { strs: [""] }, why: "The empty string is written as `0#`, so the encoded text is not empty and `decode` returns a list with one empty string. A format that just joined the strings would map both `[]` and `[\"\"]` to `\"\"`." },
    { name: "Strings that contain the # separator", kind: "edge", input: { strs: ["a#b", "#", "##"] }, why: "The decoder never looks inside a string: after reading the length it jumps over exactly that many characters. The `#` characters in the data cannot be mistaken for separators, because only the first `#` after the start of a chunk ends the length." },
    { name: "Strings that look like encodings", kind: "edge", input: { strs: ["3#abc", "12", "0#"] }, why: "`3#abc` encodes as `5#3#abc`: the decoder reads length 5, then takes `3#abc` as plain data. Data that *looks* like a length and a separator cannot confuse it." },
    { name: "Repeated strings", kind: "edge", input: { strs: ["a", "a"] }, why: "Identical strings are not merged: each gets its own chunk `1#a`, so the decoder returns both copies in order." },
    { name: "A length with two digits", kind: "corner", input: { strs: ["abcdefghijkl"] }, why: "The length 12 has two digits. The decoder reads **everything up to the `#`**, not just one digit; code that reads a single digit would take 1 character and fall out of step." },
    { name: "An empty string among others", kind: "corner", input: { strs: ["a", "", "b"] }, why: "The empty string is the chunk `0#` and takes zero characters: `1#a0#1#b`. Decoding finds length 0 and appends an empty string, then continues at the next chunk." },
    { name: "Spaces and punctuation", kind: "corner", input: { strs: ["hello world", "x, y!"] }, why: "Spaces, commas and exclamation marks are ordinary data: the format never splits on them, so they survive intact (a space- or comma-separated format would not)." },
  ],

  trace(input, T) {
    const strs = input.strs, k = strs.length;
    let enc = "";
    const segs = [];      // { digits:[a,b], hash:i, body:[a,b] }
    const decoded = [];
    let whyLen = false, whyHash = false, whyJump = false, whyEmpty = false;
    const q = (w) => (w === "" ? "“”" : `“${w}”`);
    const pill = (w, i) => `#${i} ${q(w)}`;
    const chars = () => (enc.length ? enc.split("").map((c) => (c === " " ? "␣" : c)) : ["∅"]);
    const S = (o = {}) => () => {
      const hl = {};
      if (!enc.length) hl[0] = "empty";
      segs.forEach((g, idx) => {
        const last = o.cur === idx;
        for (let a = g.digits[0]; a <= g.digits[1]; a++) hl[a] = "cmp";
        hl[g.hash] = "key";
        for (let a = g.body[0]; a <= g.body[1]; a++) hl[a] = last ? "cur" : "ok";
      });
      if (o.mark) for (const [a, b, cls] of o.mark) for (let x = a; x <= b; x++) hl[x] = cls;
      return { arr: chars(), hl, ptr: o.ptr || {}, cw: enc.length > 24 ? 28 : 34, ch: 38, size: 13, label: o.label || "the encoded string (what travels over the network)",
        pills: { label: o.pillLabel, items: o.pills || [] }, note: o.note };
    };
    const vars = (o) => Object.assign({ "encoded length": enc.length }, o || {});
    T.step("encInit", { vars: vars(), state: S({ pillLabel: "strings to encode", pills: strs.map(pill) }), phase: "Encode: length, #, then the string", say: k ? `We have ${k} string${k === 1 ? "" : "s"} to send. \`out\` starts empty; each string will be written as **its length, a \`#\`, and the string itself**.` : "The list is empty, so there is nothing to write: `out` stays empty.", op: 'out = ""', act: "START_ENCODE" });
    for (let t = 0; t < k; t++) {
      const w = strs[t];
      T.step("encLoop", { vars: vars({ string: q(w) }), state: S({ pillLabel: "strings to encode", pills: strs.map(pill), cur: t - 1, note: `next string: ${q(w)}` }), say: `Next string: **${q(w)}**, ${w.length} character${w.length === 1 ? "" : "s"} long.`, op: `s = strs[${t}] = ${q(w)}`, act: "NEXT_STRING" });
      const start = enc.length, ds = String(w.length);
      enc += ds + "#" + w;
      segs.push({ digits: [start, start + ds.length - 1], hash: start + ds.length, body: [start + ds.length + 1, start + ds.length + w.length] });
      T.step("encAppend", { w: w.length + ds.length + 1, vars: vars({ chunk: ds + "#" + w }), state: S({ pillLabel: "strings to encode", pills: strs.map(pill), cur: t, note: `appended “${ds}#${w}”` }), say: `Append the length **${ds}**, then **#**, then the string itself: the chunk \`${ds}#${w}\` is added. The \`#\` only marks the end of the *number*; the string may contain any characters, even \`#\`.`, op: `out += "${ds}" + "#" + ${q(w)}`, act: "APPEND_CHUNK",
        why: !whyLen ? { title: "Why write the length first?", text: "A reader that knows the length can take exactly that many characters. It never has to guess where the string ends, so nothing inside the string (commas, hashes, digits, even a copy of this very format) can confuse it." } : w === "" && !whyEmpty ? { title: "What about an empty string?", text: "It is written as `0#`: length 0, no characters. That keeps `[\"\"]` different from `[]` (whose encoding is the empty string)." } : null });
      whyLen = true; if (w === "") whyEmpty = true;
    }
    T.step("encRet", { vars: vars(), state: S({ pillLabel: "strings to encode", pills: strs.map(pill), note: enc ? `sent: “${enc}”` : "sent: the empty string" }), say: `The encoded string is **“${enc}”** (${enc.length} character${enc.length === 1 ? "" : "s"}). This is all the receiver gets.`, op: `return out`, act: "SEND" });
    // ---------------------------------------------------------------- decode
    T.phase("Decode: read the length, take that many characters");
    T.step("decInit", { vars: vars(), state: S({ label: "the encoded string (received)", pillLabel: "decoded strings so far", pills: [] , ptr: enc.length ? { i: 0 } : {} }), say: "The receiver has only the encoded string. It keeps a position `i`, which always points at the start of a chunk, and an empty result list.", op: "res = [ ],  i = 0", act: "START_DECODE" });
    let i = 0;
    const consumed = () => (i > 0 ? [[0, i - 1, "ok"]] : []);
    while (true) {
      const go = i < enc.length;
      T.step("decLoop", { vars: vars({ i }), state: S({ label: "the encoded string (received)", pillLabel: "decoded strings so far", pills: decoded.map((w, x) => pill(w, x)), mark: consumed(), ptr: go ? { i } : {} }), say: go ? `\`i\` = ${i} is inside the string, so another chunk starts here.` : `\`i\` = ${i} has reached the end of the encoded string (${enc.length} characters): no chunk is left.`, op: `i < ${enc.length}  →  ${go}`, act: go ? "NEXT_CHUNK" : "END_REACHED" });
      if (!go) break;
      const j = enc.indexOf("#", i), len = parseInt(enc.slice(i, j), 10);
      T.step("decFind", { w: j - i + 1, vars: vars({ i, j }), state: S({ label: "the encoded string (received)", pillLabel: "decoded strings so far", pills: decoded.map((w, x) => pill(w, x)), mark: [...consumed(), [i, j - 1, "cmp"], [j, j, "key"]], ptr: { i, j } }), say: `Search for the first \`#\` at or after \`i\`: it is at index **${j}**. Everything between \`i\` and \`${j}\` can only be digits.`, op: `j = s.find('#', ${i})  →  ${j}`, act: "FIND_HASH",
        why: !whyHash ? { title: "Why is the first # the right one?", text: "The length is written in decimal digits, which can never contain a `#`. So the first `#` at or after the start of a chunk is exactly the one the encoder wrote after the length. A `#` inside a string appears later, after we have already jumped past it." } : null });
      whyHash = true;
      T.step("decLen", { vars: vars({ i, j, len }), state: S({ label: "the encoded string (received)", pillLabel: "decoded strings so far", pills: decoded.map((w, x) => pill(w, x)), mark: [...consumed(), [i, j - 1, "cmp"], [j, j, "key"]], ptr: { i, j } }), say: `Read the text from \`i\` to \`${j - 1}\`: “${enc.slice(i, j)}”. The next string has **${len}** character${len === 1 ? "" : "s"}.`, op: `len = stoi("${enc.slice(i, j)}")  →  ${len}`, act: "READ_LENGTH" });
      const body = enc.slice(j + 1, j + 1 + len);
      decoded.push(body);
      T.step("decTake", { w: Math.max(1, len), vars: vars({ i, j, len, string: q(body) }), state: S({ label: "the encoded string (received)", pillLabel: "decoded strings so far", pills: decoded.map((w, x) => pill(w, x)), mark: [...consumed(), [i, j - 1, "cmp"], [j, j, "key"], ...(len ? [[j + 1, j + len, "cur"]] : [])], ptr: { i, j } }), say: len === 0 ? "The length is 0, so the string is **empty**: take no characters and add an empty string to the result." : `Take exactly the next **${len}** character${len === 1 ? "" : "s"} after the \`#\`: **“${body}”**. They are copied as they are: their content is never inspected.`, op: `res.push_back(s.substr(${j + 1}, ${len}))  →  ${q(body)}`, act: "TAKE_STRING" });
      i = j + 1 + len;
      T.step("decJump", { vars: vars({ i }), state: S({ label: "the encoded string (received)", pillLabel: "decoded strings so far", pills: decoded.map((w, x) => pill(w, x)), mark: consumed(), ptr: i < enc.length ? { i } : {} }), say: `Jump over the whole chunk: \`i = ${j} + 1 + ${len}\` = **${i}**, which is the start of the next chunk (or the end of the text).`, op: `i = ${j} + 1 + ${len}  →  ${i}`, act: "JUMP",
        why: !whyJump ? { title: "Why jump instead of scanning?", text: "The length tells us exactly where the chunk ends, so the decoder never has to look at the characters of a string. That is why the content can be anything, and why decoding needs one step per chunk, not one per character (beyond copying)." } : null });
      whyJump = true;
    }
    T.step("decRet", { vars: vars({ strings: decoded.length }), state: S({ label: "the encoded string (received)", pillLabel: "decoded strings (the result)", pills: decoded.map((w, x) => pill(w, x)), mark: consumed() }), say: decoded.length ? `The receiver returns **${decoded.length}** string${decoded.length === 1 ? "" : "s"}: [${decoded.map(q).join(", ")}], exactly the list that was sent.` : "No chunk was found, so the receiver returns the empty list: exactly the list that was sent.", op: "return res", act: "DONE" });
    T.result(decoded.slice());
  },
  fuzz(rnd) {
    const al = "ab#3 /:";
    const k = Math.floor(rnd() * 5);
    return { strs: Array.from({ length: k }, () => Array.from({ length: Math.floor(rnd() * 6) }, () => al[Math.floor(rnd() * al.length)]).join("")) };
  },
  gen(n) { return { strs: Array.from({ length: n }, (_, i) => "ab#c".slice(0, 3 + (i % 1))) }; },

  complexity: {
    time: {
      tex: "O(N)", title: "each character is copied once to encode and once to decode", short: "N = total number of characters over all strings",
      derive: [
        "T_{\\text{encode}} = \\sum_{t=1}^{k} \\big( d(|s_t|) + 1 + |s_t| \\big)\\, c || write the digits of the length, the `#` and the string itself",
        "d(m) = \\lfloor \\log_{10} m \\rfloor + 1 \\le 4 \\text{ for } m \\le 200 \\;\\Rightarrow\\; T_{\\text{encode}} \\le c\\,(N + 5k) || at most 4 digits for a length of 200",
        "T_{\\text{decode}} = \\sum_{t=1}^{k} \\big( (d + 1) + |s_t| \\big)\\, c || find `#` after $d$ digits, read $d$ digits, copy $|s_t|$ characters, jump",
        "!T(N, k) = O(N + k) = O(N) || since $k \\le N + k$ and each chunk has constant bookkeeping",
      ],
      where: "Here $k$ is the number of strings and $N$ the total number of characters. The decoder never examines the characters of a string, only copies them; the search for `#` stops after at most a handful of digits. The measured table counts the characters written or copied.",
    },
    space: {
      tex: "O(N + k)", title: "the encoded text and the decoded list", short: "the output of each method",
      derive: [
        "|\\text{encoded}| = \\sum_t \\big( d(|s_t|) + 1 + |s_t| \\big) = N + O(k) || the message itself",
        "|\\text{decoded}| = N + O(k) || the list of copies",
        "!S = O(N + k) || the output size; no other memory is used",
      ],
      where: "The format adds at most $5$ characters per string to the data (up to 4 digits and a `#`), so the message is only slightly longer than the data. The escape-based version can double the size in the worst case (a string of slashes).",
    },
    limit: "Every character must be sent, so $\\Omega(N)$ is needed for the message and for reading it back; the length-prefix format is optimal, with only $O(\\log \\max|s|)$ bits of overhead per string.",
    measure: { label: "k = number of strings (3 characters each)", fTex: "k", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear in the number of strings" },
  },

  mistakes: [
    { title: "Using a plain separator", what: "`join(\",\")` and `split(\",\")`.", why: "It is the first thing that comes to mind.", breaks: "Strings that contain the separator split into pieces, and `[]` and `[\"\"]` both become the empty string.", avoid: "Never rely on the data not containing the delimiter: use lengths (or escaping)." },
    { title: "Reading only one digit of the length", what: "`len = s[i] - '0'`.", why: "Small examples have one-digit lengths.", breaks: "A string of 12 characters is read as length 1 and the decoder goes out of step for the rest of the message.", avoid: "Read everything up to the `#` and convert that text to a number." },
    { title: "Searching for `#` from the wrong place", what: "`s.find('#')` without the start index `i`.", why: "It finds *a* separator.", breaks: "After the first chunk it always finds the first `#` of the whole text, so the same chunk is decoded forever (infinite loop) or the lengths are wrong.", avoid: "`s.find('#', i)`: start at the beginning of the current chunk." },
    { title: "Forgetting `+ 1` when jumping", what: "`i = j + len`.", why: "The `#` seems to be part of the length.", breaks: "The decoder starts the next chunk on the last character of the string, so the length is read from letters and the parse fails.", avoid: "Skip the `#` as well: `i = j + 1 + len`." },
    { title: "Using global or static state", what: "Keeping the original list in a member variable and returning it from `decode`.", why: "It makes `decode` trivial.", breaks: "The statement forbids it: the decoder may run on a different machine that only receives the encoded string.", avoid: "Make `decode` depend only on its argument." },
  ],

  followUps: [
    {
      q: "Use a **fixed-width length** (for example 4 characters) instead of `length#`.",
      a: "Write the length as exactly four digits (`0004lint`). The decoder reads 4 characters, converts them, and takes that many characters, with no search for a `#`. The price is a fixed overhead of 4 characters per string and a maximum string length of 9999. It is slightly faster to decode and equally correct.",
      cpp: `string encodeFixed(vector<string>& strs) {
    string out;
    for (const string& s : strs) {
        string n = to_string(s.size());
        out += string(4 - n.size(), '0') + n + s;
    }
    return out;
}
vector<string> decodeFixed(string s) {
    vector<string> res;
    size_t i = 0;
    while (i < s.size()) {
        int len = stoi(s.substr(i, 4));
        res.push_back(s.substr(i + 4, len));
        i += 4 + len;
    }
    return res;
}`,
      js: `function encodeFixed(strs) {
  return strs.map((s) => String(s.length).padStart(4, "0") + s).join("");
}
function decodeFixed(s) {
  const res = [];
  let i = 0;
  while (i < s.length) {
    const len = parseInt(s.slice(i, i + 4), 10);
    res.push(s.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return res;
}`,
      time: "O(N)", space: "O(N)",
    },
    {
      q: "Make it work for **any set of characters**, including non-ASCII bytes.",
      a: "The length-prefix format already does: it never inspects the content, so it works for any bytes, provided the *length* counts the same units on both sides (bytes, not characters, if the text is encoded as UTF-8). That is why real protocols use length prefixes (HTTP chunked encoding, Redis, Protocol Buffers).",
      time: "O(N)", space: "O(N)",
    },
    {
      q: "Encode a **binary tree** into a string and rebuild it (Serialize and Deserialize Binary Tree).",
      a: "The same two ideas: choose an unambiguous format and make the decoder consume exactly what the encoder wrote. A pre-order traversal with an explicit marker for `null` children is self-delimiting; a level-order traversal with `null` markers works too. This is a later problem on the sheet.",
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Reduce the **overhead** of the length digits.",
      a: "Write the lengths in a more compact base (a variable-length integer such as a *varint*: 7 bits of the number per byte, the top bit saying whether more bytes follow). Short strings then cost one byte of overhead instead of two or three characters. Decoding stays $O(1)$ per string.",
      time: "O(N)", space: "O(N)",
    },
  ],

  related: [
    { id: "serialize-and-deserialize-binary-tree", why: "The same design question for a tree: an unambiguous encoding that the decoder can follow." },
    { id: "group-anagrams", why: "Also builds a *string key* from data; correctness of the key (no collisions) matters just as here." },
    { id: "valid-parentheses", why: "Another problem on how a decoder reads structured text, using a stack instead of lengths." },
    { id: "decode-ways", why: "Counts the ways to decode a digit string, the opposite question of fixing a format that has exactly one decoding." },
  ],
  patternNote: "**Self-describing formats.** To serialise arbitrary data, never let the data decide the structure. Put the structure first (a length, a count, a type tag) so that the reader always knows how many characters to consume next. Then no character in the data can be mistaken for a delimiter.",
  takeaways: [
    "A separator is unsafe, because the data may contain it; `[]` and `[\"\"]` must also stay different.",
    "Write each string as `length#string`; decode by reading the length up to the first `#`, taking that many characters, and jumping to `j + 1 + len`.",
    "Read the **whole** number (multi-digit lengths), search for `#` **from `i`**, and skip the `#` when jumping.",
    "The decoder must depend only on the encoded string; it never inspects the characters of a string.",
    "$O(N)$ time and space for $N$ total characters; overhead is only a few characters per string.",
  ],
});
