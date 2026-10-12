---
title: Routing
level: intermediate
time: 25
summary: Multiple pages in one app. How client-side routing works, React Router's components and hooks (Routes, Link, params, navigation, nested layouts), data-mode loaders, and how Next.js file-based routing compares.
---

A real app has pages: `/chats`, `/chats/42`, `/settings`. **Routing** maps the URL to the components to show — without full page reloads, while keeping the back button, bookmarks and shareable links working.

:::def Client-side routing
Changing what's on screen when the URL changes, **without** asking the server for a new HTML page. The router listens to URL changes (links, back/forward) and renders the matching components.
:::

:::def Route
A rule pairing a URL **pattern** with UI: `path="/chats/:chatId"` → `<ChatPage />`. `:chatId` is a **URL parameter** your component can read.
:::

## How routing works (a 20-line router)

To demystify routers, here's a tiny one based on the URL hash:

```jsx run level=intermediate
import { useEffect, useState } from "react";

function useHashPath() {
  const [path, setPath] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    const onChange = () => setPath(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return path;
}

function match(pattern, path) {                       // "/chats/:id" vs "/chats/42" → { id: "42" }
  const p = pattern.split("/"), u = path.split("/");
  if (p.length !== u.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(u[i]);
    else if (p[i] !== u[i]) return null;
  }
  return params;
}

const routes = [
  { path: "/", render: () => <h3>🏠 Home</h3> },
  { path: "/chats", render: () => <h3>💬 All chats</h3> },
  { path: "/chats/:id", render: ({ id }) => <h3>💬 Chat #{id}</h3> },
];

export default function App() {
  const path = useHashPath();
  const found = routes.map((r) => ({ r, params: match(r.path, path) })).find((x) => x.params);
  return (
    <div className="stack">
      <nav className="row">
        <a href="#/">Home</a> <a href="#/chats">Chats</a> <a href="#/chats/42">Chat 42</a> <a href="#/nope">Broken link</a>
      </nav>
      <code>URL path: {path}</code>
      {found ? found.r.render(found.params) : <h3>404 — not found</h3>}
    </div>
  );
}
```

Real routers add history-API URLs (no `#`), nested layouts, data loading, code splitting and much more — but the core is exactly this: **read the URL, match a route, render**.

## React Router

React Router (v8) is the most widely used router for React apps that aren't on Next.js. Here it is running with an in-memory history (so it works inside this preview):

```jsx run level=intermediate
import { MemoryRouter, Routes, Route, Link, NavLink, Outlet, useParams, useNavigate } from "react-router";

const chats = { 1: "RAG architecture", 2: "Agent evals", 3: "Prompt library" };

function Layout() {                                   // a shared layout for nested routes
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
      <nav className="stack" style={{ width: 150 }}>
        <NavLink to="/" end>🏠 Home</NavLink>
        {Object.entries(chats).map(([id, title]) => (
          <NavLink key={id} to={`/chats/${id}`} style={({ isActive }) => ({ fontWeight: isActive ? 700 : 400 })}>💬 {title}</NavLink>
        ))}
        <NavLink to="/settings">⚙️ Settings</NavLink>
      </nav>
      <main className="card" style={{ flex: 1 }}><Outlet /></main>   {/* child route renders here */}
    </div>
  );
}

function Chat() {
  const { chatId } = useParams();                      // read the :chatId parameter
  const navigate = useNavigate();
  const title = chats[chatId];
  if (!title) return <p>Chat not found.</p>;
  return (
    <>
      <h3>{title}</h3>
      <button onClick={() => navigate("/")}>← Back home (programmatic)</button>
    </>
  );
}

export default function App() {
  return (
    <MemoryRouter initialEntries={["/chats/1"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<p>Pick a conversation. <Link to="/chats/2">Open “Agent evals”</Link></p>} />
          <Route path="chats/:chatId" element={<Chat />} />
          <Route path="settings" element={<p>Settings page</p>} />
          <Route path="*" element={<p>404</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
```

| API | Does |
|---|---|
| `<Routes>` / `<Route path element>` | declare which component renders for which URL |
| `<Link to>` / `<NavLink to>` | navigate without reloading (NavLink knows if it's active) |
| `<Outlet />` | where a parent layout renders its matched child route |
| `useParams()` | read URL parameters (`:chatId`) |
| `useNavigate()` | navigate in code (after saving, on logout…) |
| `useSearchParams()` | read/write `?query=…` parameters |

In a real browser app you use `BrowserRouter` (clean URLs like `/chats/42`) instead of `MemoryRouter`:

```jsx
import { BrowserRouter } from "react-router";
createRoot(root).render(<BrowserRouter><App /></BrowserRouter>);
```

### Data mode: loaders and actions

React Router can also load data **before** a page renders and handle form submissions per route:

```jsx
import { createBrowserRouter, useLoaderData, Form, redirect } from "react-router";
import { RouterProvider } from "react-router/dom";

const router = createBrowserRouter([
  {
    path: "/chats/:chatId",
    loader: async ({ params }) => {
      const res = await fetch(`/api/chats/${params.chatId}`);
      if (!res.ok) throw new Response("Not found", { status: 404 });
      return res.json();
    },
    action: async ({ request, params }) => {
      const form = await request.formData();
      await fetch(`/api/chats/${params.chatId}/rename`, { method: "POST", body: form });
      return redirect(`/chats/${params.chatId}`);
    },
    Component: ChatPage,
  },
]);

function ChatPage() {
  const chat = useLoaderData();                  // already loaded — no loading state in the component
  return (
    <Form method="post">
      <input name="title" defaultValue={chat.title} />
      <button>Rename</button>
    </Form>
  );
}

createRoot(root).render(<RouterProvider router={router} />);
```

## Next.js: file-based routing

In the Next.js App Router, **folders are routes**:

```text
app/
├── layout.jsx                → shared layout for every page
├── page.jsx                  → /
├── chats/
│   ├── page.jsx              → /chats
│   └── [chatId]/
│       ├── page.jsx          → /chats/42          (params.chatId = "42")
│       ├── loading.jsx       → Suspense fallback while the page loads
│       └── error.jsx         → error boundary for this route
└── settings/page.jsx         → /settings
```

```jsx
// app/chats/[chatId]/page.jsx — a Server Component
export default async function ChatPage({ params }) {
  const { chatId } = await params;
  const chat = await getChat(chatId);
  return <h1>{chat.title}</h1>;
}
```

| | React Router | Next.js App Router | TanStack Router |
|---|---|---|---|
| route definition | code (or files in framework mode) | folders/files | code or files, fully type-safe |
| data loading | loaders | Server Components | loaders |
| server rendering | framework mode | built in | with TanStack Start |
| best for | SPAs and full-stack apps | full-stack React apps | type-heavy SPAs |

:::tip Put shareable state in the URL
Filters, search queries, selected tabs and pagination belong in the URL (`?q=rag&page=2`): users can bookmark, share and use the back button. Use `useSearchParams` (React Router) or `searchParams` (Next.js).
:::

:::ai
AI apps usually route by conversation: `/c/:conversationId`. The sidebar uses `NavLink` to highlight the active chat, a "New chat" button navigates to `/c/new`, and after the first message is saved the app replaces the URL with the real id (`navigate(`/c/${id}`, { replace: true })`).
:::

## Check yourself

```quiz
? How do you read `:chatId` from `/chats/42` in React Router?
+ const { chatId } = useParams()
- props.chatId
- window.location.chatId
> URL parameters come from useParams.

? What does `<Outlet />` do?
+ Renders the matched child route inside a parent layout
- Opens a link in a new tab
- Logs the route
> Nested routes render through outlets.

? In Next.js App Router, which file defines the page for /settings?
+ app/settings/page.jsx
- pages/settings.route.js
- routes.json
> Folders define URL segments; page.jsx is the UI.
```

:::keypoints
- Routing maps URLs to components; client-side routers update the UI without reloading.
- React Router: `<Routes>/<Route>`, `<Link>/<NavLink>`, nested layouts with `<Outlet>`, `useParams`, `useNavigate`, data-mode loaders and actions.
- Next.js uses folders as routes with `page`, `layout`, `loading` and `error` files.
- Keep shareable UI state (filters, tabs, pages) in the URL.
:::
