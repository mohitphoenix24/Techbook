---
title: Testing React Apps
level: intermediate
time: 30
summary: Write tests that give you confidence without slowing you down — pure logic tests, component tests the way users interact (Vitest + React Testing Library), mocking APIs and streams, and end-to-end tests with Playwright. Includes a tiny testing library you can run right here.
---

Tests are code that checks your code. They let you refactor, upgrade React or change prompts **without fear**: if something breaks, a test fails before your users notice.

:::def Test
A small program that sets something up, does an action, and **asserts** (checks) the result: *"render the button → click it → expect the text to be 'Liked'"*.
:::

:::def Test runner
The tool that finds your test files, runs them and reports pass/fail. For React + Vite projects the standard is **Vitest** (Jest-compatible API, very fast).
:::

| Kind | What it checks | Tool | How many |
|---|---|---|---|
| **Unit** | a pure function (reducer, parser, formatter) | Vitest | many, very fast |
| **Component** | a component renders and reacts to the user correctly | Vitest + React Testing Library | most of your UI tests |
| **End-to-end (E2E)** | the real app in a real browser, from login to result | Playwright | a few critical flows |

## Testing pure logic

Logic that lives outside components (reducers, parsers, token counters) is the easiest thing to test. Here's a reducer and a mini `expect`:

```js run level=easy
function chatReducer(state, action) {
  switch (action.type) {
    case "sent": return { ...state, messages: [...state.messages, { role: "user", text: action.text }] };
    case "token": {
      const msgs = [...state.messages];
      const last = msgs.at(-1);
      if (last?.role === "assistant") msgs[msgs.length - 1] = { ...last, text: last.text + action.token };
      else msgs.push({ role: "assistant", text: action.token });
      return { ...state, messages: msgs };
    }
    default: return state;
  }
}

// a 6-line expect()
const expect = (actual) => ({
  toBe: (expected) => { if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); },
  toEqual: (expected) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); },
});
const test = (name, fn) => { try { fn(); console.log("✅", name); } catch (e) { console.log("❌", name, "→", e.message); } };

const empty = { messages: [] };

test("sent adds a user message", () => {
  const s = chatReducer(empty, { type: "sent", text: "hi" });
  expect(s.messages).toEqual([{ role: "user", text: "hi" }]);
});
test("first token starts an assistant message", () => {
  const s = chatReducer(empty, { type: "token", token: "Hel" });
  expect(s.messages.at(-1).role).toBe("assistant");
});
test("later tokens append to the same message", () => {
  let s = chatReducer(empty, { type: "token", token: "Hel" });
  s = chatReducer(s, { type: "token", token: "lo" });
  expect(s.messages.length).toBe(1);
  expect(s.messages[0].text).toBe("Hello");
});
test("does not mutate the old state", () => {
  const before = { messages: [{ role: "assistant", text: "A" }] };
  chatReducer(before, { type: "token", token: "B" });
  expect(before.messages[0].text).toBe("A");
});
```

That's all a test is. Real runners add nicer output, watch mode, coverage and many matchers — but the idea is identical.

## How component tests work (a tiny testing library)

React Testing Library renders your component into a fake page, lets you **find elements the way a user would** (by text, by role, by label), fire events, and check the result. Here's a 30-line version so you can see there's no magic:

```jsx run level=intermediate
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

// Testing Library wraps updates in act(); here flushSync() does the same job:
// "apply every pending update to the DOM right now, before the next line runs".
const act = (fn) => flushSync(fn);

// ---------- the component we want to test ----------
function LikeButton({ onChange }) {
  const [liked, setLiked] = useState(false);
  return (
    <button aria-pressed={liked} onClick={() => { setLiked(!liked); onChange?.(!liked); }}>
      {liked ? "Liked" : "Like"}
    </button>
  );
}

// ---------- a tiny testing library ----------
function render(ui) {
  const container = document.createElement("div");   // a detached "fake page"
  const root = createRoot(container);
  act(() => root.render(ui));
  const all = () => [...container.querySelectorAll("*")];
  return {
    getByText(text) {
      const el = all().find((n) => n.children.length === 0 && n.textContent === text);
      if (!el) throw new Error(`Unable to find an element with the text: ${text}`);
      return el;
    },
    getByRole(role) {
      const el = all().find((n) => n.getAttribute("role") === role || n.tagName.toLowerCase() === role);
      if (!el) throw new Error(`Unable to find role="${role}"`);
      return el;
    },
    unmount: () => act(() => root.unmount()),
  };
}
const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const expect = (actual) => ({
  toBe(expected) { if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}`); },
});

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------- the tests ----------
test("shows 'Like' at first", () => {
  const screen = render(<LikeButton />);
  expect(screen.getByRole("button").textContent).toBe("Like");
  screen.unmount();
});

test("toggles to 'Liked' when clicked", () => {
  const screen = render(<LikeButton />);
  click(screen.getByText("Like"));
  expect(screen.getByRole("button").textContent).toBe("Liked");
  expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  screen.unmount();
});

test("calls onChange with the new value", () => {
  const calls = [];
  const screen = render(<LikeButton onChange={(v) => calls.push(v)} />);
  click(screen.getByRole("button"));
  click(screen.getByRole("button"));
  expect(JSON.stringify(calls)).toBe("[true,false]");
  screen.unmount();
});

test("a deliberately wrong test (to see a failure)", () => {
  const screen = render(<LikeButton />);
  click(screen.getByRole("button"));
  expect(screen.getByRole("button").textContent).toBe("Unlike");
  screen.unmount();
});

// ---------- run them and show a report ----------
const results = tests.map(({ name, fn }) => {
  try { fn(); return { name, ok: true }; } catch (e) { return { name, ok: false, error: e.message }; }
});

function Report() {
  const passed = results.filter((r) => r.ok).length;
  return (
    <div className="stack">
      <h3>{passed}/{results.length} tests passed</h3>
      {results.map((r) => (
        <div key={r.name} className="card" style={{ borderLeft: `4px solid ${r.ok ? "#22c55e" : "#ef4444"}` }}>
          {r.ok ? "✅" : "❌"} {r.name}
          {!r.ok && <div className="error"><small>{r.error}</small></div>}
        </div>
      ))}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<Report />);
```

Try it: change `"Like"` to `"♡ Like"` in the component and re-run — the tests tell you exactly what broke.

## The real thing: Vitest + React Testing Library

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

```js
// vite.config.js
export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", setupFiles: "./src/test/setup.js", globals: true },
});

// src/test/setup.js
import "@testing-library/jest-dom/vitest";   // adds matchers like toBeInTheDocument()
```

```jsx
// src/components/LikeButton.test.jsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LikeButton } from "./LikeButton";

test("toggles when clicked", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();                                   // a "spy" function that records calls
  render(<LikeButton onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "Like" }));

  expect(screen.getByRole("button", { name: "Liked" })).toHaveAttribute("aria-pressed", "true");
  expect(onChange).toHaveBeenCalledWith(true);
});
```

Run with `npx vitest` (watch mode) or `npx vitest run` (CI).

### Finding elements: query priority

| Prefer | Example | Why |
|---|---|---|
| `getByRole` | `getByRole("button", { name: "Send" })` | matches how users *and* screen readers see the page |
| `getByLabelText` | `getByLabelText("Email")` | perfect for form fields |
| `getByPlaceholderText` / `getByText` | `getByText("No results")` | for non-interactive text |
| `getByTestId` | `getByTestId("chat-list")` | last resort |

| Prefix | Not found | Waits? | Use for |
|---|---|---|---|
| `getBy…` | throws | no | things that should be there now |
| `queryBy…` | returns `null` | no | asserting something is **absent** |
| `findBy…` | rejects | **yes** (async) | things that appear after loading |

:::tip Test behaviour, not implementation
Don't test state variables or which hook you used. Test what a user can see and do. Then you can refactor freely and the tests keep passing.
:::

## Mocking an API call

```jsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AskBox } from "./AskBox";

test("shows the answer from the server", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ answer: "Paris" }), { headers: { "Content-Type": "application/json" } }),
  );
  const user = userEvent.setup();
  render(<AskBox />);

  await user.type(screen.getByLabelText("Question"), "Capital of France?");
  await user.click(screen.getByRole("button", { name: "Ask" }));

  expect(await screen.findByText("Paris")).toBeInTheDocument();      // findBy waits for it to appear
  expect(fetch).toHaveBeenCalledWith("/api/ask", expect.objectContaining({ method: "POST" }));
});

test("shows an error when the server fails", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("boom", { status: 500 }));
  // ...
  expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
});
```

For bigger apps, **MSW (Mock Service Worker)** intercepts requests at the network level, so the same mocks work in tests, Storybook and the browser.

### Mocking a streaming response

```js
function streamOf(chunks) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  }));
}
vi.spyOn(globalThis, "fetch").mockResolvedValue(streamOf(["Hel", "lo ", "world"]));
// then: expect(await screen.findByText("Hello world")).toBeInTheDocument();
```

## End-to-end tests with Playwright

```js
// e2e/chat.spec.js
import { test, expect } from "@playwright/test";

test("user can ask a question and get a streamed answer", async ({ page }) => {
  await page.route("**/api/chat", (route) => route.fulfill({ body: "Hello from the mock model" }));  // no real API costs
  await page.goto("http://localhost:5173");
  await page.getByLabel("Message").fill("Hi!");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Hello from the mock model")).toBeVisible();
});
```

:::ai
Never call a real model in unit or component tests — they'd be slow, flaky and cost money. Mock `fetch` (or MSW) with **recorded responses**, including streamed chunks, errors, refusals and tool calls. Test the **UI states**: loading, streaming, stop button, error with retry, empty answer. Keep real-model checks in a separate, occasional **eval** suite.
:::

## Check yourself

```quiz
? Which query should you prefer to find a "Send" button?
+ screen.getByRole("button", { name: "Send" })
- container.querySelector(".btn-send")
- screen.getByTestId("send")
> Role queries mirror how users and assistive tech find things.

? How do you assert an element is NOT on the page?
+ expect(screen.queryByText("Error")).toBeNull()
- expect(screen.getByText("Error")).toBeNull()
- expect(screen.findByText("Error")).toBeFalsy()
> getBy throws when nothing matches; queryBy returns null.

? Text appears after an async fetch. Which query waits for it?
+ await screen.findByText("Paris")
- screen.getByText("Paris")
- screen.queryByText("Paris")
> findBy* retries until it appears (or times out).
```

:::keypoints
- Unit-test pure logic; component-test with **Vitest + React Testing Library**; E2E-test key flows with **Playwright**.
- Find elements like a user: `getByRole`, `getByLabelText`, `getByText`; use `queryBy` for absence and `findBy` for async.
- Simulate real interaction with `userEvent`; spy with `vi.fn()`.
- Mock `fetch`/streams (or use MSW) — never call real models in tests.
:::
