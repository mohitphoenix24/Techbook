---
title: React with TypeScript
level: intermediate
time: 30
summary: Type your components the professional way — props, children, events, state, refs, reducers, context, generics and API data — so your editor catches mistakes before your users do.
---

Almost every serious React codebase uses **TypeScript**. Types document what each component expects, power autocomplete, and catch whole classes of bugs (a missing prop, a typo in a field name, a possibly-undefined value) as you type.

:::def TypeScript
JavaScript with **type annotations**. A compiler checks that values are used consistently and then strips the types, producing plain JavaScript. React files with JSX use the `.tsx` extension.
:::

:::note Types in the live editor
The editors below accept TypeScript (`tsx`), but they only **strip** the types to run the code — they don't type-check. In VS Code (or with `tsc`), mistakes like those in the comments would be underlined in red.
:::

## Typing props

```tsx run level=easy
type MessageProps = {
  role: "user" | "assistant";          // only these two strings are allowed
  text: string;
  tokens?: number;                      // optional
  onCopy?: (text: string) => void;      // a function prop
};

function Message({ role, text, tokens = 0, onCopy }: MessageProps) {
  return (
    <div className="card row" style={{ justifyContent: "space-between" }}>
      <span><b>{role === "user" ? "You" : "AI"}:</b> {text}</span>
      <span className="row">
        <small className="muted">{tokens} tok</small>
        {onCopy && <button onClick={() => onCopy(text)}>Copy</button>}
      </span>
    </div>
  );
}

export default function App() {
  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <Message role="user" text="What is TypeScript?" tokens={5} />
      <Message role="assistant" text="JavaScript with types." tokens={6} onCopy={(t) => console.log("copied:", t)} />
      {/* <Message role="system" text="x" />   ← error: '"system"' is not assignable to '"user" | "assistant"' */}
    </div>
  );
}
```

:::def Union type
A type that can be one of several options: `"user" | "assistant"`, `string | null`. TypeScript then forces you to handle each case.
:::

## children and HTML props

```tsx run level=intermediate
import type { ComponentProps, ReactNode } from "react";

type CardProps = { title: string; children: ReactNode };    // ReactNode = anything renderable

function Card({ title, children }: CardProps) {
  return <section className="card"><h3>{title}</h3>{children}</section>;
}

// Extend the props of a native <button>: onClick, disabled, type… all typed for free
type ButtonProps = ComponentProps<"button"> & { variant?: "default" | "primary" };

function Button({ variant = "default", className, ...rest }: ButtonProps) {
  return <button className={[variant === "primary" ? "primary" : "", className].join(" ")} {...rest} />;
}

export default function App() {
  return (
    <Card title="Model settings">
      <p>Temperature, max tokens…</p>
      <Button variant="primary" onClick={() => console.log("saved")}>Save</Button>
    </Card>
  );
}
```

## State, events and refs

```tsx run level=intermediate
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

type Status = "idle" | "loading" | "error";

export default function App() {
  const [query, setQuery] = useState("");                     // inferred as string
  const [status, setStatus] = useState<Status>("idle");       // explicit generic for unions
  const [results, setResults] = useState<string[]>([]);       // empty arrays need a type
  const inputRef = useRef<HTMLInputElement>(null);            // DOM refs: element type + null

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
  }
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setTimeout(() => { setResults([`${query} — doc A`, `${query} — doc B`]); setStatus("idle"); }, 500);
  }

  return (
    <form onSubmit={handleSubmit} className="stack" style={{ maxWidth: 360 }}>
      <div className="row">
        <input ref={inputRef} value={query} onChange={handleChange} placeholder="Search…" />
        <button className="primary" disabled={status === "loading"}>Search</button>
        <button type="button" onClick={() => inputRef.current?.focus()}>Focus</button>
      </div>
      <ul>{results.map((r) => <li key={r}>{r}</li>)}</ul>
    </form>
  );
}
```

| Thing | Type |
|---|---|
| input change event | `ChangeEvent<HTMLInputElement>` |
| form submit | `FormEvent<HTMLFormElement>` (or `formData: FormData` in actions) |
| click | `MouseEvent<HTMLButtonElement>` |
| key press | `KeyboardEvent<HTMLTextAreaElement>` |
| DOM ref | `useRef<HTMLDivElement>(null)` |
| renderable content | `ReactNode` |
| inline styles | `CSSProperties` |

:::tip Let inference work
You rarely need to annotate everything. `useState("")` is already `string`; `useState(0)` is `number`. Annotate when TypeScript can't know (unions, empty arrays, `null` initial values).
:::

## Reducers with discriminated unions

:::def Discriminated union
A union of object types that share a literal field (like `type`). Inside a `switch (action.type)`, TypeScript knows exactly which fields exist in each case — perfect for reducer actions and API events.
:::

```tsx run level=advanced
import { useReducer } from "react";

type Message = { id: number; role: "user" | "assistant"; text: string };
type State = { messages: Message[]; streaming: boolean };
type Action =
  | { type: "sent"; text: string }
  | { type: "token"; token: string }
  | { type: "done" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "sent":
      return { streaming: true, messages: [...state.messages,
        { id: Date.now(), role: "user", text: action.text },          // action.text is known to exist here
        { id: Date.now() + 1, role: "assistant", text: "" }] };
    case "token": {
      const last = state.messages[state.messages.length - 1];
      return { ...state, messages: [...state.messages.slice(0, -1), { ...last, text: last.text + action.token }] };
    }
    case "done":
      return { ...state, streaming: false };
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, { messages: [], streaming: false });
  function demo() {
    dispatch({ type: "sent", text: "Hi!" });
    "Typed reducers are great.".split(" ").forEach((w, i) =>
      setTimeout(() => { dispatch({ type: "token", token: w + " " }); if (i === 3) dispatch({ type: "done" }); }, 150 * (i + 1)));
  }
  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <button className="primary" onClick={demo} disabled={state.streaming}>Run demo</button>
      {state.messages.map((m) => <div key={m.id} className="card"><b>{m.role}:</b> {m.text}</div>)}
    </div>
  );
}
```

## Typing API data — and validating it

TypeScript types disappear at runtime. Data from an API (or an LLM!) can be anything, so **validate** it at the boundary — a schema library like **Zod** gives you both the runtime check and the TypeScript type.

```tsx run level=advanced
import { z } from "zod";

const ChatResponse = z.object({
  id: z.string(),
  role: z.literal("assistant"),
  content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});
type ChatResponse = z.infer<typeof ChatResponse>;          // the TypeScript type, derived from the schema

const good: unknown = { id: "msg_1", role: "assistant", content: [{ type: "text", text: "Hello!" }], usage: { input_tokens: 9, output_tokens: 3 } };
const bad: unknown = { id: 42, role: "assistant", content: "Hello!" };

for (const data of [good, bad]) {
  const parsed = ChatResponse.safeParse(data);
  if (parsed.success) {
    const res: ChatResponse = parsed.data;                 // fully typed from here on
    console.log("✅", res.content[0].text, `(${res.usage.output_tokens} output tokens)`);
  } else {
    console.log("❌", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "));
  }
}
```

## Generic components

```tsx run level=advanced
import type { ReactNode } from "react";

type ListProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  render: (item: T) => ReactNode;
  empty?: ReactNode;
};

function List<T>({ items, getKey, render, empty = <p className="muted">Nothing here.</p> }: ListProps<T>) {
  if (items.length === 0) return <>{empty}</>;
  return <ul>{items.map((it) => <li key={getKey(it)}>{render(it)}</li>)}</ul>;
}

type Doc = { id: string; title: string; score: number };

export default function App() {
  const docs: Doc[] = [{ id: "a", title: "Refunds", score: 0.92 }, { id: "b", title: "Billing", score: 0.71 }];
  return (
    <>
      <List items={docs} getKey={(d) => d.id} render={(d) => <>{d.title} <code>{d.score}</code></>} />
      <List items={[] as string[]} getKey={(s) => s} render={(s) => s} />
    </>
  );
}
```

## Setting up

```bash
npm create vite@latest my-app -- --template react-ts
npx tsc --noEmit          # type-check the whole project (CI-friendly)
```

Turn on `"strict": true` in `tsconfig.json` — it's the setting that catches the most bugs, especially `null`/`undefined` mistakes.

:::ai
Type your **message**, **tool call** and **stream event** shapes as discriminated unions, and validate every response from your backend or model with Zod. When the model's output shape changes, you find out from a clear validation error instead of a mysterious `undefined` deep in the UI.
:::

## Check yourself

```quiz
? How do you type a prop that can only be "user" or "assistant"?
+ role: "user" | "assistant"
- role: string[]
- role: enum
> A union of string literal types.

? What type does `useRef<HTMLInputElement>(null)` give you for `.current`?
+ HTMLInputElement | null
- HTMLInputElement
- any
> It's null until React attaches the element.

? Why validate API responses with Zod even in a TypeScript app?
+ Types are erased at runtime; real data can still be wrong
- TypeScript can't type JSON
- Zod makes requests faster
> z.infer gives you the static type from the same schema.
```

:::keypoints
- Type props with object types; use unions for fixed options and `?` for optional props.
- Use `ReactNode` for children, `ComponentProps<"button">` to extend native props, `ChangeEvent`/`FormEvent` for handlers.
- Discriminated unions make reducers and event handling type-safe.
- Validate runtime data (APIs, LLM output) with **Zod** and derive types with `z.infer`.
- Enable `strict` mode; check with `tsc --noEmit`.
:::
