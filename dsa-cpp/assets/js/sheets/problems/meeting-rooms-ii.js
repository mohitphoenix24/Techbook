SHEETS.define({
  id: "meeting-rooms-ii",
  viz: "interval",
  io: { fn: "minMeetingRooms", params: [["intervals", "int[][]"]], ret: "int", labels: { intervals: "meetings [start, end]" } },
  premium: true,

  statement: `Given an array of meeting time intervals \`intervals\` where \`intervals[i] = [start, end]\`, return the **minimum number of conference rooms** required to hold all the meetings.

A room can host a new meeting at the moment the previous one in it ends (a meeting ending at 5 and another starting at 5 can share a room).`,
  examples: [
    { input: "intervals = [[0, 30], [5, 10], [15, 20]]", output: "2", explain: "`[0, 30]` needs its own room; `[5, 10]` and `[15, 20]` can share the other." },
    { input: "intervals = [[7, 10], [2, 4]]", output: "1", explain: "They do not overlap, so one room is enough." },
  ],
  constraints: ["$0 \\le$ `intervals.length` $\\le 10^4$", "`intervals[i].length == 2`", "$0 \\le$ `start`$_i <$ `end`$_i \\le 10^6$"],
  check(input) { return input.intervals.length > 8 || input.intervals.some((p) => p.length !== 2 || p[0] >= p[1]) ? "for the animation use at most 8 meetings, each [start, end] with start < end" : input.intervals.some((p) => Math.abs(p[0]) > 100 || Math.abs(p[1]) > 100) ? "keep the numbers between -100 and 100" : null; },

  intuition: {
    find: "The **largest number of meetings happening at the same moment**: that many rooms are unavoidable, and that many always suffice.",
    beginner: "For every start time, count how many meetings are running at that moment (start ≤ t < end). The maximum count is the answer.",
    works: "The number of rooms needed is exactly the maximum overlap, and the maximum overlap always occurs at some meeting's start time, so checking every start finds it.",
    slow: "Each start requires scanning all `n` meetings: $O(n^2)$, 100 million steps for $n = 10^4$.",
    repeat: "The count at one start time and the count at the next share almost everything: only a few meetings began or finished in between, but we recount all `n` each time.",
    remember: "Process the meetings **in order of start time** and remember only which rooms are **currently busy and when they will free up**. All we need from each busy room is its **end time**.",
    observation: "When a meeting starts, ask: *is there a room that has already become free?* That is the room with the **earliest end time**. If its end is `<=` the new start, reuse that room (its old meeting is over); otherwise every room is still busy, so open a new one. A **min-heap** of end times gives the earliest end in $O(1)$ and updates in $O(\\log n)$.",
    leads: "Sort by start. For each meeting: `if (heap not empty and heap.top() <= start) heap.pop()` (reuse the room), then `heap.push(end)` (the room is busy until `end`). At the end the heap holds one end time per room, so `heap.size()` is the minimum number of rooms.",
  },

  flow: [
    "At every start time, count the meetings running right then; take the maximum.",
    "The maximum overlap is both necessary and sufficient, and it occurs at some start.",
    "$O(n^2)$: each start rescans every meeting.",
    "Sweep the meetings by start and remember only each busy room's **end time**.",
    "The room that frees up first is the one with the earliest end: use a **min-heap** of end times.",
    "Pop if the earliest room is free, push the new end: the heap size is the answer. $O(n \\log n)$.",
  ],

  brute: {
    idea: "**Brute force:** for every meeting start time `t`, count the meetings that are running at `t` (those with `start ≤ t < end`). The largest count over all start times is the number of rooms needed.",
    why: "Each of the `n` start times needs a pass over all `n` meetings: $\\Theta(n^2)$. The counts for neighbouring times differ by very little, but each count is rebuilt from scratch.",
    time: "O(n^2)", space: "O(1)",
    measure: { fTex: "n^2", f: (n) => n * n, ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    int minMeetingRooms(vector<vector<int>>& intervals) {
        int best = 0;
        for (auto& a : intervals) {
            int t = a[0], running = 0;
            for (auto& b : intervals) if (b[0] <= t && t < b[1]) running++;
            best = max(best, running);
        }
        return best;
    }
};`,
    js: `function minMeetingRooms(intervals) {
  let best = 0;
  for (const a of intervals) {
    const t = a[0];
    let running = 0;
    for (const b of intervals) if (b[0] <= t && t < b[1]) running++;
    best = Math.max(best, running);
  }
  return best;
}`,
  },

  pattern: {
    name: "Heap (min-heap of end times)",
    why: "The question *\"which busy room frees up first?\"* is a **minimum query** over a changing set (rooms are added and freed as time moves forward). A min-heap answers it in $O(1)$ and supports insert and remove in $O(\\log n)$. Sorting by start lets the sweep move forward in time so only the earliest end ever matters.",
    recognize: [
      "You must track a **set of busy resources** (rooms, servers, workers) as events arrive in time order.",
      "At each event you need the **resource that becomes free soonest**.",
      "The answer is the **peak number** of resources in use at once.",
      "Intervals sorted by start, plus a priority queue keyed by end.",
    ],
  },

  optimal: {
    idea: "Sort meetings by start time. Keep a min-heap of the **end times of the rooms that are currently in use**. For each meeting, if the earliest-ending room is already free by this meeting's start (`heap.top() <= start`), reuse it by popping its old end time. Then push this meeting's end time (the room is busy until then). When all meetings are processed, the heap size equals the number of rooms ever needed.",
    steps: [
      "Sort `intervals` by start.",
      "Create an empty min-heap `ends` of end times.",
      "For each meeting `[s, e]` in sorted order: if `ends` is non-empty and `ends.top() <= s`, **pop** it (a room is free: reuse it).",
      "**Push** `e` (the room is busy until `e`).",
      "Return `ends.size()`.",
    ],
    invariant: "**Before processing a meeting, `ends` holds one end time for each room that is still busy at (or after) the previous start; its size equals the number of rooms opened so far.**",
    correct: "Processing in start order, at the moment a meeting starts at `s`, the rooms still busy are exactly those whose end time exceeds `s`. If some room has `end ≤ s`, the earliest such room is free: reuse it and no new room is needed. If every room has `end > s`, all are busy and a new room must be opened. A room is only opened when the number of *simultaneously running* meetings (including this one) exceeds the rooms so far, so the number of rooms equals the maximum overlap, which is a lower bound for any schedule (at the moment of maximum overlap, every one of those meetings needs a different room).",
  },

  cpp: `class Solution {
public:
    int minMeetingRooms(vector<vector<int>>& intervals) {
        sort(intervals.begin(), intervals.end());                          // by start //@sort
        priority_queue<int, vector<int>, greater<int>> ends;               // end times of the rooms in use //@init
        for (auto& iv : intervals) {                                       //@loop
            if (!ends.empty() && ends.top() <= iv[0]) ends.pop();          // earliest room is free: reuse it //@reuse
            ends.push(iv[1]);                                              // busy until this meeting ends //@occupy
        }
        return ends.size();                                                //@ret
    }
};`,
  js: `function minMeetingRooms(intervals) {
  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);                    // by start //@sort
  const ends = [];                                                         // min-heap of end times (sorted array for clarity) //@init
  for (const iv of intervals) {                                            //@loop
    if (ends.length && ends[0] <= iv[0]) ends.shift();                     // earliest room is free: reuse it //@reuse
    ends.push(iv[1]); ends.sort((a, b) => a - b);                          // busy until this meeting ends //@occupy
  }
  return ends.length;                                                      //@ret
}`,

  tests: [
    { name: "Example 1: two rooms", kind: "normal", input: { intervals: [[0, 30], [5, 10], [15, 20]] } },
    { name: "Example 2: one room", kind: "normal", input: { intervals: [[7, 10], [2, 4]] } },
    { name: "Overlapping chain", kind: "normal", input: { intervals: [[9, 10], [4, 9], [4, 17]] } },
    { name: "Back-to-back meetings", kind: "edge", input: { intervals: [[1, 5], [5, 8]] }, why: "The first ends at 5 and the second starts at 5, so the same room can be reused: **1** room. The check is `ends.top() <= start` (non-strict). A strict `<` would open a second room unnecessarily." },
    { name: "Everyone at the same time", kind: "edge", input: { intervals: [[1, 5], [1, 5], [1, 5]] }, why: "Three identical meetings overlap completely, so 3 rooms are needed: every `top() <= start` test fails (5 > 1) and the heap grows to size 3." },
    { name: "One long meeting around short ones", kind: "edge", input: { intervals: [[1, 10], [2, 3], [4, 5], [6, 7]] }, why: "The long meeting holds one room all along; the three short ones take turns in a **second** room (each ends before the next starts): answer 2. It shows rooms being reused many times while one stays busy." },
    { name: "No meetings", kind: "corner", input: { intervals: [] }, why: "Zero meetings need zero rooms. The loop never runs and `ends.size()` is `0`." },
    { name: "A single meeting", kind: "corner", input: { intervals: [[3, 7]] }, why: "The heap is empty, so nothing is popped; one end time is pushed: **1** room." },
    { name: "Unsorted input", kind: "corner", input: { intervals: [[20, 25], [1, 4], [3, 8], [10, 12]] }, why: "Processing in the given order would test `ends.top()` against start times that go backwards in time. After sorting by start the sweep moves forward: `[1,4]`, `[3,8]` (overlap, 2 rooms), `[10,12]` reuses a room, `[20,25]` reuses another: answer 2." },
  ],

  trace(input, T) {
    const iv = input.intervals.map((p, i) => ({ id: "m" + i, s: p[0], e: p[1] }));
    const n = iv.length, sorted = iv.slice().sort((a, b) => a.s - b.s || a.e - b.e);
    const lo = n ? Math.min(...iv.map((x) => x.s)) : 0, hi = n ? Math.max(...iv.map((x) => x.e)) : 4;
    let order = iv.slice(), idx = -1;
    const rooms = [];   // { end, items: [meeting] }
    let ends = [];
    let whyHeap = false, whyReuse = false, whyNew = false, whyAns = false;
    const lg = (m) => 1 + Math.ceil(Math.log2(m + 1));
    const S = (o = {}) => () => {
      const lanes = [];
      if (idx < 0 || o.waiting) lanes.push(...order.map((x, k) => ({ label: `#${k + 1}`, items: [{ id: x.id, s: x.s, e: x.e, cls: "win" }] })));
      else {
        const cur = o.curMeeting;
        lanes.push({ label: "next meeting", items: cur && !o.placed ? [{ id: cur.id, s: cur.s, e: cur.e, cls: "cur" }] : [] });
        rooms.forEach((r, k) => lanes.push({ label: `room ${k + 1}`, items: r.items.map((m) => ({ id: m.id, s: m.s, e: m.e, cls: o.placed && m === cur ? "hit" : "ok" })) }));
      }
      const left = o.left || [];
      return { lanes, axis: { min: lo, max: hi }, marks: o.mark != null ? [{ x: o.mark, label: o.markLabel || "earliest end", cls: "hot" }] : [], arrs: [{ label: "heap of end times (min-heap: the smallest is the room that frees up first)", arr: ends.length ? ends.slice() : ["∅"], hl: ends.length ? { 0: o.reuse ? "hit" : "cmp" } : { 0: "empty" }, cw: 42 }, { label: "meetings still to place, in start order", arr: left.length ? left.map((m) => `${m.s}–${m.e}`) : ["none"], hl: left.length ? { 0: "cur" } : { 0: "empty" }, cw: 62, size: 12 }], regs: [{ k: "rooms in use", v: rooms.length, cls: "hit" }], label: "rooms and their meetings", note: o.note };
    };
    T.step("sort", { vars: { n }, state: S({ waiting: true, left: [], note: "as given" }), phase: "Sort by start time", say: `${n} meeting${n === 1 ? "" : "s"}. The number of rooms needed is the largest number of meetings running **at the same moment**. We will sweep forward in time, remembering when each busy room becomes free.`, op: "intervals (as given)", act: "START" });
    order = sorted;
    T.step("sort", { w: Math.max(1, Math.round(n * Math.log2(Math.max(n, 2)))), vars: { n }, state: S({ waiting: true, left: sorted, note: "sorted by start time" }), say: "Sorted by start: we will process the meetings in the order they begin, so time only moves forward.", op: "sort by start", act: "SORT" });
    T.step("init", { vars: { rooms: 0 }, state: S({ waiting: true, left: sorted }), say: "`ends` is a **min-heap of end times**, one per room in use (smallest on top). It is empty: no room is open yet.", op: "ends = min-heap { }", act: "EMPTY_HEAP",
      why: { title: "Why only end times?", text: "To decide whether a room is free at time s, all we need is when its current meeting ends. And we only ever need the *earliest* end: if even the room that frees up first is still busy, all of them are." } });
    whyHeap = true;
    T.phase("Place each meeting");
    sorted.forEach((m, k) => {
      idx = k;
      const left = sorted.slice(k);
      const top = ends.length ? ends[0] : null;
      const free = top !== null && top <= m.s;
      T.step("loop", { vars: { meeting: `[${m.s}, ${m.e}]`, "heap top": top === null ? "—" : top, rooms: rooms.length }, state: S({ curMeeting: m, left, mark: top, markLabel: "earliest end", note: top === null ? "no room is open yet" : undefined }),
        say: top === null ? `Next meeting **[${m.s}, ${m.e}]**. No room is open yet, so it will need a new one.` : `Next meeting **[${m.s}, ${m.e}]** starts at ${m.s}. The room that frees up first (the heap top) is busy until **${top}**. Is that room free by ${m.s}?`,
        op: top === null ? "ends is empty" : `ends.top() = ${top} <= start = ${m.s} ?  ${free}`, act: top === null ? "NO_ROOM_YET" : "CHECK_EARLIEST_ROOM" });
      let room;
      if (free) {
        ends.shift();
        room = rooms.find((r) => r.end === top && !r.taken) || rooms.find((r) => r.end === top);
        T.step("reuse", { w: lg(ends.length + 1), vars: { "room freed": rooms.indexOf(room) + 1, "old end": top }, state: S({ curMeeting: m, left, reuse: true, mark: top, markLabel: "this room is free", note: `room ${rooms.indexOf(room) + 1} is free: reuse it` }), say: `The heap top **${top}** is **≤ ${m.s}**: that room's meeting is already over. **Pop** it from the heap: the room is free, so the new meeting takes **room ${rooms.indexOf(room) + 1}**. No new room is needed.`, op: `ends.pop()  (${top} <= ${m.s})`, act: "REUSE_ROOM",
          why: whyReuse ? null : { title: "Why reuse the room that frees FIRST?", text: "If any room is free at this start, the one with the earliest end certainly is. Reusing a free room instead of opening a new one never increases the room count." } });
        whyReuse = true;
      } else {
        room = { end: null, items: [] };
        rooms.push(room);
        if (top !== null && !whyNew) { T.step("reuse", { vars: { "heap top": top }, state: S({ curMeeting: m, left, mark: top, markLabel: "still busy", note: "every room is still busy" }), say: `The earliest room is busy until **${top}**, which is **after** ${m.s}: **every** room is still busy. We must **open a new room**.`, op: `ends.top() = ${top} > ${m.s}  ⇒  new room`, act: "OPEN_NEW_ROOM",
          why: { title: "Why is a new room unavoidable here?", text: `At time ${m.s}, all ${rooms.length - 1} open room${rooms.length - 1 === 1 ? " is" : "s are"} occupied (even the one that ends soonest runs until ${top}). So this meeting overlaps ${rooms.length - 1} others and needs its own room.` } }); whyNew = true; }
        else if (top !== null) T.step("reuse", { vars: { "heap top": top }, state: S({ curMeeting: m, left, mark: top, markLabel: "still busy" }), say: `The earliest room is busy until ${top} > ${m.s}: every room is occupied: **open a new room**.`, op: `ends.top() = ${top} > ${m.s}  ⇒  new room`, act: "OPEN_NEW_ROOM" });
      }
      room.items.push(m); room.end = m.e;
      ends.push(m.e); ends.sort((a, b) => a - b);
      T.step("occupy", { w: lg(ends.length), vars: { "push end": m.e, "heap size": ends.length }, state: S({ curMeeting: m, left: sorted.slice(k + 1), placed: true, note: `room ${rooms.indexOf(room) + 1} is busy until ${m.e}` }), say: `Meeting [${m.s}, ${m.e}] is placed in **room ${rooms.indexOf(room) + 1}**. Push its end time **${m.e}** onto the heap: the room is busy until then. The heap now has **${ends.length}** entr${ends.length === 1 ? "y" : "ies"} (one per room in use).`, op: `ends.push(${m.e})  →  size ${ends.length}`, act: "OCCUPY_ROOM" });
    });
    idx = n ? n - 1 : -1;
    T.step("ret", { vars: { rooms: ends.length }, state: S({ curMeeting: null, placed: true, left: [], waiting: n === 0 }), say: n === 0 ? "There are no meetings, so **0** rooms are needed." : `All meetings are placed. The heap holds one end time per room, so **${ends.length}** room${ends.length === 1 ? "" : "s"} ${ends.length === 1 ? "is" : "are"} needed.`, op: `return ends.size() = ${ends.length}`, act: "DONE",
      why: whyAns || !n ? null : { title: "Why is the heap size the answer?", text: "A room is opened only when every existing room is busy, and rooms are never closed (we only reuse them). So the number of entries in the heap is the number of rooms ever opened, which equals the maximum number of simultaneous meetings." } });
    T.result(ends.length);
  },
  fuzz(rnd) { const n = Math.floor(rnd() * 8); return { intervals: Array.from({ length: n }, () => { const a = Math.floor(rnd() * 14); return [a, a + 1 + Math.floor(rnd() * 6)]; }) }; },
  gen(n) { return { intervals: Array.from({ length: n }, (_, i) => [i, n + 1 + i]) }; },

  complexity: {
    time: {
      tex: "O(n \\log n)", title: "a sort plus n heap operations of O(log n)", short: "each meeting does at most one pop and one push",
      derive: [
        "T_{\\text{sort}}(n) = O(n \\log n) || sort by start",
        "\\text{heap size} \\le n \\;\\Rightarrow\\; \\text{each push/pop costs } O(\\log n) || a binary heap",
        "T_{\\text{sweep}}(n) \\le n\\,(c_{\\text{top}} + c_{\\text{pop}}\\log n + c_{\\text{push}}\\log n) = O(n \\log n) || at most one pop and one push per meeting",
        "!T(n) = O(n \\log n) + O(n \\log n) = O(n \\log n) || versus $O(n^2)$ for recounting",
      ],
      where: "The measured table uses meetings that all overlap (the heap grows to size $n$, the worst case) and counts each heap operation as $\\log_2$(heap size) steps. (The JavaScript version in the lab re-sorts a small array for clarity; a real heap gives the same $O(\\log n)$.)",
    },
    space: {
      tex: "O(n)", title: "the heap of end times", short: "up to one entry per room, at most n",
      derive: [
        "S = |\\text{heap}| \\cdot s_{\\text{int}} \\le n \\cdot s_{\\text{int}} || one end time per open room",
        "!S = O(n) || reached when all meetings overlap",
      ],
      where: "The heap holds only the rooms currently in use, so it can be much smaller than `n`. The sort needs $O(\\log n)$ to $O(n)$ depending on the algorithm.",
    },
    limit: "Computing the maximum overlap needs $\\Omega(n \\log n)$ in the comparison model (sorting the endpoints), so this is optimal. For a small range of integer times, a difference array gives $O(n + R)$.",
    measure: { label: "n = number of meetings (all overlapping)", fTex: "n \\log_2 n", f: (n) => n * Math.log2(n), sizes: [8, 16, 32, 64, 128, 256], growth: "n log n" },
  },

  mistakes: [
    { title: "Using `<` instead of `<=` when reusing a room", what: "`if (ends.top() < iv[0]) ends.pop();`", why: "\"The room must be free strictly before\".", breaks: "A meeting ending at 5 and one starting at 5 would not share a room: `[[1,5],[5,8]]` returns 2 instead of 1.", avoid: "Reuse when `top() <= start`." },
    { title: "Forgetting to sort by start", what: "Processing the meetings in the given order.", why: "The heap seems to handle the ordering by itself.", breaks: "The heap tracks **end** times, but the logic needs time to move forward; with an arbitrary order a meeting is compared with rooms that are \"in the future\" and the count is wrong.", avoid: "Sort by start first." },
    { title: "Pushing the start time instead of the end time", what: "`ends.push(iv[0])`.", why: "Both are numbers in the interval.", breaks: "The heap would no longer say when a room becomes free.", avoid: "The heap stores **end** times." },
    { title: "Using a max-heap (the default `priority_queue`)", what: "`priority_queue<int> ends;` in C++.", why: "It is the default and compiles fine.", breaks: "`top()` returns the **largest** end, the room that frees *last*; the reuse test then wrongly fails and too many rooms open.", avoid: "`priority_queue<int, vector<int>, greater<int>>` (a min-heap)." },
    { title: "Returning the maximum heap size or a counter that never shrinks", what: "Tracking `rooms++` on every meeting.", why: "Counting meetings as rooms.", breaks: "Rooms are reused, so the number of rooms is not the number of meetings: you must subtract reuses (pop).", avoid: "Return `ends.size()` after popping the freed rooms." },
  ],

  followUps: [
    {
      q: "Solve it with the **two sorted arrays** (starts and ends) and two pointers, with no heap.",
      a: "Sort the start times and the end times *separately*. Sweep the starts: if the next start is before the earliest remaining end, a new room is needed (`rooms++`); otherwise a meeting has ended, so reuse its room (move the end pointer). The count of rooms is the answer. It is $O(n \\log n)$ for the sorts and $O(n)$ for the sweep, with no heap structure.",
      cpp: `int minMeetingRoomsTwoPointers(vector<vector<int>>& iv) {
    int n = iv.size();
    vector<int> st, en;
    for (auto& x : iv) { st.push_back(x[0]); en.push_back(x[1]); }
    sort(st.begin(), st.end()); sort(en.begin(), en.end());
    int rooms = 0, j = 0;
    for (int i = 0; i < n; i++) {
        if (st[i] < en[j]) rooms++;      // starts before the earliest end: need a new room
        else j++;                        // a meeting ended: reuse its room
    }
    return rooms;
}`,
      js: `function minMeetingRoomsTwoPointers(iv) {
  const st = iv.map((x) => x[0]).sort((a, b) => a - b), en = iv.map((x) => x[1]).sort((a, b) => a - b);
  let rooms = 0, j = 0;
  for (let i = 0; i < st.length; i++) {
    if (st[i] < en[j]) rooms++;          // starts before the earliest end: need a new room
    else j++;                            // a meeting ended: reuse its room
  }
  return rooms;
}`,
      time: "O(n log n)", space: "O(n)",
    },
    {
      q: "Solve it with a **sweep line over events**.",
      a: "Turn each meeting into two events, `(start, +1)` and `(end, −1)`. Sort the events by time, with `−1` before `+1` at equal times (so back-to-back meetings share a room). Sweep, keeping a running sum; the maximum of the running sum is the answer.",
      time: "O(n log n)", space: "O(n)",
    },
    {
      q: "Also **assign** each meeting to a specific room.",
      a: "Keep, in the heap, pairs `(end time, room id)`. When you reuse a room, pop its pair and give the meeting that room id; when you open one, give it the next unused id. The animation above does exactly this when it moves a meeting into a room's row.",
      time: "O(n log n)", space: "O(n)",
    },
    {
      q: "Meetings have **different priorities / required capacity**. How does the problem change?",
      a: "If meetings need rooms of different sizes, the question becomes bipartite matching (meetings to compatible rooms over time) and may need a flow or greedy-by-size approach. For a single resource type the heap solution is optimal; adding constraints leaves the interval-scheduling family.",
      time: "problem-dependent", space: "problem-dependent",
    },
  ],

  related: [
    { id: "meeting-rooms", why: "The yes/no version: can ONE room hold them all? (any overlap → no)." },
    { id: "merge-intervals", why: "Sort by start and sweep, merging instead of counting overlaps." },
    { id: "non-overlapping-intervals", why: "Sort by end and sweep, choosing which intervals to keep." },
    { id: "find-median-from-data-stream", why: "Another problem built on heaps that must give the extreme element as data arrives." },
  ],
  patternNote: "**Sweep + heap** processes events in time order while a priority queue answers *\"which busy resource finishes first?\"*. Whenever a question is about the **peak concurrency** (rooms, servers, workers), sort the events and keep the finishing times in a min-heap; its size over time *is* the concurrency.",
  takeaways: [
    "Rooms needed = the **maximum number of simultaneous meetings**.",
    "Sort by start; keep a **min-heap of end times**; if `top() <= start`, pop (reuse that room); then push the new end.",
    "`heap.size()` at the end is the answer; use `<=` so back-to-back meetings share a room.",
    "In C++ the default `priority_queue` is a max-heap: use `greater<int>`.",
    "Time $O(n \\log n)$, space $O(n)$; the two-sorted-arrays variant avoids the heap.",
  ],
});
