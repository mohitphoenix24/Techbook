---
title: Build a Structured-Output Engine
level: advanced
time: 65
icon: braces
cover: #f43f5e,#8b5cf6
tags: structured-output, constrained-decoding, regex, json-schema, automata
summary: Build constrained decoding from scratch — a tiny regex engine (NFA), a JSON-schema-to-regex compiler, and token masking during generation — so a language model can only produce text that matches your schema. Measure the validity rate with and without constraints, cache the masks, and learn what constrained decoding can and cannot guarantee.
---

Asking a model nicely for JSON works most of the time. **Constrained decoding** makes it work **every** time: at each step, tokens that would break the format are removed (their probability set to zero) *before* sampling, so an invalid output is literally impossible. This is how "structured outputs" features and libraries such as Outlines, XGrammar and llguidance work. In this project you build the whole mechanism.

**What you'll build:** a regex engine, a schema compiler, a constrained sampler and a benchmark, all in plain Python and NumPy.

:::flow The pipeline
Schema | the shape you want
Regex | compile the schema to a pattern
Automaton | NFA that tracks "where are we"
Mask | allowed tokens at each step
Sample | from the allowed tokens only
Output | valid by construction
:::

:::def Token masking
The model produces a logit (score) for every token in its vocabulary. Constrained decoding sets the logit of every token that would make the output **impossible to complete validly** to −∞ before the softmax. Sampling then can only pick tokens that keep the output on a valid path.
:::

## Step 1 — A tiny regex engine

To know which tokens are allowed we need to track "how far into the pattern are we, and what can come next?". A **finite automaton** does exactly that. We parse a small regex syntax (literals, `.`, classes like `[a-z0-9]`, groups, `|`, `*`, `+`, `?`, `{m,n}`) into a syntax tree, then build an **NFA** (non-deterministic finite automaton) and simulate it.

```python run shared title="Step 1 · regex parser and NFA"
import json, re, zlib, random
import numpy as np
from collections import Counter

PRINTABLE = frozenset(chr(c) for c in range(32, 127))

class Parser:
    """regex -> syntax tree. Nodes: ('chars', set) | ('cat', [nodes]) | ('alt', [nodes]) | ('rep', node, lo, hi)  (hi=None means unbounded)"""
    def __init__(self, s): self.s, self.i = s, 0
    def peek(self): return self.s[self.i] if self.i < len(self.s) else None
    def eat(self): c = self.s[self.i]; self.i += 1; return c
    def parse(self):
        node = self.alt()
        if self.i != len(self.s): raise ValueError(f"unexpected {self.peek()!r} at {self.i}")
        return node
    def alt(self):
        options = [self.cat()]
        while self.peek() == "|": self.eat(); options.append(self.cat())
        return options[0] if len(options) == 1 else ("alt", options)
    def cat(self):
        parts = []
        while self.peek() not in (None, "|", ")"): parts.append(self.repeat())
        return ("cat", parts)
    def repeat(self):
        node = self.atom()
        while self.peek() in ("*", "+", "?", "{"):
            c = self.eat()
            if c == "*": node = ("rep", node, 0, None)
            elif c == "+": node = ("rep", node, 1, None)
            elif c == "?": node = ("rep", node, 0, 1)
            else:
                spec = ""
                while self.peek() != "}": spec += self.eat()
                self.eat()
                lo, comma, hi = spec.partition(",")
                hi = (int(hi) if hi else None) if comma else int(lo)         # {m} exact, {m,n} range, {m,} unbounded
                node = ("rep", node, int(lo), hi)
        return node
    def atom(self):
        c = self.eat()
        if c == "(": node = self.alt(); assert self.eat() == ")"; return node
        if c == ".": return ("chars", PRINTABLE)
        if c == "[":
            chars = set()
            while self.peek() != "]":
                a = self.eat()
                if a == "\\": a = self.eat()
                if self.peek() == "-" and self.s[self.i + 1] != "]":
                    self.eat(); b = self.eat()
                    chars |= {chr(x) for x in range(ord(a), ord(b) + 1)}
                else: chars.add(a)
            self.eat(); return ("chars", frozenset(chars))
        if c == "\\": return ("chars", frozenset(self.eat()))
        return ("chars", frozenset(c))

class NFA:
    def __init__(self, regex):
        self.trans, self.eps = [], []                      # per state: list of (charset, target) and list of epsilon targets
        start, end = self._build(Parser(regex).parse())
        self.start, self.accept = start, end
    def _state(self):
        self.trans.append([]); self.eps.append([]); return len(self.trans) - 1
    def _build(self, node):
        kind = node[0]
        s, e = self._state(), self._state()
        if kind == "chars":
            self.trans[s].append((node[1], e))
        elif kind == "cat":
            cur = s
            for part in node[1]:
                ps, pe = self._build(part); self.eps[cur].append(ps); cur = pe
            self.eps[cur].append(e)
        elif kind == "alt":
            for part in node[1]:
                ps, pe = self._build(part); self.eps[s].append(ps); self.eps[pe].append(e)
        elif kind == "rep":
            _, inner, lo, hi = node
            cur = s
            for _ in range(lo):                            # mandatory copies
                ps, pe = self._build(inner); self.eps[cur].append(ps); cur = pe
            if hi is None:                                 # unbounded: loop
                ps, pe = self._build(inner)
                self.eps[cur].append(ps); self.eps[pe].append(ps); self.eps[pe].append(e); self.eps[cur].append(e)
            else:                                          # up to (hi - lo) optional copies
                for _ in range(hi - lo):
                    ps, pe = self._build(inner); self.eps[cur].append(ps); self.eps[cur].append(e); cur = pe
                self.eps[cur].append(e)
        return s, e
    def closure(self, states):
        seen, stack = set(states), list(states)
        while stack:
            for t in self.eps[stack.pop()]:
                if t not in seen: seen.add(t); stack.append(t)
        return frozenset(seen)
    def initial(self): return self.closure({self.start})
    def step(self, states, ch):
        nxt = {t for s in states for chars, t in self.trans[s] if ch in chars}
        return self.closure(nxt)
    def feed(self, states, text):
        for ch in text:
            states = self.step(states, ch)
            if not states: break
        return states
    def accepting(self, states): return self.accept in states

def full_match(regex, text):
    nfa = NFA(regex); return nfa.accepting(nfa.feed(nfa.initial(), text))

tests = [("[0-9]+", "2026", True), ("[0-9]+", "20a6", False), ("(cat|dog)s?", "dogs", True), ("(cat|dog)s?", "bird", False),
         ("[a-z]{2,4}", "abc", True), ("[a-z]{2,4}", "abcde", False), ("[a-z]{2,4}", "a", False), ('"[a-z ]*"', '"hi there"', True)]
for rx, text, want in tests:
    got = full_match(rx, text)
    print(f"{'ok ' if got == want else 'BUG'} /{rx}/ matches {text!r}: {got}")
```

The key operation for decoding is **prefix viability**: after reading some text, is there still *any* way to finish the pattern? In an NFA built this way, that is simply "is the set of live states non-empty?".

## Step 2 — A toy language model and vocabulary

We need something that produces logits over tokens. A real model would be a Transformer; here a **deterministic pseudo-random model** stands in (seeded by the text so far), which is the worst case for formatting: it has no idea about JSON. That makes it a good test for the constraint.

```python run shared title="Step 2 · vocabulary and a deterministic fake model"
CHARS = list("abcdefghijklmnopqrstuvwxyz0123456789 ") + list('{}[]",:.-@')
PIECES = ['{"', '"}', '": ', '", "', '"name"', '"age"', '"tags"', '"active"', '": "', 'true', 'false', 'null', '[', ']', '", "', '20', '30', '42', ", "]
VOCAB = CHARS + [p for p in PIECES if p not in CHARS] + ["<eos>"]
VOCAB = list(dict.fromkeys(VOCAB))                       # remove duplicates, keep order
EOS = VOCAB.index("<eos>")
print(len(VOCAB), "tokens, for example:", VOCAB[:8], "...", VOCAB[-8:])

def fake_logits(text):
    """Deterministic 'model': logits depend only on the text so far. It knows nothing about JSON."""
    return np.random.default_rng(zlib.crc32(text.encode())).normal(0, 1, len(VOCAB))

def softmax(x):
    e = np.exp(x - x.max()); return e / e.sum()

def generate_free(seed, max_tokens=40):
    rnd = np.random.default_rng(seed)
    text = ""
    for _ in range(max_tokens):
        t = int(rnd.choice(len(VOCAB), p=softmax(fake_logits(text))))
        if t == EOS: break
        text += VOCAB[t]
    return text

samples = [generate_free(s) for s in range(300)]
def is_valid_json(t):
    try: json.loads(t); return True
    except ValueError: return False
print("unconstrained examples:", [s[:30] for s in samples[:3]])
print(f"valid JSON without constraints: {sum(map(is_valid_json, samples))}/300")
```

## Step 3 — Constrained decoding

At every step: for each token, ask the automaton "if I append this token's text, is the path still viable?" Tokens that fail get their logit set to −∞. The end-of-sequence token is allowed **only if the pattern is complete**.

```python run shared title="Step 3 · token masking with the NFA"
class ConstrainedSampler:
    def __init__(self, regex):
        self.nfa = NFA(regex)
        self.cache = {}                                       # (automaton state, token) -> next state: built lazily
    def next_state(self, state, token):
        key = (state, token)
        if key not in self.cache: self.cache[key] = self.nfa.feed(state, VOCAB[token])
        return self.cache[key]
    def allowed(self, state):
        mask = np.array([t != EOS and bool(self.next_state(state, t)) for t in range(len(VOCAB))])
        mask[EOS] = self.nfa.accepting(state)
        return mask
    def generate(self, seed, max_tokens=60, model=fake_logits):
        rnd = np.random.default_rng(seed)
        state, text = self.nfa.initial(), ""
        for _ in range(max_tokens):
            logits = model(text)
            logits = np.where(self.allowed(state), logits, -np.inf)          # the mask: forbidden tokens get probability 0
            if not np.isfinite(logits).any(): break                          # cannot happen if the pattern is satisfiable
            t = int(rnd.choice(len(VOCAB), p=softmax(logits)))
            if t == EOS: break
            text += VOCAB[t]; state = self.next_state(state, t)
        return text, self.nfa.accepting(state)

sampler = ConstrainedSampler(r'[a-z]{3,6}@[a-z]{3,6}\.(com|org)')
for seed in range(5):
    text, done = sampler.generate(seed)
    print(f"{text!r:28} complete={done} matches regex: {full_match(r'[a-z]{3,6}@[a-z]{3,6}[.](com|org)', text)}")
```

Even though the fake model knows nothing about e-mail addresses, every output matches the pattern. The model's preferences still matter (they decide *which* valid string we get), but the **format is guaranteed**.

## Step 4 — Compile a JSON schema to a regex

Now the useful part: describe the output as a schema and compile it to a regex. We support a practical subset: objects with fixed, ordered properties, strings (with length limits or enums), integers, booleans and arrays with a size range.

```python run shared title="Step 4 · schema to regex"
WS = " ?"                                                # allow at most one optional space after separators, to keep outputs compact

def literal(text):
    """Escape the regex metacharacters of our tiny engine so a string matches itself."""
    return re.sub(r"([\\\[\](){}.*+?|])", r"\\\1", text)

def schema_to_regex(schema):
    t = schema["type"]
    if "enum" in schema:
        return "(" + "|".join(literal(json.dumps(v)) for v in schema["enum"]) + ")"
    if t == "string":
        lo, hi = schema.get("minLength", 1), schema.get("maxLength", 8)
        return f'"[a-z ]{{{lo},{hi}}}"'
    if t == "integer":
        digits = schema.get("maxDigits", 3)
        return f"(0|[1-9][0-9]{{0,{digits - 1}}})"
    if t == "boolean": return "(true|false)"
    if t == "null": return "null"
    if t == "array":
        item = schema_to_regex(schema["items"])
        lo, hi = schema.get("minItems", 0), schema.get("maxItems", 3)
        body = f"{item}(,{WS}{item}){{{max(lo - 1, 0)},{hi - 1}}}"
        return f"\\[({body})?\\]" if lo == 0 else f"\\[{body}\\]"
    if t == "object":
        parts = [f'"{k}":{WS}{schema_to_regex(v)}' for k, v in schema["properties"].items()]
        return "\\{" + f",{WS}".join(parts) + "\\}"
    raise ValueError(f"unsupported type {t}")

PERSON = {"type": "object", "properties": {
    "name": {"type": "string", "minLength": 2, "maxLength": 8},
    "age": {"type": "integer", "maxDigits": 3},
    "role": {"type": "string", "enum": ["admin", "user", "guest"]},
    "active": {"type": "boolean"},
    "tags": {"type": "array", "items": {"type": "string", "minLength": 2, "maxLength": 5}, "minItems": 1, "maxItems": 3},
}}
regex = schema_to_regex(PERSON)
print("compiled regex:", regex)
```

## Step 5 — Generate and measure

Our vocabulary needs the characters that the schema uses (quotes, braces, digits, letters). It already has them, so constrained decoding can run end to end. We generate 200 outputs with the constraint and check each one **with the real `json` module** against the schema.

```python run shared title="Step 5 · validity with and without the constraint"
def check_person(text):
    try: obj = json.loads(text)
    except ValueError: return False
    return isinstance(obj, dict) and (set(obj) == {"name", "age", "role", "active", "tags"} and isinstance(obj["name"], str) and 2 <= len(obj["name"]) <= 8
            and isinstance(obj["age"], int) and not isinstance(obj["age"], bool) and 0 <= obj["age"] <= 999
            and obj["role"] in ("admin", "user", "guest") and isinstance(obj["active"], bool)
            and isinstance(obj["tags"], list) and 1 <= len(obj["tags"]) <= 3 and all(isinstance(t, str) and 2 <= len(t) <= 5 for t in obj["tags"]))

person_sampler = ConstrainedSampler(regex)
constrained = [person_sampler.generate(seed, max_tokens=120)[0] for seed in range(200)]
free = [generate_free(seed, max_tokens=60) for seed in range(200)]
print(f"free-running model : {sum(map(check_person, free))}/200 outputs satisfy the schema")
print(f"constrained model  : {sum(map(check_person, constrained))}/200 outputs satisfy the schema")
for text in constrained[:3]: print("  ", text)
print("distinct outputs among 200 constrained samples:", len(set(constrained)))
```

## Step 6 — Speed: cache the masks, skip forced tokens

Computing the mask scans the whole vocabulary through the automaton, which would be slow for 100,000 tokens. Two standard optimisations:

1. **Cache by automaton state**: the allowed-token set depends only on the state, so a long generation reuses a small set of masks. (Real engines precompile the automaton into a DFA with token-level transitions.)
2. **Forced tokens**: when only **one** token is allowed, there is nothing to decide, so skip the model call entirely (and in real systems even append several forced tokens at once).

```python run shared title="Step 6 · mask cache and forced tokens"
person_sampler = ConstrainedSampler(regex)
mask_cache = {}
def allowed_cached(state):
    if state not in mask_cache: mask_cache[state] = person_sampler.allowed(state)
    return mask_cache[state]

forced = total = 0
for seed in range(200):
    state, text = person_sampler.nfa.initial(), ""
    rnd = np.random.default_rng(seed)
    for _ in range(120):
        mask = allowed_cached(state)
        total += 1
        if mask.sum() == 1:
            forced += 1; t = int(np.argmax(mask))                           # only one choice: no need to call the model
        else:
            t = int(rnd.choice(len(VOCAB), p=softmax(np.where(mask, fake_logits(text), -np.inf))))
        if t == EOS: break
        text += VOCAB[t]; state = person_sampler.next_state(state, t)
print(f"{total} decoding steps | {len(mask_cache)} distinct automaton states (so only {len(mask_cache)} masks were computed)")
print(f"{forced} steps had exactly one allowed token ({forced / total:.0%}): those need no model call")
```

## What constrained decoding does and does not guarantee

| It guarantees | It does not guarantee |
|---|---|
| syntactically valid output in the chosen grammar | that the **values are correct or sensible** |
| required fields present, types right, enums respected | that the model chose the **right** enum value |
| no parse errors, no retries for format | that the output **fits in `max_tokens`** (truncation can still cut a value off) |
| fewer wasted tokens on preambles and fences | good quality when the grammar **forces** the model somewhere it does not want to go |

Practical consequences:

- **Always validate semantics in code** (ranges, cross-field rules, database lookups) after parsing.
- Give fields **descriptive names and descriptions**; the constraint fixes the *shape*, the prompt still determines the *content*.
- **Put a `reasoning`/`explanation` field first** if you want chain-of-thought before the answer; forcing the answer first can hurt quality.
- Keep schemas **simple**: deep nesting, huge enums and unbounded repetition cost compile time and can make the model struggle.
- Hosted APIs implement this for you (a `response_format` / structured-outputs feature with a JSON schema); open-source engines (vLLM, SGLang, llama.cpp, Outlines, XGrammar) take a schema, regex or grammar. Understanding the mechanism tells you why some schema features are unsupported.

:::exercise Extend it
1. Add support for `"type": "number"` (an optional minus sign, digits, an optional fractional part) and test it.
2. Allow **optional properties** and properties in **any order** (hint: the regex becomes an alternation; think about why this explodes combinatorially, and how real engines avoid it).
3. Add a **token-healing** check: show an example where a multi-character token such as `'", "'` crosses a grammar boundary and still works because masking is done on whole tokens.
4. Make a `Pattern` for ISO dates (`20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])`) and generate 20 of them.
5. Replace `fake_logits` with the neural model from the language-model project and observe how the model's own preferences shape which valid string you get.
:::

:::keypoints
- Constrained decoding removes invalid tokens from the distribution at every step, so the output is valid by construction.
- A regex compiled to an automaton tells you, after any prefix, whether it can still be completed; that yields the allowed-token mask.
- A JSON schema (objects, strings, enums, integers, booleans, arrays) compiles to a regex; real engines use grammars for recursion.
- Mask caching per automaton state and skipping forced tokens make it fast enough for production.
- It guarantees format, not truth: always validate values, and keep schemas simple and well named.
:::
