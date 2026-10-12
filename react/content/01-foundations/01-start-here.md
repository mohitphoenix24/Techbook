---
title: Start Here — What React Is
level: easy
time: 12
summary: What React is, why almost every AI product's front end uses it, how the live editors on this site work, and your very first component.
---

Every chat window, dashboard and "AI copilot" panel you use is a **user interface** — and most modern ones are built with **React**. This site teaches React from zero to the newest React 19 features, with a special focus on the interfaces AI products need: streaming chat, forms for model settings, agent traces and more.

:::def React
A JavaScript library for building user interfaces out of **components** — small, reusable pieces like a button, a message bubble or a whole chat window. You describe what the UI should look like for the current data, and React updates the screen when the data changes.
:::

:::def Component
A JavaScript function that returns a piece of UI. Its name starts with a capital letter: `function ChatMessage() { … }`. Components can contain other components, like LEGO bricks.
:::

## Your first component

Press **▶ Run**. The preview appears below the code. Then change the text and watch it update — after the first run, the preview re-renders **as you type**.

```jsx run title="App.jsx" level=easy
export default function App() {
  return (
    <div>
      <h1>Hello, React! 👋</h1>
      <p>This UI was written in JSX and rendered by React 19.</p>
    </div>
  );
}
```

That HTML-looking code inside JavaScript is **JSX**. It looks like HTML, but it's turned into JavaScript that tells React what to draw.

:::tip How the live editors work
Each example defines a component called **App** (or `export default`s a component). The site compiles your code with Babel, loads React from the internet, and renders `<App />` into the preview. `console.log(...)` output appears in the **Console** panel.
:::

## Components with data

UI is a function of data. Change the data, and the UI follows:

```jsx run level=easy
const models = ["Claude Opus 5.5", "Claude Sonnet 5.5", "Claude Haiku 4.5"];

function ModelCard({ name }) {
  return <div className="card">🤖 {name}</div>;
}

export default function App() {
  return (
    <div className="stack">
      <h2>Available models</h2>
      {models.map((m) => <ModelCard key={m} name={m} />)}
    </div>
  );
}
```

Try adding a fourth model to the array. You didn't write any code to "add a card to the page" — you changed the **data**, and React figured out the UI.

:::analogy
Without React, updating a page is like repainting a mural by hand every time something changes. With React, you write the **recipe** ("for each model, draw a card"), and React keeps the mural matching the recipe — repainting only the parts that changed.
:::

## Interactivity: state

```jsx run level=easy
import { useState } from "react";

export default function App() {
  const [likes, setLikes] = useState(0);

  return (
    <div className="card">
      <p>This answer was helpful to <b>{likes}</b> people.</p>
      <button className="primary" onClick={() => setLikes(likes + 1)}>👍 Helpful</button>
    </div>
  );
}
```

:::def State
Data that a component **remembers** between renders and that can change over time — like a counter, the text in an input, or the list of chat messages. When state changes, React re-renders the component.
:::

`useState` is a **hook** — a special function that lets components remember things. You'll learn many hooks on this site.

## Why React for AI products?

| Need in an AI app | React gives you |
|---|---|
| chat messages appearing token by token | state updates re-render just the changing text |
| loading spinners, errors, retries | declarative UI for every state |
| reusable message bubbles, tool cards, citations | components |
| optimistic "message sent" before the server replies | `useOptimistic` (React 19) |
| forms for model settings and prompts | form **Actions** (React 19) |
| huge ecosystem: Next.js, UI kits, AI SDKs | one of the largest communities in software |

## The roadmap

:::flow How this site is organised
Foundations | JSX, components, state, lists, forms
Hooks | effects, refs, reducers, context, custom hooks
Modern React 19 | actions, Suspense, transitions, server components
Ecosystem | TypeScript, stores, data fetching, routing, testing
AI interfaces | streaming chat, structured output, agents
Project Lab | complete apps
:::

## Setting up React on your computer

For real projects you'll create an app with a build tool. The quickest start:

```bash
npm create vite@latest my-ai-app -- --template react-ts
cd my-ai-app
npm install
npm run dev          # open the printed http://localhost:5173 URL
```

Or start a full-stack app with **Next.js** (React's most popular framework):

```bash
npx create-next-app@latest my-ai-app
```

You'll need **Node.js** (the LTS version) installed. The Ecosystem module covers tooling in detail.

:::note What you should know first
Basic HTML and a little JavaScript help a lot. The next lesson covers exactly the modern JavaScript React uses every day — arrow functions, destructuring, spread, `map`, modules and `async/await`.
:::

## Check yourself

```quiz
? What is a React component?
+ A function that returns a piece of UI
- A CSS file
- A database table
> Components are functions; their names start with a capital letter.

? What happens when a component's state changes?
- Nothing until you reload the page
+ React re-renders the component so the screen matches the new data
- The whole browser restarts
> UI is a function of state.

? What is JSX?
+ An HTML-like syntax inside JavaScript that describes UI
- A new programming language that replaces JavaScript
- A React database
> JSX compiles to plain JavaScript function calls.
```

:::exercise Your turn
Edit the counter example so that there's also a **👎 Not helpful** button with its own count, and show both numbers.
:::

:::solution
```jsx run
import { useState } from "react";

export default function App() {
  const [up, setUp] = useState(0);
  const [down, setDown] = useState(0);
  return (
    <div className="card row">
      <button onClick={() => setUp(up + 1)}>👍 {up}</button>
      <button onClick={() => setDown(down + 1)}>👎 {down}</button>
    </div>
  );
}
```
:::

:::keypoints
- React builds UIs from **components** — functions that return JSX.
- **State** is remembered data; changing it re-renders the component.
- Describe the UI **for the current data**; React updates the screen for you.
- On this site, define `App` (or `export default` a component) and press ▶ Run — previews update as you type.
- Start real projects with **Vite** or **Next.js**.
:::
