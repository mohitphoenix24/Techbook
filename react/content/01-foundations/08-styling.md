---
title: Styling Components
level: easy
time: 20
summary: The main ways to style React — CSS classes, inline styles, CSS variables for theming, CSS Modules and Tailwind — and how to build variant-based components cleanly.
---

React doesn't force one styling approach. Teams use plain CSS, CSS Modules, Tailwind, or CSS-in-JS. This lesson shows the options and when to pick each — and how to make components whose look depends on props (variants, sizes, states).

## className + CSS

The most common approach: write CSS, apply classes with `className`. Here a `<style>` tag inside the component keeps the example self-contained (in a real app the CSS lives in a `.css` file you import).

```jsx run level=easy
const css = `
  .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 13px; font-weight: 600; }
  .badge-success { background: #dcfce7; color: #166534; }
  .badge-warning { background: #fef3c7; color: #92400e; }
  .badge-danger  { background: #fee2e2; color: #991b1b; }
`;

function Badge({ tone = "success", children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export default function App() {
  return (
    <>
      <style>{css}</style>
      <div className="row">
        <Badge>Deployed</Badge>
        <Badge tone="warning">Rate limited</Badge>
        <Badge tone="danger">Failed</Badge>
      </div>
    </>
  );
}
```

```jsx
// In a real project:
import "./Badge.css";        // Vite/Next bundle the CSS for you
```

## Combining classes conditionally

```jsx run level=easy
import clsx from "clsx";

const css = `
  .btn { padding: 8px 14px; border-radius: 9px; border: 1px solid var(--border); background: var(--card); color: var(--fg); }
  .btn-primary { background: var(--accent); color: white; border-color: transparent; }
  .btn-sm { padding: 4px 9px; font-size: 13px; }
  .btn-loading { opacity: .7; cursor: progress; }
`;

function Button({ variant = "default", size = "md", loading = false, children, ...rest }) {
  const className = clsx("btn", {
    "btn-primary": variant === "primary",
    "btn-sm": size === "sm",
    "btn-loading": loading,
  });
  return <button className={className} disabled={loading} {...rest}>{loading ? "⏳ " : ""}{children}</button>;
}

export default function App() {
  return (
    <>
      <style>{css}</style>
      <div className="row">
        <Button>Default</Button>
        <Button variant="primary">Primary</Button>
        <Button size="sm">Small</Button>
        <Button variant="primary" loading>Sending</Button>
      </div>
    </>
  );
}
```

:::def clsx
A tiny utility that builds a `className` string from strings, arrays and `{ className: condition }` objects, skipping falsy values. Extremely common in React codebases (often wrapped as `cn()`).
:::

## Inline styles

`style` takes an object with **camelCase** properties. Numbers get `px` automatically. Great for dynamic values (widths, colours from data), awkward for hover states and media queries.

```jsx run level=easy
import { useState } from "react";

export default function App() {
  const [progress, setProgress] = useState(35);
  return (
    <div className="stack" style={{ maxWidth: 360 }}>
      <div style={{ height: 12, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${progress}%`, height: "100%", background: `hsl(${progress * 1.2}, 70%, 50%)`, transition: "width .3s" }} />
      </div>
      <input type="range" value={progress} onChange={(e) => setProgress(Number(e.target.value))} />
      <span>Embedding documents… {progress}%</span>
    </div>
  );
}
```

## Theming with CSS variables

:::def CSS custom properties (variables)
Values defined once (`--accent: #22d3ee`) and used everywhere (`color: var(--accent)`). Change them on a parent element and every child updates — perfect for light/dark themes. (This site's previews already define `--accent`, `--card`, `--border`…)
:::

```jsx run level=intermediate
import { useState } from "react";

const themes = {
  ocean: { "--brand": "#0ea5e9", "--brand-soft": "#e0f2fe" },
  grape: { "--brand": "#8b5cf6", "--brand-soft": "#ede9fe" },
  lime:  { "--brand": "#65a30d", "--brand-soft": "#ecfccb" },
};

export default function App() {
  const [theme, setTheme] = useState("ocean");
  return (
    <div style={{ ...themes[theme], display: "grid", gap: 10, maxWidth: 360 }}>
      <div className="row">
        {Object.keys(themes).map((t) => <button key={t} onClick={() => setTheme(t)}>{t}</button>)}
      </div>
      <div style={{ background: "var(--brand-soft)", color: "#111", borderLeft: "4px solid var(--brand)", padding: 12, borderRadius: 10 }}>
        <b style={{ color: "var(--brand)" }}>Assistant</b>
        <p style={{ margin: "4px 0 0" }}>Every colour here comes from two CSS variables.</p>
      </div>
    </div>
  );
}
```

## CSS Modules

:::def CSS Modules
CSS files named `*.module.css` whose class names are automatically made **unique per component**, so `.title` in one component can't clash with `.title` in another. Supported out of the box by Vite and Next.js.
:::

```css
/* MessageBubble.module.css */
.bubble { padding: 10px 14px; border-radius: 14px; }
.mine { background: var(--accent); color: white; }
```

```jsx
import styles from "./MessageBubble.module.css";

export function MessageBubble({ text, mine }) {
  return <div className={`${styles.bubble} ${mine ? styles.mine : ""}`}>{text}</div>;
}
```

## Tailwind CSS

:::def Tailwind CSS
A utility-first CSS framework: instead of writing CSS, you compose small classes like `px-4 py-2 rounded-lg bg-cyan-500 text-white`. Very popular in React projects and AI app templates; component libraries like **shadcn/ui** build on it.
:::

```jsx
export function SendButton({ disabled }) {
  return (
    <button
      disabled={disabled}
      className="rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-white shadow-sm
                 hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50
                 dark:bg-cyan-400 dark:text-slate-900"
    >
      Send
    </button>
  );
}
```

```bash
# in a Vite project
npm install tailwindcss @tailwindcss/vite
# add the plugin to vite.config and `@import "tailwindcss";` to your CSS
```

## Which approach?

| Approach | Strengths | Watch out for |
|---|---|---|
| Plain CSS + `className` | simple, no tooling | global name clashes in big apps |
| CSS Modules | scoped names, plain CSS | one file per component |
| Tailwind | fast to build, consistent design system | long class lists (extract components) |
| Inline `style` | dynamic values | no hover/media queries, verbose |
| Component libraries (shadcn/ui, MUI, Chakra, Mantine) | accessible ready-made parts | learning their APIs, bundle size |

:::tip Accessibility in styling
Keep visible focus outlines (`:focus-visible`), ensure text contrast in both themes, and don't rely on colour alone to show state (add an icon or text, like "⚠ Failed").
:::

## Check yourself

```quiz
? How do you write `background-color` in a React style object?
+ backgroundColor
- background-color
- BackgroundColor
> Inline style keys are camelCase.

? What problem do CSS Modules solve?
+ Class name clashes between components
- Slow rendering
- Missing fonts
> Class names become unique per file.

? What is the best way to switch light/dark colours across many components?
+ CSS variables changed on a parent element
- Passing a color prop to every component
- Reloading the page with a different stylesheet
> Children inherit custom properties.
```

:::keypoints
- Use `className` with CSS files for most styling; combine classes with `clsx`.
- Inline `style={{ … }}` is best for truly dynamic values.
- CSS variables make theming easy; CSS Modules scope class names; Tailwind composes utilities.
- Build components with **variant/size props** that map to classes.
:::
