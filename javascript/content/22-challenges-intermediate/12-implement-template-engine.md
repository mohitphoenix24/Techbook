---
title: Implement a template engine
level: medium
time: 35
summary: Build a small Mustache-style engine with variables, HTML escaping, filters, if/else and each loops, parsed into an AST. Plus a safe html tagged template. Teaches parsing, escaping and why templates must not run arbitrary code.
---

:::problem Implement a template engine {level=medium tags="parsing,ast,security,xss,tagged templates"}
`render(template, data)` supports:

| Syntax | Meaning |
|---|---|
| `{{name}}` | value, **HTML-escaped** |
| `{{{html}}}` | raw value, not escaped |
| `{{user.address.city}}` | dotted path; a missing path gives an empty string |
| `{{name \| upper}}` | filters (`upper`, `lower`, `json`, `default:text`) |
| `{{#if cond}}…{{else}}…{{/if}}` | conditional |
| `{{#each items}}…{{/each}}` | loop; inside it `{{this}}` is the item and `{{@index}}` the position |

Rules:

1. **Parse once** into a tree, then render the tree (no `eval`, no `new Function`).
2. Unclosed or unexpected tags throw a clear error.
3. Paths use **own properties only**, so `{{constructor}}` or `{{__proto__}}` never leak internals.

Also write an **`html` tagged template**: ``html`<p>${userInput}</p>` `` escapes every interpolated value unless it is wrapped with `raw()`.

:::hint Hint
Split the template into text and tag tokens with one regex. Use a stack while reading: `#if`/`#each` push a node, `/if`/`/each` pop it. Rendering is a recursive walk over the tree, with a stack of scopes for the loop variable.
:::
:::

## Solution and tests

```js run title="Template engine and html tag, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- 1. parse: text -> tree ----------
function parse(template) {
  const root = { type: "root", children: [] };
  const stack = [root];
  const add = (node) => { const top = stack.at(-1); (top.inElse ? top.elseChildren : top.children).push(node); };
  const re = /\{\{\{\s*([\s\S]+?)\s*\}\}\}|\{\{\s*([\s\S]+?)\s*\}\}/g;
  let last = 0, m;
  while ((m = re.exec(template))) {
    if (m.index > last) add({ type: "text", value: template.slice(last, m.index) });
    last = re.lastIndex;
    if (m[1] !== undefined) { add({ type: "var", expr: m[1], raw: true }); continue; }
    const tag = m[2];
    if (tag.startsWith("#")) {
      const [kind, ...rest] = tag.slice(1).split(/\s+/);
      if (kind !== "if" && kind !== "each") throw new Error(`Unknown block {{#${kind}}}`);
      const node = { type: kind, expr: rest.join(" "), children: [], elseChildren: [], inElse: false };
      add(node);
      stack.push(node);
    } else if (tag === "else") {
      const top = stack.at(-1);
      if (top.type !== "if" && top.type !== "each") throw new Error("{{else}} outside a block");
      top.inElse = true;
    } else if (tag.startsWith("/")) {
      const kind = tag.slice(1);
      const top = stack.at(-1);
      if (stack.length === 1 || top.type !== kind) throw new Error(`Unexpected {{/${kind}}}`);
      stack.pop();
    } else add({ type: "var", expr: tag, raw: false });
  }
  if (last < template.length) add({ type: "text", value: template.slice(last) });
  if (stack.length > 1) throw new Error(`Unclosed {{#${stack.at(-1).type}}}`);
  return root;
}

// ---------- 2. render: tree + data -> string ----------
const FILTERS = {
  upper: (v) => String(v).toUpperCase(),
  lower: (v) => String(v).toLowerCase(),
  json: (v) => JSON.stringify(v),
  default: (v, arg) => (v === undefined || v === null || v === "" ? arg : v),
};

const own = (obj, key) => obj !== null && obj !== undefined && Object.prototype.hasOwnProperty.call(Object(obj), key);

function lookup(path, scopes) {
  if (path === "this") return scopes.at(-1).value;
  if (path === "@index") return scopes.findLast((s) => s.index !== undefined)?.index;
  const [first, ...rest] = path.split(".");
  const walk = (start) => rest.reduce((v, k) => (own(v, k) ? v[k] : undefined), start);
  if (first === "this") return walk(scopes.at(-1).value);               // this.ok = a field of the current item
  for (let i = scopes.length - 1; i >= 0; i--) {                       // inner scope first, then outer ones
    if (own(scopes[i].value, first)) return walk(scopes[i].value[first]);
  }
  return undefined;
}

function evaluate(expr, scopes) {
  const [path, ...filters] = expr.split("|").map((s) => s.trim());
  let value = lookup(path, scopes);
  for (const f of filters) {
    const [name, ...args] = f.split(":");
    if (!own(FILTERS, name)) throw new Error(`Unknown filter '${name}'`);
    value = FILTERS[name](value, args.join(":"));
  }
  return value;
}

function renderNodes(nodes, scopes) {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text") out += n.value;
    else if (n.type === "var") {
      const v = evaluate(n.expr, scopes);
      const text = v === undefined || v === null ? "" : String(v);
      out += n.raw ? text : escapeHtml(text);
    } else if (n.type === "if") {
      out += renderNodes(evaluate(n.expr, scopes) ? n.children : n.elseChildren, scopes);
    } else if (n.type === "each") {
      const list = evaluate(n.expr, scopes);
      if (!Array.isArray(list) || list.length === 0) out += renderNodes(n.elseChildren, scopes);
      else list.forEach((item, index) => { out += renderNodes(n.children, [...scopes, { value: item, index }]); });
    }
  }
  return out;
}

function compile(template) {
  const tree = parse(template);                                         // parse ONCE
  return (data) => renderNodes(tree.children, [{ value: data }]);       // render many times
}
const render = (template, data) => compile(template)(data);

// ---------- 3. a safe tagged template ----------
class Raw { constructor(s) { this.s = s; } }
const raw = (s) => new Raw(String(s));
function html(strings, ...values) {
  const part = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join("") : escapeHtml(v ?? ""));
  return new Raw(strings.reduce((out, s, i) => out + s + (i < values.length ? part(values[i]) : ""), ""));
}

// ---------------- tests ----------------
test("variables and paths", () => {
  assert.equal(render("Hi {{name}}!", { name: "Asha" }), "Hi Asha!");
  assert.equal(render("{{user.address.city}}", { user: { address: { city: "Pune" } } }), "Pune");
  assert.equal(render("[{{missing.deep.path}}]", {}), "[]");
});

test("values are HTML-escaped; triple braces are raw", () => {
  const data = { x: '<img src=x onerror="alert(1)">' };
  assert.equal(render("{{x}}", data), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(render("{{{x}}}", data), data.x);
});

test("numbers, zero and false are printed; null and undefined are empty", () => {
  assert.equal(render("{{a}}|{{b}}|{{c}}|{{d}}", { a: 0, b: false, c: null, d: undefined }), "0|false||");
});

test("filters", () => {
  assert.equal(render("{{name | upper}}", { name: "asha" }), "ASHA");
  assert.equal(render("{{missing | default:n/a}}", {}), "n/a");
  assert.equal(render("{{list | json}}", { list: [1, 2] }), "[1,2]".replace(/"/g, "&quot;"));
  assert.throws(() => render("{{x | nope}}", { x: 1 }), /Unknown filter/);
});

test("if / else", () => {
  const t = "{{#if admin}}Admin{{else}}User{{/if}}";
  assert.equal(render(t, { admin: true }), "Admin");
  assert.equal(render(t, { admin: false }), "User");
  assert.equal(render(t, {}), "User");
});

test("each with this and @index, and an else for empty lists", () => {
  assert.equal(render("{{#each items}}{{@index}}={{this}};{{/each}}", { items: ["a", "b"] }), "0=a;1=b;");
  assert.equal(render("{{#each items}}x{{else}}none{{/each}}", { items: [] }), "none");
});

test("each over objects uses their fields; outer scope is still visible", () => {
  const data = { title: "T", people: [{ n: "A" }, { n: "B" }] };
  assert.equal(render("{{#each people}}{{title}}:{{n}} {{/each}}", data), "T:A T:B ");
});

test("nested blocks", () => {
  const t = "{{#each rows}}{{#if this.ok}}Y{{else}}N{{/if}}{{/each}}";
  assert.equal(render(t, { rows: [{ ok: true }, { ok: false }, { ok: true }] }), "YNY");
});

test("errors for bad templates", () => {
  assert.throws(() => render("{{#if x}}open", {}), /Unclosed/);
  assert.throws(() => render("{{/if}}", {}), /Unexpected/);
  assert.throws(() => render("{{#loop x}}{{/loop}}", {}), /Unknown block/);
  assert.throws(() => render("{{else}}", {}), /outside a block/);
});

test("inherited properties never leak", () => {
  assert.equal(render("[{{constructor}}][{{__proto__}}][{{toString}}]", {}), "[][][]");
  assert.equal(render("{{#if hasOwnProperty}}leak{{else}}safe{{/if}}", {}), "safe");
});

test("compile once, render many", () => {
  const t = compile("Hello {{n}}");
  assert.equal(t({ n: 1 }), "Hello 1");
  assert.equal(t({ n: 2 }), "Hello 2");
});

test("html tagged template escapes values and allows raw()", () => {
  const evil = "<script>alert(1)</script>";
  assert.equal(html`<p>${evil}</p>`.s, "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  assert.equal(html`<b>${raw("<i>ok</i>")}</b>`.s, "<b><i>ok</i></b>");
  const items = ["a", "<b"];
  assert.equal(html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`.s, "<ul><li>a</li><li>&lt;b</li></ul>");
});
```

## Security notes (say these)

- **Escape by default**, opt in to raw. Most XSS bugs come from the opposite default.
- **Context matters**: HTML escaping is right for text, but not for attributes without quotes, `href="javascript:..."`, `<script>` or CSS. Real libraries have context-aware escaping.
- **Never** build templates by passing user text to `eval` or `new Function`: that is **server-side template injection** (code execution).
- Block prototype access (`constructor`, `__proto__`) in path lookups, as above.

:::qa Why parse the template once instead of using `string.replace` every time? {level=medium}
**Say this:** "Parsing once gives a tree that can be rendered many times quickly, and a tree can express blocks (`if`, `each`) and nesting, which regex replacement cannot. It also lets us report errors before rendering any data."

**In simple words:** Read the recipe once, then cook it many times.
:::

:::qa How does an `html` tagged template help security? {level=medium}
**Say this:** "The tag function receives the fixed strings and the dynamic values separately, so it can escape the values and leave the strings alone. The author cannot forget to escape. Libraries like lit-html and styled-components use the same trick."

**In simple words:** The tag knows which parts are user data.
:::

:::qa How do compiled templates like Handlebars differ from this interpreter? {level=hard}
**Say this:** "They generate JavaScript source for each template (with `new Function`) and run that, which is faster because there is no tree walk. The trade-off is that it needs the code-generation step, and it is unsafe for untrusted templates or under a strict CSP that bans `unsafe-eval`. Our tree walk needs no eval."

**In simple words:** Faster, but it writes code at runtime.
:::

:::keypoints
- **Tokenise → parse to an AST (stack for blocks) → render recursively**; compile once, render many times.
- **Escape by default**; `{{{ }}}` or `raw()` is an explicit opt-out.
- Look up paths with **own properties only**; no `eval`.
- A **tagged template** receives strings and values separately, so it can escape the values.
:::
