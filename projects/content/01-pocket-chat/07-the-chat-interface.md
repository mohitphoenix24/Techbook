---
title: The chat interface
level: easy
time: 40
summary: The components that draw the app: sidebar, message list that follows the newest text, Markdown rendering that is safe, and a composer with the right keyboard behaviour, plus the design tokens that style it.
tags: components, Markdown, auto-scroll, accessibility, CSS
---

With `useChat` doing the work, the components are mostly drawing. This lesson walks through them from the outside in, and calls out the details that separate a demo from something people enjoy using.

![Pocket Chat showing a Markdown reply with a code block and usage under each answer](assets/img/pocket-chat-chat.png)

## The shape of the page

```text
App
├─ Sidebar            conversations, New chat, delete
└─ main
   ├─ header          title, provider badge
   ├─ MessageList     scrolls; one MessageBubble per message
   └─ Composer        textarea, Send / Stop, persona picker
```

`App` is the only component that owns state: the persona, the conversation list, and the `useChat` result. It passes data and callbacks **down**; nothing reaches up except through those callbacks.

```tsx src="pocket-chat/frontend/src/App.tsx" title="frontend/src/App.tsx"
```

A few choices to notice:

- `refresh` is wrapped in `useCallback` because `useChat` calls it after every reply (`onSaved`).
- Opening a saved conversation also restores its **persona**: the hook's `open` returns it.
- Deleting the active conversation resets the chat.
- The menu button only shows on phones: the sidebar becomes a slide-over panel (see the CSS below).

## Markdown, safely

Models answer in Markdown: lists, tables, code. We render it with `react-markdown`, which builds React elements instead of injecting HTML, so a malicious answer cannot add a `<script>`. Code blocks get a header with the language and a **Copy** button.

```tsx src="pocket-chat/frontend/src/components/Markdown.tsx" region="components" title="frontend/src/components/Markdown.tsx"
```

Here is the real `Markdown.tsx`, rendering text that arrives piece by piece, the way a reply does. Press **Stream**:

```tsx run src="pocket-chat/frontend/src/components/Markdown.tsx" title="The real Markdown component, fed a stream" level=intermediate autoclick="Stream" wait=3200
import { useRef } from "react";            // (Markdown.tsx above already imports useState)

const REPLY = "Here is a **small example**:\n\n```python\ndef greet(name):\n    return f\"Hello, {name}!\"\n```\n\n| Part | Job |\n|---|---|\n| React | draws the chat |\n| FastAPI | calls the model |\n\nAsk me to change it.";

export default function App() {
  const [text, setText] = useState("");          // useState comes from the Markdown.tsx imports above
  const timer = useRef<number>();

  function stream() {
    clearInterval(timer.current);
    let i = 0;
    setText("");
    timer.current = window.setInterval(() => {
      i += 3;                                              // three characters per tick, like a chunk of tokens
      setText(REPLY.slice(0, i));
      if (i >= REPLY.length) clearInterval(timer.current);
    }, 40);
  }

  return (
    <div className="stack">
      <style>{`.code-block{background:#0a0c18;color:#e6e9f7;border-radius:10px;overflow:hidden;margin:0 0 10px}
        .code-head{display:flex;justify-content:space-between;padding:4px 10px;font-size:12px;background:#ffffff12}
        .code-head button{border:0;background:none;color:inherit;padding:0}.code-block pre{margin:0;border:0;background:none;border-radius:0}`}</style>
      <button className="primary" onClick={stream}>Stream</button>
      <div className="card"><Markdown text={text || "_(press Stream)_"} /></div>
    </div>
  );
}
```

Watch what happens in the middle of the code block or the table: Markdown that is only half written still renders (an unclosed code fence is treated as code to the end). Streaming Markdown is forgiving, which is why this simple approach works well.

## Following the newest text, but not fighting the reader

A chat should scroll as words arrive, **unless** the reader scrolled up to look at something. Auto-scrolling then would yank them away. The rule: stay "stuck" to the bottom only while the user is near it.

```tsx src="pocket-chat/frontend/src/components/MessageList.tsx" region="autoscroll" title="frontend/src/components/MessageList.tsx"
```

The ref `stuck` records whether the user is within 80 px of the bottom. The effect runs whenever the last message's length changes (a new piece arrived) and scrolls only if `stuck.current` is true. A `ref` is the right tool here: it must change without causing a re-render.

## The message bubble

`MessageBubble` shows one message in one of four states (`streaming`, `done`, `stopped`, `error`). The same component handles all of them by looking at `message.status`:

```tsx src="pocket-chat/frontend/src/components/MessageBubble.tsx" title="frontend/src/components/MessageBubble.tsx"
```

Look for these details:

- While `streaming` with no text yet, it shows animated dots; once text arrives it shows a blinking caret after the last word.
- A **stopped** message says so. Never let a half-answer look like a complete one.
- An **error** message explains what happened and, on the last message, offers **Try again**.
- Actions (Copy, Regenerate) and the usage line appear only after streaming ends; showing them mid-stream would be noise.

## The composer

Typing is where small details matter most: **Enter sends, Shift+Enter adds a line**, and Enter must *not* send while an IME (Chinese, Japanese, Hindi phonetic input) is composing a character.

```tsx src="pocket-chat/frontend/src/components/Composer.tsx" title="frontend/src/components/Composer.tsx"
```

- `e.nativeEvent.isComposing` is the IME check, one line that fixes a real bug for millions of users.
- While streaming, the **Send** button becomes **Stop**. One slot, two meanings, driven by the `streaming` flag.
- The textarea grows with its content up to 200 px (`grow`), then scrolls.
- The oldest-messages notice appears when the server reports that it trimmed history.

## Design tokens

All colours, radii and spacing come from a handful of CSS variables at the top of the stylesheet, with a dark-mode override, so changing the look of the app means changing a few lines:

```css src="pocket-chat/frontend/src/styles.css" region="tokens" title="frontend/src/styles.css (the tokens)"
```

Dark mode needs no JavaScript: `prefers-color-scheme: dark` swaps the variables. For phones, a media query turns the sidebar into a fixed panel that slides in (`transform: translateX(-100%)` to `none`), and the `menu-open` class on `.app` controls it.

## Accessibility in four lines

- The message list is `role="log"` with `aria-live="polite"`, so a screen reader announces new text without interrupting.
- Buttons that only show an icon have an `aria-label` (`Stop generating`, `Show conversations`).
- Focus rings are visible (`:focus-visible`).
- Animations respect `prefers-reduced-motion`.

:::keypoints
- `App` owns the state and passes data and callbacks down; components below mostly draw.
- Render model output with `react-markdown` so it can never inject HTML; half-written Markdown still renders during streaming.
- Auto-scroll only while the reader is near the bottom, tracked in a ref.
- One bubble component handles every message state; always flag stopped and failed replies.
- Enter sends, Shift+Enter adds a line, and ignore Enter while an IME is composing.
- CSS variables are the design tokens; `prefers-color-scheme` gives dark mode for free.
:::

```quiz
? Why does the message list use a ref for "am I stuck to the bottom?" instead of state?
- Refs are faster to type
+ The value changes on every scroll event and must not trigger a re-render
- State cannot hold booleans
> A ref stores a mutable value without causing re-renders, which is what a scroll tracker needs.
? Why is `react-markdown` safer than dangerouslySetInnerHTML for model output?
- It is smaller
+ It builds React elements and does not inject raw HTML, so a malicious answer cannot add scripts
- It sanitises the user's password
> Model output can contain anything, including content that an attacker influenced. Never inject it as HTML.
? What does `e.nativeEvent.isComposing` protect against?
- Double clicks
+ Sending the message while an IME is still composing a character
- Slow typing
> IME users press Enter to confirm a character; without the check that Enter would send a half-typed message.
```

:::exercise Add a "scroll to bottom" button
When the reader has scrolled up (`stuck.current` is false) and new text keeps arriving, show a small floating **↓ New text** button that jumps to the bottom and re-sticks. You will need to turn `stuck` into state (or add a second piece of state) so the button can appear and disappear. Why can't you only use the ref for that?
:::
