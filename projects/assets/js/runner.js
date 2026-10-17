/* ==========================================================================
   One Runner for the whole course: Python blocks go to Pyodide (runner-python.js),
   jsx / tsx blocks go to the live React preview (runner-react.js).
   ========================================================================== */
(function () {
  "use strict";
  const py = window.PyRunner, react = window.ReactRunner;
  const pick = (lang) => (react.canRun(lang) ? react : py);
  const listeners = [];
  // forward whichever runtime reports a state (they stay quiet until their first run)
  [py, react].forEach((r) => r.onStatus((state, label) => { if (state !== "idle") listeners.forEach((f) => f(state, label)); }));

  window.Runner = {
    name: "Python & React",
    canRun: (lang) => py.canRun(lang) || react.canRun(lang),
    onStatus(fn) { listeners.push(fn); fn("idle", "Python & React: idle"); },
    warm() { /* each runtime boots on its first run, so a lesson with only JSX never downloads Python */ },
    run(ctx) { return pick(ctx.lang).run(ctx); },
    onEdit(ctx) { if (react.canRun(ctx.lang)) react.onEdit(ctx); },
    onTheme(t) { react.onTheme(t); },
    cleanup() { react.cleanup(); },
  };
})();
