---
title: The schema-driven review form
level: easy
time: 45
summary: Draw an editable form from a field description, update nested data without mutating it, show the exact evidence for each value, and keep it all in one tested reducer. Real components, live in your browser.
tags: React, forms, recursion, immutability, highlighting
---

The model's answer is a nested JSON object, and a person has to read it, trust it or fix it. The interface for that is a **form**, and the clever part of this project's form is that it contains no invoice, no meeting and no ticket. It draws *whatever the server describes*.

## The state of the screen

Everything on screen comes from one state object and a handful of actions, in a reducer (the pattern from Project 1):

```ts src="smart-extractor/frontend/src/extractorReducer.ts" region="state" title="frontend/src/extractorReducer.ts"
```

The important fields are the three copies of the data:

| Field | What it holds | Why |
|---|---|---|
| `result` | exactly what the server returned | never edited: it is the model's answer, kept for comparison |
| `data` | the editable copy the form shows | the person changes this |
| `baseline` | the data as last extracted or saved | `isEdited` compares `data` with it, so **Save** knows whether anything changed |

`extractedText` records the text the result refers to. The evidence offsets are positions in *that* text; if the person edits the text afterwards, the offsets would point at the wrong words, so the Evidence tab switches off until they extract again. A small field that prevents a confusing bug.

```ts src="smart-extractor/frontend/src/extractorReducer.ts" region="reducer" title="frontend/src/extractorReducer.ts"
```

## Addressing a value: paths

The server says "`line_items.0.amount` is wrong". The form needs to find that value to read it, replace it, and mark it. A **path** like that is just the keys and indexes joined by dots, and three small functions are all it takes. They are pure, so they run right here. Try the buttons, and watch which objects are *shared* between the old and new data:

```tsx run src="smart-extractor/frontend/src/paths.ts" flat title="getAt, setAt and removeAt (the real paths.ts)" level=intermediate autoclick="Set line_items.1.amount = 99" wait=300
import { useState } from "react";

const original = { vendor: "Acme", line_items: [{ description: "Pen", amount: 10 }, { description: "Book", amount: 20 }] };

export default function App() {
  const [data, setData] = useState<any>(original);
  const same = (a: unknown, b: unknown) => (a === b ? "shared with the original" : "a new object");

  return (
    <div className="stack">
      <div className="row">
        <button onClick={() => setData(setAt(data, "line_items.1.amount", 99))}>Set line_items.1.amount = 99</button>
        <button onClick={() => setData(removeAt(data, "line_items", 0))}>Remove line_items.0</button>
        <button onClick={() => setData(original)}>Reset</button>
      </div>
      <pre>{JSON.stringify(data, null, 2)}</pre>
      <div className="card muted">
        <div>the whole object: {same(data, original)}</div>
        <div>the line_items list: {same(data.line_items, original.line_items)}</div>
        <div>the first line item: {same(data.line_items[0], original.line_items[0])}</div>
        <div>getAt(data, "line_items.0.description") = {JSON.stringify(getAt(data, "line_items.0.description"))}</div>
      </div>
    </div>
  );
}
```

After you set the amount, the **path to the change** (object, list, second item) is new, and everything else is **shared**. That is how immutable updates stay cheap, and it is what lets React know exactly what to redraw.

## The form that draws itself

The server sends a *field description*; the browser draws one control per node. A list of objects draws a list of sub-forms, and an object inside an object draws a nested form. That is **recursion**: `FieldForm` draws rows, a row can be an object, and an object is drawn by `FieldForm`.

First, what we know about each value, as one word:

```tsx src="smart-extractor/frontend/src/components/FieldForm.tsx" region="ctx" title="frontend/src/components/FieldForm.tsx"
```

Then the row that draws one node:

```tsx src="smart-extractor/frontend/src/components/FieldForm.tsx" region="row" title="frontend/src/components/FieldForm.tsx"
```

And the small component that starts it all:

```tsx src="smart-extractor/frontend/src/components/FieldForm.tsx" region="form" title="frontend/src/components/FieldForm.tsx"
```

How a node maps to a control:

| `type` | Control | Note |
|---|---|---|
| `text` | `<input>` (or `<textarea>` when long) | |
| `number` | `<input type="number">` | stored as a real number, not a string |
| `date` | `<input type="date">` | the browser gives `YYYY-MM-DD`, exactly what the schema wants |
| `enum` | `<select>` | the `options` come from the Pydantic `Literal` |
| `list` | a card per item, with **Remove**, and an **Add** button | a new item is built by `blankFor(node.item)` |
| `object` | the same form, one level deeper | |
| `nullable` | a ✕ to clear, and an "Add a value" link when it is `null` | |

### Run the real form

This block joins the real `paths.ts` and `FieldForm.tsx` and draws a form from a field description you can read. It has one value the model "invented" (flagged), one broken rule, and a nullable date. **Edit values, remove an item, press Add, clear the due date.**

```tsx run src="smart-extractor/frontend/src/paths.ts,smart-extractor/frontend/src/components/FieldForm.tsx" flat title="The real FieldForm, drawn from a field description" level=advanced
import { useState } from "react";

const FIELDS: FieldNode[] = [
  { name: "vendor", label: "Vendor", type: "text", nullable: false, description: "" },
  { name: "invoice_number", label: "Invoice number", type: "text", nullable: false, description: "" },
  { name: "due_date", label: "Due date", type: "date", nullable: true, description: "" },
  { name: "status", label: "Status", type: "enum", nullable: false, description: "", options: ["draft", "sent", "paid"] },
  { name: "items", label: "Items", type: "list", nullable: false, description: "", item: {
      name: "item", label: "Items", type: "object", nullable: false, description: "", fields: [
        { name: "description", label: "Description", type: "text", nullable: false, description: "" },
        { name: "amount", label: "Amount", type: "number", nullable: false, description: "" },
      ] } },
];

const START = { vendor: "Sharma Stationers", invoice_number: "INV-9999-X", due_date: "2026-11-13", status: "sent",
  items: [{ description: "A4 paper", amount: 2500 }, { description: "Ball pens", amount: 720 }] };

const ISSUES: Issue[] = [{ path: "items.1.amount", level: "error", message: "quantity x unit_price is 720.00 but amount is 20.00" }];
const EVIDENCE = { vendor: { status: "found", start: 0, end: 5 }, invoice_number: { status: "missing", start: null, end: null } } as Record<string, Evidence>;

const css = `.form{display:flex;flex-direction:column;gap:8px}.field{display:grid;grid-template-columns:120px 1fr;gap:2px 10px;padding:3px 6px;border-left:3px solid transparent;border-radius:6px}
.field.warning{border-left-color:#d97706}.field.error{border-left-color:#dc2626;background:#dc262615}.control{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.control input:not([type=checkbox]),.control select{flex:1;min-width:110px}
.chip{font-size:11px;padding:1px 8px;border-radius:99px}.chip.found{background:#16a34a22;color:#16a34a}.chip.warning{background:#d9770622;color:#d97706}.chip.error{background:#dc262622;color:#dc2626}
.msg{grid-column:2;margin:0;font-size:12px}.msg.error{color:#dc2626}.msg.warning{color:#d97706}.list{border:1px dashed #8884;border-radius:8px;padding:6px 8px}.list h4{margin:0 0 6px}.item{border:1px solid #8884;border-radius:8px;padding:6px;margin-bottom:6px}
.item header{display:flex;justify-content:space-between;font-size:12px}.link,.icon{background:none;border:0;padding:0 4px;text-decoration:underline}.icon{text-decoration:none}.empty{font-style:italic}.add{border-style:dashed}`;

export default function App() {
  const [data, setData] = useState<any>(START);
  const ctx: FormContext = {
    issues: groupIssues(ISSUES), evidence: EVIDENCE,
    onChange: (path, value) => setData((d: any) => setAt(d, path, value)),
    onRemove: (listPath, index) => setData((d: any) => removeAt(d, listPath, index)),
    onFocus: () => {},
  };
  return (
    <div className="stack">
      <style>{css}</style>
      <FieldForm fields={FIELDS} value={data} path="" ctx={ctx} />
      <details><summary>The data behind the form</summary><pre>{JSON.stringify(data, null, 2)}</pre></details>
    </div>
  );
}
```

Things to try: change the amount and watch the row keep its error (the server has not re-checked it yet); clear `Due date` with ✕ and press **Add a value**; add an item and see that `blankFor` made an empty object with the right fields.

## Showing the evidence

Evidence arrives as character offsets. Turning `text` and offsets into highlighted text is a small pure function that cuts the text into plain and marked pieces:

```tsx src="smart-extractor/frontend/src/components/Highlighted.tsx" region="segments" title="frontend/src/components/Highlighted.tsx"
```

```tsx run src="smart-extractor/frontend/src/components/Highlighted.tsx" flat title="The real Highlighted component" level=intermediate
import { useState } from "react";

const TEXT = "Invoice No: INV-2026-0042\nInvoice Date: 14 Oct 2026\nTotal: INR 4,861.60";
const EVIDENCE: Record<string, Evidence> = {
  invoice_number: { status: "found", start: 12, end: 25 },
  invoice_date: { status: "found", start: 41, end: 52 },
  total: { status: "found", start: 69, end: 77 },
  vendor: { status: "missing", start: null, end: null },
};

export default function App() {
  const [focus, setFocus] = useState<string | null>("invoice_number");
  return (
    <div className="stack">
      <style>{`mark{background:#fde68a;color:#111;border-radius:3px}mark.focus{background:#f59e0b}pre.source{white-space:pre-wrap}`}</style>
      <div className="row">
        {Object.keys(EVIDENCE).map((k) => <button key={k} className={k === focus ? "primary" : ""} onClick={() => setFocus(k)}>{k}</button>)}
      </div>
      <Highlighted text={TEXT} evidence={EVIDENCE} focusPath={focus} />
      <p className="muted">{focus && EVIDENCE[focus].status === "missing" ? `"${focus}" has no evidence, so nothing is highlighted.` : `Evidence for "${focus}" is emphasised.`}</p>
    </div>
  );
}
```

Overlapping spans are dropped (first wins) because two `<mark>`s cannot occupy the same characters. The component also scrolls the focused mark into view, so hovering a field in a long document takes you to its evidence.

## Putting the screen together

`App.tsx` loads the document types and the history, owns the reducer, and passes data and callbacks down:

```tsx src="smart-extractor/frontend/src/App.tsx" region="app" title="frontend/src/App.tsx"
```

The banner tells the person what to *do*, not just what happened:

```tsx src="smart-extractor/frontend/src/components/ResultPanel.tsx" region="banner" title="frontend/src/components/ResultPanel.tsx"
```

| Outcome | Banner | What the person does |
|---|---|---|
| valid, grounded, first time | green "Right first time" | skim and confirm |
| valid, repaired | green "Fixed automatically after 1 retry" | skim and confirm |
| valid, some values not found | amber "N values not found in the document" | check just those fields |
| invalid after the retries | red "Needs your review" | fix the flagged fields |

The save button is honest about its meaning: **Confirm as correct** when nothing changed (an approval is data too), **Save corrections** when something did, and **✓ Review saved** afterwards.

## The tests

The state logic and the path helpers have their own fast tests (no browser), 15 in all:

```ts src="smart-extractor/frontend/src/extractorReducer.test.ts" region="reducer-tests" title="frontend/src/extractorReducer.test.ts"
```

And the CSV export, which turns any extraction into a spreadsheet (one row per list item, repeating the single values):

```ts src="smart-extractor/frontend/src/export.ts" region="csv" title="frontend/src/export.ts"
```

:::keypoints
- One reducer holds the model's answer, an editable copy and a baseline, so "has the person changed anything?" is a comparison.
- Paths like `line_items.0.amount` connect the server's messages to the form's values; `setAt` updates by copying only the path to the change.
- A recursive component draws a form from a field description: no document type is hard-coded in the browser.
- Evidence offsets turn "do you trust the model?" into "look, it is right there"; they are only valid for the text they were computed on.
- The banner says what the person should do next; the save button changes with what happened.
:::

```quiz
? Why does the form keep `result`, `data` and `baseline` separately?
- To use more memory
+ result is the model's answer for comparison, data is what the person edits, and baseline tells whether anything changed
- React requires three copies
> Keeping the original untouched and comparing against a baseline makes Save, "edited" markers and evals straightforward.
? What makes FieldForm recursive?
- It calls the server again for each field
+ A list item or an object field is itself drawn by FieldForm, one level deeper
- It uses setTimeout
> Nested data is drawn by nested calls of the same component.
? Why is the Evidence tab disabled after the person edits the document text?
- Editing is not allowed
+ The offsets point into the text that was extracted; after an edit they would highlight the wrong words
- The server deletes the evidence
> Evidence is only valid for the exact text it was computed on, so the UI keeps extractedText and compares.
```

:::exercise Highlight the issue, not just the evidence
Right now an error at path `items.1.amount` marks only the row. Add a **jump to field** link to each issue in a list at the top of the result panel: clicking it should focus the input with that path. (Hint: every input has `id="f-<path>"`, so `document.getElementById("f-" + path)?.focus()` is enough.) Why might a link for the whole-document error need to be different?
:::
