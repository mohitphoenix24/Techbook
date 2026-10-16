/* ==========================================================================
   DSA Sheets — the Lab: the interactive workbench of a lesson.

   Layers (all driven by ONE frame, so they can never disagree):
     ALGORITHM STATE  the variables      DATA STRUCTURE  the animated stage
     OPERATION        op + action + why  NEXT            what happens after this step
     CODE             C++ / JS, the line of this step is highlighted
   Two different things are kept apart and labelled:
     • PROGRAM OUTPUT   real execution of the code in the editor (JS in a Worker, C++ with GCC)
     • EDUCATIONAL TRACE the reference algorithm's steps for the same input (never claimed to be
                         a trace of your edited code)
   ========================================================================== */
(function () {
  "use strict";
  const SX = window.SHEETS;
  const MAX_FRAMES = 1500;
  const TAB_KEY = "techcontent:codetab";

  /* ------------------------------------------------------------ JS execution (Web Worker) */
  function runJS(src, ms) {
    return new Promise((resolve) => {
      const boot = `const __logs = [];
console.log = (...a) => { __logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")); };
onmessage = (e) => { try { const r = (0, eval)(e.data); postMessage({ ok: true, out: r, logs: __logs }); }
  catch (err) { postMessage({ ok: false, name: err && err.name, err: String((err && err.message) || err), stack: String((err && err.stack) || ""), logs: __logs }); } };`;
      let w, url, done = false;
      const finish = (v) => { if (done) return; done = true; clearTimeout(t); try { w && w.terminate(); } catch { /* ignore */ } try { url && URL.revokeObjectURL(url); } catch { /* ignore */ } resolve(v); };
      const t = setTimeout(() => finish({ timeout: true }), ms || 5000);
      try {
        url = URL.createObjectURL(new Blob([boot], { type: "text/javascript" }));
        w = new Worker(url);
        w.onmessage = (e) => finish(e.data);
        w.onerror = (e) => finish({ ok: false, name: "Error", err: e.message || "The worker crashed", logs: [] });
        w.postMessage(src);
      } catch (e) { finish({ ok: false, name: "Error", err: "Could not start a Web Worker here: " + e.message, logs: [] }); }
    });
  }
  SX.runJS = runJS;

  const LEG_DEFAULT = [["cur", "current"], ["cmp", "comparing"], ["ok", "accepted"], ["bad", "rejected"], ["hit", "found"]];

  class Lab {
    constructor(A, p, host, opts = {}) {
      this.A = A; this.p = p; this.host = host; this.opts = opts;
      this.lang = this._pref();
      this.speed = 1;
      this.i = 0; this.frames = []; this.playing = false; this.timer = 0;
      this.overlays = A.store.get("sh:overlays", true);
      this.docs = {};
      this.cur = { kind: "normal", idx: 0 };
      this.build();
      this.select("normal", 0, true);
    }

    _pref() {
      let v = null;
      try { v = localStorage.getItem(TAB_KEY); } catch { /* ignore */ }
      return v === "js" || v === "javascript" ? "js" : "cpp";
    }

    /* Wide screens: the explanation sits above the code (right column) and the left column holds the variables, stage and
       controls. Narrow screens have one column, so the "operation" text moves into the pinned panel under the controls. */
    placeExplain() {
      const left = this.host.querySelector(".lab-left"), right = this.host.querySelector(".lab-right");
      const op = this.host.querySelector(".l-op"), why = this.el.why, next = this.host.querySelector(".l-next");
      if (!left || !right || !op) return;
      const narrow = this.mq.matches;
      if (narrow && op.parentNode !== left) { left.appendChild(op); left.appendChild(why); }
      else if (!narrow && op.parentNode !== right) { right.prepend(next); right.prepend(why); right.prepend(op); }
    }

    /* bring the pinned panel (variables, stage, controls) fully into the window */
    reveal() {
      const left = this.host.querySelector(".lab-left"); if (!left) return;
      const top = parseFloat(getComputedStyle(left).top) || 0, r = left.getBoundingClientRect(), vh = window.innerHeight;
      let d = 0;
      if (r.top < top - 2) d = r.top - top;
      else if (r.bottom > vh - 4) d = Math.min(r.bottom - vh + 10, r.top - top);
      if (Math.abs(d) > 2) window.scrollBy({ top: d, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }

    /* the tallest the stage may be so that it, the variables and the player controls all fit in the window together */
    stageMax() {
      const left = this.host.querySelector(".lab-left"), vp = this.el && this.el.sxHost && this.el.sxHost.querySelector(".sx-viewport");
      const vh = window.innerHeight || 800;
      if (!left || !vp) return Math.min(560, vh * 0.55);
      const chrome = left.offsetHeight - vp.offsetHeight;                       // everything in the sticky panel except the stage itself
      const top = parseFloat(getComputedStyle(left).top) || 0;
      const room = vh - top - chrome - 14;
      return Math.max(150, Math.min(620, room));
    }

    destroy() {
      window.removeEventListener("resize", this._onResize);
      clearTimeout(this.timer);
      this.stage && this.stage.destroy();
      this.host.removeEventListener("keydown", this._key);
    }

    /* ---------------------------------------------------------------- markup */
    build() {
      const { A, p } = this;
      const groups = [["normal", "Normal"], ["edge", "Edge cases"], ["corner", "Corner cases"]];
      const tests = p.tests;
      this.host.innerHTML = `
      <div class="lab" tabindex="-1">
        <div class="lab-cases" role="tablist" aria-label="Test cases">
          ${groups.map(([k, t]) => { const ts = tests.map((x, i) => [x, i]).filter(([x]) => x.kind === k); return ts.length ? `<div class="lab-group"><span class="lab-gl">${t}</span>${ts.map(([x, i]) => `<button class="case-chip" role="tab" data-kind="${k}" data-i="${i}" title="${A.esc(x.name)}">${A.esc(x.name)}</button>`).join("")}</div>` : ""; }).join("")}
          <div class="lab-group"><span class="lab-gl">Yours</span><button class="case-chip custom" role="tab" data-kind="custom" data-i="0">${A.icon("wand")} Custom</button></div>
        </div>
        <div class="lab-edu" hidden></div>
        <form class="lab-input" autocomplete="off"></form>
        <div class="lab-grid">
          <div class="lab-left">
            <div class="layer l-vars"><div class="l-head"><span>Algorithm state</span><small>the variables, right now</small></div><div class="chips" aria-live="polite"></div></div>
            <div class="layer l-ds">
              <div class="l-head"><span>Data structure</span><small class="trace-badge" title="Steps come from the reference algorithm run on this input. They are not a trace of edited code.">${A.icon("eye")} educational trace of the reference algorithm</small></div>
              <div class="sx-wrap"><div class="sx-host"></div></div>
              <div class="legend"></div>
            </div>
            <div class="timeline" role="group" aria-label="Execution timeline">
              <div class="tl-btns">
                <button class="tb" data-a="first" title="Reset to step 1 (Home)" aria-label="Reset">${A.icon("reset")}</button>
                <button class="tb" data-a="prev" title="Previous step (←)" aria-label="Previous step">${A.icon("stepback")}</button>
                <button class="tb play" data-a="play" title="Play / pause (Space)" aria-label="Play">${A.icon("play")}</button>
                <button class="tb" data-a="next" title="Next step (→)" aria-label="Next step">${A.icon("stepfwd")}</button>
                <button class="tb" data-a="last" title="Jump to the end (End)" aria-label="Last step">${A.icon("skipfwd")}</button>
                <span class="tl-step" aria-live="off">Step <b>1</b> / 1</span>
                <label class="tl-speed">Speed <select aria-label="Speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
                <label class="tl-ov" title="Show the “why” card at decisions"><input type="checkbox" ${this.overlays ? "checked" : ""}> why cards</label>
                <span class="tl-ops" title="Basic steps performed so far"></span>
              </div>
              <div class="tl-track"><input type="range" min="0" max="0" value="0" aria-label="Step"><div class="tl-ticks"></div></div>
              <div class="tl-phases"></div>
            </div>
          </div>
          <div class="lab-right">
            <div class="layer l-op"><div class="l-head"><span>Operation</span><small class="phase"></small></div>
              <div class="op-line"><code class="op"></code><span class="act"></span></div><p class="say"></p></div>
            <div class="why-card" hidden></div>
            <div class="layer l-next"><div class="l-head"><span>Next state</span></div><p class="next"></p></div>
            <div class="code-card runnable sh-code">
              <div class="code-head"><span class="dots"><i></i><i></i><i></i></span>
                <div class="lang-tabs" role="tablist"><button data-l="cpp" role="tab">C++</button><button data-l="js" role="tab">JavaScript</button></div>
                <span class="badge-edited">• edited</span>
                <div class="code-actions">
                  <button class="btn ghost act-copy" title="Copy code">${A.icon("copy")}<span class="lbl-sm">Copy</span></button>
                  <button class="btn ghost act-reset" title="Reset to the official solution">${A.icon("reset")}<span class="lbl-sm">Reset</span></button>
                  <button class="btn btn-run act-run" title="Run on the input above (Ctrl+Enter)">${A.icon("play")}<span>Run</span></button>
                </div>
              </div>
              <div class="code-body"></div>
              <div class="code-hint"><span class="sync-note">▸ the highlighted line is the step you are on</span><span><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to run</span></div>
            </div>
            <div class="run-out" hidden></div>
            <details class="harness"><summary>${A.icon("code")} What “Run” executes (the test harness around your code)</summary><div class="harness-body"></div></details>
          </div>
        </div>
      </div>`;
      const $ = (s) => A.$(s, this.host);
      this.el = { chips: $(".l-vars .chips"), sxHost: $(".sx-host"), why: $(".why-card"), legend: $(".legend"), op: $(".op"), act: $(".act"), say: $(".say"), next: $(".next"), phase: $(".phase"),
        step: $(".tl-step"), range: $(".tl-track input"), ticks: $(".tl-ticks"), phases: $(".tl-phases"), ops: $(".tl-ops"), play: $(".tb.play"), form: $(".lab-input"), edu: $(".lab-edu"),
        codeBody: $(".sh-code .code-body"), card: $(".sh-code"), out: $(".run-out"), runBtn: $(".act-run"), badge: $(".sh-code .badge-edited"), syncNote: $(".sync-note"), lab: $(".lab"), harness: $(".harness-body") };

      this.stage = new SX.Stage(this.el.sxHost, { minH: 170, maxH: () => this.stageMax() });
      this.mq = window.matchMedia("(max-width: 1180px)");
      this.placeExplain();
      this._onResize = () => { this.placeExplain(); this.stage && this.stage._layout && this.stage._layout(); };
      window.addEventListener("resize", this._onResize);

      // code editor: one document per language so edits and undo survive switching tabs
      const modes = { cpp: "text/x-c++src", js: "javascript" };
      this.cm = CodeMirror(this.el.codeBody, { value: "", mode: modes[this.lang], theme: "pg", lineNumbers: true, indentUnit: 4, tabSize: 4, viewportMargin: Infinity, matchBrackets: true, autoCloseBrackets: true,
        extraKeys: { "Ctrl-Enter": () => this.run(), "Cmd-Enter": () => this.run(), "Ctrl-/": "toggleComment", Tab: (c) => (c.somethingSelected() ? c.indentSelection("add") : c.replaceSelection("    ", "end")), "Shift-Tab": (c) => c.indentSelection("subtract") } });
      for (const l of ["cpp", "js"]) this.docs[l] = CodeMirror.Doc(p.code[l], modes[l]);
      this.cm.swapDoc(this.docs[this.lang]);
      this.cm.on("change", () => { this.markEdited(); this.clearDiags(); });
      this.setLang(this.lang, true);

      // events
      this.el.card.querySelector(".lang-tabs").onclick = (e) => { const b = e.target.closest("[data-l]"); if (b) this.setLang(b.dataset.l); };
      A.$(".act-copy", this.el.card).onclick = () => A.copyText(this.cm.getValue());
      A.$(".act-reset", this.el.card).onclick = () => { this.docs[this.lang].setValue(p.code[this.lang]); this.markEdited(); this.clearDiags(); this.highlight(); };
      this.el.runBtn.onclick = () => this.run();
      A.$(".lab-cases", this.host).onclick = (e) => { const b = e.target.closest(".case-chip"); if (b) { this.select(b.dataset.kind, +b.dataset.i); this.reveal(); } };
      A.$(".timeline .tl-btns", this.host).onclick = (e) => {
        const b = e.target.closest("[data-a]"); if (!b) return;
        const a = b.dataset.a;
        this.reveal();
        if (a === "play") this.playing ? this.pause() : this.play();
        else { this.pause(); this.go(a === "first" ? 0 : a === "last" ? this.frames.length - 1 : this.i + (a === "next" ? 1 : -1)); }
      };
      this.el.range.oninput = () => { this.pause(); this.go(+this.el.range.value); };
      A.$(".tl-speed select", this.host).onchange = (e) => { this.speed = +e.target.value; };
      A.$(".tl-ov input", this.host).onchange = (e) => { this.overlays = e.target.checked; A.store.set("sh:overlays", this.overlays); this.showWhy(this.frames[this.i]); };
      this.el.why.onclick = (e) => { if (e.target.closest(".why-x")) { this.el.why.hidden = true; this.whyClosed = this.i; } };
      this.el.form.onsubmit = (e) => { e.preventDefault(); this.fromFields(true); };
      this._key = (e) => {
        if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== "range" && e.target.type !== "checkbox") return;
        if (e.target.closest(".CodeMirror")) return;
        const k = e.key;
        if (k === "ArrowRight") { e.preventDefault(); this.pause(); this.go(this.i + 1); }
        else if (k === "ArrowLeft") { e.preventDefault(); this.pause(); this.go(this.i - 1); }
        else if (k === " " && e.target.type !== "checkbox") { e.preventDefault(); this.playing ? this.pause() : this.play(); }
        else if (k === "Home") { e.preventDefault(); this.pause(); this.go(0); }
        else if (k === "End") { e.preventDefault(); this.pause(); this.go(this.frames.length - 1); }
      };
      this.host.addEventListener("keydown", this._key);
      this.renderHarness();
    }

    /* ---------------------------------------------------------------- language, editor */
    setLang(l, silent) {
      this.lang = l;
      try { localStorage.setItem(TAB_KEY, l); } catch { /* ignore */ }
      this.cm.swapDoc(this.docs[l]);
      this.A.$$(".lang-tabs button", this.el.card).forEach((b) => { const on = b.dataset.l === l; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
      setTimeout(() => this.cm.refresh(), 0);
      this.markEdited();
      this.highlight();
      this.renderHarness();
      this.el.out.hidden = true;
    }

    isEdited() { return this.cm.getValue() !== this.p.code[this.lang]; }
    markEdited() {
      const ed = this.isEdited();
      this.el.card.classList.toggle("edited", ed);
      this.el.syncNote.textContent = ed ? "▸ code edited: line highlighting follows the official solution, so it is paused" : "▸ the highlighted line is the step you are on";
      this.highlight();
    }

    highlight() {
      if (this._hl != null) { this.cm.removeLineClass(this._hl, "background", "sx-line-on"); this.cm.removeLineClass(this._hl, "wrap", "sx-line-wrap"); this._hl = null; }
      const f = this.frames[this.i];
      if (!f || this.isEdited()) return;
      const line = this.p.lines[this.lang][f.tag];
      if (!line) return;
      this._hl = line - 1;
      this.cm.addLineClass(this._hl, "background", "sx-line-on");
      const info = this.cm.getScrollInfo(), top = this.cm.heightAtLine(this._hl, "local");
      if (top < info.top + 20 || top > info.top + info.clientHeight - 50) this.cm.scrollTo(null, Math.max(0, top - info.clientHeight / 2));
    }

    renderHarness() {
      const { p } = this;
      let text;
      try {
        if (this.lang === "cpp") { const h = SX.cppHarness(p); text = h.prelude.trim() + "\n\n/* ----- your solution is inserted here ----- */\n" + h.main.trim(); }
        else text = SX.jsRunner(p, "/* ----- your solution is inserted here ----- */", "[/* the input values, as JSON */]").trim();
      } catch (e) { text = "(harness unavailable: " + e.message + ")"; }
      this.el.harness.innerHTML = `<p>Your code is the part you can edit. Around it, the harness reads the input values, calls <code>${this.A.esc(p.io.design ? "your class" : p.io.fn)}</code>, and prints the answer in a fixed format, so C++ and JavaScript print identical text.</p><pre class="static"><code>${this.A.highlight(text, this.lang === "cpp" ? "cpp" : "js")}</code></pre>`;
    }

    /* ---------------------------------------------------------------- test cases & input */
    select(kind, idx, first) {
      const { p, A } = this;
      this.pause();
      this.cur = { kind, idx };
      A.$$(".case-chip", this.host).forEach((b) => b.classList.toggle("on", b.dataset.kind === kind && +b.dataset.i === idx));
      let input, why = null;
      if (kind === "custom") {
        const saved = A.store.get("sh:custom:" + p.id, null);
        input = saved ? this._tryInput(saved) : null;
        if (!input) input = SX.clone(p.tests[0].input);
        this._texts = SX.textFromInput(p, input);
      } else {
        const t = p.tests[idx];
        input = SX.clone(t.input);
        why = t;
        this._texts = SX.textFromInput(p, input);
      }
      this.input = input;
      this.renderFields(kind === "custom");
      this.renderEdu(kind === "custom" ? null : why);
      this.stage.snapNext();
      this.buildTrace();
      this.el.out.hidden = true;
      this.showVerified();
    }

    _tryInput(texts) { try { return SX.inputFromText(this.p, texts); } catch { return null; } }

    renderFields(editable) {
      const { p, A } = this;
      this.el.form.innerHTML = (p.io.params || []).map(([n, t]) => `<label class="in-f"><span>${A.esc(p.io.labels && p.io.labels[n] || n)} <small>${A.esc(t)}</small></span><input name="${A.esc(n)}" value="${A.esc(this._texts[n])}" spellcheck="false" aria-label="${A.esc(n)}" title="${A.esc(SX.TYPE_HINT[t] || "")}"></label>`).join("")
        + `<button class="btn primary in-go" type="submit">${A.icon("eye")} Visualize</button><div class="in-err" role="alert" hidden></div>`;
      A.$$("input", this.el.form).forEach((inp) => inp.addEventListener("input", () => {
        // editing a ready-made case turns it into your own case
        if (this.cur.kind !== "custom") { this.cur = { kind: "custom", idx: 0 }; A.$$(".case-chip", this.host).forEach((b) => b.classList.toggle("on", b.dataset.kind === "custom")); this.renderEdu(null); }
      }));
    }

    renderEdu(t) {
      const e = this.el.edu;
      if (!t || (t.kind === "normal" && !t.why)) { e.hidden = true; return; }
      const label = t.kind === "edge" ? "Edge case" : t.kind === "corner" ? "Corner case" : "Test case";
      e.hidden = false;
      e.innerHTML = `<div class="edu-k">${this.A.icon("alert")} ${label}: ${this.A.esc(t.name)}</div>${t.why ? `<div class="edu-b"><b>Why it matters.</b> ${this.A.mdInline(t.why)}</div>` : ""}`;
    }

    fromFields(visualize) {
      const { p, A } = this;
      const texts = {};
      A.$$("input", this.el.form).forEach((i) => (texts[i.name] = i.value));
      const err = this.el.form.querySelector(".in-err");
      try {
        const input = SX.inputFromText(p, texts);
        if (p.check) { const m = p.check(input); if (m) throw new Error(m); }
        err.hidden = true;
        this.input = input; this._texts = texts;
        if (this.cur.kind === "custom") A.store.set("sh:custom:" + p.id, texts);
        this.pause(); this.stage.snapNext(); this.buildTrace();
        this.el.out.hidden = true;
        return true;
      } catch (e) {
        err.hidden = false; err.textContent = "⚠ " + e.message;
        return false;
      }
    }

    /* ---------------------------------------------------------------- the trace */
    buildTrace() {
      const { p, A } = this;
      let tr;
      this.error = null;
      try {
        tr = SX.trace(p, this.input);
        if (tr.frames.length > MAX_FRAMES) throw new Error(`This input needs ${tr.frames.length} animation steps (more than ${MAX_FRAMES}). Use a smaller input to watch it step by step. You can still Run the code on it.`);
        if (!tr.frames.length) throw new Error("The reference algorithm produced no steps for this input.");
      } catch (e) {
        this.error = e.message; this.frames = []; this.expected = null;
        this.el.chips.innerHTML = "";
        this.el.say.textContent = ""; this.el.op.textContent = ""; this.el.act.textContent = ""; this.el.next.textContent = "";
        this.stage.begin(); this.stage.label("err", { x: 200, y: 60, text: "No visualization for this input", cls: "bad" }); this.stage.end();
        this.el.say.innerHTML = `<span class="bad-t">${A.esc(e.message)}</span>`;
        this.el.range.max = 0; this.el.step.innerHTML = "No steps";
        console.error(e);
        return;
      }
      this.frames = tr.frames; this.result = tr.result; this.ops = tr.ops;
      this.expected = tr.hasResult ? SX.fmt(tr.result, p.io.ret) : null;
      this.el.range.max = this.frames.length - 1;
      this.drawTicks();
      this.i = 0;
      this.go(0, true);
    }

    drawTicks() {
      const n = this.frames.length, A = this.A;
      this.el.ticks.innerHTML = n <= 90 ? this.frames.map((f, i) => `<button class="tk" data-i="${i}" title="Step ${i + 1}: ${A.esc(f.act || f.say.slice(0, 50))}" aria-label="Step ${i + 1}"></button>`).join("") : "";
      this.el.ticks.onclick = (e) => { const b = e.target.closest(".tk"); if (b) { this.pause(); this.go(+b.dataset.i); } };
      // phases (stages of a multi-stage algorithm) as clickable segments
      const segs = [];
      this.frames.forEach((f, i) => { const ph = f.phase || ""; if (!segs.length || segs[segs.length - 1].ph !== ph) segs.push({ ph, from: i, to: i }); else segs[segs.length - 1].to = i; });
      this.el.phases.innerHTML = segs.length > 1 || (segs[0] && segs[0].ph) ? segs.map((s, k) => `<button class="ph" data-i="${s.from}" style="flex:${s.to - s.from + 1}" title="${A.esc(s.ph)}"><i>${k + 1}</i> ${A.esc(s.ph || "")}</button>`).join("") : "";
      this.el.phases.onclick = (e) => { const b = e.target.closest(".ph"); if (b) { this.pause(); this.go(+b.dataset.i); } };
      this.segs = segs;
    }

    /* ---------------------------------------------------------------- stepping */
    go(i, instant) {
      if (!this.frames.length) return;
      i = Math.max(0, Math.min(this.frames.length - 1, i));
      const prev = this.frames[this.i] && this.i !== i ? this.frames[this.i] : this.frames[i - 1] || null;
      this.i = i;
      const f = this.frames[i], { A, el } = this;
      // 1. variables
      const pv = (prev && prev.vars) || {};
      el.chips.innerHTML = Object.keys(f.vars).length ? Object.entries(f.vars).map(([k, v]) => {
        const s = fmtVar(v), changed = prev && k in pv && fmtVar(pv[k]) !== s, isNew = prev && !(k in pv);
        return `<span class="vchip ${changed || isNew ? "chg" : ""}" title="${changed ? A.esc(k + ": " + fmtVar(pv[k]) + " → " + s) : ""}"><b>${A.esc(k)}</b><i>${A.esc(s)}</i>${changed ? `<em>was ${A.esc(fmtVar(pv[k]))}</em>` : ""}</span>`;
      }).join("") : `<span class="vchip none">no variables yet</span>`;
      // 2. data structure
      this.renderStage(f, prev);
      // 3. operation + reasoning
      el.op.innerHTML = f.op ? A.esc(f.op) : `<span class="muted">—</span>`;
      el.act.textContent = f.act || ""; el.act.hidden = !f.act;
      el.act.className = "act a-" + (f.act || "").toLowerCase().replace(/[^a-z]+/g, "-");
      el.say.innerHTML = A.mdInline(f.say || "");
      el.phase.textContent = f.phase || "";
      const nx = this.frames[i + 1];
      el.next.innerHTML = nx ? `${nx.act ? `<span class="act a-next">${A.esc(nx.act)}</span>` : ""}${A.mdInline(nx.say || "")}` : `<b>End of the trace.</b> ${this.expected != null ? "The reference algorithm answers <code>" + A.esc(this.expected) + "</code>." : ""}`;
      this.showWhy(f);
      // 4. timeline
      el.range.value = i;
      el.step.innerHTML = `Step <b>${i + 1}</b> / ${this.frames.length}`;
      el.ops.textContent = `${f.work} basic steps so far`;
      A.$$(".tk", el.ticks).forEach((b, k) => { b.classList.toggle("on", k === i); b.classList.toggle("past", k < i); });
      A.$$(".ph", el.phases).forEach((b) => { const s = this.segs.find((x) => x.from === +b.dataset.i); b.classList.toggle("on", s && i >= s.from && i <= s.to); });
      // 5. code
      this.highlight();
    }

    renderStage(f, prev) {
      const { p, A } = this, S = this.stage;
      const viz = SX.viz[p.viz];
      S.begin();
      try {
        if (!viz) throw new Error(`No visualizer named “${p.viz}”`);
        if (!f.state || typeof f.state !== "object") throw new Error("This step has no visualization state");
        viz.render(S, f.state, { frame: f, prev, problem: p });
        this.el.legend.innerHTML = (f.state.legend || p.legend || viz.legend || LEG_DEFAULT).map(([c, t]) => `<span class="lg"><i class="sw ${c}"></i>${A.esc(t)}</span>`).join("");
        this.el.sxHost.classList.remove("viz-error");
      } catch (e) {
        S.label("err", { x: 20, y: 40, text: "Visualization error: " + e.message, anchor: "l", cls: "bad" });
        this.el.sxHost.classList.add("viz-error");
        console.error("[sheets] visualizer error in", p.id, "step", this.i, e);
      }
      S.end();
    }

    showWhy(f) {
      const w = this.el.why, A = this.A;
      if (!f || !f.why || !this.overlays || this.whyClosed === this.i) { w.hidden = true; return; }
      if (this.whyClosed !== undefined && this.whyClosed !== this.i) this.whyClosed = undefined;
      w.hidden = false;
      w.innerHTML = `<button class="why-x" aria-label="Close">✕</button><div class="why-k">${A.icon("bulb")} ${A.esc(f.why.title)}</div><div class="why-b">${A.mdInline(f.why.text)}</div>`;
    }

    play() {
      if (this.i >= this.frames.length - 1) this.go(0);
      this.playing = true;
      this.el.play.innerHTML = this.A.icon("pause"); this.el.play.setAttribute("aria-label", "Pause");
      const tick = () => {
        if (!this.playing) return;
        if (this.i >= this.frames.length - 1) { this.pause(); return; }
        this.go(this.i + 1);
        const f = this.frames[this.i];
        this.timer = setTimeout(tick, (f && f.why ? 1900 : 1200) / this.speed);
      };
      this.timer = setTimeout(tick, 350 / this.speed);
    }
    pause() {
      this.playing = false; clearTimeout(this.timer);
      if (this.el && this.el.play) { this.el.play.innerHTML = this.A.icon("play"); this.el.play.setAttribute("aria-label", "Play"); }
    }

    /* ---------------------------------------------------------------- running the code for real */
    clearDiags() { (this._marks || []).forEach((m) => m.clear()); this._marks = []; }

    showVerified() { /* verified output for the shipped solution on a shipped case is shown by run() on demand */ }

    async run() {
      const { p, A, el } = this;
      if (el.runBtn.disabled) return;
      if (!this.fromFields(false)) { A.toast("Fix the input first"); return; }
      el.runBtn.disabled = true; el.runBtn.classList.add("running");
      el.runBtn.innerHTML = `${A.icon("loader")}<span>Running</span>`;
      const o = el.out;
      o.hidden = false;
      o.innerHTML = `<div class="ro-head">${A.icon("terminal")} Program output <span class="ro-status">running…</span></div>`;
      let res;
      try { res = this.lang === "js" ? await this.execJS() : await this.execCpp(); }
      catch (e) { res = { status: "err", text: String(e.message || e), badge: "Failed" }; }
      el.runBtn.disabled = false; el.runBtn.classList.remove("running");
      el.runBtn.innerHTML = `${A.icon("play")}<span>Run</span>`;
      this.showResult(res);
    }

    async execJS() {
      const { p } = this;
      const t0 = performance.now();
      const src = SX.jsRunner(p, this.cm.getValue(), SX.argsOf(p, this.input));
      const r = await runJS(src, 5000);
      const ms = Math.round(performance.now() - t0);
      if (r.timeout) return { status: "err", text: "Time limit exceeded (5 s). Look for a loop that never ends, or an algorithm that is far too slow for this input.", badge: "Time limit exceeded", logs: [] };
      if (!r.ok) return { status: "err", text: `${r.name || "Error"}: ${r.err}`, badge: r.name === "SyntaxError" ? "Syntax error" : "Runtime error", logs: r.logs, hint: jsHint(r) };
      return { status: "ok", out: String(r.out), badge: `ran in your browser (Web Worker) in ${ms} ms`, logs: r.logs };
    }

    async execCpp() {
      const { p, A } = this;
      const code = this.cm.getValue(), prog = SX.cppProgram(p, code), stdin = SX.stdinOf(p, this.input);
      this.clearDiags();
      const key = SX.fnv(prog + "\u0000" + stdin);
      const v = SX.verified && SX.verified[key];
      if (v) { await new Promise((r) => setTimeout(r, 140)); return { status: "ok", out: v.o.trim(), badge: "verified output: this exact program was compiled with g++ -std=c++20 when the course was built", verified: true }; }
      const R = A.Runner;
      let res;
      try { res = await R.compile(prog, stdin); }
      catch { return { status: "err", text: "Could not reach the online compiler (godbolt.org / wandbox.org). Unchanged solutions on the ready-made cases still work offline. To run your edited code you need a connection, or compile locally with g++ -std=c++20.", badge: "Offline" }; }
      const lines = (res.compilerText || "").split("\n").map((l) => l.match(/^main\.cpp:(\d+):(\d+):\s*(error|warning):\s*(.*)$/)).filter(Boolean).map((m) => ({ line: +m[1], col: +m[2], sev: m[3], msg: m[4] }));
      this.markDiags(lines);
      if (!res.compiled) return { status: "err", text: (res.compilerText || "").trim(), badge: `Compile error${lines.length ? ` (${lines.filter((x) => x.sev === "error").length})` : ""}`, hint: R.helpFor(res), diags: lines };
      if (res.timedOut || (res.exit !== 0 && res.exit != null)) return { status: "err", text: ((res.stdout || "") + (res.stderr || "")).trim() || "(no output)", badge: res.timedOut ? "Time limit exceeded" : R.exitText(res.exit), hint: R.helpFor(res) };
      return { status: "ok", out: (res.stdout || "").trim(), badge: `compiled and ran live · ${res.via} · ${(res.ms / 1000).toFixed(1)} s`, stderr: (res.stderr || "").trim() };
    }

    markDiags(diags) {
      this.clearDiags();
      if (this.lang !== "cpp") return;
      for (const d of diags.slice(0, 30)) {
        const ln = Math.max(0, d.line - 1);
        if (ln >= this.cm.lineCount()) continue;
        const text = this.cm.getLine(ln);
        const from = Math.min(Math.max(0, d.col - 1), Math.max(0, text.length - 1));
        const m = (text.slice(from).match(/^[\w:.<>~]+|^./) || ["x"])[0].length;
        this._marks.push(this.cm.markText({ line: ln, ch: from }, { line: ln, ch: from + Math.max(1, m) }, { className: d.sev === "error" ? "cm-cc-error" : "cm-cc-warn", attributes: { title: d.msg } }));
      }
    }

    showResult(r) {
      const { p, A, el } = this, o = el.out;
      const head = `<div class="ro-head">${A.icon("terminal")} Program output <span class="ro-status ${r.status === "ok" ? "ok" : "err"}">${r.status === "ok" ? "✓ " : "✕ "}${A.esc(r.badge || "")}</span></div>`;
      if (r.status !== "ok") {
        o.innerHTML = `${head}<pre class="ro-body err">${A.esc(r.text || "")}</pre>${r.hint ? `<div class="err-help">${r.hint}</div>` : ""}${r.logs && r.logs.length ? `<div class="ro-logs"><b>console.log</b><pre>${A.esc(r.logs.join("\n"))}</pre></div>` : ""}`;
        return;
      }
      // verdict: compare with what the reference algorithm computed for the same input
      const exp = this.expected;
      let verdict = "";
      if (exp != null) {
        const judge = p.judge ? p.judge(this.input, r.out, exp) : null;
        const same = judge ? judge.ok : SX.canonOut(p, r.out) === SX.canonOut(p, exp);
        verdict = same
          ? `<div class="verdict ok">${A.icon("check")} <b>Matches the reference answer.</b> ${judge && judge.note ? A.esc(judge.note) : "Your program and the reference algorithm agree on this input."}</div>`
          : `<div class="verdict bad"><b>Different from the reference answer.</b> ${judge && judge.note ? A.esc(judge.note) : "Your program printed something else. Compare the two and step through the trace to see where they should part ways."}</div>`;
      }
      o.innerHTML = `${head}<div class="ro-cols"><div><small>your program printed</small><pre class="ro-body">${A.esc(r.out)}</pre></div>${exp != null ? `<div><small>reference answer (from the trace)</small><pre class="ro-body">${A.esc(exp)}</pre></div>` : ""}</div>${verdict}
        ${r.logs && r.logs.length ? `<div class="ro-logs"><b>console.log</b><pre>${A.esc(r.logs.join("\n"))}</pre></div>` : ""}${r.stderr ? `<div class="ro-logs"><b>stderr</b><pre>${A.esc(r.stderr)}</pre></div>` : ""}
        <p class="ro-note">${A.icon("info")} The <b>program output</b> comes from really running the code in the editor. The <b>animation</b> is an educational trace of the reference algorithm on the same input; it does not follow your edits.</p>`;
    }
  }

  function fmtVar(v) {
    if (v === undefined) return "undefined";
    if (v === null) return "null";
    if (v === Infinity) return "∞";
    if (v === -Infinity) return "−∞";
    if (Array.isArray(v)) { const s = JSON.stringify(v); return s.length > 36 ? s.slice(0, 34) + "…]" : s; }
    if (typeof v === "object") { const s = JSON.stringify(v); return s.length > 36 ? s.slice(0, 34) + "…}" : s; }
    return String(v);
  }
  function jsHint(r) {
    const s = r.err || "";
    if (/is not defined/.test(s)) return "💡 A name the code doesn't know: check for a typo, or a variable used outside its block.";
    if (/Cannot read properties of (null|undefined)/.test(s)) return "💡 Something is <code>null</code> or <code>undefined</code> where an object was expected (like <code>node.next</code> when <code>node</code> is null). Guard the pointer first.";
    if (/is not a function/.test(s)) return "💡 You called something that is not a function. Check the name and whether it exists on this type (for example <code>.length</code> is a property, not a method).";
    if (/Maximum call stack/.test(s)) return "💡 Recursion with no base case, or one that never reaches it.";
    return "";
  }

  SX.Lab = Lab;
})();
