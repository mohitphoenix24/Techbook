---
title: Template Literal Types
level: advanced
time: 30
summary: Types made of strings — template literal types like `msg_${string}`, built-in string helpers (Uppercase, Capitalize…), combining unions into all possible strings, and parsing strings at the type level, e.g. extracting {{variables}} from a prompt template.
---

JavaScript has template strings: `` `Hello ${name}` ``. TypeScript has the same thing **for types**. They let you describe string formats precisely — IDs with prefixes, event names, routes, prompt variables — and even extract parts of strings while type checking.

:::def Template literal type
A string type built with backticks and `${}`: `` `msg_${string}` `` allows any string that starts with `msg_`. Combined with unions, it can generate every combination of strings.
:::

## String patterns

```ts run level=advanced type-error
type MessageId = `msg_${string}`;
type ToolUseId = `toolu_${string}`;
type Version = `${number}.${number}.${number}`;

const ok1: MessageId = "msg_01XFDUDYJgAACzvnptvVoYEL";
const ok2: Version = "7.0.2";
const bad1: MessageId = "toolu_123";       // ❌ wrong prefix
const bad2: Version = "7.0";               // ❌ needs three numbers
```

Prefixed IDs are a cheap way to stop mixing up IDs of different things — a message ID can't be passed where a tool-use ID is expected.

## Combining unions

```ts run level=advanced
type Model = "opus" | "sonnet" | "haiku";
type Effort = "low" | "medium" | "high";

type Preset = `${Model}-${Effort}`;
//   ^?

type Entity = "message" | "content_block";
type Phase = "start" | "delta" | "stop";
type EventName = `${Entity}_${Phase}`;
//   ^?

const preset: Preset = "haiku-low";
console.log(preset);
```

## Built-in string helpers

```ts run level=advanced
type Upper = Uppercase<"stop_reason">;
//   ^?
type Cap = Capitalize<"input_tokens">;
//   ^?

type Field = "model" | "maxTokens" | "temperature";
type Setter = `set${Capitalize<Field>}`;
//   ^?
type OnChange = `on${Capitalize<Field>}Change`;
//   ^?
console.log("Uppercase, Lowercase, Capitalize, Uncapitalize are built in");
```

## Parsing strings with `infer`

Template literal types work with `infer` (from the conditional types lesson) to **pull pieces out of strings**:

```ts run level=advanced
type ProviderOf<T> = T extends `${infer Provider}/${string}` ? Provider : never;
type P = ProviderOf<"anthropic/claude-opus-5-5">;
//   ^?

// Route parameters: "/chats/:chatId/messages/:messageId" → "chatId" | "messageId"
type Params<Path> = Path extends `${string}:${infer Param}/${infer Rest}`
  ? Param | Params<`/${Rest}`>
  : Path extends `${string}:${infer Param}` ? Param : never;

type ChatParams = Params<"/chats/:chatId/messages/:messageId">;
//   ^?

function buildPath<P extends string>(path: P, params: Record<Params<P>, string>): string {
  return path.replace(/:(\w+)/g, (_, name: string) => encodeURIComponent((params as Record<string, string>)[name]));
}
console.log(buildPath("/chats/:chatId/messages/:messageId", { chatId: "c_42", messageId: "m_7" }));
// buildPath("/chats/:chatId", { chat: "x" })   ← error: the key must be chatId
```

## Type-safe prompt templates

The highlight: extract every `{{variable}}` from a prompt template **at the type level**, so filling the template with a missing or misspelled variable is a compile error.

```ts run level=advanced type-error
type TemplateVars<S extends string> =
  S extends `${string}{{${infer Name}}}${infer Rest}` ? Name | TemplateVars<Rest> : never;

function fill<S extends string>(template: S, values: Record<TemplateVars<S>, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => (values as Record<string, string>)[name]);
}

const SUMMARY = "Summarise this {{docType}} for a {{audience}} in {{count}} bullet points:\n\n{{text}}";
type Vars = TemplateVars<typeof SUMMARY>;
//   ^?

console.log(fill(SUMMARY, { docType: "bug report", audience: "product manager", count: "3", text: "Login fails on Safari…" }));

fill(SUMMARY, { docType: "email", audience: "CEO", count: "2" });               // ❌ missing {{text}}
fill(SUMMARY, { docType: "email", audience: "CEO", count: "2", txt: "…" });     // ❌ typo: txt
```

The first call works and prints the prompt; the other two are caught before running. The Project Lab builds a full prompt engine on this idea.

:::warn Literal strings only
This only works when TypeScript knows the exact template text (a `const` or a string literal). A template loaded from a file or database at runtime is just `string`, so its variables can't be known while type checking — validate those at runtime instead.
:::

:::ai
Template literal types are great for AI app conventions: event names (`` `tool.${ToolName}.called` ``), cache keys (`` `emb:${Model}:${string}` ``), model/preset IDs, and prompt templates whose variables are checked at compile time. They catch the "I renamed the variable in the prompt but not in the code" bug.
:::

## Check yourself

```quiz
? Which strings match `` `msg_${string}` ``?
+ Any string starting with "msg_"
- Only "msg_"
- Any string containing "msg"
> ${string} matches any text after the prefix.

? What is `` `${"a" | "b"}-${"x" | "y"}` ``?
+ "a-x" | "a-y" | "b-x" | "b-y"
- "a|b-x|y"
- string
> Template literal types produce every combination.

? Why can't TemplateVars find variables in a template loaded from a database?
+ At compile time its type is just string — the text isn't known
- Databases strip braces
- Template literal types only work with numbers
> Type-level parsing needs a literal type.
```

:::keypoints
- `` `prefix_${string}` `` describes string formats (IDs, versions, event names).
- Unions inside templates produce every combination.
- `Uppercase`, `Lowercase`, `Capitalize`, `Uncapitalize` transform string literal types.
- With `infer`, you can parse strings at the type level — route params, `{{prompt}}` variables.
:::
